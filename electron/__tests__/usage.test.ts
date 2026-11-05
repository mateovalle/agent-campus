import { describe, expect, it } from 'vitest';

import type { UsageEntry } from '../usage.js';
import {
  compactEntries,
  retentionStart,
  summarizeEntries,
  USAGE_DELTA_EPOCH_MS,
} from '../usage.js';

/** Mid-month, mid-day, so day and month boundaries are both well away. */
const NOW = new Date(2026, 10, 15, 14, 30);
const at = (d: Date, over: Partial<UsageEntry> = {}): UsageEntry => ({
  t: d.getTime(),
  c: 1,
  d: 1000,
  p: '/repo/one',
  ...over,
});
const daysAgo = (n: number, hour = 12) => new Date(2026, 10, 15 - n, hour, 0);

describe('summarizeEntries', () => {
  it('reports nothing for an empty ledger', () => {
    const s = summarizeEntries([], NOW);
    expect(s.turnCount).toBe(0);
    expect(s.allTimeUsd).toBe(0);
    expect(s.perProject).toEqual([]);
    // The series is always the full window, so the chart has an x axis even
    // before there is anything to draw on it.
    expect(s.days).toHaveLength(14);
  });

  it('separates today, this month and all time', () => {
    const s = summarizeEntries(
      [
        at(daysAgo(0), { c: 2 }),
        at(daysAgo(1), { c: 3 }),
        at(new Date(2026, 9, 20), { c: 10 }), // last month
      ],
      NOW,
    );
    expect(s.todayUsd).toBe(2);
    expect(s.monthUsd).toBe(5);
    expect(s.allTimeUsd).toBe(15);
    expect(s.turnCount).toBe(3);
  });

  it('counts a turn from earlier today, not just the current hour', () => {
    const s = summarizeEntries([at(new Date(2026, 10, 15, 0, 1), { c: 4 })], NOW);
    expect(s.todayUsd).toBe(4);
  });

  it('puts each turn in its own day bucket, today last', () => {
    const s = summarizeEntries([at(daysAgo(0), { c: 1 }), at(daysAgo(13), { c: 7 })], NOW);
    expect(s.days.at(-1)).toMatchObject({ day: '11-15', usd: 1 });
    expect(s.days[0]).toMatchObject({ usd: 7 });
  });

  it('leaves anything older than the window out of the series but not out of the total', () => {
    const s = summarizeEntries([at(daysAgo(40), { c: 9 })], NOW);
    expect(s.days.every((d) => d.usd === 0)).toBe(true);
    expect(s.allTimeUsd).toBe(9);
  });

  it('splits spend by project, this month and all time', () => {
    const s = summarizeEntries(
      [
        at(daysAgo(0), { p: '/repo/one', c: 1 }),
        at(daysAgo(0), { p: '/repo/two', c: 5 }),
        at(new Date(2026, 9, 1), { p: '/repo/one', c: 100 }),
      ],
      NOW,
    );
    // Sorted by THIS MONTH: the project with the big historical bill does not
    // get to sit at the top of a list about now.
    expect(s.perProject.map((p) => [p.folder, p.monthUsd, p.allTimeUsd])).toEqual([
      ['two', 5, 5],
      ['one', 1, 101],
    ]);
  });

  it('reports today per workspace, for the office label plates', () => {
    const s = summarizeEntries(
      [at(daysAgo(0), { p: '/repo/one', c: 1 }), at(daysAgo(0), { p: '/repo/one', c: 2 })],
      NOW,
    );
    expect(s.todayByWorkspace).toEqual({ '/repo/one': 3 });
  });

  it('keeps at most ten projects, the ten that cost the most this month', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      at(daysAgo(0), { p: `/repo/${i}`, c: i + 1 }),
    );
    const s = summarizeEntries(many, NOW);
    expect(s.perProject).toHaveLength(10);
    expect(s.perProject[0].folder).toBe('14');
    expect(s.perProject.map((p) => p.monthUsd)).toEqual([15, 14, 13, 12, 11, 10, 9, 8, 7, 6]);
  });

  it('does not mutate the entries it is given', () => {
    const list = [at(daysAgo(0))];
    const copy = structuredClone(list);
    summarizeEntries(list, NOW);
    expect(list).toEqual(copy);
  });
});

describe('retentionStart', () => {
  it('takes the month boundary when it reaches further back', () => {
    // Late in the month, the month start is older than a 14-day series.
    expect(retentionStart(new Date(2026, 10, 28, 9, 0))).toBe(new Date(2026, 10, 1).getTime());
  });

  it('takes the series boundary when THAT reaches further back', () => {
    // On the 2nd, the series reaches into last month and the month start
    // would throw away days the chart still has to draw.
    expect(retentionStart(new Date(2026, 10, 2, 9, 0))).toBe(new Date(2026, 9, 20).getTime());
  });
});

