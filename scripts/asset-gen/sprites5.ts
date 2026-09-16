/**
 * sprites5.ts — Batch 5: rotation variants, second pass (12 items).
 *
 * Covers the remaining non-symmetric furniture: back views for the two
 * desks, bookshelf, dashboard TV and server rack; side profiles for the
 * vending machine, arcade cabinet and filing cabinet; and a 90°-rotated
 * ping-pong table (the one variant whose FOOTPRINT swaps W/H — each
 * orientation is its own catalog entry, so per-orientation footprints
 * are already supported).
 *
 * Same conventions as batch 4: variants share a groupId with their
 * existing sprite (which keeps its id and becomes orientation 'front'),
 * left views are programmatic mirrors of hand-drawn right views, house
 * palette only, light from top-left, darker-material outlines.
 */

import {
  AMBER,
  BLUE,
  GOLD,
  GREEN_LIGHT,
  ICE,
  INK,
  IRON,
  IRON_DARK,
  LAMP_WARM,
  LEAF,
  LEAF_DARK,
  LED_GREEN,
  PAPER,
  RED,
  SCREEN_SHADOW,
  STEEL,
  STEEL_DARK,
  STEEL_LIGHT,
  WOOD,
  WOOD_DARK,
  WOOD_LIGHT,
  WOOD_SHADOW,
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
function mirrorSprite(sprite: string[][]): string[][] {
  return sprite.map((row) => [...row].reverse());
}

// ════════════════════════════════════════════════════════════════
// 1. desk_double_back — the double desk seen from behind, 48x32,
//    3x2, isDesk. Top surface stays top-down (view-invariant) but
//    the facing-halves center line is gone; the lower half is the
//    modesty panel (dark wood, plank seams) with a power cable
//    channel dropping down the middle. Same corner+middle legs.
// ════════════════════════════════════════════════════════════════
const DESK_DOUBLE_BACK = (() => {
  const rows: string[] = [];
  const surf = (fill: string) =>
    fill === 's' ? '.el' + rep('s', 43) + 'e.' : '.e' + rep(fill, 44) + 'e.';
  // panel row: dark wood with two plank seams and a 2px cable channel
  const panel = () =>
    '.e' + rep('d', 12) + 'x' + rep('d', 8) + 'kk' + rep('d', 8) + 'x' + rep('d', 12) + 'e.';
  rows.push(rep('.', 48)); // r0
  rows.push('.' + rep('e', 46) + '.'); // r1 top edge
  rows.push(surf('l')); // r2 lit strip
  for (let r = 3; r <= 12; r++) rows.push(surf('s')); // r3-12 work surface
  rows.push('.d' + rep('e', 44) + 'd.'); // r13 surface/panel divider
  for (let r = 14; r <= 24; r++) rows.push(panel()); // r14-24 modesty panel
  rows.push('.' + rep('e', 46) + '.'); // r25 bottom edge
  for (let r = 26; r <= 29; r++) {
    rows.push('.dd' + rep('.', 20) + 'dd' + rep('.', 20) + 'dd.'); // legs
  }
  rows.push(rep('.', 48)); // r30
  rows.push(rep('.', 48)); // r31
  return fromAscii(rows, {
    e: WOOD,
    l: WOOD_LIGHT,
    s: WOOD_SURFACE,
    d: WOOD_DARK,
    x: WOOD_SHADOW,
    k: IRON_DARK,
  });
})();

// ════════════════════════════════════════════════════════════════
// 2. desk_standing_back — standing desk from behind, 32x32, 2x1,
//    isDesk. Same top-down surface and steel legs; adds the motor
//    control box hanging under the right side of the top with a
//    power cable dropping past the crossbar to the floor.
// ════════════════════════════════════════════════════════════════
const DESK_STANDING_BACK = (() => {
  const rows: string[] = [];
  rows.push(rep('.', 32)); // r0
  rows.push('.' + rep('e', 30) + '.'); // r1 top edge
  rows.push('.e' + rep('l', 28) + 'e.'); // r2 lit strip
  for (let r = 3; r <= 11; r++) {
    rows.push('.el' + rep(r === 7 ? 'l' : 's', 27) + 'e.'); // r3-11 surface
  }
  rows.push('.' + rep('e', 30) + '.'); // r12 bottom edge
  rows.push('..' + rep('d', 28) + '..'); // r13 underside lip
  // r14-16: legs + control box (cols 23-27) under the top
  for (let r = 14; r <= 16; r++) {
    const box = r === 15 ? 'kkGkk' : 'kkkkk';
    rows.push(rep('.', 4) + 'mm' + rep('.', 17) + box + rep('.', 4));
  }
  // r17-25: legs, crossbar at r21, cable dropping at col 25
  for (let r = 17; r <= 25; r++) {
    if (r === 21) {
      rows.push(rep('.', 4) + rep('m', 24) + rep('.', 4));
    } else {
      rows.push(rep('.', 4) + 'mm' + rep('.', 19) + 'k' + 'mm' + rep('.', 4));
    }
  }
  rows.push('..' + rep('k', 6) + rep('.', 16) + rep('k', 6) + '..'); // r26 feet
  rows.push('..' + rep('k', 6) + rep('.', 16) + rep('k', 6) + '..'); // r27
  for (let r = 0; r < 4; r++) rows.push(rep('.', 32)); // r28-31
  return fromAscii(rows, {
    e: WOOD,
    l: WOOD_LIGHT,
    s: WOOD_SURFACE,
    d: WOOD_DARK,
    m: STEEL_DARK,
    k: IRON_DARK,
    G: LED_GREEN,
  });
})();

// ════════════════════════════════════════════════════════════════
// 3. bookshelf_tall_back — plain wood back panel, 16x48, 1x1.
//    The room-divider view: dark panel with two vertical plank
//    seams and two horizontal battens; no books.
// ════════════════════════════════════════════════════════════════
const BOOKSHELF_TALL_BACK = (() => {
  const rows: string[] = [];
  const panel = () => 'W' + rep('D', 4) + 'x' + rep('D', 4) + 'x' + rep('D', 4) + 'W';
  const batten = () => rep('W', 16);
  rows.push('.' + rep('W', 14) + '.'); // r0 top edge
  for (let r = 1; r <= 44; r++) {
    rows.push(r === 11 || r === 12 || r === 29 || r === 30 ? batten() : panel());
  }
  rows.push('.' + rep('W', 14) + '.'); // r45 bottom edge
  rows.push(rep('.', 16)); // r46
  rows.push(rep('.', 16)); // r47
  return fromAscii(rows, { W: WOOD, D: WOOD_DARK, x: WOOD_SHADOW });
})();

// ════════════════════════════════════════════════════════════════
// 4. tv_dashboard_back — rear of the wall TV, 32x16, 2x1, wall
//    item. Steel panel back with an inset mount plate, vent slits
//    and a cable dropping from the bottom center. No screen glow.
// ════════════════════════════════════════════════════════════════
const TV_DASHBOARD_BACK = (() => {
  const W = 32;
  const grid: string[][] = Array.from({ length: 16 }, () => new Array<string>(W).fill('.'));
  for (let r = 1; r <= 13; r++) {
    for (let c = 1; c <= 30; c++) {
      if (r === 1 || r === 13 || c === 1 || c === 30) grid[r][c] = 'f';
      else grid[r][c] = 'i';
    }
  }
  // vent slits (alternating dashes) top and bottom of the panel
  for (let c = 3; c <= 28; c += 2) {
    grid[3][c] = 'k';
    grid[11][c] = 'k';
  }
  // inset mount plate, center
  for (let r = 6; r <= 9; r++) {
    for (let c = 13; c <= 18; c++)
      grid[r][c] = r === 6 || r === 9 || c === 13 || c === 18 ? 'k' : 'g';
  }
  // cable from the bottom center
  grid[14][15] = 'k';
  grid[14][16] = 'k';
  grid[15][15] = 'k';
  return fromAscii(
    grid.map((r) => r.join('')),
    { f: STEEL_DARK, i: IRON, k: IRON_DARK, g: STEEL },
  );
})();

// ════════════════════════════════════════════════════════════════
// 5. server_rack_back — rear of the rack, 16x48, 1x1. The cable
//    mess: colored wire runs snaking down the open back, connector
//    blocks, a PDU strip with LEDs near the bottom. Same INK
//    cabinet frame, plinth and feet as the front.
// ════════════════════════════════════════════════════════════════
const SERVER_RACK_BACK = (() => {
  const rows: string[] = [];
  const wrap = (inner: string) => '.o' + inner + 'o.';
  rows.push('.oooooooooooooo.'); // r0 top edge
  rows.push(wrap(rep('s', 12))); // r1 steel band
  rows.push(wrap(rep('g', 12))); // r2
  rows.push('.oooooooooooooo.'); // r3
  // r4-35: open back — wire runs over dark interior, jogging every
  // few rows; connector blocks where the wires terminate
  const wiresA = 'dRdBdGdddAdd';
  const wiresB = 'ddRdBdGddAdd';
  const connect = 'dkkdkkdkkdkk';
  for (let r = 4; r <= 35; r++) {
    if (r % 8 === 3) rows.push(wrap(connect));
    else rows.push(wrap(r % 8 < 4 ? wiresA : wiresB));
  }
  // r36-38: PDU strip with LED dots
  rows.push(wrap(rep('k', 12)));
  rows.push(wrap('k' + 'GnGnGnGnGn' + 'k'));
  rows.push(wrap(rep('k', 12)));
  rows.push('.oooooooooooooo.'); // r39 bottom edge
  rows.push(wrap(rep('k', 12))); // r40 plinth
  rows.push(wrap(rep('k', 12))); // r41
  rows.push('.oooooooooooooo.'); // r42
  rows.push('..oo........oo..'); // r43 feet
  rows.push('..oo........oo..'); // r44
  rows.push(rep('.', 16)); // r45
  rows.push(rep('.', 16)); // r46
  rows.push(rep('.', 16)); // r47
  return fromAscii(rows, {
    o: INK,
    s: STEEL,
    g: STEEL_DARK,
    d: IRON,
    k: IRON_DARK,
    n: INK,
    R: RED,
    B: BLUE,
    G: LED_GREEN,
    A: AMBER,
  });
})();

// ════════════════════════════════════════════════════════════════
// 6. vending_machine_right — vending machine in profile facing
//    right, 16x48, 1x1. Narrower red side panel; the glass front is
//    a 1px sliver on the right edge with the warm sign light on
//    top; white oval side decal; kick plate and feet.
//    vending_machine_left is the programmatic mirror.
// ════════════════════════════════════════════════════════════════
const VENDING_MACHINE_RIGHT = (() => {
  const rows: string[] = [];
  const body = (inner: string) => '...o' + inner + 'o...'; // inner = 8 chars
  rows.push('...oooooooooo...'); // r0 top edge
  rows.push(body('RRRRRRRw')); // r1 sign depth: warm sliver at the front
  rows.push(body('RRRRRRRw')); // r2
  rows.push(body(rep('R', 8))); // r3
  // r4-23: window rows — glass depth sliver on the front edge
  for (let r = 4; r <= 23; r++) {
    if (r >= 10 && r <= 18) {
      // white rounded side decal with a red core
      const decal = r === 10 || r === 18 ? 'RWWWWRRz' : r === 14 ? 'RWRRWRRz' : 'RWWWWRRz';
      rows.push(body(decal));
    } else {
      rows.push(body(rep('R', 7) + 'z'));
    }
  }
  for (let r = 24; r <= 37; r++) rows.push(body(rep('R', 8))); // r24-37 body
  for (let r = 38; r <= 42; r++) rows.push(body(rep('d', 8))); // r38-42 kick plate
  rows.push('...oooooooooo...'); // r43 bottom edge
  rows.push('....oo....oo....'); // r44 feet
  rows.push('....oo....oo....'); // r45
  rows.push(rep('.', 16)); // r46
  rows.push(rep('.', 16)); // r47
  return fromAscii(rows, { o: INK, R: RED, W: PAPER, z: SCREEN_SHADOW, d: IRON, w: LAMP_WARM });
})();

// ════════════════════════════════════════════════════════════════
// 7. arcade_machine_right — arcade cab in profile facing right,
//    16x48, 1x1. Classic stepped silhouette: marquee overhang up
//    top, recessed screen section, protruding control-panel ledge,
//    then the body with a gold side decal and kick plate.
//    arcade_machine_left is the programmatic mirror.
// ════════════════════════════════════════════════════════════════
const ARCADE_MACHINE_RIGHT = (() => {
  const rows: string[] = [];
  rows.push('..oooooooooooo..'); // r0 marquee top (overhangs to the front)
  for (let r = 1; r <= 3; r++) rows.push('..o' + rep('R', 9) + 'Yo..'); // r1-3 marquee, lit front
  rows.push('..oooooooooooo..'); // r4 marquee bottom
  for (let r = 5; r <= 15; r++) rows.push('..o' + rep('R', 7) + 'o.....'); // r5-15 recessed screen section
  rows.push('..oooooooooooo..'); // r16 ledge top (sticks out front)
  for (let r = 17; r <= 19; r++) rows.push('..o' + rep('R', 9) + 'ko..'); // r17-19 control deck side
  rows.push('..oooooooooooo..'); // r20 ledge bottom
  // r21-41: body with gold side decal
  for (let r = 21; r <= 41; r++) {
    let inner = rep('R', 8);
    if (r >= 24 && r <= 28) inner = r === 26 ? 'RRYGGYRR' : 'RRYYYYRR';
    if (r >= 39) inner = rep('d', 8);
    rows.push('..o' + inner + 'o....');
  }
  rows.push('..oooooooooo....'); // r42 bottom edge
  rows.push('...oo.....oo....'); // r43 feet
  rows.push('...oo.....oo....'); // r44
  for (let r = 45; r <= 47; r++) rows.push(rep('.', 16));
  return fromAscii(rows, { o: INK, R: RED, Y: GOLD, G: LED_GREEN, k: IRON_DARK, d: IRON });
})();

// ════════════════════════════════════════════════════════════════
// 8. filing_cabinet_right — cabinet in profile facing right,
//    16x32, 1x1. Plain steel side with an inset panel; the drawer
//    faces are a 1px front sliver with handle nubs at drawer
//    height. filing_cabinet_left is the programmatic mirror.
// ════════════════════════════════════════════════════════════════
const FILING_CABINET_RIGHT = (() => {
  const rows: string[] = [];
  for (let r = 0; r < 5; r++) rows.push(rep('.', 16)); // r0-4
  rows.push('...oooooooooo...'); // r5 top
  rows.push('...ohhhhhhhho...'); // r6 lit top
  // r7-24: side body; inset panel rows 9-22; handle nubs on the
  // front edge at each drawer's height (rows 10, 15, 20)
  for (let r = 7; r <= 24; r++) {
    const nub = r === 10 || r === 15 || r === 20;
    const inset = r >= 9 && r <= 22;
    rows.push('...o' + 'b' + rep(inset ? 'd' : 'b', 5) + 'b' + (nub ? 'n' : 'b') + 'o...');
  }
  rows.push('...oooooooooo...'); // r25 bottom edge
  rows.push('...okkkkkkkko...'); // r26 plinth
  rows.push('...oooooooooo...'); // r27
  rows.push('....oo....oo....'); // r28 feet
  rows.push('....oo....oo....'); // r29
  rows.push(rep('.', 16)); // r30
  rows.push(rep('.', 16)); // r31
  return fromAscii(rows, { o: IRON_DARK, h: STEEL_LIGHT, b: STEEL, d: IRON, n: INK, k: IRON });
})();

// ════════════════════════════════════════════════════════════════
// 9. pingpong_table_right — the table rotated 90°, 32x48 sprite,
//    footprint 2x3 (the W/H swap — each orientation is its own
//    catalog entry so per-orientation footprints just work). Same
//    top-down styling: lit top/left edges, white boundary + center
//    line (now lengthwise/vertical), ice net across the middle,
//    paddles in each half, corner leg stubs.
// ════════════════════════════════════════════════════════════════
const PINGPONG_TABLE_RIGHT = (() => {
  const grid: string[][] = Array.from({ length: 48 }, () => new Array<string>(32).fill('.'));
  const set = (r: number, c: number, ch: string) => {
    grid[r][c] = ch;
  };
  // table top rows 1-41, cols 1-30
  for (let c = 1; c <= 30; c++) {
    set(1, c, 'D');
    set(41, c, 'D');
  }
  for (let r = 2; r <= 40; r++) {
    set(r, 1, 'D');
    set(r, 30, 'D');
    for (let c = 2; c <= 29; c++) set(r, c, r === 2 || c === 2 ? 'L' : 'G');
  }
  // white boundary lines
  for (let c = 5; c <= 26; c++) {
    set(4, c, 'w');
    set(38, c, 'w');
  }
  for (let r = 4; r <= 38; r++) {
    set(r, 5, 'w');
    set(r, 26, 'w');
  }
  // center line (lengthwise — vertical after the rotation)
  for (let r = 5; r <= 37; r++) set(r, 15, 'w');
  // paddles: red in the top half (handle up), blue in the bottom (handle down)
  const paddle = (r0: number, c0: number, ch: string, handleUp: boolean) => {
    for (let r = r0; r < r0 + 3; r++) {
      for (let c = c0; c < c0 + 3; c++) set(r, c, ch);
    }
    if (handleUp) {
      set(r0 - 1, c0 + 1, 'e');
      set(r0 - 2, c0 + 1, 'e');
    } else {
      set(r0 + 3, c0 + 1, 'e');
      set(r0 + 4, c0 + 1, 'e');
    }
  };
  paddle(9, 8, 'R', true);
  paddle(31, 21, 'B', false);
  set(26, 10, 'w'); // ball
  // net across the middle (drawn over the top)
  for (let c = 2; c <= 29; c++) {
    set(20, c, 'i');
    set(21, c, 'i');
  }
  for (const c of [1, 30]) {
    set(20, c, 'k');
    set(21, c, 'k');
  }
  // leg stubs rows 42-45
  for (let r = 42; r <= 45; r++) {
    for (const c of [3, 4, 27, 28]) set(r, c, 'k');
  }
  return fromAscii(
    grid.map((r) => r.join('')),
    {
      D: LEAF_DARK,
      G: LEAF,
      L: GREEN_LIGHT,
      w: PAPER,
      i: ICE,
      k: IRON_DARK,
      R: RED,
      B: BLUE,
      e: WOOD_DARK,
    },
  );
})();

// ════════════════════════════════════════════════════════════════

export const SPRITES5: GeneratedSprite[] = [
  {
    id: 'desk_double_back',
    name: 'DESK_DOUBLE_BACK',
    label: 'Double Desk (Back)',
    widthPx: 48,
    heightPx: 32,
    footprintW: 3,
    footprintH: 2,
    sprite: DESK_DOUBLE_BACK,
    groupId: 'desk_double',
    orientation: 'back',
  },
  {
    id: 'desk_standing_back',
    name: 'DESK_STANDING_BACK',
    label: 'Standing Desk (Back)',
    widthPx: 32,
    heightPx: 32,
    footprintW: 2,
    footprintH: 1,
    sprite: DESK_STANDING_BACK,
    groupId: 'desk_standing',
    orientation: 'back',
  },
  {
    id: 'bookshelf_tall_back',
    name: 'BOOKSHELF_TALL_BACK',
    label: 'Tall Bookshelf (Back)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 1,
    sprite: BOOKSHELF_TALL_BACK,
    groupId: 'bookshelf_tall',
    orientation: 'back',
  },
  {
    id: 'tv_dashboard_back',
    name: 'TV_DASHBOARD_BACK',
    label: 'Dashboard TV (Back)',
    widthPx: 32,
    heightPx: 16,
    footprintW: 2,
    footprintH: 1,
    sprite: TV_DASHBOARD_BACK,
    groupId: 'tv_dashboard',
    orientation: 'back',
  },
  {
    id: 'server_rack_back',
    name: 'SERVER_RACK_BACK',
    label: 'Server Rack (Back)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 1,
    sprite: SERVER_RACK_BACK,
    groupId: 'server_rack',
    orientation: 'back',
  },
  {
    id: 'vending_machine_right',
    name: 'VENDING_MACHINE_RIGHT',
    label: 'Vending Machine (Right)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 1,
    sprite: VENDING_MACHINE_RIGHT,
    groupId: 'vending_machine',
    orientation: 'right',
  },
  {
    id: 'vending_machine_left',
    name: 'VENDING_MACHINE_LEFT',
    label: 'Vending Machine (Left)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 1,
    sprite: mirrorSprite(VENDING_MACHINE_RIGHT),
    groupId: 'vending_machine',
    orientation: 'left',
  },
  {
    id: 'arcade_machine_right',
    name: 'ARCADE_MACHINE_RIGHT',
    label: 'Arcade Machine (Right)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 1,
    sprite: ARCADE_MACHINE_RIGHT,
    groupId: 'arcade_machine',
    orientation: 'right',
  },
  {
    id: 'arcade_machine_left',
    name: 'ARCADE_MACHINE_LEFT',
    label: 'Arcade Machine (Left)',
    widthPx: 16,
    heightPx: 48,
    footprintW: 1,
    footprintH: 1,
    sprite: mirrorSprite(ARCADE_MACHINE_RIGHT),
    groupId: 'arcade_machine',
    orientation: 'left',
  },
  {
    id: 'filing_cabinet_right',
    name: 'FILING_CABINET_RIGHT',
    label: 'Filing Cabinet (Right)',
    widthPx: 16,
    heightPx: 32,
    footprintW: 1,
    footprintH: 1,
    sprite: FILING_CABINET_RIGHT,
    groupId: 'filing_cabinet',
    orientation: 'right',
  },
  {
    id: 'filing_cabinet_left',
    name: 'FILING_CABINET_LEFT',
    label: 'Filing Cabinet (Left)',
    widthPx: 16,
    heightPx: 32,
    footprintW: 1,
    footprintH: 1,
    sprite: mirrorSprite(FILING_CABINET_RIGHT),
    groupId: 'filing_cabinet',
    orientation: 'left',
  },
  {
    id: 'pingpong_table_right',
    name: 'PINGPONG_TABLE_RIGHT',
    label: 'Ping-Pong Table (Rotated)',
    widthPx: 32,
    heightPx: 48,
    footprintW: 2,
    footprintH: 3,
    sprite: PINGPONG_TABLE_RIGHT,
    groupId: 'pingpong_table',
    orientation: 'right',
  },
];

validateSprites(SPRITES5);
