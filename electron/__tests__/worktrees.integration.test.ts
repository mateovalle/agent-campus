/**
 * The git half of worktrees.ts, against real git in a throwaway repo.
 *
 * HOME is redirected first: every checkout path is derived from it, and a
 * test has no business writing into the user's own ~/.pixel-agents.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createWorktree,
  gitRepoRoot,
  isGitRepo,
  listWorktrees,
  removeWorktree,
  samePath,
  summarizeWorktrees,
} from '../worktrees.js';

let tmp: string;
let repo: string;
const realHome = process.env.HOME;
// USERPROFILE too: on Windows os.homedir() reads THAT and ignores HOME, so
// redirecting only HOME would have this suite creating real worktrees under
// the developer's own ~/.pixel-agents — and passing while it did it.
const realProfile = process.env.USERPROFILE;

const git = (args: string[], cwd: string) =>
  execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-wt-'));
  process.env.HOME = path.join(tmp, 'home');
  process.env.USERPROFILE = process.env.HOME;
  fs.mkdirSync(process.env.HOME, { recursive: true });

  repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  git(['init', '-q', '-b', 'main'], repo);
  git(['config', 'user.email', 'test@example.com'], repo);
  git(['config', 'user.name', 'Test'], repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'hi\n');
  git(['add', '-A'], repo);
  git(['commit', '-qm', 'init'], repo);
});

afterAll(() => {
  if (realHome === undefined) delete process.env.HOME;
  else process.env.HOME = realHome;
  if (realProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = realProfile;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('gitRepoRoot', () => {
  it('finds the root of a plain checkout', () => {
    expect(samePath(gitRepoRoot(repo) ?? '', repo)).toBe(true);
  });

  it('answers the MAIN repo from inside a worktree, not the worktree itself', () => {
    const wt = createWorktree(repo, 'probe/root');
    expect(samePath(gitRepoRoot(wt.path) ?? '', repo)).toBe(true);
  });

  it('returns null outside a repo', () => {
    const plain = path.join(tmp, 'not-a-repo');
    fs.mkdirSync(plain, { recursive: true });
    expect(gitRepoRoot(plain)).toBeNull();
    expect(isGitRepo(plain)).toBe(false);
  });
});

describe('createWorktree', () => {
  it('auto-names the branch and checks the files out', () => {
    const wt = createWorktree(repo);
    expect(wt.branch).toMatch(/^agent\/\d+$/);
    expect(fs.existsSync(path.join(wt.path, 'a.txt'))).toBe(true);
  });

  it('gives each agent its own checkout of the same repo', () => {
    const a = createWorktree(repo);
    const b = createWorktree(repo);
    expect(a.path).not.toBe(b.path);
    expect(a.branch).not.toBe(b.branch);
  });

  it('isolates edits: writing in one checkout leaves the repo untouched', () => {
    const wt = createWorktree(repo);
    fs.writeFileSync(path.join(wt.path, 'a.txt'), 'changed by the agent\n');
    expect(fs.readFileSync(path.join(repo, 'a.txt'), 'utf-8')).toBe('hi\n');
  });

  it('honours a requested branch name, normalized to what git accepts', () => {
    const wt = createWorktree(repo, 'feature/fix auth');
    // The space would make git reject the ref outright
    expect(wt.branch).toBe('feature/fix-auth');
    // The slash lives in the branch, never in the path
    expect(path.basename(wt.path)).toBe('feature-fix-auth');
  });

  it('refuses a branch already checked out, with git’s reason', () => {
    const wt = createWorktree(repo, 'taken/once');
    expect(() => createWorktree(repo, wt.branch)).toThrow(/already (checked out|used)/i);
  });

  it('reuses an existing branch that is not checked out anywhere', () => {
    git(['branch', 'prior/work'], repo);
    const wt = createWorktree(repo, 'prior/work');
    expect(wt.branch).toBe('prior/work');
  });
});

describe('listWorktrees / removeWorktree', () => {
  it('lists the main checkout plus the agents’', () => {
    const before = listWorktrees(repo).length;
    const wt = createWorktree(repo, 'listed/one');
    const paths = listWorktrees(repo).map((w) => w.path);
    expect(listWorktrees(repo).length).toBe(before + 1);
    expect(paths.some((p) => p.endsWith('listed-one'))).toBe(true);
    expect(listWorktrees(repo).some((w) => w.branch === wt.branch)).toBe(true);
  });

  it('removes a clean checkout but keeps its branch', () => {
    const wt = createWorktree(repo, 'removable/one');
    removeWorktree(repo, wt.path);
    expect(fs.existsSync(wt.path)).toBe(false);
    expect(git(['branch', '--list', 'removable/one'], repo).trim()).toContain('removable/one');
  });

  it('refuses to drop a checkout with uncommitted work unless forced', () => {
    const wt = createWorktree(repo, 'dirty/one');
    fs.writeFileSync(path.join(wt.path, 'a.txt'), 'uncommitted\n');
    expect(() => removeWorktree(repo, wt.path)).toThrow();
    removeWorktree(repo, wt.path, true);
    expect(fs.existsSync(wt.path)).toBe(false);
  });
});

describe('summarizeWorktrees', () => {
  it('flags the repo\u2019s own checkout and only that one', () => {
    createWorktree(repo, 'sum/one');
    const all = summarizeWorktrees(repo);
    expect(all.filter((w) => w.isMain)).toHaveLength(1);
    expect(samePath(all.find((w) => w.isMain)!.path, repo)).toBe(true);
  });

  it('reports a clean checkout as clean and a touched one as dirty', () => {
    const wt = createWorktree(repo, 'sum/dirty');
    const clean = summarizeWorktrees(repo).find((w) => w.branch === 'sum/dirty');
    expect(clean?.dirty).toBe(false);

    fs.writeFileSync(path.join(wt.path, 'a.txt'), 'edited by an agent\n');
    const dirty = summarizeWorktrees(repo).find((w) => w.branch === 'sum/dirty');
    expect(dirty?.dirty).toBe(true);
  });

  it('counts the commits a removal would strand', () => {
    const wt = createWorktree(repo, 'sum/ahead');
    expect(summarizeWorktrees(repo).find((w) => w.branch === 'sum/ahead')?.ahead).toBe(0);

    fs.writeFileSync(path.join(wt.path, 'new.txt'), 'work\n');
    git(['add', '-A'], wt.path);
    git(['commit', '-qm', 'agent work'], wt.path);
    expect(summarizeWorktrees(repo).find((w) => w.branch === 'sum/ahead')?.ahead).toBe(1);
  });

  it('leaves agentIds for the host to fill in', () => {
    expect(summarizeWorktrees(repo).every((w) => Array.isArray(w.agentIds))).toBe(true);
  });
});

describe('samePath', () => {
  it('says yes to a directory reached by two different strings', () => {
    expect(samePath(repo, path.join(repo, '..', 'repo'))).toBe(true);
  });

  it('says no to two different directories', () => {
    expect(samePath(repo, tmp)).toBe(false);
  });

  // The case `path.resolve` cannot answer, and the reason this helper exists:
  // the two strings have nothing in common, yet they are one directory.
  // (Windows has the same problem with 8.3 names and junctions, but creating
  // a symlink there needs a privilege CI does not hand out.)
  it.skipIf(process.platform === 'win32')('sees through a symlink', () => {
    const link = path.join(tmp, 'link-to-repo');
    fs.symlinkSync(repo, link);
    expect(path.resolve(link)).not.toBe(path.resolve(repo));
    expect(samePath(link, repo)).toBe(true);
  });

  it('falls back to comparing the strings when a path is gone', () => {
    // `git worktree list` reports checkouts whose directory was deleted by
    // hand, and nothing can be canonicalised about those.
    const ghost = path.join(tmp, 'deleted-by-hand');
    expect(samePath(ghost, ghost)).toBe(true);
    expect(samePath(ghost, repo)).toBe(false);
  });
});
