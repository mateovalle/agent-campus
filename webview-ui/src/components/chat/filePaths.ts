/**
 * Finding file paths in what an agent writes, so they can be clicked open.
 *
 * A terminal makes paths clickable; the chat tab left them as dead text, which
 * is worst exactly when it matters — "see electron/main.ts:412" is an
 * instruction to go somewhere, and retyping it by hand is the whole friction.
 *
 * The detection is deliberately OPTIMISTIC and the styling deliberately quiet:
 * prose is full of things that look like filenames ("node.js", "v1.2"), and
 * the webview cannot check what exists on disk. So a candidate becomes a
 * subtle hover-underline rather than a loud link, and the HOST decides whether
 * there is really a file there when the user actually clicks.
 */

/** A path an agent mentioned, with the line it pointed at if it gave one. */
export interface FileRef {
  path: string;
  line?: number;
}

export type TextChunk = string | FileRef;

/**
 * Extensions worth linking when the token has no directory in it. A bare word
 * with a dot is usually prose, so this list is the only thing separating
 * "main.ts" from "e.g." — it stays conservative on purpose.
 */
const LINKABLE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'jsonc',
  'md',
  'mdx',
  'txt',
  'css',
  'scss',
  'html',
  'svg',
  'py',
  'rb',
  'rs',
  'go',
  'java',
  'kt',
  'swift',
  'php',
  'c',
  'h',
  'cc',
  'cpp',
  'hpp',
  'cs',
  'sh',
  'bash',
  'zsh',
  'fish',
  'yml',
  'yaml',
  'toml',
  'ini',
  'cfg',
  'env',
  'sql',
  'lock',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'pdf',
]);

/**
 * Anything that could be a path: an optional ~/ or ./ lead-in, path segments
 * of word characters and the punctuation filenames actually use, then an
 * optional :line or :line:col.
 */
const CANDIDATE_RE = /(?:~|\.{1,2})?\/?[\w@+.-]+(?:\/[\w@+.-]+)*(?::\d+(?::\d+)?)?/g;
/** Characters a sentence leaves stuck to a path. */
const TRAILING_JUNK_RE = /[.,;:!?)\]}'"]+$/;
/**
 * URLs, matched whole so their path half is never offered as a local file.
 * Checking the characters just before a candidate is not enough: in
 * "https://host/a.md" the candidate starts at the SECOND slash, where the
 * preceding text is "s:/" and looks innocent.
 */
const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

/**
 * Products that read as bare `.js` filenames and essentially never are one.
 * Only consulted for tokens with no directory in them: `src/node.js` is a
 * real file, "runs on node.js" is prose. A denylist is admittedly
 * whack-a-mole, but it is a short, honest list of the words that actually
 * show up in a sentence about code.
 */
const PROSE_JS_WORDS = new Set([
  'node.js',
  'next.js',
  'nuxt.js',
  'nest.js',
  'vue.js',
  'react.js',
  'three.js',
  'd3.js',
  'express.js',
  'ember.js',
  'backbone.js',
  'chart.js',
]);

/**
 * Is this token, on its own, a complete file reference?
 *
 * The distinction that matters for `wholeFileRef`: `~/Downloads/My` is
 * path-SHAPED (it has a separator) but it is not a reference to anything —
 * it is the first half of a name with a space in it. Only a token whose
 * base name ends in a linkable extension stands alone.
 */
function looksLikeCompleteRef(token: string): boolean {
  const withoutLine = token.replace(/:\d+(?::\d+)?$/, '');
  const base = withoutLine.slice(withoutLine.lastIndexOf('/') + 1);
  if (!base.includes('.')) return false;
  if (PROSE_JS_WORDS.has(base.toLowerCase())) return false;
  const ext = base.split('.').pop();
  return ext !== undefined && LINKABLE_EXTENSIONS.has(ext.toLowerCase());
}

