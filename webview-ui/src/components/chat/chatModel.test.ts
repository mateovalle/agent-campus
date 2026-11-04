import { describe, expect, it } from 'vitest';

import type { ChatEvent } from '../../../../shared/protocol.js';
import { applyChatEvent, emptyChatModel } from './chatModel.js';

/** Fold a script of events, the way the live stream arrives. */
const fold = (...events: ChatEvent[]) => events.reduce(applyChatEvent, emptyChatModel());

describe('applyChatEvent', () => {
  it('gives every item a key that never repeats', () => {
    // The keys are React's identity for these rows; a reused one makes an
    // updating message adopt a previous one's DOM.
    const model = fold(
      { kind: 'user-text', text: 'one' },
      { kind: 'block-final', block: 'text', text: 'answer' },
      { kind: 'user-text', text: 'two' },
    );
    const keys = model.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('attaches a prompt id to the message it belongs to', () => {
    // The CLI's id arrives AFTER our optimistic echo, and it is what a rewind
    // rewinds to — attached to the wrong message, it would restore files to
    // the wrong point in the conversation.
    const model = fold(
      { kind: 'user-text', text: 'first' },
      { kind: 'user-id', messageId: 'uuid-1' },
      { kind: 'block-final', block: 'text', text: 'ok' },
      { kind: 'user-text', text: 'second' },
      { kind: 'user-id', messageId: 'uuid-2' },
    );
    const users = model.items.filter((i) => i.kind === 'user');
    expect(users.map((u) => (u.kind === 'user' ? [u.text, u.messageId] : null))).toEqual([
      ['first', 'uuid-1'],
      ['second', 'uuid-2'],
    ]);
  });

  it('ignores a prompt id with no prompt to attach it to', () => {
    expect(fold({ kind: 'user-id', messageId: 'orphan' }).items).toEqual([]);
  });

  it('does not mutate the model it is given', () => {
    const before = fold({ kind: 'user-text', text: 'one' });
    const snapshot = structuredClone(before);
    applyChatEvent(before, { kind: 'user-id', messageId: 'uuid-1' });
    expect(before).toEqual(snapshot);
  });
});
