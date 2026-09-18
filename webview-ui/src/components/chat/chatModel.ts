import type { ChatEvent } from '../../../../shared/protocol.js';
import { CHAT_SESSION_ENDED_TEXT, CHAT_TOOL_SUMMARY_MAX_CHARS } from '../../constants.js';

/** Status of a single tool invocation shown as a card. */
export type ToolCallStatus = 'running' | 'done' | 'error';

/**
 * A renderable chat entry produced by reducing the ChatEvent stream.
 * `key` is a monotonically increasing id, stable across re-reductions of the
 * same event list, used as the React key.
 */
export type ChatItem =
  | { kind: 'user'; key: number; text: string; imageCount?: number }
  | { kind: 'assistant'; key: number; text: string; streaming: boolean }
  | { kind: 'thinking'; key: number; text: string }
  | {
      kind: 'tool';
      key: number;
      toolId: string;
      name: string;
      input: Record<string, unknown>;
      status: ToolCallStatus;
      resultSummary: string | null;
    }
  | { kind: 'turn'; key: number; costUsd: number; durationMs: number; isError: boolean }
  | { kind: 'status'; key: number; text: string }
  | { kind: 'error'; key: number; text: string; hint?: string };

export interface ChatModel {
  items: ChatItem[];
  nextKey: number;
  /** True once the host session finished — the composer is disabled. */
  ended: boolean;
}

export function emptyChatModel(): ChatModel {
  return { items: [], nextKey: 1, ended: false };
}

function pushItem(model: ChatModel, make: (key: number) => ChatItem): ChatModel {
  return { ...model, items: [...model.items, make(model.nextKey)], nextKey: model.nextKey + 1 };
}

/** Index of the in-progress (streaming) assistant text block, or -1. */
function findStreamingIndex(items: ChatItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === 'assistant' && it.streaming) return i;
  }
  return -1;
}

/** Mark any in-progress assistant text block as finalized. */
function finalizeStreaming(items: ChatItem[]): ChatItem[] {
  const idx = findStreamingIndex(items);
  if (idx < 0) return items;
  const next = items.slice();
  const it = next[idx];
  if (it.kind === 'assistant') {
    next[idx] = { ...it, streaming: false };
  }
  return next;
}

