import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyCampusCommand,
  authorizeCampus,
  CAMPUS_STATUS_MAX_CHARS,
  clampProgress,
  mintCampusToken,
  normalizeStatusText,
  parseCampusArgs,
  parseCampusRequest,
  parseProgressArg,
} from '../campusServer.js';
import {
  installCampusShims,
  renderPosixShim,
  renderWindowsShim,
  shSingleQuote,
} from '../campusShim.js';

const ENV = { session: 's1', token: 't1' };
/** Built, not typed: a literal escape in a regex or string gets rewritten by
 *  the formatter into a raw control byte that is invisible in an editor. */
const ESC = String.fromCharCode(27);

describe('normalizeStatusText', () => {
  it('keeps an ordinary line as it is', () => {
    expect(normalizeStatusText('migrating the schema')).toBe('migrating the schema');
  });

  it('strips ANSI colour codes build tools emit', () => {
    expect(normalizeStatusText(`${ESC}[32mpassing${ESC}[0m`)).toBe('passing');
  });

  it('flattens newlines and tabs into one line', () => {
    expect(normalizeStatusText('step 1\n\tstep 2')).toBe('step 1 step 2');
  });

  it('truncates past the cap with an ellipsis', () => {
    const out = normalizeStatusText('x'.repeat(200));
    expect(out.length).toBe(CAMPUS_STATUS_MAX_CHARS);
    expect(out.endsWith('…')).toBe(true);
  });

  it('reduces a blank line to empty, which is how status clears', () => {
    expect(normalizeStatusText('   \n  ')).toBe('');
  });
});

describe('clampProgress', () => {
  it('passes a fraction through', () => {
    expect(clampProgress(0.42)).toBe(0.42);
  });

  it('clamps out-of-range values instead of drawing off the bar', () => {
    expect(clampProgress(-3)).toBe(0);
    expect(clampProgress(7)).toBe(1);
  });

  it('treats a non-number as zero', () => {
    expect(clampProgress(Number.NaN)).toBe(0);
  });
});

describe('parseProgressArg', () => {
  it('accepts a fraction', () => {
    expect(parseProgressArg('0.6')).toEqual({ value: 0.6 });
  });

  it('accepts a percentage', () => {
    expect(parseProgressArg('60%')).toEqual({ value: 0.6 });
  });

  it('REFUSES a bare number above 1 rather than guessing', () => {
    // "progress 50" could mean half, or half a percent. Guessing would make
    // every bar in the office a lie.
    const out = parseProgressArg('50');
    expect(out).toHaveProperty('error');
    expect((out as { error: string }).error).toMatch(/percentage/);
  });

  it('rejects nonsense', () => {
    expect(parseProgressArg('soon')).toHaveProperty('error');
    expect(parseProgressArg('')).toHaveProperty('error');
  });

  it('clamps a percentage over 100', () => {
    expect(parseProgressArg('150%')).toEqual({ value: 1 });
  });
});

describe('parseCampusArgs', () => {
  it('joins the rest of argv into the status text', () => {
    const out = parseCampusArgs(['status', 'migrating', 'the', 'schema'], ENV);
    expect(out).toEqual({
      cmd: { verb: 'status', session: 's1', token: 't1', text: 'migrating the schema' },
    });
  });

  it('treats an empty status as the explicit clear', () => {
    const out = parseCampusArgs(['status'], ENV);
    expect((out as { cmd: { text: string } }).cmd.text).toBe('');
  });

  it('refuses notify with nothing to say', () => {
    expect(parseCampusArgs(['notify', '  '], ENV)).toHaveProperty('error');
  });

  it('explains itself with no verb or --help', () => {
    expect((parseCampusArgs([], ENV) as { error: string }).error).toMatch(/usage/);
    expect((parseCampusArgs(['--help'], ENV) as { error: string }).error).toMatch(/usage/);
  });

  it('rejects an unknown verb', () => {
    expect((parseCampusArgs(['dance'], ENV) as { error: string }).error).toMatch(/unknown/);
  });

  it('says plainly when it is not running inside a session', () => {
    const out = parseCampusArgs(['status', 'hi'], {});
    expect((out as { error: string }).error).toMatch(/CAMPUS_SESSION/);
  });
});

