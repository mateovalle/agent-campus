/**
 * floors.ts — 19 grayscale 16×16 floor tile patterns (batch 3 + appended 8-19).
 *
 * These replace the missing licensed floors.png. Spec (see
 * src/core/assetLoader.ts loadFloorTiles + webview-ui/src/office/floorTiles.ts):
 * floors.png is a (N·16)×16 horizontal strip = N patterns of 16×16, GRAYSCALE.
 * At runtime each pattern is colorized Photoshop-style (luminance → contrast →
 * brightness → fixed HSL), so patterns are authored as pure VALUE maps:
 *  - grayscale only (r == g == b), roughly #333 → #CCC
 *  - midtones dominant (base values ~#7x-#9x) so hue/sat land well
 *  - must TILE SEAMLESSLY — every pattern is a pure function of
 *    (x mod 16, y mod 16), verified visually as 3×3 repeats on the
 *    contact sheet ([floors] section in render-sheet.ts)
 *
 * Patterns (1-based, matching the FloorColor pattern index):
 *  1. wood planks horizontal   2. large smooth tiles w/ grout
 *  3. checker                  4. carpet subtle noise
 *  5. herringbone parquet      6. small mosaic tiles
 *  7. concrete w/ subtle cracks
 *  — appended; NEVER reorder (layouts store the index) —
 *  8. wide oak planks           9. basketweave parquet
 * 10. hex tiles                11. subway tiles
 * 12. terrazzo                 13. rubber studs (gym/lab)
 * 14. grass                    15. gravel
 * 16. deck boards (vertical)   17. stone flags
 * 18. diamond plate            19. tatami
 *
 * Render/preview: node --experimental-strip-types scripts/asset-gen/render-sheet.ts
 */

import type { GeneratedSprite } from './sprites.ts';

const SIZE = 16;

/** Grayscale value (0x33-0xCC) → '#VVVVVV' hex. */
function g(v: number): string {
  const clamped = Math.max(0x33, Math.min(0xcc, Math.round(v)));
  const h = clamped.toString(16).padStart(2, '0').toUpperCase();
  return `#${h}${h}${h}`;
}

/** Build a 16×16 tile from a per-pixel value function. */
function tile(fn: (x: number, y: number) => number): string[][] {
  return Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => g(fn(x, y))),
  );
}

/** Deterministic per-pixel hash (period 16 in both axes → seamless). */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) >>> 0;
  h = (h ^ (h >> 13)) >>> 0;
  h = (h * 1103515245 + 12345) >>> 0;
  return h % 251;
}

// ════════════════════════════════════════════════════════════════
// 1. wood planks horizontal — 4 planks of 4px, dark seam rows,
//    lit top row per plank, sparse grain dashes, staggered joints.
// ════════════════════════════════════════════════════════════════
const FLOOR_WOOD = tile((x, y) => {
  const SEAM = 0x5c;
  const LIGHT = 0x9c;
  const BASE = 0x86;
  const GRAIN = 0x76;
  if (y % 4 === 0) return SEAM; // horizontal plank seam
  const plank = Math.floor(y / 4); // 0..3
  const joints = [3, 11, 7, 14]; // staggered vertical joints
  if (x === joints[plank]) return SEAM;
  if (y % 4 === 1) return LIGHT; // lit top edge of each plank
  // sparse grain dashes on the plank face
  if (y % 4 === 2 && (x + plank * 5) % 9 < 2) return GRAIN;
  if (y % 4 === 3 && (x + plank * 3 + 4) % 11 < 2) return GRAIN;
  return BASE;
});

