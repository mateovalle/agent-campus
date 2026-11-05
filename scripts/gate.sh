#!/usr/bin/env bash
#
# The gate CI used to be.
#
# GitHub Actions is off for this project, so nothing checks a change unless
# someone runs it. This is that someone's one command: the same steps the
# `check` job ran, in the same order, failing on the first one that fails.
#
# What it CANNOT do, and no local script can: the Windows and Linux legs.
# Those found real bugs here twice — `path.resolve` unable to reconcile 8.3
# short names and junctions (a worktree offered for removal, with force,
# while an agent worked in it), and `os.homedir()` reading USERPROFILE rather
# than HOME (a suite writing into the real user profile). Treat anything
# touching paths, home directories or child processes as unverified on those
# platforms, and reach for the pure-function-plus-test shape rather than
# trusting a local green.
#
#   npm run gate              everything, including packaging
#   npm run gate -- --quick   skip the packaging step (~1 min faster)
#
set -euo pipefail

quick=false
[[ "${1:-}" == "--quick" ]] && quick=true

step() {
  printf '\n\033[1m── %s\033[0m\n' "$1"
}

step "Type-check (src, electron, webview)"
npm run check-types

step "Lint (src, electron)"
npm run lint

step "Lint (webview)"
npm run lint:webview

step "Formatting"
npm run format:check

step "Tests"
npm test

# The usage ledger buckets by local calendar day, so it is one of the few
# places where the machine's timezone is part of the contract. CI never
# caught this: it runs on UTC, where the assertions are never stressed.
step "Tests (other timezones)"
for tz in America/New_York Europe/Berlin Australia/Lord_Howe; do
  printf '  %s ... ' "$tz"
  TZ="$tz" npx vitest run electron/__tests__/usage.test.ts >/dev/null 2>&1 && echo ok
done

step "Build"
npm run build:electron
npm run build:webview

if [[ "$quick" == true ]]; then
  printf '\n\033[1m── Skipped packaging (--quick)\033[0m\n'
  printf '\n\033[32mGATE PASSED\033[0m (Windows and Linux unverified)\n'
  exit 0
fi

step "Package (unpacked)"
npx electron-builder --dir >/dev/null

# Where electron-builder puts an unpacked build differs per platform, so
# find the app.asar rather than assume a path — and fail loudly if it is not
# there, because a gate that silently checks nothing is worse than no gate.
asar=$(find release -name 'app.asar' -maxdepth 6 -print -quit)
[[ -n "$asar" ]] || { echo "could not find app.asar under release/ — did packaging run?"; exit 1; }
resources=$(dirname "$asar")

step "Our own build output carries no tests and no sourcemaps"
# Encodes a bug this gate was added for: a test file beside its module
# compiled into dist-electron and shipped INSIDE the asar, importing vitest —
# a devDependency absent from the installed app. Scoped to what we build:
# node-pty ships its own .test.js and .map files.
npx @electron/asar list "$asar" > /tmp/asar-contents.txt
if grep -vE '^/node_modules/' /tmp/asar-contents.txt | grep -E '__tests__|\.test\.js|\.map$'; then
  echo "the lines above should not be in the packaged app"
  exit 1
fi

step "Resources the app reads from disk are there"
# extraResources, not the asar: the tray icon is loaded by path, and a
# missing one fails the way missing icons always do — an empty image, no
# tray, and an app that quietly cannot be reopened.
for f in assets/icon.png assets/default-layout.json assets/furniture/furniture-catalog.json; do
  test -f "$resources/$f" || { echo "packaged app is missing resources/$f"; exit 1; }
done

printf '\n\033[32mGATE PASSED\033[0m (Windows and Linux unverified)\n'
