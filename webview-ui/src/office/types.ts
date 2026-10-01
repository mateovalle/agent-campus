import type { FurnitureInteract } from '../../../shared/protocol.js';
export {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  MATRIX_EFFECT_DURATION_SEC as MATRIX_EFFECT_DURATION,
  MAX_COLS,
  MAX_ROWS,
  TILE_SIZE,
  WALL_FACE_HEIGHT_PX,
  WALL_FACE_OVERHANG_PX,
} from '../constants.js';

export const TileType = {
  WALL: 0,
  FLOOR_1: 1,
  FLOOR_2: 2,
  FLOOR_3: 3,
  FLOOR_4: 4,
  FLOOR_5: 5,
  FLOOR_6: 6,
  FLOOR_7: 7,
  VOID: 8,
} as const;
/**
 * A tile value. Beyond the named ones above, the value space is open-ended:
 *  - floors: pattern p is tile p for p ≤ 7 and p + 1 from pattern 8 on (8 is VOID,
 *    taken before floors.png grew past seven patterns);
 *  - walls: style 0 is WALL (0), style s ≥ 1 is WALL_STYLE_BASE + s.
 * Always go through the helpers below instead of comparing against WALL.
 */
export type TileType = number;

const WALL_STYLE_BASE = 100;

export function isWallTile(t: TileType): boolean {
  return t === TileType.WALL || t > WALL_STYLE_BASE;
}

export function isFloorTile(t: TileType): boolean {
  return t !== TileType.VOID && !isWallTile(t);
}

/** 0-based wall style of a wall tile. */
export function wallStyleOf(t: TileType): number {
  return t > WALL_STYLE_BASE ? t - WALL_STYLE_BASE : 0;
}

export function wallTileForStyle(style: number): TileType {
  return style <= 0 ? TileType.WALL : WALL_STYLE_BASE + style;
}

/** 1-based floor pattern (index into floors.png + 1) of a floor tile. */
export function floorPatternOf(t: TileType): number {
  return t > TileType.VOID ? t - 1 : t;
}

export function floorTileForPattern(pattern: number): TileType {
  return pattern >= TileType.VOID ? pattern + 1 : pattern;
}

/** Per-tile color settings for floor pattern colorization */
export interface FloorColor {
  /** Hue: 0-360 in colorize mode, -180 to +180 in adjust mode */
  h: number;
  /** Saturation: 0-100 in colorize mode, -100 to +100 in adjust mode */
  s: number;
  /** Brightness -100 to 100 */
  b: number;
  /** Contrast -100 to 100 */
  c: number;
  /** When true, use Photoshop-style Colorize (grayscale → fixed HSL). Default: adjust mode. */
  colorize?: boolean;
}

/**
 * What a bubble over a character's head can mean. The rule is deliberately
 * strict: a bubble always means "there is something here for you". Ordinary
 * work carries no bubble at all.
 *
 * - blocked: the agent cannot continue without you (permission or question).
 *   Persists until actually resolved — a click will NOT dismiss it.
 * - done:    the turn finished and you haven't looked yet. Unread badge.
 * - error:   the turn finished with tool errors and you haven't looked yet.
 */
export const BubbleKind = {
  BLOCKED: 'blocked',
  DONE: 'done',
  ERROR: 'error',
} as const;
export type BubbleKind = (typeof BubbleKind)[keyof typeof BubbleKind];

/** Bubbles you can clear just by looking; a blocked one needs a real resolution. */
export function isUnreadBubble(kind: BubbleKind | null): boolean {
  return kind === BubbleKind.DONE || kind === BubbleKind.ERROR;
}

export const CharacterState = {
  IDLE: 'idle',
  WALK: 'walk',
  TYPE: 'type',
  /** Standing beside an interactable piece, facing it (no sitting offset) */
  USE: 'use',
} as const;
export type CharacterState = (typeof CharacterState)[keyof typeof CharacterState];

