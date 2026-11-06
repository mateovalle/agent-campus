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

import { execFile, execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import type { GitFileChange, GitFileStatus } from '../shared/protocol.js';
import {
  GIT_COMMAND_TIMEOUT_MS,
  GIT_WRITE_MAX_BUFFER,
  GIT_WRITE_TIMEOUT_MS,
  UNTRACKED_COUNT_MAX_BYTES,
} from '../src/core/constants.js';

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

/**
 * Whether a buffer is binary, by git's own rule: a NUL byte in the first
 * 8000. Cheap, and it agrees with what the diff will say a moment later.
 */
function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0);
}

/**
 * Lines in an untracked file, which no diff against HEAD can know about —
 * or null when counting lines is not a meaningful thing to do to it.
 *
 * Null rather than 0 for a binary: a new 5KB PNG was read as UTF-8 and
 * reported `+14`, an invented number, while expanding the same row correctly
 * said "Binary file — nothing to show." Zero would be its own small lie, so
 * the count is simply absent and the UI shows nothing where a number would
 * have been.
 */
function untrackedLineCount(absolute: string): number | null {
  try {
    const stat = fs.statSync(absolute);
    // A huge file is almost certainly not something to review line by line,
    // and reading it would stall the main process.
    if (!stat.isFile() || stat.size > UNTRACKED_COUNT_MAX_BYTES) return null;
    const buffer = fs.readFileSync(absolute);
    if (looksBinary(buffer)) return null;
    const text = buffer.toString('utf-8');
    if (text === '') return 0;
    return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
  } catch {
    return null;
  }
}

/** Everything different from HEAD in `cwd`, untracked files included. */
/**
 * Where to run, and what to limit ourselves to.
 *
 * git reports paths relative to the REPO ROOT but resolves a pathspec
 * relative to the CWD, and mixing the two is not a cosmetic error: with an
 * office one directory inside a repo, every diff came back empty (the
 * pathspec resolved to `sub/sub/file`), untracked line counts were read from
 * paths that do not exist, and `git add -A` — which ignores cwd entirely —
 * staged the WHOLE repository, including the user's own edits elsewhere,
 * behind a button labelled with one agent's name.
 *
 * So everything runs from the root and carries an explicit pathspec limiting
 * it to the agent's own directory. For a worktree agent, or an office that is
 * a repo, the pathspec is the root and nothing changes.
 */
export interface GitScope {
  /** Run every command here, so reported paths and pathspecs agree. */
  root: string;
  /** `:(top)sub/dir` — or null when the agent owns the whole repo. */
  pathspec: string | null;
}

export function gitScope(cwd: string): GitScope | null {
  const root = git(['rev-parse', '--show-toplevel'], cwd)?.trim();
  if (!root) return null;
  const prefix = git(['rev-parse', '--show-prefix'], cwd)?.trim() ?? '';
  // `:(top)` anchors the pathspec at the repo root rather than at cwd, which
  // is the whole point: it means the same thing wherever it is evaluated.
  return { root, pathspec: prefix ? `:(top)${prefix.replace(/\/$/, '')}` : null };
}

/** The pathspec arguments for a scope, as argv tail (empty when unscoped). */
function spec(scope: GitScope): string[] {
  return scope.pathspec ? ['--', scope.pathspec] : [];
}

