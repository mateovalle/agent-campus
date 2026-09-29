import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HostToWebviewMessage } from '../../../shared/protocol.js';
import {
  formatToolStatus,
  PERMISSION_EXEMPT_TOOLS,
  processTranscriptLine,
  SUBAGENT_TOOL_NAMES,
} from '../transcriptParser.js';
import { type CoreAgentState, createCoreAgentState, type TrackerContext } from '../types.js';

function makeCtx(): {
  ctx: TrackerContext<CoreAgentState>;
  sent: HostToWebviewMessage[];
  agent: CoreAgentState;
} {
  const sent: HostToWebviewMessage[] = [];
  const ctx: TrackerContext<CoreAgentState> = {
    agents: new Map(),
    fileWatchers: new Map(),
    pollingTimers: new Map(),
    waitingTimers: new Map(),
    permissionTimers: new Map(),
    send: (m) => sent.push(m),
    persistAgents: () => {},
  };
  const agent = createCoreAgentState(1, '/proj', '/proj/s.jsonl');
  ctx.agents.set(1, agent);
  return { ctx, sent, agent };
}

const toolUseLine = (id: string, name = 'Read') =>
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id, name, input: {} }] },
  });

describe('processTranscriptLine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores malformed JSON lines silently', () => {
    const { ctx, sent } = makeCtx();
    processTranscriptLine(ctx, 1, '{"type":"assis'); // truncated write
    expect(sent).toHaveLength(0);
  });

  it('tracks tool_use start and arms the permission timer for non-exempt tools', () => {
    const { ctx, sent, agent } = makeCtx();
    processTranscriptLine(ctx, 1, toolUseLine('t1', 'Bash'));

    expect(agent.activeToolIds.has('t1')).toBe(true);
    expect(agent.hadToolsInTurn).toBe(true);
    expect(sent.some((m) => m.type === 'agentToolStart' && m.toolId === 't1')).toBe(true);
    expect(ctx.permissionTimers.has(1)).toBe(true);

    // 7s of silence → permission bubble
    vi.advanceTimersByTime(7000);
    expect(sent.some((m) => m.type === 'agentToolPermission')).toBe(true);
  });

  it('does not arm the permission timer for exempt tools (Task)', () => {
    const { ctx } = makeCtx();
    processTranscriptLine(ctx, 1, toolUseLine('t1', 'Task'));
    expect(ctx.permissionTimers.has(1)).toBe(false);
  });

  it('does not arm the permission timer for exempt tools (Agent, the current name)', () => {
    // Claude Code renamed Task to Agent. While the exemption missed the new
    // name, every sub-agent launch raised a false "blocked on you" bubble 5s in.
    const { ctx } = makeCtx();
    processTranscriptLine(ctx, 1, toolUseLine('t1', 'Agent'));
    expect(ctx.permissionTimers.has(1)).toBe(false);
  });

  it('spawns a sub-agent character for a launch under either name', () => {
    // The webview keys the character off this exact prefix, so it is a contract.
    for (const name of SUBAGENT_TOOL_NAMES) {
      const { ctx, sent } = makeCtx();
      processTranscriptLine(
        ctx,
        1,
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 't1',
                name,
                input: { description: 'Trace spawn path', subagent_type: 'Explore' },
              },
            ],
          },
        }),
      );
      const start = sent.find((m) => m.type === 'agentToolStart');
      expect(start, name).toBeDefined();
      expect(start && 'status' in start && start.status).toBe('Subtask: Trace spawn path');
    }
  });

  it('clears the sub-agent character when the launch returns', () => {
    const { ctx, sent } = makeCtx();
    processTranscriptLine(
      ctx,
      1,
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: { description: 'x' } }],
        },
      }),
    );
    processTranscriptLine(
      ctx,
      1,
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] },
      }),
    );
    // Without this the character would sit in its seat forever.
    expect(sent.some((m) => m.type === 'subagentClear' && m.parentToolId === 't1')).toBe(true);
  });

  it('completes tools via tool_result and delays the done message', () => {
    const { ctx, sent, agent } = makeCtx();
    processTranscriptLine(ctx, 1, toolUseLine('t1'));
    processTranscriptLine(
      ctx,
      1,
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] },
      }),
    );

    expect(agent.activeToolIds.size).toBe(0);
    expect(sent.some((m) => m.type === 'agentToolDone')).toBe(false); // delayed
    vi.advanceTimersByTime(300);
    expect(sent.some((m) => m.type === 'agentToolDone' && m.toolId === 't1')).toBe(true);
  });

  it('does not send delayed tool-done after the agent was removed', () => {
    const { ctx, sent } = makeCtx();
    processTranscriptLine(ctx, 1, toolUseLine('t1'));
    processTranscriptLine(
      ctx,
      1,
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] },
      }),
    );
    ctx.agents.delete(1);
    vi.advanceTimersByTime(300);
    expect(sent.some((m) => m.type === 'agentToolDone')).toBe(false);
  });

  it('turn_duration is the definitive turn end: clears state, sets waiting', () => {
    const { ctx, sent, agent } = makeCtx();
    processTranscriptLine(ctx, 1, toolUseLine('t1', 'Bash'));
    processTranscriptLine(ctx, 1, JSON.stringify({ type: 'system', subtype: 'turn_duration' }));

    expect(agent.activeToolIds.size).toBe(0);
    expect(agent.isWaiting).toBe(true);
    expect(agent.hadToolsInTurn).toBe(false);
    expect(ctx.permissionTimers.has(1)).toBe(false);
    expect(sent.some((m) => m.type === 'agentStatus' && m.status === 'waiting')).toBe(true);
  });

  it('text-only turns use the text-idle timer, suppressed once tools ran', () => {
    const { ctx } = makeCtx();
    const textLine = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'hi' }] },
    });

    processTranscriptLine(ctx, 1, textLine);
    expect(ctx.waitingTimers.has(1)).toBe(true);

    // New turn with a tool → hadToolsInTurn=true → text no longer arms the timer
    processTranscriptLine(ctx, 1, toolUseLine('t1'));
    expect(ctx.waitingTimers.has(1)).toBe(false);
    processTranscriptLine(ctx, 1, textLine);
    expect(ctx.waitingTimers.has(1)).toBe(false);
  });
});

