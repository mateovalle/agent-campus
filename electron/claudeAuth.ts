/**
 * Claude Code authentication probe.
 *
 * The app bundles its own `claude` binary (see resolveClaudeExecutable in
 * chatAgent.ts), so a first run rarely fails for a missing CLI — it fails
 * because nobody has logged in yet, and the SDK then dies with an error
 * that means nothing to someone opening the app for the first time.
 *
 * `claude auth status --json` answers that question directly and for free:
 * no inference, and it works wherever the credentials live (a file on
 * Linux and Windows, the login Keychain on macOS — which is why probing
 * for ~/.claude/.credentials.json would report "logged out" on every Mac).
 */

import { execFile } from 'node:child_process';

import type { ClaudeAuthState } from '../shared/protocol.js';

/** How long the probe may take before we treat the CLI as unavailable. */
export const AUTH_PROBE_TIMEOUT_MS = 10_000;

/** Shape of `claude auth status --json`; every field is optional by design. */
interface RawAuthStatus {
  loggedIn?: unknown;
  authMethod?: unknown;
  email?: unknown;
  subscriptionType?: unknown;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined;

/**
 * Read one `claude auth status --json` run.
 *
 * Pure, so the interesting cases are unit-tested: a logged-in payload, a
 * logged-out one, output that isn't JSON at all (an older CLI, or a shell
 * wrapper printing a warning first), and a command that never ran.
 */
export function parseAuthStatus(
  stdout: string,
  error?: { message: string } | null,
): ClaudeAuthState {
  const text = stdout.trim();
  if (text === '') {
    return {
      kind: 'unavailable',
      reason: error?.message ?? 'Claude Code did not report an authentication status.',
    };
  }
  // A login shell can print before the JSON, so take the first {...} block.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return { kind: 'unavailable', reason: error?.message ?? text.split('\n')[0] };
  }
  let raw: RawAuthStatus;
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as RawAuthStatus;
  } catch {
    return { kind: 'unavailable', reason: error?.message ?? text.split('\n')[0] };
  }
  if (raw.loggedIn !== true) return { kind: 'logged-out' };
  return {
    kind: 'ok',
    ...(str(raw.authMethod) ? { method: str(raw.authMethod) } : {}),
    ...(str(raw.email) ? { email: str(raw.email) } : {}),
    ...(str(raw.subscriptionType) ? { plan: str(raw.subscriptionType) } : {}),
  };
}

/** Run the probe against a resolved Claude executable. Never throws. */
export function probeClaudeAuth(executable: string | undefined): Promise<ClaudeAuthState> {
  if (!executable) {
    return Promise.resolve({
      kind: 'unavailable',
      reason: 'Could not find the Claude Code executable.',
    });
  }
  return new Promise((resolve) => {
    execFile(
      executable,
      ['auth', 'status', '--json'],
      { timeout: AUTH_PROBE_TIMEOUT_MS, windowsHide: true },
      (err, stdout) => {
        // A non-zero exit still carries a usable payload on some versions,
        // so parse first and fall back to the error text.
        resolve(parseAuthStatus(stdout ?? '', err));
      },
    );
  });
}
