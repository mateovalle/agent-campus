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
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS_DIR = path.join(REPO_ROOT, 'webview-ui', 'public', 'assets');
const CATALOG_PATH = path.join(ASSETS_DIR, 'furniture', 'furniture-catalog.json');
const OUT_PATH = path.join(ASSETS_DIR, 'default-layout.json');

// ── Layout model (mirrors webview-ui/src/office/types.ts) ─────────

const WALL = 0;
const VOID = 8;
/** Floor pattern tile ids: 1 wood, 2 large tiles, 3 checker, 4 carpet, 5 herringbone, 6 mosaic, 7 concrete. */
const LARGE_TILES = 2;
const CARPET = 4;
const CONCRETE = 7;

interface FloorColor {
  h: number;
  s: number;
  b: number;
  c: number;
}

interface PlacedFurniture {
  uid: string;
  type: string;
  col: number;
  row: number;
}

interface CatalogAsset {
  id: string;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
}

// ── Scene ────────────────────────────────────────────────────────

const COLS = 26;
const ROWS = 16;

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
  // grass campus ground below the sky rows
  { c0: 0, r0: 1, c1: COLS - 1, r1: ROWS - 1, tile: CARPET, color: GRASS },
  // the office: top wall + side walls, wood floor inside
  { c0: 3, r0: 2, c1: 22, r1: 2, tile: WALL, color: WALL_BLUE },
  { c0: 3, r0: 3, c1: 3, r1: 12, tile: WALL, color: WALL_BLUE },
  { c0: 22, r0: 3, c1: 22, r1: 12, tile: WALL, color: WALL_BLUE },
  { c0: 4, r0: 3, c1: 21, r1: 12, tile: CONCRETE, color: WOOD_DARK },
  // kitchen corner gets tiles
  { c0: 16, r0: 9, c1: 21, r1: 12, tile: LARGE_TILES, color: TAN },
  // path from the door to the campus edge
  { c0: 12, r0: 13, c1: 13, r1: ROWS - 1, tile: LARGE_TILES, color: TAN },
];

/** [type, col, row] — see the comments for the intent of each group. */
const FURNITURE: Array<[string, number, number]> = [
  // wall decor (bottom row sits on the wall row)
  ['window', 5, 2],
  ['medals_wall', 7, 2],
  ['whiteboard', 9, 2],
  ['wall_clock', 12, 2],
  ['tv_dashboard', 14, 2],
  ['poster_code', 17, 2],
  ['corkboard', 18, 2],
  // desk 1: double desk, one seat each side (front chair faces down, back chair faces up)
  ['desk_double', 5, 4],
  ['chair_office', 6, 3],
  ['chair_office_back', 6, 6],
  ['monitor_dual_back', 6, 4],
  ['desk_lamp', 5, 4],
  ['monitor_dual', 5, 5],
  ['printer', 7, 5],
  // desk 2: L-desk
  ['desk_l', 10, 4],
  ['chair_office_back', 11, 6],
  ['plant_cactus', 10, 4],
  ['monitor_dual', 11, 4],
  // desk 3: standing desk with the gamer chair
  ['desk_standing', 15, 4],
  ['chair_gamer_back', 15, 5],
  ['monitor_dual', 15, 4],
  // storage along the walls (tall pieces kept clear of wall decor columns)
  ['server_rack', 4, 3],
  ['filing_cabinet', 4, 5],
  ['bookshelf_tall', 20, 3],
  ['bookshelf_tall', 21, 3],
  // lounge
  ['lamp_floor', 4, 8],
  ['couch', 5, 8],
  ['rug_large', 5, 9],
  ['coffee_table', 5, 10],
  ['couch_left', 8, 9],
  ['cat_sleeping', 7, 11],
  ['plant_monstera', 4, 12],
  ['pingpong_table', 11, 10],
  ['arcade_machine', 14, 9],
  ['trash_bin', 15, 12],
  // kitchen
  ['fish_tank', 20, 8],
  ['stool', 18, 9],
  ['kitchen_counter', 17, 11],
  ['coffee_machine', 17, 11],
  ['microwave', 18, 11],
  ['mini_fridge', 19, 11],
  ['water_dispenser', 20, 11],
  ['vending_machine', 21, 11],
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

const catalog = new Map<string, CatalogAsset>(
  (JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')).assets as CatalogAsset[]).map((a) => [
    a.id,
    a,
  ]),
);

