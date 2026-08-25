// Behaviour replay for the Diagnose workstation — the executable half of the
// behaviour ledger frozen with the Diagnose workstation lock.
//
// WHY THIS EXISTS: the lock manifest says what the surface LOOKS like. It does
// not say that an edge is grabbable down its whole height, that a press which
// never moves must change nothing, or that a hovered dot latches the docked
// readout. Those lived in the mock's code when this ledger was written; the
// mock has since been archived (#722), and the app is now the sole contract
// artifact for these behaviours. Each story below is one exported function
// that performs the behaviour for real against the built app and asserts what
// it actually does.
//
//   PLAYWRIGHT_MODULE=<playwright> VENDOR_DIR=<vendored echarts+vue> \
//   BASE_URL=http://127.0.0.1:8766 TARGET=app PAYLOAD=<snapshot.json> \
//   [ONLY=S01,S07] \
//   node frontend/diagnose-workstation-behavior.replay.mjs
//
// PAYLOAD is required: the API-shaped snapshot the app's own adapter consumes.
// TARGET must be app — the mock this ledger once ran against is archived; a
// bare run or TARGET=mock fails loudly rather than silently defaulting.
//
// FAILS CLOSED. A missing driver, vendored asset or fixture exits nonzero. It
// never skips: a green run that executed zero stories is the exact silent pass
// this whole process exists to prevent.
import { createRequire } from 'node:module';
import { readFile, access, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectSyntheticCapture } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';
import { projectFindings, projectIcHistoryEvents } from '../mockups/findings-projection.mirror.mjs';
// ADR 94: a router-owned page path IS the SPA document. Reload stories re-request
// the address the app canonicalized to (`/diagnose?...`), so the page set has to
// come from the router that owns it rather than a second list here.
import { TABS as ROUTER_TABS } from './tab-routing.js';

const require = createRequire(import.meta.url);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PAGE_PATHS = new Set(ROUTER_TABS.map((tab) => `/${tab.id}`));
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' };
const FINDINGS_PROJECTION = JSON.parse(await readFile(
  join(ROOT, 'frontend/__fixtures__/findings-projection.json'), 'utf8'));
const MISSED_MEAL_COMPARISON = JSON.parse(await readFile(
  join(ROOT, 'frontend/__fixtures__/missed-meal-comparison.json'), 'utf8'));

const evidenceDir = process.env.DIAGNOSE_EVIDENCE_DIR || null;
const evidenceViewport = () => process.env.VIEWPORT || '1440x900';
const evidenceTheme = () => process.env.THEME || 'dark';
async function captureEvidence(page, label) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({
    path: join(evidenceDir, `${label}-${evidenceViewport()}-${evidenceTheme()}.png`),
    fullPage: false,
  });
}

/* ---------------------------------------------------------------- assertions */

export class ReplayError extends Error {}
const fail = (msg) => { throw new ReplayError(msg); };
export const is = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};
export const ok = (cond, what) => { if (!cond) fail(what); };
/** Term 45 — the queue's meta never restates the window range. */
export const assertNoRangeInMeta = (meta) => {
  if (/\d\d:\d\d/.test(meta || '')) fail(`the queue meta restates the window range: ${meta}`);
};
export const near = (got, want, tol, what) => {
  if (!(Math.abs(got - want) <= tol)) fail(`${what}: ${got} not within ${tol} of ${want}`);
};

/* ------------------------------------------------------------- page readers */

/** One structured read of everything the stories assert on. */
export const state = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const txt = (s) => q(s)?.textContent.trim() ?? null;
  const display = (node) => node ? getComputedStyle(node).display : null;
  const rendered = (node) => node ? display(node) !== 'none' && node.getClientRects().length > 0 : false;
  const textLeft = (node) => {
    if (!node) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    return Math.round(range.getBoundingClientRect().left);
  };
  return {
    chip: q('#seg-window [data-follow]')?.textContent.replace('×', '').trim() || null,
    pressed: [...document.querySelectorAll('#seg-window button')]
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent.replace('×', '').trim()),
    crumb: [...document.querySelectorAll('#crumb-trail > *')]
      .map((n) => n.textContent.trim()).filter((t) => t !== '›'),
    crumbMeta: txt('#crumb-meta'),
    levelText: txt('#level'),
    scope: txt('#canvas-scope'),
    /* #62 — the case file's own head, and the line the panel prints when the
       finding the reader is standing on has no row in the selected window. */
    levelWho: q('#level .who')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    levelStat: q('#level .statline')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    levelEmpty: txt('#level .empty'),
    levelEmptyLeft: textLeft(q('#level .empty')),
    levelLoading: q('#level')?.dataset.loading ?? null,
    bandKeys: [...document.querySelectorAll('#level .vband .key .lead')].map((n) => n.textContent.trim()),
    // ALIGN's two canvases: which one is mounted, and whose header is up
    alignShown: q('#align-group') ? rendered(q('#align-group')) : null,
    alignPressed: [...document.querySelectorAll('#seg-align button')]
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent.trim()),
    eventCanvas: q('#align-canvas') ? !q('#align-canvas').hidden : null,
    clockCanvas: q('#chart') ? !q('#chart').hidden : null,
    clockHead: rendered(q('#canvas-head')),
    clockHeadDisplay: display(q('#canvas-head')),
    canvasHead: (() => {
      const node = q('#canvas-head');
      const r = node?.getBoundingClientRect();
      return node && r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), title: txt('#canvas-head h2'), label: txt('#canvas-head .ec-title-context'), hover: node.dataset.hover } : null;
    })(),
    eventHeads: [...document.querySelectorAll('.ec-canvas .head-rest h2')].filter(rendered).length,
    eventCaption: q('.ec-window-context')?.textContent.trim() ?? null,
    pool: txt('#canvas-pool'),
    braceHidden: q('#brace')?.hidden ?? null,
    gripA: parseFloat(q('#grip-a')?.style.left || 'NaN'),
    gripB: parseFloat(q('#grip-b')?.style.left || 'NaN'),
    live: ['brace-a', 'brace-b'].filter((i) => document.getElementById(i)?.classList.contains('live')),
    readout: q('#brace-readout')?.hidden ? null : (q('#brace-readout')?.textContent.trim() ?? null),
    panOffset: Number(q('#chart')?.parentElement?.dataset.clockPan || 0),
    badge: txt('#plan-badge'),
    /* #735 — `#inspector-meta` is GONE (lock term 47): the pane header's staged
       status named only the Plan branch of a four-branch object, so it could read
       "nothing staged" while a Trial was being watched. The dock below is the single
       reporter now, and story S16's header assertion retires with it. */
    dock: (() => {
      const w = q('.inspector > .watch');
      if (!w) return null;
      const how = w.querySelector('.how');
      return {
        state: w.dataset.state ?? null,
        kind: w.querySelector('.kind')?.textContent.trim() ?? null,
        what: w.querySelector('.what')?.textContent.trim() ?? null,
        how: how?.textContent.trim() ?? null,
        // term 49 — the detail line WRAPS and may never ellipsize
        howClipped: how ? how.scrollHeight > how.clientHeight + 1
          || how.scrollWidth > how.clientWidth + 1 : null,
        route: w.querySelector('.go')?.textContent.trim() ?? null,
        box: (() => { const r = w.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height) }; })(),
      };
    })(),
    // select-in-place (2026-08-19 revision): `.occ-head` can now stand ALONGSIDE
    // `.who` on the same factor level (P35 retired — no level swap clears one
    // away), so this can no longer be a single comma-list querySelector, which
    // would return whichever sits first in DOM order regardless of which one a
    // reader actually cares about. The occurrence's own header wins when a
    // selection stands; otherwise it falls back to the level's own headline.
    levelHead: (q('#level .occ-head') || q('#level .slot-head') || q('#level .who'))
      ?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    evRows: document.querySelectorAll('#level .ev-row').length,
    // `evFits` is every row the roster is currently showing (the drilled
    // verdict, or `fired` at rest). The `data-counter`/`evCounter` split
    // RETIRED 2026-08-19: select-in-place (P35, ADR 31 part 5) made the
    // roster homogeneous by verdict, and the counter-example sub-group it
    // used to feed was dead at rest and incoherent once drilled (see
    // renderEvidence's docstring). `evCounterGone` asserts the retirement
    // stays true rather than silently reintroducing the attribute.
    evFits: document.querySelectorAll('#level .ev-row').length,
    evCounterGone: document.querySelectorAll('#level .ev-row[data-counter]').length,
    more: txt('#level .more'),
    stage: q('#level .stagebtn')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    stageStaged: q('#level .stagebtn')?.dataset.staged ?? null,
    filter: (() => {
      const wrap = q('#filter-wrap');
      const menu = q('#filter-menu');
      return {
        visible: rendered(wrap),
        open: rendered(menu),
        trigger: txt('#filter-trigger'),
        sift: [...document.querySelectorAll('#filter-menu [role="menuitemcheckbox"]')]
          .map((button) => ({
            text: button.getAttribute('aria-label'),
            checked: button.getAttribute('aria-checked'),
            disabled: button.disabled,
          })),
        view: [...document.querySelectorAll('#filter-menu [role="menuitemradio"]')]
          .map((button) => ({
            text: button.getAttribute('aria-label'),
            checked: button.getAttribute('aria-checked'),
            disabled: button.disabled,
          })),
      };
    })(),
    slotLink: q('#level .slotlink')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    linkBtns: [...document.querySelectorAll('#level .slotlink .linkbtn')].map((b) => b.textContent.trim()),
    // #735 — level 1 is the findings queue (terms 34-45), not a factor grid over
    // three per-parameter entry rows
    queue: [...document.querySelectorAll('#level .qrow')].map((n) => ({
      title: n.querySelector('.lab')?.textContent.trim() ?? null,
      tag: n.querySelector('.tag')?.textContent.trim() ?? null,
      register: n.dataset.state ?? null,
      tier: n.dataset.tier ?? null,
      tagX: Math.round(n.querySelector('.tag')?.getBoundingClientRect().right ?? -1),
    })),
    queueLeft: q('#level .qrow .lab')
      ? Math.round(q('#level .qrow .lab').getBoundingClientRect().left) : null,
    levelScroll: q('#level')?.scrollTop ?? null,
    crumbLeft: q('#crumb-trail')
      ? Math.round(q('#crumb-trail').getBoundingClientRect().left) : null,
    queueSeam: txt('#level .tailnote'),
    queueEmpty: txt('#level .quiet-line'),
    // term 44 — no hairline between queue rows, in any state
    queueRules: [...document.querySelectorAll('#level .qrow')].filter((n) => {
      const s = getComputedStyle(n);
      return ['Top', 'Bottom'].some((side) => parseFloat(s[`border${side}Width`]) > 0);
    }).length,
    history: (() => {
      const level = q('#level');
      const chart = q('#align-canvas:not([hidden]), #chart:not([hidden])');
      const instance = chart ? window.echarts?.getInstanceByDom(chart) : null;
      const option = instance?.getOption?.() || {};
      const axis = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis;
      const context = (option.series || []).find((series) => series.name === '__context');
      const highlight = context?.markArea?.data?.[1] || null;
      return {
        id: level?.dataset.historyId || null,
        generation: level?.dataset.analysisGeneration || null,
        selectedRunId: level?.dataset.selectedRunId || null,
        canvasId: chart?.dataset.historyId || null,
        canvasGeneration: chart?.dataset.analysisGeneration || null,
        canvasRunId: chart?.dataset.selectedRunId || null,
        conclusion: txt('.history-conclusion'),
        currentCopies: document.querySelectorAll('#level .history-current').length,
        caseText: q('.history-case')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
        notice: txt('.history-notice'),
        retirement: txt('.history-retirement'),
        pending: Boolean(q('.history-pending')),
        stale: Boolean(q('.history-stale')),
        retry: txt('.history-retry'),
        runIds: [...document.querySelectorAll('.history-run')].map((node) => node.dataset.runId),
        runLabels: [...document.querySelectorAll('.history-run')].map((node) => node.innerText.replace(/\s+/g, ' ').trim()),
        selectedRuns: [...document.querySelectorAll('.history-run[aria-pressed="true"]')].map((node) => node.dataset.runId),
        stageCount: document.querySelectorAll('.history-case .stagebtn').length,
        canvasRender: chart ? {
          kind: chart.id === 'align-canvas' ? 'event' : 'clock',
          scope: txt('#canvas-scope'),
          label: txt('#canvas-head .ec-title-context'),
          window: [axis?.min ?? null, axis?.max ?? null],
          highlight: highlight ? [highlight[0]?.xAxis ?? null, highlight[1]?.xAxis ?? null] : null,
          laneOutside: [...document.querySelectorAll('#lane button')]
            .filter((button) => button.dataset.outside === 'true').length,
          series: (option.series || []).map((series) => ({
            name: series.name ?? null,
            type: series.type ?? null,
            points: Array.isArray(series.data) ? series.data.length : null,
            opacity: series.lineStyle?.opacity ?? null,
            width: series.lineStyle?.width ?? null,
          })),
        } : null,
      };
    })(),
    laneSelected: [...document.querySelectorAll('#lane button')].findIndex((b) => b.getAttribute('aria-pressed') === 'true'),
    laneCells: document.querySelectorAll('#lane button').length,
    laneOutside: [...document.querySelectorAll('#lane button')].filter((b) => b.dataset.outside === 'true').length,
    laneKey: q('#lane-key')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    hover: q('#canvas-head')?.dataset.hover ?? null,
    rd: {
      time: txt('#rd-time'), med: txt('#rd-med'), verdict: q('#rd-med')?.dataset.verdict ?? null,
      iqr: txt('#rd-iqr'), band: txt('#rd-band'), n: txt('#rd-n'), note: txt('#rd-note'),
      statsShown: q('#rd-p-med')?.style.display !== 'none',
    },
    cursor: q('#chart')?.style.cursor ?? null,
    hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    advisoryFits: (() => { const a = q('.status .advisory'); return a ? a.scrollWidth <= a.clientWidth + 1 : null; })(),
    advisory: txt('.status .advisory'),
    rangeArtifacts: {
      scrub: Boolean(q('#scrub')),
      fill: Boolean(q('#scrub-fill')),
      titled: Boolean(q('[title*="Date range scrubber"]')),
      label: [...document.querySelectorAll('.instruments .cap')].some((n) => n.textContent.trim() === 'Range'),
      fourteenDayStrip: [...document.querySelectorAll('.instruments [data-label]')]
        .some((n) => /(^|\s)14 d($|\s)/.test(n.dataset.label || '')),
    },
  };
});

const plot = (page) => page.evaluate(() => {
  const r = document.getElementById('chart').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});

const chartXAt = (box, minute) => box.x + 52 + (minute / 1425) * (box.w - 104);

const chipIs = (page, want) => page.waitForFunction((expected) => {
  const follow = document.querySelector('#seg-window [data-follow]');
  return follow?.firstChild?.textContent.trim() === expected;
}, want, { timeout: 5000 });

const beginFreshDraw = async (page) => {
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settle(page, 450);
};

const drawInside = async (page, start, end) => {
  await beginFreshDraw(page);
  const b = await plot(page);
  const y = b.y + b.h * 0.45;
  await page.mouse.move(chartXAt(b, start), y);
  await page.mouse.down();
  await page.mouse.move(chartXAt(b, end), y, { steps: 8 });
  await page.mouse.up();
  await settle(page, 450);
};

/* A HELD PLOT BOUNDARY IS TRAVEL, NOT AIM. While the pointer sits past an edge
   the day translates under it at the chart's own minutes-per-pixel — about ten
   display minutes per animation frame on a locked viewport, so any one snapped
   window is on screen for roughly a frame and a half. Watching for a window and
   then releasing cannot land it: the observation costs a round trip and is
   already a frame stale when it arrives, and the release commits wherever the
   pan has got to by then, which is a bin or two further on. That overshoot is
   symmetric — both directions do it — and it is a property of a moving target,
   not of the arithmetic.

   So these stories travel first and aim second. `panThenAim` shoves the pointer
   past an edge until the day has translated far enough, then brings it back
   INSIDE the plot, which stops the pan where it stands (it re-arms only while
   the pointer is past an edge), and places one exact display minute under the
   pointer. What commits is then a function of where the pointer is rather than
   of when it let go. `holdUntilStop` is the only sound way to wait at an edge,
   and only because what it waits for is a stop the gesture cannot travel out
   of. */
const shoveToBoundary = async (page, start, direction) => {
  const b = await plot(page);
  const y = start.y ?? b.y + b.h * 0.45;
  await page.mouse.move(start.x, y);
  await page.mouse.down();
  await page.mouse.move(direction === 'right' ? b.x + b.w - 39 : b.x + 39, y,
    { steps: 8 });
  return y;
};

const clockPan = (page) => page.evaluate(() => Number(document.getElementById('chart')
  .parentElement.dataset.clockPan || 0));

/** Travel `past` display minutes at `direction`'s edge, then put display minute
    `aim` of the translated axis under the pointer. `aim` is unrolled, so 1440 is
    the next day's 00:00 and a negative minute is the previous day's. */
export const panThenAim = async (page, start, direction, { past, aim }) => {
  const y = await shoveToBoundary(page, start, direction);
  await page.waitForFunction((want) => Math.abs(Number(document.getElementById('chart')
    .parentElement.dataset.clockPan || 0)) >= want, past, { timeout: 7000 });
  const b = await plot(page);
  await page.mouse.move(b.x + b.w / 2, y);   // back inside the plot: the day stops
  await settle(page, 150);
  const pan = await clockPan(page);
  const x = chartXAt(b, aim - pan);
  // a silent clamp to the plot edge would commit a window nobody asked for
  if (x < b.x + 52 || x > b.x + b.w - 52) {
    throw new Error(`aim ${aim} is off the plot at pan ${pan} — travel further first`);
  }
  await page.mouse.move(x, y);
  await settle(page, 150);
  return state(page);
};

const holdUntilStop = async (page, start, direction, want) => {
  await shoveToBoundary(page, start, direction);
  await chipIs(page, want);
  return state(page);
};

/** Pixel centres of the chart's own occurrence dots / meal glyphs, from the
    ECharts instance — never guessed by scanning the canvas. */
const marks = (page, seriesName) => page.evaluate((name) => {
  const c = document.getElementById('chart');
  const inst = window.echarts.getInstanceByDom(c);
  const s = inst.getOption().series.find((x) => x.name === name);
  const box = c.getBoundingClientRect();
  return (s ? s.data : []).map((d) => {
    const p = inst.convertToPixel({ seriesName: name }, d.value ?? d);
    return { x: box.x + p[0], y: box.y + p[1], meta: d.meta || null };
  });
}, seriesName);

/** The non-null values of the chart's 'That day' real-trace series, in bin
    order — or null when the series is absent (no captured trace). Read off the
    ECharts instance, never guessed. Used by the #666 day-completion stories. */
const traceSeries = (page) => page.evaluate(() => {
  const c = document.getElementById('chart');
  const inst = window.echarts.getInstanceByDom(c);
  if (!inst) return null;
  const s = inst.getOption().series.find((x) => x.name === 'That day');
  if (!s) return null;
  return s.data.filter((v) => v !== '-' && v != null).map(Number);
});

const settle = (page, ms = 350) => page.waitForTimeout(ms);

/* ------------------------------------------------------------------ openers */

/* Both openers are LOUD. A catch-all 200 renders a build that is missing an
   asset and still passes, so anything unrouted is recorded and fails the run. */
const problems = [];
const expectedResponses = new WeakMap();
export const openerProblems = () => problems.slice();
const expectResponse = (page, pattern, status) => {
  expectedResponses.set(page, [...(expectedResponses.get(page) || []), { pattern, status }]);
};

const vendored = async (name) => {
  const dir = process.env.VENDOR_DIR || fail('VENDOR_DIR is required (vendored echarts + vue)');
  return readFile(join(dir, name));
};

/** Derived ISF analyzer shape shared by ledger and browser stories. The committed
 * payload supplies every untouched field; stories replace only the serialized
 * verdict facts they exercise. */
export function withIsfVerdict(analysis, {
  direction, recommended, assertsMove, annotation, omitVerdict = false,
}) {
  const seed = analysis.isf[0];
  const row = {
    ...seed,
    recommended,
    annotation,
    evidence: { ...seed.evidence, direction },
  };
  if (!omitVerdict) row.asserts_move = assertsMove;
  else delete row.asserts_move;
  return {
    ...analysis,
    isf: [row],
    tuning_levers: [
      ...(analysis.tuning_levers || []).filter((lever) => lever.parameter !== 'isf'),
      { parameter: 'isf', priority: 73 },
    ],
  };
}

/** Copy the committed generated profile so a staging story owns a narrow override
 * without inventing pump segments in the driver. */
export const derivedPumpSettings = (settings) => ({
  ...settings,
  profile: {
    ...settings.profile,
    segments: settings.profile.segments.map((segment) => ({ ...segment })),
  },
});

/** Pose the legacy projection wire shape after running the same derived analysis
 * through the faithful mirror. Current server rows always carry null; this removes
 * only the one field whose historical absence the compatibility story exercises. */
export const withoutIsfProjectionVerdict = (projection) => ({
  ...projection,
  rows: projection.rows.map((row) => {
    if (row.parameter !== 'isf') return row;
    const legacy = { ...row };
    delete legacy.asserts_move;
    return legacy;
  }),
});

/** The sanctioner is the project's already-published author identity. Keeping
 * it single-sourced avoids adding a second owner-name occurrence to a shipping
 * source file while still printing the named sanction on every retired run. */