// ════════════════════════════════════════════════════════════════
// 2. large smooth tiles w/ grout — one 16×16 tile per repeat:
//    grout on row 0 / col 0, lit top-left face, shaded bottom-right.
// ════════════════════════════════════════════════════════════════
const FLOOR_TILES_LARGE = tile((x, y) => {
  const GROUT = 0x58;
  const HIGH = 0x9e;
  const BASE = 0x8e;
  const SHADE = 0x80;
  if (x === 0 || y === 0) return GROUT;
  if (x === 1 || y === 1) return HIGH; // lit top-left inner edge
  if (x === 15 || y === 15) return SHADE; // shaded edge next to grout
  // faint polish specks
  if (hash(x, y, 2) < 12) return BASE + 6;
  return BASE;
});

// ════════════════════════════════════════════════════════════════
// 3. checker — 8×8 quads, two midtone values, faint speckle so the
//    flats aren't dead.
// ════════════════════════════════════════════════════════════════
const FLOOR_CHECKER = tile((x, y) => {
  const light = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
  const base = light ? 0x9a : 0x6e;
  if (hash(x, y, 3) < 16) return base + (light ? -4 : 4);
  return base;
});

// ════════════════════════════════════════════════════════════════
// 4. carpet subtle noise — midtone base, weave parity, hash speckle.
// ════════════════════════════════════════════════════════════════
const FLOOR_CARPET = tile((x, y) => {
  const BASE = 0x86;
  const h = hash(x, y, 4);
  let v = BASE;
  if (h < 40) v = 0x7c;
  else if (h > 210) v = 0x90;
  // faint diagonal weave
  if ((x + y) % 2 === 0) v += 2;
  return v;
});

// ════════════════════════════════════════════════════════════════
// 5. herringbone parquet — classic domino herringbone with 4×8
//    planks. Cell (i,j) = 4px cell; s=(i+j)%4 selects which half of
//    a horizontal (s∈{0,1}) or vertical (s∈{2,3}) plank the cell is.
//    Period = 4 cells = 16px → seamless. Lit top/left plank edge,
//    dark seam on bottom/right.
// ════════════════════════════════════════════════════════════════
const FLOOR_HERRINGBONE = tile((x, y) => {
  const SEAM = 0x5e;
  const LIGHT = 0x9a;
  const BASE = 0x88;
  const GRAIN = 0x7c;
  const i = Math.floor(x / 4);
  const j = Math.floor(y / 4);
  const s = (i + j) % 4;
  // plank origin cell + orientation
  let ox = i;
  let oy = j;
  let horizontal = true;
  if (s === 1) ox = i - 1;
  else if (s === 2) horizontal = false;
  else if (s === 3) {
    horizontal = false;
    oy = j - 1;
  }
  const lx = x - ox * 4; // 0..7 (H) or 0..3 (V)
  const ly = y - oy * 4; // 0..3 (H) or 0..7 (V)
  const w = horizontal ? 8 : 4;
  const h = horizontal ? 4 : 8;
  if (lx === w - 1 || ly === h - 1) return SEAM; // bottom/right seam
  if (lx === 0 || ly === 0) return LIGHT; // lit top/left edge
  if (hash(ox + 40, oy + (horizontal ? 60 : 90), 5) % 3 === 0 && (lx + ly) % 3 === 1) return GRAIN;
  return BASE;
});

// ════════════════════════════════════════════════════════════════
// 6. small mosaic tiles — 4×4 grid of 4px tiles, 1px grout, varied
//    values per tile, lit top-left pixel.
// ════════════════════════════════════════════════════════════════
const FLOOR_MOSAIC = tile((x, y) => {
  const GROUT = 0x5a;
  if (x % 4 === 0 || y % 4 === 0) return GROUT;
  const tx = Math.floor(x / 4);
  const ty = Math.floor(y / 4);
  // hand-picked midtone values, no two identical neighbors
  const shades = [
    0x94, 0x7e, 0x8c, 0x76, 0x86, 0x98, 0x78, 0x90, 0x7c, 0x8e, 0x96, 0x82, 0x92, 0x76, 0x88, 0x9c,
  ];
  const v = shades[ty * 4 + tx];
  if (x % 4 === 1 && y % 4 === 1) return v + 10; // lit top-left pixel
  return v;
});