export const Direction = {
  DOWN: 0,
  LEFT: 1,
  RIGHT: 2,
  UP: 3,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

/** 2D array of hex color strings (or '' for transparent). [row][col] */
export type SpriteData = string[][];

export interface Seat {
  /** Chair furniture uid */
  uid: string;
  /** Tile col where agent sits */
  seatCol: number;
  /** Tile row where agent sits */
  seatRow: number;
  /** Direction character faces when sitting (toward adjacent desk) */
  facingDir: Direction;
  assigned: boolean;
}

export interface FurnitureInstance {
  sprite: SpriteData;
  /** Pixel x (top-left) */
  x: number;
  /** Pixel y (top-left) */
  y: number;
  /** Y value used for depth sorting (typically bottom edge) */
  zY: number;
  /** Animated pieces: every frame (frames[0] === sprite), looped by the renderer */
  frames?: SpriteData[];
  frameMs?: number;
  /** Per-piece offset into the loop (ms) so identical pieces don't blink in unison */
  phaseMs?: number;
}

export interface ToolActivity {
  toolId: string;
  status: string;
  done: boolean;
  permissionWait?: boolean;
}

export const FurnitureType = {
  // Original hand-drawn sprites (kept for backward compat)
  DESK: 'desk',
  BOOKSHELF: 'bookshelf',
  PLANT: 'plant',
  COOLER: 'cooler',
  WHITEBOARD: 'whiteboard',
  CHAIR: 'chair',
  PC: 'pc',
  LAMP: 'lamp',
} as const;
export type FurnitureType = (typeof FurnitureType)[keyof typeof FurnitureType];

export const EditTool = {
  TILE_PAINT: 'tile_paint',
  WALL_PAINT: 'wall_paint',
  FURNITURE_PLACE: 'furniture_place',
  FURNITURE_PICK: 'furniture_pick',
  SELECT: 'select',
  EYEDROPPER: 'eyedropper',
  ERASE: 'erase',
  /** Stamp a ready-made room (room-templates.json) with its top-left at the cursor */
  ROOM_STAMP: 'room_stamp',
} as const;
export type EditTool = (typeof EditTool)[keyof typeof EditTool];

export interface FurnitureCatalogEntry {
  type: string; // FurnitureType enum or asset ID
  label: string;
  footprintW: number;
  footprintH: number;
  sprite: SpriteData;
  isDesk: boolean;
  category?: string;
  /** Orientation from rotation group: 'front' | 'back' | 'left' | 'right' */
  orientation?: string;
  /** Whether this item can be placed on top of desk/table surfaces */
  canPlaceOnSurfaces?: boolean;
  /** Number of tile rows from the top of the footprint that are "background" (allow placement, still block walking). Default 0. */
  backgroundTiles?: number;
  /** Achievement id that unlocks this piece; absent = always available */
  unlock?: string;
  /** Whether this item can be placed on wall tiles */
  canPlaceOnWalls?: boolean;
  /** Animation: every frame including frame 0 (=== sprite); absent = static */
  frames?: SpriteData[];
  /** Milliseconds per animation frame (default FURNITURE_FRAME_MS) */
  frameMs?: number;
  /** Idle agents go and use ('use') or look at ('look') this piece */
  interact?: FurnitureInteract;
}

export interface PlacedFurniture {
  uid: string;
  type: string; // FurnitureType enum or asset ID
  col: number;
  row: number;
  /** Optional color override for furniture */
  color?: FloorColor;
}

export interface OfficeLayout {
  version: 1;
  cols: number;
  rows: number;
  tiles: TileType[];
  furniture: PlacedFurniture[];
  /** Per-tile color settings, parallel to tiles array. null = wall/no color */
  tileColors?: Array<FloorColor | null>;
}

export interface Character {
  id: number;
  state: CharacterState;
  dir: Direction;
  /** Pixel position */
  x: number;
  y: number;
  /** Current tile column */
  tileCol: number;
  /** Current tile row */
  tileRow: number;
  /** Remaining path steps (tile coords) */
  path: Array<{ col: number; row: number }>;
  /** 0-1 lerp between current tile and next tile */
  moveProgress: number;
  /** Current tool name for typing vs reading animation, or null */
  currentTool: string | null;
  /** Palette index (0-5) */
  palette: number;
  /** Hue shift in degrees (0 = no shift, ≥45 for repeated palettes) */
  hueShift: number;
  /** Animation frame index */
  frame: number;
  /** Time accumulator for animation */
  frameTimer: number;
  /** Timer for idle wander decisions */
  wanderTimer: number;
  /** Number of wander moves completed in current roaming cycle */
  wanderCount: number;
  /** Max wander moves before returning to seat for rest */
  wanderLimit: number;
  /** Whether the agent is actively working */
  isActive: boolean;
  /** Assigned seat uid, or null if no seat */
  seatId: string | null;
  /** Active speech bubble kind, or null if none showing */
  bubbleType: BubbleKind | null;
  /**
   * Seconds the current bubble has been up, counting up. Drives the escalation
   * of a 'blocked' bubble — the older the block, the louder it reads.
   */
  bubbleAgeSec: number;
  /**
   * Fade-out countdown in seconds. 0 = not fading; > 0 means the bubble is
   * being dismissed and clears when it reaches 0.
   */
  bubbleFadeSec: number;
  /** Timer to stay seated while inactive after seat reassignment (counts down to 0) */
  seatTimer: number;
  /** Whether this character represents a sub-agent (spawned by Task tool) */
  isSubagent: boolean;
  /** Parent agent ID if this is a sub-agent, null otherwise */
  parentAgentId: number | null;
  /** Active matrix spawn/despawn effect, or null */
  matrixEffect: 'spawn' | 'despawn' | null;
  /** Timer counting up from 0 to MATRIX_EFFECT_DURATION */
  matrixEffectTimer: number;
  /** Per-column random seeds (16 values) for staggered rain timing */
  matrixEffectSeeds: number[];
  /** Workspace folder name (only set for multi-root workspaces) */
  folderName?: string;
  /**
   * Display name, auto-derived by the host from the agent's first prompt and
   * persisted per session in agent-seats.json. Undefined until the host sends
   * one — callers fall back to `Agent <id>`.
   */
  name?: string;
  /** Role skin id (e.g. 'qa'); undefined = base look */
  role?: string;
  /**
   * Reserved furniture interaction spot: set while walking to it and while in
   * USE. The reservation lives in OfficeState; null = none.
   */
  interaction: {
    uid: string;
    col: number;
    row: number;
    /** Direction to face the piece from the spot */
    dir: Direction;
    kind: FurnitureInteract;
  } | null;
  /** Seconds left in USE (counts down to 0) */
  interactTimer: number;
  /** 'look' glance clock: counts down to the next glance (>0) or the end of one (<0) */
  glanceTimer: number;
  /** Uid of the piece used last, so the next pick goes somewhere else */
  lastInteractUid: string | null;
}
