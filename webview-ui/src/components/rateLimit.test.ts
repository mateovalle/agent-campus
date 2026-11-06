import { describe, expect, it } from 'vitest';

import { rateLimitText, resetsAtMs } from './rateLimit.js';

const NOW = new Date('2026-11-04T12:00:00Z');
/** Deterministic, so the assertions are about the text and not the locale. */
const at = (d: Date) => d.toISOString().slice(11, 16);

describe('resetsAtMs', () => {
  it('reads a seconds timestamp as seconds', () => {
    expect(resetsAtMs(1_762_257_600)).toBe(1_762_257_600_000);
  });

  it('leaves a milliseconds timestamp alone', () => {
    expect(resetsAtMs(1_762_257_600_000)).toBe(1_762_257_600_000);
  });

  it('answers null for nothing, zero or nonsense', () => {
    // Guessing the unit wrong by 1000 puts the reset in 1970 or the year
    // 56000, which is worse than showing no time at all.
    expect(resetsAtMs(undefined)).toBeNull();
    expect(resetsAtMs(0)).toBeNull();
    expect(resetsAtMs(Number.NaN)).toBeNull();
  });
});

describe('rateLimitText', () => {
  it('says nothing at all for a healthy account', () => {
    // The strip appearing is itself the signal; one that is always up is noise.
    expect(rateLimitText({ status: 'allowed', utilization: 0.12 }, NOW, at)).toBeNull();
  });

  it('speaks up once utilization crosses the threshold, even while allowed', () => {
    const text = rateLimitText(
      { status: 'allowed', utilization: 0.82, window: 'five_hour' },
      NOW,
      at,
    );
    expect(text).toContain('5h window 82% used');
  });

  it('speaks up when the CLI itself warns, whatever the number', () => {
    expect(rateLimitText({ status: 'allowed_warning', utilization: 0.3 }, NOW, at)).toContain(
      '30% used',
    );
  });

  it('leads with the refusal, not the percentage', () => {
    const text = rateLimitText(
      { status: 'rejected', utilization: 1, resetsAt: 1_762_257_600 },
      NOW,
      at,
    );
    expect(text?.startsWith('Out of usage')).toBe(true);
  });

  it('includes the reset time when it is still ahead', () => {
    const inAnHour = Math.floor(NOW.getTime() / 1000) + 3600;
    expect(rateLimitText({ status: 'rejected', resetsAt: inAnHour }, NOW, at)).toBe(
      'Out of usage · resets 13:00',
    );
  });

  it('omits a reset time that has already passed', () => {
    // The window rolled over and nobody has said so yet; promising a reset
    // at a time gone by is worse than promising none.
    const anHourAgo = Math.floor(NOW.getTime() / 1000) - 3600;
    expect(rateLimitText({ status: 'rejected', resetsAt: anHourAgo }, NOW, at)).toBe(
      'Out of usage',
    );
  });

  it('names the seven-day window too', () => {
    expect(
      rateLimitText({ status: 'allowed_warning', utilization: 0.9, window: 'seven_day' }, NOW, at),
    ).toContain('7-day window');
  });
});

describe('a warning with no number', () => {
  const NOW = new Date('2026-11-05T12:00:00Z');

  it('does not claim 0% used', () => {
    // `utilization` is optional in the SDK. `pct ?? 0` turned "you are near
    // a limit" into a strip asserting the opposite of why it is on screen.
    const text = rateLimitText({ status: 'allowed_warning', window: 'five_hour' }, NOW);
    expect(text).not.toContain('0%');
    expect(text).toContain('Close to the 5h window limit');
  });

  it('still shows the number when there is one', () => {
    expect(
      rateLimitText({ status: 'allowed_warning', window: 'five_hour', utilization: 0.87 }, NOW),
    ).toContain('87% used');
  });

  it('a refusal with no number still reads as a refusal', () => {
    expect(rateLimitText({ status: 'rejected' }, NOW)).toBe('Out of usage');
  });
});
