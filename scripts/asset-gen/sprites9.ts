/**
 * sprites9.ts — Batch 9: reward furniture.
 *
 * Five pieces that stay locked in the editor palette until the matching
 * achievement is unlocked (the id lives in CATALOG_META's `unlock` field in
 * export.ts, and the palette reads it off the catalog entry):
 *
 *   trophy_case  → ten-done     (complete 10 tasks)
 *   neon_shipped → first-done   (complete your first task)
 *   duck_golden  → century      (100 agent turns)
 *   disco_ball   → full-floor   (5 agents working at once)
 *   robot_statue → automator    (a schedule dispatched an agent on its own)
 *
 * They read as trophies rather than as office kit: gold, glass and neon
 * against the house palette's mostly-wood set. Same conventions as the
 * earlier batches — house palette only, light from top-left, 1px outline in
 * a darker shade of the material, tall pieces keeping the 16px overhang.
 */

import {
  AMBER,
  GOLD,
  GOLD_DARK,
  GOLD_LIGHT,
  ICE,
  INK,
  IRON,
  IRON_DARK,
  LEAF_DARK,
  LED_GREEN,
  ORANGE,
  PAPER,
  SILVER,
  SILVER_LIGHT,
  SKY,
  STEEL,
  STEEL_DARK,
  STEEL_LIGHT,
  WOOD,
  WOOD_DARK,
  WOOD_LIGHT,
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

/** Blank char grid for programmatic drawing. */
function blank(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => new Array<string>(w).fill('.'));
}

const compile = (g: string[][], legend: Legend) =>
  fromAscii(
    g.map((r) => r.join('')),
    legend,
  );

// ════════════════════════════════════════════════════════════════
// 1. trophy_case — glass display cabinet, 32x48, 2x1, storage.
//    Wood carcass, dark interior, two glass-fronted shelves each
//    holding gold cups, plinth and feet. The glass is ICE with a
//    diagonal highlight so it reads as a pane and not as fog.
// ════════════════════════════════════════════════════════════════
const TROPHY_CASE = (() => {
  const g = blank(32, 48);
  const set = (r: number, c: number, ch: string) => {
    g[r][c] = ch;
  };
  // carcass rows 4-43
  for (let c = 1; c <= 30; c++) {
    set(4, c, 'W');
    set(43, c, 'W');
  }
  for (let r = 5; r <= 42; r++) {
    set(r, 1, 'W');
    set(r, 30, 'W');
    for (let c = 2; c <= 29; c++) set(r, c, r === 5 ? 'L' : 'D');
  }
  // two glass panes (upper + lower shelf), inset from the frame
  const pane = (top: number, bottom: number) => {
    for (let r = top; r <= bottom; r++) {
      for (let c = 3; c <= 28; c++) {
        const border = r === top || r === bottom || c === 3 || c === 28;
        set(r, c, border ? 'S' : 'I');
      }
    }
    // diagonal glass highlight
    for (let i = 0; i < 6; i++) {
      const r = top + 2 + i;
      const c = 6 + i;
      if (r < bottom && c < 28) set(r, c, 'P');
    }
  };
  pane(7, 22);
  pane(25, 40);
  // trophies: a cup is a bowl + stem + base, with handles
  const cup = (baseRow: number, cx: number, tall: boolean) => {
    const top = baseRow - (tall ? 9 : 7);
    for (let r = top; r <= top + (tall ? 4 : 3); r++) {
      for (let c = cx - 2; c <= cx + 2; c++) set(r, c, c === cx - 2 || c === cx + 2 ? 'k' : 'G');
    }
    set(top + 1, cx - 3, 'k');
    set(top + 1, cx + 3, 'k'); // handles
    set(top + 2, cx - 3, 'k');
    set(top + 2, cx + 3, 'k');
    set(top, cx, 'H'); // lit rim
    for (let r = top + (tall ? 5 : 4); r <= baseRow - 2; r++) {
      set(r, cx, 'G');
      set(r, cx - 1, 'k');
      set(r, cx + 1, 'k');
    }
    for (let c = cx - 3; c <= cx + 3; c++) {
      set(baseRow - 1, c, 'k');
      set(baseRow, c, 'k');
    }
  };
  cup(20, 10, true);
  cup(20, 21, false);
  cup(38, 16, true);
  // plinth + feet
  for (let c = 1; c <= 30; c++) set(44, c, 'D');
  for (const c of [2, 3, 28, 29]) {
    set(45, c, 'D');
    set(46, c, 'D');
  }
  return compile(g, {
    W: WOOD,
    L: WOOD_LIGHT,
    D: WOOD_DARK,
    S: STEEL_DARK,
    I: ICE,
    P: PAPER,
    G: GOLD,
    H: GOLD_LIGHT,
    k: GOLD_DARK,
  });
})();

