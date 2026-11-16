import { describe, expect, it, vi } from 'vitest';

import {
  fetchLatestRelease,
  hasInstallerFor,
  isNewerVersion,
  parseVersion,
  pickLatestRelease,
} from '../updates.js';

describe('parseVersion', () => {
  it('reads a tag with or without the v', () => {
    expect(parseVersion('v1.2.3')).toEqual({ parts: [1, 2, 3], prerelease: '' });
    expect(parseVersion('1.2.3')).toEqual({ parts: [1, 2, 3], prerelease: '' });
    expect(parseVersion(' 0.3.0 ')).toEqual({ parts: [0, 3, 0], prerelease: '' });
  });

  it('keeps the prerelease tail', () => {
    expect(parseVersion('v0.4.0-beta.1')).toEqual({ parts: [0, 4, 0], prerelease: 'beta.1' });
  });

  it('answers null for anything it cannot read', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('nightly')).toBeNull();
    expect(parseVersion('1.x.3')).toBeNull();
  });
});

describe('isNewerVersion', () => {
  it('compares numerically, not as strings', () => {
    // The case a string compare gets wrong: '10' < '9' alphabetically.
    expect(isNewerVersion('0.10.0', '0.9.0')).toBe(true);
    expect(isNewerVersion('0.9.0', '0.10.0')).toBe(false);
  });

  it('is false for the same version', () => {
    expect(isNewerVersion('0.3.0', '0.3.0')).toBe(false);
  });

  it('never calls an older release an update', () => {
    expect(isNewerVersion('0.2.9', '0.3.0')).toBe(false);
  });

  it('treats a release as newer than its own prerelease', () => {
    expect(isNewerVersion('0.4.0', '0.4.0-beta.1')).toBe(true);
    expect(isNewerVersion('0.4.0-beta.1', '0.4.0')).toBe(false);
  });

  it('tolerates versions of different lengths', () => {
    expect(isNewerVersion('1.1', '1.0.9')).toBe(true);
    expect(isNewerVersion('1.0', '1.0.0')).toBe(false);
  });

  it('stays quiet when either side is unreadable', () => {
    // Claiming an update it cannot name is worse than missing one.
    expect(isNewerVersion('nightly', '0.3.0')).toBe(false);
    expect(isNewerVersion('0.4.0', 'dev')).toBe(false);
  });
});

