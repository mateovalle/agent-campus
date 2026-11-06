/**
 * Rebuilds ChatEvent history for a resumed chat tab, so it shows the previous
 * conversation — the chat equivalent of the PTY scrollback replay.
 *
 * The messages come from the SDK's `getSessionMessages`, not from reading the
 * JSONL ourselves. What that removes is the half most likely to rot: a byte
 * -counted tail read that could cut a conversation mid-line, a per-line
 * JSON.parse with its own corrupt-line handling, and a dependence on the
 * on-disk record shape — which has already changed under us once this year,
 * when CLI 2.1.x moved sub-agent traffic into its own files.
 *
 * What stays is the mapping, because `SessionMessage.message` is `unknown`:
 * the content blocks still have to be walked into the same ChatEvents the
 * live reduction in chatAgent.ts produces.
 */

import type { ChatEvent } from '../shared/protocol.js';
import { CHAT_HISTORY_MAX_EVENTS, loadSdk, summarizeToolValue } from './chatAgent.js';

/** Most messages fetched for a replay — older turns fall off the top. */
const HISTORY_MAX_MESSAGES = 600;

/**
 * The tags Claude Code wraps its own bookkeeping in. Named rather than
 * matched by a leading '<', which is what this used to do and which ate
 * anything a person started with a tag or a generic: "<Button> renders
 * twice — fix it" simply disappeared from a resumed conversation, and the
 * answer to it appeared with nothing above it.
 */
const SYNTHETIC_TAGS = [
  'command-name',
  'command-message',
  'command-args',
  'command-contents',
  'local-command-stdout',
  'local-command-stderr',
  'system-reminder',
  'user-prompt-submit-hook',
];
const SYNTHETIC_TAG_RE = new RegExp(`^<(${SYNTHETIC_TAGS.join('|')})[\\s>]`);
/** The full sentence, not the word: "Caveat:" alone is a plausible prompt. */
const CAVEAT_RE = /^Caveat: the messages below/i;

/**
 * True for synthetic user records Claude Code writes into transcripts:
 * slash-command bookkeeping, local command output, system reminders, the
 * local-command caveat and interrupt markers. None of these are what the
 * human actually asked, so none belong in a replayed conversation.
 *
 * Each pattern is anchored to the real marker. The cost of being too broad
 * here is silent: the prompt is not shown as skipped, it is simply gone.
 */
export function isSyntheticUserText(text: string): boolean {
  return (
    SYNTHETIC_TAG_RE.test(text) || text.startsWith('[Request interrupted') || CAVEAT_RE.test(text)
  );
}

interface ContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
}

function pushUserEvents(events: ChatEvent[], content: unknown): void {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed && !isSyntheticUserText(trimmed)) {
      events.push({ kind: 'user-text', text: content });
    }
    return;
  }
  if (!Array.isArray(content)) return;
  const texts: string[] = [];
  let imageCount = 0;
  for (const block of content as ContentBlock[]) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'tool_result' && block.tool_use_id) {
      events.push({
        kind: 'tool-result',
        toolId: block.tool_use_id,
        isError: !!block.is_error,
        summary: summarizeToolValue(block.content),
      });
    } else if (block.type === 'text' && typeof block.text === 'string') {
      const trimmed = block.text.trim();
      if (trimmed && !isSyntheticUserText(trimmed)) texts.push(block.text);
    } else if (block.type === 'image') {
      imageCount++;
    }
  }
  if (texts.length > 0) {
    events.push({
      kind: 'user-text',
      text: texts.join('\n\n'),
      ...(imageCount > 0 ? { imageCount } : {}),
    });
  }
}

function pushAssistantEvents(events: ChatEvent[], content: unknown): void {
  if (!Array.isArray(content)) return;
  for (const block of content as ContentBlock[]) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && block.text?.trim()) {
      events.push({ kind: 'block-final', block: 'text', text: block.text });
    } else if (block.type === 'thinking' && block.thinking?.trim()) {
      events.push({ kind: 'block-final', block: 'thinking', text: block.thinking });
    } else if (block.type === 'tool_use' && block.id) {
      events.push({
        kind: 'tool-start',
        toolId: block.id,
        name: block.name || '',
        input: block.input ?? {},
      });
    }
  }
}

/** The shape of a stored message this module reads — the SDK types it `unknown`. */
interface StoredMessage {
  type: 'user' | 'assistant' | 'system';
  message: unknown;
  parent_tool_use_id: string | null;
}

/**
 * Stored messages → the ChatEvent list a live session would have produced.
 *
 * Pure, and the half worth testing. Sub-agent traffic is dropped on
 * `parent_tool_use_id`, which is the SAME rule the live reduction uses —
 * where this module previously used the transcript's own `isSidechain` flag
 * and could therefore disagree with it.
 *
 * A tool-result whose tool-start fell off the top is harmless: the renderer's
 * reducer drops orphan results.
 */
export function eventsFromSessionMessages(messages: readonly StoredMessage[]): ChatEvent[] {
  const events: ChatEvent[] = [];
  for (const record of messages) {
    if (record.parent_tool_use_id !== null) continue;
    const content = (record.message as { content?: unknown } | undefined)?.content;
    if (record.type === 'user') {
      pushUserEvents(events, content);
    } else if (record.type === 'assistant') {
      pushAssistantEvents(events, content);
    }
  }
  return events.slice(-CHAT_HISTORY_MAX_EVENTS);
}

/**
 * The previous conversation of a session, or [] if it cannot be read.
 *
 * `dir` narrows the search to the agent's own project; without it the SDK
 * scans every project directory for the id.
 */
export async function loadTranscriptHistory(sessionId: string, dir: string): Promise<ChatEvent[]> {
  try {
    const sdk = await loadSdk();
    const messages = await sdk.getSessionMessages(sessionId, { dir, limit: HISTORY_MAX_MESSAGES });
    return eventsFromSessionMessages(messages as unknown as StoredMessage[]);
  } catch (err) {
    // A session the CLI cannot find, or an older CLI: the tab opens empty,
    // which is what it did before any of this existed.
    console.error('[Agent Campus] Could not load the session transcript:', err);
    return [];
  }
}
