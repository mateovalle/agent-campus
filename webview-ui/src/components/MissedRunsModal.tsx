import { useState } from 'react';

import type { MissedScheduleRun } from '../../../shared/protocol.js';
import { describeCadence, workspaceBasename } from '../scheduleUtils.js';
import { vscode } from '../vscodeApi.js';

interface MissedRunsModalProps {
  missed: MissedScheduleRun[];
  /** Clears the list locally after resolveMissedSchedules is sent. */
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
 * Launch prompt for scheduled runs missed while the app was closed: the user
 * picks which to dispatch now; everything offered is marked handled either way.
 */
export function MissedRunsModal({ missed, onResolved }: MissedRunsModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  if (missed.length === 0) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resolve = (runIds: string[]) => {
    const skipIds = missed.map((m) => m.schedule.id).filter((id) => !runIds.includes(id));
    vscode.postMessage({ type: 'resolveMissedSchedules', runIds, skipIds });
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
          Missed scheduled runs
        </div>
        <div style={{ fontSize: '18px', color: 'rgba(255,255,255,0.55)', padding: '0 6px 8px' }}>
          These were scheduled while the app was closed. Pick which to run now.
        </div>
        {missed.map((m) => {
          const id = m.schedule.id;
          const checked = selected.has(id);
          return (
            <label
              key={id}
              title={m.schedule.prompt}
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
                  toggle(id);
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
                <span style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {describeCadence(m.schedule)} · {workspaceBasename(m.schedule.workspacePath)}
                  {m.schedule.role ? ` · ${m.schedule.role}` : ''}
                </span>
                <br />
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {m.missedCount > 1 ? `${m.missedCount} missed, ` : ''}last:{' '}
                  {new Date(m.lastMissedAtMs).toLocaleString([], {
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
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
            Skip all
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
            Run selected ({selected.size})
          </button>
        </div>
      </div>
    </>
  );
}
