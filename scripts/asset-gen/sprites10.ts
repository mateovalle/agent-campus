/**
 * sprites10.ts — Batch 10: kitchen & cafeteria.
 *
 * Until now the food corner was a counter, a fridge, a microwave and a
 * vending machine — enough to imply a kitchen, not enough to build one.
 * This batch makes an office café possible: a teal-tiled espresso bar with
 * a brass-domed lever machine (the showpiece), a gas range with something
 * simmering, a bakery display case, a pantry shelf, a popcorn cart, a
 * gingham café table and red bar stools, a chalkboard menu for the wall —
 * plus a drawer of tabletop clutter that tells small stories: a steaming
 * mug, a kettle on the boil, toast mid-pop, a pizza with one slice gone,
 * a cake under a glass dome with a wedge cut out, cup noodles with a fork
 * stuck in them, a birthday cake with its candles lit — and a gumball
 * machine for the corner. The bakery case is chest-high (32px).
 *
 * Heights line up with kitchen_counter (top surface 12px, front face 14px)
 * so the espresso bar and range sit in a row with it.
 *
 * Same conventions as batches 6–9: variants share a groupId with their
 * front sprite (front carries groupId + orientation 'front' whenever a
 * piece has other orientations), left views are programmatic mirrors of
 * right views, house palette only, light from top-left, darker-material
 * outlines, tall pieces keep the 16px overhang above their footprint.
 */

import type { CatalogMeta } from './catalog-meta.ts';
import {
  AMBER,
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
  LED_GREEN,
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
  SLATE,
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

/** Blank char grid for programmatic drawing. */
function blank(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => new Array<string>(w).fill('.'));
}

/** Normalised squared distance from an ellipse centre (1 = on the rim). */
function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy;
}

/**
 * One legend for the whole batch, so every piece is drawn with the same
 * letters. Grouped by material: wood, metal, green, blue, paper, accent,
 * clay, purple, pink, teal, cream, brick, navy, stone.
 */
const L: Legend = {
  S: WOOD_SHADOW,
  D: WOOD_DARK,
  W: WOOD,
  L: WOOD_LIGHT,
  T: WOOD_SURFACE,
  k: INK,
  K: IRON_DARK,
  i: IRON,
  m: STEEL_DARK,
  n: STEEL,
  N: STEEL_LIGHT,
  v: SILVER,
  V: SILVER_LIGHT,
  g: LEAF_DARK,
  G: LEAF,
  e: GREEN,
  E: LED_GREEN,
  f: GREEN_LIGHT,
  q: SCREEN_SHADOW,
  Q: SCREEN_BLUE,
  b: BLUE,
  y: SKY,
  I: ICE,
  P: PAPER,
  z: SLATE,
  r: RED,
  a: AMBER,
  o: GOLD_DARK,
  O: GOLD,
  Y: GOLD_LIGHT,
  R: ORANGE,
  w: LAMP_WARM,
  c: CLAY_DARK,
  C: CLAY,
  u: PURPLE_DARK,
  p: PURPLE,
  h: PINK_DARK,
  H: PINK,
  j: PINK_LIGHT,
  t: TEAL_DARK,
  x: TEAL,
  X: TEAL_LIGHT,
  l: CREAM_DARK,
  A: CREAM,
  B: BRICK_DARK,
  Z: BRICK,
  d: NAVY_DARK,
  s: NAVY,
  '1': STONE_DARK,
  '2': STONE,
};

/** A small imperative canvas over a char grid. */
class Pix {
  readonly g: string[][];
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.g = blank(w, h);
  }
  set(x: number, y: number, ch: string): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = ch;
    return this;
  }
  get(x: number, y: number): string {
    return this.g[y]?.[x] ?? '.';
  }
  fill(x0: number, y0: number, x1: number, y1: number, ch: string): this {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, ch);
    return this;
  }
  /** Outlined rectangle, optional fill. */
  box(x0: number, y0: number, x1: number, y1: number, o: string, f?: string): this {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1;
        if (edge) this.set(x, y, o);
        else if (f) this.set(x, y, f);
      }
    }
    return this;
  }
  /** Stamp ASCII rows at an offset ('.' and ' ' are transparent). */
  stamp(x0: number, y0: number, rows: string[]): this {
    rows.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        if (ch !== '.' && ch !== ' ') this.set(x0 + dx, y0 + dy, ch);
      }),
    );
    return this;
  }
  /** Filled ellipse: rim in `o`, body `f`, a lit top-left cap in `l`. */
  disc(cx: number, cy: number, rx: number, ry: number, o: string, f: string, l?: string): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ellipse(x, y, cx, cy, rx, ry);
        if (d > 1) continue;
        if (d > 0.62) this.set(x, y, o);
        else if (l && (x - cx) / rx + (y - cy) / ry < -0.45) this.set(x, y, l);
        else this.set(x, y, f);
      }
    }
    return this;
  }
  done(): string[][] {
    return fromAscii(
      this.g.map((r) => r.join('')),
      L,
    );
  }
}

const art = (rows: string[], w = 16, h = 16): string[][] => new Pix(w, h).stamp(0, 0, rows).done();

// ── Animation ───────────────────────────────────────────────────
// An animated piece is a builder `(k) => grid` called once per frame:
// everything it draws is deterministic except the few pixels that read k,
// so the silhouette and the rest of the piece are pixel-identical across
// frames by construction. Frame 0 is the still every other consumer sees.

/** Run a frame builder n times: [frame 0, frame 1, …]. */
const frameSet = (n: number, build: (k: number) => string[][]): string[][][] =>
  Array.from({ length: n }, (_, k) => build(k));

/** One loop of a steam wisp, read bottom-up: a column offset per row, null = gap. */
const WISP = [0, 1, null, 1, 0, null] as const;
const WISP_B = [1, 0, 0, null, 0, 1] as const;

/**
 * A steam wisp rising in column x over rows y0 (top) … y1 (bottom). Frame k
 * samples `path` k rows further along, so the shape climbs a pixel a frame
 * and the loop closes after path.length frames with no jump. The upper half
 * fades to `hi`; it only paints over transparent cells, never the piece.
 */
function wisp(
  p: Pix,
  x: number,
  y0: number,
  y1: number,
  k: number,
  path: readonly (number | null)[],
  lo = 'P',
  hi = 'V',
): void {
  const n = path.length;
  const mid = (y0 + y1) / 2;
  for (let y = y0; y <= y1; y++) {
    const dx = path[(y - y0 + k) % n];
    if (dx === null) continue;
    if (p.get(x + dx, y) === '.') p.set(x + dx, y, y < mid ? hi : lo);
  }
}

// ════════════════════════════════════════════════════════════════
// 1. espresso_bar — THE SHOWPIECE. Teal subway-tiled bar with a cream
//    top, 32x48, 2x1. On it: a brass-domed lever espresso machine
//    (pressure gauge, two group heads with portafilters, two cups being
//    filled, steam wand puffing), a bean grinder with a glass hopper, and
//    a tip jar with a coin and a bill. Counter proportions match
//    kitchen_counter so the two line up. Right = 1x2, left = mirror.
// ════════════════════════════════════════════════════════════════

