/**
 * sprites6.ts — Batch 6: rotation variants, third pass — the quarter turns.
 *
 * Batches 4/5 gave every non-symmetric piece a back view and mirrored the
 * 1x1 items into side profiles, but every multi-tile piece kept its
 * footprint: a 2x1 couch "rotated" into a 2x1 couch seen from behind, and
 * the L-desk's "right" view was a mirror that still spanned 3x2. This batch
 * adds the real 90° turns — side views whose FOOTPRINT swaps W/H
 * (2x1 → 1x2, 3x2 → 2x3) — and replaces the mirrored desk_l_right with the
 * true rotation, plus back/left, since an L is chiral.
 *
 * Conventions as before: variants share a groupId with their front sprite,
 * left views are programmatic mirrors of the right views, house palette
 * only, light from top-left. Top-down slabs (desks, tables, rug) fill their
 * footprint exactly; pieces with a front face (couch, tank, counter,
 * standing desk) keep the 16px overhang above the footprint their fronts
 * have.
 */

import {
  BLUE,
  CLAY,
  CLAY_DARK,
  GOLD_DARK,
  GREEN,
  ICE,
  IRON,
  IRON_DARK,
  LEAF,
  LEAF_DARK,
  LED_GREEN,
  ORANGE,
  PAPER,
  RED,
  SCREEN_BLUE,
  SCREEN_SHADOW,
  SILVER,
  SKY,
  STEEL,
  STEEL_DARK,
  STEEL_LIGHT,
  WOOD,
  WOOD_DARK,
  WOOD_LIGHT,
  WOOD_SURFACE,
} from './palette.ts';
import type { GeneratedSprite } from './sprites.ts';
import { validateSprites } from './sprites.ts';

type Legend = Record<string, string>;

/** Compile an ASCII pixel map to a hex grid. '.' = transparent. */
function fromAscii(rows: string[], legend: Legend): string[][] {
  return rows.map((row, r) =>
    [...row].map((ch, c) => {
      if (ch === '.') return '';
      const hex = legend[ch];
      if (hex === undefined) throw new Error(`unknown legend char '${ch}' at row ${r} col ${c}`);
      return hex;
    }),
  );
}

/** Repeat a char n times (readability helper for long rows). */
function rep(ch: string, n: number): string {
  return ch.repeat(n);
}

/** Horizontal mirror of a compiled hex grid. */
export function mirrorSprite(sprite: string[][]): string[][] {
  return sprite.map((row) => [...row].reverse());
}

// ════════════════════════════════════════════════════════════════
// Top-down slab generator — the desk language of DESK_L / DESK_DOUBLE
// (wood outline, lit top strip + lit left column, plank surface, leg
// stubs under the bottom-most tiles) for ANY set of footprint tiles.
// Each footprint row is a 13px band starting at y=1 (DESK_L precedent:
// 2 rows → 26px + 3px stubs + 2px air), so the L-desk's four
// orientations and the turned desks all share one drawing routine.
// ════════════════════════════════════════════════════════════════

export interface Cell {
  c: number;
  r: number;
}

const BAND = 13;
const SLAB_LEGEND: Legend = { e: WOOD, l: WOOD_LIGHT, s: WOOD_SURFACE, d: WOOD_DARK };

export interface SlabOptions {
  /** Surface px per footprint row (default BAND). */
  band?: number;
  /** Draw a lit plank line across the first band (DESK_L look). */
  grain?: boolean;
  /** Extra detail pass on the char grid after the surface is laid down. */
  detail?: (grid: string[][], inside: (x: number, y: number) => boolean) => void;
}

