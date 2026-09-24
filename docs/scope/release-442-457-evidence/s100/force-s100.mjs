// Forcing harness for the S100 nightly failure (run 36011270820), in the form
// of #441's S24 harness: scratch-only, never committed.
//
// It runs S100's own story function, imported from the tree under test, against
// an already-running no-fetch server at BASE_URL. It holds the responses a
// background repaint rides on until Event S8's third ArrowRight has reached the
// fullscreen chart. It then releases them and returns from that third key press
// only after the fullscreen chart has been rebuilt. S8's own readout assertion
// therefore always runs after the repaint the nightly suffered. That makes a
// PASS discriminating, not just a run where the race was lost.
//
//   PLAYWRIGHT_MODULE=<playwright dir> BASE_URL=http://127.0.0.1:8765 \
//   [VIEWPORT=1280x720] node force-s100.mjs <tree> [--mode case-file|focus] [--imports-only]
//
// Modes:
//   case-file  holds every GET /api/diagnose/finding-case-file the page issues
//              from the story's All charts tile click onward. The first one
//              is the drill's own case file, which S100 never waits for.
//   focus      holds every GET /api/focus and /api/guidance the page issues
//              after arrival, starting with the story's Diagnose press.
//              Diagnose's workstation.refresh() waits on these (diagnose.js).
//
// Prints one verdict line and exits with that verdict:
//   PASS S100            0 — held, released after the third key, rebuilt, story passed
//   FAIL S100 — <msg>    1 — held, released, rebuilt, and the story failed; <msg> is its own
//   VOID S100 — <why>    2 — the provocation did not happen (nothing held, or no
//                            rebuild); never counted as a pass or a fail
//   FATAL: <why>         3 — environment: no driver, no server, bad tree
//
// The tree's opener (`openApp`) is reused unchanged. It installs a catch-all
// page route that calls route.continue(), so a hold route must be registered
// after it (Playwright runs the most recently registered route first). The
// browser handed to openApp is therefore wrapped: the hold route and the
// in-page listeners go in right after openApp's own route, before its
// navigation.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STORY = 'S100';
const MODES = {
  'case-file': (path) => path === '/api/diagnose/finding-case-file',
  focus: (path) => path === '/api/focus' || path === '/api/guidance',
};

function fatal(message) {
  process.stdout.write(`FATAL: ${message}\n`);
  process.exit(3);
}

const args = process.argv.slice(2);
const tree = args[0] && !args[0].startsWith('--') ? resolve(args[0]) : null;
if (!tree) fatal('usage: node force-s100.mjs <tree> [--mode case-file|focus] [--imports-only]');
const modeAt = args.indexOf('--mode');
const mode = modeAt === -1 ? 'case-file' : args[modeAt + 1];
if (!MODES[mode]) fatal(`--mode must be one of ${Object.keys(MODES).join(', ')}, not ${JSON.stringify(mode)}`);
const importsOnly = args.includes('--imports-only');
const replayPath = join(tree, 'frontend/desk-behavior.replay.mjs');
if (!existsSync(replayPath)) fatal(`${tree} has no frontend/desk-behavior.replay.mjs`);

// The replay reads TARGET, BASE_URL and VIEWPORT when it is evaluated.
process.env.TARGET = 'app';
process.env.BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
process.env.VIEWPORT = process.env.VIEWPORT || '1280x720';
const BASE_URL = process.env.BASE_URL;
const viewport = process.env.VIEWPORT;

const imported = (relative) => import(pathToFileURL(join(tree, relative)).href);
const replay = await imported('frontend/desk-behavior.replay.mjs');
const { C2_STORIES } = await imported('frontend/c2.replay.mjs');
const { C3_STORIES } = await imported('frontend/c3.replay.mjs');
const { C4_STORIES } = await imported('frontend/c4.replay.mjs');
const { storyCase } = await imported('frontend/replay-cases.mjs');
const entry = replay.REGISTRY.find(([id]) => id === STORY) || fatal(`${tree}'s registry has no ${STORY}`);
const [, fn, state] = entry;
// main()'s own dispatch line (desk-behavior.replay.mjs main()).
const body = C4_STORIES[STORY] || C3_STORIES[STORY] || C2_STORIES[STORY] || fn;
const caseName = storyCase(STORY, process.env.STORY_CASES || '');

