import {
  BUBBLE_AGE_URGENT_SEC,
  BUBBLE_AGE_WARN_SEC,
  BUBBLE_FADE_DURATION_SEC,
  BUBBLE_MIN_SCALE,
  BUBBLE_PULSE_ALPHA_MIN,
  BUBBLE_PULSE_MAX_HZ,
  BUBBLE_PULSE_MIN_HZ,
  BUBBLE_SITTING_OFFSET_PX,
  BUBBLE_VERTICAL_OFFSET_PX,
  BUTTON_ICON_SIZE_FACTOR,
  BUTTON_LINE_WIDTH_MIN,
  BUTTON_LINE_WIDTH_ZOOM_FACTOR,
  BUTTON_MIN_RADIUS,
  BUTTON_RADIUS_ZOOM_FACTOR,
  CAMPUS_LABEL_BG,
  CAMPUS_LABEL_BORDER,
  CAMPUS_LABEL_BORDER_PX,
  CAMPUS_LABEL_FONT_FAMILY,
  CAMPUS_LABEL_FONT_MIN_PX,
  CAMPUS_LABEL_FONT_ZOOM_FACTOR,
  CAMPUS_LABEL_OFFSET_PX,
  CAMPUS_LABEL_SHADOW,
  CAMPUS_LABEL_SHADOW_PX,
  CAMPUS_LABEL_TEXT,
  CAMPUS_LABEL_TEXT_DIM,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_Z_SORT_OFFSET,
  DELETE_BUTTON_BG,
  FALLBACK_FLOOR_COLOR,
  GHOST_BORDER_HOVER_FILL,
  GHOST_BORDER_HOVER_STROKE,
  GHOST_BORDER_STROKE,
  GHOST_INVALID_TINT,
  GHOST_PREVIEW_SPRITE_ALPHA,
  GHOST_PREVIEW_TINT_ALPHA,
  GHOST_VALID_TINT,
  GRID_LINE_COLOR,
  HOVERED_OUTLINE_ALPHA,
  OFFSCREEN_MARKER_COLORS,
  OFFSCREEN_MARKER_SIZE_PX,
  OUTLINE_Z_SORT_OFFSET,
  ROTATE_BUTTON_BG,
  SEAT_AVAILABLE_COLOR,
  SEAT_BUSY_COLOR,
  SEAT_OWN_COLOR,
  SELECTED_OUTLINE_ALPHA,
  SELECTION_DASH_PATTERN,
  SELECTION_HIGHLIGHT_COLOR,
  VOID_TILE_DASH_PATTERN,
  VOID_TILE_OUTLINE_COLOR,
} from '../../constants.js';
import { getColorizedFloorSprite, hasFloorSprites, WALL_COLOR } from '../floorTiles.js';
import { getCachedSprite, getOutlineSprite } from '../sprites/spriteCache.js';
import {
  BUBBLE_BLOCKED_SPRITES,
  BUBBLE_DONE_SPRITE,
  BUBBLE_ERROR_SPRITE,
  getCharacterSprites,
} from '../sprites/spriteData.js';
import type {
  Character,
  FloorColor,
  FurnitureInstance,
  Seat,
  SpriteData,
  TileType as TileTypeVal,
} from '../types.js';
import { BubbleKind, CharacterState, TILE_SIZE, TileType } from '../types.js';
import { getWallInstances, hasWallSprites, wallColorToHex } from '../wallTiles.js';
import { getCharacterSprite } from './characters.js';
import { renderMatrixEffect } from './matrixEffect.js';
import type { OfficeState } from './officeState.js';

// ── Render functions ────────────────────────────────────────────

export function renderTileGrid(
  ctx: CanvasRenderingContext2D,
  tileMap: TileTypeVal[][],
  offsetX: number,
  offsetY: number,
  zoom: number,
  tileColors?: Array<FloorColor | null>,
  cols?: number,
): void {
  const s = TILE_SIZE * zoom;
  const useSpriteFloors = hasFloorSprites();
  const tmRows = tileMap.length;
  const tmCols = tmRows > 0 ? tileMap[0].length : 0;
  const layoutCols = cols ?? tmCols;

  // Floor tiles + wall base color
  for (let r = 0; r < tmRows; r++) {
    for (let c = 0; c < tmCols; c++) {
      const tile = tileMap[r][c];

      // Skip VOID tiles entirely (transparent)
      if (tile === TileType.VOID) continue;

      if (tile === TileType.WALL || !useSpriteFloors) {
        // Wall tiles or fallback: solid color
        if (tile === TileType.WALL) {
          const colorIdx = r * layoutCols + c;
          const wallColor = tileColors?.[colorIdx];
          ctx.fillStyle = wallColor ? wallColorToHex(wallColor) : WALL_COLOR;
        } else {
          ctx.fillStyle = FALLBACK_FLOOR_COLOR;
        }
        ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s);
        continue;
      }

      // Floor tile: get colorized sprite
      const colorIdx = r * layoutCols + c;
      const color = tileColors?.[colorIdx] ?? { h: 0, s: 0, b: 0, c: 0 };
      const sprite = getColorizedFloorSprite(tile, color);
      const cached = getCachedSprite(sprite, zoom);
      ctx.drawImage(cached, offsetX + c * s, offsetY + r * s);
    }
  }
}

