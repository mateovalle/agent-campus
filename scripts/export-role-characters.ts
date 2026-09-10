/**
 * Generate role-skin character sprites (gstack-style team roles) from the
 * hand-drawn base character PNGs, plus a self-contained HTML contact sheet
 * for visual review.
 *
 * A role skin = a base character (char_0..5) + operations that preserve the
 * original art's shading:
 *   - recolor:    remap a garment's color family to a new hue/saturation,
 *                 keeping each pixel's lightness (so shading survives)
 *   - hat:        replace hair pixels above a per-style line with a 3-tone
 *                 hat (outline/base/highlight mapped from original lightness)
 *   - glasses:    rim drawn around the detected eye clusters + bridge
 *   - sunglasses: eye clusters filled with lens color + bridge
 *   - tie:        recolor tie pixels (black pixels flanked by shirt white)
 *   - stripe:     hi-vis band across given torso rows
 *
 * Outputs (NOT loaded by the app until approved and copied into
 * webview-ui/public/assets/characters/roles/):
 *   scripts/asset-gen/roles/char_role_<id>.png   — standard 112×96 sheets
 *   scripts/asset-gen/roles/preview.html          — review contact sheet
 *
 * Run: npx tsx scripts/export-role-characters.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';

const FRAME_W = 16;
const FRAME_H = 32;
const FRAMES_PER_ROW = 7;
const DIRECTIONS = ['down', 'up', 'right'] as const;
type Direction = (typeof DIRECTIONS)[number];

// ── Color helpers ────────────────────────────────────────────

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  return [
    Math.round(f(hn + 1 / 3) * 255),
    Math.round(f(hn) * 255),
    Math.round(f(hn - 1 / 3) * 255),
  ];
}

// ── Role definitions ─────────────────────────────────────────

/** Remap a color family to a hue/saturation, keeping per-pixel lightness. */
interface Recolor {
  /** Exact colors to remap… */
  family?: string[];
  /** …or an HSL predicate over a row band (for garments with many shades). */
  match?: { hMin: number; hMax: number; sMin: number; rows: [number, number] };
  h: number;
  s: number;
  /** Multiply original lightness (e.g. darken a suit to near-black). */
  lScale?: number;
  /** Add to lightness after scaling (e.g. lift a black dress to a color). */
  lOffset?: number;
}

interface Hat {
  /** Hair rows with local y <= bottomRow become hat pixels. */
  bottomRow: number;
  outline: string;
  base: string;
  highlight: string;
  /** Extend 1px beyond the head silhouette at the bottom hat row. */
  brim?: 'front' | 'both';
}

export interface RoleSkin {
  id: string;
  name: string;
  description: string;
  /** Index of the base character PNG (char_<n>.png). */
  base: number;
  /** Hair color family of the base (consumed by hat + hair recolors). */
  hair: string[];
  recolors?: Recolor[];
  hat?: Hat;
  eyewear?: { kind: 'glasses' | 'sunglasses'; color: string };
  /** Recolor the tie (black pixels flanked by white shirt), char_0 bases. */
  tie?: { color: string };
  /** Hi-vis band: garment-family pixels in these local rows → color. */
  stripe?: { rows: number[]; color: string; family: string[] };
}

// Color families extracted from the shipped PNGs (see analyze scripts)
const HAIR_0 = ['#8f6439', '#6d4726', '#6f4a2a', '#b18649', '#32191d', '#341f20', '#352c27'];
const SUIT_0 = ['#114978', '#071c2e', '#0f406a', '#1164a9'];
const HAIR_1 = ['#7e4b29', '#be7743', '#e39f5a', '#f1c084'];
const HAIR_2 = ['#181616', '#221e1e', '#1b1a19', '#282423', '#2b2827', '#252120', '#231e1d'];
const HAIR_3 = ['#b0a6a3', '#daccc9', '#bfb6b3', '#f0e1de', '#fff1ef', '#e9d7d4'];
const TEE_34 = ['#d4d4d4', '#eeeeee', '#bdbdbd', '#4c4c4c'];
const HAIR_4 = ['#432415', '#2f160f', '#57351a', '#69451b'];
const HAIR_5 = ['#202020', '#0e0e0e', '#303030', '#373737', '#414141', '#282828'];
const TEE_5 = ['#b24737', '#e16451', '#9f3f31', '#640026'];