// ════════════════════════════════════════════════════════════════
// 7. concrete w/ subtle cracks — midtone mottle + internal hairline
//    cracks (cracks never touch the tile edge, so the repeat stays
//    seamless) + a couple of pit dots.
// ════════════════════════════════════════════════════════════════
const CRACK_MAIN: [number, number][] = [
  [3, 4],
  [4, 5],
  [5, 5],
  [6, 6],
];
const CRACK_SECOND: [number, number][] = [
  [9, 11],
  [10, 12],
  [11, 12],
  [12, 13],
];
const CRACK_SMALL: [number, number][] = [
  [12, 3],
  [13, 4],
];
const PITS: [number, number][] = [
  [2, 12],
  [13, 8],
  [7, 2],
];
const FLOOR_CONCRETE = tile((x, y) => {
  if (CRACK_MAIN.some(([cx, cy]) => cx === x && cy === y)) return 0x74;
  if (CRACK_SECOND.some(([cx, cy]) => cx === x && cy === y)) return 0x76;
  if (CRACK_SMALL.some(([cx, cy]) => cx === x && cy === y)) return 0x7a;
  if (PITS.some(([cx, cy]) => cx === x && cy === y)) return 0x7e;
  const BASE = 0x8b;
  const h = hash(x, y, 7);
  if (h < 30) return 0x85;
  if (h > 220) return 0x91;
  return BASE;
});

// ════════════════════════════════════════════════════════════════
// Batch 2 floors (8-19). Appended only — indices 1-7 above are
// referenced by saved layouts and must never move.
// ════════════════════════════════════════════════════════════════

/** Toroidal (period-16) delta, so distance-based patterns wrap seamlessly. */
function wrapD(a: number, b: number): number {
  const d = Math.abs(a - b) % SIZE;
  return Math.min(d, SIZE - d);
}

// ────────────────────────────────────────────────────────────────
// 8. wide oak planks — two 8px boards per repeat (vs. pattern 1's
//    four 4px ones), long staggered butt joints, a soft sheen on the
//    top row (not a bevel — bevels read as stone pavers), long
//    near-continuous grain lines; butt joints softer than seams.
// ────────────────────────────────────────────────────────────────
const FLOOR_OAK_WIDE = tile((x, y) => {
  const SEAM = 0x58;
  const LIGHT = 0x92;
  const BASE = 0x8a;
  const SHADE = 0x7e;
  const GRAIN = 0x7a;
  const board = Math.floor(y / 8); // 0..1
  const ly = y % 8;
  if (ly === 0) return SEAM;
  const joint = board === 0 ? 5 : 13;
  // butt joints are softer than the long seams, so the eye follows
  // the boards' length instead of seeing 2:1 blocks
  if (x === joint) return 0x6a;
  if (ly === 1) return LIGHT;
  if (ly === 7) return SHADE;
  // no knot: any knot repeats at the same spot on every tile and
  // reads as a stamped symbol over a room
  // long grain lines that drift by one row across the board, broken
  // only once per board so they read as continuous wood fibre
  const grainRow = board === 0 ? (x < 8 ? 3 : 5) : x < 4 || x >= 12 ? 4 : 2;
  if (ly === grainRow && x !== (board === 0 ? 1 : 9)) return GRAIN;
  // a second, fainter fibre segment on each board
  if (ly === 6 && (board === 0 ? x >= 9 && x <= 14 : x >= 1 && x <= 5)) return GRAIN + 6;
  return BASE;
});