export function slab(
  cols: number,
  rows: number,
  cells: Cell[],
  opts: SlabOptions = {},
): string[][] {
  const band = opts.band ?? BAND;
  const W = cols * 16;
  const H = rows * 16;
  const grid: string[][] = Array.from({ length: H }, () => new Array<string>(W).fill('.'));
  const has = (c: number, r: number) => cells.some((k) => k.c === c && k.r === r);

  // A tile's outermost pixel column (lx 0 / 15) is part of the slab only
  // when the neighbouring tile is too — the 1px inset belongs to the
  // shape's outline, not to every tile, so adjacent tiles fuse seamlessly.
  const inside = (x: number, y: number): boolean => {
    if (x < 0 || y < 1 || x >= W || y >= H) return false;
    const r = Math.floor((y - 1) / band);
    if (r >= rows) return false;
    const c = Math.floor(x / 16);
    if (!has(c, r)) return false;
    const lx = x - c * 16;
    if (lx === 0) return has(c - 1, r);
    if (lx === 15) return has(c + 1, r);
    return true;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge) {
        grid[y][x] = 'e';
        continue;
      }
      // light from top-left: lit strip under a top edge, lit column right of a left edge
      const lit = !inside(x, y - 2) || !inside(x - 2, y);
      grid[y][x] = lit ? 'l' : 's';
    }
  }

  if (opts.grain) {
    const y = 1 + Math.floor(band / 2);
    for (let x = 0; x < W; x++) {
      if (grid[y][x] === 's') grid[y][x] = 'l';
    }
  }

  // Leg stubs: 3 rows under every bottom-most tile run, at both run ends
  // (+ middle for runs of 3, like DESK_DOUBLE).
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      if (!has(c, r) || has(c, r + 1)) {
        c++;
        continue;
      }
      let end = c;
      while (end + 1 < cols && has(end + 1, r) && !has(end + 1, r + 1)) end++;
      const stubCols = [c * 16 + 1, c * 16 + 2, end * 16 + 13, end * 16 + 14];
      if (end - c >= 2) {
        const mid = Math.floor((c + end) / 2);
        stubCols.push(mid * 16 + 7, mid * 16 + 8);
      }
      const y0 = 1 + band * (r + 1);
      for (let y = y0; y < y0 + 3 && y < H; y++) {
        for (const x of stubCols) grid[y][x] = 'd';
      }
      c = end + 1;
    }
  }

  opts.detail?.(grid, inside);
  return fromAscii(
    grid.map((row) => row.join('')),
    SLAB_LEGEND,
  );
}

// ════════════════════════════════════════════════════════════════
// 1-3. desk_l_right / desk_l_back / desk_l_left — the L-desk's true
//    quarter turns. Front = 3-wide bar with the pedestal arm down the
//    LEFT column (cells (0,0)(1,0)(2,0)(0,1)); rotating clockwise maps
//    (c,r) → (H-1-r, c), so right = full RIGHT column + top-left cell
//    (2x3), back = full bottom row + top-right cell (3x2), left = full
//    LEFT column + bottom-right cell (2x3).
// ════════════════════════════════════════════════════════════════
const DESK_L_RIGHT = slab(
  2,
  3,
  [
    { c: 0, r: 0 },
    { c: 1, r: 0 },
    { c: 1, r: 1 },
    { c: 1, r: 2 },
  ],
  { grain: true },
);

const DESK_L_BACK = slab(
  3,
  2,
  [
    { c: 2, r: 0 },
    { c: 0, r: 1 },
    { c: 1, r: 1 },
    { c: 2, r: 1 },
  ],
  { grain: true },
);

const DESK_L_LEFT = slab(
  2,
  3,
  [
    { c: 0, r: 0 },
    { c: 0, r: 1 },
    { c: 0, r: 2 },
    { c: 1, r: 2 },
  ],
  { grain: true },
);

// ════════════════════════════════════════════════════════════════
// 4. desk_double_right — the long two-seat desk turned upright, 32x48,
//    2x3. The two facing work halves become LEFT/RIGHT columns split by
//    a lit center line, with dividers marking each side's work strip.
//    desk_double_left is the programmatic mirror.
// ════════════════════════════════════════════════════════════════
const DESK_DOUBLE_RIGHT = slab(
  2,
  3,
  [
    { c: 0, r: 0 },
    { c: 1, r: 0 },
    { c: 0, r: 1 },
    { c: 1, r: 1 },
    { c: 0, r: 2 },
    { c: 1, r: 2 },
  ],
  {
    detail: (grid, inside) => {
      for (let y = 0; y < grid.length; y++) {
        for (const x of [7, 24]) {
          if (grid[y][x] === 'e')
            grid[y][x] = 'd'; // divider meets the outline
          else if (inside(x, y)) grid[y][x] = 'e';
        }
        for (const x of [15, 16]) {
          if (inside(x, y) && grid[y][x] !== 'e') grid[y][x] = 'l';
        }
      }
      // middle leg stub under the center line
      for (let y = 40; y <= 42; y++) {
        grid[y][15] = 'd';
        grid[y][16] = 'd';
      }
    },
  },
);