const projectAuthor = async () => {
  const metadata = await readFile(join(ROOT, 'pyproject.toml'), 'utf8');
  const match = metadata.match(/authors\s*=\s*\[\{\s*name\s*=\s*"([^"]+)"/);
  if (!match) fail('pyproject.toml must publish the named sanctioner in authors');
  return match[1];
};

/**
 * APP opener — boots the app page, answers deterministic API reads from the
 * committed synthetic replay payload, and drives it to the Diagnose tab.
 * Standalone replays use the default server source, which requires the declared
 * no-fetch localhost server. The fixture-backed browser suite opts into the
 * on-disk source explicitly. Every intercepted endpoint is named.
 */
export async function openApp(browser, {
  state: want = 'typical', theme = 'dark', viewport = { width: 1440, height: 900 }, findingsInputs = null,
  findingsProjectionInputs = null, exposuresInputs = null, analysisInputs = null,
  pumpSettingsInputs = null, onPlanDraft = null,
  comparisonProjection = null,
  findingsDelayMs = 0, findingsDelays = {}, findingsFailures = {}, findingsResponseBarrier = null,
  appSource = 'server',
  history = false, selectedFindingsResponses = [], historyResponses = [], stageProbe = false,
  caseScenario = null, frontendRoot = join(ROOT, 'frontend'), fixtureBaseUrl = null,
} = {}) {
  const payloadPath = process.env.PAYLOAD || fail('PAYLOAD is required for TARGET=app');
  /* Source selection belongs to the caller. Standalone replay pins `server`
     below; browser tests opt into `fixture` per call. Ambient process state
     must never turn a built-app replay into an on-disk HTML run. */
  if (!['server', 'fixture'].includes(appSource)) fail(`unknown appSource: ${appSource}`);
  const baseUrl = appSource === 'server'
    ? process.env.BASE_URL || fail('BASE_URL is required for the app-only replay')
    : fixtureBaseUrl || 'http://app.local/';
  const targetUrl = new URL(baseUrl);
  if (appSource === 'server' && !['127.0.0.1', 'localhost'].includes(targetUrl.hostname)) {
    fail(`BASE_URL must name localhost, got ${targetUrl.hostname}`);
  }
  const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
  const capture = JSON.parse(await readFile(
    join(ROOT, 'mockups/diagnose-event-comparison.synthetic/capture.json'), 'utf8'));
  const findingsFixture = JSON.parse(await readFile(
    join(ROOT, 'frontend/__fixtures__/findings-projection.json'), 'utf8'));
  const historyCapture = JSON.parse(await readFile(
    join(ROOT, 'mockups/diagnose-workstation.synthetic/ic-history-events.capture.json'), 'utf8'));
  const caseFiles = JSON.parse(await readFile(
    join(ROOT, 'mockups/diagnose-workstation.synthetic/finding-case-files.json'), 'utf8'));
  // Each route leg crosses its own JSON boundary. Preparation and case handlers
  // never share one in-memory Exposure graph, matching production serialization.
  const independent = (value) => JSON.parse(JSON.stringify(value));
  /* The committed payload is the default for BOTH server-owned populations.
     A story that needs a shape the payload cannot pose supplies a function,
     which derives the override from that payload inside this driver — never a
     hand-written fixture, and never anything but synthetic input. The two
     overrides are separate on purpose: the fidelity harness overrides only the
     findings queue and relies on every other endpoint staying as it was. */
  const analysisFrom = typeof analysisInputs === 'function'
    ? await analysisInputs(payload.analyze) : (analysisInputs || payload.analyze);
  const pumpSettingsFrom = typeof pumpSettingsInputs === 'function'
    ? await pumpSettingsInputs(payload.pump_settings) : (pumpSettingsInputs || null);
  const defaults = {
    analysis: analysisFrom,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
    event_charts: FINDINGS_PROJECTION.inputs.event_charts,
  };
  const historyDefaults = history ? {
    ...findingsFixture.inputs,
    event_charts: findingsFixture.inputs.event_charts || defaults.event_charts,
  } : defaults;
  const findingsCandidate = typeof findingsInputs === 'function'
    ? await findingsInputs(historyDefaults) : (findingsInputs || historyDefaults);
  const findingsFrom = {
    ...findingsCandidate,
    event_charts: findingsCandidate.event_charts || defaults.event_charts,
  };
  const exposuresFrom = typeof exposuresInputs === 'function'
    ? await exposuresInputs(defaults) : (exposuresInputs || payload.exposures);
  const apiPattern = (path) => new RegExp(`^/api${path}`);
  const STUBS = [
    // #698: the endpoint serves the bounded server-owned projection per
    // coordinate; exposures ride on their own #654 endpoint again.
    [apiPattern('/diagnose/event-comparison'), (url) => projectSyntheticCapture(capture, {
      view: url.searchParams.get('view') || 'meals',
      factor: url.searchParams.get('factor') || undefined,
      window: url.searchParams.get('start_min') === null ? null : {
        start_min: Number(url.searchParams.get('start_min')),
        end_min: Number(url.searchParams.get('end_min')),
      },
      another: url.searchParams.get('another') === '1',
      occurrenceId: url.searchParams.get('occ') || undefined,
    })],
    /* #735: the findings queue is a SERVER-owned projection (ADR 730) and the
       browser gates have no Python, so the stub answers from the fixture-only JS
       mirror, which `frontend/findings-projection-mirror.test.js` deep-compares
       against the real projection's own frozen output window for window. */
    [apiPattern('/diagnose/findings'), (url) => {
      const projected = projectFindings(findingsFrom,
        url.searchParams.get('start_min') === null ? null : {
        start_min: Number(url.searchParams.get('start_min')),
        end_min: Number(url.searchParams.get('end_min')),
        }, url.searchParams.get('selected_id'));
      return typeof findingsProjectionInputs === 'function'
        ? findingsProjectionInputs(projected, caseFiles) : projected;
    }],
    [apiPattern('/explore/exposures'), () => exposuresFrom],
    [apiPattern('/analyze'), () => findingsFrom.analysis],
    [apiPattern('/scenarios'), () => findingsFrom.scenarios],
    [apiPattern('/explore/time'), () => payload.evidence],
    [apiPattern('/status'), () => ({ ok: true, last_fetch: payload.analyze.generated_at, counts: payload.analyze.data_quality?.counts || {} })],
    [apiPattern('/plan/history'), () => ({ history: [] })],
    [apiPattern('/plan'), () => ({ items: [], updated_at: null })],
    [apiPattern('/verify/trials'), () => ({ trials: [] })],
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
    [apiPattern('/pump-settings$'), () => pumpSettingsFrom || ({ configured: false })],
    [apiPattern('/pump'), () => ({ settings: {} })],
  ];
  const page = await browser.newPage({ viewport });
  let preparationRequests = 0;
  let caseRequests = 0;
  const preparedWindows = new Map();
  page.on('pageerror', (e) => problems.push(`pageerror(app ${want}): ${e}`));
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const rules = expectedResponses.get(page) || [];
    const match = rules.findIndex((rule) => rule.status === response.status()
      && rule.pattern.test(new URL(response.url()).pathname));
    if (match >= 0) {
      rules.splice(match, 1);
      expectedResponses.set(page, rules);
      return;
    }
    problems.push(`response(app ${want}): ${response.status()} ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Chromium emits this generic companion message for every failed resource;
    // the response listener above owns the stricter URL + status assertion.
    if (/^Failed to load resource: the server responded with a status of \d+/.test(message.text())) return;
    problems.push(`console(app ${want}): ${message.text()}`);
  });
  await page.addInitScript(([t, observeStage]) => {
    localStorage.setItem('ciq_token', 'behaviour-replay');
    localStorage.setItem('tab', 'diagnose');
    localStorage.setItem('theme', t);
    if (observeStage) window.__diagnoseStageProbe = { calls: [] };
  }, [theme, stageProbe]);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 204 });
    if (url.href.includes('echarts')) return route.fulfill({ body: await vendored('echarts.min.js'), contentType: 'text/javascript' });
    if (url.href.includes('vue')) return route.fulfill({ body: await vendored('vue.esm-browser.js'), contentType: 'text/javascript' });
    if (appSource === 'server' && url.origin === targetUrl.origin
        && (path === '/' || PAGE_PATHS.has(path) || /\.(js|css|svg|html)$/.test(path))) {
      if (stageProbe && path === '/assets/diagnose-workstation.js') {
        const source = await readFile(join(ROOT, 'frontend/diagnose-workstation.js'), 'utf8');
        const seam = 'export function createDiagnoseWorkstation({ root, callbacks = {}, railLead = null }) {';
        if (source.split(seam).length !== 2) fail('S71 staging seam must occur exactly once');
        const instrumented = source.replace(seam, `${seam}
  /* Replay-only wrapper: preserve the real callback and arguments while making
     any invocation observable. The production module served by the app is not
     edited; this route-local probe exists only for S71. */
  if (window.__diagnoseStageProbe) {
    const stage = callbacks.stage;
    callbacks = { ...callbacks, stage(...args) {
      window.__diagnoseStageProbe.calls.push({ family: args[0]?.family ?? null, desired: args[1] ?? null });
      return stage?.apply(callbacks, args);
    } };
  }`);
        return route.fulfill({ body: instrumented, contentType: 'text/javascript' });
      }
      return route.continue();
    }
    if (appSource === 'fixture' && url.origin === targetUrl.origin) {
      if (path === '/' || PAGE_PATHS.has(path)) {
        return route.fulfill({ body: await readFile(join(frontendRoot, 'index.html')), contentType: 'text/html' });
      }
      if (/\.(js|css|svg|html)$/.test(path)) {
        try {
          return route.fulfill({
            body: await readFile(join(frontendRoot, path.replace(/^\/assets\//, ''))),
            contentType: MIME[extname(path)] || 'text/plain',
          });
        } catch { /* fall through to the loud unrouted response below */ }
      }
    }
    /* The findings queue is a SERVER round trip, so a story that is about what
       the pane shows WHILE it is in flight needs that flight to last long enough
       to read. Delay, never stub differently: the response is the same one. */
    if (path === '/api/diagnose/findings' || path === '/api/diagnose/finding-case-file-preparation') {
      if (appSource === 'fixture' && findingsResponseBarrier) {
        await findingsResponseBarrier({ url, request: route.request() });
      }
      const start = url.searchParams.get('start_min');
      const key = start === null ? 'global' : `${start}-${url.searchParams.get('end_min')}`;
      const delay = findingsDelays[key] ?? findingsDelayMs;
      if (delay) await new Promise((resolve) => { setTimeout(resolve, delay); });
      if (findingsFailures[key]) {
        expectResponse(page, new RegExp(`^${path}$`), findingsFailures[key]);
        return route.fulfill({ status: findingsFailures[key], contentType: 'application/json',
          body: JSON.stringify(path.endsWith('preparation')
            ? { detail: { code: 'inconsistent_projection', message: 'Findings unavailable.' } }
            : { detail: 'findings unavailable' }) });
      }
    }
    if (path === '/api/diagnose/finding-case-file-preparation') {
      preparationRequests += 1;
      const windowKey = url.searchParams.get('start_min') === null ? null
        : `${url.searchParams.get('start_min')}-${url.searchParams.get('end_min')}`;
      let preparedBody = independent(caseFiles.scoped?.[windowKey]?.preparation
        || caseFiles.preparation);
      if (windowKey && !caseFiles.scoped?.[windowKey]) {
        const start = Number(url.searchParams.get('start_min'));
        const end = Number(url.searchParams.get('end_min'));
        const label = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}–${end === 1440 ? '24:00' : `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`}`;
        const identity = `${start.toString(16).padStart(4, '0')}${end.toString(16).padStart(4, '0')}`.repeat(4);
        preparedBody.projection_id = `fp_${identity}`;
        preparedBody.coordinates.window = { scoped: true, start_min: start, end_min: end, label };
        preparedBody.findings.window = { scoped: true, start_min: start, end_min: end, label };
        const held = caseFiles.scoped['0-360'].preparation.rendered_rows;
        preparedBody.rendered_rows.push(...independent(held));
      }
      const window = windowKey ? {
        start_min: Number(url.searchParams.get('start_min')),
        end_min: Number(url.searchParams.get('end_min')),
      } : null;
      const projected = projectFindings(findingsFrom, window, url.searchParams.get('selected_id'));
      const findingsProjection = typeof findingsProjectionInputs === 'function'
        ? findingsProjectionInputs(projected, caseFiles) : projected;
      const readyRows = new Map(preparedBody.rendered_rows
        .filter((row) => row.case_header?.inspectability === 'ready')
        .map((row) => [row.id, row]));
      preparedBody.findings = independent(findingsProjection);
      preparedBody.rendered_rows = independent(findingsProjection.rows).flatMap((row) => {
        if (row.register !== 'finding') return [row];
        const ready = readyRows.get(row.id);
        if (!ready) return [];
        return [{ ...row,
          appearances: ready.appearances,
          episodes: ready.episodes,
          evidence: ready.evidence,
          verdict_counts: ready.verdict_counts,
          verdict_counts_by_family: ready.verdict_counts_by_family,
          event_chart: ready.event_chart,
          case_header: ready.case_header }];
      });
      preparedBody.behavioral_case_headers = Object.fromEntries(
        preparedBody.rendered_rows
          .filter((row) => row.case_header?.inspectability === 'ready')
          .map((row) => [row.id, row.case_header]),
      );
      if (caseScenario?.preparation) {
        const response = await caseScenario.preparation({ request: preparationRequests,
          url, preparation: preparedBody, caseFiles });
        if ((response.status || 200) < 400 && response.body?.projection_id) {
          preparedWindows.set(response.body.projection_id, response.body.coordinates.window);
        }
        return route.fulfill({ status: response.status || 200, contentType: 'application/json',
          body: JSON.stringify(response.body) });
      }
      preparedWindows.set(preparedBody.projection_id, preparedBody.coordinates.window);
      return route.fulfill({ contentType: 'application/json',
        body: JSON.stringify(preparedBody) });
    }
    if (path === '/api/diagnose/finding-case-file') {
      caseRequests += 1;
      const finding = caseFiles.cases[url.searchParams.get('finding_id')];
      const alignment = url.searchParams.get('alignment');
      const occ = url.searchParams.get('occ');
      const body = !finding
        ? { detail: { code: 'finding_unavailable', message: 'Finding unavailable.' } }
        : !occ ? independent(finding[alignment])
          : independent(finding[`selected_${alignment}`][occ]
            || finding[`unavailable_${alignment}`]);
      if (finding && preparedWindows.has(url.searchParams.get('projection_id'))) {
        body.projection_id = url.searchParams.get('projection_id');
        body.window = independent(preparedWindows.get(body.projection_id));
      }
      if (caseScenario?.case) {
        const response = await caseScenario.case({ request: caseRequests, url, body, caseFiles });
        return route.fulfill({ status: response.status || 200, contentType: 'application/json',
          body: JSON.stringify(response.body) });
      }
      return route.fulfill({ status: finding ? 200 : 404, contentType: 'application/json',
        body: JSON.stringify(body) });
    }
    const planned = path === '/api/diagnose/findings' && url.searchParams.has('selected_id')
      ? selectedFindingsResponses.shift()
      : path === '/api/diagnose/carb-ratio-history/events' ? historyResponses.shift() : null;
    if (planned) {
      if (planned.delayMs) await new Promise((resolve) => { setTimeout(resolve, planned.delayMs); });
      const status = planned.status || 200;
      if (status >= 400) {
        return route.fulfill({ status, contentType: 'application/json',
          body: JSON.stringify({ detail: planned.detail }) });
      }
      const generated = path === '/api/diagnose/findings'
        ? projectFindings(findingsFrom,
          url.searchParams.get('start_min') === null ? null : {
            start_min: Number(url.searchParams.get('start_min')),
            end_min: Number(url.searchParams.get('end_min')),
          }, url.searchParams.get('selected_id'))
        : projectIcHistoryEvents(historyCapture.inputs, url.searchParams.get('history_id'),
          url.searchParams.get('selected_run_id'));
      const body = typeof planned.body === 'function' ? planned.body(generated, url)
        : planned.body || generated;
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (path === '/api/diagnose/carb-ratio-history/events') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(
        projectIcHistoryEvents(historyCapture.inputs, url.searchParams.get('history_id'),
          url.searchParams.get('selected_run_id')),
      ) });
    }
    if (comparisonProjection !== null && path === '/api/diagnose/event-comparison') {
      return route.fulfill({ contentType: 'application/json',
        body: JSON.stringify(comparisonProjection) });
    }
    if (path === '/api/plan' && route.request().method() === 'PUT') {
      const draft = JSON.parse(route.request().postData() || '{}');
      onPlanDraft?.(draft);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        items: draft.items || [], updated_at: '2020-03-03 00:01:00',
      }) });
    }
    for (const [pattern, body] of STUBS) {
      if (pattern.test(path)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body(url)) });
    }
    problems.push(`unstubbed ${route.request().method()} ${path} (app ${want})`);
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'not stubbed' }) });
  });
  targetUrl.searchParams.set('view', 'glucose');
  await page.goto(targetUrl.href);
  try {
    await page.waitForSelector('.dw', { timeout: 10_000 });
  } catch (error) {
    const body = (await page.locator('body').innerText()).slice(0, 600).replace(/\s+/g, ' ');
    fail(`app-only opener did not reach Diagnose: ${error.message}; body=${body}; problems=${problems.join(' | ')}`);
  }
  await settle(page, 700);
  /* The port carries a state hook equivalent to the mock's `?mode=` (Phase 3).
     Whatever it is, the opener drives it and then asserts the rendered state
     equals the requested one — the same loudness the mock side gets. */
  await gotoState(page, want);
  const got = await page.evaluate(() => document.body.dataset.state || document.querySelector('.dw')?.dataset.state);
  if (got !== want) fail(`state addressability drift (app): asked ${want}, rendered ${got}`);
  return page;
}

/** Drive the built app into one enumerated state. Port-side hook. */
export async function gotoState(page, want) {
  await page.evaluate((s) => {
    if (window.__dwGotoState) return window.__dwGotoState(s);
    const url = new URL(window.location.href);
    url.searchParams.set('mode', s);
    window.history.replaceState({}, '', url);
    return null;
  }, want);
  await settle(page, 600);
}

const expandWatching = async (page) => {
  const toggle = page.locator('#level .qcollapse');
  if (await toggle.count() && await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
    await settle(page, 150);
  }
};

const openHistoryCase = async (page) => {
  await expandWatching(page);
  const row = page.locator('#level .qrow[data-state="history"]').first();
  await row.waitFor({ state: 'visible' });
  await row.click();
  await settle(page, 350);
  ok(await page.locator('.history-case').isVisible(), 'history row opens its case file');
};

const openHistoryEvents = async (page) => {
  await openHistoryCase(page);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await settle(page, 650);
  ok(await page.locator('#align-canvas').isVisible(), 'history event canvas is visible');
};

/* -------------------------------------------------------------- the stories */

/** S01 · A preset press pins that window, clears any drawn one, re-scopes the
    inspector and the canvas count together. */
// LOCK:diagnose-workstation:6 LOCK:diagnose-workstation:7 LOCK:diagnose-workstation:9 LOCK:diagnose-workstation:10
export const S01 = async (page) => {
  const before = await state(page);
  ok(before.chip !== null, 'S01 precondition: opens with a drawn window');
  await page.click('#seg-window button:nth-child(3)');   // Afternoon
  await settle(page);
  const after = await state(page);
  is(after.chip, null, 'S01 drawn chip cleared by a preset');
  is(after.pressed, ['Afternoon'], 'S01 preset pressed');
  /* AMENDED #735 (lock term 45): the level-1 meta no longer restates the window
     range — the follow chip and the chart's own window label both print the hours,
     and the queue's meta says only how many findings the window holds. The story's
     subject is unchanged (a preset re-scopes the inspector); it is now read through
     the copy the lock pins. */
  is(after.crumbMeta, `${after.queue.length} in this window`,
    `S01 inspector re-scoped to the preset (${after.crumbMeta})`);
  ok(after.crumbMeta.endsWith('in this window'), 'S01 the inspector uses the scoped meta form');
  // Both counts are printed with toLocaleString, so a capture wide enough to
  // pass 1,000 readings carries a thousands separator. The 3-day fixture this
  // was written against topped out at 941 and never showed one; the 30-day
  // capture #649 commissioned does, on every state. Separator allowed.
  ok(/^window [\d,]+ of [\d,]+ readings$/.test(after.scope),
    `S01 canvas count declares its window (${after.scope})`);
  ok(after.scope !== before.scope, 'S01 canvas count recomputed');
  ok(after.laneOutside > 0, 'S01 slots outside the window are dimmed, not removed');
};

/** S02 · Dragging in the plot body draws a window: the chip follows live, the
    moving edge goes solid with a snapped readout, and the commit lands on
    mouseup. The in-progress region carries the committed treatment (no
    rubber-band). */
// LOCK:diagnose-workstation:6 LOCK:diagnose-workstation:7 LOCK:diagnose-workstation:8 LOCK:diagnose-workstation:9 LOCK:diagnose-workstation:10
export const S02 = async (page) => {
  const b = await plot(page);
  const y = b.y + b.h * 0.4;
  await page.mouse.move(b.x + 300, y);
  is((await state(page)).cursor, 'crosshair', 'S02 cursor over open plot');
  await page.mouse.down();
  await page.mouse.move(b.x + 380, y, { steps: 6 });
  const mid = await state(page);
  is(mid.live, ['brace-b'], 'S02 the moving edge is the live one');
  ok(/^\d\d:\d\d$/.test(mid.readout || ''), `S02 moving edge reads its snapped time (${mid.readout})`);
  ok(/^Window \d\d:\d\d–\d\d:\d\d$/.test(mid.chip || ''), `S02 chip follows the gesture (${mid.chip})`);
  is(mid.braceHidden, false, 'S02 the brace is drawn during the gesture');
  await page.mouse.move(b.x + 520, y, { steps: 8 });
  const wider = await state(page);
  ok(wider.chip !== mid.chip, 'S02 chip tracks continuously');
  await page.mouse.up();
  await settle(page);
  const after = await state(page);
  is(after.chip, wider.chip, 'S02 mouseup commits the window the gesture showed');
  is(after.pressed, [after.chip], 'S02 the chip takes the pressed slot, no sixth preset');
  is(after.live, [], 'S02 no edge stays live after commit');
  is(after.readout, null, 'S02 the live readout is withdrawn on commit');
  // AMENDED #735 (term 45): a drawn brace re-scopes the queue in place, and the
  // meta reads the scoped form — identical to a pressed preset (term 37)
  is(after.crumbMeta, `${after.queue.length} in this window`,
    `S02 inspector re-scoped to the drawn window (${after.crumbMeta})`);
};

/** S03 · The dashed edge is grabbable down its WHOLE height (±5px), not only at
    the little grip — grabbing it mid-plot resizes rather than starting a new
    window. */
// LOCK:diagnose-workstation:6 LOCK:diagnose-workstation:8
export const S03 = async (page) => {
  const start = await state(page);
  const b = await plot(page);
  const y = b.y + b.h * 0.5;      // mid-plot, far below the grip band
  await page.mouse.move(b.x + start.gripB, y);
  is((await state(page)).cursor, 'col-resize', 'S03 cursor says resize on the edge at mid-plot');
  await page.mouse.down();
  await page.mouse.move(b.x + start.gripB + 90, y, { steps: 8 });
  const during = await state(page);
  is(during.live, ['brace-b'], 'S03 the grabbed edge is live');
  ok(during.readout !== null, 'S03 the grabbed edge reads its snapped time');
  await page.mouse.up();
  await settle(page);
  const after = await state(page);
  near(after.gripA, start.gripA, 1, 'S03 the far edge did not move');
  ok(after.gripB > start.gripB + 40, 'S03 the grabbed edge moved');
  ok(after.chip !== start.chip, 'S03 the chip reports the resized window');
};

/** S04 · Dragging INSIDE a window slides it whole — both edges live, the width
    preserved. (The interaction grammar the manifest never wrote down.) */
// LOCK:diagnose-workstation:6 LOCK:diagnose-workstation:8
export const S04 = async (page) => {
  const start = await state(page);
  const b = await plot(page);
  const y = b.y + b.h * 0.5;
  const mid = (start.gripA + start.gripB) / 2;
  const width = start.gripB - start.gripA;
  await page.mouse.move(b.x + mid, y);
  is((await state(page)).cursor, 'grab', 'S04 cursor says grab inside the window');
  await page.mouse.down();
  await page.mouse.move(b.x + mid + 120, y, { steps: 8 });
  const during = await state(page);
  is(during.live, ['brace-a', 'brace-b'], 'S04 a slide makes BOTH edges live');
  ok(/–/.test(during.readout || ''), `S04 a slide reads the whole span (${during.readout})`);
  await page.mouse.up();
  await settle(page);
  const after = await state(page);
  ok(after.gripA > start.gripA + 40, 'S04 the window moved');
  near(after.gripB - after.gripA, width, 2, 'S04 the width is preserved by a slide');
};

/** S05 · The grip handles drag the same edge the full-height zone does. */
// LOCK:diagnose-workstation:6 LOCK:diagnose-workstation:8
export const S05 = async (page) => {
  const start = await state(page);
  const g = await page.evaluate(() => { const r = document.getElementById('grip-a').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x - 70, g.y, { steps: 6 });
  const during = await state(page);
  is(during.live, ['brace-a'], 'S05 the grip drags its own edge');
  await page.mouse.up();
  await settle(page);
  const after = await state(page);
  ok(after.gripA < start.gripA - 20, 'S05 grip-a moved the near edge');
  near(after.gripB, start.gripB, 1, 'S05 the far edge stayed');
};

/** S06 · A press that never moves changes nothing — no window minted, no preset
    unpressed. (Clicking a preset's edge used to silently convert it.) */
// LOCK:diagnose-workstation:6 LOCK:diagnose-workstation:7
export const S06 = async (page) => {
  const before = await state(page);
  const b = await plot(page);
  await page.mouse.move(b.x + 400, b.y + b.h * 0.4);
  await page.mouse.down();
  await page.mouse.up();
  await settle(page, 250);
  const after = await state(page);
  is(after.chip, before.chip, 'S06 a click in the plot mints no window');
  is(after.pressed, before.pressed, 'S06 a click in the plot unpresses nothing');
  is(after.scope, before.scope, 'S06 nothing re-scoped');
};

/** S07 · Esc belongs to the WINDOW: it clears the drawn one and restores the
    last preset. It never pops an inspector level. */
// LOCK:diagnose-workstation:7 LOCK:diagnose-workstation:21
export const S07 = async (page) => {
  const before = await state(page);
  ok(before.chip !== null, 'S07 precondition: a drawn window stands');
  const depth = before.crumb.length;
  await page.keyboard.press('Escape');
  await settle(page);
  const after = await state(page);
  is(after.chip, null, 'S07 Esc clears the drawn window');
  ok(after.pressed.length === 1 && after.pressed[0] !== after.chip, `S07 Esc restores a preset (${after.pressed})`);
  is(after.crumb.length, depth, 'S07 Esc did NOT pop a level');
};

/** S08 · The chip's × is the same clearing act as Esc. */
// LOCK:diagnose-workstation:7
export const S08 = async (page) => {
  ok((await state(page)).chip !== null, 'S08 precondition: a drawn window stands');
  await page.click('#seg-window [data-follow] .x');
  await settle(page);
  const after = await state(page);
  is(after.chip, null, 'S08 the chip × clears the window');
  is(after.pressed.length, 1, 'S08 a preset is restored');
};

/** S09 · Drilling a factor pushes level 2: the canvas follows the factor's peak,
    the count declares its window, and the coincidence line prints BOTH the
    basal slot and the I:C block, basal first, each with its own route. */
// LOCK:diagnose-workstation:4 LOCK:diagnose-workstation:9 LOCK:diagnose-workstation:17 LOCK:diagnose-workstation:18 LOCK:diagnose-workstation:22 LOCK:diagnose-workstation:33
export const S09 = async (page) => {
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settle(page, 350);
  await page.click('#level .qrow[data-state="finding"]');
  await settle(page, 450);
  const s = await state(page);
  is(s.crumb.length, 2, 'S09 one level pushed');
  is(s.crumb[0], 'Findings', 'S09 the root ancestor stays in the trail');
  ok(/^Factor peak \d\d:\d\d–\d\d:\d\d$/.test(s.chip || ''), `S09 the canvas follows the factor peak (${s.chip})`);
  ok(/^\d+ of \d+ · /.test(s.crumbMeta || ''), `S09 the count declares its window (${s.crumbMeta})`);
  ok(s.slotLink !== null, 'S09 the coincidence line prints');
  is(s.linkBtns, ['View slot', 'View segment'], 'S09 both routes print, basal first');
  ok(/basal slot .*and in the .*I:C block/.test(s.slotLink), `S09 both coincidences on ONE line (${s.slotLink})`);
  ok(s.evRows > 0, 'S09 evidence rows render');
};

/** S10 · Evidence is capped at five rows and the cap is a real toggle.
    RETIRED, 2026-08-19 (owner's select-in-place ruling, P35/ADR 31 part 5,
    transcribed in the behaviour ledger): the "counter-example group is never
    capped" clause. Select-in-place made the roster homogeneous by verdict —
    exactly one published category shows at a time — which structurally
    empties the old counter-example split at rest and makes it incoherent
    once drilled (a near-miss/clean occurrence can still carry a DIFFERENT
    classifier's match on the same anchor, which used to route it into a
    group captioned for fired-but-uncredited leftovers). `renderEvidence`
    retires the split outright rather than leave a 0==0 tautology standing;
    this story now asserts the retirement itself. */
// LOCK:diagnose-workstation:17 LOCK:diagnose-workstation:18
export const S10 = async (page) => {
  await page.click('#level .qrow[data-state="finding"]');
  await settle(page, 450);
  const capped = await state(page);
  is(capped.evFits, 5, 'S10 five rows before expanding');
  is(capped.evCounterGone, 0, 'S10 RETIRED — the counter-example split is gone, not merely empty');
  ok(/^\d+ more$/.test(capped.more || ''), `S10 the toggle names the remainder (${capped.more})`);
  await page.click('#level .more');
  await settle(page);
  const open = await state(page);
  ok(open.evFits > 5, 'S10 expanding shows the rest of the roster');
  is(open.evCounterGone, 0, 'S10 RETIRED — still gone after expanding');
  is(open.more, 'Show first 5', 'S10 the toggle reverses');
  await page.click('#level .more');
  await settle(page);
  is((await state(page)).evFits, 5, 'S10 it collapses back to five');
};

/** S11 · SELECT-IN-PLACE (P35/P21 retired, 2026-08-19 revision). An evidence
    row click emphasises it in place — no crumb push, and the window is
    byte-identical to what it was before the click, because selection is
    evidence, never viewport navigation (ADR 31 part 5). */
// LOCK:diagnose-workstation:18 LOCK:diagnose-workstation:19 LOCK:diagnose-workstation:20
export const S11 = async (page) => {
  await page.click('#level .qrow[data-state="finding"]');
  await settle(page, 450);
  const peak = await state(page);
  await page.click('#level .ev-row');
  await settle(page, 450);
  const occ = await state(page);
  is(occ.crumb.length, 2, 'S11 select-in-place pushes no level (P35 retired)');
  is(occ.chip, peak.chip, 'S11 selecting an occurrence does not move the window (P21 retired)');
  const selected = await page.evaluate(() =>
    document.querySelector('#level .ev-row[aria-pressed="true"]') !== null);
  ok(selected, 'S11 the selected row carries aria-pressed');
  ok(/↑ ↓/.test(occ.levelHead || ''), 'S11 the keyboard hint rides the inline detail');
};

/** S12 · RETIRED — Left/Right no longer step the selected Occurrence. */
// LOCK:diagnose-workstation:21
export const S12 = async (page) => {
  const author = await projectAuthor();
  const sanction = `${author} · 2026-08-23 · "the roster is drawn vertically; one key model per list."`;
  await page.click('#level .qrow[data-state="finding"]');
  await settle(page, 450);
  await page.click('#level .ev-row');
  await settle(page, 450);
  const first = await state(page);
  const selected = async () => page.locator('#level .ev-row[aria-pressed="true"]')
    .getAttribute('data-occurrence-id');
  const selectedId = await selected();
  await page.keyboard.press('ArrowRight');
  await settle(page, 300);
  is((await state(page)).levelHead, first.levelHead, `S12 RETIRED — ${sanction}`);
  is(await selected(), selectedId, `S12 RETIRED — ${sanction}`);
  await page.keyboard.press('ArrowLeft');
  await settle(page, 300);
  is((await state(page)).levelHead, first.levelHead, `S12 RETIRED — ${sanction}`);
  is(await selected(), selectedId, `S12 RETIRED — ${sanction}`);
  return `RETIRED — ${sanction}`;
};

/** S13 · Backspace pops exactly one level at depth ≥ 2. Selecting an
    occurrence (P35 retired) never adds a level for it to pop. */
// LOCK:diagnose-workstation:21
export const S13 = async (page) => {
  await page.click('#level .qrow[data-state="finding"]');
  await settle(page, 450);
  is((await state(page)).crumb.length, 2, 'S13 at depth 2');
  await page.click('#level .ev-row');
  await settle(page, 450);
  is((await state(page)).crumb.length, 2,
    'S13 selecting an occurrence does not deepen the stack (P35 retired)');
  await page.keyboard.press('Backspace');
  await settle(page);
  is((await state(page)).crumb.length, 1, 'S13 Backspace pops to the root');
  await page.keyboard.press('Backspace');
  await settle(page);
  is((await state(page)).crumb.length, 1, 'S13 Backspace at the root does nothing');
};

/** S14 · The breadcrumb IS the navigation: ancestors are buttons, the current
    item is inert, and there is no back button anywhere. Selecting an
    occurrence in place (P35 retired) adds no ancestor of its own. */
// LOCK:diagnose-workstation:4
export const S14 = async (page) => {
  await page.click('#level .qrow[data-state="finding"]');
  await settle(page, 450);
  await page.click('#level .ev-row');
  await settle(page, 450);
  const shape = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll('#crumb-trail button')].map((b) => b.textContent.trim()),
    current: document.querySelector('#crumb-trail .here')?.textContent.trim() ?? null,
    currentIsButton: document.querySelector('#crumb-trail .here')?.tagName === 'BUTTON',
    ariaCurrent: document.querySelector('#crumb-trail [aria-current="page"]') !== null,
    backButtons: [...document.querySelectorAll('#crumb-trail button, .inspector button')]
      .filter((b) => /^(back|‹|←)$/i.test(b.textContent.trim())).length,
  }));
  is(shape.buttons.length, 1, 'S14 select-in-place adds no ancestor (P35 retired)');
  is(shape.currentIsButton, false, 'S14 the current item is not a button');
  ok(shape.ariaCurrent, 'S14 the current item is marked aria-current');
  is(shape.backButtons, 0, 'S14 no back button/chevron anywhere in the trail');
  await page.click('#crumb-trail button');
  await settle(page);
  is((await state(page)).crumb, ['Findings'], 'S14 clicking the root ancestor pops to it');
};

