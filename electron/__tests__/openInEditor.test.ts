import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';

import type { LineEditor, OpenOutcome } from '../openInEditor.js';
import { editorArgs, expandHome, openFileRef, resolveRefPath } from '../openInEditor.js';

const HOME = '/Users/me';
const CWD = '/Users/me/project';

/**
 * The expected path, composed the way the platform composes it.
 *
 * These assertions used to spell out POSIX strings, which made them assertions
 * about the separator rather than about the resolution — and nine of them
 * failed the first time CI ran on Windows, where the code under test (join +
 * normalize) answers with backslashes and is perfectly right to.
 */
const abs = (...parts: string[]) => path.normalize(path.join(...parts));

describe('expandHome', () => {
  it('expands a leading tilde', () => {
    expect(expandHome('~/.pixel-agents/settings.json', HOME)).toBe(
      path.join(HOME, '.pixel-agents/settings.json'),
    );
  });

  it('expands a bare tilde', () => {
    expect(expandHome('~', HOME)).toBe(HOME);
  });

  it('leaves a tilde inside a name alone', () => {
    expect(expandHome('src/weird~name.ts', HOME)).toBe('src/weird~name.ts');
  });
});

describe('resolveRefPath', () => {
  it('resolves a relative path against the agent cwd', () => {
    expect(resolveRefPath('electron/main.ts', CWD, HOME)).toBe(abs(CWD, 'electron/main.ts'));
  });

  it('keeps an absolute path as it is', () => {
    expect(resolveRefPath('/etc/hosts', CWD, HOME)).toBe(abs('/etc/hosts'));
  });

  it('normalizes a ./ prefix away', () => {
    expect(resolveRefPath('./scripts/build.sh', CWD, HOME)).toBe(abs(CWD, 'scripts/build.sh'));
  });

  // A worktree agent's cwd is its checkout: the same relative path must land
  // in the branch it is working on, not in the repo.
  it('follows the cwd it is given, worktree included', () => {
    const worktree = '/Users/me/.pixel-agents/worktrees/project-abc/agent-1';
    expect(resolveRefPath('src/app.ts', worktree, HOME)).toBe(abs(worktree, 'src/app.ts'));
  });

  it('cannot resolve a relative path with no agent behind it', () => {
    expect(resolveRefPath('src/app.ts', undefined, HOME)).toBeNull();
  });

  it('still resolves an absolute path with no agent', () => {
    expect(resolveRefPath('/tmp/x.ts', undefined, HOME)).toBe(abs('/tmp/x.ts'));
  });
});

describe('editorArgs', () => {
  it('uses -g for VS Code and its forks', () => {
    expect(editorArgs('code', '/a/b.ts', 12)).toEqual(['-g', '/a/b.ts:12']);
    expect(editorArgs('cursor', '/a/b.ts', 12)).toEqual(['-g', '/a/b.ts:12']);
  });

  it('passes file:line directly to editors that take it', () => {
    expect(editorArgs('zed', '/a/b.ts', 12)).toEqual(['/a/b.ts:12']);
    expect(editorArgs('subl', '/a/b.ts', 12)).toEqual(['/a/b.ts:12']);
  });
});

describe('openFileRef', () => {
  const base = (over: Partial<Parameters<typeof openFileRef>[2]> = {}) => ({
    cwd: CWD,
    home: HOME,
    openDefault: vi.fn(),
    spawnEditor: vi.fn(),
    exists: () => true,
    findEditor: () => 'code' as LineEditor,
    ...over,
  });

  it('spawns the editor when there is a line to jump to', () => {
    const deps = base();
    const out: OpenOutcome = openFileRef('electron/main.ts', 412, deps);
    expect(out).toEqual({
      kind: 'opened',
      how: 'editor',
      file: abs(CWD, 'electron/main.ts'),
    });
    expect(deps.spawnEditor).toHaveBeenCalledWith('code', [
      '-g',
      `${abs(CWD, 'electron/main.ts')}:412`,
    ]);
    expect(deps.openDefault).not.toHaveBeenCalled();
  });

  // Without a line there is nothing an editor gives us that the user's own
  // default application does not, and the default is the more respectful pick.
  it('uses the default application when there is no line', () => {
    const deps = base();
    expect(openFileRef('electron/main.ts', undefined, deps).kind).toBe('opened');
    expect(deps.openDefault).toHaveBeenCalledWith(abs(CWD, 'electron/main.ts'));
    expect(deps.spawnEditor).not.toHaveBeenCalled();
  });

  it('falls back to the default application when no editor is installed', () => {
    const deps = base({ findEditor: () => null });
    expect(openFileRef('a.ts', 3, deps)).toMatchObject({ how: 'default' });
    expect(deps.openDefault).toHaveBeenCalled();
  });

  it('reports a file that is not there instead of opening something else', () => {
    const deps = base({ exists: () => false });
    expect(openFileRef('ghost.ts', undefined, deps)).toEqual({
      kind: 'missing',
      file: abs(CWD, 'ghost.ts'),
    });
    expect(deps.openDefault).not.toHaveBeenCalled();
  });

  it('reports a relative path it has no agent to resolve against', () => {
    const deps = base({ cwd: undefined });
    expect(openFileRef('src/app.ts', undefined, deps)).toEqual({
      kind: 'unresolved',
      raw: 'src/app.ts',
    });
  });

  it('never opens anything for an empty reference', () => {
    const deps = base();
    expect(openFileRef('   ', undefined, deps).kind).toBe('unresolved');
    expect(deps.openDefault).not.toHaveBeenCalled();
  });
});