export const ROLE_SKINS: RoleSkin[] = [
  {
    id: 'ceo',
    name: 'CEO',
    description: 'char_0 suit, distinguished gray hair, red tie',
    base: 0,
    hair: HAIR_0,
    recolors: [{ family: HAIR_0, h: 0, s: 0.04, lOffset: 0.18 }],
    tie: { color: '#a3212e' },
  },
  {
    id: 'security',
    name: 'Security Officer',
    description: 'char_0 suit gone black, black hair, shades',
    base: 0,
    hair: HAIR_0,
    recolors: [
      { family: SUIT_0, h: 235, s: 0.12, lScale: 0.45 },
      { family: HAIR_0, h: 235, s: 0.1, lScale: 0.35 },
    ],
    eyewear: { kind: 'sunglasses', color: '#0d0d12' },
  },
  {
    id: 'eng-manager',
    name: 'Eng Manager',
    description: 'char_4 with light-blue button-up and glasses',
    base: 4,
    hair: HAIR_4,
    recolors: [{ family: TEE_34, h: 210, s: 0.45 }],
    eyewear: { kind: 'glasses', color: '#26221e' },
  },
  {
    id: 'qa',
    name: 'QA Lead',
    description: 'char_2 tee gone teal (stripes kept), glasses',
    base: 2,
    hair: HAIR_2,
    // Hue predicate: catches every orange/red shade of the striped tee;
    // stripes keep their darker lightness so the pattern survives in teal.
    recolors: [{ match: { hMin: -15, hMax: 45, sMin: 0.5, rows: [16, 28] }, h: 174, s: 0.62 }],
    eyewear: { kind: 'glasses', color: '#1a1614' },
  },
  {
    id: 'designer',
    name: 'Designer',
    description: 'char_1 black dress with a red beret',
    base: 1,
    hair: HAIR_1,
    hat: { bottomRow: 8, outline: '#5e1024', base: '#c22b47', highlight: '#e05570' },
  },
  {
    id: 'release',
    name: 'Release Engineer',
    description: 'char_4 in hi-vis orange and a yellow hard hat',
    base: 4,
    hair: HAIR_4,
    recolors: [{ family: TEE_34, h: 24, s: 0.85 }],
    stripe: { rows: [21, 22], color: '#ffe14d', family: TEE_34 },
    hat: { bottomRow: 10, outline: '#7a5c10', base: '#e8bd2a', highlight: '#ffe14d', brim: 'both' },
  },
  {
    id: 'debugger',
    name: 'Debugger',
    description: 'char_5 in a brown coat and deerstalker',
    base: 5,
    hair: HAIR_5,
    recolors: [{ family: TEE_5, h: 30, s: 0.38, lScale: 0.9 }],
    hat: { bottomRow: 9, outline: '#3c2a16', base: '#7d5c34', highlight: '#a3814e', brim: 'both' },
  },
  {
    id: 'writer',
    name: 'Tech Writer',
    description: 'char_3 silver hair, mustard shirt, glasses',
    base: 3,
    hair: HAIR_3,
    recolors: [{ family: TEE_34, h: 46, s: 0.55, lScale: 0.85 }],
    eyewear: { kind: 'glasses', color: '#3a3430' },
  },
];

// ── Frame processing ─────────────────────────────────────────

/** One 16×32 frame as hex colors ('' = transparent). */
type Grid = string[][];

function extractFrame(png: PNG, frameIdx: number, dirIdx: number): Grid {
  const grid: Grid = [];
  for (let y = 0; y < FRAME_H; y++) {
    const row: string[] = [];
    for (let x = 0; x < FRAME_W; x++) {
      const i = ((dirIdx * FRAME_H + y) * png.width + (frameIdx * FRAME_W + x)) * 4;
      if (png.data[i + 3] < 128) {
        row.push('');
      } else {
        row.push(
          '#' +
            [png.data[i], png.data[i + 1], png.data[i + 2]]
              .map((v) => v.toString(16).padStart(2, '0'))
              .join(''),
        );
      }
    }
    grid.push(row);
  }
  return grid;
}

