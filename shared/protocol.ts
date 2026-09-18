/**
 * The message protocol between the backend host (VS Code extension or
 * Electron main process) and the webview UI, as discriminated unions.
 *
 * This file is the single source of truth, imported by all three targets:
 *   - src/       (VS Code extension host)
 *   - electron/  (Electron main process)
 *   - webview-ui (React UI)
 *
 * It must stay dependency-free and types-only (no runtime exports).
 */

/** 2D pixel grid: '' = transparent, '#RRGGBB' = opaque color. */
export type SpriteData = string[][];

export interface CharacterDirectionSprites {
  down: SpriteData[];
  up: SpriteData[];
  right: SpriteData[];
}

export interface FurnitureAsset {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  partOfGroup?: boolean;
  groupId?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  orientation?: string;
  state?: string;
}

/** Per-agent presentation metadata persisted by the host. */
export interface AgentSeatMeta {
  palette?: number;
  seatId?: string | null;
  hueShift?: number;
  /** Role skin id (e.g. 'qa'), or null/absent for the base look. */
  role?: string | null;
  /** Display name (auto-derived from the first prompt); survives resume via session-keyed persistence. */
  name?: string;
}

/** A recurring agent dispatch (Electron scheduler, ~/.pixel-agents/schedules.json). */
export interface ScheduleEntry {
  id: string;
  workspacePath: string;
  /** Self-contained task prompt for the dispatched agent. */
  prompt: string;
  /** Dispatch role id (charter + tool policy + skin), if any. */
  role?: string;
  kind: 'daily' | 'weekly' | 'interval';
  /** 'HH:MM' local time — daily and weekly kinds. */
  time?: string;
  /** Days of week (0=Sunday) — weekly kind. */
  days?: number[];
  /** Minutes between runs — interval kind. */
  everyMinutes?: number;
  enabled: boolean;
  lastRunAtMs?: number;
  createdAtMs?: number;
}

/** A daily/weekly occurrence that was scheduled while the app was closed. */
export interface MissedScheduleRun {
  schedule: ScheduleEntry;
  missedCount: number;
  lastMissedAtMs: number;
}

/** A role skin: named character sprite set (same sheet layout as the base). */
export interface RoleSpriteSet {
  id: string;
  name: string;
  sprites: CharacterDirectionSprites;
}

export type AgentStatus = 'active' | 'waiting';

/** Serialized office layout (validated structurally, not deeply typed). */
export type LayoutData = Record<string, unknown>;

// ── Chat sessions (Electron only) ────────────────────────────

/**
 * Simplified rendering stream for SDK-driven chat sessions. The main
 * process reduces Agent SDK messages to these events; the webview renders
 * them without knowing SDK internals.
 */
export type ChatEvent =
  /** Echo of a prompt the user sent (also used for replay after reload). */
  | { kind: 'user-text'; text: string; imageCount?: number }
  /** Streaming assistant text (append to the in-progress text block). */
  | { kind: 'text-delta'; text: string }
  /** A completed content block — replaces accumulated deltas for 'text'. */
  | { kind: 'block-final'; block: 'text' | 'thinking'; text: string }
  | { kind: 'tool-start'; toolId: string; name: string; input: Record<string, unknown> }
  | { kind: 'tool-result'; toolId: string; isError: boolean; summary: string }
  | { kind: 'turn-complete'; costUsd: number; durationMs: number; isError: boolean }
  /** Informational status line (compaction, retries, …). */
  | { kind: 'status'; text: string }
  /** Fatal session error; `hint` carries user guidance for startup failures. */
  | { kind: 'error'; message: string; hint?: string }
  /** The SDK loop finished — the session accepts no further input. */
  | { kind: 'session-ended' };

/** A registered workspace (project folder) — rendered as an office. */
export interface WorkspaceInfo {
  path: string;
  /** basename(path) unless renamed. */
  name: string;
  addedAt: number;
  lastUsedAt: number;
}

/** An image attached to a chat prompt (base64, no data: prefix). */
export interface ChatImageAttachment {
  /** 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' */
  mediaType: string;
  data: string;
}

