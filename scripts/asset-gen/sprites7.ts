/**
 * sprites7.ts — Batch 7: office essentials + lounge (12 pieces, 32 entries).
 *
 * What you couldn't build before: a plain single desk (the smallest desk
 * was the standing one), a single monitor and a laptop for it, a wooden
 * chair, a meeting table for sub-agents to gather around, a beanbag, a
 * partition screen, a short bookshelf, a full-size fridge, and three wall
 * pieces (shelf, neon sign, calendar).
 *
 * Every multi-tile piece ships with the orientations whose footprint
 * differs, using the batch-6 `slab()` generator for top-down wood. Left
 * views are programmatic mirrors of right views. House palette only,
 * light from top-left, darker-material outlines.
 */

import {
  BLUE,
  CLAY,
  CLAY_DARK,
  GOLD_DARK,
  GREEN,
  ICE,
  INK,
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
  SLATE,
  STEEL_DARK,
  STEEL_LIGHT,
  WOOD,
  WOOD_DARK,
  WOOD_LIGHT,
  WOOD_SURFACE,
} from './palette.ts';
import type { GeneratedSprite } from './sprites.ts';
import { validateSprites } from './sprites.ts';
import { mirrorSprite, slab } from './sprites6.ts';

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

// ════════════════════════════════════════════════════════════════
// 1. desk_single — plain two-tile desk, 32x16, 2x1, isDesk. Top-down
//    wood slab with the DESK_L plank line; the drawer pedestal shows as
//    a darker drawer-front stripe at the right end. Right/left turn it
//    upright (1x2); back is the mirror (pedestal on the left).
// ════════════════════════════════════════════════════════════════
const drawerStripe = (cols: number[], rows: number[]) => (grid: string[][]) => {
  for (const y of rows) for (const x of cols) if (grid[y][x] === 's') grid[y][x] = 'd';
};

const DESK_SINGLE = slab(
  2,
  1,
  [
    { c: 0, r: 0 },
    { c: 1, r: 0 },
  ],
  { grain: true, detail: drawerStripe([26, 27, 28], [4, 5, 6, 10, 11, 12]) },
);

const DESK_SINGLE_RIGHT = slab(
  1,
  2,
  [
    { c: 0, r: 0 },
    { c: 0, r: 1 },
  ],
  { detail: drawerStripe([4, 5, 6, 10, 11, 12], [22, 23, 24]) },
);

// ════════════════════════════════════════════════════════════════
// 2. monitor_single — one monitor on a stand, 16x16, 1x1, surface.
//    Same language as MONITOR_DUAL (steel frame, bezel, sky glow,
//    blue screen, iron stand). Back = dark panel with a logo dot;
//    right = edge-on profile like MONITOR_DUAL_RIGHT.
// ════════════════════════════════════════════════════════════════
const MONITOR_LEGEND: Legend = {
  f: STEEL_DARK,
  z: SCREEN_SHADOW,
  l: SKY,
  c: SCREEN_BLUE,
  d: IRON,
  k: IRON_DARK,
};

const MONITOR_SINGLE = fromAscii(
  [
    '................',
    '..ffffffffffff..',
    '..fzzzzzzzzzzf..',
    '..fzllllllllzf..',
    '..fzlccccccczf..',
    '..fzcccccccczf..',
    '..fzcccccccczf..',
    '..fzcccccccczf..',
    '..fzzzzzzzzzzf..',
    '..ffffffffffff..',
    '.......dd.......',
    '.......dd.......',
    '....dddddddd....',
    '................',
    '................',
    '................',
  ],
  MONITOR_LEGEND,
);