interface ZDrawable {
  zY: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  furniture: FurnitureInstance[],
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  selectedAgentId: number | null,
  hoveredAgentId: number | null,
): void {
  const drawables: ZDrawable[] = [];

  // Furniture
  for (const f of furniture) {
    const cached = getCachedSprite(f.sprite, zoom);
    const fx = offsetX + f.x * zoom;
    const fy = offsetY + f.y * zoom;
    drawables.push({
      zY: f.zY,
      draw: (c) => {
        c.drawImage(cached, fx, fy);
      },
    });
  }

  // Characters
  for (const ch of characters) {
    const sprites = getCharacterSprites(ch.palette, ch.hueShift, ch.role);
    const spriteData = getCharacterSprite(ch, sprites);
    const cached = getCachedSprite(spriteData, zoom);
    // Sitting offset: shift character down when seated so they visually sit in the chair
    const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
    // Anchor at bottom-center of character — round to integer device pixels
    const drawX = Math.round(offsetX + ch.x * zoom - cached.width / 2);
    const drawY = Math.round(offsetY + (ch.y + sittingOffset) * zoom - cached.height);

    // Sort characters by bottom of their tile (not center) so they render
    // in front of same-row furniture (e.g. chairs) but behind furniture
    // at lower rows (e.g. desks, bookshelves that occlude from below).
    const charZY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET;

    // Matrix spawn/despawn effect — skip outline, use per-pixel rendering
    if (ch.matrixEffect) {
      const mDrawX = drawX;
      const mDrawY = drawY;
      const mSpriteData = spriteData;
      const mCh = ch;
      drawables.push({
        zY: charZY,
        draw: (c) => {
          renderMatrixEffect(c, mCh, mSpriteData, mDrawX, mDrawY, zoom);
        },
      });
      continue;
    }

    // White outline: full opacity for selected, 50% for hover
    const isSelected = selectedAgentId !== null && ch.id === selectedAgentId;
    const isHovered = hoveredAgentId !== null && ch.id === hoveredAgentId;
    if (isSelected || isHovered) {
      const outlineAlpha = isSelected ? SELECTED_OUTLINE_ALPHA : HOVERED_OUTLINE_ALPHA;
      const outlineData = getOutlineSprite(spriteData);
      const outlineCached = getCachedSprite(outlineData, zoom);
      const olDrawX = drawX - zoom; // 1 sprite-pixel offset, scaled
      const olDrawY = drawY - zoom; // outline follows sitting offset via drawY
      drawables.push({
        zY: charZY - OUTLINE_Z_SORT_OFFSET, // sort just before character
        draw: (c) => {
          c.save();
          c.globalAlpha = outlineAlpha;
          c.drawImage(outlineCached, olDrawX, olDrawY);
          c.restore();
        },
      });
    }

    drawables.push({
      zY: charZY,
      draw: (c) => {
        c.drawImage(cached, drawX, drawY);
      },
    });
  }

  // Sort by Y (lower = in front = drawn later)
  drawables.sort((a, b) => a.zY - b.zY);

  for (const d of drawables) {
    d.draw(ctx);
  }
}

// ── Seat indicators ─────────────────────────────────────────────

