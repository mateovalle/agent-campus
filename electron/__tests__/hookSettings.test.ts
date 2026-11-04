import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { removeAgentHookSettings, writeAgentHookSettings } from '../hookSettings.js';

/**
 * BOTH home variables: the module asks os.homedir(), which reads USERPROFILE
 * on Windows and ignores HOME — the same trap the shim suite fell into.
 */
const realEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
let tmp: string;

const setHome = (dir: string | undefined) => {
  for (const key of ['HOME', 'USERPROFILE'] as const) {
    if (dir === undefined) delete process.env[key];
    else process.env[key] = dir;
  }
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-hooks-'));
  setHome(tmp);
});

afterEach(() => {
  process.env.HOME = realEnv.HOME;
  process.env.USERPROFILE = realEnv.USERPROFILE;
  if (realEnv.HOME === undefined) delete process.env.HOME;
  if (realEnv.USERPROFILE === undefined) delete process.env.USERPROFILE;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, never>;

describe('writeAgentHookSettings', () => {
  it('writes a Stop hook that calls the campus CLI by absolute path', () => {
    const file = writeAgentHookSettings('session-1', '/opt/campus/bin');
    expect(file).not.toBeNull();

    const settings = read(file!) as unknown as {
      hooks: { Stop: Array<{ hooks: Array<{ type: string; command: string }> }> };
    };
    const command = settings.hooks.Stop[0].hooks[0];
    expect(command.type).toBe('command');
    // Absolute, because a hook runs in a shell whose PATH we do not control.
    // Composed with path.join rather than spelled with slashes: the separator
    // is the platform's, and asserting one is asserting the platform.
    expect(command.command).toContain(path.join('/opt/campus/bin', 'campus'));
    expect(command.command).toContain('idle');
    // Quoted for the SHELL, not JSON-escaped: JSON.stringify doubles every
    // backslash, which on Windows hands the shell a path that is not the one
    // we meant.
    expect(command.command).not.toContain('\\\\');
  });

  it('quotes the path, since an installed app lives under a space', () => {
    // "/Applications/Agent Campus.app/..." is the normal case on macOS.
    const bin = path.join('/Applications', 'Agent Campus', 'bin');
    const file = writeAgentHookSettings('session-2', bin);
    const settings = read(file!) as unknown as {
      hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> };
    };
    // The whole path inside one pair of quotes, separator whatever it is
    // here, and no doubled backslashes.
    const quoted = settings.hooks.Stop[0].hooks[0].command;
    expect(quoted).toContain(path.join(bin, 'campus'));
    expect(quoted.startsWith('"') || quoted.startsWith("'")).toBe(true);
    expect(quoted.endsWith(' idle')).toBe(true);
  });

  it('writes nothing when there is no campus CLI to call', () => {
    expect(writeAgentHookSettings('session-3', null)).toBeNull();
  });

  it('survives a home it cannot write to', () => {
    // A directory under a FILE: mkdir refuses on every platform, where
    // /dev/null/nope only refuses on POSIX and chmod only on non-Windows.
    const blocker = path.join(tmp, 'a-file');
    fs.writeFileSync(blocker, 'not a directory');
    setHome(path.join(blocker, 'home'));
    expect(writeAgentHookSettings('session-4', '/opt/campus/bin')).toBeNull();
  });
});

describe('removeAgentHookSettings', () => {
  it('deletes the file, and does not mind one that was never written', () => {
    const file = writeAgentHookSettings('session-5', '/opt/campus/bin');
    expect(fs.existsSync(file!)).toBe(true);
    removeAgentHookSettings('session-5');
    expect(fs.existsSync(file!)).toBe(false);
    expect(() => removeAgentHookSettings('never-existed')).not.toThrow();
  });
});
