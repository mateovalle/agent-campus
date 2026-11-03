/**
 * Layout validation: the check every path that accepts a layout from outside
 * has to make — the import dialog, the starter-office file, and the
 * layouts-dir watcher that hot-reloads a file edited by hand.
 *
 * This module used to own a single `~/.pixel-agents/layout.json` — the one
 * office the VS Code host had, shared across its windows, hence the atomic
 * write and the cross-window watcher that lived here. The campus replaced
 * that with one layout file per workspace (`~/.pixel-agents/layouts/`, owned
 * by electron/main.ts) and the VS Code host is gone, so all of that was
 * removed; the legacy file is no longer read, written or watched by anything.
 */

import { z } from 'zod';

import { LAYOUT_MAX_DIMENSION, LAYOUT_MAX_TILE_VALUE } from './constants.js';

/**
 * A placed piece. `row` may be NEGATIVE: wall-mounted items hang with their
 * bottom row on the wall tile and their upper rows above the grid. Unknown
 * fields pass through — colour, state and rotation live here too, and this
 * module is not the catalogue.
 */
const furnitureSchema = z
  .object({
    type: z.string().min(1),
    row: z.int(),
    col: z.int(),
  })
  .loose();

/** A per-tile colour, or null for 'this tile is not tinted'. */
const tileColorSchema = z
  .object({ h: z.number(), s: z.number(), b: z.number(), c: z.number() })
  .loose()
  .nullable();

const layoutSchema = z
  .object({
    version: z.literal(1),
    cols: z.int().positive().max(LAYOUT_MAX_DIMENSION),
    rows: z.int().positive().max(LAYOUT_MAX_DIMENSION),
    tiles: z.array(z.int().min(0).max(LAYOUT_MAX_TILE_VALUE)),
    furniture: z.array(furnitureSchema).optional(),
    tileColors: z.array(tileColorSchema).optional(),
  })
  .loose();

export type ValidatedLayout = z.infer<typeof layoutSchema> & Record<string, unknown>;

/** Why a layout was refused, in words a toast can show. */
export type LayoutParseResult =
  { ok: true; layout: ValidatedLayout } | { ok: false; reason: string };

/**
 * Validates a layout, answering WHY when it fails.
 *
 * The reason is the point. This was a boolean, and the import dialog's
 * response to `false` was `return` — the user picked a file and nothing
 * happened at all, with no way to tell a wrong file from a broken one.
 */
export function parseLayout(input: unknown): LayoutParseResult {
  const parsed = layoutSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return { ok: false, reason: `${where}${issue.message.toLowerCase()}` };
  }
  const layout = parsed.data as ValidatedLayout;

  // Consistency the shape alone cannot express: a grid is its dimensions AND
  // its contents, and a tiles array of the wrong length renders as a scrambled
  // office — every row offset by the difference — rather than as an error.
  const expected = layout.cols * layout.rows;
  if (layout.tiles.length !== expected) {
    return {
      ok: false,
      reason: `${layout.cols}x${layout.rows} needs ${expected} tiles, found ${layout.tiles.length}`,
    };
  }
  if (layout.tileColors && layout.tileColors.length !== layout.tiles.length) {
    return {
      ok: false,
      reason: `${layout.tileColors.length} tile colours for ${layout.tiles.length} tiles`,
    };
  }
  return { ok: true, layout };
}

/**
 * Structural validation as a type guard, for callers with nothing to say
 * about a failure (the starter-office read, which falls back to the bundled
 * layout). Prefer `parseLayout` anywhere a person is waiting for an answer.
 */
export function isValidLayout(layout: unknown): layout is Record<string, unknown> {
  return parseLayout(layout).ok;
}
