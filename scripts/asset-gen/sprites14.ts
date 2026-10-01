/**
 * sprites14.ts — Batch 14: wall decor & signage.
 *
 * Before this batch the walls had ten things to hang on them, and most
 * offices ended up as window, whiteboard, window, clock. This batch gives
 * walls a personality: art (a gilt-framed landscape, a Mondrian with a
 * fresh paint drip, a regal capybara portrait wearing a yuzu), maps and
 * views (a pinned world map with a trip note, a brass porthole onto the
 * sea), building kit that makes a room feel inhabited (an AC unit with
 * ribbons blowing off it, a fire extinguisher with its inspection tag, an
 * EXIT sign, a thermostat somebody has taped a note over), and things
 * people put up themselves (party bunting, a rocket "SHIP" poster with a
 * peeling corner, coat hooks with somebody's jacket, scarf, cap and
 * shopping tote, a rubber duck mounted like a hunting trophy, a cuckoo
 * clock with the bird mid-call, fairy lights with one bulb dead).
 *
 * The showpiece is deploy_board — a 3-wide split-flap departures board
 * for releases: header, four flights of flaps, round status lamps (one
 * RED, one flap caught mid-flip). Build a war room around it, with the
 * andon light on red and the "DAYS since last incident" sign reading 0.
 *
 * A little signage reaches the floor (a wet-floor A-frame next to its
 * puddle, a café chalkboard), and two cheap desk-clutter items ship for
 * surfaces (a photo of someone's cat, a brass nameplate).
 *
 * Same conventions as batches 6–9: house palette only, light from the
 * top-left, 1px outline in a darker shade of the material, short front
 * faces. Wall pieces are 32px tall (the whole wall face: the footprint's
 * wall tile plus the 16px above it) and keep their top 3 rows clear for
 * the wall cap. Pieces with a back view share a groupId with their front.
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

/** A tiny drawing surface over a char grid (inclusive coordinates). */
class Canvas {
  readonly g: string[][];
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.g = blank(w, h);
  }
  set(r: number, c: number, ch: string): void {
    if (r >= 0 && r < this.h && c >= 0 && c < this.w) this.g[r][c] = ch;
  }
  get(r: number, c: number): string {
    return this.g[r]?.[c] ?? '.';
  }
  rect(r0: number, c0: number, r1: number, c1: number, ch: string): void {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.set(r, c, ch);
  }
  frame(r0: number, c0: number, r1: number, c1: number, ch: string): void {
    for (let c = c0; c <= c1; c++) {
      this.set(r0, c, ch);
      this.set(r1, c, ch);
    }
    for (let r = r0; r <= r1; r++) {
      this.set(r, c0, ch);
      this.set(r, c1, ch);
    }
  }
  /** Stamp an ASCII picture; '.' leaves the canvas alone. */
  stamp(rows: string[], r0: number, c0: number, map: Legend = {}): void {
    rows.forEach((row, dr) =>
      [...row].forEach((ch, dc) => {
        if (ch !== '.') this.set(r0 + dr, c0 + dc, map[ch] ?? ch);
      }),
    );
  }
  /** Straight line between two points (inclusive). */
  line(r0: number, c0: number, r1: number, c1: number, ch: string): void {
    const n = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0), 1);
    for (let i = 0; i <= n; i++)
      this.set(Math.round(r0 + ((r1 - r0) * i) / n), Math.round(c0 + ((c1 - c0) * i) / n), ch);
  }
  done(legend: Legend): string[][] {
    return compile(this.g, legend);
  }
}

/** 3x5 pixel font for the few words that are big enough to read. */
const FONT5: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['#', '#', '#', '#', '#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'],
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
};
/** 3x3 micro font for the split-flap board (one glyph per 3x3 flap). */
const FONT3: Record<string, string[]> = {
  A: ['.#.', '###', '#.#'],
  C: ['###', '#..', '###'],
  D: ['##.', '#.#', '##.'],
  H: ['#.#', '###', '#.#'],
  I: ['###', '.#.', '###'],
  P: ['###', '###', '#..'],
  T: ['###', '.#.', '.#.'],
  U: ['#.#', '#.#', '###'],
  '0': ['###', '#.#', '###'],
  '1': ['##.', '.#.', '###'],
  '4': ['#.#', '###', '..#'],
  '7': ['###', '..#', '..#'],
};

function writeText(
  cv: Canvas,
  font: Record<string, string[]>,
  text: string,
  r0: number,
  c0: number,
  ch: string,
) {
  let c = c0;
  for (const letter of text) {
    if (letter === ' ') {
      c += 2;
      continue;
    }
    const glyph = font[letter];
    cv.stamp(glyph, r0, c, { '#': ch });
    c += glyph[0].length + 1;
  }
}

/** Round status lamp: lit core top-left, darker rim on the bottom and right. */
const LAMP = ['XXx', 'XXx', 'xx.'];

// ════════════════════════════════════════════════════════════════
// 1. deploy_board — SHOWPIECE. Split-flap departures board for
//    releases, 48x32, 3x1 wall item. Iron casing hung on two rods,
//    a navy "DEPLOYS" header with a red on-air lamp, and four flights
//    (service name + time) on dark flaps, each ending in a round status
//    lamp: AUTH and API green, CHAT red (delayed), DATA amber with its
//    first time flap caught mid-flip — the board is updating as you
//    look at it.
// ════════════════════════════════════════════════════════════════
/** One frame of the board: `flipping` = DATA's first time flap caught
 *  mid-flip (the still), `onAir` = the header lamp lit, `chatLit` = CHAT's
 *  red "delayed" lamp lit. */
function deployBoard(flipping: boolean, onAir: boolean, chatLit: boolean): string[][] {
  const cv = new Canvas(48, 32);
  // hanging rods (below the wall cap) with lit mounting points
  for (const c of [9, 38]) {
    cv.set(3, c, 's');
    cv.set(3, c - 1, 'I');
  }
  // casing rows 4-29
  cv.rect(4, 1, 29, 46, 'k');
  cv.frame(4, 1, 29, 46, 'o');
  for (let c = 2; c <= 45; c++) cv.set(5, c, 'i');
  for (let r = 5; r <= 28; r++) cv.set(r, 2, 'i');
  // header band rows 6-11, "DEPLOYS" in the 3x5 font
  cv.rect(6, 4, 11, 43, 'n');
  for (let c = 4; c <= 43; c++) cv.set(11, c, 'N');
  writeText(cv, FONT5, 'DEPLOYS', 6, 6, 'p');
  // on-air lamp
  cv.stamp(LAMP, 7, 38, onAir ? { X: 'P', x: 'r' } : { X: 'r', x: 'D' });
  // flights
  const flights: Array<[string, string, string]> = [
    ['AUTH', '10', 'g'],
    ['API', '11', 'g'],
    ['CHAT', '14', 'r'],
    ['DATA', '17', 'a'],
  ];
  const cols = [0, 1, 2, 3, 4, 5].map((i) => 4 + i * 4).concat([30, 34]);
  flights.forEach(([name, time, lamp], row) => {
    const r = 13 + row * 4;
    // dark band behind the flaps
    cv.rect(r - 1, 3, r + 3, 44, 'o');
    const text = name.padEnd(6, ' ') + time;
    [...text].forEach((ch, i) => {
      const c = cols[i];
      // flap tile; the middle row is the split, a shade darker
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++) cv.set(r + dr, c + dc, dr === 1 ? 'k' : 'i');
      const glyph = FONT3[ch];
      if (glyph) cv.stamp(glyph, r, c, { '#': i >= 6 ? 'p' : 'y' });
    });
    const lit = lamp === 'r' ? 'P' : lamp === 'g' ? 'G' : 'Y';
    if (lamp === 'r' && !chatLit) cv.stamp(LAMP, r, 40, { X: 'r', x: 'D' });
    else cv.stamp(LAMP, r, 40, { X: lit, x: lamp });
  });
  // mid-flip: DATA's first time digit. The bottom half of the glyph
  // stays; the upper leaf has tipped towards us, poking 1px up into
  // the dark band above.
  const fr = 13 + 3 * 4;
  if (flipping) {
    cv.rect(fr - 1, 30, fr - 1, 32, 'l');
    cv.rect(fr, 30, fr, 32, 's');
  }
  // underside shadow of the casing
  for (let c = 3; c <= 45; c++) cv.set(30, c, 'o');
  return cv.done({
    o: INK,
    k: IRON_DARK,
    i: IRON,
    I: IRON,
    s: STEEL_DARK,
    l: STEEL_LIGHT,
    n: NAVY,
    N: NAVY_DARK,
    p: PAPER,
    g: LED_GREEN,
    G: GREEN_LIGHT,
    y: GOLD_LIGHT,
    a: AMBER,
    Y: GOLD_LIGHT,
    r: RED,
    P: PINK_LIGHT,
    D: BRICK_DARK,
  });
}
const DEPLOY_BOARD = deployBoard(true, true, true);
/** The board updating: the flap finishes its flip, then the on-air lamp
 *  blinks every frame and CHAT's delayed lamp at half that rate, so both
 *  rhythms stay even across the wrap back to the still (8 frames total). */
