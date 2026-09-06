// Behaviour replay for the Verify workstation — the executable half of the
// behaviour ledger frozen with the Verify workstation lock.
//
// WHY THIS EXISTS: the lock manifest says what the surface looks like. It does
// not say that the sibling popover light-dismisses on an outside click, that
// choosing a sibling re-renders the hero into a different chart family, or that
// hovering the plot swaps the pane header in place instead of floating a
// tooltip. Those lived in the mock's code when this ledger was written; the
// mock has since been archived (#722), and the app is now the sole contract
// artifact for these behaviours.
//
// The same eight functions run against the BUILT APP — that is what makes
// them evidence about the port.
//
//   PLAYWRIGHT_MODULE=<playwright> \
//   TARGET=app PAYLOAD=<payload.json> [ONLY=S1,S5] \
//   node frontend/verify-660-story-behavior.replay.mjs
//
// PAYLOAD is required: the API-shaped snapshot the app's own adapter consumes.
// TARGET must be app — the mock this ledger once ran against is archived; a
// bare run or TARGET=mock fails loudly rather than silently defaulting.
//
// FAILS CLOSED. A missing driver, vendored asset or fixture exits nonzero, and
// a run that executed zero stories is a failure — a green step that ran nothing
// is the silent pass this whole process exists to prevent.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { createBuiltShell } = require('./built-shell.js');
const VIEWPORT = { width: 1440, height: 900 };   // the lock's viewport (term 17)
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' };

export class ReplayError extends Error {}
const fail = (msg) => { throw new ReplayError(msg); };
export const ok = (cond, what) => { if (!cond) fail(what); };

const problems = [];

// require(), not import(): PLAYWRIGHT_MODULE is a package DIRECTORY in CI and
// playwright is CommonJS, both of which dynamic import refuses.
function playwright() {
  const spec = process.env.PLAYWRIGHT_MODULE
    ?? fail('PLAYWRIGHT_MODULE is required — this script never skips');
  return require(spec);
}

/** Let ECharts finish its first frame; the readout latches off a live chart. */
const settle = (page, ms) => page.waitForTimeout(ms);

/* ------------------------------------------------------------------ openers */

/* The app mounts Diagnose in the same document, alongside Verify's own
   `#rd-time`. Every locator is therefore resolved scoped to `.vw `, the
   Verify workstation's root, so it never picks up Diagnose's matching
   elements. */
const scoped = (page, prefix) => (selector) => page.locator(prefix + selector);

/** The BUILT workstation, its API answered from the same data. */
export async function openApp(browser, { state = 'complete' } = {}) {
  const shell = createBuiltShell();
  const payloadPath = process.env.PAYLOAD || fail('PAYLOAD is required for TARGET=app');
  const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
  const apiPattern = (path) => new RegExp(`^/api${path}`);
  const STUBS = [
    // The surface's own feed: the roster, then one detail per Trial.
    [apiPattern('/verify/trials'), (url) => {
      const id = url.searchParams.get('selected');
      if (!id) return payload.roster;
      return payload.details[id] || fail(`payload has no detail for ${id}`);
    }],
    [apiPattern('/status'), () => ({ ok: true, last_fetch: null, counts: {} })],
    [apiPattern('/plan/history'), () => ({ history: [] })],
    [apiPattern('/plan'), () => ({ items: [], updated_at: null })],
    [apiPattern('/analyze'), () => payload.analyze || { slots: [] }],
    [apiPattern('/scenarios'), () => ({ scenarios: [] })],
    [apiPattern('/explore/'), () => ({})],
    [apiPattern('/catalog'), () => ({ articles: [] })],
    [apiPattern('/carbs'), () => ({ entries: [] })],
    [apiPattern('/prompts'), () => ({ prompts: [] })],
    [apiPattern('/credentials'), () => ({ configured: true })],
    [apiPattern('/audit/dismissals'), () => ({ dismissed: [] })],
    [apiPattern('/outcomes'), () => ({ points: [] })],
    [apiPattern('/timeline'), () => ({ events: [] })],
    [apiPattern('/backtest'), () => ({ folds: [] })],
    [apiPattern('/model'), () => ({ entries: [] })],
    [apiPattern('/day'), () => ({ days: [] })],
    [apiPattern('/pump'), () => ({ settings: {} })],
  ];
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on('pageerror', (e) => problems.push(`pageerror(app ${state}): ${e}`));
  await page.addInitScript(() => {
    localStorage.setItem('ciq_token', 'behaviour-replay');
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 204 });
    const response = shell.serve(path);
    if (response) return route.fulfill(response);
    for (const [pattern, body] of STUBS) {
      if (pattern.test(path)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body(url)) });
    }
    problems.push(`unstubbed ${route.request().method()} ${path} (app ${state})`);
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'not stubbed' }) });
  });
  // The app carries the canonical route-query `?state=` hook, so the harness drives it
  // directly and asserts the state it actually rendered.
  await page.goto(`http://app.local/verify?state=${encodeURIComponent(state)}`);
  await page.waitForSelector('.vw .trial-line .subject', { timeout: 15000 });
  await settle(page, 900);
  const $ = scoped(page, '.vw ');
  await assertState($, state, `app ${state}`);
  return { page, $, close: () => page.close() };
}

