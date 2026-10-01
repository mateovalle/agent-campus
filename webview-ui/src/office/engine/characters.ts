import {
  INTERACT_CHANCE,
  INTERACT_GLANCE_INTERVAL_MAX_SEC,
  INTERACT_GLANCE_INTERVAL_MIN_SEC,
  INTERACT_GLANCE_SEC,
  INTERACT_MAX_SEC,
  INTERACT_MIN_SEC,
  INTERACT_STAND_USE_BELT_ROWS,
  INTERACT_STAND_USE_LEG_ROWS_DOWN,
  INTERACT_STAND_USE_LEG_ROWS_SIDE,
  INTERACT_STAND_USE_LEG_ROWS_UP,
  SEAT_REST_MAX_SEC,
  SEAT_REST_MIN_SEC,
  TYPE_FRAME_DURATION_SEC,
  WALK_FRAME_DURATION_SEC,
  WALK_SPEED_PX_PER_SEC,
  WANDER_MOVES_BEFORE_REST_MAX,
  WANDER_MOVES_BEFORE_REST_MIN,
  WANDER_PAUSE_MAX_SEC,
  WANDER_PAUSE_MIN_SEC,
} from '../../constants.js';
import { findPath } from '../layout/tileMap.js';
import type { CharacterSprites } from '../sprites/spriteData.js';
import type { Character, Seat, SpriteData, TileType as TileTypeVal } from '../types.js';
import { CharacterState, Direction, TILE_SIZE } from '../types.js';

/** Tools that show reading animation instead of typing */
const READING_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']);

export function isReadingTool(tool: string | null): boolean {
  if (!tool) return false;
  return READING_TOOLS.has(tool);
}

/**
 * Furniture-interaction reservations, owned by OfficeState. `claim` reserves a
 * free spot and sets `ch.interaction` (false when none is free); `release`
 * frees it and clears `ch.interaction`; `isReserved` says whether a tile is a
 * spot someone holds (random wanderers stay off those).
 */
export interface InteractionHooks {
  claim(ch: Character): boolean;
  release(ch: Character): void;
  isReserved(col: number, row: number): boolean;
}

function dropInteraction(ch: Character, hooks: InteractionHooks | undefined): void {
  if (!ch.interaction) return;
  if (hooks) hooks.release(ch);
  else ch.interaction = null;
}

/** Stand at the reserved spot, face the piece and start using it. */
function beginUse(ch: Character): void {
  if (!ch.interaction) return;
  ch.state = CharacterState.USE;
  ch.dir = ch.interaction.dir;
  ch.interactTimer = randomRange(INTERACT_MIN_SEC, INTERACT_MAX_SEC);
  ch.glanceTimer = randomRange(INTERACT_GLANCE_INTERVAL_MIN_SEC, INTERACT_GLANCE_INTERVAL_MAX_SEC);
  ch.frame = 0;
  ch.frameTimer = 0;
}

/** A direction perpendicular to `dir`, for a brief glance away from a piece. */
function glanceAway(dir: Direction): Direction {
  if (dir === Direction.LEFT || dir === Direction.RIGHT) return Direction.DOWN;
  return Math.random() < 0.5 ? Direction.LEFT : Direction.RIGHT;
}

/** Became active: walk to the seat, or sit/type in place when there is no path. */
function startWorking(
  ch: Character,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): void {
  if (!ch.seatId) {
    // No seat assigned — type in place
    ch.state = CharacterState.TYPE;
    ch.frame = 0;
    ch.frameTimer = 0;
    return;
  }
  const seat = seats.get(ch.seatId);
  if (!seat) return;
  const path = findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, tileMap, blockedTiles);
  if (path.length > 0) {
    ch.path = path;
    ch.moveProgress = 0;
    ch.state = CharacterState.WALK;
    ch.frame = 0;
    ch.frameTimer = 0;
  } else {
    // Already at seat or no path — sit down
    ch.state = CharacterState.TYPE;
    ch.dir = seat.facingDir;
    ch.frame = 0;
    ch.frameTimer = 0;
  }
}

/** Pixel center of a tile */
function tileCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** Direction from one tile to an adjacent tile */
function directionBetween(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): Direction {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  if (dc > 0) return Direction.RIGHT;
  if (dc < 0) return Direction.LEFT;
  if (dr > 0) return Direction.DOWN;
  return Direction.UP;
}

