/**
 * A unified diff as git writes it → lines a canvas-era pixel UI can render.
 *
 * Pure, and deliberately not a diff ENGINE: git already decided what changed.
 * All this does is classify lines so the view can colour them, drop the
 * headers nobody reads inside a panel that already names the file, and refuse
 * to hand the renderer a patch large enough to lock the window.
 */

import { DIFF_MAX_LINES } from '../../constants.js';

export type DiffLineKind = 'add' | 'remove' | 'context' | 'hunk';

export interface DiffLine {
  kind: DiffLineKind;
  /** The line without its leading +/-/space marker. */
  text: string;
  /** Line number in the old file, absent for an addition. */
  oldLine?: number;
  /** Line number in the new file, absent for a removal. */
  newLine?: number;
}

export interface ParsedDiff {
  lines: DiffLine[];
  /** git could not diff it: an image, a binary blob. */
  binary: boolean;
  /** Lines beyond DIFF_MAX_LINES were dropped. */
  truncated: boolean;
}

/** Headers that describe the file rather than its contents. */
const HEADER_PREFIXES = [
  'diff --git ',
  'index ',
  '--- ',
  '+++ ',
  'new file mode',
  'deleted file mode',
  'old mode',
  'new mode',
  'similarity index',
  'dissimilarity index',
  'rename from',
  'rename to',
  'copy from',
  'copy to',
  '\\ No newline at end of file',
];

/** `@@ -oldStart,oldCount +newStart,newCount @@ optional context` */
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseUnifiedDiff(patch: string): ParsedDiff {
  if (!patch) return { lines: [], binary: false, truncated: false };
  if (/^Binary files? /m.test(patch)) return { lines: [], binary: true, truncated: false };

  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let truncated = false;

  for (const raw of patch.split('\n')) {
    if (lines.length >= DIFF_MAX_LINES) {
      truncated = true;
      break;
    }
    const hunk = HUNK_HEADER.exec(raw);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      lines.push({ kind: 'hunk', text: raw });
      continue;
    }
    if (HEADER_PREFIXES.some((prefix) => raw.startsWith(prefix))) continue;
    // Before the first hunk header there is nothing to number, and anything
    // there is still part of the preamble.
    if (oldLine === 0 && newLine === 0) continue;

    if (raw.startsWith('+')) {
      lines.push({ kind: 'add', text: raw.slice(1), newLine: newLine++ });
    } else if (raw.startsWith('-')) {
      lines.push({ kind: 'remove', text: raw.slice(1), oldLine: oldLine++ });
    } else {
      // A context line starts with a space; git also emits a bare empty line
      // for an empty context line, and the trailing newline of the patch
      // produces one final empty string that is not part of the diff.
      lines.push({ kind: 'context', text: raw.slice(1), oldLine: oldLine++, newLine: newLine++ });
    }
  }

  // The split's trailing empty string reads as one phantom context line.
  const last = lines.at(-1);
  if (last && last.kind === 'context' && last.text === '' && patch.endsWith('\n')) lines.pop();

  return { lines, binary: false, truncated };
}

/** '+12 −3', or nothing at all when a file's content did not change. */
export function formatChangeCount(added: number, removed: number): string {
  const parts: string[] = [];
  if (added > 0) parts.push(`+${added}`);
  if (removed > 0) parts.push(`−${removed}`);
  return parts.join(' ');
}
