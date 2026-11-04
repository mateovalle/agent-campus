/**
 * How full an agent's context window is.
 *
 * The SDK does not hand over a percentage: `getContextUsage` answers with
 * CATEGORIES, each carrying tokens and a `kind` — and the kind is the whole
 * trick. 'used' is content in the window, 'free' is what is left of it,
 * 'buffer' is the compaction reserve (spoken for, so not free), and
 * 'deferred' rows are tool schemas held OUT of the window entirely: counting
 * those would inflate both halves of the fraction and report a window fuller
 * than it is.
 *
 * The SDK's own note is worth repeating: classify on `kind`, never on the
 * English name.
 */

/** One row of the SDK's context breakdown, reduced to what a gauge needs. */
export interface ContextCategory {
  tokens: number;
  kind: 'used' | 'free' | 'buffer' | 'deferred';
}

export interface ContextSummary {
  usedTokens: number;
  /** The window being measured against: used + free + buffer. */
  totalTokens: number;
  /** 0–100, rounded, and clamped at 100 for a window already over. */
  percentage: number;
}

/**
 * Categories → one fraction.
 *
 * Returns null when there is nothing to measure against: a session that has
 * not run a turn yet reports no window, and a gauge reading 0% would claim
 * to know something it does not.
 */
export function summarizeContextUsage(categories: ContextCategory[]): ContextSummary | null {
  let usedTokens = 0;
  let windowTokens = 0;
  for (const category of categories) {
    const tokens = Number.isFinite(category.tokens) ? Math.max(0, category.tokens) : 0;
    // 'buffer' counts toward the window but not toward what is used: it is
    // reserved for the compaction that has not happened yet.
    if (category.kind === 'used') {
      usedTokens += tokens;
      windowTokens += tokens;
    } else if (category.kind === 'free' || category.kind === 'buffer') {
      windowTokens += tokens;
    }
  }
  if (windowTokens <= 0) return null;
  return {
    usedTokens,
    totalTokens: windowTokens,
    percentage: Math.min(100, Math.round((usedTokens / windowTokens) * 100)),
  };
}
