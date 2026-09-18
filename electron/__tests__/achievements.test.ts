import { describe, expect, it } from 'vitest';

import type { AchievementCounters } from '../achievements.js';
import { ACHIEVEMENT_DEFS, emptyCounters, newlyUnlocked } from '../achievements.js';

const counters = (over: Partial<AchievementCounters> = {}): AchievementCounters => ({
  ...emptyCounters(),
  ...over,
});

describe('newlyUnlocked', () => {
  it('unlocks nothing for a fresh install', () => {
    expect(newlyUnlocked(counters(), {}, 1)).toEqual([]);
  });

  it('unlocks a milestone once its counter is reached', () => {
    const fresh = newlyUnlocked(counters({ agentsSpawned: 1 }), {}, 123);
    expect(fresh.map((a) => a.id)).toEqual(['first-agent']);
    expect(fresh[0].unlockedAt).toBe(123);
  });

  it('never re-unlocks what is already unlocked', () => {
    const c = counters({ agentsSpawned: 1 });
    expect(newlyUnlocked(c, { 'first-agent': 99 }, 123)).toEqual([]);
  });

  it('unlocks every milestone a jump past several thresholds satisfies', () => {
    const ids = newlyUnlocked(counters({ tasksCompleted: 50 }), {}, 1).map((a) => a.id);
    expect(ids).toEqual(['first-done', 'ten-done', 'fifty-done']);
  });

  it('counts turn milestones cumulatively', () => {
    expect(newlyUnlocked(counters({ turns: 100 }), {}, 1).map((a) => a.id)).toEqual(['century']);
    expect(newlyUnlocked(counters({ turns: 1000 }), {}, 1).map((a) => a.id)).toEqual([
      'century',
      'veteran',
    ]);
  });

  it('unlocks the schedule and night-shift milestones from their own counters', () => {
    expect(newlyUnlocked(counters({ scheduledRuns: 1 }), {}, 1).map((a) => a.id)).toEqual([
      'automator',
    ]);
    expect(newlyUnlocked(counters({ nightTurns: 1 }), {}, 1).map((a) => a.id)).toEqual([
      'night-shift',
    ]);
  });

  it('needs three distinct roles for full-team', () => {
    expect(newlyUnlocked(counters({ rolesUsed: ['qa', 'build'] }), {}, 1)).toEqual([]);
    expect(
      newlyUnlocked(counters({ rolesUsed: ['qa', 'build', 'security'] }), {}, 1).map((a) => a.id),
    ).toEqual(['full-team']);
  });

  it('does not mutate the counters or the unlocked map it is given', () => {
    const c = counters({ agentsSpawned: 1 });
    const unlocked: Record<string, number> = {};
    newlyUnlocked(c, unlocked, 1);
    expect(unlocked).toEqual({});
    expect(c).toEqual(counters({ agentsSpawned: 1 }));
  });

  it('gives every definition a unique id, a name and a description', () => {
    const ids = ACHIEVEMENT_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of ACHIEVEMENT_DEFS) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
    }
  });
});
