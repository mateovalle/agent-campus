import type { FloorColor } from './office/types.js';

// ── Grid & Layout ────────────────────────────────────────────
export const TILE_SIZE = 16;
export const DEFAULT_COLS = 20;
export const DEFAULT_ROWS = 11;
export const MAX_COLS = 64;
export const MAX_ROWS = 64;

// ── Character Animation ─────────────────────────────────────
export const WALK_SPEED_PX_PER_SEC = 48;
export const WALK_FRAME_DURATION_SEC = 0.15;
export const TYPE_FRAME_DURATION_SEC = 0.3;
export const WANDER_PAUSE_MIN_SEC = 2.0;
export const WANDER_PAUSE_MAX_SEC = 20.0;
export const WANDER_MOVES_BEFORE_REST_MIN = 3;
export const WANDER_MOVES_BEFORE_REST_MAX = 6;
export const SEAT_REST_MIN_SEC = 120.0;
export const SEAT_REST_MAX_SEC = 240.0;

// ── Matrix Effect ────────────────────────────────────────────
export const MATRIX_EFFECT_DURATION_SEC = 0.3;
export const MATRIX_TRAIL_LENGTH = 6;
export const MATRIX_SPRITE_COLS = 16;
export const MATRIX_SPRITE_ROWS = 24;
export const MATRIX_FLICKER_FPS = 30;
export const MATRIX_FLICKER_VISIBILITY_THRESHOLD = 180;
export const MATRIX_COLUMN_STAGGER_RANGE = 0.3;
export const MATRIX_HEAD_COLOR = '#ccffcc';
export const MATRIX_TRAIL_OVERLAY_ALPHA = 0.6;
export const MATRIX_TRAIL_EMPTY_ALPHA = 0.5;
export const MATRIX_TRAIL_MID_THRESHOLD = 0.33;
export const MATRIX_TRAIL_DIM_THRESHOLD = 0.66;

// ── Rendering ────────────────────────────────────────────────
export const CHARACTER_SITTING_OFFSET_PX = 6;
export const CHARACTER_Z_SORT_OFFSET = 0.5;
export const OUTLINE_Z_SORT_OFFSET = 0.001;
export const SELECTED_OUTLINE_ALPHA = 1.0;
export const HOVERED_OUTLINE_ALPHA = 0.5;
export const GHOST_PREVIEW_SPRITE_ALPHA = 0.5;
export const GHOST_PREVIEW_TINT_ALPHA = 0.25;
export const SELECTION_DASH_PATTERN: [number, number] = [4, 3];
export const BUTTON_MIN_RADIUS = 6;
export const BUTTON_RADIUS_ZOOM_FACTOR = 3;
export const BUTTON_ICON_SIZE_FACTOR = 0.45;
export const BUTTON_LINE_WIDTH_MIN = 1.5;
export const BUTTON_LINE_WIDTH_ZOOM_FACTOR = 0.5;
export const BUBBLE_FADE_DURATION_SEC = 0.5;
export const BUBBLE_SITTING_OFFSET_PX = 10;
export const BUBBLE_VERTICAL_OFFSET_PX = 24;
/**
 * Bubbles are a UI layer, not a world object: they never render smaller than
 * this many device pixels per sprite pixel (scaled by dpr), so a blocked agent
 * stays legible when the campus is zoomed out. Mirrors the office label plate.
 */
export const BUBBLE_MIN_SCALE = 2;
/** A blocked bubble escalates amber → orange → red at these ages. */
export const BUBBLE_AGE_WARN_SEC = 60;
export const BUBBLE_AGE_URGENT_SEC = 300;
/** Pulse frequency (Hz) of a blocked bubble at age 0 and at BUBBLE_AGE_URGENT_SEC. */
export const BUBBLE_PULSE_MIN_HZ = 0.4;
export const BUBBLE_PULSE_MAX_HZ = 1.6;
/** Trough alpha of the blocked-bubble pulse (peak is always 1). */
export const BUBBLE_PULSE_ALPHA_MIN = 0.55;
/** Gap between an office's label plate and its clustered bubble marker. */
export const CAMPUS_CLUSTER_GAP_PX = 4;
/** Edge arrow pointing at a blocked agent that is off screen (CSS px, x dpr). */
export const OFFSCREEN_MARKER_SIZE_PX = 7;
/** Arrow colour per blocked tier — matches the bubble accents. */
export const OFFSCREEN_MARKER_COLORS = ['#CCA700', '#E07A1F', '#E0483C'];
export const FALLBACK_FLOOR_COLOR = '#808080';

