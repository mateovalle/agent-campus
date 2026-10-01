/**
 * sprites12.ts — Batch 12: hardware lab & server room.
 *
 * Until now the campus's tech was one server rack, monitors, a laptop, a
 * printer and a desk lamp: enough for an office, not for the people who
 * build the hardware the agents run on. This batch adds a workshop and a
 * proper data-centre corner, and every piece carries a small story:
 *
 *   server_cluster    — the showpiece: two racks under a cable tray. The left
 *                       one is open and full of patch-cable spaghetti (one
 *                       cable wears a paper "do not unplug" tag); the right
 *                       one is behind a glass door with a sticky note on it.
 *                       2x1 + its 1x2 quarter turns.
 *   workbench         — butcher-block bench under a pegboard: hammer, wrench,
 *                       pliers, a coil of wire, and the painted outline of the
 *                       screwdriver somebody borrowed. Vise, cutting mat, a
 *                       coffee ring. isDesk, 2x1 + 1x2 quarter turns.
 *   ups_tower         — battery backup: LCD with charge bars, a bolt, and its
 *                       fat power lead curling across the floor.
 *   tool_chest        — red rolling chest, one drawer left open, a wrench on
 *                       the lid.
 *   cardboard_boxes   — the unboxing pile: fragile tape, a shipping label,
 *                       the top box open with cables escaping.
 *   robot_arm         — orange industrial arm on a hazard-striped plinth,
 *                       holding (of course) a tiny rubber duck.
 *   patch_panel       — wall: switch over a patch panel, fibre up to the
 *                       ceiling, a tied-off bundle down to the floor, and one
 *                       unplugged cable dangling.
 *   noc_wall          — wall: 2x2 video wall (graph, bars, host grid with one
 *                       red host, logs with a red line) and a lit alert beacon.
 *   Desk clutter (canPlaceOnSurfaces): printer_3d mid-print (a hull half
 *   built, filament running from the spool), soldering_station (red digits,
 *   smoking tip, brass sponge), oscilloscope (sine trace, probes on the desk),
 *   keyboard_mech (cream caps, pink mods, a gold artisan key, coiled cable),
 *   headphones_stand, drone_quad (blurred props, nav lights).
 *   lab_stool         — teal drafting stool (4 orientations) so the bench
 *                       finally has a seat.
 *   esd_mat           — anti-static floor mat with a wrist strap left on it.
 *   parts_cabinet     — tiny-drawer cabinet, one drawer out, resistors spilt.
 *
 * Same conventions as the earlier batches: house palette only (palette.ts),
 * light from top-left, 1px outline in a darker shade of the material, short
 * front faces with visible tops, tall pieces keeping the 16px-per-row
 * overhang. Multi-tile pieces ship their quarter turns (left = mirrored
 * right). Drawing is programmatic: a tiny canvas plus a shape "mask" that is
 * shaded outline → lit → base → dark, so round parts (cups, joints, coils)
 * get the same lighting rule as the hand-pixelled boxes.
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
  RED,
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

/** Minimal hex canvas: '' = transparent. */
class Cv {
  readonly g: string[][];
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.g = Array.from({ length: h }, () => new Array<string>(w).fill(''));
  }
  px(x: number, y: number, c: string): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = c;
  }
  at(x: number, y: number): string {
    return this.g[y]?.[x] ?? '';
  }
  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c);
  }
  /** Filled rect with a 1px outline. */
  box(x: number, y: number, w: number, h: number, o: string, f: string): void {
    this.rect(x, y, w, h, o);
    this.rect(x + 1, y + 1, w - 2, h - 2, f);
  }
  hl(x0: number, x1: number, y: number, c: string): void {
    for (let x = x0; x <= x1; x++) this.px(x, y, c);
  }
  vl(x: number, y0: number, y1: number, c: string): void {
    for (let y = y0; y <= y1; y++) this.px(x, y, c);
  }
  /** Copy non-transparent pixels of a hex grid in at (ox, oy). */
  blit(src: string[][], ox: number, oy: number): void {
    src.forEach((row, y) => row.forEach((c, x) => c && this.px(ox + x, oy + y, c)));
  }
  ascii(rows: string[], legend: Legend, ox = 0, oy = 0): void {
    this.blit(fromAscii(rows, legend), ox, oy);
  }
}

/** A set of pixels, built from primitives, then shaded by paint(). */
class Mask {
  private s = new Set<string>();
  has(x: number, y: number): boolean {
    return this.s.has(`${x},${y}`);
  }
  add(x: number, y: number): this {
    this.s.add(`${x},${y}`);
    return this;
  }
  rect(x: number, y: number, w: number, h: number): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.add(xx, yy);
    return this;
  }
  /** Ellipse centred at (cx, cy) in pixel-edge coordinates. */
  ellipse(cx: number, cy: number, rx: number, ry: number): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.add(x, y);
      }
    }
    return this;
  }
  /** Capsule from (x0,y0) to (x1,y1) (pixel centres) of radius r. */
  line(x0: number, y0: number, x1: number, y1: number, r: number): this {
    const minX = Math.floor(Math.min(x0, x1) - r);
    const maxX = Math.ceil(Math.max(x0, x1) + r);
    const minY = Math.floor(Math.min(y0, y1) - r);
    const maxY = Math.ceil(Math.max(y0, y1) + r);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
        const ex = x0 + t * dx - x;
        const ey = y0 + t * dy - y;
        if (ex * ex + ey * ey <= r * r) this.add(x, y);
      }
    }
    return this;
  }
  each(fn: (x: number, y: number) => void): void {
    for (const k of this.s) {
      const [x, y] = k.split(',').map(Number);
      fn(x, y);
    }
  }
}

interface Shade {
  o: string;
  base: string;
  lit?: string;
  dark?: string;
}

/** Shade a mask: outline on the edge, lit along top/left, dark along bottom/right. */
function paint(cv: Cv, m: Mask, { o, base, lit, dark }: Shade): void {
  m.each((x, y) => {
    const edge = !m.has(x - 1, y) || !m.has(x + 1, y) || !m.has(x, y - 1) || !m.has(x, y + 1);
    if (edge) cv.px(x, y, o);
    else if (lit && (!m.has(x, y - 2) || !m.has(x - 2, y))) cv.px(x, y, lit);
    else if (dark && (!m.has(x, y + 2) || !m.has(x + 2, y))) cv.px(x, y, dark);
    else cv.px(x, y, base);
  });
}

// ── animation helpers ──
// Animated pieces only ever repaint a few pixels: each extra frame is a copy
// of frame 0 (the still every non-animating consumer sees) with a small
// region changed, so the silhouette can't drift between frames.

/** Frames 1..n-1 derived from `base`: `edit(g, i)` repaints a copy for frame i. */
function deriveFrames(
  base: string[][],
  n: number,
  edit: (g: string[][], i: number) => void,
): string[][][] {
  const out: string[][][] = [];
  for (let i = 1; i < n; i++) {
    const g = base.map((row) => [...row]);
    edit(g, i);
    out.push(g);
  }
  return out;
}

/** Deterministic 0..99 hash so LED blink patterns are fixed across builds. */
function hash100(a: number, b: number): number {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 13;
  return (h >>> 0) % 100;
}

/** An LED that blinks: where it is, its lit colour, and its dark colour. */
type Led = [x: number, y: number, on: string, off: string];

/** Busy activity LEDs: in frames 1..n-1 each LED is dark with probability
 *  `offPct`%. Only pixels that still hold their lit colour in frame 0 are
 *  touched, so a cable drawn over an LED never gets punched through. */
function blinkFrames(base: string[][], leds: Led[], n: number, offPct: number): string[][][] {
  const live = leds.filter(([x, y, on]) => base[y]?.[x] === on);
  return deriveFrames(base, n, (g, i) =>
    live.forEach(([x, y, , off], k) => {
      if (hash100(k, i) < offPct) g[y][x] = off;
    }),
  );
}

// ════════════════════════════════════════════════════════════════
// 1. workbench — 32x32, 2x1, desks (isDesk). The house desk slab
//    (benchTop(): WOOD planks, lit seams) as a butcher-block top, under a pegboard that
//    rises a full tile behind it. Hammer, wrench, a PAINTED OUTLINE
//    where the screwdriver should hang, a red screwdriver, blue pliers,
//    a coil of orange wire. On the top: a vise on the front-left, a
//    green cutting mat, loose screws, a coffee ring.
// ════════════════════════════════════════════════════════════════
/** Butcher-block top: WOOD_DARK outline, WOOD planks with WOOD_LIGHT seams
 *  (horizontal when `along` = 'x', vertical when 'y'), lit top row + left
 *  column, a 2px WOOD_DARK front face and WOOD_SHADOW leg stubs. */
function benchTop(cv: Cv, x: number, y: number, w: number, h: number, along: 'x' | 'y'): void {
  cv.box(x, y, w, h, WOOD_DARK, WOOD);
  if (along === 'x') {
    for (let yy = y + 3; yy < y + h - 1; yy += 3) cv.hl(x + 1, x + w - 2, yy, WOOD_LIGHT);
  } else {
    for (let xx = x + 3; xx < x + w - 1; xx += 3) cv.vl(xx, y + 1, y + h - 2, WOOD_LIGHT);
  }
  cv.hl(x + 1, x + w - 2, y + 1, WOOD_LIGHT);
  cv.vl(x + 1, y + 1, y + h - 2, WOOD_LIGHT);
  // front face
  cv.hl(x, x + w - 1, y + h, WOOD_DARK);
  cv.hl(x, x + w - 1, y + h + 1, WOOD_SHADOW);
  cv.px(x, y + h, WOOD_SHADOW);
  cv.px(x + w - 1, y + h, WOOD_SHADOW);
  // leg stubs
  for (const lx of [x + 1, x + 2, x + w - 3, x + w - 2])
    cv.vl(lx, y + h + 2, y + h + 3, WOOD_SHADOW);
}

