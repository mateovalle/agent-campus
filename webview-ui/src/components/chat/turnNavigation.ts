/**
 * Turn-by-turn navigation for the chat log.
 *
 * Long turns are mostly tool cards, so finding "what did I ask before this"
 * means scrolling past everything the agent did. Each of YOUR messages starts
 * a turn, so they are the index of the conversation: jumping between them
 * lands the prompt at the top with its answer below it.
 */

/**
 * Scroll position of the turn to jump to, or null when there is none left in
 * that direction (the caller then stays put, or goes to the very bottom).
 *
 * `tolerancePx` is what makes repeated presses work: after a jump the anchor
 * sits at scrollTop, so without a margin "up" would keep selecting the anchor
 * you just landed on.
 */
export function turnJumpTarget(
  anchorTops: readonly number[],
  scrollTop: number,
  direction: 'up' | 'down',
  tolerancePx: number,
): number | null {
  if (direction === 'up') {
    let best: number | null = null;
    for (const top of anchorTops) {
      if (top < scrollTop - tolerancePx) best = top;
    }
    return best;
  }
  for (const top of anchorTops) {
    if (top > scrollTop + tolerancePx) return top;
  }
  return null;
}
