import { describe, expect, it } from 'vitest';

import type { FileRef, TextChunk } from './filePaths.js';
import { formatFileRef, hasFileRef, splitFileRefs, wholeFileRef } from './filePaths.js';

/** The refs found in a string, for terse assertions. */
const refs = (text: string): FileRef[] =>
  splitFileRefs(text).filter((c): c is FileRef => typeof c !== 'string');

/** Rebuilding the input from its chunks must be lossless. */
const rebuild = (chunks: TextChunk[]): string =>
  chunks.map((c) => (typeof c === 'string' ? c : formatFileRef(c))).join('');

describe('splitFileRefs', () => {
  it('finds a relative path in a sentence', () => {
    expect(refs('I edited electron/main.ts to fix it')).toEqual([{ path: 'electron/main.ts' }]);
  });

  it('finds an absolute path', () => {
    expect(refs('see /Users/me/app/src/index.ts')).toEqual([
      { path: '/Users/me/app/src/index.ts' },
    ]);
  });

  it('keeps the line number when one is given', () => {
    expect(refs('see electron/main.ts:412 for the handler')).toEqual([
      { path: 'electron/main.ts', line: 412 },
    ]);
  });

  it('accepts a line:column but keeps only the line', () => {
    expect(refs('at src/app.tsx:88:12')).toEqual([{ path: 'src/app.tsx', line: 88 }]);
  });

  it('finds several paths in one line', () => {
    expect(refs('moved a/one.ts into b/two.ts')).toEqual([
      { path: 'a/one.ts' },
      { path: 'b/two.ts' },
    ]);
  });

  it('links a bare filename with a known extension', () => {
    expect(refs('look at package.json')).toEqual([{ path: 'package.json' }]);
  });

  it('does not linkify libraries that read as .js filenames', () => {
    expect(refs('this runs on node.js and next.js')).toEqual([]);
  });

  it('still linkifies those names when they carry a directory', () => {
    expect(refs('see vendor/three.js')).toEqual([{ path: 'vendor/three.js' }]);
  });

  it('leaves ordinary prose alone', () => {
    for (const text of ['this is a sentence', 'about 3.5 seconds', 'e.g. nothing here']) {
      expect(refs(text)).toEqual([]);
    }
  });

  it('does not offer the inside of a URL as a local file', () => {
    expect(refs('see https://example.com/docs/guide.md for more')).toEqual([]);
    expect(refs('http://localhost:3000/src/app.tsx')).toEqual([]);
    expect(refs('file:///etc/hosts')).toEqual([]);
  });

  it('still finds a real path sitting next to a URL', () => {
    expect(refs('from https://x.dev/g.md into docs/guide.md')).toEqual([{ path: 'docs/guide.md' }]);
  });

  it('drops the punctuation a sentence leaves stuck to a path', () => {
    expect(refs('it lives in src/core/types.ts.')).toEqual([{ path: 'src/core/types.ts' }]);
    expect(refs('(see src/core/types.ts)')).toEqual([{ path: 'src/core/types.ts' }]);
  });

  it('handles a home-relative path', () => {
    expect(refs('check ~/.pixel-agents/settings.json')).toEqual([
      { path: '~/.pixel-agents/settings.json' },
    ]);
  });

  it('handles a ./ prefix', () => {
    expect(refs('run ./scripts/build.sh')).toEqual([{ path: './scripts/build.sh' }]);
  });

  it('returns the untouched text as one chunk when there is nothing to link', () => {
    expect(splitFileRefs('nothing here')).toEqual(['nothing here']);
  });

  it('preserves the surrounding text exactly', () => {
    const text = 'Edited electron/main.ts:12 and src/app.tsx, then ran tests.';
    expect(rebuild(splitFileRefs(text))).toBe(text);
  });

  it('never loses characters, whatever the input', () => {
    const samples = [
      'a/b.ts c/d.ts',
      '  leading and trailing  ',
      'path/with-dash_and.dots.ts!',
      'no refs at all',
      '',
    ];
    for (const text of samples) {
      expect(rebuild(splitFileRefs(text))).toBe(text);
    }
  });

  it('survives input that is only punctuation', () => {
    expect(() => splitFileRefs('/// ... ::')).not.toThrow();
  });
});