const MONITOR_SINGLE_BACK = fromAscii(
  [
    '................',
    '..ffffffffffff..',
    '..fkkkkkkkkkkf..',
    '..fkkkkkkkkkkf..',
    '..fkkkkkkkkkkf..',
    '..fkkkkddkkkkf..',
    '..fkkkkkkkkkkf..',
    '..fkkkkkkkkkkf..',
    '..fkkkkkkkkkkf..',
    '..ffffffffffff..',
    '.......dd.......',
    '.......dd.......',
    '....dddddddd....',
    '................',
    '................',
    '................',
  ],
  MONITOR_LEGEND,
);

const MONITOR_SINGLE_RIGHT = fromAscii(
  [
    '................',
    '.......ffzc.....',
    '.......ffzc.....',
    '.......ffzc.....',
    '.......ffzc.....',
    '.......ffzc.....',
    '.......ffzc.....',
    '.......ffzc.....',
    '.......ffzc.....',
    '.......ffzc.....',
    '........dd......',
    '........dd......',
    '.....dddddddd...',
    '................',
    '................',
    '................',
  ],
  MONITOR_LEGEND,
);

// ════════════════════════════════════════════════════════════════
// 3. laptop — open laptop, 16x16, 1x1, surface. Front = screen facing
//    the viewer over a keyboard base (key dots); back = the lid with a
//    logo dot and a sliver of base.
// ════════════════════════════════════════════════════════════════
const LAPTOP = fromAscii(
  [
    '................',
    '................',
    '...ffffffffff...',
    '...fzzzzzzzzf...',
    '...fzlccccczf...',
    '...fzcccccczf...',
    '...fzcccccczf...',
    '...fzzzzzzzzf...',
    '...ffffffffff...',
    '..kkkkkkkkkkkk..',
    '..kddddddddddk..',
    '..kdkdkdkdkdkk..',
    '..kddddddddddk..',
    '..kkkkkkkkkkkk..',
    '................',
    '................',
  ],
  MONITOR_LEGEND,
);

