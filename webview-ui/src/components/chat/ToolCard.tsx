import { useState } from 'react';

import type { AgentTodo } from '../../../../shared/protocol.js';
import {
  CHAT_BODY_FONT_SIZE_PX,
  CHAT_CODE_FONT_SIZE_PX,
  CHAT_DOT_STAGGER_SEC,
  CHAT_EDIT_STAT_CAP,
  CHAT_JSON_PREVIEW_MAX_CHARS,
  CHAT_RESULT_MAX_HEIGHT_PX,
  CHAT_TOOL_CARD_BORDER_PX,
  CHAT_TOOL_ICON_ACCENT,
  CHAT_TOOL_ICON_SCALE,
  CHAT_WRITE_PREVIEW_MAX_CHARS,
} from '../../constants.js';
import { PixelIcon } from '../PixelIcon.js';
import type { ToolCallStatus } from './chatModel.js';
import { summarizeToolInput, truncateChars } from './chatModel.js';
import { Markdown } from './Markdown.js';
import type { ToolMeta } from './toolMeta.js';
import {
  categoryColor,
  categoryIconColor,
  editDiffStats,
  parseTodoInput,
  planText,
  resolveToolMeta,
} from './toolMeta.js';

interface ToolCardProps {
  name: string;
  input: Record<string, unknown>;
  status: ToolCallStatus;
  resultSummary: string | null;
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '3px 8px',
  cursor: 'pointer',
  userSelect: 'none',
  minWidth: 0,
};

const nameStyle: React.CSSProperties = {
  fontSize: CHAT_CODE_FONT_SIZE_PX,
  fontWeight: 700,
  color: 'var(--pixel-text)',
  flexShrink: 0,
};

const badgeStyle = (color: string): React.CSSProperties => ({
  fontSize: CHAT_CODE_FONT_SIZE_PX - 2,
  fontWeight: 700,
  color,
  border: `1px solid ${color}`,
  padding: '0 4px',
  flexShrink: 0,
  textTransform: 'lowercase',
});

const summaryStyle: React.CSSProperties = {
  fontSize: CHAT_BODY_FONT_SIZE_PX,
  color: 'var(--pixel-text-dim)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flex: 1,
  minWidth: 0,
};

const statChipStyle: React.CSSProperties = {
  fontSize: CHAT_CODE_FONT_SIZE_PX,
  fontWeight: 700,
  flexShrink: 0,
};

const glyphStyle: React.CSSProperties = {
  fontSize: CHAT_BODY_FONT_SIZE_PX,
  flexShrink: 0,
  width: 14,
  textAlign: 'center',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--pixel-text-dim)',
  padding: '3px 8px 0',
  textTransform: 'uppercase',
  letterSpacing: 1,
};

const preStyle: React.CSSProperties = {
  margin: '3px 8px 8px',
  padding: '6px 8px',
  fontSize: CHAT_CODE_FONT_SIZE_PX,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: CHAT_RESULT_MAX_HEIGHT_PX,
  overflowY: 'auto',
  background: 'var(--pixel-chat-code-bg)',
  border: '1px solid var(--pixel-border)',
  color: 'var(--pixel-text)',
};

// ── Bash: terminal-styled blocks ─────────────────────────────

const terminalPreStyle: React.CSSProperties = {
  ...preStyle,
  background: 'var(--pixel-chat-terminal-bg)',
  color: 'var(--pixel-chat-green)',
};

const terminalOutputStyle: React.CSSProperties = {
  ...preStyle,
  background: 'var(--pixel-chat-terminal-bg)',
  color: 'var(--pixel-text-dim)',
};

const terminalErrorStyle: React.CSSProperties = {
  ...terminalOutputStyle,
  color: 'var(--pixel-chat-red)',
  border: '1px solid var(--pixel-chat-red)',
};

// ── Edit: diff blocks ────────────────────────────────────────

const diffContainerStyle: React.CSSProperties = {
  margin: '3px 8px 8px',
  border: '1px solid var(--pixel-border)',
  background: 'var(--pixel-chat-code-bg)',
  maxHeight: CHAT_RESULT_MAX_HEIGHT_PX,
  overflowY: 'auto',
};

const diffLineStyle: React.CSSProperties = {
  fontSize: CHAT_CODE_FONT_SIZE_PX,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  padding: '0 6px',
};

const diffOldStyle: React.CSSProperties = {
  ...diffLineStyle,
  background: 'var(--pixel-chat-diff-old-bg)',
  color: 'var(--pixel-chat-red)',
};

