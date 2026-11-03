import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { WorkspaceInfo, WorktreeRequest } from '../../../shared/protocol.js';
import { OFFICE_POPUP_MARGIN_PX, OFFICE_POPUP_WIDTH_PX } from '../constants.js';
import { vscode } from '../vscodeApi.js';

interface OfficePopupProps {
  workspace: WorkspaceInfo;
  /**
   * CSS position within the office container. The caller clamps x and the top
   * edge only; the bottom is handled here (see liftY).
   */
  x: number;
  y: number;
  /** Number of open human todos in this workspace (shown on the Tasks button). */
  openTaskCount: number;
  onOpenTasks: () => void;
  /** Opens the worktree manager for this repo (git workspaces only). */
  onOpenWorktrees: () => void;
  onClose: () => void;
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  font: 'inherit',
  fontSize: '18px',
  padding: '3px 6px',
  background: 'var(--pixel-bg)',
  color: 'var(--pixel-text)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  outline: 'none',
};

const hintStyle: React.CSSProperties = {
  fontSize: '14px',
  color: 'var(--pixel-text-dim)',
  padding: '0 2px',
  lineHeight: 1.3,
};

const btnStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '6px 10px',
  fontSize: '22px',
  color: 'var(--pixel-text)',
  background: 'var(--pixel-btn-bg)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
};

/**
 * Pixel-styled action popup for a workspace's office, opened by clicking its
 * floor: [+ Agent] [+ Terminal] [Tasks] [Resume] [Remove]. Closes on Esc /
 * outside click.
 */
