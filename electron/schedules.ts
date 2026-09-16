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

import type { ScheduleEntry } from '../shared/protocol.js';
import { LAYOUT_FILE_DIR } from '../src/core/constants.js';

const SCHEDULES_FILE = path.join(os.homedir(), LAYOUT_FILE_DIR, 'schedules.json');

export const SCHEDULER_TICK_MS = 30_000;

let cache: ScheduleEntry[] | null = null;

export function loadSchedules(): ScheduleEntry[] {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf-8')) as {
      schedules?: ScheduleEntry[];
    };
    cache = (raw.schedules ?? []).filter(
      (s) => typeof s.id === 'string' && typeof s.workspacePath === 'string',
    );
  } catch {
    cache = [];
  }
  return cache;
}

function save(): void {
  try {
    fs.mkdirSync(path.dirname(SCHEDULES_FILE), { recursive: true });
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify({ schedules: cache ?? [] }, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Pixel Agents] Failed to save schedules:', err);
  }
}

export function addSchedule(entry: Omit<ScheduleEntry, 'id' | 'lastRunAtMs'>): ScheduleEntry[] {
  const list = loadSchedules();
  const full: ScheduleEntry = {
    ...entry,
    id: crypto.randomUUID(),
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

function parseTime(time: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
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
