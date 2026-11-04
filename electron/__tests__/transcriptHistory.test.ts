import { describe, expect, it } from 'vitest';

import { eventsFromSessionMessages, isSyntheticUserText } from '../transcriptHistory.js';

/** A stored message as the SDK hands it over. */
const msg = (
  type: 'user' | 'assistant' | 'system',
  content: unknown,
  parentToolUseId: string | null = null,
) => ({ type, message: { content }, parent_tool_use_id: parentToolUseId });

describe('isSyntheticUserText', () => {
  it('flags command wrappers, interrupts, and caveats', () => {
    expect(isSyntheticUserText('<command-name>/clear</command-name>')).toBe(true);
    expect(isSyntheticUserText('[Request interrupted by user]')).toBe(true);
    expect(isSyntheticUserText('Caveat: the messages below…')).toBe(true);
    expect(isSyntheticUserText('fix the login bug')).toBe(false);
  });
});

describe('eventsFromSessionMessages', () => {
  it('answers with nothing for an empty session', () => {
    expect(eventsFromSessionMessages([])).toEqual([]);
  });

  it('rebuilds user, assistant, tool, and thinking events in order', () => {
    const events = eventsFromSessionMessages([
      msg('user', 'fix the login bug'),
      msg('assistant', [
        { type: 'thinking', thinking: 'hmm, auth flow' },
        { type: 'text', text: 'Looking at it now.' },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: '/a.ts' } },
      ]),
      msg('user', [{ type: 'tool_result', tool_use_id: 'tu1', content: 'file body' }]),
      // System messages are not requested, but one arriving must not break it.
      msg('system', 'compacted'),
    ]);

    expect(events).toEqual([
      { kind: 'user-text', text: 'fix the login bug' },
      { kind: 'block-final', block: 'thinking', text: 'hmm, auth flow' },
      { kind: 'block-final', block: 'text', text: 'Looking at it now.' },
      { kind: 'tool-start', toolId: 'tu1', name: 'Read', input: { file_path: '/a.ts' } },
      { kind: 'tool-result', toolId: 'tu1', isError: false, summary: 'file body' },
    ]);
  });

  it('drops sub-agent traffic by parent_tool_use_id', () => {
    // The SAME rule the live reduction uses, where this module used to read
    // the transcript's own isSidechain flag and could disagree with it.
    const events = eventsFromSessionMessages([
      msg('user', 'subagent prompt', 'tu1'),
      msg('assistant', [{ type: 'text', text: 'subagent reply' }], 'tu1'),
      msg('user', 'real prompt'),
    ]);
    expect(events).toEqual([{ kind: 'user-text', text: 'real prompt' }]);
  });

  it('drops the synthetic prompts the CLI writes for itself', () => {
    const events = eventsFromSessionMessages([
      msg('user', 'Caveat: local commands…'),
      msg('user', '<command-name>/model</command-name>'),
      msg('user', '[Request interrupted by user]'),
      msg('user', 'real prompt'),
    ]);
    expect(events).toEqual([{ kind: 'user-text', text: 'real prompt' }]);
  });

  it('counts image blocks and joins text blocks in array-content prompts', () => {
    const events = eventsFromSessionMessages([
      msg('user', [
        { type: 'image', source: { type: 'base64', data: 'zzz' } },
        { type: 'text', text: 'what is this?' },
      ]),
    ]);
    expect(events).toEqual([{ kind: 'user-text', text: 'what is this?', imageCount: 1 }]);
  });

  it('marks an errored tool result as one', () => {
    const events = eventsFromSessionMessages([
      msg('assistant', [{ type: 'tool_use', id: 'tu2', name: 'Bash', input: {} }]),
      msg('user', [{ type: 'tool_result', tool_use_id: 'tu2', is_error: true, content: 'boom' }]),
    ]);
    expect(events.at(-1)).toEqual({
      kind: 'tool-result',
      toolId: 'tu2',
      isError: true,
      summary: 'boom',
    });
  });

  it('ignores a message whose content is missing or the wrong shape', () => {
    // `SessionMessage.message` is typed `unknown`, so this module cannot
    // assume anything about it.
    const events = eventsFromSessionMessages([
      { type: 'user', message: undefined, parent_tool_use_id: null },
      { type: 'assistant', message: 'not an object', parent_tool_use_id: null },
      msg('user', 'still here'),
    ]);
    expect(events).toEqual([{ kind: 'user-text', text: 'still here' }]);
  });
});
