import { describe, expect, it } from 'vitest';

import type { ScheduleEntry } from '../../shared/protocol.js';
import { isDue, missedOccurrences, parseTime, scheduleProblem } from '../schedules.js';

function entry(partial: Partial<ScheduleEntry>): ScheduleEntry {
  return {
    id: 's1',
    workspacePath: '/w',
    prompt: 'do the thing',
    kind: 'daily',
    enabled: true,
    ...partial,
  };
}

// Wednesday 2026-09-16, 09:00:15 local
const WED_0900 = new Date(2026, 8, 16, 9, 0, 15);

describe('isDue', () => {
  it('daily fires inside the scheduled minute, once', () => {
    const s = entry({ kind: 'daily', time: '9:00' });
    expect(isDue(s, WED_0900)).toBe(true);
    expect(isDue(s, new Date(2026, 8, 16, 8, 59, 45))).toBe(false);
    expect(isDue(s, new Date(2026, 8, 16, 9, 1, 5))).toBe(false);
    // Already ran this occurrence
    expect(isDue({ ...s, lastRunAtMs: WED_0900.getTime() }, WED_0900)).toBe(false);
    // Ran yesterday — due again today
    expect(isDue({ ...s, lastRunAtMs: new Date(2026, 8, 15, 9, 0, 5).getTime() }, WED_0900)).toBe(
      true,
    );
  });

  it('weekly gates on day of week', () => {
    const s = entry({ kind: 'weekly', time: '9:00', days: [3] }); // Wednesday
    expect(isDue(s, WED_0900)).toBe(true);
    expect(isDue({ ...s, days: [1] }, WED_0900)).toBe(false);
  });

  it('interval fires when enough time has elapsed', () => {
    const s = entry({ kind: 'interval', everyMinutes: 30 });
    const now = WED_0900.getTime();
    expect(isDue({ ...s, lastRunAtMs: now - 31 * 60_000 }, WED_0900)).toBe(true);
    expect(isDue({ ...s, lastRunAtMs: now - 10 * 60_000 }, WED_0900)).toBe(false);
  });

  it('counts daily occurrences missed since the last run', () => {
    // Last ran Monday 09:00:10; now Wednesday 10:30 → missed Tue 9:00 and Wed 9:00
    const s = entry({
      kind: 'daily',
      time: '9:00',
      lastRunAtMs: new Date(2026, 8, 14, 9, 0, 10).getTime(),
    });
    const m = missedOccurrences(s, new Date(2026, 8, 16, 10, 30));
    expect(m).toEqual({
      count: 2,
      lastAtMs: new Date(2026, 8, 16, 9, 0, 0).getTime(),
    });
  });

  it('missed excludes the current live minute and already-run occurrences', () => {
    const s = entry({
      kind: 'daily',
      time: '9:00',
      lastRunAtMs: new Date(2026, 8, 15, 9, 0, 5).getTime(),
    });
    // 09:00:15 same day as next occurrence — inside the live minute, not "missed"
    expect(missedOccurrences(s, WED_0900)).toBeNull();
  });

  it('missed is capped to the lookback window and needs an anchor', () => {
    const now = new Date(2026, 8, 16, 12, 0);
    const monthAgo = entry({
      kind: 'daily',
      time: '9:00',
      lastRunAtMs: new Date(2026, 7, 10).getTime(),
    });
    // 7-day window → at most 7 occurrences reported, not ~37
    expect(missedOccurrences(monthAgo, now)?.count).toBe(7);
    // Legacy entry: no lastRunAtMs, no createdAtMs → never offered
    expect(missedOccurrences(entry({ kind: 'daily', time: '9:00' }), now)).toBeNull();
    // Intervals self-catch-up — excluded from the missed list
    expect(
      missedOccurrences(entry({ kind: 'interval', everyMinutes: 30, lastRunAtMs: 1 }), now),
    ).toBeNull();
  });

  it('weekly missed respects the day filter', () => {
    const s = entry({
      kind: 'weekly',
      time: '9:00',
      days: [1], // Mondays
      lastRunAtMs: new Date(2026, 8, 13, 12, 0).getTime(), // Sunday noon
    });
    const m = missedOccurrences(s, new Date(2026, 8, 16, 12, 0)); // Wednesday
    expect(m).toEqual({ count: 1, lastAtMs: new Date(2026, 8, 14, 9, 0).getTime() });
  });

  it('disabled and malformed entries never fire', () => {
    expect(isDue(entry({ enabled: false, time: '9:00' }), WED_0900)).toBe(false);
    expect(isDue(entry({ kind: 'daily' }), WED_0900)).toBe(false); // no time
    expect(isDue(entry({ kind: 'daily', time: '99:99' }), WED_0900)).toBe(false);
    expect(isDue(entry({ kind: 'interval' }), WED_0900)).toBe(false); // no everyMinutes
  });
});

describe('parseTime', () => {
  it('reads a real time of day', () => {
    expect(parseTime('09:00')).toEqual({ h: 9, m: 0 });
    expect(parseTime('9:05')).toEqual({ h: 9, m: 5 });
    expect(parseTime('23:59')).toEqual({ h: 23, m: 59 });
    expect(parseTime('00:00')).toEqual({ h: 0, m: 0 });
  });

  it('refuses hours and minutes that do not exist', () => {
    for (const bad of ['24:00', '09:60', '30:00', '99:99']) {
      expect(parseTime(bad)).toBeNull();
    }
  });

  it('refuses things that are not times', () => {
    for (const bad of ['', 'midnight', '9', '9:5', '09:00:00', ' 09:00']) {
      expect(parseTime(bad)).toBeNull();
    }
  });
});

describe('scheduleProblem', () => {
  it('accepts the three valid shapes', () => {
    expect(scheduleProblem({ kind: 'daily', time: '09:00' })).toBeNull();
    expect(scheduleProblem({ kind: 'weekly', time: '09:00', days: [1, 5] })).toBeNull();
    expect(scheduleProblem({ kind: 'interval', everyMinutes: 30 })).toBeNull();
  });

  it('catches the time that validated everywhere and fired nowhere', () => {
    // 24:00 is a very plausible way for a model to write "midnight". Three
    // separate `/^\d{1,2}:\d{2}$/` checks let it through into a schedule
    // that could never become due and reported itself enabled.
    const why = scheduleProblem({ kind: 'daily', time: '24:00' });
    expect(why).toContain('24:00');
    expect(why).toContain('23:59');
  });

  it('insists a day-of-week schedule names a day', () => {
    expect(scheduleProblem({ kind: 'weekly', time: '09:00', days: [] })).toContain('at least one');
    expect(scheduleProblem({ kind: 'weekly', time: '09:00' })).toContain('at least one');
    expect(scheduleProblem({ kind: 'weekly', time: '09:00', days: [7] })).toContain('0 (Sunday)');
  });

  it('insists an interval is a whole number of minutes', () => {
    // These all answered isDue:false forever rather than storming, so the
    // cost was silence — the same class as the 24:00 case.
    for (const every of [0, -5, 0.5]) {
      expect(scheduleProblem({ kind: 'interval', everyMinutes: every })).toContain('1 or more');
    }
    expect(scheduleProblem({ kind: 'interval' })).toContain('1 or more');
  });

  it('does not ask a time-of-day schedule for everyMinutes, or vice versa', () => {
    expect(scheduleProblem({ kind: 'daily', time: '09:00', everyMinutes: undefined })).toBeNull();
    expect(scheduleProblem({ kind: 'interval', everyMinutes: 5, time: undefined })).toBeNull();
  });
});
