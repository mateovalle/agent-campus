/**
 * Persistent per-turn usage tracking for chat agents.
 *
 * Every completed SDK turn appends one JSONL line to
 * ~/.pixel-agents/usage.jsonl; summaries are aggregated on read.
 *
 * Each entry holds THIS TURN's cost — the delta the caller derives from the
 * SDK's running `total_cost_usd`, never that running total itself, which
 * would make the sums here grow quadratically with turns per session.
 *
 * The figures are API-equivalent list pricing ("an estimate, not a billing
 * statement" per the SDK). On a Claude subscription nothing here is charged
 * in dollars at all: usage goes against the plan's rate limits.
 *
 * Entries written before Sep 2026 carry no session id and hold running
 * totals rather than deltas, so historical sums read high.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { ProjectUsage, UsageSummary } from '../shared/protocol.js';
import { DATA_DIR_NAME } from '../src/core/constants.js';

const USAGE_FILE = path.join(os.homedir(), DATA_DIR_NAME, 'usage.jsonl');
const MAX_PROJECTS_IN_SUMMARY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_IN_SERIES = 14;

export interface UsageEntry {
  /** Epoch ms of turn completion. */
  t: number;
  /** This turn's cost in USD (a delta, not a session running total). */
  c: number;
  /** Turn duration in ms. */
  d: number;
  /** Project cwd. */
  p: string;
  /** Session that produced the turn. Absent on entries written before it was recorded. */
  s?: string;
  /**
   * Turns this row stands for. Absent means one — a carry row written by
   * compaction stands for many, and turnCount would otherwise fall off a
   * cliff the first time the ledger is folded up.
   */
  n?: number;
}

/**
 * Entries older than this held SESSION RUNNING TOTALS rather than per-turn
 * deltas (see the module header), so summing them inflates every figure they
 * touch — a 20-turn session at $0.10 a turn reads as $21 instead of $2.
 *
 * They cannot be repaired: a running total can only be un-rolled per session,
 * and these rows predate the session id too. Compaction drops them, which is
 * why the summary reports the date its all-time figure actually starts from
 * rather than quietly showing a smaller number than yesterday.
 */
export const USAGE_DELTA_EPOCH_MS = Date.UTC(2026, 8, 1);

/**
 * The ledger, parsed once.
 *
 * It used to be read and JSON.parsed from disk on every single turn, by every
 * agent, synchronously, on the process that owns every PTY and chat session —
 * so the cost of finishing a turn grew with the user's entire history. The
 * file is append-only and this is the only writer, so memory can simply stay
 * in step with it.
 */
let entries: UsageEntry[] | null = null;

function allEntries(): UsageEntry[] {
  if (entries === null) {
    // Folded on load rather than past some size threshold. The file is
    // append-only with one line per turn and nothing reads an entry older
    // than the windows the summary reports, so a ledger that only shrinks
    // when it has already grown too big is a ledger that grows too big.
    const raw = readEntries();
    const compacted = compactEntries(raw, new Date());
    if (compacted.length !== raw.length) writeEntries(compacted);
    entries = compacted;
  }
  return entries;
}

/**
 * Replaces the ledger with `list`, atomically.
 *
 * Temp file plus rename: this is the one moment the ledger is not
 * append-only, and a crash halfway through a plain overwrite would leave a
 * user with half their spending history and no way to tell.
 */
function writeEntries(list: readonly UsageEntry[]): void {
  const tmp = `${USAGE_FILE}.tmp`;
  try {
    fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
    fs.writeFileSync(tmp, list.map((e) => JSON.stringify(e) + '\n').join(''), 'utf-8');
    fs.renameSync(tmp, USAGE_FILE);
  } catch (err) {
    console.error('[Agent Campus] Failed to compact usage ledger:', err);
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* nothing left to do about it */
    }
  }
}

export function recordTurnUsage(
  cwd: string,
  costUsd: number,
  durationMs: number,
  sessionId?: string,
): void {
  if (!(costUsd > 0) && !(durationMs > 0)) return;
  const entry: UsageEntry = {
    t: Date.now(),
    c: costUsd,
    d: durationMs,
    p: cwd,
    ...(sessionId ? { s: sessionId } : {}),
  };
  // Counted even if the write fails: a read-only home should cost the user
  // today's figure on the next launch, not the one they are looking at.
  allEntries().push(entry);
  try {
    fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
    fs.appendFileSync(USAGE_FILE, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    console.error('[Agent Campus] Failed to record usage:', err);
  }
}

function readEntries(): UsageEntry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(USAGE_FILE, 'utf-8');
  } catch {
    return [];
  }
  const entries: UsageEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as UsageEntry;
      if (typeof e.t === 'number' && typeof e.c === 'number' && typeof e.p === 'string') {
        entries.push(e);
      }
    } catch {
      /* skip malformed line */
    }
  }
  return entries;
}

