/**
 * Rebuilds ChatEvent history from a session's JSONL transcript, so a resumed
 * chat tab shows the previous conversation — the chat equivalent of the PTY
 * scrollback replay terminals get.
 *
 * Mirrors the live SDK-message reduction in chatAgent.ts: user prompts,
 * assistant text/thinking, tool calls and their results. Sidechain
 * (sub-agent) traffic, meta records, and synthetic user records (command
 * wrappers, system reminders, caveats) are skipped, matching live behavior.
 */

import * as fs from 'fs';

import type { ChatEvent } from '../shared/protocol.js';
import { CHAT_HISTORY_MAX_EVENTS, summarizeToolValue } from './chatAgent.js';

/** Only the tail of large transcripts is replayed — older turns fall off. */
const HISTORY_TAIL_BYTES = 2 * 1024 * 1024;

/**
 * True for synthetic user records Claude Code writes into transcripts:
 * slash-command bookkeeping (<command-name>…), local command output
 * (<local-command-stdout>…), the local-command caveat, system reminders,
 * and interrupt markers. None of these are what the human actually asked.
 */
export function isSyntheticUserText(text: string): boolean {
  return (
    text.startsWith('<') || text.startsWith('[Request interrupted') || text.startsWith('Caveat:')
  );
}

interface TranscriptRecord {
  type?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  message?: { content?: unknown };
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

/** Reads the transcript tail, dropping a leading partial line if truncated. */
function readTranscriptTail(jsonlFile: string): string | null {
  try {
    const stat = fs.statSync(jsonlFile);
    if (stat.size <= HISTORY_TAIL_BYTES) {
      return fs.readFileSync(jsonlFile, 'utf-8');
    }
    const fd = fs.openSync(jsonlFile, 'r');
    const buf = Buffer.alloc(HISTORY_TAIL_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, stat.size - HISTORY_TAIL_BYTES);
    fs.closeSync(fd);
    const text = buf.toString('utf-8', 0, bytesRead);
    return text.slice(text.indexOf('\n') + 1);
  } catch {
    return null;
  }
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

/**
 * Parses a session transcript into the ChatEvent list a live session would
 * have produced. Returns [] when the file is missing or unreadable. A
 * tool-result whose tool-start fell outside the tail window is harmless —
 * the renderer's reducer drops orphan results.
 */
export function loadTranscriptHistory(jsonlFile: string): ChatEvent[] {
  const text = readTranscriptTail(jsonlFile);
  if (text === null) return [];

  const events: ChatEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let record: TranscriptRecord;
    try {
      record = JSON.parse(line) as TranscriptRecord;
    } catch {
      continue; // partial/corrupt line
    }
    if (record.isSidechain || record.isMeta) continue;
    if (record.type === 'user') {
      pushUserEvents(events, record.message?.content);
    } else if (record.type === 'assistant') {
      pushAssistantEvents(events, record.message?.content);
    }
  }
  return events.slice(-CHAT_HISTORY_MAX_EVENTS);
}
