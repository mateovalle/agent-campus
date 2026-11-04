# Agent Campus — Compressed Reference

Electron desktop app: a pixel-art campus where AI agents (Claude Code sessions) are animated
characters. Every project is an office; agents are characters you watch work and dispatch.

Single target. This was once a dual-target repo that also built a VS Code extension out of
`src/`; that target was deleted in `55ede0a` for falling ~2 months behind. What survives is
`src/core/` (host-agnostic backend) and `shared/protocol.ts` (the message contract) — still
split that way because the split is good structure, not because a second host is coming. The
upstream project it was forked from still ships an extension.

## Architecture

```
shared/
  protocol.ts                 — THE message protocol: HostToWebviewMessage / WebviewToHostMessage
                                discriminated unions + shared data shapes (SpriteData, FurnitureAsset,
                                AgentSeatMeta). Types-only; imported by src/, electron/, webview-ui/.

src/core/                     — Host-agnostic backend core (no vscode/electron imports)
  types.ts                    — CoreAgentState, TrackerContext (agents+watchers+timers+send()), Send
  constants.ts                — Shared timing/truncation/PNG/layout constants
  transcriptParser.ts         — JSONL parsing: tool_use/tool_result → send() messages; idle detection;
                                per-turn TurnStats tally → agentSuggestions on turn_duration
  actionSuggestions.ts        — End-of-turn heuristics: TurnStats (edits/errors/ranTests) →
                                AgentActionSuggestion[] (Review/Test/Commit/Investigate buttons)
  roles.ts                    — Dispatch roles: charter (~150-token systemPrompt append) + tool policy
                                (SDK disallowedTools; qa/security are read-only) per role id; ids match
                                ROLE_SKIN_DEFS. roleForTaskText ("[qa] ..." tag → role) and
                                roleForSubagentType (Task subagent_type keyword → skin id). NO bundled
                                knowledge by design — project knowledge stays in workspace
                                CLAUDE.md/.claude/skills and loads on demand
  timerManager.ts             — Waiting/permission timer logic
  fileWatcher.ts              — startFileWatching/stopFileWatching/readNewLines (fs.watch + watchFile +
                                poll, byte-level UTF-8-safe line carry, truncation reset, error handlers)
  assetLoader.ts              — PNG parsing, sprite conversion, asset/layout loading, sendX(send, ...) helpers
  layoutPersistence.ts        — Layout VALIDATION, the check every path that takes a layout from
                                outside has to make (import dialog, starter-office file, layouts-dir
                                watcher). parseLayout() is a zod schema plus the consistency the
                                shape can't express — tiles.length === cols*rows, one tileColor per
                                tile — and it answers with a REASON, because a boolean left the
                                import dialog with nothing to say but `return`. Deliberately loose
                                where the data is open-ended: unknown fields pass through (saving
                                back must not delete what a newer version wrote), furniture `row`
                                may be NEGATIVE (wall decorations hang above the grid) and a
                                tileColor may be null (untinted). isValidLayout() survives as the
                                type-guard wrapper for callers with nowhere to show a reason. It
                                used to own the VS Code host's single ~/.pixel-agents/layout.json
                                (atomic write + cross-window watcher); the campus replaced that
                                with one file per workspace, owned by electron/main.ts

electron/                     — Electron desktop host (imports src/core; tsconfig rootDir=.. →
                                dist-electron/electron/main.js + dist-electron/src/core/)
  main.ts                     — Main process: window, node-pty terminals (main constructs ALL commands;
                                renderer only sends keystrokes). INTERNAL SESSIONS ONLY: agents exist solely
                                for sessions the app spawned (no scanning of external sessions). TWO AGENT
                                KINDS: 'terminal' (PTY running claude, xterm tab) and 'chat' (Agent SDK
                                session, rich chat tab — the default for "+ Agent"). Both kinds register a
                                transcript watcher via a caller-supplied sessionId, so office characters
                                animate identically for both. /clear detection scans each agent's project
                                dir; a new JSONL is reassigned to the agent there whose PTY/composer most
                                recently received input. Scrollback replay (pty-ready→pty-replay),
                                seat/palette persistence keyed by SESSION id, settings, folder picker on
                                agent creation, login-shell PATH fix, sandbox+navigation guards.
                                Per-workspace layout files (~/.pixel-agents/layouts/) are sent on
                                webviewReady AND hot-reloaded via a layouts-dir watcher (debounced,
                                own-write suppression) — external edits apply without restart
  openInEditor.ts             — Clicking a file an agent mentioned. Agents write RELATIVE paths
                                ("electron/main.ts"), which only mean something against that
                                agent's cwd — for a worktree agent its checkout, not the repo — and
                                LINE numbers ("main.ts:412"), which the default application for a
                                .ts file cannot accept. So: resolveRefPath() against the agent's
                                cwd, then an editor CLI (cursor/code/windsurf/zed/subl, first on
                                PATH) when there is a line to jump to, else shell.openPath. A file
                                that isn't there becomes a hostNotice naming the resolved path
                                rather than a silent no-op. All pure except the spawn
  campusServer.ts / campusCli.ts / campusShim.ts
                              — THE CAMPUS SOCKET: the one channel that flows agent → office.
                                Everything else here deduces a character's state from a transcript;
                                this lets a running session (or any script it spawns — a build, a
                                git hook) decorate ITSELF: `campus status "<text>"`,
                                `campus progress 60%`, `campus notify "<text>"`, `campus ping`.
                                Transport is HTTP/1.1 over a unix socket (named pipe on Windows),
                                one request per connection — HTTP so node's parser owns framing and
                                limits, and so `curl --unix-socket` stays a viable client. The
                                `campus idle` says "my turn is over" and is what the app's own
                                Stop HOOK calls for terminal agents (electron/hookSettings.ts):
                                a PTY agent otherwise has no authoritative turn signal at all, only
                                the five-second silence guess, and the campus socket otherwise had
                                no adoption path there — nothing ever put it in front of a terminal
                                agent. The settings go in a FILE passed as `--settings <path>`, not
                                inline JSON: the PTY command is a shell string, and a malformed
                                --settings value is read as a path, so the failure would be silent.
                                Safe to install unasked because `--settings` is ADDITIVE and hook
                                entries MERGE across settings levels — a user's own Stop hook keeps
                                running. The guess STAYS for terminal agents (unlike chat agents,
                                where it is removed): a hook can fail to reach us, so it is an
                                accelerator, not a replacement.
                                socket lives in os.tmpdir(), NOT ~/.pixel-agents: the path is capped
                                at 104 bytes on macOS and a deep home blows it, failing mutely
                                (the test harness's own HOME does). A home-path hash keeps dev,
                                packaged and test instances apart. CLI delivery needs no node and no
                                packaging change: the shim execs our own Electron with
                                ELECTRON_RUN_AS_NODE=1 on campusCli.js, COPIED OUT of the asar with
                                its one local dependency (CLI_RUNTIME_FILES — copying only the entry
                                point installs cleanly and dies with MODULE_NOT_FOUND on first use).
                                Shims are rewritten every launch, which is the whole self-healing
                                story for a moved or upgraded app. TRUST: a per-agent token keyed by
                                SESSION (not the numeric agent id, which changes across restart,
                                restore and resume) — it prevents ACCIDENTS, not attackers, and is a
                                same-user boundary, not a security feature
  git.ts                      — What an agent CHANGED: `changedFiles(cwd)` (status --porcelain=v1
                                -z -uall merged with diff --numstat -z HEAD), `fileDiff()` and
                                `currentBranch()`. Read-only, every call timed out like worktrees.ts.
                                The parsers are exported and unit-tested because git's porcelain is
                                fiddly exactly where it matters: a rename is TWO NUL fields (the
                                record carries the new name, the old one follows — split-and-map
                                invents a phantom file), numstat empties the path for a rename and
                                follows with both names, a binary file reports its counts as dashes,
                                and an untracked file has no HEAD to be diffed against (counted by
                                reading it, capped at UNTRACKED_COUNT_MAX_BYTES; its patch comes
                                from `diff --no-index`, which signals "they differ" by EXITING 1, so
                                the output has to be read off the thrown error).
                                The three WRITES — commitAll (`add -A` then commit), pushBranch
                                (`push -u origin`) and createPullRequest (`gh pr create --fill`,
                                so no second form) — are ASYNC, unlike every read: a commit runs
                                the project's own pre-commit hooks and the other two are network
                                calls, and synchronously any of them would freeze every PTY and
                                chat session for their whole duration. They run with
                                GIT_TERMINAL_PROMPT=0 and GIT_ASKPASS/SSH_ASKPASS neutered, because
                                a credential or passphrase prompt has no terminal to appear on here
                                and would simply wait out the timeout. pushBranch checks for an
                                `origin` remote FIRST: without one git treats 'origin' as a URL and
                                answers "make sure you have the correct access rights", sending the
                                user after a permissions problem they do not have
  worktrees.ts                — Git worktrees: a private checkout per agent (opt-in), so two agents
                                in one repo stop overwriting each other. Checkouts live in
                                ~/.pixel-agents/worktrees/<repo>-<hash>/<branch> (never beside the
                                repo, where the project's own tooling would find them). Pure,
                                tested helpers: normalizeBranchName (typed words → a ref git
                                accepts), nextFreeBranch (agent/1, agent/2…), repoWorktreeDir /
                                freeWorktreePath, parseWorktreeList. gitRepoRoot() answers the MAIN
                                repo via --git-common-dir, so a worktree resolves to the repo that
                                owns it, not itself. NOTHING here deletes a worktree on its own —
                                it holds unmerged work; removal is always asked for.
                                summarizeWorktrees() adds what a removal decision needs: dirty
                                (uncommitted), ahead (commits the repo's branch lacks) and isMain;
                                main.ts fills agentIds by matching each agent's cwd. The policy
                                itself is the pure, tested worktreeRemovalBlocker().
                                samePath() answers "the same directory" via fs.realpathSync.native
                                (falling back to a resolved, case-folded compare for a path that is
                                gone): path.resolve cannot reconcile a Windows 8.3 name, a junction,
                                a symlink or letter case, and that comparison is what decides
                                whether a checkout has agents in it — a false negative offers
                                Remove, with force, while someone is working there. Every git call
                                here carries GIT_COMMAND_TIMEOUT_MS: execFileSync blocks the EVENT
                                LOOP of the process that owns every PTY, so a locked index or a
                                network mount would otherwise freeze the whole app with no timer
                                able to rescue it (the same property that once hung CI unkillably)
  workspaces.ts / todos.ts / usage.ts — persisted registries (~/.pixel-agents/): offices, per-workspace
                                task lists, per-turn cost ledger (per-turn DELTAS derived from the
                                SDK's cumulative total_cost_usd — summing that field raw inflates
                                spend quadratically; figures are API-list estimates, not plan spend).
                                The ledger is parsed ONCE and kept in memory, with the aggregation
                                split out as the pure `summarizeEntries(list, now)` (tested): it was
                                re-reading and re-parsing the whole append-only file on every turn of
                                every agent, synchronously, on the process that owns every PTY — so
                                finishing a turn cost the user's entire history. Appends still go
                                straight to disk; this module is the only writer
  (session index)             — The resume picker reads the CLI's OWN index via `listSessions`,
                                not a readdir of the project-hash directory plus a hand-rolled
                                parse of each transcript's first user message. Its `summary` is
                                the custom title, else the generated one, else the first prompt —
                                strictly more than we could read — and it knows about git
                                worktrees, which the hash-directory walk did not. `applyAgentName`
                                calls `renameSession` so a rename reaches that index too; without
                                it the picker would keep offering a renamed session under its
                                first prompt. Both are module-level SDK functions, so they need no
                                live query.
  openAgents.ts               — Which agents were open, so a restart can offer them back
                                (~/.pixel-agents/open-agents.json). Written on every open and close,
                                not at quit, so a crash can't lose the list and every platform behaves
                                alike. Pure `restorableAgents()` (tested) drops malformed, duplicate,
                                already-live and transcript-less records → `restorableAgents` message
                                → RestoreAgentsModal (pre-ticked checkboxes) → `restoreAgents`
                                relaunches picks (`claude --resume` / launchChatAgent resume) and
                                forgets the whole offer, so a declined agent is never re-offered.
                                Asks rather than auto-restoring: each one is a real session spawning
  officeTemplate.ts           — The STARTER office (~/.pixel-agents/office-template.json): the
                                layout a workspace's office is born with when it has no design of
                                its own. Absent by default → the bundled default-layout.json.
                                Written only on purpose: Settings' "Use This Office For New
                                Workspaces", an import, or editing the detached (workspace-less)
                                office; "Reset Starter Office" deletes it. The VS Code host's old single
                                ~/.pixel-agents/layout.json is now fully dead — nothing reads,
                                writes or watches it
  claudeAuth.ts               — First-run gate: `claude auth status --json` on the RESOLVED bundled
                                executable (not ~/.claude — on macOS the credentials live in the
                                login Keychain, so a file probe reports "logged out" on every Mac).
                                Pure `parseAuthStatus()` (unit-tested) → ClaudeAuthState
                                ok | logged-out | unavailable → `claudeAuth` message → WelcomeModal.
                                `recheckClaudeAuth` re-probes; `startClaudeLogin` opens a PTY tab
                                running `<bundled claude> auth login`, so signing in works even
                                with no CLI installed. Probed in the background on webviewReady
  achievements.ts             — 16 milestone defs + counters in ~/.pixel-agents/achievements.json.
                                recordAchievementEvent(event, detail) bumps counters and returns
                                what that unlocked (→ achievementUnlocked); listAchievements() feeds
                                achievementsLoaded. The decision is the pure newlyUnlocked(counters,
                                unlocked, now) — unit-tested; counters from older files are widened
                                by emptyCounters() so a missing field can't crash a .push. Events:
                                agentSpawned (detail.role feeds 'full-team'), taskAssigned,
                                taskCompleted, agentTaskCompleted, turnCompleted (also counts
                                turns finished before 5am → 'night-shift'), workspaceAdded,
                                scheduleRan. Some milestones unlock furniture (see Reward furniture)
  schedules.ts                — Recurring agent dispatch: ~/.pixel-agents/schedules.json entries
                                (daily/weekly at HH:MM, or interval everyMinutes) + pure isDue()
                                (lastRunAtMs guards double-fires across ticks/restarts). Main ticks
                                every 30s → due entries launchChatAgent(workspace, prompt, role);
                                skips a schedule whose previous agent is still busy. Managed via
                                Assistant MCP tools (list/add/remove_schedule) + Settings list
                                (toggle/delete). Runs with the window closed on macOS (app stays
                                alive); "Launch at Login" checkbox → app.setLoginItemSettings.
                                MISSED RUNS: on webviewReady, missedOccurrences() (pure, tested)
                                counts daily/weekly occurrences skipped while the app was CLOSED
                                (anchor = lastRunAtMs ?? createdAtMs, 7-day lookback; intervals
                                self-catch-up) → missedSchedules message → MissedRunsModal
                                (pick-and-run checkboxes) → resolveMissedSchedules dispatches
                                picks and stamps ALL offered ids handled (skip = don't re-offer)
  attention.ts                — Which agents need you: a pure tracker fed by EVERY host→webview message
                                (main.ts taps ctx.send) — blocked = agentToolPermission until
                                Clear/ToolStart/status, or open chat-permission-request ids; unread =
                                agentStatus 'waiting' until focusAgent. Drives app.setBadgeCount (agents
                                that need you) and native Notifications: a block lasting
                                BLOCKED_NOTIFY_AFTER_MS (2 min, checked every 10s, only while the window
                                is NOT focused — focused, the ageing bubble is the signal), or a turn
                                that finishes in the background. Click → window up + agentSelected
                                (webview selects, follows, acknowledges) + tab focus. "Desktop
                                Notifications" toggle in Settings (settings.json notificationsEnabled)
  contextUsage.ts             — How full a context window is, derived. `getContextUsage` answers
                                with CATEGORIES, not a percentage, and the `kind` is the whole
                                trick: 'used' occupies the window, 'free' is what is left,
                                'buffer' is the compaction reserve (spoken for, so not free) and
                                'deferred' rows are tool schemas held OUT of the window — counting
                                those would inflate both halves of the fraction. Pure and tested;
                                answers null when there is no window yet, because a gauge at 0%
                                claims to know something it does not
  chatAgent.ts                — Agent SDK chat sessions: query() with a streaming input queue (dynamic
                                ESM import from CJS), reduces SDKMessage stream → ChatEvent protocol
                                (a message shape it cannot handle is logged, reported ONCE as a
                                `kind: 'error'` event, and then skipped: the loop must keep draining,
                                but swallowed in silence this left a busy character emitting nothing
                                into a live chat tab — invisible without devtools),
                                canUseTool → chat-permission-request/-response promise bridge, capped
                                history buffer replayed on chatReady (seedable via initialHistory for
                                resume), interrupt, dispose
  transcriptHistory.ts        — loadTranscriptHistory(): rebuilds ChatEvent[] from a session's JSONL
                                tail (2MB cap) so RESUMED chat tabs show the previous conversation
                                (chat analog of PTY scrollback replay); skips sidechain/meta/synthetic
                                records; exports isSyntheticUserText. main.ts focusChatTab() re-sends
                                chat-created (renderer dedupes by key) before chat-focus, so clicking
                                a character always recovers a lost chat tab
  preload.ts                  — Minimal contextBridge: postMessage/onMessage + ptyInput/Resize/Kill/Ready

webview-ui/src/               — React + TypeScript (Vite)
  vscodeApi.ts                — Electron IPC bridge (typed by protocol). Name is historical
  components/TerminalPanel.tsx / TerminalInstance.tsx / TerminalTabs.tsx / TerminalSplitter.tsx
                              — Bottom panel: mixed terminal (xterm.js) + chat tabs
                                (hidden-not-unmounted, replay-gated output)
  office/engine/campusState.ts — CAMPUS: one OfficeState per workspace at grid origins;
                                per-office layouts (default + overrides); routeOffice() /
                                recomputeOrigins() / adoptLayoutFromActive(); per-office spend
                                for the label plate (setTodayUsage / getTodayUsd)
  components/TasksDrawer.tsx  — per-workspace human todos (assignable to agents) + live agent TodoWrite plans
  components/BoardPanel.tsx   — campus-wide kanban overlay (Board button in toolbar): Backlog (open
                                todos — ▶ Assign, double-click to edit the text, ▲▼ to move one
                                place among the open todos OF ITS OWN WORKSPACE (the column groups
                                by office, so an arrow across a boundary would appear to do
                                nothing), ✕ two-step delete in the worktree manager's armed-red
                                idiom) / In Progress (working agents + activity + plan) /
                                Needs You (permission/waiting/idle agents + suggestion buttons) /
                                Done. Data composed in App.tsx (boardAgents); "✦ Plan" header button
                                opens the Assistant with BOARD_PLAN_KICKOFF_PROMPT (openAssistant
                                message accepts optional `prompt`). The Assistant's system prompt
                                carries ASSISTANT_PLANNING_PROCEDURE (electron/main.ts): scope
                                forcing-questions → role-tagged tasks ([build]/[qa]/…) via add_task
                                → human review on the Board → budget-capped dispatch on approval.
                                Clicking whiteboard furniture in the office also opens the Board
                                (OfficeCanvas onBoardFurnitureClick)
  components/changes/         — What an agent changed, as a reviewable list: ChangesModal (files
                                with status + line counts, each expandable) over the pure
                                diffModel.ts (`parseUnifiedDiff` → classified lines with per-side
                                line numbers, capped at DIFF_MAX_LINES because a lockfile diff
                                would otherwise lock the window) and DiffView. Opened from the
                                selected character's overlay, including while it is still working —
                                "what has it changed so far" is a fair question mid-turn, which is
                                why that button is NOT in the suggestions row (that row hides
                                itself during a turn, since those actions would interrupt). The
                                action row under the list closes the loop: a commit message
                                pre-filled with the agent's NAME (host-derived from its first
                                prompt, so "fix-auth-timeout" beats an empty box), then Commit /
                                Push / Open PR. Every request answers, including when the agent was
                                closed while its panel was open — a button that is pressed and
                                never hears back spins forever
  components/chat/            — Rich chat UI for SDK agents. filePaths.ts turns the paths an agent
                                writes into click-to-open links (a terminal does this; the chat tab
                                left them as dead text, worst exactly when it matters). Detection is
                                OPTIMISTIC and the styling deliberately quiet — prose is full of
                                things shaped like filenames, the webview cannot check the disk, and
                                the host reports what is really missing on click. URL spans are
                                excluded whole (in "https://h/a.md" the candidate starts at the
                                SECOND slash, so inspecting the preceding characters is not enough),
                                and PROSE_JS_WORDS stops "node.js" becoming a link. Inside
                                BACKTICKS the span is first tried as ONE path, spaces and all
                                (wholeFileRef): a tokeniser turns `~/Downloads/My Report.html`
                                into rubble, and the only crumb still shaped like a file resolves
                                against the agent's cwd to nothing. Conservative — needs a
                                separator, a linkable extension and no shell punctuation, and a
                                span whose every word is path-shaped is a LIST, not one path. fileRefContext.ts
                                carries the agent id paths resolve against — a separate module from
                                FileRefText.tsx because a file exporting both a component and a
                                context breaks fast refresh. chatModel.ts is the pure
                                ChatEvent[] → ChatItem[] reducer (stable monotonic React keys,
                                plus `user-id`, which attaches the CLI's id to the LAST user item:
                                our echo of a prompt is emitted optimistically on send, so its id
                                only exists once the SDK echoes it back).
                                REWIND (`Options.enableFileCheckpointing` + `Query.rewindFiles`):
                                "↶ Undo to here" on any of your own prompts, offered only while the
                                session is IDLE (rewinding files under a running turn would pull
                                the ground from under the edit it is making) and only on a prompt
                                the CLI acknowledged with an id. A dryRun ALWAYS runs first — the
                                preview is the only honest way to put "3 files, +40 −12" on the
                                button that writes to disk, rather than asking the user to trust
                                the word "rewind". Checkpointing records from the START of a
                                session, so a resumed one answers canRewind:false and says so;
                                PermissionCard's "Always" button, which appears ONLY when the CLI
                                offered rules (`canUseTool`'s `suggestions`) and is labelled with
                                how far they reach — `describePermissionScope` reads the
                                suggestion's own `destination`, because "always" means one thing
                                for a session and another for a settings file shared with a team.
                                The rules go back unedited as `PermissionResult.updatedPermissions`:
                                composing one from the tool name would grant something broader than
                                what the user was shown.
                                ChatView (message list + composer + image attachments +
                                a CONTEXT GAUGE above the composer (`chat-context`, asked after
                                every turn with `detail: 'summary'` — 'full' re-counts each
                                category through the token-count API, a round trip per category
                                for a number shown as a percentage; amber at
                                CONTEXT_GAUGE_WARN_PCT, red at URGENT, and re-asked on chatReady
                                since it is session state, not transcript) +
                                SessionSettings ⚙ popover (permission mode + model) +
                                prompt-suggestion row); PermissionCard; ResumePicker;
                                ToolGroup / toolIcons / toolMeta (grouped tool cards);
                                ToolCard (collapsible, Edit diffs),
                                turnNavigation.ts (pure turnJumpTarget) + the ▲▼ arrows at the
                                top-right of the message list and Alt+↑/↓: jump between TURNS,
                                anchored on the user's own messages (each starts a turn, so the
                                answer lands right below it) — reading something from earlier
                                shouldn't mean scrolling past every tool card since. Anchors are
                                read from the DOM (`data-chat-turn`) rather than tracked in state,
                                and a jump upward clears the near-bottom flag, so new output stops
                                yanking the view back down;
                                QuestionCard (AskUserQuestion: interactive option picker rendered
                                INLINE on its tool card — matched by toolUseId on the permission
                                request; single-question single-select answers on click, answers
                                returned via updatedInput.answers; settles into a Q&A record parsed
                                from the tool result; pending question = blinking "?" tab status),
                                Markdown (dependency-free safe renderer)
  constants.ts                — All webview magic numbers/strings (grid, animation, rendering, camera, zoom, editor, game logic, notification sound)
  notificationSound.ts        — Web Audio API chime on agent turn completion, with enable/disable
  App.tsx                     — Composition root, hooks + components + EditActionBar
  hooks/
    useExtensionMessages.ts   — Message handler + agent/tool state
    useEditorActions.ts       — Editor state + callbacks
    useEditorKeyboard.ts      — Keyboard shortcut effect
  components/
    BottomToolbar.tsx          — Right-edge icon rail: Assistant, Board, + Workspace, Layout,
                                 Settings (see "Floating toolbar")
    OfficePopup.tsx            — Per-office action popup opened by clicking an office floor:
                                 + Agent / + Terminal / Tasks (with open-todo count) / Resume /
                                 ✕ Remove (two-step confirm). Lifts itself when it would open
                                 past the bottom of the viewport
    AchievementToast.tsx       — Unlock toast fed by the achievementUnlocked queue
    MissedRunsModal.tsx        — Pick-and-run list of schedule runs missed while the app was closed
    ZoomControls.tsx           — +/- zoom (top-right)
    SettingsModal.tsx          — Centered modal: settings, export/import layout, sound toggle, debug toggle
    WelcomeModal.tsx           — First-run panel when Claude Code is logged out or unreachable:
                                 explains both auth paths, opens a login terminal, re-checks, or
                                 steps aside (the office and the layout editor work logged out)
                                 — or "Watch a demo": demo/demoAgents.ts fills the office with 5
                                 pretend agents (ids from DEMO_AGENT_BASE_ID) by dispatching host
                                 messages as window `message` events, the path real ones take, so
                                 the UI reacts for real while the host ignores the unknown ids
                                 (nothing spawned or saved; turn chime muted). DemoBanner says so;
                                 the demo ends on login or when a real agent appears
    DebugView.tsx              — Debug overlay
  office/
    types.ts                  — Interfaces (OfficeLayout, FloorColor, Character, etc.) + re-exports constants from constants.ts
    toolUtils.ts              — STATUS_TO_TOOL mapping, extractToolName(), defaultZoom()
    colorize.ts               — Dual-mode color module: Colorize (grayscale→HSL) + Adjust (HSL shift)
    floorTiles.ts             — Floor sprite storage + colorized cache
    wallTiles.ts              — Wall auto-tile: 16 bitmask sprites from walls.png
    sprites/
      spriteData.ts           — Pixel data: characters (6 pre-colored from PNGs, fallback templates), furniture, tiles, bubbles
      spriteCache.ts          — SpriteData → offscreen canvas, per-zoom WeakMap cache, outline sprites
    editor/
      editorActions.ts        — Pure layout ops: paint, place, remove, move, rotate, toggleState, canPlace, expandLayout
      editorState.ts          — Imperative state: tools, ghost, selection, undo/redo, dirty, drag
      EditorToolbar.tsx       — React toolbar/palette for edit mode
    layout/
      furnitureCatalog.ts     — Dynamic catalog from loaded assets + getCatalogEntry()
      layoutSerializer.ts     — OfficeLayout ↔ runtime (tileMap, furniture, seats, blocked)
      tileMap.ts              — Walkability, BFS pathfinding
    engine/
      characters.ts           — Character FSM: idle/walk/type + wander AI
      officeState.ts          — Game world: layout, characters, seats, selection, subagents
      gameLoop.ts             — rAF loop with delta time (capped 0.1s)
      renderer.ts             — Canvas: tiles, z-sorted entities, overlays, edit UI
      matrixEffect.ts         — Matrix-style spawn/despawn digital rain effect
    components/
      OfficeCanvas.tsx        — Canvas, resize, DPR, mouse hit-testing, edit interactions, drag-to-move
      ToolOverlay.tsx          — Label above the hovered/selected character: agent NAME on top,
                                 activity demoted to the subtitle (unnamed agents keep the old
                                 activity-first layout), role picker, suggestion buttons, close
                                 button. When a bubble is up the box anchors by its BOTTOM edge
                                 just above it (translateY(-100%)) so it never covers the signal
                                 it is reporting on

scripts/                      — Asset extraction pipeline (stages 0-5) + the art generators
  asset-gen/                  — Where all shipped art is GENERATED: sprites.ts…sprites9.ts
                                (furniture batches), floors.ts, palette.ts, avatar.ts,
                                export.ts (CATALOG_META + per-batch METAnn → furniture-catalog.json),
                                room-templates.ts (Rooms tool templates), layout-validate.ts
                                (catalog placement rules shared with default-layout.ts),
                                preview-batch.ts (one batch in context + rule checks),
                                default-layout.ts (the bundled starter scene), render-sheet.ts
  export-characters.ts        — Bakes CHARACTER_PALETTES into the 6 base character PNGs
  jsonl-viewer.html           — Browser viewer for session transcripts
  0-import-tileset.ts         — Interactive CLI wrapper
  1-detect-assets.ts          — Flood-fill asset detection
  2-asset-editor.html         — Browser UI for position/bounds editing
  3-vision-inspect.ts         — Claude vision auto-metadata
  4-review-metadata.html      — Browser UI for metadata review
  5-export-assets.ts          — Export PNGs + furniture-catalog.json
  asset-manager.html          — Unified editor (Stage 2+4 combined), Save/Save As via File System Access API
  generate-walls.js           — HISTORICAL (writes to a tmp path): the classic wall was hand-touched
                                after it; asset-gen/walls-classic.png is that style's source of truth
  export-role-characters.ts   — Role skins (gstack-style team roles): base char PNG + lightness-
                                preserving garment recolors + procedural accessories (hat/glasses/
                                sunglasses/tie/stripe) → scripts/asset-gen/roles/*.png + preview.html
                                (review artifacts; copy to assets/characters/roles/ once approved)
  wall-tile-editor.html       — Browser UI for editing wall tile appearance
examples/
  marketing-workspace/        — Non-code workspace template (copy anywhere, add as campus workspace):
                                CLAUDE.md brand brief + .claude/skills (video-script, monthly-plan);
                                deliverables land as files, [marketing] Board tasks dispatch that role
docs/                         — GitHub Pages landing (index.html) + sprites/ writeup on how the
                                art is generated; assets/demo.gif
```