// ════════════════════════════════════════════════════════════════
// 2. neon_shipped — a shipped-it checkmark in neon, 32x32, 2x1 wall
//    item. Dark board, 3px-wide LED_GREEN tick with a dim halo, and
//    a small amber star at each end. Big glyph, no text: at 16px a
//    word would be four pixels per letter.
// ════════════════════════════════════════════════════════════════
const NEON_SHIPPED = (() => {
  const g = blank(32, 32);
  const set = (r: number, c: number, ch: string) => {
    g[r][c] = ch;
  };
  for (let r = 5; r <= 22; r++) {
    for (let c = 1; c <= 30; c++) {
      const edge = r === 5 || r === 22 || c === 1 || c === 30;
      set(r, c, edge ? 'o' : 'k');
    }
  }
  // tick: short down-stroke then a long up-stroke, 3px thick
  const stroke = (r: number, c: number) => {
    for (let d = 0; d < 3; d++) if (g[r]?.[c + d] === 'k') set(r, c + d, 'G');
  };
  // A tick, not a V: the down-stroke is half the height of the up-stroke and
  // starts well below it, and the two share the elbow pixel.
  for (let i = 0; i < 5; i++) stroke(12 + i, 6 + i); // down to the elbow (row 16)
  for (let i = 0; i < 10; i++) stroke(16 - i, 10 + i); // up to the tip (row 7)
  // amber stars either side
  for (const cx of [3, 27]) {
    set(12, cx, 'A');
    set(13, cx - 1, 'A');
    set(13, cx, 'A');
    set(13, cx + 1, 'A');
    set(14, cx, 'A');
  }
  // halo: board pixels touching a lit stroke
  for (let r = 6; r <= 21; r++) {
    for (let c = 2; c <= 29; c++) {
      if (g[r][c] !== 'k') continue;
      if ([g[r - 1][c], g[r + 1][c], g[r][c - 1], g[r][c + 1]].includes('G')) set(r, c, 'h');
    }
  }
  // mounting hooks up to the wall
  set(4, 9, 'o');
  set(4, 22, 'o');
  return compile(g, { o: INK, k: IRON_DARK, G: LED_GREEN, h: LEAF_DARK, A: AMBER });
})();

// ════════════════════════════════════════════════════════════════
// 3. duck_golden — the rubber duck cast in gold, 16x16, 1x1 surface
//    item. Same silhouette as rubber_duck so the joke lands: gold
//    body, lit crown, orange bill, ink eye, on a small dark plinth.
// ════════════════════════════════════════════════════════════════
const DUCK_GOLDEN = fromAscii(
  [
    '................',
    '................',
    '.....kkkk.......',
    '....kHHHHk......',
    '...kHGGGGHk.....',
    '...kGGGGGGk.....',
    '...kGiGGGGk.oo..',
    '...kGGGGGkoOOo..',
    '..kGGGGGGGkoo...',
    '..kHGGGGGGGk....',
    '.kGGGGGGGGGGk...',
    '.kGGGGGGGGGGk...',
    '.kkGGGGGGGGkk...',
    '..kkkkkkkkkk....',
    '...pppppppp.....',
    '................',
  ],
  {
    k: GOLD_DARK,
    G: GOLD,
    H: GOLD_LIGHT,
    i: INK,
    o: ORANGE,
    O: AMBER,
    p: IRON_DARK,
  },
);