/** 5x5 coil of wire: ORANGE ring lit top-left, CLAY on the shaded side, a
 *  CLAY_DARK inner shadow and an empty centre (whatever is behind shows). */
const WIRE_COIL = ['.ooo.', 'oddoc', 'od.oc', 'ooooc', '.ccc.'];
const WIRE_COIL_LEGEND: Legend = { o: ORANGE, c: CLAY, d: CLAY_DARK };

const WORKBENCH = (() => {
  const cv = new Cv(32, 32);
  // posts that hold the board
  cv.vl(4, 12, 17, IRON);
  cv.vl(27, 12, 17, IRON);
  // pegboard, the full width of the bench
  cv.box(0, 0, 32, 14, WOOD_DARK, CREAM_DARK);
  cv.hl(1, 30, 1, CREAM);
  cv.vl(1, 1, 12, CREAM);
  for (let y = 3; y <= 12; y += 3) for (let x = 4; x <= 28; x += 3) cv.px(x, y, STONE_DARK);
  // hammer
  cv.hl(4, 8, 2, SILVER_LIGHT);
  cv.hl(4, 8, 3, STEEL_DARK);
  cv.px(4, 3, STEEL);
  cv.vl(6, 4, 11, WOOD);
  cv.vl(6, 9, 11, WOOD_DARK);
  // wrench
  cv.px(10, 2, SILVER);
  cv.px(12, 2, SILVER);
  cv.hl(10, 12, 3, SILVER);
  cv.vl(11, 4, 9, SILVER_LIGHT);
  cv.vl(10, 10, 11, SILVER);
  cv.vl(12, 10, 11, SILVER);
  cv.px(11, 12, SILVER);
  // the missing screwdriver — a dashed painted outline, pegboard showing through
  for (let y = 2; y <= 6; y++)
    for (let x = 14; x <= 16; x++) {
      const edge = x !== 15 || y === 2 || y === 6;
      if (edge && (x + y) % 2 === 0) cv.px(x, y, WOOD_DARK);
    }
  for (const y of [8, 10, 12]) cv.px(15, y, WOOD_DARK);
  // red screwdriver
  cv.rect(18, 2, 3, 4, RED);
  cv.vl(20, 2, 5, BRICK);
  cv.px(18, 2, PINK_LIGHT);
  cv.px(19, 6, SILVER_LIGHT);
  cv.vl(19, 7, 11, SILVER);
  // pliers
  cv.px(23, 2, STEEL);
  cv.hl(22, 24, 3, STEEL);
  cv.px(23, 4, STEEL_DARK);
  cv.px(23, 5, SILVER_LIGHT);
  for (let y = 6; y <= 11; y++) {
    const d = y < 8 ? 1 : 2;
    cv.px(23 - d, y, BLUE);
    cv.px(23 + d, y, BLUE);
  }
  // coil of wire on a hook: a hollow ring, the board showing through its
  // middle, with a short bare-ended tail
  cv.px(28, 2, STEEL_DARK);
  cv.ascii(WIRE_COIL, WIRE_COIL_LEGEND, 26, 3);
  cv.px(28, 8, ORANGE);
  cv.px(28, 9, CLAY);
  cv.px(29, 10, GOLD_DARK);
  // bench top
  benchTop(cv, 0, 16, 32, 12, 'x');
  // green cutting mat
  cv.box(19, 18, 10, 8, LEAF_DARK, LEAF);
  for (let x = 21; x <= 27; x += 3) cv.vl(x, 19, 24, GREEN_LIGHT);
  cv.hl(20, 27, 21, GREEN_LIGHT);
  // coffee ring
  for (const [x, y] of [
    [13, 19],
    [14, 19],
    [12, 20],
    [15, 20],
    [12, 21],
    [15, 21],
    [13, 22],
    [14, 22],
  ])
    cv.px(x, y, CLAY_DARK);
  // screws
  cv.px(10, 24, SILVER_LIGHT);
  cv.px(12, 25, SILVER_LIGHT);
  cv.px(16, 24, GOLD);
  // vise on the front-left, jaws overhanging the front edge
  cv.box(2, 21, 7, 7, IRON, STEEL);
  cv.hl(3, 7, 22, STEEL_LIGHT);
  cv.vl(3, 22, 26, STEEL_LIGHT);
  cv.px(3, 22, SILVER_LIGHT);
  cv.hl(4, 7, 24, IRON_DARK);
  cv.hl(2, 8, 28, IRON);
  cv.vl(5, 28, 29, SILVER);
  cv.hl(2, 8, 30, SILVER_LIGHT);
  cv.px(2, 30, SILVER);
  cv.px(8, 30, SILVER);
  return cv.g;
})();

/** Quarter turn facing RIGHT: the pegboard (the bench's back) runs along the
 *  west edge, the vise is clamped on the east (front) edge. */