describe('parseCampusRequest', () => {
  const body = { session: 's1', token: 't1' };

  it('accepts a well-formed status', () => {
    expect(parseCampusRequest('status', { ...body, text: 'hi' })).toEqual({
      cmd: { verb: 'status', session: 's1', token: 't1', text: 'hi' },
    });
  });

  it('clamps progress coming off the wire', () => {
    const out = parseCampusRequest('progress', { ...body, value: 5 });
    expect((out as { cmd: { value: number } }).cmd.value).toBe(1);
  });

  it('never throws on hostile input — it returns a reason', () => {
    const hostile: unknown[] = [null, 'string', 42, [], { session: 1 }, { ...body, text: 7 }];
    for (const raw of hostile) {
      expect(() => parseCampusRequest('status', raw)).not.toThrow();
      expect(parseCampusRequest('status', raw)).toHaveProperty('error');
    }
  });

  it('requires both halves of the identity', () => {
    expect(parseCampusRequest('status', { session: 's1' })).toHaveProperty('error');
    expect(parseCampusRequest('status', { token: 't1' })).toHaveProperty('error');
  });

  it('rejects an unknown verb before looking at the body', () => {
    expect(parseCampusRequest('rm-rf', body)).toHaveProperty('error');
  });
});

describe('authorizeCampus', () => {
  const tokens = new Map([['s1', 'secret-token']]);
  const lookup = (s: string) => tokens.get(s);

  it('accepts the right token for the right session', () => {
    expect(authorizeCampus(lookup, { session: 's1', token: 'secret-token' })).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(authorizeCampus(lookup, { session: 's1', token: 'secret-tokeN' })).toBe(false);
  });

  it('rejects an unknown session the same way as a bad token', () => {
    expect(authorizeCampus(lookup, { session: 'ghost', token: 'secret-token' })).toBe(false);
  });

  it('rejects a token of a different length without throwing', () => {
    expect(authorizeCampus(lookup, { session: 's1', token: 'x' })).toBe(false);
  });

  it('mints tokens that differ', () => {
    expect(mintCampusToken()).not.toBe(mintCampusToken());
  });
});

describe('applyCampusCommand', () => {
  const cmd = (over: Partial<Parameters<typeof applyCampusCommand>[1]>) =>
    ({ verb: 'status', session: 's1', token: 't1', ...over }) as Parameters<
      typeof applyCampusCommand
    >[1];

  it('sets a status on an undecorated agent', () => {
    const out = applyCampusCommand(undefined, cmd({ text: 'building' }), 100);
    expect(out).toEqual({ status: 'building', progress: null, setAtMs: 100 });
  });

  it('clears the status with an empty string', () => {
    const prev = { status: 'building', progress: 0.5, setAtMs: 1 };
    expect(applyCampusCommand(prev, cmd({ text: '' }), 2).status).toBeNull();
  });

  it('leaves the status alone when only progress moves', () => {
    const prev = { status: 'building', progress: null, setAtMs: 1 };
    const out = applyCampusCommand(prev, cmd({ verb: 'progress', value: 0.3 }), 2);
    expect(out).toEqual({ status: 'building', progress: 0.3, setAtMs: 2 });
  });

  it('leaves progress alone when only the status moves', () => {
    const prev = { status: null, progress: 0.8, setAtMs: 1 };
    expect(applyCampusCommand(prev, cmd({ text: 'nearly' }), 2).progress).toBe(0.8);
  });

  it('normalizes the text it stores', () => {
    expect(applyCampusCommand(undefined, cmd({ text: `${ESC}[31mboom${ESC}[0m` }), 1).status).toBe(
      'boom',
    );
  });

  it('leaves the decoration untouched for notify and ping', () => {
    const prev = { status: 'building', progress: 0.5, setAtMs: 1 };
    expect(applyCampusCommand(prev, cmd({ verb: 'notify', text: 'done' }), 9)).toEqual(prev);
    expect(applyCampusCommand(prev, cmd({ verb: 'ping' }), 9)).toEqual(prev);
  });
});

