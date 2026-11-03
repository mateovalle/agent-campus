import { useEffect, useState } from 'react';

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
  /** What the agent said about itself (campus status) — outranks `activity`. */
  spokenStatus?: string | null;
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
      ? // The agent's own words first — it knows what it is doing better
        // than the name of the tool it happens to be running.
        (agent.spokenStatus ?? agent.activity ?? 'Working')
      : agent.state === 'waiting'
        ? (agent.spokenStatus ?? 'Turn finished')
        : (agent.spokenStatus ?? 'Idle');
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

/**
 * One task on the board. Editable, because the Assistant tells users they can
 * edit, delete and reorder here and the card could do none of those — a
 * promise the UI didn't keep.
 *
 * Double-click to rename, which is already how a tab is renamed, so it costs
 * no new idiom. Deleting is two-step, like removing an office or a worktree:
 * the task is the user's own note and nothing else in the app would bring it
 * back.
 */
function TodoCard({
  workspace,
  todo,
  canMoveUp = false,
  canMoveDown = false,
}: {
  workspace: WorkspaceInfo;
  todo: TodoItem;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const done = todo.status === 'done';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.text);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const commit = () => {
    setEditing(false);
    const text = draft.trim();
    if (text && text !== todo.text) {
      vscode.postMessage({ type: 'editTodo', path: workspace.path, id: todo.id, text });
    } else {
      setDraft(todo.text);
    }
  };

  const move = (direction: 'up' | 'down') =>
    vscode.postMessage({ type: 'moveTodo', path: workspace.path, id: todo.id, direction });

  return (
    <div style={cardStyle}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') {
              setDraft(todo.text);
              setEditing(false);
            }
            // The board closes on Escape and arrows could reach the office:
            // while this field has focus, its keys are its own.
            e.stopPropagation();
          }}
          style={{
            ...cardTitleStyle,
            width: '100%',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            background: 'var(--pixel-bg)',
            border: '2px solid var(--pixel-accent)',
            borderRadius: 0,
            padding: '2px 4px',
          }}
        />
      ) : (
        <div
          onDoubleClick={() => {
            if (!done) {
              setDraft(todo.text);
              setEditing(true);
            }
          }}
          title={done ? undefined : 'Double-click to edit'}
          style={{
            ...cardTitleStyle,
            textDecoration: done ? 'line-through' : 'none',
            opacity: done ? 'var(--pixel-btn-disabled-opacity)' : 1,
          }}
        >
          {todo.text}
        </div>
      )}
      {/*
        The office on its own line, the buttons on theirs. They shared a row
        until this card grew from one button to four, at which point the
        office name — the only thing saying WHERE a task lives, on a board
        that mixes workspaces — was the flexible item and got squeezed to
        nothing in a column this narrow.
      */}
      <div style={cardMetaStyle}>{workspace.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {!done && (
          <>
            {(canMoveUp || canMoveDown) && (
              <>
                <button
                  onClick={() => move('up')}
                  disabled={!canMoveUp}
                  title="Higher up the backlog"
                  style={{
                    ...smallBtnStyle,
                    padding: '3px 4px',
                    opacity: canMoveUp ? 1 : 'var(--pixel-btn-disabled-opacity)',
                    cursor: canMoveUp ? 'pointer' : 'default',
                  }}
                >
                  ▲
                </button>
                <button
                  onClick={() => move('down')}
                  disabled={!canMoveDown}
                  title="Further down the backlog"
                  style={{
                    ...smallBtnStyle,
                    padding: '3px 4px',
                    opacity: canMoveDown ? 1 : 'var(--pixel-btn-disabled-opacity)',
                    cursor: canMoveDown ? 'pointer' : 'default',
                  }}
                >
                  ▼
                </button>
              </>
            )}
            <button
              onClick={() =>
                vscode.postMessage({ type: 'assignTodo', path: workspace.path, id: todo.id })
              }
              title="Start an agent on this task"
              style={{
                ...smallBtnStyle,
                color: 'var(--pixel-green)',
                whiteSpace: 'nowrap',
              }}
            >
              ▶ Assign
            </button>
          </>
        )}
        <button
          onClick={() => {
            if (confirmingDelete) {
              vscode.postMessage({ type: 'deleteTodo', path: workspace.path, id: todo.id });
            } else {
              setConfirmingDelete(true);
            }
          }}
          onBlur={() => setConfirmingDelete(false)}
          title={confirmingDelete ? 'Click again to delete' : 'Delete this task'}
          // Last and apart: one button starts work, the other destroys the card.
          // Armed state borrows the worktree manager's look, which is the
          // app's existing word for "this one really destroys something".
          style={{
            ...smallBtnStyle,
            marginLeft: 'auto',
            whiteSpace: 'nowrap',
            ...(confirmingDelete ? { background: 'var(--pixel-danger-bg)', color: '#fff' } : {}),
          }}
        >
          {confirmingDelete ? '✕ Sure?' : '✕'}
        </button>
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
            backlog.map(({ workspace, todo }, i) => (
              <TodoCard
                key={todo.id}
                workspace={workspace}
                todo={todo}
                // Only within its own workspace: the column groups by office,
                // so an arrow across a boundary would appear to do nothing.
                canMoveUp={backlog[i - 1]?.workspace.path === workspace.path}
                canMoveDown={backlog[i + 1]?.workspace.path === workspace.path}
              />
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