const WORKBENCH_RIGHT = (() => {
  const cv = new Cv(16, 48);
  benchTop(cv, 0, 16, 16, 28, 'y');
  // cutting mat on the front (east) half
  cv.box(8, 27, 7, 11, LEAF_DARK, LEAF);
  for (let y = 29; y <= 36; y += 3) cv.hl(9, 13, y, GREEN_LIGHT);
  cv.vl(11, 28, 36, GREEN_LIGHT);
  // coffee ring
  for (const [x, y] of [
    [10, 39],
    [11, 39],
    [9, 40],
    [12, 40],
    [9, 41],
    [12, 41],
    [10, 42],
    [11, 42],
  ])
    cv.px(x, y, CLAY_DARK);
  cv.px(9, 26, SILVER_LIGHT);
  cv.px(5, 40, GOLD);
  cv.px(7, 38, SILVER_LIGHT);
  // pegboard seen edge-on along the west (back) edge, rising a tile above
  cv.vl(0, 2, 42, WOOD_DARK);
  cv.vl(1, 2, 42, CREAM);
  cv.vl(2, 2, 42, WOOD_DARK);
  cv.px(1, 2, WOOD_DARK);
  for (let y = 5; y <= 40; y += 3) cv.px(1, y, STONE_DARK);
  // tools hanging off the board's face on short pegs, over the bench
  // hammer: handle on the peg, head at its end
  cv.hl(3, 5, 18, WOOD);
  cv.vl(6, 17, 19, STEEL_DARK);
  cv.px(6, 17, SILVER_LIGHT);
  // red screwdriver: handle against the board, shaft pointing out
  cv.hl(3, 4, 21, RED);
  cv.hl(3, 4, 22, BRICK);
  cv.px(3, 21, PINK_LIGHT);
  cv.hl(5, 7, 21, SILVER);
  // wrench: bar + open jaw
  cv.hl(3, 6, 25, SILVER);
  cv.px(7, 24, SILVER_LIGHT);
  cv.px(7, 26, SILVER_LIGHT);
  // pliers
  cv.hl(3, 6, 28, BLUE);
  cv.hl(3, 5, 29, BLUE);
  cv.px(7, 28, STEEL);
  // orange wire coil, same ring as the front view, tail hanging down
  cv.px(3, 31, STEEL_DARK);
  cv.ascii(WIRE_COIL, WIRE_COIL_LEGEND, 3, 32);
  cv.px(5, 37, ORANGE);
  cv.px(5, 38, CLAY);
  cv.px(6, 39, GOLD_DARK);
  // vise on the east (front) edge
  cv.box(9, 18, 7, 7, IRON, STEEL);
  cv.hl(10, 14, 19, STEEL_LIGHT);
  cv.vl(10, 19, 23, STEEL_LIGHT);
  cv.px(10, 19, SILVER_LIGHT);
  cv.vl(12, 20, 23, IRON_DARK);
  cv.vl(15, 16, 26, SILVER_LIGHT);
  cv.px(15, 16, SILVER);
  cv.px(15, 26, SILVER);
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// 2. server_cluster — the SHOWPIECE. 32x48, 2x1, electronics. Two racks
//    in the house rack language (INK outline, IRON_DARK carcass, lit
//    steel top) under a ladder cable tray. Left rack: no door, patch
//    panel + switch with five cables looping across the servers below,
//    one wearing a paper tag. Right rack: glass door — the servers read
//    as navy through it, ICE glints across the pane, handle, a sticky
//    note, a teal status strip.
// ════════════════════════════════════════════════════════════════
const SERVER_CLUSTER = (() => {
  const cv = new Cv(32, 48);
  // cable tray
  cv.hl(1, 30, 0, SILVER_LIGHT);
  const tray = [BLUE, BLUE, GOLD, RED, LED_GREEN, BLUE, PINK, TEAL, GOLD, ORANGE];
  for (let x = 1; x <= 30; x++) cv.px(x, 1, tray[x % tray.length]);
  cv.hl(1, 30, 2, STEEL_DARK);
  for (const x of [1, 10, 21, 30]) cv.vl(x, 0, 2, SILVER);

  for (const ox of [0, 16]) {
    cv.box(ox, 3, 16, 39, INK, IRON_DARK); // y 3..41
    cv.hl(ox + 1, ox + 14, 4, STEEL);
    cv.px(ox + 1, 4, STEEL_LIGHT);
    cv.vl(ox, 3, 6, STEEL_DARK);
    cv.px(ox + 1, 3, STEEL_DARK);
    cv.hl(ox + 1, ox + 14, 5, STEEL_DARK);
    cv.hl(ox + 1, ox + 14, 6, INK);
    cv.hl(ox + 1, ox + 14, 42, IRON_DARK);
    cv.px(ox, 42, INK);
    cv.px(ox + 15, 42, INK);
    cv.hl(ox, ox + 15, 43, INK);
    for (const fx of [2, 3, 12, 13]) cv.vl(ox + fx, 44, 45, INK);
  }

  // ── left rack: open, cable spaghetti ──
  cv.vl(1, 7, 40, IRON);
  cv.vl(14, 7, 40, IRON);
  for (let y = 8; y <= 40; y += 3) {
    cv.px(1, y, STEEL_LIGHT);
    cv.px(14, y, STEEL_LIGHT);
  }
  // patch panel
  cv.hl(2, 13, 8, STEEL_DARK);
  cv.hl(2, 13, 9, IRON);
  cv.hl(2, 13, 10, IRON_DARK);
  for (let x = 3; x <= 11; x += 2) cv.px(x, 9, INK);
  // switch
  cv.hl(2, 13, 12, STEEL_DARK);
  cv.hl(2, 13, 13, IRON);
  cv.hl(2, 13, 14, IRON_DARK);
  const swLeds = [LED_GREEN, AMBER, LED_GREEN, LED_GREEN, RED];
  for (let i = 0; i < 5; i++) {
    cv.px(3 + 2 * i, 13, INK);
    cv.px(4 + 2 * i, 12, swLeds[i]);
  }
  // servers
  const leds: [string, string][] = [
    [LED_GREEN, LED_GREEN],
    [LED_GREEN, AMBER],
    [LED_GREEN, LED_GREEN],
    [SKY, LED_GREEN],
    [LED_GREEN, RED],
    [LED_GREEN, LED_GREEN],
    [AMBER, LED_GREEN],
    [LED_GREEN, SKY],
  ];
  leds.forEach(([a, b], i) => {
    const y = 16 + 3 * i;
    cv.hl(2, 13, y, STEEL_DARK);
    cv.hl(2, 13, y + 1, IRON);
    for (let x = 3; x <= 8; x += 2) cv.px(x, y + 1, IRON_DARK);
    cv.px(11, y + 1, a);
    cv.px(12, y + 1, b);
  });
  // patch cables: port (x1, 9) → down → across → up into the switch (x2, 13)
  const cable = (x1: number, x2: number, yb: number, c: string) => {
    cv.vl(x1, 10, yb - 1, c);
    const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
    cv.hl(a + 1, b - 1, yb, c);
    cv.vl(x2, 14, yb - 1, c);
  };
  cable(9, 5, 18, LED_GREEN);
  cable(3, 9, 21, BLUE);
  cable(5, 11, 24, GOLD);
  cable(11, 7, 20, PINK);
  cable(7, 3, 27, RED);
  // "do not unplug" tag hanging off the red cable
  cv.px(5, 28, STONE_DARK);
  cv.rect(4, 29, 3, 2, PAPER);
  cv.px(5, 29, RED);
  // cables dropping in from the tray
  cv.vl(4, 3, 7, TEAL);
  cv.vl(12, 3, 7, ORANGE);

  // ── right rack: glass door ──
  cv.box(17, 7, 14, 34, STEEL_DARK, NAVY_DARK); // y 7..40
  cv.hl(18, 29, 8, TEAL_LIGHT);
  cv.hl(18, 29, 9, STEEL_DARK);
  const glassLeds = [
    LED_GREEN,
    TEAL_LIGHT,
    LED_GREEN,
    SKY,
    AMBER,
    LED_GREEN,
    LED_GREEN,
    TEAL_LIGHT,
    LED_GREEN,
    SKY,
  ];
  for (let i = 0; i < 10; i++) {
    const y = 10 + 3 * i;
    if (y + 1 > 39) break;
    cv.hl(18, 29, y, NAVY);
    for (let x = 19; x <= 23; x += 2) cv.px(x, y + 1, NAVY);
    cv.px(26, y + 1, glassLeds[i]);
    cv.px(27, y + 1, glassLeds[(i + 3) % glassLeds.length]);
  }
  // glass glints
  for (let i = 0; i < 7; i++) cv.px(19 + i, 26 - i, ICE);
  for (let i = 0; i < 4; i++) cv.px(19 + i, 31 - i, ICE);
  cv.px(28, 12, ICE);
  // handle
  cv.vl(29, 20, 26, SILVER_LIGHT);
  cv.px(28, 20, SILVER);
  cv.px(28, 26, SILVER);
  // sticky note
  cv.rect(20, 33, 4, 4, GOLD_LIGHT);
  cv.hl(20, 22, 34, GOLD_DARK);
  cv.hl(20, 21, 35, GOLD_DARK);
  cv.px(23, 36, LAMP_WARM);
  // door vent at the bottom
  for (let x = 19; x <= 28; x += 2) cv.px(x, 39, STEEL_DARK);
  return cv.g;
})();

/** Quarter turn facing RIGHT: the two racks stand one behind the other. The
 *  glass-door rack is at the back (north), the open spaghetti rack in front
 *  (south), so we see both vented roofs — a narrow cable tray running
 *  lengthwise down them — and the open rack's plain side panel, ~40px tall
 *  like the front view. The rack fronts are on the east edge: cable loops
 *  bulge out of the open rack. */
const SERVER_CLUSTER_RIGHT = (() => {
  const cv = new Cv(16, 64);
  // roofs (x 0..15): back rack rows 0..10, front rack rows 10..20. Each is a
  // vent grille (alternating dark/mid rows) under a lit top-left edge.
  for (const [y0, y1] of [
    [0, 10],
    [10, 20],
  ]) {
    cv.box(0, y0, 16, y1 - y0 + 1, INK, STEEL);
    for (let y = y0 + 2; y < y1; y++) cv.hl(2, 14, y, (y - y0) % 2 === 0 ? STEEL_DARK : STEEL);
    cv.hl(1, 14, y0 + 1, STEEL_LIGHT);
    cv.vl(1, y0 + 1, y1 - 1, STEEL_LIGHT);
  }
  // narrow ladder cable tray down the middle of both roofs
  cv.vl(5, 0, 20, SILVER);
  cv.vl(9, 0, 20, SILVER);
  const runs = [BLUE, GOLD, RED];
  for (let y = 0; y <= 20; y++) {
    if (y % 5 === 2) cv.hl(6, 8, y, SILVER_LIGHT);
    else runs.forEach((c, k) => cv.px(6 + k, y, c));
  }
  // one pink cable crossing over the bundle
  for (const [x, y] of [
    [6, 13],
    [7, 14],
    [8, 15],
  ])
    cv.px(x, y, PINK);

  // side panel of the front (open) rack: rows 21..58 — one plain panel,
  // a seam at mid-depth, three vent slots
  cv.box(0, 21, 14, 38, INK, IRON_DARK);
  cv.hl(1, 12, 22, STEEL);
  cv.vl(1, 22, 57, IRON);
  cv.px(1, 22, STEEL_LIGHT);
  cv.hl(1, 12, 40, INK);
  cv.hl(2, 12, 41, IRON);
  for (const y of [26, 29, 32]) {
    cv.hl(4, 10, y, INK);
    cv.hl(4, 10, y + 1, IRON);
  }
  // open rack front edge (east): posts with LEDs, cable loops bulging out
  cv.vl(14, 21, 58, STEEL_DARK);
  cv.vl(15, 21, 58, INK);
  const edgeLeds = [LED_GREEN, AMBER, LED_GREEN, SKY, LED_GREEN, RED, LED_GREEN];
  let i = 0;
  for (let y = 24; y <= 56; y += 3) cv.px(14, y, edgeLeds[i++ % edgeLeds.length]);
  for (const [y, c] of [
    [27, BLUE],
    [34, GOLD],
    [41, PINK],
    [48, RED],
  ] as [number, string][]) {
    cv.px(14, y, c);
    cv.px(14, y + 3, c);
    cv.vl(15, y + 1, y + 2, c);
    cv.px(15, y, INK);
    cv.px(15, y + 3, INK);
  }
  // paper "do not unplug" tag on the red loop
  cv.px(13, 52, PAPER);
  cv.px(13, 53, RED);
  // plinth + feet
  cv.hl(1, 13, 59, IRON_DARK);
  cv.px(0, 59, INK);
  cv.px(14, 59, INK);
  cv.px(15, 59, INK);
  cv.hl(0, 15, 60, INK);
  for (const fx of [2, 3, 12, 13]) cv.vl(fx, 61, 62, INK);
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// 3. ups_tower — battery backup, 16x32, 1x1, electronics. INK tower,
//    teal LCD with three charge bars and one empty, a gold bolt, a
//    green power LED beside an amber "on battery" one, vents, and the
//    fat power lead snaking across the floor to its plug.
// ════════════════════════════════════════════════════════════════
const UPS_TOWER = (() => {
  const cv = new Cv(16, 32);
  cv.box(1, 8, 13, 21, INK, IRON_DARK); // y 8..28
  // top face: 3px, lit top-left edge
  cv.hl(2, 12, 9, STEEL_LIGHT);
  cv.hl(2, 12, 10, STEEL);
  cv.hl(2, 12, 11, STEEL_DARK);
  cv.vl(2, 10, 11, STEEL_LIGHT);
  cv.hl(1, 13, 12, INK);
  cv.vl(2, 13, 27, IRON);
  // LCD: battery icon, three teal charge bars + a blinking amber one, tip
  cv.box(3, 14, 10, 5, INK, TEAL_DARK);
  for (const x of [4, 6, 8]) cv.vl(x, 15, 17, TEAL_LIGHT);
  cv.vl(10, 15, 17, AMBER);
  cv.px(11, 16, TEAL);
  // bolt on a dark badge
  cv.box(6, 20, 5, 6, INK, IRON);
  cv.px(9, 21, GOLD);
  cv.px(8, 22, GOLD);
  cv.px(9, 22, GOLD_DARK);
  cv.px(8, 23, GOLD);
  cv.px(7, 24, GOLD_DARK);
  // power LED, and the amber "on battery" one lit beside it
  cv.px(4, 21, LED_GREEN);
  cv.px(4, 22, IRON_DARK);
  cv.px(4, 23, AMBER);
  // vents
  cv.hl(4, 11, 27, IRON);
  cv.px(12, 22, STEEL_DARK); // socket
  // feet
  cv.hl(2, 3, 29, INK);
  cv.hl(11, 12, 29, INK);
  // power lead: out of the socket, down the side, a wave across the floor
  // (lit on each crest) and a plug at its end
  for (const [x, y, c] of [
    [13, 22, STEEL_DARK],
    [14, 23, STEEL_DARK],
    [14, 24, STEEL_DARK],
    [14, 25, STEEL_DARK],
    [14, 26, STEEL_DARK],
    [15, 27, STEEL],
    [15, 28, STEEL_DARK],
    [14, 29, STEEL_DARK],
    [13, 30, STEEL],
    [12, 30, STEEL],
    [11, 31, STEEL_DARK],
    [10, 31, STEEL_DARK],
    [9, 30, STEEL],
    [8, 30, STEEL],
    [7, 31, STEEL_DARK],
    // plug: lit top, dark body, two prongs
    [5, 30, SILVER_LIGHT],
    [6, 30, SILVER],
    [5, 31, IRON],
    [6, 31, IRON],
    [4, 30, SILVER_LIGHT],
    [4, 31, STEEL_LIGHT],
  ] as [number, number, string][])
    cv.px(x, y, c);
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// 4. tool_chest — rolling tool chest, 16x32, 1x1, storage. Red body,
//    BRICK shade, BRICK_DARK outline, chrome drawer pulls; a lidded
//    top box with a wrench lying on it; the third drawer hangs open
//    showing tools; side handle; casters.
// ════════════════════════════════════════════════════════════════
const TOOL_CHEST = (() => {
  const cv = new Cv(16, 32);
  // lid: lit RED top, BRICK front, BRICK_DARK outline
  cv.box(2, 4, 12, 8, BRICK_DARK, RED); // y 4..11
  cv.hl(3, 12, 8, BRICK_DARK);
  cv.rect(3, 9, 10, 2, BRICK);
  cv.hl(6, 9, 9, SILVER_LIGHT); // latch
  cv.px(6, 10, SILVER);
  cv.px(9, 10, SILVER);
  // stickers on the lid front
  cv.px(4, 10, GOLD);
  cv.px(11, 9, TEAL_LIGHT);
  cv.px(11, 10, TEAL);
  // a wrench lying on the lid: 6px bar, open 2px jaw on the left, a
  // shadow on the lid under the bar
  cv.hl(5, 10, 6, SILVER_LIGHT);
  cv.hl(5, 10, 7, BRICK);
  cv.vl(4, 5, 7, SILVER_LIGHT);
  cv.px(3, 5, SILVER_LIGHT);
  cv.px(3, 7, SILVER);
  // body
  cv.box(2, 11, 12, 17, BRICK_DARK, BRICK); // y 11..27
  const drawer = (y: number, h: number) => {
    cv.hl(3, 12, y, RED);
    cv.vl(3, y, y + h - 1, RED);
    cv.hl(6, 9, y + 1, SILVER_LIGHT);
    cv.px(9, y + 1, SILVER);
    cv.hl(3, 12, y + h, BRICK_DARK);
  };
  drawer(12, 2);
  drawer(15, 2);
  // open drawer, pulled out 2px past each side: lit back rim, a dark
  // interior row with sockets and a gold screwdriver, then the front
  cv.hl(0, 15, 17, BRICK_DARK);
  cv.px(1, 17, RED);
  cv.px(14, 17, RED);
  cv.hl(0, 15, 18, BRICK_DARK);
  for (const x of [3, 5, 7]) cv.px(x, 18, SILVER_LIGHT);
  cv.hl(10, 11, 18, GOLD);
  cv.px(12, 18, SILVER);
  cv.box(0, 19, 16, 4, BRICK_DARK, BRICK); // y 19..22
  cv.hl(1, 14, 19, RED);
  cv.hl(1, 14, 20, RED);
  cv.vl(1, 19, 21, RED);
  cv.hl(5, 10, 21, SILVER_LIGHT);
  cv.px(10, 21, SILVER);
  drawer(23, 3);
  // casters
  for (const x of [3, 4, 11, 12]) {
    cv.px(x, 28, STEEL_DARK);
    cv.px(x, 29, INK);
  }
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// 5. cardboard_boxes — the unboxing pile, 16x32, 1x1, storage. Three
//    kraft boxes (CREAM top, CREAM_DARK face, WOOD outline, WOOD_LIGHT
//    tape): bottom one with a shipping label and this-side-up arrows,
//    middle one with red fragile tape, top one open with its flaps up
//    and cables escaping.
// ════════════════════════════════════════════════════════════════
const CARDBOARD_BOXES = (() => {
  const cv = new Cv(16, 32);
  const crate = (x: number, y: number, w: number, h: number, top: number) => {
    cv.box(x, y, w, h, WOOD, CREAM_DARK);
    cv.rect(x + 1, y + 1, w - 2, top, CREAM);
    cv.hl(x + 1, x + w - 2, y + 1 + top, WOOD_LIGHT);
    cv.vl(x + w - 2, y + 2 + top, y + h - 2, STONE_DARK);
  };
  // bottom box
  crate(0, 18, 16, 12, 3);
  cv.vl(7, 19, 21, WOOD_LIGHT);
  cv.vl(8, 19, 21, WOOD_LIGHT);
  cv.vl(7, 23, 24, WOOD_LIGHT);
  cv.vl(8, 23, 24, WOOD_LIGHT);
  cv.rect(2, 24, 4, 3, PAPER);
  cv.hl(2, 4, 25, SLATE);
  cv.px(3, 26, SLATE);
  // barcode
  for (const x of [9, 10, 12]) cv.vl(x, 24, 26, WOOD_DARK);
  cv.vl(11, 24, 26, CREAM);
  // middle box, nudged left
  crate(1, 9, 12, 10, 2);
  cv.vl(6, 10, 11, WOOD_LIGHT);
  // fragile label: red with a white wine glass, off-centre
  cv.box(7, 13, 5, 4, BRICK_DARK, RED);
  cv.hl(8, 10, 14, PAPER);
  cv.px(9, 15, PAPER);
  cv.hl(2, 5, 14, WOOD_LIGHT); // tape
  // top box: open, nudged right — one dark interior, a lit flap folded out
  // to the left, the back flap leaning away to the right
  cv.ascii(
    [
      '................',
      '.........wwwww..',
      '.w......wCCCw...',
      '.wcw...wCCCw....',
      '..wccwwwwwwww...',
      '...wcwddddddw...',
      '....wwddddddw...',
      '.....wllllllw...',
      '.....wCCCCCsw...',
      '.....wCCCCCsw...',
      '.....wwwwwwww...',
    ],
    { w: WOOD, c: CREAM, C: CREAM_DARK, d: CLAY_DARK, l: WOOD_LIGHT, s: STONE_DARK },
  );
  // blue cables spilling out over the front lip
  for (const [x, y, c] of [
    [9, 5, BLUE],
    [9, 6, BLUE],
    [9, 7, BLUE],
    [10, 8, BLUE],
    [10, 9, BLUE],
    [10, 10, BLUE],
    [11, 11, BLUE],
    [7, 6, SKY],
    [7, 7, SKY],
    [6, 8, SKY],
  ] as [number, number, string][])
    cv.px(x, y, c);
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// 6. robot_arm — 16x32, 1x1, misc. Industrial orange arm (CLAY_DARK
//    outline, LAMP_WARM lit, CLAY shade) on a steel plinth with hazard
//    stripes: shoulder, elbow and wrist joints in steel, black hose
//    along the upper arm, gripper pinching a tiny rubber duck.
// ════════════════════════════════════════════════════════════════
const ROBOT_ARM = (() => {
  const cv = new Cv(16, 32);
  const ARM: Shade = { o: CLAY_DARK, base: ORANGE, lit: LAMP_WARM, dark: CLAY };
  const JOINT: Shade = { o: IRON_DARK, base: STEEL, dark: STEEL_DARK };
  const joint = (cx: number, cy: number, r: number) => {
    paint(cv, new Mask().ellipse(cx, cy, r, r), JOINT);
    cv.px(Math.floor(cx) - 1, Math.floor(cy) - 1, SILVER_LIGHT);
  };
  // plinth with hazard stripes
  cv.box(1, 25, 14, 6, IRON_DARK, STEEL_DARK);
  cv.hl(2, 13, 26, STEEL);
  for (let x = 2; x <= 13; x++) {
    cv.px(x, 28, Math.floor(x / 2) % 2 ? GOLD : INK);
    cv.px(x, 29, Math.floor((x + 1) / 2) % 2 ? GOLD : INK);
  }
  // turret
  paint(cv, new Mask().rect(3, 19, 10, 7).ellipse(8, 19.5, 5, 2.5), ARM);
  cv.hl(4, 11, 24, CLAY_DARK);
  // lower arm (outlined all round), its hose riding the shadow side
  paint(cv, new Mask().line(8, 18, 11, 9, 2.3), ARM);
  for (const [x, y] of [
    [12, 16],
    [13, 14],
    [13, 13],
    [14, 11],
  ])
    cv.px(x, y, INK);
  // forearm, overlapping the elbow so the link is continuous
  paint(cv, new Mask().line(11.5, 8.5, 5, 5, 2.2), ARM);
  joint(8.5, 18.5, 2.6);
  joint(11.5, 8.5, 2.4);
  joint(4.5, 4.5, 1.9);
  // the rubber duck, pinched by the neck between two gripper fingers
  cv.ascii(
    ['..f..f..', '..fyyf..', '.oyey...', '..yyy..y', '..yyyyyy', '...dddd.'],
    { f: IRON_DARK, y: GOLD, o: ORANGE, e: INK, d: GOLD_DARK },
    0,
    6,
  );
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// 7. patch_panel — 32x32, 2x1 wall item. Rack ears on the wall, a
//    switch (blinking port LEDs, fibre uplinks running up to the
//    ceiling) over a patch panel; short jumpers between them, a
//    tied bundle running down to the floor, one orange cable left
//    unplugged and dangling.
// ════════════════════════════════════════════════════════════════
const PATCH_PANEL = (() => {
  const cv = new Cv(32, 32);
  // fibre up to the ceiling
  cv.vl(26, 0, 5, SKY);
  cv.vl(27, 0, 5, TEAL);
  // rails
  cv.vl(1, 4, 19, STEEL_DARK);
  cv.vl(30, 4, 19, STEEL_DARK);
  // switch
  cv.box(2, 5, 28, 6, INK, IRON_DARK); // y 5..10
  cv.hl(3, 28, 6, IRON);
  const blink = [
    LED_GREEN,
    LED_GREEN,
    AMBER,
    LED_GREEN,
    LEAF_DARK,
    LED_GREEN,
    LED_GREEN,
    AMBER,
    LED_GREEN,
    LED_GREEN,
  ];
  for (let i = 0; i < 10; i++) {
    cv.px(4 + 2 * i, 7, blink[i]);
    cv.px(4 + 2 * i, 8, INK);
    cv.px(5 + 2 * i, 8, STEEL_DARK);
  }
  cv.px(26, 8, SKY);
  cv.px(27, 8, TEAL);
  cv.px(26, 7, PAPER);
  cv.px(27, 7, PAPER);
  // patch panel
  cv.box(2, 12, 28, 5, INK, STEEL_DARK); // y 12..16
  cv.hl(3, 28, 13, STEEL);
  for (let i = 0; i < 12; i++) {
    cv.px(4 + 2 * i, 14, INK);
    cv.px(4 + 2 * i, 15, PAPER);
  }
  // ears with screws
  for (const y of [6, 9, 13, 15]) {
    cv.px(1, y, SILVER_LIGHT);
    cv.px(30, y, SILVER_LIGHT);
  }
  // bundle down to the floor
  const bundle = [BLUE, GOLD, RED, BLUE, PINK, LED_GREEN];
  bundle.forEach((c, i) => cv.vl(17 + i, 17, 31, c));
  for (const y of [20, 26]) cv.hl(16, 23, y, PURPLE);
  // patch cords: each leaves a switch port, drops in a U below the panel
  // and climbs back into a panel port
  const loops: [number, number, number, string][] = [
    [4, 6, 18, BLUE],
    [8, 10, 19, GOLD],
    [12, 14, 18, RED],
    [16, 12, 20, PINK],
    [20, 22, 18, LED_GREEN],
    [24, 20, 19, BLUE],
  ];
  for (const [xs, xp, yb, c] of loops) {
    cv.vl(xs, 9, yb - 1, c);
    const [a, b] = xs < xp ? [xs, xp] : [xp, xs];
    cv.hl(a + 1, b - 1, yb, c);
    cv.vl(xp, 15, yb - 1, c);
  }
  // the unplugged one, with its RJ45 plug and a glint
  for (const [x, y] of [
    [26, 17],
    [26, 18],
    [27, 19],
    [27, 20],
    [28, 21],
    [28, 22],
  ])
    cv.px(x, y, ORANGE);
  cv.rect(27, 23, 2, 2, CREAM);
  cv.px(28, 24, STEEL);
  cv.px(27, 25, SILVER_LIGHT);
  cv.px(28, 25, STEEL_DARK);
  cv.px(27, 23, PAPER);
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// 8. noc_wall — 32x32, 2x1 wall item. 2x2 video wall: a rising green
//    graph, teal bar chart, a host grid with one red and one amber
//    host, a log pane with one red line and a gold cursor. A red
//    beacon on top is lit because of that red host.
// ════════════════════════════════════════════════════════════════
/** Graph samples, cyclic: frame 0 shows the first 11, each later frame
 *  scrolls the window on 2 samples (6 frames × 2 = the whole loop). */
const NOC_GRAPH = [11, 11, 10, 11, 9, 9, 10, 8, 7, 7, 6, 9];
/** Bar heights per frame (frame 0 first); the 5th bar stays the tallest-ish. */
const NOC_BARS = [
  [3, 5, 4, 6, 7, 5],
  [4, 5, 3, 6, 6, 5],
  [4, 6, 3, 5, 7, 4],
  [3, 6, 4, 5, 7, 5],
  [3, 4, 5, 6, 6, 6],
  [2, 5, 4, 7, 7, 5],
];
/** Log lines, cyclic: one new line scrolls in per frame, so the red one
 *  climbs the pane and comes round again. */
const NOC_LOGS: [number, string][] = [
  [7, SKY],
  [5, SKY],
  [8, SKY],
  [6, RED],
  [4, SKY],
  [7, SKY],
];

/** The video wall at animation frame `t` (0 = the still). */
function nocWall(t: number): string[][] {
  const cv = new Cv(32, 32);
  const screen = (x: number, y: number) => {
    cv.box(x, y, 15, 11, INK, IRON_DARK);
    cv.hl(x + 1, x + 13, y + 1, STEEL_DARK);
    cv.vl(x + 1, y + 1, y + 9, STEEL_DARK);
    cv.rect(x + 2, y + 2, 11, 7, NAVY_DARK);
  };
  // beacon on a bracket seated on the frame, with a short ray each side
  cv.hl(14, 17, 3, IRON_DARK);
  cv.hl(15, 16, 2, STEEL_DARK);
  cv.hl(14, 17, 1, RED);
  cv.hl(15, 16, 0, RED);
  // the beacon rotates: its glint and its rays swap sides every frame
  if (t % 2 === 0) {
    cv.px(15, 0, PINK_LIGHT);
    cv.px(14, 1, PINK);
    cv.hl(11, 12, 1, PINK);
    cv.hl(19, 20, 1, PINK);
  } else {
    cv.px(16, 0, PINK_LIGHT);
    cv.px(17, 1, PINK);
    cv.hl(9, 10, 1, PINK);
    cv.hl(21, 22, 1, PINK);
  }
  screen(1, 4);
  screen(16, 4);
  screen(1, 15);
  screen(16, 15);
  // S1 graph
  cv.hl(3, 13, 9, NAVY);
  cv.vl(8, 6, 12, NAVY);
  for (let i = 0; i < 11; i++) cv.px(3 + i, NOC_GRAPH[(i + 2 * t) % NOC_GRAPH.length], LED_GREEN);
  // S2 bars
  NOC_BARS[t % NOC_BARS.length].forEach((hgt, i) => {
    const x = 18 + i * 2;
    cv.vl(x, 13 - hgt + 1, 12, i === 4 ? TEAL_LIGHT : TEAL);
  });
  // S3 host grid
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const x = 4 + c * 2;
      const y = 18 + r * 2;
      let col = LED_GREEN;
      if (r === 1 && c === 3) col = RED;
      if (r === 2 && c === 1) col = t % 3 === 2 ? LEAF_DARK : AMBER; // flapping
      cv.px(x, y, col);
    }
  }
  // S4 logs
  for (let i = 0; i < 5; i++) {
    const [len, c] = NOC_LOGS[(i + t) % NOC_LOGS.length];
    cv.hl(18, 18 + len, 17 + i, c);
  }
  cv.hl(18, 19, 22, PAPER);
  if (t % 2 === 0) cv.px(20, 22, GOLD); // blinking cursor
  return cv.g;
}
const NOC_WALL = nocWall(0);
const NOC_WALL_FRAMES = [1, 2, 3, 4, 5].map((t) => nocWall(t));

// ════════════════════════════════════════════════════════════════
// 9. printer_3d — 16x32, 1x1, surface. A bed-slinger caught
//    mid-print: steel frame, ORANGE spool on top feeding filament to
//    the hot end, a hull half printed on the gold build sheet, base
//    with a teal display and a knob.
// ════════════════════════════════════════════════════════════════
/** The printer with its carriage `dx` px along the gantry (0 = the still). */
function printer3d(dx: number): string[][] {
  const cv = new Cv(16, 32);
  // spool on the top bar
  paint(cv, new Mask().ellipse(5, 6, 3.2, 3.2), {
    o: CLAY_DARK,
    base: ORANGE,
    lit: LAMP_WARM,
    dark: CLAY,
  });
  cv.rect(4, 5, 2, 2, IRON_DARK);
  cv.px(4, 5, STEEL);
  // frame: crossbar with a lit top face, two uprights
  cv.hl(1, 14, 9, STEEL_LIGHT);
  cv.hl(1, 14, 10, STEEL_DARK);
  cv.hl(1, 14, 11, IRON_DARK);
  cv.px(1, 9, SILVER_LIGHT);
  cv.vl(1, 10, 26, STEEL_DARK);
  cv.vl(2, 12, 26, IRON_DARK);
  cv.vl(13, 12, 26, STEEL_DARK);
  cv.vl(14, 10, 26, IRON_DARK);
  // filament line from the spool down into the hot end
  for (const [x, y] of [
    [8, 7],
    [9, 8],
    [9 + dx, 12],
    [9 + dx, 13],
  ])
    cv.px(x, y, ORANGE);
  // gantry
  cv.hl(3, 12, 15, SILVER_LIGHT);
  cv.hl(3, 12, 16, STEEL);
  // carriage + fan + nozzle
  cv.box(6 + dx, 13, 5, 6, INK, IRON);
  cv.px(8 + dx, 15, STEEL_LIGHT);
  cv.px(7 + dx, 16, STEEL_DARK);
  cv.px(9 + dx, 16, STEEL_DARK);
  cv.px(8 + dx, 17, STEEL_DARK);
  cv.px(8 + dx, 19, GOLD_DARK);
  // the part, mid-print: half-height box, orange perimeter, cream infill
  // lattice on the open top, the hot layer glowing under the nozzle
  cv.ascii(
    ['ooooooo', 'ocpcpco', 'opcpcpo', 'ooooooo', 'CdCdCdC', 'dddddddd'].map((r) => r.slice(0, 7)),
    { o: ORANGE, c: CREAM, p: CREAM_DARK, C: CLAY, d: CLAY_DARK },
    5,
    20,
  );
  cv.px(8 + dx, 20, GOLD_LIGHT);
  cv.px(9 + dx, 20, LAMP_WARM);
  // bed
  cv.hl(3, 12, 26, GOLD_DARK);
  // base: lit top, 2px front face with display + knob, shadow line
  cv.hl(0, 15, 27, STEEL_DARK);
  cv.hl(1, 14, 28, STEEL);
  cv.px(1, 28, STEEL_LIGHT);
  cv.rect(0, 29, 16, 2, IRON_DARK);
  cv.vl(0, 27, 30, INK);
  cv.vl(15, 27, 30, INK);
  cv.hl(2, 5, 29, TEAL_LIGHT);
  cv.hl(2, 5, 30, TEAL_DARK);
  cv.px(12, 29, SILVER);
  cv.px(12, 30, SILVER_LIGHT);
  cv.hl(0, 15, 31, INK);
  return cv.g;
}
const PRINTER_3D = printer3d(0);
/** The hot end tracing a layer: right to the part's edge, back across to
 *  its left edge, home — the glowing fresh layer follows the nozzle. */
const PRINTER_3D_FRAMES = [1, 2, 1, 0, -1, -2, -3, -2, -1].map(printer3d);

// ════════════════════════════════════════════════════════════════
// 10. soldering_station — 16x16, 1x1, surface. Control unit with red
//    temperature digits and a knob, the iron resting in its coil
//    stand with a glowing tip and a curl of smoke, a brass sponge,
//    and a little green PCB waiting on the desk.
// ════════════════════════════════════════════════════════════════
const SOLDERING_STATION = (() => {
  const cv = new Cv(16, 16);
  // control unit: lit top face, red digits, knob
  cv.ascii(
    [
      'kkkkkkk.',
      'kLLLLLk.',
      'kSSSSSk.',
      'kkkkkkk.',
      'kdrrrdk.',
      'kdddddk.',
      'kdxdndk.',
      'kkkkkkk.',
    ],
    { k: IRON_DARK, L: STEEL_LIGHT, S: STEEL, d: IRON, r: RED, n: SILVER_LIGHT, x: LED_GREEN },
    0,
    7,
  );
  cv.px(1, 8, SILVER_LIGHT);
  // brass sponge in its little dish
  cv.ascii(
    ['.kkkk.', 'kgGGgk', 'kSSSSk', '.kkkk.'],
    { k: IRON_DARK, g: GOLD_DARK, G: GOLD, S: STEEL },
    9,
    12,
  );
  // stand base + coiled spring holder (a striped cone the iron rests in)
  cv.hl(10, 15, 11, IRON_DARK);
  cv.hl(11, 14, 10, STEEL_LIGHT);
  cv.hl(11, 13, 9, STEEL);
  cv.hl(11, 12, 8, SILVER_LIGHT);
  // iron, 2px thick: navy grip lower-right, steel collar, tip upper-left
  // ending in one hot pixel
  for (const [x, y, c] of [
    [14, 9, BLUE],
    [15, 9, NAVY],
    [13, 8, BLUE],
    [14, 8, NAVY],
    [12, 7, BLUE],
    [13, 7, NAVY],
    [11, 6, SILVER_LIGHT],
    [12, 6, STEEL],
    [10, 5, SILVER_LIGHT],
    [11, 5, STEEL],
    [9, 4, SILVER],
    [8, 3, ORANGE],
  ] as [number, number, string][])
    cv.px(x, y, c);
  // a thin wavy plume rising off the tip
  cv.px(8, 2, STONE);
  cv.px(7, 1, PAPER);
  cv.px(8, 0, STONE);
  // the iron's cable back to the unit
  cv.px(15, 10, IRON_DARK);
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// 11. oscilloscope — 16x16, 1x1, surface. Silver case with a lit top,
//    navy screen with a green sine trace and graticule dots, knobs
//    and a red/green button pair, two probes lying on the desk.
// ════════════════════════════════════════════════════════════════
const OSCILLOSCOPE = (() => {
  const cv = new Cv(16, 16);
  cv.ascii(
    [
      '.kkkkkkkkkkkkkk.',
      '.kLLLLLLLLLLLLk.',
      '.kLSSSSSSSSSSSk.',
      '.kkkkkkkkkkkkkk.',
      '.kiiiiiiiiiifnk.',
      '.kiNNNNNNNNifSk.',
      '.kiNNNNNNNNiffk.',
      '.kiNNNNNNNNifnk.',
      '.kiNNNNNNNNiffk.',
      '.kiNNNNNNNNifSk.',
      '.kiiiiiiiiiirxk.',
      '.kkkkkkkkkkkkkk.',
      '..d..b....y..d..',
      '....bbw..yyw....',
    ],
    {
      k: STEEL_DARK,
      L: SILVER_LIGHT,
      S: SILVER,
      f: STEEL,
      i: INK,
      N: NAVY_DARK,
      n: NAVY,
      r: RED,
      x: LED_GREEN,
      d: IRON_DARK,
      b: BLUE,
      y: GOLD,
      w: SILVER_LIGHT,
    },
    0,
    2,
  );
  cv.px(2, 3, PAPER);
  // graticule: faint dots every 3px
  for (let y = 7; y <= 11; y += 2) for (let x = 3; x <= 10; x += 3) cv.px(x, y, TEAL_DARK);
  // trace: a continuous sine, two periods across the screen
  const wave = [0, -1, -2, -1, 0, 1, 2, 1];
  wave.forEach((dy, i) => cv.px(3 + i, 9 + dy, GREEN_LIGHT));
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// 12. keyboard_mech — 16x16, 1x1, surface. Navy case, cream keycaps
//    (CREAM_DARK gaps so the caps read as keys), red Esc, pink
//    modifiers and space bar, teal enter, one gold artisan cap, and a
//    teal coiled cable running off the top.
// ════════════════════════════════════════════════════════════════
const KEYBOARD_MECH = fromAscii(
  [
    '................',
    '............tT..',
    '...TtTtTtTtT.t..',
    '..tTtTtTtTt.....',
    '..t.............',
    'kkkkkkkkkkkkkkkk',
    'kRRnCCnCCnCCnCCk',
    'kssnccnccnccnccl',
    'knnnnnnnnnnnnnnk',
    'kCCnCCnGGnCCnTTk',
    'kccnccnggnccnddk',
    'knnnnnnnnnnnnnnk',
    'kPPnPPPPPPPPnPPk',
    'kqqnqqqqqqqqnqqk',
    'knnnnnnnnnnnnnnk',
    'kkkkkkkkkkkkkkkk',
  ],
  {
    k: NAVY_DARK,
    n: NAVY,
    l: NAVY,
    C: CREAM,
    c: CREAM_DARK,
    R: RED,
    s: BRICK,
    P: PINK,
    q: PINK_DARK,
    T: TEAL_LIGHT,
    d: TEAL,
    t: TEAL_DARK,
    G: GOLD,
    g: GOLD_DARK,
  },
);

// ════════════════════════════════════════════════════════════════
// 13. headphones_stand — 16x16, 1x1, surface. Pink over-ears with a
//    padded band hanging on a dark aluminium stand.
// ════════════════════════════════════════════════════════════════
const HEADPHONES_STAND = (() => {
  const cv = new Cv(16, 16);
  // stand: round base with a lit top, post
  paint(cv, new Mask().ellipse(8, 14, 4.5, 1.8), { o: IRON_DARK, base: STEEL_DARK, lit: STEEL });
  cv.hl(6, 9, 13, STEEL);
  cv.px(5, 13, STEEL_LIGHT);
  cv.vl(7, 3, 13, STEEL);
  cv.vl(8, 3, 13, IRON);
  // band: a 1-row arch draped over the top of the post, lit on its left
  // half, its underside in shadow
  for (const [x, y, c] of [
    [3, 4, PINK_LIGHT],
    [4, 3, PINK_LIGHT],
    [5, 2, PINK_LIGHT],
    [6, 2, PINK_LIGHT],
    [7, 2, PINK_LIGHT],
    [8, 2, PINK],
    [9, 2, PINK],
    [10, 2, PINK],
    [11, 3, PINK],
    [12, 4, PINK],
    [5, 3, PINK_DARK],
    [6, 3, PINK_DARK],
    [9, 3, PINK_DARK],
    [10, 3, PINK_DARK],
    [4, 4, PINK_DARK],
    [11, 4, PINK_DARK],
  ] as [number, number, string][])
    cv.px(x, y, c);
  // cups: solid pink, lit on the left, a dark cushion edge facing the stand
  const cup = (x: number, cushion: number) => {
    cv.box(x, 5, 4, 8, PINK_DARK, PINK);
    cv.px(x, 5, '');
    cv.px(x + 3, 5, '');
    cv.px(x, 12, '');
    cv.px(x + 3, 12, '');
    cv.vl(x + 1, 6, 11, PINK_LIGHT);
    cv.px(x + 2, 6, PINK_LIGHT);
    cv.vl(cushion, 6, 11, PINK_DARK);
  };
  cup(1, 4);
  cup(11, 11);
  // cable trailing off the right cup across the desk
  for (const [x, y] of [
    [13, 13],
    [14, 14],
    [15, 14],
  ])
    cv.px(x, y, IRON_DARK);
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// 14. drone_quad — 16x16, 1x1, surface. White quadcopter, props
//    spinning (blurred ICE discs round dark hubs), red/green nav
//    lights, camera gimbal under the nose.
// ════════════════════════════════════════════════════════════════
const DRONE_QUAD = (() => {
  const cv = new Cv(16, 16);
  // arms
  for (const [x0, y0, x1, y1] of [
    [3, 4, 6, 7],
    [12, 4, 9, 7],
    [3, 11, 6, 9],
    [12, 11, 9, 9],
  ]) {
    new Mask().line(x0, y0, x1, y1, 0.6).each((x, y) => cv.px(x, y, STEEL_DARK));
  }
  // props
  for (const [cx, cy] of [
    [3.5, 4],
    [12.5, 4],
    [3.5, 11],
    [12.5, 11],
  ]) {
    const disc = new Mask().ellipse(cx, cy, 3.5, 1.6);
    disc.each((x, y) => {
      const edge = !disc.has(x - 1, y) || !disc.has(x + 1, y);
      cv.px(x, y, edge ? SILVER : ICE);
    });
    cv.px(Math.floor(cx), Math.floor(cy), IRON_DARK);
    cv.px(Math.floor(cx) - 2, Math.floor(cy), PAPER);
  }
  // body
  paint(cv, new Mask().rect(5, 6, 6, 5).rect(6, 5, 4, 7), {
    o: SILVER,
    base: SILVER_LIGHT,
    lit: PAPER,
  });
  cv.hl(7, 8, 7, SCREEN_SHADOW);
  // nav lights + gimbal
  cv.px(5, 10, RED);
  cv.px(10, 10, LED_GREEN);
  cv.hl(7, 8, 12, INK);
  cv.px(7, 13, IRON_DARK);
  cv.px(8, 13, SKY);
  // landing legs
  cv.px(5, 12, STEEL_DARK);
  cv.px(10, 12, STEEL_DARK);
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// 15. lab_stool — 16x32, 1x1, chairs, 4 orientations. The seat the
//    workbench was missing: a teal padded drafting stool — tall chrome
//    gas lift, a chrome foot ring to hook your heels on, a small low
//    back pad, five-star base on casters. Right view = back pad on the
//    west, seat to the east.
// ════════════════════════════════════════════════════════════════
const PAD: Shade = { o: TEAL_DARK, base: TEAL, lit: TEAL_LIGHT };

function stoolBase(cv: Cv): void {
  // tall gas lift
  cv.vl(7, 18, 25, SILVER_LIGHT);
  cv.vl(8, 18, 25, STEEL);
  // foot ring: a 10px chrome hoop two rows above the base — back arc
  // behind the post, front arc in front of it
  cv.hl(5, 10, 21, STEEL);
  cv.vl(7, 21, 21, SILVER_LIGHT);
  cv.vl(8, 21, 21, STEEL);
  for (const x of [3, 4, 11, 12]) cv.px(x, 22, x < 8 ? STEEL_LIGHT : STEEL);
  cv.hl(4, 11, 23, SILVER_LIGHT);
  cv.hl(5, 10, 24, STEEL_DARK);
  cv.vl(7, 24, 25, SILVER_LIGHT);
  cv.vl(8, 24, 25, STEEL);
  // five-star base + casters
  cv.hl(3, 12, 27, STEEL_DARK);
  cv.hl(5, 10, 26, STEEL);
  for (const x of [2, 3, 7, 8, 12, 13]) cv.px(x, 28, INK);
  cv.px(2, 27, STEEL_DARK);
  cv.px(13, 27, STEEL_DARK);
}

/** Round padded seat, its dark rim and the shadow under it. */
function stoolSeat(cv: Cv, x: number, y: number): void {
  paint(cv, new Mask().rect(x + 1, y, 10, 5).rect(x, y + 1, 12, 3), PAD);
  cv.hl(x + 2, x + 9, y + 4, TEAL_DARK);
  cv.hl(x + 2, x + 9, y + 5, IRON_DARK);
}

const LAB_STOOL = (() => {
  const cv = new Cv(16, 32);
  // small low back pad behind the seat on a short post
  cv.vl(7, 11, 13, STEEL);
  cv.vl(8, 11, 13, IRON);
  paint(cv, new Mask().rect(5, 7, 6, 4), PAD);
  stoolBase(cv);
  stoolSeat(cv, 2, 13);
  return cv.g;
})();

const LAB_STOOL_BACK = (() => {
  const cv = new Cv(16, 32);
  stoolBase(cv);
  stoolSeat(cv, 2, 13);
  // the back pad between us and the seat: a plain dark shell, lit top-left
  cv.vl(7, 15, 16, STEEL);
  cv.vl(8, 15, 16, IRON);
  cv.rect(5, 11, 6, 4, TEAL_DARK);
  cv.hl(5, 10, 11, TEAL);
  cv.vl(5, 11, 14, TEAL);
  return cv.g;
})();

const LAB_STOOL_RIGHT = (() => {
  const cv = new Cv(16, 32);
  stoolBase(cv);
  stoolSeat(cv, 3, 13);
  // back pad seen edge-on on the west, on a curved post
  cv.vl(4, 11, 13, STEEL);
  cv.px(5, 13, STEEL);
  paint(cv, new Mask().rect(3, 7, 3, 4), PAD);
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// 16. esd_mat — 32x16, 2x1 floor mat (backgroundTiles 1). Teal
//    anti-static mat: lit edge, faint ruler grid, a chrome ground snap
//    in the corner with its coiled cord running to a wrist strap
//    somebody left lying on the mat.
// ════════════════════════════════════════════════════════════════
const ESD_MAT = (() => {
  const cv = new Cv(32, 16);
  cv.box(0, 2, 32, 13, TEAL_DARK, TEAL);
  cv.hl(1, 30, 3, TEAL_LIGHT);
  cv.vl(1, 3, 13, TEAL_LIGHT);
  // ruler ticks along the top edge and a faint grid
  for (let x = 4; x <= 28; x += 4) {
    cv.px(x, 4, TEAL_DARK);
    if (x % 8 === 0) cv.px(x, 5, TEAL_DARK);
  }
  for (let y = 8; y <= 12; y += 4) for (let x = 4; x <= 28; x += 2) cv.px(x, y, TEAL_DARK);
  // thickness: front edge
  cv.hl(1, 30, 14, TEAL_DARK);
  cv.hl(0, 31, 15, NAVY_DARK);
  // ground snap
  cv.px(29, 4, SILVER_LIGHT);
  cv.px(30, 5, STEEL);
  cv.px(29, 5, SILVER);
  // wrist strap left lying on the mat: a hollow band (the mat shows
  // through its middle) with a chrome snap on its right side
  cv.ascii(
    ['.kkkk.', 'kSbbbk', 'kb..bk', 'kb..bk', 'kbbbbk', '.kkkk.'],
    { k: NAVY_DARK, b: BLUE, S: SKY },
    13,
    7,
  );
  cv.px(19, 9, SILVER_LIGHT);
  cv.px(19, 10, STEEL);
  // coiled cord from the snap to the corner ground stud
  for (let i = 0; i < 9; i++) {
    const x = 20 + i;
    const y = 9 - Math.round((i * 3) / 8) - (i % 2);
    cv.px(x, y, i % 2 ? SLATE : IRON_DARK);
  }
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// 17. parts_cabinet — 16x32, 1x1, storage. A steel small-parts cabinet:
//    a grid of tiny see-through drawers with coloured contents and
//    paper labels, one drawer pulled out with resistors spilling on the
//    floor in front of it.
// ════════════════════════════════════════════════════════════════
const PARTS_CABINET = (() => {
  const cv = new Cv(16, 32);
  cv.box(1, 6, 14, 22, STEEL_DARK, SILVER); // y 6..27
  // lit top face
  cv.hl(2, 13, 7, SILVER_LIGHT);
  cv.hl(2, 13, 8, SILVER_LIGHT);
  cv.px(2, 7, PAPER);
  cv.hl(2, 13, 9, STEEL_DARK);
  const fill = [
    RED,
    GOLD,
    BLUE,
    LED_GREEN,
    PURPLE,
    ORANGE,
    SKY,
    PINK,
    BRICK,
    TEAL_LIGHT,
    GOLD_DARK,
    SILVER_LIGHT,
  ];
  let k = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 2 + col * 3;
      const y = 10 + row * 3;
      if (row === 2 && col === 1) continue; // the pulled-out one
      cv.hl(x, x + 1, y, ICE);
      cv.px(x, y + 1, fill[k % fill.length]);
      cv.px(x + 1, y + 1, (row + col) % 3 === 0 ? PAPER : ICE);
      k++;
    }
  }
  // the pulled-out drawer: its slot left as a dark gap, the drawer itself
  // a small box in front of it, overlapping the row below
  cv.hl(5, 6, 16, INK);
  // (clear plastic like its siblings: lit top rim, resistors inside, front, pull)
  cv.box(3, 17, 6, 5, STEEL_DARK, ICE); // y 17..21
  cv.hl(3, 8, 17, SILVER_LIGHT);
  cv.px(4, 18, BRICK);
  cv.px(5, 18, CREAM);
  cv.px(6, 18, GOLD_DARK);
  cv.hl(4, 7, 19, STEEL_DARK);
  cv.hl(5, 6, 20, STEEL);
  // plinth + feet
  cv.hl(2, 13, 26, STEEL);
  cv.hl(2, 3, 28, IRON_DARK);
  cv.hl(12, 13, 28, IRON_DARK);
  // resistors spilled on the floor in front: tan bodies, one band each
  for (const [x, y, band] of [
    [4, 30, RED],
    [8, 29, BLUE],
    [10, 31, LEAF],
  ] as [number, number, string][]) {
    cv.hl(x, x + 2, y, CREAM);
    cv.px(x + 1, y, band);
  }
  cv.px(7, 29, SILVER);
  cv.px(11, 29, SILVER);
  return cv.g;
})();

// ════════════════════════════════════════════════════════════════
// Animation frames. Everything below repaints a handful of pixels on a
// copy of the still; printer_3d, robot_arm and noc_wall are drawn by
// functions of their frame (see above) because their moving part covers
// other pixels.
// ════════════════════════════════════════════════════════════════

/** Activity LEDs that may blink (status RED/AMBER ones stay steady — they
 *  are the story, not noise). */
const BLINKY = new Set([LED_GREEN, SKY, TEAL_LIGHT]);

/** server_cluster: switch port LEDs, the open rack's server LEDs and the
 *  LEDs seen through the glass door all flicker with traffic. */
const SERVER_CLUSTER_FRAMES = (() => {
  const leds: Led[] = [];
  for (let i = 0; i < 5; i++) leds.push([4 + 2 * i, 12, SERVER_CLUSTER[12][4 + 2 * i], STEEL_DARK]);
  for (let i = 0; i < 8; i++) {
    const y = 17 + 3 * i;
    for (const x of [11, 12]) leds.push([x, y, SERVER_CLUSTER[y][x], IRON_DARK]);
  }
  for (let y = 11; y <= 39; y += 3)
    for (const x of [26, 27]) leds.push([x, y, SERVER_CLUSTER[y][x], NAVY]);
  return blinkFrames(
    SERVER_CLUSTER,
    leds.filter(([, , on]) => BLINKY.has(on)),
    6,
    35,
  );
})();

/** Quarter turn: the LEDs down the open rack's front edge. */
const SERVER_CLUSTER_RIGHT_FRAMES = (() => {
  const leds: Led[] = [];
  for (let y = 24; y <= 56; y += 3) leds.push([14, y, SERVER_CLUSTER_RIGHT[y][14], STEEL_DARK]);
  return blinkFrames(
    SERVER_CLUSTER_RIGHT,
    leds.filter(([, , on]) => BLINKY.has(on)),
    6,
    35,
  );
})();

/** ups_tower: on battery — the last charge bar and the amber LED blink. */
const UPS_TOWER_FRAMES = deriveFrames(UPS_TOWER, 2, (g) => {
  for (let y = 15; y <= 17; y++) g[y][10] = TEAL_DARK;
  g[23][4] = IRON_DARK;
});

/** patch_panel: switch port LEDs flicker (the amber ones hold steady). */
const PATCH_PANEL_FRAMES = (() => {
  const leds: Led[] = [];
  for (let i = 0; i < 10; i++) leds.push([4 + 2 * i, 7, PATCH_PANEL[7][4 + 2 * i], LEAF_DARK]);
  return blinkFrames(
    PATCH_PANEL,
    leds.filter(([, , on]) => on === LED_GREEN),
    6,
    40,
  );
})();

/** soldering_station: the smoke curl rises off the tip — a 3px plume whose
 *  sway pattern scrolls up one row per frame. */
const SOLDERING_STATION_FRAMES = (() => {
  const sway = [8, 7, 8, 9];
  const tone = [STONE, PAPER, STONE]; // faint top, dense middle, faint base
  return deriveFrames(SOLDERING_STATION, 4, (g, t) => {
    for (let y = 0; y <= 2; y++) for (let x = 7; x <= 9; x++) g[y][x] = '';
    for (let y = 0; y <= 2; y++) g[y][sway[(y + t) % 4]] = tone[y];
  });
})();

/** oscilloscope: the sine trace scrolls across the screen, 2px a frame
 *  (one 8px period in 4 frames), the graticule showing through behind it. */
const OSCILLOSCOPE_FRAMES = (() => {
  const wave = [0, -1, -2, -1, 0, 1, 2, 1];
  const screen = (x: number, y: number) =>
    (x - 3) % 3 === 0 && (y - 7) % 2 === 0 ? TEAL_DARK : NAVY_DARK;
  return deriveFrames(OSCILLOSCOPE, 4, (g, t) => {
    for (let y = 7; y <= 11; y++) for (let x = 3; x <= 10; x++) g[y][x] = screen(x, y);
    wave.forEach((_, i) => (g[9 + wave[(i + 2 * t) % 8]][3 + i] = GREEN_LIGHT));
  });
})();

/** Attach an animation to a catalog entry. */
const animated = (s: GeneratedSprite, frames: string[][][], frameMs: number): GeneratedSprite => ({
  ...s,
  frames,
  frameMs,
});

const entry = (
  id: string,
  label: string,
  sprite: string[][],
  footprintW: number,
  footprintH: number,
  groupId?: string,
  orientation?: string,
): GeneratedSprite => ({
  id,
  name: id.toUpperCase(),
  label,
  widthPx: sprite[0].length,
  heightPx: sprite.length,
  footprintW,
  footprintH,
  sprite,
  ...(groupId ? { groupId, orientation } : {}),
});

export const SPRITES12: GeneratedSprite[] = [
  animated(
    entry('server_cluster', 'Server Cluster', SERVER_CLUSTER, 2, 1, 'server_cluster', 'front'),
    SERVER_CLUSTER_FRAMES,
    160,
  ),
  animated(
    entry(
      'server_cluster_right',
      'Server Cluster (Right)',
      SERVER_CLUSTER_RIGHT,
      1,
      2,
      'server_cluster',
      'right',
    ),
    SERVER_CLUSTER_RIGHT_FRAMES,
    160,
  ),
  animated(
    entry(
      'server_cluster_left',
      'Server Cluster (Left)',
      mirrorSprite(SERVER_CLUSTER_RIGHT),
      1,
      2,
      'server_cluster',
      'left',
    ),
    SERVER_CLUSTER_RIGHT_FRAMES.map(mirrorSprite),
    160,
  ),
  entry('workbench', 'Workbench', WORKBENCH, 2, 1, 'workbench', 'front'),
  entry('workbench_right', 'Workbench (Right)', WORKBENCH_RIGHT, 1, 2, 'workbench', 'right'),
  entry(
    'workbench_left',
    'Workbench (Left)',
    mirrorSprite(WORKBENCH_RIGHT),
    1,
    2,
    'workbench',
    'left',
  ),
  animated(entry('ups_tower', 'UPS Battery', UPS_TOWER, 1, 1), UPS_TOWER_FRAMES, 600),
  entry('tool_chest', 'Tool Chest', TOOL_CHEST, 1, 1),
  entry('cardboard_boxes', 'Cardboard Boxes', CARDBOARD_BOXES, 1, 1),
  entry('robot_arm', 'Robot Arm', ROBOT_ARM, 1, 1),
  animated(entry('patch_panel', 'Patch Panel', PATCH_PANEL, 2, 1), PATCH_PANEL_FRAMES, 160),
  animated(entry('noc_wall', 'NOC Video Wall', NOC_WALL, 2, 1), NOC_WALL_FRAMES, 450),
  animated(entry('printer_3d', '3D Printer', PRINTER_3D, 1, 1), PRINTER_3D_FRAMES, 180),
  animated(
    entry('soldering_station', 'Soldering Station', SOLDERING_STATION, 1, 1),
    SOLDERING_STATION_FRAMES,
    260,
  ),
  animated(entry('oscilloscope', 'Oscilloscope', OSCILLOSCOPE, 1, 1), OSCILLOSCOPE_FRAMES, 140),
  entry('keyboard_mech', 'Mech Keyboard', KEYBOARD_MECH, 1, 1),
  entry('headphones_stand', 'Headphones', HEADPHONES_STAND, 1, 1),
  entry('drone_quad', 'Drone', DRONE_QUAD, 1, 1),
  entry('lab_stool', 'Lab Stool', LAB_STOOL, 1, 1, 'lab_stool', 'front'),
  entry('lab_stool_back', 'Lab Stool (Back)', LAB_STOOL_BACK, 1, 1, 'lab_stool', 'back'),
  entry('lab_stool_right', 'Lab Stool (Right)', LAB_STOOL_RIGHT, 1, 1, 'lab_stool', 'right'),
  entry(
    'lab_stool_left',
    'Lab Stool (Left)',
    mirrorSprite(LAB_STOOL_RIGHT),
    1,
    1,
    'lab_stool',
    'left',
  ),
  entry('esd_mat', 'ESD Mat', ESD_MAT, 2, 1),
  entry('parts_cabinet', 'Parts Cabinet', PARTS_CABINET, 1, 1),
];

const SURFACE: CatalogMeta = { category: 'electronics', canPlaceOnSurfaces: true };

export const META12: Record<string, CatalogMeta> = {
  server_cluster: { category: 'electronics' },
  server_cluster_right: { category: 'electronics' },
  server_cluster_left: { category: 'electronics' },
  workbench: { category: 'desks', isDesk: true },
  workbench_right: { category: 'desks', isDesk: true },
  workbench_left: { category: 'desks', isDesk: true },
  ups_tower: { category: 'electronics' },
  tool_chest: { category: 'storage' },
  cardboard_boxes: { category: 'storage' },
  robot_arm: { category: 'electronics' },
  patch_panel: { category: 'wall', canPlaceOnWalls: true },
  noc_wall: { category: 'wall', canPlaceOnWalls: true },
  printer_3d: SURFACE,
  soldering_station: SURFACE,
  oscilloscope: SURFACE,
  keyboard_mech: SURFACE,
  headphones_stand: { category: 'decor', canPlaceOnSurfaces: true },
  drone_quad: SURFACE,
  lab_stool: { category: 'chairs' },
  lab_stool_back: { category: 'chairs' },
  lab_stool_right: { category: 'chairs' },
  lab_stool_left: { category: 'chairs' },
  esd_mat: { category: 'misc', backgroundTiles: 1 },
  parts_cabinet: { category: 'storage' },
};

validateSprites(SPRITES12);
