/**
 * Which URLs may be handed to the operating system.
 *
 * The webview must never navigate — a link that navigates replaces the whole
 * app with the page — so a link an agent wrote is opened by the HOST instead.
 * That makes this a trust boundary: the URL text comes out of a model's
 * output, and `shell.openExternal` runs whatever protocol handler is
 * registered, so `file://`, `javascript:` and every editor's custom scheme
 * are launchable. Hence a whitelist of the three schemes a chat link can
 * legitimately mean.
 *
 * Lives here, once, because both ends check it: the webview to decide whether
 * a span is clickable at all, the host to decide whether to obey. Two copies
 * of this rule would be two chances to disagree.
 */
const EXTERNAL_URL_SCHEMES = ['http:', 'https:', 'mailto:'];

export function isExternalUrl(url: string): boolean {
  const trimmed = url.trim();
  // `new URL` is the parser that decides, not a prefix test: it is also what
  // the OS layer will see, and it normalises the tricks a prefix test misses
  // (leading whitespace, control characters, case).
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  return EXTERNAL_URL_SCHEMES.includes(parsed.protocol);
}