const DEPLOY_BOARD_FRAMES = [
  deployBoard(false, false, true),
  deployBoard(false, true, false),
  deployBoard(false, false, false),
  deployBoard(false, true, true),
  deployBoard(false, false, true),
  deployBoard(false, true, false),
  deployBoard(false, false, false),
];

// ════════════════════════════════════════════════════════════════
// 2. painting_landscape — gilt-framed oil painting, 32x32, 2x1 wall.
//    Sunset over snowy mountains and a lake with the sun's reflection,
//    a pine on the near shore; picture wire up to a nail, and a small
//    brass museum plaque under the frame.
// ════════════════════════════════════════════════════════════════
const PAINTING_LANDSCAPE = (() => {
  const cv = new Canvas(32, 32);
  // nail + wire
  cv.set(3, 15, 's');
  cv.set(3, 16, 's');
  for (let i = 1; i <= 8; i++) {
    cv.set(3 + Math.floor(i / 4), 15 - i, 'w');
    cv.set(3 + Math.floor(i / 4), 16 + i, 'w');
  }
  // frame rows 5-26: lit top/left, shadowed right/bottom
  cv.rect(5, 1, 26, 30, 'G');
  cv.frame(5, 1, 26, 30, 'd');
  for (let c = 2; c <= 29; c++) cv.set(6, c, 'H');
  for (let r = 6; r <= 25; r++) cv.set(r, 2, 'H');
  for (let r = 7; r <= 25; r++) cv.set(r, 29, 'd');
  for (let c = 3; c <= 29; c++) cv.set(25, c, 'd');
  // liner
  cv.frame(8, 4, 23, 27, 'D');
  // canvas rows 9-22, cols 5-26: sunset sky in solid bands —
  // blue, then a pink band, then cream down to the peaks
  for (let r = 9; r <= 22; r++)
    for (let c = 5; c <= 26; c++) cv.set(r, c, r <= 10 ? 'b' : r <= 12 ? 'k' : 'q');
  // sun, left of the V so it sits clear of the right peak's snowcap
  // (the left mountain covers its lower-left)
  for (let r = 10; r <= 16; r++)
    for (let c = 11; c <= 19; c++) {
      const d = (r - 13) ** 2 + (c - 15) ** 2;
      if (d <= 8) cv.set(r, c, d <= 4 ? 'y' : 'q');
    }
  // mountains: two peaks
  const peak = (pc: number, pr: number, half: number) => {
    for (let c = pc - half; c <= pc + half; c++) {
      const top = pr + Math.abs(c - pc);
      for (let r = top; r <= 18; r++) {
        if (c < 5 || c > 26) continue;
        const snow = r <= pr + 1 + (c % 2);
        cv.set(r, c, snow ? 'p' : c <= pc ? 't' : 'T');
      }
    }
  };
  peak(11, 11, 8);
  peak(21, 13, 7);
  // lake
  for (let r = 19; r <= 22; r++) for (let c = 5; c <= 26; c++) cv.set(r, c, r === 19 ? 'K' : 'B');
  // sun reflection dashes
  cv.rect(20, 14, 20, 17, 'y');
  cv.rect(21, 15, 21, 16, 'Y');
  cv.rect(22, 14, 22, 15, 'y');
  // pine on the near shore
  cv.stamp(['..L..', '.LLL.', '..L..', '.LLL.', 'LLLLL', '..w..'], 15, 6, { L: 'L', w: 'D' });
  // plaque, clear of the frame
  cv.rect(28, 13, 28, 18, 'Y');
  cv.rect(29, 13, 29, 18, 'd');
  cv.set(28, 15, 'D');
  cv.set(28, 16, 'D');
  return cv.done({
    s: STEEL,
    w: STEEL_LIGHT,
    G: GOLD,
    H: GOLD_LIGHT,
    d: GOLD_DARK,
    D: WOOD_DARK,
    b: SKY,
    k: PINK_LIGHT,
    q: CREAM,
    y: LAMP_WARM,
    Y: GOLD_LIGHT,
    p: PAPER,
    t: STONE,
    T: STONE_DARK,
    K: SKY,
    B: BLUE,
    L: LEAF_DARK,
  });
})();

// ════════════════════════════════════════════════════════════════
// 3. art_abstract — Mondrian-style stretched canvas, 16x32, 1x1 wall.
//    Unframed: the canvas edge shows its depth on the right and bottom.
//    The red block's paint is still wet — a drip runs down, with one
//    drop already falling.
// ════════════════════════════════════════════════════════════════
const ART_ABSTRACT = fromAscii(
  [
    '................',
    '................',
    '................',
    '................',
    '..ooooooooooooo.',
    '..oRRRRRkpppppoc',
    '..oRRRRRkpppppoc',
    '..oRRRRRkpppppoc',
    '..oRRRRRkpppppoc',
    '..oRRRRRkpppppoc',
    '..oRRRRRkpppppoc',
    '..okkkkkkkkkkkoc',
    '..opppkpppppppoc',
    '..opppkpppppppoc',
    '..opppkpppppppoc',
    '..okkkkpppppppoc',
    '..oYYYkpppppppoc',
    '..oYYYkkkkkkkkoc',
    '..oYYYkppkBBBBoc',
    '..okkkkppkBBBBoc',
    '..opppkppkBBBBoc',
    '..opppkppkBBBBoc',
    '..opppkppkBBBBoc',
    '..oooooooooooooc',
    '...ccccccccccccc',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ].map((r, i) => {
    // wet drip from the red block running down the white panel below it,
    // swelling into a 2px droplet at its tip (the yellow stays clean)
    if (i === 12 || i === 13) return r.substring(0, 4) + 'R' + r.substring(5);
    if (i === 14) return r.substring(0, 4) + 'Rr' + r.substring(6);
    return r;
  }),
  { o: CREAM_DARK, c: SCREEN_SHADOW, p: PAPER, k: INK, R: RED, r: BRICK_DARK, Y: GOLD, B: BLUE },
);

// ════════════════════════════════════════════════════════════════
// 4. portrait_capy — "Portrait of a Capybara", 16x32, 1x1 wall.
//    Gold frame with lit corner bosses, a deep teal ground, and a
//    capybara in profile — blunt square snout, high eye with a
//    catch-light, little round ear at the back — utterly calm with a
//    yuzu balanced on its head. Brass title plate below.
// ════════════════════════════════════════════════════════════════
const PORTRAIT_CAPY = (() => {
  const inner = [
    'nnnblnnnnn',
    'nnhOOOnnnn',
    'nOOOOOOnnn',
    'nnooooonEn',
    'SSSSSSSSEE',
    'bLLLLLkpLe',
    'LLLLLLLLLe',
    'LLLLLLLLBe',
    'bbbbLLLBBB',
    'nnnbLLBBBB',
    'nnnBLLBBBB',
    'nnBBLLBBBb',
    'nnBBBLBBBb',
    'nBBBBBBBBb',
    'nBBBBBBBbb',
    'BBBBBBBBbb',
  ];
  const rows: string[] = [];
  for (let r = 0; r < 32; r++) {
    if (r === 3) rows.push('.......ss.......');
    else if (r === 4) rows.push('......s..s......');
    else if (r === 5) rows.push('.HdGGGGGGGGGGdH.');
    else if (r === 6) rows.push('.dHHHHHHHHHHHGd.');
    else if (r >= 7 && r <= 22) rows.push('.dH' + inner[r - 7] + 'Gd.');
    else if (r === 23) rows.push('.dGGGGGGGGGGGGd.');
    else if (r === 24) rows.push('.HddddddddddddH.');
    else if (r === 26) rows.push('.....dYYYYd.....');
    else rows.push('................');
  }
  return fromAscii(rows, {
    s: STEEL_LIGHT,
    d: GOLD_DARK,
    G: GOLD,
    H: GOLD_LIGHT,
    n: TEAL_DARK,
    L: WOOD_LIGHT,
    S: WOOD_SURFACE,
    B: WOOD,
    b: WOOD_DARK,
    e: WOOD_DARK,
    E: WOOD_SHADOW,
    k: INK,
    p: PAPER,
    O: ORANGE,
    o: CLAY,
    h: GOLD_LIGHT,
    l: GREEN_LIGHT,
    Y: GOLD_LIGHT,
  });
})();

