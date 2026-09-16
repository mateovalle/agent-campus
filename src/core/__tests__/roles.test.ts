import { describe, expect, it } from 'vitest';

import { ROLE_SKIN_DEFS } from '../constants.js';
import {
  AGENT_ROLE_DEFS,
  DISPATCH_ROLE_IDS,
  roleForSubagentType,
  roleForTaskText,
} from '../roles.js';

describe('role definitions', () => {
  it('every dispatch role has a matching skin', () => {
    const skinIds = new Set<string>(ROLE_SKIN_DEFS.map((r) => r.id));
    for (const id of DISPATCH_ROLE_IDS) {
      expect(skinIds.has(id)).toBe(true);
    }
  });

  it('read-only reviewers deny editing tools', () => {
    for (const id of ['qa', 'security']) {
      expect(AGENT_ROLE_DEFS[id].disallowedTools).toContain('Edit');
      expect(AGENT_ROLE_DEFS[id].disallowedTools).toContain('Write');
    }
  });
});

describe('roleForTaskText', () => {
  it('maps planning-procedure tags to dispatch roles', () => {
    expect(roleForTaskText('[qa] Verify the login flow')).toBe('qa');
    expect(roleForTaskText('  [Review] check the diff')).toBe('qa');
    expect(roleForTaskText('[security] audit the endpoint')).toBe('security');
    expect(roleForTaskText('[docs] update the README')).toBe('writer');
    expect(roleForTaskText('[release] ship v1.2')).toBe('release');
    expect(roleForTaskText('[marketing] plan de contenido de octubre')).toBe('marketing');
    expect(roleForTaskText('[growth] campaña de lanzamiento')).toBe('marketing');
  });

  it('leaves build and untagged tasks without a role', () => {
    expect(roleForTaskText('[build] add the endpoint')).toBeUndefined();
    expect(roleForTaskText('add the endpoint')).toBeUndefined();
    expect(roleForTaskText('use [brackets] mid-text')).toBeUndefined();
  });
});

describe('roleForSubagentType', () => {
  it('maps common agent type names to skins by keyword', () => {
    expect(roleForSubagentType('code-reviewer')).toBe('qa');
    expect(roleForSubagentType('security-auditor')).toBe('security');
    expect(roleForSubagentType('Plan')).toBe('eng-manager');
    expect(roleForSubagentType('doc-writer')).toBe('writer');
    expect(roleForSubagentType('growth-hacker')).toBe('marketing');
  });

  it('returns undefined for generic types', () => {
    expect(roleForSubagentType('general-purpose')).toBeUndefined();
    expect(roleForSubagentType('Explore')).toBeUndefined();
  });
});
