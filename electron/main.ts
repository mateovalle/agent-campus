import { execFileSync } from 'child_process';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as pty from 'node-pty';
import * as os from 'os';
import * as path from 'path';

import type {
  AgentSeatMeta,
  ResumableSession,
  ScheduleEntry,
  WebviewToHostMessage,
} from '../shared/protocol.js';
import {
  loadCharacterSprites,
  loadDefaultLayout,
  loadFloorTiles,
  loadFurnitureAssets,
  loadRoleSprites,
  loadWallTiles,
  sendAssets,
  sendCharacterSprites,
  sendFloorTiles,
  sendRoleSprites,
  sendWallTiles,
} from '../src/core/assetLoader.js';
import {
  JSONL_POLL_INTERVAL_MS,
  LAYOUT_FILE_DIR,
  PROJECT_SCAN_INTERVAL_MS,
} from '../src/core/constants.js';
import { readNewLines, startFileWatching, stopFileWatching } from '../src/core/fileWatcher.js';
import type { LayoutWatcher } from '../src/core/layoutPersistence.js';
import {
  isValidLayout,
  readLayoutFromFile,
  watchLayoutFile,
  writeLayoutToFile,
} from '../src/core/layoutPersistence.js';
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
import { type ChatSession, startChatSession } from './chatAgent.js';
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
import { addTodo, deleteTodo, getAllTodoPaths, getTodos, toggleTodo } from './todos.js';
import { isSyntheticUserText, loadTranscriptHistory } from './transcriptHistory.js';
import { recordTurnUsage, summarizeUsage } from './usage.js';
import {
  loadWorkspaces,
  removeWorkspace as removeWorkspaceEntry,
  touchWorkspace,
} from './workspaces.js';

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

const DATA_DIR = path.join(os.homedir(), LAYOUT_FILE_DIR);
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
  cwd: string;
  /** Tab display name; starts as "Agent N" / role id, auto-derived from the first prompt. */
  label: string;
  /** True once the label was auto-derived (or restored) — stops further renames. */
  autoNamed: boolean;
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
let layoutWatcher: LayoutWatcher | null = null;

const ctx: TrackerContext<AgentState> = {
  agents: new Map(),
  fileWatchers: new Map(),
  pollingTimers: new Map(),
  waitingTimers: new Map(),
  permissionTimers: new Map(),
  // Resolved at call time so a recreated window keeps receiving messages
  send: (message) => {
    mainWindow?.webContents.send('main-message', message);
  },
  // Sessions live only as long as their PTYs — nothing to persist
  persistAgents: () => {},
  // First real prompt in a session names its tab
  onUserPrompt: (agentId, text) => autoNameAgent(agentId, text),
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

// ── Small JSON persistence helpers ───────────────────────────
function loadJsonFile<T>(file: string): T | null {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
    }
  } catch (err) {
    console.error(`[Pixel Agents] Failed to read ${path.basename(file)}:`, err);
  }
  return null;
}

