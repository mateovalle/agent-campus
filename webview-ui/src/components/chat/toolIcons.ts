/**
 * 12×12 pixel-art icons for chat tool cards, as character grids:
 * '.' = transparent, 'X' = foreground, 'A' = accent — same format as
 * toolbarIcons.ts, rendered by PixelIcon with the tool's category color.
 */

import type { IconGrid } from '../toolbarIcons.js';

/** Document with folded corner + text lines — Read. */
export const ICON_TOOL_READ: IconGrid = [
  '..XXXXXXX...',
  '..X.....XX..',
  '..X.....XXX.',
  '..X.......X.',
  '..X.AAAAA.X.',
  '..X.......X.',
  '..X.AAAA..X.',
  '..X.......X.',
  '..X.AAAAA.X.',
  '..X.......X.',
  '..X.......X.',
  '..XXXXXXXXX.',
];

/** Pencil over a line — Edit. */
export const ICON_TOOL_EDIT: IconGrid = [
  '........AA..',
  '.......AAAA.',
  '......XXXAA.',
  '.....XXXXX..',
  '....XXXXX...',
  '...XXXXX....',
  '..XXXXX.....',
  '.XXXXX......',
  '.XXXX.......',
  '.XX.........',
  '............',
  'XXXXXXXXXXXX',
];

/** Document with a plus — Write (new file). */
export const ICON_TOOL_WRITE: IconGrid = [
  '..XXXXXXX...',
  '..X.....XX..',
  '..X.....XXX.',
  '..X.......X.',
  '..X.......X.',
  '..X...AA..X.',
  '..X...AA..X.',
  '..X.AAAAAA.X',
  '..X.AAAAAA.X',
  '..X...AA..X.',
  '..X...AA..X.',
  '..XXXXXXXXX.',
];

/** Terminal window with prompt — Bash. */
export const ICON_TOOL_BASH: IconGrid = [
  'XXXXXXXXXXXX',
  'X..........X',
  'X.A........X',
  'X.AA.......X',
  'X.AAA......X',
  'X.AA.......X',
  'X.A........X',
  'X..........X',
  'X....AAAAA.X',
  'X..........X',
  'X..........X',
  'XXXXXXXXXXXX',
];

/** Magnifying glass — Grep/Glob. */
export const ICON_TOOL_SEARCH: IconGrid = [
  '..XXXX......',
  '.XX..XX.....',
  'XX....XX....',
  'X......X....',
  'X......X....',
  'XX....XX....',
  '.XX..XX.....',
  '..XXXXA.....',
  '......AA....',
  '.......AA...',
  '........AA..',
  '.........A..',
];

/** Globe — WebFetch/WebSearch. */
export const ICON_TOOL_WEB: IconGrid = [
  '...XXXXXX...',
  '..XX.A..XX..',
  '.X...A....X.',
  'XA...A...AX.',
  'XAAAAAAAAAX.',
  'X....A.....X',
  'X....A.....X',
  'XAAAAAAAAAX.',
  'XA...A...AX.',
  '.X...A....X.',
  '..XX.A..XX..',
  '...XXXXXX...',
];

/** Small robot head — Task (sub-agent). */
export const ICON_TOOL_TASK: IconGrid = [
  '.....A......',
  '.....X......',
  '..XXXXXXXX..',
  '.XXXXXXXXXX.',
  '.XXAAXXAAXX.',
  '.XXAAXXAAXX.',
  '.XXXXXXXXXX.',
  '.XXAAAAAAXX.',
  '.XXXXXXXXXX.',
  '..XXXXXXXX..',
  '...X....X...',
  '............',
];

/** Checklist — TodoWrite. */
export const ICON_TOOL_TODO: IconGrid = [
  'XXXXXXXXXXXX',
  'X..........X',
  'X.AA.XXXXX.X',
  'X.AA.......X',
  'X..........X',
  'X.AA.XXXX..X',
  'X.AA.......X',
  'X..........X',
  'X.XX.XXXXX.X',
  'X.XX.......X',
  'X..........X',
  'XXXXXXXXXXXX',
];

/** Map/plan with a route — ExitPlanMode / plan. */
export const ICON_TOOL_PLAN: IconGrid = [
  'XXXXXXXXXXXX',
  'X..........X',
  'X.AA.......X',
  'X..AA......X',
  'X...AA.....X',
  'X....AAA...X',
  'X......AA..X',
  'X....AAA...X',
  'X...AA.....X',
  'X...AA.....X',
  'X..........X',
  'XXXXXXXXXXXX',
];

/** Plug — MCP tools. */
export const ICON_TOOL_MCP: IconGrid = [
  '...X..X.....',
  '...X..X.....',
  '..XXXXXX....',
  '..XXXXXX....',
  '..XXXXXX....',
  '...XXXX.....',
  '....XX......',
  '....AA......',
  '....AA......',
  '.....AA.....',
  '......AA....',
  '.......A....',
];

/** Gear/cog — generic/unknown tool. */
export const ICON_TOOL_GENERIC: IconGrid = [
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