// ════════════════════════════════════════════════════════════════
// 5. world_map — pinned world map, 32x32, 2x1 wall. Thin wood frame,
//    ocean in two blues, simplified continents and an ice shelf, a red
//    string trip line pinned between three cities, and a sticky note
//    taped over the corner.
// ════════════════════════════════════════════════════════════════
const WORLD_MAP = (() => {
  const cv = new Canvas(32, 32);
  cv.rect(4, 1, 25, 30, 'b');
  cv.frame(4, 1, 25, 30, 'D');
  for (let c = 2; c <= 29; c++) cv.set(5, c, 'W');
  for (let r = 5; r <= 24; r++) cv.set(r, 2, 'W');
  // latitude hint (lighter ocean band)
  for (let c = 3; c <= 29; c++) if (c % 2) cv.set(15, c, 'K');
  // continents (map area rows 6-24, cols 3-29)
  const land = [
    '...........................',
    '..gggg.......ggg.ggggggg...',
    '.ggggggg....gggggggggggggg.',
    '..ggggggg...ggg.gggggggggg.',
    '...gggggg...gg..ggggggggg..',
    '....gggg....ggggggggggggg..',
    '.....gg.....gggggg.ggggg...',
    '......g....gggggggg..gg....',
    '.......gg..ggggggg...g.....',
    '.......ggg..gggggg.........',
    '.......gggg..gggg.......g..',
    '........ggg..ggg.......ggg.',
    '........gg...gg.......gggg.',
    '........g.............ggg..',
    '.......................g...',
  ];
  land.forEach((row, dr) =>
    [...row].forEach((ch, dc) => {
      if (ch === 'g') cv.set(6 + dr, 3 + dc, 'g');
    }),
  );
  // shade continents: dark along the bottom coast, light along the top
  const g2 = cv.g.map((r) => [...r]);
  for (let r = 6; r <= 24; r++)
    for (let c = 3; c <= 29; c++) {
      if (g2[r][c] !== 'g') continue;
      if (g2[r + 1]?.[c] !== 'g') cv.set(r, c, 'L');
      else if (g2[r - 1]?.[c] !== 'g') cv.set(r, c, 'l');
    }
  // Antarctica: a ragged ice shelf along the bottom
  for (let c = 4; c <= 28; c++) {
    if (c % 5 !== 2) cv.set(23, c, 'p');
    cv.set(24, c, 'i');
  }
  for (const c of [7, 8, 15, 21, 22]) cv.set(22, c, 'p');
  // trip string first, pins on top
  cv.line(9, 7, 10, 19, 'R');
  cv.line(10, 19, 17, 26, 'R');
  const pins: Array<[number, number, string]> = [
    [9, 7, 'r'],
    [10, 19, 'y'],
    [12, 25, 't'],
    [17, 26, 'r'],
    [16, 11, 'P'],
  ];
  for (const [r, c, col] of pins) {
    cv.rect(r - 1, c - 1, r, c, col);
    cv.set(r + 1, c, 'k');
  }
  // sticky note "trip" label taped over the top-right corner
  cv.stamp(['qqq', 'qmQ'], 3, 27);
  return cv.done({
    D: WOOD_DARK,
    W: WOOD,
    b: BLUE,
    K: SKY,
    g: LEAF,
    l: GREEN_LIGHT,
    L: LEAF_DARK,
    p: PAPER,
    i: ICE,
    r: RED,
    R: RED,
    y: GOLD,
    t: TEAL_LIGHT,
    P: PINK,
    k: IRON_DARK,
    q: CREAM,
    Q: CREAM_DARK,
    m: WOOD_DARK,
  });
})();

// ════════════════════════════════════════════════════════════════
// 6. porthole — round brass porthole, 16x32, 1x1 wall. A slim bolted
//    brass ring lit from the top-left, and a wide view of the sea: sky
//    with a cloud, a horizon, water deepening to navy with an orange
//    fish trailing bubbles, and a glare at the top-left of the glass.
// ════════════════════════════════════════════════════════════════
const PORTHOLE = (() => {
  const cv = new Canvas(16, 32);
  // a clean 14px disc: rows 7-20, cols 1-14 (centre on the pixel seam)
  const cr = 13.5;
  const cc = 7.5;
  for (let r = 0; r < 32; r++)
    for (let c = 0; c < 16; c++) {
      const d = Math.sqrt((r - cr) ** 2 + (c - cc) ** 2);
      const lit = r + c < cr + cc;
      if (d > 7) continue;
      if (d > 6.2) cv.set(r, c, lit ? 'd' : 'w');
      else if (d > 4.9) cv.set(r, c, lit ? 'G' : 'd');
      else if (r <= 11) cv.set(r, c, 's');
      else if (r === 12) cv.set(r, c, 'i');
      else cv.set(r, c, r <= 15 ? 'b' : 'B');
    }
  // highlight arc on the lit brass
  cv.set(9, 3, 'H');
  cv.set(8, 4, 'H');
  // four rivets at N/E/S/W, a shade darker than the brass they sit on
  for (const [r, c] of [
    [8, 7],
    [13, 13],
    [19, 8],
    [14, 2],
  ])
    cv.set(r, c, cv.get(r, c) === 'G' ? 'd' : 'w');
  // cloud
  cv.stamp(['.pp.', 'pppp'], 10, 8);
  // 2px glint, top-left of the glass
  cv.set(10, 5, 'p');
  cv.set(11, 4, 'p');
  // fish in the deep water, bubbles rising above it
  cv.stamp(['OOo'], 17, 6);
  cv.set(15, 6, 'i');
  cv.set(13, 5, 'p');
  return cv.done({
    w: WOOD_DARK,
    d: GOLD_DARK,
    G: GOLD,
    H: GOLD_LIGHT,
    s: SKY,
    i: ICE,
    b: BLUE,
    B: NAVY,
    O: ORANGE,
    o: CLAY,
    k: INK,
    p: PAPER,
  });
})();

// ════════════════════════════════════════════════════════════════
// 7. ac_unit — split air-con head unit, 32x32, 2x1 wall. Long white
//    body lit along the top, a louvre flap open at the bottom, a green
//    power LED and a "21" readout, and two ribbons tied to the louvre
//    streaming out in the draught. One drop of condensation.
// ════════════════════════════════════════════════════════════════
/** How far each ribbon has dropped below its knot, column by column, as
 *  the draught gusts (frame 0 first). */
const RIBBON_GUSTS = [
  [0, 1, 1, 1, 2, 2, 3, 3],
  [0, 1, 1, 2, 2, 3, 3, 4],
  [0, 1, 1, 1, 2, 2, 3, 3],
  [0, 0, 1, 1, 1, 2, 2, 2],
];

/** The AC unit at frame `t`: the two ribbons flutter out of step and the
 *  condensation drop falls. */
