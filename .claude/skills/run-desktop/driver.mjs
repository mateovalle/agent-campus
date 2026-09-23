// REPL driver for the Agent Campus Electron app, for agents without a screen.
// Launches the BUILT app (dist-electron + dist/webview) under Playwright with
// an ISOLATED HOME so the user's real ~/.pixel-agents (layouts, workspaces,
// schedules) is never read or written. Commands arrive one per line on stdin;
// output goes to stdout. See SKILL.md for the FIFO/tmux wrapping.
//
// Requires playwright-core resolvable from the repo root:
//   npm i --no-save playwright-core
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(path.join(APP_DIR, 'package.json'));
const { _electron: electron } = require('playwright-core');

const OUT_DIR =
  process.env.PA_DRIVER_OUT || path.join(APP_DIR, '.claude', 'skills', 'run-desktop', 'out');
const HOME_DIR = process.env.PA_DRIVER_HOME || path.join(OUT_DIR, 'home');
const WS_DIR = path.join(HOME_DIR, 'ws');
const DATA_DIR = path.join(HOME_DIR, '.pixel-agents');
fs.mkdirSync(OUT_DIR, { recursive: true });

const electronBin =
  process.platform === 'darwin'
    ? path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : path.join(APP_DIR, 'node_modules/electron/dist/electron');

/** Per-workspace layout file name, mirroring electron/main.ts workspaceLayoutPath(). */
const layoutFileFor = (wsPath) =>
  path.join(DATA_DIR, 'layouts', `${wsPath.replace(/[^a-zA-Z0-9-]/g, '-')}.json`);

/** Fresh isolated HOME with one workspace and no saved layouts (→ bundled default). */
function resetHome() {
  fs.rmSync(HOME_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(DATA_DIR, 'layouts'), { recursive: true });
  fs.mkdirSync(WS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, 'workspaces.json'),
    JSON.stringify({ workspaces: [{ path: WS_DIR, name: 'ws', addedAt: 1, lastUsedAt: 2 }] }),
  );
}

let app = null;
let page = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const need = () => {
  if (!page) throw new Error('launch first');
};

const COMMANDS = {
  /** reset — wipe the isolated HOME (default layout on next launch). */
  async reset() {
    resetHome();
    console.log('home reset:', HOME_DIR);
  },
  /** layout <file.json> — use this OfficeLayout as the test workspace's layout (before launch). */
  async layout(file) {
    if (!fs.existsSync(DATA_DIR)) resetHome();
    fs.copyFileSync(path.resolve(file), layoutFileFor(WS_DIR));
    console.log('layout installed for', WS_DIR);
  },
  /** launch — start the built app; prints window URLs and viewport (CSS px + DPR). */
  async launch() {
    if (app) return console.log('already launched');
    if (!fs.existsSync(DATA_DIR)) resetHome();
    app = await electron.launch({
      executablePath: electronBin,
      args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), APP_DIR],
      env: { ...process.env, HOME: HOME_DIR, DISPLAY: process.env.DISPLAY || ':99' },
      timeout: 60_000,
    });
    // No clean "ready" signal: wait for the webview's canvas to exist.
    page = await app.firstWindow();
    await page.waitForSelector('canvas', { timeout: 30_000 });
    await sleep(2500); // assets + layoutLoaded settle
    console.log(
      'launched:',
      app
        .windows()
        .map((w) => w.url())
        .join(', '),
    );
    console.log(
      'viewport:',
      await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]),
    );
  },
  /** ss [name] — screenshot to OUT_DIR/<name>.png (device pixels = CSS px × DPR). */
  async ss(name) {
    need();
    const f = path.join(OUT_DIR, `${name || `ss-${Date.now()}`}.png`);
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },
  /** click <css-selector> — DOM .click() (toolbar buttons have aria-label="Layout" etc.). */
  async click(sel) {
    need();
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'OK';
    }, sel);
    console.log('click', sel, '->', r);
  },
  /** xy <x> <y> — mouse click at CSS px (screenshot px ÷ DPR). Hits the office canvas. */
  async xy(x, y) {
    need();
    await page.mouse.click(Number(x), Number(y));
    console.log('clicked', x, y);
  },
  /** move <x> <y> — hover at CSS px (tooltips, ghost previews). */
  async move(x, y) {
    need();
    await page.mouse.move(Number(x), Number(y));
    console.log('moved', x, y);
  },
  /** key <Key> — Playwright key name: r, Escape, Delete, Control+z … */
  async key(k) {
    need();
    await page.keyboard.press(k);
    console.log('key', k);
  },
  /** text — first 1500 chars of body innerText (what's on screen, minus the canvas). */
  async text() {
    need();
    console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1500));
  },
  /** eval <js…> — evaluate in the renderer and print the result. */
  async eval(...src) {
    need();
    console.log(await page.evaluate(src.join(' ')));
  },
  /** quit — close the app and exit. */
  async quit() {
    await app?.close();
    process.exit(0);
  },
  async help() {
    console.log(Object.keys(COMMANDS).join(' '));
  },
};

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  const [cmd, ...args] = line.trim().split(/\s+/);
  if (!cmd) return;
  try {
    if (!COMMANDS[cmd]) console.log('unknown command:', cmd, '(try: help)');
    else await COMMANDS[cmd](...args);
  } catch (e) {
    console.log('ERR', e.message);
  }
  console.log('> done');
});
rl.on('close', async () => {
  await app?.close();
  process.exit(0);
});
