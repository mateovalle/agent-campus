import { execFileSync, spawn } from 'child_process';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  shell,
  Tray,
} from 'electron';
import * as fs from 'fs';
import * as pty from 'node-pty';
import * as os from 'os';
import * as path from 'path';

import type {
  AgentDecor,
  AgentSeatMeta,
  HostToWebviewMessage,
  RestorableAgent,
  ResumableSession,
  ScheduleEntry,
  WebviewToHostMessage,
  WorktreeRequest,
  WorktreeSummary,
} from '../shared/protocol.js';
import {
  loadCharacterSprites,
  loadDefaultLayout,
  loadFloorTiles,
  loadFurnitureAssets,
  loadRoleSprites,
  loadRoomTemplates,
  loadWallTiles,
  sendAssets,
  sendCharacterSprites,
  sendFloorTiles,
  sendRoleSprites,
  sendWallTiles,
} from '../src/core/assetLoader.js';
import type { EffortLevel } from '../src/core/constants.js';
import {
  DATA_DIR_NAME,
  EFFORT_LEVELS,
  FILE_MENTION_LIMIT,
  JSONL_POLL_INTERVAL_MS,
  JSONL_POLL_TIMEOUT_MS,
  LOGIN_SHELL_TIMEOUT_MS,
  PROJECT_SCAN_INTERVAL_MS,
} from '../src/core/constants.js';
import { readNewLines, startFileWatching, stopFileWatching } from '../src/core/fileWatcher.js';
import type { LayoutParseResult } from '../src/core/layoutPersistence.js';
import { isValidLayout, parseLayout } from '../src/core/layoutPersistence.js';
import { AGENT_ROLE_DEFS, DISPATCH_ROLE_IDS, roleForTaskText } from '../src/core/roles.js';
import {
  cancelPermissionTimer,
  cancelWaitingTimer,
  clearAgentActivity,
} from '../src/core/timerManager.js';
import {
  type CoreAgentState,
  createCoreAgentState,
  type TrackerContext,
} from '../src/core/types.js';
import { type AchievementEvent, listAchievements, recordAchievementEvent } from './achievements.js';
import { type AttentionEvent, AttentionTracker } from './attention.js';
import { quitItemLabel, trayTooltip, windowCloseAction } from './backgroundMode.js';
import type { CampusCommand, CampusResult, CampusServerHandle } from './campusServer.js';
import {
  applyCampusCommand,
  authorizeCampus,
  CAMPUS_NOTICE_MAX_CHARS,
  campusSocketPath,
  mintCampusToken,
  normalizeStatusText,
  startCampusServer,
} from './campusServer.js';
import { campusBinDir, installCampusShims } from './campusShim.js';
import {
  type ChatSession,
  listResumableSessions,
  renameSessionTitle,
  resolveClaudeExecutable,
  startChatSession,
} from './chatAgent.js';
import { probeClaudeAuth } from './claudeAuth.js';
import { forgetWorkspaceFiles, listWorkspaceFiles, rankFileMatches } from './fileIndex.js';
import type { GitWriteResult } from './git.js';
import {
  changedFiles,
  commitAll,
  createPullRequest,
  currentBranch,
  fileDiff,
  pushBranch,
} from './git.js';
import { removeAgentHookSettings, writeAgentHookSettings } from './hookSettings.js';
import {
  clearOfficeTemplate,
  officeTemplatePath,
  readOfficeTemplate,
  writeOfficeTemplate,
} from './officeTemplate.js';
import {
  forgetOpenAgents,
  loadOpenAgents,
  restorableAgents,
  saveOpenAgents,
} from './openAgents.js';
import { type LineEditor, openFileRef } from './openInEditor.js';
import {
  addSchedule,
  collectDueSchedules,
  collectMissedSchedules,
  loadSchedules,
  markSchedulesHandled,
  removeSchedule,
  SCHEDULER_TICK_MS,
  setScheduleEnabled,
} from './schedules.js';
import {
  addTodo,
  deleteTodo,
  editTodo,
  getAllTodoPaths,
  getTodos,
  moveTodo,
  toggleTodo,
} from './todos.js';
import { loadTranscriptHistory } from './transcriptHistory.js';
import { recordTurnUsage, summarizeUsage } from './usage.js';
import {
  getSetupCommand,
  loadWorkspaces,
  removeWorkspace as removeWorkspaceEntry,
  setSetupCommand,
  touchWorkspace,
} from './workspaces.js';
import {
  createWorktree,
  gitRepoRoot,
  listWorktrees,
  removeWorktree as removeWorktreeDir,
  samePath,
  summarizeWorktrees,
  worktreeRemovalBlocker,
} from './worktrees.js';

// ── Electron-specific constants ──────────────────────────────
const PTY_SCROLLBACK_MAX_CHARS = 200_000;
// Delay between injecting action text and pressing Enter, so the Claude TUI
// finishes rendering (slash-command autocomplete) before the submit keystroke.
const PTY_ACTION_ENTER_DELAY_MS = 150;
// Per-workspace layout hot-reload (watch ~/.pixel-agents/layouts/)
const WORKSPACE_LAYOUT_DEBOUNCE_MS = 300;
const WORKSPACE_LAYOUT_OWN_WRITE_MS = 1000;
const WINDOW_WIDTH = 900;
const WINDOW_HEIGHT = 700;
const WINDOW_BACKGROUND = '#1e1e2e';
// Auto-naming: tab labels derived from the agent's first real prompt
const AGENT_NAME_MAX_CHARS = 28;
const RESUMED_SESSION_STATUS = 'Resumed session — previous conversation shown above';
// Appended to terminal launches when the "Bypass Permissions" setting is on
const CLAUDE_BYPASS_FLAG = '--dangerously-skip-permissions';
/** An agent blocked this long (permission or question) gets a desktop notification. */
const BLOCKED_NOTIFY_AFTER_MS = 2 * 60_000;
/** How often blocks are checked against BLOCKED_NOTIFY_AFTER_MS. */
const ATTENTION_TICK_MS = 10_000;
/** Tray icons are small; the shipped app icon is 512px and must be scaled. */
const TRAY_ICON_SIZE = 16;
/**
 * Trailing-edge window for pushing an agent's self-reported decoration. A
 * build loop can call `campus progress` hundreds of times a second; the
 * renderer only needs the latest.
 */
const CAMPUS_DECOR_PUSH_MS = 100;

const DATA_DIR = path.join(os.homedir(), DATA_DIR_NAME);
const AGENT_SEATS_FILE = path.join(DATA_DIR, 'agent-seats.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

// ── Types ────────────────────────────────────────────────────
// Agents exist ONLY for sessions this app spawned (internal sessions):
// terminal agents own a PTY running claude; chat agents own an Agent SDK
// session. External Claude sessions (iTerm, VS Code, ...) are not tracked.
interface AgentState extends CoreAgentState {
  kind: 'terminal' | 'chat';
  /** Set for terminal agents only. */
  ptyId?: string;
  sessionId: string;
  /** Where the session RUNS: its worktree when it has one, else the repo. */
  cwd: string;
  /**
   * Which office the character sits in. An office is a REPO, not a checkout,
   * so worktree agents share their repo's office — and its layout, todos and
   * usage ledger, all keyed by this path rather than by `cwd`.
   */
  workspacePath: string;
  /** Branch of its private worktree, when it has one. */
  branch?: string;
  /**
   * Shared secret this agent's processes prove themselves with on the campus
   * socket. In memory only — nothing to leak once the app quits.
   */
  campusToken: string;
  /** What the agent last said about itself (campus status/progress). */
  decor?: AgentDecor;
  /** Tab display name; starts as "Agent N" / role id, auto-derived from the first prompt. */
  label: string;
  /** True once the label was auto-derived (or restored) — stops further renames. */
  autoNamed: boolean;
  /** Dispatch role, when created with one — replayed if the agent is restored. */
  role?: string;
  /** When this agent was opened, for ordering the restore offer. */
  openedAtMs: number;
}

interface PtyRecord {
  proc: pty.IPty;
  label: string;
  scrollback: string;
  sessionId?: string;
  /** Working directory — lets tab replays keep their workspace grouping. */
  cwd?: string;
  /** Last time the user typed into this terminal — used for /clear attribution */
  lastInputAt: number;
}

// ── State ────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let nextAgentId = 1;
let nextTerminalIndex = 1;
const knownJsonlFiles = new Set<string>();
const jsonlPollTimers = new Map<number, ReturnType<typeof setInterval>>();
const projectScanTimers = new Map<string, ReturnType<typeof setInterval>>();

const ctx: TrackerContext<AgentState> = {
  agents: new Map(),
  fileWatchers: new Map(),
  pollingTimers: new Map(),
  waitingTimers: new Map(),
  permissionTimers: new Map(),
  // Resolved at call time so a recreated window keeps receiving messages.
  // Every message also feeds the attention tracker (Dock badge + notifications).
  send: (message) => {
    mainWindow?.webContents.send('main-message', message);
    noteAttention(message);
  },
  // Sessions live only as long as their PTYs — nothing to persist
  persistAgents: () => {},
  // First real prompt in a session names its tab
  onUserPrompt: (agentId, text) => {
    // A new turn makes last turn's "migrating the schema" a lie. Cleared here
    // rather than on every tool start, because an agent's own build hook runs
    // mid-turn and the next tool would wipe what it just set.
    clearAgentDecor(agentId);
    autoNameAgent(agentId, text);
  },
};

// PTY state
const ptys = new Map<string, PtyRecord>();
const ptySessionIds = new Map<string, string>(); // sessionId → ptyId
const agentToPty = new Map<number, string>(); // agentId → ptyId
const ptyToAgent = new Map<string, number>(); // ptyId → agentId

// Chat (Agent SDK) state
const chatSessions = new Map<number, ChatSession>(); // agentId → session
let assistantAgentId: number | null = null;

// Scheduler state
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
const scheduleLastAgent = new Map<string, number>(); // scheduleId → last dispatched agentId

/**
 * The account's rate-limit window, as last reported by any session.
 *
 * Account-wide, not per agent: every session hears the same thing, so the
 * newest answer wins and one copy is kept. Null until some session says.
 */
let latestRateLimit: {
  status: 'allowed' | 'allowed_warning' | 'rejected';
  utilization?: number;
  resetsAt?: number;
  window?: string;
} | null = null;
/** Whether the user has already been told schedules are waiting on the window. */
let rateLimitDeferralAnnounced = false;

function recordRateLimit(info: {
  status: 'allowed' | 'allowed_warning' | 'rejected';
  utilization?: number;
  resetsAt?: number;
  rateLimitType?: string;
}): void {
  latestRateLimit = {
    status: info.status,
    ...(info.utilization !== undefined ? { utilization: info.utilization } : {}),
    ...(info.resetsAt !== undefined ? { resetsAt: info.resetsAt } : {}),
    ...(info.rateLimitType ? { window: info.rateLimitType } : {}),
  };
  if (info.status !== 'rejected') rateLimitDeferralAnnounced = false;
  ctx.send({ type: 'rateLimit', ...latestRateLimit });
}

/**
 * Whether the account is currently refused, so nothing unattended should be
 * sent out.
 *
 * A rejection that has outlived its own `resetsAt` is stale — the window
 * rolled over and no session has had reason to say so. Treating it as live
 * would strand every schedule until the user happened to run an agent by
 * hand.
 */
function rateLimitBlocksDispatch(nowMs = Date.now()): boolean {
  if (latestRateLimit?.status !== 'rejected') return false;
  const resetsAtMs = latestRateLimit.resetsAt ? latestRateLimit.resetsAt * 1000 : null;
  return resetsAtMs === null || resetsAtMs > nowMs;
}

// ── Small JSON persistence helpers ───────────────────────────
function loadJsonFile<T>(file: string): T | null {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
    }
  } catch (err) {
    console.error(`[Agent Campus] Failed to read ${path.basename(file)}:`, err);
  }
  return null;
}

