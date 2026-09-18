/**
 * sprites4.ts — Batch 4: rotation orientation variants (9 items).
 *
 * First art for the (previously dormant) rotation-group engine: back and
 * side views for the chairs, back views for couch and dual monitors, and a
 * mirrored L-desk. Variants share a `groupId` with their front sprite and
 * carry an `orientation`; the editor's R key cycles them via
 * buildDynamicCatalog's rotationGroups.
 *
 * Mirroring precedent: characters already render left as flipped-right, so
 * left views here are programmatic mirrors of the hand-drawn right views
 * (the mirrored desk_l_right that shipped here was superseded by the
 * true 90° rotation in batch 6).
 *
 * Same style rules as batch 1-3 (house palette only, light from top-left,
 * darker-material outlines). Back chair views: the backrest fills the sprite
 * and hides the seat — the engine z-sorts 'back' chairs in front of the
 * seated character, so the backrest is what occludes them.
 */

import {
  BLUE,
  GREEN,
  INK,
  IRON,
  IRON_DARK,
  LEAF,
  LEAF_DARK,
  LED_GREEN,
  RED,
  SCREEN_BLUE,
  SCREEN_SHADOW,
  STEEL,
  STEEL_DARK,
  WOOD_DARK,
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
// 1. chair_office_back — rear of the office chair, 16x32, 1x1
//    Tall stitched blue panel (3 vertical sections), lit top edge,
//    seat hidden behind it; same gas-lift stem and star base.
// ════════════════════════════════════════════════════════════════
const CHAIR_OFFICE_BACK = fromAscii(
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '....dddddddd....',
    '...dLLLLLLLLd...',
    '..dLBBBBBBBBLd..',
    '..dBBdBBBBdBBd..',
    '..dBBdBBBBdBBd..',
    '..dBBdBBBBdBBd..',
    '..dBBdBBBBdBBd..',
    '..dBBdBBBBdBBd..',
    '..dBBdBBBBdBBd..',
    '..dBBdBBBBdBBd..',
    '..dBBdBBBBdBBd..',
    '..dBBdBBBBdBBd..',
    '..dBBBBBBBBBBd..',
    '..dBBBBBBBBBBd..',
    '..dBBBBBBBBBBd..',
    '..dBBBBBBBBBBd..',
    '...dBBBBBBBBd...',
    '...dddddddddd...',
    '.......gk.......',
    '.......gk.......',
    '......ogko......',
    '....kkkkkkkk....',
    '..kkk..kk..kkk..',
    '..oo...oo...oo..',
    '................',
    '................',
  ],
  { d: SCREEN_SHADOW, B: BLUE, L: SCREEN_BLUE, g: STEEL, k: IRON_DARK, o: INK },
);

// ════════════════════════════════════════════════════════════════
// 2. chair_office_right — office chair in profile facing right,
//    16x32, 1x1. Narrow backrest column at the left (lit left edge),
//    seat slab extending right; stem/base as the front view.
//    chair_office_left is the programmatic mirror.
// ════════════════════════════════════════════════════════════════
const CHAIR_OFFICE_RIGHT = fromAscii(
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '...dddd.........',
    '..dLLLLd........',
    '..dLBBBd........',
    '..dLBBBd........',
    '..dLBBBd........',
    '..dLBBBd........',
    '..dLBBBd........',
    '..dLBBBd........',
    '..dLBBBd........',
    '..dLBBBd........',
    '..dLBBBd........',
    '..dBBBBddddddd..',
    '..dBBLLLLLLLLd..',
    '..dBBBBBBBBBBd..',
    '..dBBBBBBBBBBd..',
    '...dddddddddd...',
    '................',
    '.......gk.......',
    '.......gk.......',
    '......ogko......',
    '....kkkkkkkk....',
    '..kkk..kk..kkk..',
    '..oo...oo...oo..',
    '................',
    '................',
  ],
  { d: SCREEN_SHADOW, B: BLUE, L: SCREEN_BLUE, g: STEEL, k: IRON_DARK, o: INK },
);

