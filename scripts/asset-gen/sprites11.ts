/**
 * sprites11.ts — Batch 11: game room & lounge (17 pieces, 31 entries).
 *
 * Until now the break room was an arcade cabinet, a ping-pong table, a
 * beanbag and a couch. Agents deserve a proper one. This batch builds the
 * room around a showpiece — a pool table racked and ready to break, the
 * cue chalked blue and aimed at the cue ball — and fills it with places to
 * waste time well: a foosball table mid-match, a pinball machine with its
 * backbox lit, a TV console playing a platformer, a jukebox with neon
 * bubble tubes, an upright piano with sheet music open, a drum kit with
 * the setlist on the floor, a guitar on its stand (pick tucked in the
 * strings), a leather club armchair and a dartboard with one dart that
 * missed. Small surface clutter rounds it out: a record player spinning,
 * a board game mid-play with the dice thrown, a lava lamp and a popcorn
 * bucket that has already spilled.
 *
 * Same conventions as batches 6–9: variants share a groupId with their
 * front sprite (the front carries groupId + orientation 'front' whenever a
 * piece has other orientations), left views are programmatic mirrors of
 * right views, house palette only, light from top-left, outlines in a
 * darker shade of the material, tall pieces keep the 16px overhang above
 * their footprint.
 *
 * Unlike the earlier batches this one draws straight onto a hex grid with
 * small shape helpers (rect/box/ellipse/line/stamp) — the pieces are
 * dense with details that don't fit a row-of-ASCII layout.
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

// ── Drawing helpers (hex grid, '' = transparent) ────────────────
type G = string[][];
type Legend = Record<string, string>;

function canvas(w: number, h: number): G {
  return Array.from({ length: h }, () => new Array<string>(w).fill(''));
}

function px(g: G, x: number, y: number, c: string): void {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
}

/** Filled rectangle, inclusive corners. */
function rect(g: G, x0: number, y0: number, x1: number, y1: number, c: string): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(g, x, y, c);
}

/** Outlined box: 1px outline, fill, optional lit top row + left column. */
function box(
  g: G,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  outline: string,
  fill: string,
  lit?: string,
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      if (edge) px(g, x, y, outline);
      else if (lit && (y === y0 + 1 || x === x0 + 1)) px(g, x, y, lit);
      else px(g, x, y, fill);
    }
  }
}

/** Bresenham line. */
function line(g: G, x0: number, y0: number, x1: number, y1: number, c: string): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    px(g, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
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

/** Ellipse fill; `paint` picks a colour from the normalised distance (0 centre … 1 rim). */
function ellipse(
  g: G,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  paint: (d: number, x: number, y: number) => string | null,
): void {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const c = paint(d, x, y);
      if (c) px(g, x, y, c);
    }
  }
}

/** Is (x,y) on the rim of an ellipse fill (a neighbour falls outside)? */
function onRim(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const out = (a: number, b: number) => ((a - cx) / rx) ** 2 + ((b - cy) / ry) ** 2 > 1;
  return out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1);
}

/** Stamp ASCII rows at (x,y); '.' is transparent. */
function stamp(g: G, x: number, y: number, rows: string[], legend: Legend): void {
  rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === '.') return;
      const hex = legend[ch];
      if (hex === undefined) throw new Error(`unknown legend char '${ch}' at row ${r} col ${c}`);
      px(g, x + c, y + r, hex);
    }),
  );
}

/** Whole sprite from ASCII rows. */
function ascii(w: number, h: number, rows: string[], legend: Legend): G {
  const g = canvas(w, h);
  stamp(g, 0, 0, rows, legend);
  return g;
}

// ── Animation ───────────────────────────────────────────────────
// An animated piece is a builder `(k) => grid` run once per frame. Only the
// few pixels that read k differ, so the silhouette and the rest of the piece
// are pixel-identical across frames by construction; frame 0 is the still
// every non-animating consumer sees.

/** Run a frame builder n times: [frame 0, frame 1, …]. */
const frameSet = (n: number, build: (k: number) => G): G[] =>
  Array.from({ length: n }, (_, k) => build(k));

// ════════════════════════════════════════════════════════════════
// 1. pool_table — the showpiece, 48x32 3x2 (front) / 32x48 2x3 (right).
//    Wood rails with cream diamond sights, green felt with a dark
//    cushion line, six pockets. Racked for the break: a 15-ball
//    triangle (solids, stripes, the 8 in the middle) at the foot, the
//    cue ball on the head spot, and the cue lying on the felt aimed at
//    it with a chalked blue tip. A chalk cube waits on the corner rail.
//    Front apron with a brass plate, chunky turned legs.
// ════════════════════════════════════════════════════════════════
interface Ball {
  main: string;
  light: string;
  dark: string;
}
// Five hues + the 8-ball: on a 2x2 ball anything more turns to confetti.
// (No green ball: it would vanish into the felt — orange stands in.)
const BALLS: Record<string, Ball> = {
  yellow: { main: GOLD, light: GOLD_LIGHT, dark: GOLD_DARK },
  blue: { main: BLUE, light: SKY, dark: NAVY },
  red: { main: RED, light: PINK, dark: BRICK_DARK },
  purple: { main: PURPLE, light: PINK_LIGHT, dark: PURPLE_DARK },
  orange: { main: ORANGE, light: LAMP_WARM, dark: CLAY },
  eight: { main: INK, light: STEEL, dark: INK },
  cue: { main: PAPER, light: PAPER, dark: SILVER },
};

/** 2x2 ball at screen (x,y): one lit pixel top-left, base, one dark pixel bottom-right. */
function ball(g: G, x: number, y: number, b: Ball): void {
  px(g, x, y, b.light);
  px(g, x + 1, y, b.main);
  px(g, x, y + 1, b.main);
  px(g, x + 1, y + 1, b.dark);
}

// a clean 10-ball triangle, column by column from the apex (the apex
// points at the cue ball; the 8 sits in the middle of the third column)
const RACK = [
  ['yellow'],
  ['blue', 'red'],
  ['purple', 'eight', 'orange'],
  ['red', 'yellow', 'blue', 'purple'],
];

function poolTable(w: number, h: number, vertical: boolean): G {
  const g = canvas(w, h);
  const x0 = 1;
  const x1 = w - 2;
  const y0 = 1;
  const yb = h - 8; // last row of the top surface
  const fx0 = x0 + 4;
  const fx1 = x1 - 4;
  const fy0 = y0 + 4;
  const fy1 = yb - 4;

  // top: rails + felt
  for (let y = y0; y <= yb; y++) {
    for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === yb;
      if (edge) {
        px(g, x, y, WOOD_SHADOW);
        continue;
      }
      const felt = x >= fx0 && x <= fx1 && y >= fy0 && y <= fy1;
      if (felt) {
        const cushion = x === fx0 || x === fx1 || y === fy0 || y === fy1;
        px(g, x, y, cushion ? LEAF_DARK : LEAF);
        continue;
      }
      if (y === y0 + 1 || x === x0 + 1) px(g, x, y, WOOD_LIGHT);
      else if (y === yb - 1 || x === x1 - 1) px(g, x, y, WOOD_DARK);
      else px(g, x, y, WOOD);
    }
  }
  // light from the top-left: the top/left cushions cast a 1px shadow onto
  // the felt, the bottom cushion catches a lit row
  for (let x = fx0 + 1; x < fx1; x++) px(g, x, fy1 - 1, GREEN);
  for (let x = fx0 + 1; x < fx1; x++) px(g, x, fy0 + 1, LEAF_DARK);
  for (let y = fy0 + 1; y < fy1; y++) px(g, fx0 + 1, y, LEAF_DARK);

  // diamond sights along the rails (centre line of each rail)
  const railMidT = y0 + 2;
  const railMidB = yb - 2;
  const railMidL = x0 + 2;
  const railMidR = x1 - 2;
  const longX = !vertical;
  if (longX) {
    for (const t of [1, 2, 3, 5, 6, 7]) {
      const x = Math.round(fx0 + ((fx1 - fx0) * t) / 8);
      px(g, x, railMidT, CREAM);
      px(g, x, railMidB, CREAM);
    }
    for (const t of [1, 2, 3]) {
      const y = Math.round(fy0 + ((fy1 - fy0) * t) / 4);
      px(g, railMidL, y, CREAM);
      px(g, railMidR, y, CREAM);
    }
  } else {
    for (const t of [1, 2, 3, 5, 6, 7]) {
      const y = Math.round(fy0 + ((fy1 - fy0) * t) / 8);
      px(g, railMidL, y, CREAM);
      px(g, railMidR, y, CREAM);
    }
    for (const t of [1, 2, 3]) {
      const x = Math.round(fx0 + ((fx1 - fx0) * t) / 4);
      px(g, x, railMidT, CREAM);
      px(g, x, railMidB, CREAM);
    }
  }

  // pockets: 3x3 at the corners, 3x2 cut into the middle of the long rails
  const pocket = (x: number, y: number, pw: number, ph: number) =>
    rect(g, x, y, x + pw - 1, y + ph - 1, INK);
  pocket(fx0 - 2, fy0 - 2, 3, 3);
  pocket(fx1 - 0, fy0 - 2, 3, 3);
  pocket(fx0 - 2, fy1 - 0, 3, 3);
  pocket(fx1 - 0, fy1 - 0, 3, 3);
  if (longX) {
    const cx = Math.floor((fx0 + fx1) / 2);
    pocket(cx - 1, fy0 - 2, 3, 2);
    pocket(cx - 1, fy1 + 1, 3, 2);
  } else {
    const cy = Math.floor((fy0 + fy1) / 2);
    pocket(fx0 - 2, cy - 1, 2, 3);
    pocket(fx1 + 1, cy - 1, 2, 3);
  }
  // brass pocket lips catch the light on the top-left corner pocket
  px(g, fx0 - 2, fy0 - 2, GOLD_DARK);

  // felt-local coordinates: a = along the table (0 = head end), b = across
  const L = longX ? fx1 - fx0 - 1 : fy1 - fy0 - 1; // usable felt length
  const Wd = longX ? fy1 - fy0 - 1 : fx1 - fx0 - 1;
  const at = (a: number, b: number): [number, number] =>
    longX ? [fx0 + 1 + a, fy0 + 1 + b] : [fx0 + 1 + b, fy1 - 1 - a];
  // ball at felt (a,b) occupying a..a+1, b..b+1 → its screen top-left corner
  const ballAt = (a: number, b: number, kind: string) => {
    const [xa, ya] = at(a, b);
    const [xb, yb2] = at(a + 1, b + 1);
    ball(g, Math.min(xa, xb), Math.min(ya, yb2), BALLS[kind]);
  };

  // head spot dot and foot spot
  const mid = Math.floor(Wd / 2);
  const apex = Math.round(L * 0.62);
  RACK.forEach((col, k) => {
    col.forEach((kind, i) => {
      ballAt(apex + 2 * k, mid - (k + 1) + 2 * i, kind);
    });
  });
  const cueA = Math.round(L * 0.3);
  ballAt(cueA, mid - 1, 'cue');

  // the cue: chalked tip near the cue ball, shaft running back over the rail
  const shaft = (t: number) => {
    if (t === 0) return SKY;
    if (t < 7) return CREAM;
    if (t < 10) return WOOD_LIGHT;
    if (t === 10) return GOLD_DARK;
    return WOOD_SHADOW;
  };
  // front: the butt ends on the left rail; rotated: it stays on the felt
  const cueOk = (x: number, y: number) => (longX ? x >= x0 + 2 : y <= fy1 - 1);
  let last: [number, number] | null = null;
  for (let t = 0; t <= 15; t++) {
    const [x, y] = at(cueA - 2 - t, mid - 1 + Math.floor((t + 1) / 3));
    if (!cueOk(x, y)) break;
    px(g, x, y, shaft(t));
    last = [x, y];
  }
  if (last) px(g, last[0], last[1], WOOD_DARK); // butt cap

  // chalk cube on the far corner rail
  if (longX) {
    px(g, x1 - 7, y0 + 1, SKY);
    px(g, x1 - 6, y0 + 1, BLUE);
    px(g, x1 - 7, y0 + 2, BLUE);
    px(g, x1 - 6, y0 + 2, NAVY);
  } else {
    px(g, x1 - 2, y0 + 6, SKY);
    px(g, x1 - 1, y0 + 6, BLUE);
    px(g, x1 - 2, y0 + 7, BLUE);
    px(g, x1 - 1, y0 + 7, NAVY);
  }

  // apron (front face) + brass plate
  for (let y = yb + 1; y <= yb + 3; y++) {
    for (let x = x0 + 1; x <= x1 - 1; x++) {
      const edge = x === x0 + 1 || x === x1 - 1 || y === yb + 3;
      px(g, x, y, edge ? WOOD_SHADOW : y === yb + 1 ? WOOD : WOOD_DARK);
    }
  }
  const pc = Math.floor((x0 + x1) / 2);
  rect(g, pc - 2, yb + 1, pc + 1, yb + 2, GOLD_DARK);
  px(g, pc - 2, yb + 1, GOLD);
  // turned legs
  const legs = longX ? [x0 + 2, pc - 1, x1 - 4] : [x0 + 2, x1 - 4];
  for (const lx of legs) {
    for (let y = yb + 4; y <= yb + 6; y++) {
      px(g, lx, y, WOOD);
      px(g, lx + 1, y, WOOD_DARK);
      px(g, lx + 2, y, WOOD_SHADOW);
    }
  }
  return g;
}

