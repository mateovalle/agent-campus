/**
 * attention.ts — Which agents need you, and since when.
 *
 * The office's bubbles only help while you are looking at the window; the
 * premise of the campus is that you are not. This module watches every
 * host → webview message (main.ts taps ctx.send) and keeps, per agent:
 *
 *  - blocked: waiting on a tool permission (terminal agents: agentToolPermission)
 *    or on a chat permission/AskUserQuestion request (chat agents: pending
 *    request ids), and since when;
 *  - unread: the turn finished (agentStatus 'waiting') and you have not opened
 *    the agent since.
 *
 * From that main.ts derives the Dock badge (how many agents need you) and the
 * desktop notifications (an agent blocked for a while, or a turn finished
 * while the window was in the background). Pure and clock-injected so the
 * state machine is unit-tested; no Electron imports here.
 */

import type { HostToWebviewMessage } from '../shared/protocol.js';

interface AgentAttention {
  /** Terminal agents: a permission timer fired and has not cleared yet. */
  terminalBlocked: boolean;
  /** Chat agents: outstanding permission / question request ids. */
  pendingRequests: Set<string>;
  /** When the agent became blocked (ms), or null when it is not. */
  blockedSince: number | null;
  /** The current block already produced a notification. */
  blockedNotified: boolean;
  /** Finished a turn you have not looked at. */
  unread: boolean;
}

export type AttentionEvent =
  | { kind: 'blocked'; agentId: number; blockedForMs: number }
  | { kind: 'finished'; agentId: number };

export class AttentionTracker {
  private readonly agents = new Map<number, AgentAttention>();

  private get(id: number): AgentAttention {
    let a = this.agents.get(id);
    if (!a) {
      a = {
        terminalBlocked: false,
        pendingRequests: new Set(),
        blockedSince: null,
        blockedNotified: false,
        unread: false,
      };
      this.agents.set(id, a);
    }
    return a;
  }

  /** Recompute blockedSince after the block sources changed. */
  private settle(a: AgentAttention, now: number): void {
    const blocked = a.terminalBlocked || a.pendingRequests.size > 0;
    if (blocked && a.blockedSince === null) {
      a.blockedSince = now;
      a.blockedNotified = false;
    } else if (!blocked) {
      a.blockedSince = null;
      a.blockedNotified = false;
    }
  }

  /**
   * Feed one outgoing message. Returns an event when the message itself is
   * worth telling the user about right away (a finished turn); blocks are
   * only reported once they have lasted a while — see dueBlocked().
   */
  observe(msg: HostToWebviewMessage, now: number): AttentionEvent | null {
    switch (msg.type) {
      case 'agentToolPermission': {
        const a = this.get(msg.id);
        a.terminalBlocked = true;
        this.settle(a, now);
        return null;
      }
      case 'agentToolPermissionClear':
      case 'agentToolStart': {
        const a = this.agents.get(msg.id);
        if (!a) return null;
        a.terminalBlocked = false;
        this.settle(a, now);
        return null;
      }
      case 'chat-permission-request': {
        const a = this.get(msg.agentId);
        a.pendingRequests.add(msg.requestId);
        this.settle(a, now);
        return null;
      }
      case 'chat-permission-resolved': {
        const a = this.agents.get(msg.agentId);
        if (!a) return null;
        a.pendingRequests.delete(msg.requestId);
        this.settle(a, now);
        return null;
      }
      case 'agentStatus': {
        const a = this.get(msg.id);
        if (msg.status === 'active') {
          // Work resumed: whatever was pending on the terminal side is answered,
          // and the previous turn's result is superseded.
          a.terminalBlocked = false;
          a.unread = false;
          this.settle(a, now);
          return null;
        }
        // 'waiting' = the turn ended; a turn cannot end while a request is open
        a.terminalBlocked = false;
        a.pendingRequests.clear();
        this.settle(a, now);
        const wasUnread = a.unread;
        a.unread = true;
        return wasUnread ? null : { kind: 'finished', agentId: msg.id };
      }
      case 'agentClosed':
        this.agents.delete(msg.id);
        return null;
      default:
        return null;
    }
  }

  /** You opened the agent: its finished turn is read. Blocks stay until answered. */
  acknowledge(id: number): void {
    const a = this.agents.get(id);
    if (a) a.unread = false;
  }

  /** Blocks that have lasted at least `afterMs` and were not reported yet (marks them reported). */
  dueBlocked(now: number, afterMs: number): AttentionEvent[] {
    const due: AttentionEvent[] = [];
    for (const [agentId, a] of this.agents) {
      if (a.blockedSince === null || a.blockedNotified) continue;
      const blockedForMs = now - a.blockedSince;
      if (blockedForMs < afterMs) continue;
      a.blockedNotified = true;
      due.push({ kind: 'blocked', agentId, blockedForMs });
    }
    return due;
  }

  isBlocked(id: number): boolean {
    const a = this.agents.get(id);
    return a !== undefined && a.blockedSince !== null;
  }

  /** Agents that need you: blocked, or finished and unread. Drives the Dock badge. */
  needsYouCount(): number {
    let n = 0;
    for (const a of this.agents.values()) if (a.blockedSince !== null || a.unread) n++;
    return n;
  }
}