/** Subway tiles: 3 rows of tile + 1 grout, running bond 6px wide. */
function tiles(p: Pix, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    const course = Math.floor((y - y0) / 4);
    const ry = (y - y0) % 4;
    for (let x = x0; x <= x1; x++) {
      const jx = (x - x0 + (course % 2) * 3) % 6;
      if (ry === 3 || jx === 5) p.set(x, y, 't');
      else if (ry === 0 || jx === 0) p.set(x, y, 'X');
      else p.set(x, y, 'x');
    }
  }
}

/**
 * The lever machine, 16 wide, 18 rows (base sits on the counter top).
 * Lit top-left: STEEL_LIGHT on the top + left edges, STEEL_DARK on the
 * right + bottom. Red face band carries a round pressure gauge (needle at
 * 2 o'clock) and an amber pilot light; under it two group heads with
 * portafilters, a cup filling from a thin stream and a second cup waiting.
 */
const ESPRESSO_MACHINE = [
  '......oOo.......',
  '.....oYOOo......',
  '....oYOOOOo.....',
  '...ooooooooo....',
  '.NNNNNNNNNNNNNm.',
  '.NVVVVVVVVVVVvm.',
  '.NjrrmmrrrrrrBm.',
  '.NjrmVkmrrwarBm.',
  '.NjrmVVmrraarBm.',
  '.NjrrmmrrrrrrBm.',
  // open bay under the body: steel back panel in shade, one group head
  // hanging from the centre, portafilter handle angled down-left, a cup
  // filling from a thin stream on the drip-tray grate
  '.Nniiinnnniiinm.',
  '.NnmmmNVnmmmmnm.',
  '.NnmWDKiiKmmmnm.',
  '.NnDDmmKKmmmmnm.',
  '.NnmmmmCmmmmmnm.',
  '.NnmmmvCvmmmmnm.',
  '.NnmmmPPImmmmnm.',
  '.NnmmmPPImmmmnm.',
  '.NnNVNVNVNVNVnm.',
  '.mmmmmmmmmmmmmm.',
];

/** Latte glass: glass sides, coffee below, a cream foam cap. */
const LATTE = ['.II.', 'IAAy', 'IAAy', 'ICCy', 'IcCy', 'ICCy', '.yy.'];

/** Grinder: hopper of beans over a black body, 7 wide, rows 4-22. */
const GRINDER = [
  '.KKKKK.',
  '.KiiiK.',
  'yIIIIIy',
  'yPIIIIy',
  'yPIDIIy',
  'yIDSDDy',
  'ySDSDSy',
  '.yDSDy.',
  '..yyy..',
  '.KKKKK.',
  '.KiiiK.',
  '.KiEiK.',
  '.KiiiK.',
  '.KkkkK.',
  '.Kk.kK.',
  '.KiiiK.',
  '.KKKKK.',
];

/** Animated: steam climbing off the wand, a darker drop running down the coffee stream. */
function espressoBar(k: number): string[][] {
  const p = new Pix(32, 48);
  // counter top rows 17-28 (cream stone, lit back edge)
  p.box(1, 17, 30, 28, 'l', 'A');
  p.fill(2, 18, 29, 18, 'P');
  p.fill(2, 18, 2, 27, 'P');
  // front: wood trim, tiles, kick plate
  p.fill(1, 29, 30, 29, 'D');
  p.fill(1, 30, 30, 30, 'L');
  tiles(p, 2, 31, 29, 41);
  p.fill(1, 31, 1, 41, 't');
  p.fill(30, 31, 30, 41, 't');
  p.fill(1, 42, 30, 42, 'D');
  p.fill(1, 43, 30, 43, 'S');
  for (const x of [2, 3, 28, 29]) p.set(x, 44, 'S');
  // machine, grinder, tip jar
  p.stamp(1, 4, ESPRESSO_MACHINE);
  // steam wand hanging off the right flank, silver-light tip, a thin wisp
  // drifting up and breaking up before the grinder
  p.set(16, 15, 'm');
  for (let y = 15; y <= 19; y++) p.set(17, y, 'n');
  p.set(17, 20, 'V');
  wisp(p, 17, 7, 14, k, WISP);
  // the coffee stream (2px over the cup): a darker drop runs down it
  p.set(8, 18 + (k % 2), 'c');
  p.stamp(20, 7, GRINDER);
  p.stamp(26, 17, LATTE);
  // saucer with a spoon on the front edge of the bar
  p.stamp(4, 25, ['.vVVv.', 'nvvvvn']);
  p.set(7, 24, 'n');
  return p.done();
}
const ESPRESSO_BAR_FRAMES = frameSet(WISP.length, espressoBar);

const ESPRESSO_BAR_RIGHT = (() => {
  const p = new Pix(16, 48);
  // two-tile-deep top rows 1-28, short end face 29-42
  p.box(1, 1, 14, 28, 'l', 'A');
  p.fill(2, 2, 13, 2, 'P');
  p.fill(2, 2, 2, 27, 'P');
  p.fill(1, 29, 14, 29, 'D');
  p.fill(1, 30, 14, 30, 'L');
  tiles(p, 2, 31, 13, 41);
  p.fill(1, 31, 1, 41, 't');
  p.fill(14, 31, 14, 41, 't');
  p.fill(1, 42, 14, 42, 'D');
  p.fill(1, 43, 14, 43, 'S');
  for (const x of [2, 3, 12, 13]) p.set(x, 44, 'S');
  // machine in side profile on the BACK tile (base row 13, clear of the
  // grinder): brass dome silhouette, steel flank lit top-left with a gold
  // badge, the red face a sliver on its left (front) edge, group head and
  // portafilter projecting left with the wood handle angled toward the
  // viewer, a cup filling on the drip tray.
  p.stamp(0, 0, [
    '........oOo.....',
    '.......oYOOo....',
    '......oYOOOOo...',
    '.....ooooooooo..',
    '.....NNNNNNNNm..',
    '.....rVVVVVVvm..',
    '.....rNnnnnnnm..',
    '.....rNnnnOnnm..',
    '...mmrNnnnonnm..',
    '..WKKrNnnnnnnm..',
    'DD..CrNnnnnnnm..',
    '..vCvrNnnnnnnm..',
    '..PPIrNnnnnnnm..',
    '.NVNVNmmmmmmmm..',
  ]);
  // the grinder stands on the FRONT tile with a cream gap above it
  p.stamp(2, 15, [
    '.KKKKK.',
    'yIIIIIy',
    'yPIDIIy',
    'ySDSDDy',
    '.yDSDy.',
    '..yyy..',
    '.KKKKK.',
    '.KiiiK.',
    '.KiEiK.',
    '.KkkkK.',
    '.KiiiK.',
    '.KKKKK.',
  ]);
  // a latte glass at the front end of the bar
  p.stamp(10, 20, LATTE);
  return p.done();
})();

