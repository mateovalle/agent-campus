import * as fs from 'fs';
import { describe, expect, it } from 'vitest';

import type { AchievementCounters } from '../achievements.js';
import {
  ACHIEVEMENT_DEFS,
  ACHIEVEMENT_EVENTS,
  applyEvent,
  emptyCounters,
  newlyUnlocked,
} from '../achievements.js';

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

describe('applyEvent', () => {
  it('leaves at least one counter changed for every event', () => {
    // The point is the WALK: an event nobody counts is the bug this suite
    // exists for, and a new member of the list has to earn its arithmetic.
    for (const event of ACHIEVEMENT_EVENTS) {
      const before = counters();
      const after = applyEvent(before, event, { concurrentAgents: 2, workspaces: 2, role: 'qa' });
      expect(after, event).not.toEqual(before);
    }
  });

  it('does not mutate the counters it is given', () => {
    const before = counters();
    applyEvent(before, 'agentSpawned', { concurrentAgents: 3, role: 'qa' });
    expect(before).toEqual(counters());
  });

  it('counts registered workspaces, and three of them unlock the campus', () => {
    let c = applyEvent(counters(), 'workspaceAdded', { workspaces: 1 });
    expect(c.workspaces).toBe(1);
    expect(newlyUnlocked(c, {}, 1)).toEqual([]);

    c = applyEvent(c, 'workspaceAdded', { workspaces: 3 });
    expect(newlyUnlocked(c, {}, 1).map((a) => a.id)).toEqual(['campus']);
  });

  it('takes the highest workspace count, since the host reports a total', () => {
    // The detail is the size of the registry, not a delta: touching a
    // workspace that is already registered must not inflate the count, and a
    // removed workspace must not retire a milestone already earned.
    let c = applyEvent(counters(), 'workspaceAdded', { workspaces: 4 });
    c = applyEvent(c, 'workspaceAdded', { workspaces: 4 });
    c = applyEvent(c, 'workspaceAdded', { workspaces: 2 });
    expect(c.workspaces).toBe(4);
  });

  it('records a turn against its own day, and before 5am as a night turn', () => {
    const night = applyEvent(counters(), 'turnCompleted', {}, new Date(2026, 10, 3, 3, 30));
    expect(night.turns).toBe(1);
    expect(night.nightTurns).toBe(1);
    expect(night.activeDays).toHaveLength(1);

    const sameDayAgain = applyEvent(night, 'turnCompleted', {}, new Date(2026, 10, 3, 14, 0));
    expect(sameDayAgain.turns).toBe(2);
    expect(sameDayAgain.nightTurns).toBe(1);
    expect(sameDayAgain.activeDays).toEqual(night.activeDays);
  });

  it('collects distinct roles and ignores a repeat', () => {
    let c = applyEvent(counters(), 'agentSpawned', { role: 'qa' });
    c = applyEvent(c, 'agentSpawned', { role: 'qa' });
    c = applyEvent(c, 'agentSpawned', { role: 'security' });
    expect(c.rolesUsed).toEqual(['qa', 'security']);
    expect(c.agentsSpawned).toBe(3);
  });
});

describe('the host fires every event', () => {
  // A counter with no producer cannot be caught by any amount of unit testing
  // of this module: `workspaceAdded` was handled here and fired nowhere, so
  // 'Register 3 workspaces' was unreachable while every test passed. The only
  // way to catch that class is to go and look at the caller.
  const host = fs.readFileSync(new URL('../main.ts', import.meta.url), 'utf-8');

  it.each(ACHIEVEMENT_EVENTS)('fires %s somewhere in the host', (event) => {
    expect(host).toContain(`trackAchievement('${event}'`);
  });
});
