/**
 * sprites8.ts — Batch 8: campus exterior (7 pieces, 12 entries).
 *
 * User layouts already paint grass around the offices with nothing to put
 * on it. This batch fills the outdoors: a tree, a bush, a park bench (a
 * seat — its tiles become seats like the couch), a stone fountain, a lamp
 * post, a picnic table and a flower bed.
 *
 * Same conventions as batches 6/7: variants share a groupId with their
 * front sprite (front carries groupId + orientation 'front' whenever a
 * piece has other orientations), left views are programmatic mirrors of
 * right views, house palette only, light from top-left, darker-material
 * outlines. Tall pieces keep the 16px overhang above their footprint.
 */

import {
  CLAY,
  CLAY_DARK,
  GOLD,
  GOLD_LIGHT,
  GREEN_LIGHT,
  ICE,
  INK,
  IRON,
  IRON_DARK,
  LAMP_WARM,
  LEAF,
  LEAF_DARK,
  ORANGE,
  PAPER,
  RED,
  SKY,
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

/** Repeat a char n times (readability helper for long rows). */
function rep(ch: string, n: number): string {
  return ch.repeat(n);
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

const compile = (g: string[][], legend: Legend) =>
  fromAscii(
    g.map((r) => r.join('')),
    legend,
  );

// ════════════════════════════════════════════════════════════════
// 1. tree — round canopy over a short trunk, 16x48, 1x1. Canopy is an
//    ellipse with a dark-leaf outline, a light cap on the top-left and a
//    few dark clumps for texture; trunk lit on the left; a leaf-dark
//    ground shadow so it sits on the grass.
// ════════════════════════════════════════════════════════════════
const TREE = (() => {
  const g = blank(16, 48);
  for (let y = 0; y <= 30; y++) {
    for (let x = 0; x < 16; x++) {
      const d = ellipse(x, y, 7.5, 15.5, 7.5, 15);
      if (d > 1) continue;
      if (d > 0.8) g[y][x] = 'D';
      else if (d < 0.6 && (x - 7.5) / 7.5 + (y - 15.5) / 15 < -0.75) g[y][x] = 'h';
      else g[y][x] = 'L';
    }
  }
  // dark leaf clumps
  for (const [y, x] of [
    [8, 9],
    [9, 9],
    [9, 10],
    [13, 4],
    [14, 4],
    [14, 5],
    [19, 10],
    [20, 10],
    [20, 11],
    [23, 6],
    [24, 6],
  ]) {
    g[y][x] = 'D';
  }
  // trunk rows 29-43 (starts inside the canopy so the join is hidden)
  for (let y = 29; y <= 43; y++) {
    g[y][6] = 'W';
    g[y][7] = 'T';
    g[y][8] = 'T';
    g[y][9] = 'S';
  }
  // root flare
  g[43][5] = 'T';
  g[43][10] = 'S';
  // ground shadow
  for (let x = 3; x <= 12; x++) g[44][x] = 'D';
  for (let x = 5; x <= 10; x++) g[45][x] = 'D';
  return compile(g, {
    D: LEAF_DARK,
    L: LEAF,
    h: GREEN_LIGHT,
    W: WOOD,
    T: WOOD_DARK,
    S: WOOD_SHADOW,
  });
})();

// ════════════════════════════════════════════════════════════════
// 2. bush — low leafy blob, 16x16, 1x1. Ellipse with a dark outline,
//    two light highlights top-left, a dark clump, ground shadow line.
// ════════════════════════════════════════════════════════════════
const BUSH = (() => {
  const g = blank(16, 16);
  for (let y = 3; y <= 14; y++) {
    for (let x = 0; x < 16; x++) {
      const d = ellipse(x, y, 7.5, 8.5, 7.5, 5.5);
      if (d > 1) continue;
      g[y][x] = d > 0.72 ? 'D' : 'L';
    }
  }
  for (const [y, x] of [
    [5, 4],
    [5, 5],
    [6, 3],
    [7, 8],
  ]) {
    g[y][x] = 'h';
  }
  for (const [y, x] of [
    [9, 10],
    [10, 10],
    [10, 11],
    [11, 5],
  ]) {
    g[y][x] = 'D';
  }
  for (let x = 3; x <= 12; x++) g[15][x] = 'D';
  return compile(g, { D: LEAF_DARK, L: LEAF, h: GREEN_LIGHT });
})();

// ════════════════════════════════════════════════════════════════
// 3. bench — slatted park bench, 32x32, 2x1, a seat (chairs category).
//    Two backrest slats, two seat slats, iron arm posts and legs. Front =
//    backrest at the top (seat faces the viewer); back = backrest in
//    front of the seat; right = backrest down the left column (1x2,
//    16x48, like COUCH_RIGHT); left is the mirror.
// ════════════════════════════════════════════════════════════════
const BENCH_LEGEND: Legend = {
  D: WOOD_DARK,
  L: WOOD_LIGHT,
  W: WOOD,
  S: WOOD_SURFACE,
  k: IRON_DARK,
};

const BENCH = (() => {
  const rows: string[] = [];
  for (let r = 0; r < 11; r++) rows.push(rep('.', 32));
  const slat = (post: boolean) => {
    const p = post ? 'k' : '.';
    rows.push('.' + p + rep('D', 28) + p + '.');
    rows.push('.' + p + 'D' + rep('L', 26) + 'D' + p + '.');
    rows.push('.' + p + 'D' + rep('W', 26) + 'D' + p + '.');
    rows.push('.' + p + rep('D', 28) + p + '.');
  };
  slat(false); // r11-14 top backrest slat
  rows.push('.k' + rep('.', 28) + 'k.'); // r15 gap shows the arm posts
  slat(true); // r16-19 lower backrest slat
  rows.push('.k' + rep('.', 28) + 'k.'); // r20
  slat(true); // r21-24 seat slat
  rows.push('..D' + rep('W', 26) + 'D..'); // r25 seat front slat
  rows.push('..' + rep('D', 28) + '..'); // r26
  for (let r = 27; r <= 30; r++) rows.push('...kk' + rep('.', 22) + 'kk...'); // legs
  rows.push(rep('.', 32));
  return fromAscii(rows, BENCH_LEGEND);
})();

const BENCH_BACK = (() => {
  const rows: string[] = [];
  for (let r = 0; r < 12; r++) rows.push(rep('.', 32));
  rows.push('..' + rep('D', 28) + '..'); // r12 seat sliver behind the backrest
  rows.push('..D' + rep('W', 26) + 'D..');
  rows.push('..D' + rep('W', 26) + 'D..');
  const slat = () => {
    rows.push('.k' + rep('D', 28) + 'k.');
    rows.push('.kD' + rep('L', 26) + 'Dk.');
    rows.push('.kD' + rep('W', 26) + 'Dk.');
    rows.push('.k' + rep('D', 28) + 'k.');
  };
  slat(); // r15-18
  rows.push('.k' + rep('.', 28) + 'k.'); // r19
  slat(); // r20-23
  rows.push('.k' + rep('.', 28) + 'k.'); // r24
  for (let r = 25; r <= 29; r++) rows.push('...kk' + rep('.', 22) + 'kk...');
  rows.push(rep('.', 32));
  rows.push(rep('.', 32));
  return fromAscii(rows, BENCH_LEGEND);
})();

const BENCH_RIGHT = (() => {
  const g = blank(16, 48);
  // One outlined body, rows 10-45, cols 1-14 — drawn as a single frame so the
  // backrest reads as part of the bench instead of a separate post. Arms are
  // the full-width bands at each end (rows 10-14 / 41-45); between them the
  // backrest is the narrow band on the left (cols 1-4) and the seat is the
  // wider one on the right, split by a slat line.
  for (let y = 10; y <= 45; y++) {
    for (let x = 1; x <= 14; x++) {
      const border = y === 10 || y === 45 || x === 1 || x === 14;
      const armEdge = y === 14 || y === 41;
      const backrestEdge = x === 5;
      const slatLine = x === 10 && y > 14 && y < 41;
      if (border || armEdge || backrestEdge || slatLine) {
        g[y][x] = 'D';
        continue;
      }
      // Seat boards are the lighter WOOD_SURFACE and the backrest stays WOOD,
      // so the two bands separate at a glance instead of reading as one panel.
      const seat = x > 5 && y > 14 && y < 41;
      if (y === 11 || x === 2 || x === 6) {
        g[y][x] = 'L'; // light from top-left
      } else {
        g[y][x] = seat ? 'S' : 'W';
      }
    }
  }
  // iron legs under both arms
  for (let y = 46; y <= 47; y++) {
    for (const x of [3, 4, 11, 12]) g[y][x] = 'k';
  }
  return compile(g, BENCH_LEGEND);
})();

// ════════════════════════════════════════════════════════════════
// 4. fountain — round stone basin with a centre spout, 32x48, 2x2.
//    Elliptical clay rim (dark outline, lit top-left), sky water with
//    ice ripples, a clay pedestal carrying a small upper bowl, and ice
//    spray arcs above it. Footprint is the bottom 32 rows.
// ════════════════════════════════════════════════════════════════
const FOUNTAIN = (() => {
  const g = blank(32, 48);
  for (let y = 22; y <= 46; y++) {
    for (let x = 0; x < 32; x++) {
      const d = ellipse(x, y, 15.5, 34, 15.5, 12);
      if (d > 1) continue;
      if (d > 0.88) g[y][x] = 'Q';
      else if (d > 0.66) g[y][x] = (x - 15.5) / 15.5 + (y - 34) / 12 < -0.6 ? 'c' : 'C';
      else g[y][x] = 'S';
    }
  }
  // stone face under the rim (the basin has height)
  for (let x = 2; x <= 29; x++) {
    if (g[46][x] === 'Q' || g[45][x] === 'Q') {
      if (g[46][x] === '.') g[46][x] = 'Q';
      if (g[47][x] === '.' && x >= 4 && x <= 27) g[47][x] = 'Q';
    }
  }
  // ripples
  for (const [y, x] of [
    [28, 6],
    [28, 7],
    [31, 24],
    [31, 25],
    [37, 8],
    [37, 9],
    [39, 21],
    [39, 22],
  ]) {
    g[y][x] = 'I';
  }
  // pedestal cols 14-17 rows 22-33, upper bowl rows 18-21 cols 11-20
  for (let y = 22; y <= 33; y++) {
    g[y][13] = 'Q';
    g[y][14] = 'c';
    g[y][15] = 'C';
    g[y][16] = 'C';
    g[y][17] = 'Q';
  }
  for (let x = 11; x <= 20; x++) {
    g[18][x] = 'Q';
    g[21][x] = 'Q';
  }
  for (let y = 19; y <= 20; y++) {
    g[y][10] = 'Q';
    g[y][21] = 'Q';
    for (let x = 11; x <= 20; x++) g[y][x] = y === 19 ? 'S' : 'C';
  }
  // water column + spray
  for (let y = 12; y <= 17; y++) {
    g[y][15] = 'I';
    g[y][16] = 'S';
  }
  for (const [y, x] of [
    [11, 15],
    [11, 16],
    [12, 13],
    [13, 12],
    [14, 11],
    [15, 10],
    [12, 18],
    [13, 19],
    [14, 20],
    [15, 21],
    [16, 9],
    [16, 22],
  ]) {
    g[y][x] = 'I';
  }
  return compile(g, { Q: CLAY_DARK, C: CLAY, c: ORANGE, S: SKY, I: ICE });
})();

// ════════════════════════════════════════════════════════════════
// 5. lamp_post — tall iron post with a warm lantern, 16x48, 1x1.
//    Ink-outlined lantern with a gold-light core, iron post lit on the
//    left, a stepped base.
// ════════════════════════════════════════════════════════════════
const LAMP_POST = (() => {
  const rows: string[] = [];
  rows.push(rep('.', 16)); // r0
  rows.push('.......oo.......'); // r1 finial
  rows.push('.....oooooo.....'); // r2 cap
  rows.push('....o' + rep('w', 6) + 'o....'); // r3
  for (let r = 4; r <= 6; r++) rows.push('....o' + 'w' + rep('g', 4) + 'w' + 'o....');
  rows.push('....o' + rep('w', 6) + 'o....'); // r7
  rows.push('.....oooooo.....'); // r8
  rows.push('.......oo.......'); // r9 neck
  for (let r = 10; r <= 42; r++) rows.push('.......ik.......'); // post
  rows.push('......kkkk......'); // r43-44 base
  rows.push('......kkkk......');
  rows.push('.....kkkkkk.....'); // r45
  rows.push('....kkkkkkkk....'); // r46
  rows.push(rep('.', 16)); // r47
  return fromAscii(rows, { o: INK, w: LAMP_WARM, g: GOLD_LIGHT, i: IRON, k: IRON_DARK });
})();

// ════════════════════════════════════════════════════════════════
// 6. picnic_table — table slab with a bench strip on each long side,
//    48x32, 3x2 (front) / 32x48, 2x3 (right). Top-down wood in the desk
//    language (wood outline, lit strip, surface, plank line, dark leg
//    stubs); benches are narrower strips separated by a 1px gap.
// ════════════════════════════════════════════════════════════════
const PICNIC_LEGEND: Legend = { e: WOOD, l: WOOD_LIGHT, s: WOOD_SURFACE, d: WOOD_DARK };

const PICNIC_TABLE = (() => {
  const rows: string[] = [];
  const bench = () => {
    rows.push('...' + rep('e', 42) + '...');
    rows.push('...e' + rep('l', 40) + 'e...');
    rows.push('...e' + rep('s', 40) + 'e...');
    rows.push('...e' + rep('s', 40) + 'e...');
    rows.push('...' + rep('e', 42) + '...');
  };
  rows.push(rep('.', 48)); // r0
  bench(); // r1-5
  rows.push(rep('.', 48)); // r6 gap
  rows.push('.' + rep('e', 46) + '.'); // r7
  rows.push('.e' + rep('l', 44) + 'e.'); // r8
  for (let r = 9; r <= 20; r++) {
    rows.push(r === 14 ? '.e' + rep('l', 44) + 'e.' : '.el' + rep('s', 43) + 'e.');
  }
  rows.push('.' + rep('e', 46) + '.'); // r21
  rows.push(rep('.', 48)); // r22 gap
  bench(); // r23-27
  for (let r = 28; r <= 30; r++) rows.push('...dd' + rep('.', 38) + 'dd...'); // r28-30 stubs
  rows.push(rep('.', 48)); // r31
  return fromAscii(rows, PICNIC_LEGEND);
})();

const PICNIC_TABLE_RIGHT = (() => {
  const g = blank(32, 48);
  const box = (x0: number, x1: number, y0: number, y1: number, plank: number | null) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1;
        if (edge) g[y][x] = 'e';
        else if (y === y0 + 1 || x === x0 + 1 || x === plank) g[y][x] = 'l';
        else g[y][x] = 's';
      }
    }
  };
  box(1, 5, 3, 40, null); // left bench
  box(26, 30, 3, 40, null); // right bench
  box(7, 24, 1, 42, 15); // table with a lengthwise plank line
  for (let y = 41; y <= 43; y++) for (const x of [2, 3, 28, 29]) g[y][x] = 'd'; // bench stubs
  for (let y = 43; y <= 45; y++) for (const x of [8, 9, 22, 23]) g[y][x] = 'd'; // table stubs
  return compile(g, PICNIC_LEGEND);
})();

