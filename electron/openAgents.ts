/**
 * Which agents were open, so a restart can offer them back.
 *
 * Agents live only in memory: quitting kills every PTY and SDK session, and
 * nothing on disk remembered they existed. Their transcripts survive, though,
 * and both kinds can be resumed from a session id — so all this file has to
 * keep is the handful of fields needed to relaunch.
 *
 * Written on every open and close rather than at quit: a crash never reaches
 * the shutdown hook, which is exactly the moment the list matters most. It
 * also makes the restart path identical on every platform, instead of macOS
 * quietly keeping agents alive because closing a window doesn't quit the app.
 *
 * The file is a cache, never a source of truth: anything malformed, duplicated
 * or missing its transcript is dropped on read.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { RestorableAgent } from '../shared/protocol.js';
import { DATA_DIR_NAME } from '../src/core/constants.js';

const OPEN_AGENTS_FILE = path.join(os.homedir(), DATA_DIR_NAME, 'open-agents.json');
const OPEN_AGENTS_VERSION = 1;

interface OpenAgentsFile {
  version: number;
  agents: RestorableAgent[];
}

function isRecord(value: unknown): value is RestorableAgent {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.sessionId === 'string' &&
    r.sessionId !== '' &&
    typeof r.cwd === 'string' &&
    r.cwd !== '' &&
    (r.kind === 'terminal' || r.kind === 'chat') &&
    typeof r.label === 'string'
  );
}

/**
 * The records worth offering, in the order they were opened.
 *
 * Pure so the filtering is testable: `hasTranscript` answers whether a
 * session's JSONL is still on disk, and `isLive` whether that session is
 * already running (a webview reload re-runs this with every agent live, and
 * must offer nothing).
 */
export function restorableAgents(
  records: RestorableAgent[],
  hasTranscript: (record: RestorableAgent) => boolean,
  isLive: (sessionId: string) => boolean = () => false,
): RestorableAgent[] {
  const seen = new Set<string>();
  const out: RestorableAgent[] = [];
  for (const record of records) {
    if (!isRecord(record)) continue;
    if (seen.has(record.sessionId)) continue;
    seen.add(record.sessionId);
    if (isLive(record.sessionId)) continue;
    // A session whose transcript is gone cannot be resumed — offering it would
    // spawn an agent with no conversation behind it.
    if (!hasTranscript(record)) continue;
    out.push(record);
  }
  return out;
}

/** Records currently on disk, unfiltered. Never throws. */
export function loadOpenAgents(): RestorableAgent[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(OPEN_AGENTS_FILE, 'utf-8')) as OpenAgentsFile;
    if (!parsed || !Array.isArray(parsed.agents)) return [];
    return parsed.agents.filter(isRecord);
  } catch {
    return []; // absent or corrupt — the list is a convenience, not state
  }
}

/** Replace the list. Atomic (tmp + rename) so a crash mid-write can't corrupt it. */
export function saveOpenAgents(records: RestorableAgent[]): void {
  const file: OpenAgentsFile = { version: OPEN_AGENTS_VERSION, agents: records.filter(isRecord) };
  const tmp = `${OPEN_AGENTS_FILE}.tmp`;
  try {
    fs.mkdirSync(path.dirname(OPEN_AGENTS_FILE), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf-8');
    fs.renameSync(tmp, OPEN_AGENTS_FILE);
  } catch (err) {
    console.error('[Agent Campus] Failed to record open agents:', err);
  }
}

/** Forget these sessions — they were closed on purpose, or declined at restore. */
export function forgetOpenAgents(sessionIds: string[]): void {
  if (sessionIds.length === 0) return;
  const drop = new Set(sessionIds);
  saveOpenAgents(loadOpenAgents().filter((r) => !drop.has(r.sessionId)));
}