/** S15 · A basal lane cell is a shortcut INTO the slot branch: it pushes from
    level 1, swaps in place from a slot (never deepening), and — being a physical
    scope choice — releases whatever user window was standing. */
// LOCK:diagnose-workstation:6 LOCK:diagnose-workstation:7 LOCK:diagnose-workstation:9 LOCK:diagnose-workstation:12 LOCK:diagnose-workstation:13
export const S15 = async (page) => {
  const before = await state(page);
  is(before.laneCells, 48, 'S15 the basal lane is 48 fixed half-hour cells');
  await page.click('#lane button:nth-child(15)');
  await settle(page, 450);
  const slot = await state(page);
  is(slot.crumb.length, 2, 'S15 the lane pushes one level from level 1');
  ok(/slot$/.test(slot.crumb[1]), `S15 the trail names the slot (${slot.crumb[1]})`);
  ok(/^Slot \d\d:\d\d$/.test(slot.chip || ''), `S15 the chip names the slot, not a Window (${slot.chip})`);
  is(slot.laneSelected, 14, 'S15 the clicked cell is the pressed one');
  await page.click('#lane button:nth-child(16)');
  await settle(page, 450);
  const swapped = await state(page);
  is(swapped.crumb.length, 2, 'S15 a second lane click SWAPS, it does not deepen');
  is(swapped.laneSelected, 15, 'S15 selection follows');
};

/** S16 · Staging is item-level and state-as-feedback: the button becomes
    Staged · Undo, the Plan badge counts it, and no toast or modal appears. */
// LOCK:diagnose-workstation:13 LOCK:diagnose-workstation:14
export const S16 = async (page) => {
  const idx = await page.evaluate(() => [...document.querySelectorAll('#lane button')].findIndex((b) => b.dataset.verdict === 'up'));
  ok(idx >= 0, 'S16 precondition: the lane holds a slot that asserts a direction');
  await page.click(`#lane button:nth-child(${idx + 1})`);
  await settle(page, 450);
  const open = await state(page);
  ok(/Stage change/.test(open.stage || ''), `S16 an asserting slot offers staging (${open.stage})`);
  is(open.badge, '0', 'S16 nothing staged yet');
  await page.click('#level .stagebtn');
  await settle(page, 450);
  const staged = await state(page);
  ok(/Staged · Undo/.test(staged.stage || ''), `S16 the button becomes Staged · Undo (${staged.stage})`);
  ok(/staged for Plan/.test(staged.stage || ''), 'S16 the sublabel names the destination');
  is(staged.stageStaged, 'true', 'S16 the staged flag rides the button');
  is(staged.badge, '1', 'S16 the Plan badge counts the item');
  /* AMENDED #735 (lock terms 46-49): the pane header's `N staged` is deleted and
     the watched-change dock is the single reporter of the staged object. The button,
     the sublabel and the Plan badge above are unchanged. */
  is(staged.dock.kind, 'Plan · staged', 'S16 the dock reports the staged object');
  is(staged.dock.how, 'Staged, not applied — nothing has changed on the pump',
    'S16 the dock says the pump is untouched, in full');
  is(staged.dock.howClipped, false, 'S16 that sentence is never ellipsized (term 49)');
  const overlays = await page.evaluate(() => document.querySelectorAll('[role="dialog"], .toast, .modal').length);
  is(overlays, 0, 'S16 state-as-feedback only — no toast, no modal');
  await page.click('#level .stagebtn');
  await settle(page, 450);
  const undone = await state(page);
  ok(/Stage change/.test(undone.stage || ''), 'S16 Undo unstages');
  is(undone.badge, '0', 'S16 the badge follows back down');
};

/** S17 · The I:C lane is retired. I:C enters through its findings-queue row. */
// LOCK:diagnose-workstation:12 LOCK:diagnose-workstation:32
export const S17 = async (page) => {
  const author = await projectAuthor();
  const sanction = `${author} · 2026-08-19 · "Decided by ${author} in a ruling session on 2026-08-19."`;
  is(await page.evaluate(() => document.querySelector('#iclane') !== null), false,
    `S17 RETIRED — ${sanction}`);
  return `RETIRED — ${sanction}`;
};

/** S18 · ISF is a level-1 QUEUE row — not a lane, not a cell — and it derives NO
    canvas window: the brace does not move.

    AMENDED #735 (lock terms 31/34/38): the three per-parameter entry rows
    (`Basal slots` / `I:C blocks` / `ISF`) are retired with the factor grid — level 1
    is one ranked queue in which settings and habits interleave. A quiet ISF is
    absent from the global queue entirely; under an EXPLICIT window (this state opens
    on the Overnight preset) it appears words-first in the demoted register, with the
    chevron and no stage affordance. Everything else this story asserts is
    unchanged. */
// LOCK:diagnose-workstation:31 LOCK:diagnose-workstation:34 LOCK:diagnose-workstation:38
export const S18 = async (page) => {
  await expandWatching(page);
  const before = await state(page);
  is(before.entries, undefined, 'S18 the per-parameter entry rows are retired');
  const isfRow = before.queue.find((r) => r.title === 'ISF');
  ok(isfRow, `S18 ISF is a queue row under an explicit window (${JSON.stringify(before.queue.map((r) => r.title))})`);
  is(isfRow.register, 'held', 'S18 it is held, so it reads words-first');
  // textContent has no space: the glyph is separated by a CSS margin, not a character
  is(isfRow.tag, '⚙Setting', 'S18 it carries the Setting flavor tag');
  const isfStage = await page.evaluate(() => {
    const row = [...document.querySelectorAll('#level .qrow')]
      .find((n) => n.querySelector('.lab').textContent.trim() === 'ISF');
    return { stage: Boolean(row.querySelector('.stagebtn')), chevron: Boolean(row.querySelector('.go')) };
  });
  is(isfStage.stage, false, 'S18 a held row offers no stage affordance (term 38)');
  is(isfStage.chevron, true, 'S18 it still carries the chevron — it drills to its detail');
  await page.evaluate(() => [...document.querySelectorAll('#level .qrow')]
    .find((n) => n.querySelector('.lab').textContent.trim() === 'ISF').click());
  await settle(page, 450);
  const isf = await state(page);
  is(isf.crumb[isf.crumb.length - 1], 'ISF', 'S18 the ISF level opens');
  is(isf.chip, before.chip, 'S18 ISF derives no window — the chip is untouched');
  near(isf.gripA, before.gripA, 1, 'S18 the brace did not move');
  near(isf.gripB, before.gripB, 1, 'S18 the brace did not move');
  const scoped = await page.evaluate(() => document.querySelector('#level .slot-say')?.textContent.replace(/\s+/g, ' ').trim() ?? '');
  ok(/overnight fasting window/i.test(scoped), 'S18 the reserved scope sentence names the fasting window');
  ok(/not separately identifiable/i.test(scoped), 'S18 it states daytime ISF is not separately identifiable');
  const inLane = await page.evaluate(() => [...document.querySelectorAll('#lane button, #iclane button')]
    .some((b) => /isf/i.test(b.getAttribute('aria-label') || '')));
  is(inLane, false, 'S18 ISF is never a lane cell');
};

/** S19 · The hover readout is DOCKED: bin stats land in the fixed header row,
    an occurrence dot or meal glyph reports through that same row (stats cells
    withdrawn), a hovered item latches against the axis pointer, and leaving the
    plot clears it. No floating tooltip is ever created. */
// LOCK:diagnose-workstation:10 LOCK:diagnose-workstation:11 LOCK:diagnose-workstation:23
export const S19 = async (page) => {
  const b = await plot(page);
  await page.mouse.move(b.x + b.w * 0.45, b.y + b.h * 0.45);
  await settle(page, 400);
  const bin = await state(page);
  is(bin.hover, '1', 'S19 the header swaps to the live readout');
  ok(bin.rd.statsShown, 'S19 bin hover shows the stat cells');
  ok(/^\d\d:\d\d$/.test(bin.rd.time || ''), `S19 the bin names its time (${bin.rd.time})`);
  ok(/^\d+–\d+$/.test(bin.rd.iqr || ''), 'S19 25–75 prints');
  ok(/^\d+–\d+$/.test(bin.rd.band || ''), 'S19 10–90 prints');
  ok(['above', 'below', 'in'].includes(bin.rd.verdict), `S19 the median carries verdict ink (${bin.rd.verdict})`);
  ok(/^pooled from \d+ captured CGM days · ±\d+ min$/.test(bin.pool || ''), 'S19 the pooled-provenance clause persists during hover');
  const floating = await page.evaluate(() => [...document.querySelectorAll('div')]
    .filter((d) => /tooltip/i.test(d.className || '') && d.offsetParent !== null).length);
  is(floating, 0, 'S19 no floating tooltip anywhere');

  const dots = await marks(page, 'Occurrences');
  ok(dots.length > 0, 'S19 precondition: the canvas carries occurrence dots');
  await page.mouse.move(10, 10); await settle(page, 250);
  await page.mouse.move(dots[0].x, dots[0].y); await settle(page, 400);
  const dot = await state(page);
  is(dot.rd.statsShown, false, 'S19 a dot withdraws the stat cells');
  ok((dot.rd.note || '').length > 0, `S19 the dot reports through the same row (${dot.rd.note})`);
  // the latch: the axis pointer keeps firing while the pointer sits on the dot
  // and must not overwrite the dot's own reading
  await page.mouse.move(dots[0].x + 1, dots[0].y); await settle(page, 300);
  const latched = await state(page);
  is(latched.rd.note, dot.rd.note, 'S19 the hovered item latches against the axis pointer');

  const meals = await marks(page, 'Meal boluses');
  ok(meals.length > 0, 'S19 precondition: the canvas carries meal glyphs');
  await page.mouse.move(10, 10); await settle(page, 250);
  await page.mouse.move(meals[0].x, meals[0].y); await settle(page, 400);
  const meal = await state(page);
  ok(/meal bolus/.test(meal.rd.note || ''), `S19 a meal glyph reports through the same row (${meal.rd.note})`);

  await page.mouse.move(5, 5);
  await settle(page, 400);
  is((await state(page)).hover, '0', 'S19 leaving the plot restores the resting header');
};

/** S20 · Both coincidence routes work and each lands on its own parameter. */
// LOCK:diagnose-workstation:33
export const S20 = async (page) => {
  // `drill` opens ON a factor, so the coincidence line is already rendered
  ok((await state(page)).linkBtns.length === 2, 'S20 precondition: opens at the factor level');
  await page.evaluate(() => [...document.querySelectorAll('#level .slotlink .linkbtn')].find((b) => b.textContent.trim() === 'View slot').click());
  await settle(page, 450);
  const slot = await state(page);
  ok(/slot$/.test(slot.crumb[slot.crumb.length - 1]), `S20 View slot opens the basal slot (${slot.crumb})`);
  ok(/^Slot /.test(slot.chip || ''), 'S20 the slot chip stands');
  await page.click('#crumb-trail button:nth-of-type(2)');
  await settle(page, 450);
  await page.evaluate(() => [...document.querySelectorAll('#level .slotlink .linkbtn')].find((b) => b.textContent.trim() === 'View segment').click());
  await settle(page, 450);
  const block = await state(page);
  ok(/block$/.test(block.crumb[block.crumb.length - 1]), `S20 View segment opens the I:C block (${block.crumb})`);
};

/** S21 · A user window is a workspace: it survives drilling and popping, and
    ONLY a lane click (a physical scope choice) releases it. */
// LOCK:diagnose-workstation:7 LOCK:diagnose-workstation:9
export const S21 = async (page) => {
  const start = await state(page);
  ok(start.chip !== null, 'S21 precondition: a drawn window stands');
  await page.click('#level .qrow[data-state="finding"]');
  await settle(page, 450);
  const drilled = await state(page);
  is(drilled.chip, start.chip, 'S21 drilling a factor does not move the user window');
  near(drilled.gripA, start.gripA, 1, 'S21 the brace stayed put');
  is(drilled.scope, start.scope, 'S21 the canvas stayed on the user window');
  await page.click('#level .ev-row');
  await settle(page, 450);
  is((await state(page)).chip, start.chip, 'S21 opening an occurrence does not move it either');
  await page.click('#lane button:nth-child(21)');
  await settle(page, 450);
  const laned = await state(page);
  ok(/^Slot /.test(laned.chip || ''), `S21 a lane click RELEASES the user window (${laned.chip})`);
};

/** S22 · The surface never scrolls the page, the advisory sentence renders in
    full, and the instrument row contains only real controls and provenance at
    both locked viewports. */
// LOCK:diagnose-workstation:1 LOCK:diagnose-workstation:2 LOCK:diagnose-workstation:10
export const S22 = async (page) => {
  for (const vp of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    // a fresh load, not a live resize — this story is about the enumerated
    // SIZES term 1 states. The live-resize contract is S23's, and it became
    // assertable when #651 fixed the stale-geometry bug S22 used to work around.
    await page.setViewportSize(vp);
    await page.reload();
    await page.waitForSelector('.cockpit');
    await settle(page, 800);
    const s = await state(page);
    is(s.hScroll, 0, `S22 no horizontal page scroll at ${vp.width}×${vp.height}`);
    is(s.vScroll, 0, `S22 no vertical page scroll at ${vp.width}×${vp.height}`);
    is(s.advisoryFits, true, `S22 the advisory sentence is never ellipsized at ${vp.width}×${vp.height}`);
    ok(/review with your clinician/.test(s.advisory || ''), 'S22 the advisory sentence renders in full');
    is(s.rangeArtifacts, {
      scrub: false, fill: false, titled: false, label: false, fourteenDayStrip: false,
    }, `S22 the inert Range instrument stays absent at ${vp.width}×${vp.height}`);
    is(s.pool, 'pooled from 3 captured CGM days · ±45 min',
      `S22 canvas provenance reflects the server-supplied captured_days at ${vp.width}×${vp.height}`);
  }
};

/** S23 · A LIVE viewport narrowing re-lays-out the canvas and moves the brace
    with it — the plot tracks its grid column instead of holding the width it
    was last drawn at, and the window stays over the same clock hours. */
// LOCK:diagnose-workstation:1 LOCK:diagnose-workstation:6
export const geometry = (page) => page.evaluate(() => {
  const chart = document.getElementById('chart');
  const canvas = chart.querySelector('canvas');
  const a = document.getElementById('brace-a');
  const box = chart.getBoundingClientRect();
  return {
    chartW: Math.round(box.width),
    trackW: Math.round(chart.parentElement.getBoundingClientRect().width),
    canvasW: canvas ? Math.round(canvas.getBoundingClientRect().width) : null,
    braceLeft: a ? Math.round(a.getBoundingClientRect().left) : null,
  };
});

export const S23 = async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.waitForSelector('.cockpit');
  await settle(page, 800);
  const wide = await geometry(page);
  is(wide.chartW, wide.trackW, 'S23 precondition: the plot fills its grid track at 1440');
  ok(wide.braceLeft != null, 'S23 precondition: opens with a brace on the plot');

  await page.setViewportSize({ width: 1280, height: 800 });   // LIVE, no reload
  await settle(page, 800);
  const narrow = await geometry(page);
  ok(narrow.trackW < wide.trackW, `S23 the grid track narrows (${wide.trackW} → ${narrow.trackW})`);
  // the bug this asserts against: #chart kept its last drawn width, so the plot
  // overflowed a track that had already narrowed under it
  is(narrow.chartW, narrow.trackW,
    `S23 the plot re-lays-out to its narrowed track (${narrow.chartW} vs ${narrow.trackW})`);
  is(narrow.canvasW, narrow.trackW,
    `S23 the rendered canvas follows (${narrow.canvasW} vs ${narrow.trackW})`);
  ok(narrow.braceLeft < wide.braceLeft,
    `S23 the brace repaints against the new geometry (${wide.braceLeft} → ${narrow.braceLeft})`);
};

/* ---- #666 day-completion ---------------------------------------------
   These three exercise the app's own adapter seam. The app does NOT ship raw
   CGM — the day in view is fetched lazily (`dayMap` in
   diagnose-workstation-data.js) and the real trace arrives AFTER the level is
   already drawn. #666: that late arrival must repaint the current level and
   chart IN PLACE, never remount the whole surface (which would throw the
   reader back to the opening depth and drop the drawn window and staged Plan
   items). */

/** Stage one asserting basal slot, then leave the reader at a drilled FACTOR
    (depth 2) with a user-drawn window standing. The staged set and the drawn
    window are boot state that must survive the day-completion repaint. */
async function setupWorkspaceAtFactor(page) {
  // stage a slot that asserts a direction (same precondition as S16)
  const idx = await page.evaluate(() => [...document.querySelectorAll('#lane button')]
    .findIndex((b) => b.dataset.verdict === 'up'));
  ok(idx >= 0, '#666 precondition: the lane holds a slot that asserts a direction');
  await page.click(`#lane button:nth-child(${idx + 1})`);
  await settle(page, 400);
  await page.click('#level .stagebtn');
  await settle(page, 400);
  is((await state(page)).dock.kind, 'Plan · staged', '#666 setup: one item staged');
  // a lane click released any window; pop back to the factors root and drill a
  // factor, THEN draw the window so drilling preserves it (never a lane click)
  await page.click('#crumb-trail button');   // the Findings ancestor
  await settle(page, 400);
  await page.click('#level .qrow[data-state="finding"]');
  await settle(page, 400);
  const b = await plot(page);
  const y = b.y + b.h * 0.4;
  await page.mouse.move(b.x + 300, y);
  await page.mouse.down();
  await page.mouse.move(b.x + 430, y, { steps: 8 });
  await page.mouse.up();
  await settle(page, 400);
  const s = await state(page);
  is(s.crumb.length, 2, '#666 setup: drilled to a factor (depth 2)');
  ok(/^Window \d\d:\d\d–\d\d:\d\d$/.test(s.chip || ''), `#666 setup: a user window stands (${s.chip})`);
  is(s.dock.kind, 'Plan · staged', '#666 setup: staged item survives the drill');
  return s;
}

/** D1 · A DELAYED successful /api/timeline resolves the real trace AFTER an
    occurrence is selected in place (P35 retired: there is no occurrence level
    to be "at"). The late arrival repaints in place: the reader stays at the
    same drilled factor, the #level/#chart nodes keep their identity, and the
    drawn window and staged Plan item are untouched — proof the completion does
    NOT remount the surface (#666). */
export const D1 = async (page) => {
  const setup = await setupWorkspaceAtFactor(page);
  const levelBefore = await page.$('#level');
  const chartBefore = await page.$('#chart');
  await page.click('#level .ev-row');
  await settle(page, 500);
  const after = await state(page);
  is(after.crumb.length, 2, 'D1 the server selection stays in the standing case');
  is(await page.locator('#level .occ-detail .statline').innerText(),
    'The canvas shows the selected glucose trace and evidence markers.',
    'D1 clinical evidence is present without a paint-time fallback fetch');
  ok((await traceSeries(page))?.length > 0, 'D1 the server trace is drawn');
  is(after.chip, setup.chip, 'D1 the same drawn window remains');
  is(after.dock.kind, 'Plan · staged', 'D1 the staged Plan item remains');
  const sameLevel = await levelBefore.evaluate((el) => el === document.getElementById('level') && el.isConnected);
  const sameChart = await chartBefore.evaluate((el) => el === document.getElementById('chart') && el.isConnected);
  ok(sameLevel && sameChart, 'D1 selection preserves the standing surface nodes');
};

/** D2 · An EXPLICIT empty /api/timeline ({ cgm: [] }) is the deliberate no-trace
    state — the level says so and NO 'That day' series is ever minted. Asserted
    against an explicit empty stub, not a catch-all 404. */
export const D2 = async (page) => {
  const setup = await setupWorkspaceAtFactor(page);
  const levelBefore = await page.$('#level');
  const chartBefore = await page.$('#chart');
  await page.click('#level .ev-row');
  await settle(page, 500);
  const after = await state(page);
  is(after.crumb.length, 2, 'D2 at the drilled factor, occurrence selected in place');
  const sentence = await page.evaluate(() => document.querySelector('#level .occ-detail .statline')?.textContent.trim() ?? null);
  is(sentence, 'The canvas shows the selected glucose trace and evidence markers.',
    'D2 the case file, not a second timeline request, owns selection evidence');
  ok((await traceSeries(page))?.length > 0, 'D2 the selected server trace remains complete');
  is(after.chip, setup.chip, 'D2 the drawn window is untouched');
  is(after.dock.kind, 'Plan · staged', 'D2 the staged item is untouched');
  const sameLevel = await levelBefore.evaluate((el) => el === document.getElementById('level') && el.isConnected);
  const sameChart = await chartBefore.evaluate((el) => el === document.getElementById('chart') && el.isConnected);
  ok(sameLevel && sameChart, 'D2 #level/#chart keep their identity — an empty day never remounts');
};

/** D3 · A /api/timeline that 500s settles into the no-trace state without any
    teardown: depth 3 holds, the sentence stays no-trace, the #level/#chart nodes
    keep their identity, and the drawn window and staged item are unchanged. */
export const D3 = async (page) => {
  const setup = await setupWorkspaceAtFactor(page);
  const levelBefore = await page.$('#level');
  const chartBefore = await page.$('#chart');
  await page.click('#level .ev-row');
  await settle(page, 500);
  const after = await state(page);
  is(after.crumb.length, 2, 'D3 remains at the drilled factor');
  const sentence = await page.evaluate(() => document.querySelector('#level .occ-detail .statline')?.textContent.trim() ?? null);
  is(sentence, 'The canvas shows the selected glucose trace and evidence markers.',
    'D3 selection evidence remains complete');
  ok((await traceSeries(page))?.length > 0, 'D3 the selected trace is not replaced by a fallback');
  is(after.chip, setup.chip, 'D3 the drawn window is unchanged');
  is(after.dock.kind, 'Plan · staged', 'D3 the staged item is unchanged');
  const sameLevel = await levelBefore.evaluate((el) => el === document.getElementById('level') && el.isConnected);
  const sameChart = await chartBefore.evaluate((el) => el === document.getElementById('chart') && el.isConnected);
  ok(sameLevel && sameChart, 'D3 #level/#chart keep their identity');
};

/** S24 · ONE ranked findings queue at level 1: settings and habits interleave in a
    single list under the crumb root `Findings`, every row carries its flavor tag at
    one constant x, no hairline separates any row, and a pressed preset and a drawn
    brace re-scope it IN PLACE and identically — crumb, chip and queue always agree.
    ADDED #735 with lock terms 34-45 (the #662 re-settle's owed behaviour sweep). */
