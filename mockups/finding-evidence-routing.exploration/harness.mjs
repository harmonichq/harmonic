/* The exploration's evidence harness. One Chromium, four jobs:
 *
 *   1. EXTRACT  the running app's cockpit topbar + footer into
 *               chrome.extracted.html, so the mock's chrome is the app's own DOM
 *               rather than a transcription of its Vue template.
 *   2. PROBE     the running app for computed styles on every selector the mock
 *               shares with it, from BOTH shipped surfaces — the workstation
 *               drilled into `finding:over_treated_low` (crumb, level, clock,
 *               evidence table, dock) and the Lows lens (canvas head, legend,
 *               judgment block) — plus the lens chart's live `getOption()`.
 *   3. DIFF      the mock against that probe, IN BOTH THEMES: computed styles +
 *               bounding rects on shared selectors, and the chart option key by
 *               key. The computed-style diff is the fidelity gate; the option
 *               diff is the only audit that can see canvas-painted furniture.
 *
 *               BOTH themes, because one theme is not a check. The first run of
 *               this harness passed dark 73/73 while the mock's light `:root`
 *               token block was not applying at all — the app-base extractor had
 *               begun its capture inside an HTML comment containing the text
 *               `<style>`. Dark passed because `html.dark` survived the same
 *               corruption. Only a populated LIGHT render exposed it, which is
 *               the lesson frontend/theme.css's own header records.
 *   4. SHOOT     the arrival as a SEQUENCE — queue level, drilled finding,
 *               row-hover single trace, inspector column, drilled population —
 *               every frame reached through the surface's own routing, so no
 *               capture shows a state a reader could not walk to.
 *
 * FIXTURE-ONLY, like every browser leg in this repo: the app is booted through
 * the gates' own `openApp`, which stubs every endpoint from the committed
 * synthetic payload and capture. Nothing talks to a pump vendor, and `harmonic
 * serve` is never run.
 *
 * FAILS CLOSED. A missing Playwright, vendor asset, payload or routed asset
 * exits nonzero naming what is absent, rather than skipping.
 *
 * Run (see CLAUDE.md's browser-gates block for PW/VENDOR setup):
 *   PLAYWRIGHT_MODULE=$PW/node_modules/playwright VENDOR_DIR=$VENDOR \
 *   PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json \
 *   node mockups/finding-evidence-routing.exploration/harness.mjs
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp, openerProblems } from '../../frontend/diagnose-workstation-behavior.replay.mjs';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const SHOTS = process.env.SHOT_DIR || join(HERE, 'screenshots');
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const VIEWPORT = { width: 1440, height: 900 };
const MOCK_URL = 'http://mock.local/mockups/finding-evidence-routing.exploration/index.html';

const missing = [];
let chromium = null;
if (!process.env.PLAYWRIGHT_MODULE) missing.push('PLAYWRIGHT_MODULE is unset');
else {
  try { chromium = require(process.env.PLAYWRIGHT_MODULE).chromium; }
  catch (e) { missing.push(`PLAYWRIGHT_MODULE could not be required (${e.message})`); }
}
if (chromium && !process.env.PLAYWRIGHT_EXECUTABLE_PATH && !existsSync(chromium.executablePath())) {
  missing.push(`Chromium is missing (${chromium.executablePath()})`);
}
const VENDOR = process.env.VENDOR_DIR;
if (!VENDOR) missing.push('VENDOR_DIR is unset (vendored vue.esm-browser.js + echarts.min.js)');
else for (const a of ['vue.esm-browser.js', 'echarts.min.js']) {
  if (!existsSync(join(VENDOR, a))) missing.push(`VENDOR_DIR is missing ${a}`);
}
if (!process.env.PAYLOAD) missing.push('PAYLOAD is unset (mockups/diagnose-workstation.synthetic/payload.json)');
if (!existsSync(join(HERE, 'data.json'))) missing.push('data.json is absent — run build.mjs first');
if (missing.length) {
  process.stderr.write(`harness.mjs cannot run — missing prerequisites:\n  - ${missing.join('\n  - ')}\n`);
  process.exit(1);
}

const PROPS = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height',
  'text-transform', 'text-align', 'font-variant-numeric', 'color', 'background-color',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-color', 'border-bottom-color', 'border-top-left-radius', 'border-bottom-right-radius',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-left', 'row-gap', 'column-gap',
  'display', 'grid-template-columns', 'grid-template-rows', 'align-items', 'min-height', 'opacity',
  'box-shadow',
];

/* Selectors the mock shares with a shipped surface. Anything the mock ADDS that
   has no shipped sibling (the scope chip) is deliberately absent here and is
   called out in the report instead of being quietly self-compared. */