function saveJsonFile(file: string, value: unknown): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[Pixel Agents] Failed to write ${path.basename(file)}:`, err);
  }
}

// Seat/palette metadata is keyed by SESSION id, not agent id — agent ids are
// assigned in creation order and are not stable across window reloads.
function loadSeatMetaBySession(): Record<string, AgentSeatMeta> {
  return (
    loadJsonFile<{ bySession?: Record<string, AgentSeatMeta> }>(AGENT_SEATS_FILE)?.bySession ?? {}
  );
}

function loadSettings(): { soundEnabled: boolean; bypassPermissions: boolean } {
  return {
    soundEnabled: true,
    bypassPermissions: false,
    ...loadJsonFile<{ soundEnabled?: boolean; bypassPermissions?: boolean }>(SETTINGS_FILE),
  };
}

function saveSettings(patch: Partial<ReturnType<typeof loadSettings>>): void {
  saveJsonFile(SETTINGS_FILE, { ...loadSettings(), ...patch });
}

/** Per-workspace office layout file (~/.pixel-agents/layouts/<sanitized>.json). */
function getWorkspaceLayoutFile(workspacePath: string): string {
  return path.join(DATA_DIR, 'layouts', `${workspacePath.replace(/[^a-zA-Z0-9-]/g, '-')}.json`);
}

// ── Per-workspace layout hot-reload ──────────────────────────
// The default layout has its own cross-window watcher (layoutPersistence);
// this covers the per-workspace override files, so external edits (scripts,
// other windows) apply live instead of waiting for the next app start.
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
            console.log(`[Pixel Agents] Workspace layout changed on disk — pushing ${ws.path}`);
            ctx.send({ type: 'layoutLoaded', layout, workspacePath: ws.path });
          }
        }, WORKSPACE_LAYOUT_DEBOUNCE_MS),
      );
    });
  } catch (err) {
    console.error('[Pixel Agents] Failed to watch workspace layouts:', err);
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
      timeout: 5000,
    });
    if (loginPath && loginPath.length > (process.env.PATH?.length ?? 0)) {
      process.env.PATH = loginPath;
    }
  } catch (err) {
    console.error('[Pixel Agents] Could not resolve login-shell PATH:', err);
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
    env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
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
/** Registers the office character + transcript watching shared by both agent kinds. */
function registerAgent(
  kind: 'terminal' | 'chat',
  cwd: string,
  sessionId: string,
  label: string,
  skipToEnd = false,
): AgentState {
  const projectDir = getProjectDirPath(cwd);
  const expectedFile = path.join(projectDir, `${sessionId}.jsonl`);
  // Pre-register so the /clear scan won't treat this session's own file as new
  knownJsonlFiles.add(expectedFile);

  // A resumed session keeps the name it earned in a previous life
  const storedName = loadSeatMetaBySession()[sessionId]?.name;

  const id = nextAgentId++;
  const agent: AgentState = {
    ...createCoreAgentState(id, projectDir, expectedFile),
    kind,
    sessionId,
    cwd,
    label: storedName ?? label,
    autoNamed: !!storedName,
  };
  ctx.agents.set(id, agent);
  pollForJsonlFile(id, skipToEnd);
  return agent;
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

/** Renames an agent once from its first prompt: state + tab replays + persistence. */
function autoNameAgent(agentId: number, promptText: string): void {
  const agent = ctx.agents.get(agentId);
  if (!agent || agent.autoNamed) return;
  const name = deriveAgentName(promptText);
  if (!name) return;

  agent.label = name;
  agent.autoNamed = true;
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

  ctx.send({ type: 'agentLabel', id: agentId, label: name });
}

function launchAgent(cwd: string): void {
  const sessionId = crypto.randomUUID();
  const agent = registerAgent('terminal', cwd, sessionId, `Agent ${nextTerminalIndex++}`);
  const ptyId = spawnPty({
    cwd,
    command: `claude --session-id ${sessionId}${loadSettings().bypassPermissions ? ` ${CLAUDE_BYPASS_FLAG}` : ''}`,
    sessionId,
    label: agent.label,
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
    workspacePath: cwd,
    folderName: path.basename(cwd),
  });
  ctx.send({
    type: 'agentCreated',
    id: agent.id,
    ptyId,
    agentKind: 'terminal',
    folderName: path.basename(cwd),
    workspacePath: cwd,
  });
  ctx.send({ type: 'workspacesLoaded', workspaces: touchWorkspace(cwd) });
  ensureProjectScan(agent.projectDir);
}

function launchChatAgent(
  cwd: string,
  resumeSessionId?: string,
  initialPrompt?: string,
  roleId?: string,
): number {
  const sessionId = resumeSessionId ?? crypto.randomUUID();
  const role = roleId ? AGENT_ROLE_DEFS[roleId] : undefined;
  // Placeholder until the first prompt names the tab; roles make a better one
  const defaultLabel = role ? role.id : `Agent ${nextTerminalIndex++}`;
  const agent = registerAgent('chat', cwd, sessionId, defaultLabel, !!resumeSessionId);

  // The chat equivalent of terminal scrollback replay: rebuild the previous
  // conversation from the transcript so a resumed tab doesn't start blank.
  const resumedHistory = resumeSessionId ? loadTranscriptHistory(agent.jsonlFile) : [];

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
    ...(role ? { systemPromptAppend: role.charter, disallowedTools: role.disallowedTools } : {}),
    taskHandlers: {
      list: () => getTodos(cwd),
      add: (text) => {
        ctx.send({ type: 'workspaceTodos', path: cwd, todos: addTodo(cwd, text) });
      },
      complete: (id) => {
        const item = getTodos(cwd).find((t) => t.id === id && t.status === 'open');
        if (!item) return false;
        ctx.send({ type: 'workspaceTodos', path: cwd, todos: toggleTodo(cwd, id) });
        trackAchievement('agentTaskCompleted');
        return true;
      },
    },
    onTurnComplete: (costUsd, durationMs) => {
      recordTurnUsage(cwd, costUsd, durationMs);
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
    workspacePath: cwd,
    folderName: path.basename(cwd),
  });
  ctx.send({
    type: 'agentCreated',
    id: agent.id,
    agentKind: 'chat',
    folderName: path.basename(cwd),
    workspacePath: cwd,
    ...(role ? { role: role.id } : {}),
  });
  ctx.send({ type: 'workspacesLoaded', workspaces: touchWorkspace(cwd) });
  trackAchievement('agentSpawned', { concurrentAgents: chatSessions.size });
  if (initialPrompt) {
    session.send(initialPrompt);
  }
  return agent.id;
}

/** Poll until the agent's JSONL file appears, then start watching it. */
function pollForJsonlFile(agentId: number, skipToEnd = false): void {
  const timer = setInterval(() => {
    const agent = ctx.agents.get(agentId);
    if (!agent) {
      clearInterval(timer);
      jsonlPollTimers.delete(agentId);
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

  const ptyId = agentToPty.get(agentId);
  if (ptyId) {
    agentToPty.delete(agentId);
    ptyToAgent.delete(ptyId);
  }
  ctx.agents.delete(agentId);

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
      `[Pixel Agents] New JSONL ${path.basename(file)} → reassigning agent ${target.id} (/clear)`,
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
  detail?: { concurrentAgents?: number; workspaces?: number },
): void {
  for (const a of recordAchievementEvent(event, detail)) {
    ctx.send({ type: 'achievementUnlocked', achievement: a });
  }
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
  'them on the Board (they can edit/delete/reorder there). Only call create_agent ' +
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
      'You are the campus assistant of Pixel Agents, a mission-control app where a ' +
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
                launchChatAgent(
                  args.workspacePath,
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
    onTurnComplete: (costUsd, durationMs) => {
      recordTurnUsage(os.homedir(), costUsd, durationMs);
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

function dispatchSchedule(s: ScheduleEntry): void {
  console.log(`[Pixel Agents] Schedule ${s.id}: dispatching to ${s.workspacePath}`);
  const agentId = launchChatAgent(
    s.workspacePath,
    undefined,
    `Scheduled run. ${s.prompt}\n\nThis run is unattended: work autonomously, and if you ` +
      `finish or get blocked, leave a clear report as your final message.`,
    s.role,
  );
  scheduleLastAgent.set(s.id, agentId);
}

function schedulerTick(): void {
  for (const s of collectDueSchedules()) {
    // Skip if this schedule's previous agent is still working — the next
    // tick after it frees up will fire (lastRunAtMs was already stamped,
    // so time-of-day kinds skip to the next occurrence instead of piling up).
    const lastAgentId = scheduleLastAgent.get(s.id);
    const lastSession = lastAgentId !== undefined ? chatSessions.get(lastAgentId) : undefined;
    if (lastSession && !lastSession.ended && lastSession.busy) {
      console.log(`[Pixel Agents] Schedule ${s.id}: previous agent still busy — skipping run`);
      continue;
    }
    dispatchSchedule(s);
    sendSchedules();
  }
}

// ── Session resume ───────────────────────────────────────────
const RESUME_LIST_MAX = 20;
const PREVIEW_READ_BYTES = 65536;
const PREVIEW_MAX_CHARS = 120;

/** Reads the first real user prompt from a transcript for the resume picker. */
function readSessionPreview(jsonlFile: string): string {
  try {
    const fd = fs.openSync(jsonlFile, 'r');
    const buf = Buffer.alloc(PREVIEW_READ_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    for (const line of buf.toString('utf-8', 0, bytesRead).split('\n')) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as {
          type?: string;
          isMeta?: boolean;
          message?: { content?: unknown };
        };
        if (record.type !== 'user' || record.isMeta) continue;
        const content = record.message?.content;
        const candidates: string[] = [];
        if (typeof content === 'string') {
          candidates.push(content);
        } else if (Array.isArray(content)) {
          for (const b of content as Array<{ type?: string; text?: string }>) {
            if (b?.type === 'text' && b.text) candidates.push(b.text);
          }
        }
        for (const candidate of candidates) {
          const text = candidate.trim().replace(/\s+/g, ' ');
          if (text && !isSyntheticUserText(text)) {
            return text.length > PREVIEW_MAX_CHARS ? text.slice(0, PREVIEW_MAX_CHARS) + '…' : text;
          }
        }
      } catch {
        /* partial line */
      }
    }
  } catch {
    /* unreadable */
  }
  return '(no prompt)';
}

function listResumableSessions(cwd: string): ResumableSession[] {
  const projectDir = getProjectDirPath(cwd);
  const activeSessionIds = new Set([...ctx.agents.values()].map((a) => a.sessionId));
  let files: Array<{ file: string; mtimeMs: number }>;
  try {
    files = fs
      .readdirSync(projectDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => {
        const file = path.join(projectDir, f);
        return { file, mtimeMs: fs.statSync(file).mtimeMs };
      });
  } catch {
    return [];
  }
  return files
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .filter(({ file }) => !activeSessionIds.has(path.basename(file, '.jsonl')))
    .slice(0, RESUME_LIST_MAX)
    .map(({ file, mtimeMs }) => ({
      sessionId: path.basename(file, '.jsonl'),
      mtimeMs,
      preview: readSessionPreview(file),
    }));
}

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
    ctx.send({
      type: 'chat-created',
      agentId,
      label: session.label,
      // The Assistant is not a registered agent and stays ungrouped
      ...(ctx.agents.has(agentId)
        ? { workspacePath: session.cwd, folderName: path.basename(session.cwd) }
        : {}),
    });
  }
  ctx.send({ type: 'chat-focus', agentId });
}

function handleWebviewMessage(msg: WebviewToHostMessage): void {
  if (msg.type === 'webviewReady') {
    onWebviewReady();
  } else if (msg.type === 'openClaude') {
    void resolveAgentCwd(msg.folderPath).then((cwd) => {
      if (cwd) launchAgent(cwd);
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
    void resolveAgentCwd(msg.folderPath).then((cwd) => {
      if (cwd) launchChatAgent(cwd);
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
      // A question/permission may still be parked from before the reload
      session.replayPendingPermissions();
    }
  } else if (msg.type === 'chatPermissionResponse') {
    chatSessions
      .get(msg.id)
      ?.respondPermission(msg.requestId, msg.allow, msg.message, msg.updatedInput);
  } else if (msg.type === 'chatSetPermissionMode') {
    chatSessions.get(msg.id)?.setMode(msg.mode);
  } else if (msg.type === 'listResumableSessions') {
    void (async () => {
      const cwd = await resolveAgentCwd(msg.folderPath);
      if (cwd) {
        ctx.send({ type: 'sessionList', folderPath: cwd, sessions: listResumableSessions(cwd) });
      }
    })();
  } else if (msg.type === 'addWorkspace') {
    void (async () => {
      const cwd = await resolveAgentCwd(undefined);
      if (cwd) {
        ctx.send({ type: 'workspacesLoaded', workspaces: touchWorkspace(cwd) });
      }
    })();
  } else if (msg.type === 'addTodo') {
    ctx.send({ type: 'workspaceTodos', path: msg.path, todos: addTodo(msg.path, msg.text) });
  } else if (msg.type === 'toggleTodo') {
    const wasOpen = getTodos(msg.path).find((t) => t.id === msg.id)?.status === 'open';
    ctx.send({ type: 'workspaceTodos', path: msg.path, todos: toggleTodo(msg.path, msg.id) });
    if (wasOpen) trackAchievement('taskCompleted');
  } else if (msg.type === 'deleteTodo') {
    ctx.send({ type: 'workspaceTodos', path: msg.path, todos: deleteTodo(msg.path, msg.id) });
  } else if (msg.type === 'assignTodo') {
    const todo = getTodos(msg.path).find((t) => t.id === msg.id);
    if (todo) {
      trackAchievement('taskAssigned');
      launchChatAgent(
        msg.path,
        undefined,
        `You are assigned this task (task id: ${todo.id}):\n\n${todo.text}\n\n` +
          `The workspace has a shared task list available through your tasks tools ` +
          `(mcp__tasks__list_tasks / add_task / complete_task). When you have completed ` +
          `and verified this task, call complete_task with the task id above. If you ` +
          `discover follow-up work worth tracking, record it with add_task.`,
        roleForTaskText(todo.text),
      );
    }
  } else if (msg.type === 'removeWorkspace') {
    ctx.send({ type: 'workspacesLoaded', workspaces: removeWorkspaceEntry(msg.path) });
  } else if (msg.type === 'resumeChatAgent') {
    launchChatAgent(msg.folderPath, msg.sessionId);
  } else if (msg.type === 'saveLayout') {
    if (isValidLayout(msg.layout)) {
      if (msg.workspacePath) {
        const file = getWorkspaceLayoutFile(msg.workspacePath);
        layoutsOwnWrites.set(path.basename(file), Date.now());
        saveJsonFile(file, msg.layout);
      } else {
        layoutWatcher?.markOwnWrite();
        writeLayoutToFile(msg.layout);
      }
    }
  } else if (msg.type === 'saveAgentSeats') {
    saveAgentSeats(msg.seats);
  } else if (msg.type === 'setSoundEnabled') {
    saveSettings({ soundEnabled: !!msg.enabled });
  } else if (msg.type === 'setBypassPermissions') {
    saveSettings({ bypassPermissions: !!msg.enabled });
    // Echo back so the Settings checkbox reflects the persisted value
    ctx.send({
      type: 'settingsLoaded',
      ...loadSettings(),
      launchAtLogin: app.getLoginItemSettings().openAtLogin,
    });
  } else if (msg.type === 'setLaunchAtLogin') {
    app.setLoginItemSettings({ openAtLogin: !!msg.enabled });
    // Echo back so the checkbox reflects what the OS actually accepted
    ctx.send({
      type: 'settingsLoaded',
      ...loadSettings(),
      launchAtLogin: app.getLoginItemSettings().openAtLogin,
    });
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
  } else if (msg.type === 'focusAgent') {
    const agent = ctx.agents.get(msg.id);
    if (agent?.kind === 'chat') {
      focusChatTab(msg.id);
    } else if (agent?.ptyId) {
      ctx.send({ type: 'pty-focus', ptyId: agent.ptyId, agentId: msg.id });
    }
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

  // Rebuild terminal tabs for PTYs that survived a renderer reload; each
  // tab's TerminalInstance requests a scrollback replay via 'pty-ready'.
  for (const [ptyId, record] of ptys) {
    ctx.send({
      type: 'pty-created',
      ptyId,
      label: record.label,
      ...(ptyToAgent.has(ptyId) ? { agentId: ptyToAgent.get(ptyId) } : {}),
      ...(record.cwd ? { workspacePath: record.cwd, folderName: path.basename(record.cwd) } : {}),
    });
  }
  // Same for chat tabs — each ChatView requests its history via 'chatReady'.
  // The Assistant is not a registered agent and stays workspace-less (ungrouped).
  for (const [agentId, session] of chatSessions) {
    ctx.send({
      type: 'chat-created',
      agentId,
      label: session.label,
      ...(ctx.agents.has(agentId)
        ? { workspacePath: session.cwd, folderName: path.basename(session.cwd) }
        : {}),
    });
  }

  // Send existing agents with session-keyed seat/palette metadata
  const agentIds = [...ctx.agents.keys()].sort((a, b) => a - b);
  const metaBySession = loadSeatMetaBySession();
  const agentMeta: Record<number, AgentSeatMeta> = {};
  const folderNames: Record<number, string> = {};
  for (const [id, agent] of ctx.agents) {
    if (metaBySession[agent.sessionId]) {
      agentMeta[id] = metaBySession[agent.sessionId];
    }
    folderNames[id] = path.basename(agent.cwd);
  }
  ctx.send({ type: 'existingAgents', agents: agentIds, agentMeta, folderNames });

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

    // Send layout AFTER assets (webview buffers agents until layoutLoaded)
    let layout = readLayoutFromFile();
    if (!layout) {
      layout = loadDefaultLayout(assetsRoot);
      if (layout) writeLayoutToFile(layout);
    }
    ctx.send({ type: 'layoutLoaded', layout });

    // Per-workspace layout overrides (offices with their own saved design)
    for (const ws of loadWorkspaces()) {
      const wsLayout = loadJsonFile<Record<string, unknown>>(getWorkspaceLayoutFile(ws.path));
      if (wsLayout && isValidLayout(wsLayout)) {
        console.log(`[Pixel Agents] Sending workspace layout override for ${ws.path}`);
        ctx.send({ type: 'layoutLoaded', layout: wsLayout, workspacePath: ws.path });
      }
    }
  })();

  // Send settings
  ctx.send({
    type: 'settingsLoaded',
    ...loadSettings(),
    launchAtLogin: app.getLoginItemSettings().openAtLogin,
  });
  sendSchedules();
  // Offer daily/weekly occurrences missed while the app was closed. Computed
  // per webview ready (not once per launch): once resolved they're stamped
  // handled, so a reload with nothing pending sends nothing.
  const missed = collectMissedSchedules();
  if (missed.length > 0) {
    ctx.send({ type: 'missedSchedules', missed });
  }

  // Send registered workspaces (offices)
  ctx.send({ type: 'workspacesLoaded', workspaces: loadWorkspaces() });
  ctx.send({ type: 'usageSummary', summary: summarizeUsage() });
  ctx.send({ type: 'achievementsLoaded', achievements: listAchievements() });

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

function saveAgentSeats(seatsById: Record<string, AgentSeatMeta> | undefined): void {
  if (!seatsById) return;
  // Re-key by session id so the metadata survives window reloads (agent ids don't)
  const bySession = loadSeatMetaBySession();
  for (const [idStr, meta] of Object.entries(seatsById)) {
    const agent = ctx.agents.get(Number(idStr));
    if (agent) {
      // The webview doesn't track names — preserve the host-written one
      const name = meta.name ?? bySession[agent.sessionId]?.name;
      bySession[agent.sessionId] = { ...meta, ...(name ? { name } : {}) };
    }
  }
  saveJsonFile(AGENT_SEATS_FILE, { bySession });
}

async function exportLayout(): Promise<void> {
  if (!mainWindow) return;
  const layout = readLayoutFromFile();
  if (!layout) return;
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    defaultPath: path.join(os.homedir(), 'pixel-agents-layout.json'),
  });
  if (result.filePath) {
    try {
      fs.writeFileSync(result.filePath, JSON.stringify(layout, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Pixel Agents] Failed to export layout:', err);
    }
  }
}

async function importLayout(): Promise<void> {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.filePaths.length === 0) return;
  try {
    const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
    const imported = JSON.parse(raw) as Record<string, unknown>;
    if (!isValidLayout(imported)) return;
    layoutWatcher?.markOwnWrite();
    writeLayoutToFile(imported);
    ctx.send({ type: 'layoutLoaded', layout: imported });
  } catch (err) {
    console.error('[Pixel Agents] Failed to import layout:', err);
  }
}

// ── Window Creation ──────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    title: 'Pixel Agents',
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

// ── App Lifecycle ────────────────────────────────────────────
function cleanupAndQuit(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  layoutWatcher?.dispose();
  layoutWatcher = null;
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
}

app.whenReady().then(() => {
  fixPathEnv();
  setupIpcHandlers();

  // Cross-window layout sync (e.g. edits made from a VS Code window)
  watchWorkspaceLayouts();
  layoutWatcher = watchLayoutFile((layout) => {
    ctx.send({ type: 'layoutLoaded', layout });
  });

  createWindow();

  schedulerTimer = setInterval(schedulerTick, SCHEDULER_TICK_MS);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS the app keeps running (dock icon) — agents and PTYs must
  // survive so reopening the window restores everything.
  if (process.platform !== 'darwin') {
    app.quit();
  }
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