## Core Concepts

**Vocabulary**: Session = JSONL conversation file. Agent = webview character bound 1:1 to a
session — either a `chat` agent (Agent SDK, rich chat tab, what "+ Agent" creates) or a
`terminal` agent (PTY running `claude`, xterm tab, what "+ Terminal" creates). Both register a
transcript watcher, so the office animates them identically.

**Host ↔ Webview**: `postMessage` protocol, fully typed as discriminated unions in
`shared/protocol.ts` (`HostToWebviewMessage` ~50 variants / `WebviewToHostMessage` ~37) — add new
message types THERE first; `electron/`, `webview-ui/` and `src/` all typecheck against it. The
union is the index: read it rather than trusting any list here. Families: agent lifecycle
(`agentCreated/Closed/Label/Selected`, `existingAgents`, `focusAgent`), tool activity
(`agentToolStart/Done/Clear`, `agentToolPermission[Clear]`, `agentStatus`, `subagent*`),
assets/layout (`layoutLoaded`, `*TilesLoaded`, `furnitureAssetsLoaded`, `saveLayout`,
`saveAgentSeats`, `export/importLayout`), chat (`chat-created/focus/event/replay/busy/mode/
suggestion/permission-request/-resolved`), terminals (`pty-*`), and campus data
(`workspacesLoaded`, `workspaceTodos`, `agent-todos`, `sessionList`, `usageSummary`,
`schedulesLoaded`, `missedSchedules`, `achievements*`, `claudeAuth`, `settingsLoaded`).