// ════════════════════════════════════════════════════════════════
// 5. coffee_table_right — the low table turned upright, 16x32, 1x2.
//    A shallower band (12px/row) keeps it reading as a low table.
//    Symmetric, so front + right is the whole cycle.
// ════════════════════════════════════════════════════════════════
const COFFEE_TABLE_RIGHT = slab(
  1,
  2,
  [
    { c: 0, r: 0 },
    { c: 0, r: 1 },
  ],
  { band: 12 },
);

// ════════════════════════════════════════════════════════════════
// 6. desk_standing_right — the standing desk turned upright, 16x48,
//    1x2. Same language as DESK_STANDING (top-down wood top, dark
//    underside lip, tall steel legs with a crossbar, T-feet) but the
//    top now runs 2 tiles deep and we see one pair of legs end-on.
//    desk_standing_left is the programmatic mirror.
// ════════════════════════════════════════════════════════════════
const DESK_STANDING_RIGHT = (() => {
  const rows: string[] = [];
  rows.push(rep('.', 16)); // r0
  rows.push('.' + rep('e', 14) + '.'); // r1 top edge
  rows.push('.e' + rep('l', 12) + 'e.'); // r2 lit strip
  // r3-26: surface, lit left column, plank line at r14
  for (let r = 3; r <= 26; r++) {
    rows.push('.el' + rep(r === 14 ? 'l' : 's', 11) + 'e.');
  }
  rows.push('.' + rep('e', 14) + '.'); // r27 bottom edge
  rows.push('..' + rep('d', 12) + '..'); // r28 underside lip
  // r29-40: steel legs, crossbar at r36
  for (let r = 29; r <= 40; r++) {
    rows.push(r === 36 ? rep('.', 4) + rep('m', 8) + rep('.', 4) : '....mm....mm....');
  }
  rows.push('...kkkk..kkkk...'); // r41-42 feet
  rows.push('...kkkk..kkkk...');
  for (let r = 43; r < 48; r++) rows.push(rep('.', 16));
  return fromAscii(rows, {
    e: WOOD,
    l: WOOD_LIGHT,
    s: WOOD_SURFACE,
    d: WOOD_DARK,
    m: STEEL_DARK,
    k: IRON_DARK,
  });
})();

// ════════════════════════════════════════════════════════════════
// 7. couch_right — the couch turned to face RIGHT, 16x48, 1x2. The
//    backrest becomes a tall band down the left edge (lit column, a
//    cushion split half-way), armrests are the short bands at the top
//    and bottom, two seat cushions in between, front skirt and feet.
//    couch_left is the programmatic mirror.
// ════════════════════════════════════════════════════════════════
const COUCH_RIGHT = (() => {
  const rows: string[] = [];
  for (let r = 0; r < 7; r++) rows.push(rep('.', 16)); // r0-6
  rows.push('.oooo...........'); // r7 backrest top outline
  rows.push('ohhhho..........'); // r8 lit backrest top
  rows.push('oGGGGooooooooooo'); // r9 top armrest outline
  rows.push('ohGGGohhhhhhhhho'); // r10 lit armrest top
  for (let r = 11; r <= 14; r++) rows.push('ohGGGoGGGGGGGGGo'); // r11-14 armrest
  rows.push('ohGGGogggggggggo'); // r15 seat shadow under the armrest
  rows.push('ohGGGohhhhhhhhho'); // r16 cushion top (lit)
  for (let r = 17; r <= 26; r++) rows.push('ohGGGoGGGGGGGGGo'); // r17-26 cushion 1
  rows.push('oggggogggggggggo'); // r27-28 cushion split (backrest too)
  rows.push('oggggogggggggggo');
  for (let r = 29; r <= 38; r++) rows.push('ohGGGoGGGGGGGGGo'); // r29-38 cushion 2
  rows.push('ohGGGogggggggggo'); // r39 cushion front shadow
  rows.push('ohGGGohhhhhhhhho'); // r40 lit bottom armrest top
  for (let r = 41; r <= 43; r++) rows.push('ohGGGoGGGGGGGGGo'); // r41-43 armrest
  rows.push('oggggogggggggggo'); // r44 skirt (shadowed)
  rows.push('.oooooooooooooo.'); // r45 bottom outline
  rows.push('..ee........ee..'); // r46-47 wood feet
  rows.push('..ee........ee..');
  return fromAscii(rows, { o: LEAF_DARK, G: GREEN, g: LEAF, h: LED_GREEN, e: WOOD_DARK });
})();