if (importsOnly) {
  process.stdout.write(`# imports ok tree=${tree} story=${STORY} case=${caseName} mode=${mode} `
    + `body=${body === fn ? 'registry' : 'C-override'} opener=${typeof replay.openApp}\n`);
  process.exit(0);
}

const require = createRequire(import.meta.url);
if (!process.env.PLAYWRIGHT_MODULE) fatal('PLAYWRIGHT_MODULE is required — this harness never skips');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const { createBrowserRunner } = require(join(tree, 'frontend/browser-runner.js'));

if (!['127.0.0.1', 'localhost'].includes(new URL(BASE_URL).hostname)) fatal(`BASE_URL must be localhost, got ${BASE_URL}`);
try {
  const status = await fetch(`${BASE_URL}/api/status`, { signal: AbortSignal.timeout(3000) });
  if (!status.ok) fatal(`${BASE_URL}/api/status answered ${status.status}`);
} catch (error) {
  fatal(`no server at ${BASE_URL} (${error.message}) — start the no-fetch server first (force-s100.sh does)`);
}

/* ------------------------------------------------------------- provocation */

// In-page, before any app script: the catalog tile click that starts the drill
// arms the case-file hold, and every ArrowRight that reaches the chart is counted.
function listen() {
  if (window.__forceS100) return;
  const state = window.__forceS100 = { armed: false, armedBy: null, keys: 0, before: null };
  window.addEventListener('click', (event) => {
    const tile = event.target instanceof Element && event.target.closest('#tile-row .evidence-tile');
    if (tile && !state.armed) { state.armed = true; state.armedBy = tile.dataset.chartId; }
  }, true);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' && event.target instanceof Element
      && event.target.closest('#ec-chart')) state.keys += 1;
  }, true);
}

const held = [];
let arrivalDone = false;
let release;
const gate = new Promise((resolveGate) => { release = resolveGate; });
const provocation = { released: false, heldAtRelease: 0, paths: [], rebuiltMs: null, armedBy: null };

async function shouldHold(page, request) {
  if (provocation.released || request.method() !== 'GET') return false;
  if (!MODES[mode](new URL(request.url()).pathname)) return false;
  if (mode === 'focus') return arrivalDone;
  // case-file: only once the story's tile click has armed the page.
  return page.evaluate(() => Boolean(window.__forceS100?.armed)).catch(() => false);
}

async function installHold(page, registerRoute) {
  await page.addInitScript(listen);
  await registerRoute((url) => Boolean(MODES[mode](url.pathname)), async (route) => {
    const request = route.request();
    if (!await shouldHold(page, request)) return route.fallback();
    const path = new URL(request.url()).pathname;
    held.push(path);
    // Fetch now, so the server has answered before release; fulfil at release,
    // so the response lands in the page right after the third key.
    let response = null;
    try { response = await route.fetch({ timeout: 120000 }); } catch { response = null; }
    await gate;
    try {
      if (response) await route.fulfill({ response });
      else await route.continue();
    } catch { /* the page closed first */ }
  });
}

async function releaseAndSettle(page) {
  if (provocation.released) return;
  await page.evaluate(() => { window.__forceS100.before = document.querySelector('#tile-focal #ec-chart'); });
  provocation.released = true;
  provocation.heldAtRelease = held.length;
  provocation.paths = [...held];
  provocation.armedBy = await page.evaluate(() => window.__forceS100.armedBy).catch(() => null);
  process.stdout.write(`# releasing ${held.length} held response(s) after the third ArrowRight: ${held.join(' ')}\n`);
  const started = performance.now();
  release();
  if (held.length === 0) return;
  try {
    await page.waitForFunction(() => {
      const now = document.querySelector('#tile-focal #ec-chart');
      return Boolean(now) && now !== window.__forceS100.before;
    }, null, { timeout: 20000, polling: 25 });
    provocation.rebuiltMs = performance.now() - started;
    process.stdout.write(`# fullscreen chart rebuilt ${provocation.rebuiltMs.toFixed(1)} ms after release\n`);
  } catch {
    process.stdout.write('# fullscreen chart was NOT rebuilt within 20000 ms of release\n');
  }
}