function saveJsonFile(file: string, value: unknown): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[Agent Campus] Failed to write ${path.basename(file)}:`, err);
  }
}

// Seat/palette metadata is keyed by SESSION id, not agent id — agent ids are
// assigned in creation order and are not stable across window reloads.
function loadSeatMetaBySession(): Record<string, AgentSeatMeta> {
  return (
    loadJsonFile<{ bySession?: Record<string, AgentSeatMeta> }>(AGENT_SEATS_FILE)?.bySession ?? {}
  );
}

function loadSettings(): {
  soundEnabled: boolean;
  bypassPermissions: boolean;
  notificationsEnabled: boolean;
  /** Effort new agents start with; null leaves the CLI's own default. */
  defaultEffort: EffortLevel | null;
  /** Dollars one agent may spend before stopping itself; 0 = no cap. */
  maxBudgetUsd: number;
} {
  const stored = loadJsonFile<{
    soundEnabled?: boolean;
    bypassPermissions?: boolean;
    notificationsEnabled?: boolean;
    defaultEffort?: string | null;
    maxBudgetUsd?: number;
  }>(SETTINGS_FILE);
  // Validated rather than trusted: both are passed to the SDK, and a typo in
  // a hand-edited settings file should fall back, not fail a launch.
  const effort = EFFORT_LEVELS.find((level) => level === stored?.defaultEffort) ?? null;
  const budget =
    typeof stored?.maxBudgetUsd === 'number' && stored.maxBudgetUsd > 0 ? stored.maxBudgetUsd : 0;
  return {
    soundEnabled: true,
    bypassPermissions: false,
    notificationsEnabled: true,
    ...stored,
    defaultEffort: effort,
    maxBudgetUsd: budget,
  };
}

/** Pushes the persisted settings (plus the OS-owned login item) to the UI. */
function sendSettings(): void {
  const settings = loadSettings();
  ctx.send({
    type: 'settingsLoaded',
    ...settings,
    // null is this host's "no preference"; the protocol says absent.
    defaultEffort: settings.defaultEffort ?? undefined,
    launchAtLogin: app.getLoginItemSettings().openAtLogin,
  });
}

function saveSettings(patch: Partial<ReturnType<typeof loadSettings>>): void {
  saveJsonFile(SETTINGS_FILE, { ...loadSettings(), ...patch });
}

/** Per-workspace office layout file (~/.pixel-agents/layouts/<sanitized>.json). */
function getWorkspaceLayoutFile(workspacePath: string): string {
  return path.join(DATA_DIR, 'layouts', `${workspacePath.replace(/[^a-zA-Z0-9-]/g, '-')}.json`);
}

// ── Per-workspace layout hot-reload ──────────────────────────
// Watches the per-workspace layout files so external edits (scripts, another
// window) apply live instead of waiting for the next app start.
const LAYOUTS_DIR = path.join(DATA_DIR, 'layouts');
let layoutsDirWatcher: fs.FSWatcher | null = null;
const layoutsOwnWrites = new Map<string, number>(); // file basename → epoch ms
const layoutsDebounce = new Map<string, ReturnType<typeof setTimeout>>();

function watchWorkspaceLayouts(): void {
  try {
    fs.mkdirSync(LAYOUTS_DIR, { recursive: true });
    layoutsDirWatcher = fs.watch(LAYOUTS_DIR, (_event, filename) => {
      if (!filename) return;
      const own = layoutsOwnWrites.get(filename);
      if (own && Date.now() - own < WORKSPACE_LAYOUT_OWN_WRITE_MS) return;
      clearTimeout(layoutsDebounce.get(filename));
      layoutsDebounce.set(
        filename,
        setTimeout(() => {
          layoutsDebounce.delete(filename);
          const ws = loadWorkspaces().find(
            (w) => path.basename(getWorkspaceLayoutFile(w.path)) === filename,
          );
          if (!ws) return;
          const layout = loadJsonFile<Record<string, unknown>>(getWorkspaceLayoutFile(ws.path));
          if (layout && isValidLayout(layout)) {
            console.log(`[Agent Campus] Workspace layout changed on disk — pushing ${ws.path}`);
            ctx.send({ type: 'layoutLoaded', layout, workspacePath: ws.path });
          }
        }, WORKSPACE_LAYOUT_DEBOUNCE_MS),
      );
    });
  } catch (err) {
    console.error('[Agent Campus] Failed to watch workspace layouts:', err);
  }
}

/** Same transcript-directory mapping Claude Code uses: cwd → ~/.claude/projects/<sanitized>. */
function getProjectDirPath(cwd: string): string {
  return path.join(CLAUDE_PROJECTS_DIR, cwd.replace(/[^a-zA-Z0-9-]/g, '-'));
}

// The core asset loaders append 'assets/' themselves, so this returns the
// PARENT of the assets directory (resources/ in packaged builds, which
// electron-builder populates via extraResources → assets).
function getAssetsRoot(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  // __dirname is dist-electron/electron in dev builds
  return path.join(__dirname, '..', '..', 'webview-ui', 'public');
}

/**
 * Apps launched from Finder/Dock get launchd's minimal PATH, so `claude`
 * (typically installed via a shell profile) would not be found. Resolve the
 * user's login-shell PATH once at startup and merge it into process.env.
 */
function fixPathEnv(): void {
  if (process.platform === 'win32') return;
  try {
    const userShell = process.env.SHELL || '/bin/zsh';
    const loginPath = execFileSync(userShell, ['-l', '-c', 'echo -n "$PATH"'], {
      encoding: 'utf-8',
      timeout: LOGIN_SHELL_TIMEOUT_MS,
    });
    if (loginPath && loginPath.length > (process.env.PATH?.length ?? 0)) {
      process.env.PATH = loginPath;
    }
  } catch (err) {
    console.error('[Agent Campus] Could not resolve login-shell PATH:', err);
  }
}

// ── PTY management ───────────────────────────────────────────
// The main process constructs and spawns all commands itself — the renderer
// never supplies a command line (it only carries user keystrokes/resizes).
function spawnPty(opts: {
  cwd?: string;
  command?: string;
  sessionId?: string;
  label: string;
  /** Extra environment for this terminal (the campus CLI's credentials). */
  env?: Record<string, string>;
  /** Called when the process exits — used to gate on a worktree's setup. */
  onExit?: (exitCode: number) => void;
}): string {
  const ptyId = crypto.randomUUID();
  const isWin = process.platform === 'win32';
  const userShell = isWin ? 'powershell.exe' : process.env.SHELL || '/bin/zsh';
  // Login shell so the user's profile PATH applies inside the terminal too
  const args = opts.command
    ? isWin
      ? ['-NoLogo', '-Command', opts.command]
      : ['-l', '-c', opts.command]
    : isWin
      ? []
      : ['-l'];

  const proc = pty.spawn(userShell, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: opts.cwd || os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color', ...opts.env } as Record<string, string>,
  });

  const record: PtyRecord = {
    proc,
    label: opts.label,
    scrollback: '',
    sessionId: opts.sessionId,
    cwd: opts.cwd,
    lastInputAt: Date.now(),
  };
  ptys.set(ptyId, record);
  if (opts.sessionId) {
    ptySessionIds.set(opts.sessionId, ptyId);
  }

  proc.onData((data) => {
    // Scrollback is replayed to (re)mounted terminal tabs — see 'pty-ready'
    record.scrollback = (record.scrollback + data).slice(-PTY_SCROLLBACK_MAX_CHARS);
    ctx.send({ type: 'pty-output', ptyId, data });
  });

  proc.onExit(({ exitCode }) => {
    ctx.send({ type: 'pty-exit', ptyId, exitCode });
    opts.onExit?.(exitCode);
    ptys.delete(ptyId);
    if (record.sessionId && ptySessionIds.get(record.sessionId) === ptyId) {
      ptySessionIds.delete(record.sessionId);
    }

    // The agent's lifecycle IS its terminal's lifecycle: when the PTY exits
    // (tab closed, `exit` typed, claude finished), the character goes too.
    const agentId = ptyToAgent.get(ptyId);
    if (agentId !== undefined) {
      removeAgent(agentId);
      ctx.send({ type: 'agentClosed', id: agentId });
    }
    // Close the tab on a clean exit; keep it visible after a crash so the
    // error output can be read (the tab shows an exited marker and can be
    // closed manually).
    if (exitCode === 0) {
      ctx.send({ type: 'pty-close-tab', ptyId });
    }
  });

  return ptyId;
}

function killPty(ptyId: string): void {
  try {
    ptys.get(ptyId)?.proc.kill();
  } catch {
    /* already dead */
  }
}

// ── Agent lifecycle (internal sessions only) ─────────────────

/**
 * Where an agent lives: the directory it runs in and the office it belongs to.
 *
 * These are the same path for a plain agent and differ for a worktree one,
 * which runs in its own checkout but still sits in its repo's office. Passing
 * them together keeps every launch path honest about which of the two it
 * means — `cwd` for the session (PTY, SDK, transcript), `workspacePath` for
 * everything the campus groups by project.
 */
interface AgentPlacement {
  cwd: string;
  workspacePath: string;
  branch?: string;
}

/** Placement for an agent that works directly in the project folder. */
function inWorkspace(cwd: string): AgentPlacement {
  return { cwd, workspacePath: cwd };
}

/** Tells the user something the UI that asked for it can no longer report. */
function notify(level: 'info' | 'error', text: string): void {
  console.log(`[Agent Campus] ${level}: ${text}`);
  ctx.send({ type: 'hostNotice', level, text });
}

/**
 * Runs a workspace's setup command in a fresh worktree, in a terminal tab so
 * the user can watch it, and resolves to whether it succeeded.
 *
 * A new checkout has no node_modules, no .env and no build output, so an
 * agent starting before this finishes would spend its first turns on a
 * failing build. Waiting is the point; the tab is so the wait is legible.
 */
function runWorktreeSetup(place: AgentPlacement, command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const label = `setup ${place.branch ?? ''}`.trim();
    const ptyId = spawnPty({
      cwd: place.cwd,
      command,
      label,
      onExit: (exitCode) => {
        if (exitCode !== 0) {
          notify(
            'error',
            `Setup for ${place.branch} failed (exit ${exitCode}) — agent not started.`,
          );
        }
        resolve(exitCode === 0);
      },
    });
    ctx.send({
      type: 'pty-created',
      ptyId,
      label,
      workspacePath: place.workspacePath,
      folderName: path.basename(place.workspacePath),
      ...(place.branch ? { branch: place.branch } : {}),
    });
  });
}

// ── The campus socket: agents decorating their own characters ──

let campusServer: CampusServerHandle | null = null;
let campusBin: string | null = null;
/** Pending decor pushes, coalesced per agent (see sendDecorSoon). */
const decorPushTimers = new Map<number, NodeJS.Timeout>();

/**
 * Environment that lets an agent's processes find the campus and prove who
 * they are. Keyed by SESSION, not by the numeric agent id: ids are a
 * per-process counter that changes across a restart, a restore and a resume,
 * while the session uuid is what every other persistence path here uses.
 */
function campusEnvFor(agent: AgentState): Record<string, string> {
  if (!campusServer?.bound || !campusBin) return {};
  return {
    CAMPUS_SESSION: agent.sessionId,
    CAMPUS_TOKEN: agent.campusToken,
    CAMPUS_SOCKET: campusServer.path,
    // So a hook can call the CLI by absolute path even if PATH was rewritten
    CAMPUS_BIN: campusBin,
  };
}

/**
 * Pushes an agent's decoration to the webview, coalesced on a trailing edge.
 * A build loop reporting progress every few milliseconds would otherwise put
 * hundreds of IPC messages a second in front of the renderer; the record is
 * always current, only the telling is throttled.
 */
function sendDecorSoon(agentId: number): void {
  if (decorPushTimers.has(agentId)) return;
  decorPushTimers.set(
    agentId,
    setTimeout(() => {
      decorPushTimers.delete(agentId);
      const agent = ctx.agents.get(agentId);
      if (agent?.decor) ctx.send({ type: 'agentDecor', id: agentId, decor: agent.decor });
    }, CAMPUS_DECOR_PUSH_MS),
  );
}

/** Drops whatever an agent said about itself, telling the webview to forget it. */
function clearAgentDecor(agentId: number): void {
  const agent = ctx.agents.get(agentId);
  if (!agent?.decor) return;
  delete agent.decor;
  clearTimeout(decorPushTimers.get(agentId));
  decorPushTimers.delete(agentId);
  ctx.send({
    type: 'agentDecor',
    id: agentId,
    decor: { status: null, progress: null, setAtMs: Date.now() },
  });
}

/** Handles one authenticated-or-not command off the socket. */
function handleCampusCommand(cmd: CampusCommand): CampusResult {
  const agent = [...ctx.agents.values()].find((a) => a.sessionId === cmd.session);
  // An unknown session and a bad token answer identically, so a caller can't
  // probe for which sessions exist.
  if (
    !agent ||
    !authorizeCampus(
      (session) => (session === agent.sessionId ? agent.campusToken : undefined),
      cmd,
    )
  ) {
    return { ok: false, error: 'unknown session or bad token' };
  }

  if (cmd.verb === 'ping') {
    return { ok: true, info: { agent: agent.label, session: agent.sessionId, cwd: agent.cwd } };
  }

  if (cmd.verb === 'idle') {
    // The authoritative turn end for an agent that had only a guess. Cancel
    // the guess too, or it fires again five seconds later and the office
    // announces the same finish twice.
    cancelWaitingTimer(ctx, agent.id);
    agent.isWaiting = true;
    ctx.send({ type: 'agentStatus', id: agent.id, status: 'waiting' });
    return { ok: true };
  }

  if (cmd.verb === 'notify') {
    const text = normalizeStatusText(cmd.text ?? '', CAMPUS_NOTICE_MAX_CHARS);
    if (!text) return { ok: false, error: 'nothing to say' };
    // A shout IS something for you: the office's bubble rule is satisfied.
    ctx.send({ type: 'agentNotice', id: agent.id, text });
    notifyAgentShout(agent, text);
    return { ok: true };
  }

  agent.decor = applyCampusCommand(agent.decor, cmd, Date.now());
  sendDecorSoon(agent.id);
  return { ok: true };
}

/** Native notification for `campus notify`, when you aren't looking. */
function notifyAgentShout(agent: AgentState, text: string): void {
  if (!loadSettings().notificationsEnabled) return;
  if (mainWindow?.isFocused()) return; // you're here — the bubble is enough
  const n = new Notification({ title: agent.label, body: text, silent: true });
  liveNotifications.add(n);
  n.on('click', () => showAgent(agent.id));
  n.on('close', () => liveNotifications.delete(n));
  n.show();
}

/**
 * Brings up the socket and installs the CLI. Failure is survivable: the
 * office works exactly as before, agents simply have nothing to talk to.
 */
async function startCampus(): Promise<void> {
  const shims = installCampusShims({
    electronPath: process.execPath,
    cliSource: path.join(__dirname, 'campusCli.js'),
    version: app.getVersion(),
  });
  campusBin = shims?.binDir ?? null;

  campusServer = await startCampusServer({
    socketPath: campusSocketPath(app.isPackaged),
    onCommand: handleCampusCommand,
    onNotice: (level, text) => console.log(`[Agent Campus] campus socket: ${level}: ${text}`),
  });
  if (campusServer.bound) {
    console.log(`[Agent Campus] campus socket at ${campusServer.path}`);
  }
}

/**
 * A repo's checkouts, each tagged with the agents living in it. Agents are
 * matched by the directory they RUN in (`cwd`), which is exactly what a
 * worktree is — so this is the one place that reads cwd as an identity.
 */
function worktreesWithAgents(repoRoot: string): WorktreeSummary[] {
  const summaries = summarizeWorktrees(repoRoot);
  for (const summary of summaries) {
    summary.agentIds = [...ctx.agents.values()]
      .filter((agent) => samePath(agent.cwd, summary.path))
      .map((agent) => agent.id);
  }
  return summaries;
}

/**
 * Commit, push, or open a PR for one agent — the only three writes the app
 * makes to a repository.
 *
 * Asynchronous, unlike every read: a commit runs the project's own hooks and
 * the other two are network calls, and the main process cannot stop for any
 * of them. The panel is told how it went either way, and a successful commit
 * is followed by a fresh file list, because the old one is now a lie.
 */
async function runAgentGitWrite(
  msg:
    | { type: 'commitAgentWork'; agentId: number; message: string }
    | { type: 'pushAgentWork'; agentId: number }
    | { type: 'createAgentPr'; agentId: number },
): Promise<void> {
  const action =
    msg.type === 'commitAgentWork' ? 'commit' : msg.type === 'pushAgentWork' ? 'push' : 'pr';
  const agent = ctx.agents.get(msg.agentId);
  // Every path out of here answers: a button that was pressed and never hears
  // back spins forever, which is worse than being told the agent is gone.
  if (!agent) {
    ctx.send({
      type: 'agentGitResult',
      agentId: msg.agentId,
      action,
      ok: false,
      message: 'That agent is gone, so there is nothing to act on.',
    });
    return;
  }

  let result: GitWriteResult;
  if (msg.type === 'commitAgentWork') {
    result = await commitAll(agent.cwd, msg.message);
  } else if (msg.type === 'pushAgentWork') {
    const branch = currentBranch(agent.cwd);
    result = branch
      ? await pushBranch(agent.cwd, branch)
      : {
          ok: false,
          message: 'This checkout is on a detached HEAD, so there is no branch to push.',
        };
  } else {
    result = await createPullRequest(agent.cwd);
  }

  ctx.send({
    type: 'agentGitResult',
    agentId: msg.agentId,
    action,
    ok: result.ok,
    message: result.message,
  });
  // Opened here rather than handed to the webview: the browser is the host's
  // to open, and the panel has nowhere to put a link anyway.
  if (result.url) void shell.openExternal(result.url);
  if (result.ok && action === 'commit') {
    ctx.send({
      type: 'agentChanges',
      agentId: msg.agentId,
      cwd: agent.cwd,
      ...(currentBranch(agent.cwd) ? { branch: currentBranch(agent.cwd) as string } : {}),
      files: changedFiles(agent.cwd),
    });
  }
}

/** Pushes a repo's checkouts to the worktree manager. */
function sendWorktrees(workspacePath: string): void {
  const repoRoot = gitRepoRoot(workspacePath);
  ctx.send({
    type: 'worktreesLoaded',
    workspacePath,
    worktrees: repoRoot ? worktreesWithAgents(repoRoot) : [],
  });
}

/**
 * Where a requested agent should run: the folder itself, or a private
 * worktree of its repo when the caller asked for one. Resolves to null if
 * the checkout was refused or its setup failed — in both cases the user has
 * been told, and launching anyway would quietly put the agent somewhere it
 * was not meant to be.
 */
async function placeForRequest(
  cwd: string,
  request?: WorktreeRequest,
): Promise<AgentPlacement | null> {
  if (!request) return inWorkspace(cwd);

  const repoRoot = gitRepoRoot(cwd);
  if (!repoRoot) {
    notify('error', `${path.basename(cwd)} is not a git repository, so it has no worktrees.`);
    return null;
  }

  // An existing checkout, chosen in the worktree manager. Verified against the
  // repo's own list rather than trusted: this decides where an agent writes.
  if (request.path) {
    const known = listWorktrees(repoRoot).find((w) => w.path === request.path);
    if (!known) {
      notify('error', 'That worktree is no longer part of this repository.');
      return null;
    }
    return {
      cwd: known.path,
      workspacePath: repoRoot,
      ...(known.branch ? { branch: known.branch } : {}),
    };
  }

  let place: AgentPlacement;
  try {
    const worktree = createWorktree(repoRoot, request.branch);
    place = { cwd: worktree.path, workspacePath: repoRoot, branch: worktree.branch };
    console.log(`[Agent Campus] Worktree ${worktree.branch} at ${worktree.path}`);
  } catch (err) {
    notify('error', `Could not create the worktree: ${(err as Error).message}`);
    return null;
  }

  const setup = getSetupCommand(repoRoot);
  if (setup && !(await runWorktreeSetup(place, setup))) return null;
  return place;
}

/** Registers the office character + transcript watching shared by both agent kinds. */
function registerAgent(
  kind: 'terminal' | 'chat',
  place: AgentPlacement,
  sessionId: string,
  label: string,
  skipToEnd = false,
): AgentState {
  const { cwd } = place;
  // Transcripts are keyed by the directory claude RUNS in, so a worktree
  // agent's JSONL lives under the worktree's own project hash.
  const projectDir = getProjectDirPath(cwd);
  const expectedFile = path.join(projectDir, `${sessionId}.jsonl`);
  // Pre-register so the /clear scan won't treat this session's own file as new
  knownJsonlFiles.add(expectedFile);

  // A resumed session keeps the name it earned in a previous life
  const storedName = loadSeatMetaBySession()[sessionId]?.name;

  const id = nextAgentId++;
  const agent: AgentState = {
    ...createCoreAgentState(id, projectDir, expectedFile),
    // A chat agent's SDK session reports its own turn boundaries, so the
    // transcript watcher must not also guess at them.
    hasSessionState: kind === 'chat',
    kind,
    sessionId,
    cwd,
    workspacePath: place.workspacePath,
    ...(place.branch ? { branch: place.branch } : {}),
    campusToken: mintCampusToken(),
    label: storedName ?? label,
    autoNamed: !!storedName,
    openedAtMs: Date.now(),
  };
  ctx.agents.set(id, agent);
  pollForJsonlFile(id, skipToEnd);
  snapshotOpenAgents();
  return agent;
}

/**
 * Record the agents currently open, so the next launch can offer them back.
 *
 * Skipped while shutting down: quitting removes every agent, and a snapshot
 * taken then would write the empty list over the very thing being saved.
 */
function snapshotOpenAgents(): void {
  if (shuttingDown) return;
  const meta = loadSeatMetaBySession();
  const records: RestorableAgent[] = [...ctx.agents.values()]
    .sort((a, b) => a.openedAtMs - b.openedAtMs)
    .map((agent) => {
      // The role reaches disk through the seat-save path, which may not have
      // run yet for a just-created agent — prefer what we were launched with.
      const role = agent.role ?? meta[agent.sessionId]?.role ?? undefined;
      return {
        sessionId: agent.sessionId,
        cwd: agent.cwd,
        workspacePath: agent.workspacePath,
        // The office's name, not the checkout's: a restored worktree agent
        // belongs to the same office it left.
        folderName: path.basename(agent.workspacePath),
        ...(agent.branch ? { branch: agent.branch } : {}),
        kind: agent.kind,
        label: agent.label,
        ...(role ? { role } : {}),
        openedAtMs: agent.openedAtMs,
      };
    });
  saveOpenAgents(records);
}

/**
 * Derives a short tab name from the agent's first real prompt. Returns null
 * for non-prompts (slash/local commands, interruption markers) so the next
 * genuine prompt gets to name the agent instead.
 */
function deriveAgentName(text: string): string | null {
  // Role-tagged Board dispatches ("[qa] fix login") name the agent by the task itself
  const collapsed = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\[[\w-]+\] +/, '');
  // '<' = command wrappers (<command-name>…), '/' = slash commands,
  // '[' = interruption markers ([Request interrupted…) after tag stripping
  if (!collapsed || /^[</[]/.test(collapsed) || collapsed.startsWith('Caveat:')) return null;
  if (collapsed.length <= AGENT_NAME_MAX_CHARS) return collapsed;
  const cut = collapsed.slice(0, AGENT_NAME_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > AGENT_NAME_MAX_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Applies a name to an agent everywhere it is remembered: state, the tab
 * replay sources (so a webview reload shows it), the session-keyed seat meta
 * (so a resume restores it) and the webview.
 */
function applyAgentName(agentId: number, name: string): void {
  const agent = ctx.agents.get(agentId);
  if (!agent) return;

  agent.label = name;
  // Keep the tab-replay sources in sync so reloads show the same name
  if (agent.ptyId) {
    const record = ptys.get(agent.ptyId);
    if (record) record.label = name;
  }
  const session = chatSessions.get(agentId);
  if (session) session.label = name;
  // Persist by session id so resuming this session restores the name
  const bySession = loadSeatMetaBySession();
  bySession[agent.sessionId] = { ...bySession[agent.sessionId], name };
  saveJsonFile(AGENT_SEATS_FILE, { bySession });

  // The CLI keeps its own index of sessions, and our resume picker now reads
  // from it — so a rename that stops here would leave the picker offering
  // this session under its first prompt forever.
  void renameSessionTitle(agent.sessionId, name);

  ctx.send({ type: 'agentLabel', id: agentId, label: name });
}

/** Renames an agent once from its first prompt. */
function autoNameAgent(agentId: number, promptText: string): void {
  const agent = ctx.agents.get(agentId);
  if (!agent || agent.autoNamed) return;
  const name = deriveAgentName(promptText);
  if (!name) return;
  agent.autoNamed = true;
  applyAgentName(agentId, name);
}

/**
 * Renames an agent on the user's request. Marks it auto-named so the first
 * prompt can't overwrite a name the user typed on purpose.
 */
function renameAgent(agentId: number, label: string): void {
  const agent = ctx.agents.get(agentId);
  if (!agent) return;
  const name = label.replace(/\s+/g, ' ').trim().slice(0, AGENT_NAME_MAX_CHARS);
  if (!name) return;
  agent.autoNamed = true;
  applyAgentName(agentId, name);
  snapshotOpenAgents();
}

/** Probe Claude Code's auth state and push it to the webview. */
async function sendClaudeAuth(): Promise<void> {
  const status = await probeClaudeAuth(resolveClaudeExecutable());
  if (status.kind !== 'ok') {
    console.log(`[Agent Campus] Claude auth: ${status.kind}`);
  }
  ctx.send({ type: 'claudeAuth', status });
}

/**
 * Open a terminal tab running `claude auth login`. It uses the bundled
 * executable rather than `claude` on PATH, so logging in works even when
 * the user has never installed the CLI themselves.
 */
function startClaudeLogin(): void {
  const exe = resolveClaudeExecutable();
  const quoted = exe
    ? process.platform === 'win32'
      ? `& '${exe}'`
      : `'${exe.replace(/'/g, "'\\''")}'`
    : 'claude';
  const label = 'Log in';
  const ptyId = spawnPty({ command: `${quoted} auth login`, label });
  ctx.send({ type: 'pty-created', ptyId, label });
  console.log('[Agent Campus] Opened a Claude Code login terminal');
}