function acUnit(t: number): string[][] {
  const cv = new Canvas(32, 32);
  cv.rect(5, 1, 15, 30, 'p');
  cv.frame(5, 1, 15, 30, 's');
  // top-lit body: paper above the seam, ice-tinted below
  for (let c = 2; c <= 29; c++) {
    cv.set(11, c, 'S');
    cv.set(12, c, 'i');
    cv.set(13, c, 'i');
  }
  // vent slots on the top
  for (let c = 4; c <= 17; c += 2) cv.set(7, c, 'S');
  // readout panel "21" + power LED
  cv.rect(7, 20, 11, 26, 'n');
  cv.stamp(['##.', '.#.', '.##'], 8, 21, { '#': 'y' });
  for (let r = 8; r <= 10; r++) cv.set(r, 25, 'y');
  cv.set(9, 28, 'g');
  // louvre: the open flap below the body
  for (let c = 3; c <= 28; c++) {
    cv.set(14, c, 'k');
    cv.set(15, c, 's');
    cv.set(16, c, 'i');
  }
  cv.set(16, 2, 's');
  cv.set(16, 29, 's');
  // ribbons: knotted under the louvre, hang 2 rows, then blow down-right
  // in one gentle S; light tone on the upper edge, dark on the lower.
  const ribbon = (c0: number, lt: string, dk: string, drop: number[]) => {
    cv.set(17, c0, dk);
    for (const r of [18, 19]) {
      cv.set(r, c0, lt);
      cv.set(r, c0 + 1, dk);
    }
    drop.forEach((d, i) => {
      const r = 19 + d;
      const c = c0 + 1 + i;
      cv.set(r, c, lt);
      cv.set(r + 1, c, dk);
    });
  };
  ribbon(8, 't', 'T', RIBBON_GUSTS[t]);
  ribbon(19, 'm', 'K', RIBBON_GUSTS[(4 - t) % 4]);
  // draught dashes, parallel to the ribbons
  cv.line(19, 12, 20, 14, 'I');
  cv.line(19, 23, 20, 25, 'I');
  // condensation drip under the right end
  // (the drop forms under the bead, falls, and a new one forms)
  cv.set(17, 28, 'I');
  cv.set([19, 21, 23, 18][t], 28, 'I');
  return cv.done({
    p: PAPER,
    s: SILVER,
    S: SILVER_LIGHT,
    i: ICE,
    k: SILVER,
    n: SCREEN_SHADOW,
    y: LED_GREEN,
    g: GREEN_LIGHT,
    I: ICE,
    t: TEAL,
    T: TEAL_DARK,
    m: PINK,
    K: PINK_DARK,
  });
}
const AC_UNIT = acUnit(0);
const AC_UNIT_FRAMES = [1, 2, 3].map((t) => acUnit(t));

// ════════════════════════════════════════════════════════════════
// 8. bunting — party bunting, 32x32, 2x1 wall. Two sagging strings of
//    triangular pennants in the accent colours, lit on their top-left;
//    one flag on the lower strand has twisted edge-on, and the lower
//    string's loose end droops off the left.
// ════════════════════════════════════════════════════════════════
const BUNTING = (() => {
  const cv = new Canvas(32, 32);
  const COLORS: Array<[string, string, string]> = [
    ['R', 'r', 'h'],
    ['Y', 'y', 'H'],
    ['T', 't', 'u'],
    ['P', 'p', 'v'],
    ['B', 'b', 'w'],
  ];
  const strand = (top: number, sag: number, phase: number, twistAt = -1, c0s = 1, c1s = 30) => {
    const rowAt = (c: number) => top + Math.round(sag * (1 - ((c - 15.5) / 14.5) ** 2));
    for (let c = c0s; c <= c1s; c++) cv.set(rowAt(c), c, 's');
    let k = phase;
    let n = 0;
    for (let c0 = 3 + phase * 3; c0 + 4 < 30; c0 += 6) {
      const [fill, dark, light] = COLORS[k++ % COLORS.length];
      const r0 = rowAt(c0 + 2) + 1;
      if (n++ === twistAt) {
        // edge-on: a thin sliver in the dark tone
        for (let dr = 0; dr < 5; dr++) {
          cv.set(r0 + dr, c0 + 2, dark);
          if (dr < 3) cv.set(r0 + dr, c0 + 3, dark);
        }
        continue;
      }
      // a clean pennant: rows 5,4,3,2,1 wide, the right half in shade,
      // the top-left corner catching the light
      const tri = ['#####', '####.', '.###.', '.##..', '..#..'];
      tri.forEach((row, dr) =>
        [...row].forEach((ch, dc) => {
          if (ch !== '#') return;
          const lit = dr === 0 && dc <= 1;
          cv.set(r0 + dr, c0 + dc, lit ? light : dc >= 3 ? dark : fill);
        }),
      );
    }
    return rowAt;
  };
  const upper = strand(4, 4, 0);
  const lower = strand(14, 3, 1, 2, 1, 30);
  // the strings are tied off on grey nails at the wall
  for (const c of [0, 31]) {
    cv.set(upper(c === 0 ? 1 : 30), c, 'n');
    if (c === 31) cv.set(lower(30), c, 'n');
  }
  // the lower string's left knot has slipped: its end droops free
  const r0 = lower(1);
  cv.set(r0, 1, '.');
  cv.set(r0, 2, '.');
  cv.set(r0 + 1, 2, 's');
  cv.set(r0 + 2, 2, 's');
  cv.set(r0 + 3, 1, 's');
  return cv.done({
    s: WOOD_DARK,
    n: STEEL_LIGHT,
    R: RED,
    r: BRICK_DARK,
    h: PINK,
    Y: GOLD,
    y: GOLD_DARK,
    H: GOLD_LIGHT,
    T: TEAL,
    t: TEAL_DARK,
    u: TEAL_LIGHT,
    P: PINK,
    p: PINK_DARK,
    v: PINK_LIGHT,
    B: BLUE,
    b: NAVY,
    w: SKY,
  });
})();

// ════════════════════════════════════════════════════════════════
// 9. exit_sign — EXIT lightbox, 16x32, 1x1 wall, hung high on two
//    rods: green face lit along the top, paper lettering, a running
//    figure heading for a door arrow, and a steel bottom lip.
// ════════════════════════════════════════════════════════════════
const EXIT_SIGN = (() => {
  const cv = new Canvas(16, 32);
  cv.set(3, 4, 's');
  cv.set(3, 11, 's');
  cv.rect(4, 1, 18, 14, 'g');
  cv.frame(4, 1, 18, 14, 'o');
  for (let c = 2; c <= 13; c++) cv.set(5, c, 'G');
  // narrow E so the word fits inside the inset box
  writeText(cv, { ...FONT5, E: ['##', '#.', '##', '#.', '##'] }, 'EXIT', 6, 2, 'p');
  // running stick figure heading for the arrow: head, a body slanting
  // forward, the back arm out behind, one leg back and one forward
  cv.stamp(['....#', '.###.', '..#.#', '.#.#.', '#...#'], 12, 2, { '#': 'p' });
  // arrow
  cv.stamp(['..#..', '...#.', '#####', '...#.', '..#..'], 12, 9, { '#': 'p' });
  // lightbox lip
  for (let c = 2; c <= 13; c++) cv.set(19, c, 'l');
  // the lit face spills a faint green glow onto the wall below
  for (let c = 4; c <= 11; c++) cv.set(20, c, 'L');
  return cv.done({
    s: STEEL_DARK,
    l: STEEL,
    o: LEAF_DARK,
    g: LEAF,
    G: GREEN,
    L: GREEN_LIGHT,
    p: PAPER,
  });
})();

// ════════════════════════════════════════════════════════════════
// 10. fire_extinguisher — wall-bracketed extinguisher, 16x32, 1x1
//     wall. A red flame sign above; the bottle on two steel straps
//     with a pressure gauge (needle in the green), black hose and
//     nozzle, a paper instruction label, and a yellow inspection tag
//     dangling on a string.
// ════════════════════════════════════════════════════════════════
const FIRE_EXTINGUISHER = fromAscii(
  [
    '................',
    '................',
    '................',
    '....oooooooo....',
    '....oRRpRRRo....',
    '....oRppRpRo....',
    '....oRpyypRo....',
    '....oRRppRRo....',
    '....oooooooo....',
    '................',
    '......kkkk......',
    '.....kiiiikkk...',
    '......wgnw...k..',
    '......wppw...k..',
    '.....oooooo..k..',
    '....oPRRRRRo.k..',
    '....ssssssssk...',
    '....oPRRRRRok...',
    '....oPppppRok...',
    '....oPpkkpRo.k..',
    '....oPppppRo.k..',
    '....oPpkppRo.K..',
    '....oPppppRo.KK.',
    '....oPRRRRRoY...',
    '....oPRRRRRYYc..',
    '....ssssssssYc..',
    '....oPRRRRRo.c..',
    '....oRRRRRRo....',
    '.....oooooo.....',
    '................',
    '................',
    '................',
  ],
  {
    o: BRICK_DARK,
    R: RED,
    P: PINK,
    p: PAPER,
    y: LAMP_WARM,
    k: INK,
    K: IRON_DARK,
    i: IRON,
    w: STEEL_DARK,
    g: LED_GREEN,
    n: INK,
    s: STEEL,
    Y: GOLD,
    c: GOLD_DARK,
  },
);