/** State addressability, loud on both sides: a route-query `?state=` the surface silently
    ignores renders a plausible screen and hides the drift (the `?mode=` bug
    the Diagnose comparator shipped with). */
async function assertState($, want, where) {
  const subject = await $('.trial-line .subject').innerText();
  const expected = want === 'maturing' ? /maturing/i : /complete/i;
  ok(expected.test(subject), `${where}: state=${want} not rendered; strip says "${subject}"`);
}

/* ------------------------------------------------------------------ stories */

/* S1 — trial popover toggles from its button; aria-expanded tracks. */
// LOCK:verify-660-story:3 LOCK:verify-660-story:4
export const S1 = async (open, browser) => {
  const { $, close } = await open(browser);
  const more = $('.trial-more'), pop = $('.trial-pop');
  await more.click();
  ok(!(await pop.isHidden()), 'popover did not open');
  ok(await more.getAttribute('aria-expanded') === 'true', 'aria-expanded not true');
  await more.click();
  ok(!(await pop.isVisible()), 'popover did not close on second click');
  await close();
};

/* S2 — selecting a sibling re-renders the whole surface (strip subject, hero
   family title, inspector) and closes the popover. */
// LOCK:verify-660-story:3 LOCK:verify-660-story:6 LOCK:verify-660-story:12
export const S2 = async (open, browser) => {
  const { $, close } = await open(browser);
  const before = await $('.trial-line .subject').innerText();
  await $('.trial-more').click();
  await $('.trial-pop button').first().click();
  const after = await $('.trial-line .subject').innerText();
  ok(after !== before, 'subject did not change on trial switch');
  ok(!(await $('.trial-pop').isVisible()), 'popover stayed open after switch');
  // innerText reflects the caps-rank text-transform, so match case-insensitively
  const title = await $('#hero-title').innerText();
  ok(/meal response|glucose by clock/i.test(title), 'hero family title wrong: ' + title);
  await close();
};

/* S3 — outside click dismisses the popover. */
// LOCK:verify-660-story:4
export const S3 = async (open, browser) => {
  const { $, close } = await open(browser);
  await $('.trial-more').click();
  await $('#hero-chart').click({ position: { x: 300, y: 300 } });
  ok(!(await $('.trial-pop').isVisible()), 'outside click did not dismiss');
  await close();
};

/* S4 — Escape dismisses the popover. */
// LOCK:verify-660-story:4
export const S4 = async (open, browser) => {
  const { page, $, close } = await open(browser);
  await $('.trial-more').click();
  await page.keyboard.press('Escape');
  ok(!(await $('.trial-pop').isVisible()), 'Escape did not dismiss');
  await close();
};

/* S5 — chart hover swaps the pane header to the live readout: time, BEFORE,
   TRIAL, signed Δ; crosshair only, no floating tooltip. */
// LOCK:verify-660-story:10
export const S5 = async (open, browser) => {
  const { page, $, close } = await open(browser);
  const box = await $('#hero-chart').boundingBox();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
  await settle(page, 300);
  ok(await $('#hero-head').getAttribute('data-hover') === '1', 'header did not swap to live readout');
  const t = await $('#rd-time').innerText();
  ok(/^([0-2]?\d:\d{2}|[+−]\d+:\d{2}|meal)$/.test(t), 'readout time malformed: ' + t);
  for (const id of ['#rd-before', '#rd-trial']) {
    const v = await $(id).innerText();
    ok(/^\d+$/.test(v), `${id} not an integer: ${v}`);
  }
  ok(/^[+−]\d+$/.test(await $('#rd-delta').innerText()), 'Δ not signed');
  ok(await page.locator('div.echarts-tooltip:visible, [class*=tooltip]:visible').count() === 0,
    'a floating tooltip rendered');
  await close();
};

