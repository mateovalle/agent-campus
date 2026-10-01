/**
 * Demo mode — a few pretend agents so a first-time visitor (logged out, so
 * no real agent can start) sees what the campus is FOR: characters walking
 * to their desks, typing and reading with live activity labels, finishing
 * turns (green check), getting stuck on a permission (ageing "..." bubble),
 * and wandering off to the espresso bar or the fish tank while idle.
 *
 * It drives the office purely through the host → webview message protocol,
 * dispatched as window `message` events — the same path real host messages
 * take (vscodeApi.ts re-dispatches IPC that way) — so every part of the UI
 * reacts exactly as it would to real agents, and nothing here reaches the
 * host or disk: the ids are unknown to main.ts, which ignores them on
 * saveAgentSeats/focusAgent.
 */

import type { HostToWebviewMessage } from '../../../shared/protocol.js';
import {
  DEMO_AGENT_BASE_ID,
  DEMO_BLOCK_MS,
  DEMO_IDLE_MAX_MS,
  DEMO_IDLE_MIN_MS,
  DEMO_SPAWN_GAP_MS,
  DEMO_STEP_MAX_MS,
  DEMO_STEP_MIN_MS,
} from '../constants.js';

interface DemoAgent {
  name: string;
  role?: string;
  /** Activity lines, played in order each turn (tool statuses as the parser formats them). */
  steps: string[];
  /** This agent stops on a permission prompt partway through every other turn. */
  blocks?: boolean;
}

const AGENTS: DemoAgent[] = [
  {
    name: 'fix-auth-timeout',
    steps: [
      'Reading auth.ts',
      'Searching code',
      'Editing auth.ts',
      'Running: npm test',
      'Editing session.ts',
    ],
    blocks: true,
  },
  {
    name: 'write-release-notes',
    role: 'writer',
    steps: ['Reading CHANGELOG.md', 'Searching files', 'Writing RELEASE.md', 'Editing README.md'],
  },
  {
    name: 'triage-flaky-tests',
    role: 'qa',
    steps: [
      'Running: npm test',
      'Reading retry.test.ts',
      'Searching code',
      'Running: npm test -- --repeat 20',
    ],
  },
  {
    name: 'landing-redesign',
    role: 'designer',
    steps: [
      'Fetching dribbble.com',
      'Reading index.html',
      'Editing index.html',
      'Editing styles.css',
    ],
  },
  {
    name: 'migrate-db-schema',
    steps: ['Reading schema.sql', 'Writing 0042_users.sql', 'Running: npm run migrate'],
    blocks: true,
  },
];

const send = (data: HostToWebviewMessage) =>
  window.dispatchEvent(new MessageEvent('message', { data }));
const between = (min: number, max: number) => min + Math.random() * (max - min);

export function isDemoAgent(id: number): boolean {
  return id >= DEMO_AGENT_BASE_ID && id < DEMO_AGENT_BASE_ID + AGENTS.length;
}

/** Start the demo; returns a function that ends it and removes every demo agent. */
export function startDemo(): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!stopped) fn();
    }, ms);
    timers.add(t);
  };

  AGENTS.forEach((agent, i) => {
    const id = DEMO_AGENT_BASE_ID + i;
    let turn = 0;

    const runTurn = () => {
      turn++;
      send({ type: 'agentStatus', id, status: 'active' });
      const blockAt = agent.blocks && turn % 2 === 0 ? Math.floor(agent.steps.length / 2) : -1;
      const step = (k: number) => {
        if (k > 0) send({ type: 'agentToolDone', id, toolId: `demo-${id}-${turn}-${k - 1}` });
        if (k === agent.steps.length) {
          // Turn over: the green check, then a while idle (wandering, using furniture)
          send({ type: 'agentToolsClear', id });
          send({ type: 'agentStatus', id, status: 'waiting' });
          later(between(DEMO_IDLE_MIN_MS, DEMO_IDLE_MAX_MS), runTurn);
          return;
        }
        send({
          type: 'agentToolStart',
          id,
          toolId: `demo-${id}-${turn}-${k}`,
          status: agent.steps[k],
        });
        if (k === blockAt) {
          // Stuck on a permission: the "..." bubble ages until it is "answered"
          later(between(DEMO_STEP_MIN_MS, DEMO_STEP_MAX_MS), () =>
            send({ type: 'agentToolPermission', id }),
          );
          later(DEMO_BLOCK_MS, () => {
            send({ type: 'agentToolPermissionClear', id });
            step(k + 1);
          });
          return;
        }
        later(between(DEMO_STEP_MIN_MS, DEMO_STEP_MAX_MS), () => step(k + 1));
      };
      step(0);
    };

    later(i * DEMO_SPAWN_GAP_MS, () => {
      send({ type: 'agentCreated', id, ...(agent.role ? { role: agent.role } : {}) });
      send({ type: 'agentLabel', id, label: agent.name });
      // Stagger first turns so the office never moves in lockstep
      later(between(0, DEMO_STEP_MAX_MS), runTurn);
    });
  });

  return () => {
    stopped = true;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    AGENTS.forEach((_, i) => send({ type: 'agentClosed', id: DEMO_AGENT_BASE_ID + i }));
  };
}
