import { describe, expect, it } from 'vitest';

import {
  quitItemLabel,
  trayTooltip,
  windowCloseAction,
  type WindowCloseInputs,
} from '../backgroundMode.js';

const inputs = (over: Partial<WindowCloseInputs> = {}): WindowCloseInputs => ({
  platform: 'win32',
  liveAgents: 0,
  activeSchedules: 0,
  trayAvailable: true,
  quitting: false,
  ...over,
});

describe('windowCloseAction', () => {
  it('keeps macOS exactly as it was', () => {
    // The dock icon already means "running with no window", so nothing here
    // depends on agents, schedules or a tray.
    expect(windowCloseAction(inputs({ platform: 'darwin' }))).toBe('background');
    expect(
      windowCloseAction(inputs({ platform: 'darwin', liveAgents: 3, trayAvailable: false })),
    ).toBe('background');
  });

  it('quits when there is nothing to preserve', () => {
    expect(windowCloseAction(inputs())).toBe('quit');
    expect(windowCloseAction(inputs({ platform: 'linux' }))).toBe('quit');
  });

  it('backgrounds rather than killing agents mid-turn', () => {
    // The bug this exists for: closing the window on Windows ran
    // cleanupAndQuit() and took every PTY and SDK session with it.
    expect(windowCloseAction(inputs({ liveAgents: 1 }))).toBe('background');
  });

  it('reopens the window when agents are running and there is no tray', () => {
    // A Linux desktop with no tray support would otherwise leave a process
    // with no window, no icon and no way to stop it.
    expect(
      windowCloseAction(inputs({ platform: 'linux', liveAgents: 2, trayAvailable: false })),
    ).toBe('reopen');
  });

  it('outlives the window for an enabled schedule', () => {
    // Otherwise the scheduler and "Launch at Login" are macOS-only features.
    expect(windowCloseAction(inputs({ activeSchedules: 1 }))).toBe('background');
  });

  it('does not force a window back for a schedule alone', () => {
    // Nothing is destroyed by exiting: the next launch offers the run as
    // missed. Yanking the window open would be a worse trade.
    expect(windowCloseAction(inputs({ activeSchedules: 1, trayAvailable: false }))).toBe('quit');
  });

  it('stays out of the way of a quit already in progress', () => {
    // before-quit disposes the agents before the windows close, so a naive
    // read of this moment is "idle app, lots of schedules" — and would put a
    // tray icon up as the process exits.
    expect(windowCloseAction(inputs({ platform: 'darwin', quitting: true }))).toBe('quit');
    expect(windowCloseAction(inputs({ activeSchedules: 2, quitting: true }))).toBe('quit');
  });
});

describe('trayTooltip', () => {
  it('reports what the app is staying alive for', () => {
    expect(trayTooltip(1, 0)).toBe('Agent Campus — 1 agent running');
    expect(trayTooltip(3, 2)).toBe('Agent Campus — 3 agents running · 2 schedules');
    expect(trayTooltip(0, 1)).toBe('Agent Campus — 1 schedule');
  });

  it('says just the name when there is nothing to report', () => {
    expect(trayTooltip(0, 0)).toBe('Agent Campus');
  });
});

describe('quitItemLabel', () => {
  it('names the cost of quitting instead of asking', () => {
    expect(quitItemLabel(0)).toBe('Quit Agent Campus');
    expect(quitItemLabel(1)).toBe('Quit — stops 1 running agent');
    expect(quitItemLabel(4)).toBe('Quit — stops 4 running agents');
  });
});
