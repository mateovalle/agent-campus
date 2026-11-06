import { describe, expect, it } from 'vitest';

import { summarizeContextUsage } from '../contextUsage.js';

describe('summarizeContextUsage', () => {
  it('measures used against the whole window', () => {
    expect(
      summarizeContextUsage([
        { tokens: 30_000, kind: 'used' },
        { tokens: 70_000, kind: 'free' },
      ]),
    ).toEqual({ usedTokens: 30_000, totalTokens: 100_000, percentage: 30 });
  });

  it('counts the compaction buffer as window, not as used', () => {
    // The buffer is reserved for a compaction that has not happened yet: it
    // is not free, and calling it used would report a fuller window than
    // there is.
    expect(
      summarizeContextUsage([
        { tokens: 40_000, kind: 'used' },
        { tokens: 10_000, kind: 'buffer' },
        { tokens: 50_000, kind: 'free' },
      ]),
    ).toEqual({ usedTokens: 40_000, totalTokens: 100_000, percentage: 40 });
  });

  it('leaves deferred rows out of both halves of the fraction', () => {
    // Deferred tool schemas are held OUT of the window. Counted, they would
    // inflate the numerator and the denominator at once.
    expect(
      summarizeContextUsage([
        { tokens: 30_000, kind: 'used' },
        { tokens: 70_000, kind: 'free' },
        { tokens: 25_000, kind: 'deferred' },
      ]),
    ).toEqual({ usedTokens: 30_000, totalTokens: 100_000, percentage: 30 });
  });

  it('adds up every used row, since the breakdown has several', () => {
    expect(
      summarizeContextUsage([
        { tokens: 10_000, kind: 'used' },
        { tokens: 10_000, kind: 'used' },
        { tokens: 80_000, kind: 'free' },
      ]),
    ).toMatchObject({ usedTokens: 20_000, percentage: 20 });
  });

  it('reads 100% when the window is entirely used', () => {
    // There used to be a Math.min(100, …) here described as clamping an
    // over-full window. It could never fire: windowTokens is the sum that
    // usedTokens is part of, so the ratio cannot exceed 1 — and this test
    // fed exactly 100%, so it demonstrated nothing about clamping either.
    expect(summarizeContextUsage([{ tokens: 120_000, kind: 'used' }])?.percentage).toBe(100);
    expect(
      summarizeContextUsage([
        { tokens: 120_000, kind: 'used' },
        { tokens: 0, kind: 'free' },
      ])?.percentage,
    ).toBe(100);
  });

  it('answers null when there is no window to measure against', () => {
    // A session that has not run a turn reports nothing, and a gauge at 0%
    // would be claiming to know something it does not.
    expect(summarizeContextUsage([])).toBeNull();
    expect(summarizeContextUsage([{ tokens: 0, kind: 'free' }])).toBeNull();
  });

  it('ignores a nonsense count rather than producing NaN', () => {
    expect(
      summarizeContextUsage([
        { tokens: Number.NaN, kind: 'used' },
        { tokens: 100, kind: 'free' },
      ]),
    ).toEqual({ usedTokens: 0, totalTokens: 100, percentage: 0 });
  });
});