/** Permission modes exposed in the chat UI (subset of Claude Code's modes). */
export type ChatPermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

/** A past session that can be resumed as a chat agent. */
export interface ResumableSession {
  sessionId: string;
  /** Last-modified time of the transcript (epoch ms). */
  mtimeMs: number;
  /** First user prompt (truncated) for identification. */
  preview: string;
}

// ── Todos ────────────────────────────────────────────────────

/** A human todo item scoped to a workspace. */
export interface TodoItem {
  id: string;
  text: string;
  status: 'open' | 'done';
  createdAt: number;
}

/** An agent's own plan item (mirrored from Claude Code's TodoWrite). */
export interface AgentTodo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// ── Agent actions ────────────────────────────────────────────

/**
 * A contextual next-step action for an agent, rendered as a button in the
 * office UI. Suggested by the host from end-of-turn heuristics; clicking it
 * sends `command` to the agent's session (runAgentAction).
 */
export interface AgentActionSuggestion {
  /** Short button label, e.g. "Review". */
  label: string;
  /** Text injected into the agent's session (slash command or plain prompt). */
  command: string;
  /** Why this action is suggested (shown as tooltip). */
  reason?: string;
}

// ── Achievements ─────────────────────────────────────────────

export interface AchievementInfo {
  id: string;
  name: string;
  description: string;
  /** Epoch ms when unlocked; absent = still locked. */
  unlockedAt?: number;
}

// ── Usage tracking (Electron only) ───────────────────────────

export interface ProjectUsage {
  /** Absolute project path. */
  path: string;
  /** basename(path) for display. */
  folder: string;
  monthUsd: number;
  allTimeUsd: number;
}

export interface UsageSummary {
  todayUsd: number;
  monthUsd: number;
  allTimeUsd: number;
  /** Sorted by monthUsd desc; capped by the host. */
  perProject: ProjectUsage[];
  turnCount: number;
  /** Last 14 days, oldest first (local dates, 'MM-DD'). */
  days: Array<{ day: string; usd: number }>;
  /** Today's spend per workspace path (for office label plates). */
  todayByWorkspace: Record<string, number>;
}

// ── Host → Webview ───────────────────────────────────────────

