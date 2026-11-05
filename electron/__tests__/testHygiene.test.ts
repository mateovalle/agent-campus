/**
 * Rules about the tests themselves, enforced because the platform that would
 * have caught them no longer runs.
 *
 * CI used to execute the suite on Windows, and it earned its keep: it found
 * a suite writing into the developer's REAL user profile, because
 * `os.homedir()` reads USERPROFILE on Windows and ignores HOME. With that
 * leg gone, nothing notices the next one — so the rule becomes a test.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..', '..');
const TEST_DIRS = [
  path.join(ROOT, 'electron', '__tests__'),
  path.join(ROOT, 'src', 'core', '__tests__'),
];

function testFiles(): string[] {
  const found: string[] = [];
  for (const dir of TEST_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.test.ts')) found.push(path.join(dir, name));
    }
  }
  return found;
}

describe('test hygiene', () => {
  it('finds the suites it is supposed to police', () => {
    // A guard that silently matches nothing is worse than no guard.
    expect(testFiles().length).toBeGreaterThan(10);
  });

  it('never redirects HOME without also redirecting USERPROFILE', () => {
    // On Windows `os.homedir()` reads USERPROFILE and IGNORES HOME, so a
    // suite that redirects only HOME writes into the real user profile —
    // which is exactly what happened to the campus shim suite.
    const offenders: string[] = [];
    for (const file of testFiles()) {
      const source = fs.readFileSync(file, 'utf-8');
      const setsHome = /process\.env\.HOME\s*=/.test(source);
      const setsProfile = /process\.env\.USERPROFILE\s*=/.test(source);
      if (setsHome && !setsProfile) offenders.push(path.basename(file));
    }
    expect(offenders).toEqual([]);
  });

  it('keeps every backend test inside __tests__', () => {
    // The electron-builder `files` list excludes those directories, so a
    // test beside its module ships inside the asar importing vitest, a
    // devDependency the installed app does not have. (The webview is
    // exempt: Vite bundles only what is imported.)
    const stray: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
        } else if (entry.name.endsWith('.test.ts')) {
          stray.push(path.relative(ROOT, full));
        }
      }
    };
    for (const root of [path.join(ROOT, 'electron'), path.join(ROOT, 'src')]) {
      if (fs.existsSync(root)) walk(root);
    }
    expect(stray).toEqual([]);
  });
});