const POOL_TABLE = poolTable(48, 32, false);
const POOL_TABLE_RIGHT = poolTable(32, 48, true);

// ════════════════════════════════════════════════════════════════
// 2. foosball — table mid-match, 32x32 2x1 (front) / 16x48 1x2 (right).
//    Wood cabinet on tall legs, green pitch with a centre line and
//    goal mouths, six chrome rods with red and blue players. Red's
//    grips poke out the far side, blue's the near side. Score beads on
//    the rail say red is winning; the ball sits in front of blue's goal.
// ════════════════════════════════════════════════════════════════
const RED_TEAM = { top: RED, bottom: BRICK_DARK };
const BLUE_TEAM = { top: BLUE, bottom: NAVY };

function foosball(vertical: boolean): G {
  const w = vertical ? 16 : 32;
  const h = vertical ? 48 : 32;
  const g = canvas(w, h);
  // table top box
  const tx0 = vertical ? 2 : 1;
  const tx1 = vertical ? 13 : 30;
  const ty0 = vertical ? 9 : 7;
  const ty1 = vertical ? 40 : 21;
  box(g, tx0, ty0, tx1, ty1, WOOD_SHADOW, WOOD, WOOD_LIGHT);
  // pitch
  const px0 = tx0 + 3;
  const px1 = tx1 - 3;
  const py0 = ty0 + 3;
  const py1 = ty1 - 3;
  rect(g, px0, py0, px1, py1, LEAF);
  rect(g, px0, py0, px1, py0, LEAF_DARK); // far wall shadow on the pitch
  rect(g, px0, py0, px0, py1, LEAF_DARK);
  if (!vertical) {
    const cx = Math.floor((px0 + px1) / 2);
    for (let y = py0 + 1; y <= py1; y++) px(g, cx, y, GREEN_LIGHT);
    const cy = Math.floor((py0 + py1) / 2);
    for (let y = cy - 1; y <= cy + 1; y++) {
      rect(g, tx0 + 1, y, tx0 + 2, y, INK);
      rect(g, tx1 - 2, y, tx1 - 1, y, INK);
    }
  } else {
    const cy = Math.floor((py0 + py1) / 2);
    for (let x = px0 + 1; x <= px1; x++) px(g, x, cy, GREEN_LIGHT);
    const cx = Math.floor((px0 + px1) / 2);
    for (let x = cx - 1; x <= cx + 1; x++) {
      rect(g, x, ty0 + 1, x, ty0 + 2, INK);
      rect(g, x, ty1 - 2, x, ty1 - 1, INK);
    }
  }
  // front face + legs: 2px dark stubs at both corners
  if (!vertical) {
    box(g, tx0 + 1, ty1 + 1, tx1 - 1, ty1 + 3, WOOD_SHADOW, WOOD_DARK);
    for (const lx of [3, 27]) {
      rect(g, lx, ty1 + 4, lx, h - 1, WOOD_DARK);
      rect(g, lx + 1, ty1 + 4, lx + 1, h - 1, WOOD_SHADOW);
    }
    // a scuffed corner on the lit rail, and a score sticker on the apron
    px(g, tx0 + 1, ty0 + 1, WOOD_SURFACE);
    px(g, tx0 + 2, ty0 + 1, WOOD_SURFACE);
    px(g, 14, ty1 + 2, PINK_LIGHT);
    px(g, 15, ty1 + 2, PINK);
    px(g, 16, ty1 + 2, PAPER);
  } else {
    box(g, tx0, ty1 + 1, tx1, ty1 + 2, WOOD_SHADOW, WOOD_DARK);
    // the same score sticker the front view has on its apron
    px(g, 6, ty1 + 2, PINK_LIGHT);
    px(g, 7, ty1 + 2, PINK);
    px(g, 8, ty1 + 2, PAPER);
    for (const lx of [3, 11]) {
      rect(g, lx, ty1 + 3, lx, h - 1, WOOD_DARK);
      rect(g, lx + 1, ty1 + 3, lx + 1, h - 1, WOOD_SHADOW);
    }
  }

  // rods: positions along the table, team, players
  const teams = [RED_TEAM, RED_TEAM, BLUE_TEAM, RED_TEAM, BLUE_TEAM, BLUE_TEAM];
  const counts = vertical ? [1, 2, 2, 2, 2, 1] : [1, 2, 3, 3, 2, 1];
  const along = vertical ? [13, 17, 21, 28, 32, 36] : [5, 9, 13, 18, 22, 26];
  const across0 = vertical ? px0 : py0; // first pitch px across
  const acrossN = vertical ? px1 - px0 + 1 : py1 - py0 + 1;
  along.forEach((p, i) => {
    const team = teams[i];
    const farGrip = team === RED_TEAM;
    // rod across the whole table, grip sticking out on its team's side
    if (!vertical) {
      const yTop = farGrip ? 2 : ty0 - 1;
      const yBot = farGrip ? ty1 + 1 : 27;
      for (let y = yTop; y <= yBot; y++) px(g, p, y, SILVER);
      if (farGrip) {
        rect(g, p, 2, p, 4, INK);
        px(g, p, 2, IRON);
      } else {
        rect(g, p, 25, p, 27, INK);
        px(g, p, 25, IRON);
        px(g, p, 27, STEEL_DARK);
      }
    } else {
      // rods end 1px inside the sprite, each in a dark 2px grip
      const xL = farGrip ? 1 : tx0 - 1;
      const xR = farGrip ? tx1 + 1 : 14;
      for (let x = xL; x <= xR; x++) px(g, x, p, SILVER);
      if (farGrip) {
        px(g, 1, p, INK);
        px(g, 2, p, IRON);
      } else {
        px(g, 13, p, IRON);
        px(g, 14, p, INK);
      }
    }
    // players: 3px across the rod, 2px along it — the same men in both views
    const n = counts[i];
    const slots = vertical
      ? n === 1
        ? [Math.floor(acrossN / 2) - 1]
        : [1, 4]
      : n === 1
        ? [Math.floor(acrossN / 2) - 1]
        : n === 2
          ? [1, acrossN - 3]
          : [0, Math.floor(acrossN / 2) - 1, acrossN - 2];
    for (const s of slots) {
      const q = across0 + s;
      if (!vertical) {
        rect(g, p - 1, q, p + 1, q, team.top);
        rect(g, p - 1, q + 1, p + 1, q + 1, team.bottom);
        px(g, p, q, CREAM); // head
      } else {
        // the rotated table is only 6px across: each man is a solid 2x3
        // block (dark bottom row) so he doesn't blur into the rod
        rect(g, q, p - 1, q + 1, p, team.top);
        rect(g, q, p + 1, q + 1, p + 1, team.bottom);
      }
    }
    // a 1px strip of felt between the two men on a rod
    if (vertical && n === 2) {
      const gx = across0 + 3;
      px(g, gx, p - 1, GREEN);
      px(g, gx, p + 1, GREEN);
    }
  });
  // the ball, and score beads (red 3, blue 1) on a wire along the far rail
  if (!vertical) {
    px(g, 24, 16, GOLD_LIGHT);
    for (let x = 3; x <= 12; x++) px(g, x, ty0 + 1, STEEL_LIGHT);
    for (const x of [3, 4, 5]) px(g, x, ty0 + 1, GOLD);
    for (let x = 19; x <= 28; x++) px(g, x, ty0 + 1, STEEL_LIGHT);
    px(g, 28, ty0 + 1, GOLD);
  } else {
    px(g, 7, 35, GOLD_LIGHT);
    for (let y = ty0 + 3; y <= ty0 + 10; y++) px(g, tx0 + 1, y, STEEL_LIGHT);
    for (const y of [ty0 + 3, ty0 + 4, ty0 + 5]) px(g, tx0 + 1, y, GOLD);
    for (let y = ty1 - 10; y <= ty1 - 3; y++) px(g, tx0 + 1, y, STEEL_LIGHT);
    px(g, tx0 + 1, ty1 - 3, GOLD);
  }
  return g;
}

const FOOSBALL = foosball(false);
const FOOSBALL_RIGHT = foosball(true);

// ════════════════════════════════════════════════════════════════
// 3. gaming_recliner — the lounge's seat, 16x32, 1x1, all four
//    orientations. Not a library armchair: a padded navy racing-style
//    recliner with a red stripe down the backrest and red piping, a soda
//    can in the cup holder on its right arm and a controller left on the
//    seat cushion. 14px wide so two side by side keep a gap.
// ════════════════════════════════════════════════════════════════
const RECLINER_LEGEND: Legend = {
  o: NAVY_DARK,
  B: NAVY,
  b: BLUE,
  r: RED,
  R: BRICK_DARK,
  k: IRON_DARK,
};