function launchAgent(place: AgentPlacement, resumeSessionId?: string): void {
  const { cwd, workspacePath } = place;
  const sessionId = resumeSessionId ?? crypto.randomUUID();
  const agent = registerAgent(
    'terminal',
    place,
    sessionId,
    `Agent ${nextTerminalIndex++}`,
    !!resumeSessionId,
  );
  // Resuming continues the same session id, so the transcript watcher
  // registered on it keeps working exactly as for a fresh one.
  const sessionFlag = resumeSessionId ? `--resume ${sessionId}` : `--session-id ${sessionId}`;
  // The PATH prefix goes INSIDE the command, not in the env: this is a LOGIN
  // shell, and a user's profile that sets PATH wholesale would drop anything
  // we put in the environment before it ran.
  const campusPath = campusBin ? `export PATH=${JSON.stringify(campusBin)}:"$PATH"; ` : '';
  // A Stop hook, so a PTY agent can say its turn ended instead of being
  // guessed at. Written to a file rather than passed as inline JSON: this is
  // a shell command string, and embedding quoted JSON in one is exactly where
  // escaping bugs live — and a malformed --settings value is read as a PATH,
  // so the failure would be silent and confusing.
  const hookSettings = writeAgentHookSettings(sessionId, campusBin);
  const settingsFlag = hookSettings ? ` --settings ${JSON.stringify(hookSettings)}` : '';
  const ptyId = spawnPty({
    cwd,
    command: `${campusPath}claude ${sessionFlag}${settingsFlag}${loadSettings().bypassPermissions ? ` ${CLAUDE_BYPASS_FLAG}` : ''}`,
    sessionId,
    label: agent.label,
    env: campusEnvFor(agent),
  });
  agent.ptyId = ptyId;
  agentToPty.set(agent.id, ptyId);
  ptyToAgent.set(ptyId, agent.id);

  console.log(`Agent ${agent.id}: launched terminal session ${sessionId} in ${cwd}`);
  ctx.send({
    type: 'pty-created',
    ptyId,
    label: agent.label,
    agentId: agent.id,
    workspacePath,
    folderName: path.basename(workspacePath),
    ...(place.branch ? { branch: place.branch } : {}),
  });
  ctx.send({
    type: 'agentCreated',
    id: agent.id,
    ptyId,
    agentKind: 'terminal',
    folderName: path.basename(workspacePath),
    workspacePath,
    ...(place.branch ? { branch: place.branch } : {}),
  });
  registerWorkspace(workspacePath);
  // A terminal agent is as much an agent as a chat one; counting only the
  // latter made 'first-agent', 'multitasker' and 'full-floor' under-report for
  // anyone who works in a PTY. No role: '+ Terminal' has no role picker.
  trackAchievement('agentSpawned', { concurrentAgents: ctx.agents.size });
  ensureProjectScan(agent.projectDir);
}