const LAPTOP_BACK = fromAscii(
  [
    '................',
    '................',
    '...ffffffffff...',
    '...fkkkkkkkkf...',
    '...fkkkkkkkkf...',
    '...fkkkddkkkf...',
    '...fkkkkkkkkf...',
    '...fkkkkkkkkf...',
    '...ffffffffff...',
    '..kkkkkkkkkkkk..',
    '..kkkkkkkkkkkk..',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  MONITOR_LEGEND,
);

// ════════════════════════════════════════════════════════════════
// 4. chair_wood — slat-back wooden chair, 16x32, 1x1, 4 orientations.
//    Dark-wood outline, lit top edges, three slats, four legs (only the
//    front pair shows). Right view = backrest post on the left, seat
//    extending right; left is the mirror.
// ════════════════════════════════════════════════════════════════
const CHAIR_LEGEND: Legend = { e: WOOD_DARK, w: WOOD, l: WOOD_LIGHT };

const CHAIR_WOOD = (() => {
  const rows: string[] = [];
  for (let r = 0; r < 7; r++) rows.push(rep('.', 16));
  rows.push('....eeeeeeee....'); // r7
  rows.push('...e' + rep('l', 8) + 'e...'); // r8 lit top
  for (let r = 9; r <= 16; r++) rows.push('...ewwewwewwe...'); // slats
  rows.push('...eeeeeeeeee...'); // r17
  rows.push('..e' + rep('l', 10) + 'e..'); // r18 seat lit
  for (let r = 19; r <= 21; r++) rows.push('..e' + rep('w', 10) + 'e..');
  rows.push('..' + rep('e', 12) + '..'); // r22
  for (let r = 23; r <= 28; r++) rows.push('..ee........ee..'); // legs
  for (let r = 29; r < 32; r++) rows.push(rep('.', 16));
  return fromAscii(rows, CHAIR_LEGEND);
})();

const CHAIR_WOOD_BACK = (() => {
  const rows: string[] = [];
  for (let r = 0; r < 7; r++) rows.push(rep('.', 16));
  rows.push('....eeeeeeee....'); // r7
  rows.push('...e' + rep('l', 8) + 'e...'); // r8
  for (let r = 9; r <= 16; r++) rows.push('...ewwewwewwe...');
  rows.push('...eeeeeeeeee...'); // r17
  rows.push('..e' + rep('w', 10) + 'e..'); // r18 seat sliver
  rows.push('..' + rep('e', 12) + '..'); // r19
  for (let r = 20; r <= 27; r++) rows.push('..ee........ee..');
  for (let r = 28; r < 32; r++) rows.push(rep('.', 16));
  return fromAscii(rows, CHAIR_LEGEND);
})();

const CHAIR_WOOD_RIGHT = (() => {
  const rows: string[] = [];
  for (let r = 0; r < 7; r++) rows.push(rep('.', 16));
  rows.push('....eee.........'); // r7 post top
  rows.push('....ele.........'); // r8
  for (let r = 9; r <= 16; r++) rows.push('....ewe.........');
  rows.push('....eeeeeeeeee..'); // r17 seat edge
  rows.push('....e' + rep('l', 8) + 'e..'); // r18
  for (let r = 19; r <= 21; r++) rows.push('....e' + rep('w', 8) + 'e..');
  rows.push('....' + rep('e', 10) + '..'); // r22
  for (let r = 23; r <= 28; r++) rows.push('....ee......ee..');
  for (let r = 29; r < 32; r++) rows.push(rep('.', 16));
  return fromAscii(rows, CHAIR_LEGEND);
})();

// ════════════════════════════════════════════════════════════════
// 5. meeting_table — six-tile table, 48x32, 3x2, isDesk. Top-down slab
//    with rounded corners and a lit inset ring (a table runner), so it
//    reads as one big table rather than a desk. Right = 2x3.
// ════════════════════════════════════════════════════════════════
const runner =
  (x0: number, x1: number, y0: number, y1: number) =>
  (grid: string[][], inside: (x: number, y: number) => boolean) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const onRing = x === x0 || x === x1 || y === y0 || y === y1;
        if (onRing && inside(x, y) && grid[y][x] === 's') grid[y][x] = 'l';
      }
    }
    // rounded corners: knock out the outline's corner pixels
    for (const [y, x] of [
      [1, 1],
      [1, grid[0].length - 2],
    ]) {
      if (grid[y][x] === 'e') grid[y][x] = '.';
    }
    for (let y = grid.length - 1; y >= 0; y--) {
      if (grid[y][1] === 'e' && grid[y][2] === 'e') {
        grid[y][1] = '.';
        grid[y][grid[0].length - 2] = '.';
        break;
      }
    }
  };

const MEETING_TABLE = slab(
  3,
  2,
  [
    { c: 0, r: 0 },
    { c: 1, r: 0 },
    { c: 2, r: 0 },
    { c: 0, r: 1 },
    { c: 1, r: 1 },
    { c: 2, r: 1 },
  ],
  { detail: runner(5, 42, 5, 22) },
);

const MEETING_TABLE_RIGHT = slab(
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
  { detail: runner(5, 26, 5, 35) },
);

// ════════════════════════════════════════════════════════════════
// 6. beanbag — squashy clay-red beanbag, 16x16, 1x1, a seat. Front has
//    the sitting dent and a top-left highlight; back is the plain blob
//    with a seam.
// ════════════════════════════════════════════════════════════════
const BEANBAG_LEGEND: Legend = { R: CLAY_DARK, r: CLAY, h: ORANGE, s: INK };

const BEANBAG = fromAscii(
  [
    '................',
    '................',
    '................',
    '.....RRRRRR.....',
    '...RRhhrrrrRR...',
    '..RhrrrrrrrrrR..',
    '..RrrrRRRRrrrR..',
    '.RrrrRrrrrRrrrR.',
    '.RrrrRrrrrRrrrR.',
    '.RrrrrRRRRrrrrR.',
    '.RRrrrrrrrrrrRR.',
    '..RRrrrrrrrrRR..',
    '...RRRRRRRRRR...',
    '....ssssssss....',
    '................',
    '................',
  ],
  BEANBAG_LEGEND,
);

