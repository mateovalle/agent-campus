import { describe, expect, it } from 'vitest';

import { isRealUserPrompt, turnCostFromRunningTotal } from '../chatAgent.js';

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

describe('isRealUserPrompt', () => {
  const toolResult = {
    message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
  };

  it('accepts what a person typed', () => {
    expect(isRealUserPrompt({ message: { content: 'add a field' } })).toBe(true);
    expect(isRealUserPrompt({ message: { content: [{ type: 'text', text: 'hi' }] } })).toBe(true);
    expect(isRealUserPrompt({ message: { content: [{ type: 'image', source: {} }] } })).toBe(true);
  });

  it('rejects a tool_result carrier', () => {
    // The bug this exists for: these are `user` records with their own uuid,
    // so emitting it overwrote the prompt's — and "Undo to here" then
    // rewound to the checkpoint AFTER that prompt's tool had already run,
    // reverting the NEXT turn's edits instead.
    expect(isRealUserPrompt(toolResult)).toBe(false);
    expect(
      isRealUserPrompt({
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'a', content: '1' },
            { type: 'tool_result', tool_use_id: 'b', content: '2' },
          ],
        },
      }),
    ).toBe(false);
  });

  it('honours the SDK marker when it is there', () => {
    expect(isRealUserPrompt({ isSynthetic: true, message: { content: 'looks real' } })).toBe(false);
  });

  it('does not depend on that marker, since it is optional', () => {
    expect(isRealUserPrompt({ ...toolResult, isSynthetic: undefined })).toBe(false);
  });

  it('accepts a prompt sent alongside a tool result', () => {
    // Mixed content is still something the person said.
    expect(
      isRealUserPrompt({
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'a', content: '1' },
            { type: 'text', text: 'and also rename it' },
          ],
        },
      }),
    ).toBe(true);
  });

  it('anchors nothing on an empty or malformed record', () => {
    expect(isRealUserPrompt({ message: { content: '' } })).toBe(false);
    expect(isRealUserPrompt({ message: { content: [] } })).toBe(false);
    expect(isRealUserPrompt({ message: {} })).toBe(false);
    expect(isRealUserPrompt({})).toBe(false);
  });
});