// LOCK:diagnose-workstation:34 LOCK:diagnose-workstation:36 LOCK:diagnose-workstation:37 LOCK:diagnose-workstation:43 LOCK:diagnose-workstation:44 LOCK:diagnose-workstation:45
export const S24 = async (page) => {
  await expandWatching(page);
  const open = await state(page);
  is(open.crumb, ['Findings'], 'S24 the crumb root is the queue\u2019s own noun');
  ok(open.queue.length > 0, 'S24 the queue renders rows');
  // ONE list: no tier heading, no "Factors", and no queue-level hedge banner
  const headings = await page.evaluate(() => ({
    factors: [...document.querySelectorAll('#level *')].some((n) => n.textContent.trim() === 'Factors'),
    caveat: Boolean(document.querySelector('#level .caveat')),
    entries: document.querySelectorAll('#level .entry').length,
  }));
  is(headings.factors, false, 'S24 no Factors heading anywhere (term 34)');
  is(headings.caveat, false, 'S24 no `Inferred patterns` banner at queue level (term 43)');
  is(headings.entries, 0, 'S24 no per-parameter tier rows (term 34)');
  is(open.queueRules, 0, 'S24 no hairline between queue rows — spacing separates (term 44)');
  // term 36: a fixed right-aligned tag column at ONE constant x on every row
  is(new Set(open.queue.map((r) => r.tagX)).size, 1,
    `S24 the tag column sits at one constant x (${JSON.stringify(open.queue.map((r) => r.tagX))})`);
  ok(open.queue.every((r) => /^[⚙◈](Setting|Habit)$/.test(r.tag || '')),
    `S24 every row wears a glyph+word flavor tag (${JSON.stringify(open.queue.map((r) => r.tag))})`);

  // term 37 — a PRESET re-scopes the queue in place; the crumb stays at its root
  await page.click('#seg-window button:nth-child(3)');   // Afternoon
  await settle(page, 450);
  const preset = await state(page);
  is(preset.crumb, ['Findings'], 'S24 window scope is never a breadcrumb level');
  is(preset.crumbMeta, '4 in this window', 'S24 the scoped meta counts visible action-ready rows');
  ok(preset.queue.map((r) => r.title).join('|') !== open.queue.map((r) => r.title).join('|'),
    'S24 the pressed preset actually re-scoped the row set');

  // ...and a DRAWN brace reaches the same state through the same grammar
  const b = await plot(page);
  const y = b.y + b.h * 0.4;
  await page.mouse.move(b.x + 260, y);
  await page.mouse.down();
  await page.mouse.move(b.x + 420, y, { steps: 8 });
  await page.mouse.up();
  await settle(page, 450);
  await expandWatching(page);
  const drawn = await state(page);
  is(drawn.crumb, ['Findings'], 'S24 a drawn window is not a level either');
  ok(/^\d+ in this window$/.test(drawn.crumbMeta), 'S24 drawn scope retains the action-ready meta grammar');
  ok(/^Window \d\d:\d\d–\d\d:\d\d$/.test(drawn.chip || ''), `S24 the chip owns the hours (${drawn.chip})`);
  assertNoRangeInMeta(drawn.crumbMeta);

  // term 38 — an explicit window is the one door to the demoted register
  ok(drawn.queue.some((r) => r.register === 'held' || r.register === 'blind'),
    'S24 held/blind rows appear under an explicit window');
  ok(drawn.queue.filter((r) => r.register === 'held' || r.register === 'blind')
    .every((r) => r.tier === 'noted'), 'S24 one demoted register for the whole queue');

  // Esc clears the window and restores the global, asserting-only queue
  await page.keyboard.press('Escape');
  await settle(page, 450);
  const cleared = await state(page);
  is(cleared.crumb, ['Findings'], 'S24 clearing is not a level change either');
};

/** S25 · The inspector has a FLOOR: the watched-change dock is pane furniture in one
    reserved height, reporting ONE object, and it survives every drill level. The pane
    header's staged status is gone. ADDED #735 with lock terms 46-49. */
// LOCK:diagnose-workstation:46 LOCK:diagnose-workstation:47 LOCK:diagnose-workstation:48 LOCK:diagnose-workstation:49
export const S25 = async (page) => {
  const header = await page.evaluate(() => Boolean(document.querySelector('#inspector-meta')));
  is(header, false, 'S25 the pane header\u2019s staged status is deleted (term 47)');
  const idle = await state(page);
  ok(idle.dock, 'S25 the dock is mounted');
  is(idle.dock.kind, 'Nothing being watched', 'S25 idle is a state, not an absence');
  is(idle.dock.what, 'No change staged, no trial or focus active', 'S25 the idle title');
  is(idle.dock.how, 'Stage a change from a finding to start one.', 'S25 the idle detail');
  is(idle.dock.route, null, 'S25 idle routes nowhere');
  // term 48 — separated by SPACE and the theme's ground, never a hairline
  const seam = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.inspector > .watch'));
    return { border: parseFloat(s.borderTopWidth), shadow: s.boxShadow };
  });
  is(seam.border, 0, 'S25 no hairline above the dock (term 48)');
  ok(seam.shadow === 'none', 'S25 and no shadow standing in for one');

  // term 46 — it is PANE furniture: staging changes its state, drilling never
  // changes its box
  const idx = await page.evaluate(() => [...document.querySelectorAll('#lane button')]
    .findIndex((b) => b.dataset.verdict === 'up'));
  ok(idx >= 0, 'S25 precondition: the lane holds a slot that asserts a direction');
  await page.click(`#lane button:nth-child(${idx + 1})`);
  await settle(page, 400);
  const drilled = await state(page);
  is(drilled.dock.kind, 'Nothing being watched', 'S25 the dock survives a drill');
  is(drilled.dock.box.top, idle.dock.box.top, 'S25 the floor does not move on a drill');
  is(drilled.dock.box.height, idle.dock.box.height, 'S25 one reserved height (term 48)');
  await page.click('#level .stagebtn');
  await settle(page, 400);
  const staged = await state(page);
  is(staged.dock.kind, 'Plan · staged', 'S25 the dock reports the staged object');
  is(staged.dock.how, 'Staged, not applied — nothing has changed on the pump',
    'S25 the Plan detail line prints in full');
  is(staged.dock.howClipped, false, 'S25 the detail line is never ellipsized (term 49)');
  is(staged.dock.route, 'Open Plan ›', 'S25 one optional route control');
  is(staged.dock.box.top, idle.dock.box.top, 'S25 the floor held when the object changed');
  is(staged.dock.box.height, idle.dock.box.height, 'S25 ONE reserved height across states');
  /* Term 49 — the route control is OUTLINED, never filled: "so the interaction
     accent is not re-broadened". What it forbids is the ACCENT spent on a plate
     (the theme lock says the same thing in its term 8: a write action spends its
     accent on the glyph, never on a filled plate). It does not forbid the theme
     giving the role a neutral ground of its own — under the Harmonic precedence
     rule the theme owns the value and this manifest owns the placement, and dark
     recesses the control BELOW the dock rather than raising it. So the assertion
     is the term's own subject: a real border, and a background that is not the
     interaction accent. */
  const control = await page.evaluate(() => {
    const node = document.querySelector('.inspector > .watch .go');
    const s = getComputedStyle(node);
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--mk-primary').trim();
    document.body.append(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return { background: s.backgroundColor, border: parseFloat(s.borderTopWidth), accent };
  });
  ok(control.background !== control.accent,
    `S25 the route control does not spend the interaction accent on a plate (${control.background} vs accent ${control.accent})`);
  ok(control.border > 0, 'S25 it is outlined');
};

/** S26 · Evidence rows remain one full-row occurrence drill target, but their
    redundant trailing chevrons are retired. */
// STORY:finding-evidence-routing:S26
export const S26 = async (page) => {
  const author = await projectAuthor();
  const sanction = `${author} · 2026-08-19 · "Decided by ${author} in a ruling session on 2026-08-19."`;
  await page.click('#level .qrow[data-state="finding"]');
  await settle(page, 450);
  ok((await state(page)).evRows > 0, 'S26 precondition: evidence rows render');
  const shape = await page.evaluate(() => ({
    rows: document.querySelectorAll('#level .ev-row').length,
    chevrons: document.querySelectorAll('#level .ev-row .chev').length,
    buttons: [...document.querySelectorAll('#level .ev-row')]
      .every((row) => row.tagName === 'BUTTON'),
  }));
  is(shape.chevrons, 0, `S26 RETIRED — ${sanction}`);
  ok(shape.buttons, 'S26 the full evidence rows remain buttons');
  await page.click('#level .ev-row');
  await settle(page, 450);
  // select-in-place (P35 retired, 2026-08-19 revision): the row still selects,
  // it just no longer drills to a level of its own
  is((await state(page)).crumb.length, 2, 'S26 the row selects in place, no crumb push (P35 retired)');
  const selected = await page.evaluate(() =>
    document.querySelector('#level .ev-row[aria-pressed="true"]') !== null);
  ok(selected, 'S26 the row still emphasises in place');
  return `RETIRED — ${sanction}`;
};

/** S27 · Filter's Sift group renders the four server-published global counts. */
// STORY:finding-evidence-routing:S27
export const S27 = async (page) => {
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settle(page, 450);
  await page.getByRole('button', { name: /Filter/ }).click();
  const sift = await page.getByRole('menuitemcheckbox').allTextContents();
  is(sift, ['Highs 4', 'Lows 1', 'Meals 1', 'Corrections 1'],
    'S27 the four Sift items spell the server-published global counts');
};

/** S28 · Removing a Sift choice hides only rows with no remaining membership. */
// STORY:finding-evidence-routing:S28
export const S28 = async (page) => {
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settle(page, 450);
  await page.getByRole('button', { name: /Filter/ }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Highs 4', exact: true }).click();
  await settle(page, 350);
  const ids = await page.locator('#level .qrow').evaluateAll((rows) => rows.map((row) => row.dataset.id));
  is(ids, ['finding:correction_on_iob', 'finding:late_bolus'],
    'S28 a deselected Highs choice hides high-only rows while preserving multi-Sift matches');
};

/** S29 · A sift collapses the held/blind group, which can expand in place. */
// STORY:finding-evidence-routing:S29
export const S29 = async (page) => {
  await page.getByRole('button', { name: 'Overnight', exact: true }).click();
  await settle(page, 450);
  await page.getByRole('button', { name: /Filter/ }).click();
  await page.getByRole('menuitemcheckbox', { name: /^Highs / }).click();
  await page.keyboard.press('Escape');
  await settle(page, 350);
  const toggle = page.locator('#level .qcollapse');
  is(await toggle.innerText(), 'Watching · 4 reads', 'S29 the sift collapses held/blind reads under Watching');
  is(await toggle.getAttribute('aria-expanded'), 'false', 'S29 the held/blind group starts collapsed');
  is(await page.locator('#level .qrow').count(), 0,
    'S29 collapsed held rows are not painted as ordinary queue rows');
  await toggle.click();
  await settle(page, 350);
  is(await toggle.getAttribute('aria-expanded'), 'true', 'S29 the held/blind group expands');
  const ids = await page.locator('#level .qrow').evaluateAll((rows) => rows.map((row) => row.dataset.id));
  is(ids, ['basal:0-30', 'basal:210-240', 'ic:660', 'isf'],
    'S29 expanding restores every collapsed held read to the rendered queue');
};

/** S30 · An all-hidden sift names itself while keeping held/blind reads reachable. */
// STORY:finding-evidence-routing:S30
export const S30 = async (page) => {
  await page.getByRole('button', { name: 'Overnight', exact: true }).click();
  await settle(page, 450);
  await page.getByRole('button', { name: /Filter/ }).click();
  await page.getByRole('menuitemcheckbox', { name: /^Highs / }).click();
  await settle(page, 350);
  is(await page.locator('#level .quiet-line.sift-empty').innerText(),
    'No findings match the current filters.', 'S30 the all-hidden filter result names itself');
  is(await page.locator('#level .qcollapse').innerText(), 'Watching · 4 reads',
    'S30 the collapsed held group remains reachable below the empty-sift line');
};

/** S31 · The correction-factor row declares its whole-day scope. */
// STORY:finding-evidence-routing:S31
export const S31 = async (page) => {
  await expandWatching(page);
  const row = page.locator('#level .qrow[data-id="isf"]');
  is(await row.locator('.scope-note').innerText(), ' · Whole day',
    'S31 the correction-factor row visibly declares its whole-day scope');
};

/* ----------------------------------------- issue #62 · one membership rule ---

   The stories #62, #57 and #58 are judged by. The browser re-derived window
   membership from an occurrence's OWN clock minute while the endpoint and the
   findings queue both anchored it to where its consequence landed — three rules
   over one population. These six prove the browser now reads the server's
   answer and nothing else.

   Three of them pose a shape the committed payload cannot: a meal the lever
   actually fired on, a consequence that landed in a window its trigger sits
   outside, and a finding whose episodes span two families. Each derives its
   inputs from a committed synthetic fixture inside this driver, says what it
   changed and why, and touches nothing on disk. */

/** The one meals episode the roster stories select. The event-comparison
    capture reuses this (episode, instant) pair across TWO catalog
    occurrences, which is exactly why selection travels by the endpoint's own
    opaque id and this pair is only ever a join key. */
const ROSTER_MEAL = { ep_id: '2020-03-01-ep72', t: '2020-03-01 19:10:00' };

/** The committed payload, with the carb-undercount classifier matched on one meal.
    Every meals occurrence the payload ships reads `outranked`, and `outranked`
    is residue with no band segment — a roster of none, and nothing to click. */
const withFiredMeal = ({ analysis, exposures, scenarios }) => {
  const next = structuredClone(exposures);
  const meals = next.exposures.meals.occurrences;
  const at = meals.findIndex((o) => o.ep_id === ROSTER_MEAL.ep_id);
  if (at < 0) fail(`the payload no longer holds ${ROSTER_MEAL.ep_id}`);
  meals[at] = { ...meals[at], cause_lever: 'carb_undercount', cause_title: 'Carb undercount', verdicts: [{
    classifier: 'carb_undercount', matched: true, evidence_tier: 'inferred',
    detail: 'the entered carbs understated the rise', silence_reason: null }] };
  return { analysis, exposures: next, scenarios };
};

/** The committed payload, with the high the 13:00 late bolus never caught
    recorded at 14:35 — the episode's own consequence. The queue anchors an
    occurrence to where its consequence landed, so this meal belongs to
    14:00–16:00 while its bolus sits a full hour outside it. The
    event-comparison capture already stamps the same outcome minute on this
    episode (`outcome_min: 875`), so both projections are answering for the
    same instant. */
const LATE_MEAL = { ep_id: '2020-03-03-ep71', t: '2020-03-03 13:00:00' };
const withLateConsequence = ({ analysis, exposures, scenarios }) => {
  const next = structuredClone(exposures);
  const highs = next.exposures.highs;
  highs.occurrences = [...highs.occurrences, {
    ...highs.occurrences[0], ep_id: LATE_MEAL.ep_id, t: '2020-03-03 14:35:00',
    date: '2020-03-03', kind: 'high', attributed: false, cause_lever: null,
    cause_title: null, state: 'clean', verdicts: [],
  }];
  highs.n = highs.occurrences.length;
  return { analysis, exposures: next, scenarios };
};

/** Move the three synthetic correction-on-IOB low anchors to Evening while
    leaving its Morning correction-cluster anchor in place. The replacement
    Findings projection therefore has no canonical event coordinate, while the
    retained case preparation keeps its own server-owned event path. */
const withEligibilityLoss = ({ analysis, exposures, scenarios }) => {
  const next = structuredClone(exposures);
  let hour = 19;
  for (const occurrence of next.exposures.lows.occurrences) {
    if (occurrence.cause_lever !== 'correction_on_iob') continue;
    occurrence.t = `${occurrence.t.slice(0, 11)}${String(hour).padStart(2, '0')}:00:00`;
    hour += 1;
  }
  return { analysis, exposures: next, scenarios };
};

/** The frozen findings-projection inputs — the one committed fixture holding a
    finding whose episodes span two families. Served to BOTH the queue and the
    exposures feed, because a finding's evidence keys only join to the
    population they were published over. */
export const twoFamilyInputs = async () => JSON.parse(await readFile(
  join(ROOT, 'frontend/__fixtures__/findings-projection.json'), 'utf8')).inputs;

/** Seven simultaneous analyzer-built history rows, committed by the findings
 * fixture generator for density and reachability coverage. */
export const densityHistoryInputs = async () => {
  const fixture = JSON.parse(await readFile(
    join(ROOT, 'frontend/__fixtures__/findings-projection.json'), 'utf8'));
  if (fixture.density_history?.length !== 7) {
    fail('generated findings fixture has no seven-row density_history shape');
  }
  return {
    ...fixture.inputs,
    analysis: { ...fixture.inputs.analysis, ic_history: fixture.density_history },
  };
};

/** Open one finding's case file from the queue, by the title a reader sees.
    Waits for the window's own rows to be in hand first: the queue is a server
    round trip, and clicking a row from the previous window's answer would be
    testing the wrong population. */
const clickQueueRow = async (page, title) => {
  await page.waitForFunction(() => document.getElementById('level')?.dataset.loading !== 'true');
  const queue = await page.evaluate(() => [...document.querySelectorAll('#level .qrow')]
    .map((row) => row.querySelector('.lab')?.textContent.trim()).filter(Boolean));
  const at = queue.indexOf(title);
  if (at < 0) {
    const detail = await page.evaluate(() => document.getElementById('level')?.innerText.replace(/\s+/g, ' ').trim());
    fail(`the queue holds no row titled ${title}; saw ${queue.join(', ') || '(none)'}; level ${detail || '(empty)'}`);
  }
  await page.locator('#level .qrow').nth(at).click();
  await settle(page, 500);
};

/** Draw an exact clock window. The plot's minute→pixel map is linear
    (`xAtMinute`, diagnose-workstation-chart.js), so the brace the canvas is
    already showing fixes it: two known edges, two known minutes. Solved rather
    than estimated, because the story's whole subject is one exact window. */
const drawWindow = async (page, [fromMin, toMin], [standingFrom, standingTo]) => {
  const b = await plot(page);
  const before = await state(page);
  const perMinute = (before.gripB - before.gripA) / (standingTo - standingFrom);
  const xAt = (m) => b.x + before.gripA + (m - standingFrom) * perMinute;
  const y = b.y + b.h * 0.5;
  await page.mouse.move(xAt(fromMin), y);
  await page.mouse.down();
  await page.mouse.move(xAt(toMin), y, { steps: 8 });
  await page.mouse.up();
  await settle(page, 500);
};

/** Resize the public clock brace's leading edge to an exact minute. */
const resizeWindowStart = async (page, toMin, [standingFrom, standingTo]) => {
  const b = await plot(page);
  const before = await state(page);
  const perMinute = (before.gripB - before.gripA) / (standingTo - standingFrom);
  const y = b.y + b.h * 0.5;
  await page.mouse.move(b.x + before.gripA, y);
  await page.mouse.down();
  await page.mouse.move(b.x + before.gripA + (toMin - standingFrom) * perMinute, y,
    { steps: 8 });
  await page.mouse.up();
  await settle(page, 500);
};

/** S32 · #57 — selecting a roster occurrence under `By event` draws it. The
    roster carries the shared (episode, instant) key; the endpoint owns its own
    opaque catalog id and reuses that pair across several occurrences, so the
    selection is resolved to an id through the projection already in hand
    rather than assumed unique. */
// STORY:finding-evidence-routing:S32
export const S32 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Carb undercount');
  const opened = await state(page);
  ok(opened.evRows > 0, 'S32 precondition: the roster has a row to select');
  ok(opened.alignShown, 'S32 precondition: ALIGN is offered on this case file');
  await page.click('#seg-align button:nth-child(2)');
  await page.locator('#ec-chart').waitFor();
  await settle(page, 600);
  const request = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname === '/api/diagnose/finding-case-file' && url.searchParams.has('occ');
  });
  await page.click('#level .ev-row');
  const requested = new URL((await request).url()).searchParams.get('occ');
  await settle(page, 800);
  const drawn = await page.evaluate(() => {
    const exposed = window.__diagnoseEventComparison;
    const selection = exposed?.projection?.selection || null;
    const selected = selection?.detail || null;
    const trace = (exposed?.chart.getOption().series || [])
      .find((series) => series.name === 'Selected occurrence');
    return {
      row: document.querySelector('#level .ev-row[aria-pressed="true"] .when')?.textContent.trim() ?? null,
      t: selected?.anchor?.t ?? null,
      id: selected?.id ?? null,
      join: selected ? `${new Date(`${selected.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${selected.anchor.t.slice(11, 16)}` : null,
      state: selection?.state ?? null,
      trace: trace?.data ?? null,
      responseTrace: selected?.glucose?.map((point) => [point.minute, point.bg]) ?? null,
    };
  });
  is(drawn.state, 'selected', 'S32 the endpoint resolved a selection');
  ok(drawn.t !== null, 'S32 the server selection retains its anchor instant');
  is(drawn.join, drawn.row, 'S32 the selected response carries the visible roster row\'s join key');
  is(requested, drawn.id, 'S32 the browser request carried the server opaque Occurrence id');
  is(drawn.trace, drawn.responseTrace, 'S32 the drawn trace carries that selected response');
};

/** S40 · #64 — the visible lows roster and By event canvas select the same
    shared-population occurrence. The row's episode-and-time pair joins the
    response and trace; the browser request still travels by the endpoint's
    opaque occurrence id. */
// STORY:finding-evidence-routing:S40
export const S40 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Over-treated low');
  const opened = await state(page);
  ok(opened.evRows > 0, 'S40 precondition: the low roster has a visible row to select');
  ok(opened.alignShown, 'S40 precondition: ALIGN is offered on this low case file');
  await page.click('#seg-align button:nth-child(2)');
  await page.locator('#ec-chart').waitFor();
  await settle(page, 600);
  const request = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname === '/api/diagnose/finding-case-file' && url.searchParams.has('occ');
  });
  await page.click('#level .ev-row');
  const requested = new URL((await request).url()).searchParams.get('occ');
  await settle(page, 800);
  const drawn = await page.evaluate(() => {
    const exposed = window.__diagnoseEventComparison;
    const selection = exposed?.projection?.selection || null;
    const selected = selection?.detail || null;
    const trace = (exposed?.chart.getOption().series || [])
      .find((series) => series.name === 'Selected occurrence');
    return {
      row: document.querySelector('#level .ev-row[aria-pressed="true"] .when')?.textContent.trim() ?? null,
      id: selected?.id ?? null,
      kind: selected?.anchor?.kind ?? null,
      join: selected ? `${new Date(`${selected.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${selected.anchor.t.slice(11, 16)}` : null,
      state: selection?.state ?? null,
      trace: trace?.data ?? null,
      responseTrace: selected?.glucose?.map((point) => [point.minute, point.bg]) ?? null,
    };
  });
  is(drawn.state, 'selected', 'S40 the endpoint resolved the visible low row');
  is(drawn.kind, 'low', 'S40 the selected response is a low occurrence');
  is(drawn.join, drawn.row, 'S40 the selected response carries the visible low row\'s join key');
  is(requested, drawn.id, 'S40 the browser request carried the server opaque Occurrence id');
  is(drawn.trace, drawn.responseTrace, 'S40 the drawn trace carries that selected low response');
};

// STORY:finding-evidence-routing:S41
export const S41 = async (page) => {
  await page.getByRole('button', { name: 'Morning', exact: true }).click();
  await settle(page, 450);
  await expandWatching(page);
  const rows = await page.locator('#level .qrow').evaluateAll((nodes) => nodes.map((node) => node.dataset.state));
  is(rows.at(-1), 'history', 'S41 history follows every held/blind row');
  ok(rows.slice(0, -1).some((register) => register === 'held' || register === 'blind'),
    'S41 scoped queue includes a predecessor Watching register before history');
  is((await state(page)).queue.at(-1).tag.replace(/\s+/g, ''), '◌Watching', 'S41 history is Watching');
};

// STORY:finding-evidence-routing:S42
export const S42 = async (page) => {
  await page.getByRole('button', { name: 'Morning', exact: true }).click();
  await settle(page, 450);
  await page.getByRole('button', { name: /Filter/ }).click();
  const highs = page.getByRole('menuitemcheckbox', { name: /^Highs / });
  await highs.click();
  const checked = await highs.getAttribute('aria-checked');
  await page.keyboard.press('Escape');
  await settle(page, 250);
  const toggle = page.locator('#level .qcollapse');
  ok(/^Watching · \d+ reads?$/.test(await toggle.innerText()), 'S42 one Watching control owns the count');
  if (page.viewportSize().width <= 760) {
    const box = await toggle.boundingBox();
    ok(box && box.height >= 44, `S42 mobile Watching target is at least 44px high (${box?.height})`);
  }
  await captureEvidence(page, 'S42-sift-collapsed');
  await toggle.click();
  await page.getByRole('button', { name: /Filter/ }).click();
  is(await page.getByRole('menuitemcheckbox', { name: /^Highs / }).getAttribute('aria-checked'), checked,
    'S42 expansion preserves the sift');
  await page.keyboard.press('Escape');
  ok(await page.locator('#level .qrow[data-state="history"]').isVisible(), 'S42 history is reachable after expansion');
};

// STORY:finding-evidence-routing:S43
export const S43 = async (page) => {
  await expandWatching(page);
  const row = page.locator('#level .qrow[data-state="history"]').first();
  const text = await row.innerText();
  ok(/past 6\.0 g\/U/.test(text) && /3 meal runs/.test(text), 'S43 past setting and support render');
  ok(!/Current|programmed now|5\.0 g\/U/.test(text), 'S43 queue omits current program');
  is(await row.locator('.stagebtn').count(), 0, 'S43 queue history cannot stage');
  await captureEvidence(page, 'ADR22-before-history-queue');
};

// STORY:finding-evidence-routing:S44
export const S44 = async (page) => {
  await expandWatching(page);
  const id = await page.locator('.qrow[data-state="history"]').first().getAttribute('data-id');
  await openHistoryCase(page);
  is((await state(page)).history.id, id, 'S44 opaque row id opens the case');
  is((await state(page)).history.stageCount, 0, 'S44 case exposes no stage path');
};

// STORY:finding-evidence-routing:S45
export const S45 = async (page) => {
  await openHistoryCase(page);
  const s = await state(page);
  is(s.history.conclusion, 'Past setting. No change suggested.', 'S45 conclusion is exact and first');
  is(s.history.currentCopies, 1, 'S45 current program appears exactly once');
  ok(s.history.caseText.indexOf(s.history.conclusion) < s.history.caseText.indexOf('Current program'),
    'S45 current program follows the conclusion and evidence');
  await captureEvidence(page, 'ADR22-after-history-case');
};

// STORY:finding-evidence-routing:S46
export const S46 = async (page) => {
  await openHistoryCase(page);
  const id = (await state(page)).history.id;
  await page.getByRole('button', { name: 'Morning', exact: true }).click();
  await settle(page, 600);
  const after = await state(page);
  is(after.history.id, id, 'S46 overlapping scope preserves selected id');
  is(after.history.notice, null, 'S46 overlapping scope remains present');
};

// STORY:finding-evidence-routing:S47
export const S47 = async (page) => {
  await openHistoryCase(page);
  const before = await state(page);
  await page.getByRole('button', { name: 'Afternoon', exact: true }).click();
  await settle(page, 650);
  const after = await state(page);
  is(after.history.id, before.history.id, 'S47 out-of-scope keeps the case');
  is(after.history.generation, before.history.generation, 'S47 out-of-scope keeps prior generation');
  is(after.history.canvasRender, before.history.canvasRender,
    'S47 out-of-scope keeps the prior rendered clock window and content');
  is(after.history.notice, 'Past-setting evidence is outside the selected window.', 'S47 exact server message');
  is(await page.locator('.history-canvas-notice').innerText(), after.history.notice, 'S47 both panes show the message');
};

// STORY:finding-evidence-routing:S48
export const S48 = async (page) => {
  await openHistoryCase(page);
  const s = await state(page);
  is(s.history.canvasId, s.history.id, 'S48 clock canvas and inspector share id');
  is(s.history.canvasGeneration, s.history.generation, 'S48 clock canvas and inspector share generation');
};

// STORY:finding-evidence-routing:S49
export const S49 = async (page) => {
  const requests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/diagnose/carb-ratio-history/events') requests.push(new URL(request.url()));
  });
  await openHistoryEvents(page);
  const s = await state(page);
  is(requests.at(-1).searchParams.get('history_id'), s.history.id, 'S49 exact selected id sent');
  is(requests.at(-1).searchParams.get('analysis_generation'), s.history.generation, 'S49 exact generation sent');
  is(s.history.canvasGeneration, s.history.generation, 'S49 pair swaps together');
};