// ════════════════════════════════════════════════════════════════
// 7. flower_bed — flat planter, 32x16, 2x1 (front) / 16x32, 1x2 (right).
//    Clay-dark border with a lit clay inner edge, leaf fill with dark
//    leaf texture and a lattice of red/gold/orange/sky flowers.
// ════════════════════════════════════════════════════════════════
function flowerBed(w: number, h: number): string[][] {
  const g = blank(w, h);
  // soil bed: clay border, lit inner edge, leaf fill (a calm base — the
  // previous diagonal speckle competed with the flowers and won)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const edge = y === 1 || y === h - 2 || x === 0 || x === w - 1;
      if (edge) {
        g[y][x] = 'Q';
        continue;
      }
      g[y][x] = y === 2 || x === 1 ? 'C' : 'L';
    }
  }
  // flowers: 3x3 plus shapes (a 1px dot vanishes at this scale), petals in
  // four house colors with a pale center, staggered row to row
  const petals = ['R', 'G', 'O', 'S'];
  let k = 0;
  const flower = (cx: number, cy: number, petal: string) => {
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ]) {
      const x = cx + dx;
      const y = cy + dy;
      if (g[y]?.[x] === 'L') g[y][x] = petal;
    }
    if (g[cy]?.[cx] === 'L') g[cy][cx] = 'P';
  };
  let row = 0;
  for (let cy = 5; cy <= h - 5; cy += 5, row++) {
    for (let cx = 4 + (row % 2) * 3; cx <= w - 5; cx += 6) {
      flower(cx, cy, petals[k++ % petals.length]);
    }
  }
  return compile(g, {
    Q: CLAY_DARK,
    C: CLAY,
    L: LEAF,
    D: LEAF_DARK,
    R: RED,
    G: GOLD,
    O: ORANGE,
    S: SKY,
    P: PAPER,
  });
}