function applyRecolor(grid: Grid, rc: Recolor): void {
  const family = new Set(rc.family ?? []);
  const yStart = rc.match ? rc.match.rows[0] : 0;
  const yEnd = rc.match ? rc.match.rows[1] : FRAME_H - 1;
  for (let y = yStart; y <= yEnd && y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const c = grid[y][x];
      if (!c) continue;
      const [h, s, l] = rgbToHsl(hexToRgb(c));
      let hit = family.has(c);
      if (!hit && rc.match) {
        const hn = h > 180 ? h - 360 : h; // allow negative hMin for red hues
        hit = hn >= rc.match.hMin && hn <= rc.match.hMax && s >= rc.match.sMin;
      }
      if (!hit) continue;
      const nl = Math.max(0, Math.min(1, l * (rc.lScale ?? 1) + (rc.lOffset ?? 0)));
      const [r, g, b] = hslToRgb(rc.h, rc.s, nl);
      grid[y][x] = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    }
  }
}

function applyHat(grid: Grid, hat: Hat, hairFamily: string[], dir: Direction): void {
  const family = new Set(hairFamily);
  let bottomUsed = -1;
  for (let y = 0; y <= hat.bottomRow && y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const c = grid[y][x];
      if (!c || !family.has(c)) continue;
      const [, , l] = rgbToHsl(hexToRgb(c));
      grid[y][x] = l < 0.16 ? hat.outline : l < 0.42 ? hat.base : hat.highlight;
      bottomUsed = Math.max(bottomUsed, y);
    }
  }
  // Dark rim line where the hat meets the hair
  if (bottomUsed >= 0) {
    for (let x = 0; x < FRAME_W; x++) {
      const c = grid[bottomUsed][x];
      if (c && (c === hat.base || c === hat.highlight)) grid[bottomUsed][x] = hat.outline;
    }
    // Brim: extend 1px past the silhouette at the rim row
    if (hat.brim) {
      const row = grid[bottomUsed];
      const cols = row.map((c, x) => (c ? x : -1)).filter((x) => x >= 0);
      if (cols.length > 0) {
        const minCol = Math.min(...cols);
        const maxCol = Math.max(...cols);
        const put = (x: number) => {
          if (x >= 0 && x < FRAME_W && !row[x]) row[x] = hat.outline;
        };
        if (dir === 'right') {
          put(maxCol + 1);
          if (hat.brim === 'both') put(minCol - 1);
        } else {
          put(minCol - 1);
          put(maxCol + 1);
        }
      }
    }
  }
}

/** Find eye clusters: white pixels in the face band (local rows 10–17). */
function findEyeClusters(
  grid: Grid,
): Array<{ minX: number; maxX: number; minY: number; maxY: number }> {
  const seen = new Set<string>();
  const clusters: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];
  for (let y = 10; y <= 17; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      if (grid[y]?.[x] !== '#ffffff' || seen.has(x + ',' + y)) continue;
      // flood fill this white cluster within the band
      const stack = [[x, y]];
      const box = { minX: x, maxX: x, minY: y, maxY: y };
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        const key = cx + ',' + cy;
        if (seen.has(key)) continue;
        seen.add(key);
        if (cy < 10 || cy > 17 || cx < 0 || cx >= FRAME_W) continue;
        if (grid[cy]?.[cx] !== '#ffffff') continue;
        box.minX = Math.min(box.minX, cx);
        box.maxX = Math.max(box.maxX, cx);
        box.minY = Math.min(box.minY, cy);
        box.maxY = Math.max(box.maxY, cy);
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      clusters.push(box);
    }
  }
  return clusters;
}

function applyEyewear(grid: Grid, kind: 'glasses' | 'sunglasses', color: string): void {
  const clusters = findEyeClusters(grid);
  if (clusters.length === 0) return; // up-facing frames

  if (kind === 'sunglasses') {
    // Fill each eye (white + its dark pupil/outline) with the lens color
    for (const c of clusters) {
      for (let y = c.minY - 1; y <= c.maxY + 1; y++) {
        for (let x = c.minX - 1; x <= c.maxX + 1; x++) {
          const px = grid[y]?.[x];
          if (!px) continue;
          const [, s, l] = rgbToHsl(hexToRgb(px));
          if (px === '#ffffff' || (l < 0.25 && s < 0.4)) grid[y][x] = color;
        }
      }
    }
  } else {
    // Rim: 1px border around each eye box, skipping diagonal corners so the
    // frames read rounded instead of blocky
    for (const c of clusters) {
      for (let y = c.minY - 1; y <= c.maxY + 1; y++) {
        for (let x = c.minX - 1; x <= c.maxX + 1; x++) {
          const onV = y === c.minY - 1 || y === c.maxY + 1;
          const onH = x === c.minX - 1 || x === c.maxX + 1;
          if (!onV && !onH) continue;
          if (onV && onH) continue; // corner
          const px = grid[y]?.[x];
          if (px && px !== '#ffffff' && px !== '#000000') grid[y][x] = color;
        }
      }
    }
  }

  // Bridge between two lenses (down-facing frames)
  if (clusters.length === 2) {
    const [a, b] = clusters.sort((p, q) => p.minX - q.minX);
    const y = Math.round((a.minY + a.maxY) / 2);
    for (let x = a.maxX + 1; x < b.minX; x++) {
      const px = grid[y]?.[x];
      if (px && px !== '#ffffff') grid[y][x] = color;
    }
  }
}

