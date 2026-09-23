import { describe, expect, it } from 'vitest';

import { parseAuthStatus } from '../claudeAuth.js';

const loggedIn = JSON.stringify({
  loggedIn: true,
  authMethod: 'claude.ai',
  email: 'someone@example.com',
  subscriptionType: 'max',
});

describe('parseAuthStatus', () => {
  it('reads a logged-in payload', () => {
    expect(parseAuthStatus(loggedIn)).toEqual({
      kind: 'ok',
      method: 'claude.ai',
      email: 'someone@example.com',
      plan: 'max',
    });
  });

  it('keeps the ok state when optional fields are missing', () => {
    expect(parseAuthStatus('{"loggedIn":true}')).toEqual({ kind: 'ok' });
  });

  it('reports logged out', () => {
    expect(parseAuthStatus('{"loggedIn":false}')).toEqual({ kind: 'logged-out' });
  });

  it('treats a missing loggedIn field as logged out, not as an error', () => {
    expect(parseAuthStatus('{"authMethod":"claude.ai"}')).toEqual({ kind: 'logged-out' });
  });

  it('ignores anything a login shell printed before the JSON', () => {
    const noisy = 'warning: something\n' + loggedIn + '\n';
    expect(parseAuthStatus(noisy).kind).toBe('ok');
  });

  it('is unavailable when the command produced no output', () => {
    const r = parseAuthStatus('', { message: 'spawn ENOENT' });
    expect(r).toEqual({ kind: 'unavailable', reason: 'spawn ENOENT' });
  });

  it('is unavailable when the output is not JSON at all', () => {
    const r = parseAuthStatus('claude: unknown command "auth"\n');
    expect(r.kind).toBe('unavailable');
    if (r.kind === 'unavailable') expect(r.reason).toContain('unknown command');
  });

  it('prefers the error message over the raw output when both exist', () => {
    const r = parseAuthStatus('garbage', { message: 'timed out' });
    expect(r).toEqual({ kind: 'unavailable', reason: 'timed out' });
  });

  it('does not treat a non-zero exit with a valid payload as unavailable', () => {
    expect(parseAuthStatus('{"loggedIn":false}', { message: 'exit 1' })).toEqual({
      kind: 'logged-out',
    });
  });
});
