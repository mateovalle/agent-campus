import { describe, expect, it } from 'vitest';

import type { TodoItem } from '../../shared/protocol.js';
import { applyMove } from '../todos.js';

const todo = (id: string, status: TodoItem['status'] = 'open'): TodoItem => ({
  id,
  text: `task ${id}`,
  status,
  createdAt: 1,
});
const ids = (list: readonly TodoItem[]) => list.map((t) => t.id);

describe('applyMove', () => {
  it('swaps a task with its neighbour', () => {
    const list = [todo('a'), todo('b'), todo('c')];
    expect(ids(applyMove(list, 'b', 'up'))).toEqual(['b', 'a', 'c']);
    expect(ids(applyMove(list, 'b', 'down'))).toEqual(['a', 'c', 'b']);
  });

  it('leaves the ends alone', () => {
    const list = [todo('a'), todo('b')];
    expect(ids(applyMove(list, 'a', 'up'))).toEqual(['a', 'b']);
    expect(ids(applyMove(list, 'b', 'down'))).toEqual(['a', 'b']);
  });

  it('skips over done tasks to find the real neighbour', () => {
    // The board's backlog column shows only open tasks, so swapping with a
    // done one would look like the arrow did nothing.
    const list = [todo('a'), todo('x', 'done'), todo('b')];
    expect(ids(applyMove(list, 'b', 'up'))).toEqual(['b', 'x', 'a']);
  });

  it('refuses to move a done task, which no column orders', () => {
    const list = [todo('a'), todo('x', 'done')];
    expect(ids(applyMove(list, 'x', 'up'))).toEqual(['a', 'x']);
  });

  it('ignores an id it does not have', () => {
    const list = [todo('a')];
    expect(ids(applyMove(list, 'nope', 'up'))).toEqual(['a']);
  });

  it('does not mutate the list it is given', () => {
    const list = [todo('a'), todo('b')];
    applyMove(list, 'a', 'down');
    expect(ids(list)).toEqual(['a', 'b']);
  });
});