// ────────────────────────────────────────────────────────────────
// 9. basketweave parquet — 8×8 squares, each three slats wide,
//    alternating horizontal/vertical slats like a woven checker.
// ────────────────────────────────────────────────────────────────
const FLOOR_BASKETWEAVE = tile((x, y) => {
  const SEAM = 0x5c;
  const horizontal = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
  // along = position along the slat, across = position across slats
  const along = horizontal ? x % 8 : y % 8;
  const across = horizontal ? y % 8 : x % 8;
  if (across === 7 || along === 7) return SEAM; // square border (bottom/right)
  // slats: 7px inside the border, split 2|1|2 by joints at 2 and 4
  // (0-1, 3, 5-6) — the thin middle slat is intentional, it keeps the
  // weave readable at 1x without a 9px square
  if (across === 2 || across === 4) return 0x6e; // slat joint (softer than border)
  const slat = across < 2 ? 0 : across < 4 ? 1 : 2;
  const tone = horizontal ? [0x92, 0x88, 0x8e][slat] : [0x82, 0x8a, 0x7e][slat];
  if (along === 0) return tone + 8; // lit end grain
  return tone;
});

// ────────────────────────────────────────────────────────────────
// Cell-map helper for patterns made of discrete stones/tiles.
// cellAt(x, y) takes RAW coords (may be -1 or 16) and returns a cell id
// that is unique per physical tile — so a tile meeting its own periodic
// copy still gets a grout line. Grout = bottom/right boundary pixels,
// lit = first pixel below/right of a boundary, shade = the pixel just
// before the bottom boundary. Seamless as long as cellAt is periodic.
// ────────────────────────────────────────────────────────────────
function cellTile(
  cellAt: (x: number, y: number) => string,
  toneOf: (id: string) => number,
  opts: { grout: number; lit: number; shade: number; seed: number; speck: number },
): string[][] {
  return tile((x, y) => {
    const id = cellAt(x, y);
    if (id !== cellAt(x + 1, y) || id !== cellAt(x, y + 1)) return opts.grout;
    const t = toneOf(id);
    if (id !== cellAt(x - 1, y) || id !== cellAt(x, y - 1)) return t + opts.lit;
    if (id !== cellAt(x, y + 2)) return t - opts.shade;
    const n = hash(x, y, opts.seed);
    if (n < opts.speck) return t - 4;
    if (n > 250 - opts.speck) return t + 4;
    return t;
  });
}

// ────────────────────────────────────────────────────────────────
// 10. hex tiles — pointy-top hexagons: Voronoi of the lattice
//     {(16i, 16j), (16i+8, 16j+8)} with y stretched by √3 so the six
//     neighbours are equidistant (regular hexes, 16px wide). Two
//     alternating tones, lit top/left rim, 1px grout.
// ────────────────────────────────────────────────────────────────
function hexCell(x: number, y: number): string {
  let best = '';
  let bestD = Infinity;
  const px = x + 0.5;
  const py = y + 0.5;
  for (let j = -2; j <= 4; j++) {
    for (let i = -2; i <= 3; i++) {
      // centres: rows every 8px; odd rows shifted 8px
      const rowShift = ((j % 2) + 2) % 2 === 0 ? 0 : 8;
      const ccx = i * 16 + rowShift;
      const ccy = j * 8;
      const dx = px - ccx;
      const dy = (py - ccy) * 1.732;
      const d = dx * dx + dy * dy;
      if (d < bestD - 1e-6) {
        bestD = d;
        best = `${ccx},${ccy}`;
      }
    }
  }
  return best;
}
const FLOOR_HEX = cellTile(
  hexCell,
  (id) => {
    const [, cy] = id.split(',').map(Number);
    return (((cy / 8) % 2) + 2) % 2 === 0 ? 0x92 : 0x86;
  },
  { grout: 0x5a, lit: 10, shade: 8, seed: 10, speck: 8 },
);