const SELECTORS = [
  '.cockpit-shell', '.cockpit-topbar', '.cockpit-identity', '.cockpit-mark', '.cockpit-step',
  '.cockpit-step-number', '.cockpit-scope', '.cockpit-scope-label', '.cockpit-log-carbs',
  '.cockpit-stage', '.cockpit-footer', '.cockpit-advisory', '.cockpit-profile-facts',
  '.panes', '.pane', '.pane > header', '.pane > header h2',
  '.canvas-pane > header.canvas-head', '.canvas-head .head-swap', '.canvas-head .head-line',
  '.ec-title-context', '.canvas-head .persist', '.ec-chart', '.ec-chart-key',
  '.ec-key-item', '.ec-key-mark', '.ec-key-item strong', '.ec-key-item small', '.ec-support-label',
  '.inspector', '.inspector > .body', '.crumb', '.crumb .trail', '.crumb .trail .here',
  '.crumb .trail button', '.crumb .trail .chev',
  '.level', '.level .inner', '.lvl-cap', '.lvl-cap .meta',
  /* TIER-SCOPED on purpose. The shipped queue keys a whole demoted register off
     `data-tier` / `data-state` (one weight step, one size step, a 72% tag hue),
     and that attribute is PROJECTION data. The mock's finding header is priced
     (findings-projection.json gives `finding:over_treated_low` priority 28);
     the app's own payload leaves the same finding unpriced, so a bare `.qrow`
     compares a priced row against a demoted one and reports the demotion as
     drift. Comparing like with like is the only comparison that means anything;
     if the app fixture has no priced row at all, these land in `absentInApp`
     and the gap is reported rather than papered over. */
  '.q', '.qrow[data-tier="priced"]', '.qrow[data-tier="priced"] .lab',
  '.qrow[data-tier="priced"] .tag', '.qrow[data-tier="priced"] .tag .gly',
  '.qrow[data-tier="priced"] .den', '.qrow[data-tier="priced"] .den .v',
  /* Round 2 opens at the queue, so the demoted register, the chevron and the
     seam sentence are on the mock's surface too and compare against the app's. */
  '.qrow[data-tier="tail"]', '.qrow[data-tier="tail"] .lab',
  '.qrow[data-tier="tail"] .den', '.qrow .go', '.tailnote', '.quiet-line',
  '.slot-say', '.ec-counts', '.ec-count', '.ec-count b', '.ec-count em', '.ec-boundary-note',
  '.slotlink', '.linkbtn',
  /* ROUND 5, BLOCK 5 — `.ev-group` is no longer emitted by the mock (the group
     header is a rule now), so these three would silently skip. They are left
     listed on purpose: if a later round reinstates the shipped header, it starts
     verified again the moment it appears. */
  '.ev-group', '.ev-group b', '.ev-group .n', '.ev-row', '.ev-row .when', '.ev-row .entry',
  '.ev-row .arrow', '.ev-row .worst', '.ev-row .delta', '.ev-row .tier', '.ev-row .chev', '.more',
  '.watch',
  /* ROUND 5, WORKSTREAM A — the pooled canvas's own shipped siblings. Every one
     of these exists on the running workstation at level 1, so the queue root's
     canvas is checked against the app the same way the lens is. */
  '.dw-canvas > .body', '#chart',
  '.canvas-head .head-rest h2', '.canvas-head .head-rest .meta',
  '.head-live', '.head-live .rd-time', '.head-live .rd-pair', '.head-live .rd-pair .k',
  '.head-live .rd-pair .v', '.head-live .rd-note',
  '.lane-wrap', '.lane-stack', '.lane', '.lane button',
  '.lane-key', '.lane-key span', '.lane-key i', '.lane-key .lead', '.lane-key .t',
];

/* DELIBERATE deviations, each named with the reason it is not drift. Anything
   not in this map that differs is a real finding. */