export function renderSeatIndicators(
  ctx: CanvasRenderingContext2D,
  seats: Map<string, Seat>,
  characters: Map<number, Character>,
  selectedAgentId: number | null,
  hoveredTile: { col: number; row: number } | null,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (selectedAgentId === null || !hoveredTile) return;
  const selectedChar = characters.get(selectedAgentId);
  if (!selectedChar) return;

  // Only show indicator for the hovered seat tile
  for (const [uid, seat] of seats) {
    if (seat.seatCol !== hoveredTile.col || seat.seatRow !== hoveredTile.row) continue;

    const s = TILE_SIZE * zoom;
    const x = offsetX + seat.seatCol * s;
    const y = offsetY + seat.seatRow * s;

    if (selectedChar.seatId === uid) {
      // Selected agent's own seat — blue
      ctx.fillStyle = SEAT_OWN_COLOR;
    } else if (!seat.assigned) {
      // Available seat — green
      ctx.fillStyle = SEAT_AVAILABLE_COLOR;
    } else {
      // Busy (assigned to another agent) — red
      ctx.fillStyle = SEAT_BUSY_COLOR;
    }
    ctx.fillRect(x, y, s, s);
    break;
  }
}

// ── Edit mode overlays ──────────────────────────────────────────

export function renderGridOverlay(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
  cols: number,
  rows: number,
  tileMap?: TileTypeVal[][],
): void {
  const s = TILE_SIZE * zoom;
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Vertical lines — offset by 0.5 for crisp 1px lines
  for (let c = 0; c <= cols; c++) {
    const x = offsetX + c * s + 0.5;
    ctx.moveTo(x, offsetY);
    ctx.lineTo(x, offsetY + rows * s);
  }
  // Horizontal lines
  for (let r = 0; r <= rows; r++) {
    const y = offsetY + r * s + 0.5;
    ctx.moveTo(offsetX, y);
    ctx.lineTo(offsetX + cols * s, y);
  }
  ctx.stroke();

  // Draw faint dashed outlines on VOID tiles
  if (tileMap) {
    ctx.save();
    ctx.strokeStyle = VOID_TILE_OUTLINE_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash(VOID_TILE_DASH_PATTERN);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (tileMap[r]?.[c] === TileType.VOID) {
          ctx.strokeRect(offsetX + c * s + 0.5, offsetY + r * s + 0.5, s - 1, s - 1);
        }
      }
    }
    ctx.restore();
  }
}

/** Draw faint expansion placeholders 1 tile outside grid bounds (ghost border). */
export function renderGhostBorder(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  zoom: number,
  cols: number,
  rows: number,
  ghostHoverCol: number,
  ghostHoverRow: number,
): void {
  const s = TILE_SIZE * zoom;
  ctx.save();

  // Collect ghost border tiles: one ring around the grid
  const ghostTiles: Array<{ c: number; r: number }> = [];
  // Top and bottom rows
  for (let c = -1; c <= cols; c++) {
    ghostTiles.push({ c, r: -1 });
    ghostTiles.push({ c, r: rows });
  }
  // Left and right columns (excluding corners already added)
  for (let r = 0; r < rows; r++) {
    ghostTiles.push({ c: -1, r });
    ghostTiles.push({ c: cols, r });
  }

  for (const { c, r } of ghostTiles) {
    const x = offsetX + c * s;
    const y = offsetY + r * s;
    const isHovered = c === ghostHoverCol && r === ghostHoverRow;
    if (isHovered) {
      ctx.fillStyle = GHOST_BORDER_HOVER_FILL;
      ctx.fillRect(x, y, s, s);
    }
    ctx.strokeStyle = isHovered ? GHOST_BORDER_HOVER_STROKE : GHOST_BORDER_STROKE;
    ctx.lineWidth = 1;
    ctx.setLineDash(VOID_TILE_DASH_PATTERN);
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }

  ctx.restore();
}

export function renderGhostPreview(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteData,
  col: number,
  row: number,
  footprintW: number,
  footprintH: number,
  valid: boolean,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const cached = getCachedSprite(sprite, zoom);
  const s = TILE_SIZE * zoom;
  const x = offsetX + col * s;
  // Bottom-anchor: sprite bottom aligns with the footprint's bottom edge
  const spriteY = offsetY + (row + footprintH) * s - cached.height;
  ctx.save();
  ctx.globalAlpha = GHOST_PREVIEW_SPRITE_ALPHA;
  ctx.drawImage(cached, x, spriteY);
  // Validity tint paints the footprint tiles (the base the item stands on)
  ctx.globalAlpha = GHOST_PREVIEW_TINT_ALPHA;
  ctx.fillStyle = valid ? GHOST_VALID_TINT : GHOST_INVALID_TINT;
  ctx.fillRect(x, offsetY + row * s, footprintW * s, footprintH * s);
  ctx.restore();
}

/** Device-pixel y of the top of a selected item's visual sprite rect.
 *  Bottom-anchored: the sprite bottom sits on the footprint's bottom edge. */
