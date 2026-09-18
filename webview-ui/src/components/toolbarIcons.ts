/**
 * 12×12 pixel-art icons for the floating toolbar, as character grids:
 * '.' = transparent, 'X' = foreground, 'A' = accent. Colors are resolved at
 * render time by PixelIcon so the same grid can tint per button/state.
 */

export type IconGrid = string[];

/** Robot head with antenna — the campus assistant. */
export const ICON_ASSISTANT: IconGrid = [
  '.....A......',
  '.....X......',
  '..XXXXXXXX..',
  '.XXXXXXXXXX.',
  '.XXAAXXAAXX.',
  '.XXAAXXAAXX.',
  '.XXXXXXXXXX.',
  '.XXXXXXXXXX.',
  '.XXAAAAAAXX.',
  '.XXXXXXXXXX.',
  '..XXXXXXXX..',
  '...X....X...',
];

/** House with a plus — register a new workspace/office. */
export const ICON_WORKSPACE: IconGrid = [
  '....X....A..',
  '...XXX..AAA.',
  '..XXXXX..A..',
  '.XXXXXXX....',
  'XXXXXXXXX...',
  '.XXXXXXX....',
  '.XXXXXXX....',
  '.XXXAAXX....',
  '.XXXAAXX....',
  '.XXXAAXX....',
  '.XXXAAXX....',
  '............',
];

/** Kanban board — columns of cards. */
export const ICON_BOARD: IconGrid = [
  'XXXXXXXXXXXX',
  'X..........X',
  'X.AA.AA.AA.X',
  'X.AA.AA.AA.X',
  'X..........X',
  'X.AA.AA....X',
  'X.AA.AA....X',
  'X..........X',
  'X.AA.......X',
  'X.AA.......X',
  'X..........X',
  'XXXXXXXXXXXX',
];

/** Couch — edit the office layout (furniture, floors, walls). */
export const ICON_LAYOUT: IconGrid = [
  '............',
  '.XX......XX.',
  '.XXXXXXXXXX.',
  '.XXXXXXXXXX.',
  '.XXAAAAAAXX.',
  '.XXAAAAAAXX.',
  '.XXXXXXXXXX.',
  '.XXXXXXXXXX.',
  '..X......X..',
  '..X......X..',
  '............',
  '............',
];

/** Gear — settings. */
export const ICON_SETTINGS: IconGrid = [
  '.....XX.....',
  '..XX.XX.XX..',
  '..XXXXXXXX..',
  '...XXXXXX...',
  '.XXXX..XXXX.',
  '.XXX....XXX.',
  '.XXX....XXX.',
  '.XXXX..XXXX.',
  '...XXXXXX...',
  '..XXXXXXXX..',
  '..XX.XX.XX..',
  '.....XX.....',
];

/** Padlock — a reward piece whose achievement is still locked. */
export const ICON_LOCK: IconGrid = [
  '............',
  '....XXXX....',
  '...XX..XX...',
  '...XX..XX...',
  '...XX..XX...',
  '..XXXXXXXX..',
  '..XXAAAAXX..',
  '..XXAAAAXX..',
  '..XXAAAAXX..',
  '..XXXXXXXX..',
  '............',
  '............',
];