// ════════════════════════════════════════════════════════════════
// 8. fish_tank_right — the aquarium turned end-on, 16x48, 1x2. Top
//    16px (the overhang, like the front's tank face) is the open water
//    surface seen from above with ripple highlights; then the narrow
//    glass end with a fish and a plant over gravel; then the wood stand
//    end with a single door. fish_tank_left is the programmatic mirror.
// ════════════════════════════════════════════════════════════════
const FISH_TANK_RIGHT = (() => {
  const rows: string[] = [];
  const tank = (inner: string) => 'f' + inner + 'f';
  const wood = (inner: string) => 'W' + inner + 'W';
  // r0-15: water surface from above
  rows.push('.' + rep('f', 14) + '.');
  rows.push(tank(rep('l', 14)));
  rows.push(tank('il' + rep('l', 12)));
  rows.push(tank('i' + rep('l', 4) + 'ii' + rep('l', 7)));
  for (let r = 4; r <= 5; r++) rows.push(tank(rep('l', 14)));
  rows.push(tank(rep('l', 8) + 'iii' + rep('l', 3)));
  rows.push(tank(rep('l', 3) + 'ii' + rep('l', 9)));
  for (let r = 8; r <= 9; r++) rows.push(tank(rep('l', 14)));
  rows.push(tank(rep('l', 10) + 'ii' + rep('l', 2)));
  rows.push(tank(rep('l', 5) + 'iii' + rep('l', 6)));
  for (let r = 12; r <= 14; r++) rows.push(tank(rep('l', 14)));
  rows.push('.' + rep('f', 14) + '.');
  // r16-31: glass end face
  rows.push(tank(rep('l', 14))); // r16 water line
  rows.push(tank('i' + rep('w', 13)));
  rows.push(tank('i' + rep('w', 13)));
  rows.push(tank(rep('w', 14)));
  rows.push(tank(rep('w', 14)));
  rows.push(tank(rep('w', 3) + 'FFF' + rep('w', 8))); // r21-22 fish
  rows.push(tank(rep('w', 2) + 'FFFF' + rep('w', 8)));
  rows.push(tank(rep('w', 11) + 'g' + rep('w', 2)));
  rows.push(tank(rep('w', 10) + 'gDg' + 'w')); // r24-28 plant
  rows.push(tank(rep('w', 10) + 'gDg' + 'w'));
  rows.push(tank(rep('w', 3) + 'g' + rep('w', 6) + 'ggDg'));
  rows.push(tank(rep('w', 2) + 'gDg' + rep('w', 5) + 'gDgg'));
  rows.push(tank(rep('w', 2) + 'gDg' + rep('w', 5) + 'gDgg'));
  rows.push(tank('SSSqSSSSqSSSSS')); // r29 gravel
  rows.push(tank(rep('q', 14)));
  rows.push('.' + rep('f', 14) + '.'); // r31
  // r32-45: wood stand end
  rows.push('.' + rep('W', 14) + '.');
  rows.push(wood(rep('L', 14)));
  for (let r = 34; r <= 43; r++) {
    const cells = rep(r === 34 ? 'L' : 'W', 12).split('');
    if (r === 38) cells[10] = 'e'; // knob
    rows.push(wood('e' + cells.join('') + 'e'));
  }
  rows.push(wood(rep('e', 14)));
  rows.push('.' + rep('W', 14) + '.');
  rows.push('..ee........ee..'); // r46-47 feet
  rows.push('..ee........ee..');
  return fromAscii(rows, {
    f: STEEL_DARK,
    w: BLUE,
    l: SKY,
    i: ICE,
    F: ORANGE,
    g: LEAF,
    D: LEAF_DARK,
    S: CLAY,
    q: CLAY_DARK,
    W: WOOD,
    e: WOOD_DARK,
    L: WOOD_LIGHT,
  });
})();

