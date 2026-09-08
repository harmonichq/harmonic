// Behaviour replay for the Harmonic v2 desktop — the executable half of
// mockups/harmonic-v2-desktop.behavior.md.
//
// FROZEN. The ledger beside it carries the ★ FROZEN header, and these stories
// are the contract: 111 passed at 1280x720 and at 1440x900, 18 app-opener-only
// stories deferred, and one feature-specific negative proof per mock-applicable
// story. Raw output is retained under mockups/sweep/harmonic-v2-desktop/runs/.
//
// Those runs were produced by this file at sha256
// d3ba01e328c32418a2f2e477320ddd95357e2a5fc7a7ec70b41323b1d7819116. This header
// and the CLI banner below were rewritten afterwards, as metadata only; no
// story, selector, assertion, opener or registry entry changed.
//
// WHY THIS EXISTS: mockups/harmonic-v2-desktop.lock.md says what the surface
// looks like across 34 terms. It does not say that pressing the destination
// already in hand is the way back up, that a field owns Escape so a stray press
// cannot drop a draft, that the reading pane keeps its scroll only while its
// subject is unchanged, or that a Trial's Inspect nights opens the evidence that
// Trial was decided from rather than the current read's first-ranked concern.
//
//   PLAYWRIGHT_MODULE=<playwright> MOCK_BASE_URL=http://127.0.0.1:8080 \
//   [FONT_ASSETS=<font-assets.json>] TARGET=mock [ONLY=S1,S24] \
//   [VIEWPORT=1280x720] node frontend/harmonic-v2-desktop-behavior.replay.mjs
//
// TARGET is required and explicit — `mock` or `app`. There is no default.
//
//   TARGET=mock  the ★ LOCKED prototype, served over HTTP from the REPOSITORY
//                ROOT. Not from mockups/: the mock links ../frontend/*.css by
//                relative path, which a server rooted at mockups/ cannot resolve.
//   TARGET=app   the built, Python-served /v2/, at BASE_URL. The desk chunk of
//                #389 replaced the stub opener with the real one: the page, its
//                assets and every API read come from that server, and any
//                request that does not go to it fails the run with its URL
//                printed. A /v2/ that does not answer 200 fails loudly, naming
//                the missing surface and the build command. It never skips.
//                An entry marked app-opener-only still reports DEFERRED under
//                TARGET=mock, whether or not its body has been converted.
//
// FAILS CLOSED. A missing driver, ECharts bundle, mock file or fixture exits
// nonzero. An unroutable external request exits nonzero with its URL printed. A
// run that executed zero stories exits nonzero.
//
// TWO RULES THIS REVISION EXISTS TO ENFORCE, both learned from the run:
//
//   1. REACH THE SUBJECT THROUGH THE READER'S OWN CONTROLS. Registering a
//      ?source=/?state= pair is not proof the wanted substate rendered. Seven
//      stories asked for [data-journey="lane"] while still on the initial
//      Overview; the reader reaches all 48 slots through Explore's own
//      "All basal slots" roster row (journey.js:296, data-row="basal").
//   2. PRESS WHAT A READER CAN SEE. Nine stories matched the narrow-only
//      .gf-utility-strip, which is display:none above 700px
//      (harmonic-v2-glucose.css:471) — the visible launcher at a desktop
//      viewport is the footer's. activate()/visible() now take the first
//      VISIBLE match and fail loudly when every match is hidden.
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createBrowserRunner } = require('./browser-runner.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

export class ReplayError extends Error {}
const fail = (message) => { throw new ReplayError(message); };
export const ok = (condition, what) => { if (!condition) fail(what); };

/* --------------------------------------------------------------- environment */

// require(), not import(): PLAYWRIGHT_MODULE is a package DIRECTORY and
// playwright is CommonJS, both of which dynamic import refuses.
function playwright() {
  const spec = process.env.PLAYWRIGHT_MODULE
    ?? fail('PLAYWRIGHT_MODULE is required — this script never skips');
  return require(spec);
}

// Validated inside main(), so a bare run prints one clean FATAL line instead of
// a module-evaluation stack trace. It still fails closed either way.
const TARGET = process.env.TARGET || '';
const MOCK_BASE_URL = (process.env.MOCK_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const APP_BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
// HV2-02 says v1 and /v2/ coexist against the same AUTHENTICATED API. The
// declared QA server runs with an empty token, so it can show the two surfaces
// sharing one API and one database but cannot show the boundary refusing an
// unauthenticated read. A second server, started with a token, is what proves
// that half; S87 names the exact command when these are unset.
const AUTH_BASE_URL = (process.env.AUTH_BASE_URL || '').replace(/\/$/, '');
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

// The lock's own target viewports (HV2-03, HV2-04). Never a driver default.
const VIEWPORTS = { '1280x720': { width: 1280, height: 720 }, '1440x900': { width: 1440, height: 900 } };
const DEFAULT_VIEWPORT = process.env.VIEWPORT || '1280x720';

function requireEnvironment() {
  if (TARGET !== 'mock' && TARGET !== 'app') {
    fail(`TARGET is required and must be "mock" or "app", not ${JSON.stringify(TARGET)} — there is no default opener`);
  }
  if (!VIEWPORTS[DEFAULT_VIEWPORT]) {
    fail(`VIEWPORT must be one of ${Object.keys(VIEWPORTS).join(', ')} — the lock names no others`);
  }
}

// The mock's own closed sets. A story asking for anything else is an unsupported
// state and fails rather than quietly rendering something adjacent.
const SOURCES = ['meals', 'setting', 'focus', 'journey'];   // harmonic-v2-glucose.js:82
const STATES = ['investigate', 'active', 'ready', 'history', 'quiet', 'error']; // _shell.js:19

/* ------------------------------------------------- required local assets */

const ECHARTS_FILE = join(REPO, 'node_modules', 'echarts', 'dist', 'echarts.min.js');
const MOCK_FILE = join(REPO, 'mockups', 'harmonic-v2-glucose.html');
const FIXTURES = [
  'mockups/harmonic-v2.exploration/evidence.json',
  'mockups/harmonic-v2.exploration/workstation.json',
  'mockups/harmonic-v2.exploration/setting.json',
  'mockups/harmonic-v2.exploration/focus.json',
  'mockups/harmonic-v2.exploration/journey.json',
  'mockups/harmonic-v2.exploration/utilities.json',
  'mockups/verify-660-story.synthetic/payload.json',
];

function requireAssets() {
  const missing = [];
  if (!existsSync(ECHARTS_FILE)) missing.push(`${ECHARTS_FILE} — run npm ci`);
  if (!existsSync(MOCK_FILE)) missing.push(MOCK_FILE);
  for (const relative of FIXTURES) {
    if (!existsSync(join(REPO, relative))) missing.push(relative);
  }
  if (missing.length) fail(`required assets are absent:\n  ${missing.join('\n  ')}`);
}

/* ------------------------------------------------ exact external-URL policy */

const ECHARTS_URL = 'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js';
const FONTS_CSS_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
const FONTS_CSS_STUB = '/* Inter stubbed: computed type values are asserted, glyph rasterisation is not */';

// Font policy has two modes, and the run header prints which one ran.
//
//   real      FONT_ASSETS names a manifest of {url: {path, type}} — root's
//             first-hour probe produced exactly this shape by fetching the
//             locked HTML's own Inter CSS URL and its 7 font files once. Each
//             listed URL is fulfilled from its cached file, by EXACT match.
//   behaviour no manifest: the Inter stylesheet is served EMPTY, so it declares
//             no @font-face and fonts.gstatic.com is never requested. Computed
//             type values (family string, size, weight, line-height, tracking,
//             variant-numeric) are unaffected; glyph rasterisation falls back.
//
// Neither mode is fidelity evidence. Pixel fidelity belongs to the build's
// paired renders at both viewports, and production font/asset packaging belongs
// to the build brief — not to this opener.
export function loadFontAssets() {
  const manifest = process.env.FONT_ASSETS;
  if (!manifest) return { mode: 'behaviour', map: new Map() };
  if (!existsSync(manifest)) fail(`FONT_ASSETS names a manifest that does not exist: ${manifest}`);
  let parsed;
  try { parsed = JSON.parse(readFileSync(manifest, 'utf8')); }
  catch (error) { fail(`FONT_ASSETS is not readable JSON: ${manifest} — ${error.message}`); }
  const map = new Map();
  for (const [url, entry] of Object.entries(parsed)) {
    const path = entry && entry.path;
    if (!path) fail(`FONT_ASSETS entry for ${url} names no path`);
    if (!existsSync(path)) fail(`FONT_ASSETS entry for ${url} points at a missing file: ${path}`);
    map.set(url, { path, type: (entry && entry.type) || 'application/octet-stream' });
  }
  ok(map.size > 0, 'FONT_ASSETS is empty — a manifest with no URLs cannot supply fonts');
  return { mode: 'real', map };
}

/* ------------------------------------------------------------ mock harness */

// Prototype instrumentation, named by purpose and excluded from the inventory.
// Driving one to INSTALL a fixture state is permitted; story navigation then
// uses the reader's own controls. The mock has no other route to its failure,
// clock and capture states, and the built app reaches them from a real failed
// request or real elapsed time.
const HARNESS = {
  scenario: '[aria-label="Prototype scenario"]',
  source: '[aria-label="Evidence source"]',
  input: '[aria-label="Evidence input"]',
  settingClock: '[aria-label="Manufactured clock"]',
  pumpCapture: '[aria-label="Pump capture"]',
  settingSaveFails: '[aria-label="Next save fails"]',
  focusClock: '[aria-label="Focus clock"]',
  focusSaveFails: '[aria-label="Next Focus save fails"]',
  journeyClock: '[aria-label="Journey clock"]',
  journeySaveFails: '[aria-label="Next journey save fails"]',
  readFails: '[aria-label="Next read fails"]',
  utilitySaveFails: '[aria-label="Next utility save fails"]',
};

/** Choose a harness <select> option by a substring of its visible label. */
export async function harnessSelect(page, key, labelSubstring) {
  const selector = HARNESS[key] ?? fail(`unknown harness control ${key}`);
  const value = await page.evaluate(([s, needle]) => {
    const el = document.querySelector(s);
    if (!el) return { missing: true };
    const option = [...el.options].find((o) => o.textContent.includes(needle));
    if (!option) return { options: [...el.options].map((o) => o.textContent) };
    el.value = option.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { chosen: option.textContent };
  }, [selector, labelSubstring]);
  ok(!value.missing, `harness control ${key} (${selector}) is absent on this source`);
  ok(!value.options, `harness control ${key} has no option matching ${JSON.stringify(labelSubstring)}: ${JSON.stringify(value.options)}`);
  await page.waitForTimeout(250);
  return value.chosen;
}

/** Set a harness checkbox, e.g. to install the next save/read failure. */
export async function harnessCheck(page, key, on) {
  const selector = HARNESS[key] ?? fail(`unknown harness control ${key}`);
  const found = await page.evaluate(([s, value]) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.checked = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, [selector, Boolean(on)]);
  ok(found, `harness control ${key} (${selector}) is absent on this source`);
  await page.waitForTimeout(120);
}

/* --------------------------------------------------------------- the openers */

/** The ★ LOCKED prototype, served from the repository root. */
export async function openMock(browser, { source = 'journey', state = 'investigate', viewport = DEFAULT_VIEWPORT, fonts } = {}) {
  if (!SOURCES.includes(source)) fail(`unsupported mock source ${JSON.stringify(source)} — the capture serves ${SOURCES.join(', ')}`);
  if (!STATES.includes(state)) fail(`unsupported mock state ${JSON.stringify(state)} — the scaffold serves ${STATES.join(', ')}`);
  if (!VIEWPORTS[viewport]) fail(`unsupported viewport ${JSON.stringify(viewport)}`);
  // ?state= is the MEALS source's own control. Its Scenario and Input selects
  // carry .gf-meals-control, which harmonic-v2-glucose.css:179,:186,:264 hides
  // for setting, focus and journey — those sources own their frame through
  // their own clock instead. Asking for a scenario they do not honour produced
  // a silently cosmetic setup, so it is refused here and stories establish the
  // source-owned checkpoint with harnessSelect().
  if (source !== 'meals' && state !== 'investigate') {
    fail(`unsupported combination source=${source} state=${state}: the scenario select belongs to the meals source `
      + '(.gf-meals-control is hidden for the others). Open this source at its default and move its own clock instead.');
  }

  const context = await browser.newContext({ viewport: VIEWPORTS[viewport], colorScheme: 'dark' });
  const page = await context.newPage();

  const unrouted = [];
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(MOCK_BASE_URL + '/')) return route.continue();
    if (url === ECHARTS_URL) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(ECHARTS_FILE) });
    }
    const cached = fonts.map.get(url);
    if (cached) {
      return route.fulfill({ status: 200, contentType: cached.type, body: readFileSync(cached.path) });
    }
    if (url === FONTS_CSS_URL && fonts.mode === 'behaviour') {
      return route.fulfill({ status: 200, contentType: 'text/css', body: FONTS_CSS_STUB });
    }
    unrouted.push(url);
    return route.abort();
  });

  const target = `${MOCK_BASE_URL}/mockups/harmonic-v2-glucose.html?source=${source}&state=${state}`;
  const response = await page.goto(target, { waitUntil: 'domcontentloaded' });
  ok(response && response.ok(), `the mock did not load from ${target} — is a static server running at the repository ROOT?`);

  // The desk renders only after six fixture fetches resolve.
  await page.waitForSelector('.gf .pane', { timeout: 20000 });

  if (unrouted.length) fail(`unrouted external request(s): ${[...new Set(unrouted)].join(', ')}`);
  ok(!consoleErrors.length, `the mock logged console errors: ${consoleErrors.join(' | ')}`);

  // §4: the opener asserts the RENDERED state equals the REQUESTED one — and
  // reads that from the SERVED MARKUP, not only from the toolbar. Checking the
  // mockbar's source and the scenario select's value alone was cosmetic: they
  // both agreed while the desk showed something else entirely.
  const rendered = await page.evaluate(() => {
    const desk = document.querySelector('.gf');
    return {
      source: document.querySelector('.mockbar')?.dataset.source ?? null,
      state: document.querySelector('[aria-label="Prototype scenario"]')?.value ?? null,
      destination: document.querySelector('[data-destination][aria-current="page"]')?.dataset.destination ?? null,
      currentCount: document.querySelectorAll('[data-destination][aria-current="page"]').length,
      panes: desk ? desk.querySelectorAll('.pane').length : 0,
      loading: Boolean(desk && desk.querySelector('.gf-loading')),
    };
  });
  ok(rendered.source === source, `requested source=${source} but the mock rendered ${rendered.source}`);
  ok(rendered.state === state, `requested state=${state} but the mock rendered ${rendered.state}`);

  // The frame itself, from the markup the desk actually served.
  ok(!rendered.loading, 'the desk is still on its loading frame; no served state to assert against');
  ok(rendered.panes > 0, 'the desk rendered no pane');
  ok(rendered.currentCount === 1,
    `exactly one destination must be current on arrival, found ${rendered.currentCount}`);
  // glucose.js:144 seats the initial destination, and the journey source's
  // arrive() re-seats Overview; only the meals history scenario opens Changes.
  const expected = source === 'meals' && state === 'history' ? 'changes' : 'overview';
  ok(rendered.destination === expected,
    `source=${source} state=${state} should arrive on ${expected}, but the served markup shows ${rendered.destination}`);

  return { page, context, consoleErrors, unrouted, target: 'mock', source, state, fonts };
}

/**
 * The built, Python-served `/v2/`.
 *
 * Unlike the mock opener this serves NOTHING itself: the page, its assets and
 * every API read come from the declared no-fetch server at BASE_URL. That is the
 * point — HV2-01 and HV2-02 are claims about what the packaged runtime serves,
 * and a driver that answered them from disk would prove nothing about delivery.
 *
 * The exact-external-request policy is therefore stricter here than on the mock:
 * the mock is allowed its cached ECharts and Inter, and the built app must ask
 * for NEITHER. Any request that does not go to BASE_URL fails the run with its
 * URL printed, which is how "no CDN in production" is observed rather than
 * asserted about the source.
 *
 * Fail-closed: a `/v2/` that does not answer 200 names the missing surface and
 * the build command; a desk still on its loading frame, with no pane, or on a
 * destination other than the requested one fails before any story runs.
 */
