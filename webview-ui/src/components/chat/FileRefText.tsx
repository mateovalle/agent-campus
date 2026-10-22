import { formatFileRef, splitFileRefs } from './filePaths.js';
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
 */
export function FileRefText({ text }: { text: string }) {
  const openRef = useOpenFileRef();
  const chunks = splitFileRefs(text);
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