// ════════════════════════════════════════════════════════════════
// 3. chair_gamer_back — rear of the gamer chair, 16x32, 1x1
//    Red racing stripes run vertically down the shell; dark center
//    spine panel; same star base with wheels.
// ════════════════════════════════════════════════════════════════
const CHAIR_GAMER_BACK = fromAscii(
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '....oooooooo....',
    '...oBrBBBBrBo...',
    '..oBBrBBBBrBBo..',
    '..oBBrBKKBrBBo..',
    '..oBBrBKKBrBBo..',
    '..oBBrBKKBrBBo..',
    '..oBBrBKKBrBBo..',
    '..oBBrBKKBrBBo..',
    '..oBBrBKKBrBBo..',
    '..oBBrBKKBrBBo..',
    '..oBBrBKKBrBBo..',
    '..oBBrBKKBrBBo..',
    '..oBBrBKKBrBBo..',
    '..oBBrBBBBrBBo..',
    '..oBBBBBBBBBBo..',
    '..oBBBBBBBBBBo..',
    '...oBBBBBBBBo...',
    '...oooooooooo...',
    '................',
    '.......gK.......',
    '.......gK.......',
    '......ogKo......',
    '....KKKKKKKK....',
    '..KKK..KK..KKK..',
    '..oo...oo...oo..',
    '................',
    '................',
  ],
  { o: INK, B: IRON, K: IRON_DARK, r: RED, g: STEEL },
);

// ════════════════════════════════════════════════════════════════
// 4. chair_gamer_right — gamer chair in profile facing right,
//    16x32, 1x1. High shell at the left with a red stripe column,
//    bucket seat with a red side accent; stem/base as the front.
//    chair_gamer_left is the programmatic mirror.
// ════════════════════════════════════════════════════════════════
const CHAIR_GAMER_RIGHT = fromAscii(
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '...oooo.........',
    '..oBBBBo........',
    '..oBrBBo........',
    '..oBrBBo........',
    '..oBrBBo........',
    '..oBrBBo........',
    '..oBrBBo........',
    '..oBrBBo........',
    '..oBrBBo........',
    '..oBrBBo........',
    '..oBrBBo........',
    '..oBrBBo........',
    '..oBrBBooooooo..',
    '..oBBBBBBBBBBo..',
    '..oBBBBBBBBBBo..',
    '..oBrrrrrrrrBo..',
    '...oooooooooo...',
    '................',
    '................',
    '.......gK.......',
    '.......gK.......',
    '......ogKo......',
    '....KKKKKKKK....',
    '..KKK..KK..KKK..',
    '..oo...oo...oo..',
    '................',
    '................',
  ],
  { o: INK, B: IRON, K: IRON_DARK, r: RED, g: STEEL },
);

// ════════════════════════════════════════════════════════════════
// 5. couch_back — rear of the two-seat sofa, 32x32, 2x1
//    Full-width green back panel with two vertical seams, lit top
//    edge, shadowed bottom row, wood feet peeking below.
// ════════════════════════════════════════════════════════════════
const COUCH_BACK = (() => {
  const rows: string[] = [];
  // r0-7: empty (same overhang as the front view)
  for (let r = 0; r < 8; r++) rows.push(rep('.', 32));
  // r8: top outline
  rows.push('.' + rep('o', 30) + '.');
  // r9: lit top edge
  rows.push('o' + rep('h', 30) + 'o');
  // r10-23: back panel with two vertical seams (three cushion sections)
  for (let r = 10; r <= 23; r++) {
    rows.push('o' + rep('G', 9) + 'g' + rep('G', 10) + 'g' + rep('G', 9) + 'o');
  }
  // r24-25: bottom shadow band
  rows.push('o' + rep('g', 30) + 'o');
  rows.push('o' + rep('g', 30) + 'o');
  // r26: bottom outline
  rows.push('.' + rep('o', 30) + '.');
  // r27-28: wood feet
  rows.push('..ee' + rep('.', 24) + 'ee..');
  rows.push('..ee' + rep('.', 24) + 'ee..');
  // r29-31: empty
  for (let r = 29; r < 32; r++) rows.push(rep('.', 32));
  return fromAscii(rows, { o: LEAF_DARK, G: GREEN, g: LEAF, h: LED_GREEN, e: WOOD_DARK });
})();

