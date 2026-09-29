/** Map status prefixes back to tool names for animation selection */
export const STATUS_TO_TOOL: Record<string, string> = {
  Reading: 'Read',
  Searching: 'Grep',
  Globbing: 'Glob',
  Fetching: 'WebFetch',
  'Searching web': 'WebSearch',
  Writing: 'Write',
  Editing: 'Edit',
  Running: 'Bash',
  Task: 'Task',
  // Sub-agent launches read as "Subtask: <what>" whichever name the CLI uses
  Subtask: 'Task',
  'Looking up': 'Grep',
  Planning: 'Task',
  Sending: 'Write',
  Scheduling: 'Write',
};

/**
 * Which activity glyph a tool belongs under. Families, not tools: the point is
 * "is it reading, writing, shelling out, on the network, or delegating" read at
 * a glance, not an exact tool name — that is what the status label is for.
 * Unmapped tools get no glyph rather than a meaningless one.
 */
export const ActivityKind = {
  SHELL: 'shell',
  SEARCH: 'search',
  EDIT: 'edit',
  WEB: 'web',
  DELEGATE: 'delegate',
} as const;
export type ActivityKind = (typeof ActivityKind)[keyof typeof ActivityKind];

const TOOL_ACTIVITY: Record<string, ActivityKind> = {
  Bash: ActivityKind.SHELL,
  BashOutput: ActivityKind.SHELL,
  Read: ActivityKind.SEARCH,
  Grep: ActivityKind.SEARCH,
  Glob: ActivityKind.SEARCH,
  ToolSearch: ActivityKind.SEARCH,
  Edit: ActivityKind.EDIT,
  Write: ActivityKind.EDIT,
  NotebookEdit: ActivityKind.EDIT,
  WebFetch: ActivityKind.WEB,
  WebSearch: ActivityKind.WEB,
  Task: ActivityKind.DELEGATE,
  Agent: ActivityKind.DELEGATE,
  Skill: ActivityKind.DELEGATE,
};

/** The glyph family for a tool name, or null when there is nothing to say. */
export function activityKindForTool(tool: string | null): ActivityKind | null {
  if (!tool) return null;
  // MCP tools are almost always network-shaped work under another name.
  if (tool.startsWith('mcp__')) return ActivityKind.WEB;
  return TOOL_ACTIVITY[tool] ?? null;
}

export function extractToolName(status: string): string | null {
  for (const [prefix, tool] of Object.entries(STATUS_TO_TOOL)) {
    if (status.startsWith(prefix)) return tool;
  }
  const first = status.split(/[\s:]/)[0];
  return first || null;
}

import {
  USAGE_USD_NO_DECIMAL_THRESHOLD,
  USAGE_USD_ONE_DECIMAL_THRESHOLD,
  ZOOM_DEFAULT_DPR_FACTOR,
  ZOOM_MIN,
} from '../constants.js';

/** Compute a default integer zoom level (device pixels per sprite pixel) */
export function defaultZoom(): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(ZOOM_MIN, Math.round(ZOOM_DEFAULT_DPR_FACTOR * dpr));
}

/** Compact money display: $0.00 → $9.99, then $12.3, then $123 */
export function formatUsd(v: number): string {
  if (v >= USAGE_USD_NO_DECIMAL_THRESHOLD) return `$${v.toFixed(0)}`;
  if (v >= USAGE_USD_ONE_DECIMAL_THRESHOLD) return `$${v.toFixed(1)}`;
  return `$${v.toFixed(2)}`;
}
