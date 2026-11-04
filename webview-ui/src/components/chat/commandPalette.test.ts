import { describe, expect, it } from 'vitest';

import type { SlashCommandOption } from './commandPalette.js';
import { applyCommand, matchCommands } from './commandPalette.js';

const COMMANDS: SlashCommandOption[] = [
  { name: 'compact', description: 'Compact the conversation' },
  { name: 'commit', description: 'Commit the work', argumentHint: '<message>' },
  { name: 'cost', description: 'Show session cost' },
  { name: 'review', description: 'Review the diff' },
];

const names = (draft: string) => matchCommands(COMMANDS, draft)?.matches.map((c) => c.name);

describe('matchCommands', () => {
  it('stays closed for ordinary text', () => {
    expect(matchCommands(COMMANDS, 'fix the parser')).toBeNull();
    expect(matchCommands(COMMANDS, '')).toBeNull();
  });

  it('offers everything on a bare slash', () => {
    // Shortest first, then alphabetical: cost(4), commit(6), review(6), compact(7).
    expect(names('/')).toEqual(['cost', 'commit', 'review', 'compact']);
  });

  it('filters by prefix, shortest first', () => {
    // An exact name should not sit below everything it is a prefix of.
    expect(names('/co')).toEqual(['cost', 'commit', 'compact']);
  });

  it('ignores case', () => {
    expect(names('/CoM')).toEqual(['commit', 'compact']);
  });

  it('closes once the command name is finished', () => {
    // The space means arguments have started: the keys belong to the
    // composer again, and an open palette would swallow Enter.
    expect(matchCommands(COMMANDS, '/commit fix the parser')).toBeNull();
    expect(matchCommands(COMMANDS, '/commit ')).toBeNull();
  });

  it('closes when nothing matches rather than showing an empty box', () => {
    expect(matchCommands(COMMANDS, '/zzz')).toBeNull();
  });

  it('reports what was typed, for highlighting', () => {
    expect(matchCommands(COMMANDS, '/Co')?.query).toBe('co');
  });
});

describe('applyCommand', () => {
  it('leaves the caret ready for arguments', () => {
    expect(applyCommand(COMMANDS[1])).toBe('/commit ');
  });
});
