import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { isValidLayout, parseLayout } from '../layoutPersistence.js';

/** A valid grid of `cols`x`rows` VOID tiles, plus whatever else is asked for. */
const layout = (over: Record<string, unknown> = {}) => {
  const cols = (over.cols as number) ?? 4;
  const rows = (over.rows as number) ?? 3;
  return { version: 1, cols, rows, tiles: new Array(cols * rows).fill(8), ...over };
};

const refusal = (input: unknown): string => {
  const result = parseLayout(input);
  expect(result.ok, `expected a refusal, got ${JSON.stringify(result)}`).toBe(false);
  return result.ok ? '' : result.reason;
};

describe('parseLayout', () => {
  it('accepts the layout the app ships with', () => {
    // The case that matters most: a validator that rejects our own default
    // breaks every new workspace, and it would do it at first launch.
    const shipped: unknown = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'webview-ui/public/assets/default-layout.json'),
        'utf-8',
      ),
    );
    expect(parseLayout(shipped).ok).toBe(true);
  });

  it('accepts a layout with no furniture and no colours', () => {
    expect(parseLayout(layout()).ok).toBe(true);
  });

  it('accepts furniture above the grid, where wall decorations hang', () => {
    // A painting's bottom row sits ON the wall tile and its upper rows run off
    // the top of the grid, so row -1 is ordinary, not corrupt.
    const result = parseLayout(
      layout({ furniture: [{ uid: 'f1', type: 'painting', col: 2, row: -1 }] }),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts untinted tiles as null colours', () => {
    expect(parseLayout(layout({ tileColors: new Array(12).fill(null) })).ok).toBe(true);
  });

  it('keeps fields it does not know about', () => {
    // An import must not quietly drop what a newer version wrote, or saving
    // the office back would delete it.
    const result = parseLayout(layout({ backgroundMusic: 'lofi', furniture: [] }));
    expect(result.ok && result.layout.backgroundMusic).toBe('lofi');
  });

  it('refuses a tiles array that does not match the grid, naming both', () => {
    const reason = refusal({ version: 1, cols: 4, rows: 3, tiles: [8, 8, 8] });
    expect(reason).toContain('needs 12 tiles');
    expect(reason).toContain('found 3');
  });

  it('refuses a colour per tile that is not one per tile', () => {
    expect(refusal(layout({ tileColors: [null, null] }))).toContain('for 12 tiles');
  });

  it('refuses another version, since tile values mean different things', () => {
    expect(refusal(layout({ version: 2 }))).toContain('version');
  });

  it.each([
    ['a string tile', [8, 'wall', 8]],
    ['a fractional tile', [8, 2.5, 8]],
    ['a negative tile', [8, -1, 8]],
    ['an absurd tile', [8, 9001, 8]],
  ])('refuses %s', (_what, tiles) => {
    expect(refusal({ version: 1, cols: 3, rows: 1, tiles })).toContain('tiles.1');
  });

  it('refuses a grid larger than the editor could ever produce', () => {
    expect(refusal(layout({ cols: 4096, rows: 1 }))).toContain('cols');
  });

  it('refuses furniture with no type, which would render as nothing', () => {
    expect(refusal(layout({ furniture: [{ uid: 'f1', type: '', col: 0, row: 0 }] }))).toContain(
      'furniture.0.type',
    );
  });

  it.each([
    ['null', null],
    ['a string', '{"version":1}'],
    ['an array', [1, 2, 3]],
    ['an empty object', {}],
  ])('refuses %s with a reason rather than a crash', (_what, input) => {
    expect(refusal(input).length).toBeGreaterThan(0);
  });
});

describe('isValidLayout', () => {
  it('still answers the old question for callers with nothing to say', () => {
    expect(isValidLayout(layout())).toBe(true);
    expect(isValidLayout({ version: 1, tiles: [] })).toBe(false);
  });
});