describe('shim rendering', () => {
  const o = {
    electron: '/Applications/Agent Campus.app/Contents/MacOS/Agent Campus',
    cli: '/h/.pixel-agents/bin/campus-cli.js',
    stamp: '0.3.0 now',
  };

  it('quotes a path with spaces', () => {
    expect(shSingleQuote('/a b/c')).toBe("'/a b/c'");
  });

  it('escapes an apostrophe in a home directory', () => {
    expect(shSingleQuote("/Users/o'brien")).toBe(`'/Users/o'\\''brien'`);
  });

  it('passes arguments as "$@", never $*', () => {
    const sh = renderPosixShim(o);
    expect(sh).toContain('"$@"');
    expect(sh).not.toContain('$*');
  });

  it('execs so exit codes pass through, with the env var scoped to it', () => {
    expect(renderPosixShim(o)).toContain('ELECTRON_RUN_AS_NODE=1 exec ');
  });

  it('quotes both paths in the POSIX shim', () => {
    expect(renderPosixShim(o)).toContain(
      "'/Applications/Agent Campus.app/Contents/MacOS/Agent Campus'",
    );
  });

  it('forwards args and the exit code on Windows', () => {
    const cmd = renderWindowsShim(o);
    expect(cmd).toContain('%*');
    expect(cmd).toContain('exit /b %ERRORLEVEL%');
    expect(cmd).toContain('"/Applications/Agent Campus.app/Contents/MacOS/Agent Campus"');
  });
});

describe('installCampusShims', () => {
  const realHome = process.env.HOME;
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shim-'));
    process.env.HOME = path.join(tmp, 'home');
  });

  afterEach(() => {
    if (realHome === undefined) delete process.env.HOME;
    else process.env.HOME = realHome;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  /** Stands in for the compiled output the app ships. */
  function fakeBuild(): string {
    const dir = path.join(tmp, 'dist');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'campusCli.js'), "require('./campusServer.js');");
    fs.writeFileSync(path.join(dir, 'campusServer.js'), 'module.exports = {};');
    return path.join(dir, 'campusCli.js');
  }

  it('installs a runnable shim and an executable bit', () => {
    const out = installCampusShims({
      electronPath: '/bin/echo',
      cliSource: fakeBuild(),
      version: '1',
    });
    expect(out).not.toBeNull();
    expect(fs.statSync(out!.campus).mode & 0o111).toBeTruthy();
  });

  // The regression: copying only the entry point yields a shim that looks
  // installed and dies with MODULE_NOT_FOUND the first time an agent calls it.
  it("copies the CLI's dependency, not just its entry point", () => {
    const out = installCampusShims({
      electronPath: '/bin/echo',
      cliSource: fakeBuild(),
      version: '1',
    });
    for (const file of ['campusCli.js', 'campusServer.js']) {
      expect(fs.existsSync(path.join(out!.binDir, file))).toBe(true);
    }
  });

  // Skipped as root, where the scenario cannot exist: root writes anywhere.
  it.skipIf(process.getuid?.() === 0)('survives a home directory it cannot write to', () => {
    // An empty directory with the write bit off, not '/proc/nonexistent-for-sure'
    // as this once used: /proc does not exist on macOS and IS procfs on Linux,
    // so that was a test of the operating system rather than of this code. Its
    // parent stays writable, so afterEach can still remove it.
    const readOnly = path.join(tmp, 'read-only');
    fs.mkdirSync(readOnly);
    fs.chmodSync(readOnly, 0o500);
    process.env.HOME = readOnly;
    expect(
      installCampusShims({ electronPath: '/bin/echo', cliSource: fakeBuild(), version: '1' }),
    ).toBeNull();
  });
});
