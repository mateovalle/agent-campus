/**
 * The per-workspace task list, against a real file in a throwaway HOME.
 *
 * HOME is redirected BEFORE the import, not in a beforeAll: todos.ts derives
 * its file path at module load, so a later override would be writing into the
 * user's own ~/.pixel-agents. USERPROFILE too, because that is what
 * os.homedir() reads on Windows.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { TodoItem } from '../../shared/protocol.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-todos-'));
const realHome = process.env.HOME;
const realProfile = process.env.USERPROFILE;
process.env.HOME = tmp;
process.env.USERPROFILE = tmp;

const { addTodo, applyMove, deleteTodo, editTodo, getTodos, moveTodo, setTodoStatus, toggleTodo } =
  await import('../todos.js');

const WS = '/repo/one';
const OTHER = '/repo/two';

afterAll(() => {
  process.env.HOME = realHome;
  process.env.USERPROFILE = realProfile;
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  for (const ws of [WS, OTHER]) {
    for (const t of [...getTodos(ws)]) deleteTodo(ws, t.id);
  }
});

describe('todos', () => {
  it('keeps each workspace to itself', () => {
    addTodo(WS, 'first');
    addTodo(OTHER, 'elsewhere');
    expect(getTodos(WS).map((t) => t.text)).toEqual(['first']);
    expect(getTodos(OTHER).map((t) => t.text)).toEqual(['elsewhere']);
  });

  it('survives a reload, since the Board is read after a restart', () => {
    const [item] = addTodo(WS, 'persisted');
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(tmp, '.pixel-agents', 'todos.json'), 'utf-8'),
    ) as { byWorkspace: Record<string, Array<{ id: string }>> };
    expect(onDisk.byWorkspace[WS].map((t) => t.id)).toContain(item.id);
  });

  it('toggles both ways', () => {
    const [item] = addTodo(WS, 'a');
    expect(toggleTodo(WS, item.id)[0].status).toBe('done');
    expect(toggleTodo(WS, item.id)[0].status).toBe('open');
  });
});

describe('setTodoStatus', () => {
  it('is idempotent, unlike the toggle', () => {
    // The reason it exists: an assistant told twice to finish a task must not
    // re-open it the second time.
    const [item] = addTodo(WS, 'a');
    expect(setTodoStatus(WS, item.id, 'done')).toBe(true);
    expect(setTodoStatus(WS, item.id, 'done')).toBe(true);
    expect(getTodos(WS)[0].status).toBe('done');
  });

  it('reports an id it could not find instead of doing nothing quietly', () => {
    expect(setTodoStatus(WS, 'no-such-id', 'done')).toBe(false);
    expect(setTodoStatus('/not/a/workspace', 'x', 'done')).toBe(false);
  });

  it('can re-open a task', () => {
    const [item] = addTodo(WS, 'a');
    setTodoStatus(WS, item.id, 'done');
    setTodoStatus(WS, item.id, 'open');
    expect(getTodos(WS)[0].status).toBe('open');
  });
});

describe('editTodo and deleteTodo', () => {
  it('edits text in place and leaves the rest alone', () => {
    const [first] = addTodo(WS, 'first');
    addTodo(WS, 'second');
    const list = editTodo(WS, first.id, 'renamed');
    expect(list.map((t) => t.text)).toEqual(['renamed', 'second']);
  });

  it('ignores an unknown id', () => {
    addTodo(WS, 'first');
    expect(editTodo(WS, 'nope', 'x').map((t) => t.text)).toEqual(['first']);
    expect(deleteTodo(WS, 'nope')).toHaveLength(1);
  });
});

describe('applyMove', () => {
  const ids = (list: ReadonlyArray<{ id: string }>) => list.map((t) => t.id);
  const item = (id: string): TodoItem => ({
    id,
    text: id,
    status: 'open',
    createdAt: 0,
  });
  const list = () => [item('a'), item('b'), item('c')];

  it('moves an item one place', () => {
    expect(ids(applyMove(list(), 'b', 'up'))).toEqual(['b', 'a', 'c']);
    expect(ids(applyMove(list(), 'b', 'down'))).toEqual(['a', 'c', 'b']);
  });

  it('leaves the ends alone rather than wrapping', () => {
    expect(ids(applyMove(list(), 'a', 'up'))).toEqual(['a', 'b', 'c']);
    expect(ids(applyMove(list(), 'c', 'down'))).toEqual(['a', 'b', 'c']);
  });

  it('answers the same list for an id that is not in it', () => {
    expect(ids(applyMove(list(), 'zz', 'up'))).toEqual(['a', 'b', 'c']);
  });

  it('moves through the persisted path too', () => {
    const [a] = addTodo(WS, 'a');
    addTodo(WS, 'b');
    expect(moveTodo(WS, a.id, 'down').map((t) => t.text)).toEqual(['b', 'a']);
  });
});
