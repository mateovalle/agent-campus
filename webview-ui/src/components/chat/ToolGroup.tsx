import { useState } from 'react';

import {
  CHAT_BODY_FONT_SIZE_PX,
  CHAT_CODE_FONT_SIZE_PX,
  CHAT_TOOL_CARD_BORDER_PX,
  CHAT_TOOL_ICON_ACCENT,
  CHAT_TOOL_ICON_SCALE,
} from '../../constants.js';
import { PixelIcon } from '../PixelIcon.js';
import { summarizeToolInput } from './chatModel.js';
import { ToolCard } from './ToolCard.js';
import { ICON_TOOL_SEARCH } from './toolIcons.js';
import type { ToolChatItem } from './toolMeta.js';
import { categoryColor, categoryIconColor } from './toolMeta.js';

/**
 * Collapsed strip for a run of consecutive finished read-category tool
 * calls (Read/Grep/Glob) — one line instead of N cards. Expanding shows
 * the individual ToolCards.
 */
export function ToolGroup({ items }: { items: ToolChatItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const color = categoryColor('read');
  const errors = items.filter((it) => it.status === 'error').length;

  const preview = items
    .map((it) => summarizeToolInput(it.name, it.input))
    .filter((s) => s !== '')
    .join(' · ');

  if (expanded) {
    return (
      <div>
        <div
          className="pixel-chat-body"
          style={{
            fontSize: CHAT_CODE_FONT_SIZE_PX,
            color: 'var(--pixel-text-dim)',
            cursor: 'pointer',
            userSelect: 'none',
            padding: '2px 0',
          }}
          onClick={() => setExpanded(false)}
        >
          ▲ collapse {items.length} lookups
        </div>
        {items.map((item) => (
          <ToolCard
            key={item.key}
            name={item.name}
            input={item.input}
            status={item.status}
            resultSummary={item.resultSummary}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="pixel-chat-body"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        border: '2px solid var(--pixel-border)',
        borderLeft: `${CHAT_TOOL_CARD_BORDER_PX}px solid ${color}`,
        background: 'var(--pixel-chat-card-bg)',
        borderRadius: 0,
        margin: '4px 0',
        padding: '3px 8px',
        cursor: 'pointer',
        userSelect: 'none',
        minWidth: 0,
      }}
      onClick={() => setExpanded(true)}
    >
      <span style={{ flexShrink: 0, display: 'flex' }}>
        <PixelIcon
          grid={ICON_TOOL_SEARCH}
          fg={categoryIconColor('read')}
          accent={CHAT_TOOL_ICON_ACCENT}
          scale={CHAT_TOOL_ICON_SCALE}
        />
      </span>
      <span
        className="pixel-chat-mono"
        style={{ fontSize: CHAT_CODE_FONT_SIZE_PX, fontWeight: 700, flexShrink: 0 }}
      >
        {items.length} lookups
      </span>
      <span
        style={{
          fontSize: CHAT_BODY_FONT_SIZE_PX,
          color: 'var(--pixel-text-dim)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flex: 1,
          minWidth: 0,
        }}
      >
        {preview}
      </span>
      {errors > 0 && (
        <span
          style={{
            color: 'var(--pixel-chat-red)',
            fontSize: CHAT_CODE_FONT_SIZE_PX,
            flexShrink: 0,
          }}
        >
          {errors} ✗
        </span>
      )}
      <span style={{ color: 'var(--pixel-text-dim)', fontSize: 10, flexShrink: 0 }}>▼</span>
    </div>
  );
}
