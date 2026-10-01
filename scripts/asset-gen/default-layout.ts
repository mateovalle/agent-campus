/**
 * default-layout.ts — Generate the bundled default office for new workspaces.
 *
 * Run from the repo root:
 *   node --experimental-strip-types scripts/asset-gen/default-layout.ts
 *
 * Writes webview-ui/public/assets/default-layout.json — the layout every
 * workspace starts from until the user saves their own (loaded by
 * src/core/assetLoader.ts loadDefaultLayout()). The previous file referenced
 * ASSET_* ids from a retired tileset, so fresh installs opened an office with
 * floors and walls but no furniture.
 *
 * The scene is declared here as tile zones + a furniture list and validated
 * against furniture-catalog.json with the same rules the editor enforces
 * (bounds, wall/void tiles, overlap with background-row and surface-item
 * exceptions), so the file can't drift out of sync with the catalog again.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { FloorColor, PlacedFurniture } from './layout-validate.ts';
import { ASSETS_DIR, countSeats, loadCatalog, validateLayout, VOID } from './layout-validate.ts';

const OUT_PATH = path.join(ASSETS_DIR, 'default-layout.json');

// ── Layout model (mirrors webview-ui/src/office/types.ts) ─────────

const WALL = 0;
/** Floor pattern tile ids: 1 wood, 2 large tiles, 3 checker, 4 carpet, 5 herringbone, 6 mosaic, 7 concrete. */
const LARGE_TILES = 2;
const CARPET = 4;
const CONCRETE = 7;

// ── Scene ────────────────────────────────────────────────────────

const COLS = 16;
const ROWS = 11;

// Floor recipes (pattern + Colorize-mode HSBC), lifted from a hand-built office.
const GRASS: FloorColor = { h: 85, s: 30, b: -32, c: 0 };
const WOOD_DARK: FloorColor = { h: 35, s: 30, b: -65, c: 0 };
const TAN: FloorColor = { h: 31, s: 30, b: -1, c: 0 };
const WALL_BLUE: FloorColor = { h: 214, s: 30, b: -84, c: -55 };

interface Zone {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
  tile: number;
  color: FloorColor | null;
}

// Painted in order; later zones win.
const ZONES: Zone[] = [
  { c0: 0, r0: 0, c1: COLS - 1, r1: ROWS - 1, tile: VOID, color: null },
  // campus ground below the sky row
  { c0: 0, r0: 1, c1: COLS - 1, r1: ROWS - 1, tile: CARPET, color: GRASS },
  // one room, 12x7 inside: top wall, side walls, open at the bottom
  { c0: 1, r0: 1, c1: 14, r1: 1, tile: WALL, color: WALL_BLUE },
  { c0: 1, r0: 2, c1: 1, r1: 8, tile: WALL, color: WALL_BLUE },
  { c0: 14, r0: 2, c1: 14, r1: 8, tile: WALL, color: WALL_BLUE },
  { c0: 2, r0: 2, c1: 13, r1: 8, tile: CONCRETE, color: WOOD_DARK },
  // short path out to the campus
  { c0: 7, r0: 9, c1: 8, r1: ROWS - 1, tile: LARGE_TILES, color: TAN },
];

/**
 * Deliberately sparse: a worked example of an office, not a showroom.
 * Seventeen pieces and five seats in a room of eighty-four tiles — someone
 * opening the app for the first time should be able to make it theirs by
 * adding, not by deleting. Chairs sit flush against their desks so the
 * grouping reads as a workstation.
 */
const FURNITURE: Array<[string, number, number]> = [
  // wall decor (bottom row sits on the wall row)
  ['window', 3, 1],
  ['whiteboard', 6, 1],
  ['wall_clock', 10, 1],
  // a desk for two, a seat on each side
  ['desk_double', 3, 3],
  ['chair_office', 4, 2],
  ['chair_office_back', 4, 5],
  ['monitor_dual', 3, 3],
  // and a single desk
  ['desk_single', 10, 3],
  // the chair goes under the desk's right half so the monitor stays clear
  ['chair_office_back', 11, 4],
  ['monitor_single', 10, 3],
  ['laptop', 11, 3],
  // lounge corner: the table sits on the rug's BOTTOM row — on the top row
  // the rug's own z-sort draws over it
  ['couch', 2, 5],
  ['rug_large', 2, 6],
  ['coffee_table', 3, 7],
  // decor, three pieces and no more
  ['bookshelf_tall', 12, 2],
  ['plant_monstera', 2, 2],
  ['trash_bin', 13, 8],
];

// ── Build ────────────────────────────────────────────────────────

const tiles: number[] = new Array<number>(COLS * ROWS).fill(VOID);
const tileColors: Array<FloorColor | null> = new Array<FloorColor | null>(COLS * ROWS).fill(null);
for (const z of ZONES) {
  for (let r = z.r0; r <= z.r1; r++) {
    for (let c = z.c0; c <= z.c1; c++) {
      tiles[r * COLS + c] = z.tile;
      tileColors[r * COLS + c] = z.color ? { ...z.color } : null;
    }
  }
}

const furniture: PlacedFurniture[] = FURNITURE.map(([type, col, row], i) => ({
  uid: `f-default-${String(i + 1).padStart(2, '0')}`,
  type,
  col,
  row,
}));

// ── Validate against the catalog (same rules as canPlaceFurniture) ──

const catalog = loadCatalog();
const errors = validateLayout({ cols: COLS, rows: ROWS, tiles, furniture }, catalog);
if (errors.length > 0) {
  console.error('✗ default layout invalid:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

const seatCount = countSeats(furniture, catalog);

const layout = { version: 1, cols: COLS, rows: ROWS, tiles, tileColors, furniture };
fs.writeFileSync(OUT_PATH, JSON.stringify(layout) + '\n');
console.log(
  `✓ default-layout.json: ${COLS}x${ROWS}, ${furniture.length} items, ${seatCount} seats → ${OUT_PATH}`,
);
