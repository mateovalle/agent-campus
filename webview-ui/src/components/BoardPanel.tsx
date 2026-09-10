import { useEffect } from 'react';

import type { AgentActionSuggestion, TodoItem, WorkspaceInfo } from '../../../shared/protocol.js';
import {
  BOARD_COLUMN_MIN_WIDTH_PX,
  BOARD_DONE_MAX_ITEMS,
  BOARD_HEIGHT_PCT,
  BOARD_MAX_WIDTH_PX,
  BOARD_PLAN_KICKOFF_PROMPT,
  BOARD_WIDTH_PCT,
  TASKS_HEADER_FONT_SIZE_PX,
  TASKS_ITEM_FONT_SIZE_PX,
  TASKS_SECTION_FONT_SIZE_PX,
} from '../constants.js';
import { vscode } from '../vscodeApi.js';

/** One agent as shown on the board, precomputed by the composition root. */
export interface BoardAgent {
  id: number;
  label: string;
  workspaceName: string;
  /** 'working' = running tools; 'waiting' = turn done; 'idle' = nothing to do. */
  state: 'working' | 'waiting' | 'idle';
  needsPermission: boolean;
  /** Latest tool status line while working. */
  activity: string | null;
  /** The agent's in-progress plan item (TodoWrite), if any. */
  currentPlanItem: string | null;
  suggestions: AgentActionSuggestion[];
}

interface BoardPanelProps {
  workspaces: WorkspaceInfo[];
  /** Human todos per workspace path. */
  workspaceTodos: Record<string, TodoItem[]>;
  agents: BoardAgent[];
  onRunAction: (id: number, command: string) => void;
  onFocusAgent: (id: number) => void;
  onClose: () => void;
}

const columnHeaderStyle: React.CSSProperties = {
  fontSize: TASKS_SECTION_FONT_SIZE_PX,
  color: 'var(--pixel-text-dim)',
  padding: '6px 8px',
  borderBottom: '2px solid var(--pixel-border)',
  whiteSpace: 'nowrap',
};

const cardStyle: React.CSSProperties = {
  margin: 6,
  padding: '6px 8px',
  background: 'var(--pixel-btn-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: TASKS_ITEM_FONT_SIZE_PX,
  color: 'var(--pixel-text)',
  overflowWrap: 'anywhere',
};

const cardMetaStyle: React.CSSProperties = {
  fontSize: TASKS_SECTION_FONT_SIZE_PX,
  color: 'var(--pixel-text-dim)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const emptyStyle: React.CSSProperties = {
  fontSize: TASKS_SECTION_FONT_SIZE_PX,
  color: 'var(--pixel-text-dim)',
  opacity: 'var(--pixel-btn-disabled-opacity)',
  padding: '10px 8px',
};

const smallBtnStyle: React.CSSProperties = {
  fontSize: TASKS_SECTION_FONT_SIZE_PX,
  lineHeight: 1,
  padding: '3px 6px',
  fontFamily: 'inherit',
  background: 'var(--pixel-bg)',
  color: 'var(--pixel-text)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  cursor: 'pointer',
};

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: BOARD_COLUMN_MIN_WIDTH_PX,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '2px solid var(--pixel-border)',
        overflow: 'hidden',
      }}
    >
      <div style={columnHeaderStyle}>{title}</div>
      <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
    </div>
  );
}

