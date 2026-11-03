import { describe, expect, it } from 'vitest';

import type { UsageEntry } from '../usage.js';
import { summarizeEntries } from '../usage.js';

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
