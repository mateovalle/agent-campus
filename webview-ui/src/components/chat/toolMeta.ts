/**
 * Per-tool display metadata for chat tool cards: category (→ color),
 * pixel icon, prettified name and optional badge (MCP server, sub-agent
 * type). ToolCard stays a thin dispatcher over this registry — adding a
 * new tool means adding an entry here.
 */

import type { AgentTodo } from '../../../../shared/protocol.js';
import { CHAT_CATEGORY_ICON_COLORS } from '../../constants.js';
import type { IconGrid } from '../toolbarIcons.js';
import type { ChatItem } from './chatModel.js';
import {
  ICON_TOOL_BASH,
  ICON_TOOL_EDIT,
  ICON_TOOL_GENERIC,
  ICON_TOOL_MCP,
  ICON_TOOL_PLAN,
  ICON_TOOL_READ,
  ICON_TOOL_SEARCH,
  ICON_TOOL_TASK,
  ICON_TOOL_TODO,
  ICON_TOOL_WEB,
  ICON_TOOL_WRITE,
} from './toolIcons.js';

export type ToolCategory = 'read' | 'write' | 'exec' | 'web' | 'agent' | 'mcp' | 'other';

export interface ToolMeta {
  category: ToolCategory;
  icon: IconGrid;
  /** Display name (MCP tool names prettified). */
  displayName: string;
  /** Small bracketed badge, e.g. the MCP server or Task subagent_type. */
  badge?: string;
}

/** CSS color (variable reference) for each tool category. */
const CATEGORY_COLORS: Record<ToolCategory, string> = {
  read: 'var(--pixel-chat-blue)',
  write: 'var(--pixel-chat-amber)',
  exec: 'var(--pixel-chat-green)',
  web: 'var(--pixel-chat-cyan)',
  agent: 'var(--pixel-chat-purple)',
  mcp: 'var(--pixel-chat-teal)',
  other: 'var(--pixel-border-light)',
};

export function categoryColor(category: ToolCategory): string {
  return CATEGORY_COLORS[category];
}

/**
 * Hex color for the canvas-drawn PixelIcon of a category. Canvas fillStyle
 * can't resolve CSS variables (it silently keeps the previous fill — black),
 * so icons must not receive categoryColor().
 */
export function categoryIconColor(category: ToolCategory): string {
  return CHAT_CATEGORY_ICON_COLORS[category];
}

/** Built-in tool registry (MCP tools are resolved dynamically). */
const BUILTIN_TOOLS: Record<string, { category: ToolCategory; icon: IconGrid }> = {
  Read: { category: 'read', icon: ICON_TOOL_READ },
  Grep: { category: 'read', icon: ICON_TOOL_SEARCH },
  Glob: { category: 'read', icon: ICON_TOOL_SEARCH },
  NotebookRead: { category: 'read', icon: ICON_TOOL_READ },
  Write: { category: 'write', icon: ICON_TOOL_WRITE },
  Edit: { category: 'write', icon: ICON_TOOL_EDIT },
  MultiEdit: { category: 'write', icon: ICON_TOOL_EDIT },
  NotebookEdit: { category: 'write', icon: ICON_TOOL_EDIT },
  Bash: { category: 'exec', icon: ICON_TOOL_BASH },
  BashOutput: { category: 'exec', icon: ICON_TOOL_BASH },
  KillShell: { category: 'exec', icon: ICON_TOOL_BASH },
  WebFetch: { category: 'web', icon: ICON_TOOL_WEB },
  WebSearch: { category: 'web', icon: ICON_TOOL_WEB },
  Task: { category: 'agent', icon: ICON_TOOL_TASK },
  TodoWrite: { category: 'agent', icon: ICON_TOOL_TODO },
  AskUserQuestion: { category: 'agent', icon: ICON_TOOL_TASK },
  ExitPlanMode: { category: 'agent', icon: ICON_TOOL_PLAN },
  EnterPlanMode: { category: 'agent', icon: ICON_TOOL_PLAN },
  Skill: { category: 'agent', icon: ICON_TOOL_GENERIC },
  SlashCommand: { category: 'agent', icon: ICON_TOOL_GENERIC },
};

