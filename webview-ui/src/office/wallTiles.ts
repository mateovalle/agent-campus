/**
 * Wall tile auto-tiling: sprite storage and bitmask-based piece selection.
 *
 * Stores one 16-sprite set per wall STYLE (one sprite per 4-bit bitmask),
 * loaded from walls.png where styles are stacked vertically. A wall tile's
 * value picks its style (wallStyleOf); any two wall tiles connect, whatever
 * their styles, so a brick wall meets a glass one without a gap.
 * At render time, each wall tile's 4 cardinal neighbors are checked to build
 * a bitmask, and the corresponding sprite is drawn directly.
 * No changes to the layout model — auto-tiling is purely visual.
 *
 * Bitmask convention: N=1, E=2, S=4, W=8. Out-of-bounds = NOT wall.
 */

import { getColorizedSprite, hslToHex } from './colorize.js';
import type {
  FloorColor,
  FurnitureInstance,
  SpriteData,
  TileType as TileTypeVal,
} from './types.js';
import { isWallTile, TILE_SIZE, wallStyleOf } from './types.js';

const PIECES_PER_STYLE = 16;

/** Per style, 16 wall sprites indexed by bitmask (0-15) */
let wallStyles: SpriteData[][] | null = null;

/** Set wall sprites (called once when the host sends wallTilesLoaded): 16 per style, in order */
export function setWallSprites(sprites: SpriteData[]): void {
  const styles: SpriteData[][] = [];
  for (let i = 0; i + PIECES_PER_STYLE <= sprites.length; i += PIECES_PER_STYLE) {
    styles.push(sprites.slice(i, i + PIECES_PER_STYLE));
  }
  wallStyles = styles.length > 0 ? styles : null;
  wallInstanceCache = null;
  edgeCache.clear();
}

/** Check if wall sprites have been loaded */
export function hasWallSprites(): boolean {
  return wallStyles !== null;
}

/** Number of wall styles available (at least 1, the plain fallback colour) */
export function getWallStyleCount(): number {
  return wallStyles?.length ?? 1;
}

/** A style's free-standing piece (mask 0), for the editor's style picker */
export function getWallStylePreview(style: number): SpriteData | null {
  return wallStyles?.[style]?.[0] ?? null;
}

/** The sprite for a mask in the tile's style; unknown styles fall back to style 0 */
function pieceFor(tile: TileTypeVal, mask: number): SpriteData | null {
  if (!wallStyles) return null;
  const set = wallStyles[wallStyleOf(tile)] ?? wallStyles[0];
  return set[mask] ?? null;
}

/** Patched pieces, keyed `style-mask-eastStyle-westStyle`. */
const edgeCache = new Map<string, SpriteData>();

/**
 * A connected side carries no outline — the neighbour's wall continues the
 * silhouette. That assumes both walls are equally tall. Next to a SHORTER
 * style (the cubicle half-wall, transparent above its lid) the taller wall's
 * edge would stand bare over the gap, so wherever the neighbour's touching
 * column is transparent and ours is not, close the edge with our style's own
 * outline colour (taken from its free-standing piece, whose sides are outlined).
 */
function pieceWithEdges(
  col: number,
  row: number,
  tileMap: TileTypeVal[][],
  mask: number,
): { sprite: SpriteData; key: string } | null {
  if (!wallStyles) return null;
  const tile = tileMap[row][col];
  const style = wallStyleOf(tile);
  const base = pieceFor(tile, mask);
  if (!base) return null;
  const sides: Array<{ bit: number; dc: number; ours: number; theirs: number }> = [
    { bit: 2, dc: 1, ours: base[0].length - 1, theirs: 0 }, // E
    { bit: 8, dc: -1, ours: 0, theirs: base[0].length - 1 }, // W
  ];
  let sprite = base;
  // Cumulative: identifies the base piece plus every patch applied so far
  let key = `${style}-${mask}`;
  for (const side of sides) {
    if (!(mask & side.bit)) continue;
    const nTile = tileMap[row][col + side.dc];
    const nStyle = wallStyleOf(nTile);
    if (nStyle === style) continue;
    const nMask = computeWallMask(col + side.dc, row, tileMap);
    const neighbour = pieceFor(nTile, nMask);
    const outline = wallStyles[style]?.[0]?.[base.length - 8]?.[0];
    if (!neighbour || !outline) continue;
    key += `|${side.bit}:${nStyle}:${nMask}`;
    let patched = edgeCache.get(key);
    if (!patched) {
      patched = sprite.map((r) => [...r]);
      // Both pieces are bottom-anchored on the same tile row
      const off = neighbour.length - sprite.length;
      for (let y = 0; y < sprite.length; y++) {
        const theirs = neighbour[y + off]?.[side.theirs] ?? '';
        if (sprite[y][side.ours] && !theirs) patched[y][side.ours] = outline;
      }
      edgeCache.set(key, patched);
    }
    sprite = patched;
  }
  return { sprite, key };
}

