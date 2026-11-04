import { describe, expect, it, vi } from 'vitest';

import { fetchLatestRelease, isNewerVersion, parseVersion, pickLatestRelease } from '../updates.js';

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
    const fetchImpl = ok([
      { tag_name: 'v9.0.0', html_url: 'https://example.test/9', draft: false, prerelease: false },
    ]);
    await expect(
      fetchLatestRelease('owner/repo', fetchImpl as unknown as typeof fetch),
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