describe('the 14-day series across a clock change', () => {
  // A local day is 23 or 25 hours long twice a year, so `- n * 86_400_000`
  // is not "n days ago". It used to shift every bucket by an hour and drop a
  // date from the axis entirely. These assertions hold in EVERY timezone:
  // where there is no DST they are simply never stressed.
  const axis = (now: Date) => summarizeEntries([], now).days.map((d) => d.day);

  it('always names fourteen distinct consecutive days', () => {
    for (const now of [
      new Date(2026, 2, 15, 14, 0), // US spring forward was Mar 8
      new Date(2026, 10, 5, 14, 0), // US fall back was Nov 1
      new Date(2026, 9, 30, 14, 0), // EU change was Oct 25
      new Date(2026, 3, 8, 14, 0), // southern-hemisphere changes
      new Date(2027, 0, 5, 14, 0), // across a year boundary
    ]) {
      const days = axis(now);
      expect(days).toHaveLength(14);
      expect(new Set(days).size).toBe(14);
    }
  });

  it('puts a turn in the column for the day it happened', () => {
    const now = new Date(2026, 2, 15, 14, 0);
    const at = (d: Date, c: number) => ({ t: d.getTime(), c, d: 0, p: '/r' });
    const s = summarizeEntries(
      [at(new Date(2026, 2, 7, 12, 0), 2), at(new Date(2026, 2, 8, 12, 0), 5)],
      now,
    );
    expect(s.days.find((d) => d.usd === 2)?.day).toBe('03-07');
    expect(s.days.find((d) => d.usd === 5)?.day).toBe('03-08');
  });

  it('counts a turn just after local midnight as that day, not the one before', () => {
    const now = new Date(2026, 10, 5, 14, 0);
    const justAfterMidnight = new Date(2026, 10, 1, 0, 30);
    const s = summarizeEntries([{ t: justAfterMidnight.getTime(), c: 7, d: 0, p: '/r' }], now);
    expect(s.days.find((d) => d.usd === 7)?.day).toBe('11-01');
  });
});

describe('compactEntries', () => {
  it('leaves a ledger inside the window completely alone', () => {
    const list = [at(daysAgo(0)), at(daysAgo(3)), at(daysAgo(10))];
    expect(compactEntries(list, NOW)).toEqual(list);
  });

  it('collapses older entries into one carry row per project', () => {
    const old1 = at(daysAgo(40), { c: 2, d: 100, p: '/repo/one' });
    const old2 = at(daysAgo(50), { c: 3, d: 200, p: '/repo/one' });
    const other = at(daysAgo(60), { c: 5, d: 300, p: '/repo/two' });
    const recent = at(daysAgo(1), { c: 7 });

    const out = compactEntries([old1, old2, other, recent], NOW);

    expect(out).toHaveLength(3);
    expect(out.filter((e) => e.p === '/repo/one' && e.n === 2)).toEqual([
      // Stamped with the OLDEST turn it stands for, not with the boundary:
      // that is what keeps allTimeSince honest about the coverage.
      { t: old2.t, c: 5, d: 300, p: '/repo/one', n: 2 },
    ]);
    expect(out.at(-1)).toEqual(recent);
  });

  it('keeps every total the summary reports exactly', () => {
    // The whole point: a user's all-time figure must not move because the
    // file was folded up behind their back.
    const list = [
      at(daysAgo(0), { c: 1 }),
      at(daysAgo(5), { c: 2 }),
      at(daysAgo(20), { c: 4, p: '/repo/two' }),
      at(daysAgo(40), { c: 8 }),
      at(daysAgo(60), { c: 16, p: '/repo/two' }),
    ];
    const before = summarizeEntries(list, NOW);
    const after = summarizeEntries(compactEntries(list, NOW), NOW);

    expect(after.allTimeUsd).toBe(before.allTimeUsd);
    expect(after.monthUsd).toBe(before.monthUsd);
    expect(after.todayUsd).toBe(before.todayUsd);
    expect(after.turnCount).toBe(before.turnCount);
    expect(after.days).toEqual(before.days);
    expect(after.perProject).toEqual(before.perProject);
  });

  it('is idempotent, since it runs on every load', () => {
    const list = [at(daysAgo(0)), at(daysAgo(40)), at(daysAgo(70), { p: '/repo/two' })];
    const once = compactEntries(list, NOW);
    expect(compactEntries(once, NOW)).toEqual(once);
  });

  it('never leaves a carry row inside a window it does not belong to', () => {
    const out = compactEntries([at(daysAgo(40), { c: 9 })], NOW);
    const carry = out[0];
    expect(carry.t).toBeLessThan(retentionStart(NOW));
    expect(carry.t).toBe(daysAgo(40).getTime());
    const s = summarizeEntries(out, NOW);
    expect(s.monthUsd).toBe(0);
    expect(s.todayUsd).toBe(0);
    expect(s.days.every((d) => d.usd === 0)).toBe(true);
    expect(s.allTimeUsd).toBe(9);
  });

  it('drops the pre-delta entries instead of carrying them', () => {
    // They hold session RUNNING TOTALS, so carrying them would preserve a
    // figure inflated by roughly an order of magnitude forever.
    const legacy = { t: USAGE_DELTA_EPOCH_MS - 1, c: 21, d: 10, p: '/repo/one' };
    const out = compactEntries([legacy, at(daysAgo(1), { c: 2 })], NOW);
    expect(out).toHaveLength(1);
    expect(summarizeEntries(out, NOW).allTimeUsd).toBe(2);
  });
});

describe('allTimeSince', () => {
  it('still reaches back past a fold', () => {
    // The bug this guards: a carry stamped at the retention boundary makes a
    // ledger that goes back to September start claiming October.
    const oldest = daysAgo(60);
    const folded = compactEntries([at(oldest), at(daysAgo(50)), at(daysAgo(1))], NOW);
    expect(summarizeEntries(folded, NOW).allTimeSince).toBe(oldest.getTime());
  });

  it('reports the oldest turn the figure actually covers', () => {
    const oldest = daysAgo(30);
    const s = summarizeEntries([at(oldest), at(daysAgo(1))], NOW);
    expect(s.allTimeSince).toBe(oldest.getTime());
  });

  it('is absent for an empty ledger', () => {
    expect(summarizeEntries([], NOW).allTimeSince).toBeUndefined();
  });
});
