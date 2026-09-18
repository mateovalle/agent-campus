import { useCallback, useEffect, useRef, useState } from 'react';

import type { HostToWebviewMessage } from '../../../shared/protocol.js';
import { getElectronAPI, vscode } from '../vscodeApi.js';
import { ChatView } from './chat/ChatView.js';
import { TerminalInstance } from './TerminalInstance.js';
import type { PanelTab, TabAgentStatus } from './TerminalTabs.js';
import { TerminalTabs } from './TerminalTabs.js';

interface TerminalPanelProps {
  height: number;
  onTerminalCreated: () => void;
  onShowTerminal: () => void;
  onAllTabsClosed: () => void;
}

const ptyKey = (ptyId: string) => `pty:${ptyId}`;
const chatKey = (agentId: number) => `chat:${agentId}`;

export function TerminalPanel({
  height,
  onTerminalCreated,
  onShowTerminal,
  onAllTabsClosed,
}: TerminalPanelProps) {
  const [tabs, setTabs] = useState<PanelTab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Read inside the message handler without re-subscribing on every tab switch
  const activeKeyRef = useRef<string | null>(null);
  useEffect(() => {
    activeKeyRef.current = activeKey;
  }, [activeKey]);

  // Notify closure outside the setState updater (updaters must stay pure)
  useEffect(() => {
    if (tabs.length === 0) {
      onAllTabsClosed();
    }
  }, [tabs.length, onAllTabsClosed]);

  const removeTab = useCallback((key: string) => {
    setTabs((prev) => prev.filter((t) => t.key !== key));
    setActiveKey((prevActive) => (prevActive === key ? null : prevActive));
  }, []);

  /** Selecting a tab acknowledges its "finished while unfocused" highlight. */
  const selectTab = useCallback((key: string) => {
    setActiveKey(key);
    setTabs((prev) => prev.map((t) => (t.key === key && t.unseen ? { ...t, unseen: false } : t)));
  }, []);

  /** Applies a status/label patch to whichever tab belongs to the given agent. */
  const patchAgentTab = useCallback(
    (
      agentId: number,
      patch: { label?: string; status?: TabAgentStatus | null; unseen?: boolean },
    ) => {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.agentId !== agentId) return t;
          return {
            ...t,
            ...(patch.label !== undefined ? { label: patch.label } : {}),
            ...(patch.status !== undefined ? { status: patch.status ?? undefined } : {}),
            ...(patch.unseen !== undefined ? { unseen: patch.unseen } : {}),
          };
        }),
      );
    },
    [],
  );

  // Pending chat permission requests per agent (requestId → kind). Drives the
  // tab indicator: an open AskUserQuestion shows the blinking "?", any other
  // pending permission shows the amber block — and protects both from being
  // overwritten by trailing 'working' patches (transcript watcher lag).
  const chatPermsRef = useRef(new Map<number, Map<string, 'ask' | 'permission'>>());

  /** Status implied by this agent's pending permissions, or null if none. */
  const pendingPermStatus = useCallback((agentId: number): TabAgentStatus | null => {
    const perms = chatPermsRef.current.get(agentId);
    if (!perms || perms.size === 0) return null;
    for (const kind of perms.values()) {
      if (kind === 'ask') return 'ask';
    }
    return 'permission';
  }, []);

  /** Turn finished: show the ✓ and highlight the tab if it isn't focused. */
  const markAgentDone = useCallback((agentId: number) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.agentId === agentId
          ? { ...t, status: 'done' as const, unseen: t.key !== activeKeyRef.current }
          : t,
      ),
    );
  }, []);

  const handleClose = useCallback(
    (tab: PanelTab) => {
      if (tab.kind === 'terminal') {
        getElectronAPI()?.ptyKill?.(tab.ptyId);
        removeTab(tab.key);
      } else {
        // The host kills the session and sends chat-close-tab + agentClosed
        vscode.postMessage({ type: 'closeAgent', id: tab.agentId });
      }
    },
    [removeTab],
  );

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as HostToWebviewMessage;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'pty-created') {
        // The PTY is spawned by the main process; the renderer only shows it.
        const { ptyId, label, agentId, workspacePath, folderName } = msg;
        const key = ptyKey(ptyId);
        setTabs((prev) => {
          if (prev.some((t) => t.key === key)) return prev;
          return [
            ...prev,
            {
              kind: 'terminal',
              key,
              ptyId,
              label,
              exited: false,
              agentId,
              workspacePath,
              folderName,
            },
          ];
        });
        setActiveKey(key);
        onTerminalCreated();
      } else if (msg.type === 'pty-focus') {
        const { ptyId } = msg;
        if (ptyId) {
          selectTab(ptyKey(ptyId));
        }
        onShowTerminal();
      } else if (msg.type === 'pty-close-tab') {
        removeTab(ptyKey(msg.ptyId));
      } else if (msg.type === 'pty-exit') {
        const { ptyId } = msg;
        setTabs((prev) =>
          prev.map((t) =>
            t.kind === 'terminal' && t.ptyId === ptyId ? { ...t, exited: true } : t,
          ),
        );
      } else if (msg.type === 'chat-created') {
        const { agentId, label, workspacePath, folderName } = msg;
        const key = chatKey(agentId);
        setTabs((prev) => {
          if (prev.some((t) => t.key === key)) return prev;
          return [...prev, { kind: 'chat', key, agentId, label, workspacePath, folderName }];
        });
        setActiveKey(key);
        onTerminalCreated();
      } else if (msg.type === 'chat-focus') {
        selectTab(chatKey(msg.agentId));
        onShowTerminal();
      } else if (msg.type === 'chat-close-tab') {
        removeTab(chatKey(msg.agentId));
      } else if (msg.type === 'agentLabel') {
        // Auto-name derived from the agent's first prompt
        patchAgentTab(msg.id, { label: msg.label });
      } else if (msg.type === 'agentToolStart') {
        patchAgentTab(msg.id, { status: pendingPermStatus(msg.id) ?? 'working', unseen: false });
      } else if (msg.type === 'agentStatus') {
        if (msg.status === 'active') {
          patchAgentTab(msg.id, { status: pendingPermStatus(msg.id) ?? 'working', unseen: false });
        } else if (msg.status === 'waiting') {
          markAgentDone(msg.id);
        }
      } else if (msg.type === 'agentToolPermission') {
        patchAgentTab(msg.id, { status: pendingPermStatus(msg.id) ?? 'permission' });
      } else if (msg.type === 'agentToolPermissionClear') {
        patchAgentTab(msg.id, { status: pendingPermStatus(msg.id) ?? 'working' });
      } else if (msg.type === 'chat-permission-request') {
        // Immediate tab flag — the blinking "?" for questions beats the
        // transcript watcher's 5s permission timer.
        let perms = chatPermsRef.current.get(msg.agentId);
        if (!perms) {
          perms = new Map();
          chatPermsRef.current.set(msg.agentId, perms);
        }
        perms.set(msg.requestId, msg.toolName === 'AskUserQuestion' ? 'ask' : 'permission');
        patchAgentTab(msg.agentId, { status: pendingPermStatus(msg.agentId) ?? 'working' });
      } else if (msg.type === 'chat-permission-resolved') {
        const perms = chatPermsRef.current.get(msg.agentId);
        if (perms?.delete(msg.requestId)) {
          patchAgentTab(msg.agentId, { status: pendingPermStatus(msg.agentId) ?? 'working' });
        }
      } else if (msg.type === 'chat-busy') {
        // Covers chat text-only turns, where no tool events ever fire
        if (msg.busy) {
          patchAgentTab(msg.agentId, {
            status: pendingPermStatus(msg.agentId) ?? 'working',
            unseen: false,
          });
        } else {
          markAgentDone(msg.agentId);
        }
      } else if (msg.type === 'agentClosed') {
        chatPermsRef.current.delete(msg.id);
        patchAgentTab(msg.id, { status: null, unseen: false });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [
    onTerminalCreated,
    onShowTerminal,
    removeTab,
    selectTab,
    patchAgentTab,
    markAgentDone,
    pendingPermStatus,
  ]);

  const shouldShow = tabs.length > 0 && height > 0;

  // Always render (to keep message listener alive), but hide when nothing to show.
  // All tabs stay mounted (display:none) so chat scroll state and terminal
  // scrollback survive tab switches.
  return (
    <div
      style={{
        height: shouldShow ? height : 0,
        display: shouldShow ? 'flex' : 'none',
        flexDirection: 'column',
        background: '#1e1e2e',
        flexShrink: 0,
      }}
    >
      <TerminalTabs tabs={tabs} activeKey={activeKey} onSelect={selectTab} onClose={handleClose} />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {tabs.map((tab) =>
          tab.kind === 'terminal' ? (
            <TerminalInstance key={tab.key} ptyId={tab.ptyId} visible={tab.key === activeKey} />
          ) : (
            <ChatView key={tab.key} agentId={tab.agentId} visible={tab.key === activeKey} />
          ),
        )}
      </div>
    </div>
  );
}