// STORY:finding-evidence-routing:S50
export const S50 = async (page) => {
  await openHistoryCase(page);
  const clockPool = (await state(page)).pool;
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await settle(page, 650);
  const before = await state(page);
  is(before.pool, '', 'S50 history event header exposes no analysis generation');
  await page.getByRole('button', { name: 'By clock', exact: true }).click();
  await settle(page, 250);
  const after = await state(page);
  is(after.pool, clockPool, 'S50 returning to clock restores its pooled-data header verbatim');
  is(after.history.id, before.history.id, 'S50 id survives return to clock');
  is(after.history.generation, before.history.generation, 'S50 generation survives return to clock');
  is(after.history.selectedRunId, before.history.selectedRunId, 'S50 selected run survives return to clock');
  is(after.history.stageCount, 0, 'S50 remains non-stageable');
};

// STORY:finding-evidence-routing:S51
export const S51 = async (page) => {
  await openHistoryEvents(page);
  const before = await state(page);
  is(await page.getByRole('group', { name: 'Meal runs' }).count(), 1,
    'S51 the roster has one accessible group');
  is(await page.getByRole('button', { name: /2 meals/ }).count(), before.history.runIds.length,
    'S51 every member remains a native pressed-state button');
  await page.locator('.history-run').first().click();
  await settle(page, 650);
  const after = await state(page);
  is(after.history.runIds, before.history.runIds, 'S51 ordered population is unchanged');
  is(after.history.selectedRuns, [before.history.runIds[0]], 'S51 selected opaque member is emphasized');
};

// STORY:finding-evidence-routing:S52
export const S52 = async (page) => {
  await openHistoryEvents(page);
  const before = await state(page);
  ok(before.history.runLabels.every((label) => /2 meals · \+0, \+120 min/.test(label)),
    'S52 every server meal offset stays under its run');
  await page.locator('.history-run').first().click();
  await settle(page, 600);
  is((await state(page)).history.runIds.length, before.history.runIds.length, 'S52 selection does not split a run');
};

// STORY:finding-evidence-routing:S90
export const S90 = async (page) => {
  await openHistoryEvents(page);
  const labels = await page.locator('.history-run small').allInnerTexts();
  ok(labels.every((label) => label === '4 meals · +0, +137, +262, +398 min'),
    'S90 meal offsets read as rounded whole minutes');
};

// STORY:finding-evidence-routing:S53
export const S53 = async (page) => {
  await openHistoryCase(page);
  const s = await state(page);
  ok(/CI 4\.00–8\.00 g\/U \(wide\)/.test(s.history.caseText), 'S53 wide interval remains visible');
  ok(/1 meal run/.test(s.history.caseText), 'S53 thin support remains visible');
  is(s.history.stageCount, 0, 'S53 thin history remains non-actionable');
};

// STORY:finding-evidence-routing:S54
export const S54 = async (page) => {
  await expandWatching(page);
  const row = page.locator('.qrow[data-state="history"]').first();
  ok(await row.isVisible(), 'S54 non-null history is present because the server published it');
  const source = await readFile(join(ROOT, 'frontend/diagnose-workstation.js'), 'utf8');
  ok(!/estimate\?\.value\s*==\s*null|support\s*[<>]=?\s*\d+|Date\.now\(\).*regime/.test(source),
    'S54 frontend carries no history retirement/support/age predicate');
  await row.click();
  await page.getByRole('button', { name: 'Morning', exact: true }).click();
  await settle(page, 750);
  const after = await state(page);
  ok(after.history.id, 'S54 a disposition cannot retire a row the server still publishes');
  is(after.history.stale, true, 'S54 contradictory disposition/row responses stop visibly stale');
};

const assertRetired = async (page, message, story) => {
  await settle(page, 650);
  const s = await state(page);
  is(s.history.id, null, `${story} case returned atomically to queue`);
  is(s.history.retirement, message, `${story} exact retirement notice`);
  is(s.queue.some((row) => row.register === 'history'), false,
    `${story} refreshed queue does not retain the retired history row`);
  if (page.viewportSize().width <= 760) {
    const fontSize = await page.locator('.history-retirement').evaluate((node) =>
      parseFloat(getComputedStyle(node).fontSize));
    ok(fontSize >= 14, `${story} mobile retirement copy is at least 14px (${fontSize})`);
  }
  ok(await page.locator('#chart').isVisible(), `${story} clock canvas restored`);
};

// STORY:finding-evidence-routing:S55
export const S55 = async (page) => {
  await openHistoryCase(page);
  await page.getByRole('button', { name: 'Morning', exact: true }).click();
  await assertRetired(page, 'Past-setting evidence aged out of the 90-day window.', 'S55');
};

// STORY:finding-evidence-routing:S56
export const S56 = async (page) => {
  await openHistoryCase(page);
  await page.getByRole('button', { name: 'Morning', exact: true }).click();
  await assertRetired(page, 'Past-setting evidence no longer maps to one current program block.', 'S56');
};

// STORY:finding-evidence-routing:S57
export const S57 = async (page) => {
  const calls = { findings: 0, events: 0 };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/diagnose/findings' && url.searchParams.has('selected_id')) calls.findings += 1;
    if (url.pathname === '/api/diagnose/carb-ratio-history/events') calls.events += 1;
  });
  await openHistoryCase(page);
  expectResponse(page, /\/api\/diagnose\/carb-ratio-history\/events/, 410);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await assertRetired(page, 'Past-setting evidence aged out of the 90-day window.', 'S57');
  is(calls, { findings: 1, events: 1 }, 'S57 refreshes selection once and never retries event evidence');
};

// STORY:finding-evidence-routing:S58
export const S58 = async (page) => {
  const calls = { findings: 0, events: 0 };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/diagnose/findings' && url.searchParams.has('selected_id')) calls.findings += 1;
    if (url.pathname === '/api/diagnose/carb-ratio-history/events') calls.events += 1;
  });
  await openHistoryCase(page);
  expectResponse(page, /\/api\/diagnose\/carb-ratio-history\/events/, 410);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await assertRetired(page, 'Past-setting evidence no longer maps to one current program block.', 'S58');
  is(calls, { findings: 1, events: 1 }, 'S58 refreshes selection once and never retries event evidence');
};

// STORY:finding-evidence-routing:S59
export const S59 = async (page) => {
  await openHistoryCase(page);
  const before = await state(page);
  expectResponse(page, /\/api\/diagnose\/carb-ratio-history\/events/, 500);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await settle(page, 150);
  const pending = await state(page);
  is(pending.history.id, before.history.id, 'S59 prior inspector survives pending recovery');
  is(pending.history.canvasId, before.history.canvasId, 'S59 prior canvas survives pending recovery');
  is(pending.history.canvasRender, before.history.canvasRender,
    'S59 pending recovery keeps the prior rendered canvas scope and content');
  await captureEvidence(page, 'S59-first-recovery-pending');
  await settle(page, 900);
  is((await state(page)).history.stale, false, 'S59 one coordinated recovery succeeds');
};

// STORY:finding-evidence-routing:S60
export const S60 = async (page) => {
  const calls = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/diagnose/')) calls.push(url.pathname);
  });
  await openHistoryCase(page);
  expectResponse(page, /\/api\/diagnose\/carb-ratio-history\/events/, 409);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await settle(page, 900);
  ok(calls.slice(-2)[0] === '/api/diagnose/findings'
    && calls.slice(-2)[1] === '/api/diagnose/carb-ratio-history/events', 'S60 retry is findings then events');
  const s = await state(page);
  is(s.history.canvasGeneration, s.history.generation, 'S60 coherent replacement generation commits');
};

// STORY:finding-evidence-routing:S61
export const S61 = async (page) => {
  let requests = 0;
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/diagnose/')) requests += 1; });
  await openHistoryCase(page);
  const before = await state(page);
  expectResponse(page, /\/api\/diagnose\/carb-ratio-history\/events/, 500);
  expectResponse(page, /\/api\/diagnose\/findings/, 500);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await settle(page, 850);
  const terminal = await state(page);
  is(terminal.history.id, before.history.id, 'S61 last pair remains');
  is(terminal.history.stale, true, 'S61 terminal stale notice is visible');
  is(terminal.history.retry, 'Retry', 'S61 explicit Retry is offered');
  const stopped = requests;
  await settle(page, 500);
  is(requests, stopped, 'S61 automatic loop stopped');
};

// STORY:finding-evidence-routing:S62
export const S62 = async (page) => {
  await openHistoryCase(page);
  expectResponse(page, /\/api\/diagnose\/carb-ratio-history\/events/, 500);
  expectResponse(page, /\/api\/diagnose\/findings/, 500);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await settle(page, 750);
  const stale = await state(page);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await captureEvidence(page, 'S62-explicit-retry-pending');
  await settle(page, 900);
  const fresh = await state(page);
  is(fresh.history.id, stale.history.id, 'S62 explicit retry preserves selected id');
  is(fresh.history.stale, false, 'S62 stale notice clears only after coherent success');
  is(fresh.history.canvasGeneration, fresh.history.generation, 'S62 replacement pair is coherent');
};

const assertTypedFindingsFailure = async (page, status, code, story) => {
  await openHistoryCase(page);
  const before = await state(page);
  expectResponse(page, /\/api\/diagnose\/findings/, status);
  expectResponse(page, /\/api\/diagnose\/findings/, status);
  await page.getByRole('button', { name: 'Morning', exact: true }).click();
  await settle(page, 750);
  const after = await state(page);
  is(after.history.id, before.history.id, `${story} opaque id is not repaired`);
  is(after.history.canvasRender, before.history.canvasRender,
    `${story} terminal failure keeps the prior rendered clock window and content`);
  is(after.history.stale, true, `${story} ${code} stops visibly stale`);
};

// STORY:finding-evidence-routing:S63
export const S63 = async (page) => assertTypedFindingsFailure(page, 400, 'invalid_history_id', 'S63');

// STORY:finding-evidence-routing:S64
export const S64 = async (page) => assertTypedFindingsFailure(page, 404, 'history_not_found', 'S64');

const assertTypedRunFailure = async (page, status, code, story) => {
  await openHistoryEvents(page);
  expectResponse(page, /\/api\/diagnose\/carb-ratio-history\/events/, status);
  expectResponse(page, /\/api\/diagnose\/carb-ratio-history\/events/, status);
  await page.locator('.history-run').first().click();
  await settle(page, 850);
  const s = await state(page);
  is(s.history.stale, true, `${story} ${code} stops visibly stale`);
  is(s.history.runIds.length, 3, `${story} prior population remains complete`);
};

// STORY:finding-evidence-routing:S65
export const S65 = async (page) => assertTypedRunFailure(page, 400, 'invalid_history_run_id', 'S65');

// STORY:finding-evidence-routing:S66
export const S66 = async (page) => assertTypedRunFailure(page, 404, 'history_run_not_found', 'S66');

const RESTART_GENERATION = 'findings-fixture-process:restart';
const withRestartGeneration = (payload) => ({ ...payload, analysis_generation: RESTART_GENERATION });
const withoutProcessGeneration = (payload) => {
  const copy = structuredClone(payload);
  delete copy.analysis_generation;
  return copy;
};

// STORY:finding-evidence-routing:S67
export const S67 = async (page) => {
  const eventRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/diagnose/carb-ratio-history/events') {
      eventRequests.push({
        historyId: url.searchParams.get('history_id'),
        generation: url.searchParams.get('analysis_generation'),
      });
    }
  });
  const firstResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/diagnose/carb-ratio-history/events' && response.status() === 200);
  await openHistoryEvents(page);
  const firstPayload = await (await firstResponse).json();
  const before = await state(page);

  await page.getByRole('button', { name: 'By clock', exact: true }).click();
  expectResponse(page, /\/api\/diagnose\/carb-ratio-history\/events/, 409);
  const restartedResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/diagnose/carb-ratio-history/events' && response.status() === 200);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  const restartedPayload = await (await restartedResponse).json();
  await settle(page, 700);
  const after = await state(page);

  is(after.history.id, before.history.id, 'S67 opaque history identity survives process restart');
  ok(after.history.generation !== before.history.generation,
    'S67 process restart publishes a distinct opaque generation');
  is(after.history.generation, RESTART_GENERATION, 'S67 replacement commits the restarted generation');
  is(withoutProcessGeneration(restartedPayload), withoutProcessGeneration(firstPayload),
    'S67 projected database bytes are unchanged apart from process generation');
  is(eventRequests.map((request) => request.historyId),
    eventRequests.map(() => before.history.id), 'S67 every request carries the unchanged history id');
  is(eventRequests.map((request) => request.generation),
    [before.history.generation, before.history.generation, RESTART_GENERATION],
    'S67 stale generation is rejected once, then the refreshed generation is requested');
  is(after.history.canvasGeneration, after.history.generation,
    'S67 restarted inspector/canvas pair commits coherently');
};

// STORY:finding-evidence-routing:S68
export const S68 = async (page) => {
  await openHistoryCase(page);
  await page.getByRole('button', { name: 'Afternoon', exact: true }).click();
  await settle(page, 60);
  await page.getByRole('button', { name: 'Morning', exact: true }).click();
  await settle(page, 1000);
  const s = await state(page);
  is(s.history.notice, null, 'S68 superseded out-of-scope response cannot land');
  is(s.history.canvasGeneration, s.history.generation, 'S68 newest coherent pair owns both panes');
};

// STORY:finding-evidence-routing:S69
export const S69 = async (page) => {
  await openHistoryCase(page);
  const event = page.getByRole('button', { name: 'By event', exact: true });
  await event.click();
  await settle(page, 60);
  await event.click();
  await settle(page, 950);
  const all = await state(page);
  is(all.history.runIds.length, 3, 'S69 newest all-runs response owns the pair');
  await page.locator('.history-run').nth(0).click();
  await settle(page, 60);
  await page.locator('.history-run').nth(1).click();
  await settle(page, 950);
  is((await state(page)).history.selectedRuns, [all.history.runIds[1]], 'S69 newest selected-run response wins whole');
};

// STORY:finding-evidence-routing:S70
export const S70 = async (page) => {
  await openHistoryEvents(page);
  const before = await state(page);
  await page.locator('.history-run').first().click();
  await settle(page, 650);
  const s = await state(page);
  is([s.history.canvasId, s.history.canvasGeneration, s.history.canvasRunId],
    [s.history.id, s.history.generation, s.history.selectedRunId], 'S70 rendered pair exposes identical coordinates');
  is(s.history.canvasRender.kind, 'event', 'S70 replacement remains the event canvas');
  is(s.history.canvasRender.window, before.history.canvasRender.window,
    'S70 run selection keeps the event window');
  is(s.history.canvasRender.series.length, before.history.canvasRender.series.length,
    'S70 run selection keeps the complete rendered event population');
  is(s.history.canvasRender.series.filter((series) => series.type === 'line' && series.opacity === 0.88).length,
    1, 'S70 selected-run content paints exactly one active trace');
  is(s.history.canvasRender.series.filter((series) => series.type === 'line' && series.opacity === 0.2).length,
    s.history.runIds.length - 1, 'S70 selected-run content quiets every other trace');
};

const historySafetyState = (page, draftWrites) => page.evaluate((writes) => {
  const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState;
  const planItems = setup?.planItems;
  const tab = setup?.tab?.value ?? setup?.tab ?? null;
  return {
    stageCalls: window.__diagnoseStageProbe?.calls ?? null,
    planDraftWrites: writes,
    planItems: Number.isFinite(planItems?.size) ? planItems.size : null,
    planBadge: document.querySelector('#plan-badge')?.dataset.count ?? null,
    tab,
    storedTab: localStorage.getItem('tab'),
    planCurrent: document.querySelector('[data-shell-tab="plan"]')?.getAttribute('aria-current') ?? null,
  };
}, draftWrites);

const assertHistorySafety = async (page, draftWrites, label) => {
  const safety = await historySafetyState(page, draftWrites);
  ok(Array.isArray(safety.stageCalls), `S71 ${label}: staging callback probe is installed`);
  is(safety.stageCalls, [], `S71 ${label}: callbacks.stage is not invoked`);
  is(safety.planDraftWrites, 0, `S71 ${label}: no Plan draft request is written`);
  is(safety.planItems, 0, `S71 ${label}: reactive Plan draft remains empty`);
  is(safety.planBadge, '0', `S71 ${label}: rendered Plan state remains empty`);
  is(safety.tab, 'diagnose', `S71 ${label}: app state remains on Diagnose`);
  is(safety.storedTab, 'diagnose', `S71 ${label}: persisted navigation remains on Diagnose`);
  is(safety.planCurrent, null, `S71 ${label}: Plan never becomes the current route`);
};

// STORY:finding-evidence-routing:S71
export const S71 = async (page) => {
  let draftWrites = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/plan' && request.method() !== 'GET') draftWrites += 1;
  });

  await assertHistorySafety(page, draftWrites, 'before interaction');
  await expandWatching(page);
  await page.locator('.qrow[data-state="history"]').first().click();
  await settle(page, 450);
  await assertHistorySafety(page, draftWrites, 'queue click/open');

  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await settle(page, 650);
  await assertHistorySafety(page, draftWrites, 'ALIGN switch to By event');
  await page.getByRole('button', { name: 'By clock', exact: true }).click();
  await settle(page, 250);
  await assertHistorySafety(page, draftWrites, 'ALIGN switch to By clock');

  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await settle(page, 650);
  await page.locator('.history-run').first().click();
  await settle(page, 650);
  await assertHistorySafety(page, draftWrites, 'member selection');

  expectResponse(page, /\/api\/diagnose\/carb-ratio-history\/events/, 500);
  await page.locator('.history-run').nth(1).click();
  await settle(page, 950);
  is((await state(page)).history.stale, false, 'S71 ordinary recovery succeeds once');
  await assertHistorySafety(page, draftWrites, 'ordinary recovery');

  expectResponse(page, /\/api\/diagnose\/carb-ratio-history\/events/, 409);
  await page.locator('.history-run').first().click();
  await settle(page, 950);
  is((await state(page)).history.generation, RESTART_GENERATION,
    'S71 coordinated recovery commits one coherent replacement generation');
  await assertHistorySafety(page, draftWrites, 'coordinated recovery');

  expectResponse(page, /\/api\/diagnose\/carb-ratio-history\/events/, 500);
  expectResponse(page, /\/api\/diagnose\/findings/, 500);
  await page.locator('.history-run').nth(1).click();
  await settle(page, 850);
  is((await state(page)).history.stale, true, 'S71 terminal recovery exposes explicit Retry');
  await assertHistorySafety(page, draftWrites, 'terminal recovery');

  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await settle(page, 950);
  const final = await state(page);
  is(final.history.stale, false, 'S71 explicit Retry resolves coherently');
  is(final.history.stageCount, 0, 'S71 no history state offers staging');
  await assertHistorySafety(page, draftWrites, 'explicit Retry');
};

/** S72 · The initial Diagnose frame offers no inert ALIGN control. */
// STORY:finding-evidence-routing:S72
export const S72 = async (page) => {
  const initial = await state(page);
  is(initial.alignShown, false, 'S72 ALIGN does not render on the initial frame');
  is(await page.locator('#seg-align button').count(), 0, 'S72 initial ALIGN has no choices');
};

const withNoDataBasal = (analysis) => {
  const next = structuredClone(analysis);
  Object.assign(next.basal[0], {
    safety_status: 'no data', days: 0, recommended: null, asserts_move: false,
    direction: null,
    estimate: { value: null, lo: null, hi: null, n: 0, wide: false },
    annotation: 'no nights of steady data at this time yet',
  });
  return next;
};

/** S73 · A non-asserting basal case file names the same verdict as its lane tile. */
// STORY:finding-evidence-routing:S73
export const S73 = async (page) => {
  const openVerdict = async (verdict) => {
    const cell = await page.evaluate((want) => {
      const buttons = [...document.querySelectorAll('#lane button')];
      const index = buttons.findIndex((button) => button.dataset.verdict === want);
      return index < 0 ? null : { index, ariaLabel: buttons[index].getAttribute('aria-label') };
    }, verdict);
    ok(cell, `S73 precondition: the lane holds a ${verdict} slot`);
    await page.click(`#lane button:nth-child(${cell.index + 1})`);
    await settle(page, 450);
    return {
      ariaLabel: cell.ariaLabel,
      head: await page.locator('#level .slot-head .verdict').textContent(),
    };
  };

  const noData = await openVerdict('nodata');
  is(noData.head?.trim(), 'no nights of steady data', 'S73 no-data head names its own verdict');
  ok(noData.head?.trim() !== 'insufficient evidence', 'S73 no-data head is not the thin-data verdict');
  ok(noData.ariaLabel.endsWith(noData.head.trim()), 'S73 no-data tile name ends with its head');

  const hold = await openVerdict('hold');
  is(hold.head?.trim(), 'holds at current', 'S73 hold head names its own verdict');
  ok(hold.ariaLabel.endsWith(hold.head.trim()), 'S73 hold tile name ends with its head');

  const insufficient = await openVerdict('insufficient');
  is(insufficient.head?.trim(), 'insufficient evidence', 'S73 thin-data head remains unchanged');
};

/** S74 · Watching evidence stays behind its disclosure until the reader asks for it. */
// STORY:finding-evidence-routing:S74
export const S74 = async (page) => {
  const toggle = page.locator('#level .qcollapse');
  ok(await toggle.isVisible(), 'S74 Watching control is present without a sift');
  ok(/^Watching · \d+ reads?$/.test(await toggle.innerText()), 'S74 Watching control names its reads');
  is(await page.locator('#level .qrow[data-state="held"], #level .qrow[data-state="blind"], #level .qrow[data-state="history"]').count(),
    0, 'S74 Watching rows stay collapsed by default');
  is(await page.locator('.uncaused-note').count(), 0, 'S74 RETIRED — uncaused-highs footer is absent');
  is(await page.locator('#level .quiet-line').count(), 0,
    'S74 action-ready rows keep the default queue out of the all-Watching empty state');
  await captureEvidence(page, 'S74-watching-collapsed-default');
  await toggle.click();
  ok(await page.locator('#level .qrow[data-state="held"], #level .qrow[data-state="blind"], #level .qrow[data-state="history"]').count() > 0,
    'S74 Watching rows appear after expansion');
};

/** S75 · An all-Watching window keeps its quiet line compact above the disclosure. */
// STORY:finding-evidence-routing:S75
export const S75 = async (page) => {
  const empty = page.locator('#level .quiet-line.sift-empty');
  is(await empty.innerText(), 'No pattern or setting asserts a direction in this window.',
    'S75 the all-Watching window retains the quiet reading');
  is(await page.evaluate(() => getComputedStyle(document.querySelector('#level .quiet-line')).minHeight), '0px',
    'S75 the quiet reading is compact when Watching follows it');
  const toggle = page.locator('#level .qcollapse');
  ok(await toggle.isVisible(), 'S75 Watching remains reachable below the quiet reading');
  ok(/^Watching · \d+ reads?$/.test(await toggle.innerText()), 'S75 Watching names its reads');
};

// STORY:finding-evidence-routing:S76
export const S76 = async (page) => {
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('level')?.dataset.loading === 'false');
  const row = page.locator('#level .qrow[data-id="finding:carb_undercount"]');
  const rowId = await row.getAttribute('data-id');
  await row.focus();
  await page.keyboard.press('Enter');
  is(await page.evaluate(() => document.activeElement?.id), 'level',
    'S76 Enter lands keyboard focus on the opened detail container');
  await page.getByRole('button', { name: 'Findings', exact: true }).click();
  is(await page.evaluate(() => document.activeElement?.getAttribute('data-id')), rowId,
    'S76 the Findings crumb restores focus to the drilled queue row');
};

/** S77 · ALIGN starts at the inspector edge when this factor case offers it. */
// STORY:finding-evidence-routing:S77
export const S77 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Over-treated low');
  const opened = await state(page);
  ok(opened.alignShown, 'S77 precondition: ALIGN is offered on this case file');
  const geometry = await page.evaluate(() => {
    const ag = document.querySelector('#align-group');
    const inspector = document.querySelectorAll('.panes > .pane')[1];
    if (!ag || !inspector || !ag.getClientRects().length) return null;
    return {
      alignLeft: Math.round(ag.getBoundingClientRect().left),
      inspectorLeft: Math.round(inspector.getBoundingClientRect().left),
    };
  });
  ok(geometry !== null, 'S77 precondition: ALIGN is rendered beside a live inspector pane');
  is(geometry.alignLeft, geometry.inspectorLeft,
    `S77 ALIGN starts at the inspector edge (ALIGN ${geometry.alignLeft}, inspector ${geometry.inspectorLeft})`);
};

/** S78 · Up/Down follow the vertical Occurrence roster, stop at its ends, and
    leave the Finding case file's standing navigation untouched. */
// STORY:finding-evidence-routing:S78
export const S78 = async (page) => {
  await page.click('#level .qrow[data-state="finding"]');
  await settle(page, 450);
  await page.click('#level .ev-row');
  await settle(page, 450);
  const first = await state(page);
  ok(/\b1 of \d+/.test(first.levelHead || ''), `S78 opens on the first Occurrence (${first.levelHead})`);
  await page.keyboard.press('ArrowDown');
  await settle(page, 450);
  const second = await state(page);
  ok(/\b2 of \d+/.test(second.levelHead || ''), `S78 ArrowDown steps one Occurrence (${second.levelHead})`);
  is(second.crumb.length, first.crumb.length, 'S78 stepping never changes the crumb depth');
  is(second.chip, first.chip, 'S78 stepping never moves the window');
  await page.keyboard.press('ArrowUp');
  await settle(page, 450);
  is((await state(page)).levelHead, first.levelHead, 'S78 ArrowUp steps back');
  await page.keyboard.press('ArrowUp');
  await settle(page, 300);
  is((await state(page)).levelHead, first.levelHead, 'S78 ArrowUp at the start does not wrap');
};

/** S79 · Occurrence activation and vertical stepping restore focus to the
    selected roster row after the asynchronous case-file paint. */