/** Does this token look like a file rather than a word with a dot in it? */
function looksLikePath(token: string): boolean {
  if (token.includes('/')) {
    // Reject bare separators and anything that is really a URL remnant
    return /[\w@+.-]/.test(token.replace(/\//g, ''));
  }
  if (PROSE_JS_WORDS.has(token.toLowerCase())) return false;
  const ext = token.split('.').pop();
  return token.includes('.') && ext !== undefined && LINKABLE_EXTENSIONS.has(ext.toLowerCase());
}

/** Splits `path:12:3` into its parts. Column is parsed but not kept — no
 *  editor we open needs it to land on the right line. */
function parseRef(token: string): FileRef {
  const match = /^(.*?):(\d+)(?::\d+)?$/.exec(token);
  if (!match) return { path: token };
  return { path: match[1], line: Number.parseInt(match[2], 10) };
}

/**
 * Text → alternating plain strings and file references.
 *
 * Returns the whole input as a single string chunk when nothing matches, so
 * callers can skip the work for the overwhelmingly common case.
 */
export function splitFileRefs(text: string): TextChunk[] {
  const out: TextChunk[] = [];
  let last = 0;

  const urlSpans = [...text.matchAll(URL_RE)].map((m) => [m.index, m.index + m[0].length]);
  const insideUrl = (at: number) => urlSpans.some(([from, to]) => at >= from && at < to);

  for (const match of text.matchAll(CANDIDATE_RE)) {
    const raw = match[0];
    const start = match.index;
    if (insideUrl(start)) continue;

    const trimmed = raw.replace(TRAILING_JUNK_RE, '');
    if (!trimmed || !looksLikePath(trimmed)) continue;

    const ref = parseRef(trimmed);
    if (!ref.path) continue;

    if (start > last) out.push(text.slice(last, start));
    out.push(ref);
    last = start + trimmed.length;
  }

  if (out.length === 0) return [text];
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Whether a string holds anything worth linking — cheap pre-check. */
export function hasFileRef(text: string): boolean {
  return splitFileRefs(text).some((chunk) => typeof chunk !== 'string');
}

/** `path` + optional line, as a human would write it back. */
export function formatFileRef(ref: FileRef): string {
  return ref.line === undefined ? ref.path : `${ref.path}:${ref.line}`;
}

/**
 * Characters that mean a code span is a COMMAND (or an expression), not a
 * path: no filename anyone opens from chat contains them, and they are what
 * `npm run build -- --flag`, `a = b` or `rm *.log` are made of.
 */
const NOT_IN_A_PATH_RE = /[\n`|*?<>"'=$;&(){}[\],]/;
/** Nothing sane is longer; keeps a pasted paragraph out of the guesswork. */
const WHOLE_REF_MAX = 300;

/**
 * A code span read as ONE path, spaces and all.
 *
 * `splitFileRefs` tokenises on whitespace, so a real path like
 * `~/Downloads/Vertedero Nasca - rotacion.html` arrives as rubble: the user
 * clicks the only piece that still looks like a file ("rotacion.html") and the
 * host dutifully reports no such file. Inside backticks that guesswork is
 * unnecessary — an agent writing a path in a code span means the whole span.
 *
 * Still conservative, because code spans also hold commands: it must contain a
 * directory separator, end in a linkable extension, and carry no shell
 * punctuation. Returns null (fall back to `splitFileRefs`) for spans with no
 * space — the tokeniser already handles those, including `:line` — and for a
 * LIST of paths rather than one path that happens to contain spaces.
 *
 * A list is two or more tokens that are each a COMPLETE reference on their
 * own. The earlier rule asked whether every word was path-shaped, which was
 * wrong in both directions: `~/Downloads/My Report.html` failed it (the
 * first word has a separator, the last has an extension) — the very example
 * this function was written for — while `src/a.ts and src/b.ts` passed it,
 * because "and" is not path-shaped, and came back as one absurd path.
 */
export function wholeFileRef(text: string): FileRef | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > WHOLE_REF_MAX) return null;
  if (!trimmed.includes(' ')) return null;
  if (NOT_IN_A_PATH_RE.test(trimmed)) return null;

  const ref = parseRef(trimmed);
  if (!ref.path.includes('/')) return null;
  const base = ref.path.slice(ref.path.lastIndexOf('/') + 1);
  if (!base || !looksLikePath(base)) return null;
  const completeRefs = trimmed.split(/\s+/).filter(looksLikeCompleteRef).length;
  if (completeRefs > 1) return null;

  return ref;
}
