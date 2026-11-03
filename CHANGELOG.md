# Changelog

Agent Campus is the desktop app. It began as a fork of
[pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents) (a VS Code extension);
this file covers the desktop releases only, which are versioned `0.x` independently of the
extension's `1.x`.

## Unreleased

### Features

- **Per-agent git worktrees** — an opt-in private checkout per agent, so two agents in one repo
  stop overwriting each other, with a manager that shows what a delete would cost (uncommitted
  work, unmerged commits, agents working there) and refuses to remove a checkout someone is in.
  An agent now carries two paths: where its session runs, and the office it belongs to.
- **The campus socket** — a running session, or any script it spawns, can decorate its own
  character: `campus status "…"`, `campus progress 60%`, `campus notify "…"`. Chat agents get the
  same thing as `me` MCP tools.
- **Clickable file paths in chat** — the paths an agent writes become links that open in your
  editor, at the line it named.
- **Turn navigation and tab rename** — jump between turns with the ▲▼ arrows or Alt+↑/↓, anchored
  on your own messages; double-click a tab's label to rename an agent.

### Bug Fixes

- **Sub-agents were invisible.** Two causes, one symptom: back-facing chairs sorted in front of
  whoever sat in them, and sub-agents (born at a seat, never walking anywhere) never escaped it —
  plus CLI 2.1.x stopped forwarding sub-agent activity into the parent transcript, so they waited
  forever for a signal that no longer comes.
- **Unreachable achievements.** The "campus" milestone could never unlock: its event was handled
  and never fired. Terminal agents counted toward nothing at all.
- **Layout import failed in silence** and replaced your starter office without asking. Layout
  validation now rejects with a reason — it used to accept any file with a version field and an
  array.
- **Two lifecycle failures that looked like success**: an agent whose transcript never appeared sat
  at its desk forever, and a chat message the app couldn't parse left a busy character emitting
  nothing.
- **Performance**: the wall cache missed on every frame with more than one office on screen, and
  the usage ledger was re-read and re-parsed from disk on every single turn.

## v0.3.0 — 2026-10-01

### Features

- **A campus that moves** — 46 animated furniture pieces (steam, blinking servers, swimming fish),
  idle agents that wander off to use them, 19 floor patterns and 7 wall styles.
- **Ready-made rooms** — stamp a café, game room, hardware lab, server room, library, garden or
  capybara onsen into any office.
- **Six themed furniture batches** — the catalog goes from 122 to 276 entries, with a searchable
  grid palette instead of one long row.
- **It tells you when an agent needs you** — a Dock badge counting everyone waiting, and a desktop
  notification for an agent blocked two minutes or a turn that finished while you were away.
- **Session restore** — the agents you had open are offered back on the next launch, never
  relaunched behind your back.
- **Per-session model picker**, asked from the running CLI so new models appear without an app
  release.
- **Predicted next prompt** offered in the composer, and richer activity on each character.
- **A demo for first-time visitors** — logged out, the office fills with pretend agents so you can
  watch it move.

### Bug Fixes

- The usage ledger summed a running total, inflating spend quadratically.
- Export Layout worked again, and the single-office layout file was buried for good.
- One-tile wall decorations hung on the wall instead of at its foot; a wall's edge is outlined
  where it meets a shorter style.
- The agent overlay no longer covers the bubble it is reporting on; the office popup stays on
  screen when opened low.
- The sub-agent tool is called Agent now, not Task.

## v0.2.0 — 2026-09-17

### Features

- **Functional dispatch roles** — a role is a charter plus a tool policy, not just a costume (qa
  and security are read-only reviewers), applied at agent creation.
- **Campus Board** — a campus-wide kanban: Backlog, In Progress, Needs You, Done.
- **Scheduler** — recurring agent dispatch (daily, weekly, or every N minutes), with a
  pick-and-run prompt for runs missed while the app was closed.
- **Rich chat tabs** — resumed history, inline interactive questions, grouped tool cards.
- **End-of-turn action suggestions** — Review / Test / Commit / Investigate buttons derived from
  what the turn actually did.
- **Furniture rotation** — real quarter turns rather than mirrors, eventually for every
  non-symmetric piece; plus the office essentials the set was missing and the campus exterior.
- **Reward furniture** — five pieces you have to earn.
- **Role skins**, a **floating pixel-icon toolbar**, a **marketing role** and a non-code marketing
  workspace template.
- A skill for driving the app headlessly.

### Bug Fixes

- The bundled default office was empty for every new workspace.
- A blanket `.claude/` ignore silently dropped the template skills from the package.

## v0.1.2 — 2026-07-31

### Features

- Promo landing page on GitHub Pages (`/docs`).

### Bug Fixes

- Chat agents died silently in the packaged app.
- Furniture sprites are bottom-anchored; wall items can be placed on the wall's upper visual half.
