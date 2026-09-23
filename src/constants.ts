// Host-agnostic constants live in src/core/constants.ts and are re-exported
// here so existing imports keep working.
export * from './core/constants.js';

// ── Settings Persistence ────────────────────────────────────
export const GLOBAL_KEY_SOUND_ENABLED = 'agent-campus.soundEnabled';
export const GLOBAL_KEY_BYPASS_PERMISSIONS = 'agent-campus.bypassPermissions';

// ── VS Code Identifiers ─────────────────────────────────────
export const VIEW_ID = 'agent-campus.panelView';
export const COMMAND_SHOW_PANEL = 'agent-campus.showPanel';
export const COMMAND_EXPORT_DEFAULT_LAYOUT = 'agent-campus.exportDefaultLayout';
export const WORKSPACE_KEY_AGENTS = 'agent-campus.agents';
export const WORKSPACE_KEY_AGENT_SEATS = 'agent-campus.agentSeats';
export const WORKSPACE_KEY_LAYOUT = 'agent-campus.layout';
export const TERMINAL_NAME_PREFIX = 'Claude Code';

// ── Agent Restore ───────────────────────────────────────────
/**
 * On window reload, terminals are restored asynchronously — persisted agents
 * whose terminals haven't appeared yet get this long before being pruned.
 */
export const RESTORE_GRACE_MS = 15000;
