/**
 * Host-agnostic core types shared by the VS Code extension host and the
 * Electron main process. Nothing in src/core may import 'vscode' or
 * 'electron' — hosts talk to the UI through the Send callback.
 */

import type * as fs from 'fs';

import type { HostToWebviewMessage } from '../../shared/protocol.js';

/** Posts a message to the current UI (webview / renderer). */
export type Send = (message: HostToWebviewMessage) => void;

/** Per-turn tool-usage tallies, feeding end-of-turn action suggestions. */
export interface TurnStats {
  /** Edit/Write/NotebookEdit tool_use count (main agent + sub-agents). */
  editCount: number;
  /** tool_results flagged is_error. */
  errorCount: number;
  /** A Bash command matching a test/check pattern ran this turn. */
  ranTests: boolean;
}

export function createTurnStats(): TurnStats {
  return { editCount: 0, errorCount: 0, ranTests: false };
}

export interface CoreAgentState {
  id: number;
  projectDir: string;
  jsonlFile: string;
  fileOffset: number;
  /** Carry of undecoded bytes from the last read (unterminated line, possibly mid-UTF-8-char). */
  lineBuffer: Buffer;
  activeToolIds: Set<string>;
  activeToolStatuses: Map<string, string>;
  activeToolNames: Map<string, string>;
  activeSubagentToolIds: Map<string, Set<string>>; // parentToolId → active sub-tool IDs
  activeSubagentToolNames: Map<string, Map<string, string>>; // parentToolId → (subToolId → toolName)
  activeTaskSubagentRoles: Map<string, string>; // Task toolId → role skin id (for replay on reload)
  isWaiting: boolean;
  permissionSent: boolean;
  hadToolsInTurn: boolean;
  /** Reset on every new user prompt and after each turn_duration. */
  turnStats: TurnStats;
  /** Workspace folder name (only set for multi-root workspaces) */
  folderName?: string;
}

/** Creates a fresh CoreAgentState. Hosts extend the result with their own fields. */
export function createCoreAgentState(
  id: number,
  projectDir: string,
  jsonlFile: string,
): CoreAgentState {
  return {
    id,
    projectDir,
    jsonlFile,
    fileOffset: 0,
    lineBuffer: Buffer.alloc(0),
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    activeTaskSubagentRoles: new Map(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    turnStats: createTurnStats(),
  };
}

/**
 * All mutable tracking state threaded through the core functions.
 * `send` must resolve the current UI at call time (not capture it),
 * so a recreated webview/window keeps receiving messages.
 */
export interface TrackerContext<A extends CoreAgentState = CoreAgentState> {
  agents: Map<number, A>;
  fileWatchers: Map<number, fs.FSWatcher>;
  pollingTimers: Map<number, ReturnType<typeof setInterval>>;
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>;
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>;
  send: Send;
  persistAgents: () => void;
  /** Called when a new user text prompt starts a turn (hosts use it e.g. to auto-name agents). */
  onUserPrompt?: (agentId: number, text: string) => void;
}