// ════════════════════════════════════════════════════════════════
// 2. kitchen_range — gas cooker, 16x48, 1x1. Black cooktop with four
//    burners (one lit blue-orange), a steel pot simmering on the back
//    left with steam curling up, knobs on the front rail, an oven door
//    whose window glows warm with something baking. Same counter height
//    as kitchen_counter.
// ════════════════════════════════════════════════════════════════
/** Animated: two wisps curling off the pot lid, the lit burner's flame flickering. */
function kitchenRange(k: number): string[][] {
  const p = new Pix(16, 48);
  // control strip / backsplash at the back of the cooktop, with a little
  // green oven-timer readout (12:5) — what tells it apart from a
  // microwave stack at 2x
  p.box(1, 14, 14, 16, 'K', 'N');
  p.fill(8, 15, 13, 15, 'k');
  p.set(9, 15, 'E').set(10, 15, 'E').set(12, 15, 'E');
  // cooktop rows 17-28: steel-dark plate, iron outline, lit back row
  p.box(1, 17, 14, 28, 'K', 'm');
  p.fill(2, 18, 13, 18, 'n');
  // burners: every one a ring (iron when off), the front-right one burning
  const ring = (x: number, y: number, lit: boolean) =>
    p.stamp(
      x,
      y,
      lit ? ['.RwwR.', 'w....w', 'w.KK.w', '.RwwR.'] : ['.iiii.', 'i....i', 'i.KK.i', '.iiii.'],
    );
  ring(8, 19, false);
  ring(2, 23, false);
  ring(8, 23, true);
  // flame: one warm tongue licking up off the ring's back edge, hopping
  // round it, and the ring's front corners flaring in turn
  p.set([10, 12, 9, 11, 10, 12][k], 22, 'w');
  p.set(k % 2 ? 9 : 12, 26, 'w');
  // steam: two wisps rising off the lid, fading at the top
  wisp(p, 4, 9, 14, k, WISP);
  wisp(p, 7, 9, 13, k + 3, WISP_B);
  // copper pot with a lid on the back-left burner: silver knob, lit
  // top-left lid, clay-dark rim line, iron side handles
  p.stamp(2, 15, [
    '...v....',
    '..cRCc..',
    '.cRCCCc.',
    'KccccccK',
    '.cRCCCc.',
    '.cCCCCc.',
    '..cccc..',
  ]);
  // front rail with knobs
  p.fill(1, 29, 14, 29, 'n');
  p.fill(1, 30, 14, 30, 'V');
  p.stamp(2, 30, ['k.k.k.k.k.k']);
  p.fill(1, 31, 14, 31, 'n');
  // oven door rows 32-41
  p.box(1, 32, 14, 41, 'm', 'v');
  p.fill(2, 33, 13, 33, 'V');
  p.fill(3, 33, 12, 33, 'N'); // handle bar
  p.box(3, 35, 12, 40, 'k', 'K');
  p.fill(4, 38, 11, 39, 'R');
  p.fill(5, 38, 10, 38, 'w');
  p.stamp(5, 36, ['.LLLL.', 'LTTTTL']); // a loaf in the oven
  p.fill(1, 42, 14, 42, 'm');
  p.fill(1, 43, 14, 43, 'K');
  for (const x of [2, 3, 12, 13]) p.set(x, 44, 'k');
  return p.done();
}
const KITCHEN_RANGE_FRAMES = frameSet(WISP.length, kitchenRange);

// ════════════════════════════════════════════════════════════════
// 3. bakery_case — glass pastry display, 32x48, 2x1. Glass top and a
//    lit front pane over two shelves: croissants and sprinkled donuts
//    above, cupcakes in teal cases and a cake slice below, each row with
//    a little paper price tag. Cream panelled base, wood trim. Right =
//    1x2 (looking down through the glass), left = mirror.
// ════════════════════════════════════════════════════════════════
/** Crescent: gold body, gold-dark ridge lines, open notch underneath. */
const croissant = ['.oOOOo.', 'OYoOoOo', 'o.....o'];
const donut = ['.hHh.', 'hjHHh', 'hHLHh', '.LLL.'];
const cupcake = ['.jrj.', 'jHHHh', 'xXxXx', '.xXx.'];
const cakeSlice = ['....jr', '.hjjjH', 'hPPPPh', 'hYYYYh'];
/** Side view: domed frosting + cherry over a trapezoid teal wrapper. */
const cupcakeSide = ['..r..', '.jHH.', 'jHHHh', 'XxXxt', '.Xxt.'];
/** Top-down donut, 5x4, with a clear hole. */
const donutTop = ['.jHH.', 'jHAHh', 'hHHhh', '.hhh.'];

/** "FRESH" in a 3px chalk hand, 19 wide. */
const FRESH = ['PPP.PP..PPP..PP.P.P', 'PP..PPP.PP...P..PPP', 'P...P.P.PPP.PP..P.P'];

/**
 * Chest-high cream base shared by both views: wood trim on top, a lit top
 * row and left edge, CREAM_DARK edges, a little chalkboard strip across the
 * front ("FRESH" when it fits, chalk squiggles when it doesn't), wood
 * plinth, leg stubs.
 */
function caseBase(p: Pix, x0: number, x1: number, y0: number): void {
  p.fill(x0, y0, x1, y0, 'D');
  p.box(x0, y0 + 1, x1, y0 + 12, 'l', 'A');
  p.fill(x0 + 1, y0 + 2, x1 - 1, y0 + 2, 'P');
  p.fill(x0 + 1, y0 + 2, x0 + 1, y0 + 11, 'P');
  p.box(x0 + 3, y0 + 4, x1 - 3, y0 + 8, 'W', 'K');
  p.fill(x0 + 4, y0 + 4, x1 - 4, y0 + 4, 'L');
  const inner = x1 - 3 - (x0 + 3) - 1;
  if (inner >= FRESH[0].length) {
    p.stamp(x0 + 4 + Math.floor((inner - FRESH[0].length) / 2), y0 + 5, FRESH);
  } else {
    p.stamp(
      x0 + 4,
      y0 + 5,
      ['PP.PPP', '......', 'PPP.P.'].map((r) => r.slice(0, inner)),
    );
  }
  p.fill(x0 + 2, y0 + 10, x1 - 2, y0 + 10, 'l'); // kick line
  p.fill(x0, y0 + 13, x1, y0 + 13, 'D');
  for (const x of [x0 + 1, x0 + 2, x1 - 2, x1 - 1]) p.set(x, y0 + 14, 'S');
}

/** One diagonal 2px silver-light reflection streak down-left across glass. */
function glare(p: Pix, x: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    p.set(x - (y - y0), y, 'V');
    p.set(x - (y - y0) + 1, y, 'V');
  }
}