const MCP_NAME_PATTERN = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/;

/** `mcp__server__tool_name` → { server: 'server', tool: 'tool name' }. */
function parseMcpName(name: string): { server: string; tool: string } | null {
  const match = MCP_NAME_PATTERN.exec(name);
  if (!match) return null;
  return { server: match[1], tool: match[2].replace(/_/g, ' ') };
}

export function resolveToolMeta(name: string, input: Record<string, unknown>): ToolMeta {
  const mcp = parseMcpName(name);
  if (mcp) {
    return { category: 'mcp', icon: ICON_TOOL_MCP, displayName: mcp.tool, badge: mcp.server };
  }
  const builtin = BUILTIN_TOOLS[name];
  if (!builtin) {
    return { category: 'other', icon: ICON_TOOL_GENERIC, displayName: name };
  }
  const meta: ToolMeta = { ...builtin, displayName: name };
  if (name === 'Task' && typeof input.subagent_type === 'string' && input.subagent_type !== '') {
    meta.badge = input.subagent_type;
  }
  return meta;
}

// ── Per-tool structured input parsing ────────────────────────

/** Line counts for a collapsed Edit card ("+12 −4"), or null if not a diff. */
export function editDiffStats(
  input: Record<string, unknown>,
): { added: number; removed: number } | null {
  const oldString = input.old_string;
  const newString = input.new_string;
  if (typeof oldString !== 'string' || typeof newString !== 'string') return null;
  return {
    added: newString === '' ? 0 : newString.split('\n').length,
    removed: oldString === '' ? 0 : oldString.split('\n').length,
  };
}

/** The todo list from a TodoWrite input, or null if malformed. */
export function parseTodoInput(input: Record<string, unknown>): AgentTodo[] | null {
  const raw = input.todos;
  if (!Array.isArray(raw)) return null;
  const todos: AgentTodo[] = [];
  for (const t of raw) {
    if (typeof t !== 'object' || t === null) return null;
    const rec = t as Record<string, unknown>;
    if (typeof rec.content !== 'string') return null;
    const status =
      rec.status === 'completed' || rec.status === 'in_progress' ? rec.status : 'pending';
    todos.push({ content: rec.content, status });
  }
  return todos.length > 0 ? todos : null;
}

/** The plan markdown from an ExitPlanMode input, or null. */
export function planText(input: Record<string, unknown>): string | null {
  return typeof input.plan === 'string' && input.plan.trim() !== '' ? input.plan : null;
}

// ── Read-run grouping ────────────────────────────────────────

export type ToolChatItem = Extract<ChatItem, { kind: 'tool' }>;

export type ChatRenderNode =
  { type: 'item'; item: ChatItem } | { type: 'group'; items: ToolChatItem[] };

const GROUPABLE_TOOLS = new Set(['Read', 'Grep', 'Glob', 'NotebookRead']);

function isGroupable(item: ChatItem): item is ToolChatItem {
  return item.kind === 'tool' && GROUPABLE_TOOLS.has(item.name) && item.status !== 'running';
}

/**
 * Fold the chat item list into render nodes, collapsing runs of ≥min
 * consecutive finished read-category tool calls into groups. A running
 * tool (or any non-tool item) breaks the run.
 */
export function buildRenderNodes(items: ChatItem[], min: number): ChatRenderNode[] {
  const nodes: ChatRenderNode[] = [];
  let run: ToolChatItem[] = [];

  const flush = () => {
    if (run.length >= min) {
      nodes.push({ type: 'group', items: run });
    } else {
      for (const item of run) nodes.push({ type: 'item', item });
    }
    run = [];
  };

  for (const item of items) {
    if (isGroupable(item)) {
      run.push(item);
    } else {
      flush();
      nodes.push({ type: 'item', item });
    }
  }
  flush();
  return nodes;
}