// ════════════════════════════════════════════════════════════════
// 11. poster_ship — motivational poster, 16x32, 1x1 wall. A rocket
//     lifting off a cloud of smoke into a starry navy sky, "SHIP" in
//     the cream caption band, taped up at the corners — and the
//     bottom-right corner has come unstuck and is curling away.
// ════════════════════════════════════════════════════════════════
const POSTER_SHIP = (() => {
  const cv = new Canvas(16, 32);
  cv.rect(4, 0, 26, 15, 'n');
  cv.frame(4, 0, 26, 15, 'N');
  // stars, one of them twinkling
  for (const [r, c] of [
    [6, 3],
    [7, 12],
    [11, 13],
    [14, 3],
    [6, 8],
  ])
    cv.set(r, c, 'p');
  cv.stamp(['.p.', 'ppp', '.p.'], 8, 2);
  // rocket (cols 5-10)
  cv.stamp(
    ['..S.', '.SSs', '.SbS', '.SSs', '.SSs', 'RSSsR', 'RRsRR', '.yOy', '..yy', '.y..'],
    5,
    6,
  );
  // smoke cloud
  cv.stamp(['....cmc.....', '..cmmmmmc...', '.mmmmcmmmmm.', 'mmmmmmmmmmmm'], 15, 2);
  // caption
  cv.rect(19, 1, 25, 14, 'q');
  writeText(cv, FONT5, 'SHIP', 20, 1, 'k');
  // tape on three corners
  cv.rect(3, 0, 4, 1, 't');
  cv.rect(3, 14, 4, 15, 't');
  cv.rect(26, 0, 27, 1, 't');
  // the fourth corner peels: fold shows the paper's back, wall behind
  cv.stamp(['....Q', '...QQ', '..QQ.', '.Q...'], 23, 11);
  cv.set(26, 14, '.');
  cv.set(26, 15, '.');
  cv.set(25, 15, '.');
  cv.set(24, 15, '.');
  cv.set(26, 13, '.');
  cv.set(25, 14, 'Q');
  return cv.done({
    t: CREAM,
    N: NAVY_DARK,
    n: NAVY,
    p: PAPER,
    S: SILVER_LIGHT,
    s: SILVER,
    b: SKY,
    R: RED,
    y: LAMP_WARM,
    O: ORANGE,
    m: STONE,
    c: STONE_DARK,
    q: CREAM,
    k: NAVY_DARK,
    Q: CREAM_DARK,
  });
})();

// ════════════════════════════════════════════════════════════════
// 12. coat_hooks — wooden hook rail, 32x32, 2x1 wall, with today's
//     coats: a navy zip jacket, a red striped scarf draped over its
//     hook, a teal cap, and a cream tote bag with a leek sticking out.
// ════════════════════════════════════════════════════════════════
const COAT_HOOKS = (() => {
  const cv = new Canvas(32, 32);
  // rail rows 5-7
  for (let c = 1; c <= 30; c++) {
    cv.set(5, c, 'L');
    cv.set(6, c, 'W');
    cv.set(7, c, 'D');
  }
  cv.set(5, 1, 'D');
  cv.set(5, 30, 'D');
  cv.set(6, 1, 'D');
  cv.set(6, 30, 'D');
  for (const c of [3, 28]) cv.set(6, c, 'D'); // screws
  // hooks
  for (const c of [6, 13, 19, 25]) {
    cv.set(8, c, 'h');
    cv.set(9, c, 'h');
    cv.set(9, c + 1, 'h');
  }
  // jacket on hook 1 (cols 1-11)
  cv.stamp(
    [
      '....NnN....',
      '...NnnnN...',
      '..NnnznnN..',
      '.NnnnznnnN.',
      '.NnnnznnnN.',
      'NnnnnznnnnN',
      'NnNnnznnNnN',
      'NnNnnznnNnN',
      'NnNnnznnNnN',
      'NnNnnznnNnN',
      'NnNnnznnNnN',
      'NNNnnznnNNN',
      '.NNnnznnNN.',
      '..NnnznnN..',
      '..NnnznnN..',
      '..NNNNNNN..',
    ],
    10,
    1,
  );
  // top-left light on the collar and left shoulder
  cv.set(10, 6, 'a');
  cv.set(12, 3, 'a');
  for (let r = 13; r <= 16; r++) cv.set(r, 2, 'a');
  // scarf draped over hook 2: a U over the hook, two ends of different
  // length that kink 1px left halfway down, cream stripes, fringe.
  cv.rect(9, 12, 10, 15, 'R');
  cv.rect(11, 12, 11, 15, 'r');
  const scarfEnd = (c0: number, len: number) => {
    const kinkAt = 12 + Math.floor(len / 2);
    let last = 0;
    let col = c0;
    for (let r = 12; r < 12 + len; r++) {
      col = r >= kinkAt ? c0 - 1 : c0;
      const stripe = (r - 12) % 3 === 2;
      cv.set(r, col, stripe ? 'q' : 'R');
      cv.set(r, col + 1, stripe ? 'q' : 'r');
      last = r;
    }
    cv.set(last + 1, col, 'q');
    cv.set(last + 2, col + 1, 'q');
  };
  scarfEnd(14, 7);
  scarfEnd(12, 11);
  // tote on hook 4: strap triangle + bag + leek
  cv.stamp(['...c...', '..c.c..', '.c...c.', 'c.....c'], 10, 22);
  cv.rect(14, 21, 26, 29, 'q');
  cv.frame(14, 21, 26, 29, 'c');
  for (let r = 15; r <= 25; r++) cv.set(r, 22, 'Q');
  // logo heart
  cv.stamp(['P.P', 'PPP', '.P.'], 19, 24);
  // cap on hook 3: dome crown lit top-left, button, brim pointing left
  cv.stamp(['.....o...', '...ooooo.', '..oHHttto', '..oHtttto', '..otttttO', 'bbbooooOO'], 10, 15);
  // leek: fanned green leaves well above the bag mouth, white stalk
  cv.stamp(['g...G', '.g.G.', '.gGG.', '..gG.', '..gG.', '..pp.', '..pp.'], 8, 25);
  return cv.done({
    L: WOOD_LIGHT,
    W: WOOD,
    D: WOOD_DARK,
    h: GOLD_DARK,
    N: NAVY_DARK,
    n: NAVY,
    z: SILVER,
    a: BLUE,
    R: RED,
    r: BRICK_DARK,
    p: PAPER,
    o: TEAL_DARK,
    O: TEAL_DARK,
    b: TEAL_DARK,
    t: TEAL,
    H: TEAL_LIGHT,
    q: CREAM,
    Q: CREAM_DARK,
    c: CREAM_DARK,
    P: PINK,
    g: LEAF,
    G: LEAF_DARK,
  });
})();

// ════════════════════════════════════════════════════════════════
// 13. duck_trophy — a rubber duck mounted like a hunting trophy,
//     16x32, 1x1 wall: a mahogany shield plaque, the bright yellow
//     duck's round head jutting out of a collar, beak to the left,
//     and a small brass nameplate underneath.
// ════════════════════════════════════════════════════════════════
const DUCK_TROPHY = fromAscii(
  [
    '................',
    '................',
    '................',
    '................',
    '........kkk.....',
    '.......kHHYk....',
    '......kHYYYYk...',
    '......kYweYsk...',
    '...OOOkYYYYsk...',
    '....cckYYYssk...',
    '.......kYYsk....',
    '.......kYYsk....',
    '..dddddkkkkkdd..',
    '.dRRRRRRRRRRRRd.',
    '.dRMMMMMMMMMMMd.',
    '.dRMMMMMMMMMMMd.',
    '.dRMMMMMMMMMMMd.',
    '..dRMMMMMMMMMd..',
    '..dRMMMMMMMMMd..',
    '..dRMbbbbbbMMd..',
    '...dMgzzgggMd...',
    '...dMyyyyyyMd...',
    '....dMMMMMMd....',
    '.....dMMMMd.....',
    '......dddd......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  {
    k: GOLD_DARK,
    Y: LAMP_WARM,
    H: GOLD_LIGHT,
    s: GOLD,
    w: PAPER,
    e: INK,
    O: ORANGE,
    c: CLAY,
    d: WOOD_SHADOW,
    R: WOOD,
    M: WOOD_DARK,
    b: GOLD_LIGHT,
    g: GOLD,
    z: WOOD_SHADOW,
    y: GOLD_DARK,
  },
);