// STORY:finding-evidence-routing:S79
export const S79 = async (page) => {
  await page.click('#level .qrow[data-state="finding"]');
  await settle(page, 450);
  const first = page.locator('#level .case-occurrence').first();
  await first.focus();
  await page.keyboard.press('Enter');
  await settle(page, 450);
  const selectedId = await page.locator('#level .case-occurrence[aria-pressed="true"]')
    .getAttribute('data-occurrence-id');
  is(await page.evaluate(() => document.activeElement?.getAttribute('data-occurrence-id')), selectedId,
    'S79 activation restores focus to the selected Occurrence');
  await page.keyboard.press('ArrowDown');
  await settle(page, 450);
  const nextId = await page.locator('#level .case-occurrence[aria-pressed="true"]')
    .getAttribute('data-occurrence-id');
  is(await page.evaluate(() => document.activeElement?.getAttribute('data-occurrence-id')), nextId,
    'S79 vertical stepping restores focus to the newly selected Occurrence');
};

/** S80 · Event-chart cursor focus owns its Up/Down keys and never steps the
    surrounding Occurrence roster. */
// STORY:finding-evidence-routing:S80
export const S80 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Carb undercount');
  await page.click('#seg-align button:nth-child(2)');
  await page.locator('#ec-chart').waitFor();
  await settle(page, 600);
  await page.click('#level .ev-row');
  await settle(page, 800);
  const before = await state(page);
  const selected = async () => page.locator('#level .case-occurrence[aria-pressed="true"]')
    .getAttribute('data-occurrence-id');
  const selectedId = await selected();
  await page.locator('#ec-chart').focus();
  await page.keyboard.press('ArrowUp');
  await settle(page, 300);
  is((await state(page)).levelHead, before.levelHead, 'S80 chart ArrowUp leaves the selection unchanged');
  is(await selected(), selectedId, 'S80 chart ArrowUp leaves the pressed row unchanged');
  await page.keyboard.press('ArrowDown');
  await settle(page, 300);
  is((await state(page)).levelHead, before.levelHead, 'S80 chart ArrowDown leaves the selection unchanged');
  is(await selected(), selectedId, 'S80 chart ArrowDown leaves the pressed row unchanged');
};

/** S81 · Choosing a rendered Occurrence keeps the reader's place on that row. */
// STORY:finding-evidence-routing:S81
export const S81 = async (page) => {
  await page.click('#level .qrow[data-state="finding"]');
  await settle(page, 450);
  const rows = page.locator('#level .case-occurrence');
  ok(await rows.count() >= 2, 'S81 precondition: the case file renders at least two Occurrences');
  const occurrenceId = await rows.nth(1).getAttribute('data-occurrence-id');
  await rows.nth(1).click();
  await settle(page, 450);
  await page.waitForSelector(`#level .case-occurrence[data-occurrence-id="${occurrenceId}"][aria-pressed="true"]`);
  const active = await page.evaluate(() => ({
    occurrenceId: document.activeElement?.dataset?.occurrenceId,
    tagName: document.activeElement?.tagName,
  }));
  is(active.occurrenceId, occurrenceId,
    `S81 direct selection restores focus to the chosen Occurrence (${active.tagName})`);
  is((await state(page)).crumb.length, 2, 'S81 direct selection keeps the case-file crumb depth');
};

/** S82 · A fresh draw crosses 24:00 to the right. */
// STORY:finding-evidence-routing:S82
export const S82 = async (page) => {
  await beginFreshDraw(page);
  const b = await plot(page);
  const during = await panThenAim(page, { x: chartXAt(b, 22 * 60) }, 'right',
    { past: 180, aim: 24 * 60 + 2 * 60 });
  ok(during.panOffset > 0, 'S82 the day pans left under the right boundary');
  is(during.chip, 'Window 22:00–02:00', 'S82 the draw reads its wrapped window before release');
  await captureEvidence(page, 'S82-mid-pan-right');
  await page.mouse.up();
  await settle(page, 500);
  is((await state(page)).chip, 'Window 22:00–02:00', 'S82 draw right commits across midnight');
};

/** S83 · A fresh draw crosses 00:00 to the left. */
// STORY:finding-evidence-routing:S83
export const S83 = async (page) => {
  await beginFreshDraw(page);
  const b = await plot(page);
  const during = await panThenAim(page, { x: chartXAt(b, 3 * 60) }, 'left',
    { past: 120, aim: -60 });
  ok(during.panOffset < 0, 'S83 the day pans right under the left boundary');
  is(during.chip, 'Window 23:00–03:00', 'S83 the draw reads its wrapped window before release');
  await captureEvidence(page, 'S83-mid-pan-left');
  await page.mouse.up();
  await settle(page, 500);
  is((await state(page)).chip, 'Window 23:00–03:00', 'S83 draw left commits across midnight');
};

/** S84 · The start grip crosses 00:00 while its far endpoint stays anchored. */
// STORY:finding-evidence-routing:S84
export const S84 = async (page) => {
  const before = await state(page);
  const grip = await page.locator('#grip-a').boundingBox();
  const during = await panThenAim(page,
    { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 },
    'left', { past: 120, aim: -60 });
  ok(during.panOffset < 0, 'S84 the start grip reaches its target through a leftward pan');
  is(during.chip, 'Window 23:00–04:45', 'S84 the grip reads its wrapped window before release');
  await page.mouse.up();
  await settle(page, 500);
  const after = await state(page);
  is(after.chip, 'Window 23:00–04:45', 'S84 start grip commits across midnight');
  near(after.gripB, before.gripB, 1, 'S84 the far endpoint remains anchored');
};

/** S85 · The end grip crosses 24:00 while its far endpoint stays anchored. */
// STORY:finding-evidence-routing:S85
export const S85 = async (page) => {
  await drawInside(page, 20 * 60, 22 * 60);
  const before = await state(page);
  const grip = await page.locator('#grip-b').boundingBox();
  const during = await panThenAim(page,
    { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 },
    'right', { past: 120, aim: 24 * 60 + 60 });
  is(during.chip, 'Window 20:00–01:00', 'S85 the grip reads its wrapped window before release');
  await page.mouse.up();
  await settle(page, 500);
  const after = await state(page);
  is(after.chip, 'Window 20:00–01:00', 'S85 end grip commits across midnight');
  near(after.gripA, before.gripA, 1, 'S85 the far endpoint remains anchored');
};

/* S86 and S87 are each other's mirror: the same 2h window, grabbed the same 60
   minutes in, carried the same three hours onto the neighbouring day's 24:00 and
   00:00. Both must land the identical wrapped window. */

/** S86 · Sliding right crosses 24:00 without changing the window's length. */
// STORY:finding-evidence-routing:S86
export const S86 = async (page) => {
  await drawInside(page, 20 * 60, 22 * 60);
  const b = await plot(page);
  const during = await panThenAim(page, { x: chartXAt(b, 21 * 60) }, 'right',
    { past: 120, aim: 24 * 60 });
  ok(during.panOffset > 0, 'S86 the slide reaches its target through a rightward pan');
  is(during.live, ['brace-a', 'brace-b'], 'S86 both slide edges stay live');
  await page.mouse.up();
  await settle(page, 500);
  is((await state(page)).chip, 'Window 23:00–01:00', 'S86 slide right commits across midnight');
};

/** S87 · Sliding left crosses 00:00 without changing the window's length. */
// STORY:finding-evidence-routing:S87
export const S87 = async (page) => {
  await drawInside(page, 2 * 60, 4 * 60);
  const b = await plot(page);
  const during = await panThenAim(page, { x: chartXAt(b, 3 * 60) }, 'left',
    { past: 120, aim: 0 });
  ok(during.panOffset < 0, 'S87 the slide reaches its target through a leftward pan');
  is(during.live, ['brace-a', 'brace-b'], 'S87 both slide edges stay live');
  await page.mouse.up();
  await settle(page, 500);
  is((await state(page)).chip, 'Window 23:00–01:00', 'S87 slide left commits across midnight');
};

/** S88 · Draw's one-day stop commits the unscoped day and restores the axis. */
// STORY:finding-evidence-routing:S88
export const S88 = async (page) => {
  await beginFreshDraw(page);
  const b = await plot(page);
  const during = await holdUntilStop(page,
    { x: chartXAt(b, 20 * 60) }, 'right', 'Whole day');
  ok(during.panOffset > 0, 'S88 full-day stop is reached through the pan');
  await captureEvidence(page, 'S88-full-day-stop');
  await page.mouse.up();
  await settle(page, 500);
  const after = await state(page);
  is(after.chip, null, 'S88 whole day is not retained as a 24-hour drawn window');
  is(after.pressed, ['24 h'], 'S88 whole day commits the unscoped day');
  is(after.panOffset, 0, 'S88 the axis returns to 00:00–24:00 on release');

  await drawInside(page, 20 * 60, 22 * 60);
  const grip = await page.locator('#grip-b').boundingBox();
  await holdUntilStop(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 },
    'right', 'Whole day');
  await page.mouse.up();
  await settle(page, 500);
  const resized = await state(page);
  is(resized.chip, null, 'S88 a full-day resize is not retained as a 24-hour window');
  is(resized.pressed, ['24 h'], 'S88 a full-day resize commits the unscoped day');
};

/** S89 · A full-day slide returns to its own start, preserving its duration. */
// STORY:finding-evidence-routing:S89
export const S89 = async (page) => {
  await drawInside(page, 20 * 60, 22 * 60);
  const before = await state(page);
  const b = await plot(page);
  await page.mouse.move(chartXAt(b, 21 * 60), b.y + b.h * 0.45);
  await page.mouse.down();
  await page.mouse.move(b.x + b.w - 39, b.y + b.h * 0.45, { steps: 8 });
  await page.waitForFunction(() => Number(document.getElementById('chart').parentElement
    .dataset.clockPan || 0) >= 1274, null, { timeout: 7000 });
  await page.mouse.up();
  await settle(page, 500);
  const after = await state(page);
  is(after.chip, before.chip, 'S89 a one-day slide lands back on its own start');
  near(after.gripB - after.gripA, before.gripB - before.gripA, 2,
    'S89 a one-day slide preserves its length');
  is(after.panOffset, 0, 'S89 the axis returns after the slide');
};

/** S33 · #58 — while the event canvas is mounted, its own header is the only
    canvas header on screen. The clock canvas's header used to stay mounted
    underneath and print the clock window over an event-aligned chart. */
// STORY:finding-evidence-routing:S33
export const S33 = async (page) => {
  await clickQueueRow(page, 'Over-treated low');
  const clock = await state(page);
  ok(clock.clockHead, 'S33 precondition: the clock canvas header is up');
  is(clock.canvasHead.title, 'Glucose by time of day', 'S33 precondition: By clock owns the shared title');
  is(clock.eventHeads, 0, 'S33 precondition: no event header yet');
  const originalRect = clock.canvasHead;
  const clockChart = await page.locator('#chart').boundingBox();
  await page.mouse.move(clockChart.x + clockChart.width * .45, clockChart.y + clockChart.height * .5);
  await settle(page);
  is((await state(page)).canvasHead.hover, '1', 'S33 By clock pointer opens its readout in the shared header');
  await page.mouse.move(1, 1); await settle(page);
  is((await state(page)).canvasHead.hover, '0', 'S33 By clock pointer restores its title');
  await page.click('#seg-align button:nth-child(2)');
  await page.locator('.ec-surface').waitFor();
  await settle(page, 600);
  const event = await state(page);
  is(event.alignPressed, ['By event'], 'S33 the reader is on By event');
  is(event.clockHeadDisplay, 'grid', 'S33 the shared header remains rendered');
  ok(event.clockHead, 'S33 the shared header remains on screen');
  is(event.eventHeads, 0, 'S33 no nested event header remains');
  is(event.canvasHead, { ...originalRect, title: 'Over-treated low response comparison', label: 'Over-treated low', hover: '0' }, 'S33 By event replaces the exact shared header rectangle and finding label');
  is(event.eventCaption, null, "S33 RETIRED 2026-08-20 Connor Griffin: Drop all that shit. It's a chart.");
  is(event.clockCanvas, false, 'S33 the clock canvas is not left drawn underneath');
  const eventChart = await page.locator('#ec-chart').boundingBox();
  await page.mouse.move(eventChart.x + eventChart.width * .45, eventChart.y + eventChart.height * .5);
  await settle(page);
  const hovered = await state(page);
  is(hovered.canvasHead.hover, '1', 'S33 event pointer swaps the shared header to its readout');
  await page.mouse.move(1, 1); await settle(page);
  const restored = await state(page);
  is(restored.canvasHead.hover, '0', 'S33 event pointer restores the shared header');
  is(restored.canvasHead.title, 'Over-treated low response comparison', 'S33 event pointer restores the comparison title');
  await page.click('#seg-align button:nth-child(1)');
  await settle(page, 500);
  const back = await state(page);
  ok(back.clockHead, 'S33 By clock puts its own header back');
  is(back.canvasHead, { ...originalRect, title: 'Glucose by time of day', hover: '0' }, 'S33 By clock restores the original shared header rectangle');
  const restoredClockChart = await page.locator('#chart').boundingBox();
  await page.mouse.move(restoredClockChart.x + restoredClockChart.width * .45, restoredClockChart.y + restoredClockChart.height * .5);
  await settle(page);
  is((await state(page)).canvasHead.hover, '1', 'S33 restored By clock pointer opens its readout in the shared header');
  await page.mouse.move(1, 1); await settle(page);
  const restoredClock = await state(page);
  is(restoredClock.canvasHead.hover, '0', 'S33 restored By clock pointer restores its title');
  is(restoredClock.canvasHead.title, 'Glucose by time of day', 'S33 restored By clock title returns after hover');
  is(restoredClock.eventCaption, null, "S33 RETIRED 2026-08-20 Connor Griffin: Drop all that shit. It's a chart.");
  is(back.eventCanvas, false, 'S33 ... and takes the event canvas down');
};

/** S34 · A failed by-event fetch restores the clock canvas and leaves the
    reader on the finding. Before #62 the clock canvas was hidden BEFORE the
    fetch and the catch arm hid the event host, so a failed first fetch showed
    neither canvas at all. */
// STORY:finding-evidence-routing:S34
export const S34 = async (page) => {
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settle(page, 450);
  const originalClock = await state(page);
  const originalRect = originalClock.canvasHead;
  await clickQueueRow(page, 'Correction stacking');
  await page.waitForFunction(() => document.querySelector('#seg-align button[aria-pressed="true"]')?.textContent.trim() === 'By clock');
  await page.locator('#chart:not([hidden])').waitFor();
  const byEventRequests = [];
  const observeCaseRequest = (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/diagnose/finding-case-file') {
      byEventRequests.push(url.searchParams.get('alignment'));
    }
  };
  page.on('request', observeCaseRequest);
  expectResponse(page, /^\/api\/diagnose\/finding-case-file$/, 500);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await settle(page, 900);
  page.off('request', observeCaseRequest);
  const after = await state(page);
  is(byEventRequests, ['event'], 'S34 failure makes one By-event request and no hidden clock retry');
  is(await page.locator('#level [role="alert"]').innerText(),
    'Synthetic event projection failure.', 'S34 names the failed event request');
  is(after.eventCanvas, false, 'S34 the failed event canvas is not left mounted');
  ok(after.clockCanvas, 'S34 the clock canvas is restored');
  ok(after.clockHead, 'S34 ... with its own header');
  is(after.canvasHead, { ...originalRect, title: 'Glucose by time of day', hover: '0' }, 'S34 failed projection restores the original clock header rectangle and title');
  is(after.eventCaption, null, "S34 RETIRED 2026-08-20 Connor Griffin: Drop all that shit. It's a chart.");
  const recoveredChart = await page.locator('#chart').boundingBox();
  await page.mouse.move(recoveredChart.x + recoveredChart.width * .45, recoveredChart.y + recoveredChart.height * .5);
  await settle(page);
  is((await state(page)).canvasHead.hover, '1', 'S34 recovered clock pointer opens its readout');
  await page.mouse.move(1, 1); await settle(page);
  const recovered = await state(page);
  is(recovered.canvasHead.hover, '0', 'S34 recovered clock pointer restores its title');
  is(recovered.canvasHead.title, 'Glucose by time of day', 'S34 recovered clock title returns after hover');
  is(after.crumb[after.crumb.length - 1], 'Correction stacking', 'S34 the reader is left on the finding');
  ok(/^window [\d,]+ of [\d,]+ readings$/.test(after.scope),
    `S34 the restored canvas states its own window (${after.scope})`);
};

/** S35 · A finding whose episodes span two families shows ONE family in the
    panel and the chart alike. Framing on whichever family held more episodes
    put a list of one kind beside a chart of the other, with evidence keys that
    cannot even be joined; the family the event view names wins now. */
// STORY:finding-evidence-routing:S35
export const S35 = async (page) => {
  await clickQueueRow(page, 'Carb undercount');
  const framed = await state(page);
  ok(/·\s*meals$/.test(framed.levelWho || ''),
    `S35 the panel frames on the family the event view names (${framed.levelWho})`);
  ok(/\bmeal responses\b/.test(framed.levelStat || ''),
    `S35 ... and counts that family, not the larger one (${framed.levelStat})`);
  await page.click('#seg-align button:nth-child(2)');
  await page.locator('.ec-surface').waitFor();
  await settle(page, 600);
  const view = await page.evaluate(() =>
    window.__diagnoseEventComparison?.projection?.family ?? null);
  is(view, 'meals', 'S35 the chart draws the same family the panel listed');
};

/** S36 · Narrowing the window until the open finding has no row leaves the
    reader ON it, with both panes saying so. The alternative was a browser-side
    fallback filter, which is the third membership rule this change retires. */
// STORY:finding-evidence-routing:S36
export const S36 = async (page) => {
  await clickQueueRow(page, 'Late bolus');
  const opened = await state(page);
  is(opened.crumb[opened.crumb.length - 1], 'Late bolus', 'S36 precondition: the finding is open');
  ok(opened.levelStat !== null, 'S36 precondition: the case file has a population');
  await page.click('#seg-window button:nth-child(1)');   // Overnight
  await settle(page, 900);
  const narrowed = await state(page);
  is(narrowed.pressed, ['Window 00:00–06:00'], 'S36 the server case owns the narrowed window');
  is(narrowed.crumb[narrowed.crumb.length - 1], 'Late bolus', 'S36 the reader stays on the finding');
  ok(/meal responses in 00:00–06:00/.test(narrowed.levelStat || ''),
    `S36 the replacement case and inspector share the server window (${narrowed.levelStat})`);
  ok(!/0 of 0/.test(JSON.stringify(narrowed)), 'S36 no fabricated empty frame replaces it');
};

/** S37 · An occurrence whose TRIGGER sits outside the window and whose
    CONSEQUENCE landed inside it appears in both panes. This is the shape the
    old browser filter dropped: it kept an occurrence by its own clock minute,
    so a meal bolused at 13:00 whose high landed at 14:35 was in-window for the
    server and out for the reader. */
// STORY:finding-evidence-routing:S37
export const S37 = async (page) => {
  const opening = await state(page);
  is(opening.pressed, ['Overnight'], 'S37 precondition: opens on the Overnight preset');
  await drawWindow(page, [840, 960], [0, 360]);
  const drawnWindow = await state(page);
  is(drawnWindow.chip, 'Window 14:00–16:00', `S37 the reader drew 14:00–16:00 (${drawnWindow.chip})`);
  await clickQueueRow(page, 'Late bolus');
  const panel = await state(page);
  ok(/\b1 of 10 meal responses in 14:00–16:00 · 9 not attributed\b/.test(panel.levelStat || ''),
    `S37 the panel renders the retained server population (${panel.levelStat})`);
  await page.click('#seg-align button:nth-child(2)');
  await page.locator('.ec-surface').waitFor();
  await settle(page, 700);
  const chart = await page.evaluate(() => {
    const projection = window.__diagnoseEventComparison?.projection;
    return {
      label: projection?.window?.label ?? null,
      scoped: projection?.window?.scoped ?? null,
      denominator: projection?.summary?.denominator ?? null,
      caption: document.querySelector('.ec-window-context')?.textContent.trim() ?? null,
    };
  });
  is(chart.scoped, true, 'S37 the projection answered for a scoped window');
  is(chart.label, '14:00–16:00', 'S37 the chart counted the reader\'s own window');
  is(chart.denominator, 10, 'S37 ... and renders the same server population as the panel');
  is(chart.caption, null, "S37 RETIRED 2026-08-20 Connor Griffin: Drop all that shit. It's a chart.");
};


/** S38 · When a replacement window retains the open Finding but its separate
    Findings projection loses the canonical event family, the retained case
    preparation continues to own its inspectable By-event path. */
// STORY:finding-evidence-routing:S38
export const S38 = async (page) => {
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settle(page, 450);
  await page.getByRole('button', { name: /Filter/ }).click();
  await page.getByRole('menuitemradio', { name: 'Event charts', exact: true }).click();
  await page.keyboard.press('Escape');
  await clickQueueRow(page, 'Correction on active insulin');
  await page.waitForFunction(() => document.querySelector('#seg-align button[aria-pressed="true"]')?.textContent.trim() === 'By event');
  await page.locator('#align-canvas:not([hidden])').waitFor();
  is((await state(page)).alignPressed, ['By event'], 'S38 precondition: direct entry owns the event canvas');
  await page.getByRole('button', { name: 'Morning', exact: true }).click();
  await settle(page, 900);
  const narrowed = await state(page);
  is(narrowed.pressed, ['Morning'], 'S38 the replacement projection is Morning');
  is(narrowed.crumb[narrowed.crumb.length - 1], 'Correction on active insulin',
    'S38 the retained Finding remains open after its separate projection changes');
  ok(narrowed.levelStat !== null, 'S38 the replacement projection still publishes the Finding');
  is(narrowed.alignShown, true, 'S38 server-owned ALIGN remains available after the projection loses its coordinate');
  is(narrowed.alignPressed, ['By event'], 'S38 the retained case stays on its server-owned By-event path');
  is(narrowed.clockCanvas, false, 'S38 By clock does not replace the coherent retained event canvas');
  is(narrowed.eventCanvas, true, 'S38 the coherent event canvas remains or reloads with the retained preparation');
  await page.keyboard.press('Backspace');
  const filtered = await state(page);
  ok((await state(page)).queue.some((row) => row.title === 'Correction on active insulin'),
    'S38 Event charts keeps the inspectable row reachable through its retained preparation');
};

/** S39 · A window change ASKS the server for its rows, and until they land the
    pane counts nothing rather than counting the window that just left. Showing
    the previous population under the new window's label is a caption asserting
    a population the canvas did not draw. */
// STORY:finding-evidence-routing:S39
export const S39 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Late bolus');
  const before = await state(page);
  ok(/\b1 of 10 meal responses in 24 h · 9 not attributed\b/.test(before.levelStat || ''),
    `S39 precondition: the whole-day population is on screen (${before.levelStat})`);
  await page.click('#seg-window button:nth-child(3)');   // Afternoon
  await settle(page, 250);                               // inside the flight
  const during = await state(page);
  is(during.levelLoading, 'true', 'S39 the pane declares it is waiting on the server');
  is(during.levelStat, null, "S39 the previous window's counts are withdrawn");
  is(during.levelEmpty, 'Loading findings for 12:00–18:00…',
    'S39 the pane names what is loading and its window');
  is(during.crumbMeta, '12:00–18:00', 'S39 the meta prints the window with no numbers under it');
  ok(!/\b2 of 20\b/.test(JSON.stringify(during)), 'S39 no stale count survives anywhere on the pane');
  await settle(page, 1400);
  const after = await state(page);
  is(after.levelLoading, 'false', 'S39 the wait ends when the rows land');
  ok(/ meal responses in 12:00–18:00\b/.test(after.levelStat || ''),
    `S39 the new window's own counts land under its own label (${after.levelStat})`);
};

const historyDisposition = (disposition, message) => (body) => ({
  ...body,
  rows: body.rows.filter((row) => row.register !== 'history'),
  selection: { id: body.selection.id, disposition, message },
});
const contradictoryHistoryDisposition = (disposition, message) => (body) => ({
  ...body,
  selection: { id: body.selection.id, disposition, message },
});
const missingRowsDisposition = (disposition, message) => (body) => {
  const next = { ...body, selection: { id: body.selection.id, disposition, message } };
  delete next.rows;
  return next;
};

const thinHistoryInputs = (inputs) => {
  const copy = structuredClone(inputs);
  const history = copy.analysis.ic_history.find((row) => row.lifecycle === 'active');
  history.support = 1;
  history.estimate = { ...history.estimate, value: 6, lo: 4, hi: 8, n: 1, wide: true };
  return copy;
};

/* The issue #81 story ids collided with ticket 10's already-frozen S41-S71
   during this merge. Keep their executable regressions as issue-scoped browser
   probes; they are deliberately not new entries in the 74-story contract. */
/** S41 · #81 — a replacement findings window owns the entire inspector while
    its server projection is unresolved. The old queue, parameter detail,
    support, staging controls, and counts never borrow the new clock label; a
    superseded response cannot paint after a newer window settles. */
