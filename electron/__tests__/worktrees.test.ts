import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  freeWorktreePath,
  nextFreeBranch,
  normalizeBranchName,
  parseWorktreeList,
  repoWorktreeDir,
  sanitizeBranchForPath,
  worktreeRemovalBlocker,
} from '../worktrees.js';

const BASE = '/base';

describe('sanitizeBranchForPath', () => {
  it('flattens slashes so a branch is one path segment', () => {
    expect(sanitizeBranchForPath('feature/fix-auth')).toBe('feature-fix-auth');
  });

  it('collapses spaces and exotic characters', () => {
    expect(sanitizeBranchForPath('fix auth (urgent!)')).toBe('fix-auth-urgent');
  });

  it('never returns an empty segment', () => {
    expect(sanitizeBranchForPath('///')).toBe('agent');
  });
});

describe('normalizeBranchName', () => {
  it('leaves a valid branch name alone', () => {
    expect(normalizeBranchName('feature/fix-auth')).toBe('feature/fix-auth');
  });

  it('turns typed words into a ref git accepts', () => {
    expect(normalizeBranchName('fix auth timeout')).toBe('fix-auth-timeout');
  });

  it('drops characters git forbids in a ref', () => {
    expect(normalizeBranchName('fix~auth^2:now?')).toBe('fixauth2now');
  });

  it('never leaves an empty or dot-led path component', () => {
    expect(normalizeBranchName('feature//.hidden/')).toBe('feature/hidden');
  });

  it('refuses the .lock suffix git reserves', () => {
    expect(normalizeBranchName('agent/work.lock')).toBe('agent/work');
  });

  it('returns empty when nothing usable survives, so the caller auto-names', () => {
    expect(normalizeBranchName('  ///  ')).toBe('');
    expect(normalizeBranchName('@')).toBe('');
  });
});

describe('nextFreeBranch', () => {
  it('starts at 1 in a repo with no agent branches', () => {
    expect(nextFreeBranch([])).toBe('agent/1');
  });

  it('skips the numbers already taken', () => {
    expect(nextFreeBranch(['agent/1', 'agent/2', 'main'])).toBe('agent/3');
  });

  it('fills a gap left by a deleted branch', () => {
    expect(nextFreeBranch(['agent/1', 'agent/3'])).toBe('agent/2');
  });
});

describe('repoWorktreeDir', () => {
  it('names the directory after the repo', () => {
    expect(path.basename(repoWorktreeDir('/code/campus', BASE))).toMatch(/^campus-[0-9a-f]{8}$/);
  });

  it('separates same-named repos at different paths', () => {
    const a = repoWorktreeDir('/code/a/campus', BASE);
    const b = repoWorktreeDir('/code/b/campus', BASE);
    expect(a).not.toBe(b);
  });

  it('is stable for the same repo', () => {
    expect(repoWorktreeDir('/code/campus', BASE)).toBe(repoWorktreeDir('/code/campus', BASE));
  });
});

describe('freeWorktreePath', () => {
  const never = () => false;

  it('uses the branch name when the path is free', () => {
    const p = freeWorktreePath('/code/campus', 'agent/1', never, BASE);
    expect(path.basename(p)).toBe('agent-1');
  });

  it('suffixes past a leftover directory', () => {
    const taken = new Set([path.join(repoWorktreeDir('/code/campus', BASE), 'agent-1')]);
    const p = freeWorktreePath('/code/campus', 'agent/1', (x) => taken.has(x), BASE);
    expect(path.basename(p)).toBe('agent-1-2');
  });

  it('keeps every checkout of a repo under one directory', () => {
    const dir = repoWorktreeDir('/code/campus', BASE);
    expect(path.dirname(freeWorktreePath('/code/campus', 'x', never, BASE))).toBe(dir);
  });
});

describe('parseWorktreeList', () => {
  const porcelain = [
    'worktree /code/campus',
    'HEAD abc123',
    'branch refs/heads/main',
    '',
    'worktree /home/u/.pixel-agents/worktrees/campus-1234abcd/agent-1',
    'HEAD def456',
    'branch refs/heads/agent/1',
    '',
    'worktree /tmp/detached',
    'HEAD 999fff',
    'detached',
    '',
  ].join('\n');

  it('reads every checkout', () => {
    expect(parseWorktreeList(porcelain)).toHaveLength(3);
  });

  it('strips the refs/heads/ prefix', () => {
    expect(parseWorktreeList(porcelain)[1].branch).toBe('agent/1');
  });

  it('leaves a detached checkout without a branch', () => {
    expect(parseWorktreeList(porcelain)[2].branch).toBeUndefined();
  });

  it('survives empty input', () => {
    expect(parseWorktreeList('')).toEqual([]);
  });
});

describe('worktreeRemovalBlocker', () => {
  it('allows removing an idle worktree', () => {
    expect(worktreeRemovalBlocker({ isMain: false, agentIds: [] })).toBeNull();
  });

  it('never offers to remove the repo itself', () => {
    expect(worktreeRemovalBlocker({ isMain: true, agentIds: [] })).toMatch(/repository itself/i);
  });

  it('refuses while an agent is working there', () => {
    expect(worktreeRemovalBlocker({ isMain: false, agentIds: [3] })).toBe(
      'Close the agent working here first.',
    );
  });

  it('counts the agents it is waiting on', () => {
    expect(worktreeRemovalBlocker({ isMain: false, agentIds: [1, 2] })).toBe(
      'Close the 2 agents working here first.',
    );
  });

  it('reports the repo before the agents — the stronger reason wins', () => {
    expect(worktreeRemovalBlocker({ isMain: true, agentIds: [1] })).toMatch(/repository itself/i);
  });
});

describe('parseWorktreeList: a checkout whose directory is gone', () => {
  it('reads the prunable line git emits for it', () => {
    // git keeps listing it, so without this the row looks perfectly healthy
    // and "+ Agent here" launches into a path that does not exist.
    const porcelain = [
      'worktree /repo',
      'HEAD aaaa',
      'branch refs/heads/main',
      '',
      'worktree /gone/fix-auth',
      'HEAD bbbb',
      'branch refs/heads/fix-auth',
      'prunable gitdir file points to non-existent location',
      '',
    ].join('\n');
    const out = parseWorktreeList(porcelain);
    expect(out).toHaveLength(2);
    expect(out[0].prunable).toBeUndefined();
    expect(out[1]).toMatchObject({ path: '/gone/fix-auth', branch: 'fix-auth', prunable: true });
  });

  it('leaves a healthy list untouched', () => {
    const out = parseWorktreeList(
      ['worktree /repo', 'HEAD aaaa', 'branch refs/heads/main', ''].join('\n'),
    );
    expect(out).toEqual([{ path: '/repo', branch: 'main' }]);
  });

  it('still reads a detached checkout as having no branch', () => {
    const out = parseWorktreeList(['worktree /repo/det', 'HEAD bbbb', 'detached', ''].join('\n'));
    expect(out).toEqual([{ path: '/repo/det' }]);
  });
});