// ════════════════════════════════════════════════════════════════
// 14. cuckoo_clock — carved cuckoo clock, 16x32, 1x1 wall. Peaked
//     shingle roof with a carved leaf crest, the bird popped right out
//     of its door mid-call, a cream dial, and pine-cone weights on
//     chains hanging at two different heights beside a brass pendulum.
// ════════════════════════════════════════════════════════════════
/** The clock with its pendulum swung `swing` px (-1, 0, 1) at the bob. */
function cuckooClock(swing: number): string[][] {
  const rows = [
    '................',
    '................',
    '.......gg.......',
    '......gGGg......',
    '.......ss.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.ssssssssssssss.',
    '...dWWIIIWWDd...',
    '...dWWIIIWWDd...',
    '...dWWIIIWWDd...',
    '...dWWccccWDd...',
    '...dWcqqqqcDd...',
    '...dWcqkqqcDd...',
    '...dWcqqkkcDd...',
    '...dWcqqqqcDd...',
    '...dWWccccWDd...',
    '...dWWWWWWWDd...',
    '...dddddddddd...',
    '....n..b...n....',
    '...pPp.b...n....',
    '...pPp.b...n....',
    '...pPp.b...n....',
    '....p..b...n....',
    '......HBB.pPp...',
    '......BBB.pPp...',
    '..........pPp...',
    '...........p....',
    '................',
  ].map((r) => [...r]);
  // shingle roof, rows 5-9: horizontal courses, lit left slope
  for (let r = 5; r <= 9; r++) {
    const half = r - 4; // row 5 spans cols 6-9 ... row 9 spans 2-13
    const c0 = 7 - half;
    const c1 = 8 + half;
    for (let c = c0; c <= c1; c++) {
      if (c === c0 || c === c1) {
        rows[r][c] = 's';
        continue;
      }
      const lit = c <= 7;
      const course = r % 2 === 1;
      const mark = (c + r * 2) % 3 === 0;
      rows[r][c] = lit ? (mark ? 'D' : course ? 'L' : 'W') : mark ? 's' : course ? 'W' : 'D';
    }
  }
  // the cuckoo, out of its door: head past the case's left side, beak open
  const bird: Array<[number, number, string]> = [
    [10, 0, 'O'],
    [12, 0, 'O'],
    [11, 1, 'Y'],
    [11, 2, 'k'],
    [11, 3, 'Y'],
    [10, 2, 'Y'],
    [10, 3, 'Y'],
    [12, 2, 'y'],
    [12, 3, 'Y'],
    [12, 4, 'Y'],
    [12, 5, 'Y'],
    [12, 6, 'y'],
    [13, 3, 'y'],
    [13, 4, 'y'],
  ];
  for (const [r, c, ch] of bird) rows[r][c] = ch;
  // pendulum: the rod hangs from the case at col 7; swung, its lower two
  // rows and the bob shift sideways (the pivot never moves)
  if (swing !== 0) {
    for (const r of [25, 26]) rows[r][7] = '.';
    for (const r of [27, 28]) for (let c = 6; c <= 8; c++) rows[r][c] = '.';
    // swung, the bob narrows to 2px on the inner side of the rod, so the
    // right swing (x7..8) keeps a 1px gap before the right weight at x10
    // and the left swing (x6..7) mirrors it about the pivot column
    for (const r of [25, 26]) rows[r][7 + swing] = 'b';
    const c0 = swing > 0 ? 7 : 6;
    rows[27].splice(c0, 2, 'H', 'B');
    rows[28].splice(c0, 2, 'B', 'B');
  }
  return fromAscii(
    rows.map((r) => r.join('')),
    {
      g: LEAF,
      G: LEAF_DARK,
      s: WOOD_SHADOW,
      L: WOOD_LIGHT,
      D: WOOD_DARK,
      d: WOOD_DARK,
      W: WOOD,
      I: INK,
      k: INK,
      y: GOLD,
      Y: GOLD_LIGHT,
      O: ORANGE,
      c: GOLD_DARK,
      q: CREAM,
      n: STEEL,
      b: GOLD_DARK,
      H: GOLD_LIGHT,
      B: GOLD,
      p: WOOD_SHADOW,
      P: WOOD_DARK,
    },
  );
}
const CUCKOO_CLOCK = cuckooClock(0);
/** Tick, tock: the pendulum swings right, back through centre, left. */
const CUCKOO_CLOCK_FRAMES = [1, 0, -1].map((d) => cuckooClock(d));

// ════════════════════════════════════════════════════════════════
// 15. thermostat — round-dial wall thermostat, 16x16, 1x1 wall. One
//     cream unit (lit top-left, darker cream outline) with a silver
//     dial, an orange setpoint pointer and a dark centre knob — and a
//     yellow sticky note taped over its corner: "don't touch".
// ════════════════════════════════════════════════════════════════
const THERMOSTAT = fromAscii(
  [
    '................',
    '................',
    '................',
    '....QQQQQQQ.....',
    '...QpphhhppQ....',
    '...QphpTpSqQ....',
    '...QphpkpSqQ....',
    '...QphpppStt....',
    '...QqqSSSyyyy...',
    '....QQQQQykky...',
    '.........yyyy...',
    '.........yyyY...',
    '................',
    '................',
    '................',
    '................',
  ],
  {
    Q: CREAM_DARK,
    q: CREAM,
    p: PAPER,
    h: SILVER_LIGHT,
    S: SILVER,
    T: ORANGE,
    k: INK,
    t: ICE,
    y: GOLD_LIGHT,
    Y: LAMP_WARM,
  },
);

// ════════════════════════════════════════════════════════════════
// 16. wet_floor_sign — yellow A-frame caution sign, 16x16, 1x1 floor
//     (misc), knee-high next to a person. Handle slot at the top, lit
//     left edge, the classic slipping figure (leaning back, arm flung
//     up, one leg shot out forward) — and the puddle it is warning
//     about. The back view is the plain yellow rear panel.
// ════════════════════════════════════════════════════════════════
const WET_FLOOR_FRAME = [
  '................',
  '......kkkk......',
  '......k..k......',
  '.....kHYYYk.....',
  '.....kHYYYk.....',
  '....kHYYYYYk....',
  '....kHYYYYYk....',
  '...kHYYYYYYYk...',
  '...kHYYYYYYYk...',
  '..kHYYYYYYYYYk..',
  '..kHYYYYYYYYYk..',
  '.kHYYYYYYYYYYYk.',
  '.kkkkkkkkkkkkkk.',
  '.dd...Isssss.dd.',
  '....sssssssss...',
  '......sssss.....',
];
const WET_FLOOR_LEGEND: Legend = {
  k: GOLD_DARK,
  Y: GOLD,
  H: GOLD_LIGHT,
  g: INK,
  d: IRON_DARK,
  s: SKY,
  I: ICE,
};
const WET_FLOOR_SIGN = (() => {
  const g = WET_FLOOR_FRAME.map((r) => [...r]);
  // slipping figure: head back-left, arm up, body tipping, one leg
  // kicked out level, the other skidding down-left
  const fig = ['.##....', '.##.#..', '..##...', '...#...', '...####', '..#....', '.#.....'];
  fig.forEach((row, dr) =>
    [...row].forEach((ch, dc) => {
      if (ch === '#') g[5 + dr][5 + dc] = 'g';
    }),
  );
  return compile(g, WET_FLOOR_LEGEND);
})();
const WET_FLOOR_SIGN_BACK = fromAscii(WET_FLOOR_FRAME, WET_FLOOR_LEGEND);

// ════════════════════════════════════════════════════════════════
// 17. chalkboard_sign — café A-frame chalkboard, 16x32, 1x1 floor
//     (decor). Wooden frame, slate board with a scrawled two-word
//     heading, a chalk coffee cup still steaming, a pink heart, and a
//     chalk arrow pointing to the coffee.
// ════════════════════════════════════════════════════════════════
const CHALKBOARD_SIGN = fromAscii(
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.....LLLWWW.....',
    '....LWWWWWWD....',
    '....LkkkkkkD....',
    '....Lii.iiiD....',
    '....LkkkkkkD....',
    '...LkkkkPkPkD...',
    '...LkksPPPkkD...',
    '...LkkkkPkkkD...',
    '...LksskkkkkD...',
    '...LkppppkkkD...',
    '...Lkp..pppkD...',
    '...LkppppkpkD...',
    '..LkkkpppkkkkD..',
    '..LkkkkkkkkkkD..',
    '..LkiiiiiikkkD..',
    '..LkkkkkkiikkD..',
    '..LDDDDDDDDDDD..',
    '..Ld........dD..',
    '..dd........dd..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ].map((_, i, all) => all[(i + 28) % 32]), // sit the legs near the tile's front edge
  {
    L: WOOD_LIGHT,
    W: WOOD,
    D: WOOD_DARK,
    d: WOOD_SHADOW,
    k: IRON_DARK,
    p: PAPER,
    i: ICE,
    s: STONE,
    P: PINK,
  },
);