async function launchChatAgent(
  place: AgentPlacement,
  resumeSessionId?: string,
  initialPrompt?: string,
  roleId?: string,
): Promise<number> {
  // `cwd` is where the session runs; `workspacePath` is the office it belongs
  // to — the two differ for a worktree agent, so never substitute one for the
  // other: tasks and spend are the OFFICE's, the files are the checkout's.
  const { cwd, workspacePath } = place;
  const sessionId = resumeSessionId ?? crypto.randomUUID();
  const role = roleId ? AGENT_ROLE_DEFS[roleId] : undefined;
  // Placeholder until the first prompt names the tab; roles make a better one
  const defaultLabel = role ? role.id : `Agent ${nextTerminalIndex++}`;
  const agent = registerAgent('chat', place, sessionId, defaultLabel, !!resumeSessionId);
  if (roleId) {
    agent.role = roleId;
    snapshotOpenAgents(); // the role arrived after registration
  }

  // The chat equivalent of terminal scrollback replay: rebuild the previous
  // conversation from the transcript so a resumed tab doesn't start blank.
  const resumedHistory = resumeSessionId ? await loadTranscriptHistory(resumeSessionId, cwd) : [];
  const persistedModel = loadSeatMetaBySession()[sessionId]?.model ?? null;

  const dispatchDefaults = loadSettings();
  const session = startChatSession({
    agentId: agent.id,
    sessionId,
    cwd,
    label: agent.label,
    resume: !!resumeSessionId,
    ...(resumedHistory.length > 0
      ? { initialHistory: [...resumedHistory, { kind: 'status', text: RESUMED_SESSION_STATUS }] }
      : {}),
    send: ctx.send,
    bypassPermissions: loadSettings().bypassPermissions,
    // Both are session options with no live setter, so they are decided HERE,
    // where an agent is sent out — which also means a scheduled run inherits
    // them without the scheduler knowing they exist.
    ...(dispatchDefaults.defaultEffort ? { effort: dispatchDefaults.defaultEffort } : {}),
    ...(dispatchDefaults.maxBudgetUsd > 0 ? { maxBudgetUsd: dispatchDefaults.maxBudgetUsd } : {}),
    // Credentials for the campus CLI, plus its directory on PATH so the
    // agent's own Bash tool and anything it spawns can reach it.
    env: {
      ...campusEnvFor(agent),
      ...(campusBin ? { PATH: `${campusBin}${path.delimiter}${process.env.PATH ?? ''}` } : {}),
    },
    // The SDK-native half: a chat agent decorates itself with a tool call
    // instead of shelling out, which is the difference between this being
    // used and not.
    selfHandlers: {
      setStatus: (text) => {
        agent.decor = applyCampusCommand(
          agent.decor,
          { verb: 'status', session: sessionId, token: agent.campusToken, text },
          Date.now(),
        );
        sendDecorSoon(agent.id);
      },
      setProgress: (value) => {
        agent.decor = applyCampusCommand(
          agent.decor,
          { verb: 'progress', session: sessionId, token: agent.campusToken, value },
          Date.now(),
        );
        sendDecorSoon(agent.id);
      },
      notify: (text) => {
        const clean = normalizeStatusText(text, CAMPUS_NOTICE_MAX_CHARS);
        if (!clean) return;
        ctx.send({ type: 'agentNotice', id: agent.id, text: clean });
        notifyAgentShout(agent, clean);
      },
    },
    // Model is per SESSION, not global: a resumed agent comes back on the
    // model it was last switched to (see chatSetModel)
    ...(persistedModel ? { model: persistedModel } : {}),
    ...(role ? { systemPromptAppend: role.charter, disallowedTools: role.disallowedTools } : {}),
    taskHandlers: {
      list: () => getTodos(workspacePath),
      add: (text) => {
        ctx.send({
          type: 'workspaceTodos',
          path: workspacePath,
          todos: addTodo(workspacePath, text),
        });
      },
      complete: (id) => {
        const item = getTodos(workspacePath).find((t) => t.id === id && t.status === 'open');
        if (!item) return false;
        ctx.send({
          type: 'workspaceTodos',
          path: workspacePath,
          todos: toggleTodo(workspacePath, id),
        });
        trackAchievement('agentTaskCompleted');
        return true;
      },
    },
    onRateLimit: recordRateLimit,
    onTurnComplete: (costUsd, durationMs, turnSessionId) => {
      recordTurnUsage(workspacePath, costUsd, durationMs, turnSessionId);
      ctx.send({ type: 'usageSummary', summary: summarizeUsage() });
      trackAchievement('turnCompleted');
    },
    onExit: () => {
      // The SDK loop ended on its own (error or shutdown) — retire the
      // character but keep the (now inert) session registered so the tab's
      // 'chatReady' still gets a history replay: startup failures usually
      // land before the ChatView has mounted, and without the replay the
      // tab would stay blank and deaf. closeAgent removes it for real.
      chatSessions.get(agent.id)?.dispose();
      if (ctx.agents.has(agent.id)) {
        removeAgent(agent.id);
        ctx.send({ type: 'agentClosed', id: agent.id });
      }
    },
  });
  chatSessions.set(agent.id, session);

  ctx.send({
    type: 'chat-created',
    agentId: agent.id,
    label: agent.label,
    workspacePath,
    folderName: path.basename(workspacePath),
    ...(place.branch ? { branch: place.branch } : {}),
  });
  ctx.send({
    type: 'agentCreated',
    id: agent.id,
    agentKind: 'chat',
    folderName: path.basename(workspacePath),
    workspacePath,
    ...(place.branch ? { branch: place.branch } : {}),
    ...(role ? { role: role.id } : {}),
  });
  registerWorkspace(workspacePath);
  // ctx.agents, not chatSessions: that map also holds the Assistant (which has
  // no character) and sessions already disposed but kept for tab replay, while
  // it misses every terminal agent. ctx.agents is exactly the live characters.
  trackAchievement('agentSpawned', {
    concurrentAgents: ctx.agents.size,
    ...(role ? { role: role.id } : {}),
  });
  if (initialPrompt) {
    session.send(initialPrompt);
  }
  return agent.id;
}

/**
 * Poll until the agent's JSONL file appears, then start watching it.
 *
 * With a DEADLINE, because there are real ways for it never to appear — a
 * `claude` that failed to launch, a cwd that is gone, a worktree whose setup
 * left no usable environment — and without one the character sat at its desk
 * forever while a 1s timer ran for the life of the app. The session may well
 * be fine (a terminal tab still works, a chat tab still streams); what is lost
 * is the office's ability to FOLLOW it. So this reports and stops polling,
 * and closes nothing.
 */
function pollForJsonlFile(agentId: number, skipToEnd = false): void {
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const agent = ctx.agents.get(agentId);
    if (!agent) {
      clearInterval(timer);
      jsonlPollTimers.delete(agentId);
      return;
    }
    if (Date.now() - startedAt > JSONL_POLL_TIMEOUT_MS) {
      clearInterval(timer);
      jsonlPollTimers.delete(agentId);
      notify(
        'error',
        `${agent.label} never wrote a transcript in ${agent.cwd}, so the office ` +
          'cannot follow it. Its tab still works.',
      );
      return;
    }
    try {
      if (fs.existsSync(agent.jsonlFile)) {
        console.log(`Agent ${agentId}: found JSONL ${path.basename(agent.jsonlFile)}`);
        clearInterval(timer);
        jsonlPollTimers.delete(agentId);
        if (skipToEnd) {
          // Resumed session — don't replay the whole history into the office
          agent.fileOffset = fs.statSync(agent.jsonlFile).size;
        }
        startFileWatching(ctx, agentId, agent.jsonlFile);
        if (!skipToEnd) {
          readNewLines(ctx, agentId);
        }
      }
    } catch {
      /* file may not exist yet */
    }
  }, JSONL_POLL_INTERVAL_MS);
  jsonlPollTimers.set(agentId, timer);
}

function removeAgent(agentId: number): void {
  const agent = ctx.agents.get(agentId);
  if (!agent) return;

  const jp = jsonlPollTimers.get(agentId);
  if (jp) clearInterval(jp);
  jsonlPollTimers.delete(agentId);

  stopFileWatching(ctx, agentId, agent.jsonlFile);
  cancelWaitingTimer(ctx, agentId);
  cancelPermissionTimer(ctx, agentId);
  // The hook file outlives nothing: its only reader was this session's CLI.
  removeAgentHookSettings(agent.sessionId);
  // Another agent may still be working in the same directory, so this only
  // drops the listing when the last one leaves.
  if (![...ctx.agents.values()].some((a) => a.id !== agentId && a.cwd === agent.cwd)) {
    forgetWorkspaceFiles(agent.cwd);
  }

  const ptyId = agentToPty.get(agentId);
  if (ptyId) {
    agentToPty.delete(agentId);
    ptyToAgent.delete(ptyId);
  }
  ctx.agents.delete(agentId);
  // A closed agent stops being offered on restart; during shutdown the list is
  // left exactly as it was, which is the whole point of keeping it.
  snapshotOpenAgents();

  // Stop scanning project dirs no other agent uses
  let dirStillUsed = false;
  for (const a of ctx.agents.values()) {
    if (a.projectDir === agent.projectDir) {
      dirStillUsed = true;
      break;
    }
  }
  if (!dirStillUsed) {
    const st = projectScanTimers.get(agent.projectDir);
    if (st) clearInterval(st);
    projectScanTimers.delete(agent.projectDir);
  }
}

// ── /clear detection ─────────────────────────────────────────
// `/clear` makes claude start a NEW transcript file in the same project dir.
// We scan each internal agent's project dir; a new file is reassigned to the
// agent there whose terminal most recently received input (the /clear was
// typed into some terminal — that one had the last keystrokes).
function ensureProjectScan(projectDir: string): void {
  if (projectScanTimers.has(projectDir)) return;
  try {
    for (const f of fs.readdirSync(projectDir)) {
      if (f.endsWith('.jsonl')) knownJsonlFiles.add(path.join(projectDir, f));
    }
  } catch {
    /* dir may not exist yet */
  }

  const timer = setInterval(() => {
    scanForNewJsonlFiles(projectDir);
  }, PROJECT_SCAN_INTERVAL_MS);
  projectScanTimers.set(projectDir, timer);
}

function scanForNewJsonlFiles(projectDir: string): void {
  let files: string[];
  try {
    files = fs
      .readdirSync(projectDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(projectDir, f));
  } catch {
    return;
  }

  // Prune deleted files so the known set doesn't grow forever
  const current = new Set(files);
  for (const known of knownJsonlFiles) {
    if (known.startsWith(projectDir + path.sep) && !current.has(known)) {
      knownJsonlFiles.delete(known);
    }
  }

  for (const file of files) {
    if (knownJsonlFiles.has(file)) continue;
    knownJsonlFiles.add(file);

    const target = mostRecentlyTypedAgentIn(projectDir);
    if (!target) continue; // no internal agent here — external activity, ignore
    console.log(
      `[Agent Campus] New JSONL ${path.basename(file)} → reassigning agent ${target.id} (/clear)`,
    );
    reassignAgentToFile(target, file);
  }
}

function mostRecentlyTypedAgentIn(projectDir: string): AgentState | null {
  let best: AgentState | null = null;
  let bestTime = -1;
  for (const agent of ctx.agents.values()) {
    if (agent.projectDir !== projectDir) continue;
    const t =
      agent.kind === 'terminal'
        ? agent.ptyId
          ? (ptys.get(agent.ptyId)?.lastInputAt ?? 0)
          : 0
        : (chatSessions.get(agent.id)?.lastInputAt ?? 0);
    if (t > bestTime) {
      bestTime = t;
      best = agent;
    }
  }
  return best;
}

function reassignAgentToFile(agent: AgentState, newFilePath: string): void {
  stopFileWatching(ctx, agent.id, agent.jsonlFile);
  cancelWaitingTimer(ctx, agent.id);
  cancelPermissionTimer(ctx, agent.id);
  clearAgentActivity(ctx, agent.id);

  const newSessionId = path.basename(newFilePath, '.jsonl');
  if (agent.ptyId) {
    ptySessionIds.delete(agent.sessionId);
    ptySessionIds.set(newSessionId, agent.ptyId);
    const record = ptys.get(agent.ptyId);
    if (record) record.sessionId = newSessionId;
  }

  agent.sessionId = newSessionId;
  agent.jsonlFile = newFilePath;
  agent.fileOffset = 0;
  agent.lineBuffer = Buffer.alloc(0);

  startFileWatching(ctx, agent.id, newFilePath);
  readNewLines(ctx, agent.id);
}

