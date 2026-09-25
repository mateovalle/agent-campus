/**
 * Layout validation.
 *
 * This module used to own a single `~/.pixel-agents/layout.json` — the one
 * office the VS Code host had, shared across its windows, hence the atomic
 * write and the cross-window watcher that lived here. The campus replaced
 * that with one layout file per workspace (`~/.pixel-agents/layouts/`, owned
 * by electron/main.ts) and the VS Code host is gone, so all of that was
 * removed; the legacy file is no longer read, written or watched by anything.
 *
 * What is still shared is the check every path that accepts a layout from
 * outside has to make.
 */

/**
 * Basic structural validation shared by every path that accepts a layout
 * from outside (import dialog, IPC): version 1 with a tiles array.
 */
export function isValidLayout(layout: unknown): layout is Record<string, unknown> {
  return (
    typeof layout === 'object' &&
    layout !== null &&
    (layout as Record<string, unknown>).version === 1 &&
    Array.isArray((layout as Record<string, unknown>).tiles)
  );
}
