/**
 * sprites13.ts — Batch 13: plants & outdoors.
 *
 * Batch 8 put a tree, a bush and a flower bed on the campus grass; this
 * batch turns that into a garden and pulls the green indoors. Two
 * showpieces to build a space around — a cherry blossom tree with a rope
 * swing and petals drifting off it, and a koi pond with lily pads, a lotus
 * and a frog — then the grounds kit (tiered pine, clipped hedge, picket
 * fence with a climbing rose, raised planter, campfire with a toasting
 * marshmallow, stepping stones, mailbox with a letter waiting, a fishing
 * gnome to park by the pond) and indoor greenery (fiddle-leaf fig,
 * monstera, snake plant, hanging pothos, living wall under a grow light)
 * plus three desk-top pieces (bonsai, succulent trio, watering can).
 *
 * Most pieces are drawn programmatically on a char grid: shaded ellipse
 * lobes (each lit on its own top-left, dark underneath) rather than
 * per-pixel noise, `leaf()` masks for broad leaves, and `outline()`, which
 * swaps every pixel that touches transparency for the darker shade of its
 * own material — so the house rule "1px outline in a darker shade of the
 * material" holds however organic the silhouette gets.
 *
 * Same conventions as batches 6–9: house palette only, light from the
 * top-left, front sprites carry groupId + orientation 'front' whenever a
 * piece has other orientations (hedge, fence and planter ship a 1x2 quarter
 * turn), tall pieces bottom-aligned to their footprint.
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

type Legend = Record<string, string>;
type Grid = string[][];

/**
 * One legend for the whole batch, so every drawing speaks the same
 * alphabet. Upper/lower pairs are usually dark/base of one material.
 */
const LEGEND: Legend = {
  // greens
  D: LEAF_DARK,
  L: LEAF,
  G: GREEN,
  H: GREEN_LIGHT,
  E: LED_GREEN,
  // wood
  S: WOOD_SHADOW,
  T: WOOD_DARK,
  W: WOOD,
  w: WOOD_LIGHT,
  U: WOOD_SURFACE,
  // metals
  x: INK,
  '1': IRON_DARK,
  '2': IRON,
  '3': STEEL_DARK,
  '4': STEEL,
  '5': STEEL_LIGHT,
  '6': SILVER,
  '7': SILVER_LIGHT,
  // blues
  Z: SCREEN_SHADOW,
  b: BLUE,
  s: SKY,
  i: ICE,
  '0': PAPER,
  // accents
  r: RED,
  a: AMBER,
  y: GOLD_DARK,
  Y: GOLD,
  l: GOLD_LIGHT,
  o: ORANGE,
  f: LAMP_WARM,
  // clay
  Q: CLAY_DARK,
  C: CLAY,
  // purple / pink / teal / cream / brick / navy / stone
  V: PURPLE_DARK,
  v: PURPLE,
  P: PINK_DARK,
  p: PINK,
  q: PINK_LIGHT,
  N: TEAL_DARK,
  n: TEAL,
  t: TEAL_LIGHT,
  M: CREAM_DARK,
  m: CREAM,
  K: BRICK_DARK,
  k: BRICK,
  J: NAVY_DARK,
  j: NAVY,
  X: STONE_DARK,
  c: STONE,
};

/** The darker shade of each material — what `outline()` swaps edges to. */
const DARKER: Record<string, string> = {
  L: 'D',
  G: 'D',
  H: 'D',
  E: 'D',
  W: 'S',
  w: 'T',
  U: 'T',
  T: 'S',
  Q: 'Q',
  C: 'Q',
  o: 'Q',
  p: 'P',
  q: 'P',
  n: 'N',
  t: 'N',
  m: 'M',
  '0': 'M',
  k: 'K',
  r: 'K',
  j: 'J',
  c: 'X',
  '7': 'X',
  '6': 'X',
  v: 'V',
  b: 'Z',
  s: 'b',
  '2': '1',
  '4': '3',
  '5': '3',
};

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
function blank(w: number, h: number): Grid {
  return Array.from({ length: h }, () => new Array<string>(w).fill('.'));
}

const compile = (g: Grid) =>
  fromAscii(
    g.map((r) => r.join('')),
    LEGEND,
  );

/** Horizontal mirror of a compiled hex grid. */
function mirrorSprite(sprite: string[][]): string[][] {
  return sprite.map((row) => [...row].reverse());
}

/** Normalised squared distance from an ellipse centre (1 = on the rim). */
function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy;
}

/** Deterministic 0..1 noise per pixel — texture without Math.random(). */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function put(g: Grid, x: number, y: number, ch: string): void {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = ch;
}

function get(g: Grid, x: number, y: number): string {
  return y >= 0 && y < g.length && x >= 0 && x < g[0].length ? g[y][x] : '.';
}

function rect(g: Grid, x0: number, y0: number, x1: number, y1: number, ch: string): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, ch);
}

/** Stamp a little ASCII picture with its top-left at (x, y); '.' is skipped. */
function stamp(g: Grid, x: number, y: number, rows: string[]): void {
  rows.forEach((row, dy) =>
    [...row].forEach((ch, dx) => {
      if (ch !== '.') put(g, x + dx, y + dy, ch);
    }),
  );
}

/**
 * Swap every pixel that touches transparency (4-neighbour) for the darker
 * shade of its material. Optional box limits the pass to a region.
 */
function outline(g: Grid, box?: [number, number, number, number]): void {
  const src = g.map((r) => [...r]);
  const [x0, y0, x1, y1] = box ?? [0, 0, g[0].length - 1, g.length - 1];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ch = src[y][x];
      if (ch === '.') continue;
      const edge =
        get(src, x - 1, y) === '.' ||
        get(src, x + 1, y) === '.' ||
        get(src, x, y - 1) === '.' ||
        get(src, x, y + 1) === '.';
      if (edge && DARKER[ch]) g[y][x] = DARKER[ch];
    }
  }
}

/** Thick line from (x0,y0) to (x1,y1), drawn with a chooser per step. */
function line(
  g: Grid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  paint: (x: number, y: number) => void,
): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    paint(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n));
  }
}

/**
 * Paint a leaf mask at (ox, oy) with the house shading: LEAF_DARK rim (the
 * outline is the darker shade of the leaf), a 1-2px GREEN_LIGHT gloss in the
 * top-left interior, LEAF body, LEAF_DARK midrib. Mask: '#' leaf, 'r' midrib,
 * '.' skipped.
 */
function leaf(
  g: Grid,
  ox: number,
  oy: number,
  mask: string[],
  body = 'L',
  gloss = 'H',
  dark = 'D',
): void {
  const inside = (x: number, y: number) =>
    y >= 0 && y < mask.length && x >= 0 && x < mask[y].length && mask[y][x] !== '.';
  const isEdge = (x: number, y: number) =>
    inside(x, y) &&
    (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1));
  mask.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      let c = body;
      if (isEdge(x, y) || ch === 'r') c = dark;
      else if (
        (isEdge(x, y - 1) && (isEdge(x - 1, y) || isEdge(x - 2, y))) ||
        (isEdge(x - 1, y) && isEdge(x, y - 2))
      )
        c = gloss;
      put(g, ox + x, oy + y, c);
    }),
  );
}

const mirrorRows = (rows: string[]) => rows.map((r) => [...r].reverse().join(''));