const BEANBAG_BACK = fromAscii(
  [
    '................',
    '................',
    '................',
    '.....RRRRRR.....',
    '...RRhhrrrrRR...',
    '..RhrrrrRrrrrR..',
    '..RrrrrrRrrrrR..',
    '.RrrrrrrRrrrrrR.',
    '.RrrrrrrRrrrrrR.',
    '.RrrrrrrRrrrrrR.',
    '.RRrrrrrRrrrrRR.',
    '..RRrrrrrrrrRR..',
    '...RRRRRRRRRR...',
    '....ssssssss....',
    '................',
    '................',
  ],
  BEANBAG_LEGEND,
);

// ════════════════════════════════════════════════════════════════
// 7. partition — fabric office divider on a steel frame, 16x32, 1x1.
//    Front = the slate panel with a lit top band and a mid seam; right
//    = edge-on (a 2px post) with the same feet. Left is the mirror.
// ════════════════════════════════════════════════════════════════
const PARTITION_LEGEND: Legend = { f: STEEL_DARK, p: SLATE, q: SILVER, k: IRON_DARK };

const PARTITION = (() => {
  const rows: string[] = [];
  rows.push(rep('.', 16)); // r0
  rows.push('.ffffffffffffff.'); // r1
  rows.push('.f' + rep('q', 12) + 'f.'); // r2 lit band
  for (let r = 3; r <= 24; r++)
    rows.push(r === 13 ? '.ffffffffffffff.' : '.f' + rep('p', 12) + 'f.');
  rows.push('.ffffffffffffff.'); // r25
  rows.push('.......kk.......'); // r26-27 post
  rows.push('.......kk.......');
  rows.push('....kkkkkkkk....'); // r28 feet
  for (let r = 29; r < 32; r++) rows.push(rep('.', 16));
  return fromAscii(rows, PARTITION_LEGEND);
})();

const PARTITION_RIGHT = (() => {
  const rows: string[] = [];
  rows.push(rep('.', 16));
  rows.push('.......ff.......'); // r1
  rows.push('.......qf.......'); // r2
  for (let r = 3; r <= 24; r++) rows.push('.......pf.......');
  rows.push('.......ff.......'); // r25
  rows.push('.......kk.......');
  rows.push('.......kk.......');
  rows.push('......kkkk......'); // r28 feet
  for (let r = 29; r < 32; r++) rows.push(rep('.', 16));
  return fromAscii(rows, PARTITION_LEGEND);
})();

// ════════════════════════════════════════════════════════════════
// 8. bookshelf_short — two-shelf bookcase, 32x32, 2x1, storage. Same
//    language as BOOKSHELF_TALL, wider. Back = plank panel with plank
//    lines; right = the side panel turned upright (1x2, 16x48).
// ════════════════════════════════════════════════════════════════
const SHELF_LEGEND: Legend = {
  W: WOOD,
  D: WOOD_DARK,
  L: WOOD_LIGHT,
  R: RED,
  B: BLUE,
  G: GREEN,
  Y: GOLD_DARK,
  O: ORANGE,
  K: SKY,
};

const BOOKSHELF_SHORT = (() => {
  const rows: string[] = [];
  const shelf = (books: string) => {
    rows.push('W' + rep('D', 30) + 'W');
    for (let i = 0; i < 8; i++) rows.push('WD' + books + 'DW');
  };
  rows.push('.' + rep('W', 30) + '.'); // r0
  shelf('RRBBGGYYOORRKKBBYYGGRROOBBYYDD'.slice(0, 28));
  rows.push(rep('W', 32)); // r10
  shelf('BBYYKKRRGGBBOOYYRRKKGGBBRRYY');
  rows.push(rep('W', 32)); // r20
  for (let i = 0; i < 6; i++) rows.push('W' + rep('D', 30) + 'W'); // base
  rows.push('.' + rep('W', 30) + '.'); // r27
  rows.push('..DD' + rep('.', 24) + 'DD..'); // r28-29 feet
  rows.push('..DD' + rep('.', 24) + 'DD..');
  rows.push(rep('.', 32));
  rows.push(rep('.', 32));
  return fromAscii(rows, SHELF_LEGEND);
})();

