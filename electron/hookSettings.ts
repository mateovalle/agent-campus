/**
 * Hooks for TERMINAL agents, so the office hears from them too.
 *
 * A chat agent's session reports its own turn boundaries through the SDK
 * (see CoreAgentState.hasSessionState). A PTY agent has no such channel: the
 * office deduces everything about it from the transcript, and for a text-only
 * turn the deduction is "no bytes for five seconds", which is a guess.
 *
 * The CLI will run a command when a turn ends, if asked — so we ask, and the
 * command is the campus CLI the agent already has on its PATH. The result is
 * an authoritative "turn over" for an agent that previously had none, and it
 * is also the campus socket's first adoption path for terminal agents: until
 * now nothing put that channel in front of them.
 *
 * `--settings` is ADDITIVE ("additional settings"), and hook entries MERGE
 * across settings levels rather than replacing one another — a user's own
 * Stop hook keeps running alongside this one. That is the only reason this is
 * safe to install without asking.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DATA_DIR_NAME } from '../src/core/constants.js';

/** Where a session's generated settings live, one file per session. */
function hookSettingsPath(sessionId: string): string {
  return path.join(os.homedir(), DATA_DIR_NAME, 'hooks', `${sessionId}.json`);
}

/**
 * The settings a terminal agent is launched with, or null if they could not
 * be written — in which case the agent launches without them and keeps the
 * five-second guess it has always had.
 *
 * `campusBin` is the directory the shims were installed in. Without it there
 * is nothing for the hook to call, so there is no point writing the file.
 */
export function writeAgentHookSettings(sessionId: string, campusBin: string | null): string | null {
  if (!campusBin) return null;
  const file = hookSettingsPath(sessionId);
  // The absolute path, not the bare name: a hook runs in whatever shell the
  // CLI spawns, and PATH is the one thing about that shell we cannot count on.
  const campus = path.join(campusBin, 'campus');
  const settings = {
    hooks: {
      Stop: [
        {
          hooks: [{ type: 'command', command: `${JSON.stringify(campus)} idle` }],
        },
      ],
    },
  };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(settings, null, 2), 'utf-8');
    return file;
  } catch (err) {
    console.error('[Agent Campus] Could not write hook settings:', err);
    return null;
  }
}

/** Forgets a session's settings file; harmless if it was never written. */
export function removeAgentHookSettings(sessionId: string): void {
  try {
    fs.rmSync(hookSettingsPath(sessionId), { force: true });
  } catch {
    /* already gone, or a home we cannot write to — neither matters now */
  }
}
