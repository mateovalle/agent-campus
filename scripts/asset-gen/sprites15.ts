/**
 * sprites15.ts — Batch 15: focus, library & campus fun.
 *
 * The pieces that make the campus feel like OURS rather than any office:
 * somewhere to hide (a glass focus booth, a tufted reading armchair with a
 * side table), somewhere to read (a library bookcase with a rolling brass
 * ladder, a globe with a "you are here" pin, book stacks with a steaming
 * mug), somewhere to meet and present (a round meeting table, a lectern
 * with a live mic, a pull-down projector screen whose chart only goes up),
 * a ship-it gong — and the mascot. The repo lives in a folder called
 * 'capybara', so the campus gets a bronze capybara statue with a yuzu
 * offering on its head, a desk plush, and the showpiece: a hinoki
 * hot-spring tub with a towel-hatted capybara soaking among floating yuzu,
 * fed by a bamboo spout, steam curling up. Two rugs (a braided round one
 * and a long runner) tie a reading corner together.
 *
 * Conventions as batches 6–9: house palette only, light from top-left,
 * 1px outlines in a darker shade of the material, short front faces with
 * tops visible, 2px leg stubs, tall pieces overhang above the footprint.
 * Multi-tile / asymmetric pieces ship every orientation whose footprint
 * differs (front carries groupId + orientation 'front'); left views are
 * mirrorSprite() of right views; the armchair ships all four facings
 * because seat direction comes from orientation.
 *
 * Unlike the ASCII-art batches, most pieces here are drawn with a tiny
 * shape shader (`shade`): give it an inside() test and a material and it
 * outlines the rim, lights the first inner pixels on the top/left and
 * darkens the last ones on the bottom/right — so every rounded cushion,
 * disc and box gets the same top-left light for free.
 */

import type { CatalogMeta } from './catalog-meta.ts';
import {
  BLUE,
  BRICK,
  BRICK_DARK,
  CLAY,
  CLAY_DARK,
  CREAM,
  CREAM_DARK,
  GOLD,
  GOLD_DARK,
  GOLD_LIGHT,
  GREEN,
  GREEN_LIGHT,
  ICE,
  INK,
  IRON,
  IRON_DARK,
  LAMP_WARM,
  LEAF,
  LEAF_DARK,
  NAVY,
  NAVY_DARK,
  ORANGE,
  PAPER,
  PINK,
  PINK_DARK,
  PINK_LIGHT,
  PURPLE,
  PURPLE_DARK,
  RED,
  SCREEN_BLUE,
  SCREEN_SHADOW,
  SILVER,
  SILVER_LIGHT,
  SKY,
  STEEL,
  STEEL_DARK,
  STEEL_LIGHT,
  STONE,
  STONE_DARK,
  TEAL,
  TEAL_DARK,
  TEAL_LIGHT,
  WOOD,
  WOOD_DARK,
  WOOD_LIGHT,
  WOOD_SHADOW,
  WOOD_SURFACE,
} from './palette.ts';
import type { GeneratedSprite } from './sprites.ts';
import { validateSprites } from './sprites.ts';
import { mirrorSprite } from './sprites6.ts';

// ════════════════════════════════════════════════════════════════
// Drawing kit — grids hold palette hex directly ('' = transparent).
// ════════════════════════════════════════════════════════════════

type Grid = string[][];

interface Mat {
  /** outline (darker shade of the material) */
  o: string;
  /** fill */
  f: string;
  /** first inner pixels on the top/left (light) */
  l?: string;
  /** last inner pixels on the bottom/right (shade) */
  d?: string;
}

function grid(w: number, h: number): Grid {
  return Array.from({ length: h }, () => new Array<string>(w).fill(''));
}

function px(g: Grid, x: number, y: number, c: string): void {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
}

function rect(g: Grid, x0: number, y0: number, x1: number, y1: number, c: string): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(g, x, y, c);
}

/** Bresenham line. */
function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: string): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    px(g, x0, y0, c);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/**
 * Fill every pixel where inside() holds: rim → outline, first inner pixel
 * below/right of the rim → light, last inner pixel above/left of the rim →
 * shade, the rest → fill.
 */
function shade(g: Grid, inside: (x: number, y: number) => boolean, m: Mat): void {
  const H = g.length;
  const W = g[0].length;
  const rim = (x: number, y: number) =>
    inside(x, y) &&
    (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      if (rim(x, y)) g[y][x] = m.o;
      else if (m.l && (rim(x, y - 1) || rim(x - 1, y))) g[y][x] = m.l;
      else if (m.d && (rim(x, y + 1) || rim(x + 1, y))) g[y][x] = m.d;
      else g[y][x] = m.f;
    }
  }
}

/** Box with optionally cut corners (round = 1 px chamfer). */
function box(g: Grid, x0: number, y0: number, x1: number, y1: number, m: Mat, round = true): void {
  shade(
    g,
    (x, y) => {
      if (x < x0 || x > x1 || y < y0 || y > y1) return false;
      if (round && (x === x0 || x === x1) && (y === y0 || y === y1)) return false;
      return true;
    },
    m,
  );
}

/** Normalised squared distance from an ellipse centre (1 = on the rim). */
function ell(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy;
}

function oval(g: Grid, cx: number, cy: number, rx: number, ry: number, m: Mat): void {
  shade(g, (x, y) => ell(x, y, cx, cy, rx, ry) <= 1, m);
}

/** ASCII stamp: '.' transparent, other chars looked up in the legend. */
function stamp(
  g: Grid,
  ox: number,
  oy: number,
  rows: string[],
  legend: Record<string, string>,
): void {
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const c = legend[ch];
      if (c === undefined) throw new Error(`unknown stamp char '${ch}'`);
      px(g, ox + x, oy + y, c);
    }),
  );
}

/** Transpose (for flat pieces like rugs, whose quarter turn is a pure transpose). */
function transpose(g: Grid): Grid {
  return g[0].map((_, x) => g.map((row) => row[x]));
}

// ── The capybara: left-facing profile, 16x12, drawn into g at (ox, oy).
// A barrel body (ellipse) fused with a blocky head that sits lower and
// juts forward, a darker blunt muzzle, a nub ear, a high-set eye and two
// stubby legs. Shared by the statue, the plush and the onsen. ──
interface CapyFur extends Mat {
  /** muzzle / nostril tone */
  n: string;
  /** cheek blush (plush) */
  k?: string;
  /** nose-tip pixel (nostril, or the rubbed-shiny bronze nose) */
  nose?: string;
}

function capybara(g: Grid, ox: number, oy: number, fur: CapyFur, eyesClosed = false): void {
  rect(g, ox + 3, oy + 9, ox + 4, oy + 11, fur.o);
  rect(g, ox + 11, oy + 9, ox + 12, oy + 11, fur.o);
  px(g, ox + 4, oy + 9, fur.d ?? fur.f);
  px(g, ox + 12, oy + 9, fur.d ?? fur.f);
  shade(
    g,
    (x, y) => {
      const lx = x - ox;
      const ly = y - oy;
      if (ell(lx, ly, 10, 5, 5.6, 4.6) <= 1) return true;
      if (lx < 0 || lx > 8 || ly < 3 || ly > 9) return false;
      if (lx === 0 && (ly === 3 || ly === 9)) return false;
      return true;
    },
    fur,
  );
  // ear
  px(g, ox + 6, oy + 1, fur.o);
  px(g, ox + 7, oy + 1, fur.o);
  px(g, ox + 6, oy + 2, fur.n);
  px(g, ox + 7, oy + 2, fur.o);
  // muzzle
  for (let y = 5; y <= 8; y++) px(g, ox + 1, oy + y, fur.n);
  px(g, ox + 2, oy + 8, fur.n);
  px(g, ox + 1, oy + 5, fur.d ?? fur.f);
  px(g, ox + 0, oy + 6, fur.o);
  if (fur.nose) px(g, ox + 1, oy + 6, fur.nose);
  // eye
  if (eyesClosed) {
    // a contented '^' — eyes shut, soaking
    px(g, ox + 3, oy + 5, INK);
    px(g, ox + 4, oy + 4, INK);
    px(g, ox + 5, oy + 5, INK);
  } else {
    px(g, ox + 3, oy + 5, INK);
    px(g, ox + 3, oy + 4, fur.f);
  }
  if (fur.k) px(g, ox + 4, oy + 7, fur.k);
  // neck crease
  px(g, ox + 7, oy + 8, fur.d ?? fur.n);
  px(g, ox + 8, oy + 7, fur.d ?? fur.n);
}

const CAPY_FUR: CapyFur = {
  o: BRICK_DARK,
  f: BRICK,
  l: CLAY,
  d: CLAY_DARK,
  n: CLAY_DARK,
  nose: INK,
};
const BRONZE: CapyFur = {
  o: WOOD_SHADOW,
  f: WOOD,
  d: WOOD_DARK,
  n: WOOD_DARK,
  nose: GOLD_LIGHT, // rubbed shiny by every passer-by, like all bronze statues
};

// ════════════════════════════════════════════════════════════════
// 1. reading_armchair — tufted wingback in teal velvet, 16x32, 1x1,
//    chairs, 4 orientations. A cream throw pillow leans in the corner.
// ════════════════════════════════════════════════════════════════
const VELVET: Mat = { o: TEAL_DARK, f: TEAL, l: TEAL_LIGHT };
const PILLOW: Mat = { o: PINK_DARK, f: PINK, l: PINK_LIGHT };

/** Wingback silhouette: narrow crest, flared wing ears, then the waist. */
function wingback(x: number, y: number): boolean {
  if (y === 8) return x >= 3 && x <= 12;
  if (y === 9) return x >= 2 && x <= 13;
  if (y >= 10 && y <= 17) return x >= 1 && x <= 14;
  if (y >= 18 && y <= 28) return x >= 2 && x <= 13;
  return false;
}

