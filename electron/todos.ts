/**
 * Human todo lists per workspace, persisted to ~/.pixel-agents/todos.json.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { TodoItem } from '../shared/protocol.js';
import { DATA_DIR_NAME } from '../src/core/constants.js';

const TODOS_FILE = path.join(os.homedir(), DATA_DIR_NAME, 'todos.json');

let cache: Record<string, TodoItem[]> | null = null;

function load(): Record<string, TodoItem[]> {
  if (cache) return cache;
  try {
    cache =
      (
        JSON.parse(fs.readFileSync(TODOS_FILE, 'utf-8')) as {
          byWorkspace?: Record<string, TodoItem[]>;
        }
      ).byWorkspace ?? {};
  } catch {
    cache = {};
  }
  return cache;
}

function save(): void {
  try {
    fs.mkdirSync(path.dirname(TODOS_FILE), { recursive: true });
    fs.writeFileSync(TODOS_FILE, JSON.stringify({ byWorkspace: cache ?? {} }, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Agent Campus] Failed to save todos:', err);
  }
}

export function getTodos(workspacePath: string): TodoItem[] {
  return load()[workspacePath] ?? [];
}

export function getAllTodoPaths(): string[] {
  return Object.keys(load());
}

export function addTodo(workspacePath: string, text: string): TodoItem[] {
  const all = load();
  const list = (all[workspacePath] ??= []);
  list.push({ id: crypto.randomUUID(), text, status: 'open', createdAt: Date.now() });
  save();
  return list;
}

export function toggleTodo(workspacePath: string, id: string): TodoItem[] {
  const list = getTodos(workspacePath);
  const item = list.find((t) => t.id === id);
  if (item) {
    setTodoStatus(workspacePath, id, item.status === 'open' ? 'done' : 'open');
  }
  return list;
}

/**
 * Sets a task's status outright, and says whether it found one.
 *
 * Separate from toggleTodo because a caller that is not a checkbox wants
 * IDEMPOTENCE: an assistant told twice to finish a task would otherwise
 * re-open it the second time. The boolean matters for the same reason — an
 * id that does not exist has to be reportable, not silently a no-op.
 */
export function setTodoStatus(
  workspacePath: string,
  id: string,
  status: TodoItem['status'],
): boolean {
  const item = getTodos(workspacePath).find((t) => t.id === id);
  if (!item) return false;
  const changed = item.status !== status;
  item.status = status;
  if (changed) save();
  return true;
}

export function editTodo(workspacePath: string, id: string, text: string): TodoItem[] {
  const list = getTodos(workspacePath);
  const item = list.find((t) => t.id === id);
  const trimmed = text.trim();
  // An empty edit is a mistake, not a request to blank the card: the UI
  // cancels on empty too, and deleting is its own button.
  if (item && trimmed) {
    item.text = trimmed;
    save();
  }
  return list;
}

/**
 * Move a task one place among the OPEN tasks of its list — pure, so the
 * neighbour-finding is testable.
 *
 * Among the open ones, because the Board's backlog column is the only place
 * order is visible and it shows nothing else. Swapping with a `done` entry
 * would look like the arrow did nothing.
 */
export function applyMove(
  list: readonly TodoItem[],
  id: string,
  direction: 'up' | 'down',
): TodoItem[] {
  const next = [...list];
  const from = next.findIndex((t) => t.id === id);
  if (from < 0 || next[from].status !== 'open') return next;

  const step = direction === 'up' ? -1 : 1;
  let to = from + step;
  while (to >= 0 && to < next.length && next[to].status !== 'open') to += step;
  if (to < 0 || to >= next.length) return next;

  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function moveTodo(workspacePath: string, id: string, direction: 'up' | 'down'): TodoItem[] {
  const all = load();
  all[workspacePath] = applyMove(all[workspacePath] ?? [], id, direction);
  save();
  return all[workspacePath];
}

export function deleteTodo(workspacePath: string, id: string): TodoItem[] {
  const all = load();
  all[workspacePath] = (all[workspacePath] ?? []).filter((t) => t.id !== id);
  save();
  return all[workspacePath];
}