const BOOKSHELF_SHORT_BACK = (() => {
  const rows: string[] = [];
  rows.push('.' + rep('W', 30) + '.'); // r0
  rows.push('W' + rep('L', 30) + 'W'); // r1 lit top
  for (let r = 2; r <= 26; r++) {
    const cells = rep('W', 30).split('');
    for (const c of [7, 15, 23]) cells[c] = 'D'; // plank lines
    rows.push('W' + cells.join('') + 'W');
  }
  rows.push('.' + rep('W', 30) + '.'); // r27
  rows.push('..DD' + rep('.', 24) + 'DD..');
  rows.push('..DD' + rep('.', 24) + 'DD..');
  rows.push(rep('.', 32));
  rows.push(rep('.', 32));
  return fromAscii(rows, SHELF_LEGEND);
})();

const BOOKSHELF_SHORT_RIGHT = (() => {
  const rows: string[] = [];
  rows.push(rep('.', 16)); // r0
  rows.push('.' + rep('W', 14) + '.'); // r1
  rows.push('W' + rep('L', 14) + 'W'); // r2 lit top
  for (let r = 3; r <= 42; r++) rows.push('WL' + rep('W', 5) + 'D' + rep('W', 7) + 'W'); // side panel + plank line
  rows.push('W' + rep('D', 14) + 'W'); // r43 base shadow
  rows.push('.' + rep('W', 14) + '.'); // r44
  rows.push('..DD........DD..'); // r45-46 feet
  rows.push('..DD........DD..');
  rows.push(rep('.', 16));
  return fromAscii(rows, SHELF_LEGEND);
})();

// ════════════════════════════════════════════════════════════════
// 9. fridge — full-height fridge, 16x48, 1x1, storage. Silver frame,
//    ice body with a lit left column, freezer door on top, long handle
//    on the main door. Right = plain side panel; left is the mirror.
// ════════════════════════════════════════════════════════════════
const FRIDGE_LEGEND: Legend = { s: SILVER, P: PAPER, I: ICE, k: IRON_DARK, q: STEEL_LIGHT };

const FRIDGE = (() => {
  const rows: string[] = [];
  rows.push(rep('.', 16)); // r0
  rows.push('.' + rep('s', 14) + '.'); // r1
  rows.push('s' + rep('P', 14) + 's'); // r2 lit top
  const door = (r: number, handle: boolean) =>
    's' + 'P' + rep('I', 10) + (handle ? 'k' : 'I') + rep('I', 2) + 's';
  for (let r = 3; r <= 15; r++) rows.push(door(r, r >= 8 && r <= 12)); // freezer
  rows.push(rep('s', 16)); // r16 seam
  for (let r = 17; r <= 42; r++) rows.push(door(r, r >= 21 && r <= 31)); // main door
  rows.push(rep('s', 16)); // r43
  rows.push('..ss........ss..'); // r44-45 feet
  rows.push('..ss........ss..');
  rows.push(rep('.', 16));
  rows.push(rep('.', 16));
  return fromAscii(rows, FRIDGE_LEGEND);
})();

const FRIDGE_RIGHT = (() => {
  const rows: string[] = [];
  rows.push(rep('.', 16));
  rows.push('.' + rep('s', 14) + '.');
  rows.push('s' + rep('P', 14) + 's');
  for (let r = 3; r <= 42; r++) rows.push('sP' + rep('I', 11) + 'q' + 'Is');
  rows.push(rep('s', 16));
  rows.push('..ss........ss..');
  rows.push('..ss........ss..');
  rows.push(rep('.', 16));
  rows.push(rep('.', 16));
  return fromAscii(rows, FRIDGE_LEGEND);
})();