export const issue81PendingProjection = async (page) => {
  await page.click('#seg-window button:nth-child(1)');   // Overnight, contains 05:30
  await page.waitForFunction(() => document.getElementById('level')?.dataset.loading === 'false');
  await page.getByRole('button', { name: /Filter/ }).click();
  await page.getByRole('menuitemcheckbox', { name: /^Lows / }).click();
  const siftChecked = (await state(page)).filter.sift.map((button) => button.checked);
  await page.keyboard.press('Escape');
  await clickQueueRow(page, 'Basal 05:30 · raise');
  const opened = await state(page);
  ok(opened.levelText.includes('Recommended'), 'S41 precondition: the morning basal detail is open');
  ok(opened.stage !== null, 'S41 precondition: the morning basal change can be staged');

  await drawWindow(page, [900, 1260], [330, 360]);      // 15:00–21:00, delayed
  const pending = await state(page);
  is(pending.levelLoading, 'true', 'S41 the replacement declares loading at setting depth');
  is(pending.levelText, 'Loading findings for 15:00–21:00…',
    'S41 names what is loading and the arriving range');
  is(pending.levelEmptyLeft, pending.crumbLeft,
    'S41 the loading line lands on the inspector content spine');
  is(pending.crumbMeta, '15:00–21:00', 'S41 the crumb carries the arriving range without counts');
  is(pending.stage, null, 'S41 the previous staging control is withdrawn');
  is(pending.filter.visible, false, 'S41 Filter stays hidden at setting depth');
  is(pending.filter.sift.map((button) => button.checked), siftChecked,
    'S41 retained Sift selection survives the replacement');
  ok(pending.filter.sift.every((button) => !button.disabled), 'S41 retained Sift controls remain enabled');

  await settle(page, 900);
  const absent = await state(page);
  is(absent.levelLoading, 'false', 'S41 the matching projection settles');
  is(absent.levelText, 'No findings in the selected window',
    'S41 the open basal depth stays put and reports its settled absence');
  is(absent.crumbMeta, '15:00–21:00', 'S41 settled absence keeps the selected range in the crumb');
  is(absent.stage, null, 'S41 settled absence has no staging control');

  await page.click('#crumb-trail button');               // Findings
  await settle(page, 250);
  await page.getByRole('button', { name: /Filter/ }).click();
  await page.getByRole('menuitemcheckbox', { name: /^Lows / }).click();
  await page.keyboard.press('Escape');
  await expandWatching(page);
  const queue = await state(page);
  ok(queue.queue.some((row) => row.title === 'Basal 19:30 to 21:00'),
    'S41 the settled queue contains the server-published evening basal row');
  ok(!queue.queue.some((row) => row.title === 'Basal 05:30 · raise'),
    'S41 the settled queue excludes the morning basal row');

  await page.click('#seg-window button:nth-child(3)');   // Afternoon, delayed longer
  await settle(page, 100);
  const eveningResponse = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname === '/api/diagnose/finding-case-file-preparation'
      && url.searchParams.get('start_min') === '1080';
  });
  await page.click('#seg-window button:nth-child(4)');   // Evening, settles first
  await eveningResponse;
  await settle(page, 100);
  await expandWatching(page);
  const newest = await state(page);
  is(newest.pressed, ['Evening'], 'S41 the newest window settles first');
  is(newest.levelLoading, 'false', 'S41 the newest response settles the inspector');
  ok(newest.queue.some((row) => row.title === 'Basal 19:30 to 21:00'),
    'S41 the newest response paints its server rows');
  ok(!newest.queue.some((row) => row.title === 'Basal 12:30 to 14:00 · leaning lower'),
    'S41 no superseded afternoon row painted');
  await settle(page, 1100);                              // let superseded response arrive
  await expandWatching(page);
  const afterStale = await state(page);
  is(afterStale.pressed, ['Evening'], 'S41 the superseded response cannot move the window');
  const rowIdentity = (rows) => rows.map(({ title, register, tier }) => ({ title, register, tier }));
  is(rowIdentity(afterStale.queue), rowIdentity(newest.queue),
    'S41 the superseded response cannot replace the newest rows');

  await page.click('#seg-window button:nth-child(3)');   // leave loaded Evening
  await settle(page, 100);                              // Afternoon remains in flight
  await page.click('#seg-window button:nth-child(4)');   // return to loaded Evening
  await settle(page, 100);
  await expandWatching(page);
  const returned = await state(page);
  is(returned.levelLoading, 'false', 'S41 returning to the loaded window settles immediately');
  is(returned.pressed, ['Evening'], 'S41 the loaded window remains selected after the return');
  is(rowIdentity(returned.queue), rowIdentity(newest.queue),
    'S41 returning to the loaded window restores its rows without a refetch');
  await settle(page, 1100);                              // let abandoned Afternoon resolve
  const afterReturnStale = await state(page);
  is(afterReturnStale.levelLoading, 'false', 'S41 the abandoned response cannot unsettle the loaded window');
  is(rowIdentity(afterReturnStale.queue), rowIdentity(newest.queue),
    'S41 the abandoned response cannot replace the restored loaded rows');
};

/** S42 · #81 — a failed scoped projection leaves the selected clock window
    standing but withdraws every advisory claim from the prior population. The
    reader can choose another window and settle normally. */
export const issue81FailedProjection = async (page) => {
  await page.click('#seg-window button:nth-child(1)');   // first scoped load succeeds
  await page.waitForFunction(() => document.getElementById('level')?.dataset.loading === 'false');
  await page.getByRole('button', { name: /Filter/ }).click();
  await page.getByRole('menuitemcheckbox', { name: /^Lows / }).click();
  const siftChecked = (await state(page)).filter.sift.map((button) => button.checked);
  await page.keyboard.press('Escape');
  await clickQueueRow(page, 'Basal 05:30 · raise');
  const failedResponse = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return candidate.status() === 500
      && url.pathname === '/api/diagnose/finding-case-file-preparation';
  });
  await drawWindow(page, [900, 1260], [330, 360]);      // only this scoped load fails
  await failedResponse;
  await settle(page, 150);
  const detail = await state(page);
  is(detail.levelLoading, 'false', 'S42 failure is not presented as an endless load');
  is(detail.levelText,
    'Findings unavailable for 15:00–21:00. Choose another window to try again.',
    'S42 setting depth renders the exact unavailable state');
  is(detail.crumbMeta, '15:00–21:00', 'S42 failed setting depth keeps only the selected range');
  is(detail.stage, null, 'S42 failed setting depth has no prior staging control');
  is(detail.filter.visible, false, 'S42 Filter stays hidden at setting depth');
  is(detail.filter.sift.map((button) => button.checked), siftChecked,
    'S42 failed retained Sift selection survives the replacement');
  ok(detail.filter.sift.every((button) => !button.disabled), 'S42 retained Sift controls remain enabled');

  await page.click('#crumb-trail button');               // Findings
  await settle(page, 100);
  const queue = await state(page);
  is(queue.levelText,
    'Findings unavailable for 15:00–21:00. Choose another window to try again.',
    'S42 queue depth renders the same unavailable state');
  is(queue.queue, [], 'S42 queue depth exposes no previous rows');
  is(queue.filter.visible, true, 'S42 Filter returns at queue depth');
  is(queue.filter.sift.map((button) => button.text), ['Highs', 'Lows', 'Meals', 'Corrections'],
    'S42 failed root Sift labels carry no prior projection counts');
  is(queue.filter.sift.map((button) => button.checked), siftChecked,
    'S42 root restores the failed selection');

  await page.getByRole('button', { name: /Filter/ }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Lows', exact: true }).click();
  await page.keyboard.press('Escape');
  const recoveryResponse = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return candidate.status() === 200
      && url.pathname === '/api/diagnose/finding-case-file-preparation'
      && url.searchParams.get('start_min') === '1080';
  });
  await page.click('#seg-window button:nth-child(4)');   // another window retries normally
  await recoveryResponse;
  await settle(page, 100);
  await expandWatching(page);
  const recovered = await state(page);
  is(recovered.levelLoading, 'false', 'S42 a later window settles after failure');
  is(recovered.pressed, ['Evening'], 'S42 recovery keeps the later selected window');
  ok(recovered.queue.some((row) => row.title === 'Basal 19:30 to 21:00'),
    'S42 recovery paints the later window\'s server rows');
};

/** S43 · #81 review — a settled slice keeps its own matching findings rather
    than proving exclusion only through an empty state. The same server-owned
    projection now publishes eight whole-day rows and three rows for 04:30–06:00,
    including ticket 10's server-published Morning history row in both scopes. */
export const issue81SlicedProjection = async (page) => {
  await page.click('#seg-window button:nth-child(5)');   // 24 h
  await page.waitForFunction(() => document.getElementById('level')?.dataset.loading === 'false');
  await settle(page, 150);                              // the level's 90 ms swap has landed
  await expandWatching(page);
  const wholeDay = await state(page);
  is(wholeDay.crumbMeta, '7 findings · 30 days', 'S43 whole day meta counts visible action-ready findings');
  is(wholeDay.queue.length, 8, 'S43 whole day renders all eight server rows');

  await page.click('#seg-window button:nth-child(1)');   // Overnight, 00:00–06:00
  await page.waitForFunction(() => document.getElementById('level')?.dataset.loading === 'false');
  await resizeWindowStart(page, 330, [0, 360]);          // minimum-width 04:30–06:00 slice
  await page.waitForFunction(() => document.getElementById('level')?.dataset.loading === 'false');
  await expandWatching(page);
  const sliced = await state(page);
  is(sliced.chip, 'Window 04:30–06:00', 'S43 the public brace lands on the intended slice');
  is(sliced.crumbMeta, '1 in this window', 'S43 the slice meta counts its visible action-ready finding');
  is(sliced.queue.map((row) => row.title),
    ['Basal 05:30 · raise', 'ISF', 'Carb ratio Morning. Past setting.'],
    'S43 the slice keeps exactly its three server-published findings');
  ok(!sliced.queue.some((row) => row.title === 'Basal 00:30 to 01:30 · raise'),
    'S43 the slice excludes an unrelated whole-day basal row');
  is(sliced.queueLeft, wholeDay.queueLeft,
    'S43 the sliced queue stays on the same inspector content spine');
};

/** #86 probe — one 30px Findings header owns the visible trail, metadata and
    root-only Filter menu; the retired Inspector label and second crumb row are
    absent. The menu uses roving focus and Escape restores its trigger. */
export const issue86HeaderFilter = async (page) => {
  const head = await page.evaluate(() => ({
    paneName: document.querySelector('.inspector')?.getAttribute('aria-labelledby'),
    trail: document.getElementById('crumb-trail')?.textContent.trim(),
    height: Math.round(document.querySelector('.inspector > header')?.getBoundingClientRect().height || 0),
    inspectorText: [...document.querySelectorAll('.inspector h2')]
      .some((node) => node.textContent.trim() === 'Inspector'),
  }));
  is(head, { paneName: 'crumb-trail', trail: 'Findings', height: 30, inspectorText: false },
    '#86 one Findings header owns the pane name and 30px seam');
  const trigger = page.getByRole('button', { name: /Filter/ });
  await trigger.click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Highs '));
  const roles = await page.locator('#filter-menu [role^="menuitem"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('role')));
  is(roles, ['menuitemcheckbox', 'menuitemcheckbox', 'menuitemcheckbox', 'menuitemcheckbox',
    'menuitemradio', 'menuitemradio'], '#86 the menu exposes four Sift checks and two View radios');
  await page.keyboard.press('ArrowUp');
  is(await page.evaluate(() => document.activeElement?.textContent.trim()), 'Event charts',
    '#86 roving focus wraps from Highs to Event charts');
  await page.keyboard.press('Escape');
  is(await page.evaluate(() => document.activeElement?.id), 'filter-trigger',
    '#86 Escape closes and restores focus to Filter');
};

/** #86 probe — Event charts intersects Sift over published row fields only,
    preserves server order, and a settled zero result names all root filters. */
export const issue86FilteredRoot = async (page) => {
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settle(page, 450);
  const all = await state(page);
  await page.getByRole('button', { name: /Filter/ }).click();
  await page.getByRole('menuitemradio', { name: 'Event charts', exact: true }).click();
  const event = await state(page);
  ok(event.queue.length > 0, '#86 the synthetic projection carries event-chart Findings');
  ok(event.queue.every((row) => /Habit$/.test(row.tag || '')),
    '#86 Event charts contains no settings or held reads');
  const positions = event.queue.map((row) => all.queue.findIndex((candidate) => candidate.title === row.title));
  ok(positions.every((position, index) => index === 0 || position > positions[index - 1]),
    '#86 Event charts retains server order');
  for (const label of ['Highs', 'Lows', 'Meals', 'Corrections']) {
    await page.getByRole('menuitemcheckbox', { name: new RegExp(`^${label} `) }).click();
  }
  const empty = await state(page);
  is(empty.queue, [], '#86 View and empty Sift intersect to no rows');
  is(empty.queueEmpty, 'No findings match the current filters.',
    '#86 the settled zero result names the current filters');
  is(empty.crumbMeta, '30 days', '#86 zero-result metadata retains duration and no count');
  is(empty.filter.trigger, 'Filter 2', '#86 the trigger reports both non-default groups');
};

/** #86 probe — Event charts entry seeds By event from the live row coordinate;
    switching to clock and returning restores queue state and scroll. */
export const issue86DirectEntryRestoration = async (page) => {
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settle(page, 450);
  await page.getByRole('button', { name: /Filter/ }).click();
  await page.getByRole('menuitemradio', { name: 'Event charts', exact: true }).click();
  await page.keyboard.press('Escape');
  const root = await state(page);
  const scroll = await page.evaluate(() => {
    const level = document.getElementById('level');
    level.scrollTop = Math.min(24, Math.max(0, level.scrollHeight - level.clientHeight));
    return level.scrollTop;
  });
  await page.locator('#level .qrow').first().click();
  await page.waitForFunction(() => document.querySelector('#seg-align button[aria-pressed="true"]')?.textContent.trim() === 'By event');
  await page.locator('#align-canvas:not([hidden])').waitFor();
  const opened = await state(page);
  is(opened.alignPressed, ['By event'], '#86 Event charts entry opens directly By event');
  is(opened.filter.visible, false, '#86 Filter is hidden in a case file');
  await page.getByRole('button', { name: 'By clock', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#seg-align button[aria-pressed="true"]')?.textContent.trim() === 'By clock');
  await page.locator('#chart:not([hidden])').waitFor();
  ok((await state(page)).clockCanvas, '#86 the reader can switch the same Finding to By clock');
  await page.keyboard.press('Backspace');
  await settle(page, 150);
  const returned = await state(page);
  is(returned.queue.map((row) => row.title), root.queue.map((row) => row.title),
    '#86 return restores the filtered server order');
  is(returned.pressed, ['24 h'], '#86 return preserves the clock window');
  is(returned.filter.trigger, 'Filter 1', '#86 return preserves Event charts selection');
  is(returned.filter.open, false, '#86 return keeps the menu closed');
  is(returned.filter.view.map((item) => item.checked), ['false', 'true'],
    '#86 Event charts remains the selected View');
  is(returned.levelScroll, scroll, '#86 return restores queue scroll position');
};

/** #86 probe — while a root projection is pending, Filter selections remain
    enabled and checked but old row and chip counts are withheld. */
export const issue86PendingRoot = async (page, control) => {
  await page.getByRole('button', { name: /Filter/ }).click();
  await page.getByRole('menuitemcheckbox', { name: /^Lows / }).click();
  await page.getByRole('menuitemradio', { name: 'Event charts', exact: true }).click();
  const checked = (await state(page)).filter.sift.map((item) => item.checked);
  await page.keyboard.press('Escape');
  await page.click('#seg-window button:nth-child(3)');
  await control.request;
  const pending = await state(page);
  is(pending.levelLoading, 'true', '#86 the root projection declares loading');
  is(pending.queue, [], '#86 no old rows remain under the arriving window');
  is(pending.crumbMeta, '12:00–18:00', '#86 root metadata carries no stale count');
  is(pending.filter.trigger, 'Filter 2', '#86 both non-default groups remain selected');
  is(pending.filter.sift.map((item) => item.text), ['Highs', 'Lows', 'Meals', 'Corrections'],
    '#86 pending Sift labels carry no old projection counts');
  is(pending.filter.sift.map((item) => item.checked), checked,
    '#86 pending Sift selection is retained');
  ok(pending.filter.sift.every((item) => !item.disabled), '#86 pending controls stay enabled');
  is(pending.filter.view.map((item) => item.checked), ['false', 'true'],
    '#86 pending View selection is retained');
  ok(pending.filter.view.every((item) => !item.disabled), '#86 pending View controls stay enabled');
  control.release();
  await page.waitForFunction(() => document.getElementById('level')?.dataset.loading === 'false',
    null, { timeout: 10_000 });
  const settled = await state(page);
  is(settled.levelLoading, 'false', '#86 the root projection settles after release');
  is(settled.crumbMeta, '4 in this window', '#86 settled metadata carries the Afternoon count');
  is(settled.queue.map((row) => row.title), [
    'Over-treated low',
    'Correction on active insulin',
    'Late bolus',
    'Missed / unannounced meal',
  ], '#86 the exact Afternoon projection replaces the pending state in server order');
};

/** #86 probe — a malformed direct By-event response leaves the requested
    alignment in place, names the inconsistent projection, and never asks for
    or renders a clock case. */
export const issue86MalformedRecovery = async (page) => {
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settle(page, 450);
  await page.getByRole('button', { name: /Filter/ }).click();
  await page.getByRole('menuitemradio', { name: 'Event charts', exact: true }).click();
  await page.keyboard.press('Escape');
  const caseRequests = [];
  const observeCaseRequest = (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/diagnose/finding-case-file') {
      caseRequests.push(url.searchParams.get('alignment'));
    }
  };
  page.on('request', observeCaseRequest);
  await clickQueueRow(page, 'Late bolus');
  await page.locator('#level [role="alert"]').waitFor();
  page.off('request', observeCaseRequest);
  const recovered = await state(page);
  is(recovered.crumb[recovered.crumb.length - 1], 'Late bolus',
    '#86 malformed event data leaves the reader on the same Finding');
  is(recovered.alignPressed, ['By event'], '#86 malformed event data retains By event');
  is(caseRequests, ['event'], '#86 malformed event data makes no hidden clock-case request');
  is(await page.locator('#level [role="alert"]').getAttribute('data-code'), 'inconsistent_projection',
    '#86 malformed event data exposes the structured inconsistent-projection error');
  is(await page.locator('#level [role="alert"]').innerText(),
    'The Finding case file did not match the requested coordinates.',
    '#86 malformed event data names the inconsistent projection');
  is(await page.locator('#level .clock').count(), 0,
    '#86 malformed event data renders no fallback clock case');
  is(recovered.eventCanvas, false, '#86 malformed event evidence is never rendered');
  is(recovered.pressed, ['24 h'], '#86 the clock window is preserved');
  await page.keyboard.press('Backspace');
  const root = await state(page);
  ok(root.queue.some((row) => row.title === 'Late bolus'),
    '#86 return keeps the same Finding reachable in Event charts');
  is(root.pressed, ['24 h'], '#86 return preserves the clock window');
  is(root.filter.trigger, 'Filter 1', '#86 the Event charts root View is preserved');
  is(root.filter.view.map((item) => item.checked), ['false', 'true'],
    '#86 the preserved View remains selected');
};

/** ADR 79 · behavioral Finding case files. The C prefix keeps this revision's
    inventory distinct from ticket 88's frozen S41–S71 history stories. */
const openWholeDay = async (page) => {
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settle(page, 300);
};

export const C41 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Meal over-delivery');
  await settle(page, 250);
  const stat = await page.locator('#level .statline').innerText();
  const denominator = Number(stat.match(/^\d+ of (\d+) meal responses/)?.[1]);
  is(denominator, 10, `C41 claimed denominator is exact (${stat})`);
  is(await page.locator('#level .vband button[aria-label="Meets criteria · 6"]').count(), 2,
    'C41 fired can exceed claimed without browser recounting across both verdict controls');
  const visibleBands = await page.locator('#level .vband button[aria-label]').evaluateAll((buttons) =>
    buttons.map((button) => Number(button.getAttribute('aria-label').match(/(\d+)$/)?.[1])));
  const residue = await page.locator('#level .vband-foot').innerText();
  const residueBands = [...residue.matchAll(/\d+/g)].map((match) => Number(match[0]));
  is(visibleBands.length + residueBands.length, 5,
    'C41 reads every published verdict band, including the two residue bands');
  is([...visibleBands, ...residueBands].reduce((sum, count) => sum + count, 0), denominator,
    'C41 all five server verdict bands reconcile to the case denominator');
  is(await page.locator('#level .clock .bars > div').count(), 12,
    'C41 renders the server exact twelve clock buckets');
  const total = await page.locator('#level .clock .bars > div').evaluateAll((rows) =>
    rows.reduce((sum, row) => sum + Number(row.dataset.n), 0));
  is(total, 1, 'C41 clock bucket counts sum to the server claimed total');
  ok(await page.locator('#level .case-occurrence').count() > 0,
    'C41 the fired roster is nonempty');
};

export const C42 = async (page) => {
  await openWholeDay(page);
  const titles = await page.locator('#level .qrow[data-state="finding"] .lab').allTextContents();
  ok(titles.length > 0, 'C42 the generated preparation publishes a visible Finding');
  for (const title of titles) {
    await clickQueueRow(page, title);
    await page.waitForSelector('#level .who');
    is((await page.locator('#level .who').innerText()).split(' · ')[0], title,
      `C42 ${title} opens its server case`);
    await page.getByRole('button', { name: 'Findings', exact: true }).click();
  }
};

export const C43 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Correction stacking');
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await page.waitForSelector('#ec-chart');
  await page.locator('#level .case-occurrence').first().click();
  await page.waitForSelector('#level .case-facts');
  is(await page.locator('#level .source-correction').count(), 2,
    'C43 correction-pair selection preserves both canonical source doses');
  is(await page.getByRole('button', { name: 'By event', exact: true }).getAttribute('aria-pressed'),
    'true', 'C43 By event persists through selection');
};

export const C44 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Missed / unannounced meal');
  await page.waitForSelector('#level .who');
  is(await page.locator('#level .who').innerText(), 'Missed / unannounced meal · highs',
    'C44 opens the server-owned missed-meal High case');
  is(await page.getByRole('button', { name: 'By event', exact: true }).count(), 1,
    'C44 exposes ALIGN from the server-owned missed-meal coordinate');
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await page.waitForSelector('#ec-chart');
  const verdictBand = await page.locator('#level .vband').evaluate((band) => ({
    segments: [...band.querySelectorAll('.bar [aria-label]')]
      .map((part) => part.getAttribute('aria-label')),
    residue: band.parentElement.querySelector('.vband-foot')?.textContent.trim() ?? null,
  }));
  is(verdictBand, {
    segments: ['Meets criteria · 6', 'Borderline · 1', 'Does not meet · 1'],
    residue: '1 claimed by another factor · 1 not comparable',
  }, 'C44 retains fired, near-miss, clean, outranked, and no-data High accounting');
  const comparison = await page.locator('#level .lvl-cap').innerText();
  ok(/attributed missed.*announced.*not comparable/i.test(comparison),
    `C44 prints the three served comparison counts (${comparison})`);
  is(await page.locator('[data-comparison-cohort="missed"]').count(), 1,
    'C44 renders the attributed-missed cohort row');
  const announced = page.locator('[data-comparison-cohort="announced"]').first();
  ok(await announced.isVisible(), 'C44 renders an announced-meal occurrence outside the High roster');
  is(await announced.locator('.only').innerText(), "Select to see this meal's glucose trace",
    'C44 announced-meal rows describe the glucose trace a selection reveals');
  await announced.click();
  await page.waitForSelector('#level .case-facts');
  const evidence = await page.locator('#level .case-facts').innerText();
  ok(/\d+ glucose readings/.test(evidence) && /\d+ event markers/.test(evidence),
    'C44 announced-meal selection retains its trace and markers');
};

// STORY:finding-evidence-routing:C56
export const C56 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Missed / unannounced meal');
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await page.waitForSelector('#ec-chart');
  is(await page.locator('#level .empty').innerText(), 'No attributed missed meals in this window.',
    'C56 renders the served empty attributed-missed cohort explicitly');
  is(await page.locator('[data-comparison-cohort="missed"]').count(), 0,
    'C56 does not fall back to High roster rows when the cohort is empty');
  ok(await page.locator('[data-comparison-cohort="announced"]').first().isVisible(),
    'C56 leaves the announced-meal baseline available beside the empty cohort');
};

/** C57 · Selecting an attributed missed meal emphasizes the served missed
    comparison cohort, not the finding's fired verdict cohort. */
// STORY:finding-evidence-routing:C57
export const C57 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Missed / unannounced meal');
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await page.waitForSelector('#ec-chart');
  const request = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname === '/api/diagnose/finding-case-file' && url.searchParams.has('occ');
  });
  await page.locator('[data-comparison-cohort="missed"]').first().click();
  const requested = new URL((await request).url()).searchParams.get('occ');
  await page.waitForSelector('#level .case-facts');
  const drawn = await page.evaluate(() => {
    const exposed = window.__diagnoseEventComparison;
    const selected = exposed?.selected;
    const series = exposed?.chart.getOption().series || [];
    const line = (cohort) => series.find((item) => item.id === `${cohort}:line:limited`);
    const episode = (cohort) => series.find((item) => item.id?.startsWith(`${cohort}:episode:`));
    const trace = series.find((item) => item.name === 'Selected occurrence');
    return {
      id: selected?.id ?? null,
      cohort: selected?.verdict?.cohort ?? null,
      trace: trace?.data ?? null,
      responseTrace: selected?.glucose?.map((point) => [point.minute, point.bg]) ?? null,
      opacity: { missed: line('missed')?.lineStyle?.opacity ?? null,
        announced: episode('announced')?.lineStyle?.opacity ?? null },
      legend: [...document.querySelectorAll('#ec-chart-key [data-cohort]')]
        .map((item) => [item.dataset.cohort, item.dataset.selectedCohort]),
    };
  });
  is(requested, drawn.id, 'C57 selection requests the server-owned attributed-missed occurrence');
  is(drawn.cohort, 'missed', 'C57 uses the served missed comparison cohort for emphasis');
  is(drawn.opacity, { missed: .5, announced: null },
    'C57 emphasizes the served limited missed aggregate without inventing an announced aggregate');
  is(Object.fromEntries(drawn.legend).missed, 'true', 'C57 legend marks the missed cohort selected');
  is(Object.fromEntries(drawn.legend).announced, 'false', 'C57 legend leaves the announced cohort unselected');
  is(drawn.trace, drawn.responseTrace, 'C57 draws the exact selected attributed-missed trace');
};

/* The ordinary generated projection withholds some case-file rows. A story may
 * pose one generated production-shaped row without changing that roster policy. */
export const generatedFindingPreparation = (preparation, caseFiles, findingId) => {
  const sourceRow = caseFiles.preparation.findings.rows.find((row) => row.id === findingId);
  const sourceRendered = caseFiles.preparation.rendered_rows.find((row) => row.id === findingId);
  const sourceHeader = caseFiles.preparation.behavioral_case_headers[findingId];
  if (!sourceRow || !sourceRendered || !sourceHeader) {
    fail(`generated case-file fixture has no ${findingId} pose`);
  }
  const next = structuredClone(preparation);
  /* A replay can pose a row through both the queue projection and preparation.
     The preparation is a validated server contract, where duplicate ready ids
     are invalid; preserve the projected row when it is already present. */
  if (!next.findings.rows.some((row) => row.id === findingId)) {
    next.findings.rows.push(structuredClone(sourceRow));
  }
  next.findings.counts = { ...next.findings.counts, total: next.findings.rows.length };
  if (!next.rendered_rows.some((row) => row.id === findingId)) {
    next.rendered_rows.push(structuredClone(sourceRendered));
  }
  next.behavioral_case_headers[findingId] = structuredClone(sourceHeader);
  return next;
};

export const generatedFindingPose = (findingId) => ({ preparation, caseFiles }) => ({
  body: generatedFindingPreparation(preparation, caseFiles, findingId),
});

export const generatedFindingProjection = (findingId) => (projected, caseFiles) => {
  if (projected.rows.some((row) => row.id === findingId)) return projected;
  return {
    ...projected,
    rows: [...projected.rows, structuredClone(caseFiles.preparation.rendered_rows
      .find((row) => row.id === findingId))],
  };
};