const BAKERY_CASE = (() => {
  const p = new Pix(32, 32);
  // glass case rows 0-15: 3px glass top seen from above, then the pane
  p.box(1, 0, 30, 15, 'm');
  p.fill(2, 1, 29, 2, 'I');
  p.fill(2, 3, 29, 3, 'y');
  p.fill(2, 4, 29, 14, 'A'); // back wall tone so pastries pop
  p.fill(2, 9, 29, 9, 'v'); // shelf
  p.fill(2, 14, 29, 14, 'v');
  // upper shelf: croissant, donut, croissant, donut
  p.stamp(3, 6, croissant);
  p.stamp(11, 5, donut);
  p.stamp(18, 6, croissant);
  p.stamp(25, 5, donut);
  p.set(12, 5, 'Q').set(14, 6, 'O').set(26, 6, 'E').set(28, 5, 'P'); // sprinkles
  // lower shelf: two cupcakes, a cake slice, a third cupcake
  p.stamp(3, 10, cupcake);
  p.stamp(9, 10, cupcake);
  p.stamp(16, 10, cakeSlice);
  p.stamp(24, 10, cupcake);
  // price tags clipped to the shelf lips, between the goods
  p.stamp(16, 9, ['Pr']);
  p.stamp(7, 14, ['Pr']);
  p.stamp(22, 14, ['Pr']);
  glare(p, 29, 1, 6);
  caseBase(p, 1, 30, 16);
  // a paper price card leaning against the bottom of the front glass
  p.stamp(13, 13, ['.PP', 'PkP', 'PPP', 'll.']);
  return p.done();
})();

const BAKERY_CASE_RIGHT = (() => {
  const p = new Pix(16, 48);
  // 16px glass section above the footprint like the front view, plus the
  // second tile of depth: rows 0-18 look down through the glass top
  p.box(1, 0, 14, 31, 'm');
  p.fill(2, 1, 13, 18, 'I');
  p.fill(2, 18, 13, 18, 'y');
  p.fill(3, 9, 12, 9, 'y'); // tray divider seen through the glass
  // donut tier from above, a croissant-ish crescent beside it
  p.stamp(3, 2, donutTop);
  p.stamp(9, 3, donutTop);
  p.stamp(3, 11, ['.jHH.', 'jHAHh', 'hHHhh', '.hhh.']);
  p.stamp(9, 11, ['.oOo.', 'oYOOo', 'o...o']);
  glare(p, 13, 1, 6);
  // end pane rows 19-30: donut tier, shelf, cupcakes from the side, shelf
  p.fill(2, 19, 13, 30, 'A');
  p.stamp(3, 20, donut);
  p.stamp(9, 20, donut);
  p.set(4, 20, 'Q').set(11, 21, 'E');
  p.fill(2, 24, 13, 24, 'v');
  p.stamp(2, 25, cupcakeSide);
  p.stamp(8, 25, cupcakeSide);
  p.fill(2, 30, 13, 30, 'v');
  caseBase(p, 1, 14, 32);
  return p.done();
})();

// ════════════════════════════════════════════════════════════════
// 4. pantry_shelf — open wooden shelf, 16x32, 1x1, storage. Three
//    shelves: glass jars of candy / beans / pasta; cereal boxes and a
//    tin can; a crinkly chip bag and water bottles. Dense, colourful,
//    reads as "snacks" at a glance.
// ════════════════════════════════════════════════════════════════
const PANTRY_SHELF = (() => {
  const p = new Pix(16, 32);
  // frame: wood-shadow outline, wood-dark back panel with a wood-shadow
  // band under each board so the goods sit in its shade, lit top board,
  // shelf lips in wood-light
  p.box(1, 1, 14, 30, 'S', 'D');
  p.fill(2, 2, 13, 2, 'L');
  p.fill(2, 3, 13, 3, 'S');
  for (const y of [10, 19, 28]) {
    p.fill(2, y, 13, y, 'L');
    p.fill(2, y + 1, 13, y + 1, 'W');
    if (y < 28) p.fill(2, y + 2, 13, y + 2, 'S');
  }
  // top shelf (rows 4-9): three glass jars with silver lids — pickles,
  // jam, honey
  const jar = (x: number, a: string, b: string) =>
    p.stamp(x, 4, ['.vv.', 'vVvv', `I${a}${b}y`, `I${b}${a}y`, `I${a}${a}y`, 'yyyy']);
  jar(2, 'e', 'g');
  jar(6, 'r', 'Z');
  jar(10, 'O', 'a');
  // middle shelf (rows 12-18): a tall cereal box with an ink logo and a
  // little pyramid of red-label tin cans
  p.stamp(2, 12, ['ccccc', 'cYOOc', 'cRRRc', 'cRkkc', 'cRkRc', 'cRRRc', 'cOOOc']);
  const can = (x: number, y: number) => p.stamp(x, y, ['vVv', 'rPr', 'BBB']);
  can(8, 16);
  can(11, 16);
  can(9, 13);
  // bottom shelf (rows 21-27): the tied flour sack + an open egg carton
  p.stamp(2, 21, ['.l.l.', '..l..', '.lAl.', 'lAAAl', 'lAlAl', 'lAAAl', '.lll.']);
  p.stamp(8, 24, ['.PA.PA', 'PAAPAA', '222222', '111111']);
  for (const x of [2, 3, 12, 13]) p.set(x, 31, 'S');
  return p.done();
})();

// ════════════════════════════════════════════════════════════════
// 5. popcorn_cart — carnival popcorn machine, 16x32, 1x1. Red cart
//    with a gold-trimmed roof, a glass cabinet heaped with popcorn and a
//    steel kettle mid-pop, a striped popcorn-bucket emblem on the base,
//    black wheels and a few escaped kernels on the floor.
// ════════════════════════════════════════════════════════════════
/** Animated: the kettle's load churning, kernels tumbling over its lip into the heap. */
function popcornCart(k: number): string[][] {
  const p = new Pix(16, 32);
  p.stamp(0, 0, [
    '.......OO.......',
    '......OYYO......',
    '..BBBBBBBBBBBB..',
    '.BrjjjjjjjjjrrB.',
    '.BrrrrrrrrrrrrB.',
    '.BOOOOOOOOOOOOB.',
    '..BrPrPrPrPrB..',
  ]);
  // glass cabinet rows 7-17
  p.fill(2, 7, 13, 17, 'I');
  p.fill(2, 7, 2, 17, 'r');
  p.fill(13, 7, 13, 17, 'B');
  // kettle hanging from the roof on a rod, tipped to pour: a small silver
  // pot with an iron-dark rim, kernels spilling over its lip
  p.set(7, 7, 'm');
  p.stamp(3, 8, ['...KKKK.', '..KYPYPK', '.VvvvvvKP', '.Vvvvvn.Y', '..mnnm..']);
  // the load in the kettle churns; one kernel at a time drops from the
  // lip down the glass, a step per frame, and the last frame is the beat
  // after it has landed in the heap (one kernel, not two: any two kernels
  // spaced evenly on the path make frames repeat)
  if (k % 2) p.set(6, 9, 'P').set(7, 9, 'Y').set(8, 9, 'P').set(9, 9, 'Y');
  const fall: ([number, number] | null)[] = [
    [12, 10],
    [12, 11],
    [12, 12],
    [11, 13],
    [12, 14],
    null,
  ];
  const kernel = fall[k % fall.length];
  if (kernel) p.set(kernel[0], kernel[1], 'Y');
  // popcorn heap rows 13-17
  for (let y = 12; y <= 17; y++) {
    for (let x = 3; x <= 12; x++) {
      const top = 12 + Math.abs(x - 7.5) * 0.5;
      if (y < top) continue;
      p.set(x, y, (x * 3 + y * 5) % 7 === 0 ? 'Y' : (x + y) % 3 === 0 ? 'A' : 'P');
    }
  }
  p.set(3, 8, 'P').set(3, 9, 'P').set(3, 10, 'P'); // glare
  p.fill(1, 18, 14, 18, 'O');
  p.fill(1, 19, 14, 19, 'o');
  // base cabinet rows 20-26 with bucket emblem
  p.box(1, 20, 14, 27, 'B', 'r');
  p.fill(2, 21, 2, 26, 'j');
  p.box(4, 21, 11, 26, 'o', 'Y');
  p.stamp(5, 21, ['.PYPP.', 'PrPrPr', 'PrPrPr', '.rPrP.', '.rPrP.']);
  // wheels
  p.stamp(3, 28, ['KKK...KKK', 'KnK...KnK', 'KKK...KKK']);
  return p.done();
}
const POPCORN_CART_FRAMES = frameSet(6, popcornCart);