export type HostToWebviewMessage =
  // Agent lifecycle
  | {
      type: 'agentCreated';
      id: number;
      folderName?: string;
      ptyId?: string;
      agentKind?: 'terminal' | 'chat';
      /** Absolute project folder this agent works in (its workspace/office). */
      workspacePath?: string;
      /** Dispatch role id (charter + tool policy + skin), when the agent was created with one. */
      role?: string;
    }
  | { type: 'agentClosed'; id: number }
  | { type: 'agentSelected'; id: number }
  /** Display-name update for an agent (auto-derived from its first prompt). */
  | { type: 'agentLabel'; id: number; label: string }
  | {
      type: 'existingAgents';
      agents: number[];
      agentMeta: Record<number, AgentSeatMeta>;
      folderNames: Record<number, string>;
    }
  // Tool activity
  // subagentRole: role skin for the Task's typed sub-agent character (from subagent_type)
  | { type: 'agentToolStart'; id: number; toolId: string; status: string; subagentRole?: string }
  | { type: 'agentToolDone'; id: number; toolId: string }
  | { type: 'agentToolsClear'; id: number }
  | { type: 'agentToolPermission'; id: number }
  | { type: 'agentToolPermissionClear'; id: number }
  | { type: 'agentStatus'; id: number; status: AgentStatus }
  /** End-of-turn action suggestions (empty array clears existing buttons). */
  | { type: 'agentSuggestions'; id: number; suggestions: AgentActionSuggestion[] }
  // Sub-agent activity
  | { type: 'subagentToolStart'; id: number; parentToolId: string; toolId: string; status: string }
  | { type: 'subagentToolDone'; id: number; parentToolId: string; toolId: string }
  | { type: 'subagentToolPermission'; id: number; parentToolId: string }
  | { type: 'subagentClear'; id: number; parentToolId: string }
  // Assets & layout
  // workspacePath absent = the global default layout; present = that office's own layout
  | { type: 'layoutLoaded'; layout: LayoutData | null; workspacePath?: string }
  | { type: 'characterSpritesLoaded'; characters: CharacterDirectionSprites[] }
  | { type: 'roleSpritesLoaded'; roles: RoleSpriteSet[] }
  | { type: 'floorTilesLoaded'; sprites: SpriteData[] }
  | { type: 'wallTilesLoaded'; sprites: SpriteData[] }
  | {
      type: 'furnitureAssetsLoaded';
      catalog: FurnitureAsset[];
      sprites: Record<string, SpriteData>;
    }
  // Settings & workspace
  | {
      type: 'settingsLoaded';
      soundEnabled: boolean;
      launchAtLogin?: boolean;
      bypassPermissions?: boolean;
    }
  | { type: 'schedulesLoaded'; schedules: ScheduleEntry[] }
  // Sent on webview ready when daily/weekly occurrences were missed while the
  // app was closed; the user picks which to run via resolveMissedSchedules.
  | { type: 'missedSchedules'; missed: MissedScheduleRun[] }
  | { type: 'workspaceFolders'; folders: Array<{ name: string; path: string }> }
  // Terminal tabs (Electron only)
  // agentId/workspacePath/folderName let the tab bar group tabs per workspace
  // and track the owning agent's activity without a separate lookup message.
  | {
      type: 'pty-created';
      ptyId: string;
      label: string;
      agentId?: number;
      workspacePath?: string;
      folderName?: string;
    }
  | { type: 'pty-focus'; ptyId: string; agentId: number }
  | { type: 'pty-close-tab'; ptyId: string }
  | { type: 'pty-output'; ptyId: string; data: string }
  | { type: 'pty-replay'; ptyId: string; data: string }
  | { type: 'pty-exit'; ptyId: string; exitCode: number }
  // Chat tabs (Electron only, SDK-driven sessions)
  | {
      type: 'chat-created';
      agentId: number;
      label: string;
      workspacePath?: string;
      folderName?: string;
    }
  | { type: 'chat-focus'; agentId: number }
  | { type: 'chat-close-tab'; agentId: number }
  | { type: 'chat-event'; agentId: number; event: ChatEvent }
  | { type: 'chat-replay'; agentId: number; events: ChatEvent[] }
  /** The agent is mid-turn (composer should show Stop instead of Send). */
  | { type: 'chat-busy'; agentId: number; busy: boolean }
  | {
      type: 'chat-permission-request';
      agentId: number;
      requestId: string;
      toolName: string;
      /** tool_use block id of the pending call — lets the UI render the request inline on its tool card. */
      toolUseId?: string;
      /** Full prompt sentence, e.g. "Claude wants to read foo.txt". */
      title?: string;
      /** Human-readable subtitle with extra context. */
      description?: string;
      input: Record<string, unknown>;
    }
  /** The request was resolved elsewhere (abort/turn end) — remove the card. */
  | { type: 'chat-permission-resolved'; agentId: number; requestId: string }
  /** An agent updated its internal plan (TodoWrite) — live activity feed. */
  | { type: 'agent-todos'; agentId: number; todos: AgentTodo[] }
  /** Human todos for a workspace (sent on ready and after any change). */
  | { type: 'workspaceTodos'; path: string; todos: TodoItem[] }
  /** Registered workspaces (sent on ready and after add/remove/use). */
  | { type: 'workspacesLoaded'; workspaces: WorkspaceInfo[] }
  /** Current permission mode of a chat session (sent on init and change). */
  | { type: 'chat-mode'; agentId: number; mode: ChatPermissionMode }
  /** Resumable sessions for a folder the user picked (reply to listResumableSessions). */
  | { type: 'sessionList'; folderPath: string; sessions: ResumableSession[] }
  // Usage
  | { type: 'usageSummary'; summary: UsageSummary }
  // Achievements
  | { type: 'achievementsLoaded'; achievements: AchievementInfo[] }
  | { type: 'achievementUnlocked'; achievement: AchievementInfo };