/**
 * The oldest instant whose entries must survive verbatim.
 *
 * Everything the summary reports on a per-entry basis comes from one of two
 * windows — the current month, and the trailing 14-day series — and which
 * of them reaches further back depends on today's date: on the 2nd of the
 * month the series does, on the 28th the month does. Taking the EARLIER of
 * the two is what makes a fold safe on any day of any month.
 */
export function retentionStart(now: Date): number {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const seriesStart = startOfDay - (DAYS_IN_SERIES - 1) * DAY_MS;
  return Math.min(startOfMonth, seriesStart);
}

/**
 * The ledger, folded up: recent entries untouched, everything older collapsed
 * into one carry row per project.
 *
 * Pure, because the alternative to getting this exactly right is a user's
 * all-time spend silently changing. The carry keeps the project's older
 * total and turn count intact, and is stamped with the OLDEST instant it
 * stands for: that is always before the retention boundary, so it can never
 * drift into a month or a day series it does not belong to, and it is also
 * the truth about how far back the all-time figure reaches. Stamping it at
 * the boundary instead would be safe but would under-report the coverage —
 * a ledger going back to September would start claiming October.
 *
 * Pre-delta entries are dropped rather than carried: carrying them would
 * preserve a number that is wrong by roughly an order of magnitude forever.
 */
export function compactEntries(list: readonly UsageEntry[], now: Date): UsageEntry[] {
  const cutoff = retentionStart(now);
  const recent: UsageEntry[] = [];
  const carry = new Map<string, UsageEntry>();

  for (const e of list) {
    if (e.t < USAGE_DELTA_EPOCH_MS) continue;
    if (e.t >= cutoff) {
      recent.push(e);
      continue;
    }
    const existing = carry.get(e.p);
    if (existing) {
      existing.c += e.c;
      existing.d += e.d;
      existing.n = (existing.n ?? 1) + (e.n ?? 1);
      existing.t = Math.min(existing.t, e.t);
    } else {
      carry.set(e.p, { t: e.t, c: e.c, d: e.d, p: e.p, n: e.n ?? 1 });
    }
  }

  // Carries first, so the file stays in rough time order and a human reading
  // it top to bottom sees the history before the detail.
  return [...carry.values(), ...recent];
}

/** Summary of the ledger on disk. */
export function summarizeUsage(now = new Date()): UsageSummary {
  return summarizeEntries(allEntries(), now);
}

/** The aggregation itself, pure: entries in, summary out. */
export function summarizeEntries(list: readonly UsageEntry[], now = new Date()): UsageSummary {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let todayUsd = 0;
  let monthUsd = 0;
  let allTimeUsd = 0;
  let turnCount = 0;
  const byProject = new Map<string, { monthUsd: number; allTimeUsd: number }>();
  const dayBuckets = new Array<number>(DAYS_IN_SERIES).fill(0);
  const seriesStart = startOfDay - (DAYS_IN_SERIES - 1) * DAY_MS;
  const todayByWorkspace: Record<string, number> = {};

  let earliestMs: number | null = null;
  for (const e of list) {
    turnCount += e.n ?? 1;
    allTimeUsd += e.c;
    if (earliestMs === null || e.t < earliestMs) earliestMs = e.t;
    if (e.t >= startOfMonth) monthUsd += e.c;
    if (e.t >= startOfDay) {
      todayUsd += e.c;
      todayByWorkspace[e.p] = (todayByWorkspace[e.p] ?? 0) + e.c;
    }
    if (e.t >= seriesStart) {
      const idx = Math.min(DAYS_IN_SERIES - 1, Math.floor((e.t - seriesStart) / DAY_MS));
      dayBuckets[idx] += e.c;
    }

    let proj = byProject.get(e.p);
    if (!proj) {
      proj = { monthUsd: 0, allTimeUsd: 0 };
      byProject.set(e.p, proj);
    }
    proj.allTimeUsd += e.c;
    if (e.t >= startOfMonth) proj.monthUsd += e.c;
  }

  const perProject: ProjectUsage[] = [...byProject.entries()]
    .map(([projectPath, sums]) => ({
      path: projectPath,
      folder: path.basename(projectPath),
      monthUsd: sums.monthUsd,
      allTimeUsd: sums.allTimeUsd,
    }))
    .sort((a, b) => b.monthUsd - a.monthUsd || b.allTimeUsd - a.allTimeUsd)
    .slice(0, MAX_PROJECTS_IN_SUMMARY);

  const days = dayBuckets.map((usd, i) => {
    const d = new Date(seriesStart + i * DAY_MS);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return { day: `${mm}-${dd}`, usd };
  });

  return {
    todayUsd,
    monthUsd,
    allTimeUsd,
    perProject,
    turnCount,
    days,
    todayByWorkspace,
    ...(earliestMs === null ? {} : { allTimeSince: earliestMs }),
  };
}