/* S6 — leaving the chart restores the rest header. */
// LOCK:verify-660-story:10
export const S6 = async (open, browser) => {
  const { page, $, close } = await open(browser);
  const box = await $('#hero-chart').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await settle(page, 200);
  await page.mouse.move(box.x + box.width + 100, box.y + 50);   // into the inspector
  await settle(page, 300);
  ok(await $('#hero-head').getAttribute('data-hover') === '0', 'readout did not clear on leave');
  await close();
};

/* S7 — ≤900px stacks the panes and the content column scrolls (no overlap). */
// LOCK:verify-660-story:17
export const S7 = async (open, browser) => {
  const { page, $, close } = await open(browser);
  await page.setViewportSize({ width: 800, height: 900 });
  await settle(page, 400);
  const canvas = await $('.pane').first().boundingBox();
  const inspector = await $('.pane.inspector').boundingBox();
  ok(inspector.y >= canvas.y + canvas.height - 2, 'panes did not stack below 900px');
  const scrollable = await page.evaluate(() => {
    const m = document.querySelector('.main-content');
    return m.scrollHeight > m.clientHeight;
  });
  ok(scrollable, 'stacked layout is not scrollable');
  /* #359 SPLIT the one Diagnose rule that can reach this screen
     (`:is(.dw, .vw) .panes > .pane + .pane`) instead of pinning it, and this
     story's own 800px sits inside the band that moved. The two assertions above
     hold either way — Verify's own 900px breakpoint had already stacked these
     panes — so that carve-out was asserted and never observed. Both values are
     the unchanged tree's measured behaviour: Verify stacks with no horizontal
     seam here, and the 1px border-left is theme.css's, which loads last. This
     pins them; it does not change them. */
  const seam = await page.evaluate(() => {
    const { borderTopWidth, borderLeftWidth } =
      getComputedStyle(document.querySelectorAll('.panes > .pane')[1]);
    return { borderTopWidth, borderLeftWidth };
  });
  ok(seam.borderTopWidth === '0px' && seam.borderLeftWidth === '1px',
    `Verify's stacked pane border moved at 800px: ${JSON.stringify(seam)}`);
  await page.setViewportSize(VIEWPORT);
  await close();
};

/* S8 — maturing withholds Keep/Revert behind the readiness word; complete
   shows both actions under "Ready to judge". */
// LOCK:verify-660-story:16
export const S8 = async (open, browser) => {
  let { $, close } = await open(browser, { state: 'maturing' });
  ok(await $('.decide .btns button').count() === 0, 'maturing rendered action buttons');
  ok(/Maturing/.test(await $('.decide .d-status').innerText()), 'maturing readiness word missing');
  await close();
  ({ $, close } = await open(browser, { state: 'complete' }));
  ok(await $('.decide .btns button').count() === 2, 'complete did not render both actions');
  ok(/Ready to judge/.test(await $('.decide .d-status').innerText()), 'ready word missing');
  await close();
};

/* ------------------------------------------------------------------- runner */

const STORIES = { S1, S2, S3, S4, S5, S6, S7, S8 };

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.env.TARGET;
  if (target !== 'app') fail(`TARGET must be app, got ${target || '(unset)'} — the mock this ledger once ran against is archived (#722); the app is now the sole contract`);
  const open = openApp;
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
  const missing = [];
  if (!process.env.PLAYWRIGHT_MODULE) missing.push('PLAYWRIGHT_MODULE is required');
  try { createBuiltShell(); } catch (error) { missing.push(error.message); }
  if (missing.length) fail(`missing prerequisites:\n  - ${missing.join('\n  - ')}`);
  const { chromium } = playwright();
  const browser = await chromium.launch();
  let ran = 0, failed = 0;
  for (const [name, story] of Object.entries(STORIES)) {
    if (only && !only.has(name)) continue;
    try { await story(open, browser); ran++; console.log(`PASS ${name}`); }
    catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
  }
  await browser.close();
  for (const p of problems) console.error(`PROBLEM ${p}`);
  console.log(`replay(${target}): ${ran}/${only ? only.size : Object.keys(STORIES).length} stories passed`);
  if (failed || problems.length || ran === 0) process.exit(1);
}
