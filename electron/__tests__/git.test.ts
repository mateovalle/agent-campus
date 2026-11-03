import { describe, expect, it } from 'vitest';

import { parseNumstat, parseStatusPorcelain } from '../git.js';

/** The NUL separator, written out so the fixtures read like git's output. */
const z = '\0';

describe('parseStatusPorcelain', () => {
  it('reads nothing out of a clean tree', () => {
    expect(parseStatusPorcelain('')).toEqual([]);
  });

  it('classifies each kind by its status code', () => {
    const out = [' D gone.txt', ' M mod.txt', 'A  staged.txt', '?? new.txt'].join(z) + z;
    expect(parseStatusPorcelain(out)).toEqual([
      { path: 'gone.txt', status: 'deleted' },
      { path: 'mod.txt', status: 'modified' },
      { path: 'staged.txt', status: 'added' },
      { path: 'new.txt', status: 'untracked' },
    ]);
  });

  it('reads a rename as one entry with both names', () => {
    // git emits the NEW name in the record and the OLD one as the next field,
    // so a parser that splits and maps produces a phantom entry from the old
    // path — which would then show as an unexplained extra file.
    const out = ['R  new-name.txt', 'old-name.txt', ' M other.txt'].join(z) + z;
    expect(parseStatusPorcelain(out)).toEqual([
      { path: 'new-name.txt', oldPath: 'old-name.txt', status: 'renamed' },
      { path: 'other.txt', status: 'modified' },
    ]);
  });

  it('keeps a path with spaces whole', () => {
    // The -z form exists precisely so this needs no quoting or guessing.
    expect(parseStatusPorcelain(`?? sub/with space.txt${z}`)).toEqual([
      { path: 'sub/with space.txt', status: 'untracked' },
    ]);
  });

  it('takes the interesting letter from either column', () => {
    // 'AM' is staged-as-added then edited; 'MD' is staged then deleted.
    const out = ['AM both.txt', 'MD staged-then-gone.txt'].join(z) + z;
    expect(parseStatusPorcelain(out).map((c) => c.status)).toEqual(['added', 'deleted']);
  });
});

describe('parseNumstat', () => {
  it('reads counts per path', () => {
    const out = ['0\t1\tgone.txt', '2\t1\tmod.txt'].join(z) + z;
    expect(parseNumstat(out).get('mod.txt')).toEqual({ added: 2, removed: 1 });
    expect(parseNumstat(out).get('gone.txt')).toEqual({ added: 0, removed: 1 });
  });

  it('attributes a rename to its new name', () => {
    // A rename empties the path field and follows with old and new, so the
    // naive read lands the counts under '' and the file shows as unchanged.
    const out = `0\t0\t${z}old-name.txt${z}new-name.txt${z}3\t1\tother.txt${z}`;
    const counts = parseNumstat(out);
    expect(counts.get('new-name.txt')).toEqual({ added: 0, removed: 0 });
    expect(counts.has('')).toBe(false);
    // And the record after the rename is still read correctly.
    expect(counts.get('other.txt')).toEqual({ added: 3, removed: 1 });
  });

  it('treats a binary file as no lines rather than NaN', () => {
    expect(parseNumstat(`-\t-\timage.png${z}`).get('image.png')).toEqual({ added: 0, removed: 0 });
  });

  it('ignores blank and malformed records', () => {
    expect(parseNumstat(`${z}garbage${z}1\t2\tfine.txt${z}`).size).toBe(1);
  });
});
