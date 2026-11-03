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