**Agent creation**: the host mints the session id up front, so the agent and its transcript
watcher exist before the session does. The watcher polls for the JSONL with a DEADLINE
(`JSONL_POLL_TIMEOUT_MS`, 30s) and then says so in a `hostNotice`: a transcript can fail to appear
for real reasons (a `claude` that never launched, a cwd that is gone, a worktree whose setup left
no usable environment), and without a deadline the character sat at its desk forever while a 1s
timer ran for the life of the app. It closes NOTHING — the session itself is usually fine, and
what was lost is only the office's ability to follow it. "+ Agent" → `openChatAgent` → `launchChatAgent()` (SDK
session + chat tab). "+ Terminal" → `openClaude` → a PTY running
`claude --session-id <uuid>` (plus `--dangerously-skip-permissions` when the Settings toggle is
on), then a 1s poll for `<uuid>.jsonl`.

**Worktrees (an office is a REPO, not a checkout)**: an agent has two paths, and conflating them
is the bug to watch for. `AgentPlacement` (main.ts) carries both: `cwd` — where the session RUNS
(PTY, SDK, transcript project hash) — and `workspacePath` — the office it belongs to, which keys
the layout, todos, usage ledger and tab grouping. They are the same path for a normal agent and
differ for a worktree one, which sits in its repo's office with everyone else and shows its branch
on the tab chip and in the character overlay (`ws · ⎇ agent/1`). Worktrees are deliberately
invisible to workspaces.json: a checkout is never its own office. Opt-in per agent via the office
popup's "⎇ Own worktree" (branch optional — the host names it); Board/schedule dispatch still runs
in the repo. A workspace may define a `setupCommand` (e.g. `npm ci`) that runs in every new
checkout IN A VISIBLE TERMINAL TAB before its agent starts — a fresh worktree has no node_modules
or .env, and the tab closes itself on a clean exit (the standard PTY policy) or stays with the
output when it fails, in which case the agent is NOT started and a `hostNotice` toast says so.