function trackAchievement(
  event: AchievementEvent,
  detail?: { concurrentAgents?: number; workspaces?: number; role?: string },
): void {
  for (const a of recordAchievementEvent(event, detail)) {
    ctx.send({ type: 'achievementUnlocked', achievement: a });
  }
}

/**
 * Registers (or touches) a workspace, tells the webview, and COUNTS it.
 *
 * The counting is the reason this is a function. `touchWorkspace` had three
 * call sites and not one of them fed the achievement, so `counters.workspaces`
 * stayed at 0 forever and the 'campus' milestone ('Register 3 workspaces') was
 * unreachable by construction. Every path that puts an office on the campus
 * goes through here now, so a new one cannot forget again.
 */
function registerWorkspace(workspacePath: string): void {
  const workspaces = touchWorkspace(workspacePath);
  ctx.send({ type: 'workspacesLoaded', workspaces });
  trackAchievement('workspaceAdded', { workspaces: workspaces.length });
}

// ── The Assistant ────────────────────────────────────────────
// A global chat session with campus-wide tools: it reads project/agent
// state, backlogs and usage, and can dispatch new agents to workspaces.
// The assistant's CEO-style planning procedure: forcing questions on scope,
// then well-specified tasks written to the board, then human-gated dispatch.
const ASSISTANT_PLANNING_PROCEDURE =
  ' PLANNING PROCEDURE — run this whenever the user brings a goal, feature idea, or ' +
  'asks to plan work: ' +
  '(1) SCOPE: before writing any tasks, ask at most 3 forcing questions, and only ' +
  'those not already answered: what is the smallest shippable version? what is ' +
  'explicitly OUT of scope? how do we verify it worked? ' +
  '(2) SPECIFY: decompose into 2-7 self-contained tasks, written via add_task in ' +
  'priority order. Each task text must start with a role tag in brackets — [build], ' +
  '[review], [qa], [security], [docs], [release], [marketing] — followed by what to do and ' +
  'acceptance criteria ("Done when: ..."). A task must be executable by an agent with ' +
  'no other context than its text. ' +
  '(3) CONFIRM, do not dispatch: after writing the tasks, tell the user to review ' +
  'them on the Board, where they can edit the text, delete a task, or move it up and ';
'down the backlog. Only call create_agent ' +
  'once the user approves dispatch. ' +
  '(4) DISPATCH with a budget: check agents_status first and keep at most 3 agents ' +
  'busy at once unless the user says otherwise; prefer assigning to an idle agent in ' +
  "that workspace before creating a new one. Pass create_agent's role matching the " +
  "task's tag (review/qa→qa, security→security, docs→writer, release→release) so the " +
  'agent gets the right charter and tool policy.';

function openAssistant(): void {
  // Tab-only by design: the assistant has no office or character on the
  // campus (user preference) — she exists purely as her chat session.
  const id = nextAgentId++;
  assistantAgentId = id;

  const session = startChatSession({
    agentId: id,
    sessionId: crypto.randomUUID(),
    cwd: os.homedir(),
    label: 'Assistant',
    send: ctx.send,
    systemPromptAppend:
      'You are the campus assistant of Agent Campus, a mission-control app where a ' +
      'developer runs multiple Claude Code agents across project workspaces (offices). ' +
      'Your job is orchestration: keep an overview of workspaces, agents, tasks and ' +
      'spending via your campus tools, help the user prioritize, and dispatch work by ' +
      'creating agents with clear, self-contained task prompts. You can also set up ' +
      'recurring scheduled runs (list/add/remove_schedule) when the user wants work done ' +
      'on a cadence — confirm workspace, cadence and prompt before creating one. Prefer ' +
      'checking real state with tools over assuming. Be concise.' +
      ASSISTANT_PLANNING_PROCEDURE,
    toolsFactory: (sdk, z) => ({
      mcpServers: {
        campus: sdk.createSdkMcpServer({
          name: 'campus',
          tools: [
            sdk.tool(
              'list_workspaces',
              'List registered workspaces with agent and open-task counts.',
              {},
              async () => {
                const data = loadWorkspaces().map((w) => ({
                  path: w.path,
                  name: w.name,
                  agents: [...ctx.agents.values()].filter((a) => a.cwd === w.path).length,
                  openTasks: getTodos(w.path).filter((t) => t.status === 'open').length,
                }));
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
              },
            ),
            sdk.tool(
              'agents_status',
              'Live status of every active agent: workspace, busy state, and current plan.',
              {},
              async () => {
                const data = [...chatSessions.values()]
                  .filter((cs) => cs.agentId !== assistantAgentId && !cs.ended)
                  .map((cs) => ({
                    agentId: cs.agentId,
                    workspace: cs.cwd,
                    busy: cs.busy,
                    plan: cs.latestTodos,
                  }));
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
              },
            ),
            sdk.tool(
              'list_tasks',
              'List the shared task list of a workspace.',
              { workspacePath: z.string() },
              async (args) => ({
                content: [
                  { type: 'text', text: JSON.stringify(getTodos(args.workspacePath), null, 2) },
                ],
              }),
            ),
            sdk.tool(
              'add_task',
              'Add a task to a workspace backlog.',
              { workspacePath: z.string(), text: z.string() },
              async (args) => {
                ctx.send({
                  type: 'workspaceTodos',
                  path: args.workspacePath,
                  todos: addTodo(args.workspacePath, args.text),
                });
                return { content: [{ type: 'text', text: 'Task added.' }] };
              },
            ),
            sdk.tool(
              'usage_summary',
              'Spending summary: today, month, all-time, per project.',
              {},
              async () => ({
                content: [{ type: 'text', text: JSON.stringify(summarizeUsage(), null, 2) }],
              }),
            ),
            sdk.tool(
              'create_agent',
              'Dispatch a new agent to a workspace with a self-contained task prompt. ' +
                'Pass role for specialist work: it gives the agent a charter and tool ' +
                'policy (qa/security are read-only reviewers). Omit for build tasks.',
              {
                workspacePath: z.string(),
                task: z.string(),
                role: z.enum(DISPATCH_ROLE_IDS as [string, ...string[]]).optional(),
              },
              async (args) => {
                await launchChatAgent(
                  inWorkspace(args.workspacePath),
                  undefined,
                  args.task,
                  args.role ?? roleForTaskText(args.task),
                );
                return {
                  content: [{ type: 'text', text: `Agent dispatched to ${args.workspacePath}.` }],
                };
              },
            ),
            sdk.tool(
              'list_schedules',
              'List recurring scheduled agent runs (id, workspace, prompt, cadence, enabled).',
              {},
              async () => ({
                content: [{ type: 'text', text: JSON.stringify(loadSchedules(), null, 2) }],
              }),
            ),
            sdk.tool(
              'add_schedule',
              'Create a recurring scheduled agent run. The prompt must be fully ' +
                'self-contained (the run is unattended). kind daily needs time; weekly ' +
                'needs time + days (0=Sunday); interval needs everyMinutes. Confirm ' +
                'workspace, cadence and prompt with the user before creating.',
              {
                workspacePath: z.string(),
                prompt: z.string(),
                role: z.enum(DISPATCH_ROLE_IDS as [string, ...string[]]).optional(),
                kind: z.enum(['daily', 'weekly', 'interval']),
                time: z
                  .string()
                  .regex(/^\d{1,2}:\d{2}$/)
                  .optional(),
                days: z.array(z.number().min(0).max(6)).optional(),
                everyMinutes: z.number().min(1).optional(),
              },
              async (args) => {
                if ((args.kind === 'daily' || args.kind === 'weekly') && !args.time) {
                  return { content: [{ type: 'text', text: 'Error: this kind needs time.' }] };
                }
                if (args.kind === 'weekly' && !args.days?.length) {
                  return { content: [{ type: 'text', text: 'Error: weekly needs days.' }] };
                }
                if (args.kind === 'interval' && !args.everyMinutes) {
                  return {
                    content: [{ type: 'text', text: 'Error: interval needs everyMinutes.' }],
                  };
                }
                addSchedule({
                  workspacePath: args.workspacePath,
                  prompt: args.prompt,
                  role: args.role,
                  kind: args.kind,
                  time: args.time,
                  days: args.days,
                  everyMinutes: args.everyMinutes,
                  enabled: true,
                });
                sendSchedules();
                return { content: [{ type: 'text', text: 'Schedule created and enabled.' }] };
              },
            ),
            sdk.tool(
              'remove_schedule',
              'Delete a scheduled run by id (from list_schedules).',
              { id: z.string() },
              async (args) => {
                removeSchedule(args.id);
                scheduleLastAgent.delete(args.id);
                sendSchedules();
                return { content: [{ type: 'text', text: 'Schedule removed.' }] };
              },
            ),
          ],
        }),
      },
      allowedTools: [
        'mcp__campus__list_workspaces',
        'mcp__campus__agents_status',
        'mcp__campus__list_tasks',
        'mcp__campus__add_task',
        'mcp__campus__usage_summary',
        'mcp__campus__create_agent',
        'mcp__campus__list_schedules',
        'mcp__campus__add_schedule',
        'mcp__campus__remove_schedule',
      ],
    }),
    onRateLimit: recordRateLimit,
    onTurnComplete: (costUsd, durationMs, turnSessionId) => {
      recordTurnUsage(os.homedir(), costUsd, durationMs, turnSessionId);
    },
    onExit: () => {
      // Same as launchChatAgent: keep the inert session for tab replay
      chatSessions.get(id)?.dispose();
      if (assistantAgentId === id) assistantAgentId = null;
    },
  });
  chatSessions.set(id, session);
  ctx.send({ type: 'chat-created', agentId: id, label: 'Assistant' });
}

// ── Scheduler ────────────────────────────────────────────────
// Recurring dispatch: due schedules launch a chat agent with their prompt
// and role. On macOS this keeps working with the window closed (the app
// stays alive); unattended runs that hit permissions land in "Needs You".
function sendSchedules(): void {
  ctx.send({ type: 'schedulesLoaded', schedules: loadSchedules() });
}

async function dispatchSchedule(s: ScheduleEntry): Promise<void> {
  console.log(`[Agent Campus] Schedule ${s.id}: dispatching to ${s.workspacePath}`);
  const agentId = await launchChatAgent(
    inWorkspace(s.workspacePath),
    undefined,
    `Scheduled run. ${s.prompt}\n\nThis run is unattended: work autonomously, and if you ` +
      `finish or get blocked, leave a clear report as your final message.`,
    s.role,
  );
  scheduleLastAgent.set(s.id, agentId);
  trackAchievement('scheduleRan');
}

function schedulerTick(): void {
  // Checked BEFORE collecting, because collecting stamps lastRunAtMs: a run
  // skipped after that point is a run lost, while one never collected stays
  // due and fires on the tick after the window frees.
  if (rateLimitBlocksDispatch()) {
    if (!rateLimitDeferralAnnounced) {
      rateLimitDeferralAnnounced = true;
      notify('info', 'Scheduled runs are waiting: this account is out of usage for now.');
    }
    return;
  }
  for (const s of collectDueSchedules()) {
    // Skip if this schedule's previous agent is still working — the next
    // tick after it frees up will fire (lastRunAtMs was already stamped,
    // so time-of-day kinds skip to the next occurrence instead of piling up).
    const lastAgentId = scheduleLastAgent.get(s.id);
    const lastSession = lastAgentId !== undefined ? chatSessions.get(lastAgentId) : undefined;
    if (lastSession && !lastSession.ended && lastSession.busy) {
      console.log(`[Agent Campus] Schedule ${s.id}: previous agent still busy — skipping run`);
      continue;
    }
    // Fire and forget: a slow start must not hold up the other due
    // schedules, and the stamp that stops it firing twice is already set.
    void dispatchSchedule(s).then(sendSchedules);
  }
}

// ── Session resume ───────────────────────────────────────────
const RESUME_LIST_MAX = 20;

// ── Renderer message handling ────────────────────────────────
function isTrustedSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  return mainWindow !== null && event.sender === mainWindow.webContents;
}

function setupIpcHandlers(): void {
  // PTY I/O — keystrokes and geometry only; commands are built in main.
  ipcMain.on('pty-input', (event, opts: { id: string; data: string }) => {
    if (!isTrustedSender(event)) return;
    const record = ptys.get(opts.id);
    if (record) {
      record.lastInputAt = Date.now();
      record.proc.write(opts.data);
    }
  });

  ipcMain.on('pty-resize', (event, opts: { id: string; cols: number; rows: number }) => {
    if (!isTrustedSender(event)) return;
    try {
      ptys.get(opts.id)?.proc.resize(opts.cols, opts.rows);
    } catch {
      // Resize can fail if process already exited
    }
  });

  ipcMain.on('pty-kill', (event, opts: { id: string }) => {
    if (!isTrustedSender(event)) return;
    killPty(opts.id);
  });

  // A terminal tab's xterm instance mounted — replay its scrollback so
  // output produced before mount (or before a renderer reload) is shown.
  ipcMain.on('pty-ready', (event, opts: { id: string }) => {
    if (!isTrustedSender(event)) return;
    const record = ptys.get(opts.id);
    if (record) {
      ctx.send({ type: 'pty-replay', ptyId: opts.id, data: record.scrollback });
    }
  });

  ipcMain.on('webview-message', (event, msg) => {
    if (!isTrustedSender(event)) return;
    handleWebviewMessage(msg as WebviewToHostMessage);
  });
}

/** Resolves the working directory for a new agent, showing a picker when needed. */
async function resolveAgentCwd(folderPath: string | undefined): Promise<string | null> {
  if (folderPath) return folderPath;
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a project folder for this agent',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: os.homedir(),
  });
  return result.filePaths[0] ?? null;
}

