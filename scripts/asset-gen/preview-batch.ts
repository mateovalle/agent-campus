/**
 * preview-batch.ts — Review sheet for ONE batch, drawn in context.
 *
 * Run from the repo root:
 *   node --experimental-strip-types scripts/asset-gen/preview-batch.ts <batch> [out.png]
 *
 * Unlike render-sheet.ts (every sprite on a bare checker), each sprite here
 * sits on what it will sit on in the office: floor pieces on a wood floor
 * patch the size of their footprint (+1 tile margin), wall pieces against a
 * wall strip, surface pieces on a desk top — with a standing character
 * beside it for scale and the footprint outlined. A second strip shows the
 * whole batch at 2x, which is roughly how big it reads at campus zoom.
 * The legend (row-major order) is printed to stdout.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import pngjs from 'pngjs';

import type { CatalogMeta } from './catalog-meta.ts';
import { ALL_COLORS } from './palette.ts';
import type { GeneratedSprite } from './sprites.ts';

const { PNG } = pngjs;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const TILE = 16;
const SCALE = 5;
const SMALL = 2;
const PER_ROW = 4;
const PAD = 6; // sheet px between cells, at SCALE
const BG: RGB = [0x1e, 0x1e, 0x2e];
const FLOOR_A: RGB = [0x8a, 0x6a, 0x48];
const FLOOR_B: RGB = [0x7e, 0x60, 0x40];
const WALL_FACE: RGB = [0x5a, 0x55, 0x70];
const WALL_TOP: RGB = [0x3c, 0x38, 0x4e];
const DESK_TOP: RGB = [0xb8, 0x92, 0x2e];
const OUTLINE: RGB = [0x44, 0xbb, 0x66];

type RGB = [number, number, number];

const batch = process.argv[2];
if (!batch) throw new Error('usage: preview-batch.ts <batch number> [out.png]');
const mod = (await import(`./sprites${batch}.ts`)) as Record<string, unknown>;
const sprites = mod[`SPRITES${batch}`] as GeneratedSprite[];
const meta = (mod[`META${batch}`] ?? {}) as Record<string, CatalogMeta>;
const outPath = path.resolve(process.argv[3] ?? path.join(HERE, `preview-b${batch}.png`));
if (!sprites.length) throw new Error(`batch ${batch} has no sprites yet`);

// ── Rule checks: anything here would break export.ts or the editor ──
const problems: string[] = [];
const taken = new Map<string, string>();
for (let b = 1; b <= 15; b++) {
  if (String(b) === batch) continue;
  const other = (await import(`./sprites${b === 1 ? '' : b}.ts`)) as Record<string, unknown>;
  for (const o of (other[`SPRITES${b === 1 ? '' : b}`] ?? []) as GeneratedSprite[]) {
    taken.set(o.id, `batch ${b}`);
  }
}
const palette = new Set(ALL_COLORS.map((c) => c.toUpperCase()));
const ownIds = new Set<string>();
for (const s of sprites) {
  if (ownIds.has(s.id)) problems.push(`${s.id}: duplicate id within the batch`);
  ownIds.add(s.id);
  if (taken.has(s.id)) problems.push(`${s.id}: id already used by ${taken.get(s.id)}`);
  if (!meta[s.id]) problems.push(`${s.id}: no META${batch} entry`);
  if (s.sprite.length !== s.heightPx)
    problems.push(`${s.id}: ${s.sprite.length} rows !== heightPx ${s.heightPx}`);
  if (s.sprite.some((r) => r.length !== s.widthPx))
    problems.push(`${s.id}: a row is not widthPx ${s.widthPx} wide`);
  if (s.widthPx !== s.footprintW * TILE)
    problems.push(`${s.id}: widthPx ${s.widthPx} !== footprintW*16`);
  if (s.heightPx % TILE || s.heightPx < s.footprintH * TILE)
    problems.push(`${s.id}: heightPx ${s.heightPx} must be a multiple of 16 and >= footprintH*16`);
  const off = new Set<string>();
  for (const row of s.sprite)
    for (const c of row) if (c && !palette.has(c.toUpperCase())) off.add(c);
  if (off.size) problems.push(`${s.id}: off-palette colours ${[...off].join(' ')}`);
  if (!s.sprite.flat().some(Boolean)) problems.push(`${s.id}: sprite is empty`);
  if (s.orientation && !s.groupId) problems.push(`${s.id}: orientation without groupId`);
}
for (const id of Object.keys(meta))
  if (!ownIds.has(id)) problems.push(`META${batch}.${id}: no such sprite`);
const groups = new Map<string, string[]>();
for (const s of sprites)
  if (s.groupId) groups.set(s.groupId, [...(groups.get(s.groupId) ?? []), s.orientation ?? '?']);
for (const [g, o] of groups) {
  if (!o.includes('front')) problems.push(`group ${g}: no 'front' member (R key will not work)`);
  if (o.length < 2) problems.push(`group ${g}: only one member`);
  if (new Set(o).size !== o.length) problems.push(`group ${g}: duplicate orientation`);
}

// standing pose of character 0, facing down (frame 1 of row 0)
const charPng = PNG.sync.read(
  fs.readFileSync(path.join(REPO_ROOT, 'webview-ui/public/assets/characters/char_0.png')),
);
const CHAR_W = 16;
const CHAR_H = 32;

interface Cell {
  s: GeneratedSprite;
  w: number; // cell size in sprite px
  h: number;
}

const cells: Cell[] = sprites.map((s) => ({
  s,
  w: Math.max(s.widthPx, s.footprintW * TILE) + 2 * TILE + CHAR_W + 4,
  h: Math.max(s.heightPx, CHAR_H) + 2 * TILE,
}));

const rows: Cell[][] = [];
for (let i = 0; i < cells.length; i += PER_ROW) rows.push(cells.slice(i, i + PER_ROW));
const sheetW = Math.max(...rows.map((r) => r.reduce((a, c) => a + c.w * SCALE + PAD, PAD)));
const bigH = rows.reduce((a, r) => a + Math.max(...r.map((c) => c.h)) * SCALE + PAD, PAD);
const smallW = sprites.reduce((a, s) => a + s.widthPx * SMALL + 8, 8);
const smallH = Math.max(...sprites.map((s) => s.heightPx)) * SMALL + 16;
const W = Math.max(sheetW, smallW);
const H = bigH + smallH;
const png = new PNG({ width: W, height: H });

function put(x: number, y: number, [r, g, b]: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (W * y + x) << 2;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = 255;
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, c);
}
const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
function blit(grid: string[][], ox: number, oy: number, k: number): void {
  grid.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c) rect(ox + x * k, oy + y * k, k, k, hex(c));
    }),
  );
}

rect(0, 0, W, H, BG);
console.log(`batch ${batch}: ${sprites.length} sprites → ${outPath}`);
let cy = PAD;
let n = 0;
for (const row of rows) {
  const rowH = Math.max(...row.map((c) => c.h));
  let cx = PAD;
  for (const { s, w } of row) {
    const m = meta[s.id];
    const ox = cx;
    const oy = cy;
    // footprint origin (sprite px within the cell): bottom-aligned, 1 tile margin
    const fx = TILE;
    const fy = rowH - TILE - s.footprintH * TILE;
    const ground = (x0: number, y0: number, tw: number, th: number) => {
      for (let ty = 0; ty < th; ty++)
        for (let tx = 0; tx < tw; tx++)
          rect(
            ox + (x0 + tx * TILE) * SCALE,
            oy + (y0 + ty * TILE) * SCALE,
            TILE * SCALE,
            TILE * SCALE,
            (tx + ty) % 2 ? FLOOR_A : FLOOR_B,
          );
    };
    if (m?.canPlaceOnWalls) {
      // wall strip: the footprint's bottom row sits on the wall tile row
      ground(fx - TILE, fy + s.footprintH * TILE, s.footprintW + 2, 1);
      rect(
        ox + (fx - TILE) * SCALE,
        oy + (fy + s.footprintH * TILE - 2 * TILE) * SCALE,
        (s.footprintW + 2) * TILE * SCALE,
        2 * TILE * SCALE,
        WALL_FACE,
      );
      rect(
        ox + (fx - TILE) * SCALE,
        oy + (fy + s.footprintH * TILE - 2 * TILE) * SCALE,
        (s.footprintW + 2) * TILE * SCALE,
        4 * SCALE,
        WALL_TOP,
      );
    } else {
      ground(fx - TILE, fy - TILE, s.footprintW + 2, s.footprintH + 2);
      if (m?.canPlaceOnSurfaces) {
        rect(
          ox + fx * SCALE,
          oy + fy * SCALE,
          s.footprintW * TILE * SCALE,
          s.footprintH * TILE * SCALE,
          DESK_TOP,
        );
      }
    }
    // footprint outline
    const x0 = ox + fx * SCALE;
    const y0 = oy + fy * SCALE;
    const fw = s.footprintW * TILE * SCALE;
    const fh = s.footprintH * TILE * SCALE;
    for (let i = 0; i < fw; i += 2) {
      put(x0 + i, y0, OUTLINE);
      put(x0 + i, y0 + fh - 1, OUTLINE);
    }
    for (let i = 0; i < fh; i += 2) {
      put(x0, y0 + i, OUTLINE);
      put(x0 + fw - 1, y0 + i, OUTLINE);
    }
    // sprite: bottom-aligned to the footprint, left-aligned (as the engine draws it)
    blit(s.sprite, ox + fx * SCALE, oy + (fy + s.footprintH * TILE - s.heightPx) * SCALE, SCALE);
    // character for scale, standing just right of the footprint
    const chx = ox + (fx + Math.max(s.widthPx, s.footprintW * TILE) + TILE + 2) * SCALE;
    const chy = oy + (rowH - TILE - CHAR_H) * SCALE;
    for (let y = 0; y < CHAR_H; y++)
      for (let x = 0; x < CHAR_W; x++) {
        const i = (charPng.width * y + (CHAR_W + x)) << 2;
        if (charPng.data[i + 3] >= 128)
          rect(chx + x * SCALE, chy + y * SCALE, SCALE, SCALE, [
            charPng.data[i],
            charPng.data[i + 1],
            charPng.data[i + 2],
          ]);
      }
    n++;
    const flags = [
      m?.category ?? 'NO META',
      m?.isDesk && 'desk',
      m?.canPlaceOnWalls && 'wall',
      m?.canPlaceOnSurfaces && 'surface',
      m?.backgroundTiles !== undefined && `bg${m.backgroundTiles}`,
      s.groupId && `${s.groupId}/${s.orientation}`,
    ].filter(Boolean);
    console.log(
      `  ${String(n).padStart(2)}. ${s.id.padEnd(24)} ${s.widthPx}x${s.heightPx}px  fp ${s.footprintW}x${s.footprintH}  ${flags.join(' ')}`,
    );
    cx += w * SCALE + PAD;
  }
  cy += rowH * SCALE + PAD;
}

// actual-ish size strip
let sx = 8;
for (const s of sprites) {
  blit(s.sprite, sx, bigH + 8 + (smallH - 16 - s.heightPx * SMALL), SMALL);
  sx += s.widthPx * SMALL + 8;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, PNG.sync.write(png));
const pieces = new Set(sprites.map((s) => s.groupId ?? s.id)).size;
console.log(`${pieces} distinct pieces, ${sprites.length} catalog entries`);
if (problems.length) {
  console.log(`\n✗ ${problems.length} rule problem(s):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exitCode = 1;
} else {
  console.log('✓ rule checks pass');
}
