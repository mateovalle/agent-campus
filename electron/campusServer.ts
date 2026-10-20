/**
 * The campus socket: how a RUNNING agent talks back to its own character.
 *
 * Everything else in this app flows one way — the host reads a transcript and
 * deduces what the character should look like. This is the other direction: a
 * session (or any script it spawns: a build, a git hook, a test runner) can
 * say "I'm at 60% of the migration" and have its character show it.
 *
 * Transport is HTTP/1.1 over a unix socket (a named pipe on Windows), one
 * request per connection. HTTP rather than newline JSON because node's own
 * parser then owns framing, header limits and malformed input — all the
 * things a hand-rolled protocol gets wrong — and because it leaves
 * `curl --unix-socket` as a dependency-free client for anyone who wants one.
 *
 * TRUST: this is a same-user boundary, not a security feature. Any process
 * running as you can already drive your Claude sessions and write your files.
 * The per-agent token exists to stop ACCIDENTS — a stale env var in a
 * long-lived shell, a nested session, an agent guessing another agent's id —
 * not an attacker.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

import type { AgentDecor } from '../shared/protocol.js';

/** Verbs the CLI and the MCP tools share. */
export const CAMPUS_VERBS = ['status', 'progress', 'notify', 'ping'] as const;
export type CampusVerb = (typeof CAMPUS_VERBS)[number];

/** Longest status line kept — it lands in a canvas label and an IPC message. */
export const CAMPUS_STATUS_MAX_CHARS = 60;
/** Longest notify text kept (a native notification body). */
export const CAMPUS_NOTICE_MAX_CHARS = 200;
/** Request bodies above this are refused outright. */
const MAX_BODY_BYTES = 8 * 1024;
/** A client that connects and says nothing is dropped after this. */
const CLIENT_TIMEOUT_MS = 2000;
/** Node destroys connections past this, so a loop can't exhaust handles. */
const MAX_CONNECTIONS = 32;
/** How long to wait for an existing socket to answer before calling it stale. */
const TAKEOVER_PROBE_MS = 300;
/** Characters of the home-path hash that keeps instances' sockets apart. */
const PIPE_HASH_CHARS = 12;

export interface CampusCommand {
  verb: CampusVerb;
  session: string;
  token: string;
  /** `status` and `notify`. */
  text?: string;
  /** `progress`, already 0..1. */
  value?: number;
}

export interface CampusResult {
  ok: boolean;
  error?: string;
  /** Echoed back by `ping` so a script can confirm who it is talking as. */
  info?: Record<string, unknown>;
}

// ── Paths ────────────────────────────────────────────────────

/**
 * Where the socket lives. Resolved per call (never a module-level const) so an
 * isolated HOME is honoured.
 *
 * NOT under ~/.pixel-agents with everything else, and that is deliberate: a
 * unix socket path is capped at 104 bytes on macOS (108 on Linux), which a
 * deep home directory blows straight through — the headless test harness's
 * own HOME already does. bind(2) enforces the cap, so the failure mode is a
 * silent "this feature simply does not exist" rather than an error anyone
 * would read. A temp dir is short by definition, and a socket is a runtime
 * endpoint rather than data worth keeping.
 *
 * The home-path hash keeps instances apart: a dev build, a packaged build and
 * the test harness each get their own socket despite sharing /tmp. Agents
 * never need to know any of this — they are handed CAMPUS_SOCKET.
 *
 * Windows has no socket file at all; a named pipe is a kernel object, named
 * per user because the pipe namespace is machine-global.
 */