/**
 * Focuses a chat tab, re-sending chat-created first. The renderer dedupes
 * chat-created by tab key, so for a live tab this is a no-op — but if the
 * tab was somehow lost (renderer hiccup, missed message), clicking the
 * character recreates it and its ChatView replays history via chatReady.
 */
function focusChatTab(agentId: number): void {
  const session = chatSessions.get(agentId);
  if (session) {
    const agent = ctx.agents.get(agentId);
    ctx.send({
      type: 'chat-created',
      agentId,
      label: session.label,
      // The Assistant is not a registered agent and stays ungrouped. A real
      // one groups by its OFFICE (the repo), never by a worktree checkout.
      ...(agent
        ? {
            workspacePath: agent.workspacePath,
            folderName: path.basename(agent.workspacePath),
            ...(agent.branch ? { branch: agent.branch } : {}),
          }
        : {}),
    });
  }
  ctx.send({ type: 'chat-focus', agentId });
}

function handleWebviewMessage(msg: WebviewToHostMessage): void {
  if (msg.type === 'webviewReady') {
    onWebviewReady();
  } else if (msg.type === 'recheckClaudeAuth') {
    void sendClaudeAuth();
  } else if (msg.type === 'setOfficeTemplate') {
    if (isValidLayout(msg.layout) && writeOfficeTemplate(msg.layout)) {
      console.log(`[Agent Campus] Starter office saved to ${officeTemplatePath()}`);
      ctx.send({ type: 'layoutLoaded', layout: msg.layout });
    }
  } else if (msg.type === 'resetOfficeTemplate') {
    clearOfficeTemplate();
    const layout = loadDefaultLayout(getAssetsRoot());
    ctx.send({ type: 'layoutLoaded', layout });
  } else if (msg.type === 'startClaudeLogin') {
    startClaudeLogin();
  } else if (msg.type === 'openClaude') {
    void resolveAgentCwd(msg.folderPath).then(async (cwd) => {
      if (!cwd) return;
      const place = await placeForRequest(cwd, msg.worktree);
      if (place) launchAgent(place);
    });
  } else if (msg.type === 'openAssistant') {
    if (assistantAgentId !== null && chatSessions.has(assistantAgentId)) {
      focusChatTab(assistantAgentId);
    } else {
      openAssistant();
    }
    if (msg.prompt && assistantAgentId !== null) {
      chatSessions.get(assistantAgentId)?.send(msg.prompt);
    }
  } else if (msg.type === 'openChatAgent') {
    void resolveAgentCwd(msg.folderPath).then(async (cwd) => {
      if (!cwd) return;
      const place = await placeForRequest(cwd, msg.worktree);
      if (place) void launchChatAgent(place);
    });
  } else if (msg.type === 'chatSend') {
    chatSessions.get(msg.id)?.send(msg.text, msg.images);
  } else if (msg.type === 'chatInterrupt') {
    chatSessions.get(msg.id)?.interrupt();
  } else if (msg.type === 'chatReady') {
    const session = chatSessions.get(msg.id);
    if (session) {
      ctx.send({ type: 'chat-replay', agentId: msg.id, events: session.history });
      ctx.send({ type: 'chat-busy', agentId: msg.id, busy: session.busy });
      // The one-shot 'chat-mode' at SDK init is lost if the ChatView mounts
      // later (closed panel, recreated tab, webview reload) — re-send the
      // authoritative mode so the selector doesn't stay stuck on 'default'
      ctx.send({ type: 'chat-mode', agentId: msg.id, mode: session.mode });
      // Same one-shot problem as the mode: the model list arrives at SDK init
      ctx.send({
        type: 'chat-models',
        agentId: msg.id,
        models: session.models,
        current: session.model,
      });
      // Same reason as the mode: the offer lives outside the replayed
      // transcript, so a reloaded webview would otherwise lose it.
      ctx.send({
        type: 'chat-suggestion',
        agentId: msg.id,
        suggestion: session.latestSuggestion,
      });
      // Same one-shot problem as the mode and the models: the command list
      // arrives at SDK init, and skills can change it mid-session.
      ctx.send({ type: 'chat-commands', agentId: msg.id, commands: session.commands });
      // Same reason again: the gauge is session state, not transcript, so a
      // reloaded webview has no idea how full the window is until we ask.
      session.refreshContextUsage();
      // A question/permission may still be parked from before the reload
      session.replayPendingPermissions();
    }
  } else if (msg.type === 'chatPermissionResponse') {
    chatSessions
      .get(msg.id)
      ?.respondPermission(msg.requestId, msg.allow, msg.message, msg.updatedInput, msg.alwaysAllow);
  } else if (msg.type === 'chatSetPermissionMode') {
    chatSessions.get(msg.id)?.setMode(msg.mode);
  } else if (msg.type === 'chatSetModel') {
    chatSessions.get(msg.id)?.setModel(msg.model);
    persistAgentModel(msg.id, msg.model);
  } else if (msg.type === 'listResumableSessions') {
    void (async () => {
      const cwd = await resolveAgentCwd(msg.folderPath);
      if (cwd) {
        void (async () => {
          const all = await listResumableSessions(cwd, RESUME_LIST_MAX);
          // A session already open as an agent is not resumable: resuming it
          // would attach a second character to the same transcript.
          const live = new Set([...ctx.agents.values()].map((a) => a.sessionId));
          ctx.send({
            type: 'sessionList',
            folderPath: cwd,
            sessions: all.filter((session) => !live.has(session.sessionId)),
          });
        })();
      }
    })();
  } else if (msg.type === 'addWorkspace') {
    void (async () => {
      const cwd = await resolveAgentCwd(undefined);
      if (cwd) {
        registerWorkspace(cwd);
      }
    })();
  } else if (msg.type === 'requestAgentChanges') {
    const agent = ctx.agents.get(msg.agentId);
    // Closed while its panel was open. Answering with an error beats the
    // silent `return` this used to do, which left the panel reading "Reading…"
    // for as long as it stayed open.
    if (!agent) {
      ctx.send({
        type: 'agentChanges',
        agentId: msg.agentId,
        cwd: '',
        files: [],
        error: 'That agent is gone.',
      });
      return;
    }
    // gitRepoRoot answers null outside a repo, which is the one case worth
    // distinguishing from "a repo with nothing changed in it".
    const inRepo = gitRepoRoot(agent.cwd) !== null;
    const branch = currentBranch(agent.cwd);
    ctx.send({
      type: 'agentChanges',
      agentId: msg.agentId,
      cwd: agent.cwd,
      ...(branch ? { branch } : {}),
      files: inRepo ? changedFiles(agent.cwd) : [],
      ...(inRepo ? {} : { error: 'This agent is not working in a git repository.' }),
    });
  } else if (
    msg.type === 'commitAgentWork' ||
    msg.type === 'pushAgentWork' ||
    msg.type === 'createAgentPr'
  ) {
    void runAgentGitWrite(msg);
  } else if (msg.type === 'requestFileMentions') {
    void (async () => {
      const agent = ctx.agents.get(msg.agentId);
      // Answers even when the agent is gone: a composer left waiting on a
      // reply it will never get shows a popup that never fills in.
      const paths = agent
        ? rankFileMatches(await listWorkspaceFiles(agent.cwd), msg.query, FILE_MENTION_LIMIT)
        : [];
      ctx.send({ type: 'fileMentions', agentId: msg.agentId, query: msg.query, paths });
    })();
  } else if (msg.type === 'stopSubagentTask') {
    chatSessions.get(msg.agentId)?.stopTask(msg.taskId);
  } else if (msg.type === 'rewindAgentFiles') {
    void (async () => {
      const session = chatSessions.get(msg.agentId);
      const result = session
        ? await session.rewindFiles(msg.userMessageId, msg.dryRun)
        : { canRewind: false, error: 'That agent is gone, so there is nothing to rewind.' };
      ctx.send({
        type: 'agentRewindResult',
        agentId: msg.agentId,
        userMessageId: msg.userMessageId,
        dryRun: msg.dryRun,
        canRewind: result.canRewind,
        ...(result.error ? { error: result.error } : {}),
        ...(result.filesChanged ? { fileCount: result.filesChanged.length } : {}),
        ...(result.insertions !== undefined ? { insertions: result.insertions } : {}),
        ...(result.deletions !== undefined ? { deletions: result.deletions } : {}),
        ...(result.skippedLinks ? { skippedLinks: result.skippedLinks } : {}),
      });
      // The office's view of the work just changed on disk.
      const agent = ctx.agents.get(msg.agentId);
      if (!msg.dryRun && result.canRewind && agent) {
        ctx.send({
          type: 'agentChanges',
          agentId: msg.agentId,
          cwd: agent.cwd,
          ...(currentBranch(agent.cwd) ? { branch: currentBranch(agent.cwd) as string } : {}),
          files: changedFiles(agent.cwd),
        });
      }
    })();
  } else if (msg.type === 'requestAgentFileDiff') {
    const agent = ctx.agents.get(msg.agentId);
    // Same as above: an unanswered request reads as a diff that never loads.
    if (!agent) {
      ctx.send({ type: 'agentFileDiff', agentId: msg.agentId, file: msg.file, patch: '' });
      return;
    }
    ctx.send({
      type: 'agentFileDiff',
      agentId: msg.agentId,
      file: msg.file,
      patch: fileDiff(agent.cwd, msg.file, msg.untracked),
    });
  } else if (msg.type === 'addTodo') {
    ctx.send({ type: 'workspaceTodos', path: msg.path, todos: addTodo(msg.path, msg.text) });
  } else if (msg.type === 'toggleTodo') {
    const wasOpen = getTodos(msg.path).find((t) => t.id === msg.id)?.status === 'open';
    ctx.send({ type: 'workspaceTodos', path: msg.path, todos: toggleTodo(msg.path, msg.id) });
    if (wasOpen) trackAchievement('taskCompleted');
  } else if (msg.type === 'deleteTodo') {
    ctx.send({ type: 'workspaceTodos', path: msg.path, todos: deleteTodo(msg.path, msg.id) });
  } else if (msg.type === 'editTodo') {
    ctx.send({
      type: 'workspaceTodos',
      path: msg.path,
      todos: editTodo(msg.path, msg.id, msg.text),
    });
  } else if (msg.type === 'moveTodo') {
    ctx.send({
      type: 'workspaceTodos',
      path: msg.path,
      todos: moveTodo(msg.path, msg.id, msg.direction),
    });
  } else if (msg.type === 'assignTodo') {
    const todo = getTodos(msg.path).find((t) => t.id === msg.id);
    if (todo) {
      trackAchievement('taskAssigned');
      void launchChatAgent(
        inWorkspace(msg.path),
        undefined,
        `You are assigned this task (task id: ${todo.id}):\n\n${todo.text}\n\n` +
          `The workspace has a shared task list available through your tasks tools ` +
          `(mcp__tasks__list_tasks / add_task / complete_task). When you have completed ` +
          `and verified this task, call complete_task with the task id above. If you ` +
          `discover follow-up work worth tracking, record it with add_task.`,
        roleForTaskText(todo.text),
      );
    }
  } else if (msg.type === 'openFile') {
    const agent = msg.agentId !== undefined ? ctx.agents.get(msg.agentId) : undefined;
    const outcome = openFileRef(msg.path, msg.line, {
      // An agent's cwd is where its relative paths mean something — for a
      // worktree agent that is the checkout, not the repo.
      cwd: agent?.cwd,
      home: os.homedir(),
      openDefault: (file) => void shell.openPath(file),
      spawnEditor: (editor: LineEditor, args) => {
        try {
          spawn(editor, args, { detached: true, stdio: 'ignore' }).unref();
        } catch (err) {
          console.error('[Agent Campus] Could not start the editor:', err);
          void shell.openPath(msg.path);
        }
      },
    });
    if (outcome.kind === 'missing') {
      notify('error', `No file at ${outcome.file}`);
    } else if (outcome.kind === 'unresolved') {
      notify('error', `Cannot tell where ${outcome.raw} is — no agent to resolve it against.`);
    }
  } else if (msg.type === 'listWorktrees') {
    sendWorktrees(msg.workspacePath);
  } else if (msg.type === 'removeWorktree') {
    const repoRoot = gitRepoRoot(msg.workspacePath);
    if (!repoRoot) return;
    const target = worktreesWithAgents(repoRoot).find((w) => w.path === msg.path);
    const blocker = target ? worktreeRemovalBlocker(target) : 'That worktree no longer exists.';
    if (blocker) {
      notify('error', blocker);
      sendWorktrees(msg.workspacePath);
      return;
    }
    try {
      removeWorktreeDir(repoRoot, msg.path, msg.force);
      notify('info', `Removed ${path.basename(msg.path)} — its branch and commits are kept.`);
    } catch (err) {
      notify('error', `Could not remove the worktree: ${(err as Error).message}`);
    }
    sendWorktrees(msg.workspacePath);
  } else if (msg.type === 'setWorkspaceSetupCommand') {
    ctx.send({
      type: 'workspacesLoaded',
      workspaces: setSetupCommand(msg.path, msg.command),
    });
  } else if (msg.type === 'removeWorkspace') {
    ctx.send({ type: 'workspacesLoaded', workspaces: removeWorkspaceEntry(msg.path) });
  } else if (msg.type === 'resumeChatAgent') {
    void launchChatAgent(inWorkspace(msg.folderPath), msg.sessionId);
  } else if (msg.type === 'saveLayout') {
    if (isValidLayout(msg.layout)) {
      if (msg.workspacePath) {
        const file = getWorkspaceLayoutFile(msg.workspacePath);
        layoutsOwnWrites.set(path.basename(file), Date.now());
        saveJsonFile(file, msg.layout);
      } else {
        // No workspace path: the office being edited is the detached one,
        // which IS the starter office.
        writeOfficeTemplate(msg.layout);
      }
    }
  } else if (msg.type === 'saveAgentSeats') {
    saveAgentSeats(msg.seats);
  } else if (msg.type === 'setSoundEnabled') {
    saveSettings({ soundEnabled: !!msg.enabled });
  } else if (msg.type === 'setNotificationsEnabled') {
    saveSettings({ notificationsEnabled: !!msg.enabled });
    sendSettings();
  } else if (msg.type === 'setDefaultEffort') {
    const effort = EFFORT_LEVELS.find((level) => level === msg.effort) ?? null;
    saveSettings({ defaultEffort: effort });
    sendSettings();
  } else if (msg.type === 'setMaxBudgetUsd') {
    saveSettings({ maxBudgetUsd: msg.usd > 0 ? msg.usd : 0 });
    sendSettings();
  } else if (msg.type === 'setBypassPermissions') {
    saveSettings({ bypassPermissions: !!msg.enabled });
    // Echo back so the Settings checkbox reflects the persisted value
    sendSettings();
  } else if (msg.type === 'setLaunchAtLogin') {
    app.setLoginItemSettings({ openAtLogin: !!msg.enabled });
    // Echo back so the checkbox reflects what the OS actually accepted
    sendSettings();
  } else if (msg.type === 'deleteSchedule') {
    removeSchedule(msg.id);
    scheduleLastAgent.delete(msg.id);
    sendSchedules();
  } else if (msg.type === 'toggleSchedule') {
    setScheduleEnabled(msg.id, msg.enabled);
    sendSchedules();
  } else if (msg.type === 'addSchedule') {
    // Manual creation from the Settings form; same validation the
    // Assistant's add_schedule tool applies.
    const timeOk = /^\d{1,2}:\d{2}$/.test(msg.time ?? '');
    const valid =
      msg.workspacePath.length > 0 &&
      msg.prompt.trim().length > 0 &&
      (msg.kind === 'interval'
        ? (msg.everyMinutes ?? 0) >= 1
        : timeOk && (msg.kind !== 'weekly' || (msg.days?.length ?? 0) > 0));
    if (valid) {
      addSchedule({
        workspacePath: msg.workspacePath,
        prompt: msg.prompt.trim(),
        role: msg.role,
        kind: msg.kind,
        time: msg.time,
        days: msg.days,
        everyMinutes: msg.everyMinutes,
        enabled: true,
      });
      sendSchedules();
    }
  } else if (msg.type === 'resolveMissedSchedules') {
    // Mark everything offered as handled first (run or skip) so the same
    // occurrences aren't re-offered on the next launch, then dispatch picks.
    markSchedulesHandled([...msg.runIds, ...msg.skipIds], Date.now());
    const byId = new Map(loadSchedules().map((s) => [s.id, s]));
    for (const id of msg.runIds) {
      const s = byId.get(id);
      if (s) dispatchSchedule(s);
    }
    sendSchedules();
  } else if (msg.type === 'restoreAgents') {
    const byId = new Map(loadOpenAgents().map((r) => [r.sessionId, r]));
    // Forget the whole offer first: a declined agent must not be offered
    // again, and a restored one re-registers itself (rewriting this list).
    forgetOpenAgents([...msg.sessionIds, ...msg.skipIds]);
    for (const sessionId of msg.sessionIds) {
      const record = byId.get(sessionId);
      if (!record) continue;
      // Back into the checkout it was working in — a worktree agent that
      // came back in the repo would silently abandon its branch's work.
      const place: AgentPlacement = {
        cwd: record.cwd,
        workspacePath: record.workspacePath ?? record.cwd,
        ...(record.branch ? { branch: record.branch } : {}),
      };
      if (record.kind === 'terminal') {
        launchAgent(place, sessionId);
      } else {
        void launchChatAgent(place, sessionId, undefined, record.role);
      }
    }
  } else if (msg.type === 'closeAgent') {
    const id = msg.id;
    const chat = chatSessions.get(id);
    const ptyId = agentToPty.get(id);
    if (chat) {
      chatSessions.delete(id);
      chat.dispose();
      ctx.send({ type: 'chat-close-tab', agentId: id });
      removeAgent(id);
      ctx.send({ type: 'agentClosed', id });
    } else if (ptyId && ptys.has(ptyId)) {
      // Killing the PTY triggers onExit, which removes the agent and
      // announces agentClosed — one path for all terminal deaths.
      ctx.send({ type: 'pty-close-tab', ptyId });
      killPty(ptyId);
    } else {
      removeAgent(id);
      ctx.send({ type: 'agentClosed', id });
    }
  } else if (msg.type === 'renameAgent') {
    renameAgent(msg.id, msg.label);
  } else if (msg.type === 'focusAgent') {
    focusAgentTab(msg.id);
  } else if (msg.type === 'runAgentAction') {
    const agent = ctx.agents.get(msg.id);
    const command = msg.command.trim();
    if (!agent || !command) return;
    if (agent.kind === 'chat') {
      chatSessions.get(msg.id)?.send(command);
      focusChatTab(msg.id);
    } else if (agent.ptyId) {
      const rec = ptys.get(agent.ptyId);
      if (rec) {
        rec.lastInputAt = Date.now();
        rec.proc.write(command);
        const ptyId = agent.ptyId;
        setTimeout(() => {
          const live = ptys.get(ptyId);
          if (live) {
            live.lastInputAt = Date.now();
            live.proc.write('\r');
          }
        }, PTY_ACTION_ENTER_DELAY_MS);
        ctx.send({ type: 'pty-focus', ptyId, agentId: msg.id });
      }
    }
  } else if (msg.type === 'getUsageSummary') {
    ctx.send({ type: 'usageSummary', summary: summarizeUsage() });
  } else if (msg.type === 'openSessionsFolder') {
    if (fs.existsSync(CLAUDE_PROJECTS_DIR)) {
      shell.openPath(CLAUDE_PROJECTS_DIR);
    }
  } else if (msg.type === 'exportLayout') {
    void exportLayout();
  } else if (msg.type === 'importLayout') {
    void importLayout();
  }
}

