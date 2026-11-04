import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  AchievementInfo,
  AgentActionSuggestion,
  AgentTodo,
  ClaudeAuthState,
  HostToWebviewMessage,
  MissedScheduleRun,
  RestorableAgent,
  ScheduleEntry,
  TodoItem,
  UsageSummary,
  WorkspaceInfo,
  WorktreeSummary,
} from '../../../shared/protocol.js';
import type { HostNotice } from '../components/NoticeToast.js';
import type { RateLimitInfo } from '../components/rateLimit.js';
import { isDemoAgent } from '../demo/demoAgents.js';
import { playDoneSound, setSoundEnabled } from '../notificationSound.js';
import type { CampusState } from '../office/engine/campusState.js';
import { setFloorSprites } from '../office/floorTiles.js';
import {
  addUnlockedAchievement,
  buildDynamicCatalog,
  pruneUnknownFurniture,
  setUnlockedAchievements,
} from '../office/layout/furnitureCatalog.js';
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js';
import { setRoomTemplates } from '../office/roomTemplates.js';
import { setCharacterTemplates, setRoleSprites } from '../office/sprites/spriteData.js';
import { extractToolName } from '../office/toolUtils.js';
import type { OfficeLayout, ToolActivity } from '../office/types.js';
import { BubbleKind } from '../office/types.js';
import { setWallSprites } from '../office/wallTiles.js';
import { vscode } from '../vscodeApi.js';

/** Monotonic ids for notice toasts — React keys that never repeat. */
let nextNoticeId = 1;

export interface SubagentCharacter {
  id: number;
  parentAgentId: number;
  parentToolId: string;
  label: string;
  /** The CLI's task id — present only for chat agents, and what stops it. */
  taskId?: string;
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
}

export interface ExtensionMessageState {
  agents: number[];
  selectedAgent: number | null;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  /** Display name per agent (auto-derived from its first prompt); absent until named. */
  agentNames: Record<number, string>;
  /** Self-reported status line per agent (campus status / mcp__me__set_status). */
  agentStatusTexts: Record<number, string>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  layoutReady: boolean;
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> };
  workspaces: WorkspaceInfo[];
  /** Human todos per workspace path (replaced wholesale on each message). */
  workspaceTodos: Record<string, TodoItem[]>;
  /** Agent plan items (TodoWrite) per agent id (replaced wholesale on each message). */
  agentTodos: Record<number, AgentTodo[]>;
  /** Latest usage summary pushed by the host (webviewReady + after each chat turn). */
  usageSummary: UsageSummary | null;
  /** Full achievements list from the host ('achievementsLoaded' on ready). */
  achievements: AchievementInfo[];
  /** Claude Code auth state; null until the host's startup probe answers. */
  claudeAuth: ClaudeAuthState | null;
  /** Transient queue of freshly unlocked achievements awaiting toast display. */
  unlockQueue: AchievementInfo[];
  /** Dismiss the currently displayed unlock toast (drops unlockQueue[0]). */
  dismissUnlock: () => void;
  /** Host-side failures worth showing (worktree refused, setup failed). */
  noticeQueue: HostNotice[];
  dismissNotice: () => void;
  /** Checkouts of the repo the worktree manager last asked about. */
  worktrees: { workspacePath: string; list: WorktreeSummary[] } | null;
  /** End-of-turn action suggestions per agent id (absent = none). */
  agentSuggestions: Record<number, AgentActionSuggestion[]>;
  /** Optimistically drop an agent's suggestions (e.g., after clicking one). */
  clearAgentSuggestions: (id: number) => void;
  /** Available role skins (empty until roleSpritesLoaded). */
  roles: Array<{ id: string; name: string }>;
  /** Recurring scheduled runs (Electron only; empty elsewhere). */
  schedules: ScheduleEntry[];
  /** Whether the app is registered to open at OS login (Electron only). */
  notificationsEnabled: boolean;
  updateChecksEnabled: boolean;
  phoneViewEnabled: boolean;
  /** Live state of the read-only phone view (url carries its token). */
  phoneView: Extract<HostToWebviewMessage, { type: 'phoneView' }> | null;
  /** Whether a newer release exists; Settings-only, never a bubble. */
  appUpdate: Extract<HostToWebviewMessage, { type: 'appUpdate' }> | null;
  launchAtLogin: boolean;
  /** New agents start with permissions bypassed (Settings toggle). */
  bypassPermissions: boolean;
  /** The account's usage window; null until some session reports one. */
  rateLimit: RateLimitInfo | null;
  /** Effort new agents start with; null = the CLI's own default. */
  defaultEffort: string | null;
  /** Dollars one agent may spend before stopping itself; 0 = no cap. */
  maxBudgetUsd: number;
  /** Daily/weekly runs missed while the app was closed (pick-and-run prompt). */
  missedRuns: MissedScheduleRun[];
  restorableAgents: RestorableAgent[];
  /** Clears the missed-runs prompt after it's resolved. */
  clearMissedRuns: () => void;
  clearRestorableAgents: () => void;
}