const diffNewStyle: React.CSSProperties = {
  ...diffLineStyle,
  background: 'var(--pixel-chat-diff-new-bg)',
  color: 'var(--pixel-chat-green)',
};

// ── TodoWrite: checklist ─────────────────────────────────────

const todoListStyle: React.CSSProperties = {
  margin: '3px 8px 8px',
  padding: '4px 8px',
  border: '1px solid var(--pixel-border)',
  background: 'var(--pixel-chat-code-bg)',
  maxHeight: CHAT_RESULT_MAX_HEIGHT_PX,
  overflowY: 'auto',
};

const todoLineStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  fontSize: CHAT_BODY_FONT_SIZE_PX - 1,
  lineHeight: 1.6,
  wordBreak: 'break-word',
};

const planBodyStyle: React.CSSProperties = {
  margin: '3px 8px 8px',
  padding: '2px 10px',
  border: '1px solid var(--pixel-border)',
  background: 'var(--pixel-chat-code-bg)',
  maxHeight: CHAT_RESULT_MAX_HEIGHT_PX,
  overflowY: 'auto',
  fontSize: CHAT_BODY_FONT_SIZE_PX - 1,
};

function RunningDots() {
  return (
    <span style={{ color: 'var(--pixel-chat-amber)', letterSpacing: 1 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="pixel-chat-dot"
          style={{ animationDelay: `${i * CHAT_DOT_STAGGER_SEC}s` }}
        >
          .
        </span>
      ))}
    </span>
  );
}

function StatusGlyph({ status }: { status: ToolCallStatus }) {
  if (status === 'running') {
    return (
      <span style={glyphStyle}>
        <RunningDots />
      </span>
    );
  }
  if (status === 'error') {
    return <span style={{ ...glyphStyle, color: 'var(--pixel-chat-red)' }}>✗</span>;
  }
  return <span style={{ ...glyphStyle, color: 'var(--pixel-chat-green)' }}>✓</span>;
}

/** Simple full-block diff: all old lines as '-', all new lines as '+'. */
function DiffBlock({ oldText, newText }: { oldText: string; newText: string }) {
  return (
    <div style={diffContainerStyle}>
      {oldText.split('\n').map((line, i) => (
        <div key={`o${i}`} style={diffOldStyle}>
          - {line}
        </div>
      ))}
      {newText.split('\n').map((line, i) => (
        <div key={`n${i}`} style={diffNewStyle}>
          + {line}
        </div>
      ))}
    </div>
  );
}