const RECLINER = (() => {
  const g = ascii(
    16,
    32,
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '....oooooooo....',
      '...obbbrrbbbo...',
      '...obBBrRBBBo...',
      '...obBBrRBBBo...',
      '...obBBrRBBBo...',
      '.ooobBBrRBBBooo.',
      '.obbobBrRBBobbo.',
      '.obBoBBrRBBoBBo.',
      '.obBooooooooBBo.',
      '.obBobbbbbboBBo.',
      '.obBobBBBBBoBBo.',
      '.obBobBBBBBoBBo.',
      '.obBoBBBBBBoBBo.',
      '.obBooooooooBBo.',
      '.obBoBBBBBBoBBo.',
      '.orrrrrrrrrrrro.',
      '.oooooooooooooo.',
      '..kk........kk..',
      '..kk........kk..',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    RECLINER_LEGEND,
  );
  // controller left on the seat
  stamp(g, 6, 18, ['dssrd', 'd...d'], { d: IRON, s: STEEL_LIGHT, r: RED });
  // the footrest kicked out in front of the seat, raised 1px off the floor
  box(g, 3, 27, 12, 29, NAVY_DARK, NAVY);
  rect(g, 4, 28, 11, 28, BLUE); // lit top of the pad
  rect(g, 4, 29, 11, 29, NAVY_DARK);
  px(g, 4, 30, IRON_DARK);
  px(g, 11, 30, IRON_DARK);
  rect(g, 7, 25, 8, 26, IRON_DARK); // the scissor arm it folds out on
  px(g, 7, 25, IRON);
  // the recline lever on the outside of the right arm
  rect(g, 15, 18, 15, 19, SILVER);
  // soda can in the cup holder on the right arm
  stamp(g, 12, 11, ['sS', 'Rr', 'Pr'], { s: SILVER_LIGHT, S: SILVER, R: RED, r: BRICK, P: PAPER });
  return g;
})();

const RECLINER_BACK = ascii(
  16,
  32,
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '....oooooooo....',
    '...obbbbbbbbo...',
    '...obBBrRBBBo...',
    '...obBBrRBBBo...',
    '...obBBrRBBBo...',
    '.ooobBBrRBBBooo.',
    '.obobBBrRBBBoBo.',
    '.obobBBrRBBBoBo.',
    '.obobBBrRBBBoBo.',
    '.obobBBrRBBBoBo.',
    '.obobBBrRBBBoBo.',
    '.obobBBrRBBBoBo.',
    '.obobBBrRBBBoBo.',
    '.obobBBrRBBBoBo.',
    '.obobBBBBBBBoBo.',
    '.oborrrrrrrroBo.',
    '.oooooooooooooo.',
    '..kk........kk..',
    '..kk........kk..',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  RECLINER_LEGEND,
);