// ════════════════════════════════════════════════════════════════
// 10. wall_shelf — wall-mounted plank with a plant, a stack of books
//     and a mug, 32x32, 2x1 wall item (bottom row on the wall row, like
//     WHITEBOARD).
// ════════════════════════════════════════════════════════════════
const WALL_SHELF = (() => {
  const g = blank(32, 32);
  const set = (r: number, c: number, ch: string) => {
    g[r][c] = ch;
  };
  // plank rows 18-20, brackets 21-24
  for (let c = 1; c <= 30; c++) {
    set(18, c, 'L');
    set(19, c, 'W');
    set(20, c, 'D');
  }
  for (const c of [3, 4, 27, 28]) for (let r = 21; r <= 24; r++) set(r, c, 'D');
  // plant: pot cols 3-7 rows 14-17, leaves rows 9-13
  for (let c = 3; c <= 7; c++) {
    set(14, c, 'C');
    set(17, c, 'Q');
  }
  for (let r = 15; r <= 16; r++) {
    set(r, 3, 'Q');
    for (let c = 4; c <= 6; c++) set(r, c, 'C');
    set(r, 7, 'Q');
  }
  const leaves: Array<[number, number]> = [
    [13, 4],
    [13, 5],
    [13, 6],
    [12, 3],
    [12, 5],
    [12, 7],
    [11, 4],
    [11, 6],
    [10, 5],
    [10, 3],
    [9, 4],
  ];
  for (const [r, c] of leaves) set(r, c, r % 2 === 0 ? 'g' : 'G');
  // book stack cols 11-19 rows 12-17 (three horizontal books)
  const spines = ['R', 'B', 'Y'];
  for (let i = 0; i < 3; i++) {
    const r0 = 12 + i * 2;
    for (let c = 11 + i; c <= 19 + i; c++) {
      set(r0, c, spines[i]);
      set(r0 + 1, c, spines[i]);
    }
    set(r0, 11 + i, 'k');
    set(r0 + 1, 11 + i, 'k');
  }
  // mug cols 23-27 rows 12-17 with a handle
  for (let r = 12; r <= 17; r++) {
    set(r, 23, 'k');
    set(r, 26, 'k');
    for (let c = 24; c <= 25; c++) set(r, c, r === 12 ? 'k' : 'I');
  }
  set(14, 27, 'k');
  set(15, 27, 'k');
  set(17, 24, 'k');
  set(17, 25, 'k');
  return fromAscii(
    g.map((r) => r.join('')),
    {
      L: WOOD_LIGHT,
      W: WOOD,
      D: WOOD_DARK,
      C: CLAY,
      Q: CLAY_DARK,
      g: LEAF,
      G: LEAF_DARK,
      R: RED,
      B: BLUE,
      Y: GOLD_DARK,
      k: IRON_DARK,
      I: ICE,
    },
  );
})();