const EXPECTED = {
  '.panes|grid-template-rows': 'the retired instrument row: 42px of rail height returns to the panes (#31 ruling 1)',
  '.pane|grid-template-rows': 'ditto — the pane inherits the taller track',
  '.inspector|grid-template-rows': 'ditto, PLUS round 5 block 8: the dock is no longer a 98px reserve, so '
    + 'the level track takes that height as well. This is the term-48 re-settle, in one number.',
  '.inspector > .body|grid-template-rows': 'ditto — the level track grows; the crumb row differs by 1px because the count accessory sits in it',
  /* ROUND 5, BLOCK 8 — the four faces of the same re-settle. */
  '.watch|min-height': 'block 8: the dock is one line at the column\'s true bottom, not a 98px reserve '
    + '(re-settles migrated lock term 48)',
  '.watch|background-color': 'block 8: unfilled — the hairline above it is what separates it now',
  '.watch|display': 'block 8: one line, so no two-column grid',
  '.watch|border-top-width': 'block 8: the hairline that replaces the fill',
  '.watch|padding-top': 'block 8: padding sized to one line',
  '.watch|padding-bottom': 'block 8: padding sized to one line',
  '.watch|align-items': 'block 8: no grid, so no grid alignment',
  '.watch|row-gap': 'block 8: one line has no row gap',
  '.watch|column-gap': 'block 8: one line has no column gap',
  '.watch|grid-template-columns': 'block 8: no grid',
  '.watch|grid-template-rows': 'block 8: the three shipped ranks (kind / what / how) are one line now, '
    + 'so there are no rows to lay out',
  '.watch|border-top-color': 'block 8: the app declares no top border at all, so its "colour" is the '
    + 'inherited text ink of a 0px edge — the mock\'s is `--ck-hair`, the pane\'s own hairline',
  /* ROUND 5, WORKSTREAM A — the two consequences of lifting the pooled canvas. */
  '.lane-stack|grid-template-rows': 'workstream A, omission (b): the shipped stack carries a second row of '
    + 'I:C block verdicts beneath the basal lane. The #31 ruling names the BASAL verdict lane, and with one '
    + 'lane the key\'s lead-word grammar (which exists to tell the two rows apart) is doing nothing. One '
    + 'row here, two in the app — a real divergence, not a resolution artifact.',
  '.canvas-head .head-rest .meta|margin-left': 'an AUTO margin, resolved against a different string length — '
    + 'the two fixtures pool different reading counts, so "window N of M readings" is not the same width. '
    + 'The rule is identical; same class as the `.lvl-cap .meta` entry above.',
  '.lvl-cap .meta|margin-left': 'an AUTO margin, resolved against a different string length — the rule is identical',
  /* ROUND 4 ITEM 12 — the two seams where the inspector's stacked sections were
     given air. Each is a margin or padding ADDED to a shipped element on
     purpose; neither touches an ink, a type rank or a hairline. */
  '.lvl-cap|margin-top': 'item 12: the Occurrences cap takes air above it, so the table reads as its own '
    + 'section rather than as more of the judgment block',
  '.level .inner|padding-bottom': 'item 12: the judgment block closes with air before the claim selector, '
    + 'which item 4 moved outside `.inner`',
};

const probeScript = ({ props, selectors }) => {
  const out = {};
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (!node) continue;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const values = {};
    for (const prop of props) values[prop] = style.getPropertyValue(prop);
    out[selector] = {
      values,
      rect: { w: Math.round(rect.width * 10) / 10, h: Math.round(rect.height * 10) / 10 },
      tag: node.tagName,
    };
  }
  return out;
};

/* The chart-option shape both sides are reduced to. `series[].data` is left out
   on purpose: the two fixtures hold disjoint populations, so the DATA differs by
   construction and only the furniture and per-series styling are contract. */
const OPTION_READER = () => JSON.parse(JSON.stringify((() => {
  const o = (window.__diagnoseEventComparison?.chart || window.__ferChart).getOption();
  return {
    grid: o.grid, tooltip: o.tooltip, aria: o.aria, xAxis: o.xAxis, yAxis: o.yAxis,
    animation: o.animation, backgroundColor: o.backgroundColor,
    series: o.series.map((s) => ({
      id: s.id, name: s.name, type: s.type, z: s.z, showSymbol: s.showSymbol,
      symbolSize: s.symbolSize, lineStyle: s.lineStyle, itemStyle: s.itemStyle,
      markArea: s.markArea ? { itemStyle: s.markArea.itemStyle, label: s.markArea.label } : undefined,
    })),
  };
})()));

/* ROUND 5, WORKSTREAM A — THE QUEUE ROOT'S CHART, READ OFF WHICHEVER SURFACE IS
 * RUNNING. Both sides mount the pooled chart on `#chart` through the shipped
 * `renderCanvas`, so one reader serves the app and the mock.
 *
 * `series[].data`, `markArea` and `markLine` are left out on purpose and the
 * reason is the same one the lens reader gives: the two sides hold different
 * synthetic populations, so the DATA differs by construction — and on this chart
 * the window label, the target-band annotation coordinates and the two
 * median value tags are all functions of that data. What is left is the
 * furniture and the per-series styling, which IS the contract. */