// ════════════════════════════════════════════════════════════════
// 18. photo_frame — desk photo frame, 16x16, 1x1 surface item, with
//     a photo of someone's orange cat (pointy ears, two dark eyes, a
//     pink nose) against a sky-blue backdrop, on a thick wooden base;
//     back view shows the kickstand.
// ════════════════════════════════════════════════════════════════
const PHOTO_FRAME = fromAscii(
  [
    '................',
    '................',
    '................',
    '...DDDDDDDDDD...',
    '...DLLLLLLLLD...',
    '...DLbObbObWD...',
    '...DLbOOOObWD...',
    '...DLOgOOgOWD...',
    '...DLbOppObWD...',
    '...DLOOOOOOWD...',
    '...DLOOooOOWD...',
    '...DWWWWWWWWD...',
    '...DWWWWWWWWD...',
    '...DDDDDDDDDD...',
    '....ss....ss....',
    '................',
  ],
  {
    D: WOOD_DARK,
    L: WOOD_LIGHT,
    W: WOOD,
    b: SKY,
    O: ORANGE,
    o: CLAY,
    g: INK,
    p: PINK,
    s: WOOD_SHADOW,
  },
);
const PHOTO_FRAME_BACK = fromAscii(
  [
    '................',
    '................',
    '................',
    '...DDDDDDDDDD...',
    '...DccccggccD...',
    '...DccccccccD...',
    '...DcccDccccD...',
    '...DcccDccccD...',
    '...DcccDccccD...',
    '...DccccDcccD...',
    '...DccccDcccD...',
    '...DccccDcccD...',
    '...DccccDcccD...',
    '...DDDDDDDDDD...',
    '....ss..Ds.ss...',
    '................',
  ],
  { D: WOOD_DARK, c: CREAM_DARK, g: GOLD_DARK, s: WOOD_SHADOW },
);

// ════════════════════════════════════════════════════════════════
// 19. nameplate — desk nameplate, 16x16, 1x1 surface item: a dark
//     wood wedge in 3/4 view (lit ridge, flared foot, darker wood
//     outline) with a brass plate set into its sloped face, engraved
//     with a two-word name.
// ════════════════════════════════════════════════════════════════
const NAMEPLATE = fromAscii(
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '...wwwwwwwwww...',
    '..wLLLLLLLLLLw..',
    '..wWHHHHHHHHWw..',
    '..wWGkkGkkkGWw..',
    '..wWyyyyyyyyWw..',
    '.wWWWWWWWWWWWWw.',
    '.wddddddddddddw.',
    '..wwwwwwwwwwww..',
    '................',
    '................',
  ],
  {
    w: WOOD_SHADOW,
    L: WOOD_LIGHT,
    W: WOOD,
    d: WOOD_DARK,
    H: GOLD_LIGHT,
    G: GOLD,
    y: GOLD_DARK,
    k: WOOD_SHADOW,
  },
);

// ════════════════════════════════════════════════════════════════
// 20. incident_sign — "DAYS since last incident" board, 32x32, 2x1
//     wall. Red header, two lines of small print, and a big flip card
//     that has just been turned back to 0. Someone has added a sticky
//     note underneath.
// ════════════════════════════════════════════════════════════════
const INCIDENT_SIGN = (() => {
  const cv = new Canvas(32, 32);
  // screws in the wall above the board
  cv.set(3, 4, 'S');
  cv.set(3, 27, 'S');
  // board rows 4-26
  cv.rect(4, 2, 26, 29, 'p');
  cv.frame(4, 2, 26, 29, 's');
  for (let c = 3; c <= 28; c++) cv.set(25, c, 'i');
  for (let r = 5; r <= 25; r++) cv.set(r, 28, 'i');
  // red header band with DAYS
  cv.rect(5, 3, 11, 27, 'R');
  for (let c = 3; c <= 27; c++) cv.set(5, c, 'h');
  for (let c = 3; c <= 27; c++) cv.set(11, c, 'r');
  writeText(cv, FONT5, 'DAYS', 6, 8, 'p');
  // small print: "since last / incident"
  for (const [r, c0, c1] of [
    [14, 5, 9],
    [14, 11, 14],
    [17, 5, 12],
  ])
    for (let c = c0; c <= c1; c++) cv.set(r, c, 'k');
  // big flip card reading 0
  cv.rect(13, 18, 24, 26, 'o');
  cv.rect(14, 19, 23, 25, 'c');
  for (const c of [19, 22, 25]) cv.set(18, c, 'o');
  for (let r = 15; r <= 22; r++) {
    cv.set(r, 20, 'p');
    cv.set(r, 21, 'p');
    cv.set(r, 23, 'p');
    cv.set(r, 24, 'p');
  }
  for (const r of [15, 22]) for (let c = 20; c <= 24; c++) cv.set(r, c, 'p');
  // split hinge pins
  cv.set(18, 18, 'S');
  cv.set(18, 26, 'S');
  // sticky note "(again)" stuck on at an angle
  cv.stamp(['qqqq.', 'qkkqq', '.qqkq', '.qqqQ'], 19, 5);
  return cv.done({
    S: STEEL_LIGHT,
    s: STEEL_DARK,
    p: PAPER,
    i: SILVER_LIGHT,
    R: RED,
    h: PINK,
    r: BRICK_DARK,
    k: STEEL,
    o: INK,
    c: IRON_DARK,
    q: CREAM,
    Q: CREAM_DARK,
  });
})();

// ════════════════════════════════════════════════════════════════
// 21. andon_light — build-status stack light, 16x32, 1x1 wall. A
//     red-amber-green tower on a wall bracket; the red is lit (the
//     build is broken), amber and green are dark. Its cable is taped
//     to the wall below.
// ════════════════════════════════════════════════════════════════
/** The stack light with its red segment lit (the still) or between flashes. */
function andonLight(redLit: boolean): string[][] {
  const cv = new Canvas(16, 32);
  // cap
  cv.stamp(['.oooo.', 'oSSSso'], 3, 5);
  // segments: [first row, outline, body, light, highlight]
  const seg = (r0: number, o: string, b: string, l: string, hi: string) => {
    for (let r = r0; r < r0 + 4; r++) {
      cv.set(r, 5, o);
      cv.set(r, 10, o);
      for (let c = 6; c <= 9; c++) cv.set(r, c, b);
    }
    cv.set(r0, 6, l);
    cv.set(r0, 7, l);
    cv.set(r0 + 1, 6, l);
    cv.set(r0 + 1, 7, hi);
    cv.set(r0 + 3, 9, o);
  };
  if (redLit)
    seg(5, 'r', 'R', 'P', 'w'); // lit red
  else seg(5, 'D', 'B', 'B', 'B'); // between flashes
  seg(9, 'K', 'a', 'a', 'a'); // dark amber
  seg(13, 'n', 'G', 'G', 'G'); // dark green
  // rings between segments
  for (const r of [9, 13]) for (let c = 5; c <= 10; c++) cv.set(r, c, 'o');
  // base + wall bracket
  cv.stamp(['oSSSso', 'osssso', '.oooo.'], 17, 5);
  cv.stamp(['..ssss..', '.sSSSSs.', '.sxssxs.', '..ssss..'], 20, 4);
  // cable, taped down the wall
  for (let r = 24; r <= 29; r++) cv.set(r, 8, 'k');
  cv.set(26, 7, 'q');
  cv.set(26, 9, 'q');
  return cv.done({
    o: IRON_DARK,
    S: SILVER,
    s: STEEL,
    x: IRON_DARK,
    r: RED,
    R: RED,
    P: PINK_LIGHT,
    w: PAPER,
    K: CLAY_DARK,
    a: GOLD_DARK,
    n: LEAF_DARK,
    G: TEAL_DARK,
    k: INK,
    q: CREAM,
    D: BRICK_DARK,
    B: BRICK,
  });
}
const ANDON_LIGHT = andonLight(true);
/** The build is broken: the red segment flashes. */
const ANDON_LIGHT_FRAMES = [andonLight(false)];