function onWebviewReady(): void {
  const assetsRoot = getAssetsRoot();

  // Anything the host wanted to say while there was no renderer to say it to.
  for (const notice of pendingNotices.splice(0)) ctx.send({ type: 'hostNotice', ...notice });

  // Session state, like chat-mode and the context gauge: a reloaded webview
  // has no idea the account is near its limit until some session says so
  // again, which may be hours.
  if (latestRateLimit) ctx.send({ type: 'rateLimit', ...latestRateLimit });

  // Rebuild terminal tabs for PTYs that survived a renderer reload; each
  // tab's TerminalInstance requests a scrollback replay via 'pty-ready'.
  for (const [ptyId, record] of ptys) {
    const agentId = ptyToAgent.get(ptyId);
    const agent = agentId !== undefined ? ctx.agents.get(agentId) : undefined;
    // Tabs group by OFFICE, so a worktree agent's tab must replay with its
    // repo — record.cwd is the checkout and would strand it in its own group.
    const workspacePath = agent?.workspacePath ?? record.cwd;
    ctx.send({
      type: 'pty-created',
      ptyId,
      label: record.label,
      ...(agentId !== undefined ? { agentId } : {}),
      ...(workspacePath ? { workspacePath, folderName: path.basename(workspacePath) } : {}),
      ...(agent?.branch ? { branch: agent.branch } : {}),
    });
  }
  // Same for chat tabs — each ChatView requests its history via 'chatReady'.
  // The Assistant is not a registered agent and stays workspace-less (ungrouped).
  for (const [agentId, session] of chatSessions) {
    const agent = ctx.agents.get(agentId);
    ctx.send({
      type: 'chat-created',
      agentId,
      label: session.label,
      ...(agent
        ? {
            workspacePath: agent.workspacePath,
            folderName: path.basename(agent.workspacePath),
            ...(agent.branch ? { branch: agent.branch } : {}),
          }
        : {}),
    });
  }

  // Send existing agents with session-keyed seat/palette metadata
  const agentIds = [...ctx.agents.keys()].sort((a, b) => a - b);
  const metaBySession = loadSeatMetaBySession();
  const agentMeta: Record<number, AgentSeatMeta> = {};
  const folderNames: Record<number, string> = {};
  const branches: Record<number, string> = {};
  for (const [id, agent] of ctx.agents) {
    if (metaBySession[agent.sessionId]) {
      agentMeta[id] = metaBySession[agent.sessionId];
    }
    // The office's name, not the checkout's: worktree agents belong to their repo
    folderNames[id] = path.basename(agent.workspacePath);
    if (agent.branch) branches[id] = agent.branch;
  }
  ctx.send({ type: 'existingAgents', agents: agentIds, agentMeta, folderNames, branches });

  // Decoration is session state, like chat-mode: the webview lost it on
  // reload, and only the host still knows what the agent said about itself.
  for (const [id, agent] of ctx.agents) {
    if (agent.decor) ctx.send({ type: 'agentDecor', id, decor: agent.decor });
  }

  // Load and send assets (fire-and-forget; loaders log their own errors)
  void (async () => {
    const charSprites = await loadCharacterSprites(assetsRoot);
    if (charSprites) sendCharacterSprites(ctx.send, charSprites);
    sendRoleSprites(ctx.send, await loadRoleSprites(assetsRoot));
    const floorTiles = await loadFloorTiles(assetsRoot);
    if (floorTiles) sendFloorTiles(ctx.send, floorTiles);
    const wallTiles = await loadWallTiles(assetsRoot);
    if (wallTiles) sendWallTiles(ctx.send, wallTiles);
    const assets = await loadFurnitureAssets(assetsRoot);
    if (assets) sendAssets(ctx.send, assets);
    ctx.send({ type: 'roomTemplatesLoaded', templates: loadRoomTemplates(assetsRoot) });

    // Send layout AFTER assets (webview buffers agents until layoutLoaded).
    // This is the STARTER office: what an office looks like before its
    // workspace has a design of its own. Per-workspace layouts override it
    // below. ~/.pixel-agents/layout.json is deliberately not consulted here
    // — see officeTemplate.ts for why.
    const layout = readOfficeTemplate() ?? loadDefaultLayout(assetsRoot);
    ctx.send({ type: 'layoutLoaded', layout });

    // Per-workspace layout overrides (offices with their own saved design)
    for (const ws of loadWorkspaces()) {
      const wsLayout = loadJsonFile<Record<string, unknown>>(getWorkspaceLayoutFile(ws.path));
      if (wsLayout && isValidLayout(wsLayout)) {
        console.log(`[Agent Campus] Sending workspace layout override for ${ws.path}`);
        ctx.send({ type: 'layoutLoaded', layout: wsLayout, workspacePath: ws.path });
      }
    }
  })();

  // Send settings
  sendSettings();
  sendSchedules();
  // Offer daily/weekly occurrences missed while the app was closed. Computed
  // per webview ready (not once per launch): once resolved they're stamped
  // handled, so a reload with nothing pending sends nothing.
  const missed = collectMissedSchedules();
  if (missed.length > 0) {
    ctx.send({ type: 'missedSchedules', missed });
  }

  // Same shape, one layer up: agents that were open when the app last quit.
  // Filtered against the live set, so a webview reload (where every agent is
  // already running) offers nothing.
  const liveSessions = new Set([...ctx.agents.values()].map((a) => a.sessionId));
  const restorable = restorableAgents(
    loadOpenAgents(),
    (record) =>
      fs.existsSync(path.join(getProjectDirPath(record.cwd), `${record.sessionId}.jsonl`)),
    (sessionId) => liveSessions.has(sessionId),
  );
  if (restorable.length > 0) {
    ctx.send({ type: 'restorableAgents', agents: restorable });
  }

  // Send registered workspaces (offices)
  ctx.send({ type: 'workspacesLoaded', workspaces: loadWorkspaces() });
  ctx.send({ type: 'usageSummary', summary: summarizeUsage() });
  ctx.send({ type: 'achievementsLoaded', achievements: listAchievements() });
  // Auth probe runs in the background: it spawns the CLI, and the office
  // should not wait on it to appear.
  void sendClaudeAuth();

  // Send human todos + live agent plans
  for (const p of getAllTodoPaths()) {
    ctx.send({ type: 'workspaceTodos', path: p, todos: getTodos(p) });
  }
  for (const [agentId, session] of chatSessions) {
    if (session.latestTodos.length > 0) {
      ctx.send({ type: 'agent-todos', agentId, todos: session.latestTodos });
    }
  }

  // Re-send current agent statuses
  for (const [agentId, agent] of ctx.agents) {
    for (const [toolId, status] of agent.activeToolStatuses) {
      const subagentRole = agent.activeTaskSubagentRoles.get(toolId);
      ctx.send({
        type: 'agentToolStart',
        id: agentId,
        toolId,
        status,
        ...(subagentRole ? { subagentRole } : {}),
      });
    }
    if (agent.isWaiting) {
      ctx.send({ type: 'agentStatus', id: agentId, status: 'waiting' });
    }
  }
}

/**
 * Remembers a chat agent's model by SESSION id, so resuming it (or reloading
 * the window) comes back on the same model. null clears the choice.
 */
