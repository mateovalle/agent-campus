/**
 * Scheduled agent dispatch: recurring runs persisted to
 * ~/.pixel-agents/schedules.json. The main process ticks every
 * SCHEDULER_TICK_MS and launches a chat agent for each due entry.
 * Time-of-day matching fires once within the scheduled minute
 * (lastRunAtMs guards against double-fires across ticks/restarts).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { MissedScheduleRun, ScheduleEntry } from '../shared/protocol.js';
import { DATA_DIR_NAME } from '../src/core/constants.js';

const SCHEDULES_FILE = path.join(os.homedir(), DATA_DIR_NAME, 'schedules.json');

export const SCHEDULER_TICK_MS = 30_000;

let cache: ScheduleEntry[] | null = null;

/**
 * Set when the file existed but could not be read, so the caller can tell
 * "you have no schedules" apart from "your schedules could not be loaded" —
 * which used to look identical, both answering an empty list.
 */
let loadError: string | null = null;

/** Why the stored schedules could not be read, if they could not. */
export function schedulesLoadError(): string | null {
  loadSchedules();
  return loadError;
}

export function loadSchedules(): ScheduleEntry[] {
  if (cache) return cache;
  loadError = null;
  try {
    const raw = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf-8')) as {
      schedules?: ScheduleEntry[];
    };
    cache = (raw.schedules ?? []).filter(
      (s) => typeof s.id === 'string' && typeof s.workspacePath === 'string',
    );
  } catch (err) {
    // A file that is not there is a new install and means nothing. A file
    // that IS there and will not parse means the user's schedules have
    // vanished from Settings, and saying so is the difference between a bug
    // report and a shrug.
    if (fs.existsSync(SCHEDULES_FILE)) {
      loadError = `Could not read ${path.basename(SCHEDULES_FILE)}: ${String(err)}`;
      console.error('[Agent Campus]', loadError);
    }
    cache = [];
  }
  return cache;
}

/**
 * Writes the schedule list, atomically.
 *
 * `.tmp` + rename like the layouts and the usage ledger, and for the same
 * reason — except this one ran on every due-stamp, potentially every 30
 * seconds, so a crash or a power loss mid-write was far likelier to land
 * here. A truncated file then parsed as nothing, and every schedule
 * disappeared from Settings with no notice at all.
 */
function save(): void {
  const tmp = `${SCHEDULES_FILE}.tmp`;
  try {
    fs.mkdirSync(path.dirname(SCHEDULES_FILE), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ schedules: cache ?? [] }, null, 2), 'utf-8');
    fs.renameSync(tmp, SCHEDULES_FILE);
  } catch (err) {
    console.error('[Agent Campus] Failed to save schedules:', err);
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* nothing left to do about it */
    }
  }
}

export function addSchedule(entry: Omit<ScheduleEntry, 'id' | 'lastRunAtMs'>): ScheduleEntry[] {
  const list = loadSchedules();
  const full: ScheduleEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAtMs: Date.now(),
    // Interval schedules count from creation — never fire the moment they're added
    ...(entry.kind === 'interval' ? { lastRunAtMs: Date.now() } : {}),
  };
  list.push(full);
  save();
  return list;
}

export function removeSchedule(id: string): ScheduleEntry[] {
  cache = loadSchedules().filter((s) => s.id !== id);
  save();
  return cache;
}

export function setScheduleEnabled(id: string, enabled: boolean): ScheduleEntry[] {
  const list = loadSchedules();
  const entry = list.find((s) => s.id === id);
  if (entry) {
    entry.enabled = enabled;
    save();
  }
  return list;
}

/**
 * 'HH:MM' → the hour and minute, or null if it is not a time.
 *
 * EXPORTED, and the only place this judgement lives. Both callers used to
 * validate with `/^\d{1,2}:\d{2}$/` on their own, which accepts 24:00 —
 * a very plausible way for a model to write "midnight" — while this
 * function rejects it. The schedule was then saved, reported `enabled:
 * true` by list_schedules, never became due, and never appeared in the
 * missed-runs modal either: dead in a way nothing on screen admitted.
 */
