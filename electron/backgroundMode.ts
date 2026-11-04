/**
 * What closing the last window means.
 *
 * On macOS it has always meant "put the app away": the dock icon stays, the
 * agents keep working, reopening restores everything. Everywhere else the app
 * called `app.quit()`, which runs `cleanupAndQuit()` — every PTY killed, every
 * SDK session disposed, mid-turn or not. Closing a window is a WINDOW
 * gesture, and on Windows and Linux it was silently destroying work the user
 * never asked to stop. It also quietly made two shipped features
 * macOS-only: a scheduler that ticks every 30s cannot fire for an app that is
 * gone, and "Launch at Login" is meaningless without a windowless mode.
 *
 * Staying alive is only half an answer, though. An app with no window and no
 * dock icon is invisible: the user needs a way BACK and a way to quit, which
 * is what the tray icon is for. So the decision is three-valued, and the
 * reason it is pure and tested is that the bad outcomes are asymmetric —
 * quitting with agents running destroys work, and backgrounding with no tray
 * leaves a process nobody can see or stop.
 */

export type WindowCloseAction =
  /** Tear down and exit, as before — nothing is being preserved. */
  | 'quit'
  /** Keep running with no window; the tray icon is the way back. */
  | 'background'
  /** Keep running, but bring the window back: there is no tray to live in. */
  | 'reopen';

export interface WindowCloseInputs {
  platform: NodeJS.Platform;
  /** Agents still alive — PTY sessions and SDK chat sessions alike. */
  liveAgents: number;
  /** Enabled schedules; dispatch is the whole point of outliving the window. */
  activeSchedules: number;
  /** Whether a tray icon could actually be shown on this desktop. */
  trayAvailable: boolean;
  /**
   * True once a quit is already under way.
   *
   * Order matters here and is easy to get wrong: an explicit quit fires
   * `before-quit` FIRST, which tears every agent down, and only then closes
   * the windows — so this handler runs last, sees zero agents, and would
   * happily build a tray icon for an app that is in the middle of exiting.
   */
  quitting: boolean;
}

export function windowCloseAction({
  platform,
  liveAgents,
  activeSchedules,
  trayAvailable,
  quitting,
}: WindowCloseInputs): WindowCloseAction {
  // Windows closing on the way out of the app, not a window gesture.
  if (quitting) return 'quit';

  // macOS has the dock icon, so it needs no tray and asks no questions.
  if (platform === 'darwin') return 'background';

  if (liveAgents > 0) {
    // Work in flight outranks the surprise of a window coming back: a tray
    // we cannot create would leave the only way to stop these agents being
    // the task manager.
    return trayAvailable ? 'background' : 'reopen';
  }
  // A schedule is worth outliving the window for, but not worth forcing a
  // window the user just closed back open — nothing is lost if the app exits,
  // beyond a dispatch that the next launch picks up as a missed run anyway.
  if (activeSchedules > 0) return trayAvailable ? 'background' : 'quit';

  // Nothing running and nothing to wait for: a tray icon for an idle app is
  // clutter, and a lingering process is worse.
  return 'quit';
}

/**
 * The tray tooltip, which on Windows is the only place the state is readable
 * without opening the menu.
 */
export function trayTooltip(liveAgents: number, activeSchedules: number): string {
  const parts: string[] = [];
  if (liveAgents > 0) parts.push(`${liveAgents} agent${liveAgents === 1 ? '' : 's'} running`);
  if (activeSchedules > 0)
    parts.push(`${activeSchedules} schedule${activeSchedules === 1 ? '' : 's'}`);
  return parts.length > 0 ? `Agent Campus — ${parts.join(' · ')}` : 'Agent Campus';
}

/**
 * The label on the tray's Quit item.
 *
 * It names the cost instead of popping a confirmation dialog: there is no
 * window to host one, and a menu item that says what it will destroy is a
 * better guard than a modal that appears behind everything.
 */
export function quitItemLabel(liveAgents: number): string {
  if (liveAgents === 0) return 'Quit Agent Campus';
  return `Quit — stops ${liveAgents} running agent${liveAgents === 1 ? '' : 's'}`;
}