// ── Rendering - Overlay Colors (canvas, not CSS) ─────────────
export const SEAT_OWN_COLOR = 'rgba(0, 127, 212, 0.35)';
export const SEAT_AVAILABLE_COLOR = 'rgba(0, 200, 80, 0.35)';
export const SEAT_BUSY_COLOR = 'rgba(220, 50, 50, 0.35)';
export const GRID_LINE_COLOR = 'rgba(255,255,255,0.12)';
export const VOID_TILE_OUTLINE_COLOR = 'rgba(255,255,255,0.08)';
export const VOID_TILE_DASH_PATTERN: [number, number] = [2, 2];
export const GHOST_BORDER_HOVER_FILL = 'rgba(60, 130, 220, 0.25)';
export const GHOST_BORDER_HOVER_STROKE = 'rgba(60, 130, 220, 0.5)';
export const GHOST_BORDER_STROKE = 'rgba(255, 255, 255, 0.06)';
export const GHOST_VALID_TINT = '#00ff00';
export const GHOST_INVALID_TINT = '#ff0000';
export const SELECTION_HIGHLIGHT_COLOR = '#007fd4';
export const DELETE_BUTTON_BG = 'rgba(200, 50, 50, 0.85)';
export const ROTATE_BUTTON_BG = 'rgba(50, 120, 200, 0.85)';

// ── Camera ───────────────────────────────────────────────────
export const CAMERA_FOLLOW_LERP = 0.1;
export const CAMERA_FOLLOW_SNAP_THRESHOLD = 0.5;

// ── Zoom ─────────────────────────────────────────────────────
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 10;
export const ZOOM_DEFAULT_DPR_FACTOR = 2;
export const ZOOM_LEVEL_FADE_DELAY_MS = 1500;
export const ZOOM_LEVEL_HIDE_DELAY_MS = 2000;
export const ZOOM_LEVEL_FADE_DURATION_SEC = 0.5;
export const ZOOM_SCROLL_THRESHOLD = 50;
export const PAN_MARGIN_FRACTION = 0.25;

// ── Editor ───────────────────────────────────────────────────
export const UNDO_STACK_MAX_SIZE = 50;
export const LAYOUT_SAVE_DEBOUNCE_MS = 500;
export const DEFAULT_FLOOR_COLOR: FloorColor = { h: 35, s: 30, b: 15, c: 0 };
export const DEFAULT_WALL_COLOR: FloorColor = { h: 240, s: 25, b: 0, c: 0 };
export const DEFAULT_NEUTRAL_COLOR: FloorColor = { h: 0, s: 0, b: 0, c: 0 };

// ── Notification Sound ──────────────────────────────────────
export const NOTIFICATION_NOTE_1_HZ = 659.25; // E5
export const NOTIFICATION_NOTE_2_HZ = 1318.51; // E6 (octave up)
export const NOTIFICATION_NOTE_1_START_SEC = 0;
export const NOTIFICATION_NOTE_2_START_SEC = 0.1;
export const NOTIFICATION_NOTE_DURATION_SEC = 0.18;
export const NOTIFICATION_VOLUME = 0.14;

// ── Chat UI ──────────────────────────────────────────────────
export const CHAT_BODY_FONT_SIZE_PX = 13;
export const CHAT_CODE_FONT_SIZE_PX = 12;
export const CHAT_TOOL_SUMMARY_MAX_CHARS = 60;
export const CHAT_JSON_PREVIEW_MAX_CHARS = 2000;
export const CHAT_WRITE_PREVIEW_MAX_CHARS = 2000;
export const CHAT_RESULT_MAX_HEIGHT_PX = 180;
export const CHAT_NEAR_BOTTOM_PX = 80;
export const CHAT_COMPOSER_MAX_ROWS = 8;
export const CHAT_COMPOSER_LINE_HEIGHT_PX = 18;
export const CHAT_COST_DECIMALS = 4;
export const CHAT_DURATION_DECIMALS = 1;
export const CHAT_MS_PER_SEC = 1000;
export const CHAT_COPY_FEEDBACK_MS = 1200;
export const CHAT_DOT_STAGGER_SEC = 0.2;
export const CHAT_MODE_MENU_MIN_WIDTH_PX = 140;
export const CHAT_RESUME_MODAL_WIDTH_PX = 380;
export const CHAT_RESUME_LIST_MAX_HEIGHT_PX = 360;
export const CHAT_RESUME_PREVIEW_MAX_LINES = 2;
export const CHAT_MAX_ATTACHMENTS = 5;
export const CHAT_MAX_IMAGE_MB = 8;
export const CHAT_MAX_IMAGE_BYTES = CHAT_MAX_IMAGE_MB * 1024 * 1024;
export const CHAT_ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const CHAT_ATTACH_WARNING_MS = 4000;
export const CHAT_ATTACH_THUMB_PX = 48;
export const CHAT_DROP_OVERLAY_INSET_PX = 8;
export const CHAT_DROP_OVERLAY_BG = 'rgba(20, 20, 31, 0.8)';
export const CHAT_SESSION_ENDED_TEXT = 'Session ended';
export const CHAT_COMPOSER_PLACEHOLDER = 'Message Claude… (Enter to send, Shift+Enter for newline)';
export const CHAT_COMPOSER_ENDED_PLACEHOLDER =
  'Session ended — close this tab or start a new agent';
