import type { RateLimitInfo } from './rateLimit.js';
import { rateLimitText } from './rateLimit.js';

/**
 * The account's usage window, shown only when it is about to matter.
 *
 * Same rule as the office's bubbles: on screen means something for you. A
 * healthy account gets nothing — `rateLimitText` returns null and this
 * renders nothing at all — and the strip appears when the CLI warns, when
 * utilization crosses the threshold, or when requests are being refused.
 *
 * It is account-wide, so it sits above the campus rather than on any one
 * office: no single agent owns this news, and every one of them is about to
 * be affected by it.
 */
export function RateLimitBanner({ info }: { info: RateLimitInfo }) {
  const text = rateLimitText(info);
  if (!text) return null;
  const refused = info.status === 'rejected';
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        top: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--pixel-controls-z)',
        padding: '3px 10px',
        background: 'var(--pixel-bg)',
        border: `2px solid ${refused ? 'var(--pixel-chat-red)' : 'var(--pixel-chat-amber)'}`,
        borderRadius: 0,
        boxShadow: 'var(--pixel-shadow)',
        fontSize: '16px',
        whiteSpace: 'nowrap',
        color: refused ? 'var(--pixel-chat-red)' : 'var(--pixel-chat-amber)',
      }}
      title={
        refused
          ? 'Scheduled runs wait until this clears; agents you start yourself will be refused.'
          : 'How much of this account’s usage window is spent.'
      }
    >
      {text}
    </div>
  );
}