// ════════════════════════════════════════════════════════════════
// 9. kitchen_counter_right — the counter turned end-on, 16x48, 1x2.
//    Countertop (silver rim, lit paper edges, ice surface) now runs 2
//    tiles deep with the sink in the lower half (clockwise: right → down)
//    and the faucet on its back rim; single cabinet door below; feet.
//    kitchen_counter_left is the programmatic mirror.
// ════════════════════════════════════════════════════════════════
const KITCHEN_COUNTER_RIGHT = (() => {
  const grid: string[][] = Array.from({ length: 48 }, () => new Array<string>(16).fill('.'));
  const set = (r: number, c: number, ch: string) => {
    grid[r][c] = ch;
  };
  // countertop rows 1-28
  for (let c = 1; c <= 14; c++) {
    set(1, c, 's');
    set(28, c, 's');
  }
  for (let r = 2; r <= 27; r++) {
    set(r, 1, 's');
    set(r, 14, 's');
    for (let c = 2; c <= 13; c++) set(r, c, r === 2 || c === 2 ? 'P' : 'I');
  }
  // sink: rim ring rows 15-26, cols 3-12
  for (let c = 3; c <= 12; c++) {
    set(15, c, 's');
    set(26, c, 's');
  }
  for (let r = 16; r <= 25; r++) {
    set(r, 3, 's');
    set(r, 12, 's');
    for (let c = 4; c <= 11; c++) {
      if (r === 16 || c === 4) set(r, c, 'k');
      else if (r === 25 || c === 11) set(r, c, 'h');
      else set(r, c, 'b');
    }
  }
  set(20, 7, 'n'); // drain
  set(20, 8, 'n');
  // faucet over the sink's back rim
  set(12, 7, 'b');
  set(13, 7, 'b');
  set(14, 7, 'b');
  set(12, 8, 'b');
  set(13, 8, 'k');
  // cabinet rows 29-42
  for (let c = 1; c <= 14; c++) {
    set(29, c, 'W');
    set(42, c, 'W');
  }
  for (let r = 30; r <= 41; r++) {
    set(r, 1, 'W');
    set(r, 14, 'W');
    for (let c = 2; c <= 13; c++) {
      const isEdge = c === 2 || c === 13 || r === 41;
      if (isEdge) set(r, c, 'e');
      else if (r === 30) set(r, c, 'L');
      else set(r, c, 'W');
    }
  }
  set(35, 11, 'e'); // knob
  // feet
  for (const c of [2, 3, 12, 13]) {
    set(43, c, 'e');
    set(44, c, 'e');
  }
  return fromAscii(
    grid.map((r) => r.join('')),
    {
      s: SILVER,
      P: PAPER,
      I: ICE,
      k: IRON_DARK,
      b: STEEL,
      h: STEEL_LIGHT,
      n: IRON,
      W: WOOD,
      e: WOOD_DARK,
      L: WOOD_LIGHT,
    },
  );
})();

