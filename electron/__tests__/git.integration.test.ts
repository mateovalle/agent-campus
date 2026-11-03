/**
 * `changedFiles` and `fileDiff` against real git in a throwaway repo.
 *
 * The unit tests cover the formats; this covers the assumption underneath
 * them — that these are the flags git actually answers that way, on this
 * machine's git, including the rename detection and the untracked file that
 * has no HEAD to be compared with.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { changedFiles, currentBranch, fileDiff } from '../git.js';

let repo: string;

const git = (args: string[]) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text, 'utf-8');
};
const find = (file: string) => changedFiles(repo).find((c) => c.path === file);

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-git-'));
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  write('mod.txt', 'a\nb\nc\n');
  write('gone.txt', 'x\n');
  write('old-name.txt', 'y\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'init']);

  write('mod.txt', 'a\nB\nc\nd\n');
  fs.rmSync(path.join(repo, 'gone.txt'));
  git(['mv', 'old-name.txt', 'new-name.txt']);
  write('untracked.txt', 'new\nfile\n');
  write('sub/with space.txt', 'spaces are ordinary\n');
});

afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));

describe('changedFiles', () => {
  it('finds every kind of change at once', () => {
    const byPath = Object.fromEntries(changedFiles(repo).map((c) => [c.path, c.status]));
    expect(byPath).toEqual({
      'mod.txt': 'modified',
      'gone.txt': 'deleted',
      'new-name.txt': 'renamed',
      'untracked.txt': 'untracked',
      'sub/with space.txt': 'untracked',
    });
  });

  it('counts the lines of a modified file', () => {
    expect(find('mod.txt')).toMatchObject({ added: 2, removed: 1 });
  });

  it('counts an untracked file as all additions', () => {
    // Nothing in HEAD to diff against, so numstat says nothing about it — and
    // reporting 0 would tell the reviewer a new file is empty.
    expect(find('untracked.txt')).toMatchObject({ added: 2, removed: 0 });
  });

  it('keeps where a renamed file came from', () => {
    expect(find('new-name.txt')?.oldPath).toBe('old-name.txt');
  });

  it('answers nothing for a directory that is not a repo', () => {
    const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-notgit-'));
    expect(changedFiles(notARepo)).toEqual([]);
    fs.rmSync(notARepo, { recursive: true, force: true });
  });
});

describe('fileDiff', () => {
  it('returns a unified diff for a tracked file', () => {
    const patch = fileDiff(repo, 'mod.txt', false);
    expect(patch).toContain('@@');
    expect(patch).toContain('-b');
    expect(patch).toContain('+B');
  });

  it('returns a diff for an untracked file, which git exits 1 to produce', () => {
    // `git diff --no-index` reports a difference by EXITING NON-ZERO, so the
    // output has to be read off the thrown error or a new file shows as empty.
    const patch = fileDiff(repo, 'untracked.txt', true);
    expect(patch).toContain('+new');
    expect(patch).toContain('+file');
  });
});

describe('currentBranch', () => {
  it('names the checked-out branch', () => {
    expect(currentBranch(repo)).toBe('main');
  });

  it('answers null outside a repo', () => {
    const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-notgit-'));
    expect(currentBranch(notARepo)).toBeNull();
    fs.rmSync(notARepo, { recursive: true, force: true });
  });
});