export async function openApp(browser, { source = null, state = 'investigate', viewport = DEFAULT_VIEWPORT, destination = 'overview' } = {}) {
  if (!VIEWPORTS[viewport]) fail(`unsupported viewport ${JSON.stringify(viewport)}`);
  // `source` and `state` are the MOCK's coordinates: four captured patients and
  // a scenario select. The app has one served database instead, so a story that
  // asks the app for a non-default scenario is asking for a state the database
  // must actually carry — the QA generator's job, not something to satisfy by
  // quietly rendering the default. Refused rather than ignored, for exactly the
  // reason openMock refuses `?state=` on a non-meals source.
  if (state !== 'investigate') {
    fail(`TARGET=app cannot honour state=${state}: the app has no scenario select. `
      + 'Extend scripts/qa_e2e_cases.py so the served database carries that state, then address it here.');
  }

  for (const origin of [APP_BASE_URL, AUTH_BASE_URL].filter(Boolean)) {
    const hostname = new URL(origin).hostname;
    if (!['127.0.0.1', 'localhost'].includes(hostname)) {
      fail(`a declared base URL must name localhost, got ${hostname}`);
    }
  }

  const context = await browser.newContext({ viewport: VIEWPORTS[viewport], colorScheme: 'dark' });
  const page = await context.newPage();

  const unrouted = [];
  const consoleErrors = [];
  const requests = [];
  // One-shot write failures a story installs at the exact boundary it wants to
  // fail. The prototype had a harness control for this; the app has a real
  // server that does not fail on request, so the failure is injected into the
  // one request it is about and nothing else — see S71.
  const failures = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  page.on('response', (response) => {
    const url = new URL(response.url());
    requests.push({ path: url.pathname, status: response.status(), headers: response.headers() });
  });

  const declared = (url) => [APP_BASE_URL, AUTH_BASE_URL]
    .filter(Boolean)
    .some((origin) => url === origin || url.startsWith(`${origin}/`));

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (!declared(url)) {
      unrouted.push(url);
      return route.abort();
    }
    const request = route.request();
    const path = new URL(url).pathname;
    const at = failures.findIndex((entry) => entry.method === request.method() && path.startsWith(entry.path));
    if (at !== -1) {
      failures.splice(at, 1);
      return route.fulfill({
        status: 503, contentType: 'application/json',
        body: JSON.stringify({ detail: 'no response from the store' }),
      });
    }
    return route.continue();
  });

  const target = `${APP_BASE_URL}/v2/${destination === 'overview' ? '' : `?to=${destination}`}`;
  const response = await page.goto(target, { waitUntil: 'domcontentloaded' });
  ok(response, `no response from ${target}`);
  ok(response.status() !== 404 && response.status() !== 503,
    `${target} answered ${response.status()} — the v2 build is missing or unserved.\n`
    + '  owed by: LOCK:harmonic-v2-desktop:HV2-01 (Python serves /v2/ and /v2/assets/)\n'
    + '  run `npm ci && npm run build`, then start the declared no-fetch server.');
  ok(response.ok(), `${target} answered ${response.status()}`);

  await page.waitForSelector('.gf .pane', { timeout: 20000 });

  if (unrouted.length) {
    fail(`the built app requested ${[...new Set(unrouted)].join(', ')} — production needs no CDN (HV2-01)`);
  }
  ok(!consoleErrors.length, `the app logged console errors: ${consoleErrors.join(' | ')}`);

  // §4: the opener asserts the RENDERED state equals the REQUESTED one, read
  // from the served markup rather than from the address.
  const rendered = await page.evaluate(() => {
    const surface = document.querySelector('.gf');
    return {
      destination: document.querySelector('[data-destination][aria-current="page"]')?.dataset.destination ?? null,
      currentCount: document.querySelectorAll('[data-destination][aria-current="page"]').length,
      panes: surface ? surface.querySelectorAll('.pane').length : 0,
      loading: Boolean(surface && surface.querySelector('.gf-loading')),
    };
  });
  ok(!rendered.loading, 'the desk is still on its loading frame; no served state to assert against');
  ok(rendered.panes > 0, 'the desk rendered no pane');
  ok(rendered.currentCount === 1,
    `exactly one destination must be current on arrival, found ${rendered.currentCount}`);
  ok(rendered.destination === destination,
    `requested ${destination} but the served markup shows ${rendered.destination}`);

  return {
    page, context, consoleErrors, unrouted, requests, target: 'app', source, state, viewport,
    /** Fail the NEXT request that matches, once, at that exact boundary. */
    failNext: (method, path) => failures.push({ method, path }),
  };
}

/* --------------------------------------------------------------- assertions */

const activeElement = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  return {
    tag: el.tagName,
    id: el.id || null,
    className: typeof el.className === 'string' ? el.className : null,
    text: (el.textContent || '').trim().slice(0, 60),
    data: { ...el.dataset },
  };
});

const box = (page, selector) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}, selector);

const computed = (page, selector, property) => page.evaluate(([s, p]) => {
  const el = document.querySelector(s);
  return el ? getComputedStyle(el).getPropertyValue(p).trim() : null;
}, [selector, property]);

const countOf = (page, selector) => page.evaluate((s) => document.querySelectorAll(s).length, selector);

const pressed = (page, selector) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return el ? el.getAttribute('aria-pressed') : null;
}, selector);

const rootScrolls = (page) => page.evaluate(() => {
  const el = document.scrollingElement || document.documentElement;
  return { v: el.scrollHeight - el.clientHeight, h: el.scrollWidth - el.clientWidth };
});

/** The desk's own rendered text. Read case-insensitively: the stylesheet
    uppercases heads and table columns, and innerText returns what is painted. */
const deskText = (page) => page.locator('.gf').innerText();

const destinationOf = (page) => page.evaluate(() =>
  document.querySelector('[data-destination][aria-current="page"]')?.dataset.destination ?? null);

/** The first VISIBLE match, or a loud failure naming how many were hidden. */
export async function visible(page, selector) {
  const all = page.locator(selector);
  const total = await all.count();
  ok(total > 0, `no control matched ${selector} — a story must drive the affordance a reader uses`);
  for (let i = 0; i < total; i += 1) {
    const candidate = all.nth(i);
    if (await candidate.isVisible()) return candidate;
  }
  fail(`${selector} matched ${total} element(s) and every one is hidden; a reader could press none of them`);
  return null;
}

/** Click through the affordance a reader would use. */
export async function activate(page, selector) {
  const locator = await visible(page, selector);
  await locator.click();
  await page.waitForTimeout(160);
}

/* ------------------------------------------------ reader-route setup helpers */

/** Move destination through the topbar, the way a reader does. */
export async function goto(page, destination) {
  await activate(page, `[data-destination="${destination}"]`);
  ok(await destinationOf(page) === destination,
    `pressing ${destination} did not arrive there (still ${await destinationOf(page)})`);
}

/**
 * Open all 48 basal slots the way a reader reaches them: Explore's roster
 * carries an "All basal slots" row (journey.js:296). This is the correction for
 * seven stories that asked for [data-journey="lane"] on the initial Overview.
 */
async function openBasalLane(page) {
  await goto(page, 'explore');
  await activate(page, '.gf-roster-row[data-row="basal"]');
  const cells = await countOf(page, '.lane-cell[data-cell]');
  ok(cells === 48, `the basal lane exposes ${cells} slots, not all 48`);
}

/** Open a roster row that is not the setting branch, so the shared
    investigation frame and its event comparison render. */
async function openComparisonCase(page) {
  await goto(page, 'explore');
  const rows = await page.evaluate(() => [...document.querySelectorAll('.gf-roster-row[data-row]')]
    .map((b) => b.dataset.row).filter((id) => id && id.startsWith('finding:')));
  ok(rows.length > 0, 'the roster serves no finding row to open a comparison from');
  await activate(page, `.gf-roster-row[data-row="${rows[0]}"]`);
  ok(await countOf(page, '.ec-surface[data-chart="comparison"]') === 1,
    'opening a finding row did not mount the event comparison');
}

/** Stage the setting branch and land in Changes, where Plan lives. */
export async function stageIntoPlan(page) {
  await activate(page, '[data-set="stage"]');
  ok(await destinationOf(page) === 'changes', 'staging did not land in Changes');
  ok(await countOf(page, '[data-set="save-draft"], [data-set="record"], [data-set="retry-save"]') > 0,
    'Changes did not render the Plan controls after staging');
}

/* ------------------------------------------------------------------ stories */

export const S1 = async (page) => {
  const order = await page.evaluate(() => [...document.querySelectorAll('nav.v2-nav [data-destination]')].map((b) => b.dataset.destination));
  ok(JSON.stringify(order) === JSON.stringify(['overview', 'explore', 'changes', 'day']),
    `the destination order is not the locked one: ${JSON.stringify(order)}`);
  const current = await page.evaluate(() => [...document.querySelectorAll('[data-destination][aria-current="page"]')].map((b) => b.dataset.destination));
  ok(JSON.stringify(current) === JSON.stringify(['overview']),
    `Overview is not the sole default destination: ${JSON.stringify(current)}`);
};

export const S2 = async (page) => {
  const before = await box(page, 'header.cockpit-topbar');
  for (const destination of ['explore', 'changes', 'day', 'overview']) {
    await goto(page, destination);
  }
  const after = await box(page, 'header.cockpit-topbar');
  ok(JSON.stringify(before) === JSON.stringify(after), 'the topbar moved across destination changes');
};

export const S3 = async (page) => {
  await goto(page, 'explore');
  const rows = await countOf(page, '.gf-roster-row[data-row]');
  ok(rows > 0, 'the journey source rendered no roster rows to drill into');
  await activate(page, '.gf-roster-row[data-row]');
  await activate(page, '[data-destination="explore"]');
  ok(await countOf(page, '.gf-roster-row[data-row]') >= rows,
    're-pressing Explore did not return to the findings index');
};

export const S4 = async (page) => {
  const chrome = await page.evaluate(() => ({
    identity: document.querySelector('.cockpit-identity')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    scope: document.querySelector('.cockpit-scope')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    carbs: document.querySelector('.cockpit-log-carbs')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    advisory: document.querySelector('.cockpit-advisory')?.textContent.trim() ?? null,
    utilities: [...document.querySelectorAll('nav.cockpit-utilities button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
  }));
  ok(/Harmonic/.test(chrome.identity || '') && /advisory/i.test(chrome.identity || ''),
    `the identity mark is not the locked one: ${chrome.identity}`);
  ok(/Scope/i.test(chrome.scope || '') && /30 d/.test(chrome.scope || ''), `scope reads ${chrome.scope}`);
  ok((chrome.carbs || '').includes('＋') && /Log carbs/i.test(chrome.carbs || ''),
    `Log carbs lost its U+FF0B mark: ${JSON.stringify(chrome.carbs)}`);
  ok(chrome.advisory === 'Advisory only — review with your clinician before changing pump settings.',
    `the advisory line drifted: ${JSON.stringify(chrome.advisory)}`);
  for (const label of ['Guide', 'Settings', 'Glossary']) {
    ok(chrome.utilities.some((t) => t.includes(label)), `the footer lost ${label}: ${JSON.stringify(chrome.utilities)}`);
  }
};

export const S5 = async (page, ctx) => {
  const rows = await computed(page, '.cockpit-shell', 'grid-template-rows');
  ok(rows, 'the cockpit shell declares no grid-template-rows');
  const parts = rows.split(/\s+/);
  const first = Math.round(parseFloat(parts[0]));
  const last = Math.round(parseFloat(parts[parts.length - 1]));
  const expected = ctx.viewport === '1440x900' ? [42, 26] : [38, 24];
  ok(first === expected[0] && last === expected[1],
    `at ${ctx.viewport} the shell rows are ${first}/${last}, not ${expected[0]}/${expected[1]}`);
};

export const S6 = async (page) => {
  const root = await rootScrolls(page);
  ok(root.v <= 1 && root.h <= 1, `the document scrolls at the root: ${JSON.stringify(root)}`);
  ok(await countOf(page, '.gf-pane-body') > 0, 'no owned reading-pane body exists to scroll inside');
};

export const S7 = async (page) => {
  const reading = await box(page, '.gf-desk > .gf-reading');
  ok(reading, 'the paired state has no reading pane');
  ok(Math.round(reading.w) === 300, `the reading pane is ${reading.w}px, not the locked 300px`);
  const stage = await box(page, '.gf-desk > .gf-stage');
  ok(stage && stage.w > reading.w, 'the evidence stage is not the flexible pane beside the reading pane');
};

export const S7b = async (page) => {
  await goto(page, 'changes');
  ok(await countOf(page, '.gf-stage-table .gf-empty') > 0, 'the empty Changes state did not render its empty frame');
  ok(await countOf(page, '.gf-desk > .gf-reading') === 0,
    'the empty Changes state manufactured a reading pane, which HV2-05 forbids');
};

export const S8 = async (page) => {
  const ladder = await page.evaluate(() => {
    const read = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    return ['--wk-canvas', '--wk-surface', '--wk-rule', '--wk-ink'].map((n) => [n, read(n)]);
  });
  for (const [name, value] of ladder) ok(value, `the shipped dark role token ${name} resolves to nothing`);
  ok(await countOf(page, '[data-theme], .theme-toggle, [aria-label*="theme" i]') === 0,
    'a theme control is present; the chooser and its storage are retired');
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => /theme/i.test(k)));
  ok(stored.length === 0, `theme storage is present: ${JSON.stringify(stored)}`);
};

export const S9 = async (page, ctx) => {
  const family = await computed(page, '.gf-title', 'font-family');
  ok(/Inter/i.test(family || ''), `the stage title family is ${family}, not Inter`);
  // On the app, the family must be RENDERED WITH, not merely declared. The mock
  // opener runs without the Inter binary by design (its own header says computed
  // type values are what it asserts), so this half belongs to the built surface,
  // which packages the font and may reach no CDN for it.
  if (ctx.target === 'app') {
    const inter = await page.evaluate(async () => {
      await document.fonts.ready;
      const faces = [...document.fonts].filter((face) => face.family.replace(/["']/g, '') === 'Inter');
      return {
        available: document.fonts.check('700 18px Inter'),
        loaded: faces.filter((face) => face.status === 'loaded').map((face) => face.weight),
        declared: faces.length,
      };
    });
    ok(inter.declared > 0, 'the built surface declares no Inter face at all');
    ok(inter.available, 'Inter is named but not available to render with; the desk is on a fallback');
    ok(inter.loaded.length > 0,
      `no Inter face actually loaded (${inter.declared} declared); the packaged font is not being served`);
  }
  const size = parseFloat(await computed(page, '.gf-title', 'font-size'));
  ok(Math.abs(size - 18.24) < 0.75, `the stage title is ${size}px, not the locked 1.14rem`);
  ok((await computed(page, '.gf-title', 'font-weight')) === '700', 'the stage title is not weight 700');
  const oversized = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4')]
    .map((el) => parseFloat(getComputedStyle(el).fontSize)).filter((n) => n > 24.5));
  ok(oversized.length === 0, `headings exceed the 1.5rem ceiling: ${JSON.stringify(oversized)}`);
};

export const S10 = async (page) => {
  // The 700px query is INHERITED behavior. Asserting that crossing it closes an
  // open sheet is not mobile admission: HV2-05 keeps the 701–1100 intermediate
  // rule as inherited, and mobile acceptance stays a later gate (tasks 4.1–4.3).
  await page.setViewportSize({ width: 680, height: 720 });
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => document.querySelector('.gf')?.dataset.sheet ?? null) === 'closed',
    'crossing the media query left the sheet open');
  await page.setViewportSize(VIEWPORTS['1280x720']);
  await page.waitForTimeout(250);
};

export const S10b = async (page, ctx) => {
  // The narrow sheet's own controls are inherited chrome, presented only below
  // 700px (harmonic-v2-glucose.css:48, :358). At the locked desktop viewports
  // they are not presented, and the desk shows both panes at once instead. Same
  // treatment as S59: the handlers are inventoried, and desktop acceptance is
  // not widened to a mobile design. HV2-05 keeps the 701–1100 intermediate rule
  // as inherited; mobile acceptance is a later gate.
  await goto(page, 'explore');
  const presented = await page.evaluate(() => [
    ...document.querySelectorAll('.gf-sheet-toggle, .gf-sheet-close, .gf-narrow-seat [data-seat], .gf-narrow-seat [data-mode]'),
  ].filter((el) => el.offsetParent !== null).map((el) => el.className));
  ok(presented.length === 0,
    `narrow-only sheet chrome is presented at ${ctx.viewport}: ${JSON.stringify(presented)}`);
  ok(await countOf(page, '.gf-desk > .gf-stage') === 1 && await countOf(page, '.gf-desk > .gf-reading') === 1,
    'the desktop desk does not show both panes at once, which is why it needs no sheet');
};

export const S11 = async (page) => {
  const reference = { top: await box(page, 'header.cockpit-topbar'), foot: await box(page, 'footer.cockpit-footer') };
  for (const destination of ['explore', 'changes', 'day']) {
    await goto(page, destination);
    ok(JSON.stringify(await box(page, 'header.cockpit-topbar')) === JSON.stringify(reference.top),
      `${destination} moved the topbar against Overview`);
    ok(JSON.stringify(await box(page, 'footer.cockpit-footer')) === JSON.stringify(reference.foot),
      `${destination} moved the footer against Overview`);
  }
};

export const S12 = async (page) => {
  // Corrected: the meals source's Explore IS the investigation frame, so the
  // comparison and its canvas head are present without drilling a roster.
  await goto(page, 'explore');
  const head = '#gf-fig1-head';
  const rest = await box(page, head);
  ok(rest, 'the comparison canvas head is absent');
  const chart = await visible(page, '.ec-surface[data-chart="comparison"]');
  await chart.hover({ position: { x: 200, y: 90 } });
  await page.waitForTimeout(300);
  const active = await box(page, head);
  ok(Math.abs(active.h - rest.h) < 1,
    `the canvas head grew on hover (${rest.h} → ${active.h}); it must reserve its space at rest`);
};

export const S13 = async (page, ctx) => {
  const widths = [];
  for (const source of SOURCES) {
    const opened = await ctx.open({ source, state: 'investigate', viewport: ctx.viewport });
    try {
      await goto(opened.page, 'explore');
      const pane = await box(opened.page, '.gf-desk > .gf-reading');
      if (pane) widths.push([source, Math.round(pane.w)]);
    } finally { await opened.context.close(); }
  }
  ok(widths.length > 1, 'fewer than two sources produced a reading pane to compare');
  ok(new Set(widths.map(([, w]) => w)).size === 1,
    `the reading pane resized with the data shape: ${JSON.stringify(widths)}`);
};

export const S14 = async (page) => {
  const heading = await page.locator('.gf-desk > .gf-reading > header h2').first().textContent();
  ok((heading || '').trim().length > 0, 'Overview rendered no reading-pane heading');
  const route = await visible(page, '[data-action="explore"]');
  ok(/^Inspect /i.test(((await route.textContent()) || '').trim()),
    `the Overview route is not an Inspect route: ${await route.textContent()}`);
  ok(await countOf(page, '.gf-desk > .gf-reading .gf-roster-row') === 0,
    'Overview duplicated Explore\'s findings roster');
};

export const S15 = async (page) => {
  await activate(page, '[data-action="aside"]');
  ok(await countOf(page, 'form[data-form="aside"]') === 1, 'Set aside did not open its form');
  const focused = await activeElement(page);
  ok(focused && focused.id === 'aside-reason', `the reason field did not take focus (got ${JSON.stringify(focused)})`);
  await page.fill('#aside-reason', 'not now');
  await (await visible(page, 'form[data-form="aside"] [type="submit"]')).click();
  await page.waitForTimeout(250);
  ok((await deskText(page)).includes('not now'), 'the recorded set-aside reason is not shown on the acknowledgment');
  ok(await countOf(page, '[data-action="restore"], [data-restore]') > 0,
    'the set-aside acknowledgment offers no visible Restore');
};