describe('formatToolStatus', () => {
  it('truncates long bash commands', () => {
    const status = formatToolStatus('Bash', { command: 'x'.repeat(100) });
    expect(status.length).toBeLessThan(50);
    expect(status.endsWith('…')).toBe(true);
  });

  it('uses basename for file tools', () => {
    expect(formatToolStatus('Edit', { file_path: '/deep/path/file.ts' })).toBe('Editing file.ts');
  });

  it('labels a sub-agent launch under either name', () => {
    for (const name of SUBAGENT_TOOL_NAMES) {
      expect(formatToolStatus(name, { description: 'Trace spawn path' })).toBe(
        'Subtask: Trace spawn path',
      );
    }
  });

  it('falls back when a launch carries no description', () => {
    expect(formatToolStatus('Agent', {})).toBe('Running subtask');
  });

  it('exempts every sub-agent spelling from the permission bubble', () => {
    for (const name of SUBAGENT_TOOL_NAMES) {
      expect(PERMISSION_EXEMPT_TOOLS.has(name)).toBe(true);
    }
  });

  it('reads out MCP server and tool instead of the raw id', () => {
    expect(formatToolStatus('mcp__claude-in-chrome__browser_batch', {})).toBe(
      'browser batch via claude-in-chrome',
    );
    expect(formatToolStatus('mcp__someserver', {})).toBe('Using someserver');
  });

  it('describes the newer built-ins', () => {
    expect(formatToolStatus('Skill', { skill: 'run-desktop' })).toBe('Running skill: run-desktop');
    expect(formatToolStatus('ToolSearch', { query: 'select:Read' })).toBe('Looking up tools');
    expect(formatToolStatus('SendUserFile', { files: [] })).toBe('Sending you a file');
  });

  it('prefers TaskCreate.activeForm, which is already present-progressive', () => {
    expect(
      formatToolStatus('TaskCreate', { subject: 'Hygiene commit', activeForm: 'Committing it' }),
    ).toBe('Planning: Committing it');
    expect(formatToolStatus('TaskCreate', { subject: 'Hygiene commit' })).toBe(
      'Planning: Hygiene commit',
    );
  });

  it('describes an unknown tool rather than dropping it', () => {
    expect(formatToolStatus('SomethingNew', {})).toBe('Using SomethingNew');
  });
});
