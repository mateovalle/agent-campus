import { describe, expect, it } from 'vitest';

import { turnJumpTarget } from './turnNavigation.js';

const TOPS = [0, 400, 1800];

describe('turnJumpTarget', () => {
  it('goes to the next turn below', () => {
    expect(turnJumpTarget(TOPS, 0, 'down', 8)).toBe(400);
    expect(turnJumpTarget(TOPS, 400, 'down', 8)).toBe(1800);
  });

  it('goes to the nearest turn above', () => {
    expect(turnJumpTarget(TOPS, 1800, 'up', 8)).toBe(400);
    expect(turnJumpTarget(TOPS, 400, 'up', 8)).toBe(0);
  });

  it('answers null at either end', () => {
    expect(turnJumpTarget(TOPS, 1800, 'down', 8)).toBeNull();
    expect(turnJumpTarget(TOPS, 0, 'up', 8)).toBeNull();
    expect(turnJumpTarget([], 0, 'down', 8)).toBeNull();
  });

  it('uses the tolerance so repeated presses advance', () => {
    // Landing exactly on an anchor must not re-select it.
    expect(turnJumpTarget(TOPS, 403, 'down', 8)).toBe(1800);
    expect(turnJumpTarget(TOPS, 397, 'up', 8)).toBe(0);
  });
});

describe('the last turn, where scrollTop clamps', () => {
  // An element cannot scroll past scrollHeight - clientHeight. A target
  // beyond it never arrives, so the premise "after a jump the anchor sits at
  // scrollTop" fails and the next press picks the same unreachable anchor —
  // ↓ did nothing at all, and the caller's scroll-to-bottom fallback was
  // never reached. Common case: a short answer to a short question.
  const MAX = 1500;

  it('answers null for a target past the furthest it can scroll', () => {
    expect(turnJumpTarget(TOPS, 400, 'down', 8, MAX)).toBeNull();
  });

  it('still jumps to a reachable one', () => {
    expect(turnJumpTarget(TOPS, 0, 'down', 8, MAX)).toBe(400);
  });

  it('is unchanged when the caller does not say', () => {
    expect(turnJumpTarget(TOPS, 400, 'down', 8)).toBe(1800);
  });

  it('does not affect going up, which cannot overshoot', () => {
    expect(turnJumpTarget(TOPS, 1800, 'up', 8, MAX)).toBe(400);
  });

  it('treats a target exactly at the limit as reachable', () => {
    expect(turnJumpTarget([0, 1500], 0, 'down', 8, 1500)).toBe(1500);
  });
});
