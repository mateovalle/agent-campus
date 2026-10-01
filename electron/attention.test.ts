import { describe, expect, it } from 'vitest';

import { AttentionTracker } from './attention.js';

const MIN = 60_000;

describe('AttentionTracker', () => {
  it('reports a terminal permission block once it has lasted long enough, once', () => {
    const t = new AttentionTracker();
    t.observe({ type: 'agentToolPermission', id: 1 }, 0);
    expect(t.isBlocked(1)).toBe(true);
    expect(t.dueBlocked(MIN, 2 * MIN)).toEqual([]);
    expect(t.dueBlocked(2 * MIN, 2 * MIN)).toEqual([
      { kind: 'blocked', agentId: 1, blockedForMs: 2 * MIN },
    ]);
    expect(t.dueBlocked(5 * MIN, 2 * MIN)).toEqual([]);
  });

  it('clears a terminal block when the tool starts or the timer clears', () => {
    const t = new AttentionTracker();
    t.observe({ type: 'agentToolPermission', id: 1 }, 0);
    t.observe({ type: 'agentToolStart', id: 1, toolId: 'x', status: 'Running' }, 1000);
    expect(t.isBlocked(1)).toBe(false);
    t.observe({ type: 'agentToolPermission', id: 1 }, 2000);
    t.observe({ type: 'agentToolPermissionClear', id: 1 }, 3000);
    expect(t.isBlocked(1)).toBe(false);
    expect(t.dueBlocked(10 * MIN, MIN)).toEqual([]);
  });

  it('keeps a chat agent blocked until every pending request resolves', () => {
    const t = new AttentionTracker();
    const req = (requestId: string) =>
      ({
        type: 'chat-permission-request',
        agentId: 2,
        requestId,
        toolName: 'Bash',
        input: {},
      }) as const;
    t.observe(req('a'), 0);
    t.observe(req('b'), 10);
    t.observe({ type: 'chat-permission-resolved', agentId: 2, requestId: 'a' }, 20);
    expect(t.isBlocked(2)).toBe(true);
    // The block's clock started with the FIRST request, not the second
    expect(t.dueBlocked(MIN, MIN)).toEqual([{ kind: 'blocked', agentId: 2, blockedForMs: MIN }]);
    t.observe({ type: 'chat-permission-resolved', agentId: 2, requestId: 'b' }, 30);
    expect(t.isBlocked(2)).toBe(false);
  });

  it('re-arms the notification for a new block after the old one cleared', () => {
    const t = new AttentionTracker();
    t.observe({ type: 'agentToolPermission', id: 1 }, 0);
    expect(t.dueBlocked(MIN, MIN)).toHaveLength(1);
    t.observe({ type: 'agentToolPermissionClear', id: 1 }, MIN + 1);
    t.observe({ type: 'agentToolPermission', id: 1 }, 2 * MIN);
    expect(t.dueBlocked(3 * MIN, MIN)).toHaveLength(1);
  });

  it('reports a finished turn once and counts it until acknowledged', () => {
    const t = new AttentionTracker();
    expect(t.observe({ type: 'agentStatus', id: 3, status: 'waiting' }, 0)).toEqual({
      kind: 'finished',
      agentId: 3,
    });
    // A repeated idle signal for the same turn is not a second event
    expect(t.observe({ type: 'agentStatus', id: 3, status: 'waiting' }, 5)).toBeNull();
    expect(t.needsYouCount()).toBe(1);
    t.acknowledge(3);
    expect(t.needsYouCount()).toBe(0);
  });

  it('a new turn supersedes an unread result, and a finished turn ends any block', () => {
    const t = new AttentionTracker();
    t.observe({ type: 'agentStatus', id: 1, status: 'waiting' }, 0);
    t.observe({ type: 'agentStatus', id: 1, status: 'active' }, 1);
    expect(t.needsYouCount()).toBe(0);
    t.observe({ type: 'agentToolPermission', id: 1 }, 2);
    t.observe({ type: 'agentStatus', id: 1, status: 'waiting' }, 3);
    expect(t.isBlocked(1)).toBe(false);
    expect(t.needsYouCount()).toBe(1);
  });

  it('counts blocked and unread agents once each and forgets closed agents', () => {
    const t = new AttentionTracker();
    t.observe({ type: 'agentToolPermission', id: 1 }, 0);
    t.observe({ type: 'agentStatus', id: 2, status: 'waiting' }, 0);
    expect(t.needsYouCount()).toBe(2);
    t.observe({ type: 'agentClosed', id: 1 }, 1);
    expect(t.needsYouCount()).toBe(1);
    expect(t.dueBlocked(10 * MIN, MIN)).toEqual([]);
  });

  it('ignores clears for agents it never saw', () => {
    const t = new AttentionTracker();
    t.observe({ type: 'agentToolPermissionClear', id: 9 }, 0);
    t.observe({ type: 'chat-permission-resolved', agentId: 9, requestId: 'x' }, 0);
    expect(t.needsYouCount()).toBe(0);
  });
});