describe('hasFileRef', () => {
  it('is true only when something is linkable', () => {
    expect(hasFileRef('see src/main.ts')).toBe(true);
    expect(hasFileRef('just words')).toBe(false);
  });
});

describe('formatFileRef', () => {
  it('writes a path back as a human would', () => {
    expect(formatFileRef({ path: 'a/b.ts' })).toBe('a/b.ts');
    expect(formatFileRef({ path: 'a/b.ts', line: 9 })).toBe('a/b.ts:9');
  });
});

describe('wholeFileRef', () => {
  it('reads a code span with spaces as one path', () => {
    expect(wholeFileRef('~/Downloads/Vertedero Nasca - rotacion.html')).toEqual({
      path: '~/Downloads/Vertedero Nasca - rotacion.html',
    });
  });

  it('keeps a line number off the end', () => {
    expect(wholeFileRef('/tmp/My Notes/plan b.md:42')).toEqual({
      path: '/tmp/My Notes/plan b.md',
      line: 42,
    });
  });

  it('declines spans the tokeniser already handles', () => {
    expect(wholeFileRef('electron/main.ts')).toBeNull();
    expect(wholeFileRef('electron/main.ts:12')).toBeNull();
  });

  it('declines commands', () => {
    expect(wholeFileRef('npm run build')).toBeNull();
    expect(wholeFileRef('cd webview-ui && npm install')).toBeNull();
    expect(wholeFileRef('rm -rf dist/*.js')).toBeNull();
    expect(wholeFileRef('node scripts/build.ts --watch')).toBeNull();
    expect(wholeFileRef('open "a/b c.html"')).toBeNull();
  });

  it('declines a list of paths, which is not one path with spaces', () => {
    expect(wholeFileRef('src/a.ts src/b.ts')).toBeNull();
  });

  it('needs a directory and a real extension', () => {
    expect(wholeFileRef('Vertedero Nasca.html')).toBeNull();
    expect(wholeFileRef('~/Downloads/Vertedero Nasca')).toBeNull();
    expect(wholeFileRef('a very long sentence about things')).toBeNull();
  });
});

describe('wholeFileRef: one path with spaces vs a list of paths', () => {
  // The old rule asked whether EVERY word was path-shaped, which was wrong
  // in both directions at once.
  it('joins a two-word path — the case the function exists for', () => {
    // `~/Downloads/My` is path-shaped (it has a separator) and `Report.html`
    // has an extension, so the old guard saw "a list" and returned null,
    // leaving the tokeniser to produce two dead links.
    expect(wholeFileRef('~/Downloads/My Report.html')).toEqual({
      path: '~/Downloads/My Report.html',
    });
    expect(wholeFileRef('docs/Release Notes.md')).toEqual({ path: 'docs/Release Notes.md' });
    expect(wholeFileRef('src/a b.ts')).toEqual({ path: 'src/a b.ts' });
  });

  it('keeps the line number on a spaced path', () => {
    expect(wholeFileRef('/tmp/My Notes/plan.md:42')).toEqual({
      path: '/tmp/My Notes/plan.md',
      line: 42,
    });
  });

  it('refuses an actual list', () => {
    // These passed the old guard, because "and" is not path-shaped, and came
    // back as one absurd path.
    expect(wholeFileRef('src/a.ts and src/b.ts')).toBeNull();
    expect(wholeFileRef('README.md CHANGELOG.md')).toBeNull();
  });

  it('still refuses a command', () => {
    expect(wholeFileRef('npm run build && node x.js')).toBeNull();
    expect(wholeFileRef('rm -rf build/*.log')).toBeNull();
  });

  it('still refuses something with no separator or no extension', () => {
    expect(wholeFileRef('just some prose here')).toBeNull();
    expect(wholeFileRef('My Report.html')).toBeNull();
    expect(wholeFileRef('src/some directory')).toBeNull();
  });
});