export function changedFiles(cwd: string): GitFileChange[] {
  const scope = gitScope(cwd);
  if (!scope) return [];
  const status = git(['status', '--porcelain=v1', '-z', '-uall', ...spec(scope)], scope.root);
  if (status === null) return [];
  const counts = parseNumstat(
    git(['diff', '--numstat', '-z', 'HEAD', ...spec(scope)], scope.root) ?? '',
  );

  return parseStatusPorcelain(status).map((change) => {
    if (change.status === 'untracked') {
      // Joined with the ROOT, because that is what the path is relative to.
      const added = untrackedLineCount(path.join(scope.root, change.path));
      // Absent, not zero, when the count would be a fiction (a binary, a
      // file too big to read): the row then shows no number at all.
      return added === null ? { ...change } : { ...change, added, removed: 0 };
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
  // From the repo root: `file` came out of `changedFiles`, so it is
  // root-relative, and a pathspec is resolved against the cwd it runs in.
  const root = gitScope(cwd)?.root ?? cwd;
  if (!untracked) return git(['diff', 'HEAD', '--', file], root) ?? '';
  try {
    return (
      execFileSync('git', ['diff', '--no-index', '--', nullDevice(), file], {
        cwd: root,
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

/** Why there is no branch to push, when there isn't one. */
export type NoBranchReason = 'detached' | 'unborn' | 'not-a-repo';

/**
 * The branch checked out in `cwd`.
 *
 * On an UNBORN branch — a fresh `git init` with no commit yet —
 * `rev-parse --abbrev-ref HEAD` prints `HEAD` and exits 128, which read as
 * a detached HEAD and told the user so. Those are different situations with
 * different answers ("make a commit" versus "check out a branch"), so they
 * are distinguished rather than collapsed.
 */
export function currentBranch(cwd: string): string | null {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)?.trim();
  if (branch && branch !== 'HEAD') return branch;
  // --symbolic-full-name succeeds on an unborn branch where --abbrev-ref
  // does not: HEAD still points at refs/heads/<name>, there is just no
  // commit at the other end of it yet.
  const symbolic = git(['symbolic-ref', '--short', '-q', 'HEAD'], cwd)?.trim();
  return symbolic || null;
}

/** Why `currentBranch` answered null, so the UI can say something true. */
export function noBranchReason(cwd: string): NoBranchReason {
  if (gitScope(cwd) === null) return 'not-a-repo';
  // A symbolic HEAD with no commit behind it is unborn, not detached.
  return git(['symbolic-ref', '-q', 'HEAD'], cwd) !== null ? 'unborn' : 'detached';
}

// ── Writing ──────────────────────────────────────────────────
//
// Everything above reads, synchronously, because it is fast and bounded.
// Nothing below is either: a commit runs the repository's own pre-commit
// hooks (a lint-staged run is seconds, and this repo has one), a push is a
// network call, and `gh pr create` is two. Synchronous, any of them would
// freeze every PTY and chat session in the app for their whole duration —
// which is the same failure as a hung git, just scheduled.

/** What a write attempt did, in words the UI can show as-is. */
export interface GitWriteResult {
  ok: boolean;
  message: string;
  /** The pull request, when one was created. */
  url?: string;
}

function runGit(args: string[], cwd: string): Promise<GitWriteResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        encoding: 'utf-8',
        timeout: GIT_WRITE_TIMEOUT_MS,
        // The read path sets this and the write path did not, so node's 1MB
        // default applied — and git folds pre-commit hook output into
        // stderr. A verbose lint-staged run crossed it, node SIGTERMed
        // `git commit`, the commit was LOST, and the red box showed two
        // lines of lint output with nothing saying the app had killed it.
        maxBuffer: GIT_WRITE_MAX_BUFFER,
        env: {
          ...process.env,
          // Never let git stop to ASK. A credential prompt or an ssh
          // passphrase has no terminal to appear on here, so without these it
          // would wait for an answer that cannot come until the timeout.
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: 'echo',
          SSH_ASKPASS: 'echo',
          SSH_ASKPASS_REQUIRE: 'never',
        },
      },
      (err, stdout, stderr) => {
        if (!err) return resolve({ ok: true, message: (stdout || stderr).trim() });
        resolve({ ok: false, message: lastLines(stderr || stdout || err.message) });
      },
    );
  });
}

/** git's real complaint, trimmed to what fits in a toast. */
function lastLines(text: string, count = 2): string {
  const lines = text.trim().split('\n').filter(Boolean);
  return lines.slice(-count).join(' ').trim() || 'git failed';
}

/**
 * Stage everything and commit it.
 *
 * `add -A`, because the unit here is "what this agent did" and an agent that
 * created a file meant to create it. .gitignore still applies, so this does
 * not sweep up build output.
 */
/**
 * Conflict codes from `git status --porcelain`. Both sides modified, both
 * added, one side deleted — all of them mean "a human has not finished here".
 */
const UNMERGED_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

/**
 * Why committing right now would be a mistake, or null if it would not.
 *
 * Pure so the judgement can be tested without a repo mid-merge.
 *
 * `git commit` does not stop you here, which is the problem: with a conflict
 * staged, `add -A` + `commit` succeeds and writes `<<<<<<< HEAD` into the
 * file, COMPLETING the merge with broken content under an agent's name. A
 * rebase is the same with a detached HEAD. Both are states a person is in the
 * middle of resolving, and a button in another window has no business
 * finishing them.
 */
export function commitBlocker(
  statusPorcelain: string,
  inProgress: 'merge' | 'rebase' | 'cherry-pick' | null,
): string | null {
  if (inProgress) {
    return `This repository is in the middle of a ${inProgress}. Finish or abort it first — committing now would complete it with whatever is in the files.`;
  }
  const unmerged = statusPorcelain
    .split('\0')
    .filter((record) => UNMERGED_CODES.has(record.slice(0, 2)))
    .map((record) => record.slice(3));
  if (unmerged.length > 0) {
    return `Unresolved conflicts in ${unmerged.slice(0, 3).join(', ')}${unmerged.length > 3 ? ` and ${unmerged.length - 3} more` : ''}. Resolve them first — committing now would save the conflict markers.`;
  }
  return null;
}

/** Which multi-step git operation, if any, is half-finished. */
function operationInProgress(gitDir: string): 'merge' | 'rebase' | 'cherry-pick' | null {
  if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))) return 'merge';
  if (fs.existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD'))) return 'cherry-pick';
  if (
    fs.existsSync(path.join(gitDir, 'rebase-merge')) ||
    fs.existsSync(path.join(gitDir, 'rebase-apply'))
  ) {
    return 'rebase';
  }
  return null;
}

