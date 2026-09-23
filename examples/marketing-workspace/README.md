# Marketing workspace template

A non-code workspace for Agent Campus: a marketing "office" where agents write
plans, scripts and copy as files. Copy this folder somewhere (e.g.
`~/company/marketing`), fill in `CLAUDE.md`, and add it as a workspace in the
campus (+ Workspace).

How it works:

- **`CLAUDE.md`** is the onboarding brief every agent session loads
  automatically. Fill in the placeholders — it should read like a 30-second
  briefing for a contractor, not a company wiki. Every line should change what
  the agent does; delete anything that doesn't.
- **`.claude/skills/`** holds your recurring procedures (video script format,
  monthly plan structure). Agents load a skill only when the task matches it,
  so they cost nothing until needed. Edit them to match how YOU actually work —
  a skill encodes a decision, not a vibe.
- **Deliverables are files** — `plans/`, `scripts/`, `copy/`. Keep the folder
  in git so drafts are reviewable and diffs are visible.
- Tasks tagged `[marketing]` on the Board dispatch agents with the marketing
  role: brand-brief-first, no invented claims, deliverables in the repo.