const POOLED_READER = () => JSON.parse(JSON.stringify((() => {
  const host = document.querySelector('#chart');
  const chart = window.echarts.getInstanceByDom(host);
  if (!chart) return null;
  const o = chart.getOption();
  const axis = (a) => ({
    type: a.type, min: a.min, max: a.max, interval: a.interval,
    boundaryGap: a.boundaryGap, gridIndex: a.gridIndex, show: a.show,
    axisLine: a.axisLine, axisTick: a.axisTick,
    axisLabel: { ...a.axisLabel, interval: undefined, formatter: undefined },
    splitLine: { ...a.splitLine, interval: undefined },
    name: a.name, nameTextStyle: a.nameTextStyle, nameGap: a.nameGap, nameLocation: a.nameLocation,
  });
  return {
    grid: o.grid,
    tooltip: o.tooltip,
    animation: o.animation,
    backgroundColor: o.backgroundColor,
    textStyle: o.textStyle,
    legend: (o.legend || []).map((l) => ({
      show: l.show, top: l.top, right: l.right, itemWidth: l.itemWidth,
      itemHeight: l.itemHeight, itemGap: l.itemGap, selectedMode: l.selectedMode,
      silent: l.silent, textStyle: l.textStyle, data: l.data,
    })),
    xAxis: o.xAxis.map(axis),
    yAxis: o.yAxis.map(axis),
    series: o.series.map((s) => ({
      name: s.name, type: s.type, z: s.z, stack: s.stack, symbol: s.symbol,
      symbolSize: s.symbolSize, barWidth: s.barWidth, smooth: s.smooth,
      connectNulls: s.connectNulls, xAxisIndex: s.xAxisIndex, yAxisIndex: s.yAxisIndex,
      lineStyle: s.lineStyle, areaStyle: s.areaStyle, itemStyle: s.itemStyle,
      emphasis: s.emphasis, blur: s.blur,
    })),
  };
})()));

