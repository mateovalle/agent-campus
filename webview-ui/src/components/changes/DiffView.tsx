import { useMemo } from 'react';

import { DIFF_MAX_LINES, DIFF_VIEW_MAX_HEIGHT_PX } from '../../constants.js';
import { parseUnifiedDiff } from './diffModel.js';

interface DiffViewProps {
  /** Undefined while the host is still reading it. */
  patch: string | undefined;
  deleted: boolean;
  onOpenFile: () => void;
}

const lineStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '12px',
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  padding: '0 6px',
  margin: 0,
};

const gutterStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 34,
  marginRight: 6,
  textAlign: 'right',
  color: 'var(--pixel-text-dim)',
  opacity: 0.6,
  userSelect: 'none',
};

const noteStyle: React.CSSProperties = {
  fontSize: '14px',
  color: 'var(--pixel-text-dim)',
  padding: '4px 6px',
};

/**
 * One file's diff, coloured like the chat's Edit cards so a change looks the
 * same wherever the app shows it.
 *
 * Monospace with a line-number gutter, because the number is how a reviewer
 * gets from here to their editor — and clicking the header takes them there,
 * through the same resolve-and-open path a file mention in chat uses.
 */
export function DiffView({ patch, deleted, onOpenFile }: DiffViewProps) {
  const parsed = useMemo(() => parseUnifiedDiff(patch ?? ''), [patch]);

  if (patch === undefined) return <div style={noteStyle}>Reading…</div>;
  if (parsed.binary) return <div style={noteStyle}>Binary file — nothing to show.</div>;
  if (parsed.lines.length === 0) return <div style={noteStyle}>No textual changes.</div>;

  return (
    <div style={{ borderTop: '2px solid var(--pixel-border)' }}>
      <div style={{ maxHeight: DIFF_VIEW_MAX_HEIGHT_PX, overflowY: 'auto', padding: '4px 0' }}>
        {parsed.lines.map((line, i) => {
          const background =
            line.kind === 'add'
              ? 'var(--pixel-chat-diff-new-bg)'
              : line.kind === 'remove'
                ? 'var(--pixel-chat-diff-old-bg)'
                : undefined;
          if (line.kind === 'hunk') {
            return (
              <div key={i} style={{ ...lineStyle, color: 'var(--pixel-chat-blue)', opacity: 0.8 }}>
                {line.text}
              </div>
            );
          }
          return (
            <div key={i} style={{ ...lineStyle, background }}>
              <span style={gutterStyle}>{line.newLine ?? line.oldLine ?? ''}</span>
              {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}
              {line.text}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '2px 6px 4px' }}>
        {parsed.truncated && (
          <span style={{ ...noteStyle, padding: 0, color: 'var(--pixel-chat-amber)' }}>
            First {DIFF_MAX_LINES} lines.
          </span>
        )}
        {/* A deleted file has nothing to open, and the host would answer with
            a "not found" notice that reads as a bug rather than as the truth. */}
        {!deleted && (
          <button
            onClick={onOpenFile}
            style={{
              marginLeft: 'auto',
              borderRadius: 0,
              fontSize: '14px',
              fontFamily: 'inherit',
              cursor: 'pointer',
              padding: '2px 8px',
              border: '2px solid var(--pixel-border)',
              background: 'var(--pixel-btn-bg)',
              color: 'var(--pixel-text)',
            }}
          >
            Open file
          </button>
        )}
      </div>
    </div>
  );
}