export const S16 = async (page) => {
  await activate(page, '[data-action="aside"]');
  await (await visible(page, 'form[data-form="aside"] [type="submit"]')).click();
  await page.waitForTimeout(250);
  await activate(page, '[data-action="restore"], [data-restore]');
  ok(await countOf(page, '[data-action="restore"], [data-restore]') === 0,
    'Restore left the set-aside state standing');
  ok(await countOf(page, '[data-action="aside"]') > 0, 'Restore did not return the eligible subject');
};

export const S17 = async (page) => {
  await activate(page, '[data-action="aside"]');
  await page.fill('#aside-reason', 'typed then cancelled');
  await activate(page, '[data-action="cancel-aside"]');
  ok(await countOf(page, 'form[data-form="aside"]') === 0, 'Cancel left the set-aside form open');
  ok(await countOf(page, '[data-action="restore"], [data-restore]') === 0,
    'Cancel recorded a set-aside that was never submitted');
  const focused = await activeElement(page);
  ok(focused && focused.data && focused.data.action === 'aside',
    `Cancel did not return focus to the control that opened it (got ${JSON.stringify(focused)})`);
};

export const S18 = async (page) => {
  const title = await page.locator('.gf-empty .gf-title').first().textContent();
  ok((title || '').trim() === 'No priority needs action', `the quiet state reads ${JSON.stringify(title)}`);
  ok(await countOf(page, '[data-action="day"]') > 0, 'the quiet state does not keep Day reachable');
  ok(!/unavailable/i.test(await page.locator('.gf-empty').first().innerText()),
    'the quiet state is making a failed-read claim');
};

export const S19 = async (page) => {
  const title = await page.locator('.gf-empty .gf-title').first().textContent();
  ok((title || '').trim() === 'Evidence unavailable', `the failed read reads ${JSON.stringify(title)}`);
  ok(await countOf(page, '[data-action="retry"]') === 1, 'the failed read offers no Retry');
};

export const S20 = async (page) => {
  await activate(page, '[data-action="retry"]');
  await page.waitForSelector('.gf .pane', { timeout: 20000 });
  ok(await page.evaluate(() => document.querySelector('[aria-label="Prototype scenario"]')?.value ?? null) === 'investigate',
    'Retry did not return the desk to its investigate read');
  ok(await countOf(page, '[data-action="retry"]') === 0, 'the error frame is still standing after a successful Retry');
};

export const S20b = async (page) => {
  // Corrected twice. setClock() IS the refresh trigger (journey.js:65), but
  // overviewFrame() checks settingB.active()/focusB.active() BEFORE memory.error
  // (:176-179), so a clock that engages a branch hides the failed frame — root's
  // run-2 capture landed on a readable Trial for exactly that reason. The note
  // and its Retry live in the ROSTER (:292), which Explore seats, so the story
  // goes there through the destination button a reader presses.
  await harnessCheck(page, 'readFails', true);
  await harnessSelect(page, 'journeyClock', 'pump captured');
  await goto(page, 'explore');

  ok(await countOf(page, '[data-journey="retry-read"]') > 0,
    'installing a read failure did not surface the Retry control in the roster');
  const failedText = await deskText(page);
  ok(/current read failed/i.test(failedText), 'the failed read does not say the read failed');
  ok(/last read that answered/i.test(failedText),
    'the failed read does not distinguish the stale answer from a new result');

  await activate(page, '[data-journey="retry-read"]');
  ok(await countOf(page, '[data-journey="retry-read"]') === 0,
    'a successful retry left the failed-read note standing');
  ok(!/current read failed/i.test(await deskText(page)),
    'a successful retry still claims the read failed');
};

export const S21 = async (page) => {
  await goto(page, 'explore');
  const rows = await page.evaluate(() => [...document.querySelectorAll('.gf-cohort-row[data-cohort]')].map((b) => ({
    key: b.dataset.cohort,
    support: b.dataset.support,
    mark: !!b.querySelector('.ec-key-item .ec-key-mark'),
    line: (b.querySelector('small')?.textContent || '').trim(),
  })));
  ok(rows.length > 1, `fewer than two cohorts rendered: ${JSON.stringify(rows)}`);
  for (const row of rows) {
    ok(row.support, `cohort ${row.key} rendered without its served support state`);
    ok(row.mark, `cohort ${row.key} lost the comparison key's own mark`);
    ok(row.line.length > 0, `cohort ${row.key} rendered no support line`);
  }
};

export const S22 = async (page) => {
  await goto(page, 'explore');
  const { keys, held } = await page.evaluate(() => ({
    keys: [...document.querySelectorAll('.gf-cohort-row[data-cohort]')].map((b) => b.dataset.cohort),
    held: document.querySelector('.gf-cohort-row[aria-pressed="true"]')?.dataset.cohort ?? null,
  }));
  const target = keys.find((k) => k !== held) ?? keys[0];
  await activate(page, `.gf-cohort-row[data-cohort="${target}"]`);
  ok(await pressed(page, `.gf-cohort-row[data-cohort="${target}"]`) === 'true',
    `pressing cohort ${target} did not hold it`);
  ok(await countOf(page, '.gf-member-row[aria-pressed="true"]') === 1,
    'holding a cohort left no single held member');
};

export const S23 = async (page) => {
  await goto(page, 'explore');
  ok(await countOf(page, '.gf-member-row[aria-pressed="true"]') === 1,
    'the stage opened without a held member');
  const { ids, held } = await page.evaluate(() => ({
    ids: [...document.querySelectorAll('.gf-member-row[data-occ]')].map((b) => b.dataset.occ),
    held: document.querySelector('.gf-member-row[aria-pressed="true"]')?.dataset.occ ?? null,
  }));
  ok(ids.length > 1, `the held cohort has ${ids.length} member(s); this story needs at least two`);
  const other = ids.find((id) => id !== held);
  await activate(page, `.gf-member-row[data-occ="${other}"]`);
  ok(await pressed(page, `.gf-member-row[data-occ="${other}"]`) === 'true', 'selecting a member did not hold it');
};

export const S24 = async (page) => {
  await goto(page, 'explore');
  const held = () => page.evaluate(() => document.querySelector('.gf-member-row[aria-pressed="true"]')?.dataset.occ ?? null);
  const ids = await page.evaluate(() => [...document.querySelectorAll('.gf-member-row[data-occ]')].map((b) => b.dataset.occ));
  ok(ids.length > 1, 'the held cohort has fewer than two members to step through');
  const start = await held();
  await activate(page, '[data-action="next-meal"]');
  ok(await held() !== start, 'Next occurrence did not move the held member');
  await activate(page, '[data-action="previous-meal"]');
  ok(await held() === start, 'Previous occurrence did not return to the prior member');
  for (let i = 0; i < ids.length; i += 1) await activate(page, '[data-action="next-meal"]');
  ok(await held() === start, 'stepping a full lap did not wrap back to the starting member');
};

export const S25 = async (page) => {
  await goto(page, 'explore');
  const steps = await countOf(page, '.gf-step-row[data-step]');
  ok(steps > 0, 'no model steps rendered — this story needs a member with an episode');
  await activate(page, '.gf-step-row[data-step="0"]');
  ok(await countOf(page, '.gf-step-row[aria-pressed="true"]') === 1, 'selecting a step did not hold it');
  const tiers = await page.evaluate(() => [...document.querySelectorAll('.gf-step-row .tier')].map((el) => el.dataset.tier));
  ok(tiers.every(Boolean), `a model step rendered without its served evidence tier: ${JSON.stringify(tiers)}`);
};

export const S26 = async (page) => {
  await goto(page, 'explore');
  ok(await countOf(page, '[data-figure]') >= 2, 'the Figure segment did not render both options');
  // The Episode control's disabled state is not free-floating: it tracks whether
  // the held member has a served episode link (harmonic-v2-glucose.js:161-164),
  // which the reading pane marks on its member rows.
  const state = await page.evaluate(() => ({
    disabled: document.querySelector('[data-figure="episode"]')?.disabled ?? null,
    hasEpisode: (document.querySelector('.gf-member-row[aria-pressed="true"] .n')?.textContent || '').trim() === 'episode',
  }));
  ok(state.disabled === !state.hasEpisode,
    `the Episode control is ${state.disabled ? 'disabled' : 'enabled'} while the held member ${state.hasEpisode ? 'has' : 'has no'} episode`);
  await activate(page, '[data-figure="day"]');
  ok(await pressed(page, '[data-figure="day"]') === 'true', 'the Day figure did not take the seat');
};

export const S27 = async (page) => {
  await goto(page, 'explore');
  const members = () => countOf(page, '.gf-member-row[data-occ]');
  const before = await members();
  await activate(page, '[data-window="full"]');
  ok(await pressed(page, '[data-window="full"]') === 'true', 'the full window did not take the segment');
  ok(await members() === before, 'moving the comparison window changed cohort membership');
  await activate(page, '[data-window="near"]');
  ok(await members() === before, 'returning the window changed cohort membership');
};

export const S28 = async (page) => {
  await goto(page, 'explore');
  ok(await countOf(page, '.ec-surface[data-chart="comparison"]') === 1,
    'the shipped comparison renderer did not mount exactly once');
  ok(await countOf(page, '#gf-fig1-head') === 1, 'the comparison headline host is absent or duplicated');
  const canvases = () => page.evaluate(() => document.querySelectorAll('.ec-surface canvas').length);
  const first = await canvases();
  ok(first > 0, 'the comparison mounted no canvas');
  for (let i = 0; i < 3; i += 1) {
    await goto(page, 'changes');
    await goto(page, 'explore');
  }
  ok(await canvases() === first, `re-entering Explore accumulated chart canvases (${first} → ${await canvases()})`);
};

export const S29 = async (page) => {
  await goto(page, 'explore');
  const { rows, open } = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('.gf-roster-row[data-row]')].map((b) => b.dataset.row),
    open: document.querySelector('.gf-roster-row[aria-pressed="true"]')?.dataset.row ?? null,
  }));
  ok(rows.length > 1, `the journey roster rendered ${rows.length} rows`);
  const closed = rows.find((id) => id !== open) ?? rows[rows.length - 1];
  await activate(page, `.gf-roster-row[data-row="${closed}"]`);
  const focused = await activeElement(page);
  ok(focused && focused.tag === 'H2', `opening a new subject did not focus the pane head (got ${JSON.stringify(focused)})`);
};

export const S30 = async (page) => {
  // Corrected: the Findings crumb is the lane head's kicker (basal.js:58), so
  // the lane must be in hand first.
  await openBasalLane(page);
  const crumb = await visible(page, '[data-journey="findings"]');
  ok(((await crumb.textContent()) || '').trim() === 'Findings', 'the parent crumb is not the locked word "Findings"');
  await crumb.click();
  await page.waitForTimeout(200);
  ok(await countOf(page, '.gf-roster-row[data-row]') > 0, 'the Findings crumb did not return to the index');
};

export const S31 = async (page) => {
  await openBasalLane(page);
  ok(await countOf(page, '.lane-cell[aria-pressed="true"]') === 1, 'the lane holds no single selected slot');
  ok(await countOf(page, '.lane-cell[data-cell]:not([disabled])') > 1,
    'the lane exposes only one reachable slot; every slot must stay discoverable');
};

export const S32 = async (page) => {
  await openBasalLane(page);
  const held = () => page.evaluate(() => document.querySelector('.lane-cell[aria-pressed="true"]')?.dataset.cell ?? null);
  const start = await held();
  await (await visible(page, '.lane-cell[aria-pressed="true"]')).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const moved = await held();
  ok(moved !== start, `ArrowRight did not move the held slot (stayed ${start})`);
  const focused = await activeElement(page);
  ok(focused && focused.data && focused.data.cell === moved, 'the moved-to cell did not take focus');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  ok(await held() === start, 'ArrowLeft did not return the held slot');
};

/** The selected night's served ordinal, e.g. "night 30 of 30" → [30, 30]. */
const nightOrdinal = async (page) => {
  const match = (await deskText(page)).match(/night\s+(\d+)\s+of\s+(\d+)/i);
  return match ? [Number(match[1]), Number(match[2])] : null;
};

export const S33 = async (page) => {
  // Corrected: a night must be SELECTED before the slot holds one. The lane
  // opens with the slot's supporting nights listed but none held — root's
  // capture shows "30 nights", Night/Day disabled and focus on the basal
  // heading, so no "night N of M" ordinal exists yet. Establish the same
  // premise S35 does, then traverse.
  await openBasalLane(page);
  ok(await nightOrdinal(page) === null,
    'the lane already holds a night before one was selected; this story establishes that selection');
  ok(await countOf(page, '.case-occurrence') > 1,
    'the held slot exposes fewer than two mounted supporting nights');

  await activate(page, '.case-occurrence');
  const start = await nightOrdinal(page);
  ok(start, 'selecting a supporting night did not render its served ordinal');
  ok(start[1] > 1, `the slot serves ${start[1]} night(s); this story needs a roster`);

  await (await visible(page, '.case-occurrence')).focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const stepped = await nightOrdinal(page);
  ok(stepped && stepped[0] !== start[0],
    `ArrowDown did not step the supporting-night roster (${JSON.stringify(start)} → ${JSON.stringify(stepped)})`);

  await activate(page, '[data-basal="previous-night"]');
  const back = await nightOrdinal(page);
  ok(back && back[0] === start[0],
    `the previous-night control did not return the held night (${JSON.stringify(stepped)} → ${JSON.stringify(back)})`);
  ok(back[1] === start[1], 'the roster size changed while stepping within it');

  await activate(page, '[data-basal="next-night"]');
  const forward = await nightOrdinal(page);
  ok(forward && forward[0] === stepped[0],
    `the next-night control did not move the held night forward again (${JSON.stringify(back)} → ${JSON.stringify(forward)})`);
};

export const S34 = async (page) => {
  await openBasalLane(page);
  const held = () => page.evaluate(() => document.querySelector('.lane-cell[aria-pressed="true"]')?.dataset.cell ?? null);
  const start = await held();
  await activate(page, '[data-basal="next-slot"]');
  ok(await held() !== start, 'next-slot did not move the held slot');
  await activate(page, '[data-basal="previous-slot"]');
  ok(await held() === start, 'previous-slot did not return the held slot');
};

export const S35 = async (page) => {
  // Corrected: Night and Day are DISABLED until a night is selected
  // (basal.js:68 — `${key === 'basal' || night ? '' : 'disabled'}`). Revision 2
  // clicked a disabled Night and burned the full 30s locator timeout. Assert the
  // premise first, select a night through its own affordance, then switch.
  await openBasalLane(page);
  const before = await page.evaluate(() => [...document.querySelectorAll('[data-owner="basal"] [data-figure]')]
    .map((b) => ({ figure: b.dataset.figure, disabled: b.disabled })));
  ok(before.length >= 2, `the basal figure segment rendered ${before.length} control(s)`);
  ok(before.some((f) => f.figure === 'basal' && !f.disabled), 'the Basal figure is not available by default');
  ok(before.some((f) => f.disabled),
    'no basal figure control is gated on a selected night; this story asserts that gate');

  await activate(page, '.case-occurrence');
  const after = await page.evaluate(() => [...document.querySelectorAll('[data-owner="basal"] [data-figure]')]
    .map((b) => ({ figure: b.dataset.figure, disabled: b.disabled, held: b.getAttribute('aria-pressed') })));
  ok(after.every((f) => !f.disabled),
    `selecting a night did not enable the figure segment: ${JSON.stringify(after)}`);

  const seated = after.find((f) => f.held === 'true');
  const other = after.find((f) => !seated || f.figure !== seated.figure);
  await activate(page, `[data-owner="basal"] [data-figure="${other.figure}"]`);
  ok(await pressed(page, `[data-owner="basal"] [data-figure="${other.figure}"]`) === 'true',
    'the basal figure control did not take its own seat');
};

export const S36 = async (page) => {
  // Corrected: Inspect nights is the Trial stage's own end control
  // (setting.js:316,:333). Reach a Trial by moving the journey's clock, then
  // press the reader's control.
  await harnessSelect(page, 'journeyClock', 'Trial, ready to judge');
  const control = await visible(page, '[data-journey="trial-nights"]');
  ok(/Inspect nights/i.test(((await control.textContent()) || '').trim()),
    'the Trial\'s evidence route is not named "Inspect nights"');
  await control.click();
  await page.waitForTimeout(350);
  ok(await countOf(page, '.lane-cell[data-cell]') === 48, 'Inspect nights did not open the slot lane');
  ok(await countOf(page, '.lane-cell[aria-pressed="true"]') === 1,
    'Inspect nights did not hold the slot the change moved');
  ok(/From the Trial/i.test(await deskText(page)),
    'the lane head does not name its Trial provenance');
};

export const S37 = async (page) => {
  // journey.js:189 delegates Changes to the setting branch whenever it owns the
  // leading row, so this frame is the setting journey's own: it offers "Inspect
  // nights" and "Stage change" and carries no [data-journey="lane"]. The lane
  // shortcut belongs to the following read and is S37b's; the ordinary lane
  // route is S31's. What this story holds is the affordance this state does
  // offer — a named route into the concern's evidence, which lands on it.
  await goto(page, 'changes');
  const route = await visible(page, '.gf-empty [data-action="explore"], [data-action="explore"]');
  const label = ((await route.textContent()) || '').trim();
  ok(/^Inspect /i.test(label), `the empty Changes state offers no named evidence route: ${JSON.stringify(label)}`);
  ok(await countOf(page, '[data-set="stage"]') > 0,
    'the empty Changes state offers no staging action for the concern it names');
  await route.click();
  await page.waitForTimeout(250);
  ok(await destinationOf(page) === 'explore', 'the named evidence route did not open Explore');
  ok(await countOf(page, '[data-night], .case-occurrence, .lane-cell[data-cell]') > 0,
    'the named evidence route did not land on the concern\'s own evidence');
};

