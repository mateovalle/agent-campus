// Dispatch roles: what makes a role real is a narrow charter plus a tool
// policy, not persona prompting or bundled knowledge. Charters stay ~150
// tokens; project knowledge lives in the workspace (CLAUDE.md, .claude/skills)
// and loads on demand — never injected per instantiation.
// Role ids match ROLE_SKIN_DEFS (constants.ts) so dispatched agents get skins.

export interface AgentRoleDef {
  id: string;
  /** Appended to the session's system prompt. Mission + first move + definition of done. */
  charter: string;
  /** Tools removed from the session entirely (SDK disallowedTools — enforced, not suggested). */
  disallowedTools?: readonly string[];
}

const SKILLS_FOOTER =
  ' If the workspace has skills or documented procedures for this work, follow them over improvising.';

const READ_ONLY_TOOLS = ['Edit', 'Write', 'NotebookEdit'] as const;

export const AGENT_ROLE_DEFS: Record<string, AgentRoleDef> = {
  qa: {
    id: 'qa',
    charter:
      'You are dispatched as the adversarial QA reviewer. File editing tools are disabled for ' +
      'this session by design: your deliverable is a verdict, not a fix. Read the relevant code ' +
      'or diff, run the test suite and typecheck, and paste real output as evidence. Done when ' +
      'you deliver either a findings list ordered by severity (each with file:line and a concrete ' +
      'failure scenario) or an explicit approval backed by passing checks. Record fixes worth ' +
      'doing with add_task instead of attempting them.' +
      SKILLS_FOOTER,
    disallowedTools: READ_ONLY_TOOLS,
  },
  security: {
    id: 'security',
    charter:
      'You are dispatched as the security reviewer. File editing tools are disabled for this ' +
      'session by design: your deliverable is an assessment, not a patch. Hunt for injection, ' +
      'authorization gaps, secrets in code, unsafe input handling, path traversal and risky ' +
      'dependencies in the code under review. Every finding needs a concrete attack scenario — ' +
      'no speculative hardening advice. Done when you deliver findings ordered by exploitability ' +
      'with file:line evidence, or an explicit sign-off. Record remediations with add_task.' +
      SKILLS_FOOTER,
    disallowedTools: READ_ONLY_TOOLS,
  },
  release: {
    id: 'release',
    charter:
      'You are dispatched as the release engineer. Before shipping anything, run the full ' +
      'build, tests and typecheck, and review pending migrations and version/changelog state. ' +
      'Prefer small, reversible steps, and paste command output as evidence at each gate. ' +
      'Done when the release action is completed and verified, with a short report of exactly ' +
      'what shipped and how it was checked.' +
      SKILLS_FOOTER,
  },
  debugger: {
    id: 'debugger',
    charter:
      'You are dispatched as the debugger. Reproduce first: change no code until the failure ' +
      'is reproducing in front of you. Then isolate the root cause, state it in one sentence, ' +
      'and make the smallest fix that addresses the cause rather than the symptom. Done when ' +
      'the reproduction passes, the relevant test suite passes, and your report names both the ' +
      'cause and the fix.' +
      SKILLS_FOOTER,
  },
  writer: {
    id: 'writer',
    charter:
      'You are dispatched as the tech writer. Your deliverable is documentation. Read the code ' +
      'you document — never describe behavior you have not verified in source. Match the ' +
      "repository's existing documentation structure and tone. Done when the docs are accurate " +
      'to the current code and free of aspirational or stale claims.' +
      SKILLS_FOOTER,
  },
  marketing: {
    id: 'marketing',
    charter:
      'You are dispatched as the marketing agent. Your deliverable is marketing material as ' +
      'files in the repo: plans, scripts, copy, calendars. Before writing a word, read the ' +
      "workspace's CLAUDE.md for brand voice, audience and constraints, and study neighboring " +
      'deliverables to match their format. Ground every claim in the product as it actually ' +
      'is — never invent features, metrics or testimonials. Done when the deliverable is in ' +
      'the repo, consistent with the brand guidelines, and actionable (concrete channel, ' +
      'date, or call to action — not aspirational fluff).' +
      SKILLS_FOOTER,
  },
  designer: {
    id: 'designer',
    charter:
      'You are dispatched as the designer. Focus on user-facing look and behavior: layout, ' +
      'spacing, interaction states, accessibility, and consistency with the existing design ' +
      'language. Verify visually when possible (run the app) rather than assuming from code. ' +
      'Done when the change is verified and consistent with neighboring UI.' +
      SKILLS_FOOTER,
  },
};

/** Role ids offered at dispatch time (create_agent, Board assign). */
export const DISPATCH_ROLE_IDS = Object.keys(AGENT_ROLE_DEFS);

// Task texts written by the assistant's planning procedure start with a role
// tag in brackets ("[qa] verify the ..."). Maps tag → dispatch role id;
// tags without a specialist role (build) intentionally map to no role.
const TASK_TAG_TO_ROLE: Record<string, string> = {
  review: 'qa',
  qa: 'qa',
  security: 'security',
  docs: 'writer',
  writer: 'writer',
  release: 'release',
  debug: 'debugger',
  debugger: 'debugger',
  design: 'designer',
  designer: 'designer',
  marketing: 'marketing',
  growth: 'marketing',
};

/** Extracts a leading "[tag]" from a task text and maps it to a dispatch role id. */
export function roleForTaskText(text: string): string | undefined {
  const match = /^\s*\[([a-z-]+)\]/i.exec(text);
  if (!match) return undefined;
  return TASK_TAG_TO_ROLE[match[1].toLowerCase()];
}

// Task subagent_type values are user-defined agent names ('code-reviewer',
// 'security-auditor', ...), so match by keyword. Returns a SKIN id (may be a
// skin-only role like eng-manager) — sub-agents get the look, not the charter,
// since their session is owned by the parent, not by us.
const SUBAGENT_TYPE_KEYWORDS: Array<[RegExp, string]> = [
  [/review|\bqa\b|test/, 'qa'],
  [/secur/, 'security'],
  [/debug/, 'debugger'],
  [/doc|writ/, 'writer'],
  [/design/, 'designer'],
  [/release|deploy/, 'release'],
  [/market|growth/, 'marketing'],
  [/plan|architect/, 'eng-manager'],
];

/** Maps a Task tool's subagent_type to a role skin id, if one fits. */
export function roleForSubagentType(subagentType: string): string | undefined {
  const normalized = subagentType.toLowerCase();
  for (const [pattern, role] of SUBAGENT_TYPE_KEYWORDS) {
    if (pattern.test(normalized)) return role;
  }
  return undefined;
}