function tileAt(c: number, r: number): number {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return -1;
  return tiles[r * COLS + c];
}

const errors: string[] = [];
const occupied = new Map<string, string>(); // "c,r" → uid (non-background tiles)
const deskTiles = new Set<string>();

for (const f of furniture) {
  const a = catalog.get(f.type);
  if (!a) {
    errors.push(`${f.uid}: unknown type '${f.type}'`);
    continue;
  }
  if (a.isDesk) {
    for (let dr = 0; dr < a.footprintH; dr++) {
      for (let dc = 0; dc < a.footprintW; dc++) deskTiles.add(`${f.col + dc},${f.row + dr}`);
    }
  }
}

for (const f of furniture) {
  const a = catalog.get(f.type);
  if (!a) continue;
  const bg = a.backgroundTiles ?? 0;
  for (let dr = 0; dr < a.footprintH; dr++) {
    for (let dc = 0; dc < a.footprintW; dc++) {
      const c = f.col + dc;
      const r = f.row + dr;
      const key = `${c},${r}`;
      const t = tileAt(c, r);
      const bottomRow = dr === a.footprintH - 1;
      if (a.canPlaceOnWalls) {
        if (bottomRow && t !== WALL)
          errors.push(`${f.uid} ${f.type}: bottom row not on a wall at ${key}`);
      } else {
        if (t === -1) errors.push(`${f.uid} ${f.type}: out of bounds at ${key}`);
        else if (dr >= bg && (t === WALL || t === VOID))
          errors.push(`${f.uid} ${f.type}: on wall/void at ${key}`);
      }
      if (dr < bg) continue; // background rows never collide
      const other = occupied.get(key);
      if (other && !(a.canPlaceOnSurfaces && deskTiles.has(key))) {
        errors.push(`${f.uid} ${f.type}: overlaps ${other} at ${key}`);
      }
      // surface items don't claim desk tiles, so two of them can share a desk
      if (!(a.canPlaceOnSurfaces && deskTiles.has(key))) occupied.set(key, `${f.uid} ${f.type}`);
    }
  }
}

// Surface items on the same desk still shouldn't stack on each other.
const surfaceTiles = new Map<string, string>();
for (const f of furniture) {
  const a = catalog.get(f.type);
  if (!a?.canPlaceOnSurfaces) continue;
  for (let dr = 0; dr < a.footprintH; dr++) {
    for (let dc = 0; dc < a.footprintW; dc++) {
      const key = `${f.col + dc},${f.row + dr}`;
      const other = surfaceTiles.get(key);
      if (other) errors.push(`${f.uid} ${f.type}: stacked on ${other} at ${key}`);
      surfaceTiles.set(key, `${f.uid} ${f.type}`);
    }
  }
}

if (errors.length > 0) {
  console.error('✗ default layout invalid:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

const seatCount = furniture.reduce((n, f) => {
  const a = catalog.get(f.type)!;
  const isChair = /^(chair_|stool|couch)/.test(f.type);
  return n + (isChair ? a.footprintW * a.footprintH : 0);
}, 0);

const layout = { version: 1, cols: COLS, rows: ROWS, tiles, tileColors, furniture };
fs.writeFileSync(OUT_PATH, JSON.stringify(layout) + '\n');
console.log(
  `✓ default-layout.json: ${COLS}x${ROWS}, ${furniture.length} items, ${seatCount} seats → ${OUT_PATH}`,
);
