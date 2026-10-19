import { useEffect, useRef, useState } from 'react';

import { TAB_BRANCH_MAX_CH, TAB_NAME_MAX_CHARS, TAB_RENAME_INPUT_CH } from '../constants.js';

/** Live activity of the agent behind a tab (drives the tab status indicator). */
export type TabAgentStatus = 'working' | 'permission' | 'ask' | 'done';

interface PanelTabBase {
  key: string;
  /** Display name — starts as "Agent N"/role, auto-named from the first prompt. */
  label: string;
  /** Workspace this tab's agent works in — tabs are grouped by it. */
  workspacePath?: string;
  folderName?: string;
  status?: TabAgentStatus;
  /** The agent finished while this tab was unfocused. */
  unseen?: boolean;
  /** Branch of the agent's private worktree, when it has one. */
  branch?: string;
}

/** A tab in the bottom panel: an xterm terminal or an SDK-driven chat view. */
export type PanelTab =
  | (PanelTabBase & { kind: 'terminal'; ptyId: string; agentId?: number; exited: boolean })
  | (PanelTabBase & { kind: 'chat'; agentId: number });

interface TerminalTabsProps {
  tabs: PanelTab[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  onClose: (tab: PanelTab) => void;
  /** Rename the tab's agent (double-click the label). */
  onRename: (tab: PanelTab, label: string) => void;
}

const tabStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '20px',
  background: 'var(--pixel-bg)',
  color: 'var(--pixel-text-dim)',
  border: '2px solid var(--pixel-border)',
  borderBottom: 'none',
  borderRadius: 0,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
};

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: '#2a2a3e',
  color: 'var(--pixel-text)',
  borderBottomColor: 'transparent',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--pixel-text-dim)',
  cursor: 'pointer',
  fontSize: '18px',
  padding: '0 2px',
  lineHeight: 1,
  borderRadius: 0,
};

const renameInputStyle: React.CSSProperties = {
  font: 'inherit',
  fontSize: '20px',
  width: `${TAB_RENAME_INPUT_CH}ch`,
  background: 'var(--pixel-bg)',
  color: 'var(--pixel-text)',
  border: '2px solid var(--pixel-accent)',
  borderRadius: 0,
  outline: 'none',
  padding: '0 2px',
};

/** Worktree branch chip: present means "this agent is NOT editing the repo". */
const branchChipStyle: React.CSSProperties = {
  fontSize: '15px',
  color: 'var(--pixel-text-dim)',
  border: '2px solid var(--pixel-border)',
  padding: '0 3px',
  maxWidth: `${TAB_BRANCH_MAX_CH}ch`,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const chatMarkerStyle: React.CSSProperties = {
  color: 'var(--pixel-chat-green)',
  fontSize: '16px',
  lineHeight: 1,
};

const groupHeaderStyle: React.CSSProperties = {
  padding: '3px 8px 1px',
  fontSize: '14px',
  color: 'var(--pixel-text-dim)',
  textTransform: 'uppercase',
  letterSpacing: 1,
  whiteSpace: 'nowrap',
  opacity: 0.65,
  userSelect: 'none',
};

const doneCheckStyle: React.CSSProperties = {
  color: 'var(--pixel-chat-green)',
  fontSize: '16px',
  lineHeight: 1,
};

const askMarkStyle: React.CSSProperties = {
  color: 'var(--pixel-chat-amber)',
  fontSize: '18px',
  fontWeight: 700,
  lineHeight: 1,
  flexShrink: 0,
  // Hard on/off blink (steps) to match the pixel aesthetic
  animation: 'pixel-tab-blink 0.8s steps(1) infinite',
};

function StatusIndicator({ status }: { status?: TabAgentStatus }) {
  if (!status) return null;
  if (status === 'done') {
    return (
      <span style={doneCheckStyle} title="Finished — waiting for you">
        ✓
      </span>
    );
  }
  if (status === 'ask') {
    return (
      <span style={askMarkStyle} title="Claude asks — needs your answer">
        ?
      </span>
    );
  }
  const working = status === 'working';
  return (
    <span
      title={working ? 'Working…' : 'Waiting for permission'}
      style={{
        width: 8,
        height: 8,
        flexShrink: 0,
        display: 'inline-block',
        background: working ? 'var(--pixel-chat-green)' : 'var(--pixel-chat-amber)',
        // Hard on/off blink (steps) to match the pixel aesthetic
        animation: `pixel-tab-blink ${working ? '1s' : '0.5s'} steps(1) infinite`,
      }}
    />
  );
}

/** A tab can be renamed when it has an agent behind it (all chats, most PTYs). */
function canRename(tab: PanelTab): boolean {
  return tab.kind === 'chat' || tab.agentId !== undefined;
}

/**
 * Inline rename field: autofocused and preselected, commits on Enter or blur,
 * abandons on Escape. Owns its draft so typing never re-renders the tab strip.
 */
function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (label: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  // Committed on blur, so Escape must disarm it before the field loses focus
  const cancelledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      autoFocus
      value={value}
      maxLength={TAB_NAME_MAX_CHARS}
      style={renameInputStyle}
      onChange={(e) => setValue(e.target.value)}
      // The tab strip's click/double-click handlers must not see these
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={() => {
        if (!cancelledRef.current) onCommit(value);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          onCommit(value);
        } else if (e.key === 'Escape') {
          cancelledRef.current = true;
          onCancel();
        }
      }}
    />
  );
}

