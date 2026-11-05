/**
 * Reading the account's rate-limit window.
 *
 * Shared because BOTH hosts of this judgement got to it independently and
 * one of them got it wrong: the webview's banner used the careful version
 * below while `rateLimitBlocksDispatch` in main.ts multiplied by 1000
 * unconditionally. If the CLI ever reports milliseconds, that puts the reset
 * in roughly the year 57000, every scheduled run defers forever, and the
 * comment above it promising not to strand schedules is doing the opposite.
 *
 * One decision, one implementation.
 */

/**
 * `resetsAt` as epoch milliseconds.
 *
 * The SDK types it as a bare number with no unit. Anything below ~1e12
 * cannot be a plausible millisecond timestamp (that boundary passed in
 * 2001), so a value under it is seconds. Guessing wrong by a factor of 1000
 * puts the reset time in 1970 or in the year 56000, which is worse than
 * showing none.
 */
export function resetsAtMs(resetsAt: number | undefined): number | null {
  if (resetsAt === undefined || !Number.isFinite(resetsAt) || resetsAt <= 0) return null;
  return resetsAt < 1e12 ? resetsAt * 1000 : resetsAt;
}

/**
 * Whether a reported rejection should still stop unattended work.
 *
 * A rejection that has outlived its own `resetsAt` is stale: the window
 * rolled over and no session has had reason to say so. Treating it as live
 * would strand every schedule until the user happened to run an agent by
 * hand. With no reset time at all there is nothing to expire against, so it
 * stays in force — the safe direction for something that spends money.
 */
export function rateLimitStillBlocks(
  info: { status: string; resetsAt?: number } | null,
  nowMs: number,
): boolean {
  if (info?.status !== 'rejected') return false;
  const ms = resetsAtMs(info.resetsAt);
  return ms === null || ms > nowMs;
}
