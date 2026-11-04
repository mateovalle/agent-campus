/**
 * The files an agent can be pointed at, for `@` mentions in the composer.
 *
 * The CLI has a fuzzy matcher for exactly this and does not expose it: the
 * `file_suggestions` control request is not on the `Query` interface, so
 * there is nothing to call. Hence our own index.
 *
 * `git ls-files` rather than a directory walk, because the walk has to be
 * right about .gitignore to be usable at all — a crawl that descends into
 * node_modules returns tens of thousands of paths nobody will ever mention
 * and takes long enough to feel broken. Outside a repo there is a bounded
 * walk that skips the usual suspects, because a workspace does not have to
 * be a repository (the marketing template is a folder of markdown).
 *
 * Async throughout, and cached per directory: this runs on the process that
 * owns every PTY, and the whole point of #47 was that nothing on it may
 * block.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {
  FILE_INDEX_MAX_FILES,
  FILE_INDEX_TTL_MS,
  FILE_INDEX_WALK_SKIP_DIRS,
  GIT_COMMAND_TIMEOUT_MS,
} from '../src/core/constants.js';

interface CachedIndex {
  paths: string[];
  readAtMs: number;
}
const cache = new Map<string, CachedIndex>();

/** Relative paths under `cwd`, newest listing re-read after FILE_INDEX_TTL_MS. */
export async function listWorkspaceFiles(cwd: string, nowMs = Date.now()): Promise<string[]> {
  const cached = cache.get(cwd);
  if (cached && nowMs - cached.readAtMs < FILE_INDEX_TTL_MS) return cached.paths;

  const paths = (await gitListFiles(cwd)) ?? walkFiles(cwd);
  cache.set(cwd, { paths, readAtMs: nowMs });
  return paths;
}

/** Forgets a directory's listing — used when an agent in it goes away. */
export function forgetWorkspaceFiles(cwd: string): void {
  cache.delete(cwd);
}

/**
 * `git ls-files`, or null when this is not a repo.
 *
 * `--cached --others --exclude-standard` is tracked files plus untracked ones
 * that .gitignore does not exclude — which is exactly "files a person would
 * mention", including the one the agent created a minute ago.
 */
function gitListFiles(cwd: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd, encoding: 'utf-8', timeout: GIT_COMMAND_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve(null);
        const paths = stdout.split('\0').filter(Boolean).slice(0, FILE_INDEX_MAX_FILES);
        resolve(paths);
      },
    );
  });
}

/**
 * A bounded walk for a workspace that is not a repo.
 *
 * Synchronous on purpose: it is capped at FILE_INDEX_MAX_FILES and skips the
 * directories that make a walk expensive, so it finishes in the time a
 * readdir takes rather than the time a repository takes. Anything that could
 * run long is the git path above, which is already async.
 */
function walkFiles(root: string): string[] {
  const found: string[] = [];
  const queue: string[] = [root];
  while (queue.length > 0 && found.length < FILE_INDEX_MAX_FILES) {
    const dir = queue.shift() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (found.length >= FILE_INDEX_MAX_FILES) break;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!FILE_INDEX_WALK_SKIP_DIRS.has(entry.name)) queue.push(full);
      } else if (entry.isFile()) {
        found.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  }
  return found;
}

/**
 * The best matches for a partial path, best first.
 *
 * Ranked rather than merely filtered, because a substring match over a whole
 * repository puts the file someone means somewhere in the middle: typing
 * "main" should offer `electron/main.ts` before `src/domain/mainline.ts`.
 * The order is: the base name starts with the query, then the base name
 * contains it, then anywhere in the path — and shorter paths first within
 * each tier, since a deeply nested coincidence is rarely the intent.
 */
export function rankFileMatches(paths: readonly string[], query: string, limit: number): string[] {
  const needle = query.toLowerCase();
  if (!needle) return paths.slice(0, limit);

  const tiered: Array<{ path: string; tier: number }> = [];
  for (const p of paths) {
    const lower = p.toLowerCase();
    const base = lower.slice(lower.lastIndexOf('/') + 1);
    const tier = base.startsWith(needle)
      ? 0
      : base.includes(needle)
        ? 1
        : lower.includes(needle)
          ? 2
          : -1;
    if (tier >= 0) tiered.push({ path: p, tier });
  }
  return tiered
    .sort(
      (a, b) => a.tier - b.tier || a.path.length - b.path.length || a.path.localeCompare(b.path),
    )
    .slice(0, limit)
    .map((m) => m.path);
}
