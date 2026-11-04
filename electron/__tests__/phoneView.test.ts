import { describe, expect, it } from 'vitest';

import {
  buildPhoneStatus,
  lanAddress,
  newPhoneToken,
  type PhoneAgentInput,
  phoneUrl,
  tokenMatches,
} from '../phoneView.js';

const NOW = 1_700_000_000_000;
const agent = (over: Partial<PhoneAgentInput> = {}): PhoneAgentInput => ({
  id: 1,
  name: 'fix-auth',
  workspacePath: '/Users/x/repo',
  blocked: false,
  blockedForMs: 0,
  unread: false,
  busy: false,
  ...over,
});

describe('buildPhoneStatus', () => {
  it('sorts the blocked longest-wait first', () => {
    // The same rule the office uses for which bubble catches your eye: on a
    // phone the top row is the only one reliably read.
    const s = buildPhoneStatus(
      [
        agent({ id: 1, blocked: true, blockedForMs: 60_000 }),
        agent({ id: 2, blocked: true, blockedForMs: 900_000 }),
        agent({ id: 3, blocked: true, blockedForMs: 300_000 }),
      ],
      NOW,
    );
    expect(s.needsYou.map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it('puts every block above every unread turn', () => {
    // One is stuck, the other is merely finished.
    const s = buildPhoneStatus(
      [agent({ id: 1, unread: true }), agent({ id: 2, blocked: true, blockedForMs: 1_000 })],
      NOW,
    );
    expect(s.needsYou.map((a) => [a.id, a.state])).toEqual([
      [2, 'blocked'],
      [1, 'done'],
    ]);
  });

  it('separates working from idle, and counts the idle rather than listing them', () => {
    const s = buildPhoneStatus(
      [agent({ id: 1, busy: true }), agent({ id: 2 }), agent({ id: 3 })],
      NOW,
    );
    expect(s.working.map((a) => a.id)).toEqual([1]);
    expect(s.idleCount).toBe(2);
    expect(s.needsYou).toEqual([]);
  });

  it('shows the office folder, not the whole path', () => {
    const s = buildPhoneStatus([agent({ busy: true, workspacePath: '/a/b/my-repo' })], NOW);
    expect(s.working[0].office).toBe('my-repo');
  });

  it('prefers what an agent is blocked ON over what it was doing', () => {
    const s = buildPhoneStatus(
      [agent({ blocked: true, blockedForMs: 1, activity: 'Editing', requestTitle: 'Run: rm -rf' })],
      NOW,
    );
    expect(s.needsYou[0].detail).toBe('Run: rm -rf');
  });

  it('falls back to the activity when the request is unknown', () => {
    const s = buildPhoneStatus(
      [agent({ blocked: true, blockedForMs: 1, activity: 'Editing' })],
      NOW,
    );
    expect(s.needsYou[0].detail).toBe('Editing');
  });

  it('carries a worktree branch, and omits it otherwise', () => {
    const withBranch = buildPhoneStatus([agent({ busy: true, branch: 'agent/1' })], NOW);
    expect(withBranch.working[0].branch).toBe('agent/1');
    expect(buildPhoneStatus([agent({ busy: true })], NOW).working[0]).not.toHaveProperty('branch');
  });

  it('never reports a negative wait', () => {
    // Clock changes happen; "waiting -3m" is nonsense on a screen.
    const s = buildPhoneStatus([agent({ blocked: true, blockedForMs: -5000 })], NOW);
    expect(s.needsYou[0].waitingForMs).toBe(0);
  });

  it('answers empty lists for an empty campus', () => {
    expect(buildPhoneStatus([], NOW)).toEqual({
      generatedAt: NOW,
      needsYou: [],
      working: [],
      idleCount: 0,
    });
  });
});

describe('tokenMatches', () => {
  it('accepts the right token and refuses everything else', () => {
    expect(tokenMatches('abc123', 'abc123')).toBe(true);
    expect(tokenMatches('abc124', 'abc123')).toBe(false);
  });

  it('refuses a wrong-length token without throwing', () => {
    // timingSafeEqual THROWS on a length mismatch, which is why the length
    // check has to come first rather than being folded into it.
    expect(() => tokenMatches('short', 'abc123')).not.toThrow();
    expect(tokenMatches('short', 'abc123')).toBe(false);
  });

  it('measures length in BYTES, not characters', () => {
    // The bug this guards was remotely fatal: String.length counts UTF-16
    // code units, so these are all 32 "characters" against a 32-character
    // token and all reached timingSafeEqual, which threw inside an HTTP
    // request listener and killed the process that owns every agent.
    const expected = 'a'.repeat(32);
    for (const sneaky of [
      'a'.repeat(31) + '\u00e9', // 2 bytes
      'a'.repeat(31) + '\u20ac', // 3 bytes
      'a'.repeat(30) + '\u{1F4A9}', // 4 bytes, 2 code units
    ]) {
      expect(sneaky.length).toBe(32);
      expect(Buffer.byteLength(sneaky)).toBeGreaterThan(32);
      expect(() => tokenMatches(sneaky, expected)).not.toThrow();
      expect(tokenMatches(sneaky, expected)).toBe(false);
    }
  });

  it('still accepts a correct multi-byte token', () => {
    // The fix must not become "reject anything non-ASCII".
    expect(tokenMatches('caf\u00e9', 'caf\u00e9')).toBe(true);
  });

  it('refuses a missing token, and refuses everything when none is set', () => {
    expect(tokenMatches(null, 'abc123')).toBe(false);
    expect(tokenMatches(undefined, 'abc123')).toBe(false);
    expect(tokenMatches('', 'abc123')).toBe(false);
    // The dangerous case: an empty expected token must not make the door open.
    expect(tokenMatches('', '')).toBe(false);
    expect(tokenMatches('anything', '')).toBe(false);
  });
});

describe('newPhoneToken', () => {
  it('is long and not repeated', () => {
    const a = newPhoneToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(newPhoneToken());
  });
});

describe('lanAddress', () => {
  it('picks the first external IPv4', () => {
    expect(
      lanAddress({
        lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
        en0: [
          { address: 'fe80::1', family: 'IPv6', internal: false },
          { address: '192.168.1.42', family: 'IPv4', internal: false },
        ],
      }),
    ).toBe('192.168.1.42');
  });

  it('accepts the numeric family node also reports', () => {
    expect(lanAddress({ en0: [{ address: '10.0.0.5', family: 4, internal: false }] })).toBe(
      '10.0.0.5',
    );
  });

  it('skips a self-assigned 169.254 address', () => {
    // What an interface gets when DHCP FAILED. It is IPv4 and not internal,
    // so it passes the obvious test and yields an ordinary-looking URL that
    // reaches nothing.
    expect(
      lanAddress({
        en0: [{ address: '169.254.12.9', family: 'IPv4', internal: false }],
      }),
    ).toBeNull();
    expect(
      lanAddress({
        en0: [{ address: '169.254.12.9', family: 'IPv4', internal: false }],
        en1: [{ address: '192.168.0.7', family: 'IPv4', internal: false }],
      }),
    ).toBe('192.168.0.7');
  });

  it('answers null rather than offering a loopback a phone cannot reach', () => {
    expect(
      lanAddress({ lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] }),
    ).toBeNull();
    expect(lanAddress({})).toBeNull();
    expect(lanAddress({ en0: undefined })).toBeNull();
  });
});

describe('phoneUrl', () => {
  it('builds the link the user reads off the screen', () => {
    expect(
      phoneUrl(
        { en0: [{ address: '192.168.1.42', family: 'IPv4', internal: false }] },
        4517,
        'tok',
      ),
    ).toBe('http://192.168.1.42:4517/?t=tok');
  });

  it('is null when there is nowhere to serve', () => {
    expect(phoneUrl({}, 4517, 'tok')).toBeNull();
  });
});