export const S37b = async (page) => {
  // The lane shortcut, on the route root observed. At the following read the
  // roster's own concern row carries "Open all basal slots", which opens the
  // 48-slot lane of the read the nights came from and puts the hand on the held
  // cell. The current read carries the basal summary but not its detailed
  // nights, which is why this route exists at all.
  await harnessSelect(page, 'journeyClock', 'follow-up');
  await goto(page, 'explore');
  await activate(page, '.gf-roster-row[data-row="basal:180-240"]');

  const shortcut = await visible(page, '[data-journey="lane"]');
  ok(/all basal slots/i.test(((await shortcut.textContent()) || '').trim()),
    `the lane shortcut is not named for the slots it opens: ${await shortcut.textContent()}`);
  await shortcut.click();
  await page.waitForTimeout(300);

  ok(await countOf(page, '.lane-cell[data-cell]') === 48,
    'the lane shortcut did not open all 48 slots');
  ok(await countOf(page, '.lane-cell[aria-pressed="true"]') === 1,
    'the lane shortcut left no single held slot');
  const focused = await activeElement(page);
  ok(focused && /lane-cell/.test(focused.className || ''),
    `the lane shortcut did not put the hand on its held cell (got ${JSON.stringify(focused)})`);
  ok(focused.data && focused.data.cell !== undefined,
    'the focused element is not a lane cell carrying its slot index');
};

export const S38 = async (page) => {
  // Corrected: "Staged · Undo" belongs to the concern's own priority frame
  // (setting.js:177), not to Plan. Staging lands in Changes; the reader steps
  // back to Overview to find the Undo beside "Resume draft"/"Open Changes".
  await stageIntoPlan(page);
  ok(await countOf(page, '[data-set="unstage"]') === 0,
    'Plan carries the Undo control; this story asserts it belongs to the priority frame');
  await goto(page, 'overview');
  const undo = await visible(page, '[data-set="unstage"]');
  ok(/Undo/i.test(((await undo.textContent()) || '')), 'the staged concern offers no Undo');
  ok(await countOf(page, '[data-set="changes"]') > 0,
    'the staged concern offers no route back into its Plan');
  await undo.click();
  await page.waitForTimeout(250);
  const focused = await activeElement(page);
  ok(focused && focused.data && focused.data.set === 'stage',
    `unstaging did not return focus to the stage control (got ${JSON.stringify(focused)})`);
};

export const S39 = async (page) => {
  // Corrected: capacity copy lives on the Plan frame (setting.js:259), reached
  // by staging. The earlier run asserted it on the empty Changes frame.
  await stageIntoPlan(page);
  const copy = await deskText(page);
  const match = copy.match(/(\d+)\s+of\s+(\d+)\s+segments used/i);
  ok(match, `the Plan capacity copy is absent or reworded: ${copy.slice(0, 200)}`);
  ok(Number(match[1]) <= Number(match[2]), `the capacity copy reads ${match[0]}, which overfills its capacity`);
  ok(/Nothing here is sent to your pump\./i.test(copy), 'the manual-entry line is missing from Plan');
};

export const S40 = async (page) => {
  // Corrected: assert BOTH halves. The failure is installed on the named
  // harness checkbox before pressing Save draft; the retry is then asserted to
  // succeed. The earlier version let a successful `else` stand for the story.
  await stageIntoPlan(page);
  await harnessCheck(page, 'settingSaveFails', true);
  await activate(page, '[data-set="save-draft"]');
  const failed = await deskText(page);
  ok(/Saving the draft failed/i.test(failed), `installing a save failure did not fail the save: ${failed.slice(0, 200)}`);
  ok(/no response from the store\./i.test(failed), 'the failed-save message lost its locked continuation');
  ok(await countOf(page, '[data-set="retry-save"]') === 1, 'a failed draft save offers no Retry');
  const focused = await activeElement(page);
  ok(focused && focused.data && focused.data.set === 'retry-save', 'the failed save did not focus its Retry');

  await activate(page, '[data-set="retry-save"]');
  const retried = await deskText(page);
  ok(!/Saving the draft failed/i.test(retried), 'the retry did not clear the failed save');
  ok(/Draft saved/i.test(retried), 'a successful retry did not record the draft');
};

/** Read one <dt>label</dt><dd>value</dd> pair out of the Decision section. */
const decisionField = (page, label) => page.evaluate((wanted) => {
  for (const list of document.querySelectorAll('.gf-section dl')) {
    const terms = [...list.querySelectorAll('dt')];
    const hit = terms.find((dt) => dt.textContent.trim().toLowerCase() === wanted.toLowerCase());
    if (hit && hit.nextElementSibling) return hit.nextElementSibling.textContent.trim();
  }
  return null;
}, label);

export const S41 = async (page) => {
  // Corrected: "Decision recorded" is a FIELD LABEL (setting.js:300) and is
  // present whether or not the write happened, so revision 2's desk-wide regex
  // read the label as a success. Root's capture shows PLAN SAVE FAILED with the
  // field's VALUE reading "Not recorded". Assert the field value and the
  // lifecycle it moves through.
  await stageIntoPlan(page);
  ok(await decisionField(page, 'Decision recorded') === 'Not recorded',
    'the Decision recorded field did not start unrecorded');

  await harnessCheck(page, 'settingSaveFails', true);
  await activate(page, '[data-set="record"]');
  const failed = await deskText(page);
  ok(/Recording the decision failed/i.test(failed), `installing a save failure did not fail the record: ${failed.slice(0, 200)}`);
  ok(/no response from the store\./i.test(failed), 'the failed-record message lost its locked continuation');
  ok(await countOf(page, '[data-set="retry-save"]') === 1, 'a failed decision record offers no Retry');
  ok(await decisionField(page, 'Decision recorded') === 'Not recorded',
    'a failed record left the Decision recorded field claiming a write');
  ok(await decisionField(page, 'On pump') === null,
    'a failed record exposed an On pump field, which only a recorded decision owns');

  await activate(page, '[data-set="retry-save"]');
  ok(!/Recording the decision failed/i.test(await deskText(page)), 'the retry did not clear the failed record');
  const recorded = await decisionField(page, 'Decision recorded');
  ok(recorded && recorded !== 'Not recorded',
    `a successful retry did not record the decision (field reads ${JSON.stringify(recorded)})`);
  ok(await decisionField(page, 'On pump') !== null,
    'a recorded decision did not open its pump-evidence field');
};

export const S42 = async (page) => {
  // Corrected: Re-key renders only in the mismatch state (setting.js:282-285),
  // which needs a recorded decision plus a mis-keyed capture at a later clock.
  await stageIntoPlan(page);
  await activate(page, '[data-set="record"]');
  await harnessSelect(page, 'pumpCapture', 'Mis-keyed');
  await harnessSelect(page, 'settingClock', 'pump captured');
  const mismatch = await deskText(page);
  ok(/doesn't match your plan/i.test(mismatch), `the mis-keyed capture did not reconcile to a mismatch: ${mismatch.slice(0, 200)}`);
  await activate(page, '[data-set="rekey"]');
  const after = await deskText(page);
  ok(/Re-key the flagged values on your pump/i.test(after), 'the re-key message is absent');
  ok(/rechecks on the next fetch/i.test(after), 're-keying does not say when it rechecks');
  ok(!/sent to your pump/i.test(after.replace(/Nothing here is sent to your pump\./gi, '')),
    're-keying is claiming Harmonic sent something to the pump');
};

export const S43 = async (page) => {
  await goto(page, 'explore');
  // Every claimed control is driven: the slot row, the night row, and the
  // night stepper — not merely counted.
  const slots = await page.evaluate(() => [...document.querySelectorAll('[data-slot]')]
    .map((b) => ({ slot: b.dataset.slot, held: b.getAttribute('aria-pressed') })));
  ok(slots.length > 1, `the setting journey rendered ${slots.length} slot row(s); this story needs a choice`);
  const otherSlot = slots.find((s) => s.held !== 'true') ?? slots[slots.length - 1];
  await activate(page, `[data-slot="${otherSlot.slot}"]`);
  ok(await pressed(page, `[data-slot="${otherSlot.slot}"]`) === 'true', 'selecting a slot did not hold it');

  const nights = await page.evaluate(() => [...document.querySelectorAll('[data-night]')].map((b) => b.dataset.night));
  ok(nights.length > 1, `the slot exposes ${nights.length} night row(s); this story needs a roster`);
  const held = () => page.evaluate(() => document.querySelector('.gf-member-row[aria-pressed="true"]')?.textContent?.trim() ?? null);
  await activate(page, `[data-night="${nights[nights.length - 1]}"]`);
  const picked = await held();
  ok(picked, 'selecting a night row did not hold it');

  await activate(page, '[data-set="next-night"]');
  ok(await held() !== picked, 'next-night did not move the held night');
  await activate(page, '[data-set="previous-night"]');
  ok(await held() === picked, 'previous-night did not return the held night');
};

export const S44 = async (page) => {
  await goto(page, 'explore');
  const { options, seated } = await page.evaluate(() => ({
    options: [...document.querySelectorAll('[data-owner="setting"] [data-figure]')].map((b) => b.dataset.figure),
    seated: document.querySelector('[data-owner="setting"] [data-figure][aria-pressed="true"]')?.dataset.figure ?? null,
  }));
  ok(options.length >= 2, 'the setting journey rendered fewer than two figure controls inside its own stage');
  const other = options.find((f) => f !== seated) ?? options[options.length - 1];
  await activate(page, `[data-owner="setting"] [data-figure="${other}"]`);
  ok(await pressed(page, `[data-owner="setting"] [data-figure="${other}"]`) === 'true',
    'the setting journey\'s own figure control did not take its seat');
};

export const S45 = async (page) => {
  ok(await countOf(page, '.gf-stage-trial') === 1, 'the Trial stage did not render');
  ok(await countOf(page, '[data-trial-chart]') === 1, 'the Trial evidence figure did not mount');
  ok(await page.evaluate(() => document.querySelectorAll('[data-trial-chart] canvas').length) > 0,
    'the shipped Verify hero drew no canvas on the Trial stage');
  ok(((await page.locator('.gf-stage-trial .gf-title').first().textContent()) || '').trim().length > 0,
    'the Trial nameplate has no title');
};

export const S45b = async (page) => {
  // While a change is being watched, the concern's own evidence carries the way
  // back to it — the seat is never lost by going to look at the evidence.
  await goto(page, 'explore');
  const back = await visible(page, '[data-action="watch"]');
  ok(/Return to Trial/i.test(((await back.textContent()) || '').trim()),
    `the watched concern's route back is not named for its Trial: ${await back.textContent()}`);
  ok(await countOf(page, '[data-action="aside"]') === 0,
    'a watched concern still offers Set aside; the active change holds the seat');
  await back.click();
  await page.waitForTimeout(300);
  ok(await destinationOf(page) === 'overview', 'Return to Trial did not land on Overview');
  ok(await countOf(page, '.gf-stage-trial') === 1, 'Return to Trial did not open the Trial');
};

export const S46 = async (page) => {
  const figure = await page.locator('.gf-figure').first().innerText();
  const bar = await page.evaluate(() => {
    const el = document.querySelector('progress[aria-label="Trial progress"]');
    return el ? { value: el.value, max: el.max } : null;
  });
  ok(bar, 'the Trial progress bar is absent');
  ok(bar.value <= bar.max, `the progress bar is overfilled (${bar.value}/${bar.max}); the B-08 repair has regressed`);
  ok(/\d+\s+(of\s+\d+\s+)?days/i.test(figure), `the evidence figure is not a served day count: ${JSON.stringify(figure)}`);
  const maturing = figure.match(/(\d+)\s+of\s+(\d+)\s+days/i);
  if (maturing) {
    ok(Number(maturing[1]) <= Number(maturing[2]),
      `the maturing figure reads "${maturing[0]}" — "15 of 14 days" must not return`);
  }
};

export const S47 = async (page) => {
  ok(await countOf(page, '[data-mode="summary"]') === 1, 'the Before / Trial view control is absent');
  await activate(page, '[data-mode="daily"]');
  ok(await pressed(page, '[data-mode="daily"]') === 'true', 'the Available days view did not take the segment');
  ok(await countOf(page, '[data-select="evidence-day"]') === 1, 'Available days rendered no day select');
  await activate(page, '[data-mode="summary"]');
  ok(await countOf(page, 'table.gf-table') > 0, 'Before / Trial rendered no evidence table');
};

export const S48 = async (page) => {
  await activate(page, '[data-mode="daily"]');
  const read = () => page.locator('.gf-day-read .gf-figure').first().innerText();
  const before = await read();
  await page.selectOption('[data-select="evidence-period"]', 'before_period');
  await page.waitForTimeout(250);
  const options = await page.evaluate(() => [...document.querySelectorAll('[data-select="evidence-day"] option')].map((o) => o.value));
  ok(options.length > 1, `the Before period serves ${options.length} available day(s); this story needs at least two`);
  await page.selectOption('[data-select="evidence-day"]', options[1]);
  await page.waitForTimeout(250);
  ok(await read() !== before, 'choosing another available day did not change the read');
  ok(/is not necessarily a complete day of data/i.test(await page.locator('.gf-day-read').innerText()),
    'the Available days read dropped its completeness caveat');
};

export const S49 = async (page) => {
  // Corrected twice. Case first (the heads paint BEFORE/TRIAL). Then the
  // fixture: meals/active serves every population nonempty, so the empty-
  // population wording this story exists for never appears there. The journey's
  // own Trial does serve "no meals" and "unavailable" — root's S20b capture
  // shows them — so this uses that existing checkpoint rather than a new mock.
  await harnessSelect(page, 'journeyClock', 'Trial, ready to judge');
  ok(await countOf(page, '.gf-stage-trial table.gf-table') > 0,
    'the journey Trial checkpoint rendered no evidence table');
  const table = await page.locator('.gf-stage-trial table.gf-table').first().innerText();
  ok(/before/i.test(table) && /trial/i.test(table), `the evidence table lost its two period columns: ${table.slice(0, 160)}`);
  const forbidden = table.match(/\bnull\b|\bundefined\b|\bNaN\b/);
  ok(!forbidden, `the evidence table rendered a raw ${forbidden && forbidden[0]}`);
  ok(/no meals|no readings|unavailable/i.test(table),
    'no distinct empty-population wording appears; this story needs a fixture with one');
};

export const S50 = async (page) => {
  const legend = await page.locator('[data-trial-chart] .ds-chart-legend').first().innerText();
  ok(legend.trim().length > 0, 'the Trial figure rendered no legend');
  const paired = /Trial above Before/i.test(legend);
  const beforeOnly = /no Trial readings to compare yet/i.test(legend);
  ok(paired !== beforeOnly,
    `the Trial legend is neither a paired comparison nor an explicit Before-only figure: ${JSON.stringify(legend)}`);
  if (beforeOnly) ok(!paired, 'a Before-only figure is claiming a paired comparison');
};

export const S51 = async (page) => {
  ok(await countOf(page, 'form[data-form="finish"]') === 1, 'no conclusion form — this story needs a Trial permitted to finish');
  const submit = await visible(page, 'form[data-form="finish"] [type="submit"]');
  ok(await submit.isDisabled(), 'the finish control is enabled before a conclusion was written');
  await page.fill('#conclusion', '   ');
  await page.waitForTimeout(150);
  ok(await submit.isDisabled(), 'whitespace alone enabled the finish control');
  await page.fill('#conclusion', 'Ran two weeks; overnight lows stopped.');
  await page.waitForTimeout(150);
  ok(!(await submit.isDisabled()), 'a written conclusion did not enable the finish control');
  ok(!(await page.evaluate(() => document.querySelector('#conclusion')?.getAttribute('placeholder'))),
    'the conclusion field is putting words in the wearer\'s mouth');
};

export const S52 = async (page) => {
  ok(await countOf(page, 'form[data-form="finish"]') === 1, 'no conclusion form — this story needs a Trial permitted to finish');
  await page.fill('#conclusion', 'Overnight lows stopped.');
  await (await visible(page, 'form[data-form="finish"] [type="submit"]')).click();
  await page.waitForTimeout(400);
  ok(/Overnight lows stopped\./.test(await deskText(page)), 'the finished record does not show the recorded conclusion');
  ok(/finished|conclusion/i.test(await deskText(page)), 'the finished record does not acknowledge its own ending');
};

// S53 is defined with the deferred stories below: the prototype has no code
// path that can fail a Trial finish, so the behavior is app-opener-only under
// HV2-25. See the deferred block for the observed mechanism.

export const S54 = async (page) => {
  const reading = await page.locator('.gf-desk > .gf-reading').first().innerText();
  for (const label of ['Earlier decision', 'Conclusion', 'Finished']) {
    ok(new RegExp(label, 'i').test(reading), `the saved record lost its "${label}" field`);
  }
  ok(/Not recorded/i.test(reading), 'an unavailable legacy fact is not shown as explicitly unavailable');
  ok(/before/i.test(reading) && /trial/i.test(reading), 'the record lost its evidence-period bounds');
};

export const S54b = async (page) => {
  // A past decision stays reachable from Overview and opens its own record;
  // the record's own control returns to Overview without going through the
  // topbar, so the record keeps its subject on the way out.
  await goto(page, 'overview');
  const record = await visible(page, '[data-action="history"]');
  ok(/View change record/i.test(((await record.textContent()) || '').trim()),
    `the route into the saved record is not named for it: ${await record.textContent()}`);
  ok(await countOf(page, '[data-action="day"]') > 0, 'the finished state does not keep Day reachable');
  await record.click();
  await page.waitForTimeout(300);
  ok(await destinationOf(page) === 'changes', 'the saved record did not open in Changes');
  ok(await countOf(page, '.gf-stage-trial') === 1, 'the saved record rendered no Trial stage');

  const out = await visible(page, '[data-action="overview"]');
  ok(/Back to Overview/i.test(((await out.textContent()) || '').trim()),
    `the record's way out is not named for Overview: ${await out.textContent()}`);
  await out.click();
  await page.waitForTimeout(300);
  ok(await destinationOf(page) === 'overview', 'Back to Overview did not return to Overview');
};

export const S55 = async (page) => {
  const title = ((await page.locator('.gf-stage-trial .gf-title').first().textContent()) || '').trim();
  ok(title.length > 0, 'the Trial nameplate rendered no title');
  ok(/Profile change · \d+ settings/i.test(title) || /·/.test(title),
    `the Trial title is neither a counted profile change nor a named setting: ${JSON.stringify(title)}`);
};

export const S56 = async (page) => {
  // Deterministic: the success path is asserted first from a clean pin, then a
  // second page installs the failure. Root's note 4 applies here too.
  await activate(page, '[data-focus="pin"]');
  ok(await destinationOf(page) === 'overview', 'a successful pin did not land on Overview');
  ok(await countOf(page, '[data-focus="retry-pin"]') === 0, 'a successful pin left a Retry standing');
};

export const S56b = async (page) => {
  await harnessCheck(page, 'focusSaveFails', true);
  await activate(page, '[data-focus="pin"]');
  ok(await countOf(page, '[data-focus="retry-pin"]') === 1, 'installing a pin failure did not surface its Retry');
  const focused = await activeElement(page);
  ok(focused && focused.data && focused.data.focus === 'retry-pin', 'a failed pin did not focus its Retry');
  await activate(page, '[data-focus="retry-pin"]');
  ok(await countOf(page, '[data-focus="retry-pin"]') === 0, 'the retried pin did not succeed');
};

export const S57 = async (page) => {
  // Corrected: the Focus surface never uses the word "adherence" — that was my
  // vocabulary, not the mock's. It renders two separate tables, "Observed
  // behavior" and "Glucose outcomes" (focus.js:170, :178), which is what HV2-26
  // actually contracts.
  await harnessSelect(page, 'focusClock', 'follow-up');
  ok(await countOf(page, '.gf-stage-focus') === 1, 'the Focus evidence stage did not render');
  const tables = await page.evaluate(() => [...document.querySelectorAll('.gf-stage-focus table.gf-trend thead th:first-child')]
    .map((th) => th.textContent.trim()));
  ok(tables.length === 2, `the Focus stage rendered ${tables.length} trend table(s), not the behavior/outcome pair`);
  ok(/observed behaviou?r/i.test(tables[0]), `the first Focus table is not observed behavior: ${JSON.stringify(tables[0])}`);
  ok(/glucose outcomes/i.test(tables[1]), `the second Focus table is not glucose outcomes: ${JSON.stringify(tables[1])}`);
  const body = await page.locator('.gf-stage-focus').innerText();
  const forbidden = body.match(/\bnull\b|\bundefined\b|\bNaN\b/);
  ok(!forbidden, `the Focus surface rendered a raw ${forbidden && forbidden[0]}`);
  // An empty population says so; it never becomes a rate or a zero.
  if (/no lows|no nights/i.test(body)) {
    ok(/unavailable/i.test(body), 'an empty Focus population did not say its measure is unavailable');
  }
};

export const S58 = async (page) => {
  // Corrected: preemption is reached by moving the Focus clock to the station
  // where a setting change lands on the pump (focus.js:249-255).
  await harnessSelect(page, 'focusClock', 'correction factor changed on the pump');
  const dropped = await visible(page, '[data-focus="dropped"]');
  ok(/View Focus record/i.test(((await dropped.textContent()) || '').trim()),
    'the preempted Focus offers no route to its record');
  await dropped.click();
  await page.waitForTimeout(300);
  ok(await destinationOf(page) === 'changes', 'the dropped Focus did not open in Changes');
  const copy = await deskText(page);
  ok(/preempted/i.test(copy), 'the dropped Focus does not name preemption as its reason');
  ok(!/resumed|resuming/i.test(copy), 'a preempted Focus is claiming it resumed');
};

export const S59 = async (page, ctx) => {
  // Corrected, and deliberately narrowed. data-focus="seat-*" lives in
  // .gf-narrow-seat, which harmonic-v2-glucose.css:358 sets display:none and
  // only reveals below 700px. At the lock's desktop viewports the desktop stage
  // shows BOTH tables at once and needs no seat control — that is the desktop
  // fact this story holds. The narrow variant is inherited chrome; HV2-05 keeps
  // the 701–1100 intermediate rule as inherited and mobile acceptance stays a
  // later gate, so this story does not widen desktop acceptance to it.
  await harnessSelect(page, 'focusClock', 'follow-up');
  // Corrected: revision 2 required the seat nodes to EXIST but be hidden. They
  // are rendered only in the narrow branch (focus.js:154-157), so at a desktop
  // viewport they are absent from the markup entirely — root confirmed that.
  // Absence is the correct desktop fact; demanding a hidden node would invent
  // implementation the prototype never had.
  const seatsVisible = await page.evaluate(() => [...document.querySelectorAll('[data-focus^="seat-"]')]
    .filter((b) => b.offsetParent !== null).map((b) => b.dataset.focus));
  ok(seatsVisible.length === 0,
    `narrow-only seat controls are presented at ${ctx.viewport}: ${JSON.stringify(seatsVisible)}`);
  const tables = await countOf(page, '.gf-stage-focus table.gf-trend');
  ok(tables === 2, `the desktop Focus stage shows ${tables} trend table(s); both must be present without a seat control`);
};

export const S60 = async (page) => {
  await goto(page, 'day');
  ok(await countOf(page, '.gf-stage-day') === 1, 'the Day desk did not render');
  ok(await countOf(page, '[data-day="return"]') === 0, 'direct Day entry invented a return target');
  ok(!/opened from/i.test(await deskText(page)), 'direct Day entry invented a prior subject');
};

export const S61 = async (page) => {
  // Corrected: the section head is uppercased by CSS, so innerText reads
  // "OPENED FROM". Root's capture showed it present while a case-sensitive
  // regex reported it missing.
  await goto(page, 'explore');
  const open = await visible(page, '[data-action="day"][data-date]');
  const subject = await open.getAttribute('data-subject');
  ok(subject && subject.trim().length > 0, 'the contextual Open Day carries no canonical subject');
  await open.click();
  await page.waitForTimeout(350);
  ok(/opened from/i.test(await deskText(page)), 'the contextual Day entry does not name where it came from');
  ok(await countOf(page, '[data-day="return"]') === 1, 'the contextual Day entry offers no return');
};

export const S62 = async (page) => {
  // The precise part, asserted precisely: the exact occurrence that was held
  // when Day was opened is the one held and focused on return, and the Day desk
  // names that same subject while it is away. fromHere() defaults the return
  // target to '.gf-member-row[aria-pressed="true"]' (glucose.js:214) and
  // day.js:220 focuses it, so "precise" here means that identity, not any row.
  await goto(page, 'explore');
  const origin = await page.evaluate(() => document.querySelector('.gf-member-row[aria-pressed="true"]')?.dataset.occ ?? null);
  ok(origin, 'no occurrence is held to return to');

  const open = await visible(page, '[data-action="day"][data-date]');
  const subject = (await open.getAttribute('data-subject') || '').trim();
  const date = await open.getAttribute('data-date');
  ok(subject, 'the contextual Open Day carries no canonical subject to return from');
  await open.click();
  await page.waitForTimeout(350);

  // While away, the Day desk names the subject it came from, verbatim.
  const openedFrom = await page.evaluate(() => {
    const head = [...document.querySelectorAll('.gf-section h3')].find((h) => /opened from/i.test(h.textContent));
    return head ? (head.parentElement.querySelector('p')?.textContent || '').trim() : null;
  });
  ok(openedFrom === subject,
    `Day names its origin as ${JSON.stringify(openedFrom)}, not the subject it was opened with ${JSON.stringify(subject)}`);
  ok((await deskText(page)).includes(date.slice(8).replace(/^0/, '')),
    'the Day desk did not open on the date the occurrence carried');

  await activate(page, '[data-day="return"]');
  ok(await destinationOf(page) === 'explore', `the return landed on ${await destinationOf(page)}, not the destination it left`);
  const restored = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      held: document.querySelector('.gf-member-row[aria-pressed="true"]')?.dataset.occ ?? null,
      focusedOcc: el && el.dataset ? el.dataset.occ ?? null : null,
    };
  });
  ok(restored.held === origin,
    `the return restored occurrence ${JSON.stringify(restored.held)}, not the one it left from ${JSON.stringify(origin)}`);
  ok(restored.focusedOcc === origin,
    `the return did not put the hand back on the originating occurrence (focused ${JSON.stringify(restored.focusedOcc)})`);
};

