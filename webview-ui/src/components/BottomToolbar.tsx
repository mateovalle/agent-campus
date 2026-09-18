import { useState } from 'react';

import type {
  AchievementInfo,
  ScheduleEntry,
  UsageSummary,
  WorkspaceInfo,
} from '../../../shared/protocol.js';
import {
  TOOLBAR_BUBBLE_GAP_PX,
  TOOLBAR_BUBBLE_SIZE_PX,
  TOOLBAR_ICON_ACCENT,
  TOOLBAR_ICON_FG,
  TOOLBAR_TOOLTIP_FONT_SIZE_PX,
} from '../constants.js';
import { vscode } from '../vscodeApi.js';
import { PixelIcon } from './PixelIcon.js';
import { SettingsModal } from './SettingsModal.js';
import {
  ICON_ASSISTANT,
  ICON_BOARD,
  ICON_LAYOUT,
  ICON_SETTINGS,
  ICON_WORKSPACE,
  type IconGrid,
} from './toolbarIcons.js';

interface BottomToolbarProps {
  isEditMode: boolean;
  onToggleEditMode: () => void;
  isBoardOpen: boolean;
  onToggleBoard: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  /** Latest usage summary from the host (live-updated after each chat turn). */
  usageSummary: UsageSummary | null;
  /** Full achievements list from the host (empty until loaded). */
  achievements: AchievementInfo[];
  /** Recurring scheduled runs (Electron only; empty elsewhere). */
  schedules: ScheduleEntry[];
  /** Registered workspaces (targets for the new-schedule form). */
  workspaces: WorkspaceInfo[];
  /** Available dispatch roles (for the new-schedule form). */
  roles: Array<{ id: string; name: string }>;
  launchAtLogin: boolean;
  bypassPermissions: boolean;
}

interface BubbleProps {
  icon: IconGrid;
  label: string;
  tooltip: string;
  onClick: () => void;
  /** Highlighted with the accent border (toggled panels/modes). */
  active?: boolean;
  /** Green "agent" theming (the Assistant bubble). */
  agentTheme?: boolean;
}

function ToolbarBubble({ icon, label, tooltip, onClick, active, agentTheme }: BubbleProps) {
  const [hovered, setHovered] = useState(false);

  const border = active
    ? '2px solid var(--pixel-accent)'
    : agentTheme
      ? '2px solid var(--pixel-agent-border)'
      : '2px solid var(--pixel-border)';
  const background = active
    ? 'var(--pixel-active-bg)'
    : agentTheme
      ? hovered
        ? 'var(--pixel-agent-hover-bg)'
        : 'var(--pixel-agent-bg)'
      : hovered
        ? 'var(--pixel-btn-hover-bg)'
        : 'var(--pixel-bg)';

  return (
    // pointerEvents re-enabled per bubble — the full-height parent strip is
    // pointerEvents:none so it doesn't eat canvas clicks.
    <div style={{ position: 'relative', pointerEvents: 'auto' }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={label}
        style={{
          width: TOOLBAR_BUBBLE_SIZE_PX,
          height: TOOLBAR_BUBBLE_SIZE_PX,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          background,
          border,
          borderRadius: 0,
          boxShadow: 'var(--pixel-shadow)',
          cursor: 'pointer',
        }}
      >
        <PixelIcon grid={icon} fg={TOOLBAR_ICON_FG} accent={TOOLBAR_ICON_ACCENT} />
      </button>
      {hovered && (
        <div
          style={{
            position: 'absolute',
            right: '100%',
            top: '50%',
            transform: 'translateY(-50%)',
            marginRight: 8,
            padding: '3px 8px',
            background: 'var(--pixel-bg)',
            border: '2px solid var(--pixel-border-light)',
            boxShadow: 'var(--pixel-shadow)',
            fontSize: TOOLBAR_TOOLTIP_FONT_SIZE_PX,
            color: 'var(--pixel-text)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          <div>{label}</div>
          <div
            style={{ fontSize: TOOLBAR_TOOLTIP_FONT_SIZE_PX - 4, color: 'var(--pixel-text-dim)' }}
          >
            {tooltip}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Floating icon bubbles on the right edge, ordered by usage frequency:
 * Assistant, Board, + Workspace, Layout, Settings. Hover shows a pixel
 * tooltip to the left.
 */
export function BottomToolbar({
  isEditMode,
  onToggleEditMode,
  isBoardOpen,
  onToggleBoard,
  isDebugMode,
  onToggleDebugMode,
  usageSummary,
  achievements,
  schedules,
  workspaces,
  roles,
  launchAtLogin,
  bypassPermissions,
}: BottomToolbarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div
      // Full-height flex column (no transform!): a transformed ancestor would
      // become the containing block for the fixed-position SettingsModal and
      // pin it to this 42px strip instead of the viewport.
      style={{
        position: 'absolute',
        right: 10,
        top: 0,
        bottom: 0,
        zIndex: 'var(--pixel-controls-z)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: TOOLBAR_BUBBLE_GAP_PX,
        pointerEvents: 'none',
      }}
    >
      <ToolbarBubble
        icon={ICON_ASSISTANT}
        label="Assistant"
        tooltip="Campus assistant: status, tasks, spending, dispatch"
        onClick={() => vscode.postMessage({ type: 'openAssistant' })}
        agentTheme
      />
      <ToolbarBubble
        icon={ICON_BOARD}
        label="Board"
        tooltip="Open tasks, working agents, and what needs you"
        onClick={onToggleBoard}
        active={isBoardOpen}
      />
      <ToolbarBubble
        icon={ICON_WORKSPACE}
        label="+ Workspace"
        tooltip="Register a project folder as a new office"
        onClick={() => vscode.postMessage({ type: 'addWorkspace' })}
      />
      <ToolbarBubble
        icon={ICON_LAYOUT}
        label="Layout"
        tooltip="Edit the office: floors, walls, furniture"
        onClick={onToggleEditMode}
        active={isEditMode}
      />
      <div style={{ position: 'relative', pointerEvents: 'auto' }}>
        <ToolbarBubble
          icon={ICON_SETTINGS}
          label="Settings"
          tooltip="Sound, layout import/export, usage, debug"
          onClick={() => setIsSettingsOpen((v) => !v)}
          active={isSettingsOpen}
        />
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isDebugMode={isDebugMode}
          onToggleDebugMode={onToggleDebugMode}
          usageSummary={usageSummary}
          achievements={achievements}
          schedules={schedules}
          workspaces={workspaces}
          roles={roles}
          launchAtLogin={launchAtLogin}
          onSetLaunchAtLogin={(enabled) =>
            vscode.postMessage({ type: 'setLaunchAtLogin', enabled })
          }
          bypassPermissions={bypassPermissions}
          onSetBypassPermissions={(enabled) =>
            vscode.postMessage({ type: 'setBypassPermissions', enabled })
          }
        />
      </div>
    </div>
  );
}
