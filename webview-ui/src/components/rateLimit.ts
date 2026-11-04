/**
 * What to say about the account's rate-limit window, and whether to say
 * anything at all.
 *
 * Pure, because two of the judgements here are easy to get quietly wrong: the
 * unit of `resetsAt`, and the rule for when a limit is worth a user's
 * attention. The office's whole discipline is that something on screen means
 * something for you — a strip that is always up saying "12% used" is the
 * opposite of that.
 */

import { RATE_LIMIT_WARN_PCT } from '../constants.js';

export interface RateLimitInfo {
  status: 'allowed' | 'allowed_warning' | 'rejected';
  /** 0..1 of the window consumed, when the CLI reports it. */
  utilization?: number;
  /** When the window rolls over. Unit is not documented — see below. */
  resetsAt?: number;
  /** five_hour, seven_day, … */
  window?: string;
}

/**
 * `resetsAt` as epoch milliseconds.
 *
 * The SDK types it as a bare number with no unit. Anything below ~1e12 cannot
 * be a plausible millisecond timestamp (that boundary passed in 2001), so a
 * value under it is seconds. Guessing wrong by a factor of 1000 puts the
 * reset time in 1970 or in the year 56000, which is worse than showing none.
 */
export function resetsAtMs(resetsAt: number | undefined): number | null {
  if (resetsAt === undefined || !Number.isFinite(resetsAt) || resetsAt <= 0) return null;
  return resetsAt < 1e12 ? resetsAt * 1000 : resetsAt;
}

/** 'five_hour' → '5h window'; anything unrecognised just says 'usage'. */
function windowLabel(window: string | undefined): string {
  if (window === 'five_hour') return '5h window';
  if (window?.startsWith('seven_day')) return '7-day window';
  return 'usage';
}

/**
 * The line to show, or null to show nothing.
 *
 * Nothing is the common case on purpose. A healthy account says 'allowed' and
 * the strip stays away; it appears when the CLI itself starts warning, or
 * when utilization crosses the threshold, or when requests are being refused.
 */
export function rateLimitText(
  info: RateLimitInfo,
  now: Date = new Date(),
  formatTime: (d: Date) => string = (d) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
): string | null {
  const pct = info.utilization !== undefined ? Math.round(info.utilization * 100) : null;
  const warnByUsage = pct !== null && pct >= RATE_LIMIT_WARN_PCT;
  if (info.status === 'allowed' && !warnByUsage) return null;

  const ms = resetsAtMs(info.resetsAt);
  // A reset already in the past describes a window that has rolled over, so
  // promising it "resets at" a time gone by would be worse than saying when.
  const resets = ms !== null && ms > now.getTime() ? ` · resets ${formatTime(new Date(ms))}` : '';

  if (info.status === 'rejected') return `Out of usage${resets}`;
  return `${windowLabel(info.window)} ${pct ?? 0}% used${resets}`;
}