// ════════════════════════════════════════════════════════════════
// 22. string_lights — fairy lights swagged along the wall, 32x32, 2x1
//     wall. A dark wire pinned at both ends and the middle, sagging
//     deep between the pins, nine fat 2x2 bulbs cycling amber / teal /
//     pink — each lit on its top-left and throwing a pale glow pixel
//     below — and one dead grey bulb that has slipped its socket and
//     dangles lower than the rest.
// ════════════════════════════════════════════════════════════════
/** The lights with every third live bulb (`dim` = 0, 1 or 2) dimmed, or
 *  all lit (`dim` = -1, the still). */
function stringLights(dim: number): string[][] {
  const cv = new Canvas(32, 32);
  const pins = [1, 16, 30];
  const rowAt = (c: number) => {
    const a = c <= 16 ? 1 : 16;
    const b = c <= 16 ? 16 : 30;
    const t = Math.min(1, Math.max(0, (c - a) / (b - a)));
    return 5 + Math.round(5 * 4 * t * (1 - t));
  };
  for (let c = 0; c < 32; c++) cv.set(rowAt(c), c, 'w');
  for (const c of pins) {
    cv.set(rowAt(c) - 1, c, 'S');
    cv.set(rowAt(c), c, 's');
  }
  // [base, lit top-left, glow]
  const TONES: Array<[string, string]> = [
    ['y', 'Y'],
    ['t', 'T'],
    ['m', 'M'],
  ];
  const DIM: Legend = { y: 'g', t: 'd', m: 'p' };
  const bulbs = [2, 5, 8, 11, 13, 18, 21, 24, 27];
  let k = 0;
  bulbs.forEach((c, i) => {
    const r = Math.max(rowAt(c), rowAt(c + 1)) + 1;
    if (i === 6) {
      // the dead one: slipped down on a loop of wire
      cv.set(r, c, 'w');
      cv.set(r + 1, c, 'w');
      cv.set(r + 2, c, 'w');
      cv.set(r + 3, c, 'k');
      cv.set(r + 3, c + 1, 'k');
      cv.rect(r + 4, c, r + 5, c + 1, 'U');
      cv.set(r + 4, c, 'u');
      return;
    }
    const live = k;
    const [base, lit] = TONES[k++ % TONES.length];
    cv.set(r, c, 'k');
    cv.set(r, c + 1, 'k');
    if (live % 3 === dim) {
      // dimmed: the dark tone of its colour, no highlight, no glow
      cv.rect(r + 1, c, r + 2, c + 1, DIM[base]);
      cv.set(r + 1, c, base);
      return;
    }
    cv.rect(r + 1, c, r + 2, c + 1, base);
    cv.set(r + 1, c, lit);
    // a pale glow pixel just below the bulb
    cv.set(r + 4, c, lit);
  });
  return cv.done({
    w: IRON_DARK,
    S: STEEL_LIGHT,
    s: STEEL,
    k: INK,
    y: LAMP_WARM,
    Y: GOLD_LIGHT,
    t: TEAL,
    T: TEAL_LIGHT,
    m: PINK,
    M: PINK_LIGHT,
    g: GOLD_DARK,
    d: TEAL_DARK,
    p: PINK_DARK,
    u: STONE,
    U: STONE_DARK,
  });
}
const STRING_LIGHTS = stringLights(-1);
/** Twinkle chase: all lit, then each third of the bulbs dims in turn. */
const STRING_LIGHTS_FRAMES = [0, 1, 2].map((d) => stringLights(d));

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

/** Attach an animation to a catalog entry. */
const animated = (s: GeneratedSprite, frames: string[][][], frameMs: number): GeneratedSprite => ({
  ...s,
  frames,
  frameMs,
});

export const SPRITES14: GeneratedSprite[] = [
  animated(
    entry('deploy_board', 'Deploy Board', 48, 32, 3, 1, DEPLOY_BOARD),
    DEPLOY_BOARD_FRAMES,
    320,
  ),
  entry('painting_landscape', 'Landscape Painting', 32, 32, 2, 1, PAINTING_LANDSCAPE),
  entry('art_abstract', 'Abstract Canvas', 16, 32, 1, 1, ART_ABSTRACT),
  entry('portrait_capy', 'Capybara Portrait', 16, 32, 1, 1, PORTRAIT_CAPY),
  entry('world_map', 'World Map', 32, 32, 2, 1, WORLD_MAP),
  entry('porthole', 'Porthole', 16, 32, 1, 1, PORTHOLE),
  animated(entry('ac_unit', 'Air Conditioner', 32, 32, 2, 1, AC_UNIT), AC_UNIT_FRAMES, 240),
  entry('bunting', 'Bunting', 32, 32, 2, 1, BUNTING),
  entry('exit_sign', 'Exit Sign', 16, 32, 1, 1, EXIT_SIGN),
  entry('fire_extinguisher', 'Fire Extinguisher', 16, 32, 1, 1, FIRE_EXTINGUISHER),
  entry('poster_ship', 'Ship It Poster', 16, 32, 1, 1, POSTER_SHIP),
  entry('coat_hooks', 'Coat Hooks', 32, 32, 2, 1, COAT_HOOKS),
  entry('duck_trophy', 'Duck Trophy', 16, 32, 1, 1, DUCK_TROPHY),
  animated(
    entry('cuckoo_clock', 'Cuckoo Clock', 16, 32, 1, 1, CUCKOO_CLOCK),
    CUCKOO_CLOCK_FRAMES,
    300,
  ),
  entry('thermostat', 'Thermostat', 16, 16, 1, 1, THERMOSTAT),
  entry(
    'wet_floor_sign',
    'Wet Floor Sign',
    16,
    16,
    1,
    1,
    WET_FLOOR_SIGN,
    'wet_floor_sign',
    'front',
  ),
  entry(
    'wet_floor_sign_back',
    'Wet Floor Sign',
    16,
    16,
    1,
    1,
    WET_FLOOR_SIGN_BACK,
    'wet_floor_sign',
    'back',
  ),
  entry('chalkboard_sign', 'Chalkboard Sign', 16, 32, 1, 1, CHALKBOARD_SIGN),
  entry('photo_frame', 'Photo Frame', 16, 16, 1, 1, PHOTO_FRAME, 'photo_frame', 'front'),
  entry('photo_frame_back', 'Photo Frame', 16, 16, 1, 1, PHOTO_FRAME_BACK, 'photo_frame', 'back'),
  entry('nameplate', 'Nameplate', 16, 16, 1, 1, NAMEPLATE),
  entry('incident_sign', 'Incident Counter', 32, 32, 2, 1, INCIDENT_SIGN),
  animated(entry('andon_light', 'Build Light', 16, 32, 1, 1, ANDON_LIGHT), ANDON_LIGHT_FRAMES, 450),
  animated(
    entry('string_lights', 'String Lights', 32, 32, 2, 1, STRING_LIGHTS),
    STRING_LIGHTS_FRAMES,
    350,
  ),
];

validateSprites(SPRITES14);

const WALL: CatalogMeta = { category: 'wall', canPlaceOnWalls: true };

export const META14: Record<string, CatalogMeta> = {
  deploy_board: WALL,
  painting_landscape: WALL,
  art_abstract: WALL,
  portrait_capy: WALL,
  world_map: WALL,
  porthole: WALL,
  ac_unit: WALL,
  bunting: WALL,
  exit_sign: WALL,
  fire_extinguisher: WALL,
  poster_ship: WALL,
  coat_hooks: WALL,
  duck_trophy: WALL,
  cuckoo_clock: WALL,
  thermostat: WALL,
  wet_floor_sign: { category: 'decor' },
  wet_floor_sign_back: { category: 'decor' },
  chalkboard_sign: { category: 'decor' },
  photo_frame: { category: 'decor', canPlaceOnSurfaces: true },
  photo_frame_back: { category: 'decor', canPlaceOnSurfaces: true },
  nameplate: { category: 'decor', canPlaceOnSurfaces: true },
  incident_sign: WALL,
  andon_light: WALL,
  string_lights: WALL,
};