function selectionTopY(
  row: number,
  h: number,
  spriteH: number,
  offsetY: number,
  zoom: number,
): number {
  const s = TILE_SIZE * zoom;
  return offsetY + (row + h) * s - Math.max(spriteH * zoom, h * s);
}

export function renderSelectionHighlight(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  w: number,
  h: number,
  spriteH: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const s = TILE_SIZE * zoom;
  const x = offsetX + col * s;
  const y = selectionTopY(row, h, spriteH, offsetY, zoom);
  const hPx = offsetY + (row + h) * s - y;
  ctx.save();
  ctx.strokeStyle = SELECTION_HIGHLIGHT_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash(SELECTION_DASH_PATTERN);
  ctx.strokeRect(x + 1, y + 1, w * s - 2, hPx - 2);
  ctx.restore();
}

export function renderDeleteButton(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  w: number,
  h: number,
  spriteH: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): DeleteButtonBounds {
  const s = TILE_SIZE * zoom;
  // Position at top-right corner of the selected furniture's visual sprite
  const cx = offsetX + (col + w) * s + 1;
  const cy = selectionTopY(row, h, spriteH, offsetY, zoom) - 1;
  const radius = Math.max(BUTTON_MIN_RADIUS, zoom * BUTTON_RADIUS_ZOOM_FACTOR);

  // Circle background
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = DELETE_BUTTON_BG;
  ctx.fill();

  // X mark
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(BUTTON_LINE_WIDTH_MIN, zoom * BUTTON_LINE_WIDTH_ZOOM_FACTOR);
  ctx.lineCap = 'round';
  const xSize = radius * BUTTON_ICON_SIZE_FACTOR;
  ctx.beginPath();
  ctx.moveTo(cx - xSize, cy - xSize);
  ctx.lineTo(cx + xSize, cy + xSize);
  ctx.moveTo(cx + xSize, cy - xSize);
  ctx.lineTo(cx - xSize, cy + xSize);
  ctx.stroke();
  ctx.restore();

  return { cx, cy, radius };
}

export function renderRotateButton(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  _w: number,
  h: number,
  spriteH: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): RotateButtonBounds {
  const s = TILE_SIZE * zoom;
  // Position at top-left corner of the selected furniture's visual sprite
  const radius = Math.max(BUTTON_MIN_RADIUS, zoom * BUTTON_RADIUS_ZOOM_FACTOR);
  const cx = offsetX + col * s - 1;
  const cy = selectionTopY(row, h, spriteH, offsetY, zoom) - 1;

  // Circle background
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = ROTATE_BUTTON_BG;
  ctx.fill();

  // Circular arrow icon
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(BUTTON_LINE_WIDTH_MIN, zoom * BUTTON_LINE_WIDTH_ZOOM_FACTOR);
  ctx.lineCap = 'round';
  const arcR = radius * BUTTON_ICON_SIZE_FACTOR;
  ctx.beginPath();
  // Draw a 270-degree arc
  ctx.arc(cx, cy, arcR, -Math.PI * 0.8, Math.PI * 0.7);
  ctx.stroke();
  // Draw arrowhead at the end of the arc
  const endAngle = Math.PI * 0.7;
  const endX = cx + arcR * Math.cos(endAngle);
  const endY = cy + arcR * Math.sin(endAngle);
  const arrowSize = radius * 0.35;
  ctx.beginPath();
  ctx.moveTo(endX + arrowSize * 0.6, endY - arrowSize * 0.3);
  ctx.lineTo(endX, endY);
  ctx.lineTo(endX + arrowSize * 0.7, endY + arrowSize * 0.5);
  ctx.stroke();
  ctx.restore();

  return { cx, cy, radius };
}

// ── Speech bubbles ──────────────────────────────────────────────

/** Escalation tier of a blocked bubble from how long it has been waiting. */
export function blockedTier(ageSec: number): number {
  if (ageSec >= BUBBLE_AGE_URGENT_SEC) return 2;
  if (ageSec >= BUBBLE_AGE_WARN_SEC) return 1;
  return 0;
}

/** The sprite a character's current bubble should draw with. */
export function bubbleSpriteFor(ch: Character): SpriteData | null {
  switch (ch.bubbleType) {
    case BubbleKind.BLOCKED:
      return BUBBLE_BLOCKED_SPRITES[blockedTier(ch.bubbleAgeSec)];
    case BubbleKind.DONE:
      return BUBBLE_DONE_SPRITE;
    case BubbleKind.ERROR:
      return BUBBLE_ERROR_SPRITE;
    default:
      return null;
  }
}