/** Aggregate seat assignments across every office on the campus and persist. */
export function saveAgentSeats(campus: CampusState): void {
  const seats: Record<
    number,
    { palette: number; hueShift: number; seatId: string | null; role: string | null }
  > = {};
  for (const office of campus.getAllOffices()) {
    for (const ch of office.characters.values()) {
      if (ch.isSubagent) continue;
      seats[ch.id] = {
        palette: ch.palette,
        hueShift: ch.hueShift,
        seatId: ch.seatId,
        role: ch.role ?? null,
      };
    }
  }
  vscode.postMessage({ type: 'saveAgentSeats', seats });
}

export function useExtensionMessages(
  campus: CampusState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  isEditDirty?: () => boolean,
): ExtensionMessageState {
  const [agents, setAgents] = useState<number[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [agentTools, setAgentTools] = useState<Record<number, ToolActivity[]>>({});
  const [agentStatuses, setAgentStatuses] = useState<Record<number, string>>({});
  /** Host-derived display names, mirrored into React so labels re-render. */
  const [agentNames, setAgentNames] = useState<Record<number, string>>({});
  /** What agents said about themselves (campus status) — for the DOM panels. */
  const [agentStatusTexts, setAgentStatusTexts] = useState<Record<number, string>>({});
  const [subagentTools, setSubagentTools] = useState<
    Record<number, Record<string, ToolActivity[]>>
  >({});
  const [subagentCharacters, setSubagentCharacters] = useState<SubagentCharacter[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [loadedAssets, setLoadedAssets] = useState<
    { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined
  >();
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [workspaceTodos, setWorkspaceTodos] = useState<Record<string, TodoItem[]>>({});
  const [agentTodos, setAgentTodos] = useState<Record<number, AgentTodo[]>>({});
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [achievements, setAchievements] = useState<AchievementInfo[]>([]);
  const [claudeAuth, setClaudeAuth] = useState<ClaudeAuthState | null>(null);
  const [unlockQueue, setUnlockQueue] = useState<AchievementInfo[]>([]);
  const [noticeQueue, setNoticeQueue] = useState<HostNotice[]>([]);
  /** Whether the user has already been told the file on disk moved ahead. */
  const externalLayoutSkippedRef = useRef(false);
  const [worktrees, setWorktrees] = useState<{
    workspacePath: string;
    list: WorktreeSummary[];
  } | null>(null);
  const [agentSuggestions, setAgentSuggestions] = useState<Record<number, AgentActionSuggestion[]>>(
    {},
  );
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [updateChecksEnabled, setUpdateChecksEnabled] = useState(true);
  const [phoneViewEnabled, setPhoneViewEnabled] = useState(false);
  const [phoneView, setPhoneView] = useState<Extract<
    HostToWebviewMessage,
    { type: 'phoneView' }
  > | null>(null);
  const [appUpdate, setAppUpdate] = useState<Extract<
    HostToWebviewMessage,
    { type: 'appUpdate' }
  > | null>(null);
  const [bypassPermissions, setBypassPermissions] = useState(false);
  /** The account's usage window; null until some session reports one. */
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [defaultEffort, setDefaultEffort] = useState<string | null>(null);
  const [maxBudgetUsd, setMaxBudgetUsd] = useState(0);
  const [missedRuns, setMissedRuns] = useState<MissedScheduleRun[]>([]);
  const clearMissedRuns = useCallback(() => setMissedRuns([]), []);
  const [restorable, setRestorable] = useState<RestorableAgent[]>([]);
  const clearRestorableAgents = useCallback(() => setRestorable([]), []);

  const dismissNotice = useCallback(() => {
    setNoticeQueue((prev) => prev.slice(1));
  }, []);

  const dismissUnlock = useCallback(() => {
    setUnlockQueue((prev) => prev.slice(1));
  }, []);

  const clearAgentSuggestions = useCallback((id: number) => {
    setAgentSuggestions((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Track whether initial layout has been loaded (ref to avoid re-render)
  const layoutReadyRef = useRef(false);

  // Keep latest callbacks in refs so the message handler (subscribed once)
  // never closes over stale values (e.g., isEditDirty from the first render)
  const onLayoutLoadedRef = useRef(onLayoutLoaded);
  const isEditDirtyRef = useRef(isEditDirty);
  useEffect(() => {
    onLayoutLoadedRef.current = onLayoutLoaded;
    isEditDirtyRef.current = isEditDirty;
  });

  useEffect(() => {
    // Buffer agents until both the layout and the workspace list have loaded,
    // so each agent lands in its workspace's office with correct seats.
    let pendingAgents: Array<{
      id: number;
      palette?: number;
      hueShift?: number;
      seatId?: string;
      role?: string;
      folderName?: string;
      workspacePath?: string;
      name?: string;
      branch?: string;
      decor?: { status: string | null; progress: number | null };
    }> = [];
    let workspacesLoaded = false;
    /**
     * Outstanding chat permission/question requests per agent. The SDK can have
     * several in flight, so the blocked bubble only clears when the last one
     * resolves.
     */
    const pendingChatPermissions = new Map<number, Set<string>>();

    const flushPendingAgents = () => {
      if (!layoutReadyRef.current || !workspacesLoaded || pendingAgents.length === 0) return;
      for (const p of pendingAgents) {
        const office = campus.routeOffice(p.workspacePath, p.folderName);
        office.addAgent(p.id, p.palette, p.hueShift, p.seatId, true, p.folderName, p.role);
        if (p.name) office.setAgentName(p.id, p.name);
        if (p.branch) office.setAgentBranch(p.id, p.branch);
        if (p.decor) office.setAgentDecor(p.id, p.decor);
      }
      pendingAgents = [];
      saveAgentSeats(campus);
    };

    const handler = (e: MessageEvent) => {
      const msg = e.data as HostToWebviewMessage;

      if (msg.type === 'layoutLoaded') {
        // An external edit to the layout file cannot be applied over unsaved
        // work in the editor — but dropping it with a console.log made the
        // documented behaviour ("external edits apply without a restart")
        // quietly untrue, and the user's file edit look lost. Say it instead,
        // once per streak: the watcher can fire several times for one save.
        if (layoutReadyRef.current && isEditDirtyRef.current?.()) {
          if (!externalLayoutSkippedRef.current) {
            externalLayoutSkippedRef.current = true;
            setNoticeQueue((prev) => [
              ...prev,
              {
                id: nextNoticeId++,
                level: 'info',
                text: 'This office changed on disk. Save or reset your edits to pick up that version.',
              },
            ]);
          }
          return;
        }
        externalLayoutSkippedRef.current = false;
        const rawLayout = msg.layout as OfficeLayout | null;
        const layout =
          rawLayout && rawLayout.version === 1
            ? pruneUnknownFurniture(migrateLayoutColors(rawLayout))
            : null;
        if (msg.workspacePath !== undefined) {
          // Per-workspace layout — override just that workspace's office
          if (layout) campus.setWorkspaceLayout(msg.workspacePath, layout);
          return;
        }
        if (layout) {
          campus.setDefaultLayout(layout);
          onLayoutLoadedRef.current?.(layout);
        } else {
          // No saved default — adopt whatever the active OfficeState built
          campus.setDefaultLayout(campus.getActiveOffice().getLayout());
          onLayoutLoadedRef.current?.(campus.getLayout());
        }
        layoutReadyRef.current = true;
        setLayoutReady(true);
        // Add buffered agents now that layout (and seats) are correct
        flushPendingAgents();
      } else if (msg.type === 'workspacesLoaded') {
        campus.syncWorkspaces(msg.workspaces);
        workspacesLoaded = true;
        setWorkspaces(msg.workspaces);
        flushPendingAgents();
      } else if (msg.type === 'agentCreated') {
        const id = msg.id;
        const folderName = msg.folderName;
        setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]));
        setSelectedAgent(id);
        if (!layoutReadyRef.current || !workspacesLoaded) {
          pendingAgents.push({
            id,
            folderName,
            workspacePath: msg.workspacePath,
            role: msg.role,
            branch: msg.branch,
          });
        } else {
          const office = campus.routeOffice(msg.workspacePath, folderName);
          office.addAgent(id, undefined, undefined, undefined, undefined, folderName, msg.role);
          if (msg.branch) office.setAgentBranch(id, msg.branch);
          saveAgentSeats(campus);
        }
      } else if (msg.type === 'agentClosed') {
        const id = msg.id;
        setAgents((prev) => prev.filter((a) => a !== id));
        setSelectedAgent((prev) => (prev === id ? null : prev));
        setAgentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setAgentStatuses((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setAgentNames((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setAgentTodos((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setAgentSuggestions((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        pendingAgents = pendingAgents.filter((p) => p.id !== id);
        pendingChatPermissions.delete(id);
        // Remove all sub-agent characters belonging to this agent
        const os = campus.getOfficeForAgent(id);
        os?.removeAllSubagents(id);
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id));
        os?.removeAgent(id);
      } else if (msg.type === 'existingAgents') {
        const incoming = msg.agents;
        const meta = msg.agentMeta || {};
        const folderNames = msg.folderNames || {};
        const branches = msg.branches || {};
        // Buffer agents — they'll be routed once layout + workspaces are ready
        for (const id of incoming) {
          const m = meta[id];
          pendingAgents.push({
            id,
            palette: m?.palette,
            hueShift: m?.hueShift,
            seatId: m?.seatId ?? undefined,
            role: m?.role ?? undefined,
            folderName: folderNames[id],
            name: m?.name,
            branch: branches[id],
          });
        }
        setAgentNames((prev) => {
          const next = { ...prev };
          for (const id of incoming) {
            const n = meta[id]?.name;
            if (n) next[id] = n;
          }
          return next;
        });
        setAgents((prev) => {
          const ids = new Set(prev);
          const merged = [...prev];
          for (const id of incoming) {
            if (!ids.has(id)) {
              merged.push(id);
            }
          }
          return merged.sort((a, b) => a - b);
        });
        flushPendingAgents();
      } else if (msg.type === 'agentToolStart') {
        const id = msg.id;
        const toolId = msg.toolId;
        const status = msg.status;
        setAgentTools((prev) => {
          const list = prev[id] || [];
          if (list.some((t) => t.toolId === toolId)) return prev;
          return { ...prev, [id]: [...list, { toolId, status, done: false }] };
        });
        const os = campus.getOfficeForAgent(id);
        if (os) {
          const toolName = extractToolName(status);
          os.setAgentTool(id, toolName);
          os.setAgentActive(id, true);
          // Work resumed: whatever the bubble was saying is no longer true.
          os.clearBubble(id);
          // Create sub-agent character for Task tool subtasks
          if (status.startsWith('Subtask:')) {
            const label = status.slice('Subtask:'.length).trim();
            const subId = os.addSubagent(id, toolId, msg.subagentRole);
            // A sub-agent exists only while it is working — its parent is
            // blocked on it — so it starts busy rather than frozen at its
            // seat. It cannot wait for `subagentToolStart` to look alive:
            // CLI 2.1.x stopped forwarding sub-agent activity into the
            // parent transcript (it writes <session>/subagents/*.jsonl
            // instead), so on current CLIs that message never arrives.
            // No currentTool: we don't know what it is doing, and the Task
            // glyph would claim this character had delegated work of its own.
            os.setAgentActive(subId, true);
            setSubagentCharacters((prev) => {
              if (prev.some((s) => s.id === subId)) return prev;
              return [...prev, { id: subId, parentAgentId: id, parentToolId: toolId, label }];
            });
          }
        }
      } else if (msg.type === 'subagentStarted') {
        // Keyed by tool_use_id, which is the SAME id the transcript's Task
        // call carries — so this lands on the character already spawned
        // there rather than drawing a second one beside it. addSubagent is
        // idempotent on that key, which is what makes the join work whichever
        // of the two arrives first.
        const parentId = msg.agentId;
        const office = campus.getOfficeForAgent(parentId);
        if (!office) return;
        const subId = office.addSubagent(parentId, msg.toolUseId, msg.subagentType);
        office.setAgentActive(subId, true);
        // The description is what the parent ASKED for, which beats the tool
        // name every time: "audit the auth middleware", not "Task".
        office.setAgentName(subId, msg.description);
        setSubagentCharacters((prev) => {
          const existing = prev.find((sub) => sub.id === subId);
          if (existing) {
            return prev.map((sub) =>
              sub.id === subId ? { ...sub, label: msg.description, taskId: msg.taskId } : sub,
            );
          }
          return [
            ...prev,
            {
              id: subId,
              parentAgentId: parentId,
              parentToolId: msg.toolUseId,
              label: msg.description,
              taskId: msg.taskId,
            },
          ];
        });
      } else if (msg.type === 'subagentProgress') {
        const office = campus.getOfficeForAgent(msg.agentId);
        const subId = office?.subagentIdFor(msg.agentId, msg.toolUseId) ?? null;
        if (office && subId !== null) {
          if (msg.lastToolName) office.setAgentTool(subId, msg.lastToolName);
          // The model's own line about what it is up to goes where an agent's
          // self-reported status goes, so it reads the same as `campus status`.
          if (msg.summary) office.setAgentDecor(subId, { status: msg.summary });
        }
      } else if (msg.type === 'subagentFinished') {
        // Its parent's Task tool_result would retire it too, but not always
        // and not promptly — a stopped or failed task never produces one.
        campus.getOfficeForAgent(msg.agentId)?.removeSubagent(msg.agentId, msg.toolUseId);
        setSubagentCharacters((prev) =>
          prev.filter(
            (sub) => !(sub.parentAgentId === msg.agentId && sub.parentToolId === msg.toolUseId),
          ),
        );
      } else if (msg.type === 'agentToolDone') {
        const id = msg.id;
        const toolId = msg.toolId;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
          };
        });
      } else if (msg.type === 'agentToolsClear') {
        const id = msg.id;
        setAgentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Remove all sub-agent characters belonging to this agent
        const os = campus.getOfficeForAgent(id);
        os?.removeAllSubagents(id);
        setSubagentCharacters((prev) => prev.filter((s) => s.parentAgentId !== id));
        os?.setAgentTool(id, null);
        os?.clearBubble(id, BubbleKind.BLOCKED);
      } else if (msg.type === 'agentSuggestions') {
        const id = msg.id;
        const suggestions = msg.suggestions;
        setAgentSuggestions((prev) => {
          if (suggestions.length === 0) {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          }
          return { ...prev, [id]: suggestions };
        });
        // 'investigate' means the turn ended with repeated tool errors — the
        // office should say so rather than show a clean checkmark.
        if (suggestions.some((sg) => sg.kind === 'investigate')) {
          campus.getOfficeForAgent(id)?.showBubble(id, BubbleKind.ERROR);
        }
      } else if (msg.type === 'agentLabel') {
        // The host auto-names an agent from its first prompt. Route it to the
        // character too, so the office reads "fix-auth-timeout", not "Agent 3".
        const pending = pendingAgents.find((p) => p.id === msg.id);
        if (pending) pending.name = msg.label;
        campus.getOfficeForAgent(msg.id)?.setAgentName(msg.id, msg.label);
        setAgentNames((prev) => ({ ...prev, [msg.id]: msg.label }));
      } else if (msg.type === 'chat-permission-request') {
        // Chat agents (the default for "+ Agent") ask for permission through
        // the SDK's canUseTool bridge, not through the transcript timer, so
        // this is the only place the office can learn they are blocked.
        // AskUserQuestion arrives here too — same meaning: stuck on a human.
        const id = msg.agentId;
        const pending = pendingChatPermissions.get(id) ?? new Set<string>();
        pending.add(msg.requestId);
        pendingChatPermissions.set(id, pending);
        campus.getOfficeForAgent(id)?.showBubble(id, BubbleKind.BLOCKED);
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
          };
        });
      } else if (msg.type === 'chat-permission-resolved') {
        const id = msg.agentId;
        const pending = pendingChatPermissions.get(id);
        pending?.delete(msg.requestId);
        if (!pending || pending.size === 0) {
          pendingChatPermissions.delete(id);
          campus.getOfficeForAgent(id)?.clearBubble(id, BubbleKind.BLOCKED);
          setAgentTools((prev) => {
            const list = prev[id];
            if (!list || !list.some((t) => t.permissionWait)) return prev;
            return {
              ...prev,
              [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
            };
          });
        }
      } else if (msg.type === 'agentSelected') {
        setSelectedAgent(msg.id);
        // The host selects an agent when you come in through a notification:
        // land on it like a click would — select, follow, and mark it read.
        const office = campus.getOfficeForAgent(msg.id);
        if (office) {
          office.selectedAgentId = msg.id;
          office.cameraFollowId = msg.id;
          office.acknowledgeAgent(msg.id);
        }
      } else if (msg.type === 'agentStatus') {
        const id = msg.id;
        const status = msg.status;
        setAgentStatuses((prev) => {
          if (status === 'active') {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          }
          return { ...prev, [id]: status };
        });
        const os = campus.getOfficeForAgent(id);
        os?.setAgentActive(id, status === 'active');
        if (status === 'active') {
          // A new turn began: any badge from the previous one is now stale.
          // Covers text-only turns, which never emit a tool start.
          os?.clearBubble(id);
        }
        if (status === 'waiting') {
          // Unread badge: unlike the old 2s flash, this stays up until the
          // user actually opens the agent, so a turn finished while they were
          // away is still there when they come back.
          os?.showBubble(id, BubbleKind.DONE);
          // Pretend agents finish a turn every few seconds — chiming for each would be noise
          if (!isDemoAgent(id)) playDoneSound();
        }
      } else if (msg.type === 'agentToolPermission') {
        const id = msg.id;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
          };
        });
        campus.getOfficeForAgent(id)?.showBubble(id, BubbleKind.BLOCKED);
      } else if (msg.type === 'subagentToolPermission') {
        const id = msg.id;
        const parentToolId = msg.parentToolId;
        // Show permission bubble on the sub-agent character
        const os = campus.getOfficeForAgent(id);
        const subId = os?.getSubagentId(id, parentToolId) ?? null;
        if (os && subId !== null) {
          os.showBubble(subId, BubbleKind.BLOCKED);
        }
      } else if (msg.type === 'agentToolPermissionClear') {
        const id = msg.id;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          const hasPermission = list.some((t) => t.permissionWait);
          if (!hasPermission) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
          };
        });
        const os = campus.getOfficeForAgent(id);
        if (os) {
          os.clearBubble(id, BubbleKind.BLOCKED);
          // Also clear permission bubbles on all sub-agent characters of this parent
          for (const [subId, meta] of os.subagentMeta) {
            if (meta.parentAgentId === id) {
              os.clearBubble(subId, BubbleKind.BLOCKED);
            }
          }
        }
      } else if (msg.type === 'subagentToolStart') {
        const id = msg.id;
        const parentToolId = msg.parentToolId;
        const toolId = msg.toolId;
        const status = msg.status;
        setSubagentTools((prev) => {
          const agentSubs = prev[id] || {};
          const list = agentSubs[parentToolId] || [];
          if (list.some((t) => t.toolId === toolId)) return prev;
          return {
            ...prev,
            [id]: { ...agentSubs, [parentToolId]: [...list, { toolId, status, done: false }] },
          };
        });
        // Update sub-agent character's tool and active state
        const os = campus.getOfficeForAgent(id);
        const subId = os?.getSubagentId(id, parentToolId) ?? null;
        if (os && subId !== null) {
          const subToolName = extractToolName(status);
          os.setAgentTool(subId, subToolName);
          os.setAgentActive(subId, true);
        }
      } else if (msg.type === 'subagentToolDone') {
        const id = msg.id;
        const parentToolId = msg.parentToolId;
        const toolId = msg.toolId;
        setSubagentTools((prev) => {
          const agentSubs = prev[id];
          if (!agentSubs) return prev;
          const list = agentSubs[parentToolId];
          if (!list) return prev;
          return {
            ...prev,
            [id]: {
              ...agentSubs,
              [parentToolId]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
            },
          };
        });
      } else if (msg.type === 'subagentClear') {
        const id = msg.id;
        const parentToolId = msg.parentToolId;
        setSubagentTools((prev) => {
          const agentSubs = prev[id];
          if (!agentSubs || !(parentToolId in agentSubs)) return prev;
          const next = { ...agentSubs };
          delete next[parentToolId];
          if (Object.keys(next).length === 0) {
            const outer = { ...prev };
            delete outer[id];
            return outer;
          }
          return { ...prev, [id]: next };
        });
        // Remove sub-agent character
        campus.getOfficeForAgent(id)?.removeSubagent(id, parentToolId);
        setSubagentCharacters((prev) =>
          prev.filter((s) => !(s.parentAgentId === id && s.parentToolId === parentToolId)),
        );
      } else if (msg.type === 'characterSpritesLoaded') {
        const characters = msg.characters as Array<{
          down: string[][][];
          up: string[][][];
          right: string[][][];
        }>;
        setCharacterTemplates(characters);
      } else if (msg.type === 'roleSpritesLoaded') {
        setRoleSprites(
          msg.roles.map((r) => ({
            id: r.id,
            sprites: r.sprites as { down: string[][][]; up: string[][][]; right: string[][][] },
          })),
        );
        setRoles(msg.roles.map((r) => ({ id: r.id, name: r.name })));
      } else if (msg.type === 'floorTilesLoaded') {
        const sprites = msg.sprites as string[][][];
        setFloorSprites(sprites);
      } else if (msg.type === 'wallTilesLoaded') {
        const sprites = msg.sprites as string[][][];
        setWallSprites(sprites);
      } else if (msg.type === 'workspaceTodos') {
        const path = msg.path;
        const todos = msg.todos;
        setWorkspaceTodos((prev) => ({ ...prev, [path]: todos }));
      } else if (msg.type === 'agent-todos') {
        const agentId = msg.agentId;
        const todos = msg.todos;
        setAgentTodos((prev) => ({ ...prev, [agentId]: todos }));
      } else if (msg.type === 'roomTemplatesLoaded') {
        setRoomTemplates(msg.templates);
      } else if (msg.type === 'rateLimit') {
        setRateLimit({
          status: msg.status,
          ...(msg.utilization !== undefined ? { utilization: msg.utilization } : {}),
          ...(msg.resetsAt !== undefined ? { resetsAt: msg.resetsAt } : {}),
          ...(msg.window ? { window: msg.window } : {}),
        });
      } else if (msg.type === 'settingsLoaded') {
        setSoundEnabled(msg.soundEnabled);
        setLaunchAtLogin(msg.launchAtLogin ?? false);
        setNotificationsEnabled(msg.notificationsEnabled ?? true);
        setUpdateChecksEnabled(msg.updateChecksEnabled ?? true);
        setPhoneViewEnabled(msg.phoneViewEnabled ?? false);
        setBypassPermissions(msg.bypassPermissions ?? false);
        setDefaultEffort(msg.defaultEffort ?? null);
        setMaxBudgetUsd(msg.maxBudgetUsd ?? 0);
      } else if (msg.type === 'phoneView') {
        setPhoneView(msg);
      } else if (msg.type === 'appUpdate') {
        setAppUpdate(msg);
      } else if (msg.type === 'schedulesLoaded') {
        setSchedules(msg.schedules);
      } else if (msg.type === 'restorableAgents') {
        setRestorable(msg.agents);
      } else if (msg.type === 'missedSchedules') {
        setMissedRuns(msg.missed);
      } else if (msg.type === 'usageSummary') {
        setUsageSummary(msg.summary);
        campus.setTodayUsage(msg.summary.todayByWorkspace ?? {});
      } else if (msg.type === 'claudeAuth') {
        setClaudeAuth(msg.status);
      } else if (msg.type === 'achievementsLoaded') {
        setAchievements(msg.achievements);
        // Mirrors into the catalog module, which gates placement imperatively
        setUnlockedAchievements(
          msg.achievements.filter((a) => a.unlockedAt !== undefined).map((a) => a.id),
        );
      } else if (msg.type === 'achievementUnlocked') {
        const unlocked = msg.achievement;
        addUnlockedAchievement(unlocked.id);
        setAchievements((prev) => {
          const idx = prev.findIndex((a) => a.id === unlocked.id);
          if (idx === -1) return [...prev, unlocked];
          const next = [...prev];
          next[idx] = unlocked;
          return next;
        });
        setUnlockQueue((prev) => [...prev, unlocked]);
      } else if (msg.type === 'agentDecor') {
        const decor = msg.decor;
        const office = campus.getOfficeForAgent(msg.id);
        if (office) {
          office.setAgentDecor(msg.id, decor);
        } else {
          // Replayed before the office exists (reload: decor arrives with the
          // agent list, ahead of layoutLoaded) — patch the buffered record the
          // way agentLabel does, or it lands on a character that isn't there.
          const pending = pendingAgents.find((p) => p.id === msg.id);
          if (pending) pending.decor = decor;
        }
        setAgentStatusTexts((prev) => {
          if (!decor.status) {
            if (!(msg.id in prev)) return prev;
            const next = { ...prev };
            delete next[msg.id];
            return next;
          }
          return { ...prev, [msg.id]: decor.status };
        });
      } else if (msg.type === 'agentNotice') {
        // A shout IS something for you, so it earns an unread bubble — and the
        // text goes on the status line, because a bubble with nothing to read
        // is just a mystery when you are sitting right there.
        campus.getOfficeForAgent(msg.id)?.setAgentDecor(msg.id, { status: msg.text });
        setAgentStatusTexts((prev) => ({ ...prev, [msg.id]: msg.text }));
        campus.getOfficeForAgent(msg.id)?.showBubble(msg.id, BubbleKind.DONE);
        playDoneSound();
      } else if (msg.type === 'worktreesLoaded') {
        setWorktrees({ workspacePath: msg.workspacePath, list: msg.worktrees });
      } else if (msg.type === 'hostNotice') {
        setNoticeQueue((prev) => [...prev, { id: nextNoticeId++, ...msg }]);
      } else if (msg.type === 'furnitureAssetsLoaded') {
        try {
          const catalog = msg.catalog as FurnitureAsset[];
          const sprites = msg.sprites as Record<string, string[][]>;
          // Build dynamic catalog immediately so getCatalogEntry() works when layoutLoaded arrives next
          buildDynamicCatalog({ catalog, sprites });
          setLoadedAssets({ catalog, sprites });
        } catch (err) {
          console.error(`❌ Webview: Error processing furnitureAssetsLoaded:`, err);
        }
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'webviewReady' });
    return () => window.removeEventListener('message', handler);
  }, [campus]);

  return {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    agentNames,
    subagentTools,
    subagentCharacters,
    layoutReady,
    loadedAssets,
    workspaces,
    workspaceTodos,
    agentTodos,
    usageSummary,
    achievements,
    claudeAuth,
    unlockQueue,
    dismissUnlock,
    agentStatusTexts,
    noticeQueue,
    dismissNotice,
    worktrees,
    agentSuggestions,
    clearAgentSuggestions,
    roles,
    schedules,
    notificationsEnabled,
    updateChecksEnabled,
    appUpdate,
    phoneViewEnabled,
    phoneView,
    launchAtLogin,
    bypassPermissions,
    defaultEffort,
    maxBudgetUsd,
    rateLimit,
    missedRuns,
    clearMissedRuns,
    restorableAgents: restorable,
    clearRestorableAgents,
  };
}