/** Build the 4-bit neighbor bitmask for a wall tile (N=1, E=2, S=4, W=8) */
function computeWallMask(col: number, row: number, tileMap: TileTypeVal[][]): number {
  const tmRows = tileMap.length;
  const tmCols = tmRows > 0 ? tileMap[0].length : 0;

  let mask = 0;
  if (row > 0 && isWallTile(tileMap[row - 1][col])) mask |= 1; // N
  if (col < tmCols - 1 && isWallTile(tileMap[row][col + 1])) mask |= 2; // E
  if (row < tmRows - 1 && isWallTile(tileMap[row + 1][col])) mask |= 4; // S
  if (col > 0 && isWallTile(tileMap[row][col - 1])) mask |= 8; // W
  return mask;
}

/**
 * Get the wall sprite for a tile based on its cardinal neighbors.
 * Returns the sprite + Y offset, or null to fall back to solid WALL_COLOR.
 */
export function getWallSprite(
  col: number,
  row: number,
  tileMap: TileTypeVal[][],
): { sprite: SpriteData; offsetY: number } | null {
  const mask = computeWallMask(col, row, tileMap);
  const sprite = pieceWithEdges(col, row, tileMap, mask)?.sprite;
  if (!sprite) return null;

  // Anchor sprite at bottom of tile — tall sprites extend upward
  return { sprite, offsetY: TILE_SIZE - sprite.length };
}

/**
 * Get a colorized wall sprite for a tile based on its cardinal neighbors.
 * Uses Colorize mode (grayscale → HSL) like floor tiles.
 * Returns the colorized sprite + Y offset, or null if no wall sprites loaded.
 */
export function getColorizedWallSprite(
  col: number,
  row: number,
  tileMap: TileTypeVal[][],
  color: FloorColor,
): { sprite: SpriteData; offsetY: number } | null {
  const mask = computeWallMask(col, row, tileMap);
  const piece = pieceWithEdges(col, row, tileMap, mask);
  if (!piece) return null;
  const sprite = piece.sprite;

  const cacheKey = `wall-${piece.key}-${color.h}-${color.s}-${color.b}-${color.c}`;
  const colorized = getColorizedSprite(cacheKey, sprite, { ...color, colorize: true });

  return { sprite: colorized, offsetY: TILE_SIZE - sprite.length };
}

/** Memoized wall instances — rebuilt only when the layout-derived inputs change.
 *  Keyed by reference: rebuildFromLayout creates fresh tileMap/tileColors arrays. */
let wallInstanceCache: {
  tileMap: TileTypeVal[][];
  tileColors: Array<FloorColor | null> | undefined;
  cols: number | undefined;
  instances: FurnitureInstance[];
} | null = null;

/**
 * Build FurnitureInstance-like objects for all wall tiles so they can participate
 * in z-sorting with furniture and characters.
 */
export function getWallInstances(
  tileMap: TileTypeVal[][],
  tileColors?: Array<FloorColor | null>,
  cols?: number,
): FurnitureInstance[] {
  if (!wallStyles) return [];
  if (
    wallInstanceCache &&
    wallInstanceCache.tileMap === tileMap &&
    wallInstanceCache.tileColors === tileColors &&
    wallInstanceCache.cols === cols
  ) {
    return wallInstanceCache.instances;
  }
  const tmRows = tileMap.length;
  const tmCols = tmRows > 0 ? tileMap[0].length : 0;
  const layoutCols = cols ?? tmCols;
  const instances: FurnitureInstance[] = [];
  for (let r = 0; r < tmRows; r++) {
    for (let c = 0; c < tmCols; c++) {
      if (!isWallTile(tileMap[r][c])) continue;
      const colorIdx = r * layoutCols + c;
      const wallColor = tileColors?.[colorIdx];
      const wallInfo = wallColor
        ? getColorizedWallSprite(c, r, tileMap, wallColor)
        : getWallSprite(c, r, tileMap);
      if (!wallInfo) continue;
      instances.push({
        sprite: wallInfo.sprite,
        x: c * TILE_SIZE,
        y: r * TILE_SIZE + wallInfo.offsetY,
        zY: (r + 1) * TILE_SIZE,
      });
    }
  }
  wallInstanceCache = { tileMap, tileColors, cols, instances };
  return instances;
}

/**
 * Compute the flat fill hex color for a wall tile with a given FloorColor.
 * Uses same Colorize algorithm as floor tiles: 50% gray → HSL.
 */
export function wallColorToHex(color: FloorColor): string {
  const { h, s, b, c } = color;
  // Start with 50% gray (wall base)
  let lightness = 0.5;

  // Apply contrast
  if (c !== 0) {
    const factor = (100 + c) / 100;
    lightness = 0.5 + (lightness - 0.5) * factor;
  }

  // Apply brightness
  if (b !== 0) {
    lightness = lightness + b / 200;
  }

  lightness = Math.max(0, Math.min(1, lightness));

  return hslToHex(h, s / 100, lightness);
}
