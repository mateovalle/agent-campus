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
    expect(command.command).toContain('/opt/campus/bin/campus');
    expect(command.command).toContain('idle');
  });

  it('quotes the path, since an installed app lives under a space', () => {
    // "/Applications/Agent Campus.app/..." is the normal case on macOS.
    const file = writeAgentHookSettings('session-2', '/Applications/Agent Campus/bin');
    const settings = read(file!) as unknown as {
      hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> };
    };
    expect(settings.hooks.Stop[0].hooks[0].command).toContain('"/Applications/Agent Campus/bin');
  });

  it('writes nothing when there is no campus CLI to call', () => {
    expect(writeAgentHookSettings('session-3', null)).toBeNull();
  });

  it('survives a home it cannot write to', () => {
    setHome('/dev/null/nope');
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