/** Device px per icon pixel for the 12×12 tool-card icons (12px total). */
export const CHAT_TOOL_ICON_SCALE = 1;
/**
 * Tool-category colors as hex for the canvas-drawn PixelIcons — canvas
 * fillStyle cannot resolve CSS variables. Keep in sync with the
 * --pixel-chat-* variables in index.css.
 */
export const CHAT_CATEGORY_ICON_COLORS = {
  read: '#89b4fa',
  write: '#f9e2af',
  exec: '#a6e3a1',
  web: '#89dceb',
  agent: '#cba6f7',
  mcp: '#94e2d5',
  other: '#9a9ab8',
} as const;
/** 'A' (accent) cells of tool icons — near-white for contrast on dark cards. */
export const CHAT_TOOL_ICON_ACCENT = 'rgba(255, 255, 255, 0.9)';
/** Width of the category-colored left border on tool cards. */
export const CHAT_TOOL_CARD_BORDER_PX = 4;
/** Consecutive finished read-category tool calls needed to collapse into a group. */
export const CHAT_TOOL_GROUP_MIN = 3;
/** Max diff-stat count shown on a collapsed Edit card before capping ("99+"). */
export const CHAT_EDIT_STAT_CAP = 99;
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;

// ── Campus ───────────────────────────────────────────────────
/** Gap between offices in tiles (both axes) */
export const CAMPUS_GAP_TILES = 4;
/** Number of office columns in the campus grid */
export const CAMPUS_GRID_COLS = 3;
/** Extra sprite-px padding around an office when culling (walls + label overhang) */
export const CAMPUS_CULL_PAD_PX = 48;
/** Label plate: distance above the office top edge, in sprite px */
export const CAMPUS_LABEL_OFFSET_PX = 8;
/** Label plate font size = zoom * factor, floored at min (device px) */
export const CAMPUS_LABEL_FONT_ZOOM_FACTOR = 6;
export const CAMPUS_LABEL_FONT_MIN_PX = 15;
/** Label plate padding (device px per zoom step) */
export const CAMPUS_LABEL_BORDER_PX = 2;
export const CAMPUS_LABEL_SHADOW_PX = 2;
export const CAMPUS_LABEL_BG = '#1e1e2e';
export const CAMPUS_LABEL_BORDER = '#4a4a6a';
export const CAMPUS_LABEL_SHADOW = '#0a0a14';
export const CAMPUS_LABEL_TEXT = 'rgba(255, 255, 255, 0.85)';
export const CAMPUS_LABEL_TEXT_DIM = 'rgba(255, 255, 255, 0.4)';
export const CAMPUS_LABEL_FONT_FAMILY = "'FS Pixel Sans', monospace";
/** Fraction of viewport left as margin when fitting the campus on first load */
export const CAMPUS_FIT_PAD_FRACTION = 0.05;
/** Office action popup */
export const OFFICE_POPUP_WIDTH_PX = 190;
export const OFFICE_POPUP_MARGIN_PX = 8;

// ── Usage UI ─────────────────────────────────────────────────
/** Spend at or above this renders with 1 decimal ($12.3); below → 2 ($0.00) */
export const USAGE_USD_ONE_DECIMAL_THRESHOLD = 10;
/** Spend at or above this renders with no decimals ($123) */
export const USAGE_USD_NO_DECIMAL_THRESHOLD = 100;
/** Daily spend bar chart (Settings modal) */
export const USAGE_CHART_HEIGHT_PX = 120;
export const USAGE_CHART_BAR_GAP_PX = 3;
export const USAGE_CHART_BAR_MIN_HEIGHT_PX = 2;
export const USAGE_CHART_LABEL_FONT_PX = 14;
export const USAGE_CHART_BAR_DIM_COLOR = 'rgba(255, 255, 255, 0.28)';
export const USAGE_CHART_ZERO_BAR_COLOR = 'rgba(255, 255, 255, 0.1)';
export const USAGE_CHART_LABEL_COLOR = 'rgba(255, 255, 255, 0.4)';