export function OfficePopup({
  workspace,
  x,
  y,
  openTaskCount,
  onOpenTasks,
  onOpenWorktrees,
  onClose,
}: OfficePopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Worktree opt-in: applies to both + Agent and + Terminal, so the choice is
  // "where does the next agent work", not a second pair of buttons.
  const [useWorktree, setUseWorktree] = useState(false);
  const [branch, setBranch] = useState('');
  const [setupDraft, setSetupDraft] = useState(workspace.setupCommand ?? '');

  /** The worktree argument for a launch, or undefined to work in the repo. */
  const worktreeArg = (): WorktreeRequest | undefined =>
    useWorktree ? { branch: branch.trim() || undefined } : undefined;

  /** Saves the setup command only when it actually changed. */
  const commitSetup = () => {
    if (setupDraft.trim() === (workspace.setupCommand ?? '').trim()) return;
    vscode.postMessage({
      type: 'setWorkspaceSetupCommand',
      path: workspace.path,
      command: setupDraft,
    });
  };

  // Esc closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  // Outside click closes (canvas clicks already close via App, this covers the rest)
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);

  // The caller never clamps the bottom edge, so a popup opened low in the
  // office ran off-screen — five actions tall since '+ Terminal' joined, it
  // does so easily. Measure the rendered height and lift it just enough to
  // fit, never past the top margin. Held in state rather than written to the
  // node directly so the lift survives the re-renders hover triggers; the
  // layout effect runs before paint, so the extra render never flashes.
  const [liftY, setLiftY] = useState(0);
  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const available = el.offsetParent?.clientHeight ?? window.innerHeight;
    const overflow = y + el.offsetHeight + OFFICE_POPUP_MARGIN_PX - available;
    // Measurement: the lift depends on the popup's own rendered height, which
    // does not exist until it has rendered. A layout effect runs before paint,
    // so the extra render never reaches the screen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiftY(overflow > 0 ? Math.max(0, Math.min(overflow, y - OFFICE_POPUP_MARGIN_PX)) : 0);
    // Ticking the worktree box adds two fields and a hint, so the popup can
    // grow past the bottom edge long after it was placed — re-measure then too.
  }, [y, useWorktree]);

  const hoverBg = (key: string, base: string) =>
    hovered === key ? 'var(--pixel-btn-hover-bg)' : base;

  return (
    <div
      ref={popupRef}
      style={{
        position: 'absolute',
        left: x,
        top: y - liftY,
        width: OFFICE_POPUP_WIDTH_PX,
        zIndex: 'var(--pixel-controls-z)',
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        boxShadow: 'var(--pixel-shadow)',
        padding: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: '22px',
          color: 'var(--pixel-text)',
          padding: '2px 6px 4px',
          borderBottom: '2px solid var(--pixel-border)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={workspace.path}
      >
        {workspace.name}
      </div>
      <button
        style={{
          ...btnStyle,
          background: hovered === 'agent' ? 'var(--pixel-agent-hover-bg)' : 'var(--pixel-agent-bg)',
          border: '2px solid var(--pixel-agent-border)',
          color: 'var(--pixel-agent-text)',
        }}
        onMouseEnter={() => setHovered('agent')}
        onMouseLeave={() => setHovered(null)}
        onClick={() => {
          commitSetup();
          vscode.postMessage({
            type: 'openChatAgent',
            folderPath: workspace.path,
            ...(worktreeArg() ? { worktree: worktreeArg() } : {}),
          });
          onClose();
        }}
        title={
          useWorktree
            ? 'Open a chat agent in its own git worktree'
            : 'Open a chat agent in this workspace'
        }
      >
        + Agent
      </button>
      <button
        style={{ ...btnStyle, background: hoverBg('terminal', 'var(--pixel-btn-bg)') }}
        onMouseEnter={() => setHovered('terminal')}
        onMouseLeave={() => setHovered(null)}
        onClick={() => {
          commitSetup();
          vscode.postMessage({
            type: 'openClaude',
            folderPath: workspace.path,
            ...(worktreeArg() ? { worktree: worktreeArg() } : {}),
          });
          onClose();
        }}
        title="Open the Claude Code CLI in a terminal tab — slash commands, Esc to interrupt"
      >
        + Terminal
      </button>
      {workspace.isGit && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            padding: '2px 2px 4px',
            borderBottom: '2px solid var(--pixel-border)',
          }}
        >
          {/* A native checkbox is the one rounded, glossy thing in a pixel UI —
              drawn here as a [x] box instead, same semantics (a real button). */}
          <button
            role="switch"
            aria-checked={useWorktree}
            onClick={() => setUseWorktree(!useWorktree)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              textAlign: 'left',
              fontSize: '18px',
              font: 'inherit',
              color: useWorktree ? 'var(--pixel-text)' : 'var(--pixel-text-dim)',
              background: 'none',
              border: 'none',
              borderRadius: 0,
              cursor: 'pointer',
              padding: '2px 4px',
            }}
            title="Run the next agent in its own checkout, on its own branch"
          >
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                flexShrink: 0,
                lineHeight: '10px',
                textAlign: 'center',
                fontSize: '14px',
                border: '2px solid var(--pixel-border)',
                background: useWorktree ? 'var(--pixel-accent)' : 'var(--pixel-bg)',
                color: 'var(--pixel-bg)',
              }}
            >
              {useWorktree ? '✕' : ''}
            </span>
            <span>⎇ Own worktree</span>
          </button>
          {useWorktree && (
            <>
              <input
                style={fieldStyle}
                value={branch}
                placeholder="branch (auto-named)"
                onChange={(e) => setBranch(e.target.value)}
                title="Branch for the new checkout — left empty, the host names it"
              />
              <input
                style={fieldStyle}
                value={setupDraft}
                placeholder="setup command (e.g. npm ci)"
                onChange={(e) => setSetupDraft(e.target.value)}
                onBlur={commitSetup}
                title="Run in every new worktree of this workspace before its agent starts"
              />
              <span style={hintStyle}>A fresh checkout has no node_modules or .env.</span>
            </>
          )}
          <button
            style={{
              ...btnStyle,
              fontSize: '18px',
              padding: '4px 4px',
              background: hoverBg('worktrees', 'transparent'),
              color: 'var(--pixel-text-dim)',
            }}
            onMouseEnter={() => setHovered('worktrees')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => {
              onOpenWorktrees();
              onClose();
            }}
            title="List this repo's checkouts: what is unmerged, who works where, and remove them"
          >
            Manage worktrees…
          </button>
        </div>
      )}
      <button
        style={{ ...btnStyle, background: hoverBg('tasks', 'var(--pixel-btn-bg)') }}
        onMouseEnter={() => setHovered('tasks')}
        onMouseLeave={() => setHovered(null)}
        onClick={() => {
          onOpenTasks();
          onClose();
        }}
        title="View and manage tasks for this workspace"
      >
        {openTaskCount > 0 ? `Tasks (${openTaskCount})` : 'Tasks'}
      </button>
      <button
        style={{ ...btnStyle, background: hoverBg('resume', 'var(--pixel-btn-bg)') }}
        onMouseEnter={() => setHovered('resume')}
        onMouseLeave={() => setHovered(null)}
        onClick={() => {
          vscode.postMessage({ type: 'listResumableSessions', folderPath: workspace.path });
          onClose();
        }}
        title="Resume a past session from this workspace"
      >
        Resume
      </button>
      <button
        style={{
          ...btnStyle,
          background: confirmRemove
            ? 'var(--pixel-danger-bg)'
            : hoverBg('remove', 'var(--pixel-btn-bg)'),
          color: confirmRemove ? '#fff' : 'var(--pixel-text-dim)',
        }}
        onMouseEnter={() => setHovered('remove')}
        onMouseLeave={() => setHovered(null)}
        onClick={() => {
          if (!confirmRemove) {
            setConfirmRemove(true);
            return;
          }
          vscode.postMessage({ type: 'removeWorkspace', path: workspace.path });
          onClose();
        }}
        title="Remove this workspace from the campus"
      >
        {confirmRemove ? 'Sure?' : '✕ Remove'}
      </button>
    </div>
  );
}
