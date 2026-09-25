import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { WorkspaceInfo } from '../../../shared/protocol.js';
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
  onClose: () => void;
}

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
  onClose,
}: OfficePopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

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
    setLiftY(overflow > 0 ? Math.max(0, Math.min(overflow, y - OFFICE_POPUP_MARGIN_PX)) : 0);
  }, [y]);

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
          vscode.postMessage({ type: 'openChatAgent', folderPath: workspace.path });
          onClose();
        }}
        title="Open a chat agent in this workspace"
      >
        + Agent
      </button>
      <button
        style={{ ...btnStyle, background: hoverBg('terminal', 'var(--pixel-btn-bg)') }}
        onMouseEnter={() => setHovered('terminal')}
        onMouseLeave={() => setHovered(null)}
        onClick={() => {
          vscode.postMessage({ type: 'openClaude', folderPath: workspace.path });
          onClose();
        }}
        title="Open the Claude Code CLI in a terminal tab — slash commands, Esc to interrupt"
      >
        + Terminal
      </button>
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
