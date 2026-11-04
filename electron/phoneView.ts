/**
 * "Who needs me", readable from a phone on the same network.
 *
 * The campus premise is that nobody watches agents work, which is exactly why
 * the person is usually not at the machine when one gets blocked. Until now
 * the only answer was a desktop notification on that machine.
 *
 * READ-ONLY, deliberately. Approving a permission from a phone means exposing
 * the permission bridge, and that needs an auth story this does not have: the
 * campus socket's token is documented as an accident-preventer, not a security
 * boundary. Looking is a far smaller promise to keep than acting, so this
 * ships the looking.
 *
 * Even looking is not nothing — the page names your projects, your branches
 * and what an agent is asking permission to do — so it is off by default,
 * bound to the LAN, and gated on a token that is compared in constant time.
 *
 * Everything here is pure. The server is phoneServer.ts.
 */

import * as crypto from 'crypto';
import * as path from 'path';

export type PhoneAgentState = 'blocked' | 'done' | 'working' | 'idle';

/** What the host knows about one agent, reduced to what a phone needs. */
export interface PhoneAgentInput {
  id: number;
  name: string;
  workspacePath: string;
  branch?: string;
  blocked: boolean;
  /** How long it has been blocked, in ms. Meaningless unless blocked. */
  blockedForMs: number;
  /** Finished a turn you have not looked at. */
  unread: boolean;
  busy: boolean;
  /** What it is doing, or what it last said about itself. */
  activity?: string;
  /** What it is blocked ON, when we know. */
  requestTitle?: string;
}

export interface PhoneAgent {
  id: number;
  name: string;
  office: string;
  branch?: string;
  state: PhoneAgentState;
  waitingForMs?: number;
  detail?: string;
}

export interface PhoneStatus {
  generatedAt: number;
  /** Blocked longest-first, then turns you have not read. */
  needsYou: PhoneAgent[];
  working: PhoneAgent[];
  idleCount: number;
}

function describe(a: PhoneAgentInput, state: PhoneAgentState): PhoneAgent {
  return {
    id: a.id,
    name: a.name,
    office: path.basename(a.workspacePath) || a.workspacePath,
    ...(a.branch ? { branch: a.branch } : {}),
    state,
    ...(state === 'blocked' ? { waitingForMs: Math.max(0, a.blockedForMs) } : {}),
    ...(() => {
      const detail = state === 'blocked' ? (a.requestTitle ?? a.activity) : a.activity;
      return detail ? { detail } : {};
    })(),
  };
}

/**
 * The three lists a phone screen can hold at once.
 *
 * `needsYou` is ordered longest-wait-first, the same rule the office uses for
 * which bubble catches your eye: on a small screen the top row is the only
 * one that reliably gets read, so it had better be the one that has been
 * waiting since before lunch. Blocked outranks unread for the same reason it
 * does in the office — one is stuck, the other is merely finished.
 */
export function buildPhoneStatus(agents: readonly PhoneAgentInput[], nowMs: number): PhoneStatus {
  const blocked: PhoneAgent[] = [];
  const unread: PhoneAgent[] = [];
  const working: PhoneAgent[] = [];
  let idleCount = 0;

  for (const a of agents) {
    if (a.blocked) blocked.push(describe(a, 'blocked'));
    else if (a.unread) unread.push(describe(a, 'done'));
    else if (a.busy) working.push(describe(a, 'working'));
    else idleCount++;
  }

  blocked.sort((x, y) => (y.waitingForMs ?? 0) - (x.waitingForMs ?? 0) || x.id - y.id);
  unread.sort((x, y) => x.id - y.id);
  working.sort((x, y) => x.id - y.id);

  return { generatedAt: nowMs, needsYou: [...blocked, ...unread], working, idleCount };
}

/**
 * Constant-time token comparison.
 *
 * `===` on a secret leaks its prefix through timing. The length check first
 * is not a leak worth worrying about (the length is fixed and public) but
 * timingSafeEqual THROWS on a length mismatch, so it has to come first.
 */
export function tokenMatches(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/** A token with enough entropy that guessing is not a strategy. */
export function newPhoneToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** The shape of os.networkInterfaces(), reduced to what matters here. */
export type NetworkInterfaces = Record<
  string,
  Array<{ address: string; family: string | number; internal: boolean }> | undefined
>;

/**
 * The address a phone on the same network can actually reach.
 *
 * Not 127.0.0.1, which is what the server binds alongside and is useless on
 * another device, and not an IPv6 link-local address, which needs a scope id
 * no QR code can carry. Answers null rather than guessing when there is no
 * ordinary LAN address — a URL that cannot work is worse than saying so.
 */
export function lanAddress(interfaces: NetworkInterfaces): string | null {
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      const isV4 = entry.family === 'IPv4' || entry.family === 4;
      if (isV4 && !entry.internal && entry.address) return entry.address;
    }
  }
  return null;
}

/** The URL to put in front of the user, or null when there is no LAN. */
export function phoneUrl(
  interfaces: NetworkInterfaces,
  port: number,
  token: string,
): string | null {
  const host = lanAddress(interfaces);
  return host ? `http://${host}:${port}/?t=${token}` : null;
}