/** Tie = near-black pixels flanked by shirt white (char_0 bases). */
function applyTie(grid: Grid, color: string): void {
  const tie = hexToRgb(color);
  const dark =
    '#' +
    tie
      .map((v) =>
        Math.round(v * 0.55)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
  const isTieDark = (c: string | undefined) => !!c && rgbToHsl(hexToRgb(c))[2] < 0.06;
  const isShirtWhite = (c: string | undefined) => !!c && rgbToHsl(hexToRgb(c))[2] > 0.82;
  // Two passes so inner tie pixels (no white neighbor) pick up the color too
  // Rows/cols bound the tie zone (keeps shoes and held books untouched)
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 16; y <= 24; y++) {
      for (let x = 5; x <= 11; x++) {
        if (!isTieDark(grid[y][x])) continue;
        const nbrs = [grid[y][x - 1], grid[y][x + 1], grid[y - 1]?.[x], grid[y + 1]?.[x]];
        if (nbrs.some(isShirtWhite)) {
          grid[y][x] = color;
        } else if (nbrs.some((n) => n === color)) {
          grid[y][x] = dark;
        }
      }
    }
  }
}

function applyStripe(
  grid: Grid,
  stripe: { rows: number[]; color: string; family: string[] },
): void {
  const family = new Set(stripe.family);
  for (const y of stripe.rows) {
    for (let x = 0; x < FRAME_W; x++) {
      const c = grid[y]?.[x];
      if (c && family.has(c)) grid[y][x] = stripe.color;
    }
  }
}

function renderRole(role: RoleSkin, basePng: PNG): PNG {
  const out = new PNG({ width: FRAME_W * FRAMES_PER_ROW, height: FRAME_H * DIRECTIONS.length });
  for (let dirIdx = 0; dirIdx < DIRECTIONS.length; dirIdx++) {
    const dir = DIRECTIONS[dirIdx];
    for (let f = 0; f < FRAMES_PER_ROW; f++) {
      const grid = extractFrame(basePng, f, dirIdx);
      // Order matters: recolors first (hat/eyewear read post-recolor hair),
      // but the hat matcher uses the ORIGINAL family — so recolor hair last.
      const hairRecolors = (role.recolors ?? []).filter((rc) => rc.family === role.hair);
      const otherRecolors = (role.recolors ?? []).filter((rc) => rc.family !== role.hair);
      // Stripe first: its color survives the garment recolor that follows
      if (role.stripe) applyStripe(grid, role.stripe);
      for (const rc of otherRecolors) applyRecolor(grid, rc);
      if (role.hat) applyHat(grid, role.hat, role.hair, dir);
      for (const rc of hairRecolors) applyRecolor(grid, rc);
      if (role.eyewear) applyEyewear(grid, role.eyewear.kind, role.eyewear.color);
      if (role.tie && dir !== 'up') applyTie(grid, role.tie.color);

      for (let y = 0; y < FRAME_H; y++) {
        for (let x = 0; x < FRAME_W; x++) {
          const i = ((dirIdx * FRAME_H + y) * out.width + (f * FRAME_W + x)) * 4;
          const c = grid[y][x];
          if (!c) {
            out.data[i + 3] = 0;
          } else {
            const [r, g, b] = hexToRgb(c);
            out.data[i] = r;
            out.data[i + 1] = g;
            out.data[i + 2] = b;
            out.data[i + 3] = 0xff;
          }
        }
      }
    }
  }
  return out;
}

// ── Review contact sheet ─────────────────────────────────────