function TodoChecklist({ todos }: { todos: AgentTodo[] }) {
  return (
    <div style={todoListStyle}>
      {todos.map((todo, i) => {
        const glyph = todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '▶' : '☐';
        const color =
          todo.status === 'completed'
            ? 'var(--pixel-chat-green)'
            : todo.status === 'in_progress'
              ? 'var(--pixel-chat-amber)'
              : 'var(--pixel-text-dim)';
        return (
          <div key={i} style={{ ...todoLineStyle, color }}>
            <span style={{ flexShrink: 0 }}>{glyph}</span>
            <span
              style={
                todo.status === 'completed'
                  ? { textDecoration: 'line-through', opacity: 0.7 }
                  : undefined
              }
            >
              {todo.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function stringField(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === 'string' ? value : null;
}

function prettyJson(input: Record<string, unknown>): string {
  try {
    return truncateChars(JSON.stringify(input, null, 2) ?? '', CHAT_JSON_PREVIEW_MAX_CHARS);
  } catch {
    return String(input);
  }
}

/** Cap large diff-stat counts so the chip stays compact. */
function capStat(n: number): string {
  return n > CHAT_EDIT_STAT_CAP ? `${CHAT_EDIT_STAT_CAP}+` : String(n);
}

function ExpandedBody({ name, input, status, resultSummary }: ToolCardProps) {
  const isBash = name === 'Bash';
  const todos = name === 'TodoWrite' ? parseTodoInput(input) : null;
  const plan = name === 'ExitPlanMode' ? planText(input) : null;
  const oldString = stringField(input, 'old_string');
  const newString = stringField(input, 'new_string');

  let inputSection: React.ReactNode;
  if (todos) {
    inputSection = <TodoChecklist todos={todos} />;
  } else if (plan !== null) {
    inputSection = (
      <div style={planBodyStyle}>
        <Markdown text={plan} />
      </div>
    );
  } else if (oldString !== null && newString !== null) {
    inputSection = <DiffBlock oldText={oldString} newText={newString} />;
  } else if (name === 'Write' && stringField(input, 'content') !== null) {
    inputSection = (
      <pre className="pixel-chat-mono" style={preStyle}>
        {truncateChars(stringField(input, 'content') ?? '', CHAT_WRITE_PREVIEW_MAX_CHARS)}
      </pre>
    );
  } else if (isBash && stringField(input, 'command') !== null) {
    inputSection = (
      <pre className="pixel-chat-mono" style={terminalPreStyle}>
        $ {stringField(input, 'command')}
      </pre>
    );
  } else if (name === 'Task' && stringField(input, 'prompt') !== null) {
    inputSection = (
      <pre className="pixel-chat-mono" style={preStyle}>
        {truncateChars(stringField(input, 'prompt') ?? '', CHAT_WRITE_PREVIEW_MAX_CHARS)}
      </pre>
    );
  } else {
    inputSection = (
      <pre className="pixel-chat-mono" style={preStyle}>
        {prettyJson(input)}
      </pre>
    );
  }

  const resultStyle = isBash
    ? status === 'error'
      ? terminalErrorStyle
      : terminalOutputStyle
    : preStyle;

  return (
    <div style={{ borderTop: '1px solid var(--pixel-border)' }}>
      {inputSection}
      {resultSummary !== null && !todos && (
        <>
          <div style={sectionLabelStyle}>{isBash ? 'Output' : 'Result'}</div>
          <pre className="pixel-chat-mono" style={resultStyle}>
            {resultSummary}
          </pre>
        </>
      )}
    </div>
  );
}

/** Header chip: "+12 −4" for edits, "3/7" progress for TodoWrite. */
function StatChip({ name, input }: { name: string; input: Record<string, unknown> }) {
  const stats = name === 'Edit' || name === 'MultiEdit' ? editDiffStats(input) : null;
  if (stats) {
    return (
      <span className="pixel-chat-mono" style={statChipStyle}>
        <span style={{ color: 'var(--pixel-chat-green)' }}>+{capStat(stats.added)}</span>{' '}
        <span style={{ color: 'var(--pixel-chat-red)' }}>−{capStat(stats.removed)}</span>
      </span>
    );
  }
  if (name === 'TodoWrite') {
    const todos = parseTodoInput(input);
    if (todos) {
      const done = todos.filter((t) => t.status === 'completed').length;
      return (
        <span
          className="pixel-chat-mono"
          style={{ ...statChipStyle, color: 'var(--pixel-text-dim)' }}
        >
          {done}/{todos.length}
        </span>
      );
    }
  }
  return null;
}

/** Tools whose body is the content itself — open by default. */
function opensExpanded(name: string): boolean {
  return name === 'TodoWrite' || name === 'ExitPlanMode';
}

export function ToolCard({ name, input, status, resultSummary }: ToolCardProps) {
  const [expanded, setExpanded] = useState(() => opensExpanded(name));
  const meta: ToolMeta = resolveToolMeta(name, input);
  const color = categoryColor(meta.category);
  const summary = summarizeToolInput(name, input);

  const cardStyle: React.CSSProperties = {
    border: '2px solid var(--pixel-border)',
    borderLeft: `${CHAT_TOOL_CARD_BORDER_PX}px solid ${color}`,
    background: 'var(--pixel-chat-card-bg)',
    borderRadius: 0,
    margin: '4px 0',
  };

  return (
    <div style={cardStyle} className="pixel-chat-body">
      <div style={headerStyle} onClick={() => setExpanded((v) => !v)}>
        <span style={{ flexShrink: 0, display: 'flex' }}>
          <PixelIcon
            grid={meta.icon}
            fg={categoryIconColor(meta.category)}
            accent={CHAT_TOOL_ICON_ACCENT}
            scale={CHAT_TOOL_ICON_SCALE}
          />
        </span>
        <span className="pixel-chat-mono" style={nameStyle}>
          {meta.displayName}
        </span>
        {meta.badge && (
          <span className="pixel-chat-mono" style={badgeStyle(color)}>
            {meta.badge}
          </span>
        )}
        <span style={summaryStyle}>{summary}</span>
        <StatChip name={name} input={input} />
        <StatusGlyph status={status} />
        <span style={{ color: 'var(--pixel-text-dim)', fontSize: 10, flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>
      {expanded && (
        <ExpandedBody name={name} input={input} status={status} resultSummary={resultSummary} />
      )}
    </div>
  );
}
