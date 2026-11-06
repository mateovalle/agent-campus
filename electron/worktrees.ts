/**
 * Git worktrees: a private checkout per agent, so two agents in the same
 * project stop overwriting each other's files.
 *
 * The campus keeps its metaphor intact — an office is a REPO, not a checkout.
 * A worktree agent sits in its repo's office with everyone else; only its
 * `cwd` differs (see AgentPlacement in main.ts). That is why nothing here
 * registers a workspace: worktrees are deliberately invisible to
 * workspaces.json, layouts, todos and the usage ledger, all of which stay
 * keyed by the repo root.
 *
 * Worktrees live under ~/.pixel-agents/worktrees/ rather than beside the repo
 * so they can't be picked up by the project's own tooling (file watchers,
 * globs, test runners) or committed by accident.
 *
 * Nothing here ever deletes a worktree on its own: it holds real work that
 * may not be merged yet. Removal is always something the user asks for.
 */

import { execFileSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { WorktreeSummary } from '../shared/protocol.js';
import { DATA_DIR_NAME, GIT_COMMAND_TIMEOUT_MS } from '../src/core/constants.js';

/**
 * Where checkouts live. Resolved per call rather than at import: the home dir
 * is the app's whole data root, and tests (and the headless driver) point it
 * somewhere disposable before touching any of this.
 */
function worktreesRoot(): string {
  return path.join(os.homedir(), DATA_DIR_NAME, 'worktrees');
}
/** Branch prefix for auto-named agent branches ("agent/1", "agent/2", …). */
const AGENT_BRANCH_PREFIX = 'agent';
/** Chars of the repo-path hash in a worktree dir name — enough to separate same-named repos. */
const REPO_HASH_CHARS = 8;
/** Attempts to find a free directory name before giving up. */
const DIR_SUFFIX_MAX = 50;

export interface WorktreeInfo {
  /** Absolute path of the checkout — the agent's cwd. */
  path: string;
  branch: string;
  /** Repo the worktree belongs to — the agent's office. */
  repoRoot: string;
}

// ── Pure helpers (unit-tested) ───────────────────────────────

/**
 * Branch name → one safe path segment: slashes and anything exotic collapse
 * to '-', so "feature/fix auth" nests nowhere and surprises no shell.
 */
export function sanitizeBranchForPath(branch: string): string {
  const cleaned = branch
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return cleaned || 'agent';
}

/**
 * A user's words → a name git will actually accept as a branch.
 *
 * Typing "fix auth" in the worktree field is the obvious thing to do and git
 * rejects it outright (no spaces in a ref), so the rules of git-check-ref-format
 * are applied here instead of handing the user a git error: whitespace becomes
 * '-', forbidden characters go, and no path component may start with a dot,
 * end in '.lock' or be empty. Returns '' when nothing usable survives, which
 * the caller reads as "name it yourself".
 */
export function normalizeBranchName(input: string): string {
  const parts = input
    .trim()
    .replace(/\s+/g, '-')
    // Characters git forbids in a ref, plus the '@{' reflog syntax
    .replace(/[~^:?*[\]\\]/g, '')
    .replace(/@\{/g, '-')
    .replace(/\.{2,}/g, '.')
    .split('/')
    .map((part) => part.replace(/^\.+/, '').replace(/\.+$/, ''))
    .map((part) => (part.toLowerCase().endsWith('.lock') ? part.slice(0, -'.lock'.length) : part))
    .filter(Boolean);
  const name = parts.join('/');
  return name === '@' ? '' : name;
}

/** First unused "<prefix>/<n>" given the branches a repo already has. */
export function nextFreeBranch(existing: readonly string[], prefix = AGENT_BRANCH_PREFIX): string {
  const taken = new Set(existing);
  for (let n = 1; ; n++) {
    const candidate = `${prefix}/${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Directory for a repo's worktrees: basename for humans, path hash so two
 * checkouts of the same-named repo never collide.
 */
export function repoWorktreeDir(repoRoot: string, baseDir = worktreesRoot()): string {
  const hash = crypto.createHash('sha1').update(repoRoot).digest('hex').slice(0, REPO_HASH_CHARS);
  return path.join(baseDir, `${path.basename(repoRoot)}-${hash}`);
}

/**
 * Free directory for a branch's checkout. `git worktree add` refuses an
 * existing path, and a stale directory from a removed worktree is exactly the
 * kind of thing that outlives it — so suffix until one is free.
 */
export function freeWorktreePath(
  repoRoot: string,
  branch: string,
  exists: (p: string) => boolean = fs.existsSync,
  baseDir = worktreesRoot(),
): string {
  const dir = repoWorktreeDir(repoRoot, baseDir);
  const name = sanitizeBranchForPath(branch);
  const first = path.join(dir, name);
  if (!exists(first)) return first;
  for (let n = 2; n <= DIR_SUFFIX_MAX; n++) {
    const candidate = path.join(dir, `${name}-${n}`);
    if (!exists(candidate)) return candidate;
  }
  return path.join(dir, `${name}-${Date.now()}`);
}

/**
 * `git worktree list --porcelain` → the checkouts it describes. Records are
 * blank-line separated; a detached checkout has no branch line, and the
 * branch arrives as a full ref ("refs/heads/x").
 */
export function parseWorktreeList(
  porcelain: string,
): Array<{ path: string; branch?: string; prunable?: boolean }> {
  const out: Array<{ path: string; branch?: string; prunable?: boolean }> = [];
  let current: { path: string; branch?: string; prunable?: boolean } | null = null;
  for (const line of porcelain.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('worktree ')) {
      if (current) out.push(current);
      current = { path: trimmed.slice('worktree '.length) };
    } else if (trimmed.startsWith('branch ') && current) {
      current.branch = trimmed.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (trimmed.startsWith('prunable') && current) {
      // git still lists a checkout whose directory was deleted by hand, with
      // a `prunable` line saying why. Without reading it the row looks
      // perfectly healthy and "+ Agent here" launches into a path that does
      // not exist — a terminal agent dies on chdir, a chat agent at spawn.
      current.prunable = true;
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Why a worktree must not be removed right now, or null when it may be.
 *
 * Pure so the rule is testable and lives in ONE place: the main checkout is
 * the repo itself, and a checkout with a live agent would be deleted out from
 * under a running session.
 */
export function worktreeRemovalBlocker(worktree: {
  isMain: boolean;
  agentIds: readonly number[];
}): string | null {
  if (worktree.isMain) return 'This is the repository itself, not a worktree.';
  if (worktree.agentIds.length > 0) {
    const n = worktree.agentIds.length;
    return `Close the ${n === 1 ? 'agent' : `${n} agents`} working here first.`;
  }
  return null;
}

/**
 * Whether two paths are the same directory — asked of the filesystem, not of
 * the strings.
 *
 * `path.resolve` normalises separators and `..` segments and stops there. It
 * cannot reconcile a Windows 8.3 short name (C:\\Users\\RUNNER~1 vs
 * C:\\Users\\runneradmin), a junction, a symlink, or letter case — and macOS
 * hands out /tmp paths that are really /private/tmp. The gap is not cosmetic:
 * this comparison decides which agents live in a checkout, and
 * `worktreeRemovalBlocker` only refuses a removal when that count is non-zero,
 * so a false negative offers Remove — with force, on a dirty checkout — while
 * an agent is working there.
 *
 * A path that does not exist cannot be canonicalised, so it falls back to a
 * resolved comparison (case-insensitively where the platform is). `git
 * worktree list` reports checkouts whose directory was deleted by hand, and
 * no agent can be running in one of those anyway.
 */
export function samePath(a: string, b: string): boolean {
  return canonicalPath(a) === canonicalPath(b);
}

function canonicalPath(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    const resolved = path.resolve(p);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }
}

// ── Git plumbing ─────────────────────────────────────────────

/** Runs git in `cwd`, returning trimmed stdout, or null if it failed. */
function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: GIT_COMMAND_TIMEOUT_MS,
    }).trim();
  } catch {
    return null;
  }
}

/** Runs git, throwing with git's own stderr so the user sees the real reason. */
function gitOrThrow(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: GIT_COMMAND_TIMEOUT_MS,
    }).trim();
  } catch (err) {
    const e = err as { stderr?: string; message?: string; signal?: string };
    // A timeout kills the child, so there is no stderr to quote and the raw
    // message is about a signal — useless to anyone reading a toast.
    if (e.signal) {
      throw new Error(`git ${args[0]} gave up after ${GIT_COMMAND_TIMEOUT_MS / 1000}s`);
    }
    const reason = (e.stderr || e.message || '').trim().split('\n').slice(-3).join(' ');
    throw new Error(reason || `git ${args[0]} failed`);
  }
}

/**
 * The MAIN repo root for a directory, or null if it isn't a git repo.
 *
 * Deliberately not `--show-toplevel`: inside a worktree that answers the
 * worktree's own root, and offices are keyed by repo. `--git-common-dir`
 * points at the shared `.git` of the main checkout for every worktree alike.
 */
export function gitRepoRoot(dir: string): string | null {
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], dir);
  if (common && path.basename(common) === '.git') return path.dirname(common);
  // Older git (< 2.31) has no --path-format; the relative answer still
  // resolves, and a plain checkout's toplevel is the same thing.
  const legacy = git(['rev-parse', '--git-common-dir'], dir);
  if (legacy) {
    const abs = path.isAbsolute(legacy) ? legacy : path.resolve(dir, legacy);
    if (path.basename(abs) === '.git') return path.dirname(abs);
  }
  return git(['rev-parse', '--show-toplevel'], dir);
}

/** Whether the directory is inside a git repo (drives the worktree UI). */
export function isGitRepo(dir: string): boolean {
  return gitRepoRoot(dir) !== null;
}

/** Local branch names in the repo. */
function localBranches(repoRoot: string): string[] {
  const out = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], repoRoot);
  return out ? out.split('\n').filter(Boolean) : [];
}

/** The checkouts a repo currently has (the main one included). */
export function listWorktrees(
  repoRoot: string,
): Array<{ path: string; branch?: string; prunable?: boolean }> {
  const out = git(['worktree', 'list', '--porcelain'], repoRoot);
  return out ? parseWorktreeList(out) : [];
}

/** Whether a checkout has uncommitted changes (tracked or not). */
function isDirty(worktreePath: string): boolean {
  const out = git(['status', '--porcelain'], worktreePath);
  return out !== null && out.length > 0;
}

/** Commits `branch` has that `base` does not — the work a removal would strand. */
function commitsAhead(repoRoot: string, branch: string, base: string): number {
  if (branch === base) return 0;
  const out = git(['rev-list', '--count', `${base}..${branch}`], repoRoot);
  const n = out ? Number.parseInt(out, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Every checkout of a repo with the facts needed to decide its fate: whether
 * it has uncommitted work, how far ahead of the repo's own branch it is, and
 * (filled in by the caller) which agents are living in it.
 *
 * The main checkout is included and flagged, so the manager can show which
 * branch the repo itself is on rather than implying it does not exist.
 */
/** Local branch refs other than `except`, for "what else holds these commits". */
function otherBranchRefs(repoRoot: string, except?: string): string[] {
  return (git(['for-each-ref', '--format=%(refname)', 'refs/heads'], repoRoot) ?? '')
    .split('\n')
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0 && ref !== `refs/heads/${except}`);
}

/**
 * Commits that would be ORPHANED by removing this checkout.
 *
 * The old answer was `base..branch`, which silently returned 0 in the two
 * cases where it mattered most:
 *
 *   - A DETACHED checkout has no branch, so the condition never ran and the
 *     row reported 0 unmerged — while the confirmation promised "the branch
 *     stays" about a branch that does not exist. Removing it left the work
 *     as an unreachable commit, i.e. waiting for gc. An agent only has to
 *     run `git checkout <sha>` once to be here.
 *   - When the REPO ITSELF is detached (a bisect, a tag checkout) there is
 *     no base branch, so every worktree in it reported 0.
 *
 * Detached is measured in its own directory, because the question is about
 * that worktree's HEAD. `--branches --remotes --tags` rather than `--all`:
 * git deliberately includes other worktrees' HEADs in `--all`, so the
 * checkout would exclude itself and always answer 0.
 */
function commitsOnlyHere(
  repoRoot: string,
  w: { path: string; branch?: string },
  base?: string,
): number {
  const count = (out: string | null): number => {
    const n = Number.parseInt((out ?? '').trim(), 10);
    return Number.isFinite(n) ? n : 0;
  };
  if (!w.branch) {
    return count(
      git(['rev-list', '--count', 'HEAD', '--not', '--branches', '--remotes', '--tags'], w.path),
    );
  }
  if (base && base !== w.branch) return commitsAhead(repoRoot, w.branch, base);
  const others = otherBranchRefs(repoRoot, w.branch);
  if (others.length === 0) return 0;
  return count(git(['rev-list', '--count', w.branch, '--not', ...others], repoRoot));
}

export function summarizeWorktrees(repoRoot: string): WorktreeSummary[] {
  const all = listWorktrees(repoRoot);
  const main = all.find((w) => path.resolve(w.path) === path.resolve(repoRoot)) ?? all[0];
  const baseBranch = main?.branch;
  return all.map((w) => {
    const isMain = main !== undefined && w.path === main.path;
    return {
      path: w.path,
      ...(w.branch ? { branch: w.branch } : {}),
      isMain,
      ...(w.prunable ? { prunable: true } : {}),
      dirty: isDirty(w.path),
      ahead: isMain || w.prunable ? 0 : commitsOnlyHere(repoRoot, w, baseBranch),
      agentIds: [],
    };
  });
}

/**
 * Creates a checkout for an agent. A requested branch that already exists is
 * checked out as-is (resuming yesterday's work); otherwise the branch is
 * created off `baseRef`. Throws with git's reason if the checkout is refused
 * — most often because that branch is already open in another worktree.
 */
export function createWorktree(
  repoRoot: string,
  requestedBranch?: string,
  baseRef = 'HEAD',
): WorktreeInfo {
  const existing = localBranches(repoRoot);
  const branch = normalizeBranchName(requestedBranch ?? '') || nextFreeBranch(existing);
  const target = freeWorktreePath(repoRoot, branch);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  if (existing.includes(branch)) {
    gitOrThrow(['worktree', 'add', target, branch], repoRoot);
  } else {
    gitOrThrow(['worktree', 'add', '-b', branch, target, baseRef], repoRoot);
  }
  return { path: target, branch, repoRoot };
}

/**
 * Drops a worktree. `force` discards uncommitted changes in it — the caller
 * is responsible for having asked first. The branch itself is left alone:
 * commits in it are the whole point of the exercise.
 */
export function removeWorktree(repoRoot: string, worktreePath: string, force = false): void {
  gitOrThrow(['worktree', 'remove', ...(force ? ['--force'] : []), worktreePath], repoRoot);
}