// ── Settings modal ───────────────────────────────────────────
/** Fixed modal width — content-driven sizing made the modal reflow when sections toggled */
export const SETTINGS_MODAL_WIDTH_PX = 340;

// ── Achievements ─────────────────────────────────────────────
/** How long an unlock toast stays visible before auto-dismissing */
export const ACHIEVEMENT_TOAST_DURATION_MS = 5000;
/** Slide-in animation duration for the unlock toast */
export const ACHIEVEMENT_TOAST_SLIDE_SEC = 0.25;
/** Amber accent border for the unlock toast */
export const ACHIEVEMENT_TOAST_BORDER_COLOR = '#f9e2af';
export const ACHIEVEMENT_TOAST_Z_INDEX = 60;
/** Max height of the achievements list in the Settings modal */
export const ACHIEVEMENT_LIST_MAX_HEIGHT_PX = 220;
/** Opacity applied to locked achievement rows */
export const ACHIEVEMENT_LOCKED_OPACITY = 0.45;
/** Placeholder shown instead of a locked achievement's description */
export const ACHIEVEMENT_LOCKED_DESCRIPTION = '???';

// ── Tasks ────────────────────────────────────────────────────
/** Right-side per-workspace tasks drawer */
export const TASKS_DRAWER_WIDTH_PX = 360;
export const TASKS_CHECKBOX_SIZE_PX = 16;
export const TASKS_HEADER_FONT_SIZE_PX = 24;
export const TASKS_ITEM_FONT_SIZE_PX = 20;
export const TASKS_SECTION_FONT_SIZE_PX = 18;

// Floating toolbar (right-edge icon bubbles)
/** Top offset of the "Press R to rotate" hint; pushed down under the EditActionBar when the layout is dirty. */
export const ROTATE_HINT_TOP_PX = 8;
export const ROTATE_HINT_TOP_DIRTY_PX = 64;
export const TOOLBAR_ICON_SCALE = 2; // device px per icon pixel (12×12 grid → 24px)
export const TOOLBAR_BUBBLE_SIZE_PX = 42;
export const TOOLBAR_BUBBLE_GAP_PX = 8;
export const TOOLBAR_TOOLTIP_FONT_SIZE_PX = 20;
export const TOOLBAR_ICON_FG = '#e0e0e8';
export const TOOLBAR_ICON_ACCENT = '#5ac88c';

// Board panel (campus-wide kanban overlay)
export const BOARD_MAX_WIDTH_PX = 1080;
export const BOARD_WIDTH_PCT = 92;
export const BOARD_HEIGHT_PCT = 78;
export const BOARD_COLUMN_MIN_WIDTH_PX = 200;
export const BOARD_DONE_MAX_ITEMS = 20;
/** Sent to the Assistant when the Board's Plan button is clicked. */
export const BOARD_PLAN_KICKOFF_PROMPT =
  "Let's plan new work. Run your planning procedure: ask me what we're building " +
  '(and for which workspace), challenge the scope, then write the specified tasks ' +
  'to the board for my review. Do not dispatch anything until I approve.';

// ── Game Logic ───────────────────────────────────────────────
export const MAX_DELTA_TIME_SEC = 0.1;
export const DISMISS_BUBBLE_FAST_FADE_SEC = 0.3;
export const INACTIVE_SEAT_TIMER_MIN_SEC = 3.0;
export const INACTIVE_SEAT_TIMER_RANGE_SEC = 2.0;
export const PALETTE_COUNT = 6;
export const HUE_SHIFT_MIN_DEG = 45;
export const HUE_SHIFT_RANGE_DEG = 271;
export const AUTO_ON_FACING_DEPTH = 3;
export const AUTO_ON_SIDE_DEPTH = 2;
export const CHARACTER_HIT_HALF_WIDTH = 8;
export const CHARACTER_HIT_HEIGHT = 24;
export const TOOL_OVERLAY_VERTICAL_OFFSET = 32;
export const PULSE_ANIMATION_DURATION_SEC = 1.5;
