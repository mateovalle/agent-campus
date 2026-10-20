/**
 * `campus` — the CLI an agent (or anything it spawns) uses to decorate its
 * own character.
 *
 *   campus status "migrating the schema"
 *   campus progress 60%
 *   campus notify "build finished"
 *   campus ping
 *
 * Runs as a plain node script: the shim in ~/.pixel-agents/bin executes the
 * app's own Electron binary with ELECTRON_RUN_AS_NODE=1, so this works on a
 * machine with no node installed. It is deliberately dumb — argv plus two env
 * vars in, one HTTP request out — because two installed versions of the app
 * may share this file, and a frozen contract makes version skew a non-issue.
 */

import * as http from 'http';

import type { CampusCommand } from './campusServer.js';
import { campusSocketPath, parseCampusArgs } from './campusServer.js';

/** Exit codes: distinguishable so a script can branch on "not in a session". */
const EXIT_USAGE = 2;
const EXIT_NO_SERVER = 3;
const EXIT_REFUSED = 4;
/** The campus is a local process; a request that slow is a dead one. */
const REQUEST_TIMEOUT_MS = 3000;

export interface CampusClientResponse {
  status: number;
  body: { ok: boolean; error?: string; info?: Record<string, unknown> };
}

/**
 * Sends one command and resolves with the host's answer. Exported so the
 * integration test drives the SAME transport the CLI uses, rather than a
 * test-only reimplementation that could quietly diverge.
 */
export function sendCampusCommand(
  socketPath: string,
  cmd: CampusCommand,
): Promise<CampusClientResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      session: cmd.session,
      token: cmd.token,
      ...(cmd.text !== undefined ? { text: cmd.text } : {}),
      ...(cmd.value !== undefined ? { value: cmd.value } : {}),
    });
    const req = http.request(
      {
        socketPath,
        path: `/v1/${cmd.verb}`,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw || '{}') });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: { ok: false, error: 'bad response' } });
          }
        });
      },
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    req.end(payload);
  });
}

/** The CLI proper: argv + env → exit code. Kept out of module scope for tests. */
export async function runCampusCli(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  out: (text: string) => void,
): Promise<number> {
  const parsed = parseCampusArgs(argv, { session: env.CAMPUS_SESSION, token: env.CAMPUS_TOKEN });
  if ('error' in parsed) {
    out(parsed.error);
    return EXIT_USAGE;
  }
  const socketPath = env.CAMPUS_SOCKET || campusSocketPath();
  try {
    const { body } = await sendCampusCommand(socketPath, parsed.cmd);
    if (!body.ok) {
      out(body.error ?? 'refused');
      return EXIT_REFUSED;
    }
    if (parsed.cmd.verb === 'ping' && body.info) {
      out(JSON.stringify(body.info));
    }
    return 0;
  } catch (err) {
    out(`Agent Campus is not listening (${(err as Error).message})`);
    return EXIT_NO_SERVER;
  }
}

// Entry point when executed as a script (never when imported by a test).
if (require.main === module) {
  void runCampusCli(process.argv.slice(2), process.env, (text) => console.log(text)).then(
    (code) => {
      process.exitCode = code;
    },
  );
}
