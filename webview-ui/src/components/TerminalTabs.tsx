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

export function TerminalTabs({ tabs, activeKey, onSelect, onClose }: TerminalTabsProps) {
  const groups = groupTabs(tabs);
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
                <span
                  style={{
                    opacity: tab.kind === 'terminal' && tab.exited ? 0.5 : 1,
                    ...(tab.unseen ? { color: 'var(--pixel-chat-green)' } : {}),
                  }}
                >
                  {tab.label}
                </span>
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