// ── Webview → Host ───────────────────────────────────────────

export type WebviewToHostMessage =
  | { type: 'webviewReady' }
  /** Opens a TERMINAL agent (PTY). No folderPath → host shows a folder picker. */
  | { type: 'openClaude'; folderPath?: string }
  /** Opens a CHAT agent (Agent SDK). No folderPath → host shows a folder picker. */
  | { type: 'openChatAgent'; folderPath?: string }
  | { type: 'chatSend'; id: number; text: string; images?: ChatImageAttachment[] }
  | { type: 'chatInterrupt'; id: number }
  /** ChatView for this agent mounted — host replays its event history. */
  | { type: 'chatReady'; id: number }
  | {
      type: 'chatPermissionResponse';
      id: number;
      requestId: string;
      allow: boolean;
      /** Optional feedback delivered to Claude on deny. */
      message?: string;
      /**
       * Replacement tool input delivered on allow. Used by AskUserQuestion:
       * the host UI collects the user's answers and returns them here
       * (original input + `answers` map) — the tool has no executor of its
       * own, so allowing without answers breaks the turn.
       */
      updatedInput?: Record<string, unknown>;
    }
  | { type: 'focusAgent'; id: number }
  /** Send an action's command text to an agent's session (terminal or chat). */
  | { type: 'runAgentAction'; id: number; command: string }
  | { type: 'closeAgent'; id: number }
  | { type: 'saveAgentSeats'; seats: Record<number, AgentSeatMeta> }
  // Sent as the webview's own OfficeLayout shape; hosts validate structurally
  // with isValidLayout() before persisting.
  // workspacePath present = save as that office's own layout (Electron campus)
  | { type: 'saveLayout'; layout: unknown; workspacePath?: string }
  | { type: 'setSoundEnabled'; enabled: boolean }
  | { type: 'setLaunchAtLogin'; enabled: boolean }
  // New agents (terminal + chat) start with permissions bypassed when enabled
  | { type: 'setBypassPermissions'; enabled: boolean }
  | { type: 'deleteSchedule'; id: string }
  | { type: 'toggleSchedule'; id: string; enabled: boolean }
  // Manual schedule creation from the Settings form (id/timestamps host-assigned)
  | {
      type: 'addSchedule';
      workspacePath: string;
      prompt: string;
      role?: string;
      kind: 'daily' | 'weekly' | 'interval';
      time?: string;
      days?: number[];
      everyMinutes?: number;
    }
  // Resolves a missedSchedules prompt: dispatch runIds now, mark ALL listed
  // ids as handled so the same occurrences aren't re-offered next launch.
  | { type: 'resolveMissedSchedules'; runIds: string[]; skipIds: string[] }
  | { type: 'openSessionsFolder' }
  | { type: 'exportLayout' }
  | { type: 'importLayout' }
  /** Request an up-to-date UsageSummary (host replies with 'usageSummary'). */
  | { type: 'getUsageSummary' }
  /** Switch a chat session's permission mode (host echoes 'chat-mode'). */
  | { type: 'chatSetPermissionMode'; id: number; mode: ChatPermissionMode }
  /** List resumable sessions (host replies 'sessionList'); shows a folder picker when folderPath is omitted. */
  | { type: 'listResumableSessions'; folderPath?: string }
  /** Register a new workspace via folder picker (host replies 'workspacesLoaded'). */
  | { type: 'addWorkspace' }
  | { type: 'removeWorkspace'; path: string }
  | { type: 'addTodo'; path: string; text: string }
  | { type: 'toggleTodo'; path: string; id: string }
  | { type: 'deleteTodo'; path: string; id: string }
  /** Open (or focus) the global Assistant chat session; `prompt` is sent into it. */
  | { type: 'openAssistant'; prompt?: string }
  /** Spawn a chat agent in the workspace with the todo's text as first prompt. */
  | { type: 'assignTodo'; path: string; id: string }
  /** Resume a past session as a new chat agent. */
  | { type: 'resumeChatAgent'; folderPath: string; sessionId: string };
