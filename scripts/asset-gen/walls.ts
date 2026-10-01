/**
 * walls.ts — Wall styles for walls.png.
 *
 * Each style is a full auto-tile set: 16 pieces of 16×32, indexed by the
 * 4-bit neighbour mask (N=1, E=2, S=4, W=8). The bottom 16 rows are the
 * tile's plan view, the top 16 the wall face rising above it. Styles are
 * stacked vertically in walls.png (style k at y = k*128); the webview
 * splits them, and a wall tile picks its style by tile value.
 *
 * Like floors, walls are GRAYSCALE: the editor tints them with Colorize
 * (luminance → HSL), so contrast is all a style has to work with.
 *
 * Style 0 is the original wall, read from walls-classic.png so existing
 * offices keep exactly their look. walls-classic.png is a FROZEN copy of the
 * single-style walls.png that shipped before styles existed — do not
 * regenerate it. (scripts/generate-walls.js draws a different, 8px-band
 * geometry and writes straight to the shipped walls.png; it is not the
 * source of this sheet and must not be run over the stacked multi-style one.)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import pngjs from 'pngjs';

export interface WallStyle {
  id: string;
  label: string;
  /** 16 pieces of 32 rows × 16 cols, '' = transparent. Index = neighbour mask. */
  pieces: string[][][];
}

const HERE = path.dirname(fileURLToPath(import.meta.url));

function readSheet(file: string): string[][][] {
  const png = pngjs.PNG.sync.read(fs.readFileSync(path.join(HERE, file)));
  const pieces: string[][][] = [];
  for (let mask = 0; mask < 16; mask++) {
    const ox = (mask % 4) * 16;
    const oy = Math.floor(mask / 4) * 32;
    const piece: string[][] = [];
    for (let y = 0; y < 32; y++) {
      const row: string[] = [];
      for (let x = 0; x < 16; x++) {
        const i = ((oy + y) * png.width + ox + x) * 4;
        if (png.data[i + 3] < 128) {
          row.push('');
          continue;
        }
        const hex = (v: number) => v.toString(16).padStart(2, '0');
        row.push(
          `#${hex(png.data[i])}${hex(png.data[i + 1])}${hex(png.data[i + 2])}`.toUpperCase(),
        );
      }
      piece.push(row);
    }
    pieces.push(piece);
  }
  return pieces;
}

// ════════════════════════════════════════════════════════════════
// Generated styles
//
// Geometry is the SHIPPED classic sheet's (walls-classic.png — note it is
// not what scripts/generate-walls.js draws any more): every piece is a full
// 16-wide block, opaque from its top row to row 31. Read as a 3/4 box:
//
//   rows 0..7   LID   — the wall's top seen from above
//   rows 8..31  FACE  — its south face (8 rows over the tile to the north,
//                       then the whole wall tile itself)
//
// With S connected the lid simply continues to row 31 (a north–south run
// is all lid; its face shows only at the southern end). Rows 16..31 of an
// S-connected piece are always painted over by the southern piece's rows
// 0..15, and pieces draw north→south, so this is seamless by construction.
//
// Outlines follow classic: top row unless N, bottom row unless S, a side
// unless that side connects — and where it connects, the side stays closed
// next to the lid of a south-running tongue (rows 8+, where the neighbour
// shows face) and at the row-0 concave corner.
//
// Because the face always starts at row `lidTop + 8` and the lid band at
// `lidTop`, texture coordinates are piece-independent: face texture is a
// function of (x, fy = rows below the lid), lid texture of (x, row) — both
// period ≤ 16 — so brick courses and seams line up across every junction.
// A shorter wall (cubicle) moves the lid down by `lidTop` px and leaves the
// rows above transparent, so the floor to the north shows over it.
// ════════════════════════════════════════════════════════════════

const T = 16;
const SPRITE_H = 32;
const LID_H = 8;