describe('pickLatestRelease', () => {
  const release = (tag: string, over: Record<string, unknown> = {}) => ({
    tag_name: tag,
    html_url: `https://github.com/o/r/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    // Every platform's installer, unless a case overrides it: the default
    // fixture should exercise the version logic, not the platform logic.
    assets: [
      { name: `App-${tag}.dmg` },
      { name: `App-${tag}.AppImage` },
      { name: `App-${tag}.exe` },
    ],
    ...over,
  });

  it('takes the first usable entry, since the API lists newest first', () => {
    expect(pickLatestRelease([release('v0.4.0'), release('v0.3.0')])).toEqual({
      version: '0.4.0',
      url: 'https://github.com/o/r/releases/tag/v0.4.0',
    });
  });

  it('skips drafts and prereleases', () => {
    expect(
      pickLatestRelease([
        release('v0.5.0', { draft: true }),
        release('v0.5.0-rc.1', { prerelease: true }),
        release('v0.4.0'),
      ]),
    ).toMatchObject({ version: '0.4.0' });
  });

  it('skips a tag it cannot parse rather than stopping', () => {
    expect(pickLatestRelease([release('nightly'), release('v0.4.0')])).toMatchObject({
      version: '0.4.0',
    });
  });

  it('answers null for an empty list or a non-list body', () => {
    // A rate-limit response is a JSON OBJECT, not an array.
    expect(pickLatestRelease([])).toBeNull();
    expect(pickLatestRelease({ message: 'API rate limit exceeded' })).toBeNull();
    expect(pickLatestRelease(null)).toBeNull();
  });
});

describe('fetchLatestRelease', () => {
  const ok = (body: unknown) =>
    vi.fn().mockResolvedValue({ ok: true, json: async () => body } as unknown as Response);

  it('asks the right repository and reads the answer', async () => {
    // The platform is passed in rather than read from the machine: a test
    // whose result depends on which OS runs it goes red for one contributor
    // and green for another.
    const fetchImpl = ok([
      {
        tag_name: 'v9.0.0',
        html_url: 'https://example.test/9',
        draft: false,
        prerelease: false,
        assets: [{ name: 'App-9.0.0.dmg' }],
      },
    ]);
    await expect(
      fetchLatestRelease('owner/repo', fetchImpl as unknown as typeof fetch, 'darwin'),
    ).resolves.toEqual({ version: '9.0.0', url: 'https://example.test/9' });
    expect(fetchImpl.mock.calls[0][0]).toContain('/repos/owner/repo/releases');
  });

  it('answers null on a failed response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(
      fetchLatestRelease('owner/repo', fetchImpl as unknown as typeof fetch),
    ).resolves.toBeNull();
  });

  it('answers null when the network throws', async () => {
    // Offline, DNS, an abort: a check nobody asked for must not surface any
    // of them.
    const fetchImpl = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    await expect(
      fetchLatestRelease('owner/repo', fetchImpl as unknown as typeof fetch),
    ).resolves.toBeNull();
  });

  it('answers null when the body is not JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });
    await expect(
      fetchLatestRelease('owner/repo', fetchImpl as unknown as typeof fetch),
    ).resolves.toBeNull();
  });
});

describe('a release that does not carry your installer', () => {
  // v0.4.1 shipped macOS and Linux while the Windows build was blocked, and
  // the check would have told every Windows user about a download page with
  // nothing on it for them — every six hours, forever.
  const full = (tag: string, assets: string[]) => ({
    tag_name: tag,
    html_url: `https://github.com/o/r/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    assets: assets.map((name) => ({ name })),
  });

  const PARTIAL = [
    full('v0.4.1', ['App-0.4.1.dmg', 'App-0.4.1.AppImage']),
    full('v0.4.0', ['App-0.4.0.dmg', 'App-0.4.0.AppImage', 'App-0.4.0.exe']),
  ];

  it('offers it to the platforms it shipped for', () => {
    expect(pickLatestRelease(PARTIAL, 'darwin')).toMatchObject({ version: '0.4.1' });
    expect(pickLatestRelease(PARTIAL, 'linux')).toMatchObject({ version: '0.4.1' });
  });

  it('skips it for the platform it did not', () => {
    // And falls through to the older release that DOES carry their
    // installer, so the answer stays useful rather than merely quiet.
    expect(pickLatestRelease(PARTIAL, 'win32')).toMatchObject({ version: '0.4.0' });
  });

  it('answers null when no release carries this platform at all', () => {
    const macOnly = [full('v1.0.0', ['App-1.0.0.dmg'])];
    expect(pickLatestRelease(macOnly, 'win32')).toBeNull();
    expect(pickLatestRelease(macOnly, 'darwin')).toMatchObject({ version: '1.0.0' });
  });

  it('treats an unknown platform as Linux rather than offering nothing', () => {
    expect(pickLatestRelease(PARTIAL, 'freebsd' as NodeJS.Platform)).toMatchObject({
      version: '0.4.1',
    });
  });
});

describe('hasInstallerFor', () => {
  it('matches each platform to its own installer', () => {
    const assets = [{ name: 'App.dmg' }, { name: 'App.AppImage' }, { name: 'App Setup.exe' }];
    expect(hasInstallerFor(assets, 'darwin')).toBe(true);
    expect(hasInstallerFor(assets, 'linux')).toBe(true);
    expect(hasInstallerFor(assets, 'win32')).toBe(true);
  });

  it("is not fooled by another platform's file", () => {
    expect(hasInstallerFor([{ name: 'App.AppImage' }], 'win32')).toBe(false);
    expect(hasInstallerFor([{ name: 'App.exe' }], 'darwin')).toBe(false);
    // A blockmap sits beside the dmg and is not something to install.
    expect(hasInstallerFor([{ name: 'App.dmg.blockmap' }], 'darwin')).toBe(false);
  });

  it('says no rather than guessing when the list is missing or odd', () => {
    expect(hasInstallerFor(undefined, 'darwin')).toBe(false);
    expect(hasInstallerFor([], 'darwin')).toBe(false);
    expect(hasInstallerFor([null, { name: 42 }], 'darwin')).toBe(false);
  });
});