export function createCharacter(
  id: number,
  palette: number,
  seatId: string | null,
  seat: Seat | null,
  hueShift = 0,
): Character {
  const col = seat ? seat.seatCol : 1;
  const row = seat ? seat.seatRow : 1;
  const center = tileCenter(col, row);
  return {
    id,
    state: CharacterState.TYPE,
    dir: seat ? seat.facingDir : Direction.DOWN,
    x: center.x,
    y: center.y,
    tileCol: col,
    tileRow: row,
    path: [],
    moveProgress: 0,
    currentTool: null,
    palette,
    hueShift,
    frame: 0,
    frameTimer: 0,
    wanderTimer: 0,
    wanderCount: 0,
    wanderLimit: randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX),
    isActive: true,
    seatId,
    bubbleType: null,
    bubbleAgeSec: 0,
    bubbleFadeSec: 0,
    seatTimer: 0,
    isSubagent: false,
    parentAgentId: null,
    matrixEffect: null,
    matrixEffectTimer: 0,
    matrixEffectSeeds: [],
    interaction: null,
    interactTimer: 0,
    glanceTimer: 0,
    lastInteractUid: null,
  };
}

export function updateCharacter(
  ch: Character,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
  interactions?: InteractionHooks,
): void {
  ch.frameTimer += dt;

  // Work always wins: an active agent drops whatever piece it was heading to or using.
  if (ch.isActive && ch.interaction) dropInteraction(ch, interactions);

  switch (ch.state) {
    case CharacterState.TYPE: {
      if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
        ch.frameTimer -= TYPE_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 2;
      }
      // If no longer active, stand up and start wandering (after seatTimer expires)
      if (!ch.isActive) {
        if (ch.seatTimer > 0) {
          ch.seatTimer -= dt;
          break;
        }
        ch.seatTimer = 0; // clear sentinel
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
        ch.wanderCount = 0;
        ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX);
      }
      break;
    }

    case CharacterState.IDLE: {
      // No idle animation — static pose
      ch.frame = 0;
      if (ch.seatTimer < 0) ch.seatTimer = 0; // clear turn-end sentinel
      // If became active, pathfind to seat
      if (ch.isActive) {
        startWorking(ch, seats, tileMap, blockedTiles);
        break;
      }
      // Countdown wander timer
      ch.wanderTimer -= dt;
      if (ch.wanderTimer <= 0) {
        // Check if we've wandered enough — return to seat for a rest
        if (ch.wanderCount >= ch.wanderLimit && ch.seatId) {
          const seat = seats.get(ch.seatId);
          if (seat) {
            const path = findPath(
              ch.tileCol,
              ch.tileRow,
              seat.seatCol,
              seat.seatRow,
              tileMap,
              blockedTiles,
            );
            if (path.length > 0) {
              ch.path = path;
              ch.moveProgress = 0;
              ch.state = CharacterState.WALK;
              ch.frame = 0;
              ch.frameTimer = 0;
              break;
            }
          }
        }
        // Sometimes head for a piece of furniture instead of a random tile
        if (interactions && Math.random() < INTERACT_CHANCE && interactions.claim(ch)) {
          const spot = ch.interaction!;
          if (ch.tileCol === spot.col && ch.tileRow === spot.row) {
            ch.wanderCount++;
            beginUse(ch);
            break;
          }
          const path = findPath(ch.tileCol, ch.tileRow, spot.col, spot.row, tileMap, blockedTiles);
          if (path.length > 0) {
            ch.path = path;
            ch.moveProgress = 0;
            ch.state = CharacterState.WALK;
            ch.frame = 0;
            ch.frameTimer = 0;
            ch.wanderCount++;
            ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
            break;
          }
          dropInteraction(ch, interactions); // unreachable — wander as usual
        }
        if (walkableTiles.length > 0) {
          let target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
          // Don't stop on a spot someone is using or heading to: one retry,
          // then stay put this round rather than stack on them
          if (interactions?.isReserved(target.col, target.row)) {
            target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
          }
          const reserved = interactions?.isReserved(target.col, target.row) ?? false;
          const path = reserved
            ? []
            : findPath(ch.tileCol, ch.tileRow, target.col, target.row, tileMap, blockedTiles);
          if (path.length > 0) {
            ch.path = path;
            ch.moveProgress = 0;
            ch.state = CharacterState.WALK;
            ch.frame = 0;
            ch.frameTimer = 0;
            ch.wanderCount++;
          }
        }
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
      }
      break;
    }

    case CharacterState.WALK: {
      // Walk animation
      if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
        ch.frameTimer -= WALK_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 4;
      }

      if (ch.path.length === 0) {
        // Path complete — snap to tile center and transition
        const center = tileCenter(ch.tileCol, ch.tileRow);
        ch.x = center.x;
        ch.y = center.y;

        if (ch.isActive) {
          if (!ch.seatId) {
            // No seat — type in place
            ch.state = CharacterState.TYPE;
          } else {
            const seat = seats.get(ch.seatId);
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE;
              ch.dir = seat.facingDir;
            } else {
              ch.state = CharacterState.IDLE;
            }
          }
        } else {
          // Check if arrived at assigned seat — sit down for a rest before wandering again
          if (ch.seatId) {
            const seat = seats.get(ch.seatId);
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE;
              ch.dir = seat.facingDir;
              // seatTimer < 0 is a sentinel from setAgentActive(false) meaning
              // "turn just ended" — skip the long rest so idle transition is immediate
              if (ch.seatTimer < 0) {
                ch.seatTimer = 0;
              } else {
                ch.seatTimer = randomRange(SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC);
              }
              ch.wanderCount = 0;
              ch.wanderLimit = randomInt(
                WANDER_MOVES_BEFORE_REST_MIN,
                WANDER_MOVES_BEFORE_REST_MAX,
              );
              ch.frame = 0;
              ch.frameTimer = 0;
              break;
            }
          }
          // Arrived at a reserved furniture spot — face the piece and use it
          if (ch.interaction) {
            if (ch.tileCol === ch.interaction.col && ch.tileRow === ch.interaction.row) {
              beginUse(ch);
              break;
            }
            dropInteraction(ch, interactions); // path was cut short
          }
          ch.state = CharacterState.IDLE;
          ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
        }
        ch.frame = 0;
        ch.frameTimer = 0;
        break;
      }

      // Move toward next tile in path
      const nextTile = ch.path[0];
      ch.dir = directionBetween(ch.tileCol, ch.tileRow, nextTile.col, nextTile.row);

      ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt;

      const fromCenter = tileCenter(ch.tileCol, ch.tileRow);
      const toCenter = tileCenter(nextTile.col, nextTile.row);
      const t = Math.min(ch.moveProgress, 1);
      ch.x = fromCenter.x + (toCenter.x - fromCenter.x) * t;
      ch.y = fromCenter.y + (toCenter.y - fromCenter.y) * t;

      if (ch.moveProgress >= 1) {
        // Arrived at next tile
        ch.tileCol = nextTile.col;
        ch.tileRow = nextTile.row;
        ch.x = toCenter.x;
        ch.y = toCenter.y;
        ch.path.shift();
        ch.moveProgress = 0;
      }

      // If became active while wandering, repath to seat
      if (ch.isActive && ch.seatId) {
        const seat = seats.get(ch.seatId);
        if (seat) {
          const lastStep = ch.path[ch.path.length - 1];
          if (!lastStep || lastStep.col !== seat.seatCol || lastStep.row !== seat.seatRow) {
            const newPath = findPath(
              ch.tileCol,
              ch.tileRow,
              seat.seatCol,
              seat.seatRow,
              tileMap,
              blockedTiles,
            );
            if (newPath.length > 0) {
              ch.path = newPath;
              ch.moveProgress = 0;
            }
          }
        }
      }
      break;
    }

    case CharacterState.USE: {
      const spot = ch.interaction;
      if (ch.isActive || !spot) {
        // Interrupted (became active, or the reservation was revoked)
        dropInteraction(ch, interactions);
        if (ch.isActive) {
          startWorking(ch, seats, tileMap, blockedTiles);
        } else {
          ch.state = CharacterState.IDLE;
          ch.frame = 0;
          ch.frameTimer = 0;
          ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
        }
        break;
      }
      if (spot.kind === 'use') {
        // Hands busy: typing frames, standing
        if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
          ch.frameTimer -= TYPE_FRAME_DURATION_SEC;
          ch.frame = (ch.frame + 1) % 2;
        }
      } else {
        // Looking: standing pose, the odd glance away and back
        ch.frame = 0;
        if (ch.glanceTimer > 0) {
          ch.glanceTimer -= dt;
          if (ch.glanceTimer <= 0) {
            ch.dir = glanceAway(spot.dir);
            ch.glanceTimer = -INTERACT_GLANCE_SEC;
          }
        } else {
          ch.glanceTimer += dt;
          if (ch.glanceTimer >= 0) {
            ch.dir = spot.dir;
            ch.glanceTimer = randomRange(
              INTERACT_GLANCE_INTERVAL_MIN_SEC,
              INTERACT_GLANCE_INTERVAL_MAX_SEC,
            );
          }
        }
      }
      ch.interactTimer -= dt;
      if (ch.interactTimer <= 0) {
        ch.lastInteractUid = spot.uid;
        ch.dir = spot.dir;
        dropInteraction(ch, interactions);
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
        ch.interactTimer = 0;
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
      }
      break;
    }
  }
}