/** Probe the running app, in one theme, across both shipped surfaces. */
async function probeApp(browser, theme, { writeChrome = false } = {}) {
  const app = {};

  const ws = await openApp(browser, { theme, viewport: VIEWPORT });

  /* LEVEL 1 FIRST. Drilling replaces the queue, and the queue is where the
     `.q` / `.qrow` grammar the mock re-uses for its finding header actually
     lives — probing only the drilled state left all eight of those selectors
     unverified against the app. */
  /* ROUND 5, WORKSTREAM A — the queue-root canvas, at the SAME WINDOW the mock
     stands on. The mock has no preset instruments (the ruling retires them) and
     therefore stands on 24 h permanently; the app opens on its configured
     preset, so the app is pressed to 24 h before the option is read. Comparing a
     6-hour window against a 24-hour one would report the window as drift.
     Fails closed: no 24 h preset means no comparison, and it says so. */
  const pressed = await ws.evaluate(() => {
    const button = [...document.querySelectorAll('#seg-window button')]
      .find((b) => b.textContent.trim() === '24 h');
    if (!button) return false;
    button.click();
    return true;
  });
  if (!pressed) throw new Error('the app has no "24 h" window preset to press for the pooled comparison');
  await ws.waitForTimeout(600);
  const pooledOption = await ws.evaluate(POOLED_READER);
  if (!pooledOption) throw new Error('the app published no pooled-chart getOption() at level 1');

  const queueProbe = await ws.evaluate(probeScript, { props: PROPS, selectors: SELECTORS });

  const drilled = await ws.evaluate(() => {
    const n = document.querySelector('.qrow[data-id="finding:over_treated_low"]');
    if (!n) return false;
    n.click();
    return true;
  });
  if (!drilled) throw new Error('the app queue has no finding:over_treated_low row to drill');
  await ws.waitForTimeout(700);
  if (writeChrome) {
    const chromeHtml = await ws.evaluate(() => [
      document.querySelector('.cockpit-topbar')?.outerHTML || '',
      document.querySelector('.cockpit-footer')?.outerHTML || '',
    ].join('\n'));
    if (!chromeHtml.includes('cockpit-topbar')) throw new Error('no cockpit chrome found in the running app');
    await writeFile(join(HERE, 'chrome.extracted.html'),
      '<!-- EXTRACTED VERBATIM from the RUNNING app\'s DOM (frontend/index.html booted\n'
      + '     through the browser gates\' own fixture-only opener) by harness.mjs.\n'
      + '     Do not edit — re-run the harness. Vue bindings are already resolved, so\n'
      + '     this is the chrome the reader actually sees, not its template. -->\n'
      + `${chromeHtml}\n`);
  }
  Object.assign(app, await ws.evaluate(probeScript, { props: PROPS, selectors: SELECTORS }));

  /* A PARAMETER level too, for `.slot-say` — the shipped sentence class the mock
     re-uses for the absorbed judgment summary. It lives on a setting's own drill
     panel, which a finding drill never reaches. */
  const slotProbe = await ws.evaluate(() => {
    const back = document.querySelector('.crumb .trail button');
    if (!back) return false;
    back.click();
    return true;
  }) && await (async () => {
    await ws.waitForTimeout(500);
    const opened = await ws.evaluate(() => {
      const n = [...document.querySelectorAll('.qrow')].find((r) => r.dataset.id?.startsWith('basal:'));
      if (!n) return false;
      n.click();
      return true;
    });
    if (!opened) return null;
    await ws.waitForTimeout(600);
    return ws.evaluate(probeScript, { props: PROPS, selectors: SELECTORS });
  })();

  /* Fill gaps in drill order: the drilled finding level is the primary sibling,
     then the queue, then a parameter level. First surface that actually LAYS OUT
     a selector wins; nothing is ever compared against a 0x0 element. */
  for (const probe of [queueProbe, slotProbe || {}]) {
    for (const [selector, entry] of Object.entries(probe)) {
      const held = app[selector];
      if (entry.rect.w === 0 && entry.rect.h === 0) continue;
      if (!held || (held.rect.w === 0 && held.rect.h === 0)) app[selector] = entry;
    }
  }
  await ws.close();

  const lensPage = await openApp(browser, { theme, viewport: VIEWPORT });
  await lensPage.evaluate(() => {
    history.pushState(null, '', '/?view=lows&factor=over_treated_low&block=all');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await lensPage.waitForSelector('.ec-chart-key .ec-key-item');
  await lensPage.waitForTimeout(700);
  const lensProbe = await lensPage.evaluate(probeScript, { props: PROPS, selectors: SELECTORS });
  /* The lens owns the canvas/legend/judgment selectors; the workstation owns the
     drill ones. First surface that actually LAYS OUT the selector wins. */
  for (const [selector, entry] of Object.entries(lensProbe)) {
    const held = app[selector];
    if (!held || (held.rect.w === 0 && held.rect.h === 0)) app[selector] = entry;
  }
  const option = await lensPage.evaluate(OPTION_READER);
  if (!option) throw new Error('the lens chart published no getOption()');
  await lensPage.close();
  return { app, option, pooledOption };
}

/** Open the mock in one theme, on a fail-closed static route. */
async function openMock(browser, theme, problems) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  /* The STACK, not just the message. A boot failure inside a lifted shipped
     module says nothing useful without one — "Cannot read properties of
     undefined" is true of a hundred lines. */
  page.on('pageerror', (e) => problems.push(`pageerror(mock ${theme}): ${e.stack || e}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console(mock ${theme}): ${m.text()}`); });
  await page.addInitScript((t) => {
    if (t === 'dark') localStorage.setItem('theme', 'dark');
    else localStorage.removeItem('theme');
  }, theme);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 204 });
    if (url.href.includes('echarts')) {
      return route.fulfill({ body: await readFile(join(VENDOR, 'echarts.min.js')), contentType: 'text/javascript' });
    }
    if (url.hostname !== 'mock.local') {
      problems.push(`unrouted ${url.href} (${theme})`);
      return route.fulfill({ status: 404, body: 'not routed' });
    }
    try {
      return route.fulfill({
        body: await readFile(join(ROOT, url.pathname.slice(1))),
        contentType: MIME[extname(url.pathname)] || 'text/plain',
      });
    } catch {
      problems.push(`missing asset ${url.pathname} (${theme})`);
      return route.fulfill({ status: 404, body: 'missing' });
    }
  });
  await page.goto(MOCK_URL);
  try { await page.waitForFunction(() => window.__ferReady === true); }
  catch (e) {
    process.stderr.write(`mock (${theme}) never became ready:\n  - ${problems.join('\n  - ') || '(no errors captured)'}\n`);
    throw e;
  }
  await page.waitForTimeout(700);
  return page;
}

/** The three levels the mock can stand at, in sibling-priority order. */
const MOCK_LEVELS = ['finding:over_treated_low', null, 'population:lows'];

/** Route the mock and wait for the swap to settle. */
async function gotoLevel(page, id) {
  await page.evaluate((target) => window.__ferGo(target), id);
  await page.waitForTimeout(450);
}

/**
 * Probe the mock across every level it can stand at, merging the same way the
 * app side does: the drilled finding case file is the primary sibling, then the
 * queue, then the population case file. Round 1 probed a single frozen state,
 * which left every selector that only exists at another level unverified.
 */