// ════════════════════════════════════════════════════════════════
// 11. neon_sign — dark backing board with a glowing "</>" in LED green,
//     32x32, 2x1 wall item. Glyph strokes are 2px, with a 1px dim-green
//     halo on the board for the glow.
// ════════════════════════════════════════════════════════════════
const NEON_SIGN = (() => {
  const g = blank(32, 32);
  const set = (r: number, c: number, ch: string) => {
    g[r][c] = ch;
  };
  // board rows 6-20, cols 2-29
  for (let r = 6; r <= 20; r++) {
    for (let c = 2; c <= 29; c++) {
      const edge = r === 6 || r === 20 || c === 2 || c === 29;
      set(r, c, edge ? 'o' : 'k');
    }
  }
  // glyph strokes (row, col) in board coords; each stroke is 2px wide
  const stroke = (r: number, c: number) => {
    set(r, c, 'G');
    set(r, c + 1, 'G');
  };
  const rows = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  const lt = [10, 9, 8, 7, 6, 7, 8, 9, 10]; // '<' (cols 6-11)
  const sl = [18, 17, 17, 16, 16, 15, 15, 14, 14]; // '/' (cols 14-19, 2px clear of both brackets)
  const gt = [22, 23, 24, 25, 26, 25, 24, 23, 22]; // '>' (cols 22-27)
  rows.forEach((r, i) => {
    stroke(r, lt[i]);
    stroke(r, sl[i]);
    stroke(r, gt[i]);
  });
  // halo: board pixels touching a stroke
  for (let r = 7; r <= 19; r++) {
    for (let c = 3; c <= 28; c++) {
      if (g[r][c] !== 'k') continue;
      const near = [g[r - 1][c], g[r + 1][c], g[r][c - 1], g[r][c + 1]].includes('G');
      if (near) set(r, c, 'h');
    }
  }
  // mounting hooks up to the wall
  set(5, 8, 'o');
  set(5, 23, 'o');
  return fromAscii(
    g.map((r) => r.join('')),
    { o: INK, k: IRON_DARK, G: LED_GREEN, h: LEAF_DARK },
  );
})();