const FLOWER_BED = flowerBed(32, 16);
const FLOWER_BED_RIGHT = flowerBed(16, 32);

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

export const SPRITES8: GeneratedSprite[] = [
  entry('tree', 'Tree', 16, 48, 1, 1, TREE),
  entry('bush', 'Bush', 16, 16, 1, 1, BUSH),
  entry('bench', 'Park Bench', 32, 32, 2, 1, BENCH, 'bench', 'front'),
  entry('bench_right', 'Park Bench (Right)', 16, 48, 1, 2, BENCH_RIGHT, 'bench', 'right'),
  entry('bench_back', 'Park Bench (Back)', 32, 32, 2, 1, BENCH_BACK, 'bench', 'back'),
  entry(
    'bench_left',
    'Park Bench (Left)',
    16,
    48,
    1,
    2,
    mirrorSprite(BENCH_RIGHT),
    'bench',
    'left',
  ),
  entry('fountain', 'Fountain', 32, 48, 2, 2, FOUNTAIN),
  entry('lamp_post', 'Lamp Post', 16, 48, 1, 1, LAMP_POST),
  entry('picnic_table', 'Picnic Table', 48, 32, 3, 2, PICNIC_TABLE, 'picnic_table', 'front'),
  entry(
    'picnic_table_right',
    'Picnic Table (Rotated)',
    32,
    48,
    2,
    3,
    PICNIC_TABLE_RIGHT,
    'picnic_table',
    'right',
  ),
  entry('flower_bed', 'Flower Bed', 32, 16, 2, 1, FLOWER_BED, 'flower_bed', 'front'),
  entry(
    'flower_bed_right',
    'Flower Bed (Rotated)',
    16,
    32,
    1,
    2,
    FLOWER_BED_RIGHT,
    'flower_bed',
    'right',
  ),
];

validateSprites(SPRITES8);
