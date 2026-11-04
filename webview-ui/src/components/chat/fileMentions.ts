/**
 * When the composer is offering files, and what replacing one looks like.
 *
 * Pure for the same reason the slash palette is: the open/closed rule is the
 * feature. An `@` is a common character — an email address, a Python
 * decorator, a handle in prose — so the rule has to be narrow enough that
 * the popup is a help rather than a thing to dismiss.
 */

export interface FileMentionQuery {
  /** What has been typed after the `@`. */
  query: string;
  /** Index of the `@` in the draft, so accepting can replace from there. */
  start: number;
}

/**
 * The mention being typed at the end of the draft, or null.
 *
 * Only at the END, because that is where the caret is while someone types;
 * going back to edit an earlier mention is not worth a popup that would then
 * also fire while scrolling through old text. The `@` must start the draft or
 * follow whitespace — `user@example.com` is not a file — and the token must
 * have no whitespace of its own, which is also what ends it.
 */
export function matchFileMention(draft: string): FileMentionQuery | null {
  const at = draft.lastIndexOf('@');
  if (at < 0) return null;
  const before = at === 0 ? '' : draft[at - 1];
  if (before !== '' && !/\s/.test(before)) return null;

  const query = draft.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { query, start: at };
}

/**
 * The draft with the mention replaced by a path.
 *
 * The `@` goes with it: what the agent needs is the path, and a stray marker
 * in front of it is one more thing for the model to interpret. A trailing
 * space follows, because a mention is almost never the end of the sentence.
 */
export function applyFileMention(draft: string, mention: FileMentionQuery, path: string): string {
  return `${draft.slice(0, mention.start)}${path} `;
}
