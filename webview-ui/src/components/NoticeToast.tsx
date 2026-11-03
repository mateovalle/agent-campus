import { useEffect } from 'react';

import {
  NOTICE_TOAST_DURATION_MS,
  NOTICE_TOAST_ERROR_COLOR,
  NOTICE_TOAST_INFO_COLOR,
  NOTICE_TOAST_MAX_WIDTH_PX,
} from '../constants.js';

export interface HostNotice {
  id: number;
  level: 'info' | 'error';
  text: string;
}

interface NoticeToastProps {
  /** Pending notices — the first is shown, the rest wait. */
  queue: HostNotice[];
  onDismiss: () => void;
}

/**
 * Toast for things the host did or refused to do (a worktree git wouldn't
 * create, a setup command that failed) — failures whose own UI is already
 * gone by the time the answer arrives.
 *
 * Bottom-center, clear of the achievement toast at the top. Errors do NOT
 * auto-dismiss: an agent you asked for and never got is worth a click.
 */
export function NoticeToast({ queue, onDismiss }: NoticeToastProps) {
  const current = queue.length > 0 ? queue[0] : null;
  const sticky = current?.level === 'error';

  useEffect(() => {
    if (!current || sticky) return;
    const timer = window.setTimeout(onDismiss, NOTICE_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [current, sticky, onDismiss]);

  if (!current) return null;

  return (
    <div
      key={current.id}
      onClick={onDismiss}
      title="Click to dismiss"
      style={{
        // Fixed, not absolute: an absolute toast is trapped in the office
        // container's stacking context and loses to any open modal.
        position: 'fixed',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--pixel-notice-z)',
        maxWidth: NOTICE_TOAST_MAX_WIDTH_PX,
        background: 'var(--pixel-bg)',
        border: `2px solid ${
          current.level === 'error' ? NOTICE_TOAST_ERROR_COLOR : NOTICE_TOAST_INFO_COLOR
        }`,
        borderRadius: 0,
        boxShadow: 'var(--pixel-shadow)',
        padding: '8px 14px',
        cursor: 'pointer',
        fontSize: '18px',
        color: 'var(--pixel-text)',
        textAlign: 'center',
      }}
    >
      {current.text}
      {queue.length > 1 && (
        <span style={{ color: 'var(--pixel-text-dim)' }}> (+{queue.length - 1})</span>
      )}
    </div>
  );
}