// ────────────────────────────────────────────────────────────────
// 11. subway tiles — 8×4 glazed bricks, running bond, 1px grout,
//     a glint pixel pair on each brick's top edge.
// ────────────────────────────────────────────────────────────────
const FLOOR_SUBWAY = tile((x, y) => {
  const GROUT = 0x62;
  const row = Math.floor(y / 4);
  const ly = y % 4;
  const off = row % 2 === 0 ? 0 : 4;
  const lx = (x + off) % 8;
  if (ly === 3 || lx === 7) return GROUT;
  const brick = Math.floor((x + off) / 8) % 2;
  const base = 0xa6 - (brick === row % 2 ? 0 : 6);
  if (ly === 0 && (lx === 1 || lx === 2)) return base + 18; // glaze glint
  if (ly === 2) return base - 8; // soft lower shadow
  return base;
});

// ────────────────────────────────────────────────────────────────
// 12. terrazzo — light polished base scattered with 1-2px chips of
//     several values (some dark, some light), hand-placed so chips
//     never clump into lines when tiled.
// ────────────────────────────────────────────────────────────────
const TERRAZZO_CHIPS: [number, number, number, number, number][] = [
  // x, y, w, h, value
  // y values spread over all 16 rows so no horizontal band forms
  [1, 0, 2, 1, 0x60],
  [6, 3, 1, 1, 0x74],
  [11, 1, 2, 2, 0x6a],
  [14, 6, 1, 2, 0xc4],
  [3, 7, 1, 1, 0xc0],
  [8, 5, 2, 1, 0x7a],
  [0, 10, 1, 2, 0x70],
  [5, 11, 2, 2, 0x64],
  [10, 8, 1, 1, 0xc4],
  [13, 12, 2, 1, 0x6e],
  [2, 14, 1, 1, 0x7c],
  [7, 15, 2, 1, 0xc2],
  [11, 14, 2, 1, 0x62],
  [15, 3, 1, 1, 0x76],
];
const FLOOR_TERRAZZO = tile((x, y) => {
  for (const [cx, cy, w, h, v] of TERRAZZO_CHIPS) {
    if (x >= cx && x < cx + w && y >= cy && y < cy + h) return v;
  }
  const n = hash(x, y, 12);
  if (n < 30) return 0x9a;
  if (n > 225) return 0xa6;
  return 0xa0;
});

// ────────────────────────────────────────────────────────────────
// 13. rubber stud floor (gym / lab) — dark matte base with raised
//     round studs on an 8px grid, lit top-left, shadowed bottom-right.
// ────────────────────────────────────────────────────────────────
const FLOOR_RUBBER = tile((x, y) => {
  const BASE = 0x5e;
  const lx = x % 8;
  const ly = y % 8;
  // stud occupies 3..5 in each 8px cell (3×3 with clipped corners)
  const inX = lx >= 3 && lx <= 5;
  const inY = ly >= 3 && ly <= 5;
  const corner = (lx === 3 || lx === 5) && (ly === 3 || ly === 5);
  if (inX && inY && !corner) {
    if (lx === 3 || ly === 3) return 0x86; // lit rim
    return 0x76;
  }
  if (inX && inY && corner) {
    return lx === 5 && ly === 5 ? BASE : 0x6c;
  }
  if ((lx === 6 && ly >= 4 && ly <= 6) || (ly === 6 && lx >= 4 && lx <= 6)) return 0x52; // cast shadow
  if (hash(x, y, 13) < 14) return BASE + 4;
  return BASE;
});