export const S63 = async (page) => {
  await goto(page, 'day');
  const cols = await page.evaluate(() => [...document.querySelectorAll('.gf-nav-col[data-pick]')].map((b) => ({
    iso: b.dataset.pick, disabled: b.disabled, label: b.getAttribute('aria-label'),
  })));
  ok(cols.length > 0, 'the week ribbon rendered no columns');
  for (const col of cols) ok(col.label, `a week column has no accessible label: ${col.iso}`);
  const real = cols.find((c) => !c.disabled);
  ok(real, 'every week column is disabled; no recorded day is reachable');
  ok(cols.some((c) => c.disabled), 'no unrecorded day is disabled; this story needs a week with a gap');
  await activate(page, `.gf-nav-col[data-pick="${real.iso}"]`);
  ok(await pressed(page, `.gf-nav-col[data-pick="${real.iso}"]`) === 'true', 'picking a recorded day did not hold it');
};

export const S64 = async (page) => {
  await goto(page, 'day');
  const expanded = () => page.evaluate(() => document.querySelector('.gf-month-toggle')?.getAttribute('aria-expanded'));
  ok(await expanded() === 'false', 'the month grid claims to be open before it was opened');
  await activate(page, '.gf-month-toggle');
  ok(await expanded() === 'true', 'opening the month did not set aria-expanded');
  ok(await countOf(page, '.gf-nav-cell[data-pick]') > 0, 'the month grid rendered no cells');
  await activate(page, '.gf-month-toggle');
  ok(await expanded() === 'false', 'closing the month did not clear aria-expanded');
};

export const S65 = async (page) => {
  // Corrected: the meals capture spans May only, so both month steppers are
  // correctly disabled there and revision 2 had nothing to step. The journey
  // source serves May 1 – Jun 1 across 32 days and crosses a month bound, so it
  // is the existing source that exercises this. Both facts are asserted: a live
  // stepper moves the month, and the bound stays disabled.
  await goto(page, 'day');
  await activate(page, '.gf-month-toggle');
  const steppers = await page.evaluate(() => [...document.querySelectorAll('[data-day="prev-month"], [data-day="next-month"]')]
    .map((b) => ({ day: b.dataset.day, disabled: b.disabled })));
  ok(steppers.length === 2, `the month stepper rendered ${steppers.length} controls`);
  const live = steppers.find((s) => !s.disabled);
  ok(live, `both month steppers are disabled on a source that spans a month bound: ${JSON.stringify(steppers)}`);
  ok(steppers.some((s) => s.disabled),
    `neither month stepper is bounded: ${JSON.stringify(steppers)} — the recorded range must stop somewhere`);
  const before = await page.locator('.gf-stage-day').first().innerText();
  await activate(page, `[data-day="${live.day}"]`);
  ok(await page.locator('.gf-stage-day').first().innerText() !== before, 'the month stepper did not move the month');
};

export const S66 = async (page) => {
  await goto(page, 'day');
  const controls = await page.evaluate(() => [...document.querySelectorAll('[data-day="prev"], [data-day="next"], [data-day="latest"]')]
    .map((b) => ({ day: b.dataset.day, disabled: b.disabled })));
  ok(controls.length === 3, `the recorded-day stepper rendered ${controls.length} controls`);
  const live = controls.find((c) => !c.disabled && c.day !== 'latest');
  ok(live, 'every recorded-day stepper is disabled; this story needs more than one recorded day');
  const held = () => page.evaluate(() => document.querySelector('.gf-nav-col[aria-pressed="true"]')?.dataset.pick ?? null);
  const before = await held();
  await activate(page, `[data-day="${live.day}"]`);
  ok(await held() !== before, `${live.day} did not move the held day`);
};

export const S67 = async (page) => {
  // Corrected: the landed day need not carry a log. Walk the recorded week
  // through the reader's own ribbon until one does, and fail loudly if none does.
  await goto(page, 'day');
  const days = await page.evaluate(() => [...document.querySelectorAll('.gf-nav-col[data-pick]:not([disabled])')].map((b) => b.dataset.pick));
  ok(days.length > 0, 'the week ribbon exposes no recorded day');
  let rows = [];
  for (const iso of days) {
    await activate(page, `.gf-nav-col[data-pick="${iso}"]`);
    rows = await page.evaluate(() => [...document.querySelectorAll('.gf-log-row[data-day-row]')].map((b) => ({
      t: b.dataset.dayRow, state: b.querySelector('.tier')?.dataset.state ?? null,
    })));
    if (rows.length) break;
  }
  ok(rows.length > 0, `no recorded day in this week rendered an Episode Log row (checked ${days.length})`);
  for (const row of rows) ok(row.state, `a log row rendered without its served state word: ${row.t}`);
  await activate(page, `.gf-log-row[data-day-row="${rows[0].t}"]`);
  ok(await pressed(page, `.gf-log-row[data-day-row="${rows[0].t}"]`) === 'true', 'a log row did not take its focused moment');
  await activate(page, `.gf-log-row[data-day-row="${rows[0].t}"]`);
  ok(await pressed(page, `.gf-log-row[data-day-row="${rows[0].t}"]`) === 'false', 'a log row did not toggle its moment off');
};

export const S68 = async (page) => {
  // Corrected: .gf-utility-strip is narrow-only (css:471), so at a desktop
  // viewport the visible launcher is the footer's. visible() now picks it.
  for (const kind of ['guide', 'glossary', 'settings']) {
    await activate(page, `[data-utility="${kind}"]`);
    ok(await countOf(page, `.gf-utility[data-utility="${kind}"]`) === 1, `the ${kind} utility did not take the reading seat`);
    ok(await countOf(page, '.gf-stage') >= 1, `opening ${kind} removed the destination underneath it`);
    const launcher = await visible(page, `nav.cockpit-utilities [data-utility="${kind}"]`);
    ok(await launcher.getAttribute('aria-pressed') === 'true', `the visible ${kind} launcher is not marked pressed`);
    await activate(page, '[data-utility-close]');
  }
};

export const S69 = async (page) => {
  await activate(page, '[data-utility="guide"]');
  await activate(page, '[data-utility-close]');
  ok(await countOf(page, '.gf-utility') === 0, 'Close left the utility open');
  const focused = await activeElement(page);
  ok(focused && focused.data && focused.data.utility === 'guide',
    `Close did not return focus to its launcher (got ${JSON.stringify(focused)})`);
};

export const S70 = async (page) => {
  await activate(page, '.cockpit-log-carbs');
  ok(await countOf(page, '#ut-grams') === 1, 'Log carbs rendered no grams field');
  await page.fill('#ut-grams', '');
  await page.waitForTimeout(180);
  const log = page.locator('[data-utility-log="other"]');
  ok(await log.count() > 0, 'Log carbs rendered no log control');
  ok(await log.first().isDisabled(), 'an empty grams entry can be logged');
  await page.fill('#ut-grams', '18');
  await page.waitForTimeout(180);
  ok(!(await log.first().isDisabled()), 'a valid grams entry cannot be logged');

  // The moment controls are pressed, not counted: choosing "custom" opens the
  // datetime field the draft keeps (utilities.js:136, :261).
  const whens = await page.evaluate(() => [...document.querySelectorAll('[data-utility-when]')]
    .map((b) => ({ key: b.dataset.utilityWhen, held: b.getAttribute('aria-pressed') })));
  ok(whens.length > 1, `Log carbs offers ${whens.length} moment control(s); this story needs a choice`);
  ok(whens.some((w) => w.key === 'custom'), 'Log carbs offers no custom moment');
  await activate(page, '[data-utility-when="custom"]');
  ok(await pressed(page, '[data-utility-when="custom"]') === 'true', 'choosing a moment did not hold it');
  ok(await countOf(page, '#ut-custom') === 1, 'the custom moment opened no time field');
  await page.fill('#ut-custom', '2024-05-15T09:30');
  await page.waitForTimeout(180);
  ok(await page.inputValue('#ut-custom') === '2024-05-15T09:30', 'the custom moment did not keep what was typed');

  const other = whens.find((w) => w.key !== 'custom');
  await activate(page, `[data-utility-when="${other.key}"]`);
  ok(await countOf(page, '#ut-custom') === 0, 'leaving the custom moment left its time field standing');

  // Logging records an entry the pane lists and can act on.
  const entriesBefore = await countOf(page, '.gf-entry-row');
  await activate(page, '[data-utility-log="other"]');
  ok(await countOf(page, '.gf-entry-row') === entriesBefore + 1,
    'logging a valid amount recorded no entry');
  ok(/18 g/.test(await page.locator('.gf-utility').first().innerText()),
    'the logged entry does not show the amount that was entered');
};

export const S71 = async (page, ctx) => {
  // Corrected: install the utility save failure on its named control, then log
  // through the reader's affordance, then assert the retry succeeds.
  //
  // The app has no such control, and a healthy server is not a reason to omit
  // this story. The failure is installed where the write actually happens — the
  // one POST /api/carbs the press makes — so what is exercised is an ORDINARY
  // failed save, not a simulated pane state. The durable state is then read back
  // and must be unchanged: "a failed save shown as saved" is the risk this
  // story exists to bar, and an entry that was written anyway would be worse.
  await activate(page, '.cockpit-log-carbs');
  const entries = () => countOf(page, '.gf-entry-row');
  const before = await entries();
  if (ctx.target === 'app') ctx.failNext('POST', '/api/carbs');
  else await harnessCheck(page, 'utilitySaveFails', true);

  await page.fill('#ut-grams', '18');
  await page.waitForTimeout(180);
  await activate(page, '[data-utility-log]');
  const failed = await page.locator('.gf-utility').first().innerText();
  ok(/fail/i.test(failed), `installing a utility save failure did not fail the save: ${failed.slice(0, 160)}`);
  ok(await entries() === before, 'the failed save recorded an entry anyway');
  const retry = page.locator('[data-utility-retry]');
  ok(await retry.count() > 0, 'the failed utility save offers no Retry');
  await activate(page, '[data-utility-retry]');
  await page.waitForTimeout(300);
  ok(!/fail/i.test(await page.locator('.gf-utility').first().innerText()),
    'the retried utility save still reports a failure');
  ok(await entries() === before + 1, 'the retry reported success but recorded nothing');
};