function persistAgentModel(agentId: number, model: string | null): void {
  const agent = ctx.agents.get(agentId);
  if (!agent) return;
  const bySession = loadSeatMetaBySession();
  bySession[agent.sessionId] = { ...bySession[agent.sessionId], model };
  saveJsonFile(AGENT_SEATS_FILE, { bySession });
}

function saveAgentSeats(seatsById: Record<string, AgentSeatMeta> | undefined): void {
  if (!seatsById) return;
  // Re-key by session id so the metadata survives window reloads (agent ids don't)
  const bySession = loadSeatMetaBySession();
  for (const [idStr, meta] of Object.entries(seatsById)) {
    const agent = ctx.agents.get(Number(idStr));
    if (agent) {
      // The webview tracks neither names nor models — preserve the
      // host-written ones instead of letting a seat save drop them
      const prev = bySession[agent.sessionId];
      const name = meta.name ?? prev?.name;
      const model = meta.model ?? prev?.model;
      bySession[agent.sessionId] = {
        ...meta,
        ...(name ? { name } : {}),
        ...(model ? { model } : {}),
      };
    }
  }
  saveJsonFile(AGENT_SEATS_FILE, { bySession });
}

/**
 * Export the STARTER office — the layout a new workspace is born with — which
 * is exactly what importLayout() replaces. Falls back to the bundled default
 * when the user has not set a starter of their own.
 */
async function exportLayout(): Promise<void> {
  if (!mainWindow) return;
  const layout = readOfficeTemplate() ?? loadDefaultLayout(getAssetsRoot());
  if (!layout) return;
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    defaultPath: path.join(os.homedir(), 'agent-campus-layout.json'),
  });
  if (result.filePath) {
    try {
      fs.writeFileSync(result.filePath, JSON.stringify(layout, null, 2), 'utf-8');
      notify('info', `Saved the starter office to ${path.basename(result.filePath)}.`);
    } catch (err) {
      notify(
        'error',
        `Could not write ${path.basename(result.filePath)}: ${(err as Error).message}`,
      );
    }
  }
}

/**
 * Import the STARTER office. Two things used to happen in silence here: a file
 * that failed validation was answered with `return` — the user picked
 * something and nothing at all happened — and a file that passed REPLACED the
 * layout every new workspace is born with, unasked.
 */
async function importLayout(): Promise<void> {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.filePaths.length === 0) return;
  const file = result.filePaths[0];
  const name = path.basename(file);

  let parsed: LayoutParseResult;
  try {
    parsed = parseLayout(JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch (err) {
    notify('error', `Could not read ${name}: ${(err as Error).message}`);
    return;
  }
  if (!parsed.ok) {
    notify('error', `${name} is not an office layout — ${parsed.reason}`);
    return;
  }

  // Only ask when there is something to lose: with no starter of their own,
  // new offices come from the layout the app ships with, and that is not the
  // user's work. One they chose deliberately is.
  if (readOfficeTemplate()) {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Replace', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: 'Replace the starter office?',
      detail:
        `${name} becomes the office every NEW workspace is born with, in place of the ` +
        'one you set. Offices that already exist keep their own design.',
    });
    if (choice.response !== 0) return;
  }

  if (!writeOfficeTemplate(parsed.layout)) {
    notify('error', `Could not save ${name} as the starter office.`);
    return;
  }
  ctx.send({ type: 'layoutLoaded', layout: parsed.layout });
  notify('info', `${name} is now the starter office for new workspaces.`);
}

// ── Window Creation ──────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    title: 'Agent Campus',
    backgroundColor: WINDOW_BACKGROUND,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The app only ever shows local content — block navigation and new windows.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.VITE_DEV_SERVER_URL;
    if (!(devServer && url.startsWith(devServer)) && !url.startsWith('file://')) {
      event.preventDefault();
      // In-app links (e.g. the setup hint in chat error cards) open in the
      // system browser instead of navigating the window.
      if (url.startsWith('https://')) void shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // In development, load from Vite dev server; in production, load built files
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'webview', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Attention: Dock badge + desktop notifications ────────────
// Bubbles in the office only help while you look at the window. These reach
// you when you don't: the Dock badge counts agents that need you, and a
// notification fires when an agent has been blocked for a while, or finishes
// a turn while the window is in the background.
const attention = new AttentionTracker();
/** Latest permission prompt sentence per chat agent, for the notification body. */
const lastRequestTitle = new Map<number, string>();
/** Shown notifications stay referenced until closed, or their click handler is GC'd. */
const liveNotifications = new Set<Notification>();
let attentionTimer: ReturnType<typeof setInterval> | null = null;
let lastBadgeCount = -1;

function windowHasFocus(): boolean {
  return !!mainWindow && mainWindow.isVisible() && mainWindow.isFocused();
}

function refreshBadge(): void {
  const n = attention.needsYouCount();
  if (n === lastBadgeCount) return;
  lastBadgeCount = n;
  app.setBadgeCount(n); // macOS Dock / Linux launchers; a no-op where unsupported
}

function noteAttention(message: HostToWebviewMessage): void {
  if (message.type === 'chat-permission-request') {
    lastRequestTitle.set(
      message.agentId,
      message.title ?? `Claude wants to use ${message.toolName}`,
    );
  }
  const event = attention.observe(message, Date.now());
  if (event?.kind === 'finished' && !windowHasFocus()) notifyAttention(event);
  refreshBadge();
}

function attentionTick(): void {
  // Cheap, and the only place the windowless app can notice its own count
  // changing: nothing else runs while the office is away.
  refreshTray();
  // Blocks only count as "seen" in the background; while you are looking at
  // the window the ageing bubble is the signal, so they stay due for later.
  if (windowHasFocus()) return;
  for (const event of attention.dueBlocked(Date.now(), BLOCKED_NOTIFY_AFTER_MS)) {
    notifyAttention(event);
  }
}

function notifyAttention(event: AttentionEvent): void {
  const agent = ctx.agents.get(event.agentId);
  if (!agent || !loadSettings().notificationsEnabled || !Notification.isSupported()) return;
  const where = path.basename(agent.cwd);
  let title: string;
  let body: string;
  if (event.kind === 'blocked') {
    const minutes = Math.max(1, Math.round(event.blockedForMs / 60_000));
    title = `${agent.label} is waiting for you`;
    body = `${lastRequestTitle.get(event.agentId) ?? 'Needs your permission to continue'} · ${minutes} min · ${where}`;
  } else {
    title = `${agent.label} finished`;
    body = `Turn complete in ${where}`;
  }
  const n = new Notification({ title, body, silent: event.kind === 'finished' });
  liveNotifications.add(n);
  n.on('click', () => showAgent(event.agentId));
  n.on('close', () => liveNotifications.delete(n));
  n.show();
}

/** Open the terminal / chat tab that belongs to an agent. */
function focusAgentTab(id: number): void {
  attention.acknowledge(id);
  refreshBadge();
  const agent = ctx.agents.get(id);
  if (agent?.kind === 'chat') {
    focusChatTab(id);
  } else if (agent?.ptyId) {
    ctx.send({ type: 'pty-focus', ptyId: agent.ptyId, agentId: id });
  }
}

/** Notification click: bring the window up and land on that agent. */
function showAgent(id: number): void {
  showWindow();
  ctx.send({ type: 'agentSelected', id });
  focusAgentTab(id);
}

// ── Background mode: the app outlives its window ───────────
// See backgroundMode.ts for why. Everything here is the glue the policy
// cannot be: creating a tray, and whether that even worked.

let tray: Tray | null = null;
/** The "still running" explainer is a one-off per launch, not per close. */
let backgroundNoticeShown = false;
/**
 * Notices that had nowhere to go: a window being re-created has no renderer
 * to receive a hostNotice, so the message waits for its webviewReady.
 */
const pendingNotices: Array<{ level: 'info' | 'error'; text: string }> = [];

/** Live sessions. Sub-agents are webview-only, so this counts real ones. */
function liveAgentCount(): number {
  return ctx.agents.size;
}

function activeScheduleCount(): number {
  try {
    return loadSchedules().filter((entry) => entry.enabled).length;
  } catch {
    return 0;
  }
}

/** Bring the window up, creating it if the app is running without one. */
function showWindow(): void {
  if (!mainWindow) {
    createWindow();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  // The tray exists to represent an app with no window; with one back up it
  // would be a second, redundant way in.
  destroyTray();
}

function trayIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'icon.png')
    : path.join(__dirname, '..', '..', 'icon.png');
}

/**
 * The tray icon, or null when this desktop cannot show one.
 *
 * Linux is the reason for the null: a session with no StatusNotifier host
 * either throws here or shows nothing at all, and an icon nobody can see is
 * indistinguishable from a hung process. An empty image counts as failure for
 * the same reason — a blank tray slot is not a way back.
 */
function ensureTray(): Tray | null {
  if (tray) {
    refreshTray();
    return tray;
  }
  try {
    const icon = nativeImage
      .createFromPath(trayIconPath())
      .resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });
    if (icon.isEmpty()) return null;
    tray = new Tray(icon);
    // Windows opens the menu on right-click and expects a left click to do
    // the obvious thing; Linux desktops vary, which is why the menu carries
    // the same action.
    tray.on('click', () => showWindow());
    tray.on('double-click', () => showWindow());
    refreshTray();
    return tray;
  } catch (err) {
    console.error('[Agent Campus] No system tray available:', err);
    tray = null;
    return null;
  }
}

/** Keeps the tooltip and the Quit label honest as agents come and go. */
function refreshTray(): void {
  if (!tray) return;
  const agents = liveAgentCount();
  tray.setToolTip(trayTooltip(agents, activeScheduleCount()));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Agent Campus', click: () => showWindow() },
      { type: 'separator' },
      { label: quitItemLabel(agents), click: () => app.quit() },
    ]),
  );
}

function destroyTray(): void {
  tray?.destroy();
  tray = null;
}

/**
 * Says, once, that closing the window did not stop anything — otherwise the
 * app has simply vanished, which is the behaviour this change exists to fix
 * read the other way round.
 */
function noteBackgroundMode(agents: number): void {
  if (backgroundNoticeShown || !Notification.isSupported()) return;
  if (!loadSettings().notificationsEnabled) return;
  backgroundNoticeShown = true;
  const n = new Notification({
    title: 'Agent Campus is still running',
    body:
      agents > 0
        ? `${agents} agent${agents === 1 ? '' : 's'} kept working. Open it from the tray icon.`
        : 'Schedules keep running. Open it from the tray icon.',
    silent: true,
  });
  liveNotifications.add(n);
  n.on('click', () => showWindow());
  n.on('close', () => liveNotifications.delete(n));
  n.show();
}

// ── App Lifecycle ────────────────────────────────────────────
/**
 * True once shutdown began. Quitting tears down every agent, and the open-agent
 * snapshot must not follow it down to an empty list.
 */
let shuttingDown = false;

function cleanupAndQuit(): void {
  shuttingDown = true;
  destroyTray();
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (attentionTimer) {
    clearInterval(attentionTimer);
    attentionTimer = null;
  }
  layoutsDirWatcher?.close();
  layoutsDirWatcher = null;
  for (const timer of layoutsDebounce.values()) clearTimeout(timer);
  layoutsDebounce.clear();
  for (const timer of projectScanTimers.values()) clearInterval(timer);
  projectScanTimers.clear();
  for (const session of chatSessions.values()) session.dispose();
  chatSessions.clear();
  for (const id of [...ctx.agents.keys()]) removeAgent(id);
  for (const ptyId of [...ptys.keys()]) killPty(ptyId);
  ptys.clear();
  for (const timer of decorPushTimers.values()) clearTimeout(timer);
  decorPushTimers.clear();
  campusServer?.close();
  campusServer = null;
}

app.whenReady().then(() => {
  // Before the campus socket: the PATH we hand to agents must be the fixed one
  fixPathEnv();
  void startCampus();
  setupIpcHandlers();

  watchWorkspaceLayouts();

  createWindow();

  schedulerTimer = setInterval(schedulerTick, SCHEDULER_TICK_MS);
  attentionTimer = setInterval(attentionTick, ATTENTION_TICK_MS);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  const agents = liveAgentCount();
  const schedules = activeScheduleCount();
  // Only reach for a tray when there is a reason to live in one: an idle app
  // leaving an icon behind is clutter, and on macOS the dock already serves.
  const wantsBackground =
    !shuttingDown && process.platform !== 'darwin' && (agents > 0 || schedules > 0);
  const action = windowCloseAction({
    platform: process.platform,
    liveAgents: agents,
    activeSchedules: schedules,
    trayAvailable: wantsBackground && ensureTray() !== null,
    quitting: shuttingDown,
  });

  if (action === 'quit') {
    destroyTray();
    app.quit();
    return;
  }
  if (action === 'reopen') {
    // No tray, but agents are mid-flight. The window coming back needs
    // explaining, so the notice waits for the new renderer.
    pendingNotices.push({
      level: 'info',
      text: `Kept ${agents} running agent${agents === 1 ? '' : 's'} alive — this desktop has no tray icon to close the window into. Close their tabs first to stop them.`,
    });
    createWindow();
    return;
  }
  if (process.platform !== 'darwin') noteBackgroundMode(agents);
});

app.on('before-quit', () => {
  cleanupAndQuit();
});

// Handle abrupt termination — kill PTY processes to prevent orphans
process.on('SIGINT', () => {
  cleanupAndQuit();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanupAndQuit();
  process.exit(0);
});