/** A tufting button: dark dimple with a lit pixel of velvet above it. */
function button(g: Grid, x: number, y: number): void {
  px(g, x, y, TEAL_DARK);
  px(g, x, y - 1, TEAL_LIGHT);
}

/** Diamond throw pillow (a 5x5 square turned 45°) with a centre button. */
function pillow(g: Grid, cx: number, cy: number): void {
  shade(g, (x, y) => Math.abs(x - cx) + Math.abs(y - cy) <= 2, PILLOW);
  px(g, cx, cy, PINK_DARK);
}

/** Turned walnut leg stubs. */
function chairLegs(g: Grid): void {
  for (const x of [2, 12]) {
    rect(g, x, 29, x + 1, 30, WOOD_DARK);
    px(g, x, 29, WOOD);
  }
}

/** The cream throw folded over the wing — same drape the back view shows. */
const THROW = ['ccc...', 'cCCcc.', 'cCCCCc', '.dCCCd', '..dCCd', '...dCd', '....d.'];
const THROW_LEGEND = { c: CREAM_DARK, C: CREAM, d: CREAM_DARK };

function throwFront(g: Grid): void {
  // mirrored onto the viewer's LEFT wing (the sitter's right, as in the back view)
  stamp(
    g,
    1,
    8,
    THROW.map((r) => [...r].reverse().join('')),
    THROW_LEGEND,
  );
  px(g, 3, 13, PINK); // the woven stripe
  px(g, 2, 12, PINK);
}

const ARMCHAIR = (() => {
  const g = grid(16, 32);
  shade(g, (x, y) => y <= 23 && wingback(x, y), VELVET); // back + wings
  // diamond button tufting, staggered rows
  for (const [x, y] of [
    [4, 11],
    [8, 11],
    [12, 11],
    [6, 13],
    [10, 13],
    [4, 15],
    [8, 15],
    [12, 15],
  ])
    button(g, x, y);
  box(g, 1, 23, 14, 28, { o: TEAL_DARK, f: TEAL, d: TEAL_DARK }); // skirt
  box(g, 4, 19, 11, 25, VELVET); // seat cushion
  rect(g, 5, 21, 10, 21, TEAL_LIGHT); // front lip catches the light
  rect(g, 5, 24, 10, 24, TEAL_DARK);
  box(g, 0, 18, 4, 27, VELVET); // rolled arms
  box(g, 11, 18, 15, 27, VELVET);
  px(g, 2, 20, TEAL_DARK);
  px(g, 13, 20, TEAL_DARK);
  pillow(g, 5, 18); // leaning into the left corner
  throwFront(g);
  chairLegs(g);
  return g;
})();

const ARMCHAIR_BACK = (() => {
  const g = grid(16, 32);
  box(g, 0, 18, 4, 27, VELVET);
  box(g, 11, 18, 15, 27, VELVET);
  shade(g, wingback, VELVET);
  // piping: a dark line two pixels in from the rim
  const deep = (x: number, y: number, k: number) =>
    wingback(x - k, y) && wingback(x + k, y) && wingback(x, y - k) && wingback(x, y + k);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 16; x++) if (deep(x, y, 2) && !deep(x, y, 3)) px(g, x, y, TEAL_DARK);
  // the lower back falls into shadow
  for (let y = 25; y <= 27; y++)
    for (let x = 0; x < 16; x++)
      if (deep(x, y, 1) && !(deep(x, y, 2) && !deep(x, y, 3))) px(g, x, y, TEAL_DARK);
  // a folded cream throw over the top-right wing
  stamp(g, 9, 8, THROW, THROW_LEGEND);
  px(g, 12, 13, PINK); // a stripe woven into the throw
  px(g, 13, 12, PINK);
  chairLegs(g);
  return g;
})();