// ════════════════════════════════════════════════════════════════
// 6. cafe_table — gingham-clothed table for two, 32x32, 2x1, isDesk.
//    Soft paper/pink-light checks on the top, the cloth drape on the
//    front face in a darker check with a red hem band, a straight hem
//    with a pink-dark shadow line, wood leg stubs. Right = 1x2 (16x48).
// ════════════════════════════════════════════════════════════════
function cafeTable(w: number, h: number, topRows: number): string[][] {
  const p = new Pix(w, h);
  const legs = h - 3; // two leg rows: legs, legs + 1
  const hem = legs - 3; // scalloped hem row in the middle of the drape
  const drape0 = hem - 4; // table edge row, then the drape
  const y0 = drape0 - topRows - 1; // cloth outline row
  // corners droop 1-2px below the middle of the hem
  const droop = (x: number) => (x <= 1 || x >= w - 2 ? 2 : x <= 3 || x >= w - 4 ? 1 : 0);
  for (let x = 0; x < w; x++) {
    const hy = hem + droop(x);
    for (let y = y0; y <= hy; y++) {
      if (x === 0 || x === w - 1 || y === y0) {
        p.set(x, y, 'h');
        continue;
      }
      const a = Math.floor((x - 1) / 2) % 2 === 1;
      const b = Math.floor((y - y0 - 1) / 2) % 2 === 1;
      if (y < drape0) {
        if (y === y0 + 1)
          p.set(x, y, a && b ? 'h' : a || b ? 'H' : 'j'); // back row in shade
        else if (x === 1)
          p.set(x, y, 'P'); // lit left edge
        else p.set(x, y, a && b ? 'H' : a || b ? 'j' : 'P');
      } else if (y === hy)
        p.set(x, y, x % 2 === 0 ? 'H' : 'h'); // scalloped hem
      else p.set(x, y, a && b ? 'h' : a || b ? 'H' : 'j');
    }
  }
  // the table's edge under the cloth: one shaded row where top meets drape
  p.fill(1, drape0, w - 2, drape0, 'h');
  // a bud vase in the middle of the top: red bloom, leaf stem, glass
  const cx = Math.floor(w / 2) - 1;
  const cy = Math.floor((y0 + drape0) / 2);
  p.set(cx, cy - 2, 'r')
    .set(cx, cy - 1, 'G')
    .set(cx, cy, 'I')
    .set(cx, cy + 1, 'y');
  for (const x of [2, 3, w - 4, w - 3]) {
    p.set(x, legs, 'D');
    p.set(x, legs + 1, 'D');
  }
  return p.done();
}
const CAFE_TABLE = cafeTable(32, 32, 10);
const CAFE_TABLE_RIGHT = cafeTable(16, 48, 24);

// ════════════════════════════════════════════════════════════════
// 7. bar_stool — red vinyl stool with a low backrest on a chrome post
//    and foot ring, 16x32, 1x1, a seat (4 orientations). Taller than
//    chair_wood: the seat sits at bar height.
// ════════════════════════════════════════════════════════════════
function stoolBase(p: Pix): void {
  // chrome post in three tones: lit left, mid, shaded right
  for (let y = 16; y <= 27; y++) {
    p.set(6, y, 'N');
    p.set(7, y, 'n');
    p.set(8, y, 'm');
  }
  // foot ring with a single silver-light glint
  p.stamp(3, 22, ['.mmmmmmmm.', 'mvVvvvvvvm', '.mmmmmmmm.']);
  p.stamp(4, 27, ['.mnnnnnm.', 'mKKKKKKKm']);
}
function stoolSeat(p: Pix, y: number): void {
  // red vinyl, brick outline, pink-light top-left highlight, a paper diner
  // piping line round the front edge, dark underside
  p.stamp(2, y, [
    '.ZZZZZZZZZZ.',
    'ZjjjjjjjjrrZ',
    'ZjrrrrrrrrrZ',
    'ZPPPPPPPPPPZ',
    '.BBBBBBBBBB.',
    '..vVVVVVVv..',
  ]);
}

const BAR_STOOL = (() => {
  const p = new Pix(16, 32);
  stoolBase(p);
  // backrest behind the seat: one red cushion, brick-dark outline, lit
  // top-left, on a single steel strut down to the seat
  p.stamp(3, 5, ['.BBBBBBBB.', 'BjjjjjjrrB', 'BjrrrrrrrB', 'BrrrrrrrrB', '.BBBBBBBB.']);
  p.set(7, 10, 'n');
  stoolSeat(p, 11);
  return p.done();
})();

const BAR_STOOL_BACK = (() => {
  const p = new Pix(16, 32);
  stoolBase(p);
  stoolSeat(p, 11);
  // backrest in front of the seat, its back side facing us, on one
  // continuous steel strut down into the seat
  p.stamp(3, 5, ['.BBBBBBBB.', 'BrrrrrrrrB', 'BZZZZZZZZB', 'BZZZZZZZZB', '.BBBBBBBB.']);
  p.set(7, 10, 'n').set(7, 11, 'n').set(7, 12, 'n').set(7, 13, 'n');
  return p.done();
})();

const BAR_STOOL_RIGHT = (() => {
  const p = new Pix(16, 32);
  stoolBase(p);
  stoolSeat(p, 11);
  // backrest seen edge-on on the left: same cushion outline + highlight,
  // one steel strut into the seat
  p.stamp(2, 4, ['.BB.', 'BjrB', 'BjrB', 'BrrB', 'BrrB', '.BB.', '..n.']);
  return p.done();
})();