// ════════════════════════════════════════════════════════════════
// 6. monitor_dual_back — rear of the dual monitors, 32x16, 2x1
//    Steel panel backs with an inset mount plate and vent slits —
//    no screen glow. Same dual-arm bar, post and base as the front.
// ════════════════════════════════════════════════════════════════
const MONITOR_DUAL_BACK = (() => {
  const mFrame = rep('f', 14);
  const mPanel = 'f' + rep('i', 12) + 'f';
  const mMount = 'f' + rep('i', 4) + rep('k', 4) + rep('i', 4) + 'f';
  const mVents = 'f' + 'i' + rep('ki', 5) + 'i' + 'f';
  const pair = (m: string) => '.' + m + '..' + m + '.';
  const rows = [
    rep('.', 32),
    pair(mFrame),
    pair(mPanel),
    pair(mPanel),
    pair(mMount),
    pair(mMount),
    pair(mPanel),
    pair(mVents),
    pair(mPanel),
    pair(mPanel),
    pair(mFrame),
    rep('.', 7) + rep('d', 18) + rep('.', 7), // dual-arm bar
    rep('.', 15) + 'dd' + rep('.', 15), // center post
    rep('.', 11) + rep('d', 10) + rep('.', 11), // base
    rep('.', 32),
    rep('.', 32),
  ];
  return fromAscii(rows, { f: STEEL_DARK, i: IRON, k: IRON_DARK, d: IRON });
})();

// ════════════════════════════════════════════════════════════════

export const SPRITES4: GeneratedSprite[] = [
  {
    id: 'chair_office_back',
    name: 'CHAIR_OFFICE_BACK',
    label: 'Office Chair (Back)',
    widthPx: 16,
    heightPx: 32,
    footprintW: 1,
    footprintH: 1,
    sprite: CHAIR_OFFICE_BACK,
    groupId: 'chair_office',
    orientation: 'back',
  },
  {
    id: 'chair_office_right',
    name: 'CHAIR_OFFICE_RIGHT',
    label: 'Office Chair (Right)',
    widthPx: 16,
    heightPx: 32,
    footprintW: 1,
    footprintH: 1,
    sprite: CHAIR_OFFICE_RIGHT,
    groupId: 'chair_office',
    orientation: 'right',
  },
  {
    id: 'chair_office_left',
    name: 'CHAIR_OFFICE_LEFT',
    label: 'Office Chair (Left)',
    widthPx: 16,
    heightPx: 32,
    footprintW: 1,
    footprintH: 1,
    sprite: mirrorSprite(CHAIR_OFFICE_RIGHT),
    groupId: 'chair_office',
    orientation: 'left',
  },
  {
    id: 'chair_gamer_back',
    name: 'CHAIR_GAMER_BACK',
    label: 'Gamer Chair (Back)',
    widthPx: 16,
    heightPx: 32,
    footprintW: 1,
    footprintH: 1,
    sprite: CHAIR_GAMER_BACK,
    groupId: 'chair_gamer',
    orientation: 'back',
  },
  {
    id: 'chair_gamer_right',
    name: 'CHAIR_GAMER_RIGHT',
    label: 'Gamer Chair (Right)',
    widthPx: 16,
    heightPx: 32,
    footprintW: 1,
    footprintH: 1,
    sprite: CHAIR_GAMER_RIGHT,
    groupId: 'chair_gamer',
    orientation: 'right',
  },
  {
    id: 'chair_gamer_left',
    name: 'CHAIR_GAMER_LEFT',
    label: 'Gamer Chair (Left)',
    widthPx: 16,
    heightPx: 32,
    footprintW: 1,
    footprintH: 1,
    sprite: mirrorSprite(CHAIR_GAMER_RIGHT),
    groupId: 'chair_gamer',
    orientation: 'left',
  },
  {
    id: 'couch_back',
    name: 'COUCH_BACK',
    label: 'Couch (Back)',
    widthPx: 32,
    heightPx: 32,
    footprintW: 2,
    footprintH: 1,
    sprite: COUCH_BACK,
    groupId: 'couch',
    orientation: 'back',
  },
  {
    id: 'monitor_dual_back',
    name: 'MONITOR_DUAL_BACK',
    label: 'Dual Monitors (Back)',
    widthPx: 32,
    heightPx: 16,
    footprintW: 2,
    footprintH: 1,
    sprite: MONITOR_DUAL_BACK,
    groupId: 'monitor_dual',
    orientation: 'back',
  },
];

validateSprites(SPRITES4);
