import { describe, expect, it } from 'vitest';

import type { ScheduleEntry } from '../../shared/protocol.js';
import { isDue } from '../schedules.js';

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

  it('disabled and malformed entries never fire', () => {
    expect(isDue(entry({ enabled: false, time: '9:00' }), WED_0900)).toBe(false);
    expect(isDue(entry({ kind: 'daily' }), WED_0900)).toBe(false); // no time
    expect(isDue(entry({ kind: 'daily', time: '99:99' }), WED_0900)).toBe(false);
    expect(isDue(entry({ kind: 'interval' }), WED_0900)).toBe(false); // no everyMinutes
  });
});