/**
 * Bubbles are drawn as a UI layer pinned to the character rather than as part
 * of the world: they never shrink below BUBBLE_MIN_SCALE device pixels per
 * sprite pixel, so "this agent needs you" stays readable at campus zoom, where
 * the character itself is only a few pixels tall.
 */
export function bubbleScale(zoom: number): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(Math.round(BUBBLE_MIN_SCALE * dpr), zoom);
}

/**
 * Top-centre of a character's bubble in device pixels. Shared by the renderer
 * and the off-screen markers so both agree on where a bubble actually sits.
 */
export function bubbleTopPoint(
  ch: Character,
  offsetX: number,
  offsetY: number,
  zoom: number,
  spriteRows: number,
): { x: number; y: number } {
  const sittingOff = ch.state === CharacterState.TYPE ? BUBBLE_SITTING_OFFSET_PX : 0;
  return {
    x: offsetX + ch.x * zoom,
    y:
      offsetY +
      (ch.y + sittingOff - BUBBLE_VERTICAL_OFFSET_PX) * zoom -
      spriteRows * bubbleScale(zoom),
  };
}

export function renderBubbles(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const scale = bubbleScale(zoom);
  const nowSec = performance.now() / 1000;

  for (const ch of characters) {
    const sprite = bubbleSpriteFor(ch);
    if (!sprite) continue;

    let alpha = 1.0;
    // A blocked bubble breathes, and breathes faster the longer it has waited —
    // so the oldest block is the one that catches your eye first.
    if (ch.bubbleType === BubbleKind.BLOCKED) {
      const t = Math.min(ch.bubbleAgeSec / BUBBLE_AGE_URGENT_SEC, 1);
      const hz = BUBBLE_PULSE_MIN_HZ + (BUBBLE_PULSE_MAX_HZ - BUBBLE_PULSE_MIN_HZ) * t;
      const wave = (Math.sin(nowSec * hz * Math.PI * 2) + 1) / 2;
      alpha = BUBBLE_PULSE_ALPHA_MIN + (1 - BUBBLE_PULSE_ALPHA_MIN) * wave;
    }
    // Dismissal fade-out (unread badges only)
    if (ch.bubbleFadeSec > 0) {
      alpha *= Math.min(ch.bubbleFadeSec / BUBBLE_FADE_DURATION_SEC, 1);
    }

    const cached = getCachedSprite(sprite, scale);
    // Anchor in world space (above the head, following the sitting offset),
    // then draw the fixed-size sprite centered on it.
    const top = bubbleTopPoint(ch, offsetX, offsetY, zoom, sprite.length);
    const bubbleX = Math.round(top.x - cached.width / 2);
    const bubbleY = Math.round(top.y);

    ctx.save();
    if (alpha < 1.0) ctx.globalAlpha = alpha;
    ctx.drawImage(cached, bubbleX, bubbleY);
    ctx.restore();
  }
}

/**
 * Bubbles keep a constant on-screen size, so once characters are packed closer
 * together than a bubble is wide they turn into confetti. Past that point the
 * campus shows one marker per office instead.
 */
export function shouldClusterBubbles(zoom: number): boolean {
  return TILE_SIZE * zoom < BUBBLE_DONE_SPRITE[0].length * bubbleScale(zoom);
}

/** Most-urgent-first, so a clustered office reports its worst state. */
const BUBBLE_PRIORITY: BubbleKind[] = [BubbleKind.BLOCKED, BubbleKind.ERROR, BubbleKind.DONE];

export interface BubbleSummary {
  kind: BubbleKind;
  count: number;
  /** Age of the oldest bubble of that kind, for escalation. */
  oldestAgeSec: number;
}

/** Roll a set of characters up into the single bubble their office should show. */
export function summarizeBubbles(characters: Character[]): BubbleSummary | null {
  for (const kind of BUBBLE_PRIORITY) {
    const matching = characters.filter((ch) => ch.bubbleType === kind);
    if (matching.length === 0) continue;
    return {
      kind,
      count: matching.length,
      oldestAgeSec: Math.max(...matching.map((ch) => ch.bubbleAgeSec)),
    };
  }
  return null;
}

/**
 * One aggregated bubble for a whole office, drawn above its label plate with a
 * "xN" tally when more than one agent is flagged.
 */
