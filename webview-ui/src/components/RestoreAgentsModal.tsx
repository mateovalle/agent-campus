import { useState } from 'react';

import type { RestorableAgent } from '../../../shared/protocol.js';
import { vscode } from '../vscodeApi.js';

interface RestoreAgentsModalProps {
  agents: RestorableAgent[];
  /** Clears the list locally after restoreAgents is sent. */
  onResolved: () => void;
}

const buttonBase: React.CSSProperties = {
  borderRadius: 0,
  fontSize: '20px',
  cursor: 'pointer',
  padding: '4px 12px',
  fontFamily: 'inherit',
};

/**
 * Launch prompt for the agents that were open when the app last quit.
 *
 * Asks rather than restoring on its own: every agent brought back is a real
 * Claude session spawning, which costs money or plan limits and may start
 * running tools — not something to do to someone before they've looked at the
 * screen. Everything offered is forgotten either way, so declining is final
 * and the same list never greets you twice.
 */
export function RestoreAgentsModal({ agents, onResolved }: RestoreAgentsModalProps) {
  // Pre-selected: wanting back what you had is the common case, and the
  // decision that costs something (restoring) stays an explicit click.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(agents.map((a) => a.sessionId)),
  );
  if (agents.length === 0) return null;

  const toggle = (sessionId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const resolve = (sessionIds: string[]) => {
    const skipIds = agents.map((a) => a.sessionId).filter((id) => !sessionIds.includes(id));
    vscode.postMessage({ type: 'restoreAgents', sessionIds, skipIds });
    onResolved();
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
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
          zIndex: 60,
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          borderRadius: 0,
          boxShadow: 'var(--pixel-shadow)',
          padding: '8px',
          minWidth: 320,
          maxWidth: 440,
          maxHeight: '70vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ fontSize: '24px', color: 'rgba(255,255,255,0.9)', padding: '2px 6px' }}>
          Pick up where you left off
        </div>
        <div style={{ fontSize: '18px', color: 'rgba(255,255,255,0.55)', padding: '0 6px 8px' }}>
          These agents were open when you quit. Restoring one resumes its conversation — it will not
          continue on its own.
        </div>
        {agents.map((agent) => {
          const checked = selected.has(agent.sessionId);
          return (
            <label
              key={agent.sessionId}
              title={agent.cwd}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '4px 6px',
                fontSize: '18px',
                color: 'rgba(255,255,255,0.8)',
                cursor: 'pointer',
              }}
            >
              <span
                onClick={(e) => {
                  e.preventDefault();
                  toggle(agent.sessionId);
                }}
                style={{
                  width: 14,
                  height: 14,
                  marginTop: 2,
                  border: '2px solid rgba(255,255,255,0.5)',
                  background: checked ? 'rgba(90, 140, 255, 0.8)' : 'transparent',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  lineHeight: 1,
                  color: '#fff',
                }}
              >
                {checked ? 'X' : ''}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    color: 'rgba(255,255,255,0.9)',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {agent.label}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {agent.folderName} · {agent.kind === 'terminal' ? 'terminal' : 'chat'}
                  {agent.role ? ` · ${agent.role}` : ''}
                </span>
              </span>
            </label>
          );
        })}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '8px 6px 2px',
          }}
        >
          <button
            onClick={() => resolve([])}
            style={{
              ...buttonBase,
              background: 'transparent',
              border: '2px solid var(--pixel-border)',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            Not now
          </button>
          <button
            onClick={() => resolve([...selected])}
            disabled={selected.size === 0}
            style={{
              ...buttonBase,
              background: selected.size > 0 ? 'var(--pixel-accent)' : 'transparent',
              border: '2px solid var(--pixel-accent)',
              color: selected.size > 0 ? '#fff' : 'rgba(255,255,255,0.4)',
              cursor: selected.size > 0 ? 'pointer' : 'default',
            }}
          >
            Restore ({selected.size})
          </button>
        </div>
      </div>
    </>
  );
}