interface TabGroup {
  workspacePath: string | null;
  folderName?: string;
  tabs: PanelTab[];
}

/** Groups tabs by workspace, preserving first-seen order (ungrouped tabs lead). */
function groupTabs(tabs: PanelTab[]): TabGroup[] {
  const groups: TabGroup[] = [];
  for (const tab of tabs) {
    const wp = tab.workspacePath ?? null;
    const existing = groups.find((g) => g.workspacePath === wp);
    if (existing) {
      existing.tabs.push(tab);
      existing.folderName ??= tab.folderName;
    } else {
      groups.push({ workspacePath: wp, folderName: tab.folderName, tabs: [tab] });
    }
  }
  return groups;
}

export function TerminalTabs({ tabs, activeKey, onSelect, onClose, onRename }: TerminalTabsProps) {
  const groups = groupTabs(tabs);
  // Key of the tab whose label is being edited, or null when none is
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // A lone group needs no header — the grouping only earns its space with 2+
  const showHeaders = groups.length > 1;

  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        overflowX: 'auto',
        background: 'var(--pixel-bg)',
        borderBottom: '2px solid var(--pixel-border)',
        minHeight: 30,
        alignItems: 'flex-end',
      }}
    >
      {groups.map((group, gi) => (
        <div
          key={group.workspacePath ?? '(none)'}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            ...(showHeaders && gi > 0
              ? { borderLeft: '2px solid var(--pixel-border)', marginLeft: 8, paddingLeft: 8 }
              : {}),
          }}
        >
          {showHeaders && group.folderName && (
            <span style={groupHeaderStyle}>{group.folderName}</span>
          )}
          <div style={{ display: 'flex', gap: 0, alignItems: 'flex-end' }}>
            {group.tabs.map((tab) => (
              <div
                key={tab.key}
                style={tab.key === activeKey ? activeTabStyle : tabStyle}
                onClick={() => onSelect(tab.key)}
              >
                {tab.kind === 'chat' && (
                  <span style={chatMarkerStyle} title="Chat agent">
                    ❯
                  </span>
                )}
                <StatusIndicator status={tab.status} />
                {editingKey === tab.key ? (
                  <RenameInput
                    initial={tab.label}
                    onCommit={(label) => {
                      setEditingKey(null);
                      const next = label.trim();
                      if (next && next !== tab.label) onRename(tab, next);
                    }}
                    onCancel={() => setEditingKey(null)}
                  />
                ) : (
                  <span
                    style={{
                      opacity: tab.kind === 'terminal' && tab.exited ? 0.5 : 1,
                      ...(tab.unseen ? { color: 'var(--pixel-chat-green)' } : {}),
                    }}
                    title={canRename(tab) ? 'Double-click to rename' : undefined}
                    onDoubleClick={(e) => {
                      if (!canRename(tab)) return;
                      e.stopPropagation();
                      setEditingKey(tab.key);
                    }}
                  >
                    {tab.label}
                  </span>
                )}
                {tab.branch && (
                  <span style={branchChipStyle} title={`Working in a worktree on ${tab.branch}`}>
                    ⎇ {tab.branch}
                  </span>
                )}
                <button
                  style={closeButtonStyle}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab);
                  }}
                  title={tab.kind === 'chat' ? 'Close chat agent' : 'Close terminal'}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
