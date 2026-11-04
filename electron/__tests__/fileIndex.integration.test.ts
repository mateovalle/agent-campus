/**
 * `listWorkspaceFiles` against real directories.
 *
 * The ranking is unit-tested; what needs a real filesystem is the part that
 * decides WHICH files exist at all — whether .gitignore is respected, and
 * what happens in a workspace that is not a repository.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { forgetWorkspaceFiles, listWorkspaceFiles } from '../fileIndex.js';

const made: string[] = [];
const tmpDir = (prefix: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
};
const write = (dir: string, rel: string, text = 'x\n') => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text, 'utf-8');
};

afterEach(() => {
  for (const dir of made.splice(0)) {
    forgetWorkspaceFiles(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('listWorkspaceFiles in a repository', () => {
  it('lists tracked and new files, and obeys .gitignore', async () => {
    const dir = tmpDir('campus-idx-');
    const git = (args: string[]) =>
      execFileSync('git', args, { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    write(dir, '.gitignore', 'node_modules/\nsecret.env\n');
    write(dir, 'src/app.ts');
    git(['add', '-A']);
    git(['commit', '-qm', 'init']);

    // One file the agent just created, and two that must never be offered.
    write(dir, 'src/new-file.ts');
    write(dir, 'secret.env', 'TOKEN=1\n');
    write(dir, 'node_modules/left-pad/index.js');

    const files = await listWorkspaceFiles(dir);
    expect(files).toContain('src/app.ts');
    // Untracked but not ignored: exactly what someone would want to mention.
    expect(files).toContain('src/new-file.ts');
    expect(files).not.toContain('secret.env');
    expect(files.some((f) => f.startsWith('node_modules/'))).toBe(false);
  });

  it('reuses the listing until it goes stale', async () => {
    const dir = tmpDir('campus-idx-');
    execFileSync('git', ['init', '-q', '-b', 'main'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    write(dir, 'one.ts');

    const first = await listWorkspaceFiles(dir, 1_000);
    write(dir, 'two.ts');
    // Same clock: the cache answers, so the new file is not there yet.
    expect(await listWorkspaceFiles(dir, 1_000)).toEqual(first);
    // Well past the TTL: re-read, and the agent's new file appears.
    expect(await listWorkspaceFiles(dir, 1_000_000)).toContain('two.ts');
  });
});

describe('listWorkspaceFiles outside a repository', () => {
  it('still finds files, skipping the directories a walk should never enter', async () => {
    // A workspace does not have to be a repo — the marketing template is a
    // folder of markdown — but a walk into node_modules would be unusable.
    const dir = tmpDir('campus-plain-');
    write(dir, 'brief.md');
    write(dir, 'scripts/post.md');
    write(dir, 'node_modules/left-pad/index.js');
    write(dir, '.hidden/secret.md');

    const files = await listWorkspaceFiles(dir);
    expect(files).toContain('brief.md');
    expect(files).toContain('scripts/post.md');
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
    expect(files.some((f) => f.includes('.hidden'))).toBe(false);
  });

  it('answers with nothing for a directory that is not there', async () => {
    expect(await listWorkspaceFiles(path.join(os.tmpdir(), 'campus-not-a-dir-xyz'))).toEqual([]);
  });
});
