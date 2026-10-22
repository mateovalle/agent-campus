/**
 * Opening a file an agent mentioned.
 *
 * Two things make this more than `shell.openPath`. First, agents write
 * RELATIVE paths ("electron/main.ts") because that is how they see their
 * project — those only mean anything against the agent's own cwd, which for a
 * worktree agent is its checkout, not the repo. Second, they write LINE
 * numbers ("main.ts:412"), and the default application for a .ts file has no
 * way to accept one; a GUI editor's CLI does.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Editors whose CLI can jump to a line, in the order we would rather use
 * them. Each is only used if it is actually on PATH.
 */
export const LINE_EDITORS = ['cursor', 'code', 'windsurf', 'zed', 'subl'] as const;
export type LineEditor = (typeof LINE_EDITORS)[number];

/** Arguments that open `file` at `line` for a given editor. */
export function editorArgs(editor: LineEditor, file: string, line: number): string[] {
  // VS Code and its forks need -g to treat file:line as a goto rather than a
  // filename; Zed and Sublime take the suffix directly.
  return editor === 'zed' || editor === 'subl' ? [`${file}:${line}`] : ['-g', `${file}:${line}`];
}

/** `~/x` → `<home>/x`. Left alone if there is no leading tilde. */
export function expandHome(raw: string, home: string): string {
  if (raw === '~') return home;
  if (raw.startsWith('~/')) return path.join(home, raw.slice(2));
  return raw;
}

/**
 * A path as an agent wrote it → an absolute path, or null when there is
 * nothing to resolve it against (a relative path with no agent).
 *
 * Deliberately does NOT check the filesystem: callers report "no such file"
 * differently from "cannot tell where that is".
 */
export function resolveRefPath(raw: string, cwd: string | undefined, home: string): string | null {
  const expanded = expandHome(raw.trim(), home);
  if (!expanded) return null;
  if (path.isAbsolute(expanded)) return path.normalize(expanded);
  if (!cwd) return null;
  return path.normalize(path.join(cwd, expanded));
}

let cachedEditor: LineEditor | null | undefined;

/** The first line-capable editor on PATH, looked up once per run. */
export function findLineEditor(
  exists: (cmd: string) => boolean = commandExists,
): LineEditor | null {
  if (cachedEditor !== undefined) return cachedEditor;
  cachedEditor = LINE_EDITORS.find((editor) => exists(editor)) ?? null;
  return cachedEditor;
}

function commandExists(cmd: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

export type OpenOutcome =
  | { kind: 'opened'; how: 'editor' | 'default'; file: string }
  | { kind: 'unresolved'; raw: string }
  | { kind: 'missing'; file: string };

/**
 * Opens a file reference. An editor is only worth spawning when there is a
 * line to jump to — otherwise the user's own default application (which may
 * well be a different editor) is the more respectful choice.
 */
export function openFileRef(
  raw: string,
  line: number | undefined,
  deps: {
    cwd?: string;
    home: string;
    openDefault: (file: string) => void;
    spawnEditor: (editor: LineEditor, args: string[]) => void;
    exists?: (file: string) => boolean;
    findEditor?: () => LineEditor | null;
  },
): OpenOutcome {
  const file = resolveRefPath(raw, deps.cwd, deps.home);
  if (!file) return { kind: 'unresolved', raw };

  const exists = deps.exists ?? fs.existsSync;
  if (!exists(file)) return { kind: 'missing', file };

  const editor = line !== undefined ? (deps.findEditor ?? findLineEditor)() : null;
  if (editor && line !== undefined) {
    deps.spawnEditor(editor, editorArgs(editor, file, line));
    return { kind: 'opened', how: 'editor', file };
  }
  deps.openDefault(file);
  return { kind: 'opened', how: 'default', file };
}