// ════════════════════════════════════════════════════════════════
// 4. disco_ball — mirror ball on a chain, 16x32, 1x1 wall item so it
//    hangs off the wall row. Silver sphere with a facet grid, a lit
//    top-left quarter, and two sparkles.
// ════════════════════════════════════════════════════════════════
const DISCO_BALL = (() => {
  const g = blank(16, 32);
  const set = (r: number, c: number, ch: string) => {
    g[r][c] = ch;
  };
  // chain + mount
  for (let r = 1; r <= 8; r++) set(r, 8, r % 2 === 0 ? 'k' : 'S');
  for (let c = 6; c <= 10; c++) set(0, c, 'k');
  // ball: radius 6 around (8.5, 16)
  for (let r = 10; r <= 23; r++) {
    for (let c = 2; c <= 14; c++) {
      const d = Math.hypot(c - 8, r - 16.5);
      if (d > 6.6) continue;
      if (d > 5.6) {
        set(r, c, 'k');
        continue;
      }
      // facet grid: every third row/column is a seam
      const seam = (r - 10) % 3 === 0 || (c - 2) % 3 === 0;
      const lit = c - 8 + (r - 16) < -4;
      set(r, c, seam ? 'S' : lit ? 'P' : 'L');
    }
  }
  // sparkles
  for (const [r, c] of [
    [12, 12],
    [20, 4],
  ]) {
    set(r, c, 'W');
    set(r - 1, c, 'W');
    set(r + 1, c, 'W');
    set(r, c - 1, 'W');
    set(r, c + 1, 'W');
  }
  return compile(g, {
    k: STEEL_DARK,
    S: STEEL,
    L: SILVER,
    P: SILVER_LIGHT,
    W: PAPER,
  });
})();

// ════════════════════════════════════════════════════════════════
// 5. robot_statue — a little agent cast as a desk statue, 16x32, 1x1
//    decor. Steel body with the app's round-eyed robot head, green
//    LED eyes, on a two-step plinth with a gold plaque.
// ════════════════════════════════════════════════════════════════
const ROBOT_STATUE = fromAscii(
  [
    '................',
    '................',
    '.......a........',
    '......aaa.......',
    '....kkkkkkkk....',
    '...kSSSSSSSSk...',
    '...kSLLLLLLSk...',
    '...kSLGSSGLSk...',
    '...kSLGSSGLSk...',
    '...kSLLLLLLSk...',
    '...kSSLLLLSSk...',
    '....kkkkkkkk....',
    '......kSSk......',
    '...kkkkSSkkkk...',
    '..kSSSSSSSSSSk..',
    '..kSLSSSSSSLSk..',
    '..kSLSSSSSSLSk..',
    '..kSSSSSSSSSSk..',
    '..kSSkkkkkkSSk..',
    '...kkk....kkk...',
    '....kSk..kSk....',
    '....kSk..kSk....',
    '....kkk..kkk....',
    '................',
    '..pppppppppppp..',
    '..pGGGGGGGGGGp..',
    '..pGHHHHHHHHGp..',
    '..pGGGGGGGGGGp..',
    '..pppppppppppp..',
    '.pppppppppppppp.',
    '.pppppppppppppp.',
    '................',
  ],
  {
    k: IRON_DARK,
    S: STEEL,
    L: STEEL_LIGHT,
    G: LED_GREEN,
    a: SKY,
    p: IRON,
    // plaque
    H: GOLD_LIGHT,
  },
);

// ════════════════════════════════════════════════════════════════

const entry = (
  id: string,
  label: string,
  widthPx: number,
  heightPx: number,
  footprintW: number,
  footprintH: number,
  sprite: string[][],
): GeneratedSprite => ({
  id,
  name: id.toUpperCase(),
  label,
  widthPx,
  heightPx,
  footprintW,
  footprintH,
  sprite,
});

export const SPRITES9: GeneratedSprite[] = [
  entry('trophy_case', 'Trophy Case', 32, 48, 2, 1, TROPHY_CASE),
  entry('neon_shipped', 'Shipped Sign', 32, 32, 2, 1, NEON_SHIPPED),
  entry('duck_golden', 'Golden Duck', 16, 16, 1, 1, DUCK_GOLDEN),
  entry('disco_ball', 'Disco Ball', 16, 32, 1, 1, DISCO_BALL),
  entry('robot_statue', 'Robot Statue', 16, 32, 1, 1, ROBOT_STATUE),
];

validateSprites(SPRITES9);