/** One pixel handed to a style's texture function. */
export interface WallPx {
  /** 'outline' = silhouette border; 'lid' = top seen from above; 'face' = south face. */
  region: 'outline' | 'lid' | 'face';
  /** Sprite column 0..15 (= world x mod 16). */
  x: number;
  /** Sprite row 0..31. */
  r: number;
  /** Face: rows below the lid (0 = first face row). -1 elsewhere. */
  fy: number;
  /** Lid: position across the run's thickness (E–W band: 0..7 down the band; N–S run: column 0..15). */
  across: number;
  /** Lid: pixel belongs to a north–south run rather than the E–W band. */
  vertical: boolean;
  /** Lid: on the joint between two pieces along the run. */
  seam: boolean;
  /** Lid: last row before the face (its front arris). */
  lidFront: boolean;
  mask: number;
}

type Texture = (p: WallPx) => number;

const gray = (v: number): string => {
  const h = Math.max(0, Math.min(255, Math.round(v)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `#${h}${h}${h}`;
};

function buildWallSet(tex: Texture, lidTop = 0): string[][][] {
  const faceTop = lidTop + LID_H;
  const pieces: string[][][] = [];
  for (let mask = 0; mask < 16; mask++) {
    const N = !!(mask & 1);
    const E = !!(mask & 2);
    const S = !!(mask & 4);
    const W = !!(mask & 8);
    const piece: string[][] = [];
    for (let r = 0; r < SPRITE_H; r++) {
      const row: string[] = [];
      for (let x = 0; x < T; x++) {
        if (r < lidTop && !N) {
          row.push('');
          continue;
        }
        const lid = r < faceTop || S;
        const sideOutline = (connected: boolean) =>
          !connected || r === 0 || r < lidTop || (lid && r >= faceTop);
        const outline =
          (r === lidTop && !N) ||
          (r === SPRITE_H - 1 && !S) ||
          (x === 0 && sideOutline(W)) ||
          (x === T - 1 && sideOutline(E));
        const vertical = lid && (!(E || W) || r < lidTop || r >= faceTop);
        const px: WallPx = {
          region: outline ? 'outline' : lid ? 'lid' : 'face',
          x,
          r,
          fy: lid ? -1 : r - faceTop,
          across: vertical ? x : r - lidTop,
          vertical,
          seam: lid && (vertical ? (((r - lidTop) % T) + T) % T === 0 : x === 0),
          lidFront: lid && !S && r === faceTop - 1,
          mask,
        };
        row.push(gray(tex(px)));
      }
      piece.push(row);
    }
    pieces.push(piece);
  }
  return pieces;
}

/**
 * Face lift. Walls are always Colorized, and the bundled office's wall tint
 * ({b:-84, c:-55}) maps luminance below ~0.32 to pure black — while the
 * classic face is flat #FFFFFF. Texture functions are written in a natural
 * "material" range (dark wood, mid brick); this remaps a style's FACE pixels
 * from that range onto [lo, 0xF8] with a gamma that lifts the mids, so the
 * face averages near classic's brightness yet keeps its darkest structural
 * accents (mortar, stiles, kick plates) at or above `lo` (≥ 0x60, i.e. above
 * the clip point). Order is preserved, so every edge and bevel survives.
 * Lid and outline pass through untouched.
 */
function liftFace(tex: Texture, lo: number, gamma: number, lidTop = 0): Texture {
  // the style's face range, sampled over every piece it can draw
  let min = 255;
  let max = 0;
  const probe: Texture = (p) => {
    const v = tex(p);
    if (p.region === 'face') {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    return v;
  };
  buildWallSet(probe, lidTop);
  const hi = 0xf8;
  return (p) => {
    const v = tex(p);
    if (p.region !== 'face' || max === min) return v;
    const t = (v - min) / (max - min);
    return lo + (hi - lo) * Math.pow(t, gamma);
  };
}

/** Deterministic per-cell hash; callers pass coordinates already reduced mod 16. */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) >>> 0;
  h = (h ^ (h >> 13)) >>> 0;
  h = (Math.imul(h, 1103515245) + 12345) >>> 0;
  return h % 251;
}

/** Lid speckle, period 16 in screen space so a run's lid reads as one surface. */
const lidNoise = (p: WallPx, seed: number) => hash(p.x, p.r % T, seed);

// ── Red brick: running bond (7×3 bricks, 1px mortar), stone coping ──
const brick: Texture = (p) => {
  if (p.region === 'outline') return 0x30;
  if (p.region === 'lid') {
    if (p.seam) return 0x98;
    if (p.lidFront) return 0xe0; // lit front arris of the coping
    return lidNoise(p, 21) < 24 ? 0xb8 : 0xc6;
  }
  const course = Math.floor(p.fy / 4);
  const inCourse = p.fy % 4;
  if (inCourse === 3) return 0xc0; // bed joint
  const off = course % 2 ? 4 : 0;
  const bx = (p.x + off) % 8;
  if (bx === 7) return 0xc0; // head joint
  const idx = (Math.floor((p.x + off) / 8) % 2) * 3 + (course % 3);
  const tone = [0x84, 0x76, 0x8c, 0x7a, 0x88, 0x70][idx];
  if (p.fy === 0) return tone - 0x18; // shadow under the coping
  if (inCourse === 0) return tone + 0x0e; // lit top of each brick
  if (bx === 6 && inCourse === 2) return tone - 0x0c;
  return tone;
};

// ── Wood wainscot: plaster above a chair rail, raised dark panels below ──
const wainscot: Texture = (p) => {
  if (p.region === 'outline') return 0x2c;
  if (p.region === 'lid') {
    if (p.seam) return 0x84;
    if (p.lidFront) return 0xd2;
    // one groove down the middle of the cap, along the run
    if (p.across === (p.vertical ? 8 : 4)) return 0x98;
    return lidNoise(p, 4) < 30 ? 0xa8 : 0xb2;
  }
  if (p.fy === 0) return 0xba; // shadow under the cap
  if (p.fy <= 9) return hash(p.x, p.fy, 5) < 14 ? 0xd4 : 0xdc; // plaster
  if (p.fy === 10) return 0xb4; // chair rail
  if (p.fy === 11) return 0x8c;
  if (p.fy === 12) return 0x50; // rail shadow
  if (p.fy >= 21) return p.fy === 21 ? 0x86 : 0x52; // skirting
  // raised panels 8px wide: stile, bevelled field
  const px = p.x % 8;
  if (px === 0) return 0x56;
  if (px === 1) return 0x7e;
  if (p.fy === 13) return 0x7e;
  if (p.fy === 20) return 0x5a;
  if (px === 2 || p.fy === 14) return 0x80; // lit bevel
  if (px === 7 || p.fy === 19) return 0x5e; // shaded bevel
  return 0x6c;
};

// ── Glass partition: aluminium rails, pale pane, frosted band, glints ──
const glass: Texture = (p) => {
  if (p.region === 'outline') return 0x44;
  if (p.region === 'lid') {
    // slim frame along the run's centre, glass edge either side
    const mid = p.vertical ? 7 : 3;
    if (p.across === mid) return 0xe8;
    if (p.across === mid + 1) return 0x8a;
    if (p.seam) return 0x9a;
    return 0xc8;
  }
  if (p.fy <= 1) return p.fy === 0 ? 0x70 : 0x94; // head rail
  if (p.fy >= 20) return p.fy === 20 ? 0x9a : 0x6c; // base rail
  if (p.x === 0) return 0x80; // mullion at each tile seam
  if (p.x === 1) return 0xd0;
  if (p.fy >= 9 && p.fy <= 11) return p.fy === 10 ? 0xe4 : 0xdc; // frosted band
  const d = (((p.x + p.fy) % 16) + 16) % 16;
  if (d === 8) return 0xf2; // glint: one pixel wide, so a run doesn't read as stamped windows
  if (d === 10) return 0xd8;
  return p.fy <= 4 ? 0xbc : 0xb2;
};

// ── Stone blocks: ashlar courses of bevelled blocks, flagstone cap ──
const STONE_JOINTS = [
  [0, 9],
  [4, 13],
  [2, 11],
  [6, 15],
];
const stone: Texture = (p) => {
  if (p.region === 'outline') return 0x28;
  if (p.region === 'lid') {
    if (p.seam) return 0x60;
    if (p.lidFront) return 0xcc;
    if (p.vertical ? p.across === 8 && p.r % 8 !== 0 : p.across === 4) return 0x7a;
    const n = lidNoise(p, 9);
    return n < 25 ? 0x9c : n > 230 ? 0xba : 0xac;
  }
  if (p.fy % 6 === 5) return 0x4e; // bed joint
  const course = Math.floor(p.fy / 6);
  const local = p.fy % 6;
  const [j0, j1] = STONE_JOINTS[course % 4];
  if (p.x === j0 || p.x === j1) return 0x4e;
  const second = p.x > j0 && p.x < j1;
  const start = second ? j0 : j1;
  const tone = [0x94, 0x86, 0x8c, 0x98, 0x88, 0x92, 0x8a, 0x90][course * 2 + (second ? 1 : 0)];
  const left = p.x === (start + 1) % 16;
  const right = (p.x + 1) % 16 === (second ? j1 : j0);
  if (local === 0 || left) return tone + 0x18; // lit bevel
  if (local === 4 || right) return tone - 0x14; // shaded bevel
  return hash(p.x, p.fy, 11) < 30 ? tone - 7 : tone;
};

// ── Concrete: formwork panels, tie holes, aggregate speckle ──
const concrete: Texture = (p) => {
  if (p.region === 'outline') return 0x34;
  if (p.region === 'lid') {
    if (p.seam) return 0x94;
    if (p.lidFront) return 0xcc;
    return lidNoise(p, 14) < 40 ? 0xae : 0xb8;
  }
  if (p.fy === 0) return 0x8a; // shadow under the cap
  if (p.fy === 11) return 0x94; // formwork seam
  if (p.fy === 12) return 0xb6;
  if (p.x === 0) return 0x94; // panel seam at each tile
  if (p.x === 1) return 0xb4;
  if ((p.x === 4 || p.x === 12) && (p.fy === 5 || p.fy === 17)) return 0x5a; // tie holes
  const n = hash(p.x, p.fy, 15);
  return n < 30 ? 0x9e : n > 225 ? 0xb2 : 0xa8;
};

// ── Cubicle half-wall: woven fabric panel, aluminium trim, kick plate ──
const cubicle: Texture = (p) => {
  if (p.region === 'outline') return 0x34;
  if (p.region === 'lid') {
    if (p.seam) return 0x7c; // panel connector
    if (p.lidFront) return 0xe4; // trim lip
    const mid = p.vertical ? 7 : 3;
    if (p.across === mid) return 0xd4;
    if (p.across === mid + 1) return 0xa4;
    return 0xbc;
  }
  if (p.fy === 0) return 0xd8; // top trim
  if (p.fy === 1) return 0x7e;
  if (p.fy >= 13) return p.fy === 13 ? 0x70 : 0x5a; // kick plate
  if (p.x === 0) return 0x6a; // panel connector
  if (p.x === 1) return 0x9c;
  return (p.x + p.fy) % 2 ? 0x88 : 0x92; // woven fabric
};

/** Cubicle lid sits 8px lower: a partition the office reads over. */
const CUBICLE_LID_TOP = 8;

/** Face lift per style: [lo, gamma] — see liftFace. Tuned against the default office tint. */
const LIFT = {
  brick: [0x80, 0.55],
  wainscot: [0x80, 0.4],
  glass: [0x80, 0.6],
  stone: [0x80, 0.45],
  concrete: [0x78, 0.75],
  cubicle: [0x80, 0.45],
} as const;

export const WALL_STYLES: WallStyle[] = [
  { id: 'wall_classic', label: 'Plaster', pieces: readSheet('walls-classic.png') },
  { id: 'wall_brick', label: 'Brick', pieces: buildWallSet(liftFace(brick, ...LIFT.brick)) },
  {
    id: 'wall_wainscot',
    label: 'Wood Wainscot',
    pieces: buildWallSet(liftFace(wainscot, ...LIFT.wainscot)),
  },
  {
    id: 'wall_glass',
    label: 'Glass Partition',
    pieces: buildWallSet(liftFace(glass, ...LIFT.glass)),
  },
  { id: 'wall_stone', label: 'Stone Blocks', pieces: buildWallSet(liftFace(stone, ...LIFT.stone)) },
  {
    id: 'wall_concrete',
    label: 'Concrete',
    pieces: buildWallSet(liftFace(concrete, ...LIFT.concrete)),
  },
  {
    id: 'wall_cubicle',
    label: 'Cubicle Half-Wall',
    pieces: buildWallSet(liftFace(cubicle, ...LIFT.cubicle, CUBICLE_LID_TOP), CUBICLE_LID_TOP),
  },
];