/** Both copies of the open-question count: the footer's and the strip's. */
const openCounts = (page) => page.evaluate(() => ({
  footer: document.querySelector('nav.cockpit-utilities .cockpit-count')?.textContent?.trim() ?? null,
  strip: document.querySelector('.gf-utility-strip .cockpit-count')?.textContent?.trim() ?? null,
}));

export const S72 = async (page) => {
  // The direct answer path, on one identified question. Both count copies are
  // asserted, and the answered card is identified by its own key so the Undo
  // returns the same question rather than any question.
  await activate(page, '[data-utility="questions"]');
  const before = await openCounts(page);
  ok(before.footer !== null && before.strip !== null, 'an open-question count copy is missing');
  ok(before.footer === before.strip,
    `the two open-question counts disagree before answering (${before.footer} vs ${before.strip})`);

  const key = await page.evaluate(() =>
    document.querySelector('[data-utility-answer]')?.dataset.question ?? null);
  ok(key, 'no open carb question to answer — this story needs a source serving questions');

  await activate(page, `[data-utility-answer="no"][data-question="${key}"]`);
  ok(await countOf(page, `[data-utility-undo="${key}"]`) === 1,
    'answering did not offer that question its own Undo');
  ok(/answered/i.test(await page.locator(`[data-question-card="${key}"]`).innerText()),
    'the answered card does not say it was answered');
  const after = await openCounts(page);
  ok(after.footer !== before.footer, `the open question count did not follow the answer (${before.footer} → ${after.footer})`);
  ok(after.footer === after.strip,
    `the two open-question counts disagree after answering (${after.footer} vs ${after.strip})`);

  await activate(page, `[data-utility-undo="${key}"]`);
  const restored = await openCounts(page);
  ok(restored.footer === before.footer, 'undoing an answer did not restore the open count');
  ok(restored.strip === before.strip, 'undoing an answer did not restore the strip copy of the count');
  ok(await countOf(page, `[data-utility-answer-carbs="${key}"]`) === 1,
    'undoing did not return that same question to its unanswered controls');
};

export const S72b = async (page) => {
  // The carb-log answer path on one identified question: open its amount
  // controls, cancel back, reopen, log a synthetic amount, then find that entry
  // in Log carbs and remove it. Every control named here is pressed.
  await activate(page, '[data-utility="questions"]');
  const before = await openCounts(page);
  const key = await page.evaluate(() =>
    document.querySelector('[data-utility-answer-carbs]')?.dataset.utilityAnswerCarbs ?? null);
  ok(key, 'no open carb question offering the Log carbs answer');

  await activate(page, `[data-utility-answer-carbs="${key}"]`);
  ok(await countOf(page, `[data-question-card="${key}"] [data-utility-log]`) > 0,
    'answering with carbs opened no amount controls on that question');
  ok(await countOf(page, '[data-utility-cancel-log]') === 1, 'the amount controls offer no Cancel');

  await activate(page, '[data-utility-cancel-log]');
  ok(await countOf(page, `[data-question-card="${key}"] [data-utility-log]`) === 0,
    'Cancel left the amount controls open');
  ok(await countOf(page, `[data-utility-answer-carbs="${key}"]`) === 1,
    'Cancel did not return that question to its answer controls');
  const cancelled = await openCounts(page);
  ok(cancelled.footer === before.footer, 'cancelling recorded an answer it should not have');

  // Log a preset amount against that question.
  await activate(page, `[data-utility-answer-carbs="${key}"]`);
  const preset = await page.evaluate((k) => {
    const button = document.querySelector(`[data-question-card="${k}"] [data-utility-log]:not([data-utility-log="other"]):not([data-utility-log="unknown"])`);
    return button ? button.dataset.utilityLog : null;
  }, key);
  ok(preset, 'the amount controls offer no preset to log');
  await activate(page, `[data-question-card="${key}"] [data-utility-log="${preset}"][data-certainty="exact"]`);
  const answered = await openCounts(page);
  ok(answered.footer !== before.footer, 'logging carbs against a question did not answer it');

  // That entry is listed in Log carbs, and removing it restores the count.
  await activate(page, '.cockpit-log-carbs');
  const rows = await page.evaluate(() => [...document.querySelectorAll('.gf-entry-row')]
    .map((row) => ({ id: row.querySelector('[data-utility-remove]')?.dataset.utilityRemove ?? null, text: row.textContent })));
  const logged = rows.find((row) => row.text.includes(`${preset} g`) && /carb question/i.test(row.text));
  ok(logged && logged.id, `the question's logged amount is not listed as an entry: ${JSON.stringify(rows.map((r) => r.text))}`);

  await activate(page, `[data-utility-remove="${logged.id}"]`);
  ok(await countOf(page, `[data-utility-remove="${logged.id}"]`) === 0, 'Remove left the entry listed');
  const removed = await openCounts(page);
  ok(removed.footer === before.footer,
    `removing the logged answer did not return the question to the open count (${before.footer} → ${removed.footer})`);
};

export const S73 = async (page) => {
  // Corrected. The handler names a precise focus target,
  // `.gf-article .gf-title` (utilities.js:258), and the markup renders exactly
  // that node — but as `<h2 class="gf-title">` with NO tabindex
  // (utilities.js:172), so .focus() is a no-op and activeElement stays BODY.
  // Root's supplemental capture (sweep-debug-2-focus/S73.json) confirms it.
  // Same class of gap as S80b: recorded as S73b, an app-opener-only obligation
  // under HV2-32. What the unchanged mock DOES do is asserted here.
  await activate(page, '[data-utility="guide"]');
  ok(await countOf(page, '[data-utility-slug]') > 0, 'the Guide rendered no articles');
  await activate(page, '[data-utility-slug]');
  ok(await countOf(page, '.gf-article') === 1, 'the Guide did not open its article');
  ok(await countOf(page, '.gf-article .gf-title') === 1,
    'the opened article renders no heading for the handler to target');
  ok(await page.evaluate(() => document.querySelector('.gf-utility .gf-pane-body')?.scrollTop ?? null) === 0,
    'the opened article did not bring its pane to the head');
  const back = await visible(page, '[data-utility-slug=""]');
  ok(/All articles/i.test(((await back.textContent()) || '')), 'the article offers no route back to its list');
  await back.click();
  await page.waitForTimeout(250);
  ok(await countOf(page, '.gf-article') === 0, 'returning did not leave the article');
};

export const S74 = async (page) => {
  await activate(page, '[data-utility="settings"]');
  const reveal = await visible(page, '[data-utility-reveal]');
  const id = await reveal.getAttribute('data-utility-reveal');
  const typeOf = () => page.evaluate((i) => document.querySelector(`#${i}`)?.type ?? null, id);
  const before = await typeOf();
  const pressedBefore = await reveal.getAttribute('aria-pressed');
  await reveal.click();
  await page.waitForTimeout(180);
  ok(await typeOf() !== before, 'the reveal control did not toggle the field type');
  ok(await reveal.getAttribute('aria-pressed') !== pressedBefore,
    'the reveal control did not flip its own pressed state with the field');
};

// PROTOTYPE MEMORY -> PRODUCTION PERSISTENCE. The prototype held these two
// saves in page memory and said so in its own copy ("saved in this page"). The
// built app really persists them — the token into this browser's storage, the
// credentials into the Store — and says THAT instead. The mock assertions below
// are kept exactly as they were and still run on TARGET=mock; the app branch
// asserts the stronger thing: not only the confirmation the surface shows, but
// the durable state behind it. Neither story is weakened, renamed or deleted,
// and the ledger's described behaviour is unchanged — only the medium the
// prototype could not have is now checked. Recorded in the diff-to-mock notes.
export const S75 = async (page, ctx) => {
  // Corrected: the token form holds two buttons — the reveal control
  // (type="button", DOM-first) and the submit (utilities.js:101,:103). Revision
  // 2's union selector took the reveal, so root's capture shows the token
  // revealed ("Hide") and still "No token saved". Bind to the submit and verify
  // its identity before pressing it.
  await activate(page, '[data-utility="settings"]');
  ok(await countOf(page, '[data-utility-form="token"]') === 1, 'the Settings utility rendered no token form');
  const submit = await visible(page, '[data-utility-form="token"] button[type="submit"]');
  ok(/Save token/i.test(((await submit.textContent()) || '').trim()),
    `the token form's submit is not the Save token control: ${await submit.textContent()}`);
  await page.fill('#ut-token', 'synthetic-token');
  await submit.click();
  await page.waitForTimeout(300);
  const pane = await page.locator('.gf-utility').first().innerText();
  if (ctx.target === 'app') {
    ok(/token saved in this browser/i.test(pane), `saving the token reported nothing: ${pane.slice(0, 200)}`);
    // The durable half the prototype had no way to have: the token is where the
    // one authenticated client reads it from on every request.
    ok(await page.evaluate(() => localStorage.getItem('ciq_token')) === 'synthetic-token',
      'the saved token is not in the storage frontend/data.js reads on every request');
    return;
  }
  ok(/token saved in this page/i.test(pane), 'saving the token reported nothing');
};

export const S75b = async (page, ctx) => {
  // The credentials form and Developer mode, each driven by its own control.
  // Every value here is obviously manufactured; these are page-memory handlers
  // in the prototype, not credential storage, and nothing leaves the page.
  await activate(page, '[data-utility="settings"]');
  ok(await countOf(page, '[data-utility-form="credentials"]') === 1,
    'the Settings utility rendered no credentials form');
  const pane = () => page.locator('.gf-utility').first().innerText();
  ok(/no credentials saved/i.test(await pane()), 'the credentials form did not start unsaved');

  await page.fill('#ut-email', 'wearer@example.test');
  await page.fill('#ut-password', 'synthetic-password');
  await page.selectOption('#ut-region', 'EU');
  await page.waitForTimeout(180);
  ok(await page.inputValue('#ut-password') === 'synthetic-password', 'the password field did not keep what was typed');

  const submit = await visible(page, '[data-utility-form="credentials"] button[type="submit"]');
  ok(/Save credentials/i.test(((await submit.textContent()) || '').trim()),
    `the credentials submit is not the Save credentials control: ${await submit.textContent()}`);
  await submit.click();
  await page.waitForTimeout(300);

  const saved = await pane();
  if (ctx.target === 'app') {
    // The real write lands in the Store, so the confirmation says so without
    // the prototype's page-memory caveat.
    ok(/credentials saved/i.test(saved), `saving the credentials reported nothing: ${saved.slice(0, 200)}`);
    ok(!/in this page/i.test(saved), 'the built app still claims a page-memory save');
  } else {
    ok(/credentials saved in this page/i.test(saved), 'saving the credentials reported nothing');
  }
  ok(/EU region/i.test(saved), 'the saved credentials did not keep the chosen region');
  // The password is cleared from the form once saved (utilities.js:276).
  ok(await page.inputValue('#ut-password') === '',
    'the password was left in the form after saving; it must be cleared');
  ok(await page.inputValue('#ut-email') === 'wearer@example.test',
    'saving the credentials dropped the email it saved');

  // Developer mode is disclosure only, and says so.
  const dev = await visible(page, '[data-utility-form="dev"] input');
  ok(await dev.isChecked() === false, 'Developer mode did not start off');
  await dev.check();
  await page.waitForTimeout(180);
  ok(await dev.isChecked(), 'Developer mode did not take the change');
  ok(/never the analysis/i.test(await pane()),
    'Developer mode does not say it changes disclosure only');

  if (ctx.target !== 'app') return;
  // The durable half. A reload throws away every scrap of page state, so what
  // the pane says after it can only have come from the Store.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.gf .pane', { timeout: 20000 });
  await activate(page, '[data-utility="settings"]');
  await page.waitForTimeout(400);
  const reloaded = await pane();
  ok(/credentials saved/i.test(reloaded) && !/no credentials saved/i.test(reloaded),
    `the saved credentials did not survive a reload: ${reloaded.slice(0, 200)}`);
  ok(await page.inputValue('#ut-password') === '',
    'the reloaded form carries a password; a saved credential is never echoed back');
};

export const S76 = async (page) => {
  // Corrected. Root's capture shows Day opened with Carb questions STILL OPEN in
  // the reading pane and no visible return — because the seated utility takes
  // that pane (glucose.js:301) and the Day desk's "Opened from" section, which
  // owns [data-day="return"], is underneath it. Keeping the utility open IS the
  // continuation; the return is not missing, it is covered. So the story asserts
  // the continuity first, then closes the utility to reach the return the lock
  // names verbatim, and follows it back.
  await activate(page, '[data-utility="questions"]');
  const open = await visible(page, '.gf-utility [data-action="day"][data-date]');
  const origin = await open.getAttribute('data-utility-from');
  ok(origin, 'the utility\'s Open Day carries no utility origin');
  const label = await open.getAttribute('data-utility-label');
  ok(label, 'the utility\'s Open Day carries no origin label to return to');
  await open.click();
  await page.waitForTimeout(350);

  ok(await destinationOf(page) === 'day', 'the utility\'s Open Day did not reach the Day desk');
  ok(await countOf(page, `.gf-utility[data-utility="${origin}"]`) === 1,
    'the originating utility did not stay open over Day; that continuity is the return');
  ok(await countOf(page, '.gf-stage-day') === 1, 'the Day desk is not standing underneath the seated utility');

  await activate(page, '[data-utility-close]');
  const back = await visible(page, '[data-day="return"]');
  ok(((await back.textContent()) || '').trim() === `Return to ${label}`,
    `the return control is not named for its origin: ${await back.textContent()}`);
  await back.click();
  await page.waitForTimeout(350);
  ok(await countOf(page, `.gf-utility[data-utility="${origin}"]`) === 1,
    'following the return did not reopen the utility it came from');
};

export const S77 = async (page) => {
  await goto(page, 'changes');
  ok(await countOf(page, '[data-utility="pump"]') > 0, 'Pump settings is not reachable from Changes');
  ok(await countOf(page, 'nav.cockpit-utilities [data-utility="pump"]') === 0,
    'Pump settings appeared in the footer utility strip, which HV2-12 places in Changes');
  // Press the opener this story claims to preserve, and read what it seats.
  await activate(page, '[data-utility="pump"]');
  ok(await countOf(page, '.gf-utility[data-utility="pump"]') === 1,
    'Pump settings did not open into the reading pane');
  const pane = await page.locator('.gf-utility[data-utility="pump"]').innerText();
  ok(/detected/i.test(pane), 'Pump settings does not name the schedule as detected');
  ok(/proposed schedule is (the Plan|in Changes)/i.test(pane),
    'Pump settings does not distinguish the detected schedule from the proposed Plan');
};

export const S73c = async (page) => {
  // A Guide article's inline cross-link. The article source is MARKDOWN, and
  // renderMarkdown produces the anchor that utilities.js:180 rewrites into a
  // [data-utility-go] button against the HANDOFF map (:29) — day → Day,
  // diagnose → Explore, plan → Changes. On a desktop desk the utility stays
  // seated when the link navigates (:257 clears it only when narrow).
  await activate(page, '[data-utility="guide"]');
  await activate(page, '[data-utility-slug="reading-day"]');
  ok(await countOf(page, '.gf-article') === 1, 'the Guide did not open the article carrying the handoff');

  const link = await visible(page, '.gf-article [data-utility-go]');
  const destination = await link.getAttribute('data-utility-go');
  ok(destination === 'day',
    `the article's handoff names ${JSON.stringify(destination)}, not the Day surface it links to`);
  ok(/Day surface/i.test(((await link.textContent()) || '').trim()),
    `the handoff is not named for what it opens: ${await link.textContent()}`);
  ok(/\(Day here\)/i.test(await page.locator('.gf-article').innerText()),
    'the handoff does not say what the v1 tab name reads as on this desk');

  await link.click();
  await page.waitForTimeout(300);
  ok(await destinationOf(page) === 'day', 'the handoff did not open the destination it named');
  ok(await countOf(page, '.gf-utility[data-utility="guide"]') === 1,
    'the Guide closed behind the handoff; on a desktop desk it stays seated');
};