/** Get the correct sprite frame for a character's current state and direction */
export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  switch (ch.state) {
    case CharacterState.TYPE:
      if (isReadingTool(ch.currentTool)) {
        return sprites.reading[ch.dir][ch.frame % 2];
      }
      return sprites.typing[ch.dir][ch.frame % 2];
    case CharacterState.WALK:
      return sprites.walk[ch.dir][ch.frame % 4];
    case CharacterState.IDLE:
      return sprites.walk[ch.dir][1];
    case CharacterState.USE:
      // Standing at a piece: hands busy ('use') or just looking ('look').
      // Never the raw typing frames — those are a SEATED pose (bent legs,
      // shorter torso) that only reads right with the sitting offset on a chair.
      if (ch.interaction?.kind === 'use') {
        return standUseFrames(sprites)[ch.dir][ch.frame % 2];
      }
      return sprites.walk[ch.dir][1];
    default:
      return sprites.walk[ch.dir][1];
  }
}

// ── Standing "use" frames ───────────────────────────────────

type FramePair = [SpriteData, SpriteData];

/** Per-sheet cache, so each composed frame is a stable object for the sprite cache. */
const standUseCache = new WeakMap<CharacterSprites, Record<Direction, FramePair>>();

function firstOpaqueRow(s: SpriteData): number {
  for (let r = 0; r < s.length; r++) if (s[r].some((px) => px !== '')) return r;
  return -1;
}