// ════════════════════════════════════════════════════════════════
// 10. rug_large_right — the rug turned upright, 32x48, 2x3. Same
//     parametric drawing as RUG_LARGE with W/H swapped (the medallion's
//     stretch follows the long axis). Flat and symmetric, so front +
//     right is the whole cycle.
// ════════════════════════════════════════════════════════════════
const RUG_LARGE_RIGHT = (() => {
  const rows: string[] = [];
  const W = 32;
  const H = 48;
  for (let r = 0; r < H; r++) {
    let row = '';
    for (let c = 0; c < W; c++) {
      const edgeR = Math.min(r, H - 1 - r);
      const edgeC = Math.min(c, W - 1 - c);
      if (edgeR === 0 && edgeC === 0) {
        row += '.';
        continue;
      }
      if (edgeR < 2 || edgeC < 2) {
        row += 'b';
        continue;
      }
      if (edgeR === 2 || edgeC === 2) {
        row += 'y';
        continue;
      }
      const d = Math.abs(c - 15.5) + Math.abs(r - 23.5) / 1.5;
      if (d < 2.5) {
        row += 'c';
        continue;
      }
      if (d >= 3.5 && d < 4.5) {
        row += 'y';
        continue;
      }
      if (d >= 6 && d < 7.5) {
        row += 'y';
        continue;
      }
      const dotR = Math.min(Math.abs(r - 9), Math.abs(r - 38));
      const dotC = Math.min(Math.abs(c - 8), Math.abs(c - 23));
      if (dotR === 0 && dotC === 0) {
        row += 'c';
        continue;
      }
      if (dotR <= 1 && dotC <= 1) {
        row += 'y';
        continue;
      }
      row += 'f';
    }
    rows.push(row);
  }
  return fromAscii(rows, { b: CLAY_DARK, y: GOLD_DARK, f: RED, c: PAPER });
})();

// ════════════════════════════════════════════════════════════════
// 11. monitor_dual_right — the two monitors turned to face RIGHT,
//     16x32, 1x2, surface item. Seen edge-on: each is a thin dark panel
//     (steel back, bezel, a sliver of screen glow on the facing side)
//     on a stand, one per tile. monitor_dual_left is the mirror.
// ════════════════════════════════════════════════════════════════
const MONITOR_DUAL_RIGHT = (() => {
  const rows: string[] = [];
  const panel = '.......ffzc.....';
  const neck = '........dd......';
  const base = '.....dddddddd...';
  const one = () => {
    for (let r = 0; r < 9; r++) rows.push(panel);
    rows.push(neck);
    rows.push(neck);
    rows.push(base);
  };
  rows.push(rep('.', 16)); // r0
  rows.push(rep('.', 16)); // r1
  one(); // r2-13
  rows.push(rep('.', 16)); // r14
  rows.push(rep('.', 16)); // r15
  rows.push(rep('.', 16)); // r16
  one(); // r17-28
  for (let r = 29; r < 32; r++) rows.push(rep('.', 16));
  return fromAscii(rows, { f: STEEL_DARK, z: SCREEN_SHADOW, c: SCREEN_BLUE, d: IRON });
})();

// ════════════════════════════════════════════════════════════════

