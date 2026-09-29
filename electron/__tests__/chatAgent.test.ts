import { describe, expect, it } from 'vitest';

import { turnCostFromRunningTotal } from '../chatAgent.js';

describe('turnCostFromRunningTotal', () => {
  it('returns the first turn whole', () => {
    expect(turnCostFromRunningTotal(0.4, 0)).toBeCloseTo(0.4);
  });

  it('returns the increment, not the running total', () => {
    expect(turnCostFromRunningTotal(1.5, 0.4)).toBeCloseTo(1.1);
  });

  it('keeps a session ledger equal to its final running total', () => {
    // The bug this guards: summing the raw field turned 3 turns into $6.
    const totals = [1, 2, 3];
    let previous = 0;
    let ledger = 0;
    for (const total of totals) {
      ledger += turnCostFromRunningTotal(total, previous);
      previous = total;
    }
    expect(ledger).toBeCloseTo(3);
  });

  it('treats a drop as a reset (/clear, resumed session) and bills the new total', () => {
    expect(turnCostFromRunningTotal(0.2, 5)).toBeCloseTo(0.2);
  });

  it('charges nothing for a zeroed or unreported total', () => {
    // Crash and startup-error results carry zeroed values.
    expect(turnCostFromRunningTotal(0, 5)).toBe(0);
    expect(turnCostFromRunningTotal(0, 0)).toBe(0);
  });

  it('does not go negative when the total is unchanged', () => {
    expect(turnCostFromRunningTotal(2.5, 2.5)).toBe(0);
  });
});
