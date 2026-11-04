import { describe, expect, it } from 'vitest';

import {
  type CoordinationCandidate,
  interruptResultText,
  resolveAgentTarget,
} from '../coordination.js';

const s = (agentId: number, over: Partial<CoordinationCandidate> = {}): CoordinationCandidate => ({
  agentId,
  ended: false,
  busy: false,
  ...over,
});

const ASSISTANT = 1;

describe('resolveAgentTarget', () => {
  it('finds a live agent', () => {
    const target = s(3);
    const found = resolveAgentTarget(3, ASSISTANT, [s(ASSISTANT), target]);
    expect(found).toEqual({ ok: true, target });
  });

  it('refuses the assistant itself', () => {
    // Without this it messages itself and answers forever: it IS in the
    // session map, so the lookup below would succeed.
    const found = resolveAgentTarget(ASSISTANT, ASSISTANT, [s(ASSISTANT), s(3)]);
    expect(found.ok).toBe(false);
    expect(found.ok === false && found.text).toBe('That agent id is you. Nothing done.');
  });

  it('names the live agents when the id is made up', () => {
    // The refusal is all the model gets back, so it has to end the guessing
    // rather than invite another round of it.
    const found = resolveAgentTarget(999, ASSISTANT, [s(ASSISTANT), s(5), s(3)]);
    expect(found.ok === false && found.text).toBe(
      'No live chat agent 999. Live chat agents: 3, 5.',
    );
  });

  it('never offers the assistant as a live agent to talk to', () => {
    const found = resolveAgentTarget(999, ASSISTANT, [s(ASSISTANT), s(4)]);
    expect(found.ok === false && found.text).toContain('Live chat agents: 4.');
  });

  it('says so plainly when nothing is running', () => {
    const found = resolveAgentTarget(2, ASSISTANT, [s(ASSISTANT)]);
    expect(found.ok === false && found.text).toBe('No live chat agent 2. There are none running.');
  });

  it('tells a finished agent apart from one that never existed', () => {
    // Different next moves: "it finished" means read its work, "you made that
    // up" means look at agents_status again.
    const found = resolveAgentTarget(3, ASSISTANT, [s(ASSISTANT), s(3, { ended: true }), s(4)]);
    expect(found.ok === false && found.text).toBe('Agent 3 has finished. Live chat agents: 4.');
  });

  it('works with no assistant session at all', () => {
    const target = s(2);
    expect(resolveAgentTarget(2, null, [target])).toEqual({ ok: true, target });
    expect(resolveAgentTarget(9, null, [target]).ok).toBe(false);
  });
});

describe('interruptResultText', () => {
  it('does not claim to have stopped an idle agent', () => {
    // interrupt() on an idle session resolves quietly, so the only thing
    // keeping this honest is the busy flag read before it.
    expect(interruptResultText(3, false)).toBe('Agent 3 was not running; nothing to interrupt.');
    expect(interruptResultText(3, true)).toBe('Interrupted agent 3.');
  });
});