// ────────────────────────────────────────────────────────────────
// 14. grass — mottled midtone field with short vertical blade
//     strokes (lit tip, dark root) at hashed spots; no regular grid
//     so it doesn't moiré at campus zoom.
// ────────────────────────────────────────────────────────────────
const GRASS_BLADES: [number, number][] = [
  [1, 2],
  [5, 0],
  [9, 3],
  [13, 1],
  [3, 7],
  [7, 5],
  [11, 8],
  [15, 6],
  [0, 12],
  [4, 10],
  [8, 13],
  [12, 11],
  [2, 15],
  [10, 15],
  [14, 14],
  [6, 9],
];
const FLOOR_GRASS = tile((x, y) => {
  for (const [bx, by] of GRASS_BLADES) {
    if (x !== bx) continue;
    const d = (y - by + SIZE) % SIZE;
    if (d === 0) return 0x9e; // tip
    if (d === 1) return 0x8c;
    if (d === 2) return 0x6c; // root shadow
  }
  const n = hash(x, y, 14);
  // low-frequency mottle: two soft patches (toroidal)
  // (second patch off the first's diagonal so they don't band over a field)
  const patch = wrapD(x, 4) + wrapD(y, 5) < 5 || wrapD(x, 13) + wrapD(y, 10) < 4;
  const base = patch ? 0x80 : 0x78;
  if (n < 50) return base - 6;
  if (n > 200) return base + 6;
  return base;
});

// ────────────────────────────────────────────────────────────────
// 15. gravel path — packed small pebbles: Voronoi of hand-placed
//     seeds (toroidal), each pebble its own value, dark gaps, lit
//     top-left pixel per pebble.
// ────────────────────────────────────────────────────────────────
// 17 seeds, y values spread over every row band and two pebbles
// straddling the y=15/0 edge (5,0) and (11,15), so the gap pixels
// never line up into a horizontal line every 16px (rows 15+0 are
// 37.5% gap, about the same as any other row pair).
const GRAVEL_SEEDS: [number, number, number][] = [
  [2, 3, 0x96],
  [7, 1, 0x84],
  [12, 4, 0x9c],
  [5, 0, 0x8c],
  [11, 15, 0x90],
  [15, 9, 0x80],
  [4, 7, 0x7c],
  [9, 8, 0x92],
  [14, 13, 0x94],
  [1, 11, 0x8e],
  [6, 12, 0x9a],
  [10, 11, 0x86],
  [3, 15, 0x88],
  [15, 2, 0x8a],
  [8, 5, 0x7e],
  [13, 7, 0x98],
  [0, 6, 0x82],
];
const FLOOR_GRAVEL = tile((x, y) => {
  const ds = GRAVEL_SEEDS.map(([sx, sy, v]) => {
    const dx = wrapD(x, sx);
    const dy = wrapD(y, sy);
    return { d: dx * dx + dy * dy, v, sx, sy };
  }).sort((a, b) => a.d - b.d);
  const [a, b] = ds;
  if (Math.sqrt(b.d) - Math.sqrt(a.d) < 0.8) return 0x5e; // gap between stones
  // highlight the up-left side of each pebble
  const ux = ((x - a.sx + 24) % 16) - 8;
  const uy = ((y - a.sy + 24) % 16) - 8;
  if (ux + uy <= -2) return a.v + 10;
  if (ux + uy >= 2) return a.v - 8;
  return a.v;
});

// ────────────────────────────────────────────────────────────────
// 16. deck boards — VERTICAL 4px boards (pattern 1 runs
//     horizontal) with dark gaps, staggered end joints and paired
//     nail heads.
// ────────────────────────────────────────────────────────────────
const FLOOR_DECK = tile((x, y) => {
  const GAP = 0x52;
  const board = Math.floor(x / 4);
  const lx = x % 4;
  if (lx === 3) return GAP;
  const joint = [2, 10, 6, 14][board];
  if (y === joint) return GAP;
  // nails: two per board, just below the joint
  if (y === (joint + 2) % SIZE && (lx === 0 || lx === 2)) return 0x6a;
  if (lx === 0) return 0x98; // lit left edge
  const tone = [0x8a, 0x84, 0x8e, 0x86][board];
  if ((y + board * 5) % 7 === 0 && lx === 1) return tone - 10; // grain flick
  return tone;
});

