/**
 * The starter office: the layout a workspace's office is born with when that
 * workspace has no design of its own.
 *
 * This used to be ~/.pixel-agents/layout.json, which predates the campus and
 * was *the* office back when there was only one. After per-workspace layouts
 * arrived it kept seeding every new office without anyone choosing it, so a
 * file last touched months ago decided what a brand-new office looked like —
 * furniture ids included, long after those ids were retired.
 *
 * Now it is its own file, written only when the user says so, and absent by
 * default: no file means new offices come from the layout the app ships with.
 * layout.json stays untouched for the VS Code host, which has no campus and
 * where it really is the one office.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { LAYOUT_FILE_DIR } from '../src/core/constants.js';
import { isValidLayout } from '../src/core/layoutPersistence.js';

const TEMPLATE_FILE = path.join(os.homedir(), LAYOUT_FILE_DIR, 'office-template.json');

/** Path of the starter-office file (exported for logging and tests). */
export function officeTemplatePath(): string {
  return TEMPLATE_FILE;
}

/** The user's starter office, or null when they never set one. */
export function readOfficeTemplate(): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(TEMPLATE_FILE, 'utf-8'));
    return isValidLayout(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Store a layout as the starter office. Returns false if it could not be written. */
export function writeOfficeTemplate(layout: Record<string, unknown>): boolean {
  try {
    fs.mkdirSync(path.dirname(TEMPLATE_FILE), { recursive: true });
    // Atomic, like the other layout writes: a half-written starter would
    // greet every new office with a parse error.
    const tmp = `${TEMPLATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(layout), 'utf-8');
    fs.renameSync(tmp, TEMPLATE_FILE);
    return true;
  } catch (err) {
    console.error('[Agent Campus] Failed to save the starter office:', err);
    return false;
  }
}

/** Forget the user's starter office, falling back to the bundled layout. */
export function clearOfficeTemplate(): boolean {
  try {
    fs.rmSync(TEMPLATE_FILE, { force: true });
    return true;
  } catch (err) {
    console.error('[Agent Campus] Failed to clear the starter office:', err);
    return false;
  }
}
