import { describe, expect, it } from 'vitest';

import { applyFileMention, matchFileMention } from './fileMentions.js';

describe('matchFileMention', () => {
  it('opens on an @ at the start of the draft', () => {
    expect(matchFileMention('@main')).toEqual({ query: 'main', start: 0 });
  });

  it('opens on an @ after a space, mid-sentence', () => {
    expect(matchFileMention('look at @electron/ma')).toEqual({
      query: 'electron/ma',
      start: 8,
    });
  });

  it('offers everything on a bare @', () => {
    expect(matchFileMention('fix @')).toEqual({ query: '', start: 4 });
  });

  it('stays closed inside an email address', () => {
    // The commonest false positive, and the reason the character before the
    // @ is checked at all.
    expect(matchFileMention('mail me at bob@example.com')).toBeNull();
  });

  it('closes once the mention is finished', () => {
    // A space ends the token, so the keys go back to the composer and Enter
    // sends instead of picking a file.
    expect(matchFileMention('@main.ts and then')).toBeNull();
  });

  it('follows the caret to the LAST mention', () => {
    expect(matchFileMention('@one.ts then @tw')).toEqual({ query: 'tw', start: 13 });
  });

  it('stays closed with no @ at all', () => {
    expect(matchFileMention('just a message')).toBeNull();
  });
});

describe('applyFileMention', () => {
  it('replaces the whole mention, @ included, and leaves a space', () => {
    const draft = 'look at @electron/ma';
    const mention = matchFileMention(draft)!;
    expect(applyFileMention(draft, mention, 'electron/main.ts')).toBe('look at electron/main.ts ');
  });

  it('keeps everything before the mention untouched', () => {
    const draft = '@one.ts then @tw';
    const mention = matchFileMention(draft)!;
    expect(applyFileMention(draft, mention, 'two.ts')).toBe('@one.ts then two.ts ');
  });
});