export const S78 = async (page) => {
  await activate(page, '[data-utility="guide"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ok(await countOf(page, '.gf-utility') === 0, 'Escape did not close the seated utility first');
  const focused = await activeElement(page);
  ok(focused && focused.data && focused.data.utility === 'guide',
    `Escape from a utility did not restore its launcher (got ${JSON.stringify(focused)})`);

  await activate(page, '[data-action="aside"]');
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ok(await countOf(page, 'form[data-form="aside"]') === 0, 'Escape did not step back out of the set-aside form');
};

export const S79 = async (page) => {
  await activate(page, '[data-action="aside"]');
  await page.fill('#aside-reason', 'half-written');
  await page.locator('#aside-reason').focus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ok(await countOf(page, 'form[data-form="aside"]') === 1,
    'Escape inside the field dropped the draft; a field must own the key');
  ok(await page.inputValue('#aside-reason') === 'half-written', 'the typed reason was lost');
};

export const S80 = async (page) => {
  // Corrected and narrowed to what the unchanged mock actually does. Root's
  // capture showed focus staying on the pressed navigation button when Changes
  // opens the FULL-WIDTH EMPTY frame: navigate() offers
  // ['.gf-reading > header h2', '.gf-stage .gf-title'] (glucose.js:201) and
  // render() focuses only a found target (:317), but the empty frame's
  // .gf-title is a DIV with no tabindex, so nothing takes focus. That gap is
  // recorded as S80b, an app-opener-only obligation under HV2-32 — the locked
  // term is not lowered and the prototype is not edited.
  //
  // What IS provable in the mock: a destination that owns a reading pane
  // focuses its head.
  await goto(page, 'explore');
  const focused = await activeElement(page);
  ok(focused && (focused.tag === 'H2' || /gf-title/.test(focused.className || '')),
    `arriving at a paired destination did not focus its head (got ${JSON.stringify(focused)})`);
};

export const S81 = async (page) => {
  // Corrected: the meals Explore reading pane does not overflow at 1280x720.
  // The basal lane's supporting-night roster does (30 rows in root's capture),
  // and it is reached through the reader's own "All basal slots" row.
  await openBasalLane(page);
  const scrollable = await page.evaluate(() => {
    const body = document.querySelector('.gf-pane-body');
    if (!body || body.scrollHeight <= body.clientHeight + 8) return false;
    body.scrollTop = 40;
    return true;
  });
  ok(scrollable, 'the reading pane does not overflow even on the dense slot roster');
  await page.waitForTimeout(150);
  const nights = await page.evaluate(() => [...document.querySelectorAll('.case-occurrence')].length);
  if (nights > 1) {
    await activate(page, '.case-occurrence');
    ok(await page.evaluate(() => document.querySelector('.gf-pane-body')?.scrollTop ?? 0) > 0,
      'the reading pane lost its scroll while its subject was unchanged');
  }
  await goto(page, 'changes');
  await goto(page, 'explore');
  ok(await page.evaluate(() => document.querySelector('.gf-pane-body')?.scrollTop ?? 0) === 0,
    'the reading pane kept its scroll across a subject change');
};

export const S82 = async (page) => {
  await goto(page, 'explore');
  const rows = await page.evaluate(() => [...document.querySelectorAll('.gf-cohort-row[data-support]')].map((b) => ({
    support: b.dataset.support, text: (b.querySelector('small')?.textContent || '').trim(),
  })));
  ok(rows.length > 0, 'no support-bearing rows rendered');
  for (const row of rows) ok(row.text.length > 0, `support state "${row.support}" is conveyed without a text label`);
};

export const S83 = async (page) => {
  const counts = () => page.evaluate(() => ({
    canvases: document.querySelectorAll('canvas').length,
    utilities: document.querySelectorAll('.gf-utility').length,
  }));
  await goto(page, 'explore');
  const first = await counts();
  for (let i = 0; i < 3; i += 1) {
    await goto(page, 'day');
    await goto(page, 'explore');
    await activate(page, '[data-utility="guide"]');
    await activate(page, '[data-utility-close]');
  }
  const last = await counts();
  ok(last.canvases === first.canvases, `charts accumulated across re-entry (${first.canvases} → ${last.canvases})`);
  ok(last.utilities === 0, 'a utility pane survived its own close');
};

export const S84 = async (page, ctx) => {
  const before = await page.evaluate(() => document.querySelectorAll('canvas').length);
  ok(before > 0, 'no charts were mounted to dispose');
  const seen = ctx.consoleErrors.length;
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
  await page.waitForTimeout(300);
  const raised = ctx.consoleErrors.slice(seen);
  ok(raised.length === 0, `pagehide disposal raised: ${raised.join(' | ')}`);
  const live = await page.evaluate(() => {
    if (!globalThis.echarts) return null;
    return [...document.querySelectorAll('canvas')]
      .map((c) => c.parentElement)
      .filter((el) => el && globalThis.echarts.getInstanceByDom(el)).length;
  });
  ok(live === null || live === 0, `pagehide left ${live} live ECharts instance(s) attached`);
};

export const S85 = async (page, ctx) => {
  const harness = Object.values(HARNESS).concat('.gf-review-notes');
  if (ctx.target === 'app') {
    for (const selector of harness) {
      ok(await countOf(page, selector) === 0, `prototype instrumentation reached production: ${selector}`);
    }
    return;
  }
  for (const selector of harness) {
    const outside = await page.evaluate((s) => [...document.querySelectorAll(s)].filter((el) => !el.closest('.mockbar')).length, selector);
    ok(outside === 0, `prototype control ${selector} appears outside .mockbar, in a product frame`);
  }
  ok(await countOf(page, '.mockbar') === 1, 'the mock bar is absent; the harness controls could not be located');
};

/* ------------------------------------------------- deferred: app opener only */

const deferred = (id, term, what) => {
  const fn = async () => fail(
    `${id} is deferred to the app opener (LOCK:harmonic-v2-desktop:${term}): ${what}. `
    + 'The prototype holds this in page memory, and a page-memory assertion is not persistence evidence.',
  );
  fn.deferred = { term, what };
  return fn;
};

// A converted entry: the body is real and runs on the APP opener, and the entry
// keeps its app-opener-only marker so a TARGET=mock run still reports it as
// deferred rather than failing it against a prototype that never could pass it.
// Converting a deferred entry this way fulfils it; the story is not weakened,
// renamed or deleted.
const appOnly = (term, what, fn) => {
  fn.deferred = { term, what };
  return fn;
};

// Converted by the desk chunk (#389 chunk 1). Both run on the app opener only.
export const S86 = appOnly('HV2-01', 'Python serves /v2/ and /v2/assets/ with no Node runtime or CDN',
  async (page, ctx) => {
    // Everything the surface loaded came from the packaged runtime, at the two
    // paths it declares. The opener already aborts any off-origin request; this
    // reads back that nothing tried.
    ok(ctx.unrouted.length === 0, `the built app reached off-origin: ${ctx.unrouted.join(', ')}`);
    const shell = ctx.requests.filter((request) => request.path === '/v2/');
    ok(shell.length > 0 && shell[0].status === 200, 'the desk was not served from /v2/');
    ok(shell[0].headers['cache-control'] === 'no-cache',
      `the shell must revalidate, not cache: ${shell[0].headers['cache-control']}`);
    const assets = ctx.requests.filter((request) => request.path !== '/v2/' && !request.path.startsWith('/api/'));
    ok(assets.length > 0, 'the desk loaded no packaged asset at all');
    for (const asset of assets) {
      ok(asset.path.startsWith('/v2/assets/'), `${asset.path} is served outside /v2/assets/`);
      ok(asset.status === 200, `${asset.path} answered ${asset.status}`);
      ok(asset.headers['cache-control'] === 'public, max-age=31536000, immutable',
        `${asset.path} is fingerprinted but not immutable: ${asset.headers['cache-control']}`);
    }
    // Nothing in the served document names a CDN, which is the other half of
    // "no CDN in production" — the packaged image itself is task 3.5's proof.
    const sources = await page.evaluate(() => [...document.querySelectorAll('script[src], link[href]')]
      .map((element) => element.getAttribute('src') || element.getAttribute('href')));
    for (const source of sources) {
      ok(!/^https?:/i.test(source), `the served shell names an external source: ${source}`);
    }
    // The non-API route set is closed: a path the server never declared is a
    // 404, not the shell.
    const closed = await page.evaluate(async () => {
      const out = {};
      for (const path of ['/v2/day', '/v2/overview', '/v2/index.html', '/v2/assets/no-such.js']) {
        out[path] = (await fetch(path)).status;
      }
      return out;
    });
    for (const [path, status] of Object.entries(closed)) {
      ok(status === 404, `${path} answered ${status}; the non-API route set is not closed`);
    }
  });

export const S87 = appOnly('HV2-02', 'v1 and /v2/ coexist against one authenticated API and database',
  async (page) => {
    // Revised. The first version proved nothing: it stored a token, loaded the
    // desk on a destination that reads NOTHING, and then called the browser's
    // own fetch() — which bypasses frontend/data.js entirely, so it exercised
    // neither the client nor its token. This drives the surfaces' OWN reads,
    // through that client, against a server that actually enforces a token.
    if (!AUTH_BASE_URL || !AUTH_TOKEN) {
      fail('S87 needs a token-protected synthetic server: the declared QA server runs '
        + "with --token '' and so cannot refuse an unauthenticated read.\n"
        + '  start a second one against its own copy of the same synthetic database:\n'
        + "    cp mockups/qa-e2e.synthetic/harmonic.sqlite \"$TMPDIR/harmonic-qa-auth.sqlite\"\n"
        + "    uv run harmonic serve --no-fetch --token 'synthetic-replay-token' \\\n"
        + "      --db \"$TMPDIR/harmonic-qa-auth.sqlite\" --port 8766\n"
        + '  then re-run with AUTH_BASE_URL=http://127.0.0.1:8766 '
        + "AUTH_TOKEN=synthetic-replay-token");
    }

    // Every /api/ read either surface makes, with the header it carried and the
    // body it received. Read off the network, so it sees the client's real
    // requests rather than anything installed into the page.
    const reads = [];
    page.on('response', async (response) => {
      const path = new URL(response.url()).pathname;
      if (!path.startsWith('/api/')) return;
      const entry = {
        path, status: response.status(),
        authorization: response.request().headers().authorization || null,
        body: null,
      };
      reads.push(entry);
      try { entry.body = await response.text(); } catch { /* a redirect or an abort has none */ }
    });
    const since = (mark) => reads.slice(mark);
    const settle = async () => page.waitForTimeout(2500);

    // 1. The boundary refuses an unauthenticated read, on the desk's own Day —
    //    a destination that actually reads.
    await page.evaluate(() => localStorage.removeItem('ciq_token'));
    let mark = reads.length;
    await page.goto(`${AUTH_BASE_URL}/v2/?to=day`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.gf .pane', { timeout: 20000 });
    await settle();
    const anonymous = since(mark);
    ok(anonymous.length > 0, 'the v2 desk made no API read at all on Day; it cannot show an authenticated boundary');
    ok(anonymous.every((read) => !read.authorization),
      'a read carried an Authorization header before any token was stored');
    ok(anonymous.every((read) => read.status === 401),
      `the token-protected API admitted an unauthenticated v2 read: ${JSON.stringify(anonymous.map((r) => [r.path, r.status]))}`);

    // 2. With the token stored, the desk's own client reads succeed and carry it.
    await page.evaluate((value) => localStorage.setItem('ciq_token', value), AUTH_TOKEN);
    mark = reads.length;
    await page.goto(`${AUTH_BASE_URL}/v2/?to=day`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.gf-stage-day', { timeout: 20000 });
    await settle();
    const v2Reads = since(mark);
    ok(v2Reads.length > 0, 'the v2 desk made no API read with a token stored');
    ok(v2Reads.every((read) => read.authorization === `Bearer ${AUTH_TOKEN}`),
      `the v2 desk did not send the stored token: ${JSON.stringify(v2Reads.map((r) => [r.path, r.authorization]))}`);
    ok(v2Reads.every((read) => read.status === 200),
      `an authenticated v2 read was refused: ${JSON.stringify(v2Reads.map((r) => [r.path, r.status]))}`);
    const v2Status = v2Reads.find((read) => read.path === '/api/status');
    ok(v2Status, 'the v2 desk did not read /api/status, so there is no shared read to compare');

    // 3. V1 is still served on its own routes, is a different shell, and reads
    //    the same API and the same database with the same stored token.
    mark = reads.length;
    const v1 = await page.goto(`${AUTH_BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    ok(v1 && v1.ok(), `v1 is no longer served: ${v1 && v1.status()}`);
    const v1Html = await v1.text();
    ok(!v1Html.includes('/v2/assets/'), 'the root path served the v2 shell; this change admits no cutover');
    ok(v1Html.includes('/assets/'), 'the root path did not serve the v1 shell');
    await settle();
    const v1Reads = since(mark);
    ok(v1Reads.length > 0, 'v1 made no API read');
    ok(v1Reads.every((read) => read.authorization === `Bearer ${AUTH_TOKEN}`),
      `v1 did not send the same stored token: ${JSON.stringify(v1Reads.map((r) => [r.path, r.authorization]))}`);
    const v1Status = v1Reads.find((read) => read.path === '/api/status' && read.status === 200);
    ok(v1Status, `v1 did not read /api/status successfully: ${JSON.stringify(v1Reads.map((r) => [r.path, r.status]))}`);
    ok(v1Status.body === v2Status.body,
      `the two surfaces read different databases:\n  /v2/: ${v2Status.body}\n  /   : ${v1Status.body}`);
  });
export const S88 = deferred('S88', 'HV2-16', 'Set aside and Restore are durable Store writes surviving reload');
export const S89 = deferred('S89', 'HV2-20', 'Plan draft, decision, reconciliation and withdrawal persist');
export const S90 = deferred('S90', 'HV2-21', 'capacity copy is served by the Plan deliverable contract, not memorized');
export const S91 = deferred('S91', 'HV2-22', 'readiness renders the record comparison fields; setting and Focus arms differ');
export const S92 = deferred('S92', 'HV2-23', 'pre-ready values come from the second assessment=retained request');
export const S93 = deferred('S93', 'HV2-24', 'each record renders its own criterion; no universal fourteen-day cutoff');
export const S94 = deferred('S94', 'HV2-25', 'Trial finish is durable and survives reload');
export const S95 = deferred('S95', 'HV2-27', 'trial_preempted stays history and never resumes');
export const S96 = deferred('S96', 'HV2-28', 'original, saved ending and retained reassessment across a sequential change');
export const S97 = deferred('S97', 'HV2-29', 'P19b pending, failed and sliced replacement withdraw the former projection');
export const S98 = deferred('S98', 'HV2-30', 'the selected I:C coherent pair survives a failed replacement');
export const S99 = deferred('S99', 'HV2-31', 'only backend-permitted actions are exposed; unavailable carries its reason');
export const S100 = deferred('S100', 'HV2-32', 'fractional-hour speech repaired in the shared renderer');
// New, from root's S80 capture: the full-width empty frame must also focus its
// heading. HV2-32 contracts it; the unchanged prototype leaves focus on the
// pressed navigation button because the empty frame's .gf-title is a DIV with
// no tabindex. Recorded as an obligation on the build, not as a lowered term
// and not as a sanction.
export const S80b = appOnly('HV2-32',
  'a full-width empty destination (Changes with no change underway) focuses its own heading rather than leaving focus on the pressed navigation button',
  async (page) => {
    await goto(page, 'changes');
    ok(await countOf(page, '.gf-desk > .gf-reading') === 0,
      'this story needs the full-width empty state; a reading pane rendered instead');
    ok(await countOf(page, '.gf-stage-table .gf-empty') === 1, 'the empty frame did not render');
    const focused = await activeElement(page);
    ok(focused && /gf-title/.test(focused.className || ''),
      `arrival left focus on ${JSON.stringify(focused)} instead of the frame's own heading`);
    ok(!(focused.data && focused.data.destination),
      'focus stayed on the pressed navigation button, which is the gap S80b records');
  });
// Same class, found in run 2: the Guide's article handler names the precise
// target `.gf-article .gf-title` (utilities.js:258) and the markup renders it,
// but as an h2 with no tabindex (:172), so focus falls to BODY. HV2-32 says a
// caller-supplied precise target is honoured; the build owes that.
export const S73b = appOnly('HV2-32',
  'opening a Guide article moves focus to the article heading the handler already targets, rather than dropping focus to the document body',
  async (page) => {
    await activate(page, '[data-utility="guide"]');
    ok(await countOf(page, '.gf-utility[data-utility="guide"]') === 1, 'the Guide did not open');
    ok(await countOf(page, '.gf-guide-row') > 0, 'the Guide listed no article to open');
    await activate(page, '.gf-guide-row');
    // An authored article's text is SERVED (/api/kb/<slug>), so the press
    // renders a loading state first and the heading arrives one read later.
    // The caller's focus target has to survive that, which is the whole point
    // of this story against the app.
    await page.waitForSelector('.gf-article .gf-title', { timeout: 15000 });
    ok(await countOf(page, '.gf-article .gf-title') === 1, 'the article did not open');
    const focused = await activeElement(page);
    ok(focused && focused.tag === 'H2' && /gf-title/.test(focused.className || ''),
      `opening an article left focus on ${JSON.stringify(focused)}, not the article heading`);
    const heading = await page.locator('.gf-article .gf-title').innerText();
    ok(focused.text && heading.toLowerCase().startsWith(focused.text.toLowerCase().slice(0, 20)),
      `the focused heading ${JSON.stringify(focused.text)} is not the opened article ${JSON.stringify(heading)}`);
  });
// A durable Trial finish that fails keeps the form, its written conclusion and
// a Retry, and the retry records the ending. The prototype cannot show it:
// setting.finish() (harmonic-v2-glucose-setting.js:445) writes memory.record
// directly, never calls save() and never reads saveFails — which only gates
// save(kind) for draft/decision at :377 — and glucose.js:773 treats only an
// explicit `false` return as a failure. So no mock control can induce it, and
// no substitute flag was guessed. Mandatory for the build; never a skip.
export const S53 = deferred('S53', 'HV2-25',
  'a failed durable Trial finish keeps the form, the written conclusion and a Retry, records no ending, and the retry then records it');
// S73c is an ordinary shared story, defined with the utilities above: the served
// Guide articles are markdown, and renderMarkdown produces the anchors
// utilities.js:180 rewrites into the handoff buttons.

/* ------------------------------------------------------------------ retired */

const SANCTIONS = {
  R1: 'Connor Griffin · 2026-09-01 · "light theme retired by operator decision."',
  R2: 'Connor Griffin · 2026-08-18 · "the dead occurrenceModal hash machinery goes with them."',
  R3: 'Connor Griffin · 2026-08-25 · "it just keeps my selector. The selection is a slicing method that lets me then dig into findings. Those findings will show up as dots on the chart anyway that I can then trace into."',
  R4: 'Connor Griffin · 2026-08-19 · "Occurrence selection should not change the window. The window is a filter view in order to get to selectable occurrences. Having selectable occurrences then retrace the window would be tautological."',
  R5: 'Connor Griffin · 2026-08-23 · "the roster is drawn vertically; one key model per list."',
  R6: 'Connor Griffin · 2026-08-23 · "#55 removed installSegKeys; the shipped Align control is two ordinary Tab stops"',
  R7: 'Connor Griffin · 2026-08-27 · "these dots mean nothing, just take them off the glucose chart. User can get to them from the findings panel."',
  R8: 'Connor Griffin · 2026-08-27 · "Please also remove meal markers from the glucose chart."',
  R9: 'Connor Griffin · 2026-08-19 · "I don\'t find the content of the drill-down view particularly useful. So, I think we could just simply have the if there\'s a current specific detail that needs to show, I think it should just mutate the standing screen."',
  R10: 'Connor Griffin · 2026-08-19 · "Decided by Connor Griffin in a ruling session on 2026-08-19."',
  R11: 'Connor Griffin · 2026-08-19 · "Decided by Connor Griffin in a ruling session on 2026-08-19."',
  R12: 'Connor Griffin · 2026-08-19 · "Decided by Connor Griffin in a ruling session on 2026-08-19."',
  R13: 'Connor Griffin · 2026-08-25 · "Rewrite or retire every replay story and browser-test contract that still drives the retired \'Event charts\' root filter and the global \'By event\' control."',
  R14: 'ADR 215 amendment · 2026-08-26 · "A pin orders the dock; it is not membership of a position."',
  R15: 'ADR 215 amendment · 2026-08-26 · "The dock is the whole ordered set, spotlight included."',
  R16: 'Connor Griffin · 2026-08-26 · "The ring and the raised rail mark the drilled tile. The chip was noise."',
  R17: 'ADR 340 · Connor Griffin · 2026-09-04 · "Sure." (after the proposal stated that Keep saved nothing and Revert-to-Plan should remain)',
};

const printSanction = (id) => {
  const line = SANCTIONS[id] ?? fail(`retired story ${id} has no sanction tag — a silent absence assertion makes the retirement permanent`);
  process.stdout.write(`RETIRED ${id} — ${line}\n`);
};

// RETIRED:Connor Griffin:2026-09-01
export const R1 = async (page) => {
  printSanction('R1');
  ok(await countOf(page, '[data-theme], .theme-toggle, [aria-label*="theme" i]') === 0,
    'R1 replayed-fail: a theme control is present again');
  ok((await page.evaluate(() => Object.keys(localStorage).filter((k) => /theme/i.test(k)))).length === 0,
    'R1 replayed-fail: theme storage is present again');
  ok(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--wk-canvas').trim()),
    'R1 premise failed: the dark role ladder no longer resolves — re-settle, not a fail');
};

// RETIRED:Connor Griffin:2026-08-18
export const R2 = async (page) => {
  printSanction('R2');
  // Corrected: reach the contracted successor first. Root's capture showed this
  // reporting a dead premise from the initial Overview, where the in-place case
  // successor had simply not been opened yet.
  await openComparisonCase(page);
  ok(await countOf(page, '#occurrenceModal, .occurrence-modal') === 0,
    'R2 replayed-fail: the occurrence modal is present again');
  ok(!/occurrenceModal/.test(await page.evaluate(() => location.hash)),
    'R2 replayed-fail: the occurrence hash route is present again');
  ok(await countOf(page, '.gf-member-row[data-occ]') > 0,
    'R2 premise failed: the in-place case successor is absent — re-settle, not a fail');
};

// RETIRED:Connor Griffin:2026-08-25
export const R3 = async (page) => {
  printSanction('R3');
  await goto(page, 'explore');
  const windowOf = () => page.evaluate(() => document.querySelector('[data-window][aria-pressed="true"]')?.dataset.window ?? null);
  const before = await windowOf();
  await activate(page, '.gf-cohort-row[data-cohort]');
  ok(await windowOf() === before, 'R3 replayed-fail: a drill rewrote the clock window');
  ok(await countOf(page, '.gf-member-row[data-occ]') > 0,
    'R3 premise failed: the drilled findings are no longer reachable — re-settle, not a fail');
};

// RETIRED:Connor Griffin:2026-08-19
export const R4 = async (page) => {
  printSanction('R4');
  await goto(page, 'explore');
  const windowOf = () => page.evaluate(() => document.querySelector('[data-window][aria-pressed="true"]')?.dataset.window ?? null);
  const before = await windowOf();
  const rows = await page.evaluate(() => [...document.querySelectorAll('.gf-member-row[data-occ]')].map((b) => b.dataset.occ));
  ok(rows.length > 1, 'R4 needs more than one member to select');
  await activate(page, `.gf-member-row[data-occ="${rows[1]}"]`);
  ok(await windowOf() === before, 'R4 replayed-fail: occurrence selection rewrote the clock window');
  ok(await countOf(page, '[data-window]') > 0,
    'R4 premise failed: the window is no longer independently settable — re-settle, not a fail');
};

// RETIRED:Connor Griffin:2026-08-23
export const R5 = async (page) => {
  printSanction('R5');
  // Corrected: the vertical roster is the slot lane's supporting-night list,
  // reached through Explore's "All basal slots" row.
  await openBasalLane(page);
  const nights = await countOf(page, '.case-occurrence');
  ok(nights > 1, 'R5 needs a roster of more than one night to step');
  const held = () => page.evaluate(() => document.querySelector('.case-occurrence[aria-pressed="true"]')?.textContent?.trim() ?? null);
  await (await visible(page, '.case-occurrence')).focus();
  const before = await held();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(180);
  ok(await held() === before, 'R5 replayed-fail: the old horizontal roster key model is back');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(180);
  ok(await held() !== before, 'R5 premise failed: the roster no longer steps vertically — re-settle, not a fail');
};

// RETIRED:Connor Griffin:2026-08-23
export const R6 = async (page) => {
  printSanction('R6');
  await goto(page, 'explore');
  const seg = await visible(page, '.seg[role="group"]');
  ok(await seg.locator('button').count() > 0, 'R6 premise failed: the segmented control has no Tab stops — re-settle, not a fail');
  await seg.locator('button').first().focus();
  const before = await activeElement(page);
  await page.keyboard.press('Home');
  await page.waitForTimeout(150);
  ok(JSON.stringify(before) === JSON.stringify(await activeElement(page)),
    'R6 replayed-fail: installSegKeys-style Home/End navigation is back');
};

// RETIRED:Connor Griffin:2026-08-27
export const R7 = async (page) => {
  printSanction('R7');
  await goto(page, 'explore');
  const series = await page.evaluate(() => {
    const el = document.querySelector('.gf-fig2 .gf-chart, [data-chart="day"] .gf-chart');
    if (!el || !globalThis.echarts) return null;
    const chart = globalThis.echarts.getInstanceByDom(el);
    return chart ? (chart.getOption().series || []).map((s) => String(s.id || s.name || '')) : null;
  });
  if (series) {
    ok(!series.some((n) => /occurrence[- ]?dot/i.test(n)),
      `R7 replayed-fail: an occurrence-dot series is drawn again: ${JSON.stringify(series)}`);
  }
  ok(await countOf(page, '.gf-member-row[data-occ], .gf-roster-row[data-row]') > 0,
    'R7 premise failed: occurrences are no longer reachable from the findings panel — re-settle, not a fail');
};

// RETIRED:Connor Griffin:2026-08-27
export const R8 = async (page) => {
  printSanction('R8');
  await goto(page, 'explore');
  const series = await page.evaluate(() => {
    const el = document.querySelector('.gf-fig2 .gf-chart, [data-chart="day"] .gf-chart');
    if (!el || !globalThis.echarts) return null;
    const chart = globalThis.echarts.getInstanceByDom(el);
    return chart ? (chart.getOption().series || []).map((s) => String(s.id || s.name || '')) : null;
  });
  if (series) {
    ok(!series.some((n) => /meal[- ]?(glyph|marker)/i.test(n)),
      `R8 replayed-fail: a meal-marker series is drawn again: ${JSON.stringify(series)}`);
  }
  ok(await countOf(page, '.ec-surface[data-chart="comparison"]') > 0,
    'R8 premise failed: meal evidence is no longer available through the comparison — re-settle, not a fail');
};

// RETIRED:Connor Griffin:2026-08-19
export const R9 = async (page) => {
  printSanction('R9');
  await goto(page, 'explore');
  ok(await countOf(page, '.occurrence-level, .drill-level, .counter-example-subgroup') === 0,
    'R9 replayed-fail: a separate drill level or nested subgroup is back');
  ok(await countOf(page, '.gf-desk > .gf-reading') > 0,
    'R9 premise failed: there is no standing screen for a detail to mutate — re-settle, not a fail');
};

// RETIRED:Connor Griffin:2026-08-19
export const R10 = async (page) => {
  printSanction('R10');
  // Corrected: reach the queue/case successor first. The premise is about the
  // successor route existing, not about whatever the initial Overview showed.
  await goto(page, 'explore');
  ok(await countOf(page, '.ic-lane, [data-lane="ic"]') === 0,
    'R10 replayed-fail: the standalone I:C lane is back');
  ok(await countOf(page, '.gf-roster-row[data-row], .gf-cohort-row[data-cohort]') > 0,
    'R10 premise failed: the queue/case successor route is absent — re-settle, not a fail');
};

// RETIRED:Connor Griffin:2026-08-19
export const R11 = async (page) => {
  printSanction('R11');
  await goto(page, 'explore');
  const chevrons = await page.evaluate(() => [...document.querySelectorAll('.gf-row')]
    .filter((el) => /[›»❯]/.test(el.textContent || '')).length);
  ok(chevrons === 0, 'R11 replayed-fail: redundant evidence-row chevrons are back');
  ok(await countOf(page, '.gf-row[aria-pressed]') > 0,
    'R11 premise failed: evidence rows are no longer activatable — re-settle, not a fail');
};

// RETIRED:Connor Griffin:2026-08-19
export const R12 = async (page) => {
  printSanction('R12');
  await goto(page, 'explore');
  ok(await countOf(page, '.lens-inspector, [data-lens]') === 0,
    'R12 replayed-fail: the standalone lens inspector is back');
  ok(await countOf(page, '.gf-desk > .gf-reading') > 0 && await countOf(page, '[data-action="day"]') > 0,
    'R12 premise failed: the shared inspector or the Day route is absent — re-settle, not a fail');
};

// RETIRED:Connor Griffin:2026-08-25
export const R13 = async (page) => {
  printSanction('R13');
  await goto(page, 'explore');
  ok(await countOf(page, '[data-filter="event-charts"], .event-charts-root, [data-control="by-event"]') === 0,
    'R13 replayed-fail: the global Event-charts filter or By event control is back');
  ok(await countOf(page, '.ec-surface[data-chart="comparison"]') > 0,
    'R13 premise failed: comparison evidence is not reachable through the case-file tile — re-settle, not a fail');
};

// RETIRED:ADR 215 amendment:2026-08-26
export const R14 = async (page) => {
  printSanction('R14');
  ok(await countOf(page, '[data-seat-index], .dock-seat') === 0,
    'R14 replayed-fail: fixed dock seat mechanics are back');
};

// RETIRED:ADR 215 amendment:2026-08-26
export const R15 = async (page) => {
  printSanction('R15');
  ok(await countOf(page, '[data-dock-mode], .dock-layout-toggle, .duplicate-tile') === 0,
    'R15 replayed-fail: the old mode/layout/duplicate-tile mechanics are back');
  ok(await countOf(page, '[data-destination="explore"]') === 1,
    'R15 premise failed: the ADR 348 Explore destination is gone — this retirement never covered it');
};

// RETIRED:Connor Griffin:2026-08-26
export const R16 = async (page) => {
  printSanction('R16');
  ok(await countOf(page, '.provenance-chip, [data-provenance-chip]') === 0,
    'R16 replayed-fail: the duplicate provenance word chip is back');
};

// RETIRED:ADR 340:2026-09-04
export const R17 = async (page) => {
  printSanction('R17');
  const keep = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((b) => (b.textContent || '').trim() === 'Keep').length);
  ok(keep === 0, 'R17 replayed-fail: the session-only Trial Keep action is back');
  ok(/Conclusion|Revert/i.test(await deskText(page)),
    'R17 premise failed: neither Revert-to-Plan nor the durable conclusion is present — re-settle, not a fail');
};

/* -------------------------------------------------------------- the registry */

const J = (state = 'investigate') => ({ source: 'journey', state });
const M = (state = 'investigate') => ({ source: 'meals', state });
const SET = (state = 'investigate') => ({ source: 'setting', state });
const FOC = (state = 'investigate') => ({ source: 'focus', state });

export const REGISTRY = [
  ['S1', S1, J()], ['S2', S2, J()], ['S3', S3, J()], ['S4', S4, J()],
  ['S5', S5, J()], ['S6', S6, J()], ['S7', S7, J()], ['S7b', S7b, M()],
  ['S8', S8, J()], ['S9', S9, J()], ['S10', S10, J()], ['S10b', S10b, J()],
  ['S11', S11, J()],
  ['S12', S12, M()], ['S13', S13, J()],
  ['S14', S14, J()], ['S15', S15, J()], ['S16', S16, J()], ['S17', S17, J()],
  ['S18', S18, M('quiet')], ['S19', S19, M('error')], ['S20', S20, M('error')],
  ['S20b', S20b, J()],
  ['S21', S21, M()], ['S22', S22, M()], ['S23', S23, M()], ['S24', S24, M()],
  ['S25', S25, M()], ['S26', S26, M()], ['S27', S27, M()], ['S28', S28, M()],
  ['S29', S29, J()], ['S30', S30, J()],
  ['S31', S31, J()], ['S32', S32, J()], ['S33', S33, J()], ['S34', S34, J()],
  ['S35', S35, J()], ['S36', S36, J()], ['S37', S37, J()], ['S37b', S37b, J()],
  ['S38', S38, SET()], ['S39', S39, SET()], ['S40', S40, SET()], ['S41', S41, SET()],
  ['S42', S42, SET()], ['S43', S43, SET()], ['S44', S44, SET()],
  ['S45', S45, M('active')], ['S45b', S45b, M('active')],
  ['S46', S46, M('active')], ['S47', S47, M('active')],
  ['S48', S48, M('active')], ['S49', S49, J()], ['S50', S50, M('active')],
  ['S51', S51, M('ready')], ['S52', S52, M('ready')],
  ['S54', S54, M('history')], ['S54b', S54b, M('history')], ['S55', S55, M('history')],
  ['S56', S56, FOC()], ['S56b', S56b, FOC()],
  ['S57', S57, FOC()], ['S58', S58, FOC()], ['S59', S59, FOC()],
  ['S60', S60, M()], ['S61', S61, M()], ['S62', S62, M()], ['S63', S63, M()],
  ['S64', S64, M()], ['S65', S65, J()], ['S66', S66, M()], ['S67', S67, M()],
  ['S68', S68, J()], ['S69', S69, J()], ['S70', S70, J()], ['S71', S71, J()],
  ['S72', S72, J()], ['S72b', S72b, J()], ['S73', S73, J()], ['S74', S74, J()],
  ['S75', S75, J()], ['S75b', S75b, J()],
  ['S73c', S73c, J()], ['S76', S76, J()], ['S77', S77, SET()],
  ['S78', S78, J()], ['S79', S79, J()], ['S80', S80, J()], ['S81', S81, J()],
  ['S82', S82, M()], ['S83', S83, J()], ['S84', S84, M()], ['S85', S85, J()],
  ['S86', S86, J()], ['S87', S87, J()], ['S88', S88, J()], ['S89', S89, J()],
  ['S90', S90, J()], ['S91', S91, J()], ['S92', S92, J()], ['S93', S93, J()],
  ['S94', S94, J()], ['S95', S95, J()], ['S96', S96, J()], ['S97', S97, J()],
  ['S98', S98, J()], ['S99', S99, J()], ['S100', S100, J()],
  ['S80b', S80b, J()], ['S73b', S73b, J()], ['S53', S53, J()],
  ['R1', R1, J()], ['R2', R2, J()], ['R3', R3, M()], ['R4', R4, M()],
  ['R5', R5, J()], ['R6', R6, M()], ['R7', R7, M()], ['R8', R8, M()],
  ['R9', R9, M()], ['R10', R10, J()], ['R11', R11, M()], ['R12', R12, M()],
  ['R13', R13, M()], ['R14', R14, J()], ['R15', R15, J()], ['R16', R16, J()],
  ['R17', R17, M('ready')],
];

/* ------------------------------------------------------------------- runner */

async function main() {
  requireEnvironment();
  requireAssets();
  const fonts = loadFontAssets();
  const { chromium } = playwright();
  const runner = createBrowserRunner(() => chromium.launch());

  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((s) => s.trim())) : null;
  if (only) {
    const known = new Set(REGISTRY.map(([id]) => id));
    for (const id of only) if (!known.has(id)) fail(`ONLY names an unknown story: ${id}`);
  }

  const selected = REGISTRY.filter(([id]) => !only || only.has(id));
  ok(selected.length > 0, 'no applicable stories were selected — a run that executes nothing is a failure');

  const viewport = DEFAULT_VIEWPORT;
  const open = async (options) => {
    const browser = await runner.browser();
    return TARGET === 'app' ? openApp(browser, options) : openMock(browser, { ...options, fonts });
  };

  let executed = 0;
  let deferredCount = 0;
  const failures = [];

  process.stdout.write(`# harmonic-v2-desktop behaviour replay — TARGET=${TARGET} viewport=${viewport} fonts=${fonts.mode}\n`);
  process.stdout.write('# FROZEN ledger: mockups/harmonic-v2-desktop.behavior.md\n');

  for (const [id, fn, state] of selected) {
    if (fn.deferred && TARGET === 'mock') {
      deferredCount += 1;
      process.stdout.write(`DEFERRED ${id} — app opener only · LOCK:harmonic-v2-desktop:${fn.deferred.term} · ${fn.deferred.what}\n`);
      continue;
    }
    let opened = null;
    try {
      opened = await open({ ...state, viewport });
      await fn(opened.page, { ...opened, viewport, open, target: TARGET });
      executed += 1;
      process.stdout.write(`PASS ${id}\n`);
    } catch (error) {
      failures.push([id, error]);
      process.stdout.write(`FAIL ${id} — ${error && error.message ? error.message : String(error)}\n`);
    } finally {
      if (opened && opened.context) await opened.context.close().catch(() => {});
    }
  }

  await runner.close();

  process.stdout.write(`\n# executed ${executed} · failed ${failures.length} · deferred ${deferredCount}`
    + ` · selected ${selected.length} · chromium launches ${runner.launches}\n`);

  if (executed === 0) {
    process.stderr.write('FATAL: zero stories executed — a run that asserts nothing is a failure, not a pass\n');
    process.exitCode = 1;
    return;
  }
  if (failures.length) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`FATAL: ${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