// ════════════════════════════════════════════════════════════════
// 1. cherry_tree — SHOWPIECE. 32x64, 2x2. Five overlapping blossom lobes,
//    each lit pink-light on its own top-left and pink-dark underneath so
//    the clusters separate; branch glimpses between them; a tapering trunk
//    with a root flare; a rope swing hanging off a limb that visibly holds
//    both ropes; petals drifting down and a carpet of fallen ones.
// ════════════════════════════════════════════════════════════════
const CHERRY_TREE = (() => {
  const g = blank(32, 64);
  // trunk: 4px up top, 5px mid, 6px at the base; outline / lit / body / shadow
  const trunkX0: number[] = [];
  for (let y = 22; y <= 57; y++) {
    const w = y < 41 ? 4 : y < 50 ? 5 : 6;
    const wob = y < 48 ? Math.round(Math.sin(y / 5) * 0.6) : 0;
    const x0 = Math.round(16 - w / 2) + wob;
    trunkX0[y] = x0;
    for (let k = 0; k < w; k++)
      put(g, x0 + k, y, k === 0 ? 'T' : k === 1 ? 'w' : k === w - 1 ? 'S' : 'W');
    if (y >= 55) {
      put(g, x0 - 1, y, 'T');
      put(g, x0 + w, y, 'S');
    }
  }
  put(g, trunkX0[57] - 2, 57, 'T');
  put(g, trunkX0[57] + 7, 57, 'S');
  // bark knots
  put(g, 16, 44, 'T');
  put(g, 16, 51, 'T');
  put(g, 17, 52, 'S');
  // left limb up into the canopy
  line(g, 14, 31, 8, 24, (x, y) => {
    put(g, x, y, 'T');
    put(g, x + 1, y, 'w');
  });
  // right limb: leaves the trunk and runs out to x=27 — the swing hangs off it
  line(g, 17, 34, 27, 31, (x, y) => {
    put(g, x, y, 'T');
    if (x <= 24) put(g, x, y + 1, 'S');
  });
  put(g, 28, 31, 'T');

  // six rounded blossom clumps [cx, cy, rx, ry], back to front. Each is pink
  // with a 1px pink-dark underside along its own lower/right rim, so the
  // clumps separate from the ones behind them.
  const lobes: [number, number, number, number][] = [
    [15.5, 6, 7.6, 5.4],
    [7.5, 11, 7, 5.2],
    [24, 10.5, 7.2, 5.4],
    [15.5, 15, 6, 4.6],
    [7, 19, 6.6, 4.6],
    [24.5, 19, 6.6, 4.6],
  ];
  const inLobe = (x: number, y: number, [cx, cy, rx, ry]: [number, number, number, number]) =>
    ellipse(x, y, cx, cy, rx, ry) <= 1;
  for (const lobe of lobes) {
    const [cx, cy, rx, ry] = lobe;
    for (let y = 0; y <= 28; y++) {
      for (let x = 0; x < 32; x++) {
        if (!inLobe(x, y, lobe)) continue;
        const under =
          !inLobe(x, y + 1, lobe) || (x > cx && !inLobe(x + 1, y, lobe) && y > cy - ry * 0.3);
        g[y][x] = under ? 'P' : 'p';
      }
    }
    // where this clump sits in front of an earlier one, the earlier clump's
    // dark underside shows as a 1px line tracing this clump's rounded top
    for (let y = 1; y <= 28; y++)
      for (let x = 0; x < 32; x++) {
        if (!inLobe(x, y, lobe) || inLobe(x, y - 1, lobe)) continue;
        if (g[y - 1][x] === 'p') g[y - 1][x] = 'P';
      }
  }
  outline(g, [0, 0, 31, 27]);
  // limbs glimpsed through the few gaps between clumps (only into gaps)
  for (const [x0, y0, x1, y1] of [
    [15, 25, 15, 12],
    [15, 19, 9, 15],
    [16, 19, 23, 15],
    [15, 23, 10, 22],
    [16, 23, 22, 22],
  ])
    line(g, x0, y0, x1, y1, (x, y) => {
      if (get(g, x, y) === '.') put(g, x, y, 'T');
      if (get(g, x + 1, y) === '.') put(g, x + 1, y, 'S');
    });
  // blossom clusters: 2-3px of pink-light with one cream petal, mostly on
  // the top-left of each clump, one smaller cluster lower down
  for (const [cx, cy, rx, ry] of lobes) {
    const x = Math.round(cx - rx * 0.45);
    const y = Math.round(cy - ry * 0.45);
    stamp(g, x, y, ['mq', 'qq']);
    stamp(g, Math.round(cx + rx * 0.2), Math.round(cy - ry * 0.15), ['.q', 'qm']);
    put(g, Math.round(cx - rx * 0.1), Math.round(cy + ry * 0.35), 'q');
  }
  // swing: two cream ropes off the right limb, plank seat
  for (const rx of [21, 26]) {
    let y = 26;
    while (get(g, rx, y) !== 'T' && y < 40) y++;
    for (y++; y <= 46; y++) if (get(g, rx, y) === '.' || get(g, rx, y) === 'S') put(g, rx, y, 'm');
  }
  for (let x = 20; x <= 27; x++) {
    put(g, x, 47, 'U');
    put(g, x, 48, 'T');
  }
  put(g, 20, 47, 'T');
  put(g, 27, 47, 'T');
  // drifting petals
  for (const [x, y, ch] of [
    [2, 37, 'q'],
    [4, 44, 'p'],
    [29, 36, 'q'],
    [30, 43, 'p'],
    [8, 50, 'q'],
    [1, 52, 'p'],
    [11, 40, 'q'],
  ] as [number, number, string][])
    put(g, x, y, ch);
  // fallen petals around the roots + grass tufts
  for (let y = 53; y <= 62; y++) {
    for (let x = 1; x < 31; x++) {
      if (get(g, x, y) !== '.') continue;
      if (ellipse(x, y, 16, 58, 14, 4.5) > 1) continue;
      const n = hash(x, y, 3);
      if (n < 0.1) put(g, x, y, 'p');
      else if (n < 0.17) put(g, x, y, 'q');
    }
  }
  for (const [x, y] of [
    [10, 57],
    [11, 56],
    [11, 57],
    [21, 57],
    [22, 56],
    [22, 57],
  ])
    put(g, x, y, 'L');
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 2. koi_pond — SHOWPIECE. 32x32, 2x2. A ring of mixed rounded stones
//    (warm stone and cool silver, seams in stone-dark, a dark front face
//    so the rim has height), water shadowed only under the far and left
//    rim (light from the top-left), two koi, lily pads with a pink lotus,
//    a frog with proper eyes, and cattails at the back.
// ════════════════════════════════════════════════════════════════
const KOI_POND = (() => {
  const g = blank(32, 32);
  const cx = 15.5;
  const cy = 14.5;
  const N = 15;
  const idx = (x: number, y: number) => {
    const th = Math.atan2((y - cy) / 13, (x - cx) / 15.5);
    return Math.floor(((th + Math.PI) / (2 * Math.PI)) * N) % N;
  };
  const tones = ['c', '7', 'c', '6', 'c', '7', '6'];
  // front face of the rim (drawn first, the ring sits on top of it)
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (ellipse(x, y, cx, cy + 2, 15.5, 13) <= 1 && y > cy) g[y][x] = 'X';
    }
  }
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const dOut = ellipse(x, y, cx, cy, 15.5, 13);
      if (dOut > 1) continue;
      const dIn = ellipse(x, y, cx, cy + 0.5, 11.5, 9);
      if (dIn <= 1) {
        // water: shadow band only where the rim overhangs it on the lit side
        // (the far top edge and the left edge); the right/front stays open water
        const shadowTop = y < cy && ellipse(x, y - 2, cx, cy + 0.5, 11.5, 9) > 1;
        const shadowLeft = x < cx - 4 && y < cy + 4 && ellipse(x - 1, y, cx, cy + 0.5, 11.5, 9) > 1;
        g[y][x] = shadowTop || shadowLeft ? 'Z' : 'b';
        continue;
      }
      const k = idx(x, y);
      if (idx(x + 1, y) !== k || idx(x, y + 1) !== k) {
        g[y][x] = 'X';
        continue;
      }
      const tone = tones[k % tones.length];
      const lit = (x - cx) / 15.5 + (y - cy) / 13 < -0.4;
      g[y][x] = lit && tone === 'c' ? '7' : tone;
    }
  }
  outline(g);
  // water glints + ripple rings (top-left)
  for (const [x, y] of [
    [9, 9],
    [10, 9],
    [7, 11],
    [12, 7],
    [8, 18],
    [22, 15],
    [23, 15],
    [24, 17],
    [20, 22],
  ])
    put(g, x, y, 's');
  stamp(g, 18, 8, ['.ii.', 'i..i', '.ii.']);
  // koi #1 (orange & white, heading left)
  stamp(g, 8, 13, ['.oo0o..o', 'oxoo0oo.', '.o0oo..o']);
  // koi #2 (white with red patches, heading right)
  stamp(g, 15, 19, ['o..0r0.', '.0r00x0', 'o..00r.']);
  // lily pads (notched circles) with a lotus on one
  stamp(g, 5, 19, ['.LLL.', 'LHLL.', 'LLL..', 'LLLLD', '.DDD.']);
  stamp(g, 6, 18, ['.q.', 'qpq']);
  stamp(g, 22, 10, ['.LLL', 'LHL.', 'LLLD', '.DD.']);
  // frog on the right-hand pad: two eye whites with pupils, then the body
  stamp(g, 22, 7, ['0.0', 'xEx', 'EEE', 'DED']);
  stamp(g, 25, 23, ['.LL.', 'LHLD', '.DD.']);
  // cattails rising behind the far-left rim
  for (const [x, top] of [
    [4, 2],
    [6, 0],
    [8, 3],
  ]) {
    for (let y = top; y <= 7; y++) put(g, x, y, y <= top + 2 ? 'T' : 'L');
    put(g, x, top, 'S');
  }
  put(g, 5, 5, 'L');
  put(g, 7, 6, 'L');
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 3. pine_tree — 16x48, 1x1. Four stacked skirts, each with a lit
//    green-light streak down its left flank and a jagged leaf-dark hem
//    that casts a toothed shadow onto the tier below; pine cones under the
//    skirt edges, a bluebird perched on the second tier, a short trunk and a
//    soft contact shadow instead of a planter tray.
// ════════════════════════════════════════════════════════════════
const PINE_TREE = (() => {
  const g = blank(16, 48);
  // trunk
  for (let y = 36; y <= 44; y++) {
    put(g, 6, y, 'T');
    put(g, 7, y, 'W');
    put(g, 8, y, 'T');
    put(g, 9, y, 'S');
  }
  put(g, 5, 44, 'T');
  put(g, 10, 44, 'S');
  rect(g, 4, 45, 11, 45, 'S');
  // tiers bottom-first [top, hem row, half-width at the hem]
  const tiers: [number, number, number][] = [
    [23, 38, 7.5],
    [15, 30, 6.4],
    [7, 21, 5.1],
    [0, 12, 3.7],
  ];
  tiers.forEach(([top, hem, hw], i) => {
    for (let y = top; y <= hem + 1; y++) {
      const t = Math.min(1, (y - top) / (hem - top));
      const half = 0.5 + (hw - 0.5) * Math.pow(t, 0.8);
      for (let x = 0; x < 16; x++) {
        const dx = x - 7.5;
        if (Math.abs(dx) > half) continue;
        if (y === hem + 1) {
          // sawtooth: teeth hang over whatever is below
          if ((x + i) % 2 === 0) put(g, x, y, 'D');
          continue;
        }
        let ch = 'L';
        if (y === hem) ch = 'D';
        else if (dx > half - 2.2) ch = 'D';
        else if (dx < -half * 0.15) ch = 'G';
        if (y > top + 1 && y < hem - 1 && x === Math.round(7.5 - half * 0.55)) ch = 'H';
        put(g, x, y, ch);
      }
    }
  });
  outline(g, [0, 0, 15, 39]);
  // each skirt casts a 1px shadow row onto the tier below its teeth, so the
  // tiers separate clearly even at campus zoom
  const shade: Record<string, string> = { H: 'G', G: 'L', L: 'D' };
  for (const [, hem] of tiers.slice(1))
    for (const y of [hem + 1, hem + 2])
      for (let x = 0; x < 16; x++) {
        const ch = get(g, x, y);
        if (shade[ch]) put(g, x, y, shade[ch]);
      }
  // pine cones hanging under three skirt edges (clay cap over a lit scale)
  for (const [x, y] of [
    [9, 14],
    [5, 23],
    [11, 32],
  ])
    stamp(g, x, y, ['Q', 'C']);
  // a bluebird perched on the right edge of the second skirt
  stamp(g, 10, 17, ['..bo', '.sbZ']);
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 4. fiddle_fig — 16x48, 1x1. The office plant: big violin-shaped leaves
//    (broad tip, narrow at the stalk — some facing left, some right, two
//    edge-on) clustered up top over a bare trunk, in a woven wicker
//    basket with soil showing at the rim.
// ════════════════════════════════════════════════════════════════
const FIG_UP = ['.###.', '#####', '#####', '##r##', '.#r#.', '.#r#.', '..r..'];
const FIG_RIGHT = ['...###', '..####', '.#####', '.##r#.', '.#r#..', '.r#...', 'r.....'];
const FIG_LEFT = mirrorRows(FIG_RIGHT);
const FIG_EDGE = ['G.', 'HD', 'LD', 'LD', '.D', '.T'];

const FIDDLE_FIG = (() => {
  const g = blank(16, 48);
  // bare trunk: 1px up in the leaves, 2px lower down
  for (let y = 4; y <= 36; y++) {
    const x = 7 + (y > 12 && y < 26 ? Math.round(Math.sin(y / 4) * 0.7) : 0);
    put(g, x, y, 'T');
    if (y >= 24) put(g, x + 1, y, 'S');
  }
  // side stalks
  line(g, 7, 15, 4, 12, (x, y) => put(g, x, y, 'T'));
  line(g, 7, 19, 10, 16, (x, y) => put(g, x, y, 'T'));
  // leaves, back to front
  leaf(g, 4, 0, FIG_UP);
  leaf(g, 9, 2, FIG_RIGHT);
  leaf(g, 0, 4, FIG_LEFT);
  stamp(g, 12, 9, FIG_EDGE);
  leaf(g, 0, 11, FIG_LEFT);
  leaf(g, 8, 10, FIG_RIGHT);
  leaf(g, 5, 6, FIG_UP);
  stamp(g, 3, 18, FIG_EDGE);
  leaf(g, 9, 16, FIG_RIGHT);
  leaf(g, 1, 19, FIG_LEFT);
  // wicker basket rows 35-46: back rim, soil, front rim, weave
  for (let y = 35; y <= 46; y++) {
    const inset = y >= 45 ? 2 : 1;
    for (let x = 1 + inset; x <= 14 - inset; x++) {
      let ch: string;
      if (y === 35) ch = 'w';
      else if (y === 36) ch = x === 2 || x === 13 ? 'w' : x % 4 === 1 ? 'T' : 'S';
      else if (y === 37) ch = 'U';
      else {
        const band = Math.floor((y - 38) / 2);
        ch = (x + band * 2) % 4 < 2 ? 'W' : 'w';
        if (x >= 11) ch = 'T';
      }
      g[y][x] = ch;
    }
  }
  put(g, 7, 36, 'T');
  put(g, 8, 36, 'S');
  outline(g, [0, 35, 15, 47]);
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 5. snake_plant — 16x32, 1x1. Upright sword leaves of mixed heights with
//    darker cross-bands and gold margins, in a glazed teal pot.
// ════════════════════════════════════════════════════════════════
const SNAKE_PLANT = (() => {
  const g = blank(16, 32);
  const leaves: [number, number, number][] = [
    [6, 2, 0],
    [9, 5, 1],
    [3, 8, -1],
    [11, 10, 1],
    [5, 11, 0],
    [8, 14, 0],
  ];
  for (const [lx, top, lean] of leaves) {
    for (let y = top; y <= 21; y++) {
      const shift = Math.round(((21 - y) / 20) * lean * 2);
      const x0 = lx + shift;
      const tip = y - top;
      const w = tip === 0 ? 1 : tip < 3 ? 2 : 3;
      for (let k = 0; k < w; k++) {
        let ch = k === 0 ? 'G' : k === w - 1 && w === 3 ? 'D' : 'L';
        if ((y + lx) % 4 === 0 && k === 1) ch = 'D';
        put(g, x0 + k, y, ch);
      }
      if (w === 3 && (y + lx) % 3 !== 0) put(g, x0 + (lean >= 0 ? 2 : 0), y, 'y');
      if (tip === 0) put(g, x0, y, 'D');
    }
  }
  for (let y = 21; y <= 30; y++) {
    const inset = y === 21 ? 1 : y >= 29 ? 3 : 2;
    for (let x = inset; x <= 15 - inset; x++) {
      let ch = x <= inset + 1 ? 't' : x >= 13 - inset ? 'N' : 'n';
      if (y === 21) ch = 'N';
      if (y === 22) ch = 't';
      if (y === 26) ch = 'j';
      put(g, x, y, ch);
    }
  }
  for (let x = 3; x <= 12; x++) if (get(g, x, 21) === 'N' && x % 3 === 0) put(g, x, 21, 'S');
  outline(g, [0, 21, 15, 31]);
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 6. bonsai — 16x16, 1x1, tabletop. A gnarled juniper: a 2px trunk that
//    twists in an S (lit left edge, dark right edge) up to three cloud pads,
//    each lit on top and shaded underneath, in a navy tray with a glazed
//    rim, dark soil and a strip of moss.
// ════════════════════════════════════════════════════════════════
const BONSAI = (() => {
  const g = blank(16, 16);
  line(g, 8, 8, 11, 8, (x, y) => put(g, x, y, 'T')); // limb to the right pad
  line(g, 5, 8, 3, 6, (x, y) => put(g, x, y, 'T')); // limb to the left pad
  // S-curve trunk, base at row 11: [row, left x]
  for (const [y, x] of [
    [11, 5],
    [10, 4],
    [9, 4],
    [8, 5],
    [7, 6],
    [6, 7],
    [5, 7],
  ]) {
    put(g, x, y, 'w');
    put(g, x + 1, y, 'T');
  }
  // cloud pads [cx, cy, rx, ry]: top row lit, underside dark
  const pads: [number, number, number, number][] = [
    [8.5, 2.4, 4, 2],
    [3.4, 5.4, 3.2, 1.7],
    [12.2, 7, 2.9, 1.7],
  ];
  for (const [px, py, rx, ry] of pads) {
    const inPad = (x: number, y: number) => ellipse(x, y, px, py, rx, ry) <= 1;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (!inPad(x, y)) continue;
        let ch = x < px ? 'G' : 'L';
        if (!inPad(x, y - 1)) ch = x <= px + 1 ? 'H' : 'G';
        if (!inPad(x, y + 1) || !inPad(x + 1, y)) ch = 'D';
        g[y][x] = ch;
      }
  }
  // tray: back rim 11, soil + moss 12, front face 13-14, feet 15
  rect(g, 2, 11, 12, 11, 'J');
  put(g, 5, 11, 'w');
  put(g, 6, 11, 'T');
  rect(g, 2, 12, 12, 12, 'J');
  rect(g, 3, 12, 11, 12, 'S');
  for (const x of [3, 4, 7, 8, 9]) put(g, x, 12, x % 2 ? 'L' : 'H'); // moss strip
  put(g, 5, 12, 'T'); // root flare
  put(g, 6, 12, 'S');
  put(g, 10, 12, 'c'); // a pebble
  rect(g, 1, 13, 13, 14, 'j');
  for (const y of [13, 14]) {
    put(g, 1, y, 'J');
    put(g, 13, y, 'J');
  }
  rect(g, 2, 14, 12, 14, 'J');
  put(g, 2, 13, '5'); // glaze glint
  rect(g, 3, 15, 4, 15, 'J');
  rect(g, 10, 15, 11, 15, 'J');
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 7. succulent_trio — 16x16, 1x1, tabletop. Three pots that don't touch,
//    three distinct silhouettes: a tall spiky cactus in a cream pot with a
//    pink flower on top (back-left), a teal echeveria rosette seen from
//    above in a clay pot (front-centre), and string-of-pearls spilling over
//    a small navy pot (right), one strand trailing down beside it.
// ════════════════════════════════════════════════════════════════
const SUCCULENT_TRIO = (() => {
  const g = blank(16, 16);
  // cactus, back-left: x1-3, flower on top, paper spines
  stamp(g, 0, 0, ['..p..', '.pqp.', '.DpD.', '.HLD.', '0HLD.', '.HLD0', '0GLD.', '.GLD0', '.GLD.']);
  // cream pot x0-4, rows 9-12
  stamp(g, 0, 9, ['MMMMM', 'M00mM', 'MmmmM', 'MmmMM', '.MMM.']);
  // clay pot front-centre x5-10, rows 11-15
  stamp(g, 5, 10, ['QQQQQQ', 'QooooQ', 'QCCCCQ', 'QCCCQQ', '.QQQQ.']);
  // echeveria rosette above it: concentric rings, pink tips
  stamp(g, 5, 6, ['.pNNp.', 'NnttnN', 'NtqHtN', 'NnttnN', '.NnnN.']);
  // string-of-pearls in a navy pot, right: x11-14, closed by a navy-dark
  // outline column at x14
  stamp(g, 11, 7, ['.H.H', 'HDHD', 'JJJJ', 'JjjJ', 'JjJJ', '.JJ.']);
  // strands: one spilling over the pot's front, one trailing beside it in col 15
  for (const [x, y, ch] of [
    [12, 10, 'D'],
    [12, 11, 'H'],
    [12, 12, 'D'],
    [12, 13, 'H'],
    [15, 8, 'H'],
    [15, 9, 'D'],
    [15, 10, 'H'],
    [15, 11, 'D'],
    [15, 12, 'H'],
  ] as [number, number, string][])
    put(g, x, y, ch);
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 8. hanging_plant — 16x32, wall, 1x1. A small steel J hook, cream
//    macramé cords knotting into a sling, a clay pot, and pothos: three
//    stems of clearly different lengths with 2px leaves alternating left
//    and right every 3 rows, a few hearts spilling over the rim.
// ════════════════════════════════════════════════════════════════
const HANGING_PLANT = (() => {
  const g = blank(16, 32);
  // iron ceiling hook: a 1px steel J (stem down from a dark mount, curling
  // up at the bottom), outlined in steel-dark on its shaded right/bottom
  stamp(g, 5, 0, ['..343', '...43', '.4.43', '.4.43', '.344.', '..33.']);
  // cords fan out from the knot hanging in the hook's curl
  put(g, 7, 5, 'M');
  line(g, 7, 6, 3, 12, (x, y) => put(g, x, y, 'm'));
  line(g, 8, 6, 12, 12, (x, y) => put(g, x, y, 'M'));
  line(g, 8, 6, 8, 12, (x, y) => put(g, x, y, 'm'));
  for (const [x, y] of [
    [5, 9],
    [10, 9],
    [8, 9],
  ])
    put(g, x, y, '0');
  // pot rows 12-17
  for (let y = 12; y <= 17; y++) {
    const inset = y === 12 ? 2 : y >= 16 ? 4 : 3;
    for (let x = inset; x <= 15 - inset; x++)
      put(g, x, y, x <= inset + 1 ? 'o' : x >= 13 - inset ? 'Q' : 'C');
  }
  rect(g, 3, 13, 12, 13, 'm');
  put(g, 3, 13, 'M');
  put(g, 12, 13, 'M');
  const heart = (x: number, y: number) => stamp(g, x, y, ['HG', 'GD']);
  // crown of leaves on the rim, some spilling over its front
  heart(4, 10);
  heart(7, 10);
  heart(10, 10);
  heart(5, 12);
  heart(10, 12);
  // three strands of clearly different lengths, each a straight-ish 1px
  // stem with a 2px leaf every 3 rows, alternating sides, so the strands
  // stay apart at campus zoom [x, start row, end row]
  const vines: [number, number, number][] = [
    [2, 13, 25],
    [8, 18, 31],
    [13, 13, 21],
  ];
  vines.forEach(([x, y0, y1], n) => {
    let side = n === 2 ? 1 : -1;
    for (let y = y0; y <= y1; y++) {
      put(g, x, y, 'D');
      if ((y - y0) % 3 === 1 && y < y1) {
        // beside the pot, leaves only grow outward (never over the pot face)
        const inward = n !== 1 && y <= 17 && (n === 0 ? side > 0 : side < 0);
        if (!inward) stamp(g, side > 0 ? x + 1 : x - 2, y, side > 0 ? ['GD'] : ['HG']);
        side = -side;
      }
    }
    stamp(g, x - 1, y1, ['HGD']); // leaf at the tip
  });
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 9. green_wall — 32x32, wall, 2x1. A framed living wall: a warm grow
//    light under the top rail (which is why it's so lush), then three
//    planted shelves, each holding distinct clumps — fern fans, round
//    leafy mounds, a grass spike, a vine spilling over the shelf lip — lit
//    top-left with a dark shadow line under each shelf, a handful of
//    blooms, and strands trailing below the frame.
// ════════════════════════════════════════════════════════════════
const GREEN_WALL = (() => {
  const g = blank(32, 32);
  // frame + dark backing
  rect(g, 1, 3, 30, 28, 'W');
  rect(g, 2, 5, 29, 27, 'T');
  rect(g, 1, 3, 30, 3, 'w');
  // grow light strip
  rect(g, 2, 4, 29, 4, '3');
  rect(g, 3, 5, 28, 5, 'f');
  for (const x of [3, 28]) put(g, x, 5, 'l');
  const mound = (cx: number, base: number, rx: number, ry: number) => {
    for (let y = base - Math.ceil(ry * 2); y <= base; y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x - cx) / rx;
        const v = (y - (base - ry)) / ry;
        if (u * u + v * v > 1 || x < 2 || x > 29) continue;
        const s = u + v;
        put(g, x, y, s < -0.8 ? 'H' : s > 0.7 || v > 0.6 ? 'D' : s < 0 ? 'G' : 'L');
      }
    }
  };
  const fern = (cx: number, base: number, h: number) => {
    for (const a of [-1.1, -0.55, 0, 0.55, 1.1]) {
      const ex = cx + Math.sin(a) * h;
      const ey = base - Math.cos(a) * h;
      line(g, cx, base, Math.round(ex), Math.round(ey), (x, y) => {
        if (x < 2 || x > 29) return;
        const tip = Math.abs(x - ex) + Math.abs(y - ey) < 1.5;
        put(g, x, y, tip ? 'H' : a < 0 ? 'G' : a > 0.3 ? 'D' : 'L');
      });
    }
  };
  const grass = (cx: number, base: number) => {
    for (const [dx, h] of [
      [-2, 4],
      [0, 6],
      [2, 5],
    ])
      line(g, cx, base, cx + dx, base - h, (x, y) =>
        put(g, x, y, y === base - h ? 'H' : dx < 0 ? 'G' : 'L'),
      );
  };
  // three shelves: plants rooted on each lip row
  const shelves = [12, 20, 27];
  // row 1
  fern(5, 11, 5);
  mound(11, 11, 3, 2.5);
  grass(16, 11);
  mound(21.5, 11, 3.2, 2.6);
  fern(27, 11, 4);
  // row 2
  mound(5, 19, 3.5, 2.8);
  fern(11, 19, 5);
  mound(17, 19, 2.6, 2.2);
  fern(22, 19, 4);
  grass(27, 19);
  // row 3
  grass(4, 26);
  mound(9.5, 26, 3.4, 2.6);
  fern(16, 26, 5);
  mound(22, 26, 3, 2.4);
  fern(27, 26, 3);
  // shelf lips + the shadow line beneath each
  for (const y of shelves) {
    rect(g, 2, y, 29, y, 'U');
    if (y + 1 <= 27)
      for (let x = 2; x <= 29; x++) put(g, x, y + 1, get(g, x, y + 1) === 'T' ? 'S' : 'D');
  }
  // vines spilling over the shelf lips
  for (const [x, y0, len] of [
    [8, 12, 4],
    [24, 20, 4],
  ]) {
    for (let y = y0 + 1; y <= y0 + len; y++) put(g, x, y, 'D');
    put(g, x + 1, y0 + 2, 'G');
    put(g, x - 1, y0 + 4, 'G');
  }
  // blooms (six, varied): pink crosses with gold hearts, purple spikes
  for (const [x, y] of [
    [21, 7],
    [6, 16],
    [22, 23],
  ])
    stamp(g, x - 1, y - 1, ['.p.', 'pYp', '.p.']);
  for (const [x, y] of [
    [16, 4 + 1],
    [27, 13],
    [4, 20],
  ]) {
    put(g, x, y, 'v');
    put(g, x, y + 1, 'v');
    put(g, x, y + 2, 'V');
  }
  rect(g, 1, 28, 30, 28, 'T');
  outline(g);
  // grow-light housing ends
  put(g, 1, 4, '3');
  put(g, 30, 4, '3');
  // trailing strands under the frame
  for (const [x, len] of [
    [5, 2],
    [11, 3],
    [19, 1],
    [25, 3],
  ]) {
    for (let y = 29; y < 29 + len; y++) put(g, x, y, 'D');
    put(g, x + 1, 28 + len, 'G');
  }
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 10. planter_box — raised wooden planter. Front 32x32, 2x1: a lit back
//     rim, a deep soil top (lit rim on its top and left) the plants root
//     in at different depths, a short two-plank front, leg stubs. Lavender of varied
//     heights (a couple leaning), a tomato on a cane, a plant marker and a
//     metal trowel stuck in the soil. Right 16x48, 1x2: the same box
//     turned lengthwise — same wood, same upright plants.
// ════════════════════════════════════════════════════════════════
function lavender(g: Grid, x: number, base: number, h: number, lean: number): void {
  for (let k = 0; k <= h; k++) {
    const y = base - k;
    const lx = x + (k > h / 2 ? lean : 0);
    if (k >= h - 3) put(g, lx, y, k === h - 3 ? 'V' : 'v');
    else put(g, lx, y, 'D');
  }
}

function tomato(g: Grid, cx: number, base: number): void {
  for (let y = base - 13; y <= base; y++) put(g, cx, y, 'w');
  put(g, cx, base - 14, 'T');
  // foliage as clustered leaf blobs off the cane
  for (const [x, y, w] of [
    [cx - 4, base - 11, 3],
    [cx + 1, base - 12, 3],
    [cx - 3, base - 7, 3],
    [cx + 1, base - 8, 4],
    [cx - 4, base - 3, 3],
    [cx + 1, base - 4, 3],
  ]) {
    for (let k = 0; k < w; k++) put(g, x + k, y, k === 0 ? 'H' : 'G');
    for (let k = 0; k < w; k++) put(g, x + k, y + 1, k === w - 1 ? 'D' : 'L');
  }
  for (const [x, y] of [
    [cx - 3, base - 9],
    [cx + 2, base - 6],
    [cx - 2, base - 1],
  ]) {
    stamp(g, x, y, ['rr', 'rK']);
    put(g, x, y, 'o');
  }
}

function marker(g: Grid, x: number, base: number): void {
  stamp(g, x, base - 6, ['mmm', 'mVm', 'MMM', '.T.', '.T.', '.T.', '.T.']);
}

function trowel(g: Grid, x: number, base: number): void {
  stamp(g, x, base - 6, ['T.', 'W.', 'T.', '6.', '77', '74', '4.']);
}

const PLANTER_BOX = (() => {
  const g = blank(32, 32);
  // 3/4 view of a 1-tile-deep box: back rim 12-13 (lit), a deep soil top
  // 14-19 with a lit rim down its left side, front rim 20 (lit edge), two
  // planks 21-27 (seam at 24), legs 28-29
  rect(g, 0, 12, 31, 27, 'W');
  rect(g, 1, 13, 30, 13, 'w');
  rect(g, 2, 14, 29, 19, 'S');
  rect(g, 1, 14, 1, 19, 'w');
  for (let y = 15; y <= 19; y += 2) for (let x = 3 + (y % 3); x <= 28; x += 4) put(g, x, y, 'T');
  rect(g, 1, 20, 30, 20, 'U');
  rect(g, 1, 24, 30, 24, 'T');
  for (const x of [10, 21]) rect(g, x, 21, x, 26, 'T');
  outline(g);
  rect(g, 2, 28, 3, 29, 'S');
  rect(g, 28, 28, 29, 29, 'S');
  // lavender (left): varied heights, two leaning, rooted at different depths
  for (const [x, base, h, lean] of [
    [3, 17, 8, 0],
    [4, 19, 10, -1],
    [6, 18, 9, 0],
    [7, 19, 12, 0],
    [9, 17, 9, 1],
    [10, 19, 11, 0],
    [12, 18, 8, 1],
  ])
    lavender(g, x, base, h, lean);
  tomato(g, 18, 18);
  marker(g, 25, 18);
  trowel(g, 28, 19);
  return compile(g);
})();

const PLANTER_BOX_RIGHT = (() => {
  const g = blank(16, 48);
  // box seen lengthwise: back rim 11-12, soil 13-39, front rim 40, then the
  // short end of the box as two planks 41-45 (seam at 43) matching the
  // front view's wood and seam line, legs 46-47
  rect(g, 0, 11, 15, 45, 'W');
  rect(g, 1, 12, 14, 12, 'w');
  rect(g, 2, 13, 13, 39, 'S');
  rect(g, 1, 13, 1, 39, 'w'); // lit left rim only
  for (let y = 14; y <= 38; y += 3) put(g, 3 + ((y * 7) % 10), y, 'T');
  rect(g, 1, 40, 14, 40, 'U');
  rect(g, 1, 43, 14, 43, 'T');
  outline(g);
  rect(g, 2, 46, 3, 47, 'S');
  rect(g, 12, 46, 13, 47, 'S');
  // tomato at the far end, lavender in the middle, marker + trowel near
  tomato(g, 8, 18);
  for (const [x, base, h, lean] of [
    [3, 29, 8, 0],
    [5, 30, 10, -1],
    [7, 29, 9, 0],
    [9, 31, 11, 0],
    [11, 30, 8, 1],
    [12, 29, 9, 0],
  ])
    lavender(g, x, base, h, lean);
  marker(g, 4, 38);
  trowel(g, 10, 38);
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 11. hedge — clipped boxwood hedge. Front 32x32, 2x1. Right 16x48, 1x2.
//     Built from overlapping round leaf clumps on a jittered grid, so the
//     silhouette is bumpy (scalloped top edge, rounded corners) and the
//     texture is irregular clusters rather than a pattern: each clump is
//     lit on its upper-left and shaded on its lower-right, clumps above the
//     clip line use the light greens (the top), clumps below use the darker
//     greens (the front face), so the top/front transition follows the
//     clumps instead of a ruled line; a dark base where it meets the ground,
//     and a few daisies.
// ════════════════════════════════════════════════════════════════
function hedge(
  w: number,
  h: number,
  topY0: number,
  faceY0: number,
  faceY1: number,
  flowers: [number, number][],
): Grid {
  const g = blank(w, h);
  // clump centres on a jittered 4px grid inside the hedge body
  const clumps: [number, number][] = [];
  for (let j = 0; topY0 + 2 + j * 3.5 <= faceY1 - 1; j++)
    for (let i = 0; 2.5 + i * 4 <= w - 2.5; i++) {
      const cx = 2.5 + i * 4 + (j % 2) * 2 + (hash(i, j, w) - 0.5) * 1.4;
      const cy = topY0 + 2 + j * 3.5 + (hash(j, i, w + 7) - 0.5) * 1.2;
      if (cx > w - 2.5) continue;
      clumps.push([Math.min(cx, w - 2.6), Math.min(cy, faceY1 - 2)]);
    }
  const R = 2.6;
  const inDisc = (x: number, y: number, [cx, cy]: [number, number]) =>
    (x - cx) ** 2 + (y - cy) ** 2 <= R * R - 0.4;
  // body: an inset rectangle plus every clump disc -> bumpy outer edge
  for (let y = topY0 + 2; y <= faceY1; y++)
    for (let x = 2; x <= w - 3; x++) g[y][x] = y < faceY0 ? 'L' : 'D';
  // clumps painted back to front: each a round cluster, lit on its
  // upper-left, mid in the middle, shaded on its lower-right rim
  const order = [...clumps].sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  for (const c of order) {
    const top = c[1] < faceY0;
    for (let y = 0; y <= faceY1; y++)
      for (let x = 0; x < w; x++) {
        if (!inDisc(x, y, c)) continue;
        const dx = x - c[0];
        const dy = y - c[1];
        const lit = (dx + 1) ** 2 + (dy + 1) ** 2 < 1.6;
        const shade = dx + dy > 1.4 && dx * dx + dy * dy > 2.2;
        g[y][x] = top ? (lit ? 'H' : shade ? 'L' : 'G') : lit ? 'G' : shade ? 'D' : 'L';
      }
  }
  // dark base where it meets the ground
  for (let x = 0; x < w; x++)
    for (const y of [faceY1 - 1, faceY1]) if (g[y][x] !== '.') g[y][x] = 'D';
  outline(g);
  for (const [x, y] of flowers) {
    put(g, x, y, '0');
    put(g, x + 1, y, 'Y');
  }
  return g;
}

const HEDGE = (() => {
  const g = hedge(32, 32, 9, 18, 30, [
    [6, 21],
    [17, 24],
    [26, 20],
  ]);
  return compile(g);
})();

const HEDGE_RIGHT = (() => {
  const g = hedge(16, 48, 9, 39, 46, [
    [4, 41],
    [10, 43],
  ]);
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 12. picket_fence — cream pickets with pointed tops on two rails, grass
//     at the foot and a climbing rose. Front 32x32, 2x1. Right 16x48, 1x2:
//     the run seen end-on — eight pointed picket tops stepping down the
//     column, overlapping, a rail along their right side, and the rose.
// ════════════════════════════════════════════════════════════════
const rose = (g: Grid, x: number, y: number) => stamp(g, x - 1, y - 1, ['.q.', 'prp', '.L.']);

const PICKET_FENCE = (() => {
  const g = blank(32, 32);
  for (const y of [16, 24]) {
    rect(g, 0, y, 31, y, 'm');
    rect(g, 0, y + 1, 31, y + 1, 'M');
  }
  for (let p = 0; p < 8; p++) {
    const x0 = p * 4;
    put(g, x0 + 1, 11, 'm');
    for (let y = 12; y <= 29; y++) {
      put(g, x0, y, '0');
      put(g, x0 + 1, y, 'm');
      put(g, x0 + 2, y, 'M');
    }
  }
  outline(g);
  for (let x = 0; x < 32; x++) {
    const h = Math.round(hash(x, 2, 9) * 3);
    for (let y = 30 - h; y <= 30; y++)
      if (get(g, x, y) === '.' || y >= 29) put(g, x, y, y === 30 ? 'D' : 'L');
  }
  line(g, 15, 29, 18, 21, (x, y) => put(g, x, y, 'D'));
  line(g, 18, 21, 23, 15, (x, y) => put(g, x, y, 'D'));
  line(g, 20, 19, 25, 21, (x, y) => put(g, x, y, 'D'));
  for (const [x, y] of [
    [16, 25],
    [19, 18],
    [22, 15],
    [24, 20],
  ])
    rose(g, x, y);
  for (const [x, y] of [
    [17, 23],
    [21, 17],
    [23, 22],
  ])
    put(g, x, y, 'L');
  return compile(g);
})();

const PICKET_FENCE_RIGHT = (() => {
  const g = blank(16, 48);
  // the run seen end-on: eight pickets stepping toward us down the column,
  // back to front, each showing its pointed cream top (cream-dark outline)
  // and a sliver of its body before the next picket overlaps it
  for (let k = 0; k < 8; k++) {
    const t = 1 + k * 4; // top row of this picket's point
    const base = t + 17; // its foot
    stamp(g, 5, t, ['..M..', '.M0M.', 'M00mM', 'M0mmM']);
    // a farther picket's body sits in the shadow of the one in front of it,
    // so each lit point stands out against the darker picket behind
    const near = k === 7;
    for (let y = t + 4; y < base; y++) stamp(g, 5, y, [near ? 'M0mmM' : 'MMMMM']);
    rect(g, 5, base, 9, base, 'M');
  }
  // the rail running along the pickets' right side, and its end cap
  for (let y = 6; y <= 42; y++) put(g, 10, y, 'M');
  put(g, 10, 5, 'm');
  // grass at the base
  for (const [x, y] of [
    [4, 45],
    [4, 46],
    [3, 46],
    [10, 46],
    [11, 45],
    [11, 46],
  ])
    put(g, x, y, 'L');
  // climbing rose up the right of the rail: stem, leaves, two blooms
  for (let y = 26; y <= 45; y++) put(g, 12 - (y < 34 ? 1 : 0), y, 'D');
  for (const [x, y] of [
    [12, 30],
    [13, 38],
    [10, 34],
    [13, 42],
  ])
    put(g, x, y, 'L');
  put(g, 12, 29, 'G');
  rose(g, 11, 26);
  rose(g, 13, 35);
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 13. campfire — 16x32, 1x1. A full ring of rounded stones (small back
//     arc behind the flame, bigger front stones), two crossed logs showing
//     their cut ends, a flame (red → orange → lamp-warm → gold-light core),
//     embers, a smoke wisp — and a marshmallow toasting on a stick.
// ════════════════════════════════════════════════════════════════
const CAMPFIRE = (() => {
  const g = blank(16, 32);
  // pit
  for (let y = 21; y <= 30; y++)
    for (let x = 0; x < 16; x++) if (ellipse(x, y, 7.5, 25.5, 6.5, 3.6) <= 1) put(g, x, y, 'S');
  const stone = (sx: number, sy: number, rx: number, ry: number) => {
    for (let y = Math.floor(sy - ry); y <= Math.ceil(sy + ry); y++) {
      for (let x = Math.floor(sx - rx); x <= Math.ceil(sx + rx); x++) {
        const u = (x - sx) / rx;
        const v = (y - sy) / ry;
        const d = u * u + v * v;
        if (d > 1) continue;
        put(g, x, y, d > 0.55 && u + v > 0.2 ? 'X' : u + v < -0.5 ? '7' : 'c');
      }
    }
  };
  // back arc (small, far)
  for (const [x, y] of [
    [2.5, 22.5],
    [5.5, 21.2],
    [9.5, 21.2],
    [12.5, 22.5],
  ])
    stone(x, y, 1.6, 1.2);
  // logs crossing in the pit, cut ends toward us
  line(g, 10, 22, 5, 27, (x, y) => {
    put(g, x, y, 'W');
    put(g, x + 1, y, 'T');
  });
  line(g, 5, 22, 10, 27, (x, y) => {
    put(g, x, y, 'T');
    put(g, x + 1, y, 'W');
  });
  stamp(g, 3, 26, ['TT', 'MM', 'TT']);
  stamp(g, 10, 26, ['TT', 'MM', 'TT']);
  // embers
  put(g, 7, 25, 'o');
  put(g, 8, 26, 'o');
  // flame — narrow at the base so the back stones show either side
  stamp(g, 2, 9, [
    '....r.......',
    '....rr..r...',
    '...ror..rr..',
    '...roor.ror.',
    '..rofforoor.',
    '..roflfforr.',
    '.rofllffoor.',
    '.rofllllfor.',
    '.roofllllfor',
    '.rofflllfor.',
    '..rofllffor.',
    '..rofflfor..',
    '...rofffo...',
    '....roor....',
  ]);
  // front stones (bigger, nearer)
  for (const [x, y] of [
    [1.5, 25.5],
    [4, 28.5],
    [7.5, 29.5],
    [11, 28.5],
    [13.8, 25.5],
  ])
    stone(x, y, 2.1, 1.6);
  // sparks (one orange) + smoke
  put(g, 4, 6, 'Y');
  put(g, 11, 6, 'o');
  put(g, 9, 4, 'f');
  for (const [x, y] of [
    [7, 8],
    [8, 7],
    [8, 6],
    [7, 5],
    [6, 4],
    [6, 3],
    [7, 2],
    [8, 1],
    [9, 0],
  ])
    put(g, x, y, y < 4 ? '7' : '6');
  // marshmallow on a stick, poked in from the front-right
  line(g, 15, 29, 13, 21, (x, y) => put(g, x, y, 'T'));
  stamp(g, 12, 19, ['00', 'wo']);
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 14. stepping_stones — 16x16, 1x1, walkable (backgroundTiles 1). Three
//     flat stones of different sizes set INTO the ground on a diagonal:
//     oval tops with only a 1px darker underside (no tall faces — you step
//     on these, not over them), a moss fringe along one edge of each, grass
//     sprouts and a daisy between them.
// ════════════════════════════════════════════════════════════════
const STEPPING_STONES = (() => {
  const g = blank(16, 16);
  // [cx, cy, rx, ry, moss side: -1 left / 1 right]
  const stones: [number, number, number, number, number][] = [
    [4.5, 3, 3.6, 2.1, 1],
    [9.5, 8, 4.4, 2.3, -1],
    [12.5, 13, 3, 1.6, -1],
  ];
  for (const [sx, sy, rx, ry, moss] of stones) {
    // 1px underside: the same oval nudged down a pixel, in stone-dark
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) if (ellipse(x, y, sx, sy + 1, rx, ry) <= 1) put(g, x, y, 'X');
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (ellipse(x, y, sx, sy, rx, ry) > 1) continue;
        const lit = ellipse(x, y, sx - rx * 0.35, sy - ry * 0.35, rx * 0.45, ry * 0.45) <= 1;
        put(g, x, y, lit ? '7' : 'c');
      }
    // moss fringe hugging one side of the stone's rim
    for (let y = Math.ceil(sy - ry * 0.6); y <= Math.floor(sy + ry * 0.8); y++) {
      let x = moss > 0 ? 15 : 0;
      while (x >= 0 && x < 16 && get(g, x, y) === '.') x -= moss;
      if (x >= 0 && x < 16) put(g, x + moss, y, 'D');
    }
  }
  // sprouts and a daisy in the gaps
  for (const [x, y] of [
    [1, 9],
    [2, 8],
    [2, 10],
    [14, 3],
    [13, 4],
    [5, 14],
  ])
    put(g, x, y, 'L');
  put(g, 2, 9, 'G');
  stamp(g, 11, 1, ['.0.', '0Y0', '.0.']);
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 15. mailbox — 16x32, 1x1. A red rural mailbox seen 3/4 from its door
//     end: the rounded door on the left is a lit red arch (dark-red
//     outline, latch) with a letter sticking out of it; the long flank runs
//     right as a flat brick-red slab with a highlight row along its curved
//     roof. Gold flag raised on the flank, wooden post: you've got mail.
// ════════════════════════════════════════════════════════════════
const MAILBOX = (() => {
  const g = blank(16, 32);
  // post + contact shadow
  rect(g, 7, 16, 8, 30, 'W');
  rect(g, 9, 16, 10, 30, 'T');
  rect(g, 5, 31, 12, 31, 'S');
  stamp(g, 0, 7, [
    '...KKKK.........', // door arch top + flank roof behind it
    '..KrppKKKKKKKK..',
    '.KrpprKrrrrrrrK.', // flank: highlight row along the roof
    '.KprrrKkkkkkkkK.',
    '.KprrrKkkkkkkkK.',
    '.KprrrKkkkkkkkK.',
    '.Kpr7rKkkkkkkkK.', // latch
    '.KprrrKkkkkkkkK.',
    '.KrrrrKkkkkkkkK.',
    '.KKKKKKKKKKKKKK.',
  ]);
  // letter sticking out of the door
  stamp(g, 0, 10, ['000', '0MM']);
  // flag (raised) on the flank
  stamp(g, 12, 2, ['.YYY', '.Yyy', '.y..', '.y..', '.y..', '.y..', '.y..', '.y..', '.1..']);
  // grass at the post
  for (const [x, y] of [
    [5, 30],
    [6, 29],
    [11, 30],
    [12, 29],
    [6, 30],
    [11, 29],
  ])
    put(g, x, y, 'L');
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 16. monstera — 16x32, 1x1. The iconic office plant: four separate
//     heart-shaped leaves, each with its own dark rim and the signature
//     slits cut in from the leaf EDGE (you see straight through them), each
//     on its own stalk rising out of a grey concrete pot with a cream band.
// ════════════════════════════════════════════════════════════════
/** Monstera leaf masks, tip up and the heart notch at the bottom where the
 * stalk joins: '#' leaf, 'r' midrib, and the 1px slits are '.' cut 2px in
 * from the margin, so the floor (or the leaf behind) shows through them. */
const MONSTERA_BIG = [
  '...#r#...',
  '.###r###.',
  '..##r####',
  '####r##..',
  '..##r####',
  '####r####',
  '.###r###.',
  '..##.##..',
];
const MONSTERA_SMALL = ['..###..', '.######', '..#####', '#####..', '.#####.', '.##.##.'];

const MONSTERA = (() => {
  const g = blank(16, 32);
  // stalks from the soil to each leaf's notch, drawn first so leaves overlap them
  line(g, 6, 21, 4, 10, (x, y) => put(g, x, y, 'L'));
  line(g, 8, 21, 11, 7, (x, y) => put(g, x, y, 'D'));
  line(g, 8, 21, 11, 15, (x, y) => put(g, x, y, 'L'));
  line(g, 6, 21, 4, 18, (x, y) => put(g, x, y, 'D'));
  // four leaves back to front, each lifted clear of the others on its own stalk
  leaf(g, 7, 0, mirrorRows(MONSTERA_BIG), 'G');
  leaf(g, 0, 3, MONSTERA_BIG, 'G');
  leaf(g, 8, 10, mirrorRows(MONSTERA_SMALL), 'G');
  leaf(g, 1, 13, MONSTERA_SMALL, 'G');
  // concrete pot rows 22-31
  for (let y = 22; y <= 31; y++) {
    const inset = y >= 30 ? 3 : 2;
    for (let x = inset; x <= 15 - inset; x++) {
      let ch = x <= inset + 1 ? '7' : x >= 12 - inset ? 'X' : 'c';
      if (y === 22) ch = 'X';
      if (y === 23) ch = x === inset || x === 15 - inset ? 'c' : 'S';
      if (y === 24) ch = '7';
      if (y === 27) ch = x >= 12 - inset ? 'M' : 'm';
      put(g, x, y, ch);
    }
  }
  put(g, 6, 23, 'D');
  put(g, 7, 23, 'D');
  put(g, 8, 23, 'L');
  outline(g, [0, 22, 15, 31]);
  return compile(g);
})();

// ════════════════════════════════════════════════════════════════
// 17. watering_can — 16x16, 1x1, tabletop. A teal can tipped mid-pour:
//     handle arched over the top, a dark band riveted round the body, a
//     flat dark base, the spout reaching down-right to a fanned silver rose,
//     two sky-blue drops falling from it.
// ════════════════════════════════════════════════════════════════
const WATERING_CAN = (() => {
  const g = fromAscii(
    [
      '................',
      '................',
      '................',
      '....NNNN........',
      '...N....N.......',
      '..N.....N.......',
      '..NNNNNNNN......',
      '..NttnnnnN......',
      '..NtnnnnnNN.....',
      '..NNNNNNNNnN....',
      '..NtnnnnnN.nN7..',
      '..NnnnnnnNN.n76.',
      '..NNNNNNNNN..76.',
      '................',
      '..............s.',
      '.............s..',
    ],
    LEGEND,
  );
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 18. garden_gnome — 16x32, 1x1. A knee-high garden gnome (12px: hat,
//     face and beard, coat and boots — well under a 24px person) with a red
//     hat, white beard and blue coat, fishing: the rod rises out of his
//     right hand well above him and the line drops to a red-and-white
//     bobber (park him beside the koi pond). Back view: he faces away (back
//     of the hat, white hair, no beard or buckle), and the rod in his right
//     hand is now on the viewer's LEFT.
// ════════════════════════════════════════════════════════════════
/** Rod, line and bobber, for a gnome whose hand is at (10, 25). */
function fishingRod(g: Grid): void {
  line(g, 10, 24, 14, 6, (x, y) => put(g, x, y, 'T'));
  for (let y = 6; y <= 23; y++) put(g, 15, y, '6');
  put(g, 15, 24, 'r');
  put(g, 15, 25, '0');
}

const GNOME_FRONT = (() => {
  const g = blank(16, 32);
  fishingRod(g);
  stamp(g, 0, 19, [
    '.....K....',
    '....KrK...',
    '....KprK..',
    '...KprrrK.',
    '..KKKKKKKK',
    '...MxmmxM.',
    '..bMmppmMb',
    '.Zb000000m', // beard, hand on the rod
    '.Zsb0000bZ',
    '.ZxxxYxxxZ', // belt + gold buckle
    '..TWT.TWT.',
    '.SSSSSSSSS',
  ]);
  return compile(g);
})();

const GNOME_BACK = (() => {
  // drawn in the front view's layout (rod on the right, light from the
  // right) and then mirrored, so the rod lands on the viewer's left and the
  // light comes from the top-left again
  const g = blank(16, 32);
  fishingRod(g);
  stamp(g, 0, 19, [
    '.....K....',
    '....KrK...',
    '....KrpK..',
    '...KrrrpK.',
    '..KKKKKKKK',
    '...M0000M.', // white hair under the hat
    '..ZbbbbbsZ',
    '.ZbbbbbbsZm', // arm raised to the rod
    '.ZbbbbbbsZ',
    '.ZxxxxxxxZ', // belt, buckle hidden in front
    '..TWT.TWT.',
    '.SSSSSSSSS',
  ]);
  return mirrorSprite(compile(g));
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

export const SPRITES13: GeneratedSprite[] = [
  entry('cherry_tree', 'Cherry Blossom', 32, 64, 2, 2, CHERRY_TREE),
  entry('koi_pond', 'Koi Pond', 32, 32, 2, 2, KOI_POND),
  entry('pine_tree', 'Pine Tree', 16, 48, 1, 1, PINE_TREE),
  entry('fiddle_fig', 'Fiddle-Leaf Fig', 16, 48, 1, 1, FIDDLE_FIG),
  entry('monstera', 'Monstera (Stone Pot)', 16, 32, 1, 1, MONSTERA),
  entry('snake_plant', 'Snake Plant', 16, 32, 1, 1, SNAKE_PLANT),
  entry('bonsai', 'Bonsai', 16, 16, 1, 1, BONSAI),
  entry('succulent_trio', 'Succulents', 16, 16, 1, 1, SUCCULENT_TRIO),
  entry('watering_can', 'Watering Can', 16, 16, 1, 1, WATERING_CAN),
  entry('hanging_plant', 'Hanging Pothos', 16, 32, 1, 1, HANGING_PLANT),
  entry('green_wall', 'Living Wall', 32, 32, 2, 1, GREEN_WALL),
  entry('planter_box', 'Raised Planter', 32, 32, 2, 1, PLANTER_BOX, 'planter_box', 'front'),
  entry(
    'planter_box_right',
    'Raised Planter (Rotated)',
    16,
    48,
    1,
    2,
    PLANTER_BOX_RIGHT,
    'planter_box',
    'right',
  ),
  entry('hedge', 'Hedge', 32, 32, 2, 1, HEDGE, 'hedge', 'front'),
  entry('hedge_right', 'Hedge (Rotated)', 16, 48, 1, 2, HEDGE_RIGHT, 'hedge', 'right'),
  entry('picket_fence', 'Picket Fence', 32, 32, 2, 1, PICKET_FENCE, 'picket_fence', 'front'),
  entry(
    'picket_fence_right',
    'Picket Fence (Rotated)',
    16,
    48,
    1,
    2,
    PICKET_FENCE_RIGHT,
    'picket_fence',
    'right',
  ),
  entry('campfire', 'Campfire', 16, 32, 1, 1, CAMPFIRE),
  entry('stepping_stones', 'Stepping Stones', 16, 16, 1, 1, STEPPING_STONES),
  entry('mailbox', 'Mailbox', 16, 32, 1, 1, MAILBOX),
  entry('garden_gnome', 'Fishing Gnome', 16, 32, 1, 1, GNOME_FRONT, 'garden_gnome', 'front'),
  entry(
    'garden_gnome_back',
    'Fishing Gnome (Back)',
    16,
    32,
    1,
    1,
    GNOME_BACK,
    'garden_gnome',
    'back',
  ),
];

validateSprites(SPRITES13);

export const META13: Record<string, CatalogMeta> = {
  cherry_tree: { category: 'decor' },
  koi_pond: { category: 'decor' },
  pine_tree: { category: 'decor' },
  fiddle_fig: { category: 'decor' },
  monstera: { category: 'decor' },
  snake_plant: { category: 'decor' },
  bonsai: { category: 'decor', canPlaceOnSurfaces: true },
  succulent_trio: { category: 'decor', canPlaceOnSurfaces: true },
  watering_can: { category: 'decor', canPlaceOnSurfaces: true },
  hanging_plant: { category: 'wall', canPlaceOnWalls: true },
  green_wall: { category: 'wall', canPlaceOnWalls: true },
  planter_box: { category: 'decor' },
  planter_box_right: { category: 'decor' },
  hedge: { category: 'decor' },
  hedge_right: { category: 'decor' },
  picket_fence: { category: 'decor' },
  picket_fence_right: { category: 'decor' },
  campfire: { category: 'decor' },
  stepping_stones: { category: 'decor', backgroundTiles: 1 },
  mailbox: { category: 'decor' },
  garden_gnome: { category: 'decor' },
  garden_gnome_back: { category: 'decor' },
};
