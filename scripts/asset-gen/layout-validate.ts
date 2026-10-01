/**
 * layout-validate.ts — Check a generated layout (or room template) against
 * furniture-catalog.json with the rules the editor enforces in
 * canPlaceFurniture: bounds, wall/void tiles, overlaps (background rows and
 * surface items on desks excepted), and surface items not stacking.
 *
 * Shared by default-layout.ts and room-templates.ts so neither can drift out
 * of sync with the catalog. Tile values follow webview-ui/src/office/types.ts:
 * 8 = VOID, 0 and 101+ = walls (style 0 and styles 1+), anything else = floor.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FLOORS } from './floors.ts';
import { WALL_STYLES } from './walls.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ASSETS_DIR = path.join(REPO_ROOT, 'webview-ui', 'public', 'assets');
const CATALOG_PATH = path.join(ASSETS_DIR, 'furniture', 'furniture-catalog.json');

export const VOID = 8;
const WALL_STYLE_BASE = 100;

export interface FloorColor {
  h: number;
  s: number;
  b: number;
  c: number;
}

export interface PlacedFurniture {
  uid: string;
  type: string;
  col: number;
  row: number;
}

export interface CatalogAsset {
  id: string;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  category: string;
}

export function isWall(t: number): boolean {
  return t === 0 || t > WALL_STYLE_BASE;
}

/** Tile value of a floor pattern, by its floors.ts id (pattern 8+ skips VOID). */
export function floorTile(id: string): number {
  const i = FLOORS.findIndex((f) => f.id === id);
  if (i < 0) throw new Error(`unknown floor '${id}'`);
  const pattern = i + 1;
  return pattern >= VOID ? pattern + 1 : pattern;
}

/** Tile value of a wall style, by its walls.ts id. */
export function wallTile(id: string): number {
  const i = WALL_STYLES.findIndex((w) => w.id === id);
  if (i < 0) throw new Error(`unknown wall style '${id}'`);
  return i === 0 ? 0 : WALL_STYLE_BASE + i;
}

export function loadCatalog(): Map<string, CatalogAsset> {
  const assets = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')).assets as CatalogAsset[];
  return new Map(assets.map((a) => [a.id, a]));
}

export function validateLayout(
  layout: { cols: number; rows: number; tiles: number[]; furniture: PlacedFurniture[] },
  catalog: Map<string, CatalogAsset>,
): string[] {
  const { cols, rows, tiles, furniture } = layout;
  const tileAt = (c: number, r: number): number =>
    c < 0 || r < 0 || c >= cols || r >= rows ? -1 : tiles[r * cols + c];

  const errors: string[] = [];
  const occupied = new Map<string, string>(); // "c,r" → uid (non-background tiles)
  const deskTiles = new Set<string>();

  for (const f of furniture) {
    const a = catalog.get(f.type);
    if (!a) {
      errors.push(`${f.uid}: unknown type '${f.type}'`);
      continue;
    }
    if (a.isDesk) {
      for (let dr = 0; dr < a.footprintH; dr++) {
        for (let dc = 0; dc < a.footprintW; dc++) deskTiles.add(`${f.col + dc},${f.row + dr}`);
      }
    }
  }

  for (const f of furniture) {
    const a = catalog.get(f.type);
    if (!a) continue;
    const bg = a.backgroundTiles ?? 0;
    for (let dr = 0; dr < a.footprintH; dr++) {
      for (let dc = 0; dc < a.footprintW; dc++) {
        const c = f.col + dc;
        const r = f.row + dr;
        const key = `${c},${r}`;
        const t = tileAt(c, r);
        const bottomRow = dr === a.footprintH - 1;
        if (a.canPlaceOnWalls) {
          if (bottomRow && !isWall(t))
            errors.push(`${f.uid} ${f.type}: bottom row not on a wall at ${key}`);
        } else {
          if (t === -1) errors.push(`${f.uid} ${f.type}: out of bounds at ${key}`);
          else if (dr >= bg && (isWall(t) || t === VOID))
            errors.push(`${f.uid} ${f.type}: on wall/void at ${key}`);
        }
        if (dr < bg) continue; // background rows never collide
        const other = occupied.get(key);
        if (other && !(a.canPlaceOnSurfaces && deskTiles.has(key))) {
          errors.push(`${f.uid} ${f.type}: overlaps ${other} at ${key}`);
        }
        // surface items don't claim desk tiles, so two of them can share a desk
        if (!(a.canPlaceOnSurfaces && deskTiles.has(key))) occupied.set(key, `${f.uid} ${f.type}`);
      }
    }
  }

  // Surface items on the same desk still shouldn't stack on each other.
  const surfaceTiles = new Map<string, string>();
  for (const f of furniture) {
    const a = catalog.get(f.type);
    if (!a?.canPlaceOnSurfaces) continue;
    for (let dr = 0; dr < a.footprintH; dr++) {
      for (let dc = 0; dc < a.footprintW; dc++) {
        const key = `${f.col + dc},${f.row + dr}`;
        const other = surfaceTiles.get(key);
        if (other) errors.push(`${f.uid} ${f.type}: stacked on ${other} at ${key}`);
        surfaceTiles.set(key, `${f.uid} ${f.type}`);
      }
    }
  }
  return errors;
}

/** Seats a layout offers: every footprint tile of every 'chairs' item. */
export function countSeats(
  furniture: PlacedFurniture[],
  catalog: Map<string, CatalogAsset>,
): number {
  return furniture.reduce((n, f) => {
    const a = catalog.get(f.type);
    return n + (a?.category === 'chairs' ? a.footprintW * a.footprintH : 0);
  }, 0);
}