/** Pure reducer: fold one ChatEvent into the model. */
export function applyChatEvent(model: ChatModel, event: ChatEvent): ChatModel {
  switch (event.kind) {
    case 'user-text':
      return pushItem(model, (key) => ({
        kind: 'user',
        key,
        text: event.text,
        imageCount: event.imageCount,
      }));

    case 'text-delta': {
      const idx = findStreamingIndex(model.items);
      if (idx >= 0) {
        const items = model.items.slice();
        const it = items[idx];
        if (it.kind === 'assistant') {
          items[idx] = { ...it, text: it.text + event.text };
        }
        return { ...model, items };
      }
      return pushItem(model, (key) => ({
        kind: 'assistant',
        key,
        text: event.text,
        streaming: true,
      }));
    }

    case 'block-final': {
      if (event.block === 'thinking') {
        if (event.text.trim() === '') return model;
        return pushItem(model, (key) => ({ kind: 'thinking', key, text: event.text }));
      }
      // Final text always wins over accumulated deltas
      const idx = findStreamingIndex(model.items);
      if (idx >= 0) {
        const items = model.items.slice();
        const it = items[idx];
        if (it.kind === 'assistant') {
          items[idx] = { ...it, text: event.text, streaming: false };
        }
        return { ...model, items };
      }
      if (event.text.trim() === '') return model;
      return pushItem(model, (key) => ({
        kind: 'assistant',
        key,
        text: event.text,
        streaming: false,
      }));
    }

    case 'tool-start': {
      const base = { ...model, items: finalizeStreaming(model.items) };
      return pushItem(base, (key) => ({
        kind: 'tool',
        key,
        toolId: event.toolId,
        name: event.name,
        input: event.input,
        status: 'running',
        resultSummary: null,
      }));
    }

    case 'tool-result': {
      let idx = -1;
      for (let i = model.items.length - 1; i >= 0; i--) {
        const it = model.items[i];
        if (it.kind === 'tool' && it.toolId === event.toolId) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return model;
      const items = model.items.slice();
      const it = items[idx];
      if (it.kind === 'tool') {
        items[idx] = {
          ...it,
          status: event.isError ? 'error' : 'done',
          resultSummary: event.summary === '' ? null : event.summary,
        };
      }
      return { ...model, items };
    }

    case 'turn-complete': {
      const base = { ...model, items: finalizeStreaming(model.items) };
      return pushItem(base, (key) => ({
        kind: 'turn',
        key,
        costUsd: event.costUsd,
        durationMs: event.durationMs,
        isError: event.isError,
      }));
    }

    case 'status':
      if (event.text.trim() === '') return model;
      return pushItem(model, (key) => ({ kind: 'status', key, text: event.text }));

    case 'error':
      return pushItem(model, (key) => ({
        kind: 'error',
        key,
        text: event.message,
        hint: event.hint,
      }));

    case 'session-ended':
      return {
        ...pushItem(model, (key) => ({ kind: 'status', key, text: CHAT_SESSION_ENDED_TEXT })),
        ended: true,
      };

    default:
      return model;
  }
}

/** Fold an entire event list (used for chat-replay). */
export function applyChatEvents(model: ChatModel, events: ChatEvent[]): ChatModel {
  let next = model;
  for (const event of events) {
    next = applyChatEvent(next, event);
  }
  return next;
}

// ── Tool input summarization ─────────────────────────────────

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

export function truncateChars(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function stringField(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value : '';
}

/** Smart one-line summary of a tool invocation, derived from its input. */
export function summarizeToolInput(name: string, input: Record<string, unknown>): string {
  let summary: string;
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      summary = basename(stringField(input, 'file_path'));
      break;
    case 'NotebookRead':
    case 'NotebookEdit':
      summary = basename(stringField(input, 'notebook_path'));
      break;
    case 'Bash':
      summary = stringField(input, 'command').replace(/\s+/g, ' ').trim();
      break;
    case 'Skill':
      summary = stringField(input, 'skill');
      break;
    case 'SlashCommand':
      summary = stringField(input, 'command');
      break;
    case 'Grep':
    case 'Glob':
      summary = stringField(input, 'pattern');
      break;
    case 'Task':
      summary = stringField(input, 'description');
      break;
    case 'WebFetch':
      summary = stringField(input, 'url');
      break;
    case 'WebSearch':
      summary = stringField(input, 'query');
      break;
    case 'TodoWrite':
      summary = 'Update todos';
      break;
    default:
      summary = '';
  }
  return truncateChars(summary, CHAT_TOOL_SUMMARY_MAX_CHARS);
}

// ── AskUserQuestion parsing ──────────────────────────────────
// AskUserQuestion has no executor of its own — the host must collect the
// user's answers in the permission UI and return them via updatedInput.

export interface AskQuestionOption {
  label: string;
  description?: string;
}

export interface AskQuestion {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: AskQuestionOption[];
}

/** Runtime guard: returns the parsed questions or null if malformed. */
export function parseAskUserQuestions(input: Record<string, unknown>): AskQuestion[] | null {
  const raw = input.questions;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const questions: AskQuestion[] = [];
  for (const q of raw) {
    if (typeof q !== 'object' || q === null) return null;
    const rec = q as Record<string, unknown>;
    if (typeof rec.question !== 'string' || !Array.isArray(rec.options)) return null;
    const options: AskQuestionOption[] = [];
    for (const o of rec.options) {
      if (typeof o !== 'object' || o === null) return null;
      const opt = o as Record<string, unknown>;
      if (typeof opt.label !== 'string') return null;
      options.push({
        label: opt.label,
        description: typeof opt.description === 'string' ? opt.description : undefined,
      });
    }
    if (options.length === 0) return null;
    questions.push({
      question: rec.question,
      header: typeof rec.header === 'string' ? rec.header : undefined,
      multiSelect: rec.multiSelect === true,
      options,
    });
  }
  return questions;
}

/**
 * Extract the chosen answers from an AskUserQuestion tool_result summary.
 * The executor reports them as: `Your questions have been answered:
 * "Q"="A", "Q2"="A2". You can now continue…` — returns a question→answer
 * map (empty when the text doesn't match, e.g. dismissed/error results).
 */
export function parseAskAnswers(summary: string | null): Map<string, string> {
  const answers = new Map<string, string>();
  if (!summary) return answers;
  const re = /"([^"]+)"="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(summary)) !== null) {
    answers.set(match[1], match[2]);
  }
  return answers;
}
