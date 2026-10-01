/**
 * Where idle agents stand to use furniture.
 *
 * Pure: given the placed furniture, the tile map and the blocked tiles, list
 * every tile from which a character can use (or look at) an interactable
 * piece, the direction it must face to do so, and how many characters the
 * piece hosts at once. OfficeState owns the reservations on top of this.
 */
import type { FurnitureInteract } from '../../../../shared/protocol.js';
import { INTERACT_MAX_USERS_PER_PIECE, INTERACT_SURFACE_MAX_REACH } from '../../constants.js';
import type { FurnitureCatalogEntry, PlacedFurniture, TileType as TileTypeVal } from '../types.js';
import { Direction } from '../types.js';
import { isWalkable } from './tileMap.js';

export interface InteractionSpot {
  /** Uid of the piece used from here */
  uid: string;
  kind: FurnitureInteract;
  col: number;
  row: number;
  /** Direction a character on this tile faces to look at the piece */
  dir: Direction;
  /** 0 = the piece's front, 1 = its sides, 2 = its back. Lower is preferred. */
  rank: number;
  /** Most characters the piece hosts at once (same value on every spot of a piece) */
  capacity: number;
}

type EntryLookup = (
  type: string,
) =>
  | Pick<
      FurnitureCatalogEntry,
      | 'footprintW'
      | 'footprintH'
      | 'isDesk'
      | 'orientation'
      | 'canPlaceOnSurfaces'
      | 'canPlaceOnWalls'
      | 'interact'
    >
  | undefined;

interface Rect {
  col: number;
  row: number;
  w: number;
  h: number;
}

/** Which side of the footprint the piece faces, from its catalog orientation. */
function frontSide(orientation: string | undefined): Direction {
  switch (orientation) {
    case 'back':
      return Direction.UP;
    case 'left':
      return Direction.LEFT;
    case 'right':
      return Direction.RIGHT;
    default:
      return Direction.DOWN;
  }
}

const OPPOSITE: Record<Direction, Direction> = {
  [Direction.DOWN]: Direction.UP,
  [Direction.UP]: Direction.DOWN,
  [Direction.LEFT]: Direction.RIGHT,
  [Direction.RIGHT]: Direction.LEFT,
};

/** Tiles just outside each side of a rect, tagged with the side they are on. */
function ring(r: Rect): Array<{ col: number; row: number; side: Direction }> {
  const out: Array<{ col: number; row: number; side: Direction }> = [];
  for (let c = r.col; c < r.col + r.w; c++) {
    out.push({ col: c, row: r.row + r.h, side: Direction.DOWN });
    out.push({ col: c, row: r.row - 1, side: Direction.UP });
  }
  for (let rr = r.row; rr < r.row + r.h; rr++) {
    out.push({ col: r.col - 1, row: rr, side: Direction.LEFT });
    out.push({ col: r.col + r.w, row: rr, side: Direction.RIGHT });
  }
  return out;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;
}

/** Union bounding box of the desks a surface item sits on (null = on the floor). */
function deskUnder(item: Rect, desks: Rect[]): Rect | null {
  let box: Rect | null = null;
  for (const d of desks) {
    if (!overlaps(item, d)) continue;
    if (!box) {
      box = { ...d };
    } else {
      const c0 = Math.min(box.col, d.col);
      const r0 = Math.min(box.row, d.row);
      const c1 = Math.max(box.col + box.w, d.col + d.w);
      const r1 = Math.max(box.row + box.h, d.row + d.h);
      box = { col: c0, row: r0, w: c1 - c0, h: r1 - r0 };
    }
  }
  return box;
}

/**
 * Every usable spot beside every interactable piece, best-first per piece.
 *
 * - Wall pieces: only the tile(s) directly below the footprint's bottom row.
 * - Floor pieces: all four sides; the piece's front (from its orientation)
 *   ranks first, then its sides, then its back.
 * - Surface pieces (a coffee machine on a counter): the same rules applied to
 *   the desk underneath, limited to tiles within reach of the item itself
 *   (the whole ring only when none are), ties broken by closeness to it.
 *
 * A spot must be walkable and unblocked, and never a seat tile.
 */
export function interactionSpots(
  furniture: PlacedFurniture[],
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
  getEntry: EntryLookup,
  seatTiles?: Set<string>,
): InteractionSpot[] {
  const desks: Rect[] = [];
  for (const item of furniture) {
    const e = getEntry(item.type);
    if (e?.isDesk) desks.push({ col: item.col, row: item.row, w: e.footprintW, h: e.footprintH });
  }

  const spots: InteractionSpot[] = [];
  for (const item of furniture) {
    const entry = getEntry(item.type);
    if (!entry?.interact) continue;
    const own: Rect = { col: item.col, row: item.row, w: entry.footprintW, h: entry.footprintH };
    const capacity = Math.max(
      1,
      Math.min(INTERACT_MAX_USERS_PER_PIECE, Math.max(entry.footprintW, entry.footprintH)),
    );

    let candidates: Array<{ col: number; row: number; side: Direction }>;
    let front: Direction;
    let anchor: Rect = own;
    if (entry.canPlaceOnWalls) {
      front = Direction.DOWN;
      candidates = [];
      for (let c = own.col; c < own.col + own.w; c++) {
        candidates.push({ col: c, row: own.row + own.h, side: Direction.DOWN });
      }
    } else {
      front = frontSide(entry.orientation);
      if (entry.canPlaceOnSurfaces) anchor = deskUnder(own, desks) ?? own;
      candidates = ring(anchor);
    }

    const seen = new Set<string>();
    const pieceSpots: Array<InteractionSpot & { dist: number }> = [];
    for (const t of candidates) {
      const key = `${t.col},${t.row}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (seatTiles?.has(key)) continue;
      if (!isWalkable(t.col, t.row, tileMap, blockedTiles)) continue;
      const rank = t.side === front ? 0 : t.side === OPPOSITE[front] ? 2 : 1;
      // Closeness to the item itself (matters when the anchor is a long counter)
      const dc = Math.max(own.col - t.col, 0, t.col - (own.col + own.w - 1));
      const dr = Math.max(own.row - t.row, 0, t.row - (own.row + own.h - 1));
      pieceSpots.push({
        uid: item.uid,
        kind: entry.interact,
        col: t.col,
        row: t.row,
        dir: OPPOSITE[t.side],
        rank,
        capacity,
        dist: dc + dr,
      });
    }
    // On a long counter, use the item from beside it, not from the far end;
    // the whole counter's ring is only a fallback when nothing is that close.
    let usable = pieceSpots;
    if (anchor !== own) {
      const near = pieceSpots.filter((s) => s.dist <= INTERACT_SURFACE_MAX_REACH);
      if (near.length > 0) usable = near;
    }
    usable.sort((a, b) => a.rank - b.rank || a.dist - b.dist);
    for (const s of usable) {
      spots.push({
        uid: s.uid,
        kind: s.kind,
        col: s.col,
        row: s.row,
        dir: s.dir,
        rank: s.rank,
        capacity: s.capacity,
      });
    }
  }
  return spots;
}
