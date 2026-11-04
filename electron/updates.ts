/**
 * Whether a newer release exists.
 *
 * A user who installed in September is still on September's build unless they
 * happen to revisit the Releases page, which means every release we ship
 * reaches almost nobody. This is the smallest honest fix: ask GitHub what the
 * latest release is, compare, and say so in Settings.
 *
 * It deliberately stops short of downloading anything. Installing an update
 * in place is platform-specific, needs a signed app on macOS, and can only be
 * tested against a real published release — whereas KNOWING there is one is
 * pure logic over one HTTP response, works unsigned on every platform, and is
 * the part that actually closes the gap.
 *
 * Everything here is pure except `fetchLatestRelease`, so the comparison that
 * decides whether to nag a user is covered by tests rather than by hope.
 */

import { UPDATE_CHECK_TIMEOUT_MS } from '../src/core/constants.js';

export interface ReleaseInfo {
  /** Version without the leading 'v'. */
  version: string;
  /** The release page, which is where a manual update starts. */
  url: string;
}

interface ParsedVersion {
  parts: number[];
  /** The '-beta.1' tail, or '' for a release build. */
  prerelease: string;
}

/**
 * 'v0.3.0-beta.1' → { parts: [0,3,0], prerelease: 'beta.1' }.
 *
 * Lenient on purpose: this parses a tag a human typed, and the only thing
 * worse than mis-reading one is throwing on it.
 */
export function parseVersion(raw: string): ParsedVersion | null {
  const trimmed = raw.trim().replace(/^v/i, '');
  if (!trimmed) return null;
  const [core, ...rest] = trimmed.split('-');
  const parts = core.split('.').map((n) => Number.parseInt(n, 10));
  if (parts.length === 0 || parts.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return { parts, prerelease: rest.join('-') };
}

/**
 * True when `latest` is a version worth telling the user about.
 *
 * Unparseable input answers false in both directions: a release tagged
 * something unexpected should leave the app quiet, not claim an update it
 * cannot describe. A prerelease ranks BELOW the same release version, which
 * is what makes 0.4.0 an update for someone running 0.4.0-beta.1 — the case
 * that a plain string compare gets backwards.
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;

  const length = Math.max(a.parts.length, b.parts.length);
  for (let i = 0; i < length; i++) {
    const left = a.parts[i] ?? 0;
    const right = b.parts[i] ?? 0;
    if (left !== right) return left > right;
  }
  // Same numbers: only a release can out-rank a prerelease of itself.
  return a.prerelease === '' && b.prerelease !== '';
}

/**
 * The newest stable release in a GitHub `/releases` response, or null.
 *
 * `/releases/latest` would be one fewer step, but it has a habit of answering
 * 404 for a repository whose only releases are drafts or prereleases, and a
 * 404 is indistinguishable here from "repo moved". Reading the list lets this
 * skip drafts and prereleases explicitly and simply find nothing when there
 * is nothing.
 */
export function pickLatestRelease(payload: unknown): ReleaseInfo | null {
  if (!Array.isArray(payload)) return null;
  for (const entry of payload) {
    if (!entry || typeof entry !== 'object') continue;
    const release = entry as {
      tag_name?: unknown;
      html_url?: unknown;
      draft?: unknown;
      prerelease?: unknown;
    };
    if (release.draft === true || release.prerelease === true) continue;
    if (typeof release.tag_name !== 'string' || typeof release.html_url !== 'string') continue;
    const parsed = parseVersion(release.tag_name);
    if (!parsed) continue;
    // The API returns releases newest-first, so the first usable one wins.
    return { version: release.tag_name.trim().replace(/^v/i, ''), url: release.html_url };
  }
  return null;
}

/**
 * Asks GitHub for the repository's releases and picks the newest stable one.
 *
 * `fetchImpl` is injectable so the network shape — a 404, a rate-limit body,
 * a list of nothing but prereleases — is covered by tests rather than by a
 * live request. Answers null for every failure: a check the user did not ask
 * for has no business raising anything.
 */
export async function fetchLatestRelease(
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReleaseInfo | null> {
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases?per_page=10`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'agent-campus' },
      signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return pickLatestRelease(await response.json());
  } catch {
    // Offline, DNS, a timeout, a body that is not JSON: all the same answer.
    return null;
  }
}