export const SPRITES6: GeneratedSprite[] = [
  {
    id: 'desk_l_right',
    name: 'DESK_L_RIGHT',
    label: 'L-Desk (Right)',
    widthPx: 32,
    heightPx: 48,
    footprintW: 2,
    footprintH: 3,
    sprite: DESK_L_RIGHT,
    groupId: 'desk_l',
    orientation: 'right',
  },
  {
    id: 'desk_l_back',
    name: 'DESK_L_BACK',
    label: 'L-Desk (Back)',
    widthPx: 48,
    heightPx: 32,
    footprintW: 3,
    footprintH: 2,
    sprite: DESK_L_BACK,
    groupId: 'desk_l',
    orientation: 'back',
  },
  {
    id: 'desk_l_left',
    name: 'DESK_L_LEFT',
    label: 'L-Desk (Left)',
    widthPx: 32,
    heightPx: 48,
    footprintW: 2,
    footprintH: 3,
    sprite: DESK_L_LEFT,
    groupId: 'desk_l',
    orientation: 'left',
  },
  {
    id: 'desk_double_right',
    name: 'DESK_DOUBLE_RIGHT',
    label: 'Double Desk (Right)',
    widthPx: 32,
    heightPx: 48,
    footprintW: 2,
    footprintH: 3,
    sprite: DESK_DOUBLE_RIGHT,
    groupId: 'desk_double',
    orientation: 'right',
  },
  {
    id: 'desk_double_left',
    name: 'DESK_DOUBLE_LEFT',
    label: 'Double Desk (Left)',
    widthPx: 32,
    heightPx: 48,
    footprintW: 2,
    footprintH: 3,
    sprite: mirrorSprite(DESK_DOUBLE_RIGHT),
    groupId: 'desk_double',
    orientation: 'left',
  },
  {
    id: 'coffee_table_right',
    name: 'COFFEE_TABLE_RIGHT',
    label: 'Coffee Table (Rotated)',
    widthPx: 16,
    heightPx: 32,
    footprintW: 1,
    footprintH: 2,
    sprite: COFFEE_TABLE_RIGHT,
    groupId: 'coffee_table',
    orientation: 'right',
  },
  {
    id: 'desk_standing_right',
    name: 'DESK_STANDING_RIGHT',
    label: 'Standing Desk (Right)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 2,
    sprite: DESK_STANDING_RIGHT,
    groupId: 'desk_standing',
    orientation: 'right',
  },
  {
    id: 'desk_standing_left',
    name: 'DESK_STANDING_LEFT',
    label: 'Standing Desk (Left)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 2,
    sprite: mirrorSprite(DESK_STANDING_RIGHT),
    groupId: 'desk_standing',
    orientation: 'left',
  },
  {
    id: 'couch_right',
    name: 'COUCH_RIGHT',
    label: 'Couch (Right)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 2,
    sprite: COUCH_RIGHT,
    groupId: 'couch',
    orientation: 'right',
  },
  {
    id: 'couch_left',
    name: 'COUCH_LEFT',
    label: 'Couch (Left)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 2,
    sprite: mirrorSprite(COUCH_RIGHT),
    groupId: 'couch',
    orientation: 'left',
  },
  {
    id: 'fish_tank_right',
    name: 'FISH_TANK_RIGHT',
    label: 'Fish Tank (Right)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 2,
    sprite: FISH_TANK_RIGHT,
    groupId: 'fish_tank',
    orientation: 'right',
  },
  {
    id: 'fish_tank_left',
    name: 'FISH_TANK_LEFT',
    label: 'Fish Tank (Left)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 2,
    sprite: mirrorSprite(FISH_TANK_RIGHT),
    groupId: 'fish_tank',
    orientation: 'left',
  },
  {
    id: 'kitchen_counter_right',
    name: 'KITCHEN_COUNTER_RIGHT',
    label: 'Kitchen Counter (Right)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 2,
    sprite: KITCHEN_COUNTER_RIGHT,
    groupId: 'kitchen_counter',
    orientation: 'right',
  },
  {
    id: 'kitchen_counter_left',
    name: 'KITCHEN_COUNTER_LEFT',
    label: 'Kitchen Counter (Left)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 2,
    sprite: mirrorSprite(KITCHEN_COUNTER_RIGHT),
    groupId: 'kitchen_counter',
    orientation: 'left',
  },
  {
    id: 'rug_large_right',
    name: 'RUG_LARGE_RIGHT',
    label: 'Large Rug (Rotated)',
    widthPx: 32,
    heightPx: 48,
    footprintW: 2,
    footprintH: 3,
    sprite: RUG_LARGE_RIGHT,
    groupId: 'rug_large',
    orientation: 'right',
  },
  {
    id: 'monitor_dual_right',
    name: 'MONITOR_DUAL_RIGHT',
    label: 'Dual Monitors (Right)',
    widthPx: 16,
    heightPx: 32,
    footprintW: 1,
    footprintH: 2,
    sprite: MONITOR_DUAL_RIGHT,
    groupId: 'monitor_dual',
    orientation: 'right',
  },
  {
    id: 'monitor_dual_left',
    name: 'MONITOR_DUAL_LEFT',
    label: 'Dual Monitors (Left)',
    widthPx: 16,
    heightPx: 32,
    footprintW: 1,
    footprintH: 2,
    sprite: mirrorSprite(MONITOR_DUAL_RIGHT),
    groupId: 'monitor_dual',
    orientation: 'left',
  },
];

validateSprites(SPRITES6);
