import { describe, expect, it } from 'vitest';

import { isExternalUrl } from '../externalUrl.js';

describe('isExternalUrl', () => {
  it('accepts the links a chat message legitimately holds', () => {
    expect(isExternalUrl('https://claude.ai/artifact/abc')).toBe(true);
    expect(isExternalUrl('http://localhost:3000/health')).toBe(true);
    expect(isExternalUrl('mailto:someone@example.com')).toBe(true);
    expect(isExternalUrl('HTTPS://Example.COM/Path')).toBe(true);
    expect(isExternalUrl('  https://example.com  ')).toBe(true);
  });

  it('refuses anything shell.openExternal would run for real', () => {
    // Every one of these is typable by a model into a markdown link.
    expect(isExternalUrl('file:///Users/me/.ssh/id_rsa')).toBe(false);
    expect(isExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isExternalUrl('vscode://file/etc/passwd')).toBe(false);
    expect(isExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('refuses what is not a URL at all', () => {
    expect(isExternalUrl('')).toBe(false);
    expect(isExternalUrl('./docs/readme.md')).toBe(false);
    expect(isExternalUrl('example.com')).toBe(false);
  });
});