export function parseTime(time: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/** Whether a schedule entry is one the scheduler can actually act on. */
export function scheduleProblem(entry: {
  kind: ScheduleEntry['kind'];
  time?: string;
  days?: number[];
  everyMinutes?: number;
}): string | null {
  if (entry.kind === 'interval') {
    const every = entry.everyMinutes ?? 0;
    if (!Number.isInteger(every) || every < 1) {
      return 'An interval schedule needs everyMinutes as a whole number of 1 or more.';
    }
    return null;
  }
  if (!entry.time || !parseTime(entry.time)) {
    return `"${entry.time ?? ''}" is not a time of day. Use HH:MM between 00:00 and 23:59.`;
  }
  if (entry.kind === 'weekly') {
    const days = entry.days ?? [];
    if (days.length === 0) {
      return 'A weekly schedule needs at least one day (0 = Sunday … 6 = Saturday).';
    }
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return 'Weekly days must be whole numbers from 0 (Sunday) to 6 (Saturday).';
    }
  }
  return null;
}

/** Start of the minute an entry was scheduled to fire at today (local), or null. */
function scheduledMsToday(entry: ScheduleEntry, now: Date): number | null {
  if (!entry.time) return null;
  const t = parseTime(entry.time);
  if (!t) return null;
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.h, t.m, 0, 0);
  return at.getTime();
}

/** Pure due-check (exported for tests). */
export function isDue(entry: ScheduleEntry, now: Date): boolean {
  if (!entry.enabled) return false;
  switch (entry.kind) {
    case 'interval': {
      if (!entry.everyMinutes || entry.everyMinutes < 1) return false;
      const last = entry.lastRunAtMs ?? 0;
      return now.getTime() - last >= entry.everyMinutes * 60_000;
    }
    case 'weekly':
      if (!entry.days?.includes(now.getDay())) return false;
    // falls through — weekly is daily gated on the day-of-week
    case 'daily': {
      const at = scheduledMsToday(entry, now);
      if (at === null) return false;
      // Fire once inside the scheduled minute; a run recorded at/after that
      // minute means this occurrence already happened (survives restarts).
      return now.getTime() >= at && now.getTime() < at + 60_000 && (entry.lastRunAtMs ?? 0) < at;
    }
  }
}

/** Returns due entries and stamps their lastRunAtMs (persisted). */
export function collectDueSchedules(now = new Date()): ScheduleEntry[] {
  const due = loadSchedules().filter((s) => isDue(s, now));
  if (due.length > 0) {
    for (const s of due) s.lastRunAtMs = now.getTime();
    save();
  }
  return due;
}

// ── Missed occurrences (app was closed) ──────────────────────
// Daily/weekly only: intervals self-catch-up on the first tick. Occurrences
// are counted between the schedule's anchor (last run, else creation — legacy
// entries with neither are skipped) and now, capped to a recent window so a
// long-dormant machine doesn't offer weeks of stale runs.
export const MISSED_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** Pure missed-occurrence count for one entry (exported for tests). */
export function missedOccurrences(
  entry: ScheduleEntry,
  now: Date,
): { count: number; lastAtMs: number } | null {
  if (!entry.enabled || entry.kind === 'interval' || !entry.time) return null;
  const t = parseTime(entry.time);
  if (!t) return null;
  const anchor = entry.lastRunAtMs ?? entry.createdAtMs;
  if (anchor === undefined) return null;
  const floor = Math.max(anchor, now.getTime() - MISSED_LOOKBACK_MS);

  let count = 0;
  let lastAtMs = 0;
  const day = new Date(floor);
  day.setHours(0, 0, 0, 0);
  for (; day.getTime() <= now.getTime(); day.setDate(day.getDate() + 1)) {
    if (entry.kind === 'weekly' && !entry.days?.includes(day.getDay())) continue;
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.h, t.m, 0, 0).getTime();
    // Strictly after the anchor, and past its whole minute (the current
    // minute belongs to the live tick, not the missed list).
    if (at > floor && at + 60_000 <= now.getTime()) {
      count++;
      lastAtMs = at;
    }
  }
  return count > 0 ? { count, lastAtMs } : null;
}

/** Missed runs across all schedules, for the pick-and-run prompt on launch. */
export function collectMissedSchedules(now = new Date()): MissedScheduleRun[] {
  const missed: MissedScheduleRun[] = [];
  for (const s of loadSchedules()) {
    const m = missedOccurrences(s, now);
    if (m) missed.push({ schedule: s, missedCount: m.count, lastMissedAtMs: m.lastAtMs });
  }
  return missed;
}

/** Stamps lastRunAtMs so the offered occurrences aren't re-offered next launch. */
export function markSchedulesHandled(ids: string[], nowMs: number): void {
  const list = loadSchedules();
  let changed = false;
  for (const s of list) {
    if (ids.includes(s.id)) {
      s.lastRunAtMs = nowMs;
      changed = true;
    }
  }
  if (changed) save();
}