function AgentCard({
  agent,
  onRunAction,
  onFocusAgent,
}: {
  agent: BoardAgent;
  onRunAction: (id: number, command: string) => void;
  onFocusAgent: (id: number) => void;
}) {
  const border = agent.needsPermission
    ? '2px solid var(--pixel-status-permission)'
    : agent.state === 'working'
      ? '2px solid var(--pixel-border)'
      : '2px solid var(--pixel-border-light)';
  const statusText = agent.needsPermission
    ? 'Needs approval'
    : agent.state === 'working'
      ? (agent.activity ?? 'Working')
      : agent.state === 'waiting'
        ? 'Turn finished'
        : 'Idle';
  return (
    <div style={{ ...cardStyle, border }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ ...cardTitleStyle, flex: 1 }}>{agent.label}</span>
        <button
          onClick={() => onFocusAgent(agent.id)}
          title="Focus this agent's tab"
          style={smallBtnStyle}
        >
          ⤴
        </button>
      </div>
      <div style={cardMetaStyle} title={statusText}>
        {agent.workspaceName} · {statusText}
      </div>
      {agent.currentPlanItem && (
        <div style={{ ...cardMetaStyle, color: 'var(--pixel-accent)', whiteSpace: 'normal' }}>
          ▸ {agent.currentPlanItem}
        </div>
      )}
      {agent.suggestions.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
          {agent.suggestions.map((s) => (
            <button
              key={s.label}
              onClick={() => onRunAction(agent.id, s.command)}
              title={s.reason ? `${s.reason} — sends: ${s.command}` : s.command}
              style={smallBtnStyle}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TodoCard({ workspace, todo }: { workspace: WorkspaceInfo; todo: TodoItem }) {
  const done = todo.status === 'done';
  return (
    <div style={cardStyle}>
      <div
        style={{
          ...cardTitleStyle,
          textDecoration: done ? 'line-through' : 'none',
          opacity: done ? 'var(--pixel-btn-disabled-opacity)' : 1,
        }}
      >
        {todo.text}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ ...cardMetaStyle, flex: 1 }}>{workspace.name}</span>
        {!done && (
          <button
            onClick={() =>
              vscode.postMessage({ type: 'assignTodo', path: workspace.path, id: todo.id })
            }
            title="Start an agent on this task"
            style={{ ...smallBtnStyle, color: 'var(--pixel-green)' }}
          >
            ▶ Assign
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Campus-wide kanban overlay: open todos, working agents, agents that need
 * the user, and recently finished tasks — the "manager's whiteboard".
 */
export function BoardPanel({
  workspaces,
  workspaceTodos,
  agents,
  onRunAction,
  onFocusAgent,
  onClose,
}: BoardPanelProps) {
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

  const byPath = new Map(workspaces.map((w) => [w.path, w]));
  const backlog: Array<{ workspace: WorkspaceInfo; todo: TodoItem }> = [];
  const done: Array<{ workspace: WorkspaceInfo; todo: TodoItem }> = [];
  for (const [path, todos] of Object.entries(workspaceTodos)) {
    const workspace = byPath.get(path);
    if (!workspace) continue;
    for (const todo of todos) {
      if (todo.status === 'open') backlog.push({ workspace, todo });
      else done.push({ workspace, todo });
    }
  }
  done.sort((a, b) => b.todo.createdAt - a.todo.createdAt);

  const working = agents.filter((a) => a.state === 'working' && !a.needsPermission);
  const needsYou = agents.filter((a) => a.needsPermission || a.state !== 'working');

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: `min(${BOARD_WIDTH_PCT}%, ${BOARD_MAX_WIDTH_PX}px)`,
        height: `${BOARD_HEIGHT_PCT}%`,
        zIndex: 'var(--pixel-modal-z)',
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        boxShadow: 'var(--pixel-shadow)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderBottom: '2px solid var(--pixel-border)',
        }}
      >
        <span style={{ flex: 1, fontSize: TASKS_HEADER_FONT_SIZE_PX, color: 'var(--pixel-text)' }}>
          Board
        </span>
        <button
          onClick={() =>
            vscode.postMessage({ type: 'openAssistant', prompt: BOARD_PLAN_KICKOFF_PROMPT })
          }
          title="Plan with the assistant: it challenges scope, then writes specified tasks to this board for your review"
          style={{
            ...smallBtnStyle,
            background: 'var(--pixel-agent-bg)',
            border: '2px solid var(--pixel-agent-border)',
            color: 'var(--pixel-agent-text)',
            padding: '4px 10px',
          }}
        >
          ✦ Plan
        </button>
        <button
          onClick={onClose}
          title="Close (Esc)"
          style={{
            ...smallBtnStyle,
            fontSize: TASKS_HEADER_FONT_SIZE_PX,
            border: 'none',
            background: 'none',
            color: 'var(--pixel-text-dim)',
          }}
        >
          ✕
        </button>
      </div>

      {/* Columns */}
      <div style={{ flex: 1, display: 'flex', overflowX: 'auto' }}>
        <Column title={`Backlog · ${backlog.length}`}>
          {backlog.length === 0 ? (
            <div style={emptyStyle}>No open tasks</div>
          ) : (
            backlog.map(({ workspace, todo }) => (
              <TodoCard key={todo.id} workspace={workspace} todo={todo} />
            ))
          )}
        </Column>
        <Column title={`In Progress · ${working.length}`}>
          {working.length === 0 ? (
            <div style={emptyStyle}>No agents working</div>
          ) : (
            working.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                onRunAction={onRunAction}
                onFocusAgent={onFocusAgent}
              />
            ))
          )}
        </Column>
        <Column title={`Needs You · ${needsYou.length}`}>
          {needsYou.length === 0 ? (
            <div style={emptyStyle}>Nothing waiting on you</div>
          ) : (
            needsYou.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                onRunAction={onRunAction}
                onFocusAgent={onFocusAgent}
              />
            ))
          )}
        </Column>
        <Column title={`Done · ${done.length}`}>
          {done.length === 0 ? (
            <div style={emptyStyle}>Nothing finished yet</div>
          ) : (
            done
              .slice(0, BOARD_DONE_MAX_ITEMS)
              .map(({ workspace, todo }) => (
                <TodoCard key={todo.id} workspace={workspace} todo={todo} />
              ))
          )}
        </Column>
      </div>
    </div>
  );
}