const ARMCHAIR_RIGHT = (() => {
  const g = grid(16, 32);
  box(g, 1, 22, 14, 28, { o: TEAL_DARK, f: TEAL, d: TEAL_DARK }); // skirt
  box(g, 5, 16, 14, 22, VELVET); // seat cushion, lit lip on top
  // back seen edge-on, with the wing jutting forward over the seat
  shade(
    g,
    (x, y) =>
      (x >= 1 && x <= 5 && y >= 8 && y <= 26) ||
      (x >= 1 && x <= 7 && y >= 10 && y <= 16) ||
      (x === 8 && y >= 11 && y <= 15),
    VELVET,
  );
  button(g, 3, 12);
  button(g, 3, 16);
  // the wing's front edge, rimmed dark so it parts from the seat cushion
  rect(g, 8, 11, 8, 15, TEAL_DARK);
  px(g, 7, 10, TEAL_DARK);
  px(g, 7, 16, TEAL_DARK);
  rect(g, 7, 11, 7, 15, TEAL);
  // the cream throw folded over the top of the backrest
  stamp(g, 1, 8, ['cCCc.', 'dCCCd', '.dd..'], THROW_LEGEND);
  px(g, 3, 9, PINK);
  pillow(g, 8, 16); // tilted, sitting on the seat against the wing
  box(g, 3, 19, 12, 25, VELVET); // near arm roll — stops short of the seat front
  chairLegs(g);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 2. side_table — round walnut pedestal table, 16x16, 1x1, isDesk.
// ════════════════════════════════════════════════════════════════
const SIDE_TABLE = (() => {
  const g = grid(16, 16);
  // three-toed foot, all toes joined at the pedestal base
  line(g, 7, 12, 4, 14, WOOD_DARK);
  line(g, 6, 12, 3, 14, WOOD_DARK);
  line(g, 8, 12, 11, 14, WOOD_DARK);
  line(g, 9, 12, 12, 14, WOOD_DARK);
  px(g, 3, 14, WOOD_SHADOW);
  px(g, 12, 14, WOOD_SHADOW);
  rect(g, 7, 12, 8, 15, WOOD_DARK);
  rect(g, 7, 15, 8, 15, WOOD_SHADOW);
  // turned pedestal with a bulge
  rect(g, 7, 9, 8, 12, WOOD_DARK);
  rect(g, 6, 10, 9, 11, WOOD_DARK);
  px(g, 6, 10, WOOD);
  px(g, 7, 10, WOOD_LIGHT);
  px(g, 7, 9, WOOD);
  // a thick dark edge band under a bright top
  oval(g, 7.5, 6, 7.2, 3.6, { o: WOOD_SHADOW, f: WOOD_DARK });
  oval(g, 7.5, 4.4, 7.2, 3.6, { o: WOOD_DARK, f: WOOD_SURFACE });
  for (const [x, y] of [
    [3, 3],
    [4, 2],
    [5, 2],
    [6, 2],
    [2, 4],
  ])
    px(g, x, y, GOLD_DARK); // lit rim (lighter than the WOOD_SURFACE top)
  // a faint coaster ring where the evening tea always goes
  for (const [x, y] of [
    [10, 3],
    [11, 3],
    [9, 4],
    [12, 4],
    [10, 5],
    [11, 5],
  ])
    px(g, x, y, WOOD);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 3. globe — terrestrial globe on a brass half-meridian, tilted on its
//    axis, on a walnut tripod, 16x32, 1x1, decor. A red pin marks "you
//    are here".
// ════════════════════════════════════════════════════════════════
const GLOBE = (() => {
  const g = grid(16, 32);
  // tripod: collar, two splayed legs and a short front leg
  rect(g, 7, 21, 8, 24, WOOD);
  px(g, 7, 21, WOOD_LIGHT);
  rect(g, 8, 21, 8, 24, WOOD_DARK);
  line(g, 5, 27, 2, 30, WOOD);
  line(g, 6, 27, 3, 30, WOOD_DARK);
  line(g, 9, 27, 12, 30, WOOD);
  line(g, 10, 27, 13, 30, WOOD_DARK);
  rect(g, 7, 27, 8, 29, WOOD_DARK);
  rect(g, 7, 27, 7, 28, WOOD);
  rect(g, 5, 25, 10, 26, WOOD);
  rect(g, 5, 26, 10, 26, WOOD_DARK);
  px(g, 5, 25, WOOD_LIGHT);
  px(g, 6, 25, WOOD_LIGHT);
  // half-meridian: only the arc on the right of the ~23° tilted axis
  const ax = 6;
  const ay = 6;
  const vx = 3;
  const vy = 15;
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 16; x++) {
      const d = ell(x, y, 7.5, 13.5, 7.2, 7.6);
      const side = (x - ax) * vy - (y - ay) * vx;
      if (d <= 1 && d > 0.72 && side >= 0) px(g, x, y, y < 12 ? GOLD : GOLD_DARK);
    }
  // ball
  oval(g, 7.5, 13.5, 5.6, 5.6, { o: NAVY, f: BLUE, l: SKY });
  const land: [number, number][] = [
    [4, 10],
    [5, 10],
    [5, 11],
    [6, 11],
    [4, 12],
    [5, 12],
    [6, 12],
    [5, 13],
    [6, 14],
    [6, 15],
    [9, 12],
    [10, 12],
    [9, 13],
    [10, 13],
    [11, 13],
    [10, 14],
    [10, 15],
    [9, 16],
    [8, 9],
  ];
  for (const [x, y] of land) px(g, x, y, LEAF);
  px(g, 6, 15, LEAF_DARK);
  px(g, 10, 15, LEAF_DARK);
  px(g, 9, 16, LEAF_DARK);
  px(g, 10, 13, RED); // you are here
  px(g, 10, 12, PAPER);
  // equator tick on the meridian + tilted axis caps
  px(g, 14, 12, GOLD_DARK);
  px(g, 15, 12, GOLD_DARK);
  px(g, 6, 6, GOLD_LIGHT);
  px(g, 6, 7, GOLD_DARK);
  px(g, 9, 20, GOLD_DARK);
  px(g, 9, 21, GOLD_DARK);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 4. book_stack — three books, reading glasses and a steaming mug,
//    16x16, 1x1, surface.
// ════════════════════════════════════════════════════════════════
const BOOK_STACK = (() => {
  const g = grid(16, 16);
  const book = (x0: number, x1: number, y: number, base: string, dark: string, band: string) => {
    box(g, x0, y, x1, y + 3, { o: dark, f: base }, false);
    rect(g, x1 - 2, y + 1, x1 - 1, y + 2, CREAM); // page block at the fore-edge
    px(g, x1 - 2, y + 2, CREAM_DARK);
    px(g, x0 + 2, y + 2, band);
    px(g, x0 + 3, y + 2, band);
  };
  book(1, 14, 11, RED, BRICK_DARK, GOLD);
  book(2, 12, 8, TEAL, TEAL_DARK, CREAM);
  book(3, 13, 5, PURPLE, PURPLE_DARK, GOLD);
  // ribbon bookmark from the teal book
  px(g, 9, 12, GOLD);
  px(g, 9, 13, GOLD);
  px(g, 9, 14, GOLD_DARK);
  // reading glasses on top
  stamp(g, 3, 3, ['oo.oo', 'oo.oo'], { o: IRON_DARK });
  px(g, 4, 3, SKY);
  px(g, 7, 3, SKY);
  px(g, 5, 3, IRON_DARK);
  // mug + steam
  box(g, 9, 2, 12, 5, { o: SILVER, f: PAPER }, false);
  rect(g, 10, 2, 11, 2, WOOD_SHADOW); // coffee
  rect(g, 10, 4, 11, 4, RED); // stripe
  px(g, 13, 3, SILVER);
  px(g, 13, 4, SILVER);
  // steam: a 2px curl that survives campus zoom
  px(g, 10, 1, ICE);
  px(g, 11, 1, PAPER);
  px(g, 11, 0, PAPER);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 5. library_shelf — tall two-bay bookcase with crown moulding, a brass
//    rail and a slim rolling ladder, 32x48, 2x1, storage. A plant, boxed
//    archives and a tiny capybara figurine break up the books.
//    Right = turned to face right (1x2, 16x64): the side panel, the book
//    spines edge-on along the open face, and the ladder from the side.
// ════════════════════════════════════════════════════════════════
const BOOK_COLS = [
  RED,
  BLUE,
  GREEN,
  GOLD_DARK,
  PURPLE,
  TEAL,
  ORANGE,
  NAVY,
  BRICK,
  CREAM_DARK,
  PINK,
];

function shadeOf(c: string): string {
  const m: Record<string, string> = {
    [RED]: BRICK_DARK,
    [BLUE]: NAVY,
    [GREEN]: LEAF_DARK,
    [GOLD_DARK]: WOOD,
    [PURPLE]: PURPLE_DARK,
    [TEAL]: TEAL_DARK,
    [ORANGE]: CLAY,
    [NAVY]: NAVY_DARK,
    [BRICK]: BRICK_DARK,
    [PINK]: PINK_DARK,
    [CREAM_DARK]: WOOD,
  };
  return m[c] ?? c;
}

/** The lit tone a spine's top catches from the top-left light. */
function lightOf(c: string): string | undefined {
  const m: Record<string, string> = {
    [TEAL]: TEAL_LIGHT,
    [GREEN]: GREEN_LIGHT,
    [BLUE]: SKY,
    [GOLD_DARK]: GOLD,
    [PINK]: PINK_LIGHT,
    [NAVY]: BLUE,
    [BRICK]: CLAY,
    [CREAM_DARK]: CREAM,
    [RED]: ORANGE,
  };
  return m[c];
}

function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/** Tiny capybara figurine, head lower than the back, 9x6. */
const FIGURINE = ['...o.ooo.', '.ooooCCCo', 'oCeCCCCCo', 'nCCCCCCCo', '.ooooooo.', '..o...o..'];

const LIBRARY_SHELF = (() => {
  const g = grid(32, 48);
  box(g, 0, 1, 31, 4, { o: WOOD_DARK, f: WOOD, l: WOOD_LIGHT }); // crown
  box(g, 1, 4, 30, 44, { o: WOOD_DARK, f: WOOD, l: WOOD_LIGHT }, false); // carcass
  rect(g, 0, 4, 31, 4, WOOD_DARK);
  const shelves = [
    [7, 16],
    [19, 28],
    [31, 40],
  ];
  const bays = [
    [3, 14],
    [17, 28],
  ];
  let k = 0;
  const rnd = seeded(7);
  shelves.forEach(([top, bot], si) => {
    bays.forEach(([x0, x1], bi) => {
      rect(g, x0, top, x1, bot, WOOD_SHADOW);
      rect(g, x0, bot + 1, x1, bot + 1, WOOD_LIGHT); // shelf board
      let x = x0;
      const which = si * 2 + bi;
      if (which === 1) {
        // plant at the left end of the right bay (clear of the ladder)
        box(g, x0, bot - 3, x0 + 3, bot, { o: CLAY_DARK, f: CLAY }, false);
        for (const [dx, dy, c] of [
          [0, -4, LEAF],
          [1, -5, LEAF],
          [2, -6, LEAF_DARK],
          [3, -5, LEAF],
          [4, -4, LEAF],
          [1, -4, LEAF_DARK],
          [2, -4, LEAF],
          [2, -5, LEAF],
          [-1, -3, LEAF],
          [4, -3, LEAF_DARK],
        ] as [number, number, string][])
          px(g, x0 + dx, bot + dy, c);
        x = x0 + 6;
      }
      if (which === 2) {
        // capybara figurine keeping the books upright
        stamp(g, x0, bot - 5, FIGURINE, { o: BRICK_DARK, C: CLAY, e: INK, n: WOOD_SHADOW });
        x = x0 + 10;
      }
      if (which === 3) {
        // books lying flat
        box(g, x0, bot - 2, x0 + 6, bot, { o: BRICK_DARK, f: RED }, false);
        box(g, x0 + 1, bot - 4, x0 + 5, bot - 2, { o: NAVY_DARK, f: NAVY }, false);
        px(g, x0 + 2, bot - 3, BLUE);
        x = x0 + 8;
      }
      if (which === 4) {
        // archive boxes with lids and small labels
        for (const bx of [x0, x0 + 6]) {
          box(g, bx, bot - 6, bx + 5, bot, { o: CREAM_DARK, f: CREAM }, false);
          rect(g, bx + 1, bot - 4, bx + 4, bot - 4, CREAM_DARK); // lid line
          rect(g, bx + 2, bot - 2, bx + 3, bot - 2, PAPER);
        }
        x = x0 + 12;
      }
      while (x <= x1) {
        const w = rnd() < 0.3 ? 1 : 2;
        if (x + w - 1 > x1) break;
        const h = 7 + Math.floor(rnd() * 3);
        const c = BOOK_COLS[k++ % BOOK_COLS.length];
        const t = bot - h + 1;
        rect(g, x, t, x + w - 1, bot, c);
        if (w === 2 && rnd() < 0.5) px(g, x, t + 2, GOLD); // spine band
        if (w === 2) rect(g, x + 1, t, x + 1, bot, shadeOf(c));
        const lit = lightOf(c);
        if (lit && rnd() < 0.6) px(g, x, t, lit);
        x += w;
        if (rnd() < 0.05) x++; // gap
      }
    });
  });
  // centre divider
  rect(g, 15, 7, 16, 41, WOOD);
  rect(g, 16, 7, 16, 41, WOOD_DARK);
  // plinth + feet
  rect(g, 1, 42, 30, 44, WOOD_DARK);
  rect(g, 2, 42, 29, 42, WOOD);
  rect(g, 2, 45, 3, 46, WOOD_SHADOW);
  rect(g, 28, 45, 29, 46, WOOD_SHADOW);
  // brass rail: dark brass, catching the light only at its left end
  rect(g, 2, 5, 29, 5, GOLD_DARK);
  rect(g, 2, 5, 7, 5, GOLD);
  px(g, 2, 5, GOLD_LIGHT);
  // slim rolling ladder, kept inside the carcass
  const rail = (x0: number) => {
    line(g, x0, 5, x0 + 2, 44, WOOD_LIGHT);
    line(g, x0 + 1, 5, x0 + 3, 44, WOOD_DARK);
  };
  rail(23);
  rail(27);
  for (let y = 11; y <= 41; y += 7) {
    const off = Math.round(((y - 5) / 39) * 2);
    rect(g, 25 + off, y, 26 + off, y, WOOD_LIGHT);
    rect(g, 25 + off, y + 1, 26 + off, y + 1, WOOD_DARK);
  }
  px(g, 23, 4, GOLD_LIGHT); // hooks on the rail
  px(g, 27, 4, GOLD_LIGHT);
  px(g, 26, 45, INK); // wheels
  px(g, 30, 45, INK);
  return g;
})();

const LIBRARY_SHELF_RIGHT = (() => {
  const g = grid(16, 64);
  box(g, 0, 1, 15, 4, { o: WOOD_DARK, f: WOOD_SURFACE, l: GOLD_DARK }); // crown, lit top
  box(g, 1, 4, 14, 60, { o: WOOD_DARK, f: WOOD, l: WOOD_LIGHT }, false);
  rect(g, 0, 4, 15, 4, WOOD_DARK);
  // side panel: two recessed panels (shadow top-left, lit bottom-right)
  for (const [y0, y1] of [
    [8, 30],
    [34, 54],
  ]) {
    rect(g, 3, y0, 8, y0, WOOD_DARK);
    rect(g, 3, y0, 3, y1, WOOD_DARK);
    rect(g, 4, y1, 8, y1, WOOD_LIGHT);
    rect(g, 8, y0 + 1, 8, y1, WOOD_LIGHT);
    // recess depth: the moulding throws a shadow onto the sunken field
    rect(g, 4, y0 + 1, 7, y0 + 1, WOOD_SHADOW);
    rect(g, 4, y0 + 2, 4, y1 - 1, WOOD_SHADOW);
    rect(g, 5, y0 + 2, 7, y1 - 1, WOOD_DARK);
    rect(g, 5, y0 + 2, 7, y0 + 2, WOOD);
  }
  // a little brass reading plate on the upper panel
  rect(g, 5, 14, 6, 15, GOLD_DARK);
  px(g, 5, 14, GOLD);
  // open face: shelf boards and the books' spines edge-on
  rect(g, 10, 5, 14, 56, WOOD_SHADOW);
  rect(g, 10, 5, 10, 56, WOOD_DARK);
  const rnd = seeded(11);
  let k = 3;
  for (const [top, bot] of [
    [6, 22],
    [24, 40],
    [42, 56],
  ]) {
    rect(g, 10, bot + 1, 14, bot + 1, WOOD_LIGHT);
    let y = top + 1;
    while (y + 1 <= bot) {
      const c = BOOK_COLS[k++ % BOOK_COLS.length];
      const depth = rnd() < 0.35 ? 12 : 11; // some books stand proud
      rect(g, depth, y, 13, y + 1, c);
      rect(g, depth, y + 1, 13, y + 1, shadeOf(c));
      const lit = lightOf(c);
      if (lit) px(g, depth, y, lit);
      y += 2;
      if (rnd() < 0.12) y++; // a gap
    }
  }
  rect(g, 1, 57, 14, 60, WOOD_DARK);
  rect(g, 2, 57, 13, 57, WOOD);
  rect(g, 2, 61, 3, 62, WOOD_SHADOW);
  rect(g, 11, 61, 12, 62, WOOD_SHADOW);
  // brass rail along the open face, then the rolling ladder hooked onto it:
  // two brass rails and rungs leaning on the books, as on the front
  rect(g, 10, 5, 14, 5, GOLD_DARK);
  px(g, 10, 5, GOLD);
  line(g, 11, 6, 12, 59, GOLD_DARK);
  line(g, 14, 6, 14, 59, WOOD_DARK); // far rail falls into the shade
  px(g, 11, 6, GOLD_LIGHT);
  px(g, 14, 6, GOLD_LIGHT);
  for (let y = 11; y <= 55; y += 7) {
    const x0 = y < 33 ? 12 : 13;
    rect(g, x0, y, 13, y, GOLD_DARK);
  }
  px(g, 12, 60, INK); // wheels
  px(g, 14, 60, INK);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 6. round_table — round walnut meeting table with a brass compass-star
//    inlay and an old mug ring, 32x32, 2x2, isDesk.
// ════════════════════════════════════════════════════════════════
const ROUND_TABLE = (() => {
  const g = grid(32, 32);
  // pedestal + X-shaped foot
  rect(g, 13, 22, 18, 28, WOOD_DARK);
  rect(g, 14, 22, 14, 27, WOOD);
  line(g, 13, 27, 6, 29, WOOD_DARK);
  line(g, 13, 28, 6, 30, WOOD_SHADOW);
  line(g, 18, 27, 25, 29, WOOD_DARK);
  line(g, 18, 28, 25, 30, WOOD_SHADOW);
  rect(g, 13, 28, 18, 29, WOOD_SHADOW);
  // a 3px apron below the top gives it thickness
  oval(g, 15.5, 15, 15.4, 11.2, { o: WOOD_SHADOW, f: WOOD_DARK });
  oval(g, 15.5, 12, 15.4, 11.2, { o: WOOD_DARK, f: WOOD_SURFACE });
  const r = (x: number, y: number) => Math.sqrt(ell(x, y, 15.5, 12, 15.4, 11.2));
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const v = r(x, y);
      if (v >= 0.92) continue;
      // a short lit arc on the rim, top-left only (GOLD_DARK: lighter than the top)
      if (v > 0.8 && x < 12 && y < 8 && (x - 15.5) / 15.4 + (y - 12) / 11.2 < -0.95)
        px(g, x, y, GOLD_DARK);
    }
  // compass star: four points, gold centre
  stamp(g, 12, 8, ['...y...', '...y...', '..ygy..', 'yyGGGyy', '..yGy..', '...y...', '...y...'], {
    y: GOLD_DARK,
    G: GOLD,
    g: GOLD_LIGHT,
  });
  // a mug ring someone left behind
  for (const [x, y] of [
    [20, 14],
    [21, 14],
    [19, 15],
    [22, 15],
    [20, 16],
    [21, 16],
  ])
    px(g, x, y, WOOD_DARK);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 7. lectern — walnut podium with a gooseneck mic and a gold campus seal,
//    16x32, 1x1, misc. Back = the speaker's side: open notes, a glass of
//    water on the ledge and a stash of printouts.
// ════════════════════════════════════════════════════════════════
const LECTERN = (() => {
  const g = grid(16, 32);
  // slanted top lip: a sliver of the reading surface, a page peeking over
  box(g, 1, 6, 14, 10, { o: WOOD_DARK, f: WOOD, l: WOOD_LIGHT }, false);
  rect(g, 2, 7, 13, 7, WOOD_SURFACE);
  px(g, 4, 6, PAPER);
  px(g, 5, 6, PAPER);
  px(g, 5, 5, PAPER);
  // gooseneck mic clamped to the lip, curving up-left to its head
  rect(g, 11, 6, 12, 6, IRON_DARK);
  px(g, 12, 5, IRON);
  px(g, 12, 4, IRON);
  rect(g, 10, 2, 11, 3, IRON_DARK);
  px(g, 10, 2, IRON);
  px(g, 12, 2, RED); // live
  // body tapers slightly
  shade(
    g,
    (x, y) => y >= 10 && y <= 27 && x >= 2 + (y > 18 ? 1 : 0) && x <= 13 - (y > 18 ? 1 : 0),
    { o: WOOD_DARK, f: WOOD, l: WOOD_LIGHT },
  );
  // recessed panel framing the seal (shadow top-left, lit bottom-right)
  rect(g, 4, 12, 11, 12, WOOD_DARK);
  rect(g, 4, 12, 4, 25, WOOD_DARK);
  rect(g, 5, 25, 11, 25, WOOD_LIGHT);
  rect(g, 11, 13, 11, 25, WOOD_LIGHT);
  // campus seal: a small brass roundel with a star struck into it
  stamp(g, 5, 15, ['.yyy.', 'yLsGy', 'ysssy', 'yGsGy', '.yyy.'], {
    y: GOLD_DARK,
    G: GOLD,
    L: GOLD_LIGHT,
    s: WOOD_DARK,
  });
  // plinth
  box(g, 1, 27, 14, 30, { o: WOOD_SHADOW, f: WOOD_DARK, l: WOOD }, false);
  return g;
})();

const LECTERN_BACK = (() => {
  const g = grid(16, 32);
  box(g, 1, 6, 14, 12, { o: WOOD_DARK, f: WOOD_SURFACE, l: GOLD_DARK }, false); // reading slope
  // open notes
  rect(g, 3, 7, 7, 10, PAPER);
  rect(g, 8, 7, 12, 10, PAPER);
  px(g, 7, 7, CREAM_DARK);
  px(g, 8, 7, CREAM_DARK);
  rect(g, 4, 8, 6, 8, STEEL_LIGHT);
  rect(g, 4, 10, 5, 10, STEEL_LIGHT);
  rect(g, 9, 8, 11, 8, STEEL_LIGHT);
  rect(g, 9, 9, 10, 9, STEEL_LIGHT);
  line(g, 9, 11, 12, 8, BLUE); // pen
  // mic from behind
  line(g, 4, 6, 3, 3, IRON);
  rect(g, 3, 1, 4, 2, INK);
  // back body with an open shelf
  box(g, 2, 12, 13, 27, { o: WOOD_DARK, f: WOOD, l: WOOD_LIGHT }, false);
  rect(g, 4, 15, 11, 23, WOOD_SHADOW);
  rect(g, 4, 24, 11, 24, WOOD_LIGHT);
  rect(g, 5, 20, 10, 23, PAPER); // printouts
  rect(g, 5, 21, 10, 21, CREAM);
  px(g, 10, 20, CREAM_DARK); // dog-eared corner
  px(g, 6, 19, PAPER);
  // water glass standing on the lip, with its shadow
  rect(g, 12, 3, 13, 5, ICE);
  px(g, 13, 3, PAPER);
  px(g, 12, 6, SKY);
  px(g, 13, 6, SKY);
  box(g, 1, 27, 14, 30, { o: WOOD_SHADOW, f: WOOD_DARK, l: WOOD }, false);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 8. projector_screen — pull-down screen in a steel casing with a slide
//    whose chart only goes up, 32x32, 2x1 wall.
// ════════════════════════════════════════════════════════════════
const PROJECTOR_SCREEN = (() => {
  const g = grid(32, 32);
  box(g, 0, 1, 31, 4, { o: STEEL_DARK, f: SILVER, l: SILVER_LIGHT });
  // screen
  box(g, 2, 4, 29, 25, { o: SILVER, f: PAPER }, false);
  rect(g, 3, 5, 28, 5, ICE); // shadow under casing
  rect(g, 3, 6, 5, 6, ICE); // sheen
  px(g, 3, 7, ICE);
  // slide: title + chart
  rect(g, 5, 7, 16, 8, BLUE);
  rect(g, 5, 10, 11, 10, STEEL_LIGHT);
  rect(g, 5, 22, 26, 22, STEEL);
  rect(g, 5, 12, 5, 22, STEEL);
  const bars: [number, number, string, string][] = [
    [8, 3, ORANGE, CLAY],
    [12, 5, GOLD, GOLD_DARK],
    [16, 7, TEAL_LIGHT, TEAL],
    [20, 10, GREEN_LIGHT, GREEN],
  ];
  for (const [x, h, c, d] of bars) {
    rect(g, x, 22 - h, x + 2, 21, c);
    rect(g, x + 2, 22 - h, x + 2, 21, d);
  }
  // trend: even 2px steps, then an arrowhead
  for (let k = 0; k < 8; k++) rect(g, 9 + 2 * k, 17 - k, 10 + 2 * k, 17 - k, RED);
  rect(g, 22, 9, 24, 9, RED);
  px(g, 24, 8, RED);
  px(g, 24, 11, RED);
  // weighted bottom bar + pull cord
  box(g, 1, 25, 30, 26, { o: IRON_DARK, f: STEEL_DARK }, false);
  rect(g, 15, 27, 15, 28, IRON);
  stamp(g, 14, 29, ['.o.', 'o.o', '.o.'], { o: IRON_DARK });
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 9. ship_gong — lacquered gong frame with a brass gong and a felt
//    mallet, 16x32, 1x1, misc. Hit it when something ships.
// ════════════════════════════════════════════════════════════════
const SHIP_GONG = (() => {
  const g = grid(16, 32);
  const LACQ: Mat = { o: BRICK_DARK, f: RED };
  box(g, 1, 5, 2, 29, LACQ, false);
  box(g, 13, 5, 14, 29, LACQ, false);
  // crossbar with upturned pagoda curls
  box(g, 0, 3, 15, 5, { o: BRICK_DARK, f: RED, l: ORANGE }, false);
  px(g, 0, 1, BRICK_DARK);
  px(g, 0, 2, BRICK_DARK);
  px(g, 1, 2, RED);
  px(g, 15, 1, BRICK_DARK);
  px(g, 15, 2, BRICK_DARK);
  px(g, 14, 2, RED);
  px(g, 7, 2, GOLD_DARK);
  px(g, 8, 2, GOLD_DARK);
  // feet
  rect(g, 0, 28, 3, 30, BRICK_DARK);
  rect(g, 12, 28, 15, 30, BRICK_DARK);
  rect(g, 1, 28, 2, 28, BRICK);
  rect(g, 13, 28, 14, 28, BRICK);
  // ropes, running down until the gong rim hides them
  rect(g, 5, 6, 5, 11, CREAM_DARK);
  rect(g, 10, 6, 10, 11, CREAM_DARK);
  // gong: plain face, one clean ring, a raised boss, a specular arc
  const cx = 7.5;
  const cy = 14.5;
  oval(g, cx, cy, 5.6, 5.6, { o: GOLD_DARK, f: GOLD });
  const r = (x: number, y: number) => Math.hypot(x - cx, y - cy);
  for (let y = 8; y < 22; y++)
    for (let x = 2; x < 14; x++) {
      const inRing = r(x, y) <= 4.2;
      const edge = r(x - 1, y) > 4.2 || r(x + 1, y) > 4.2 || r(x, y - 1) > 4.2 || r(x, y + 1) > 4.2;
      if (inRing && edge) px(g, x, y, GOLD_DARK);
    }
  box(g, 6, 13, 9, 16, { o: GOLD_DARK, f: GOLD }, true);
  px(g, 7, 14, GOLD_LIGHT);
  for (const [x, y] of [
    [5, 13],
    [5, 12],
    [6, 11],
  ])
    px(g, x, y, GOLD_LIGHT);
  // felt mallet leaning against the right post
  line(g, 9, 30, 11, 24, WOOD);
  line(g, 10, 30, 12, 24, WOOD_DARK);
  box(g, 9, 20, 12, 23, { o: CREAM_DARK, f: CREAM }, true);
  rect(g, 10, 22, 11, 22, CREAM_DARK);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 10. focus_booth — glass phone/focus booth: navy felt frame, warm
//    felt-panelled interior with a shelf, glowing laptop, a steaming mug
//    and a stool, a lit ON AIR lamp on the roof, 16x48, 1x1, misc.
// ════════════════════════════════════════════════════════════════
//     Animated (4 frames): the ON AIR lamp breathes (full → softer → dim →
//     softer) and the mug's steam rises a pixel a frame, puffs spaced one
//     loop apart so the column never jumps.
const FOCUS_BOOTH_FRAMES = 4;
const focusBooth = (phase: number): Grid => {
  const g = grid(16, 48);
  box(g, 0, 3, 15, 45, { o: NAVY_DARK, f: NAVY, l: SCREEN_SHADOW });
  // roof sign, lit: a warm halo around the red lamp
  rect(g, 4, 5, 11, 6, NAVY_DARK);
  // the dim step keeps the letters, just a tone darker on a darker field,
  // so it reads as the same sign dimmed, not a different blank one
  const glow = [2, 1, 0, 1][phase]; // 2 full, 1 softer, 0 dim
  const edge = glow === 2 ? ORANGE : glow === 1 ? RED : BRICK_DARK;
  rect(g, 5, 5, 5, 6, edge);
  rect(g, 10, 5, 10, 6, edge);
  rect(g, 6, 5, 9, 6, glow ? RED : BRICK);
  px(g, 6, 5, glow ? PINK_LIGHT : RED);
  px(g, 8, 5, glow ? PINK_LIGHT : RED);
  if (glow === 2) {
    px(g, 7, 4, GOLD_LIGHT);
    px(g, 8, 4, GOLD_LIGHT);
  }
  // acoustic felt back wall: vertical panels with dark grooves
  rect(g, 2, 8, 13, 41, CREAM_DARK);
  for (let x = 4; x <= 13; x += 3) rect(g, x, 14, x, 41, WOOD_LIGHT);
  // light strip falling off into a glow
  rect(g, 2, 8, 13, 9, LAMP_WARM);
  rect(g, 2, 10, 13, 10, GOLD_LIGHT);
  rect(g, 2, 11, 13, 13, CREAM);
  // shelf
  rect(g, 2, 24, 13, 25, WOOD);
  rect(g, 2, 24, 13, 24, WOOD_LIGHT);
  // laptop: lid tilted back on a dark hinge
  rect(g, 5, 18, 9, 21, IRON_DARK);
  rect(g, 6, 19, 8, 20, SCREEN_BLUE);
  rect(g, 5, 22, 9, 22, IRON_DARK);
  rect(g, 4, 23, 10, 23, STEEL);
  // steaming mug
  rect(g, 11, 21, 12, 23, PAPER);
  px(g, 12, 23, SILVER);
  px(g, 11, 21, WOOD_SHADOW);
  px(g, 13, 22, SILVER);
  for (let y = 16; y <= 20; y++)
    if ((y + phase) % 4 === 0) px(g, 11 + ((20 - y) % 2), y, y >= 19 ? ICE : PAPER);
  // a little succulent
  px(g, 2, 22, LEAF);
  px(g, 3, 21, LEAF);
  rect(g, 2, 23, 3, 23, CLAY);
  // stool
  box(g, 5, 31, 10, 33, { o: WOOD_DARK, f: WOOD_LIGHT }, true);
  rect(g, 7, 34, 8, 40, IRON);
  rect(g, 5, 40, 10, 40, IRON_DARK);
  // glass sheen, kept clear of the shelf and the stool
  for (let i = 0; i < 6; i++) px(g, 3 + i, 19 - i, PAPER);
  for (let i = 0; i < 4; i++) px(g, 3 + i, 30 - i, ICE);
  for (let i = 0; i < 3; i++) px(g, 10 + i, 37 - i, ICE);
  // mullion + handle
  rect(g, 1, 8, 1, 41, NAVY_DARK);
  rect(g, 14, 8, 14, 41, NAVY_DARK);
  rect(g, 13, 27, 13, 32, SILVER_LIGHT);
  rect(g, 12, 27, 12, 32, SILVER);
  // kick plate + feet
  rect(g, 1, 42, 14, 44, NAVY_DARK);
  rect(g, 2, 42, 13, 42, NAVY);
  rect(g, 1, 46, 2, 46, INK);
  rect(g, 13, 46, 14, 46, INK);
  return g;
};
const FOCUS_BOOTH = focusBooth(0);
const FOCUS_BOOTH_ANIM = {
  frames: Array.from({ length: FOCUS_BOOTH_FRAMES - 1 }, (_, i) => focusBooth(i + 1)),
  frameMs: 320,
};

// ════════════════════════════════════════════════════════════════
// 11. capybara_statue — polished bronze capybara on a stone plinth with a
//     fresh yuzu offering on its head, 16x32, 1x1, decor. The nose is
//     rubbed bright by everyone who walks past.
// ════════════════════════════════════════════════════════════════
const YUZU = ['.L..', '.yy.', 'ygGy', 'yGGy', '.yy.'];
const YUZU_LEGEND = { L: LEAF, y: GOLD_DARK, G: GOLD, g: GOLD_LIGHT };

const CAPYBARA_STATUE = (() => {
  const g = grid(16, 32);
  // stone block: pale top face, darker front face
  box(g, 1, 20, 14, 30, { o: STONE_DARK, f: STONE });
  rect(g, 2, 21, 13, 22, CREAM_DARK);
  rect(g, 2, 21, 6, 21, CREAM);
  rect(g, 2, 23, 13, 23, STONE_DARK);
  // inset brass plaque with two lines of engraving
  box(g, 4, 25, 11, 28, { o: GOLD_DARK, f: GOLD }, false);
  for (const x of [5, 6, 8, 9, 10]) px(g, x, 26, GOLD_DARK);
  for (const x of [5, 6, 7, 9]) px(g, x, 27, GOLD_DARK);
  capybara(g, 0, 9, BRONZE);
  // polished bronze catches the light only top-left: crown of the head, front of the back
  for (const [x, y] of [
    [1, 13],
    [2, 13],
    [3, 13],
    [8, 11],
    [9, 11],
    [10, 11],
  ])
    px(g, x, y, GOLD_DARK);
  // a proper ear notch standing off the outline
  px(g, 6, 9, WOOD_SHADOW);
  px(g, 7, 9, WOOD_SHADOW);
  px(g, 6, 10, WOOD_DARK);
  // verdigris gathered where rain sits: the neck crease and the belly line
  px(g, 8, 16, TEAL_DARK);
  px(g, 7, 17, TEAL_DARK);
  px(g, 9, 17, TEAL);
  px(g, 10, 17, TEAL_DARK);
  stamp(g, 2, 7, YUZU, { L: LEAF, y: CLAY, G: ORANGE, g: GOLD_LIGHT });
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 12. capybara_plush — a desk-sized plush capybara (12px, smaller than a
//     monitor) with a blush, a shiny button eye, a sewn-on tag and a yuzu
//     hat, 16x16, 1x1, surface.
// ════════════════════════════════════════════════════════════════
const CAPYBARA_PLUSH = (() => {
  const g = grid(16, 16);
  const ox = 2;
  const oy = 4;
  // stubby legs
  for (const lx of [2, 9]) {
    rect(g, ox + lx, oy + 9, ox + lx + 1, oy + 10, BRICK_DARK);
    px(g, ox + lx + 1, oy + 9, BRICK);
  }
  // barrel body + blocky head that sits lower and juts forward
  shade(
    g,
    (x, y) => {
      const lx = x - ox;
      const ly = y - oy;
      if (ell(lx, ly, 7.4, 5, 4.4, 4) <= 1) return true;
      if (lx < 0 || lx > 5 || ly < 3 || ly > 9) return false;
      if (lx === 0 && (ly === 3 || ly === 9)) return false;
      return true;
    },
    { o: BRICK_DARK, f: CLAY, l: ORANGE, d: BRICK },
  );
  // seam between head and body
  for (let ly = 3; ly <= 8; ly++) px(g, ox + 5, oy + ly, BRICK_DARK);
  // ear
  px(g, ox + 3, oy + 2, BRICK_DARK);
  px(g, ox + 4, oy + 2, BRICK_DARK);
  px(g, ox + 3, oy + 3, BRICK);
  // muzzle + nostril
  rect(g, ox + 1, oy + 6, ox + 1, oy + 8, BRICK);
  px(g, ox + 1, oy + 6, BRICK_DARK);
  // shiny button eye with a catchlight, blush
  px(g, ox + 2, oy + 5, INK);
  px(g, ox + 2, oy + 4, PAPER);
  px(g, ox + 3, oy + 7, PINK);
  // sewn-on tag at the rump
  px(g, ox + 11, oy + 6, PAPER);
  px(g, ox + 11, oy + 7, PAPER);
  px(g, ox + 12, oy + 7, PINK_LIGHT);
  stamp(g, ox, oy - 1, YUZU.slice(0, 4), YUZU_LEGEND); // hat sits on the head
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 13. capybara_onsen — THE showpiece. Hinoki hot-spring tub, 32x48, 2x2,
//     decor: a towel-hatted capybara soaks with its eyes closed among
//     floating yuzu, a bamboo spout pours in from the back, mossy rocks
//     sit at the corner and steam curls up into the overhang.
// ════════════════════════════════════════════════════════════════
//     Animated (6 frames): the steam curls climb 2px a frame (their wave
//     repeats every 12px and their gaps every 6px, so the loop is seamless), the yuzu
//     bob out of step, the spout's water runs and its splash pulses, and
//     the ripples drift. The tub, the capybara and the rocks never move.
const ONSEN_FRAMES = 6;
const capybaraOnsen = (phase: number): Grid => {
  const g = grid(32, 48);
  const HINOKI: Mat = { o: WOOD, f: CREAM, d: CREAM_DARK };
  // front face: darker grooves between the boards
  box(g, 1, 38, 30, 45, { o: WOOD, f: CREAM_DARK }, false);
  for (let x = 5; x <= 27; x += 4) rect(g, x, 40, x, 44, WOOD);
  rect(g, 2, 39, 29, 39, CREAM);
  rect(g, 2, 46, 3, 47, WOOD_DARK);
  rect(g, 28, 46, 29, 47, WOOD_DARK);
  // rim (top face)
  box(g, 1, 12, 30, 38, HINOKI, false);
  // inner wall + water
  rect(g, 4, 15, 27, 16, CREAM_DARK);
  rect(g, 3, 15, 3, 35, WOOD);
  rect(g, 28, 15, 28, 35, WOOD);
  rect(g, 3, 14, 28, 14, WOOD);
  rect(g, 3, 36, 28, 36, WOOD);
  rect(g, 4, 17, 27, 35, TEAL);
  // depth: the water darkens along the inner top and left walls
  rect(g, 4, 17, 27, 18, TEAL_DARK);
  rect(g, 4, 17, 5, 35, TEAL_DARK);
  // drifting ripples + a glint top-left
  const ripples: [number, number, number][] = [
    [21, 25, 4],
    [7, 30, 3],
    [17, 33, 4],
    [24, 19, 2],
  ];
  ripples.forEach(([x, y, w], k) => {
    const dx = phase < 3 ? 0 : k % 2 ? -1 : 1;
    rect(g, x + dx, y, x + dx + w - 1, y, TEAL_LIGHT);
  });
  rect(g, 6, 19, 7, 19, TEAL_LIGHT);
  px(g, 6, 20, TEAL_LIGHT);
  // capybara: only what clears the water line is drawn
  const cap = grid(32, 48);
  // sunk low: only the head, the ear and a sliver of back clear the water
  capybara(cap, 7, 18, CAPY_FUR, true);
  for (let y = 0; y <= 23; y++) for (let x = 0; x < 32; x++) if (cap[y][x]) g[y][x] = cap[y][x];
  for (let x = 13; x <= 21; x++) if (cap[20][x] && cap[20][x] !== BRICK_DARK) px(g, x, 20, CLAY); // lit back
  rect(g, 6, 24, 22, 24, TEAL_LIGHT); // water line around the neck
  px(g, 5, 23, TEAL_LIGHT);
  px(g, 23, 23, TEAL_LIGHT);
  // clean rings spreading from the soaking body
  rect(g, 6, 26, 9, 26, TEAL_LIGHT);
  rect(g, 19, 26, 22, 26, TEAL_LIGHT);
  rect(g, 11, 27, 16, 27, TEAL_LIGHT);
  // folded towel on its head
  stamp(g, 8, 18, ['.oooo.', 'oPPPPo', 'oIIIIo'], { o: SILVER, P: PAPER, I: ICE });
  // floating yuzu, each bobbing a pixel on its own beat
  const BOB = [0, 0, 0, 1, 1, 1];
  const yuzu: [number, number][] = [
    [22, 20],
    [24, 29],
    [5, 31],
    [13, 32],
    [26, 33],
  ];
  yuzu.forEach(([x, y0], k) => {
    const y = y0 + BOB[(phase + k * 2) % ONSEN_FRAMES];
    stamp(g, x, y, ['.yy.', 'ygGy', '.yy.'], YUZU_LEGEND);
    rect(g, x, y + 3, x + 3, y + 3, TEAL_LIGHT);
    if (k === 0) px(g, 23, y - 1, LEAF);
  });
  // mossy rocks seated on the back-left corner of the rim
  // (clamped inside the rim so its outline at x=1 stays unbroken)
  const ROCK: Mat = { o: STONE_DARK, f: STONE, l: CREAM_DARK };
  shade(g, (x, y) => x >= 2 && ell(x, y, 5, 13.5, 3.2, 2.6) <= 1, ROCK);
  shade(g, (x, y) => x >= 2 && ell(x, y, 9.5, 12.5, 2.6, 2.2) <= 1, ROCK);
  // moss caps on top of each rock
  rect(g, 4, 11, 6, 11, LEAF);
  px(g, 5, 11, GREEN_LIGHT);
  rect(g, 9, 10, 10, 10, LEAF);
  // bamboo spout from the back-right
  // post stands behind the back rim, which stays whole in front of it
  rect(g, 29, 8, 30, 11, LEAF_DARK);
  rect(g, 29, 8, 29, 11, LEAF);
  rect(g, 21, 8, 31, 9, LEAF);
  rect(g, 21, 9, 31, 9, LEAF_DARK);
  px(g, 25, 8, GREEN_LIGHT);
  px(g, 26, 8, LEAF_DARK);
  px(g, 21, 8, LEAF_DARK);
  // the pour: a bright band runs down it, the splash pulses
  for (let y = 10; y <= 17; y++) px(g, 21, y, (y - phase) % 3 === 0 ? ICE : SKY);
  for (let y = 11; y <= 16; y++) px(g, 22, y, (y - phase) % 3 === 0 ? SKY : ICE);
  rect(g, phase % 2 ? 19 : 20, 18, phase % 2 ? 24 : 23, 18, PAPER);
  // steam: soft curls rising off the far side of the tub into the air
  // above it. They start just above the back rim and the rocks (never on
  // them), stay clear of the bamboo spout and its pour, and fade out —
  // 2px, then a single pixel, then a faint ice pixel — before the top edge.
  const wisp = (bx: number, top: number, bottom: number, ph: number) => {
    for (let y = bottom; y >= top; y--) {
      const t = y + ph + 2 * phase; // rises 2px a frame; 6 frames = one 12px wave
      if (t % 6 === 0) continue;
      const x = bx + Math.round(1.8 * Math.sin((t * Math.PI) / 6));
      px(g, x, y, y <= top + 1 ? ICE : PAPER);
      if (y > top + 3) px(g, x + 1, y, t % 2 ? ICE : PAPER);
    }
  };
  wisp(8, 2, 9, 0); // above the rocks (their moss caps start at y=10)
  wisp(15, 1, 10, 3); // x 13..18: clear of the spout (x>=19 at y 8..12)
  return g;
};
const CAPYBARA_ONSEN = capybaraOnsen(0);
const CAPYBARA_ONSEN_ANIM = {
  frames: Array.from({ length: ONSEN_FRAMES - 1 }, (_, i) => capybaraOnsen(i + 1)),
  frameMs: 230,
};

// ════════════════════════════════════════════════════════════════
// 14. rug_round — braided rag rug, 32x32, 2x2, decor, walkable. The
//     braid stitch runs AROUND each ring, like a real coiled rug.
// ════════════════════════════════════════════════════════════════
const RUG_ROUND = (() => {
  const g = grid(32, 32);
  // [outer radius px, colour, stitch shade]
  const bands: [number, string, string][] = [
    [12.6, CREAM, CREAM_DARK],
    [9.4, PINK, PINK_DARK],
    [6.2, CREAM, CREAM_DARK],
    [3.2, GOLD_DARK, GOLD_DARK],
  ];
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const dx = (x - 15.5) / 15.6;
      const dy = (y - 15.5) / 14.6;
      const r = Math.sqrt(dx * dx + dy * dy) * 15.6;
      if (r > 15.6) continue;
      if (r > 14.5) {
        g[y][x] = TEAL_DARK;
        continue;
      }
      if (r > 12.6) {
        g[y][x] = TEAL;
        continue;
      }
      let i = 0;
      while (i + 1 < bands.length && r <= bands[i + 1][0]) i++;
      const [outer, c, s] = bands[i];
      const mid = outer - 1.6;
      const stitch = Math.floor((Math.atan2(dy, dx) * Math.max(mid, 1)) / 2 + i);
      g[y][x] = ((stitch % 2) + 2) % 2 === 1 && i < 3 ? s : c;
    }
  rect(g, 15, 15, 16, 16, GOLD);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 15. rug_runner — long kilim runner with tasselled ends, 48x16, 3x1,
//     decor, walkable. Right = the transposed 1x3.
// ════════════════════════════════════════════════════════════════
const RUG_RUNNER = (() => {
  const L = 48;
  const g = grid(L, 16);
  for (let u = 0; u < L; u++)
    for (let v = 2; v <= 13; v++) {
      if (u < 2 || u > L - 3) {
        if (v % 2 === 0) g[v][u] = CREAM;
        continue;
      }
      if (u === 2 || u === L - 3 || v === 2 || v === 13) g[v][u] = BRICK_DARK;
      else if (u === 3 || u === L - 4 || v === 3 || v === 12) g[v][u] = GOLD_DARK;
      else {
        // motifs centred on the field (half-pixel phase matches the even height)
        const p = (((u - 3.5) % 10) + 10) % 10;
        const m = Math.abs(p - 5) + Math.abs(v - 7.5);
        if (m < 1.6) g[v][u] = NAVY;
        else if (m < 2.6) g[v][u] = GOLD_DARK;
        else if (m < 3.6) g[v][u] = CREAM;
        else if (
          u > 4 &&
          u < L - 5 &&
          v >= 5 &&
          v <= 10 &&
          (p < 1 || p > 9) &&
          (v + (p < 1 ? 1 : 0)) % 2 === 0
        )
          g[v][u] = BRICK_DARK; // zig-zag between motifs
        else g[v][u] = BRICK;
      }
    }
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 16. puzzle_table — low table with a half-finished jigsaw (sky, hills, a
//     lake) laid in 4px pieces, the last two still missing so the wood shows
//     through their knobbed outline, loose pieces and the box lid beside it,
//     32x16, 2x1, isDesk. Right = 1x2, 16x32.
// ════════════════════════════════════════════════════════════════
interface PuzzleLayout {
  W: number;
  H: number;
  /** puzzle rect [x, y, w, h]; pieces are 4x4 cells */
  p: [number, number, number, number];
  /** cells [col, row] still missing from the picture */
  missing: [number, number][];
  /** box lid top-left */
  lid: [number, number];
  pieces: [number, number, string][];
}

/** One step darker of each picture colour — the seam/knob tone. */
const PUZZLE_SEAM: Record<string, string> = {
  [SKY]: BLUE,
  [LEAF]: LEAF_DARK,
  [GREEN]: LEAF,
  [BLUE]: NAVY,
  [GOLD]: GOLD_DARK,
  [PAPER]: ICE,
};

/** Box lid, 8x7: red-edged lid with the picture printed on it, its darker
 *  front face, the cream box peeking out from under the offset lid, shadow. */
const PUZZLE_LID = [
  'rrrrrrr.',
  'rSgSSSr.',
  'rSSSSSrc',
  'rLLLLLrc',
  'bbbbbbbc',
  '.ccccccc',
  '.wwwwwww',
];

function puzzleTable(L: PuzzleLayout): Grid {
  const { W, H } = L;
  const g = grid(W, H);
  const topBottom = H - 5;
  box(g, 0, 0, W - 1, topBottom, { o: WOOD_DARK, f: WOOD_SURFACE, l: GOLD_DARK });
  box(g, 0, topBottom, W - 1, H - 3, { o: WOOD_DARK, f: WOOD }, false); // front face
  rect(g, 1, topBottom, W - 2, topBottom, GOLD_DARK); // lit lip
  for (const x of [1, W - 3]) rect(g, x, H - 2, x + 1, H - 1, WOOD_SHADOW);
  // the picture: sky, a sun, a cloud, hills and a lake
  const [px0, py0, pw, ph] = L.p;
  const pic: string[][] = [];
  for (let j = 0; j < ph; j++) {
    pic.push([]);
    for (let i = 0; i < pw; i++) {
      const v = j / ph;
      const hill = 0.5 + 0.12 * Math.sin(i / 2.2);
      let c = SKY;
      if (v > hill) c = LEAF;
      if (v > hill + 0.18) c = GREEN;
      if (v > 0.78 && i > pw * 0.25 && i < pw * 0.7) c = BLUE;
      pic[j].push(c);
    }
  }
  for (const [i, j] of [
    [1, 1],
    [2, 1],
    [1, 2],
    [2, 2],
  ])
    pic[j][i] = GOLD; // sun
  for (const [i, j] of [
    [pw - 5, 0],
    [pw - 6, 1],
    [pw - 5, 1],
    [pw - 4, 1],
  ])
    pic[j][i] = PAPER; // cloud
  // which pixels are laid: every cell except the missing ones, with
  // piece-shaped edges where a missing cell meets a laid one
  const laid = pic.map((row) => row.map(() => true));
  const cellOf = (i: number, j: number) => [Math.floor(i / 4), Math.floor(j / 4)];
  const isMissing = (ci: number, cj: number) => L.missing.some(([a, b]) => a === ci && b === cj);
  for (let j = 0; j < ph; j++)
    for (let i = 0; i < pw; i++) {
      const [ci, cj] = cellOf(i, j);
      if (isMissing(ci, cj)) laid[j][i] = false;
    }
  for (const [ci, cj] of L.missing) {
    const sides: [number, number][] = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    sides.forEach(([dx, dy], k) => {
      const ni = ci + dx;
      const nj = cj + dy;
      if (ni < 0 || nj < 0 || ni * 4 >= pw || nj * 4 >= ph || isMissing(ni, nj)) return;
      // edge pixels on each side of the shared border, at its midpoint
      const mi = dx === 0 ? ci * 4 + 1 + (k % 2) : dx < 0 ? ci * 4 : ci * 4 + 3;
      const mj = dy === 0 ? cj * 4 + 1 + (k % 2) : dy < 0 ? cj * 4 : cj * 4 + 3;
      const oi = mi + dx;
      const oj = mj + dy;
      if ((ci + cj + k) % 2 === 0) {
        if (mi < pw && mj < ph) laid[mj][mi] = true; // the neighbour's knob pokes in
      } else if (oi < pw && oj < ph) laid[oj][oi] = false; // the missing piece's knob left a socket
    });
  }
  for (let j = 0; j < ph; j++)
    for (let i = 0; i < pw; i++) {
      if (!laid[j][i]) continue;
      let c = pic[j][i];
      // faint dotted seams every 4px, one step darker than the local colour
      const seam = (i % 4 === 3 && i < pw - 1) || (j % 4 === 3 && j < ph - 1);
      if (seam && (i + j) % 2 === 0) c = PUZZLE_SEAM[c] ?? c;
      px(g, px0 + i, py0 + j, c);
    }
  // the laid picture's lower/right edges cast a 1px shadow on the bare wood
  for (let j = 0; j <= ph; j++)
    for (let i = 0; i <= pw; i++) {
      const here = j < ph && i < pw && laid[j][i];
      if (here) continue;
      const up = j > 0 && i < pw && laid[j - 1][i];
      const left = i > 0 && j < ph && laid[j][i - 1];
      if (up || left) px(g, px0 + i, py0 + j, WOOD);
    }
  // loose pieces with their knobs and a shadow
  for (const [x, y, c] of L.pieces) {
    rect(g, x, y, x + 1, y + 1, c);
    px(g, x + 2, y, c);
    px(g, x + 1, y + 1, PUZZLE_SEAM[c] ?? c);
    if (y + 2 < topBottom) rect(g, x, y + 2, x + 1, y + 2, WOOD);
  }
  // box lid: red edge, the picture printed on it, offset over the cream box
  const [lx, ly] = L.lid;
  stamp(g, lx, ly, PUZZLE_LID, {
    r: RED,
    S: SKY,
    g: GOLD,
    L: LEAF,
    b: BRICK,
    c: CREAM_DARK,
    w: WOOD,
  });
  px(g, lx + 7, ly + 5, CREAM);
  return g;
}

const PUZZLE_TABLE = puzzleTable({
  W: 32,
  H: 16,
  p: [2, 2, 16, 8],
  missing: [
    [3, 1],
    [2, 1],
  ],
  lid: [23, 2],
  pieces: [
    [19, 2, LEAF],
    [20, 6, SKY],
    [24, 9, GREEN],
    [28, 9, SKY],
  ],
});

const PUZZLE_TABLE_RIGHT = puzzleTable({
  W: 16,
  H: 32,
  p: [2, 2, 12, 12],
  missing: [
    [2, 2],
    [2, 1],
  ],
  lid: [2, 18],
  pieces: [
    [3, 15, LEAF],
    [11, 16, SKY],
    [11, 20, GREEN],
    [10, 24, SKY],
  ],
});

// ════════════════════════════════════════════════════════════════
// 17. card_catalog — library card catalog: twelve tiny brass-handled
//     drawers, one pulled out with index cards bristling, a stack of cards
//     and a pencil on top, 16x32, 1x1, storage.
// ════════════════════════════════════════════════════════════════
const CARD_CATALOG = (() => {
  const g = grid(16, 32);
  box(g, 1, 6, 14, 10, { o: WOOD_DARK, f: WOOD_SURFACE, l: GOLD_DARK }, false); // top
  box(g, 1, 10, 14, 28, { o: WOOD_DARK, f: WOOD_DARK }, false); // carcass
  const drawer = (x0: number, y0: number) => {
    rect(g, x0, y0, x0 + 3, y0 + 3, WOOD);
    rect(g, x0, y0, x0 + 3, y0, WOOD_LIGHT);
    rect(g, x0 + 1, y0 + 1, x0 + 2, y0 + 1, PAPER); // label slot
    px(g, x0 + 1, y0 + 2, GOLD_DARK); // pull
    px(g, x0 + 2, y0 + 2, GOLD);
  };
  for (const y0 of [11, 15, 19, 23])
    for (const x0 of [2, 6, 10]) if (!(x0 === 6 && y0 === 15)) drawer(x0, y0);
  // the open drawer: dark slot, and the drawer itself pulled toward us
  rect(g, 6, 15, 9, 18, WOOD_SHADOW);
  box(g, 5, 16, 10, 21, { o: WOOD_DARK, f: WOOD }, false);
  rect(g, 6, 16, 9, 18, CREAM);
  for (const x of [6, 8]) rect(g, x, 16, x, 18, CREAM_DARK);
  px(g, 7, 15, PAPER); // card tabs poking up
  px(g, 9, 14, PAPER);
  px(g, 6, 15, PINK_LIGHT);
  rect(g, 6, 20, 9, 20, WOOD_LIGHT);
  px(g, 7, 20, GOLD);
  px(g, 8, 20, GOLD_DARK);
  // plinth + feet
  rect(g, 1, 27, 14, 28, WOOD_SHADOW);
  rect(g, 2, 29, 3, 30, WOOD_SHADOW);
  rect(g, 12, 29, 13, 30, WOOD_SHADOW);
  // stack of index cards + pencil on top
  rect(g, 3, 6, 6, 7, PAPER);
  rect(g, 3, 8, 6, 8, CREAM_DARK);
  line(g, 8, 8, 12, 7, GOLD);
  px(g, 12, 7, PINK);
  px(g, 8, 8, IRON_DARK);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 18. bankers_lamp — green-glass banker's lamp with a brass pull chain,
//     glowing warm underneath, 16x16, 1x1, surface.
// ════════════════════════════════════════════════════════════════
const BANKERS_LAMP = (() => {
  const g = grid(16, 16);
  // brass base + stem
  oval(g, 7.5, 13, 4, 1.8, { o: GOLD_DARK, f: GOLD, l: GOLD_LIGHT });
  rect(g, 7, 8, 8, 12, GOLD_DARK);
  px(g, 7, 9, GOLD);
  px(g, 7, 10, GOLD);
  // glow under the shade
  rect(g, 3, 8, 12, 8, LAMP_WARM);
  rect(g, 4, 9, 6, 9, GOLD_LIGHT);
  rect(g, 9, 9, 11, 9, GOLD_LIGHT);
  // green glass shade, a half-cylinder seen from the front
  shade(
    g,
    (x, y) =>
      y >= 3 &&
      y <= 7 &&
      x >= 2 + (y === 3 ? 2 : y === 4 ? 1 : 0) &&
      x <= 13 - (y === 3 ? 2 : y === 4 ? 1 : 0),
    { o: LEAF_DARK, f: LEAF, l: GREEN_LIGHT },
  );
  rect(g, 2, 7, 13, 7, GOLD_DARK); // brass rim
  // pull chain + bead
  rect(g, 11, 8, 11, 10, GOLD_DARK);
  px(g, 11, 11, GOLD_LIGHT);
  return g;
})();

// ════════════════════════════════════════════════════════════════

const entry = (
  id: string,
  label: string,
  widthPx: number,
  heightPx: number,
  footprintW: number,
  footprintH: number,
  sprite: string[][],
  groupId?: string,
  orientation?: string,
): GeneratedSprite => ({
  id,
  name: id.toUpperCase(),
  label,
  widthPx,
  heightPx,
  footprintW,
  footprintH,
  sprite,
  ...(groupId ? { groupId, orientation } : {}),
});

export const SPRITES15: GeneratedSprite[] = [
  {
    ...entry('capybara_onsen', 'Capybara Onsen', 32, 48, 2, 2, CAPYBARA_ONSEN),
    ...CAPYBARA_ONSEN_ANIM,
  },
  entry('capybara_statue', 'Capybara Statue', 16, 32, 1, 1, CAPYBARA_STATUE),
  entry('capybara_plush', 'Capybara Plush', 16, 16, 1, 1, CAPYBARA_PLUSH),
  { ...entry('focus_booth', 'Focus Booth', 16, 48, 1, 1, FOCUS_BOOTH), ...FOCUS_BOOTH_ANIM },
  entry(
    'reading_armchair',
    'Reading Armchair',
    16,
    32,
    1,
    1,
    ARMCHAIR,
    'reading_armchair',
    'front',
  ),
  entry(
    'reading_armchair_right',
    'Reading Armchair (Right)',
    16,
    32,
    1,
    1,
    ARMCHAIR_RIGHT,
    'reading_armchair',
    'right',
  ),
  entry(
    'reading_armchair_back',
    'Reading Armchair (Back)',
    16,
    32,
    1,
    1,
    ARMCHAIR_BACK,
    'reading_armchair',
    'back',
  ),
  entry(
    'reading_armchair_left',
    'Reading Armchair (Left)',
    16,
    32,
    1,
    1,
    mirrorSprite(ARMCHAIR_RIGHT),
    'reading_armchair',
    'left',
  ),
  entry('side_table', 'Side Table', 16, 16, 1, 1, SIDE_TABLE),
  entry('globe', 'Globe', 16, 32, 1, 1, GLOBE),
  entry('book_stack', 'Book Stack', 16, 16, 1, 1, BOOK_STACK),
  entry('library_shelf', 'Library Bookcase', 32, 48, 2, 1, LIBRARY_SHELF, 'library_shelf', 'front'),
  entry(
    'library_shelf_right',
    'Library Bookcase (Right)',
    16,
    64,
    1,
    2,
    LIBRARY_SHELF_RIGHT,
    'library_shelf',
    'right',
  ),
  entry(
    'library_shelf_left',
    'Library Bookcase (Left)',
    16,
    64,
    1,
    2,
    mirrorSprite(LIBRARY_SHELF_RIGHT),
    'library_shelf',
    'left',
  ),
  entry('round_table', 'Round Table', 32, 32, 2, 2, ROUND_TABLE),
  entry('lectern', 'Lectern', 16, 32, 1, 1, LECTERN, 'lectern', 'front'),
  entry('lectern_back', 'Lectern (Back)', 16, 32, 1, 1, LECTERN_BACK, 'lectern', 'back'),
  entry('projector_screen', 'Projector Screen', 32, 32, 2, 1, PROJECTOR_SCREEN),
  entry('ship_gong', 'Ship-It Gong', 16, 32, 1, 1, SHIP_GONG),
  entry('rug_round', 'Round Rug', 32, 32, 2, 2, RUG_ROUND),
  entry('rug_runner', 'Runner Rug', 48, 16, 3, 1, RUG_RUNNER, 'rug_runner', 'front'),
  entry(
    'rug_runner_right',
    'Runner Rug (Rotated)',
    16,
    48,
    1,
    3,
    transpose(RUG_RUNNER),
    'rug_runner',
    'right',
  ),
  entry('puzzle_table', 'Puzzle Table', 32, 16, 2, 1, PUZZLE_TABLE, 'puzzle_table', 'front'),
  entry(
    'puzzle_table_right',
    'Puzzle Table (Right)',
    16,
    32,
    1,
    2,
    PUZZLE_TABLE_RIGHT,
    'puzzle_table',
    'right',
  ),
  entry(
    'puzzle_table_left',
    'Puzzle Table (Left)',
    16,
    32,
    1,
    2,
    mirrorSprite(PUZZLE_TABLE_RIGHT),
    'puzzle_table',
    'left',
  ),
  entry('card_catalog', 'Card Catalog', 16, 32, 1, 1, CARD_CATALOG),
  entry('bankers_lamp', "Banker's Lamp", 16, 16, 1, 1, BANKERS_LAMP),
];

export const META15: Record<string, CatalogMeta> = {
  capybara_onsen: { category: 'decor' },
  capybara_statue: { category: 'decor' },
  capybara_plush: { category: 'decor', canPlaceOnSurfaces: true },
  focus_booth: { category: 'misc' },
  reading_armchair: { category: 'chairs' },
  reading_armchair_right: { category: 'chairs' },
  reading_armchair_back: { category: 'chairs' },
  reading_armchair_left: { category: 'chairs' },
  side_table: { category: 'desks', isDesk: true },
  globe: { category: 'decor' },
  book_stack: { category: 'decor', canPlaceOnSurfaces: true },
  library_shelf: { category: 'storage' },
  library_shelf_right: { category: 'storage' },
  library_shelf_left: { category: 'storage' },
  round_table: { category: 'desks', isDesk: true },
  lectern: { category: 'misc' },
  lectern_back: { category: 'misc' },
  projector_screen: { category: 'wall', canPlaceOnWalls: true },
  ship_gong: { category: 'misc' },
  rug_round: { category: 'decor', backgroundTiles: 2 },
  rug_runner: { category: 'decor', backgroundTiles: 1 },
  rug_runner_right: { category: 'decor', backgroundTiles: 3 },
  puzzle_table: { category: 'desks', isDesk: true },
  puzzle_table_right: { category: 'desks', isDesk: true },
  puzzle_table_left: { category: 'desks', isDesk: true },
  card_catalog: { category: 'storage' },
  bankers_lamp: { category: 'electronics', canPlaceOnSurfaces: true },
};

validateSprites(SPRITES15);