async function probeMock(page) {
  const mock = {};
  for (const level of MOCK_LEVELS) {
    await gotoLevel(page, level);
    const probe = await page.evaluate(probeScript, { props: PROPS, selectors: SELECTORS });
    for (const [selector, entry] of Object.entries(probe)) {
      const held = mock[selector];
      if (entry.rect.w === 0 && entry.rect.h === 0) continue;
      if (!held || (held.rect.w === 0 && held.rect.h === 0)) mock[selector] = entry;
    }
  }
  return mock;
}

/* `grid-template-columns` / `-rows` compute to RESOLVED PIXEL TRACKS, so an
   `auto` or `1fr` track sized by a different string reports as a difference even
   though the declaration is byte-identical. When the two sides have the same
   NUMBER of tracks, the declared template matched and only the content differed;
   a different track count is real drift. This is the same class of reporting
   artifact sibling-fidelity.md names for box-sizing width/height. */
const contentResolved = (prop, a, b) =>
  (prop === 'grid-template-columns' || prop === 'grid-template-rows')
  && a.split(/\s+/).length === b.split(/\s+/).length;

function diffStyles(app, mock) {
  const report = { checked: 0, matched: 0, absentInApp: [], mismatches: [], expected: [], contentResolved: [] };
  for (const selector of SELECTORS) {
    const a = app[selector];
    const m = mock[selector];
    if (!m) continue;
    if (!a || (a.rect.w === 0 && a.rect.h === 0)) { report.absentInApp.push(selector); continue; }
    report.checked += 1;
    const bad = [];
    for (const prop of PROPS) {
      if (a.values[prop] === m.values[prop]) continue;
      const note = EXPECTED[`${selector}|${prop}`];
      if (note) {
        report.expected.push(`${selector} ${prop}: app "${a.values[prop]}" vs mock "${m.values[prop]}" — ${note}`);
        continue;
      }
      if (contentResolved(prop, a.values[prop], m.values[prop])) {
        report.contentResolved.push(`${selector} ${prop}: app "${a.values[prop]}" vs mock "${m.values[prop]}"`);
        continue;
      }
      bad.push(`${prop}: app "${a.values[prop]}" vs mock "${m.values[prop]}"`);
    }
    if (bad.length) report.mismatches.push({ selector, appTag: a.tag, mockTag: m.tag, bad });
    else report.matched += 1;
  }
  return report;
}

function diffOption(appOption, mockOption) {
  const out = [];
  const walk = (a, b, path) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], `${path}.${key}`);
      return;
    }
    out.push(`${path}: app ${JSON.stringify(a)} vs mock ${JSON.stringify(b)}`);
  };
  for (const key of ['grid', 'tooltip', 'aria', 'animation', 'backgroundColor']) walk(appOption[key], mockOption[key], key);
  for (const axis of ['xAxis', 'yAxis']) {
    const a = { ...appOption[axis][0] };
    const b = { ...mockOption[axis][0] };
    for (const o of [a, b]) { delete o.id; if (o.axisLabel) delete o.axisLabel.formatter; }
    for (const key of ['min', 'max', 'interval', 'type', 'name', 'nameLocation', 'nameGap',
      'nameTextStyle', 'axisLine', 'axisTick', 'splitLine', 'axisLabel']) {
      walk(a[key], b[key], `${axis}.${key}`);
    }
  }
  const mockSeries = new Map(mockOption.series.filter((s) => s.id).map((s) => [s.id, s]));
  for (const a of appOption.series.filter((s) => s.id)) {
    const b = mockSeries.get(a.id);
    if (!b) { out.push(`series ${a.id}: present in app, absent in mock`); continue; }
    walk(a, b, `series[${a.id}]`);
  }
  walk(appOption.series.find((s) => s.markArea)?.markArea,
    mockOption.series.find((s) => s.markArea)?.markArea, 'series[Target range].markArea');
  return out;
}

/* ROUND 5, WORKSTREAM A — the queue-root chart-option diff. Series are matched
   BY INDEX rather than by name, because `renderCanvas` emits the two stacked
   band pairs under repeated `__outer` / `__inner` names and builds the whole
   list in one fixed order on both sides; a name map would silently collapse
   four series into two. A different LENGTH is real drift and is reported as
   such rather than being zipped over. */
