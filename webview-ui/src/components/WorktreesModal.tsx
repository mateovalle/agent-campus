import { useEffect, useState } from 'react';

import type { WorkspaceInfo, WorktreeSummary } from '../../../shared/protocol.js';
import {
  WORKTREE_AHEAD_COLOR,
  WORKTREE_DIRTY_COLOR,
  WORKTREES_MODAL_MAX_HEIGHT_PX,
  WORKTREES_MODAL_WIDTH_PX,
} from '../constants.js';
import { vscode } from '../vscodeApi.js';

interface WorktreesModalProps {
  workspace: WorkspaceInfo;
  worktrees: WorktreeSummary[];
  /** Live agent ids — a change here means the "agents working" column is stale. */
  agents: number[];
  onClose: () => void;
}

const buttonBase: React.CSSProperties = {
  borderRadius: 0,
  fontSize: '18px',
  fontFamily: 'inherit',
  cursor: 'pointer',
  padding: '3px 10px',
  border: '2px solid var(--pixel-border)',
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text)',
};

const tagStyle: React.CSSProperties = {
  fontSize: '14px',
  padding: '0 4px',
  border: '2px solid currentColor',
  whiteSpace: 'nowrap',
};

/**
 * The worktree manager for one repo: what checkouts exist, what is unmerged
 * or uncommitted in them, who is working where, and the two things you
 * actually want to do — put an agent back into one, or drop it.
 *
 * Deliberately blunt about consequences. A worktree is real work on disk, so
 * every removal says what survives (the branch and its commits always do) and
 * an unsaved or unmerged one has to be confirmed a second time.
 */
export function WorktreesModal({ workspace, worktrees, agents, onClose }: WorktreesModalProps) {
  const [confirming, setConfirming] = useState<string | null>(null);

  // Refresh on open, and whenever an agent appears or goes: the "working
  // here" column and the removal rules are both derived from live agents.
  useEffect(() => {
    vscode.postMessage({ type: 'listWorktrees', workspacePath: workspace.path });
  }, [workspace.path, agents.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const openAgentIn = (worktree: WorktreeSummary) => {
    vscode.postMessage({
      type: 'openChatAgent',
      folderPath: workspace.path,
      worktree: { path: worktree.path },
    });
    onClose();
  };

  const remove = (worktree: WorktreeSummary) => {
    // Uncommitted work is the only thing a removal can destroy, so it is the
    // only thing that needs --force. Commits always survive on the branch.
    vscode.postMessage({
      type: 'removeWorktree',
      workspacePath: workspace.path,
      path: worktree.path,
      force: worktree.dirty,
    });
    setConfirming(null);
  };

  const others = worktrees.filter((w) => !w.isMain);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 59,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: WORKTREES_MODAL_WIDTH_PX,
          maxHeight: WORKTREES_MODAL_MAX_HEIGHT_PX,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 60,
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          borderRadius: 0,
          boxShadow: 'var(--pixel-shadow)',
          padding: 12,
          color: 'var(--pixel-text)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: '22px' }}>⎇ Worktrees · {workspace.name}</span>
          <button style={{ ...buttonBase, padding: '2px 8px' }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {worktrees
            .filter((w) => w.isMain)
            .map((main) => (
              <div
                key={main.path}
                style={{
                  fontSize: '16px',
                  color: 'var(--pixel-text-dim)',
                  borderBottom: '2px solid var(--pixel-border)',
                  paddingBottom: 6,
                }}
              >
                The repo itself is on {main.branch ?? '(detached)'}
                {main.dirty ? ' · uncommitted changes' : ''}
                {main.agentIds.length > 0
                  ? ` · ${main.agentIds.length} agent${main.agentIds.length === 1 ? '' : 's'} here`
                  : ''}
                . New worktrees branch off it.
              </div>
            ))}

          {others.length === 0 && (
            <div style={{ fontSize: '18px', color: 'var(--pixel-text-dim)', padding: '8px 2px' }}>
              No worktrees yet. Tick “⎇ Own worktree” when you add an agent to give it a private
              checkout.
            </div>
          )}

          {others.map((worktree) => {
            const busy = worktree.agentIds.length > 0;
            const risky = worktree.dirty || worktree.ahead > 0;
            const isConfirming = confirming === worktree.path;
            return (
              <div
                key={worktree.path}
                style={{
                  border: '2px solid var(--pixel-border)',
                  padding: '6px 8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '20px' }}>{worktree.branch ?? '(detached)'}</span>
                  {worktree.dirty && (
                    <span style={{ ...tagStyle, color: WORKTREE_DIRTY_COLOR }}>uncommitted</span>
                  )}
                  {worktree.ahead > 0 && (
                    <span style={{ ...tagStyle, color: WORKTREE_AHEAD_COLOR }}>
                      {worktree.ahead} unmerged
                    </span>
                  )}
                  {busy && (
                    <span style={{ ...tagStyle, color: 'var(--pixel-chat-green)' }}>
                      {worktree.agentIds.length === 1
                        ? '1 agent here'
                        : `${worktree.agentIds.length} agents here`}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: '14px',
                    color: 'var(--pixel-text-dim)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={worktree.path}
                >
                  {worktree.path}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={buttonBase} onClick={() => openAgentIn(worktree)}>
                    + Agent here
                  </button>
                  <button
                    style={{
                      ...buttonBase,
                      marginLeft: 'auto',
                      ...(isConfirming
                        ? { background: 'var(--pixel-danger-bg)', color: '#fff' }
                        : {}),
                      ...(busy ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
                    }}
                    disabled={busy}
                    title={
                      busy
                        ? 'An agent is working here — close it first'
                        : 'Remove this checkout (its branch and commits are kept)'
                    }
                    onClick={() => {
                      if (isConfirming) remove(worktree);
                      else setConfirming(worktree.path);
                    }}
                  >
                    {isConfirming ? (worktree.dirty ? 'Discard changes?' : 'Sure?') : '✕ Remove'}
                  </button>
                </div>
                {isConfirming && (
                  <div style={{ fontSize: '14px', color: 'var(--pixel-text-dim)' }}>
                    {risky
                      ? `Deletes the checkout${worktree.dirty ? ' and its uncommitted changes' : ''}. The branch ${worktree.branch ?? ''} and its commits stay.`
                      : 'Deletes the checkout. The branch stays.'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
