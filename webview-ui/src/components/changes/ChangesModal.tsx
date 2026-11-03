import { useEffect, useState } from 'react';

import type { GitFileChange, HostToWebviewMessage } from '../../../../shared/protocol.js';
import { CHANGES_MODAL_MAX_HEIGHT_PX, CHANGES_MODAL_WIDTH_PX } from '../../constants.js';
import { vscode } from '../../vscodeApi.js';
import { formatChangeCount } from './diffModel.js';
import { DiffView } from './DiffView.js';

interface ChangesModalProps {
  agentId: number;
  agentName: string;
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

/** Colour per status, so the list reads before it is read. */
const STATUS_COLOR: Record<GitFileChange['status'], string> = {
  added: 'var(--pixel-chat-green)',
  untracked: 'var(--pixel-chat-green)',
  modified: 'var(--pixel-chat-amber)',
  deleted: 'var(--pixel-chat-red)',
  renamed: 'var(--pixel-chat-blue)',
};

const STATUS_LABEL: Record<GitFileChange['status'], string> = {
  added: 'added',
  untracked: 'new',
  modified: 'changed',
  deleted: 'deleted',
  renamed: 'renamed',
};

/**
 * What an agent changed, as a reviewable list.
 *
 * The campus has always been able to say an agent finished and never what it
 * did — which is the odd half of shipping a private checkout per agent. This
 * is that half: every file different from HEAD in the directory the agent
 * runs in, each one openable into its own diff.
 *
 * Read-only on purpose for now. Committing and opening a PR belong here too,
 * but reviewing is the step that has to exist first.
 */
export function ChangesModal({ agentId, agentName, onClose }: ChangesModalProps) {
  const [files, setFiles] = useState<GitFileChange[] | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [patches, setPatches] = useState<Record<string, string>>({});

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as HostToWebviewMessage;
      if (msg.type === 'agentChanges' && msg.agentId === agentId) {
        setFiles(msg.files);
        setBranch(msg.branch ?? null);
        setError(msg.error ?? null);
      } else if (msg.type === 'agentFileDiff' && msg.agentId === agentId) {
        setPatches((prev) => ({ ...prev, [msg.file]: msg.patch }));
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'requestAgentChanges', agentId });
    return () => window.removeEventListener('message', onMessage);
  }, [agentId]);

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

  const toggle = (file: GitFileChange) => {
    if (open === file.path) {
      setOpen(null);
      return;
    }
    setOpen(file.path);
    // Asked for once and kept: a diff is a snapshot of a moment, and
    // re-fetching on every expand would make the panel flicker while an agent
    // is still writing.
    if (patches[file.path] === undefined) {
      vscode.postMessage({
        type: 'requestAgentFileDiff',
        agentId,
        file: file.path,
        untracked: file.status === 'untracked',
      });
    }
  };

  const totals = (files ?? []).reduce(
    (sum, f) => ({ added: sum.added + f.added, removed: sum.removed + f.removed }),
    { added: 0, removed: 0 },
  );

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 'var(--pixel-modal-backdrop-z)',
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: CHANGES_MODAL_WIDTH_PX,
          maxHeight: CHANGES_MODAL_MAX_HEIGHT_PX,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 'var(--pixel-modal-z)',
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
          <span style={{ fontSize: '22px' }}>
            Changes · {agentName}
            {branch && <span style={{ color: 'var(--pixel-text-dim)' }}> · ⎇ {branch}</span>}
          </span>
          <button style={{ ...buttonBase, padding: '2px 8px' }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {error && <div style={{ fontSize: '16px', color: 'var(--pixel-chat-red)' }}>{error}</div>}
          {!error && files === null && (
            <div style={{ fontSize: '16px', color: 'var(--pixel-text-dim)' }}>Reading…</div>
          )}
          {!error && files?.length === 0 && (
            <div style={{ fontSize: '16px', color: 'var(--pixel-text-dim)' }}>
              Nothing changed here yet.
            </div>
          )}
          {files?.map((file) => {
            const count = formatChangeCount(file.added, file.removed);
            return (
              <div key={file.path} style={{ border: '2px solid var(--pixel-border)' }}>
                <button
                  onClick={() => toggle(file)}
                  style={{
                    ...buttonBase,
                    border: 'none',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                    textAlign: 'left',
                    fontSize: '16px',
                  }}
                >
                  <span style={{ color: 'var(--pixel-text-dim)' }}>
                    {open === file.path ? '▾' : '▸'}
                  </span>
                  <span style={{ flex: 1, overflowWrap: 'anywhere' }}>
                    {file.path}
                    {file.oldPath && (
                      <span style={{ color: 'var(--pixel-text-dim)' }}> ← {file.oldPath}</span>
                    )}
                  </span>
                  <span style={{ fontSize: '14px', color: STATUS_COLOR[file.status] }}>
                    {STATUS_LABEL[file.status]}
                  </span>
                  {count && (
                    <span style={{ fontSize: '14px', color: 'var(--pixel-text-dim)' }}>
                      {count}
                    </span>
                  )}
                </button>
                {open === file.path && (
                  <DiffView
                    patch={patches[file.path]}
                    deleted={file.status === 'deleted'}
                    onOpenFile={() =>
                      vscode.postMessage({ type: 'openFile', agentId, path: file.path })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        {files && files.length > 0 && (
          <div
            style={{
              marginTop: 8,
              fontSize: '14px',
              color: 'var(--pixel-text-dim)',
            }}
          >
            {files.length} {files.length === 1 ? 'file' : 'files'} ·{' '}
            {formatChangeCount(totals.added, totals.removed) || 'no line changes'}
          </div>
        )}
      </div>
    </>
  );
}