/* -------------------------------------------------------------------- run */

const runner = createBrowserRunner(() => chromium.launch());
let page = null;
let LocatorProto = null;
let originalPress = null;
let outcome = null;
const started = performance.now();
process.stdout.write(`# force-s100 tree=${tree} mode=${mode} viewport=${viewport} base=${BASE_URL} case=${caseName}\n`);
try {
  const browser = await runner.browser();
  // openApp creates its own context and page. Hand it a browser whose pages
  // register the hold route right after openApp's catch-all, before navigation.
  const wrapped = {
    newContext: async (options) => {
      const context = await browser.newContext(options);
      const newPage = context.newPage.bind(context);
      context.newPage = async () => {
        const created = await newPage();
        const route = created.route.bind(created);
        let installed = false;
        created.route = async (url, handler, routeOptions) => {
          await route(url, handler, routeOptions);
          if (url === '**/*' && !installed) {
            installed = true;
            await installHold(created, (matcher, holder) => route(matcher, holder));
          }
        };
        return created;
      };
      return context;
    },
  };
  const open = async (options) => replay.openApp(wrapped, options);
  const opened = await open({ ...state, viewport, storyId: STORY, caseName });
  page = opened.page;
  arrivalDone = true;
  if (!await page.evaluate(() => Boolean(window.__forceS100))) {
    throw new Error('harness: the in-page listeners did not install');
  }
  LocatorProto = Object.getPrototypeOf(page.locator('body'));
  originalPress = LocatorProto.press;
  LocatorProto.press = async function press(key, options) {
    const result = await originalPress.call(this, key, options);
    if (key === 'ArrowRight' && !provocation.released) {
      const keys = await page.evaluate(() => window.__forceS100?.keys ?? 0).catch(() => 0);
      if (keys >= 3) await releaseAndSettle(page);
    }
    return result;
  };
  try {
    await body(page, { ...opened, viewport, open, target: 'app', caseName });
    outcome = { passed: true };
  } catch (error) {
    outcome = { passed: false, message: error && error.message ? error.message : String(error) };
  }
} catch (error) {
  outcome = { passed: false, harness: true, message: error && error.message ? error.message : String(error) };
} finally {
  if (LocatorProto && originalPress) LocatorProto.press = originalPress;
  release();
  if (page) await page.context().close().catch(() => {});
  await runner.close().catch(() => {});
}

const story = outcome.passed ? 'PASS' : `FAIL — ${outcome.message}`;
process.stdout.write(`# story-time ${STORY} milliseconds=${(performance.now() - started).toFixed(3)}\n`);
let code;
if (outcome.harness) {
  process.stdout.write(`VOID ${STORY} — harness error before the story ran: ${outcome.message}\n`);
  code = 2;
} else if (!provocation.released) {
  process.stdout.write(`VOID ${STORY} — the story never delivered a third ArrowRight to the chart; story said ${story}\n`);
  code = 2;
} else if (provocation.heldAtRelease === 0) {
  process.stdout.write(`VOID ${STORY} — no ${mode} response was in flight at the third ArrowRight; story said ${story}\n`);
  code = 2;
} else if (provocation.rebuiltMs === null) {
  process.stdout.write(`VOID ${STORY} — the released responses did not rebuild the fullscreen chart; story said ${story}\n`);
  code = 2;
} else if (outcome.passed) {
  process.stdout.write(`PASS ${STORY}\n`);
  code = 0;
} else {
  process.stdout.write(`FAIL ${STORY} — ${outcome.message}\n`);
  code = 1;
}
process.exit(code);
