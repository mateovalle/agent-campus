import { describe, expect, it } from 'vitest';

import { DIFF_MAX_LINES } from '../../constants.js';
import { formatChangeCount, parseUnifiedDiff } from './diffModel.js';

const PATCH = `diff --git a/mod.txt b/mod.txt
index de98044..a7bc997 100644
--- a/mod.txt
+++ b/mod.txt
@@ -1,3 +1,4 @@
 a
-b
+B
 c
+d
`;

describe('parseUnifiedDiff', () => {
  it('classifies each line and drops the headers', () => {
    const { lines } = parseUnifiedDiff(PATCH);
    expect(lines.map((l) => [l.kind, l.text])).toEqual([
      ['hunk', '@@ -1,3 +1,4 @@'],
      ['context', 'a'],
      ['remove', 'b'],
      ['add', 'B'],
      ['context', 'c'],
      ['add', 'd'],
    ]);
  });

  it('numbers each side independently', () => {
    // The point of showing both: a reviewer reading "line 3" in their editor
    // needs the NEW number, and a removed line only exists in the old one.
    const { lines } = parseUnifiedDiff(PATCH);
    const numbered = lines.slice(1).map((l) => [l.oldLine, l.newLine]);
    expect(numbered).toEqual([
      [1, 1],
      [2, undefined],
      [undefined, 2],
      [3, 3],
      [undefined, 4],
    ]);
  });

  it('starts each hunk from its own line numbers', () => {
    const patch = `@@ -10,2 +20,2 @@\n ctx\n-old\n+new\n`;
    const { lines } = parseUnifiedDiff(patch);
    expect(lines[1]).toMatchObject({ oldLine: 10, newLine: 20 });
    expect(lines[2]).toMatchObject({ oldLine: 11 });
    expect(lines[3]).toMatchObject({ newLine: 21 });
  });

  it('says a file is binary instead of rendering nothing', () => {
    const patch = 'diff --git a/x.png b/x.png\nBinary files a/x.png and b/x.png differ\n';
    expect(parseUnifiedDiff(patch)).toMatchObject({ binary: true, lines: [] });
  });

  it('keeps an empty context line but not the trailing one', () => {
    // A blank line inside a hunk is real content; the one the final newline
    // produces is an artefact of splitting.
    const { lines } = parseUnifiedDiff(`@@ -1,2 +1,2 @@\n \n-a\n+b\n`);
    expect(lines.map((l) => l.kind)).toEqual(['hunk', 'context', 'remove', 'add']);
  });

  it('drops "\\ No newline at end of file", which is not a line of the file', () => {
    const { lines } = parseUnifiedDiff(`@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n`);
    expect(lines.map((l) => l.kind)).toEqual(['hunk', 'remove', 'add']);
  });

  it('refuses to hand over a patch big enough to lock the window', () => {
    const huge = ['@@ -1,1 +1,99999 @@', ...Array(DIFF_MAX_LINES + 500).fill('+x')].join('\n');
    const parsed = parseUnifiedDiff(huge);
    expect(parsed.truncated).toBe(true);
    expect(parsed.lines).toHaveLength(DIFF_MAX_LINES);
  });

  it('answers empty for an empty patch', () => {
    expect(parseUnifiedDiff('')).toEqual({ lines: [], binary: false, truncated: false });
  });
});

describe('formatChangeCount', () => {
  it('shows only the side that moved', () => {
    expect(formatChangeCount(2, 0)).toBe('+2');
    expect(formatChangeCount(0, 3)).toBe('−3');
    expect(formatChangeCount(2, 3)).toBe('+2 −3');
    // A rename changes no content, and '+0 −0' would be noise on the card.
    expect(formatChangeCount(0, 0)).toBe('');
  });
});

describe('content that looks like a header', () => {
  // A real `git diff` of a SQL file: two deleted `-- ` comments and one
  // added `++ ` line. The parser used to test its header prefixes against
  // every line, so these matched `--- ` / `+++ ` and vanished — the reviewer
  // saw two unchanged lines while the row above said +1 −2 — and `oldLine`
  // was not advanced for them, so every number after pointed at the wrong
  // line of the real file.
  const SQL_PATCH = [
    'diff --git a/q.sql b/q.sql',
    'index 1111111..2222222 100644',
    '--- a/q.sql',
    '+++ b/q.sql',
    '@@ -1,4 +1,3 @@',
    ' SELECT 1;',
    '--- legacy comment',
    '--- another one',
    '+++ added marker',
    ' SELECT 2;',
    '',
  ].join('\n');

  it('keeps removed lines beginning with "-- "', () => {
    const removed = parseUnifiedDiff(SQL_PATCH).lines.filter((l) => l.kind === 'remove');
    expect(removed.map((l) => l.text)).toEqual(['-- legacy comment', '-- another one']);
  });

  it('keeps added lines beginning with "++ "', () => {
    const added = parseUnifiedDiff(SQL_PATCH).lines.filter((l) => l.kind === 'add');
    expect(added.map((l) => l.text)).toEqual(['++ added marker']);
  });

  it('numbers the lines after them against the real file', () => {
    // SELECT 2; is old line 4, not old line 2 — and that gutter number is
    // how a reviewer gets from here to their editor.
    const last = parseUnifiedDiff(SQL_PATCH).lines.at(-1);
    expect(last).toMatchObject({ kind: 'context', text: 'SELECT 2;', oldLine: 4, newLine: 3 });
  });

  it('still drops the real headers and the no-newline marker', () => {
    const texts = parseUnifiedDiff(SQL_PATCH).lines.map((l) => l.text);
    expect(texts).not.toContain('--- a/q.sql');
    expect(texts).not.toContain('+++ b/q.sql');
    expect(texts.some((t) => t.startsWith('index '))).toBe(false);

    const withMarker = parseUnifiedDiff(
      ['@@ -1,1 +1,1 @@', '-old', '\\ No newline at end of file', '+new', ''].join('\n'),
    );
    expect(withMarker.lines.map((l) => l.text)).toEqual(['@@ -1,1 +1,1 @@', 'old', 'new']);
  });
});