function buildPreviewHtml(
  roles: Array<{ role: RoleSkin; dataUri: string }>,
  baseline: Array<{ name: string; dataUri: string }>,
): string {
  const frameCss = (uri: string, frameIdx: number, dirIdx: number, scale: number) => `
    width:${FRAME_W * scale}px;height:${FRAME_H * scale}px;
    background-image:url('${uri}');
    background-position:-${frameIdx * FRAME_W * scale}px -${dirIdx * FRAME_H * scale}px;
    background-size:${FRAME_W * FRAMES_PER_ROW * scale}px ${FRAME_H * DIRECTIONS.length * scale}px;
    image-rendering:pixelated;`;

  const roleCards = roles
    .map(({ role, dataUri }) => {
      const dirRows = DIRECTIONS.map(
        (dir, dirIdx) => `
        <div class="dir-row">
          <span class="dir-label">${dir}</span>
          ${Array.from({ length: FRAMES_PER_ROW })
            .map((_, f) => `<div class="frame" style="${frameCss(dataUri, f, dirIdx, 4)}"></div>`)
            .join('')}
        </div>`,
      ).join('');
      return `
      <div class="card">
        <div class="hero" style="${frameCss(dataUri, 1, 0, 10)}"></div>
        <div class="info">
          <h2>${role.name} <code>${role.id} · base char_${role.base}</code></h2>
          <p>${role.description}</p>
          ${dirRows}
        </div>
      </div>`;
    })
    .join('');

  const baselineRow = baseline
    .map(
      (b) => `
      <div class="base">
        <div style="${frameCss(b.dataUri, 1, 0, 6)}"></div>
        <span>${b.name}</span>
      </div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pixel Agents — Role Skins Review</title>
<style>
  body { background:#1e1e2e; color:#e0e0e8; font-family:monospace; padding:24px; }
  h1 { font-size:20px; } h2 { font-size:16px; margin:0 0 4px; }
  h2 code { color:#8888aa; font-size:12px; }
  p { color:#aaaab8; margin:0 0 10px; font-size:12px; }
  .baseline { display:flex; gap:16px; align-items:flex-end; margin-bottom:32px;
    border:2px solid #3a3a4e; padding:12px; }
  .base { text-align:center; font-size:11px; color:#8888aa; }
  .card { display:flex; gap:24px; align-items:flex-start; margin-bottom:28px;
    border:2px solid #3a3a4e; padding:16px; box-shadow:4px 4px 0 #0a0a14; }
  .hero { flex-shrink:0; }
  .dir-row { display:flex; gap:4px; align-items:center; margin-bottom:4px; }
  .dir-label { width:44px; color:#8888aa; font-size:11px; }
  .frame { flex-shrink:0; }
</style></head><body>
<h1>Role Skins — review sheet</h1>
<p>Baseline (existing chars, for style consistency):</p>
<div class="baseline">${baselineRow}</div>
${roleCards}
</body></html>`;
}

// ── Main ─────────────────────────────────────────────────────

const charsDir = path.join(__dirname, '..', 'webview-ui', 'public', 'assets', 'characters');
const outDir = path.join(__dirname, 'asset-gen', 'roles');
fs.mkdirSync(outDir, { recursive: true });

const basePngs = new Map<number, PNG>();
function getBase(n: number): PNG {
  let png = basePngs.get(n);
  if (!png) {
    png = PNG.sync.read(fs.readFileSync(path.join(charsDir, `char_${n}.png`)));
    basePngs.set(n, png);
  }
  return png;
}

const roleEntries: Array<{ role: RoleSkin; dataUri: string }> = [];
for (const role of ROLE_SKINS) {
  const out = renderRole(role, getBase(role.base));
  const buffer = PNG.sync.write(out);
  const outPath = path.join(outDir, `char_role_${role.id}.png`);
  fs.writeFileSync(outPath, buffer);
  roleEntries.push({ role, dataUri: `data:image/png;base64,${buffer.toString('base64')}` });
  console.log(`✓ Wrote ${outPath}`);
}

const baseline: Array<{ name: string; dataUri: string }> = [];
for (let i = 0; i < 6; i++) {
  const p = path.join(charsDir, `char_${i}.png`);
  if (fs.existsSync(p)) {
    baseline.push({
      name: `char_${i}`,
      dataUri: `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`,
    });
  }
}

const previewPath = path.join(outDir, 'preview.html');
fs.writeFileSync(previewPath, buildPreviewHtml(roleEntries, baseline));
console.log(`✓ Wrote ${previewPath}`);
console.log(`\nGenerated ${ROLE_SKINS.length} role skins. Open preview.html to review.`);