// ════════════════════════════════════════════════════════════════
// 8. menu_board — café chalkboard, 32x32, 2x1, wall. Wood frame, a
//    near-black board with chalk: a doodled steaming cup, lines of
//    "text" with gold prices, a pink heart, a chalk ledge with a stub.
// ════════════════════════════════════════════════════════════════
const MENU_BOARD = (() => {
  const p = new Pix(32, 32);
  p.stamp(14, 0, ['..kk', '.k..k', 'k....k']); // hanging string
  p.box(1, 3, 30, 27, 'D', 'K');
  p.box(2, 4, 29, 26, 'W');
  p.fill(2, 4, 29, 4, 'L');
  p.fill(2, 4, 2, 26, 'L');
  // chalk cup doodle top-left
  p.stamp(4, 6, ['.P.P.', 'P.P..', '.....', 'PPPPPP', 'P....PP', 'P....P.P', 'P....PP', '.PPPP.']);
  // title squiggle + menu lines with prices
  p.stamp(13, 7, ['PPP.PP.PPP', '..........', 'Pz.P.zP.PP']);
  for (const [y, len] of [
    [15, 9],
    [18, 7],
    [21, 10],
  ] as const) {
    for (let x = 4; x < 4 + len; x++) if ((x + y) % 4 !== 0) p.set(x, y, 'A');
    p.stamp(22, y, ['O.OO']);
  }
  p.stamp(13, 10, ['.........']);
  // heart
  p.stamp(24, 6, ['jj.jj', 'jjjjj', '.jjj.', '..j..']);
  // chalk ledge
  p.fill(3, 28, 28, 28, 'W');
  p.fill(3, 29, 28, 29, 'D');
  p.stamp(8, 27, ['PP']);
  p.stamp(20, 27, ['jj']);
  // a half-wiped special in the corner
  p.set(25, 23, 'z').set(26, 24, 'z').set(24, 24, 'z');
  return p.done();
})();

// ════════════════════════════════════════════════════════════════
// 9–15. Tabletop clutter, 16x16 each, canPlaceOnSurfaces.
// ════════════════════════════════════════════════════════════════

/** coffee_mug — pink mug with a heart, coffee inside, steam curling (animated). */
const COFFEE_MUG_BODY = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '....hhhhhhh.....',
  '....hSWWWSh.....',
  '....hjHHHHhhh...',
  '....hjPHPHh.h...',
  '....hjPPPHh.h...',
  '....hjHPHHhhh...',
  '....hjHHHHh.....',
  '.....hhhhh......',
  '................',
];
const coffeeMug = (k: number): string[][] => {
  const p = new Pix(16, 16).stamp(0, 0, COFFEE_MUG_BODY);
  wisp(p, 6, 1, 6, k, WISP, 'P', 'I');
  wisp(p, 9, 2, 6, k + 3, WISP_B, 'I', 'I');
  return p.done();
};
const COFFEE_MUG_FRAMES = frameSet(WISP.length, coffeeMug);

/** kettle — red enamel kettle on the boil, steam from the spout (animated). */
const KETTLE_BODY = [
  '................',
  '................',
  '................',
  '......kkkkk.....',
  '.....k.....k....',
  '.....k.KK..k....',
  '.B....BBBBB.....',
  '.rB..BjjrrrB....',
  '..rBBjrrrrrrB...',
  '...rBjrrrrrrrB..',
  '....BjrrrrrrrB..',
  '....BrrrrrrrrB..',
  '....BrrrrrrrrB..',
  '....kkkkkkkkkk..',
  '.....KKKKKKKK...',
  '................',
];
const kettle = (k: number): string[][] => {
  const p = new Pix(16, 16).stamp(0, 0, KETTLE_BODY);
  wisp(p, 1, 0, 5, k, WISP, 'P', 'I');
  return p.done();
};
const KETTLE_FRAMES = frameSet(WISP.length, kettle);

/** toaster — retro teal toaster, two slices mid-pop, red "on" LED. */
const TOASTER = art([
  '................',
  '................',
  '.....WW...WW....',
  '....WAAW.WAAW...',
  '....WAAW.WAAW...',
  '..ttWllWtWllWt..',
  '.tXXkkkkXkkkkXt.',
  '.txxxxxxxxxxxxt.',
  '.tttttttttttttt.',
  '.tXxxxxxxxxxrxt.',
  '.tVVVVVVVVVVVVt.',
  '.txxxxxxxxxxKxtv',
  '.txxxxxxxxxxxxtV',
  '..tttttttttttt..',
  '..KK........KK..',
  '................',
]);

/** fruit_bowl — wooden bowl heaped with apple, orange, banana, grapes. */
const FRUIT_BOWL = (() => {
  const p = new Pix(16, 16);
  // banana arcing across the back: gold-light body, gold-dark outline,
  // its dark stem touching the tip
  p.stamp(6, 0, ['......oD', '....ooYo', '..ooYYYo', '.oYYYoo.', 'oYYoo...', 'ooo.....']);
  p.disc(5, 6.5, 2.8, 2.8, 'B', 'r', 'j'); // apple, brick-dark outline
  p.set(5, 3, 'D').set(6, 3, 'G');
  p.disc(10.5, 7, 2.8, 2.8, 'c', 'R', 'O'); // orange, clay-dark outline
  p.set(10, 4, 'G');
  // bowl
  p.stamp(1, 9, [
    '.LLLLLLLLLLLLL',
    'DLTTTTTTTTTTWD',
    '.DWWWWWWWWWWD.',
    '..DDWWWWWWDD..',
    '....DDDDDD....',
  ]);
  // a little grape cluster spilling over the left rim
  for (const [x, y, ch] of [
    [2, 7, 'p'],
    [3, 7, 'u'],
    [1, 8, 'p'],
    [2, 8, 'u'],
    [3, 8, 'p'],
    [4, 8, 'u'],
    [2, 9, 'p'],
    [3, 9, 'u'],
  ] as const)
    p.set(x, y, ch);
  return p.done();
})();

/** pizza_box — open box with a pepperoni pizza missing one slice. */
const PIZZA_BOX = (() => {
  const p = new Pix(16, 16);
  // lid standing open behind: clay cardboard, clay-dark outline, a red and
  // paper logo circle
  p.box(2, 1, 13, 5, 'c', 'C');
  p.fill(3, 2, 12, 2, 'R'); // lit top edge of the lid
  p.stamp(6, 2, ['.rr.', 'rPPr', '.rr.']);
  // tray in front: cream-dark cardboard floor, a round pizza with one
  // triangular slice gone (the bare cardboard shows through)
  p.box(2, 6, 13, 13, 'c', 'l');
  const cx = 7.5;
  const cy = 9.5;
  const rx = 5;
  const ry = 3.1;
  const inPie = (x: number, y: number) => ellipse(x, y, cx, cy, rx, ry) <= 1;
  for (let y = 7; y <= 12; y++) {
    for (let x = 3; x <= 12; x++) {
      if (!inPie(x, y)) continue;
      const ang = Math.atan2((y - cy) / ry, (x - cx) / rx);
      if (ang > 0.05 && ang < 1.35) continue; // the missing slice, front-right
      const rim = !inPie(x - 1, y) || !inPie(x + 1, y) || !inPie(x, y - 1) || !inPie(x, y + 1);
      p.set(x, y, rim ? 'C' : (x * 2 + y) % 5 === 0 ? 'Y' : 'O');
    }
  }
  for (const [x, y] of [
    [5, 8],
    [8, 8],
    [5, 11],
    [7, 10],
    [10, 9],
  ])
    p.set(x, y, 'r');
  // the tray's short front face
  p.fill(2, 14, 13, 14, 'C');
  p.set(2, 14, 'c').set(13, 14, 'c');
  return p.done();
})();