// ════════════════════════════════════════════════════════════════
// 12. calendar — hanging wall calendar, 16x32, 1x1 wall item (like
//     POSTER_CODE): red header, paper grid of day dots, one day circled.
// ════════════════════════════════════════════════════════════════
const CALENDAR = (() => {
  const g = blank(16, 32);
  const set = (r: number, c: number, ch: string) => {
    g[r][c] = ch;
  };
  set(3, 7, 'k');
  set(3, 8, 'k'); // hook
  for (let r = 4; r <= 24; r++) {
    for (let c = 2; c <= 13; c++) {
      const edge = r === 4 || r === 24 || c === 2 || c === 13;
      if (edge) set(r, c, 'o');
      else if (r <= 8) set(r, c, 'R');
      else set(r, c, 'P');
    }
  }
  for (let c = 4; c <= 11; c += 2) set(6, c, 'P'); // month "text"
  for (const r of [11, 14, 17, 20]) {
    for (const c of [4, 6, 8, 10]) set(r, c, 'q');
  }
  set(17, 8, 'R'); // today
  set(16, 8, 'r');
  set(18, 8, 'r');
  set(17, 7, 'r');
  set(17, 9, 'r');
  return fromAscii(
    g.map((r) => r.join('')),
    { k: IRON_DARK, o: SLATE, R: RED, r: CLAY, P: PAPER, q: STEEL_LIGHT },
  );
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

export const SPRITES7: GeneratedSprite[] = [
  entry('desk_single', 'Desk', 32, 16, 2, 1, DESK_SINGLE, 'desk_single', 'front'),
  entry(
    'desk_single_right',
    'Desk (Right)',
    16,
    32,
    1,
    2,
    DESK_SINGLE_RIGHT,
    'desk_single',
    'right',
  ),
  entry(
    'desk_single_back',
    'Desk (Back)',
    32,
    16,
    2,
    1,
    mirrorSprite(DESK_SINGLE),
    'desk_single',
    'back',
  ),
  entry(
    'desk_single_left',
    'Desk (Left)',
    16,
    32,
    1,
    2,
    mirrorSprite(DESK_SINGLE_RIGHT),
    'desk_single',
    'left',
  ),
  entry('monitor_single', 'Monitor', 16, 16, 1, 1, MONITOR_SINGLE, 'monitor_single', 'front'),
  entry(
    'monitor_single_right',
    'Monitor (Right)',
    16,
    16,
    1,
    1,
    MONITOR_SINGLE_RIGHT,
    'monitor_single',
    'right',
  ),
  entry(
    'monitor_single_back',
    'Monitor (Back)',
    16,
    16,
    1,
    1,
    MONITOR_SINGLE_BACK,
    'monitor_single',
    'back',
  ),
  entry(
    'monitor_single_left',
    'Monitor (Left)',
    16,
    16,
    1,
    1,
    mirrorSprite(MONITOR_SINGLE_RIGHT),
    'monitor_single',
    'left',
  ),
  entry('laptop', 'Laptop', 16, 16, 1, 1, LAPTOP, 'laptop', 'front'),
  entry('laptop_back', 'Laptop (Back)', 16, 16, 1, 1, LAPTOP_BACK, 'laptop', 'back'),
  entry('chair_wood', 'Wooden Chair', 16, 32, 1, 1, CHAIR_WOOD, 'chair_wood', 'front'),
  entry(
    'chair_wood_right',
    'Wooden Chair (Right)',
    16,
    32,
    1,
    1,
    CHAIR_WOOD_RIGHT,
    'chair_wood',
    'right',
  ),
  entry(
    'chair_wood_back',
    'Wooden Chair (Back)',
    16,
    32,
    1,
    1,
    CHAIR_WOOD_BACK,
    'chair_wood',
    'back',
  ),
  entry(
    'chair_wood_left',
    'Wooden Chair (Left)',
    16,
    32,
    1,
    1,
    mirrorSprite(CHAIR_WOOD_RIGHT),
    'chair_wood',
    'left',
  ),
  entry('meeting_table', 'Meeting Table', 48, 32, 3, 2, MEETING_TABLE, 'meeting_table', 'front'),
  entry(
    'meeting_table_right',
    'Meeting Table (Rotated)',
    32,
    48,
    2,
    3,
    MEETING_TABLE_RIGHT,
    'meeting_table',
    'right',
  ),
  entry('beanbag', 'Beanbag', 16, 16, 1, 1, BEANBAG, 'beanbag', 'front'),
  entry('beanbag_back', 'Beanbag (Back)', 16, 16, 1, 1, BEANBAG_BACK, 'beanbag', 'back'),
  entry('partition', 'Partition', 16, 32, 1, 1, PARTITION, 'partition', 'front'),
  entry('partition_right', 'Partition (Side)', 16, 32, 1, 1, PARTITION_RIGHT, 'partition', 'right'),
  entry(
    'bookshelf_short',
    'Short Bookshelf',
    32,
    32,
    2,
    1,
    BOOKSHELF_SHORT,
    'bookshelf_short',
    'front',
  ),
  entry(
    'bookshelf_short_right',
    'Short Bookshelf (Right)',
    16,
    48,
    1,
    2,
    BOOKSHELF_SHORT_RIGHT,
    'bookshelf_short',
    'right',
  ),
  entry(
    'bookshelf_short_back',
    'Short Bookshelf (Back)',
    32,
    32,
    2,
    1,
    BOOKSHELF_SHORT_BACK,
    'bookshelf_short',
    'back',
  ),
  entry(
    'bookshelf_short_left',
    'Short Bookshelf (Left)',
    16,
    48,
    1,
    2,
    mirrorSprite(BOOKSHELF_SHORT_RIGHT),
    'bookshelf_short',
    'left',
  ),
  entry('fridge', 'Fridge', 16, 48, 1, 1, FRIDGE, 'fridge', 'front'),
  entry('fridge_right', 'Fridge (Right)', 16, 48, 1, 1, FRIDGE_RIGHT, 'fridge', 'right'),
  entry('fridge_left', 'Fridge (Left)', 16, 48, 1, 1, mirrorSprite(FRIDGE_RIGHT), 'fridge', 'left'),
  entry('wall_shelf', 'Wall Shelf', 32, 32, 2, 1, WALL_SHELF),
  entry('neon_sign', 'Neon Sign', 32, 32, 2, 1, NEON_SIGN),
  entry('calendar', 'Calendar', 16, 32, 1, 1, CALENDAR),
];

validateSprites(SPRITES7);
