import { describe, expect, it } from 'vitest';

import type { HostToWebviewMessage } from '../../../shared/protocol.js';
import { recordToolError, recordToolUse, suggestActions } from '../actionSuggestions.js';
import { processTranscriptLine } from '../transcriptParser.js';
import {
  type CoreAgentState,
  createCoreAgentState,
  createTurnStats,
  type TrackerContext,
} from '../types.js';

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

describe('recordToolUse / recordToolError', () => {
  it('counts edit tools and detects test commands in Bash', () => {
    const stats = createTurnStats();
    recordToolUse(stats, 'Edit', { file_path: '/a.ts' });
    recordToolUse(stats, 'Write', { file_path: '/b.ts' });
    recordToolUse(stats, 'Read', { file_path: '/c.ts' });
    recordToolUse(stats, 'Bash', { command: 'npm test' });
    recordToolError(stats);

    expect(stats.editCount).toBe(2);
    expect(stats.ranTests).toBe(true);
    expect(stats.errorCount).toBe(1);
  });

  it('does not flag non-test bash commands as tests', () => {
    const stats = createTurnStats();
    recordToolUse(stats, 'Bash', { command: 'git status' });
    expect(stats.ranTests).toBe(false);
  });
});

describe('suggestActions', () => {
  it('returns nothing for a read-only turn', () => {
    expect(suggestActions(createTurnStats())).toEqual([]);
  });

  it('suggests Review + Test after unverified edits', () => {
    const stats = createTurnStats();
    stats.editCount = 2;
    const labels = suggestActions(stats).map((s) => s.label);
    expect(labels).toEqual(['Review', 'Test']);
  });

  it('suggests Commit instead of Test when tests ran cleanly', () => {
    const stats = createTurnStats();
    stats.editCount = 1;
    stats.ranTests = true;
    const labels = suggestActions(stats).map((s) => s.label);
    expect(labels).toEqual(['Review', 'Commit']);
  });

  it('suggests Investigate first when the error threshold is hit', () => {
    const stats = createTurnStats();
    stats.editCount = 1;
    stats.errorCount = 3;
    const labels = suggestActions(stats).map((s) => s.label);
    expect(labels[0]).toBe('Investigate');
    expect(labels).toContain('Review');
  });
});

describe('agentSuggestions emission', () => {
  const editLine = JSON.stringify({
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/a.ts' } }],
    },
  });
  const turnEndLine = JSON.stringify({ type: 'system', subtype: 'turn_duration' });

  it('sends suggestions on turn_duration and resets the tally', () => {
    const { ctx, sent, agent } = makeCtx();
    processTranscriptLine(ctx, 1, editLine);
    processTranscriptLine(ctx, 1, turnEndLine);

    const msg = sent.find((m) => m.type === 'agentSuggestions');
    expect(msg).toBeDefined();
    if (msg?.type === 'agentSuggestions') {
      expect(msg.suggestions.map((s) => s.label)).toEqual(['Review', 'Test']);
    }
    expect(agent.turnStats.editCount).toBe(0);
  });

  it('clears suggestions when a new user prompt starts a turn', () => {
    const { ctx, sent } = makeCtx();
    processTranscriptLine(ctx, 1, editLine);
    processTranscriptLine(ctx, 1, turnEndLine);
    sent.length = 0;

    processTranscriptLine(
      ctx,
      1,
      JSON.stringify({ type: 'user', message: { content: 'do more' } }),
    );
    const msg = sent.find((m) => m.type === 'agentSuggestions');
    expect(msg).toBeDefined();
    if (msg?.type === 'agentSuggestions') {
      expect(msg.suggestions).toEqual([]);
    }
  });

  it('counts errored tool_results toward the Investigate threshold', () => {
    const { ctx, sent } = makeCtx();
    for (let i = 0; i < 3; i++) {
      processTranscriptLine(
        ctx,
        1,
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: `b${i}`, name: 'Bash', input: { command: 'x' } }],
          },
        }),
      );
      processTranscriptLine(
        ctx,
        1,
        JSON.stringify({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: `b${i}`, is_error: true }] },
        }),
      );
    }
    processTranscriptLine(ctx, 1, turnEndLine);

    const msg = sent.find((m) => m.type === 'agentSuggestions');
    if (msg?.type === 'agentSuggestions') {
      expect(msg.suggestions.map((s) => s.label)).toEqual(['Investigate']);
    } else {
      expect.unreachable('agentSuggestions not sent');
    }
  });
});