function diffPooledOption(app, mock) {
  const out = [];
  const walk = (a, b, path) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], `${path}.${key}`);
      return;
    }
    out.push(`${path}: app ${JSON.stringify(a)} vs mock ${JSON.stringify(b)}`);
  };
  for (const key of ['grid', 'tooltip', 'animation', 'backgroundColor', 'textStyle', 'legend']) {
    walk(app[key], mock[key], key);
  }
  for (const axis of ['xAxis', 'yAxis']) {
    if (app[axis].length !== mock[axis].length) {
      out.push(`${axis}: app has ${app[axis].length}, mock has ${mock[axis].length}`);
      continue;
    }
    app[axis].forEach((a, i) => walk(a, mock[axis][i], `${axis}[${i}]`));
  }
  if (app.series.length !== mock.series.length) {
    out.push(`series: app has ${app.series.length}, mock has ${mock.series.length}`);
    return out;
  }
  app.series.forEach((a, i) => walk(a, mock.series[i], `series[${i} ${a.name}]`));
  return out;
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const problems = [];
  const results = {};

  for (const theme of ['dark', 'light']) {
    /* The chrome partial is written once, from the dark pass; it is the same DOM
       in both themes (the theme is a class on <html>, not different markup). */
    const { app, option, pooledOption } = await probeApp(browser, theme, { writeChrome: theme === 'dark' });
    const page = await openMock(browser, theme, problems);
    const mock = await probeMock(page);
    /* ROUND 5 — the QUEUE ROOT's chart, read where it stands. */
    await gotoLevel(page, null);
    const mockPooled = await page.evaluate(POOLED_READER);
    if (!mockPooled) throw new Error('the mock published no pooled-chart getOption() at the queue root');
    /* The lens chart option is read from the FINDING scene — the filtered lens,
       which is the shipped lens's own coordinate set. */
    await gotoLevel(page, 'finding:over_treated_low');
    const mockOption = await page.evaluate(OPTION_READER);

    /* Lock term 1's clause, checked rather than assumed, plus the thing a
       token-resolution failure shows up as. */
    const geometry = await page.evaluate(() => {
      const level = document.querySelector('#level');
      const trail = document.querySelector('.crumb .trail');
      const root = getComputedStyle(document.documentElement);
      return {
        pageScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        pageScrollY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        levelScrollsInternally: level.scrollHeight > level.clientHeight,
        breadcrumbClipped: trail.scrollWidth > trail.clientWidth,
        unresolvedTokens: ['--surface-2', '--primary', '--text', '--line']
          .filter((t) => root.getPropertyValue(t).trim() === ''),
      };
    });
    if (geometry.unresolvedTokens.length) {
      throw new Error(`mock (${theme}) has unresolved app tokens: ${geometry.unresolvedTokens.join(', ')} `
        + '— the app-base extraction is corrupt');
    }

    results[theme] = {
      computedStyleDiff: diffStyles(app, mock),
      chartOptionDiff: diffOption(option, mockOption),
      pooledOptionDiff: diffPooledOption(pooledOption, mockPooled),
      geometry,
    };

    /* THE ARRIVAL, SHOT AS A SEQUENCE. Every frame below is REACHED through the
       surface's own routing — `__ferGo` is the same call a click makes — so no
       capture shows a state a reader could not walk to. */
    const data = JSON.parse(await readFile(join(HERE, 'data.json'), 'utf8'));
    if (theme === 'dark') {
      await gotoLevel(page, null);
      await page.screenshot({ path: join(SHOTS, 'queue-level-1440x900.png') });

      await gotoLevel(page, 'finding:over_treated_low');
      await page.screenshot({ path: join(SHOTS, 'scene-1440x900.png') });
      await page.locator('.pane.inspector').screenshot({ path: join(SHOTS, 'inspector-column.png') });

      const rowId = data.scenes['finding:over_treated_low'].occurrences.groups[0].rows[2].id;
      await page.evaluate((id) => window.__ferSelect(id), rowId);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(SHOTS, 'row-hover-linked-trace.png') });
      results.highlightedRow = rowId;

      /* THE POPULATION CASE FILE, AS A SEQUENCE OF FRAMES (round 3). It opens on
         the largest claiming factor; a second claim line reframes both panes; a
         row overlays one trace on whichever comparison is drawn. Every frame is
         reached through the surface's own selector — `__ferFrame` is the call the
         claim row's click makes — so nothing here is a state a reader cannot walk
         to, and the flat all-cohorts draw round 2 arrived at does not exist. */
      const population = data.scenes['population:lows'];
      await gotoLevel(page, 'population:lows');
      await page.screenshot({ path: join(SHOTS, 'population-all-lows-1440x900.png') });
      await page.locator('.pane.inspector').screenshot({ path: join(SHOTS, 'population-inspector-column.png') });
      results.populationDefaultFrame = population.defaultFactor;

      const populationRow = population.frames[population.defaultFactor].occurrences.groups[0].rows[1].id;
      await page.evaluate((id) => window.__ferSelect(id), populationRow);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(SHOTS, 'population-row-trace-1440x900.png') });
      results.populationHighlightedRow = populationRow;

      /* EVERY SEGMENT, INCLUDING UNCLAIMED (round 5, block 2). Two of the three
         reframe the lens at another factor's coordinates; the third has no
         comparison to draw and its capture is the whole point of the frame's
         return — the honest empty canvas, shot rather than described. */
      for (const key of Object.keys(population.frames).filter((k) => k !== population.defaultFactor)) {
        await page.evaluate((k) => window.__ferFrame(k), key);
        await page.waitForTimeout(450);
        await page.screenshot({ path: join(SHOTS, `population-frame-${key}-1440x900.png`) });
        await page.locator('.pane.inspector')
          .screenshot({ path: join(SHOTS, `population-frame-${key}-inspector.png`) });
      }

      /* Back to the default frame, expanded: the cap is spent across the regrouped
         cohorts in order, so the groups below it only appear here. */
      await page.evaluate((k) => window.__ferFrame(k), population.defaultFactor);
      await page.waitForTimeout(450);
      /* ROUND 5, BLOCK 9 — the expander is now conditional on GENUINE overflow,
         so this leg reports whether there was one rather than assuming it. */
      const expander = await page.$('.level .more');
      results.populationExpanderPresent = Boolean(expander);
      if (expander) {
        await expander.click();
        /* The pointer lands on whatever the expander pushed under it, and a hover
           wash in a capture reads as a selection that is not there. */
        await page.mouse.move(0, 0);
        await page.waitForTimeout(350);
        await page.locator('.pane.inspector').screenshot({ path: join(SHOTS, 'population-expanded-inspector.png') });
      }
    } else {
      await gotoLevel(page, null);
      await page.screenshot({ path: join(SHOTS, 'queue-level-light-1440x900.png') });
      await gotoLevel(page, 'finding:over_treated_low');
      await page.screenshot({ path: join(SHOTS, 'scene-light-1440x900.png') });
      /* ROUND 5 — the Lows frame on parchment. The segmented control's only
         inks are the primary rule and two text opacities, and a light ground is
         where an underline-not-fill control either holds or disappears. */
      await gotoLevel(page, 'population:lows');
      await page.screenshot({ path: join(SHOTS, 'population-lows-light-1440x900.png') });
      await page.locator('.pane.inspector')
        .screenshot({ path: join(SHOTS, 'population-lows-light-inspector.png') });
    }
    await page.close();
  }

  await browser.close();

  const out = { viewport: VIEWPORT, ...results, mockProblems: problems, openerProblems: openerProblems() };
  await writeFile(join(HERE, 'fidelity-report.json'), `${JSON.stringify(out, null, 1)}\n`);

  for (const theme of ['dark', 'light']) {
    const r = results[theme];
    const d = r.computedStyleDiff;
    process.stdout.write(
      `\n[${theme}] computed-style diff — ${d.matched}/${d.checked} shared selectors identical, `
      + `${d.mismatches.length} unexplained, ${d.expected.length} named deviation(s), `
      + `${d.absentInApp.length} not laid out in the app, `
      + `${d.contentResolved.length} track(s) resolved against different content\n`
      + `[${theme}] lens chart-option diff — ${r.chartOptionDiff.length} difference(s)\n`
      + `[${theme}] queue-root pooled chart-option diff — ${r.pooledOptionDiff.length} difference(s)\n`
      + `[${theme}] page scroll x ${r.geometry.pageScrollX}px / y ${r.geometry.pageScrollY}px; `
      + `breadcrumb clipped: ${r.geometry.breadcrumbClipped}; `
      + `level scrolls internally: ${r.geometry.levelScrollsInternally}\n`,
    );
    for (const e of d.expected) process.stdout.write(`  = ${e}\n`);
    for (const m of d.mismatches) {
      process.stdout.write(`  ! ${m.selector} (app <${m.appTag}> / mock <${m.mockTag}>)\n`);
      for (const b of m.bad) process.stdout.write(`      ${b}\n`);
    }
    for (const o of r.chartOptionDiff) process.stdout.write(`  ~ ${o}\n`);
    for (const o of r.pooledOptionDiff) process.stdout.write(`  ≈ ${o}\n`);
  }
  process.stdout.write(`\nmock console/page errors — ${problems.length}\n`);
  for (const p of problems) process.stdout.write(`  x ${p}\n`);
}

await main();