export const C45 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Over-treated low');
  await page.locator('#level .case-occurrence').first().click();
  await page.waitForSelector('#level .case-selection-state');
  is(await page.locator('#level .case-selection-state').count(), 1,
    'C45 a successful unavailable selection is visibly distinct');
  is(await page.locator('#level [role="alert"]').count(), 0,
    'C45 unavailable selection is not an active request failure');
};

export const C46 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Over-treated low');
  const before = await page.locator('#level .who').innerText();
  expectResponse(page, /^\/api\/diagnose\/finding-case-file$/, 500);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await page.waitForSelector('#level [role="alert"]');
  is(await page.locator('#level .who').innerText(), before,
    'C46 active failure preserves the old inspector');
  is(await page.locator('#level .clock').count(), 1,
    'C46 active failure preserves the old clock canvas generation');
  is(await page.locator('#level [role="alert"]').getAttribute('data-code'), 'inconsistent_projection',
    'C46 consumes the structured error code');
};

export const C47 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Over-treated low');
  expectResponse(page, /^\/api\/diagnose\/finding-case-file$/, 409);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await settle(page, 120);
  is(await page.locator('#level .clock').count(), 1,
    'C47 both shadow legs leave the old clock generation visible');
  ok(!(await page.locator('#level .who').innerText()).includes('refreshed'),
    'C47 refreshed inspector stays in shadow');
  await page.waitForSelector('#ec-chart');
  ok((await page.locator('#level .who').innerText()).includes('refreshed'),
    'C47 inspector and event canvas swap only after both legs succeed');
  await page.getByRole('button', { name: 'Findings', exact: true }).click();
  is(await page.locator('#level .qrow[data-id="finding:over_treated_low"] .lab').innerText(),
    'Over-treated low refreshed', 'C47 the queue joined the same atomic three-surface swap');
};

export const C48 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Over-treated low');
  expectResponse(page, /^\/api\/diagnose\/finding-case-file$/, 404);
  expectResponse(page, /^\/api\/diagnose\/finding-case-file-preparation$/, 503);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await page.waitForSelector('#level [role="alert"]');
  is(await page.locator('#level [role="alert"]').getAttribute('data-code'), 'preparation_changed',
    'C48 queue-refresh failure is the active structured error');
  is(await page.locator('#level .clock').count(), 1,
    'C48 queue-refresh failure preserves the old case generation');
};

export const C49 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Over-treated low');
  expectResponse(page, /^\/api\/diagnose\/finding-case-file$/, 409);
  expectResponse(page, /^\/api\/diagnose\/finding-case-file$/, 500);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await page.waitForSelector('#level [role="alert"]');
  is(await page.locator('#level .clock').count(), 1,
    'C49 case failure after refresh preserves the whole old case');
  is(await page.locator('#level [role="alert"]').getAttribute('data-code'), 'inconsistent_projection',
    'C49 the shadow case error is reported exactly');
};

export const C50 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Over-treated low');
  expectResponse(page, /^\/api\/diagnose\/finding-case-file$/, 409);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await settle(page, 80);
  await page.locator('#level .case-occurrence').first().click();
  await settle(page, 600);
  is(await page.getByRole('button', { name: 'By clock', exact: true }).getAttribute('aria-pressed'),
    'true', 'C50 a newer selection supersedes the stale preparation leg');
  is(await page.locator('#level [role="alert"]').count(), 0,
    'C50 the superseded preparation leg lands silently');
};

export const C51 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Over-treated low');
  expectResponse(page, /^\/api\/diagnose\/finding-case-file$/, 409);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await settle(page, 180);
  await page.locator('#level .case-occurrence').first().click();
  await settle(page, 650);
  is(await page.getByRole('button', { name: 'By clock', exact: true }).getAttribute('aria-pressed'),
    'true', 'C51 a newer selection supersedes the shadow case leg');
  is(await page.locator('#level [role="alert"]').count(), 0,
    'C51 the superseded shadow case lands silently');
};

export const C52 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Over-treated low');
  expectResponse(page, /^\/api\/diagnose\/finding-case-file$/, 404);
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await page.waitForSelector('#level [role="alert"]');
  is(await page.locator('#level .clock').count(), 1,
    'C52 Finding-unavailable refresh preserves the prior inspector/canvas pair');
  await page.getByRole('button', { name: 'Findings', exact: true }).click();
  is(await page.locator('#level .qrow[data-id="finding:over_treated_low"]').count(), 0,
    'C52 the successful queue refresh removes the unavailable Finding');
};

export const C53 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Over-treated low');
  await page.getByRole('button', { name: 'By event', exact: true }).click();
  await page.waitForSelector('#level [role="alert"]');
  is(await page.locator('#level [role="alert"]').getAttribute('data-code'),
    'inconsistent_projection', 'C53 rejects a case for another preparation/Finding identity');
  is(await page.locator('#level .clock').count(), 1,
    'C53 an identity mismatch preserves the active generation');
};

export const C54 = async (page) => {
  await openWholeDay(page);
  expectResponse(page, /^\/api\/diagnose\/finding-case-file-preparation$/, 503);
  await page.getByRole('button', { name: 'Morning', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false');
  is(await page.getByRole('button', { name: 'Morning', exact: true }).getAttribute('aria-pressed'), 'true',
    'C54 the selected Morning window remains after its projection fails');
  is(await page.locator('#level .empty').innerText(),
    'Findings unavailable for 06:00–12:00. Choose another window to try again.',
    'C54 the failed Morning projection states its exact unavailable message');
  is(await page.locator('#level .qrow').count(), 0,
    'C54 the failed Morning projection leaves no stale queue row');
};

export const C55 = async (page) => {
  await openWholeDay(page);
  await clickQueueRow(page, 'Over-treated low');
  await page.getByRole('button', { name: 'Morning', exact: true }).click();
  await page.locator('#level .case-occurrence').first().click();
  await page.waitForSelector('#level .case-facts');
  is(await page.locator('#level').getAttribute('data-loading'), 'false',
    'C55 a selection superseding window preparation settles the replacement');
  is(await page.locator('#level [role="alert"]').count(), 0,
    'C55 the superseded preparation leg cannot strand an active failure');
};

/* ------------------------------------------------------------------- runner */

/* Discovery tags for every exported replay function above. */
// STORY:finding-evidence-routing:S01
// STORY:finding-evidence-routing:S02
// STORY:finding-evidence-routing:S03
// STORY:finding-evidence-routing:S04
// STORY:finding-evidence-routing:S05
// STORY:finding-evidence-routing:S06
// STORY:finding-evidence-routing:S07
// STORY:finding-evidence-routing:S08
// STORY:finding-evidence-routing:S09
// STORY:finding-evidence-routing:S10
// STORY:finding-evidence-routing:S11
// STORY:finding-evidence-routing:S12
// STORY:finding-evidence-routing:S13
// STORY:finding-evidence-routing:S14
// STORY:finding-evidence-routing:S15
// STORY:finding-evidence-routing:S16
// STORY:finding-evidence-routing:S17
// STORY:finding-evidence-routing:S18
// STORY:finding-evidence-routing:S19
// STORY:finding-evidence-routing:S20
// STORY:finding-evidence-routing:S21
// STORY:finding-evidence-routing:S22
// STORY:finding-evidence-routing:S23
// STORY:finding-evidence-routing:S24
// STORY:finding-evidence-routing:S25
// STORY:finding-evidence-routing:S26
// STORY:finding-evidence-routing:S27
// STORY:finding-evidence-routing:S28
// STORY:finding-evidence-routing:S29
// STORY:finding-evidence-routing:S30
// STORY:finding-evidence-routing:S31
// STORY:finding-evidence-routing:S32
// STORY:finding-evidence-routing:S33
// STORY:finding-evidence-routing:S34
// STORY:finding-evidence-routing:S35
// STORY:finding-evidence-routing:S36
// STORY:finding-evidence-routing:S37
// STORY:finding-evidence-routing:S38
// STORY:finding-evidence-routing:S39
// STORY:finding-evidence-routing:S40
// STORY:finding-evidence-routing:S41
// STORY:finding-evidence-routing:S42
// STORY:finding-evidence-routing:S43
// STORY:finding-evidence-routing:S44
// STORY:finding-evidence-routing:S45
// STORY:finding-evidence-routing:S46
// STORY:finding-evidence-routing:S47
// STORY:finding-evidence-routing:S48
// STORY:finding-evidence-routing:S49
// STORY:finding-evidence-routing:S50
// STORY:finding-evidence-routing:S51
// STORY:finding-evidence-routing:S52
// STORY:finding-evidence-routing:D1
// STORY:finding-evidence-routing:D2
// STORY:finding-evidence-routing:D3
// STORY:finding-evidence-routing:C41
// STORY:finding-evidence-routing:C42
// STORY:finding-evidence-routing:C43
// STORY:finding-evidence-routing:C44
// STORY:finding-evidence-routing:C45
// STORY:finding-evidence-routing:C46
// STORY:finding-evidence-routing:C47
// STORY:finding-evidence-routing:C48
// STORY:finding-evidence-routing:C49
// STORY:finding-evidence-routing:C50
// STORY:finding-evidence-routing:C51
// STORY:finding-evidence-routing:C52
// STORY:finding-evidence-routing:C53
// STORY:finding-evidence-routing:C54
// STORY:finding-evidence-routing:C55

/** Each story names the state it must open in, and — where the shipped payload
    cannot pose its shape — the synthetic override it opens on. */
const structured = (status, code, message) => ({ status,
  body: { detail: { code, message } } });
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const refreshedPreparation = (preparation) => {
  const next = structuredClone(preparation);
  next.projection_id = `fp_${'8'.repeat(32)}`;
  const row = next.rendered_rows.find((item) => item.id === 'finding:over_treated_low');
  if (row) {
    row.title += ' refreshed'; row.case_header.title = row.title;
    next.behavioral_case_headers[row.id].title = row.title;
  }
  return next;
};
const refreshedCase = (body) => {
  const next = structuredClone(body);
  next.projection_id = `fp_${'8'.repeat(32)}`;
  next.finding.title += ' refreshed';
  return next;
};
/* S75 keeps the real request's coordinate and generation while replacing only
   its rows with the frozen all-Watching population. A scoped fixture response
   cannot answer the root request: the workstation correctly rejects a response
   whose declared window differs from the request. */
const allWatchingProjection = (projected) => ({
  ...FINDINGS_PROJECTION.windows.quiet,
  analysis_generation: projected.analysis_generation,
  findings_window: projected.findings_window,
  window: projected.window,
});
const queueProjection = (projected) => ({
  ...FINDINGS_PROJECTION.windows.global,
  analysis_generation: projected.analysis_generation,
  findings_window: projected.findings_window,
  window: projected.window,
});

export const STORIES = [
  ['S01', S01, 'drawn'], ['S02', S02, 'typical'], ['S03', S03, 'drawn'],
  ['S04', S04, 'drawn'], ['S05', S05, 'drawn'], ['S06', S06, 'typical'],
  ['S07', S07, 'drawn'], ['S08', S08, 'drawn'], ['S09', S09, 'typical'],
  ['S10', S10, 'dense'], ['S11', S11, 'dense'], ['S12', S12, 'dense'],
  ['S13', S13, 'dense'], ['S14', S14, 'dense'], ['S15', S15, 'typical'],
  ['S16', S16, 'typical'], ['S17', S17, 'typical'], ['S18', S18, 'typical'],
  ['S19', S19, 'drill'], ['S20', S20, 'drill'], ['S21', S21, 'drawn'],
  ['S22', S22, 'typical'], ['S23', S23, 'drawn'],
  ['S24', S24, 'typical'], ['S25', S25, 'typical'],
  ['S26', S26, 'dense'], ['S27', S27, 'typical'], ['S28', S28, 'typical'],
  ['S29', S29, 'typical'], ['S30', S30, 'typical'], ['S31', S31, 'typical'],
  ['S32', S32, 'dense', { findingsInputs: withFiredMeal, exposuresInputs: (d) => withFiredMeal(d).exposures }],
  ['S33', S33, 'dense', { findingsInputs: withFiredMeal, exposuresInputs: (d) => withFiredMeal(d).exposures }],
  ['S34', S34, 'typical', {
    findingsInputs: twoFamilyInputs,
    exposuresInputs: async () => (await twoFamilyInputs()).exposures,
    caseScenario: {
      case: async ({ request, body }) => request === 2
        ? structured(500, 'inconsistent_projection', 'Synthetic event projection failure.') : { body },
    },
  }],
  ['S35', S35, 'dense', {
    findingsInputs: twoFamilyInputs,
    exposuresInputs: async () => (await twoFamilyInputs()).exposures,
  }],
  ['S36', S36, 'dense'],
  ['S37', S37, 'typical', {
    findingsInputs: withLateConsequence,
    exposuresInputs: (d) => withLateConsequence(d).exposures,
  }],
  ['S38', S38, 'typical', {
    findingsInputs: withEligibilityLoss,
    exposuresInputs: (d) => withEligibilityLoss(d).exposures,
  }],
  ['S39', S39, 'dense', { findingsDelayMs: 900 }],
  ['S40', S40, 'typical'],
  ['S41', S41, 'typical', { history: true }],
  ['S42', S42, 'typical', { history: true }],
  ['S43', S43, 'typical', { history: true }],
  ['S44', S44, 'typical', { history: true }],
  ['S45', S45, 'typical', { history: true }],
  ['S46', S46, 'typical', { history: true }],
  ['S47', S47, 'typical', { history: true }],
  ['S48', S48, 'typical', { history: true }],
  ['S49', S49, 'typical', { history: true }],
  ['S50', S50, 'typical', { history: true }],
  ['S51', S51, 'typical', { history: true }],
  ['S52', S52, 'typical', { history: true }],
  ['S53', S53, 'typical', { history: true, findingsInputs: thinHistoryInputs }],
  ['S54', S54, 'typical', { history: true, findingsInputs: thinHistoryInputs,
    selectedFindingsResponses: [
      { body: contradictoryHistoryDisposition('aged_out', 'contradictory retirement') },
      { body: missingRowsDisposition('aged_out', 'missing-row-list retirement') },
    ] }],
  ['S55', S55, 'typical', { history: true, selectedFindingsResponses: [{
    body: historyDisposition('aged_out', 'Past-setting evidence aged out of the 90-day window.'),
  }] }],
  ['S56', S56, 'typical', { history: true, selectedFindingsResponses: [{
    body: historyDisposition('unavailable', 'Past-setting evidence no longer maps to one current program block.'),
  }] }],
  ['S57', S57, 'typical', { history: true, historyResponses: [{ status: 410,
    detail: { code: 'history_aged_out', message: 'Past-setting evidence aged out of the 90-day window.' } }],
    selectedFindingsResponses: [{
      body: historyDisposition('aged_out', 'Past-setting evidence aged out of the 90-day window.'),
    }] }],
  ['S58', S58, 'typical', { history: true, historyResponses: [{ status: 410,
    detail: { code: 'history_unavailable', message: 'Past-setting evidence no longer maps to one current program block.' } }],
    selectedFindingsResponses: [{
      body: historyDisposition('unavailable', 'Past-setting evidence no longer maps to one current program block.'),
    }] }],
  ['S59', S59, 'typical', { history: true,
    historyResponses: [{ status: 500, detail: 'temporary failure' }],
    selectedFindingsResponses: [{ delayMs: 650 }] }],
  ['S60', S60, 'typical', { history: true, historyResponses: [{ status: 409,
    detail: { code: 'analysis_generation_mismatch', message: 'Evidence changed. Refresh findings.' } }] }],
  ['S61', S61, 'typical', { history: true,
    historyResponses: [{ status: 500, detail: 'temporary failure' }],
    selectedFindingsResponses: [{ status: 500, detail: 'retry failed' }] }],
  ['S62', S62, 'typical', { history: true,
    historyResponses: [{ status: 500, detail: 'temporary failure' }],
    selectedFindingsResponses: [{ status: 500, detail: 'retry failed' }] }],
  ['S63', S63, 'typical', { history: true, selectedFindingsResponses: [
    { status: 400, detail: { code: 'invalid_history_id', message: 'Invalid history identity.' } },
    { status: 400, detail: { code: 'invalid_history_id', message: 'Invalid history identity.' } },
  ] }],
  ['S64', S64, 'typical', { history: true, selectedFindingsResponses: [
    { status: 404, detail: { code: 'history_not_found', message: 'Past-setting evidence was not found.' } },
    { status: 404, detail: { code: 'history_not_found', message: 'Past-setting evidence was not found.' } },
  ] }],
  ['S65', S65, 'typical', { history: true, historyResponses: [
    {},
    { status: 400, detail: { code: 'invalid_history_run_id', message: 'Invalid history run identity.' } },
    { status: 400, detail: { code: 'invalid_history_run_id', message: 'Invalid history run identity.' } },
  ] }],
  ['S66', S66, 'typical', { history: true, historyResponses: [
    {},
    { status: 404, detail: { code: 'history_run_not_found', message: 'History run was not found.' } },
    { status: 404, detail: { code: 'history_run_not_found', message: 'History run was not found.' } },
  ] }],
  ['S67', S67, 'typical', { history: true, historyResponses: [
    {},
    { status: 409, detail: { code: 'analysis_generation_mismatch', message: 'Evidence changed. Refresh findings.' } },
    { body: withRestartGeneration },
  ], selectedFindingsResponses: [{ body: withRestartGeneration }] }],
  ['S68', S68, 'typical', { history: true, selectedFindingsResponses: [
    { delayMs: 700 }, {},
  ] }],
  ['S69', S69, 'typical', { history: true, historyResponses: [
    { delayMs: 700 }, {}, { delayMs: 700 }, {},
  ] }],
  ['S70', S70, 'typical', { history: true }],
  ['S71', S71, 'typical', { history: true, stageProbe: true,
    historyResponses: [
      {}, {}, {},
      { status: 500, detail: 'ordinary recovery' }, {},
      { status: 409, detail: { code: 'analysis_generation_mismatch', message: 'Evidence changed. Refresh findings.' } },
      { body: withRestartGeneration },
      { status: 500, detail: 'terminal recovery' },
      { body: withRestartGeneration },
    ],
    selectedFindingsResponses: [
      {},
      { body: withRestartGeneration },
      { status: 500, detail: 'coordinated retry failed' },
      { body: withRestartGeneration },
    ] }],
  ['S72', S72, 'typical'],
  ['S73', S73, 'typical', { analysisInputs: withNoDataBasal }],
  ['S74', S74, 'typical', { history: true }],
  ['S75', S75, 'typical', { history: true, findingsProjectionInputs: allWatchingProjection }],
  ['S76', S76, 'typical', { findingsProjectionInputs: queueProjection }],
  ['S77', S77, 'typical'],
  ['S78', S78, 'dense'], ['S79', S79, 'dense'],
  ['S80', S80, 'dense', { findingsInputs: withFiredMeal, exposuresInputs: (d) => withFiredMeal(d).exposures }],
  ['S81', S81, 'dense'],
  ['S82', S82, 'typical'], ['S83', S83, 'typical'], ['S84', S84, 'drawn'],
  ['S85', S85, 'typical'], ['S86', S86, 'typical'], ['S87', S87, 'typical'],
  ['S88', S88, 'typical'], ['S89', S89, 'typical'],
  ['S90', S90, 'typical', { history: true, historyResponses: [{
    body: (generated) => ({
      ...generated,
      series: generated.series.map((run) => ({
        ...run,
        member_offsets_min: [0, 137.31666666666666, 261.7, 398.1166666666667],
      })),
    }),
  }] }],
  ['C41', C41, 'typical', { caseScenario: {
    preparation: generatedFindingPose('finding:meal_over_delivery'),
  } }], ['C42', C42, 'typical'],
  ['C43', C43, 'typical', {
    findingsInputs: twoFamilyInputs,
    exposuresInputs: async () => (await twoFamilyInputs()).exposures,
  }], ['C44', C44, 'typical', { caseScenario: {
    preparation: generatedFindingPose('finding:missed_meal'),
  }, findingsProjectionInputs: generatedFindingProjection('finding:missed_meal') }],
  ['C45', C45, 'typical', { caseScenario: {
    case: async ({ request, url, body }) => request === 2
      ? { body: { ...body, selection: { state: 'unavailable',
        requested_id: url.searchParams.get('occ'), detail: null } } } : { body },
  } }],
  ['C46', C46, 'typical', { caseScenario: {
    case: async ({ request, body }) => request === 2
      ? structured(500, 'inconsistent_projection', 'Synthetic active case failure.') : { body },
  } }],
  ['C47', C47, 'typical', { caseScenario: {
    preparation: async ({ request, preparation }) => {
      if (request === 5) { await pause(220); return { body: refreshedPreparation(preparation) }; }
      return { body: preparation };
    },
    case: async ({ request, body }) => {
      if (request === 2) return structured(409, 'stale_projection', 'Synthetic stale preparation.');
      if (request === 3) { await pause(220); return { body: refreshedCase(body) }; }
      return { body };
    },
  } }],
  ['C48', C48, 'typical', { caseScenario: {
    preparation: async ({ request, preparation }) => request === 5
      ? structured(503, 'preparation_changed', 'Synthetic queue refresh failure.')
      : { body: preparation },
    case: async ({ request, body }) => request === 2
      ? structured(404, 'finding_unavailable', 'Synthetic Finding unavailable.') : { body },
  } }],
  ['C49', C49, 'typical', { caseScenario: {
    preparation: async ({ request, preparation }) => ({ body: request === 5
      ? refreshedPreparation(preparation) : preparation }),
    case: async ({ request, body }) => request === 2
      ? structured(409, 'stale_projection', 'Synthetic stale preparation.')
      : request === 3
        ? structured(500, 'inconsistent_projection', 'Synthetic refreshed case failure.')
        : { body },
  } }],
  ['C50', C50, 'typical', { caseScenario: {
    preparation: async ({ request, preparation }) => {
      if (request === 5) { await pause(420); return { body: refreshedPreparation(preparation) }; }
      return { body: preparation };
    },
    case: async ({ request, body }) => request === 2
      ? structured(409, 'stale_projection', 'Synthetic stale preparation.') : { body },
  } }],
  ['C51', C51, 'typical', { caseScenario: {
    preparation: async ({ request, preparation }) => ({ body: request === 5
      ? refreshedPreparation(preparation) : preparation }),
    case: async ({ request, body }) => {
      if (request === 2) return structured(409, 'stale_projection', 'Synthetic stale preparation.');
      if (request === 3) { await pause(500); return { body: refreshedCase(body) }; }
      return { body };
    },
  } }],
  ['C52', C52, 'typical', { caseScenario: {
    preparation: async ({ request, preparation }) => {
      if (request !== 5) return { body: preparation };
      const next = structuredClone(preparation);
      next.rendered_rows = next.rendered_rows
        .filter((row) => row.id !== 'finding:over_treated_low');
      delete next.behavioral_case_headers['finding:over_treated_low'];
      return { body: next };
    },
    case: async ({ request, body }) => request === 2
      ? structured(404, 'finding_unavailable', 'Synthetic Finding unavailable.') : { body },
  } }],
  ['C53', C53, 'typical', { caseScenario: {
    case: async ({ request, body }) => request === 2
      ? { body: { ...body, projection_id: `fp_${'f'.repeat(32)}` } } : { body },
  } }],
  ['C54', C54, 'typical', { caseScenario: {
    preparation: async ({ url, preparation }) => url.searchParams.get('start_min') === '360'
      ? structured(503, 'preparation_changed', 'Synthetic active preparation failure.')
      : { body: preparation },
  } }],
  ['C55', C55, 'typical', { caseScenario: {
    preparation: async ({ url, preparation }) => {
      if (url.searchParams.get('start_min') === '360') await pause(250);
      return { body: preparation };
    },
  } }],
  ['C56', C56, 'typical', { findingsProjectionInputs: generatedFindingProjection('finding:missed_meal'),
    caseScenario: {
    preparation: generatedFindingPose('finding:missed_meal'),
    case: async ({ url, body, caseFiles }) => !url.searchParams.get('occ')
      ? { body: structuredClone(caseFiles.cases['finding:missed_meal'].empty_event) } : { body },
  } }],
  ['C57', C57, 'typical', { caseScenario: {
    /* This generated case-file fixture has a limited missed aggregate and a
       withheld announced cohort, so selected-cohort emphasis is observable
       through the public built app without inventing an announced aggregate. */
    case: async ({ url, body }) => {
      const source = url.searchParams.has('occ')
        ? MISSED_MEAL_COMPARISON.selected_missed : MISSED_MEAL_COMPARISON.payload;
      return { body: { ...structuredClone(source), projection_id: body.projection_id,
        window: structuredClone(body.window) } };
    },
  }, findingsProjectionInputs: generatedFindingProjection('finding:missed_meal') }],
  ['D1', D1, 'dense'], ['D2', D2, 'dense'], ['D3', D3, 'dense'],
];

const isMain = process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;
if (isMain) {
  const target = process.env.TARGET;
  if (target !== 'app') fail(`TARGET must be app, got ${target || '(unset)'} — the mock this ledger once ran against is archived (#722); the app is now the sole contract`);
  const modulePath = process.env.PLAYWRIGHT_MODULE || fail('PLAYWRIGHT_MODULE is required');
  const { chromium } = require(modulePath);
  await access(join(process.env.VENDOR_DIR || '', 'echarts.min.js'));
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
  const viewport = process.env.VIEWPORT
    ? Object.fromEntries(['width', 'height'].map((key, index) => [key, Number(process.env.VIEWPORT.split('x')[index])]))
    : undefined;
  if (viewport && (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height))) {
    fail(`VIEWPORT must be WIDTHxHEIGHT, got ${process.env.VIEWPORT}`);
  }
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  const results = [];
  for (const [id, fn, want, options] of STORIES) {
    if (only && !only.has(id)) continue;
    const page = await openApp(browser, {
      state: want,
      ...(options || {}),
      ...(process.env.THEME ? { theme: process.env.THEME } : {}),
      ...(viewport ? { viewport } : {}),
    });
    try {
      const note = await fn(page);
      await captureEvidence(page, id);
      results.push([id, 'pass', note || '']);
    } catch (e) { results.push([id, 'FAIL', e.message]); }
    await page.close();
  }
  await browser.close();
  for (const [id, verdict, why] of results) console.log(`${verdict === 'pass' ? '  ok' : 'FAIL'} ${id}${why ? ` — ${why}` : ''}`);
  for (const p of problems) console.log(`OPENER ${p}`);
  const failed = results.filter((r) => r[1] !== 'pass').length;
  console.log(`\n${target}: ${results.length - failed} of ${results.length} stories passed` + (problems.length ? `, ${problems.length} opener problems` : ''));
  if (!results.length) fail('no stories ran — a green run that executed nothing is a silent skip');
  process.exit(failed || problems.length ? 1 : 0);
}
