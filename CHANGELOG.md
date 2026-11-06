# Changelog

Agent Campus is the desktop app. It began as a fork of
[pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents) (a VS Code extension);
this file covers the desktop releases only, which are versioned `0.x` independently of the
extension's `1.x`.

## Unreleased

Mostly the results of reading v0.4.0 back adversarially. Several of these are
things the app did wrong to your repository or your files, so they are listed
before the features.

### Fixed — things that could damage your work

- **Commit could commit the whole repository.** With an office one directory inside a repo (a
  monorepo app, say), every diff showed as empty, your own edits elsewhere in the repo were
  listed as the agent's, and `git add -A` staged all of it behind a button labelled with one
  agent's name.
- **Commit could finish a merge you were in the middle of**, writing the conflict markers into
  the file. It now refuses during a merge, rebase or cherry-pick, and names what to resolve.
- **Push could publish to the wrong remote.** If you push to a fork and keep `origin` as the
  shared repository, an agent's branch went to the shared one — and reset your branch's upstream
  so your own `git push` followed it.
- **"Undo to here" reverted the wrong turn.** On any turn that used a tool it rewound to the
  checkpoint *after* that turn's edits, so undoing an earlier prompt reverted the later work and
  kept the earlier.
- **A chatty pre-commit hook silently lost the commit**, showing two lines of its output as the
  error.

### Fixed — things that were not true

- **The spend chart skipped a day** around a daylight-saving change and filed turns under the
  wrong date for the following fortnight.
- **Diffs quietly dropped lines** beginning with `-- ` or `++ ` (SQL and Lua comments, signature
  delimiters) and mis-numbered every line after them.
- **New binary files reported invented line counts** — a PNG as "+14".
- **A prompt starting with `<`** (`<Button> renders twice`) vanished from a resumed conversation.
- **A fresh `git init` was reported as a detached HEAD**, and a removed worktree as "git is not
  installed".
- **Closing the window on Windows and Linux** could still kill the Assistant mid-turn, or a
  worktree's setup command.
- The slash-command palette and the rate-limit warning **never appeared at all** — both were
  wired to a host that emitted nothing.

### Features

- **Watch the campus from a phone** — an optional, read-only page on your local network listing
  who needs you, longest wait first. Off by default, and nothing can be approved or changed from
  it: approving a permission remotely needs an auth story the app does not have yet.
- **The Assistant can reach a running agent** — message it, interrupt it, or close a task,
  instead of starting a fresh session for every correction.

## v0.4.0 — 2026-11-04

The release that closes the loop: agents now **work in their own checkout**, you can **see what
they changed and ship it without leaving the app**, and the office stops guessing where Claude
Code already answers.

### See it and ship it

- **Per-agent git worktrees** — an opt-in private checkout per agent, so two agents in one repo
  stop overwriting each other, with a manager showing what a delete would cost (uncommitted work,
  unmerged commits, agents working there) and refusing to remove a checkout someone is in. An
  agent now carries two paths: where its session runs, and the office it belongs to.
- **A Changes panel** — every file an agent touched, with diffs, openable while it is still
  working ("what has it changed so far" is a fair question mid-turn).
- **Commit, push and open a PR** from that panel, with the message pre-filled from the agent's
  name.
- **Undo a prompt** — rewind the files a turn changed, with a preview that says exactly what will
  move ("3 files, +40 −12") before the button that writes to disk.
- **"Always allow"** on a permission card, labelled with how far the rule actually reaches — a
  session rule and a shared-settings rule are different promises.

### The office stops guessing

- **Real sub-agents**, from the SDK's own task stream rather than inferred from a tool call: each
  one says what it is working on and can be stopped on its own.
- **Turn ends are reported, not deduced** for chat agents, and terminal agents get a turn-end hook
  — the five-second-silence guess was indistinguishable from a model thinking.
- **Sub-agents were invisible.** Back-facing chairs sorted in front of whoever sat in them, and
  sub-agents (born at a seat, never walking anywhere) never escaped it.
- **Resumed conversations** are rebuilt through the SDK instead of our own read of the transcript,
  which had already drifted once when the CLI changed where it writes.

### Know what it costs, before it costs it

- **A context gauge** above the composer, and a **spending cap and effort level** for new agents —
  set where an agent is *sent out*, since an unattended scheduled run is where a runaway bill
  actually comes from.
- **Rate-limit awareness** — the app says when the account is running out of usage, and the
  scheduler holds work back instead of burning the window on unattended runs.
- **The usage ledger is folded** rather than growing forever, keeping every figure exact. Entries
  that predated per-turn costs are dropped (they read about ten times high), so "All time" now
  says what date it starts from.

### Composer

- **Slash commands** and **@-file mentions**, both in a popup that only opens where it cannot eat
  your Enter key.
- **Clickable file paths** — the paths an agent writes become links that open in your editor, at
  the line it named.
- **Turn navigation and tab rename** — jump between turns with ▲▼ or Alt+↑/↓; double-click a tab's
  label to rename an agent.

### It stays running, and it tells you about updates

- **Closing the window no longer kills your agents on Windows and Linux.** It used to quit the
  app outright — every session disposed mid-turn — which also made the scheduler and "Launch at
  Login" macOS-only in practice. The window now closes into a tray icon.
- **Update checks** — the app says when a newer release exists, in Settings and nowhere else.
- **Signing and notarization are configured** behind repository secrets, so the build is ready the
  day the certificates are.

### The Assistant

- **It can reach a running agent** — message it, interrupt it, or close a task off the Board,
  instead of spending a fresh session on every correction.
- **The campus socket** — a running session, or any script it spawns, can decorate its own
  character: `campus status "…"`, `campus progress 60%`, `campus notify "…"`. Chat agents get the
  same thing as `me` MCP tools.

### Bug Fixes

- **Unreachable achievements.** The "campus" milestone could never unlock: its event was handled
  and never fired. Terminal agents counted toward nothing at all.
- **Layout import failed in silence** and replaced your starter office without asking. Validation
  now rejects with a reason — it used to accept any file with a version field and an array.
- **Two lifecycle failures that looked like success**: an agent whose transcript never appeared
  sat at its desk forever, and a chat message the app couldn't parse left a busy character
  emitting nothing.
- **A dialog opened from a character sat *behind* that character's label** — every modal
  hardcoded its own stacking order.
- **Settings rows built as divs were clipped by the modal border**, 20px wider than the panel.
- **Performance**: the wall cache missed on every frame with more than one office on screen, and
  the usage ledger was re-read and re-parsed from disk on every single turn.
- **A worktree could be offered for removal, with force, while an agent worked in it** on Windows
  — short paths, junctions and letter case cannot be reconciled by path comparison alone.

### Under the hood

- CI runs on **macOS and Windows** as well as Linux, **packages on every PR**, and the lint gate
  can actually fail (three correctness rules had been downgraded to warnings).
- Tests: 231 → 427.

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
