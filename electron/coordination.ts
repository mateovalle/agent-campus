/**
 * Who the assistant is allowed to talk to, and what to say when it is nobody.
 *
 * The assistant's coordination tools (send_message_to_agent, interrupt_agent)
 * take an agent id from a model, which means the id can be anything: a number
 * it guessed, one from an agent that has since finished, or its own. Those
 * three cases are the entire safety story of the feature, so the decision
 * lives here as a pure function rather than as conditionals inside a closure
 * in main.ts that nothing can reach.
 *
 * The refusal TEXT is part of what is tested, not an afterthought: it is the
 * only thing the model gets back, and "no such agent" sends it guessing again
 * where "live chat agents: 3, 5" ends the matter.
 */

/** The little a decision needs to know about a chat session. */
export interface CoordinationCandidate {
  agentId: number;
  ended: boolean;
  busy: boolean;
}

export type AgentTarget<T> = { ok: true; target: T } | { ok: false; text: string };

export function resolveAgentTarget<T extends CoordinationCandidate>(
  agentId: number,
  assistantAgentId: number | null,
  sessions: Iterable<T>,
): AgentTarget<T> {
  // Checked before the lookup: the assistant IS in the session map, so
  // without this it would cheerfully message itself and answer forever.
  if (assistantAgentId !== null && agentId === assistantAgentId) {
    return { ok: false, text: 'That agent id is you. Nothing done.' };
  }

  const all = [...sessions];
  const match = all.find((s) => s.agentId === agentId);
  if (match && !match.ended) return { ok: true, target: match };

  const live = all
    .filter((s) => !s.ended && s.agentId !== assistantAgentId)
    .map((s) => s.agentId)
    .sort((a, b) => a - b);

  // An ENDED session is named as such rather than as missing: "it finished"
  // and "you made that id up" call for different next moves.
  const what = match ? `Agent ${agentId} has finished.` : `No live chat agent ${agentId}.`;
  return {
    ok: false,
    text:
      live.length > 0
        ? `${what} Live chat agents: ${live.join(', ')}.`
        : `${what} There are none running.`,
  };
}

/**
 * Interrupting an idle agent succeeds silently, so reporting it as an
 * interruption would send the assistant away believing it had stopped
 * something that was never running.
 */
export function interruptResultText(agentId: number, wasBusy: boolean): string {
  return wasBusy
    ? `Interrupted agent ${agentId}.`
    : `Agent ${agentId} was not running; nothing to interrupt.`;
}