/** dish_rack — chrome rack of drying plates and an upturned teal mug. */
const DISH_RACK = (() => {
  const p = new Pix(16, 16);
  // three plates standing on edge in the rack: thin vertical discs with a
  // silver-light rim on the left, paper face, silver right edge
  for (const x of [0, 4, 8]) {
    p.stamp(x, 2, [
      '.VV..',
      'VPPv.',
      'VPPv.',
      'VPIv.',
      '.VPIv',
      '.VPIv',
      '.VPIv',
      '.VPPv',
      '..vv.',
    ]);
  }
  // wire uprights between the plates
  for (const x of [4, 8, 12]) for (let y = 8; y <= 11; y++) p.set(x, y, 'n');
  // upturned mug
  p.stamp(12, 6, ['.ttt', 'tXxt', 'tXxt', 'tXxt', 'tttt']);
  // rack base
  p.stamp(0, 11, ['mVVVVVVVVVVVVVm', 'mnnnnnnnnnnnnnm', '.m...........m.']);
  // water dripping off the rack into a little puddle
  p.set(6, 14, 'y').set(5, 15, 'I').set(6, 15, 'y').set(7, 15, 'I');
  return p.done();
})();

/** cake_stand — pink layer cake under a glass dome, one wedge cut. */
const CAKE_STAND = (() => {
  const p = new Pix(16, 16);
  // cake rows 6-11, cols 4-11
  p.stamp(4, 5, [
    '...r....',
    '.jjjjjj.',
    'hjPjPjjh',
    'hHHHHPYP',
    'hAAAAPYP',
    'hHHHHPYP',
    '.hhhhhh.',
  ]);
  // stand
  p.stamp(1, 12, ['.nVVVVVVVVVVn', 'mmmmmmmmmmmmmm', '......Vn', '....mmmmmm']);
  // dome: rim outline only + highlight so the cake shows through
  for (let y = 0; y <= 12; y++) {
    for (let x = 0; x < 16; x++) {
      const d = ellipse(x, y, 7.5, 12, 6.8, 11);
      if (y > 12 || d > 1 || d < 0.72) continue;
      if (p.get(x, y) === '.' || y < 5) p.set(x, y, 'y');
    }
  }
  p.set(7, 0, 'v');
  p.set(8, 0, 'v');
  p.stamp(3, 3, ['.P', 'P.', 'P', 'P']);
  return p.done();
})();

// ════════════════════════════════════════════════════════════════
// 16. gumball_machine — 16x32, 1x1. Glass globe of coloured gumballs on
//     a red cast body: silver coin plate with a slot and crank, a chute
//     with one gumball waiting behind the flap, dark feet.
// 17. cup_noodles — desk lunch: lid peeled back, a fork stuck in the
//     noodles, steam rising.
// 18. birthday_cake — office birthday: pink frosted cake, three lit
//     candles, sprinkles, on a plate.
// ════════════════════════════════════════════════════════════════
const GUMBALL_MACHINE = (() => {
  const p = new Pix(16, 32);
  // red cap + knob
  p.stamp(5, 1, ['..rr..', '.ZrrZ.', 'ZjrrrZ']);
  // glass globe
  p.disc(7.5, 9.5, 5.6, 5.6, 'y', 'I');
  // gumballs heaped in the lower two thirds, a few loose on top
  const colours = ['r', 'O', 'x', 'H', 'Q', 'E', 'p', 'R'];
  for (let y = 9; y <= 14; y++) {
    for (let x = 3; x <= 12; x++) {
      if (p.get(x, y) !== 'I') continue;
      if (y === 9 && (x < 5 || x > 10)) continue;
      p.set(x, y, colours[(x * 5 + y * 3 + ((x * y) % 3)) % colours.length]);
    }
  }
  p.set(7, 8, 'O').set(9, 8, 'r');
  p.set(4, 6, 'P').set(3, 7, 'P').set(3, 8, 'P'); // glare
  // silver collar
  p.fill(4, 15, 11, 15, 'V');
  p.fill(4, 16, 11, 16, 'v');
  p.set(4, 16, 'm').set(11, 16, 'm');
  // red body, lit left edge
  p.box(3, 17, 12, 27, 'Z', 'r');
  p.fill(4, 18, 4, 26, 'j');
  // coin plate: slot + crank
  p.box(5, 18, 10, 22, 'm', 'V');
  p.set(7, 19, 'k').set(8, 19, 'k');
  p.fill(6, 21, 9, 21, 'N');
  // chute with a gumball behind the flap
  p.box(6, 23, 9, 26, 'm', 'K');
  p.set(7, 25, 'O').set(8, 25, 'O').set(7, 24, 'Y');
  // base + feet
  p.fill(2, 28, 13, 28, 'm');
  p.fill(3, 28, 12, 28, 'n');
  for (const x of [3, 4, 11, 12]) p.set(x, 29, 'K');
  return p.done();
})();

/** Animated: steam rising out of the cup, left of the lid. */
function cupNoodles(k: number): string[][] {
  const p = new Pix(16, 16);
  // steam, left of the lid
  wisp(p, 4, 0, 5, k, WISP, 'P', 'I');
  // foil lid peeled up and back behind the cup (top-right): a flat cream
  // tab with a 1px red logo line, sitting behind the fork
  p.stamp(7, 2, ['.lllll', 'lAAAAl', 'lrrrrl', 'lAAAAl']);
  // cup: rim, noodles, front lip
  p.fill(4, 6, 12, 6, 'l');
  p.stamp(4, 7, ['lOYOOYOYl']);
  p.fill(4, 8, 12, 8, 'P');
  p.set(4, 8, 'l').set(12, 8, 'l');
  // tapered body with a red band and a gold logo
  for (let y = 9; y <= 13; y++) {
    const inset = y >= 12 ? 1 : 0;
    p.fill(4 + inset, y, 12 - inset, y, y === 10 || y === 11 ? 'r' : 'P');
    p.set(4 + inset, y, 'l');
    p.set(12 - inset, y, 'l');
  }
  p.set(5, 10, 'j').set(5, 11, 'j');
  p.set(8, 10, 'O').set(9, 11, 'O');
  p.fill(6, 14, 10, 14, 'l');
  // a noodle hanging over the front lip
  p.set(6, 8, 'O').set(7, 9, 'O');
  // fork stuck in the noodles, in front of the lid
  p.set(11, 1, 'N').set(13, 1, 'N');
  p.fill(11, 2, 13, 2, 'N');
  p.set(12, 3, 'V').set(11, 4, 'v').set(11, 5, 'v').set(10, 6, 'v').set(10, 7, 'v');
  return p.done();
}
const CUP_NOODLES_FRAMES = frameSet(WISP.length, cupNoodles);

