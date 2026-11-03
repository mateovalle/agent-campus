/**
 * What an agent actually changed.
 *
 * The campus could always tell you an agent had finished and never what it
 * did: there was no git surface in the app at all, which is an odd gap next
 * to a feature whose whole point is giving each agent its own checkout. This
 * module answers "what is different here", against HEAD, for one directory.
 *
 * Everything is read-only and every call carries GIT_COMMAND_TIMEOUT_MS, for
 * the reason spelled out in worktrees.ts: `execFileSync` blocks the event loop
 * of the process that owns every PTY and chat session.
 *
 * The parsers are exported and pure, because git's porcelain formats are
 * fiddly in exactly the places that matter — a NUL-separated rename is two
 * records, a binary file reports its counts as dashes, and a path with a
 * space in it is ordinary.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import type { GitFileChange, GitFileStatus } from '../shared/protocol.js';
import { GIT_COMMAND_TIMEOUT_MS, UNTRACKED_COUNT_MAX_BYTES } from '../src/core/constants.js';

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: GIT_COMMAND_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/**
 * `git status --porcelain=v1 -z -uall` → one entry per path.
 *
 * The -z form is NUL-separated with no quoting, which is the only way to read
 * a path containing a space or a quote without guessing. A rename is TWO
 * fields: the record carries the new name, and the old one follows as its own
 * field — hence the manual cursor rather than a split-and-map.
 */
export function parseStatusPorcelain(
  out: string,
): Array<{ path: string; oldPath?: string; status: GitFileStatus }> {
  const fields = out.split('\0');
  const changes: Array<{ path: string; oldPath?: string; status: GitFileStatus }> = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    // 'XY path': two status letters, a space, then the path.
    if (field.length < 4) continue;
    const code = field.slice(0, 2);
    const filePath = field.slice(3);
    if (code === '??') {
      changes.push({ path: filePath, status: 'untracked' });
      continue;
    }
    if (code[0] === 'R' || code[0] === 'C') {
      // The source path is the next field, and it must be consumed either way:
      // left behind, it would parse as a nonsense entry of its own.
      const oldPath = fields[++i] ?? '';
      changes.push({ path: filePath, oldPath, status: 'renamed' });
      continue;
    }
    changes.push({ path: filePath, status: statusFromCode(code) });
  }
  return changes;
}

function statusFromCode(code: string): GitFileStatus {
  // X is the index, Y the working tree, and either may carry the interesting
  // letter — a file staged as added and then edited reads 'AM'.
  if (code.includes('D')) return 'deleted';
  if (code.includes('A')) return 'added';
  return 'modified';
}

/**
 * `git diff --numstat -z HEAD` → line counts per path.
 *
 * Records are `added\tremoved\tpath`, except a rename, which empties the path
 * and follows with old and new as separate fields. A binary file reports both
 * counts as `-`, which is not zero and should not be shown as zero.
 */
export function parseNumstat(out: string): Map<string, { added: number; removed: number }> {
  const counts = new Map<string, { added: number; removed: number }>();
  const fields = out.split('\0');
  for (let i = 0; i < fields.length; i++) {
    const record = fields[i];
    if (!record.trim()) continue;
    const parts = record.split('\t');
    if (parts.length < 3) continue;
    const [addedRaw, removedRaw, inlinePath] = parts;
    const added = addedRaw === '-' ? 0 : Number(addedRaw);
    const removed = removedRaw === '-' ? 0 : Number(removedRaw);
    if (!Number.isFinite(added) || !Number.isFinite(removed)) continue;
    // Empty path = a rename, whose two names are the following fields.
    const filePath = inlinePath === '' ? (fields[i + 2] ?? '') : inlinePath;
    if (inlinePath === '') i += 2;
    if (filePath) counts.set(filePath, { added, removed });
  }
  return counts;
}

/** Lines in an untracked file, which no diff against HEAD can know about. */
function untrackedLineCount(absolute: string): number {
  try {
    const stat = fs.statSync(absolute);
    // A huge file is almost certainly not something to review line by line,
    // and reading it would stall the main process.
    if (!stat.isFile() || stat.size > UNTRACKED_COUNT_MAX_BYTES) return 0;
    const text = fs.readFileSync(absolute, 'utf-8');
    if (text === '') return 0;
    return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
  } catch {
    return 0;
  }
}

/** Everything different from HEAD in `cwd`, untracked files included. */
export function changedFiles(cwd: string): GitFileChange[] {
  const status = git(['status', '--porcelain=v1', '-z', '-uall'], cwd);
  if (status === null) return [];
  const counts = parseNumstat(git(['diff', '--numstat', '-z', 'HEAD'], cwd) ?? '');

  return parseStatusPorcelain(status).map((change) => {
    if (change.status === 'untracked') {
      return { ...change, added: untrackedLineCount(path.join(cwd, change.path)), removed: 0 };
    }
    const counted = counts.get(change.path) ?? { added: 0, removed: 0 };
    return { ...change, ...counted };
  });
}

/**
 * The unified diff for one file, as git writes it.
 *
 * An untracked file has nothing in HEAD to diff against, so it is compared to
 * /dev/null — which makes every line an addition, and is what the reviewer
 * wants to see anyway. `--no-index` exits 1 when the files differ, i.e. always
 * here, so its output has to be read from the thrown error.
 */
export function fileDiff(cwd: string, file: string, untracked: boolean): string {
  if (!untracked) return git(['diff', 'HEAD', '--', file], cwd) ?? '';
  try {
    return (
      execFileSync('git', ['diff', '--no-index', '--', nullDevice(), file], {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: GIT_COMMAND_TIMEOUT_MS,
        maxBuffer: 32 * 1024 * 1024,
      }) ?? ''
    );
  } catch (err) {
    return (err as { stdout?: string }).stdout ?? '';
  }
}

function nullDevice(): string {
  return process.platform === 'win32' ? 'NUL' : '/dev/null';
}

/** The branch checked out in `cwd`, or null outside a repo / on a detached HEAD. */
export function currentBranch(cwd: string): string | null {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)?.trim();
  return branch && branch !== 'HEAD' ? branch : null;
}