// ────────────────────────────────────────────────────────────────
// 17. stone flags — hand-laid irregular flagstones: two courses of
//     unequal height whose shared mortar line jogs by a pixel, joints
//     staggered (one stone wraps the tile edge), per-stone tone.
// ────────────────────────────────────────────────────────────────
function flagCell(x: number, y: number): string {
  const tx = Math.floor(x / SIZE);
  const ty = Math.floor(y / SIZE);
  const lx = x - tx * SIZE;
  const ly = y - ty * SIZE;
  // course boundary jogs: rows 0..6 on the left, 0..5 on the right
  const upper = ly < (lx < 9 ? 7 : 6);
  if (upper) {
    const k = lx < 6 ? 0 : lx < 11 ? 1 : 2;
    return `${tx},${ty},A${k}`;
  }
  // lower course: [3,10) and [10,19) — the second wraps into the next tile
  if (lx < 3) return `${tx - 1},${ty},B1`;
  return `${tx},${ty},B${lx < 10 ? 0 : 1}`;
}
const FLAG_TONES: Record<string, number> = { A0: 0x8e, A1: 0x80, A2: 0x96, B0: 0x88, B1: 0x92 };
const FLOOR_FLAGSTONE = cellTile(flagCell, (id) => FLAG_TONES[id.split(',')[2]], {
  grout: 0x5c,
  lit: 8,
  shade: 6,
  seed: 17,
  speck: 24,
});

// ────────────────────────────────────────────────────────────────
// 18. diamond plate (server room / workshop) — mid steel with raised
//     4px diagonal treads on an 8px grid, alternating "\" and "/"
//     like a checkerboard; each tread lit, with a shadow pixel under it.
// ────────────────────────────────────────────────────────────────
const FLOOR_DIAMOND_PLATE = tile((x, y) => {
  const BASE = 0x80;
  const qx = Math.floor(x / 8);
  const qy = Math.floor(y / 8);
  const lx = x % 8;
  const ly = y % 8;
  const back = (qx + qy) % 2 === 0; // "\" else "/"
  // tread pixels: 4-long diagonal through the cell centre (rows 2..5)
  const tx = back ? ly : 7 - ly;
  if (ly >= 2 && ly <= 5 && lx === tx) return ly === 2 ? 0xae : 0xa2;
  // shadow directly beneath each tread pixel
  if (ly >= 3 && ly <= 6 && lx === (back ? ly - 1 : 8 - ly)) return 0x68;
  if (hash(x, y, 18) < 10) return BASE - 4;
  return BASE;
});

// ────────────────────────────────────────────────────────────────
// 19. tatami — a full 16×8 mat across the top (its short-end joint at
//     x=4, OFF the 16px grid line) and two 8×8 half-mats below (joints
//     at x=0 and x=8), every mat edged by a dark cloth band (heri) on
//     its top row; rush weave runs as fine stripes that turn 90°
//     between the half-mats. Joints at 4 above and 0/8 below never
//     line up as a running bond, so it reads as mats, not bricks.
// ────────────────────────────────────────────────────────────────
const FLOOR_TATAMI = tile((x, y) => {
  const BAND = 0x5e;
  const SEAM = 0x70;
  const ly = y % 8;
  const top = y < 8;
  if (ly === 0) return BAND; // heri band along each mat's long edge
  if (!top && (x === 0 || x === 8)) return SEAM; // both half-mats' joints
  if (top && x === 4) return SEAM; // short end of the long mat
  // weave stripe direction: long mat + left half-mat vertical, right half-mat horizontal
  const vertical = top || x < 8;
  const stripe = vertical ? x % 2 === 0 : ly % 2 === 0;
  const base = top ? 0xa2 : x < 8 ? 0x98 : 0x9e;
  if (ly === 1) return base + 6; // lit just under the band
  return stripe ? base - 7 : base;
});

// ════════════════════════════════════════════════════════════════
// Export + validation
// ════════════════════════════════════════════════════════════════

export interface FloorPattern {
  id: string;
  label: string;
  /** 16×16 grayscale hex grid (no transparency). */
  tile: string[][];
}