const BIRTHDAY_CAKE = art([
  '.....w..w..w....',
  '.....R..R..R....',
  '.....x..H..Q....',
  '.....P..P..P....',
  '...hhxhhHhhQhh..',
  '..hPPxPPHPPQPPh.',
  '..hPPPPPPPPPPPh.',
  '..hPPPPPPPPPPPh.',
  '..hPHPPHPHPPHHh.',
  '..hjHHHHHPHHHHh.',
  '..hjHrHHOHHxHHh.',
  '..hjHHHHHHHHHHh.',
  '...hhhhhhhhhhh..',
  '.mVVVVVVVVVVVVm.',
  '..mmmmmmmmmmmm..',
  '................',
]);

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

/** Attach an animation: frame 0 becomes the still sprite, the rest loop after it. */
const animated = (e: GeneratedSprite, all: string[][][], frameMs: number): GeneratedSprite => ({
  ...e,
  sprite: all[0],
  frames: all.slice(1),
  frameMs,
});

export const SPRITES10: GeneratedSprite[] = [
  animated(
    entry('espresso_bar', 'Espresso Bar', 32, 48, 2, 1, [], 'espresso_bar', 'front'),
    ESPRESSO_BAR_FRAMES,
    180,
  ),
  entry(
    'espresso_bar_right',
    'Espresso Bar (Right)',
    16,
    48,
    1,
    2,
    ESPRESSO_BAR_RIGHT,
    'espresso_bar',
    'right',
  ),
  entry(
    'espresso_bar_left',
    'Espresso Bar (Left)',
    16,
    48,
    1,
    2,
    mirrorSprite(ESPRESSO_BAR_RIGHT),
    'espresso_bar',
    'left',
  ),
  animated(entry('kitchen_range', 'Kitchen Range', 16, 48, 1, 1, []), KITCHEN_RANGE_FRAMES, 180),
  entry('bakery_case', 'Bakery Case', 32, 32, 2, 1, BAKERY_CASE, 'bakery_case', 'front'),
  entry(
    'bakery_case_right',
    'Bakery Case (Right)',
    16,
    48,
    1,
    2,
    BAKERY_CASE_RIGHT,
    'bakery_case',
    'right',
  ),
  entry(
    'bakery_case_left',
    'Bakery Case (Left)',
    16,
    48,
    1,
    2,
    mirrorSprite(BAKERY_CASE_RIGHT),
    'bakery_case',
    'left',
  ),
  entry('pantry_shelf', 'Pantry Shelf', 16, 32, 1, 1, PANTRY_SHELF),
  animated(entry('popcorn_cart', 'Popcorn Cart', 16, 32, 1, 1, []), POPCORN_CART_FRAMES, 160),
  entry('cafe_table', 'Café Table', 32, 32, 2, 1, CAFE_TABLE, 'cafe_table', 'front'),
  entry(
    'cafe_table_right',
    'Café Table (Rotated)',
    16,
    48,
    1,
    2,
    CAFE_TABLE_RIGHT,
    'cafe_table',
    'right',
  ),
  entry('bar_stool', 'Bar Stool', 16, 32, 1, 1, BAR_STOOL, 'bar_stool', 'front'),
  entry(
    'bar_stool_right',
    'Bar Stool (Right)',
    16,
    32,
    1,
    1,
    BAR_STOOL_RIGHT,
    'bar_stool',
    'right',
  ),
  entry('bar_stool_back', 'Bar Stool (Back)', 16, 32, 1, 1, BAR_STOOL_BACK, 'bar_stool', 'back'),
  entry(
    'bar_stool_left',
    'Bar Stool (Left)',
    16,
    32,
    1,
    1,
    mirrorSprite(BAR_STOOL_RIGHT),
    'bar_stool',
    'left',
  ),
  entry('menu_board', 'Menu Board', 32, 32, 2, 1, MENU_BOARD),
  animated(entry('coffee_mug', 'Coffee Mug', 16, 16, 1, 1, []), COFFEE_MUG_FRAMES, 220),
  animated(entry('kettle', 'Kettle', 16, 16, 1, 1, []), KETTLE_FRAMES, 160),
  entry('toaster', 'Toaster', 16, 16, 1, 1, TOASTER),
  entry('fruit_bowl', 'Fruit Bowl', 16, 16, 1, 1, FRUIT_BOWL),
  entry('pizza_box', 'Pizza Box', 16, 16, 1, 1, PIZZA_BOX),
  entry('dish_rack', 'Dish Rack', 16, 16, 1, 1, DISH_RACK),
  entry('cake_stand', 'Cake Stand', 16, 16, 1, 1, CAKE_STAND),
  entry('gumball_machine', 'Gumball Machine', 16, 32, 1, 1, GUMBALL_MACHINE),
  animated(entry('cup_noodles', 'Cup Noodles', 16, 16, 1, 1, []), CUP_NOODLES_FRAMES, 220),
  entry('birthday_cake', 'Birthday Cake', 16, 16, 1, 1, BIRTHDAY_CAKE),
];

validateSprites(SPRITES10);

const surface: CatalogMeta = { category: 'decor', canPlaceOnSurfaces: true };
const stool: CatalogMeta = { category: 'chairs' };
const bar: CatalogMeta = { category: 'storage', isDesk: true };
const bakery: CatalogMeta = { category: 'storage' };
const table: CatalogMeta = { category: 'desks', isDesk: true };

export const META10: Record<string, CatalogMeta> = {
  espresso_bar: bar,
  espresso_bar_right: bar,
  espresso_bar_left: bar,
  kitchen_range: { category: 'storage', isDesk: true },
  bakery_case: bakery,
  bakery_case_right: bakery,
  bakery_case_left: bakery,
  pantry_shelf: { category: 'storage' },
  popcorn_cart: { category: 'storage' },
  cafe_table: table,
  cafe_table_right: table,
  bar_stool: stool,
  bar_stool_right: stool,
  bar_stool_back: stool,
  bar_stool_left: stool,
  menu_board: { category: 'wall', canPlaceOnWalls: true },
  coffee_mug: surface,
  kettle: { category: 'electronics', canPlaceOnSurfaces: true },
  toaster: { category: 'electronics', canPlaceOnSurfaces: true },
  fruit_bowl: surface,
  pizza_box: surface,
  dish_rack: surface,
  cake_stand: surface,
  gumball_machine: { category: 'storage' },
  cup_noodles: surface,
  birthday_cake: surface,
};
