import { describe, expect, it } from 'vitest';

import { rateLimitStillBlocks, resetsAtMs } from '../rateLimit.js';

describe('resetsAtMs', () => {
  it('reads seconds and milliseconds alike', () => {
    expect(resetsAtMs(1_762_257_600)).toBe(1_762_257_600_000);
    expect(resetsAtMs(1_762_257_600_000)).toBe(1_762_257_600_000);
  });

  it('answers null rather than a date in 1970 or the year 56000', () => {
    expect(resetsAtMs(undefined)).toBeNull();
    expect(resetsAtMs(0)).toBeNull();
    expect(resetsAtMs(-1)).toBeNull();
    expect(resetsAtMs(Number.NaN)).toBeNull();
    expect(resetsAtMs(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('rateLimitStillBlocks', () => {
  const NOW = 1_800_000_000_000;

  it('lets everything through when the account is fine', () => {
    expect(rateLimitStillBlocks(null, NOW)).toBe(false);
    expect(rateLimitStillBlocks({ status: 'allowed' }, NOW)).toBe(false);
    expect(rateLimitStillBlocks({ status: 'allowed_warning' }, NOW)).toBe(false);
  });

  it('holds unattended work back while the account is refused', () => {
    expect(rateLimitStillBlocks({ status: 'rejected', resetsAt: NOW + 60_000 }, NOW)).toBe(true);
  });

  it('stops holding once the window has rolled over', () => {
    // Nothing re-reports a recovery, so a stale rejection would strand every
    // schedule until the user ran an agent by hand.
    expect(rateLimitStillBlocks({ status: 'rejected', resetsAt: NOW - 60_000 }, NOW)).toBe(false);
  });

  it('does not treat a SECONDS reset as the year 56000', () => {
    // The bug this exists for: main.ts multiplied by 1000 unconditionally.
    // Fed milliseconds, that lands ~57000 AD and defers every run forever.
    const inThePastSeconds = Math.floor((NOW - 60_000) / 1000);
    expect(rateLimitStillBlocks({ status: 'rejected', resetsAt: inThePastSeconds }, NOW)).toBe(
      false,
    );
    const inMilliseconds = NOW - 60_000;
    expect(rateLimitStillBlocks({ status: 'rejected', resetsAt: inMilliseconds }, NOW)).toBe(false);
  });

  it('keeps blocking when there is no reset time to expire against', () => {
    // The safe direction for something that spends money.
    expect(rateLimitStillBlocks({ status: 'rejected' }, NOW)).toBe(true);
  });
});
