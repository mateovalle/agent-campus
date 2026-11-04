// Host-agnostic constants shared by the VS Code extension host and the
// Electron main process. VS Code-specific identifiers stay in src/constants.ts.

// ── Timing (ms) ──────────────────────────────────────────────
export const JSONL_POLL_INTERVAL_MS = 1000;
/**
 * How long to wait for an agent's transcript to appear before giving up and
 * saying so. Generous: the file lands in a second or two normally, and a cold
 * worktree with a setup command can push a launch out.
 */
export const JSONL_POLL_TIMEOUT_MS = 30_000;
export const FILE_WATCHER_POLL_INTERVAL_MS = 1000;
export const PROJECT_SCAN_INTERVAL_MS = 1000;
export const TOOL_DONE_DELAY_MS = 300;
export const PERMISSION_TIMER_DELAY_MS = 7000;
export const TEXT_IDLE_DELAY_MS = 5000;

// ── Child processes on the main process ─────────────────────
/**
 * Deadlines for the synchronous commands the host shells out to.
 *
 * Every one of them runs `execFileSync` on the process that owns every PTY,
 * every chat session, the scheduler tick and the campus socket — and a
 * synchronous child blocks the EVENT LOOP, so a command that never returns
 * takes the whole app with it and no timer can rescue it. A locked git index,
 * a repo on a network mount, an antivirus holding a handle: none of them are
 * exotic.
 */
export const GIT_COMMAND_TIMEOUT_MS = 10_000;
/** `which` / `where` — a PATH lookup is either instant or broken. */
export const COMMAND_LOOKUP_TIMEOUT_MS = 2_000;
/** A login shell runs the user's whole profile, which can be slow on purpose. */
export const LOGIN_SHELL_TIMEOUT_MS = 5_000;
/**
 * How much of an untracked file to read just to count its lines. Past this it
 * is not something anyone reviews line by line, and reading it would stall
 * the main process for no one's benefit.
 */
export const UNTRACKED_COUNT_MAX_BYTES = 1024 * 1024;
/**
 * Deadline for git commands that WRITE. These run asynchronously — a commit
 * can trigger a repo's own pre-commit hooks and a push is a network call, and
 * neither belongs on the event loop at any length — so this is about not
 * leaving a button spinning forever rather than about not freezing the app.
 */
export const GIT_WRITE_TIMEOUT_MS = 120_000;

// ── Action Suggestions ───────────────────────────────────────
// Tool errors in a turn before "Investigate" is suggested.
export const SUGGESTION_ERROR_THRESHOLD = 3;
export const MAX_ACTION_SUGGESTIONS = 3;

// ── Dispatch dials ──────────────────────────────────────────
/**
 * Effort levels the CLI accepts, in order. Chosen when an agent is SENT OUT,
 * not while it runs: the SDK takes `effort` as a session option and offers no
 * live setter the way it does for the model, so a picker in a running
 * session's settings would be lying about when it takes hold.
 */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

// ── File mentions ───────────────────────────────────────────
/**
 * How long a workspace's file listing is reused before it is re-read. Short,
 * because agents create files while you are typing about them, and cheap,
 * because re-reading is one `git ls-files`.
 */
export const FILE_INDEX_TTL_MS = 10_000;
/**
 * Most paths kept for one workspace. A monorepo has far more than anyone will
 * ever @-mention, and the list is held in memory and ranked on every
 * keystroke.
 */
export const FILE_INDEX_MAX_FILES = 20_000;
/** Most suggestions offered at once — the popup is a shortlist, not a tree. */
export const FILE_MENTION_LIMIT = 12;
/**
 * Directories the non-git walk never descends into. Only relevant outside a
 * repository, where there is no .gitignore to be right about.
 */
export const FILE_INDEX_WALK_SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  'venv',
  '__pycache__',
]);

// ── Layout validation ───────────────────────────────────────
/**
 * The largest grid a layout may claim, matching the editor's own MAX_COLS /
 * MAX_ROWS (webview constants — the editor refuses to expand past it). A file
 * claiming more was not produced by this app and cannot be edited once
 * loaded, so it is rejected at the door rather than half-rendered.
 */
export const LAYOUT_MAX_DIMENSION = 64;
/**
 * Highest tile value a layout may carry. The space is open-ended by design
 * (floor pattern p is p up to 7 and p+1 from 8 on; wall style s >= 1 is
 * 100 + s), so this is a sanity bound against garbage, not a catalogue.
 */
export const LAYOUT_MAX_TILE_VALUE = 200;

// ── Display Truncation ──────────────────────────────────────
export const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;
export const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;

// ── PNG / Asset Parsing ─────────────────────────────────────
export const PNG_ALPHA_THRESHOLD = 128;
export const WALL_PIECE_WIDTH = 16;
export const WALL_PIECE_HEIGHT = 32;
export const WALL_GRID_COLS = 4;
export const WALL_BITMASK_COUNT = 16;
export const FLOOR_TILE_SIZE = 16;
export const CHARACTER_DIRECTIONS = ['down', 'up', 'right'] as const;
export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 32;
export const CHAR_FRAMES_PER_ROW = 7;
export const CHAR_COUNT = 6;

// Role skins bundled in assets/characters/roles/char_role_<id>.png
// (generated by scripts/export-role-characters.ts)
export const ROLE_SKIN_DEFS = [
  { id: 'ceo', name: 'CEO' },
  { id: 'eng-manager', name: 'Eng Manager' },
  { id: 'qa', name: 'QA Lead' },
  { id: 'security', name: 'Security Officer' },
  { id: 'designer', name: 'Designer' },
  { id: 'release', name: 'Release Engineer' },
  { id: 'debugger', name: 'Debugger' },
  { id: 'writer', name: 'Tech Writer' },
  { id: 'marketing', name: 'Marketing' },
] as const;

// ── User-Level Layout Persistence ─────────────────────────────
/**
 * All user data lives here (~/.pixel-agents/): workspaces, layouts, todos,
 * usage, achievements, schedules, settings, seats. Named for the app's old
 * name — moving it would strand everyone's offices, so it stays.
 */
export const DATA_DIR_NAME = '.pixel-agents';

// ── Update checks ───────────────────────────────────────────
/**
 * The repository whose releases the app compares itself against.
 *
 * Hard-coded rather than read from package.json: inside an asar that read is
 * indirection for a string that only changes if the project moves, and a
 * wrong value here is a silent no-op rather than a crash — exactly the kind
 * of thing that is better stated once, in the open.
 */
export const UPDATE_CHECK_REPO = 'mateovalle/agent-campus';
/** A check nobody asked for must never hang around; the UI just stays quiet. */
export const UPDATE_CHECK_TIMEOUT_MS = 10_000;
/**
 * Between automatic checks. Releases happen on the order of weeks, GitHub's
 * unauthenticated API allows 60 requests an hour, and an app left open for a
 * month should still notice.
 */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/**
 * After launch, before the first check. Startup is already loading sprites,
 * probing auth and restoring agents; an update is the least urgent thing the
 * app does and should not compete with any of it.
 */
export const UPDATE_CHECK_START_DELAY_MS = 20_000;

// ── Phone view ──────────────────────────────────────────────
/**
 * Port the read-only phone view listens on when it is switched on.
 *
 * Fixed rather than ephemeral: the whole point is a URL you can bookmark on
 * a phone, and one that moves every launch is not one.
 */
export const PHONE_VIEW_PORT = 4517;
/**
 * How often the page re-asks. Five seconds is well under the two minutes a
 * block waits before it is worth a notification, and the payload is three
 * short lists.
 */
export const PHONE_VIEW_POLL_MS = 5_000;
