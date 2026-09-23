/**
 * End-of-turn action suggestions: deterministic heuristics over the tools a
 * turn used, producing "next step" buttons for the office UI. Host-agnostic —
 * fed by transcriptParser, delivered via the agentSuggestions message.
 */

import type { AgentActionSuggestion } from '../../shared/protocol.js';
import { MAX_ACTION_SUGGESTIONS, SUGGESTION_ERROR_THRESHOLD } from './constants.js';
import type { TurnStats } from './types.js';

/** Tools whose use marks the turn as having changed files. */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

/** Bash commands that count as running tests/checks. */
const TEST_COMMAND_PATTERN =
  /\b(test|tests|vitest|jest|pytest|check-types|typecheck|tsc|lint|check)\b/;

/** Suggestion texts are plain prompts (not slash commands) so they work in
 * any session regardless of which skills the user has installed. */
const SUGGESTION_REVIEW: AgentActionSuggestion = {
  kind: 'review',
  label: 'Review',
  command:
    'Review the changes you just made for bugs, regressions, and missed edge cases. ' +
    'Fix anything you find.',
  reason: 'Files were changed this turn',
};

const SUGGESTION_TEST: AgentActionSuggestion = {
  kind: 'test',
  label: 'Test',
  command: 'Run the tests and checks relevant to your recent changes and fix any failures.',
  reason: 'Changes were not verified by tests',
};

const SUGGESTION_COMMIT: AgentActionSuggestion = {
  kind: 'commit',
  label: 'Commit',
  command: 'Commit the current changes with a descriptive message.',
  reason: 'Changes were made and tests ran without errors',
};

const SUGGESTION_INVESTIGATE: AgentActionSuggestion = {
  kind: 'investigate',
  label: 'Investigate',
  command:
    'Take a step back: several commands failed this turn. Systematically investigate ' +
    'the root cause before attempting more fixes, and explain what you find.',
  reason: 'Multiple tool errors this turn',
};

/** Tally a tool_use block into the turn's stats. */
export function recordToolUse(
  stats: TurnStats,
  toolName: string,
  input: Record<string, unknown>,
): void {
  if (EDIT_TOOLS.has(toolName)) {
    stats.editCount++;
  } else if (toolName === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : '';
    if (TEST_COMMAND_PATTERN.test(command)) {
      stats.ranTests = true;
    }
  }
}

/** Tally an errored tool_result into the turn's stats. */
export function recordToolError(stats: TurnStats): void {
  stats.errorCount++;
}

/** Derive next-step suggestions from a completed turn's stats. */
export function suggestActions(stats: TurnStats): AgentActionSuggestion[] {
  const suggestions: AgentActionSuggestion[] = [];
  if (stats.errorCount >= SUGGESTION_ERROR_THRESHOLD) {
    suggestions.push(SUGGESTION_INVESTIGATE);
  }
  if (stats.editCount > 0) {
    suggestions.push(SUGGESTION_REVIEW);
    if (!stats.ranTests) {
      suggestions.push(SUGGESTION_TEST);
    } else if (stats.errorCount === 0) {
      suggestions.push(SUGGESTION_COMMIT);
    }
  }
  return suggestions.slice(0, MAX_ACTION_SUGGESTIONS);
}
