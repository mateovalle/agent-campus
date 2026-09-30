import { describe, expect, it } from 'vitest';

import type { RestorableAgent } from '../../shared/protocol.js';
import { restorableAgents } from '../openAgents.js';

const agent = (sessionId: string, over: Partial<RestorableAgent> = {}): RestorableAgent => ({
  sessionId,
  cwd: '/proj',
  folderName: 'proj',
  kind: 'chat',
  label: `Agent ${sessionId}`,
  openedAtMs: 1,
  ...over,
});

const allPresent = () => true;

describe('restorableAgents', () => {
  it('offers the recorded agents in order', () => {
    const out = restorableAgents([agent('a'), agent('b')], allPresent);
    expect(out.map((r) => r.sessionId)).toEqual(['a', 'b']);
  });

  it('drops a session whose transcript is gone', () => {
    // Resuming it would spawn an agent with no conversation behind it.
    const out = restorableAgents([agent('a'), agent('b')], (r) => r.sessionId !== 'b');
    expect(out.map((r) => r.sessionId)).toEqual(['a']);
  });

  it('offers nothing when every agent is already live', () => {
    // A webview reload re-runs this with all agents running: offering them
    // would spawn a second copy of each.
    const live = new Set(['a', 'b']);
    const out = restorableAgents([agent('a'), agent('b')], allPresent, (id) => live.has(id));
    expect(out).toEqual([]);
  });

  it('offers only the agents that are not live', () => {
    const out = restorableAgents([agent('a'), agent('b')], allPresent, (id) => id === 'a');
    expect(out.map((r) => r.sessionId)).toEqual(['b']);
  });

  it('keeps the first of a duplicated session id', () => {
    const out = restorableAgents([agent('a', { label: 'first' }), agent('a')], allPresent);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('first');
  });

  it('skips malformed records rather than failing the whole list', () => {
    const records = [
      agent('a'),
      { sessionId: '', cwd: '/p', folderName: 'p', kind: 'chat', label: 'x', openedAtMs: 1 },
      { sessionId: 'c', cwd: '/p', folderName: 'p', kind: 'nonsense', label: 'x', openedAtMs: 1 },
      { sessionId: 'd' },
      null,
      agent('e'),
    ] as RestorableAgent[];
    expect(restorableAgents(records, allPresent).map((r) => r.sessionId)).toEqual(['a', 'e']);
  });

  it('carries the role through, so a restored agent keeps its charter', () => {
    const out = restorableAgents([agent('a', { role: 'qa', kind: 'terminal' })], allPresent);
    expect(out[0].role).toBe('qa');
    expect(out[0].kind).toBe('terminal');
  });
});