export const FLOORS: FloorPattern[] = [
  { id: 'floor_wood', label: 'Wood Planks', tile: FLOOR_WOOD },
  { id: 'floor_tiles_large', label: 'Large Tiles', tile: FLOOR_TILES_LARGE },
  { id: 'floor_checker', label: 'Checker', tile: FLOOR_CHECKER },
  { id: 'floor_carpet', label: 'Carpet', tile: FLOOR_CARPET },
  { id: 'floor_herringbone', label: 'Herringbone', tile: FLOOR_HERRINGBONE },
  { id: 'floor_mosaic', label: 'Mosaic', tile: FLOOR_MOSAIC },
  { id: 'floor_concrete', label: 'Concrete', tile: FLOOR_CONCRETE },
  // ── appended (8-19); never reorder the entries above ──
  { id: 'floor_oak_wide', label: 'Wide Oak Planks', tile: FLOOR_OAK_WIDE },
  { id: 'floor_basketweave', label: 'Basketweave Parquet', tile: FLOOR_BASKETWEAVE },
  { id: 'floor_hex', label: 'Hex Tiles', tile: FLOOR_HEX },
  { id: 'floor_subway', label: 'Subway Tiles', tile: FLOOR_SUBWAY },
  { id: 'floor_terrazzo', label: 'Terrazzo', tile: FLOOR_TERRAZZO },
  { id: 'floor_rubber', label: 'Rubber Studs', tile: FLOOR_RUBBER },
  { id: 'floor_grass', label: 'Grass', tile: FLOOR_GRASS },
  { id: 'floor_gravel', label: 'Gravel', tile: FLOOR_GRAVEL },
  { id: 'floor_deck', label: 'Deck Boards', tile: FLOOR_DECK },
  { id: 'floor_flagstone', label: 'Stone Flags', tile: FLOOR_FLAGSTONE },
  { id: 'floor_diamond_plate', label: 'Diamond Plate', tile: FLOOR_DIAMOND_PLATE },
  { id: 'floor_tatami', label: 'Tatami', tile: FLOOR_TATAMI },
];

/** Validate: 16×16, fully opaque, grayscale-only, values in ~#333-#CCC. */
export function validateFloors(floors: FloorPattern[]): void {
  for (const f of floors) {
    if (f.tile.length !== SIZE) throw new Error(`${f.id}: height ${f.tile.length} !== 16`);
    f.tile.forEach((row, y) => {
      if (row.length !== SIZE) throw new Error(`${f.id}: row ${y} width ${row.length} !== 16`);
      row.forEach((hex, x) => {
        if (!/^#[0-9A-F]{6}$/.test(hex)) {
          throw new Error(`${f.id}: bad pixel '${hex}' at (${x},${y})`);
        }
        const r = hex.slice(1, 3);
        const gg = hex.slice(3, 5);
        const b = hex.slice(5, 7);
        if (r !== gg || gg !== b) {
          throw new Error(`${f.id}: non-grayscale pixel ${hex} at (${x},${y})`);
        }
        const v = parseInt(r, 16);
        if (v < 0x33 || v > 0xcc) {
          throw new Error(`${f.id}: value ${hex} out of #333-#CCC range at (${x},${y})`);
        }
      });
    });
  }
}

validateFloors(FLOORS);

/** Each floor as a 3×3 tiled 48×48 block, for seamlessness review on the contact sheet. */
export const FLOOR_SHEET: GeneratedSprite[] = FLOORS.map((f) => {
  const tiled: string[][] = Array.from({ length: SIZE * 3 }, (_, y) =>
    Array.from({ length: SIZE * 3 }, (_, x) => f.tile[y % SIZE][x % SIZE]),
  );
  return {
    id: `${f.id}_3x3`,
    name: f.id.toUpperCase(),
    label: f.label,
    widthPx: SIZE * 3,
    heightPx: SIZE * 3,
    footprintW: 3,
    footprintH: 3,
    sprite: tiled,
  };
});