export function campusSocketPath(isPackaged = true): string {
  const hash = crypto
    .createHash('sha1')
    .update(os.homedir())
    .digest('hex')
    .slice(0, PIPE_HASH_CHARS);
  const suffix = isPackaged ? '' : '-dev';
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\agent-campus-${hash}${suffix}`;
  }
  return path.join(os.tmpdir(), `agent-campus-${hash}${suffix}.sock`);
}

/** A fresh per-agent token. In memory only — nothing to leak after quit. */
export function mintCampusToken(): string {
  return crypto.randomBytes(16).toString('base64url');
}

// ── Pure helpers (unit-tested) ───────────────────────────────

// Built from a string so the escapes stay ESCAPES: a regex literal here gets
// rewritten by the formatter into raw control bytes, which are invisible in an
// editor and silently mangled by anything that normalizes whitespace.
const ANSI_AND_CONTROL = new RegExp('\\u001b\\[[0-9;?]*[ -/]*[@-~]|[\\u0000-\\u001f\\u007f]', 'g');

/**
 * A status line as it will be shown: no escape sequences (this ends up in a
 * canvas label, where a raw ANSI colour code is just garbage), no control
 * characters, one line, bounded length. Build tools emit all three.
 */
export function normalizeStatusText(raw: string, maxChars = CAMPUS_STATUS_MAX_CHARS): string {
  const flat = raw.replace(ANSI_AND_CONTROL, ' ').replace(/\s+/g, ' ').trim();
  return flat.length <= maxChars ? flat : `${flat.slice(0, maxChars - 1).trimEnd()}…`;
}

/** Clamps to the 0..1 the bar can draw. */
export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Progress as a user would type it: "0.6" or "60%".
 *
 * A bare number above 1 is REJECTED rather than guessed at — "campus progress
 * 50" could mean half or half a percent, and silently picking one would make
 * every bar in the office a lie.
 */
export function parseProgressArg(raw: string): { value: number } | { error: string } {
  const text = raw.trim();
  if (!text) return { error: 'progress needs a value: 0..1 or a percentage like 60%' };
  const percent = text.endsWith('%');
  const n = Number.parseFloat(percent ? text.slice(0, -1) : text);
  if (!Number.isFinite(n)) return { error: `not a number: ${raw}` };
  if (percent) return { value: clampProgress(n / 100) };
  if (n > 1) return { error: `use 0..1 or a percentage (${n}% for "${text}%")` };
  return { value: clampProgress(n) };
}

/** Argv (after the program name) → a command, or the reason it isn't one. */
export function parseCampusArgs(
  argv: readonly string[],
  env: { session?: string; token?: string },
): { cmd: CampusCommand } | { error: string } {
  const [verb, ...rest] = argv;
  if (!verb || verb === '--help' || verb === '-h') {
    return { error: `usage: campus <${CAMPUS_VERBS.join('|')}> [value]` };
  }
  if (!(CAMPUS_VERBS as readonly string[]).includes(verb)) {
    return { error: `unknown command: ${verb}` };
  }
  if (!env.session || !env.token) {
    return { error: 'not running inside an Agent Campus session (no CAMPUS_SESSION)' };
  }
  const base = { verb: verb as CampusVerb, session: env.session, token: env.token };
  const text = rest.join(' ');

  if (verb === 'progress') {
    const parsed = parseProgressArg(text);
    if ('error' in parsed) return { error: parsed.error };
    return { cmd: { ...base, value: parsed.value } };
  }
  if (verb === 'notify') {
    if (!text.trim()) return { error: 'notify needs something to say' };
    return { cmd: { ...base, text } };
  }
  // `status` with no text is how you CLEAR it — an explicit, scriptable reset
  return { cmd: { ...base, text } };
}

/**
 * A request body off the wire → a command. Hostile input is data, never an
 * exception: anything malformed comes back as a reason the caller can print.
 */
export function parseCampusRequest(
  verb: string,
  raw: unknown,
): { cmd: CampusCommand } | { error: string } {
  if (!(CAMPUS_VERBS as readonly string[]).includes(verb)) {
    return { error: `unknown command: ${verb}` };
  }
  if (typeof raw !== 'object' || raw === null) return { error: 'body must be a JSON object' };
  const body = raw as Record<string, unknown>;
  if (typeof body.session !== 'string' || !body.session) return { error: 'missing session' };
  if (typeof body.token !== 'string' || !body.token) return { error: 'missing token' };

  const cmd: CampusCommand = {
    verb: verb as CampusVerb,
    session: body.session,
    token: body.token,
  };
  if (verb === 'progress') {
    if (typeof body.value !== 'number' || !Number.isFinite(body.value)) {
      return { error: 'progress needs a numeric value' };
    }
    cmd.value = clampProgress(body.value);
  } else if (verb === 'status' || verb === 'notify') {
    if (body.text !== undefined && typeof body.text !== 'string') {
      return { error: 'text must be a string' };
    }
    cmd.text = typeof body.text === 'string' ? body.text : '';
    if (verb === 'notify' && !cmd.text.trim()) return { error: 'notify needs something to say' };
  }
  return { cmd };
}

/**
 * Is this caller who it says it is? Separate from the command handling so the
 * rule is one testable function: an unknown session and a wrong token give
 * the SAME answer, so a caller can't probe for which sessions exist.
 */
export function authorizeCampus(
  tokenForSession: (session: string) => string | undefined,
  cmd: Pick<CampusCommand, 'session' | 'token'>,
): boolean {
  const expected = tokenForSession(cmd.session);
  if (!expected || expected.length !== cmd.token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cmd.token));
}

/**
 * The reducer: previous decoration + a command → the new decoration.
 *
 * Each verb touches only its own field, so a build loop reporting progress
 * never wipes the status line a different script set, and vice versa.
 */
export function applyCampusCommand(
  prev: AgentDecor | undefined,
  cmd: CampusCommand,
  nowMs: number,
): AgentDecor {
  const base: AgentDecor = prev ?? { status: null, progress: null, setAtMs: nowMs };
  if (cmd.verb === 'status') {
    const text = normalizeStatusText(cmd.text ?? '');
    return { ...base, status: text || null, setAtMs: nowMs };
  }
  if (cmd.verb === 'progress') {
    return { ...base, progress: clampProgress(cmd.value ?? 0), setAtMs: nowMs };
  }
  return base;
}

// ── Server ───────────────────────────────────────────────────

export interface CampusServerHandle {
  close(): void;
  readonly path: string;
  /** False when another instance already owns the socket — not an error. */
  readonly bound: boolean;
}

/** Reads a request body, refusing anything oversized before it is buffered. */
function readBody(req: http.IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', () => resolve(null));
  });
}

/** Whether something is still listening on a socket path (POSIX only). */
function socketIsLive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.connect(socketPath);
    const done = (live: boolean) => {
      probe.destroy();
      resolve(live);
    };
    probe.setTimeout(TAKEOVER_PROBE_MS, () => done(false));
    probe.on('connect', () => done(true));
    probe.on('error', () => done(false));
  });
}

/**
 * Starts the campus server.
 *
 * Resolves with `bound: false` rather than throwing when another instance
 * holds the socket: a second window opening is not an error worth killing a
 * launch over. A socket file left by a crash is detected by CONNECTING to it
 * — existence proves nothing — and only then unlinked.
 */
export async function startCampusServer(opts: {
  socketPath: string;
  onCommand: (cmd: CampusCommand) => CampusResult;
  onNotice?: (level: 'info' | 'error', text: string) => void;
}): Promise<CampusServerHandle> {
  const { socketPath, onCommand } = opts;
  const isPipe = socketPath.startsWith('\\\\');

  const server = http.createServer((req, res) => {
    void (async () => {
      const verb = (req.url ?? '').replace(/^\/v1\//, '').replace(/\/+$/, '');
      const reply = (status: number, result: CampusResult) => {
        const payload = JSON.stringify(result);
        res.writeHead(status, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          connection: 'close',
        });
        res.end(payload);
      };

      if (req.method !== 'POST') return reply(405, { ok: false, error: 'use POST' });
      const body = await readBody(req);
      if (body === null) return reply(413, { ok: false, error: 'request too large' });

      let json: unknown;
      try {
        json = body ? JSON.parse(body) : {};
      } catch {
        return reply(400, { ok: false, error: 'body is not JSON' });
      }
      const parsed = parseCampusRequest(verb, json);
      if ('error' in parsed) return reply(400, { ok: false, error: parsed.error });

      const result = onCommand(parsed.cmd);
      reply(result.ok ? 200 : 403, result);
    })();
  });

  // A client killed mid-write emits EPIPE/ECONNRESET on its socket. Unhandled,
  // that takes down the whole main process — every agent's host — over one
  // interrupted CLI call. Same for any post-listen server error.
  server.on('connection', (socket) => {
    socket.on('error', () => {});
    socket.setTimeout(CLIENT_TIMEOUT_MS, () => socket.destroy());
  });
  server.on('clientError', (_err, socket) => socket.destroy());
  server.on('error', (err) => {
    opts.onNotice?.('error', `campus socket error: ${(err as Error).message}`);
  });
  server.maxConnections = MAX_CONNECTIONS;

  if (!isPipe) {
    fs.mkdirSync(path.dirname(socketPath), { recursive: true, mode: 0o700 });
  }

  const listen = () =>
    new Promise<boolean>((resolve) => {
      const onError = async (err: NodeJS.ErrnoException) => {
        if (err.code !== 'EADDRINUSE' || isPipe) {
          // A path over the sun_path cap fails here, and it looks exactly
          // like "nothing happened" — so name it.
          const tooLong = socketPath.length > 100 ? ` (path is ${socketPath.length} bytes)` : '';
          opts.onNotice?.('error', `campus socket unavailable: ${err.message}${tooLong}`);
          resolve(false);
          return;
        }
        if (await socketIsLive(socketPath)) {
          opts.onNotice?.('info', 'Another Agent Campus already owns the campus socket.');
          resolve(false);
          return;
        }
        // Nothing answered: the file outlived the process that made it.
        try {
          fs.unlinkSync(socketPath);
        } catch {
          /* already gone */
        }
        server.once('error', () => resolve(false));
        server.listen(socketPath, () => resolve(true));
      };
      server.once('error', (err) => void onError(err as NodeJS.ErrnoException));
      server.listen(socketPath, () => resolve(true));
    });

  const bound = await listen();
  if (bound && !isPipe) {
    // In a shared temp dir the file mode IS the gate — both macOS and Linux
    // check write permission on the socket file at connect time — and node
    // binds with the process umask, so narrow it explicitly.
    try {
      fs.chmodSync(socketPath, 0o600);
    } catch {
      /* best effort */
    }
  }

  return {
    path: socketPath,
    bound,
    close() {
      try {
        server.close();
      } catch {
        /* not listening */
      }
      if (bound && !isPipe) {
        try {
          fs.unlinkSync(socketPath);
        } catch {
          /* already gone */
        }
      }
    },
  };
}