**Worktree manager** (`WorktreesModal`, from the office popup's "Manage worktrees…"): lists a
repo's checkouts with what a delete would cost — `uncommitted`, `N unmerged`, `N agents here` —
and does the two things worth doing. `+ Agent here` reuses an EXISTING checkout via
`WorktreeRequest.path`, which the host re-validates against `git worktree list` rather than
trusting (it decides where an agent writes). Remove is two-step and passes `force` only when the
checkout is dirty, since uncommitted work is the only thing a removal can destroy — the branch
and its commits always survive, and the confirmation text says so. A checkout with a live agent
can't be removed, and the repo's own checkout is never offered. `hostNotice` toasts sit ABOVE
modals (z 80, `position: fixed`): a notice is usually the answer to something clicked inside one,
and trapped behind it the click would look like it did nothing.

**INTERNAL SESSIONS ONLY**: there is no adoption of sessions the app did not spawn. The 1s scan
(`scanForNewJsonlFiles`) only looks inside the project dirs of agents it already owns, and exists
purely for `/clear`: a new JSONL there is reassigned to whichever of that dir's agents most
recently received input.

## Agent Status Tracking

JSONL transcripts at `~/.claude/projects/<project-hash>/<session-id>.jsonl`. Project hash = workspace path with `:`/`\`/`/` → `-`.

**JSONL record types**: `assistant` (tool_use blocks or thinking), `user` (tool_result or text prompt), `system` with `subtype: "turn_duration"` (reliable turn-end signal), `progress` with `data.type`: `agent_progress` (sub-agent tool_use/tool_result forwarded to webview, non-exempt tools trigger permission timers), `bash_progress` (long-running Bash output — restarts permission timer to confirm tool is executing), `mcp_progress` (MCP tool status — same timer restart logic). Also observed but not tracked: `file-history-snapshot`, `queue-operation`.

**File watching**: Hybrid `fs.watch` + 2s polling backup. Partial line buffering for mid-write reads. Tool done messages delayed 300ms to prevent flicker.

**Host state per agent** (`electron/main.ts`, on top of `CoreAgentState`): `id, kind, sessionId,
cwd, label/autoNamed, projectDir, jsonlFile, fileOffset, lineBuffer, activeToolIds,
activeToolStatuses, activeSubagentToolNames, turnStats, isWaiting`.

**Persistence**: Seats, palettes, hue shifts and roles are persisted by SESSION id (see
`saveAgentSeats`). Layouts are per-workspace files under `~/.pixel-agents/layouts/`, written
atomically (`.tmp` + rename) by `electron/main.ts` and hot-reloaded through a layouts-dir watcher
(debounced, own-write suppression) so external edits apply without a restart — unless the editor
has unsaved work, which cannot be overwritten; that case now raises a notice ("this office changed
on disk"), once per streak, where it used to be dropped with a console.log while the docs claimed
otherwise.
**Default layout**: a workspace with no design of its own is born from the starter office
(`~/.pixel-agents/office-template.json`) when present, else the bundled `default-layout.json`.
That bundled default is GENERATED: `node --experimental-strip-types scripts/asset-gen/default-layout.ts`
declares the scene (tile zones + furniture list) and validates every placement against
`furniture-catalog.json` with the editor's rules before writing
`webview-ui/public/assets/default-layout.json` — edit the script, not the JSON. On `layoutLoaded`
the webview runs `pruneUnknownFurniture()` (furnitureCatalog.ts): items whose type is missing from
the loaded catalog (ids from retired asset packs) are dropped in memory and disappear from disk on
the user's next save; no-op until the dynamic catalog is ready.
**Export/Import**: Settings offers Export Layout (save dialog → the STARTER office as JSON, or
the bundled default when no starter is set) and Import Layout (open dialog → `parseLayout` →
becomes the starter office + pushes `layoutLoaded`). The pair is symmetric on purpose: both ends
are the office a new workspace is born with, not whichever office you happen to be looking at —
and since importing REPLACES that office, it asks first, but only when the user has a starter of
their own to lose (with none, new offices come from the bundled layout, which isn't their work).
Both ends report: a file that fails validation names the reason it failed, where the handler used
to answer `return` and leave the user staring at a dialog that did nothing.

## Office UI

**Rendering**: Game state in imperative `OfficeState` class (not React state). Pixel-perfect: zoom = integer device-pixels-per-sprite-pixel (1x–10x). No `ctx.scale(dpr)`. Default zoom = `Math.max(ZOOM_MIN, Math.round(ZOOM_DEFAULT_DPR_FACTOR * devicePixelRatio))`. Z-sort all entities by Y. Pan via middle-mouse drag (`panRef`). **Camera follow**: `cameraFollowId` (separate from `selectedAgentId`) smoothly centers camera on the followed agent; set on agent click, cleared on deselection or manual pan.

**Stacking order**: one scale, in `index.css` — controls 50, character overlays 100 (selected
110), modal backdrop 200, modal 210, notices 300. Modals used to hardcode 59/60 (and Settings
49/50, Welcome 79/80) while a selected character's overlay sat at 110, so opening a dialog FROM a
character left its label floating on top of the dialog; the Changes panel made that unmissable
because it opens from exactly there. Notices stay above modals deliberately: a notice is usually
the answer to something clicked inside one.

**UI styling**: Pixel art aesthetic — all overlays use sharp corners (`borderRadius: 0`), solid backgrounds (`#1e1e2e`), `2px solid` borders, hard offset shadows (`2px 2px 0px #0a0a14`, no blur). CSS variables defined in `index.css` `:root` (`--pixel-bg`, `--pixel-border`, `--pixel-accent`, etc.). Pixel font: FS Pixel Sans (`webview-ui/src/fonts/`), loaded via `@font-face` in `index.css`, applied globally.

**Characters**: FSM states — active (pathfind to seat, typing/reading animation by tool type), idle (wander randomly with BFS, return to seat for rest after `wanderLimit` moves). 4-directional sprites, left = flipped right. Tool animations: typing (Write/Edit/Bash/Task) vs reading (Read/Grep/Glob/WebFetch). Sitting offset: characters shift down 6px when in TYPE state so they visually sit in their chair. Z-sort uses `ch.y + TILE_SIZE/2 + 0.5` so characters render in front of same-row furniture (chairs) but behind furniture at lower rows (desks, bookshelves). Chair z-sorting: EVERY chair uses `zY = (row+1)*TILE_SIZE` (capped to the first row) so a character at any seat tile renders in front of it. Back-facing chairs used to add `+1` and draw over the seated character — physically right, but `chair_office_back`'s backrest covers y=6..23 of its 32px bottom-anchored sprite while a character occupies y=8..31, so whoever sat there became a few pixels of hair. That is how sub-agents, who are born at the nearest free seat and never walk anywhere, were invisible; the backrest still peeks above and beside the character, which reads as sitting in the chair. Chair tiles are blocked for all characters except their own assigned seat (per-character pathfinding via `withOwnSeatUnblocked`). **Diverse palette assignment**: `pickDiversePalette()` counts palettes of current non-sub-agent characters; picks randomly from least-used palette(s). First 6 agents each get a unique skin; beyond 6, skins repeat with a random hue shift (45–315°) via `adjustSprite()`. Character stores `palette` (0-5) + `hueShift` (degrees). Sprite cache keyed by `"palette:hueShift"`.

**Spawn/despawn effect**: Matrix-style digital rain animation (0.3s). 16 vertical columns sweep top-to-bottom with staggered timing (per-column random seeds). Spawn: green rain reveals character pixels behind the sweep. Despawn: character pixels consumed by green rain trails. `matrixEffect` field on Character (`'spawn'`/`'despawn'`/`null`). Normal FSM is paused during effect. Despawning characters skip hit-testing. Restored agents (`existingAgents`) use `skipSpawnEffect: true` to appear instantly. `matrixEffect.ts` contains `renderMatrixEffect()` (per-pixel rendering) called from renderer instead of cached sprite draw.

**Role skins**: Optional per-agent character sheets (gstack-style team roles: ceo, eng-manager, qa, security, designer, release, debugger, writer, marketing). Assets in `assets/characters/roles/char_role_<id>.png` (same 112×96 layout as base chars; generated by `scripts/export-role-characters.ts`; registry = `ROLE_SKIN_DEFS` in core constants). Loaded by `loadRoleSprites()` → `roleSpritesLoaded` message → `setRoleSprites()`. `getCharacterSprites(palette, hueShift, role?)` prefers the role sheet (cache key `role|palette:hueShift`); missing sheets degrade to the base look. Assigned manually via the "No role ▾" picker in the selected character's overlay; persisted as `AgentSeatMeta.role` (flows through the normal seat persistence). `officeState.setAgentRole()` mutates the character; hue shift still applies on top.

**Dispatch roles**: roles are functional at agent creation, not just cosmetic. `launchChatAgent(cwd, resume?, prompt?, roleId?)` looks up `AGENT_ROLE_DEFS` (`src/core/roles.ts`) and passes charter → `systemPromptAppend` + `disallowedTools` to the SDK session (qa/security can't Edit/Write — verdicts, not fixes), and `role` on `agentCreated` so the character spawns with the skin (persists via the normal seat-save path). Role sources: Board ▶ Assign parses the task's leading `[tag]` (`roleForTaskText`; the Assistant's planning procedure writes these tags), and the Assistant's `create_agent` tool takes an optional `role` enum param. **Typed sub-agents**: Task `subagent_type` → `roleForSubagentType` keyword match → `subagentRole` on `agentToolStart` (stored in `activeTaskSubagentRoles` for webview-reload replay) → sub-agent character spawns with the skin (cosmetic only — the parent session owns sub-agent prompts/tools).

**Floating toolbar**: `BottomToolbar.tsx` renders right-edge vertical icon bubbles (order = usage frequency: Assistant, Board, + Workspace, Layout, Settings). Icons are 12×12 pixel grids in `toolbarIcons.ts` ('X' fg / 'A' accent), drawn by `PixelIcon.tsx` to a pixelated canvas. Hover shows a custom pixel tooltip (label + description) to the left. Settings still mounts the centered `SettingsModal`.

**Sub-agents**: For a CHAT agent they come from the SDK's own task stream — `system/task_started`,
`task_progress`, `task_notification` → `subagentStarted/Progress/Finished`, with
`agentProgressSummaries: true` so the model writes the one-line summary that makes a character say
what it is busy WITH rather than just that it is busy. Keyed by `tool_use_id`, which is the SAME id
the transcript's Task call carries, so the SDK path ENRICHES the character the transcript already
spawned instead of drawing a second one beside it (`addSubagent` is idempotent on
`parent:toolId`, which is what lets either arrive first). The overlay then reads like a named
agent: the task it was given on top, its own progress summary underneath, and a Stop button —
`Query.stopTask(taskId)`, which needs the TASK id, so only chat agents can offer it and a terminal
agent's sub-agents show no button rather than an inert one. Tasks with no `tool_use_id`, or marked
`ambient`/`skip_transcript`, are housekeeping the SDK asks hosts to keep out of activity
indicators, and are skipped.

Negative IDs (from -1 down). Also created on `agentToolStart` with "Subtask:" prefix,
and set ACTIVE on the spot (no `currentTool` — we don't know what they're doing, and the Task glyph
would claim they had delegated work of their own): a sub-agent exists only while it works, and it
cannot wait for `subagentToolStart` to look alive — CLI 2.1.x stopped writing sub-agent activity
into the parent transcript. There are no `progress`/`agent_progress` records any more; each
sub-agent gets its own `~/.claude/projects/<hash>/<session-id>/subagents/agent-<id>.jsonl` plus an
`agent-<id>.meta.json` naming its `toolUseId`, `agentType`, `description` and `parentAgentId`
(nested sub-agents carry `spawnDepth: 2`). Nothing reads those files yet, so `subagentToolStart/Done`
and the sub-agent permission bubbles are dead on current CLIs. Same palette + hueShift as parent. Click focuses parent terminal. Not persisted. Spawn at closest free seat to parent (Manhattan distance); fallback: closest walkable tile. **Sub-agent permission detection**: when a sub-agent runs a non-exempt tool, `startPermissionTimer` fires on the parent agent; if 5s elapse with no data, permission bubbles appear on both parent and sub-agent characters. `activeSubagentToolNames` (parentToolId → subToolId → toolName) tracks which sub-tools are active for the exempt check. Cleared when data resumes or Task completes.

**Agent self-reporting (`AgentDecor`)**: what an agent says about itself — a status line and a
0..1 progress bar — reaching the office through the campus socket or, for chat agents, the `me`
MCP tools (`mcp__me__set_status` / `set_progress` / `notify`, built in chatAgent.ts, which is how a
model actually discovers the feature; a terminal agent needs a hook or script to call the CLI).
Session state, NOT transcript: held on `AgentState.decor`, re-sent on `webviewReady` like
`chat-mode`, never persisted in `AgentSeatMeta` — a progress bar from yesterday's build has no
business returning on resume. A new user prompt retires it (`clearAgentDecor` on `onUserPrompt`),
deliberately not every tool start, since an agent's own build hook runs mid-turn. Pushes are
coalesced per agent on a 100ms trailing edge, because a build loop can call `progress` hundreds of
times a second. The bar is drawn at the character's FEET (`renderProgressBars`), scaled like
bubbles so it keeps a constant on-screen size — and deliberately NOT a bubble: 60% through a
migration is not "there is something here for you". `campus notify` IS that, so it raises the
unread bubble and puts its text on the status line (a bubble you can't read is a mystery when
you're sitting right there). `officeState.setAgentDecor` is three-valued on purpose: absent leaves
a field alone, null clears it, a value sets it — so a notify can't wipe a running progress bar.

**Speech bubbles**: the office's attention channel, and the design rule is strict — **a bubble
always means "there is something here for you"; ordinary work carries no bubble at all**. The
premise is that nobody watches agents work: you leave and come back, so the office must
ACCUMULATE state rather than flash it. Three kinds (`BubbleKind`, `office/types.ts`):

- **`blocked`** ("..." dots) — the agent cannot continue without you: a tool permission OR an
  AskUserQuestion. Persists until actually RESOLVED; **a click will not dismiss it**, because
  hiding it would leave the office claiming nothing is wrong while the agent is still stuck.
  It ages: `bubbleAgeSec` drives 3 colour tiers (amber → orange → red at `BUBBLE_AGE_WARN_SEC`
  60s and `BUBBLE_AGE_URGENT_SEC` 300s) and a pulse that speeds up with the wait, so the oldest
  block is what catches your eye.
- **`done`** (green check) — the turn finished and you have not looked yet. An UNREAD BADGE: it
  does not auto-fade (the old 2s flash was removed on purpose — it was useless to anyone who
  stepped away). Cleared by `acknowledgeAgent()` when you open the agent, or by a click.
- **`error`** (red "!") — the turn ended with repeated tool errors. Raised from the
  `investigate` suggestion `kind`, the only surviving trace of the `TurnStats.errorCount` that
  `transcriptParser` otherwise discards.

`blocked` outranks the unread kinds (`showBubble` refuses to downgrade one). Any new tool start
or `agentStatus: 'active'` clears everything — work resumed, so nothing is pending for you.
Bubbles are a **UI layer, not world objects**: `bubbleScale()` keeps them at a constant on-screen
size (never below `BUBBLE_MIN_SCALE × dpr`) so a blocked agent stays legible at campus zoom where
the character is a few pixels tall. Once characters pack closer together than a bubble is wide,
`shouldClusterBubbles()` replaces them with ONE aggregated marker per office above its label
plate (`summarizeBubbles` / `renderBubbleCluster`, most-urgent-first, with an `xN` tally).
`renderOffscreenMarkers()` pins viewport-edge arrows at blocked agents whose BUBBLE (not
character — an agent can sit just inside the top edge with its bubble clipped away) is off
screen. Sprites are built by `makeBubbleSprite(accent, cells)` in `spriteData.ts`.

**Agent names**: the host auto-derives a display name from an agent's first prompt, sends it as
`agentLabel`, and persists it as `AgentSeatMeta.name` (session-keyed, so it survives resume).
The webview mirrors it onto the character (`setAgentName`) and into React (`agentNames`), so the
office, Board and Tasks drawer read `fix-auth-timeout` rather than `Agent 3`. **Manual rename**:
double-click a tab's label (chat or terminal) for an inline field — Enter/blur commits, Esc
cancels — which sends `renameAgent`. The host owns the rename (`applyAgentName`, shared with
auto-naming: state + PTY/chat replay labels + seat meta + `agentLabel` echo) and marks the agent
`autoNamed`, so a name you typed is never overwritten by the first prompt.

**Prompt suggestions**: the SDK emits a `prompt_suggestion` after a turn's result; chat tabs
offer it as a dashed row above the composer (Tab or click to accept into the draft, Esc to
dismiss), shown only on an empty composer so Tab keeps meaning Tab. It is SESSION STATE, not a
`ChatEvent`: a live offer is not transcript, so it must never replay into the message list — the
host holds `session.latestSuggestion` and re-sends `chat-suggestion` on `chatReady`, the same way
it re-sends the permission mode. Cleared the moment a prompt is sent. Esc inside a chat tab
means: interrupt the running turn → else drop the suggestion → else stay out of the way; it is
bound to the subtree rather than the window because background tabs stay mounted.

**Dispatch dials (effort, budget)**: `Options.effort` and `Options.maxBudgetUsd` are SESSION
options with no live setter — unlike the model, which has `setModel` — so they are decided where an
agent is SENT OUT, not while it runs: Settings holds "Effort" and "Budget / agent" for every new
agent, and a scheduled run inherits them without the scheduler knowing they exist, which is where
an unattended bill actually comes from. The ⚙ popover shows the effort the session SETTLED on
(from `system init`, after env overrides, org caps and model-support downgrades) as read-only
text, because a picker there would be lying about when it takes hold. Hitting the cap is not a
failure of the task — the SDK answers `error_max_budget_usd`, and the chat says so with the
number rather than "error".

**Chat permission modes**: `default | acceptEdits | plan | bypassPermissions` per session
(`chatSetPermissionMode` → `chat-mode` echo), separate from the global "new agents start with
permissions bypassed" setting in Settings.

**Chat model picker**: per-SESSION model choice, never a global setting — a section of the
composer's ⚙ SESSION SETTINGS popover (`SessionSettings`, ChatView.tsx), which also holds the
permission mode. The two were inline labelled buttons until model names ("Default (recommended)")
ate the composer's width; collapsing them into one gear gives the textarea that width back, and
the gear's BORDER keeps the permission-mode colour so a session on Bypass still says so.
The option list is NOT hardcoded: `chatAgent.ts`
asks the running CLI (`query.supportedModels()`) once at SDK init and ships it as `chat-models`
(with the model `system init` reports, which is authoritative over whatever we asked for), so new
models appear without an app release and a CLI too old to answer leaves the list empty — the
picker then hides the MODEL section (the popover keeps its permission modes). Switching sends `chatSetModel` → `query.setModel()` (live, mid-session)
→ `chat-models` echo; "Default" (null) hands the choice back to the CLI. Persisted as
`AgentSeatMeta.model` by session id, so a resumed agent comes back on its model and
`launchChatAgent` seeds `Options.model` at startup. Like `name`, it is HOST-written: `saveAgentSeats`
must preserve it, since the webview doesn't track it and would otherwise drop it on the next seat
save. Alias rows ('sonnet') are matched to the explicit id the session reports via
`ModelInfo.resolvedModel`. Re-sent on `chatReady` for the same reason as `chat-mode`. Terminal
agents are unaffected — they have the CLI's own `/model`.

**Action suggestion buttons**: On `turn_duration`, core sends `agentSuggestions` derived from the turn's TurnStats (`actionSuggestions.ts` heuristics: edits → Review/Test, clean tests → Commit, ≥3 tool errors → Investigate). ToolOverlay renders them as buttons under the selected character's status pill (hidden while active). Clicking sends `runAgentAction` — the host writes the command to the PTY (text, then `\r` after `PTY_ACTION_ENTER_DELAY_MS`) or calls `ChatSession.send()`. Commands are plain-language prompts (not slash commands) so they work without any skills installed. Suggestions cleared on new user prompt (empty array), agent close, and optimistically on click.

**Sound notifications**: ascending two-note chime (E5 → E6) via Web Audio API, played by
`playDoneSound()` alongside the `done` bubble on `agentStatus: 'waiting'`. `notificationSound.ts`
manages the AudioContext; `unlockAudio()` on canvas mousedown resumes it (webviews start
suspended). Enabled by default, toggled in Settings, persisted in `~/.pixel-agents/settings.json`
(`loadSettings`/`saveSettings`, alongside `bypassPermissions`) and echoed back as
`settingsLoaded`.

**Seats**: Derived from chair furniture. `layoutToSeats()` creates a seat at every footprint tile of every chair. Multi-tile chairs (e.g. 2-tile couches) produce multiple seats keyed `uid` / `uid:1` / `uid:2`. Facing direction priority: 1) chair `orientation` from catalog (front→DOWN, back→UP, left→LEFT, right→RIGHT), 2) adjacent desk direction, 3) forward (DOWN). Click character → select (white outline) → click available seat → reassign.

## Layout Editor

Toggle via "Layout" button. Tools: SELECT (default), Floor paint, Wall paint, Erase (set tiles to VOID), Furniture place, Furniture pick (eyedropper for furniture type), Eyedropper (floor).

**Floor**: 19 patterns from `floors.png` (count = strip width / 16; new patterns are APPENDED to `scripts/asset-gen/floors.ts` so indexes never shift) (grayscale 16×16), colorizable via HSBC sliders (Photoshop Colorize). Color baked per-tile on paint. Eyedropper picks pattern+color.

**Walls**: Separate Wall paint tool with a style picker (7 styles: plaster, brick, panelling, glass, stone, concrete, cubicle). Painting over a wall of another style restyles it; a wall of the selected style is removed. Click/drag to add walls; click/drag existing walls to remove (toggle direction set by first tile of drag, tracked by `wallDragAdding`). HSBC color sliders (Colorize mode) apply to all wall tiles at once. Eyedropper on a wall tile picks its color and switches to Wall tool. Furniture cannot be placed on wall tiles, but background rows (top N `backgroundTiles` rows) may overlap walls.

**Furniture**: the palette is a wrapping grid (`FURNITURE_PALETTE_COLUMNS` × `FURNITURE_PALETTE_VISIBLE_ROWS` before it scrolls) with a Search box that spans every category (label or id). Ghost preview (green/red validity). R key rotates, T key toggles on/off state. Drag-to-move in SELECT. Delete button (red X) + rotate button (blue arrow) on selected items. Any selected furniture shows HSBC color sliders (Color toggle + Clear button); color stored per-item in `PlacedFurniture.color?`. Single undo entry per color-editing session (tracked by `colorEditUidRef`). Pick tool copies type+color from placed item. Surface items preferred when clicking stacked furniture.

**Rooms tool** (`EditTool.ROOM_STAMP`): ready-made rooms (café, game room, hardware lab, server room, meeting room, library, lounge, focus row, garden, capybara onsen) generated by `scripts/asset-gen/room-templates.ts` → `assets/room-templates.json` → host `roomTemplatesLoaded` → `office/roomTemplates.ts`. Declared as tile zones (floors/wall styles BY ID) + furniture, validated with the editor's placement rules via `scripts/asset-gen/layout-validate.ts` (shared with default-layout.ts — edit templates there, not the JSON). The toolbar shows a thumbnail card per room; the canvas draws the room translucent with its top-left at the cursor; a click runs pure `stampRoom()` (editorActions.ts): tiles + colours replace the rectangle, furniture touching it goes, the template's pieces are placed, and a room hanging off the right/bottom edge GROWS the grid (screenToTile accepts any tile up to MAX for this tool) — one undo entry.

**Undo/Redo**: 50-level, Ctrl+Z/Y. EditActionBar (top-center when dirty): Undo, Redo, Save, Reset.

**Multi-stage Esc**: exit furniture pick → deselect catalog → close tool tab → deselect furniture → close editor.

**Erase tool**: Sets tiles to `TileType.VOID` (transparent, non-walkable, no furniture). Right-click in floor/wall/erase tools also erases to VOID (supports drag-erasing). Context menu suppressed in edit mode.

**Grid expansion**: In floor/wall/erase tools, a ghost border (dashed outline) appears 1 tile outside the grid. Clicking a ghost tile calls `expandLayout()` to grow the grid by 1 tile in that direction (left/right/up/down). New tiles are VOID. Furniture positions and character positions shift when expanding left/up. Max grid size: `MAX_COLS`×`MAX_ROWS` (64×64). Default: `DEFAULT_COLS`×`DEFAULT_ROWS` (20×11). Characters outside bounds after resize are relocated to random walkable tiles.

**Layout model**: `{ version: 1, cols, rows, tiles: TileType[], furniture: PlacedFurniture[], tileColors?: FloorColor[] }`. Grid dimensions are dynamic (not fixed constants). Persisted via a debounced `saveLayout` message → `~/.pixel-agents/layouts/<sanitized-workspace>.json`
(atomic `.tmp` + rename), hot-reloaded through the layouts-dir watcher.

## Asset System

**Loading**: `getAssetsRoot()` (electron/main.ts) resolves `webview-ui/public` in dev and `process.resourcesPath` when packaged (electron-builder `extraResources`). PNG → pngjs → SpriteData (2D hex array, alpha≥128 = opaque). `loadDefaultLayout()` reads `assets/default-layout.json` (JSON OfficeLayout) as fallback for new workspaces.

**Catalog**: `furniture-catalog.json` with id, name, label, category, footprint, isDesk, canPlaceOnWalls, groupId?, orientation?, state?, canPlaceOnSurfaces?, backgroundTiles?. String-based type system (no enum constraint). Categories: desks, chairs, storage, electronics, decor, wall, misc. Wall-placeable items (`canPlaceOnWalls: true`) use the `wall` category and appear in a dedicated "Wall" tab in the editor. Asset naming convention: `{BASE}[_{ORIENTATION}][_{STATE}]` (e.g., `MONITOR_FRONT_OFF`, `CRT_MONITOR_BACK`). `orientation` is stored on `FurnitureCatalogEntry` and used for chair z-sorting and seat facing direction.

**Rotation groups**: `buildDynamicCatalog()` builds `rotationGroups` Map from assets sharing a `groupId`. Flexible: supports 2+ orientations (e.g., front/back only). Editor palette shows 1 item per group (front orientation preferred). `getRotatedType()` cycles through available orientations. Batch 8 (sprites8.ts) added the campus exterior — tree, bush, bench (a `chairs` item, so its tiles are seats), fountain, lamp_post, picnic_table, flower_bed (catalog: 117 entries). Batch 7 (sprites7.ts) added the office essentials — desk_single, monitor_single, laptop, chair_wood, meeting_table, beanbag, partition, bookshelf_short, fridge, wall_shelf, neon_sign, calendar — each shipped with every orientation whose footprint differs (catalog: 105 entries). Generated variants (scripts/asset-gen/sprites4–6.ts): chairs ×4, back views for every non-symmetric piece, and **quarter turns whose footprint swaps W/H** (sprites6.ts: couch/desk_standing/fish_tank/kitchen_counter/monitor_dual 2x1→1x2, desk_double/rug_large 3x2→2x3, desk_l in all four L shapes via a parametric top-down `slab(cells)` generator, pingpong_table). Per-orientation catalog entries carry their own footprint, so `rotateFurniture()` re-validates with `canPlaceFurniture` when the footprint turns: pivot on the item's center, fall back to the original corner, refuse the rotation if neither fits. Front variants keep their original ids for old-layout compat, and `layoutToSeats()` treats `orientation: 'front'` as non-explicit so the adjacent-desk facing heuristic still wins for pre-rotation layouts. Editor: selected rotatable furniture shows a "↻ Rotate R" button + shortcut legend in the toolbar (plus the top-center "Press R" hint).

**Reward furniture**: a catalog entry may carry `unlock?: <achievement id>` (set in `CATALOG_META`, `scripts/asset-gen/export.ts`). Batch 9 (`sprites9.ts`) is the first set: trophy_case → `ten-done`, neon_shipped → `first-done`, duck_golden → `century`, disco_ball → `full-floor`, robot_statue → `automator` (catalog: 122 entries). The webview mirrors the host's unlocked ids into the catalog module (`setUnlockedAchievements` / `addUnlockedAchievement` on `achievementsLoaded` / `achievementUnlocked`); `isTypeLocked()` drives both the palette (thumbnail greyed with a padlock badge, click ignored, tooltip names the milestone but not its terms — locked descriptions stay hidden app-wide) and `canPlaceFurniture()`, which refuses a locked type **only for new placements**: `excludeUid` means an existing item is being moved or rotated, so a layout that already holds a locked piece (imported, or earned on another machine) stays fully editable.

**Themed batches 10–15** (catalog: 276 entries, ~110 distinct pieces): kitchen & café (sprites10), game room (11), hardware lab & servers (12), plants & outdoors (13), wall decor & signage (14), library & campus fun incl. the capybara onsen (15). From batch 10 on, metadata ships BESIDE the art as `export const METAnn` (type in `catalog-meta.ts`) and export.ts spreads it into CATALOG_META, so batches can be drawn in parallel without touching export.ts. `palette.ts` gained PINK/TEAL/CREAM/BRICK/NAVY/STONE. Review a batch with `node --experimental-strip-types scripts/asset-gen/preview-batch.ts <n> [out.png]`: each sprite drawn in context (floor/wall/desk, footprint outline, a character for scale, a 2x strip) plus rule checks (palette, widthPx = footprintW*16, META coverage, cross-batch id collisions, rotation groups with a 'front'); exit 1 on a violation. Gotcha found in review: WOOD_LIGHT is DARKER than WOOD_SURFACE, so it is not a highlight on desk tops.

**Animated furniture**: a `GeneratedSprite` may carry `frames` (the frames after `sprite`) + `frameMs`; export writes `<id>@<k>.png` and catalog `frames`/`frameMs`, the loader ships them as sprites keyed `<id>@<k>`, the catalog entry gets `frames: SpriteData[]`, and `renderScene` picks the frame from `performance.now()` plus a per-uid phase (`FURNITURE_FRAME_MS` default). Frame 0 stays the still everything else (palette, ghost) uses. 46 entries animate (steam, LEDs, flames, fish, screens, pendulums…); `preview-batch.ts` draws every frame and checks them.

**Furniture interactions**: `scripts/asset-gen/interactions.ts` maps ids to `'use'` (hands busy) or `'look'`; export copies it onto catalog entries as `interact` (rotation variants inherit their group's). `layout/interactionSpots.ts` (pure) lists the free tiles beside each such piece (front side first; wall pieces only from below; surface items from beside the desk they sit on) with facing and capacity. OfficeState reserves spots (one character per spot, capacity per piece) and characters.ts sends an idle agent to one with `INTERACT_CHANCE` per wander decision, where it stands in `CharacterState.USE` for `INTERACT_MIN..MAX_SEC` — 'use' draws a composed standing "hands busy" frame, 'look' stands facing it with occasional glances. Becoming active, a layout change or removal releases the reservation at once. To try it without a login, the run-desktop driver can `eval` a synthetic `agentCreated` + `agentStatus: 'waiting'` as a window `message` event (host messages arrive that way).

**State groups**: Items with `state: "on"` / `"off"` sharing the same `groupId` + `orientation` form toggle pairs. `stateGroups` Map enables `getToggledType()` lookup. Editor palette hides on-state variants, showing only the off/default version. State groups are mirrored across orientations (on-state variants get their own rotation groups).

**Auto-state**: `officeState.rebuildFurnitureInstances()` swaps electronics to ON sprites when an active agent faces a desk with that item nearby (3 tiles deep in facing direction, 1 tile to each side). Operates at render time without modifying the saved layout.

**Background tiles**: `backgroundTiles?: number` on `FurnitureCatalogEntry` — top N footprint rows allow other furniture to be placed on them AND characters to walk through them. Items on background rows render behind the host furniture via z-sort (lower zY). Both `getBlockedTiles()` and `getPlacementBlockedTiles()` skip bg rows; `canPlaceFurniture()` also skips the new item's own bg rows (symmetric placement). Set via asset-manager.html "Background Tiles" field.

**Surface placement**: `canPlaceOnSurfaces?: boolean` on `FurnitureCatalogEntry` — items like laptops, monitors, mugs can overlap with all tiles of `isDesk` furniture. `canPlaceFurniture()` builds a desk-tile set and excludes it from collision checks for surface items. Z-sort fix: `layoutToFurnitureInstances()` pre-computes desk zY per tile; surface items get `zY = max(spriteBottom, deskZY + 0.5)` so they render in front of the desk. Set via asset-manager.html "Can Place On Surfaces" checkbox. Exported through `5-export-assets.ts` → `furniture-catalog.json`.

**Wall placement**: `canPlaceOnWalls?: boolean` on `FurnitureCatalogEntry` — items like paintings, windows, clocks can only be placed on wall tiles (and cannot be placed on floor). `canPlaceFurniture()` requires the bottom row of the footprint to be on wall tiles; upper rows may extend above the map (negative row) or into VOID tiles. `getWallPlacementRow()` offsets placement so the bottom row aligns with the hovered tile. Items can have negative `row` values in `PlacedFurniture`. Set via asset-manager.html "Can Place On Walls" checkbox.

**Colorize module**: Shared `colorize.ts` with two modes selected by `FloorColor.colorize?` flag. **Colorize mode** (Photoshop-style): grayscale → luminance → contrast → brightness → fixed HSL; always used for floor tiles. **Adjust mode** (default for furniture and character hue shifts): shifts original pixel HSL — H rotates hue (±180), S shifts saturation (±100), B/C shift lightness/contrast. `adjustSprite()` exported for reuse (character hue shifts). Toolbar shows a "Colorize" checkbox to toggle modes. Generic `Map<string, SpriteData>` cache keyed by arbitrary string (includes colorize flag). `layoutToFurnitureInstances()` colorizes sprites when `PlacedFurniture.color` is set.

**Tile values**: the value space is open-ended and must be read through the helpers in `office/types.ts` (`isWallTile`, `isFloorTile`, `wallStyleOf`/`wallTileForStyle`, `floorPatternOf`/`floorTileForPattern`), never `=== TileType.WALL`: floor pattern p is tile p up to 7 and p+1 from 8 on (8 = VOID predates the extra floors); wall style 0 is 0 (WALL), style s ≥ 1 is 100+s. Walls of any style connect for auto-tiling.

**Floor tiles**: `floors.png` (16px strip, one tile per pattern). Cached by (pattern, h, s, b, c). Migration: old layouts auto-mapped to new patterns.

**Wall tiles**: `walls.png` = one 64×128 sheet (4×4 grid of 16×32 pieces) per style, stacked vertically, generated from `scripts/asset-gen/walls.ts` (style 0 read from `walls-classic.png`); sent flat as 16 sprites per style. 4-bit auto-tile bitmask (N=1, E=2, S=4, W=8). Sprites extend 16px above tile (3D face). Loaded by the host → `wallTilesLoaded` message. `wallTiles.ts` computes bitmask at render time. Colorizable via HSBC sliders (Colorize mode, stored per-tile in `tileColors`). Wall sprites are z-sorted with furniture and characters (`getWallInstances()` builds `FurnitureInstance[]` with `zY = (row+1)*TILE_SIZE`); only the flat base color is rendered in the tile pass. New styles are drawn programmatically in GRAYSCALE (they are Colorize-tinted).

**Character sprites**: 6 pre-colored PNGs (`assets/characters/char_0.png`–`char_5.png`), one per palette. Each 112×96: 7 frames × 16px wide, 3 direction rows × 32px tall (24px sprite bottom-aligned with 8px top padding). Row 0 = down, Row 1 = up, Row 2 = right. Frame order: walk1, walk2, walk3, type1, type2, read1, read2. No dedicated idle frames — idle uses walk2 (standing pose). Left = flipped right at runtime. Generated by `scripts/export-characters.ts` which bakes `CHARACTER_PALETTES` colors into templates. Loaded by the host → `characterSpritesLoaded` message (array of 6 character sprite sets). `spriteData.ts` uses pre-colored data directly (no palette swapping); hardcoded template fallback when PNGs not loaded. When `hueShift !== 0`, `hueShiftSprites()` applies `adjustSprite()` (HSL hue rotation) to all frames before caching.

**Load order**: `characterSpritesLoaded` → `floorTilesLoaded` → `wallTilesLoaded` → `furnitureAssetsLoaded` (catalog built synchronously) → `layoutLoaded`.

## Condensed Lessons

- `fs.watch` unreliable on Windows — always pair with polling backup
- Partial line buffering essential for append-only file reads (carry unterminated lines)
- Delay `agentToolDone` 300ms to prevent React batching from hiding brief active states
- **Idle detection is only needed where nothing else reports.** A chat agent's SDK session emits
  `session_state_changed` — the CLI's own turn-over signal — so `CoreAgentState.hasSessionState`
  turns OFF both guesses for it: the text-idle timer and the permission timer. Those are not
  fallbacks for such an agent, they are second, worse answers racing an authoritative one (five
  seconds of silence is indistinguishable from a model thinking; a slow tool is indistinguishable
  from one awaiting approval, which the canUseTool bridge already reports exactly). Terminal agents
  have neither signal and keep both. The two signals below therefore describe TERMINAL agents:
- **Idle detection** has two signals: (1) `system` + `subtype: "turn_duration"` — reliable for tool-using turns (~98%), emitted once per completed turn, handler clears all tool state as safety measure. (2) Text-idle timer (`TEXT_IDLE_DELAY_MS = 5s`) — for text-only turns where `turn_duration` is never emitted. Only starts when `hadToolsInTurn` is false (no tools used yet in this turn); if any tool_use arrives, `hadToolsInTurn` becomes true and the timer is suppressed for the rest of the turn. Reset on new user prompt or `turn_duration`. Cancelled by ANY new JSONL data arriving in `readNewLines`. Only fires after 5s of complete file silence
- User prompt `content` can be string (text) or array (tool_results) — handle both
- `/clear` creates NEW JSONL file (old file just stops)
- `--output-format stream-json` needs non-TTY stdin — can't use with PTY terminal tabs
- Hook-based IPC failed (hooks captured at startup, env vars don't propagate). JSONL watching works
- PNG→SpriteData: pngjs for RGBA buffer, alpha threshold 128
- OfficeCanvas selection changes are imperative (`editorState.selectedFurnitureUid`); must call `onEditorSelectionChange()` to trigger React re-render for toolbar

## Build & Dev

```sh
npm install && cd webview-ui && npm install && cd .. && npm run build
```

- `npm run dev` — Vite dev server + Electron (wait-on gated); `npm start` — build + run built app
- `npm run build` — check (types+lint) → tsc electron → vite webview; `npm run package` — electron-builder (dmg/AppImage/nsis)
- `npm run check-types` covers src/core/, electron/, webview-ui/; `npm run lint` covers src/ +
  electron/ (webview has its own flat config). Both run with `--max-warnings=0`, so a warning
  fails the build — it used to be that three `react-hooks` CORRECTNESS rules were downgraded to
  `warn`, 30 of them were outstanding, and eslint still exited 0, which is not a gate.
  `react-hooks/immutability` is `off` for exactly three files, declared in
  `webview-ui/eslint.config.js` as THE IMPERATIVE BOUNDARY: the office is a canvas game loop whose
  state a rAF tick mutates 60 times a second, and the rule is describing that architecture rather
  than catching a slip. It is an error everywhere else, so adding a file to that list is a design
  decision someone has to make in a diff. Every other exception is an inline
  `eslint-disable-next-line` carrying its reason (measurement in a layout effect; an overlay that
  must read committed layout to sit on top of the canvas)
- `postinstall: electron-rebuild` rebuilds node-pty for Electron's ABI (`overrides.node-abi` pinned for new Electron majors)
- `npm test` / `npm run test:watch` — vitest over `src/**` + `electron/**` (suites include
  transcriptParser, actionSuggestions, fileWatcher, roles, achievements, claudeAuth, schedules,
  transcriptHistory, attention, worktrees, campusServer).
  `campusSocket.integration.test.ts` drives a REAL socket through the shipped client
  (`sendCampusCommand`), and its most important case is the one that would otherwise take the whole
  app down: a client killed mid-write emits EPIPE, and an unhandled socket 'error' kills the main
  process — every agent's host — over one interrupted CLI call. `worktrees.integration.test.ts` drives REAL git in a
  temp repo with HOME redirected — it asserts the isolation the feature exists for (an edit in one
  checkout leaves the repo untouched), so keep the HOME override if you touch it. `vitest.config.ts` scopes it. The webview has no DOM test setup and needs none, but its PURE
  modules ARE covered (`webview-ui/src/**/*.test.ts` — filePaths): component files stay out by
  matching only `*.test.ts`
- Husky pre-commit runs lint-staged (eslint --fix + prettier); CI: .github/workflows/ci.yml,
  release: .github/workflows/release.yml
- Tests live in `__tests__/` (every one of them — the electron-builder `files` list excludes
  those directories and `.map` files, so a stray test beside its module would otherwise ship
  inside the asar importing vitest, a devDependency)

Drive the built desktop app without a screen: `.claude/skills/run-desktop/` (SKILL.md + Playwright REPL `driver.mjs`, isolated HOME, screenshots/clicks/keys) — use it to verify UI, editor and furniture changes in the real app.

## TypeScript Constraints

- No `enum` (`erasableSyntaxOnly`) — use `as const` objects
- `import type` required for type-only imports (`verbatimModuleSyntax`)
- `noUnusedLocals` / `noUnusedParameters`

## Constants

All magic numbers and strings are centralized — never add inline constants to source files:

- **Backend (shared)**: `src/core/constants.ts` — timing intervals, display truncation limits,
  PNG/asset parsing values, `DATA_DIR_NAME` (`.pixel-agents`, the user-data dir every host module
  hangs its file off)
- **Electron host**: top of `electron/main.ts` — session scan/stale windows, PTY scrollback cap, window geometry
- **Webview**: `webview-ui/src/constants.ts` — grid/layout sizes, character animation speeds, matrix effect params, rendering offsets/colors, camera, zoom, editor defaults, game logic thresholds
- **CSS styling**: `webview-ui/src/index.css` `:root` block — `--pixel-*` custom properties for UI colors, backgrounds, borders, z-indices used in React inline styles
- **Canvas overlay colors** (rgba strings for seats, grids, ghosts, buttons) live in the webview constants file since they're used in canvas 2D context, not CSS
- `webview-ui/src/office/types.ts` re-exports grid/layout constants (`TILE_SIZE`, `DEFAULT_COLS`, etc.) from `constants.ts` for backward compatibility — import from either location

## Key Patterns

- Terminal `cwd` option sets working directory at creation
- `/add-dir <path>` grants session access to additional directory

## Key Decisions

- Webview is separate Vite project with own `node_modules`/`tsconfig`
