import { describe, expect, it } from 'vitest';

import { rankFileMatches } from '../fileIndex.js';

const PATHS = [
  'electron/main.ts',
  'src/domain/mainline.ts',
  'webview-ui/src/components/chat/ChatView.tsx',
  'docs/maintenance.md',
  'README.md',
];

describe('rankFileMatches', () => {
  it('puts a base name that STARTS with the query first', () => {
    // Substring matching alone buries the file someone means: "main" has to
    // offer electron/main.ts before src/domain/mainline.ts.
    expect(rankFileMatches(PATHS, 'main', 10)[0]).toBe('electron/main.ts');
  });

  it('ranks base-name matches above matches elsewhere in the path', () => {
    const ranked = rankFileMatches(['a/chat/notes.md', 'b/ChatView.tsx'], 'chat', 10);
    expect(ranked[0]).toBe('b/ChatView.tsx');
  });

  it('prefers the shorter path when the tier is the same', () => {
    const ranked = rankFileMatches(['very/deeply/nested/main.ts', 'main.ts'], 'main', 10);
    expect(ranked[0]).toBe('main.ts');
  });

  it('ignores case on both sides', () => {
    expect(rankFileMatches(PATHS, 'CHATVIEW', 10)).toContain(
      'webview-ui/src/components/chat/ChatView.tsx',
    );
  });

  it('matches on a path fragment, not just the name', () => {
    expect(rankFileMatches(PATHS, 'docs/', 10)).toEqual(['docs/maintenance.md']);
  });

  it('offers the first few when nothing has been typed yet', () => {
    expect(rankFileMatches(PATHS, '', 2)).toEqual(['electron/main.ts', 'src/domain/mainline.ts']);
  });

  it('returns nothing rather than everything when nothing matches', () => {
    expect(rankFileMatches(PATHS, 'zzzz', 10)).toEqual([]);
  });

  it('respects the limit, because the popup is a shortlist', () => {
    expect(rankFileMatches(PATHS, '.', 2)).toHaveLength(2);
  });
});
