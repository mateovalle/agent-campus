import type { TextChunk } from './filePaths.js';
import { formatFileRef, splitFileRefs, wholeFileRef } from './filePaths.js';
import { useOpenFileRef } from './fileRefContext.js';

/**
 * Quiet on purpose: no colour, no permanent underline. Path detection is
 * optimistic — prose is full of things shaped like filenames — so a false
 * positive should be invisible until the pointer is actually over it.
 */
const refStyle: React.CSSProperties = {
  cursor: 'pointer',
  textDecoration: 'underline',
  textDecorationStyle: 'dotted',
  textDecorationColor: 'var(--pixel-border-light)',
  textUnderlineOffset: 2,
};

/**
 * Text with any file paths in it turned into click-to-open spans.
 *
 * Renders the input unchanged when it holds no paths, which is the common
 * case and costs one array check.
 *
 * `whole` marks text that came from a code span, where the whole string may
 * be ONE path — including the spaces a tokeniser would shred it on (see
 * `wholeFileRef`). It is a hint, not a promise: a span holding a command or a
 * list of files falls through to the usual per-token detection.
 */
export function FileRefText({ text, whole }: { text: string; whole?: boolean }) {
  const openRef = useOpenFileRef();
  const spanning = whole ? wholeFileRef(text) : null;
  const chunks: TextChunk[] = spanning ? [spanning] : splitFileRefs(text);
  if (chunks.length === 1 && typeof chunks[0] === 'string') return <>{text}</>;

  return (
    <>
      {chunks.map((chunk, i) =>
        typeof chunk === 'string' ? (
          chunk
        ) : (
          <span
            key={i}
            style={refStyle}
            title={`Open ${formatFileRef(chunk)}`}
            onClick={(e) => {
              e.stopPropagation();
              openRef(chunk);
            }}
          >
            {formatFileRef(chunk)}
          </span>
        ),
      )}
    </>
  );
}
