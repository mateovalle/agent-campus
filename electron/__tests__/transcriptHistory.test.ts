import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { isSyntheticUserText, loadTranscriptHistory } from '../transcriptHistory.js';

const tmpFiles: string[] = [];

function writeTranscript(lines: unknown[]): string {
  const file = path.join(
    os.tmpdir(),
    `pixel-agents-test-${Math.random().toString(36).slice(2)}.jsonl`,
  );
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  tmpFiles.push(file);
  return file;
}

afterEach(() => {
  for (const file of tmpFiles.splice(0)) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* already gone */
    }
  }
});

describe('isSyntheticUserText', () => {
  it('flags command wrappers, interrupts, and caveats', () => {
    expect(isSyntheticUserText('<command-name>/clear</command-name>')).toBe(true);
    expect(isSyntheticUserText('[Request interrupted by user]')).toBe(true);
    expect(isSyntheticUserText('Caveat: the messages below…')).toBe(true);
    expect(isSyntheticUserText('fix the login bug')).toBe(false);
  });
});

describe('loadTranscriptHistory', () => {
  it('returns [] for a missing file', () => {
    expect(loadTranscriptHistory('/nowhere/nope.jsonl')).toEqual([]);
  });

  it('rebuilds user, assistant, tool, and thinking events in order', () => {
    const file = writeTranscript([
      { type: 'user', message: { role: 'user', content: 'fix the login bug' } },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: 'hmm, auth flow' },
            { type: 'text', text: 'Looking at it now.' },
            { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: '/a.ts' } },
          ],
        },
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'file body' }],
        },
      },
      { type: 'system', subtype: 'turn_duration', durationMs: 1234 },
    ]);

    expect(loadTranscriptHistory(file)).toEqual([
      { kind: 'user-text', text: 'fix the login bug' },
      { kind: 'block-final', block: 'thinking', text: 'hmm, auth flow' },
      { kind: 'block-final', block: 'text', text: 'Looking at it now.' },
      { kind: 'tool-start', toolId: 'tu1', name: 'Read', input: { file_path: '/a.ts' } },
      { kind: 'tool-result', toolId: 'tu1', isError: false, summary: 'file body' },
    ]);
  });

  it('skips sidechain, meta, and synthetic user records', () => {
    const file = writeTranscript([
      { type: 'user', isMeta: true, message: { content: 'Caveat: local commands…' } },
      { type: 'user', message: { content: '<command-name>/model</command-name>' } },
      { type: 'user', isSidechain: true, message: { content: 'subagent prompt' } },
      {
        type: 'assistant',
        isSidechain: true,
        message: { content: [{ type: 'text', text: 'subagent reply' }] },
      },
      { type: 'user', message: { content: 'real prompt' } },
    ]);

    expect(loadTranscriptHistory(file)).toEqual([{ kind: 'user-text', text: 'real prompt' }]);
  });

  it('counts image blocks and joins text blocks in array-content prompts', () => {
    const file = writeTranscript([
      {
        type: 'user',
        message: {
          content: [
            { type: 'image', source: { type: 'base64', data: 'zzz' } },
            { type: 'text', text: 'what is this?' },
          ],
        },
      },
    ]);

    expect(loadTranscriptHistory(file)).toEqual([
      { kind: 'user-text', text: 'what is this?', imageCount: 1 },
    ]);
  });

  it('survives corrupt lines and marks error tool results', () => {
    const file = writeTranscript([{ type: 'user', message: { content: 'run it' } }]);
    fs.appendFileSync(
      file,
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"tu2","name":"Bash","input":{}}]}}\n' +
        '{not json at all\n' +
        JSON.stringify({
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'tu2', is_error: true, content: 'boom' }],
          },
        }) +
        '\n',
    );

    expect(loadTranscriptHistory(file)).toEqual([
      { kind: 'user-text', text: 'run it' },
      { kind: 'tool-start', toolId: 'tu2', name: 'Bash', input: {} },
      { kind: 'tool-result', toolId: 'tu2', isError: true, summary: 'boom' },
    ]);
  });
});