export function renderBubbleCluster(
  ctx: CanvasRenderingContext2D,
  summary: BubbleSummary,
  centerX: number,
  bottomY: number,
  zoom: number,
): void {
  const sprite =
    summary.kind === BubbleKind.BLOCKED
      ? BUBBLE_BLOCKED_SPRITES[blockedTier(summary.oldestAgeSec)]
      : summary.kind === BubbleKind.ERROR
        ? BUBBLE_ERROR_SPRITE
        : BUBBLE_DONE_SPRITE;
  const cached = getCachedSprite(sprite, bubbleScale(zoom));

  const dpr = window.devicePixelRatio || 1;
  const fontPx = Math.max(CAMPUS_LABEL_FONT_MIN_PX * dpr, zoom * CAMPUS_LABEL_FONT_ZOOM_FACTOR);
  const countText = summary.count > 1 ? `x${summary.count}` : '';

  ctx.save();
  ctx.font = `${fontPx}px ${CAMPUS_LABEL_FONT_FAMILY}`;
  const countW = countText ? ctx.measureText(countText).width + fontPx * 0.3 : 0;
  const totalW = cached.width + countW;
  const x = Math.round(centerX - totalW / 2);
  const y = Math.round(bottomY - cached.height);

  let alpha = 1;
  if (summary.kind === BubbleKind.BLOCKED) {
    const t = Math.min(summary.oldestAgeSec / BUBBLE_AGE_URGENT_SEC, 1);
    const hz = BUBBLE_PULSE_MIN_HZ + (BUBBLE_PULSE_MAX_HZ - BUBBLE_PULSE_MIN_HZ) * t;
    const wave = (Math.sin((performance.now() / 1000) * hz * Math.PI * 2) + 1) / 2;
    alpha = BUBBLE_PULSE_ALPHA_MIN + (1 - BUBBLE_PULSE_ALPHA_MIN) * wave;
  }
  ctx.globalAlpha = alpha;
  ctx.drawImage(cached, x, y);
  if (countText) {
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = CAMPUS_LABEL_TEXT;
    ctx.fillText(countText, x + cached.width + fontPx * 0.3, y + cached.height / 2);
  }
  ctx.restore();
}

/** A blocked agent that currently sits outside the viewport. */
export interface OffscreenTarget {
  /** Device-pixel position of the agent, possibly outside the canvas. */
  x: number;
  y: number;
  ageSec: number;
}

/**
 * Arrows pinned to the viewport edge pointing at blocked agents whose bubble
 * is not fully on screen. The office never moves itself to get your attention,
 * so this is how "someone needs you over there" stays findable. The test is on
 * the bubble, not the character: an agent can sit just inside the top edge with
 * its bubble clipped away, which reads as "nothing is wrong" — the worst lie
 * this UI can tell.
 */