/**
 * Stage the agent's work and commit it.
 *
 * `add -A` carries the SAME pathspec the Changes panel was built from, so
 * what gets committed is what the user was shown. Without it `add -A`
 * ignores cwd altogether and stages the entire repository — an office one
 * directory inside a monorepo committed the whole monorepo.
 */
export async function commitAll(cwd: string, message: string): Promise<GitWriteResult> {
  const scope = gitScope(cwd);
  if (!scope) return { ok: false, message: 'This agent is not working in a git repository.' };

  const gitDir = git(['rev-parse', '--absolute-git-dir'], scope.root)?.trim();
  const status = git(['status', '--porcelain=v1', '-z'], scope.root) ?? '';
  const blocker = commitBlocker(status, gitDir ? operationInProgress(gitDir) : null);
  if (blocker) return { ok: false, message: blocker };

  const staged = await runGit(['add', '-A', ...spec(scope)], scope.root);
  if (!staged.ok) return staged;
  const committed = await runGit(['commit', '-m', message], scope.root);
  if (!committed.ok) return committed;
  return { ok: true, message: lastLines(committed.message, 1) };
}

/**
 * Where this branch's pushes are supposed to go.
 *
 * NOT always `origin`. In a triangular setup — which is how anyone works on
 * a repo they cannot write to — `origin` is the canonical shared repository
 * and pushes go to a personal fork via `remote.pushDefault` or
 * `branch.<name>.pushRemote`. Hardcoding origin published an agent's
 * half-finished branch to the shared repo, and `-u` then repointed the
 * user's own `git push` at it too.
 */
export function pushRemote(cwd: string, branch: string): string | null {
  const configured =
    git(['config', '--get', `branch.${branch}.pushRemote`], cwd)?.trim() ||
    git(['config', '--get', 'remote.pushDefault'], cwd)?.trim();
  const remotes = (git(['remote'], cwd) ?? '')
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
  if (configured && remotes.includes(configured)) return configured;
  return remotes.includes('origin') ? 'origin' : null;
}

/**
 * Push, setting upstream only when the branch does not have one.
 *
 * `-u` is not a no-op when an upstream already exists and points elsewhere:
 * it rewrites it, which silently retargets every later `git push` the user
 * runs by hand.
 */
export async function pushBranch(cwd: string, branch: string): Promise<GitWriteResult> {
  const root = gitScope(cwd)?.root ?? cwd;
  // An unborn branch has a name but nothing behind it, and git answers
  // "src refspec main does not match any", which reads like a typo.
  if (git(['rev-parse', '--verify', '-q', 'HEAD'], root) === null) {
    return {
      ok: false,
      message: 'This repository has no commits yet, so there is nothing to push. Commit first.',
    };
  }
  // Checked next because of what git says otherwise: with no remote of that
  // name it treats the name as a URL, fails to reach it, and reports "make
  // sure you have the correct access rights" — sending the user to look for
  // a permissions problem they do not have.
  const remote = pushRemote(root, branch);
  if (!remote) {
    return { ok: false, message: 'This repository has no "origin" remote to push to.' };
  }

  // git() answers null when the command fails, which is what "no upstream"
  // looks like: `rev-parse <branch>@{upstream}` exits non-zero.
  const hasUpstream = git(['rev-parse', '--abbrev-ref', `${branch}@{upstream}`], root) !== null;
  const args = hasUpstream ? ['push', remote, branch] : ['push', '-u', remote, branch];
  const pushed = await runGit(args, root);
  if (!pushed.ok) return pushed;
  return { ok: true, message: `Pushed ${branch} to ${remote}.` };
}

/**
 * Open a pull request with the GitHub CLI.
 *
 * `--fill` takes the title and body from the commits, which is the whole
 * point of having committed with a real message a moment ago — and it means
 * this button needs no second form.
 */
export function createPullRequest(cwd: string): Promise<GitWriteResult> {
  return new Promise((resolve) => {
    execFile(
      'gh',
      ['pr', 'create', '--fill'],
      { cwd, encoding: 'utf-8', timeout: GIT_WRITE_TIMEOUT_MS },
      (err, stdout, stderr) => {
        if (!err) {
          // gh prints the URL of the new PR and nothing else worth keeping.
          const url = (stdout || '').trim().split('\n').pop()?.trim();
          return resolve({
            ok: true,
            message: 'Pull request opened.',
            ...(url?.startsWith('http') ? { url } : {}),
          });
        }
        const text = stderr || stdout || err.message;
        // The one failure worth explaining rather than quoting: gh missing
        // entirely reads as an inscrutable ENOENT.
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return resolve({
            ok: false,
            message: 'The GitHub CLI (gh) is not installed, so a PR cannot be opened from here.',
          });
        }
        resolve({ ok: false, message: lastLines(text) });
      },
    );
  });
}
