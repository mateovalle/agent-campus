---
name: run-desktop
description: >-
  Launch and drive the built Agent Campus Electron app without a screen —
  screenshots, clicks on the office canvas, keyboard shortcuts, the layout
  editor — through a Playwright REPL driver with an ISOLATED HOME so the
  user's real ~/.pixel-agents is never touched. Use to verify a UI or
  furniture/layout change in the real app (not just tests).
---

# Run the desktop app (headless-friendly)

`driver.mjs` in this folder launches `node_modules/electron` on the built app
and reads one command per line from stdin. The app sees `HOME=<out>/home`, an
isolated dir with one workspace (`ws`) and no saved layouts, so it opens the
bundled default office; install a specific layout with `layout <file>`.

## Prerequisites

```bash
npm run build:electron && npm run build:webview   # driver runs dist/, rebuild after every change
npm i --no-save playwright-core                    # not a project dep; --no-save keeps package.json clean
```

Linux containers additionally need `xvfb-run -a` in front of `node` and the
Chromium shared libs (`libnss3 libgbm1 libasound2t64 libgtk-3-0 libxss1`).

## Driving it

macOS has no tmux by default, so use a FIFO as stdin and a log for output:

```bash
D=.claude/skills/run-desktop; cd $D && rm -f cmd.fifo && mkfifo cmd.fifo
(nohup node driver.mjs < cmd.fifo > log.txt 2>&1 &)
(nohup sleep 100000 > cmd.fifo 2>/dev/null &)     # holds the FIFO open between commands
echo launch > cmd.fifo; sleep 12                   # first launch takes ~10s
echo 'ss 01-start' > cmd.fifo; sleep 2; tail -3 log.txt
```

Then Read the PNG. Finish with `echo quit > cmd.fifo; pkill -f "sleep 100000"`.
(With tmux: `tmux new -d -s pa "node driver.mjs"` + `tmux send-keys -t pa 'launch' Enter`.)

Commands: `reset` · `layout <file.json>` · `launch` · `ss [name]` ·
`click <css>` · `xy <x> <y>` · `move <x> <y>` · `key <Key>` · `text` ·
`eval <js>` · `quit` · `help`.

## Coordinates

Screenshots are device pixels; `xy`/`move` take CSS px → divide screenshot
coordinates by the DPR printed at launch (2 on Retina). The window is
900×668 CSS px; zoom in/out with `xy 28 28` / `xy 28 72` (the +/− buttons).

## Recipes

- Layout editor: `click [aria-label="Layout"]` (floating toolbar icons carry
  `aria-label`s: Assistant, Board, + Workspace, Layout, Settings). Select
  furniture with `xy` on it, then `key r` rotates, `key Delete` deletes,
  `key Escape` deselects.
- Test a layout: write an OfficeLayout JSON (`{version:1, cols, rows, tiles,
  tileColors, furniture:[{uid,type,col,row}]}`; tile 0 = wall, 8 = void,
  1–7 floor patterns), `layout that.json` BEFORE `launch`.
- Default office check: `reset` then `launch` (nothing saved → bundled
  `webview-ui/public/assets/default-layout.json`).

## Gotchas

- Rebuild before launching — it runs `dist/`, not source.
- A stale `<out>/home/.pixel-agents/layout.json` from a previous launch
  overrides the bundled default; `reset` wipes it.
- The app writes the default layout into its HOME on first launch; that's
  the isolated dir, not the user's.
- No schedules are seeded, so nothing dispatches agents on its own; don't
  click "+ Agent" unless you intend to spawn a real Claude session.