export function renderOffscreenMarkers(
  ctx: CanvasRenderingContext2D,
  targets: OffscreenTarget[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (targets.length === 0) return;
  const size = OFFSCREEN_MARKER_SIZE_PX * (window.devicePixelRatio || 1);
  const pad = size;

  ctx.save();
  for (const t of targets) {
    if (t.x >= 0 && t.x <= canvasWidth && t.y >= 0 && t.y <= canvasHeight) continue;
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const dx = t.x - cx;
    const dy = t.y - cy;
    if (dx === 0 && dy === 0) continue;
    // Clamp the direction vector to the padded viewport rectangle
    const scaleX = dx === 0 ? Infinity : (canvasWidth / 2 - pad) / Math.abs(dx);
    const scaleY = dy === 0 ? Infinity : (canvasHeight / 2 - pad) / Math.abs(dy);
    const k = Math.min(scaleX, scaleY);
    const px = cx + dx * k;
    const py = cy + dy * k;
    const angle = Math.atan2(dy, dx);

    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = OFFSCREEN_MARKER_COLORS[blockedTier(t.ageSec)];
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.6, -size * 0.7);
    ctx.lineTo(-size * 0.6, size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
}

export interface ButtonBounds {
  /** Center X in device pixels */
  cx: number;
  /** Center Y in device pixels */
  cy: number;
  /** Radius in device pixels */
  radius: number;
}

export type DeleteButtonBounds = ButtonBounds;
export type RotateButtonBounds = ButtonBounds;

export interface EditorRenderState {
  showGrid: boolean;
  ghostSprite: SpriteData | null;
  ghostCol: number;
  ghostRow: number;
  /** Footprint size of the ghost item (bottom-anchored sprite stands on it) */
  ghostFootprintW: number;
  ghostFootprintH: number;
  ghostValid: boolean;
  selectedCol: number;
  selectedRow: number;
  selectedW: number;
  selectedH: number;
  /** Sprite height in sprite pixels of the selected item (for bottom-anchored overlays) */
  selectedSpriteH: number;
  hasSelection: boolean;
  isRotatable: boolean;
  /** Updated each frame by renderDeleteButton */
  deleteButtonBounds: DeleteButtonBounds | null;
  /** Updated each frame by renderRotateButton */
  rotateButtonBounds: RotateButtonBounds | null;
  /** Whether to show ghost border (expansion tiles outside grid) */
  showGhostBorder: boolean;
  /** Hovered ghost border tile col (-1 to cols) */
  ghostBorderHoverCol: number;
  /** Hovered ghost border tile row (-1 to rows) */
  ghostBorderHoverRow: number;
}

export interface SelectionRenderState {
  selectedAgentId: number | null;
  hoveredAgentId: number | null;
  hoveredTile: { col: number; row: number } | null;
  seats: Map<string, Seat>;
  characters: Map<number, Character>;
}

/**
 * Render a single office (tiles, seats, walls, furniture, characters, bubbles)
 * at an arbitrary device-pixel offset. Used by the campus view to draw every
 * workspace's office on one shared canvas.
 */
export function renderOffice(
  ctx: CanvasRenderingContext2D,
  office: OfficeState,
  offsetX: number,
  offsetY: number,
  zoom: number,
  showBubbles = true,
): void {
  const layout = office.getLayout();
  renderTileGrid(ctx, office.tileMap, offsetX, offsetY, zoom, layout.tileColors, layout.cols);

  renderSeatIndicators(
    ctx,
    office.seats,
    office.characters,
    office.selectedAgentId,
    office.hoveredTile,
    offsetX,
    offsetY,
    zoom,
  );

  const wallInstances = hasWallSprites()
    ? getWallInstances(office.tileMap, layout.tileColors, layout.cols)
    : [];
  const allFurniture =
    wallInstances.length > 0 ? [...wallInstances, ...office.furniture] : office.furniture;

  const characters = office.getCharacters();
  renderScene(
    ctx,
    allFurniture,
    characters,
    offsetX,
    offsetY,
    zoom,
    office.selectedAgentId,
    office.hoveredAgentId,
  );

  if (showBubbles) renderBubbles(ctx, characters, offsetX, offsetY, zoom);
}

/**
 * Draw a pixel-styled label plate centered above an office: solid background,
 * hard border and offset shadow (no blur), sharp corners.
 */
export function renderOfficeLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  dim: boolean,
  offsetX: number,
  offsetY: number,
  zoom: number,
  officeDeviceWidth: number,
): { x: number; y: number; w: number; h: number } {
  // Constant on-screen size: the canvas is in DEVICE pixels, so scale the
  // CSS-pixel minimum by devicePixelRatio (else retina renders it half-size).
  const dpr = window.devicePixelRatio || 1;
  const fontPx = Math.max(CAMPUS_LABEL_FONT_MIN_PX * dpr, zoom * CAMPUS_LABEL_FONT_ZOOM_FACTOR);
  const padX = fontPx * 0.6;
  const padY = fontPx * 0.3;

  ctx.save();
  ctx.font = `${fontPx}px ${CAMPUS_LABEL_FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const textW = ctx.measureText(text).width;
  const plateW = Math.round(textW + padX * 2);
  const plateH = Math.round(fontPx + padY * 2);
  const plateX = Math.round(offsetX + officeDeviceWidth / 2 - plateW / 2);
  const plateY = Math.round(offsetY - CAMPUS_LABEL_OFFSET_PX * dpr - plateH);

  ctx.globalAlpha = dim ? 0.6 : 1;
  // Hard offset shadow
  ctx.fillStyle = CAMPUS_LABEL_SHADOW;
  ctx.fillRect(plateX + CAMPUS_LABEL_SHADOW_PX, plateY + CAMPUS_LABEL_SHADOW_PX, plateW, plateH);
  // Border + background
  ctx.fillStyle = CAMPUS_LABEL_BORDER;
  ctx.fillRect(plateX, plateY, plateW, plateH);
  ctx.fillStyle = CAMPUS_LABEL_BG;
  ctx.fillRect(
    plateX + CAMPUS_LABEL_BORDER_PX,
    plateY + CAMPUS_LABEL_BORDER_PX,
    plateW - CAMPUS_LABEL_BORDER_PX * 2,
    plateH - CAMPUS_LABEL_BORDER_PX * 2,
  );
  // Text
  ctx.fillStyle = dim ? CAMPUS_LABEL_TEXT_DIM : CAMPUS_LABEL_TEXT;
  ctx.fillText(text, plateX + plateW / 2, plateY + plateH / 2 + 1);
  ctx.restore();
  return { x: plateX, y: plateY, w: plateW, h: plateH };
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  tileMap: TileTypeVal[][],
  furniture: FurnitureInstance[],
  characters: Character[],
  zoom: number,
  panX: number,
  panY: number,
  selection?: SelectionRenderState,
  editor?: EditorRenderState,
  tileColors?: Array<FloorColor | null>,
  layoutCols?: number,
  layoutRows?: number,
): { offsetX: number; offsetY: number } {
  // Clear
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Use layout dimensions (fallback to tileMap size)
  const cols = layoutCols ?? (tileMap.length > 0 ? tileMap[0].length : 0);
  const rows = layoutRows ?? tileMap.length;

  // Center map in viewport + pan offset (integer device pixels)
  const mapW = cols * TILE_SIZE * zoom;
  const mapH = rows * TILE_SIZE * zoom;
  const offsetX = Math.floor((canvasWidth - mapW) / 2) + Math.round(panX);
  const offsetY = Math.floor((canvasHeight - mapH) / 2) + Math.round(panY);

  // Draw tiles (floor + wall base color)
  renderTileGrid(ctx, tileMap, offsetX, offsetY, zoom, tileColors, layoutCols);

  // Seat indicators (below furniture/characters, on top of floor)
  if (selection) {
    renderSeatIndicators(
      ctx,
      selection.seats,
      selection.characters,
      selection.selectedAgentId,
      selection.hoveredTile,
      offsetX,
      offsetY,
      zoom,
    );
  }

  // Build wall instances for z-sorting with furniture and characters
  const wallInstances = hasWallSprites() ? getWallInstances(tileMap, tileColors, layoutCols) : [];
  const allFurniture = wallInstances.length > 0 ? [...wallInstances, ...furniture] : furniture;

  // Draw walls + furniture + characters (z-sorted)
  const selectedId = selection?.selectedAgentId ?? null;
  const hoveredId = selection?.hoveredAgentId ?? null;
  renderScene(ctx, allFurniture, characters, offsetX, offsetY, zoom, selectedId, hoveredId);

  // Speech bubbles (always on top of characters)
  renderBubbles(ctx, characters, offsetX, offsetY, zoom);

  // Editor overlays
  if (editor) {
    if (editor.showGrid) {
      renderGridOverlay(ctx, offsetX, offsetY, zoom, cols, rows, tileMap);
    }
    if (editor.showGhostBorder) {
      renderGhostBorder(
        ctx,
        offsetX,
        offsetY,
        zoom,
        cols,
        rows,
        editor.ghostBorderHoverCol,
        editor.ghostBorderHoverRow,
      );
    }
    if (editor.ghostSprite && editor.ghostCol >= 0) {
      renderGhostPreview(
        ctx,
        editor.ghostSprite,
        editor.ghostCol,
        editor.ghostRow,
        editor.ghostFootprintW,
        editor.ghostFootprintH,
        editor.ghostValid,
        offsetX,
        offsetY,
        zoom,
      );
    }
    if (editor.hasSelection) {
      renderSelectionHighlight(
        ctx,
        editor.selectedCol,
        editor.selectedRow,
        editor.selectedW,
        editor.selectedH,
        editor.selectedSpriteH,
        offsetX,
        offsetY,
        zoom,
      );
      editor.deleteButtonBounds = renderDeleteButton(
        ctx,
        editor.selectedCol,
        editor.selectedRow,
        editor.selectedW,
        editor.selectedH,
        editor.selectedSpriteH,
        offsetX,
        offsetY,
        zoom,
      );
      if (editor.isRotatable) {
        editor.rotateButtonBounds = renderRotateButton(
          ctx,
          editor.selectedCol,
          editor.selectedRow,
          editor.selectedW,
          editor.selectedH,
          editor.selectedSpriteH,
          offsetX,
          offsetY,
          zoom,
        );
      } else {
        editor.rotateButtonBounds = null;
      }
    } else {
      editor.deleteButtonBounds = null;
      editor.rotateButtonBounds = null;
    }
  }

  return { offsetX, offsetY };
}