const RECLINER_RIGHT = (() => {
  // side view facing right: the backrest leans back (a staircase to the
  // left) and the footrest is out past the seat front
  const g = ascii(
    16,
    32,
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '.oooo...........',
      'obbbro..........',
      'obBBro..........',
      'obBBroo.........',
      '.obBBro.........',
      '.obBBro.........',
      '..obBBroooooo...',
      '..obBBrobbbbo...',
      '..obBBroBBBBo...',
      '..obBBrooooBo...',
      '..obBBBBBBoBo...',
      '..obBBBBBBoBooo.',
      '..obBBBBBBoBobBo',
      '..obBBBBBBoBoooo',
      '..obBBBBBBoBo...',
      '..orrrrrrrrro...',
      '..ooooooooooo...',
      '...kk.....kk....',
      '...kk.....kk....',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    RECLINER_LEGEND,
  );
  // the can stands in its holder at the front of the arm
  stamp(g, 10, 12, ['sS', 'Rr', 'Pr'], { s: SILVER_LIGHT, S: SILVER, R: RED, r: BRICK, P: PAPER });
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 4. tv_console — wide TV on a low wood console, 32x48 2x1 (front, back)
//    / 16x48 1x2 (right, left). The screen plays a platformer: sky,
//    a cloud, a ? block with a coin popping out, a green pipe, the hero
//    mid-run on a brick ground, the score in the corner. The console's
//    open shelf holds the games console (green power LED) and a row of
//    game cases; a controller and a soda can sit on top.
// ════════════════════════════════════════════════════════════════
function consoleFront(g: G, back: boolean): void {
  // top surface rows 34-37
  rect(g, 1, 34, 30, 34, WOOD_DARK);
  rect(g, 1, 35, 30, 35, WOOD_LIGHT);
  rect(g, 1, 36, 30, 36, WOOD_SURFACE);
  px(g, 1, 35, WOOD_DARK);
  px(g, 30, 35, WOOD_DARK);
  px(g, 1, 36, WOOD_DARK);
  px(g, 30, 36, WOOD_DARK);
  rect(g, 1, 37, 30, 37, WOOD_DARK);
  // front face rows 38-44
  box(g, 1, 38, 30, 44, WOOD_SHADOW, WOOD);
  rect(g, 2, 38, 29, 38, WOOD_LIGHT);
  if (back) {
    rect(g, 2, 39, 29, 43, WOOD_DARK);
    for (const x of [8, 16, 23]) rect(g, x, 39, x, 43, WOOD_SHADOW);
    rect(g, 14, 40, 17, 41, INK); // cable hole
  } else {
    // left open shelf with the games console
    box(g, 3, 39, 14, 43, WOOD_SHADOW, WOOD_SHADOW);
    box(g, 4, 40, 12, 42, IRON_DARK, IRON);
    rect(g, 5, 41, 9, 41, INK); // disc slot
    px(g, 11, 41, LED_GREEN);
    // right shelf: game cases
    box(g, 17, 39, 28, 43, WOOD_SHADOW, WOOD_SHADOW);
    const spines = [RED, BLUE, GREEN, GOLD, PURPLE, TEAL, RED, PINK];
    spines.forEach((c, i) => {
      if (i === 6) return; // a gap where one is missing — it's in the console
      rect(g, 18 + i, 40, 18 + i, 42, c);
    });
    px(g, 25, 40, WOOD_SHADOW); // a shorter case
  }
  // legs
  for (const lx of [2, 28]) {
    rect(g, lx, 45, lx, 46, WOOD_DARK);
    rect(g, lx + 1, 45, lx + 1, 46, WOOD_SHADOW);
  }
}

/** Animated: the capybara hops (dust only on landing) and the gem's sparkles twinkle. */
function tvConsole(k: number): G {
  const g = canvas(32, 48);
  consoleFront(g, false);
  // stand neck
  rect(g, 13, 32, 18, 33, IRON_DARK);
  rect(g, 14, 32, 17, 32, IRON);
  // TV body
  box(g, 1, 8, 30, 31, INK, IRON_DARK);
  rect(g, 2, 9, 29, 9, IRON); // lit top bezel
  px(g, 28, 30, RED); // standby LED
  // screen x3-28 y11-29
  rect(g, 3, 11, 28, 24, SCREEN_BLUE);
  rect(g, 3, 11, 28, 11, SCREEN_SHADOW);
  // an original little platformer: a capybara mid-jump over a meadow,
  // reaching for a floating gem, a round tree at the far side
  // cloud
  stamp(g, 5, 13, ['.pp...', 'pppp..', '.ppppi'], { p: PAPER, i: ICE });
  // score top-right
  for (const x of [21, 23, 25, 26]) px(g, x, 13, PAPER);
  // floating gem with a sparkle
  stamp(g, 15, 15, ['..l..', '.lTT.', 'lTTTd', '.TTd.', '..d..'], {
    l: TEAL_LIGHT,
    T: TEAL,
    d: TEAL_DARK,
  });
  // its two sparkles take turns
  if (k < 2) px(g, 14, 15, PAPER);
  if (k === 0 || k === 3) px(g, 21, 18, PAPER);
  // round tree
  stamp(
    g,
    22,
    15,
    [
      '..gg..',
      '.gGGg.',
      'gGGLLg',
      'gGLLLg',
      '.gLLg.',
      '..gg..',
      '..wW..',
      '..wW..',
      '..wW..',
      '..wW..',
    ],
    {
      g: LEAF_DARK,
      G: GREEN_LIGHT,
      L: LEAF,
      w: WOOD_DARK,
      W: WOOD_SHADOW,
    },
  );
  // ground: a grass line over soft dirt with pebbles
  rect(g, 3, 25, 28, 25, GREEN);
  rect(g, 3, 26, 28, 29, CLAY);
  rect(g, 3, 26, 28, 26, LEAF);
  for (const [x, y] of [
    [5, 28],
    [10, 27],
    [14, 29],
    [19, 28],
    [24, 27],
    [27, 29],
  ]) {
    px(g, x, y, CLAY_DARK);
  }
  for (const x of [4, 9, 17, 26]) px(g, x, 24, GREEN); // grass tufts
  // the hero: a capybara hopping (facing right), a puff of dust behind
  // it on the frame it pushes off. Sky is flat SCREEN_BLUE behind it, so
  // lifting it leaves nothing to repair.
  const hop = [0, 1, 2, 1][k];
  stamp(g, 7, 18 - hop, ['......d.', '.llllll.', 'cccccecc', 'cccccccd', '.dccccd.', '.d....d.'], {
    l: WOOD_LIGHT,
    c: WOOD,
    d: WOOD_SHADOW,
    e: INK,
  });
  if (hop === 0) {
    px(g, 5, 22, PAPER);
    px(g, 4, 23, ICE);
  }
  // glare
  px(g, 4, 12, ICE);
  px(g, 3, 13, ICE);
  // controller + cable on the console top, soda can at the right
  stamp(g, 3, 34, ['.ssss.', 'sSrSgs', '.s..s.'], {
    s: STEEL_DARK,
    S: STEEL,
    r: RED,
    g: LED_GREEN,
  });
  stamp(g, 25, 32, ['ss', 'Rr', 'Pr', 'Rr', 'rr'], { s: SILVER, R: RED, r: BRICK, P: PAPER });
  return g;
}
const TV_CONSOLE_FRAMES = frameSet(4, tvConsole);

const TV_CONSOLE_BACK = (() => {
  const g = canvas(32, 48);
  consoleFront(g, true);
  rect(g, 13, 32, 18, 33, IRON_DARK);
  box(g, 1, 8, 30, 31, INK, IRON_DARK);
  rect(g, 2, 9, 29, 9, IRON);
  // rear housing bulge with vents
  box(g, 7, 12, 24, 27, INK, IRON, STEEL_DARK);
  for (let y = 15; y <= 24; y += 3) rect(g, 10, y, 21, y, IRON_DARK);
  rect(g, 14, 25, 17, 26, INK); // ports
  px(g, 15, 25, LED_GREEN);
  // cables running down behind the console
  for (let y = 27; y <= 37; y++) {
    px(g, 15, y, INK);
    px(g, 17, y + 1 > 37 ? 37 : y + 1, SLATE);
  }
  return g;
})();

/** Animated: the screen's glow spilling off the panel edge shimmers as the picture moves. */
function tvConsoleRight(k: number): G {
  const g = canvas(16, 48);
  // console top (top-down slab) x2-13 y14-41
  box(g, 2, 14, 13, 41, WOOD_DARK, WOOD_SURFACE, WOOD_LIGHT);
  // front face + legs
  box(g, 3, 42, 12, 44, WOOD_SHADOW, WOOD);
  for (const lx of [3, 11]) {
    rect(g, lx, 45, lx, 46, WOOD_DARK);
    rect(g, lx + 1, 45, lx + 1, 46, WOOD_SHADOW);
  }
  // TV seen edge-on, screen facing right: stand foot, rear housing bulge,
  // slim panel with the screen's glow spilling off its right edge
  rect(g, 3, 31, 11, 33, IRON_DARK);
  rect(g, 3, 31, 11, 31, IRON);
  // rear housing: a slim secondary bulge, lighter than the bezel, with vents
  rect(g, 4, 14, 5, 24, IRON);
  rect(g, 4, 14, 5, 14, STEEL_DARK);
  for (const y of [16, 18, 20, 22]) px(g, 4, y, IRON_DARK);
  box(g, 6, 4, 9, 32, INK, IRON_DARK);
  for (let y = 5; y <= 31; y++) px(g, 7, y, IRON);
  for (let y = 6; y <= 29; y++) px(g, 10, y, (y + k) % 5 === 0 ? SKY : SCREEN_BLUE);
  px(g, 8, 30, RED); // standby LED
  // controller + soda can on the top
  stamp(g, 9, 35, ['.ss.', 'sSrs', 'sggs', '.ss.'], {
    s: STEEL_DARK,
    S: STEEL,
    r: RED,
    g: STEEL,
  });
  stamp(g, 4, 36, ['ss', 'Rr', 'Pr', 'rr'], { s: SILVER, R: RED, r: BRICK, P: PAPER });
  return g;
}
const TV_CONSOLE_RIGHT_FRAMES = frameSet(5, tvConsoleRight);

// ════════════════════════════════════════════════════════════════
// 5. jukebox — 16x32, 1x1. Arched neon crown (pink tubes with warm
//    bubbles rising in them), a glowing record window with the disc on
//    the turntable, a row of cream selector keys, a gold speaker
//    grille and a chrome kick strip on a wood plinth.
// ════════════════════════════════════════════════════════════════
/** Animated: bubbles rise up the neon tubes, side tubes and centre tubes alike. */
function jukebox(k: number): G {
  const g = ascii(
    16,
    32,
    [
      '................',
      '................',
      '.....oooooo.....',
      '...oopppppPoo...',
      '..oppPPPPPPPDo..',
      '.opPPooooooPPDo.',
      '.opPoyYYYYyoPDo.',
      'opPoyYkkkkYyoPDo',
      'opPoyYkrrkYyoPDo',
      'opPoyYkkkkYyoPDo',
      'opPoyyyyyyyyoPDo',
      'opPooooooooooPDo',
      'opPocScScScSoPDo'.slice(0, 16),
      'opPoScScScScoPDo',
      'opPooooooooooPDo',
      'opPogggggggggPDo'.slice(0, 13) + 'PDo',
      'opPowwwwwwwwoPDo',
      'opPoggggggggoPDo',
      'opPowwwwwwwwoPDo',
      'opPoggggggggoPDo',
      'opPowwwwwwwwoPDo',
      'opPoggggggggoPDo',
      'opPowwwwwwwwoPDo',
      'opPooooooooooPDo',
      'olllllllllllllWo',
      'oWWWWWWWWWWWWWwo',
      'oSssssssssssssso',
      '.oooooooooooooo.',
      '..kk........kk..',
      '................',
      '................',
      '................',
    ],
    {
      o: WOOD_SHADOW,
      w: WOOD_DARK,
      W: WOOD,
      l: WOOD_LIGHT,
      P: PINK,
      p: PINK_DARK, // the arch's outer neon ring: a crisp dark edge, not a halo
      D: PINK_DARK,
      y: LAMP_WARM,
      Y: GOLD_LIGHT,
      k: INK,
      r: RED,
      s: SILVER,
      S: SILVER_LIGHT,
      c: CREAM,
      g: GOLD_DARK,
    },
  );
  // the record on the turntable: a black vinyl ellipse, red label, chrome spindle
  rect(g, 5, 6, 10, 10, LAMP_WARM);
  rect(g, 5, 6, 10, 6, GOLD_LIGHT);
  stamp(g, 5, 7, ['.Ikkk.', 'kkrSkk', '.kkkk.'], { I: IRON, k: INK, r: RED, S: SILVER });
  // tonearm resting on the edge of the disc
  px(g, 10, 7, SILVER_LIGHT);
  px(g, 9, 8, SILVER);
  // two neon bubble tubes either side of a wood mullion: 2px colour
  // bands cycling pink / gold / teal, the right column of each a shade
  // deeper, cream bubbles rising up the middle
  const bands: [string, string][] = [
    [PINK_LIGHT, PINK],
    [GOLD_LIGHT, GOLD],
    [TEAL_LIGHT, TEAL],
  ];
  for (let y = 15; y <= 22; y++) {
    const [lit, deep] = bands[Math.floor((y - 15) / 2) % 3];
    for (let x = 4; x <= 11; x++) {
      if (x === 7 || x === 8) px(g, x, y, x === 7 ? WOOD_DARK : WOOD_SHADOW);
      else px(g, x, y, x === 6 || x === 11 ? deep : lit);
    }
  }
  for (let y = 15; y <= 22; y++) {
    if ((y + k) % 3 === 1) px(g, 5, y, CREAM);
    if ((y + k) % 3 === 0) px(g, 10, y, CREAM);
  }
  px(g, 12, 15, WOOD_SHADOW);
  // bubbles rising in each neon side tube, staggered between the two,
  // cream low down and cooling to pink-light near the crown
  for (let y = 8; y <= 22; y++) {
    const c = y < 14 ? PINK_LIGHT : CREAM;
    if ((y + k) % 6 === 5) px(g, 2, y, c);
    if ((y + k) % 6 === 2) px(g, 13, y, c);
  }
  return g;
}
const JUKEBOX_FRAMES = frameSet(6, jukebox);

// ════════════════════════════════════════════════════════════════
// 6. dartboard — wall piece, 16x16, 1x1. Black number ring, alternating
//    cream/black singles with red/green doubles and trebles, a red
//    bull. Two darts landed on the board; the third missed and stuck in
//    the wall by the corner.
// ════════════════════════════════════════════════════════════════
const DARTBOARD = (() => {
  const g = canvas(16, 16);
  const cx = 7.5;
  const cy = 8.5;
  const R = 6.5;
  // concentric rings: ink rim, red/green doubles, cream/ink singles, red bull
  ellipse(g, cx, cy, R, R, (d, x, y) => {
    const r = Math.sqrt(d);
    const ang = Math.atan2(y + 0.5 - cy - 0.5, x + 0.5 - cx - 0.5);
    const sector = (Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 8) % 2) as 0 | 1;
    if (onRim(x, y, cx, cy, R, R)) return INK;
    if (r > 0.72) return sector ? RED : LEAF; // doubles
    return sector ? CREAM : INK; // singles
  });
  // 2x2 red bull with a gold centre
  rect(g, 7, 8, 8, 9, RED);
  px(g, 7, 8, GOLD);
  // a lit glint on the rim, top-left
  px(g, 3, 4, STEEL);
  // darts: tip in the board, a silver shaft, a 2px flight toward the top-left
  const dart = (x: number, y: number, flight: string, flightDark: string) => {
    px(g, x, y, STEEL_LIGHT);
    px(g, x - 1, y - 1, SILVER);
    px(g, x - 2, y - 2, flight);
    px(g, x - 3, y - 3, flightDark);
  };
  dart(10, 7, SKY, BLUE);
  dart(6, 12, PINK_LIGHT, PURPLE);
  // the third one missed: stuck in the wall past the rim
  dart(14, 3, TEAL_LIGHT, TEAL);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 7. piano — honky-tonk upright, 32x32 2x1 (front, back) / 16x48 1x2
//    (right, left). Wood case with inset panels, sheet music open on
//    the stand, a metronome on the lid, a full keyboard with grouped
//    black keys, three brass pedals.
// ════════════════════════════════════════════════════════════════
// black keys 2px long with 1px white gaps, grouped 2-3-2-3 like a real keyboard
const KEY_PATTERN = 'WBBWBBWWBBWBBWBBWW';

function keyRow(g: G, x0: number, x1: number, y: number, vertical: boolean): void {
  const n = x1 - x0 + 1;
  for (let i = 0; i < n; i++) {
    const black = KEY_PATTERN[i % KEY_PATTERN.length] === 'B';
    const backC = black ? INK : PAPER;
    const frontC = i % 3 === 2 ? SILVER : PAPER;
    if (!vertical) {
      px(g, x0 + i, y, backC);
      px(g, x0 + i, y + 1, frontC);
    } else {
      px(g, y, x0 + i, backC);
      px(g, y + 1, x0 + i, frontC);
    }
  }
}

/** Potted fern (3x4): leaves lit top-left over a clay pot. */
function fern(g: G, x: number, y: number): void {
  stamp(g, x, y, ['.l.', 'lLl', '.L.', 'Ccc'], { l: GREEN, L: LEAF_DARK, c: CLAY, C: ORANGE });
}

const PIANO = (() => {
  const g = canvas(32, 32);
  // lid
  box(g, 1, 4, 30, 7, WOOD_SHADOW, WOOD, WOOD_LIGHT);
  // upper case
  box(g, 1, 7, 30, 16, WOOD_SHADOW, WOOD_DARK);
  rect(g, 2, 8, 2, 15, WOOD);
  box(g, 4, 9, 9, 14, WOOD_SHADOW, WOOD_DARK); // inset panels
  box(g, 22, 9, 27, 14, WOOD_SHADOW, WOOD_DARK);
  // sheet music
  // two pages, three staff lines each with single notes, a shadowed fold
  stamp(
    g,
    11,
    8,
    ['pppppfpppp', 'sksssfsssk', 'ppkppfpkpp', 'sssksfssss', 'pkpppfppkp', 'sssssfskss'],
    { p: PAPER, s: SLATE, k: INK, f: CREAM_DARK },
  );
  rect(g, 10, 14, 21, 14, WOOD_LIGHT); // music ledge
  rect(g, 10, 15, 21, 15, WOOD_SHADOW);
  // keyboard: cheek blocks + fallboard + keys
  box(g, 1, 16, 30, 20, WOOD_SHADOW, WOOD);
  rect(g, 2, 16, 29, 16, WOOD_LIGHT); // lit lip of the keybed
  rect(g, 4, 17, 27, 17, WOOD_SHADOW); // fallboard edge
  keyRow(g, 4, 27, 18, false);
  rect(g, 2, 17, 2, 19, WOOD_LIGHT);
  // lower case with panels + pedals
  box(g, 1, 20, 30, 28, WOOD_SHADOW, WOOD_DARK);
  rect(g, 2, 21, 2, 27, WOOD);
  box(g, 4, 21, 14, 25, WOOD_SHADOW, WOOD_DARK);
  box(g, 17, 21, 27, 25, WOOD_SHADOW, WOOD_DARK);
  for (const x of [13, 16, 19]) {
    px(g, x, 27, GOLD);
    px(g, x + 1, 27, GOLD_DARK);
  }
  rect(g, 3, 20, 28, 20, INK); // the keys cast a shadow on the case below
  // toe blocks
  rect(g, 2, 29, 4, 30, WOOD_SHADOW);
  rect(g, 27, 29, 29, 30, WOOD_SHADOW);
  // metronome on the lid
  stamp(g, 23, 0, ['..o..', '.oWs.', '.oWo.', 'oWWWo', 'ooooo'], {
    o: WOOD_SHADOW,
    W: WOOD_LIGHT,
    s: SILVER_LIGHT,
  });
  px(g, 25, 0, SILVER_LIGHT);
  // a potted fern on the lid
  fern(g, 5, 0);
  return g;
})();

const PIANO_BACK = (() => {
  const g = canvas(32, 32);
  box(g, 1, 4, 30, 7, WOOD_SHADOW, WOOD, WOOD_LIGHT);
  box(g, 1, 7, 30, 28, WOOD_SHADOW, WOOD_DARK);
  rect(g, 2, 8, 2, 27, WOOD);
  for (const x of [8, 15, 16, 23]) rect(g, x, 8, x, 27, WOOD_SHADOW);
  rect(g, 2, 17, 29, 17, WOOD_SHADOW);
  rect(g, 2, 29, 4, 30, WOOD_SHADOW);
  rect(g, 27, 29, 29, 30, WOOD_SHADOW);
  stamp(g, 4, 0, ['..o..', '.sWo.', '.oWo.', 'oWWWo', 'ooooo'], {
    o: WOOD_SHADOW,
    W: WOOD_LIGHT,
    s: SILVER_LIGHT,
  });
  fern(g, 24, 0); // the fern, seen from behind
  // maker's plate and the power cord trailing to the wall
  rect(g, 10, 11, 12, 11, GOLD_DARK);
  px(g, 10, 11, GOLD);
  px(g, 27, 27, INK);
  px(g, 28, 28, INK);
  px(g, 29, 29, INK);
  px(g, 30, 30, INK);
  return g;
})();

const PIANO_RIGHT = (() => {
  const g = canvas(16, 48);
  // top lid strip (the piano runs down the column), keys facing right
  box(g, 2, 8, 9, 40, WOOD_SHADOW, WOOD, WOOD_LIGHT);
  // near end panel (the piano's side) facing the viewer
  box(g, 2, 40, 9, 45, WOOD_SHADOW, WOOD_DARK);
  rect(g, 3, 41, 3, 44, WOOD_LIGHT);
  // keybed sticking out to the right, lower than the lid
  box(g, 9, 20, 13, 43, WOOD_SHADOW, WOOD);
  keyRow(g, 22, 41, 10, true);
  rect(g, 12, 21, 12, 42, WOOD_DARK);
  // sheet music standing on the lid edge
  // sheet music on the stand, seen edge-on: a thin page with staff ticks
  rect(g, 8, 24, 8, 31, PAPER);
  for (const y of [25, 27, 29]) px(g, 8, y, SLATE);
  // feet
  rect(g, 2, 46, 3, 47, WOOD_SHADOW);
  rect(g, 8, 46, 9, 47, WOOD_SHADOW);
  // metronome on the lid, just in front of the fern
  stamp(g, 3, 11, ['..o..', '.oWs.', '.oWo.', 'oWWWo', 'ooooo'], {
    o: WOOD_SHADOW,
    W: WOOD_LIGHT,
    s: SILVER_LIGHT,
  });
  fern(g, 4, 6); // the fern sits on the top cap, beside the metronome
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 8. guitar_stand — sunburst acoustic on an iron A-frame, 16x32, 1x1.
//    Headstock with chrome pegs and a red pick tucked under the
//    strings, dot-inlaid neck, figure-eight body shading from a gold
//    centre to a dark rim, sound hole with strings across it.
// ════════════════════════════════════════════════════════════════
const GUITAR_STAND = (() => {
  const g = canvas(16, 32);
  // figure-eight body: upper bout 8px wide (3 rows), a 6px waist, lower
  // bout 10px wide (4 rows), each bout rounded by a narrower cap row
  const half: Record<number, number> = {
    18: 3,
    19: 4,
    20: 4,
    21: 4,
    22: 3,
    23: 5,
    24: 5,
    25: 5,
    26: 5,
    27: 4,
  };
  const inBody = (x: number, y: number) => {
    const hw = half[y];
    return hw !== undefined && Math.abs(x + 0.5 - 8) <= hw;
  };
  // stand behind the guitar: the upright post shows above the body
  rect(g, 10, 13, 10, 17, IRON_DARK);
  for (let y = 18; y <= 27; y++) {
    for (let x = 0; x < 16; x++) {
      if (!inBody(x, y)) continue;
      const edge = !inBody(x - 1, y) || !inBody(x + 1, y) || !inBody(x, y - 1) || !inBody(x, y + 1);
      if (edge) px(g, x, y, WOOD_DARK);
      else if (!inBody(x + 2, y) || !inBody(x, y + 2))
        px(g, x, y, WOOD); // shadow side
      else px(g, x, y, GOLD_DARK); // sunburst centre
    }
  }
  // lit upper-left of each bout
  for (const [x, y] of [
    [5, 19],
    [6, 19],
    [5, 20],
    [4, 23],
    [5, 23],
    [4, 24],
  ] as const) {
    px(g, x, y, WOOD_LIGHT);
  }
  // 2x2 sound hole centred in the upper bout
  rect(g, 7, 20, 8, 21, INK);
  // bridge with saddle across the lower bout
  rect(g, 6, 25, 9, 25, WOOD_SHADOW);
  rect(g, 7, 25, 8, 25, CREAM);
  // neck (rosewood) with fret dots
  for (let y = 10; y <= 18; y++) {
    px(g, 7, y, WOOD_DARK);
    px(g, 8, y, WOOD_SHADOW);
  }
  rect(g, 7, 10, 8, 10, CREAM); // nut
  px(g, 7, 13, CREAM);
  px(g, 7, 16, CREAM);
  // headstock + chrome pegs
  box(g, 6, 6, 9, 9, WOOD_SHADOW, WOOD);
  for (const y of [7, 8]) {
    px(g, 5, y, SILVER_LIGHT);
    px(g, 10, y, SILVER);
  }
  // neck yoke: two padded iron prongs holding the neck
  px(g, 6, 14, STEEL);
  px(g, 6, 15, IRON_DARK);
  px(g, 9, 14, STEEL);
  px(g, 9, 15, IRON_DARK);
  // the pick, tucked under the strings at the nut
  px(g, 9, 11, RED);
  px(g, 9, 12, BRICK_DARK);
  // A-frame: cradle under the lower bout, two legs splaying to the floor
  rect(g, 5, 28, 10, 28, IRON_DARK);
  px(g, 3, 27, IRON);
  px(g, 12, 27, IRON);
  line(g, 4, 28, 2, 31, IRON_DARK);
  line(g, 11, 28, 13, 31, IRON_DARK);
  px(g, 1, 31, INK);
  px(g, 14, 31, INK);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 9. drum_kit — five-piece kit, 32x48, 2x2. Red-shelled bass drum facing
//    you with a lightning-bolt logo, two rack toms, a chrome snare with
//    crossed sticks, a floor tom, hi-hat and crash cymbals on stands,
//    the drummer's stool behind, and the setlist taped to the floor.
// ════════════════════════════════════════════════════════════════
const DRUM_KIT = (() => {
  const g = canvas(32, 48);
  // drum = shell (side, depth px) then head ellipse on top
  const drum = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    depth: number,
    shell: string,
    shellDark: string,
  ) => {
    for (let k = depth; k >= 1; k--) {
      ellipse(g, cx, cy + k, rx, ry, (_d, x, y) =>
        onRim(x, y, cx, cy + k, rx, ry) || k === depth ? shellDark : x < cx ? shell : shellDark,
      );
    }
    ellipse(g, cx, cy, rx, ry, (d, x, y) => {
      if (onRim(x, y, cx, cy, rx, ry)) return SILVER;
      return d < 0.4 && x <= cx && y <= cy ? PAPER : CREAM;
    });
  };
  const cymbal = (cx: number, cy: number, rx: number, ry: number) =>
    ellipse(g, cx, cy, rx, ry, (d, x, y) => {
      if (onRim(x, y, cx, cy, rx, ry)) return GOLD_DARK;
      if (d < 0.15) return GOLD_DARK; // bell
      return x < cx - 1 ? GOLD_LIGHT : GOLD;
    });

  // crash stand + cymbal (back right)
  line(g, 27, 15, 27, 34, STEEL_DARK);
  cymbal(26.5, 14, 4.6, 1.6);
  // stool behind: a three-leg splay like the hi-hat stand
  line(g, 16, 19, 16, 23, IRON_DARK);
  line(g, 16, 21, 13, 24, IRON_DARK);
  line(g, 16, 21, 19, 24, IRON_DARK);
  ellipse(g, 16, 18, 3.4, 1.8, (d, x, y) =>
    onRim(x, y, 16, 18, 3.4, 1.8) ? INK : d < 0.5 && x < 16 ? IRON : IRON_DARK,
  );
  // hi-hat (left): stand, two cymbals
  line(g, 3, 21, 3, 36, STEEL_DARK);
  line(g, 1, 37, 3, 35, STEEL_DARK);
  line(g, 5, 37, 3, 35, STEEL_DARK);
  cymbal(3.5, 22, 3.4, 1.1);
  cymbal(3.5, 20.5, 3.4, 1.1);
  // snare: chrome shell, clean cream head
  drum(8.5, 29, 4.2, 2.4, 3, SILVER_LIGHT, STEEL);
  // floor tom (right) + legs
  line(g, 24, 36, 23, 41, STEEL_DARK);
  line(g, 30, 36, 31, 41, STEEL_DARK);
  drum(27, 30, 4.2, 2.4, 6, RED, BRICK_DARK);
  // the sticks, set down across the floor tom's head
  rect(g, 24, 29, 29, 29, WOOD_LIGHT);
  rect(g, 25, 31, 30, 31, WOOD);
  px(g, 24, 29, CREAM);
  px(g, 30, 31, CREAM);
  // bass drum: front head facing the viewer
  ellipse(g, 15.5, 36, 7.6, 7.2, (d, x, y) => {
    if (onRim(x, y, 15.5, 36, 7.6, 7.2)) return BRICK_DARK;
    if (d > 0.72) return x < 15 && y < 36 ? RED : BRICK;
    if (d > 0.62) return SILVER; // hoop
    return x + y > 15.5 + 36 + 4 ? CREAM_DARK : CREAM;
  });
  // lightning-bolt logo
  stamp(g, 13, 32, ['..yy', '.yy.', 'yyyy', '.yy.', 'yy..'], { y: GOLD });
  px(g, 15, 34, GOLD_DARK);
  // spurs
  line(g, 9, 41, 7, 44, STEEL_DARK);
  line(g, 22, 41, 24, 44, STEEL_DARK);
  // rack toms mounted on the bass drum
  rect(g, 15, 25, 16, 29, STEEL_DARK);
  drum(11.5, 25, 3.6, 2.1, 3, RED, BRICK_DARK);
  drum(20, 25, 3.6, 2.1, 3, RED, BRICK_DARK);
  // setlist taped to the floor: two lines of text, a dog-eared corner
  stamp(g, 1, 42, ['pppc', 'sspp', 'pppp', 'sssp'], { p: PAPER, s: SLATE, c: CREAM_DARK });
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 10. record_player — surface item, 16x16, 1x1. Wood plinth, black
//     vinyl with grooves and a red label, chrome tonearm resting on the
//     record, the sleeve propped behind it.
// ════════════════════════════════════════════════════════════════
/** Animated: a gold mark on the label turns with the record. */
function recordPlayer(k: number): G {
  const g = canvas(16, 16);
  // sleeve propped at the back
  box(g, 8, 0, 14, 6, PURPLE_DARK, PURPLE);
  ellipse(g, 11, 3, 1.8, 1.8, () => GOLD);
  px(g, 11, 3, PURPLE_DARK);
  // plinth top + front
  box(g, 1, 5, 14, 12, WOOD_DARK, WOOD_SURFACE, WOOD_LIGHT);
  box(g, 1, 12, 14, 14, WOOD_SHADOW, WOOD);
  px(g, 3, 13, SILVER_LIGHT);
  px(g, 5, 13, SILVER);
  px(g, 12, 13, LED_GREEN);
  // vinyl
  ellipse(g, 6.5, 8.5, 4.6, 2.9, (d, x, y) => {
    if (onRim(x, y, 6.5, 8.5, 4.6, 2.9)) return INK;
    if (d < 0.18) return RED;
    if (d > 0.45 && d < 0.6) return IRON_DARK;
    return x < 5 && y < 8 && d > 0.3 ? IRON : INK;
  });
  // the spin: a lighter arc of groove and a gold print mark on the label
  // both step a quarter turn per frame (the glare above stays put — it's
  // the room's light, not the record's)
  const turn = (k * Math.PI) / 2;
  ellipse(g, 6.5, 8.5, 4.6, 2.9, (d, x, y) => {
    let a = Math.atan2((y - 8.5) / 2.9, (x - 6.5) / 4.6) - turn;
    a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (d > 0.45 && d < 0.6 && a < Math.PI / 2.5) return IRON;
    if (d < 0.18 && a >= Math.PI && a < (3 * Math.PI) / 2) return GOLD;
    return null;
  });
  px(g, 6, 8, PAPER); // spindle
  // tonearm: pivot top-right, arm down to the record
  px(g, 12, 7, SILVER_LIGHT);
  px(g, 13, 7, STEEL);
  px(g, 12, 8, STEEL);
  line(g, 12, 8, 10, 10, SILVER_LIGHT);
  px(g, 9, 10, STEEL_DARK);
  return g;
}
const RECORD_PLAYER_FRAMES = frameSet(4, recordPlayer);

// ════════════════════════════════════════════════════════════════
// 11. board_game — surface item, 16x16, 1x1. A cross-and-circle race
//     game mid-play: four coloured home corners, a cream track, pawns
//     out on the board, a pawn knocked back home, and the two dice
//     thrown just behind the board.
// ════════════════════════════════════════════════════════════════
const BOARD_GAME = (() => {
  const g = canvas(16, 16);
  // cream board (interior x2-12, y2-12), a front edge and its shadow
  box(g, 1, 1, 13, 13, CREAM_DARK, CREAM);
  rect(g, 1, 14, 13, 14, CREAM_DARK);
  rect(g, 2, 15, 13, 15, STONE_DARK);
  // four 4x4 home squares in the corners
  rect(g, 2, 2, 5, 5, RED);
  rect(g, 9, 2, 12, 5, BLUE);
  rect(g, 2, 9, 5, 12, GOLD);
  rect(g, 9, 9, 12, 12, GREEN);
  // the track: a cross between the homes, edged by a 1px dark line
  for (let k = 2; k <= 12; k++) {
    if (k >= 6 && k <= 8) continue;
    px(g, 6, k, STONE_DARK);
    px(g, 8, k, STONE_DARK);
    px(g, k, 6, STONE_DARK);
    px(g, k, 8, STONE_DARK);
  }
  // three pawns out on the track: 1x2, darker base
  const pawn = (x: number, y: number, head: string, base: string) => {
    px(g, x, y, head);
    px(g, x, y + 1, base);
  };
  pawn(7, 3, RED, BRICK_DARK);
  pawn(10, 6, BLUE, NAVY);
  pawn(3, 6, GOLD, GOLD_DARK);
  // the die, thrown off the board onto the table
  rect(g, 14, 9, 15, 10, PAPER);
  px(g, 15, 10, INK);
  rect(g, 14, 11, 15, 11, STONE_DARK);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 12. lava_lamp — surface item, 16x16, 1x1. Chrome cone base and cap,
//     purple liquid with pink wax blobs rising and a pool settled at
//     the bottom, a lit stripe down the glass.
// ════════════════════════════════════════════════════════════════
/** Animated: two wax blobs climb out of the pool and squeeze into the cap, slowly. */
function lavaLamp(k: number): G {
  const g = ascii(
    16,
    16,
    [
      '................',
      '.......ys.......',
      '......sSSs......',
      '......olPo......',
      '.....olPPPo.....',
      '.....olPPPo.....',
      '....olPPPPPo....',
      '....olPPPPPo....',
      '....olPPPPPo....',
      '....olPPPPPo....',
      '....olpppppo....',
      '....shSSSSSs....',
      '...shSSSSSSSs...',
      '...shSSSSSSSs...',
      '...ssssssssss...',
      '................',
    ],
    {
      s: STEEL_DARK,
      S: SILVER,
      h: SILVER_LIGHT,
      y: LAMP_WARM, // the cap glows where the bulb heat comes out
      o: PURPLE_DARK,
      P: PURPLE,
      l: PINK_LIGHT, // lit left edge of the glass
      L: PINK_LIGHT,
      p: PINK,
    },
  );
  // the blobs: 2 rows tall, top-left lit, rising a row per frame through the
  // glass rows 3-9 and wrapping (into the cap at the top, back out of the
  // pool at the bottom). Painted only over liquid, so the glass clips them.
  const blob = (x: number, start: number, w: number) => {
    const y = 3 + ((((start - k) % 7) + 7) % 7);
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < w; dx++)
        if (g[y + dy]?.[x + dx] === PURPLE)
          px(g, x + dx, y + dy, dx === 0 && dy === 0 ? PINK_LIGHT : PINK);
  };
  blob(8, 1, 2);
  blob(6, 4, 3);
  return g;
}
const LAVA_LAMP_FRAMES = frameSet(7, lavaLamp);

// ════════════════════════════════════════════════════════════════
// 13. popcorn — surface item, 16x16, 1x1. Red-and-white striped bucket
//     heaped over the rim with puffs (some still buttery gold), and a
//     few that already fell onto the table.
// ════════════════════════════════════════════════════════════════
const POPCORN = (() => {
  const g = canvas(16, 16);
  // bucket rows 6-14, tapering one px per side at the bottom
  for (let y = 6; y <= 14; y++) {
    const inset = y >= 11 ? 1 : 0;
    const xa = 3 + inset;
    const xb = 12 - inset;
    for (let x = xa; x <= xb; x++) {
      const edge = x === xa || x === xb || y === 14;
      const stripe = Math.floor((x - 3) / 2) % 2 === 0;
      if (edge) px(g, x, y, BRICK_DARK);
      else if (y === 6) px(g, x, y, stripe ? PINK : PAPER);
      else px(g, x, y, stripe ? (x > 9 ? BRICK : RED) : x > 9 ? ICE : PAPER);
    }
  }
  // heap of puffs
  stamp(g, 3, 1, ['...cp.....', '..cPpcp.y.', '.cpPcpPcp.', 'cpPcyPpcPc', 'PcpPcpcPpc'], {
    c: CREAM,
    p: PAPER,
    P: CREAM_DARK,
    y: GOLD_LIGHT,
  });
  px(g, 2, 5, CREAM);
  px(g, 13, 4, PAPER);
  px(g, 13, 5, CREAM_DARK);
  // spilled
  px(g, 14, 14, CREAM);
  px(g, 13, 15, PAPER);
  px(g, 1, 15, CREAM);
  return g;
})();

// ════════════════════════════════════════════════════════════════
// 14. pinball — 16x48 1x2 (front: you stand at the bottom, backbox at
//     the far end) / 32x32 2x1 (right, left). Lit backbox with a
//     starfield and a big gold star, dot-matrix score; under the glass
//     a navy playfield with pop bumpers, an orbit lane, slingshots, two
//     flippers and the ball in play; purple cabinet with side art,
//     chrome lockdown bar and legs, coin door on the front.
// ════════════════════════════════════════════════════════════════
/**
 * Playfield details in field coords: a = from the backbox toward the player, b = across.
 * `flash` lights one pop bumper (0-2) as if just hit; -1 = all at rest.
 */
function playfield(
  set: (a: number, b: number, c: string) => void,
  L: number,
  W: number,
  flash = -1,
): void {
  const mid = Math.floor(W / 2);
  // orbit lane arc near the top
  for (let b = 1; b < W - 1; b++) set(1, b, PINK_DARK);
  set(2, 0, PINK_DARK);
  set(2, W - 1, PINK_DARK);
  // three round pop bumpers in a triangle: gold cap on a red 2x2
  const bumper = (a: number, b: number, lit: boolean) => {
    set(a - 1, b, lit ? PAPER : GOLD_LIGHT);
    set(a - 1, b + 1, lit ? PAPER : GOLD_LIGHT);
    set(a, b, lit ? ORANGE : RED);
    set(a, b + 1, lit ? ORANGE : RED);
    set(a + 1, b, RED);
    set(a + 1, b + 1, BRICK_DARK);
  };
  bumper(4, mid - 3, flash === 0);
  bumper(4, mid + 1, flash === 1);
  bumper(8, mid - 1, flash === 2);
  // flippers: 2px-thick white diagonals meeting at a 1px drain gap
  const nL = mid - 1;
  const nR = W - 2 - mid;
  const steps = Math.max(nL, nR);
  const fa = L - 3 - steps;
  for (let k = 0; k < nL; k++) {
    set(fa + k, 1 + k, PAPER);
    set(fa + k + 1, 1 + k, SILVER);
  }
  for (let k = 0; k < nR; k++) {
    set(fa + k, W - 2 - k, PAPER);
    set(fa + k + 1, W - 2 - k, SILVER);
  }
  // slingshots: little teal triangles above each flipper
  for (const [da, db] of [
    [-4, 0],
    [-3, 0],
    [-3, 1],
    [-2, 0],
  ]) {
    set(fa + da, 1 + db, da === -4 ? TEAL_LIGHT : TEAL);
    set(fa + da, W - 2 - db, da === -4 ? TEAL_LIGHT : TEAL);
  }
  // the ball, mid-field on its way down
  set(Math.floor(L * 0.45), mid + 1, SILVER_LIGHT);
  // drain
  set(L - 1, mid, INK);
  if (W % 2 === 0) set(L - 1, mid - 1, INK);
}

/** Animated: pop bumpers flash in turn, backbox stars twinkle. */
function pinball(k: number): G {
  const g = canvas(16, 48);
  // backbox: purple cabinet, outline a shade darker (ink only on the score)
  box(g, 2, 1, 13, 16, PURPLE_DARK, PURPLE);
  rect(g, 3, 2, 12, 2, PINK);
  rect(g, 3, 2, 3, 15, PINK);
  box(g, 4, 3, 12, 11, PURPLE_DARK, NAVY_DARK);
  // starfield: one star at a time blinks out, then a beat with all lit
  const dark = [-1, 0, 2, 1, 3, -1][k];
  [
    [5, 4],
    [11, 5],
    [5, 9],
    [11, 9],
  ].forEach(([x, y], i) => {
    if (i !== dark) px(g, x, y, PAPER);
  });
  stamp(g, 6, 5, ['..y..', '.yYy.', 'yyYyy', '.y.y.'], { y: GOLD, Y: GOLD_LIGHT });
  // dot-matrix score
  rect(g, 4, 13, 11, 14, INK);
  for (const x of [4, 6, 7, 9, 11]) px(g, x, 13, ORANGE);
  for (const x of [5, 6, 8, 10, 11]) px(g, x, 14, ORANGE);
  // cabinet rails + playfield
  box(g, 1, 16, 14, 40, PURPLE_DARK, PURPLE);
  rect(g, 2, 17, 2, 39, PINK); // lit left rail
  rect(g, 2, 17, 13, 17, PINK);
  rect(g, 3, 18, 12, 38, NAVY);
  rect(g, 12, 29, 12, 38, NAVY_DARK); // shooter lane
  px(g, 12, 38, SILVER);
  // a bumper flashes on every other frame, round the triangle
  playfield((a, b, c) => px(g, 3 + b, 18 + a, c), 21, 9, k % 2 ? (k - 1) / 2 : -1);
  // glass glare
  px(g, 4, 19, ICE);
  px(g, 3, 20, ICE);
  // lockdown bar + front face with coin door
  rect(g, 2, 39, 13, 39, SILVER_LIGHT);
  rect(g, 2, 40, 13, 40, SILVER);
  box(g, 2, 41, 13, 44, PURPLE_DARK, PURPLE);
  rect(g, 6, 42, 9, 43, INK);
  px(g, 7, 42, ORANGE);
  px(g, 8, 42, ORANGE);
  px(g, 3, 42, RED); // start button
  // legs: 2px dark stubs at the two front corners
  for (const lx of [3, 11]) {
    rect(g, lx, 45, lx, 47, IRON);
    rect(g, lx + 1, 45, lx + 1, 47, IRON_DARK);
  }
  return g;
}
const PINBALL_FRAMES = frameSet(6, pinball);

/** Animated: pop bumpers flash in turn, the marquee chaser bulbs run. */
function pinballRight(k: number): G {
  const g = canvas(32, 32);
  // backbox seen from its side, on the left
  box(g, 1, 1, 7, 23, PURPLE_DARK, PURPLE);
  rect(g, 2, 2, 6, 2, PINK);
  rect(g, 2, 2, 2, 22, PINK);
  // the lit marquee wraps round onto the backbox's right-facing edge:
  // three staggered rows of chaser bulbs
  for (let y = 4; y <= 9; y++) {
    const on = (y + k) % 2 === 0; // the chase steps a bulb per frame
    px(g, 6, y, on ? ORANGE : GOLD_LIGHT);
    if (on) px(g, 5, y, GOLD_LIGHT);
  }
  for (let y = 12; y <= 20; y += 2) px(g, 6, y, PINK_DARK); // art edge glow
  // playfield (top, under glass)
  box(g, 7, 10, 30, 22, PURPLE_DARK, PURPLE);
  rect(g, 8, 11, 29, 11, PINK);
  rect(g, 8, 12, 28, 21, NAVY);
  // the far half sits lower in shadow: the playfield slopes toward the player
  rect(g, 8, 12, 17, 21, NAVY_DARK);
  playfield((a, b, c) => px(g, 8 + a, 12 + b, c), 21, 10, k % 2 ? (k - 1) / 2 : -1);
  px(g, 9, 12, ICE);
  px(g, 8, 13, ICE);
  // lockdown bar on the player end
  rect(g, 29, 11, 29, 21, SILVER_LIGHT);
  // cabinet side with art
  box(g, 7, 22, 30, 26, PURPLE_DARK, PURPLE);
  for (let x = 9; x <= 28; x++) px(g, x, 24, (x >> 1) % 2 ? PINK : GOLD);
  rect(g, 8, 23, 29, 23, PINK_DARK);
  // legs
  for (const lx of [9, 27]) {
    rect(g, lx, 27, lx, 30, IRON);
    rect(g, lx + 1, 27, lx + 1, 30, IRON_DARK);
  }
  return g;
}
const PINBALL_RIGHT_FRAMES = frameSet(6, pinballRight);

// ════════════════════════════════════════════════════════════════
// 15. claw_machine — 16x32, 1x1. Teal cabinet a head taller than an
//     agent: chaser bulbs round a pink marquee, a glass box full of
//     plushies, and the claw coming up WITH something for once — a tiny
//     capybara plush. Joystick and buttons on the ledge, a prize chute
//     with a star plush peeking out, a coin door.
// ════════════════════════════════════════════════════════════════
/** Animated: the marquee chaser bulbs run, the credit LED blinks. */
function clawMachine(k: number): G {
  const g = ascii(
    16,
    32,
    [
      '................',
      '.oooooooooooooo.',
      '.oLyLyLyLyLyLyo.',
      '.oPMMMMMMMMMMPo.',
      '.oPMMMMMMMMMMPo.',
      '.oyPyPyPyPyPyPo.',
      '.oooooooooooooo.',
      '.oLNNNNNNNNNNPo.',
      '.oLNNNNNNNNNNPo.',
      '.oLNNNNNNNNNNPo.',
      '.oLNNNNNNNNNNPo.',
      '.oLNNNNNNNNNNPo.',
      '.oLNNNNNNNNNNPo.',
      '.oLNNNNNNNNNNPo.',
      '.oLNNNNNNNNNNPo.',
      '.oLNNNNNNNNNNPo.',
      '.oLNNNNNNNNNNPo.',
      '.oLNNNNNNNNNNPo.',
      '.oooooooooooooo.',
      '.oLLLLLLLLLLLLo.',
      '.oPPPPPPPPPPPPo.',
      '.oooooooooooooo.',
      '.oLPPPPPPPPPPPo.',
      '.oLPPPPPPPPPPPo.',
      '.oLPPPPPPPPPPPo.',
      '.oLPPPPPPPPPPPo.',
      '.oLPPPPPPPPPPPo.',
      '.oLPPPPPPPPPPPo.',
      '.oLPPPPPPPPPPPo.',
      '.oooooooooooooo.',
      '..kk........kk..',
      '..kk........kk..',
    ],
    {
      o: TEAL_DARK,
      P: TEAL,
      L: TEAL_LIGHT,
      y: GOLD_LIGHT,
      M: PINK,
      N: NAVY,
      k: IRON_DARK,
    },
  );
  // chaser bulbs above and below the marquee: lit and unlit swap each
  // frame, so the lights run round it
  for (let x = 2; x <= 13; x++) {
    px(g, x, 2, (x + k) % 2 === 1 ? GOLD_LIGHT : TEAL_LIGHT);
    px(g, x, 5, (x + k) % 2 === 0 ? GOLD_LIGHT : TEAL);
  }
  // marquee: a gold star between two pink-lit dots
  stamp(g, 7, 3, ['.Y.', 'YYY'], { Y: GOLD });
  px(g, 4, 3, PINK_LIGHT);
  px(g, 11, 4, PINK_LIGHT);
  // gantry rail with the carriage, cable down to the claw
  rect(g, 3, 7, 12, 7, STEEL);
  rect(g, 7, 7, 8, 7, SILVER_LIGHT);
  rect(g, 8, 8, 8, 9, STEEL_LIGHT);
  // the claw, prongs closed round a capybara plush
  stamp(g, 6, 10, ['.sSs.', 's...s', 's...s', '.s.s.'], { s: SILVER, S: SILVER_LIGHT });
  stamp(g, 7, 11, ['lll', 'cce', 'ddd'], { l: WOOD_LIGHT, c: WOOD, e: INK, d: WOOD_DARK });
  // the plushie pile
  stamp(g, 3, 13, ['..p....b..', '.pPP.y.bB.', 'pPPyYeYbBg', 'PPyYYYgBGG', 'yYYgGGGPPp'], {
    p: PINK_LIGHT,
    P: PINK,
    y: GOLD_LIGHT,
    Y: GOLD,
    e: INK,
    b: SKY,
    B: BLUE,
    g: GREEN_LIGHT,
    G: GREEN,
  });
  // glare on the glass
  px(g, 4, 8, ICE);
  px(g, 3, 9, ICE);
  px(g, 11, 12, SKY);
  // joystick + buttons + coin slot on the ledge
  px(g, 4, 18, RED);
  px(g, 4, 19, IRON_DARK);
  px(g, 3, 18, PINK);
  if (k < 2) px(g, 8, 20, LED_GREEN); // credit LED, blinking
  px(g, 10, 20, GOLD);
  rect(g, 12, 20, 12, 20, INK);
  // prize chute with a star plush peeking out
  box(g, 3, 23, 7, 26, TEAL_DARK, INK);
  px(g, 5, 25, GOLD);
  px(g, 4, 25, GOLD_LIGHT);
  // coin door
  box(g, 9, 23, 12, 27, IRON_DARK, IRON);
  rect(g, 10, 24, 11, 24, GOLD_DARK);
  px(g, 10, 26, RED);
  return g;
}
const CLAW_MACHINE_FRAMES = frameSet(4, clawMachine);

// ════════════════════════════════════════════════════════════════
// 16. air_hockey — table mid-rally, 32x32 2x1 (front) / 16x48 1x2
//     (right). Navy rails, an ice-white deck dotted with air holes, a
//     red centre line, goal slots in the short ends, a red and
//     a blue mallet, and the glowing puck streaking between them. A red
//     LED score glows on the cabinet front.
// ════════════════════════════════════════════════════════════════
function airHockey(vertical: boolean): G {
  const w = vertical ? 16 : 32;
  const h = vertical ? 48 : 32;
  const g = canvas(w, h);
  const tx0 = 1;
  const tx1 = w - 2;
  const ty0 = vertical ? 9 : 8;
  const ty1 = vertical ? 40 : 22;
  // rails + deck
  box(g, tx0, ty0, tx1, ty1, NAVY_DARK, NAVY, BLUE);
  const dx0 = tx0 + 3;
  const dx1 = tx1 - 3;
  const dy0 = ty0 + 3;
  const dy1 = ty1 - 3;
  rect(g, dx0, dy0, dx1, dy1, ICE);
  rect(g, dx0, dy0, dx1, dy0, SKY); // rail shadow on the deck
  rect(g, dx0, dy0, dx0, dy1, SKY);
  rect(g, dx0 + 1, dy1, dx1, dy1, PAPER); // lit near edge
  for (let y = dy0 + 2; y < dy1; y += 2) {
    for (let x = dx0 + 2 + (y % 4 === 0 ? 1 : 0); x < dx1; x += 3) px(g, x, y, SKY);
  }
  // centre line, goal slots in the short ends
  if (!vertical) {
    const cx = Math.floor((dx0 + dx1) / 2);
    rect(g, cx, dy0 + 1, cx, dy1, RED);
    const cy = (dy0 + dy1) / 2;
    rect(g, tx0 + 1, cy - 2, tx0 + 2, cy + 2, INK);
    rect(g, tx1 - 2, cy - 2, tx1 - 1, cy + 2, INK);
  } else {
    const cy = Math.floor((dy0 + dy1) / 2);
    rect(g, dx0 + 1, cy, dx1, cy, RED);
    const gx = Math.floor((dx0 + dx1) / 2);
    rect(g, gx - 2, ty0 + 1, gx + 3, ty0 + 2, INK);
    rect(g, gx - 2, ty1 - 2, gx + 3, ty1 - 1, INK);
  }
  // mallets: 3x2 base with a lit knob
  const mallet = (x: number, y: number, base: string, dark: string, knob: string) => {
    rect(g, x, y + 1, x + 2, y + 2, base);
    px(g, x + 2, y + 2, dark);
    px(g, x + 1, y, knob);
    px(g, x + 1, y + 1, dark);
  };
  // the glowing puck and its streak
  const puck = (x: number, y: number) => {
    px(g, x, y, GOLD_LIGHT);
    px(g, x + 1, y, LAMP_WARM);
    px(g, x, y + 1, LAMP_WARM);
    px(g, x + 1, y + 1, ORANGE);
  };
  if (!vertical) {
    mallet(6, 13, RED, BRICK_DARK, PINK);
    mallet(23, 15, BLUE, NAVY, SKY);
    puck(19, 12);
    px(g, 17, 13, GOLD_LIGHT);
    px(g, 15, 14, PAPER);
    px(g, 13, 15, GOLD_LIGHT);
  } else {
    mallet(5, 15, BLUE, NAVY, SKY);
    mallet(7, 32, RED, BRICK_DARK, PINK);
    puck(8, 20);
    px(g, 9, 23, GOLD_LIGHT);
    px(g, 8, 26, PAPER);
    px(g, 9, 29, GOLD_LIGHT);
  }
  // cabinet front with the LED score, legs
  if (!vertical) {
    box(g, tx0 + 1, ty1 + 1, tx1 - 1, ty1 + 5, NAVY_DARK, NAVY);
    rect(g, tx0 + 2, ty1 + 1, tx1 - 2, ty1 + 1, BLUE);
    rect(g, 11, 24, 20, 26, INK);
    stamp(g, 13, 24, ['rr.r.rr', '.r...r.', 'rr.r.rr'], { r: RED });
    for (const lx of [3, 27]) {
      rect(g, lx, ty1 + 6, lx, h - 1, IRON);
      rect(g, lx + 1, ty1 + 6, lx + 1, h - 1, IRON_DARK);
    }
  } else {
    box(g, tx0 + 1, ty1 + 1, tx1 - 1, ty1 + 4, NAVY_DARK, NAVY);
    rect(g, tx0 + 2, ty1 + 1, tx1 - 2, ty1 + 1, BLUE);
    // the short end has no room for digits: a single red LED in a bezel
    rect(g, 6, 42, 9, 43, INK);
    px(g, 7, 42, RED);
    px(g, 8, 42, BRICK_DARK);
    for (const lx of [3, 11]) {
      rect(g, lx, ty1 + 5, lx, h - 1, IRON);
      rect(g, lx + 1, ty1 + 5, lx + 1, h - 1, IRON_DARK);
    }
  }
  return g;
}

const AIR_HOCKEY = airHockey(false);
const AIR_HOCKEY_RIGHT = airHockey(true);

// ════════════════════════════════════════════════════════════════
// 17. rubiks_cube — surface item, 16x16, 1x1. A cube left half-solved:
//     the white face and the first red row done, the rest still a mess,
//     with the algorithm scribbled on a sticky note beside it.
// ════════════════════════════════════════════════════════════════
const RUBIKS_CUBE = (() => {
  const g = canvas(16, 16);
  // black plastic body x1-10, y3-15: a 2px top face over the front face,
  // 2px stickers in 1px ink gutters
  rect(g, 1, 3, 10, 15, INK);
  rect(g, 1, 3, 10, 5, IRON_DARK); // the top face's gutters catch the light
  const cols = [2, 5, 8];
  // top face (foreshortened to two rows): a mess of colours, lighter tones
  const top = [
    [PAPER, GOLD_LIGHT, PAPER],
    [SKY, PAPER, GREEN_LIGHT],
  ];
  top.forEach((row, r) => row.forEach((c, k) => rect(g, cols[k], 4 + r, cols[k] + 1, 4 + r, c)));
  // front face: the first row solved, the rest still scrambled
  const front = [
    [RED, RED, RED],
    [BLUE, ORANGE, LEAF],
    [GOLD, RED, BLUE],
  ];
  const shade: Record<string, string> = {
    [RED]: BRICK,
    [BLUE]: NAVY,
    [ORANGE]: CLAY,
    [LEAF]: LEAF_DARK,
    [GOLD]: GOLD_DARK,
  };
  front.forEach((row, r) =>
    row.forEach((c, k) => {
      const x = cols[k];
      const y = 7 + 3 * r;
      rect(g, x, y, x + 1, y + 1, c);
      px(g, x + 1, y + 1, shade[c] ?? c);
    }),
  );
  px(g, 1, 3, IRON); // a glint on the top-left corner
  // the sticky note with the algorithm, set a little apart
  stamp(g, 12, 11, ['ykky', 'yyyy', 'ykky', 'GGGG'], { y: GOLD_LIGHT, k: INK, G: GOLD });
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

/** Attach an animation: frame 0 becomes the still sprite, the rest loop after it. */
const animated = (e: GeneratedSprite, all: G[], frameMs: number): GeneratedSprite => ({
  ...e,
  sprite: all[0],
  frames: all.slice(1),
  frameMs,
});

export const SPRITES11: GeneratedSprite[] = [
  entry('pool_table', 'Pool Table', 48, 32, 3, 2, POOL_TABLE, 'pool_table', 'front'),
  entry(
    'pool_table_right',
    'Pool Table (Rotated)',
    32,
    48,
    2,
    3,
    POOL_TABLE_RIGHT,
    'pool_table',
    'right',
  ),
  entry('foosball', 'Foosball Table', 32, 32, 2, 1, FOOSBALL, 'foosball', 'front'),
  entry(
    'foosball_right',
    'Foosball Table (Rotated)',
    16,
    48,
    1,
    2,
    FOOSBALL_RIGHT,
    'foosball',
    'right',
  ),
  animated(
    entry('pinball', 'Pinball Machine', 16, 48, 1, 2, [], 'pinball', 'front'),
    PINBALL_FRAMES,
    220,
  ),
  animated(
    entry('pinball_right', 'Pinball Machine (Right)', 32, 32, 2, 1, [], 'pinball', 'right'),
    PINBALL_RIGHT_FRAMES,
    220,
  ),
  animated(
    entry('pinball_left', 'Pinball Machine (Left)', 32, 32, 2, 1, [], 'pinball', 'left'),
    PINBALL_RIGHT_FRAMES.map(mirrorSprite),
    220,
  ),
  animated(
    entry('tv_console', 'TV Console', 32, 48, 2, 1, [], 'tv_console', 'front'),
    TV_CONSOLE_FRAMES,
    200,
  ),
  entry(
    'tv_console_back',
    'TV Console (Back)',
    32,
    48,
    2,
    1,
    TV_CONSOLE_BACK,
    'tv_console',
    'back',
  ),
  animated(
    entry('tv_console_right', 'TV Console (Right)', 16, 48, 1, 2, [], 'tv_console', 'right'),
    TV_CONSOLE_RIGHT_FRAMES,
    200,
  ),
  animated(
    entry('tv_console_left', 'TV Console (Left)', 16, 48, 1, 2, [], 'tv_console', 'left'),
    TV_CONSOLE_RIGHT_FRAMES.map(mirrorSprite),
    200,
  ),
  entry('gaming_recliner', 'Gaming Recliner', 16, 32, 1, 1, RECLINER, 'gaming_recliner', 'front'),
  entry(
    'gaming_recliner_back',
    'Gaming Recliner (Back)',
    16,
    32,
    1,
    1,
    RECLINER_BACK,
    'gaming_recliner',
    'back',
  ),
  entry(
    'gaming_recliner_right',
    'Gaming Recliner (Right)',
    16,
    32,
    1,
    1,
    RECLINER_RIGHT,
    'gaming_recliner',
    'right',
  ),
  entry(
    'gaming_recliner_left',
    'Gaming Recliner (Left)',
    16,
    32,
    1,
    1,
    mirrorSprite(RECLINER_RIGHT),
    'gaming_recliner',
    'left',
  ),
  animated(entry('jukebox', 'Jukebox', 16, 32, 1, 1, []), JUKEBOX_FRAMES, 200),
  entry('piano', 'Upright Piano', 32, 32, 2, 1, PIANO, 'piano', 'front'),
  entry('piano_back', 'Upright Piano (Back)', 32, 32, 2, 1, PIANO_BACK, 'piano', 'back'),
  entry('piano_right', 'Upright Piano (Right)', 16, 48, 1, 2, PIANO_RIGHT, 'piano', 'right'),
  entry(
    'piano_left',
    'Upright Piano (Left)',
    16,
    48,
    1,
    2,
    mirrorSprite(PIANO_RIGHT),
    'piano',
    'left',
  ),
  entry('drum_kit', 'Drum Kit', 32, 48, 2, 2, DRUM_KIT),
  entry('guitar_stand', 'Guitar on Stand', 16, 32, 1, 1, GUITAR_STAND),
  entry('dartboard', 'Dartboard', 16, 16, 1, 1, DARTBOARD),
  animated(entry('record_player', 'Record Player', 16, 16, 1, 1, []), RECORD_PLAYER_FRAMES, 450),
  entry('board_game', 'Board Game', 16, 16, 1, 1, BOARD_GAME),
  animated(entry('lava_lamp', 'Lava Lamp', 16, 16, 1, 1, []), LAVA_LAMP_FRAMES, 380),
  entry('popcorn', 'Popcorn Bucket', 16, 16, 1, 1, POPCORN),
  animated(entry('claw_machine', 'Claw Machine', 16, 32, 1, 1, []), CLAW_MACHINE_FRAMES, 300),
  entry('air_hockey', 'Air Hockey Table', 32, 32, 2, 1, AIR_HOCKEY, 'air_hockey', 'front'),
  entry(
    'air_hockey_right',
    'Air Hockey Table (Rotated)',
    16,
    48,
    1,
    2,
    AIR_HOCKEY_RIGHT,
    'air_hockey',
    'right',
  ),
  entry('rubiks_cube', 'Puzzle Cube', 16, 16, 1, 1, RUBIKS_CUBE),
];

validateSprites(SPRITES11);

export const META11: Record<string, CatalogMeta> = {
  pool_table: { category: 'decor' },
  pool_table_right: { category: 'decor' },
  foosball: { category: 'decor' },
  foosball_right: { category: 'decor' },
  pinball: { category: 'electronics' },
  pinball_right: { category: 'electronics' },
  pinball_left: { category: 'electronics' },
  tv_console: { category: 'electronics' },
  tv_console_back: { category: 'electronics' },
  tv_console_right: { category: 'electronics' },
  tv_console_left: { category: 'electronics' },
  gaming_recliner: { category: 'chairs' },
  gaming_recliner_back: { category: 'chairs' },
  gaming_recliner_right: { category: 'chairs' },
  gaming_recliner_left: { category: 'chairs' },
  jukebox: { category: 'electronics' },
  piano: { category: 'decor' },
  piano_back: { category: 'decor' },
  piano_right: { category: 'decor' },
  piano_left: { category: 'decor' },
  drum_kit: { category: 'decor' },
  guitar_stand: { category: 'decor' },
  dartboard: { category: 'wall', canPlaceOnWalls: true },
  record_player: { category: 'electronics', canPlaceOnSurfaces: true },
  board_game: { category: 'decor', canPlaceOnSurfaces: true },
  lava_lamp: { category: 'decor', canPlaceOnSurfaces: true },
  popcorn: { category: 'decor', canPlaceOnSurfaces: true },
  claw_machine: { category: 'electronics' },
  air_hockey: { category: 'decor' },
  air_hockey_right: { category: 'decor' },
  rubiks_cube: { category: 'decor', canPlaceOnSurfaces: true },
};
