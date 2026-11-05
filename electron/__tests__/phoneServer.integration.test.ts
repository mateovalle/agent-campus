/**
 * The phone server against a real socket, because the thing worth proving is
 * what an UNAUTHENTICATED caller can get out of it, and that is a property of
 * the server, not of a pure function.
 *
 * Bound on an ephemeral port via the real start path; every request goes over
 * the loopback with fetch, the way a phone would.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { type PhoneServerHandle, startPhoneServer } from '../phoneServer.js';
import type { PhoneStatus } from '../phoneView.js';

const TOKEN = 'a'.repeat(32);
const STATUS: PhoneStatus = {
  generatedAt: 1_700_000_000_000,
  needsYou: [{ id: 3, name: 'fix-auth', office: 'repo', state: 'blocked', waitingForMs: 90_000 }],
  working: [],
  idleCount: 2,
};

let handle: PhoneServerHandle | null = null;
let statusCalls = 0;

afterEach(() => {
  handle?.close();
  handle = null;
  statusCalls = 0;
});

async function start(port = 0): Promise<PhoneServerHandle> {
  const h = await startPhoneServer({
    port,
    token: TOKEN,
    status: () => {
      statusCalls++;
      return STATUS;
    },
    onError: () => {
      /* reported to the host in production */
    },
  });
  if (!h) throw new Error('server did not start');
  handle = h;
  return h;
}

/** The port the OS actually gave us — `port: 0` means "anything free". */
async function base(): Promise<string> {
  const h = await start(0);
  return `http://127.0.0.1:${h.port}`;
}

describe('phone server', () => {
  it('serves the page and the status to a caller with the token', async () => {
    const url = await base();

    const page = await fetch(`${url}/?t=${TOKEN}`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('Agent Campus');

    const api = await fetch(`${url}/api/status?t=${TOKEN}`);
    expect(api.status).toBe(200);
    await expect(api.json()).resolves.toEqual(STATUS);
  });

  it('gives an unauthenticated caller nothing at all', async () => {
    const url = await base();
    for (const path of ['/', '/api/status', '/anything']) {
      const res = await fetch(`${url}${path}`);
      expect(res.status).toBe(401);
      // Not even the shape of the campus leaks: the token is checked BEFORE
      // the route, so a caller cannot learn which paths exist.
      expect(await res.text()).not.toContain('fix-auth');
    }
    const wrong = await fetch(`${url}/api/status?t=${'b'.repeat(32)}`);
    expect(wrong.status).toBe(401);
    // And the host was never asked to build a payload for any of them.
    expect(statusCalls).toBe(0);
  });

  it('refuses anything that is not a GET, even with the token', async () => {
    const url = await base();
    const res = await fetch(`${url}/api/status?t=${TOKEN}`, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(statusCalls).toBe(0);
  });

  it('survives a token crafted to crash it', async () => {
    // One unauthenticated GET used to kill the process that owns every PTY
    // and every SDK session: 31 ASCII characters plus one multi-byte one is
    // 32 characters and 33 bytes, which sailed past a character-length guard
    // and threw out of timingSafeEqual inside the request listener.
    const url = await base();
    const res = await fetch(`${url}/?t=${'a'.repeat(31)}%FF`);
    expect(res.status).toBe(401);
    // Still serving afterwards is the actual assertion.
    const after = await fetch(`${url}/api/status?t=${TOKEN}`);
    expect(after.status).toBe(200);
  });

  it('answers HEAD, since the resource is GET-able', async () => {
    const url = await base();
    const res = await fetch(`${url}/api/status?t=${TOKEN}`, { method: 'HEAD' });
    expect(res.status).toBe(200);
  });

  it('names GET and HEAD when it refuses a method', async () => {
    const url = await base();
    const res = await fetch(`${url}/?t=${TOKEN}`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
  });

  it('answers 500 rather than dying if building the status throws', async () => {
    // `status()` reads live agent state, which is the most likely place for
    // the next exception. The process surviving is the point.
    const h = await startPhoneServer({
      port: 0,
      token: TOKEN,
      status: () => {
        throw new Error('live state blew up');
      },
      onError: () => {
        /* reported to the host */
      },
    });
    if (!h) throw new Error('server did not start');
    handle = h;
    const res = await fetch(`http://127.0.0.1:${h.port}/api/status?t=${TOKEN}`);
    expect(res.status).toBe(500);
    const page = await fetch(`http://127.0.0.1:${h.port}/?t=${TOKEN}`);
    expect(page.status).toBe(200);
  });

  it('404s an unknown path rather than falling through to the page', async () => {
    const url = await base();
    const res = await fetch(`${url}/admin?t=${TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('answers null instead of throwing when the port is taken', async () => {
    // A busy port must not take down the process that owns every agent.
    const first = await start(0);
    const second = await startPhoneServer({
      port: first.port,
      token: TOKEN,
      status: () => STATUS,
      onError: () => {
        /* the host turns the setting back off */
      },
    });
    expect(second).toBeNull();
  });

  it('reports why it could not start', async () => {
    const first = await start(0);
    let reported = '';
    await startPhoneServer({
      port: first.port,
      token: TOKEN,
      status: () => STATUS,
      onError: (text) => {
        reported = text;
      },
    });
    expect(reported).toContain('already in use');
  });

  it('survives a client that hangs up mid-request', async () => {
    // The campus socket's hardest-won lesson: an unhandled socket error on a
    // server takes the whole main process with it, and a phone walking out of
    // wifi is exactly that.
    const url = await base();
    const controller = new AbortController();
    const pending = fetch(`${url}/api/status?t=${TOKEN}`, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();

    const after = await fetch(`${url}/api/status?t=${TOKEN}`);
    expect(after.status).toBe(200);
  });
});
