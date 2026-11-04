/**
 * The HTTP server behind the phone view. See phoneView.ts for what it serves
 * and why it is read-only.
 *
 * Two routes and nothing else: the page, and the JSON it polls. There is no
 * route that changes anything, which is the point — a bug in a read-only
 * server costs a leak, a bug in a writing one costs an agent doing something
 * nobody asked for.
 *
 * It binds on all interfaces because the whole feature is reaching it from
 * another device, and that is exactly why it is off by default and why every
 * request is checked against the token before anything is rendered.
 */

import * as http from 'http';

import { PHONE_VIEW_POLL_MS } from '../src/core/constants.js';
import { type PhoneStatus, tokenMatches } from './phoneView.js';

export interface PhoneServerHandle {
  /**
   * The port actually bound, which is not always the one asked for: port 0
   * means "anything free", and reporting the request back would hand out a
   * URL pointing at port 0.
   */
  port: number;
  close(): void;
}

export interface PhoneServerOptions {
  port: number;
  token: string;
  /** Called per request; the host builds the answer from live state. */
  status(): PhoneStatus;
  /** Reported rather than thrown: a busy port must not take the app down. */
  onError(message: string): void;
}

/**
 * The page, inline.
 *
 * No build step and no assets: a second bundle for a page of three lists
 * would be its own maintenance problem, and a phone on a flaky connection
 * should get one request, not a waterfall. The styling is deliberately plain
 * — the office's pixel font lives in the webview bundle, and shipping a woff
 * over the LAN to save a serif is not a trade worth making.
 */
export function renderPhonePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Agent Campus</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; padding:16px; background:#1e1e2e; color:#e6e6f0;
         font:16px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; }
  h1 { font-size:15px; letter-spacing:.08em; text-transform:uppercase;
       color:#8a8aa0; margin:0 0 12px; font-weight:400; }
  h2 { font-size:13px; letter-spacing:.08em; text-transform:uppercase;
       color:#8a8aa0; margin:22px 0 8px; font-weight:400; }
  .card { border:2px solid #3a3a52; background:#252539; padding:10px 12px;
          margin-bottom:8px; box-shadow:2px 2px 0 #0a0a14; }
  .card.blocked { border-color:#d98a3a; }
  .card.urgent  { border-color:#d9503a; }
  .card.done    { border-color:#5aa85a; }
  .name { font-weight:600; }
  .where { color:#8a8aa0; font-size:14px; }
  .detail { color:#b8b8cc; font-size:14px; margin-top:4px;
            overflow-wrap:anywhere; }
  .wait { float:right; color:#d98a3a; font-size:14px; }
  .urgent .wait { color:#d9503a; }
  .quiet { color:#6a6a80; }
  footer { margin-top:24px; color:#6a6a80; font-size:13px; }
</style>
</head>
<body>
<h1>Agent Campus</h1>
<div id="app"><p class="quiet">Loading…</p></div>
<footer id="foot"></footer>
<script>
const token = new URLSearchParams(location.search).get('t') || '';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const age = (ms) => {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
};
function card(a) {
  const urgent = a.waitingForMs >= 300000;
  const cls = a.state === 'blocked' ? (urgent ? 'card blocked urgent' : 'card blocked')
            : a.state === 'done' ? 'card done' : 'card';
  const wait = a.waitingForMs != null ? '<span class="wait">' + esc(age(a.waitingForMs)) + '</span>' : '';
  const where = esc(a.office) + (a.branch ? ' · ' + esc(a.branch) : '');
  return '<div class="' + cls + '">' + wait +
    '<div class="name">' + esc(a.name) + '</div>' +
    '<div class="where">' + where + '</div>' +
    (a.detail ? '<div class="detail">' + esc(a.detail) + '</div>' : '') +
    '</div>';
}
function render(s) {
  let h = '';
  h += '<h2>Needs you</h2>';
  h += s.needsYou.length ? s.needsYou.map(card).join('')
     : '<p class="quiet">Nobody is waiting on you.</p>';
  if (s.working.length) h += '<h2>Working</h2>' + s.working.map(card).join('');
  if (s.idleCount) h += '<h2>Idle</h2><p class="quiet">' + s.idleCount + ' agent' +
    (s.idleCount === 1 ? '' : 's') + ' with nothing to do.</p>';
  document.getElementById('app').innerHTML = h;
  document.getElementById('foot').textContent =
    'Read-only. Updated ' + new Date(s.generatedAt).toLocaleTimeString();
}
async function tick() {
  try {
    const r = await fetch('/api/status?t=' + encodeURIComponent(token), { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    render(await r.json());
  } catch {
    document.getElementById('foot').textContent = 'Lost contact with the campus.';
  }
}
tick();
setInterval(tick, ${PHONE_VIEW_POLL_MS});
</script>
</body>
</html>`;
}

/** Starts the server, or resolves null when the port could not be taken. */
export function startPhoneServer(options: PhoneServerOptions): Promise<PhoneServerHandle | null> {
  const page = renderPhonePage();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // The token is checked before the route, so an unauthenticated caller
    // cannot even learn which paths exist.
    if (!tokenMatches(url.searchParams.get('t'), options.token)) {
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Unauthorized');
      return;
    }
    // GET only: there is nothing here to POST to, and saying so is clearer
    // than a 404 that suggests the route might exist by another name.
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET' });
      res.end();
      return;
    }
    if (url.pathname === '/api/status') {
      const body = JSON.stringify(options.status());
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(body);
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        // The page talks only to its own origin and embeds nothing.
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; " +
          "script-src 'unsafe-inline'; connect-src 'self'",
        'Referrer-Policy': 'no-referrer',
      });
      res.end(page);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  // A socket reset by a phone that walked out of wifi emits 'error' on the
  // server; unhandled, that takes down the process that owns every agent.
  server.on('clientError', (_err, socket) => socket.destroy());

  return new Promise((resolve) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      options.onError(
        err.code === 'EADDRINUSE'
          ? `Port ${options.port} is already in use, so the phone view is off.`
          : `The phone view could not start: ${err.message}`,
      );
      resolve(null);
    });
    server.listen(options.port, '0.0.0.0', () => {
      const address = server.address();
      resolve({
        port: typeof address === 'object' && address ? address.port : options.port,
        close: () => server.close(),
      });
    });
  });
}