function lastOpaqueRow(s: SpriteData): number {
  for (let r = s.length - 1; r >= 0; r--) if (s[r].some((px) => px !== '')) return r;
  return -1;
}

/**
 * Upper body of a seated typing frame (head + arms reaching forward) over the
 * legs of the standing frame. The typing frame is shifted up so its head lines
 * up with the standing head; below the cut every row is the standing frame's.
 */
function composeStandUse(stand: SpriteData, typing: SpriteData, legRows: number): SpriteData {
  const top = firstOpaqueRow(stand);
  const bottom = lastOpaqueRow(stand);
  const typingTop = firstOpaqueRow(typing);
  if (top < 0 || typingTop < 0) return stand;
  const shift = typingTop - top;
  const cut = bottom - legRows;
  const belt = stand[bottom - INTERACT_STAND_USE_BELT_ROWS] ?? [];
  const beltL = belt.findIndex((px) => px !== '');
  const beltR = belt.length - 1 - [...belt].reverse().findIndex((px) => px !== '');
  return stand.map((row, r) => {
    if (r >= cut) {
      // Between the cut and the belt: only the body, not the hands at the sides
      if (r >= bottom - INTERACT_STAND_USE_BELT_ROWS || beltL < 0) return row;
      return row.map((px, c) => (c >= beltL && c <= beltR ? px : ''));
    }
    const src = typing[r + shift];
    return src ? [...src] : row.map(() => '');
  });
}

function standUseFrames(sprites: CharacterSprites): Record<Direction, FramePair> {
  const cached = standUseCache.get(sprites);
  if (cached) return cached;
  const legRows: Record<Direction, number> = {
    [Direction.DOWN]: INTERACT_STAND_USE_LEG_ROWS_DOWN,
    [Direction.UP]: INTERACT_STAND_USE_LEG_ROWS_UP,
    [Direction.RIGHT]: INTERACT_STAND_USE_LEG_ROWS_SIDE,
    [Direction.LEFT]: INTERACT_STAND_USE_LEG_ROWS_SIDE,
  };
  const out = {} as Record<Direction, FramePair>;
  for (const dir of [Direction.DOWN, Direction.UP, Direction.RIGHT, Direction.LEFT]) {
    const stand = sprites.walk[dir][1];
    out[dir] = [
      composeStandUse(stand, sprites.typing[dir][0], legRows[dir]),
      composeStandUse(stand, sprites.typing[dir][1], legRows[dir]),
    ];
  }
  standUseCache.set(sprites, out);
  return out;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
