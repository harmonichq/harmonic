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
//   BASE_URL=http://127.0.0.1:8765 TARGET=app PAYLOAD=<snapshot.json> \
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
import { readFile, access } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectSyntheticCapture } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';

const require = createRequire(import.meta.url);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' };

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
  return {
    chip: q('#seg-window [data-follow]')?.textContent.replace('×', '').trim() || null,
    pressed: [...document.querySelectorAll('#seg-window button')]
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent.replace('×', '').trim()),
    crumb: [...document.querySelectorAll('#crumb-trail > *')]
      .map((n) => n.textContent.trim()).filter((t) => t !== '›'),
    crumbMeta: txt('#crumb-meta'),
    scope: txt('#canvas-scope'),
    /* #62 — the case file's own head, and the line the panel prints when the
       finding the reader is standing on has no row in the selected window. */
    levelWho: q('#level .who')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    levelStat: q('#level .statline')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    levelEmpty: txt('#level .empty'),
    levelLoading: q('#level')?.dataset.loading ?? null,
    bandKeys: [...document.querySelectorAll('#level .vband .key .lead')].map((n) => n.textContent.trim()),
    // ALIGN's two canvases: which one is mounted, and whose header is up
    alignShown: q('#align-group') ? !q('#align-group').hidden : null,
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
    queueSeam: txt('#level .tailnote'),
    queueEmpty: txt('#level .quiet-line'),
    // term 44 — no hairline between queue rows, in any state
    queueRules: [...document.querySelectorAll('#level .qrow')].filter((n) => {
      const s = getComputedStyle(n);
      return ['Top', 'Bottom'].some((side) => parseFloat(s[`border${side}Width`]) > 0);
    }).length,
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
  findingsProjectionInputs = null, exposuresInputs = null, analysisInputs = null, pumpSettingsInputs = null,
  onPlanDraft = null, comparisonStatus = 0, findingsDelayMs = 0, appSource = 'server',
} = {}) {
  const payloadPath = process.env.PAYLOAD || fail('PAYLOAD is required for TARGET=app');
  /* Source selection belongs to the caller. Standalone replay pins `server`
     below; browser tests opt into `fixture` per call. Ambient process state
     must never turn a built-app replay into an on-disk HTML run. */
  if (!['server', 'fixture'].includes(appSource)) fail(`unknown appSource: ${appSource}`);
  const baseUrl = appSource === 'server'
    ? process.env.BASE_URL || fail('BASE_URL is required for the app-only replay')
    : 'http://app.local/';
  const targetUrl = new URL(baseUrl);
  if (appSource === 'server' && !['127.0.0.1', 'localhost'].includes(targetUrl.hostname)) {
    fail(`BASE_URL must name localhost, got ${targetUrl.hostname}`);
  }
  const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
  const capture = JSON.parse(await readFile(
    join(ROOT, 'mockups/diagnose-event-comparison.synthetic/capture.json'), 'utf8'));
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
  const defaults = { analysis: analysisFrom, exposures: payload.exposures, scenarios: payload.scenarios };
  const findingsFrom = typeof findingsInputs === 'function'
    ? await findingsInputs(defaults) : (findingsInputs || defaults);
  const exposuresFrom = typeof exposuresInputs === 'function'
    ? await exposuresInputs(defaults) : (exposuresInputs || payload.exposures);
  const STUBS = [
    // #698: the endpoint serves the bounded server-owned projection per
    // coordinate; exposures ride on their own #654 endpoint again.
    [/^\/diagnose\/event-comparison/, (url) => projectSyntheticCapture(capture, {
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
    [/^\/diagnose\/findings/, (url) => {
      const projected = projectFindings(findingsFrom,
        url.searchParams.get('start_min') === null ? null : {
        start_min: Number(url.searchParams.get('start_min')),
        end_min: Number(url.searchParams.get('end_min')),
        });
      return typeof findingsProjectionInputs === 'function'
        ? findingsProjectionInputs(projected) : projected;
    }],
    [/^\/explore\/exposures/, () => exposuresFrom],
    [/^\/analyze/, () => analysisFrom],
    [/^\/scenarios/, () => payload.scenarios],
    [/^\/explore\/time/, () => payload.evidence],
    [/^\/status/, () => ({ ok: true, last_fetch: payload.analyze.generated_at, counts: payload.analyze.data_quality?.counts || {} })],
    [/^\/plan\/history/, () => ({ history: [] })],
    [/^\/plan/, () => ({ items: [], updated_at: null })],
    [/^\/verify\/trials/, () => ({ trials: [] })],
    [/^\/api\/catalog/, () => ({ articles: [] })],
    [/^\/carbs/, () => ({ entries: [] })],
    [/^\/prompts/, () => ({ prompts: [] })],
    [/^\/credentials/, () => ({ configured: true })],
    [/^\/audit\/dismissals/, () => ({ dismissed: [] })],
    [/^\/outcomes/, () => ({ points: [] })],
    [/^\/timeline/, () => ({ events: [] })],
    [/^\/backtest/, () => ({ folds: [] })],
    [/^\/model/, () => ({ entries: [] })],
    [/^\/day/, () => ({ days: [] })],
    [/^\/pump-settings$/, () => pumpSettingsFrom || ({ configured: false })],
    [/^\/pump/, () => ({ settings: {} })],
  ];
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => problems.push(`pageerror(app ${want}): ${e}`));
  page.on('response', (response) => {
    if (response.status() < 400) return;
    // a story that is exercising the failed-projection path asks for the status
    if (comparisonStatus && new URL(response.url()).pathname === '/diagnose/event-comparison') return;
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
  await page.addInitScript(([t]) => {
    localStorage.setItem('ciq_token', 'behaviour-replay');
    localStorage.setItem('tab', 'diagnose');
    localStorage.setItem('theme', t);
  }, [theme]);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 204 });
    if (url.href.includes('echarts')) return route.fulfill({ body: await vendored('echarts.min.js'), contentType: 'text/javascript' });
    if (url.href.includes('vue')) return route.fulfill({ body: await vendored('vue.esm-browser.js'), contentType: 'text/javascript' });
    if (appSource === 'server' && url.origin === targetUrl.origin
        && (path === '/' || /\.(js|css|svg|html)$/.test(path))) {
      return route.continue();
    }
    if (appSource === 'fixture' && url.origin === targetUrl.origin) {
      if (path === '/') {
        return route.fulfill({ body: await readFile(join(ROOT, 'frontend/index.html')), contentType: 'text/html' });
      }
      if (/\.(js|css|svg|html)$/.test(path)) {
        try {
          return route.fulfill({
            body: await readFile(join(ROOT, 'frontend', path.slice(1))),
            contentType: MIME[extname(path)] || 'text/plain',
          });
        } catch { /* fall through to the loud unrouted response below */ }
      }
    }
    /* The findings queue is a SERVER round trip, so a story that is about what
       the pane shows WHILE it is in flight needs that flight to last long enough
       to read. Delay, never stub differently: the response is the same one. */
    if (findingsDelayMs && path.startsWith('/diagnose/findings')) {
      await new Promise((resolve) => { setTimeout(resolve, findingsDelayMs); });
    }
    if (comparisonStatus && path === '/diagnose/event-comparison') {
      return route.fulfill({ status: comparisonStatus, contentType: 'application/json',
        body: JSON.stringify({ detail: 'projection unavailable' }) });
    }
    if (path === '/plan' && route.request().method() === 'PUT') {
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
  ok(after.crumbMeta !== before.crumbMeta, 'S01 the inspector count recomputed');
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
  ok(/← →/.test(occ.levelHead || ''), 'S11 the keyboard hint rides the inline detail');
};

/** S12 · ←/→ step the SELECTED occurrence (P24/P25, kept and re-homed onto
    select-in-place) and STOP at the ends — no wrap. Stepping changes neither
    the crumb (P35 retired) nor the window (P21 retired): only the panel and
    the day trace follow. */
// LOCK:diagnose-workstation:21
export const S12 = async (page) => {
  await page.click('#level .qrow[data-state="finding"]');
  await settle(page, 450);
  await page.click('#level .ev-row');
  await settle(page, 450);
  const first = await state(page);
  ok(/\b1 of \d+/.test(first.levelHead || ''), `S12 opens on the first occurrence (${first.levelHead})`);
  await page.keyboard.press('ArrowLeft');
  await settle(page, 300);
  is((await state(page)).levelHead, first.levelHead, 'S12 ← at the start does not wrap');
  await page.keyboard.press('ArrowRight');
  await settle(page, 300);
  const second = await state(page);
  ok(/\b2 of \d+/.test(second.levelHead || ''), `S12 → steps one occurrence (${second.levelHead})`);
  is(second.crumb.length, first.crumb.length, 'S12 stepping never changes the crumb depth (P35 retired)');
  is(second.chip, first.chip, 'S12 stepping never moves the window (P21 retired)');
  await page.keyboard.press('ArrowLeft');
  await settle(page, 300);
  is((await state(page)).levelHead, first.levelHead, 'S12 ← steps back');
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

/** The exact CGM the delayed /timeline stub supplies — unique bg values, each
    ≥15 min apart so buildDayTrace lands one per bin. The 'That day' series must
    carry EXACTLY these, in this order, once the trace resolves. */
const D_CGM = [
  { t: '2020-03-01 03:07:00', bg: 95 },
  { t: '2020-03-01 06:07:00', bg: 112 },
  { t: '2020-03-01 09:07:00', bg: 141 },
  { t: '2020-03-01 12:07:00', bg: 158 },
  { t: '2020-03-01 15:07:00', bg: 173 },
  { t: '2020-03-01 18:07:00', bg: 189 },
];
const D_CGM_VALUES = D_CGM.map((r) => r.bg);

/** D1 · A DELAYED successful /timeline resolves the real trace AFTER an
    occurrence is selected in place (P35 retired: there is no occurrence level
    to be "at"). The late arrival repaints in place: the reader stays at the
    same drilled factor, the #level/#chart nodes keep their identity, and the
    drawn window and staged Plan item are untouched — proof the completion does
    NOT remount the surface (#666). */
export const D1 = async (page) => {
  await setupWorkspaceAtFactor(page);
  // the day's trace arrives late — long enough to observe the no-trace state
  await page.route('**/timeline**', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ cgm: D_CGM }) });
  });
  await page.click('#level .ev-row');
  await settle(page, 250);   // the row is selected; the fetch is still in flight

  // capture the stable nodes BEFORE the trace resolves
  const levelBefore = await page.$('#level');
  const chartBefore = await page.$('#chart');
  const before = await state(page);
  is(before.crumb.length, 2, 'D1 selects the occurrence in place (P35 retired)');
  const sentenceBefore = await page.evaluate(() => document.querySelector('#level .occ-detail .statline')?.textContent.trim() ?? null);
  ok(/^No trace captured for this day/.test(sentenceBefore || ''), `D1 before: the no-trace sentence shows (${sentenceBefore})`);
  is(await traceSeries(page), null, 'D1 before: no "That day" series while the fetch is in flight');
  ok(/^Window /.test(before.chip || ''), 'D1 before: the drawn window still stands');
  is(before.dock.kind, 'Plan · staged', 'D1 before: the staged item still stands');

  // let the delayed response resolve and the in-place repaint run
  await settle(page, 1800);
  const after = await state(page);
  is(after.crumb.length, 2, 'D1 after: STILL at the drilled factor — not thrown back to the opening level');
  const sentenceAfter = await page.evaluate(() => document.querySelector('#level .occ-detail .statline')?.textContent.trim() ?? null);
  is(sentenceAfter, 'The canvas shows this day\'s own CGM trace over the pooled envelope.',
    'D1 after: the real-trace explanation replaces the no-trace one');
  is(await traceSeries(page), D_CGM_VALUES,
    'D1 after: the "That day" series carries EXACTLY the stub\'s CGM values');
  is(after.chip, before.chip, 'D1 after: the same drawn window chip/brace remains');
  is(after.dock.kind, 'Plan · staged', 'D1 after: the same staged Plan item remains');
  // node identity is the teardown proof: a whole-surface remount would replace
  // these nodes, so a surviving reference means the repaint was in place
  const sameLevel = await levelBefore.evaluate((el) => el === document.getElementById('level') && el.isConnected);
  const sameChart = await chartBefore.evaluate((el) => el === document.getElementById('chart') && el.isConnected);
  ok(sameLevel, 'D1 after: #level is the SAME connected node (no teardown)');
  ok(sameChart, 'D1 after: #chart is the SAME connected node (no teardown)');
};

/** D2 · An EXPLICIT empty /timeline ({ cgm: [] }) is the deliberate no-trace
    state — the level says so and NO 'That day' series is ever minted. Asserted
    against an explicit empty stub, not a catch-all 404. */
export const D2 = async (page) => {
  await page.route('**/timeline**', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ events: [], cgm: [] }),
  }));
  const setup = await setupWorkspaceAtFactor(page);
  const levelBefore = await page.$('#level');
  const chartBefore = await page.$('#chart');
  await page.click('#level .ev-row');
  await settle(page, 900);   // past any fetch — an empty day never repaints
  const after = await state(page);
  is(after.crumb.length, 2, 'D2 at the drilled factor, occurrence selected in place');
  const sentence = await page.evaluate(() => document.querySelector('#level .occ-detail .statline')?.textContent.trim() ?? null);
  ok(/^No trace captured for this day/.test(sentence || ''), `D2 the deliberate no-trace sentence shows (${sentence})`);
  is(await traceSeries(page), null, 'D2 no "That day" series for an empty day');
  is(after.chip, setup.chip, 'D2 the drawn window is untouched');
  is(after.dock.kind, 'Plan · staged', 'D2 the staged item is untouched');
  const sameLevel = await levelBefore.evaluate((el) => el === document.getElementById('level') && el.isConnected);
  const sameChart = await chartBefore.evaluate((el) => el === document.getElementById('chart') && el.isConnected);
  ok(sameLevel && sameChart, 'D2 #level/#chart keep their identity — an empty day never remounts');
};

/** D3 · A /timeline that 500s settles into the no-trace state without any
    teardown: depth 3 holds, the sentence stays no-trace, the #level/#chart nodes
    keep their identity, and the drawn window and staged item are unchanged. */
export const D3 = async (page) => {
  expectResponse(page, /^\/timeline$/, 500);
  await page.route('**/timeline**', (route) => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'boom' }),
  }));
  const setup = await setupWorkspaceAtFactor(page);
  const levelBefore = await page.$('#level');
  const chartBefore = await page.$('#chart');
  await page.click('#level .ev-row');
  await settle(page, 900);
  const after = await state(page);
  is(after.crumb.length, 2, 'D3 still at the drilled factor after a 500');
  const sentence = await page.evaluate(() => document.querySelector('#level .occ-detail .statline')?.textContent.trim() ?? null);
  ok(/^No trace captured for this day/.test(sentence || ''), `D3 the no-trace sentence stands after a 500 (${sentence})`);
  is(await traceSeries(page), null, 'D3 no "That day" series after a failed fetch');
  is(after.chip, setup.chip, 'D3 the drawn window is unchanged');
  is(after.dock.kind, 'Plan · staged', 'D3 the staged item is unchanged');
  const sameLevel = await levelBefore.evaluate((el) => el === document.getElementById('level') && el.isConnected);
  const sameChart = await chartBefore.evaluate((el) => el === document.getElementById('chart') && el.isConnected);
  ok(sameLevel && sameChart, 'D3 #level/#chart keep their identity — a 500 never remounts');
  is((expectedResponses.get(page) || []).length, 0,
    'D3 the deliberately induced /timeline response returned exactly 500');
};

/** S24 · ONE ranked findings queue at level 1: settings and habits interleave in a
    single list under the crumb root `Findings`, every row carries its flavor tag at
    one constant x, no hairline separates any row, and a pressed preset and a drawn
    brace re-scope it IN PLACE and identically — crumb, chip and queue always agree.
    ADDED #735 with lock terms 34-45 (the #662 re-settle's owed behaviour sweep). */
// LOCK:diagnose-workstation:34 LOCK:diagnose-workstation:36 LOCK:diagnose-workstation:37 LOCK:diagnose-workstation:43 LOCK:diagnose-workstation:44 LOCK:diagnose-workstation:45
export const S24 = async (page) => {
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
  is(preset.crumbMeta, `${preset.queue.length} in this window`, 'S24 the scoped meta form');
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
  const drawn = await state(page);
  is(drawn.crumb, ['Findings'], 'S24 a drawn window is not a level either');
  is(drawn.crumbMeta, `${drawn.queue.length} in this window`, 'S24 identical meta grammar to the preset');
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

/** S27 · The findings chips render the four server-published global counts. */
// STORY:finding-evidence-routing:S27
export const S27 = async (page) => {
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settle(page, 450);
  const chips = await page.locator('#seg-chips button').allTextContents();
  is(chips, ['Highs 4', 'Lows 1', 'Meals 1', 'Corrections 1'],
    'S27 the four chips spell the server-published global counts');
};

/** S28 · Removing a chip hides only rows that carry no remaining selected chip. */
// STORY:finding-evidence-routing:S28
export const S28 = async (page) => {
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settle(page, 450);
  await page.getByRole('button', { name: 'Highs 4', exact: true }).click();
  await settle(page, 350);
  const ids = await page.locator('#level .qrow').evaluateAll((rows) => rows.map((row) => row.dataset.id));
  is(ids, ['finding:correction_on_iob', 'finding:late_bolus'],
    'S28 a deselected Highs chip hides high-only rows while preserving multi-chip matches');
};

/** S29 · A sift collapses the held/blind group, which can expand in place. */
// STORY:finding-evidence-routing:S29
export const S29 = async (page) => {
  await page.getByRole('button', { name: 'Overnight', exact: true }).click();
  await settle(page, 450);
  await page.getByRole('button', { name: /^Highs / }).click();
  await settle(page, 350);
  const toggle = page.locator('#level .qcollapse');
  is(await toggle.innerText(), '4 held or blind reads', 'S29 the sift collapses held/blind reads');
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
  await page.getByRole('button', { name: /^Highs / }).click();
  await settle(page, 350);
  is(await page.locator('#level .quiet-line.sift-empty').innerText(),
    'No findings match the current chips.', 'S30 the all-hidden sift names itself');
  is(await page.locator('#level .qcollapse').innerText(), '4 held or blind reads',
    'S30 the collapsed held group remains reachable below the empty-sift line');
};

/** S31 · The correction-factor row declares its whole-day scope. */
// STORY:finding-evidence-routing:S31
export const S31 = async (page) => {
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

/** The frozen findings-projection inputs — the one committed fixture holding a
    finding whose episodes span two families. Served to BOTH the queue and the
    exposures feed, because a finding's evidence keys only join to the
    population they were published over. */
const twoFamilyInputs = async () => JSON.parse(await readFile(
  join(ROOT, 'frontend/__fixtures__/findings-projection.json'), 'utf8')).inputs;

/** Open one finding's case file from the queue, by the title a reader sees.
    Waits for the window's own rows to be in hand first: the queue is a server
    round trip, and clicking a row from the previous window's answer would be
    testing the wrong population. */
const clickQueueRow = async (page, title) => {
  await page.waitForFunction(() => document.getElementById('level')?.dataset.loading !== 'true');
  const at = await page.evaluate((want) => [...document.querySelectorAll('#level .qrow')]
    .findIndex((row) => row.querySelector('.lab')?.textContent.trim() === want), title);
  if (at < 0) fail(`the queue holds no row titled ${title}`);
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

/** S32 · #57 — selecting a roster occurrence under `By event` draws it. The
    roster carries the shared (episode, instant) key; the endpoint owns its own
    opaque catalog id and reuses that pair across several occurrences, so the
    selection is resolved to an id through the projection already in hand
    rather than assumed unique. */
// STORY:finding-evidence-routing:S32
export const S32 = async (page) => {
  await clickQueueRow(page, 'Carb undercount');
  const opened = await state(page);
  ok(opened.evRows > 0, 'S32 precondition: the roster has a row to select');
  ok(opened.alignShown, 'S32 precondition: ALIGN is offered on this case file');
  await page.click('#seg-align button:nth-child(2)');
  await page.locator('.ec-surface').waitFor();
  await settle(page, 600);
  const request = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname === '/diagnose/event-comparison' && url.searchParams.has('occ');
  });
  await page.click('#level .ev-row');
  const requested = new URL((await request).url()).searchParams.get('occ');
  await settle(page, 800);
  const drawn = await page.evaluate(() => {
    const exposed = window.__diagnoseEventComparison;
    const selection = exposed?.projection?.selection || null;
    const selected = selection?.detail || null;
    const catalog = (exposed?.projection?.occurrences || [])
      .filter((o) => o.identity.ep_id === selected?.identity?.ep_id
        && o.identity.t === selected?.identity?.t)
      .map((o) => o.identity.id);
    const trace = (exposed?.chart.getOption().series || [])
      .find((series) => series.name === 'Selected occurrence');
    return {
      row: document.querySelector('#level .ev-row[aria-pressed="true"] .when')?.textContent.trim() ?? null,
      ep: selected?.identity?.ep_id ?? null,
      t: selected?.identity?.t ?? null,
      id: selected?.identity?.id ?? null,
      join: selected ? `${new Date(`${selected.anchor.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${selected.identity.t.slice(11, 16)}` : null,
      state: selection?.state ?? null,
      catalog,
      trace: trace?.data ?? null,
      responseTrace: selected?.glucose?.map((point) => [point.minute, point.bg]) ?? null,
    };
  });
  is(drawn.state, 'selected', 'S32 the endpoint resolved a selection');
  is(drawn.ep, ROSTER_MEAL.ep_id, 'S32 the event canvas selected the episode the roster row names');
  is(drawn.t, ROSTER_MEAL.t, "S32 ... at that row's own instant");
  is(drawn.join, drawn.row, 'S32 the selected response carries the visible roster row\'s join key');
  ok(drawn.catalog.length > 1,
    `S32 precondition: the (episode, instant) pair is NOT a unique address (${drawn.catalog.length} catalog ids)`);
  ok(drawn.catalog.includes(drawn.id), 'S32 the selection travels by one of those catalog ids');
  is(requested, drawn.id, 'S32 the browser request carried the resolved opaque occurrence id');
  is(drawn.trace, drawn.responseTrace, 'S32 the drawn trace carries that selected response');
};

/** S40 · #64 — the visible lows roster and By event canvas select the same
    shared-population occurrence. The row's episode-and-time pair joins the
    response and trace; the browser request still travels by the endpoint's
    opaque occurrence id. */
// STORY:finding-evidence-routing:S40
export const S40 = async (page) => {
  await clickQueueRow(page, 'Over-treated low');
  const opened = await state(page);
  ok(opened.evRows > 0, 'S40 precondition: the low roster has a visible row to select');
  ok(opened.alignShown, 'S40 precondition: ALIGN is offered on this low case file');
  await page.click('#seg-align button:nth-child(2)');
  await page.locator('.ec-surface').waitFor();
  await settle(page, 600);
  const request = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname === '/diagnose/event-comparison' && url.searchParams.has('occ');
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
      id: selected?.identity?.id ?? null,
      kind: selected?.identity?.kind ?? null,
      join: selected ? `${new Date(`${selected.anchor.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${selected.identity.t.slice(11, 16)}` : null,
      state: selection?.state ?? null,
      trace: trace?.data ?? null,
      responseTrace: selected?.glucose?.map((point) => [point.minute, point.bg]) ?? null,
    };
  });
  is(drawn.state, 'selected', 'S40 the endpoint resolved the visible low row');
  is(drawn.kind, 'low', 'S40 the selected response is a low occurrence');
  is(drawn.join, drawn.row, 'S40 the selected response carries the visible low row\'s join key');
  is(requested, drawn.id, 'S40 the browser request carried the resolved opaque occurrence id');
  is(drawn.trace, drawn.responseTrace, 'S40 the drawn trace carries that selected low response');
};

const TRUE_ISF_DRAFTS = [];

/** S41 · A recommendation-bearing false ISF verdict keeps its
    direction-derived register but exposes no queue action line or stage control. */
// STORY:finding-evidence-routing:S41
export const S41 = async (page) => {
  const row = page.locator('#level .qrow[data-id="isf"]');
  is(await row.getAttribute('data-state'), 'assert', 'S41 direction still owns the queue register');
  is(await row.locator('.den.nums').count(), 0, 'S41 the queue has no numeric action line');
  await row.click();
  await settle(page, 450);
  is((await state(page)).stage, null, 'S41 false offers no stage control');
  is(await page.locator('#level .numrow').nth(2).locator('b').innerText(), '--',
    'S41 Recommended keeps its reserved empty row');
  ok(/corrections look stronger than needed/i.test(await page.locator('#level').innerText()),
    'S41 direction-only weaken keeps its direction language');
};

/** S42 · A legacy ISF row with no verdict fails closed exactly like
    explicit false while keeping its direction and refusal evidence. */
// STORY:finding-evidence-routing:S42
export const S42 = async (page) => {
  const row = page.locator('#level .qrow[data-id="isf"]');
  is(await row.getAttribute('data-state'), 'assert', 'S42 legacy direction still owns the register');
  is(await row.locator('.den.nums').count(), 0, 'S42 legacy queue has no numeric action line');
  await row.click();
  await settle(page, 450);
  is((await state(page)).stage, null, 'S42 missing verdict offers no stage control');
  const text = await page.locator('#level').innerText();
  ok(/Corrections keep overshooting into lows/.test(text), 'S42 analyzer evidence remains visible');
  ok(/recent lows make a new number unsafe to suggest/i.test(text), 'S42 refusal language remains visible');
};

/** S43 · A strengthen step rounded back to the current Correction factor names that
    no-op rather than borrowing weaken/recent-low refusal copy. */
// STORY:finding-evidence-routing:S43
export const S43 = async (page) => {
  const row = page.locator('#level .qrow[data-id="isf"]');
  is(await row.locator('.den.nums').count(), 0, 'S43 rounded no-op has no queue action line');
  await row.click();
  await settle(page, 450);
  const text = await page.locator('#level').innerText();
  is((await state(page)).stage, null, 'S43 rounded no-op offers no stage control');
  ok(/conservative step rounds to the current Correction factor/.test(text),
    'S43 names the rounding hold in sanctioned user language');
  ok(!/programmed factor/i.test(text), 'S43 never exposes the retired user phrase');
  ok(!/recent lows|stronger than needed/i.test(text), 'S43 never claims weaken or recent lows');
};

/** S44 · Exact true stages the capped ISF recommendation across
    every segment of the generated profile, then reports the same Plan count. */
// STORY:finding-evidence-routing:S44
export const S44 = async (page) => {
  TRUE_ISF_DRAFTS.length = 0;
  const row = page.locator('#level .qrow[data-id="isf"]');
  is(await row.locator('.den.nums').count(), 1, 'S44 exact true keeps the queue action line');
  await row.click();
  await settle(page, 450);
  ok((await state(page)).stage?.startsWith('Stage change'), 'S44 exact true exposes the real stage control');
  await page.locator('#level .stagebtn').click();
  await page.waitForFunction(() => document.querySelector('#plan-badge')?.textContent.trim() === '4');
  await settle(page, 100);
  is(TRUE_ISF_DRAFTS, [{ items: [
    { type: 'isf', key: 0, start_min: 0, label: '00:00', current: 42, recommended: 33.6, value: 33.6 },
    { type: 'isf', key: 360, start_min: 360, label: '06:00', current: 45, recommended: 33.6, value: 33.6 },
    { type: 'isf', key: 780, start_min: 780, label: '13:00', current: 38, recommended: 33.6, value: 33.6 },
    { type: 'isf', key: 1200, start_min: 1200, label: '20:00', current: 50, recommended: 33.6, value: 33.6 },
  ] }], 'S44 PUT /plan carries one unchanged capped value per generated segment');
  is((await state(page)).badge, '4', 'S44 Plan badge matches the persisted fan-out');
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
  is(event.canvasHead, { ...originalRect, title: 'Low response comparison', label: 'Over-treated low', hover: '0' }, 'S33 By event replaces the exact shared header rectangle and finding label');
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
  is(restored.canvasHead.title, 'Low response comparison', 'S33 event pointer restores the comparison title');
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
  await clickQueueRow(page, 'Late bolus');
  const originalClock = await state(page);
  const originalRect = originalClock.canvasHead;
  await page.click('#seg-align button:nth-child(2)');
  await settle(page, 900);
  const after = await state(page);
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
  is(after.crumb[after.crumb.length - 1], 'Late bolus', 'S34 the reader is left on the finding');
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
    window.__diagnoseEventComparison?.projection?.coordinates?.view ?? null);
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
  is(narrowed.pressed, ['Overnight'], 'S36 the window narrowed');
  is(narrowed.crumb[narrowed.crumb.length - 1], 'Late bolus', 'S36 the reader stays on the finding');
  is(narrowed.levelEmpty, 'No findings in the selected window', 'S36 the inspector says so');
  is(narrowed.scope, 'No findings in the selected window', 'S36 and the canvas says the same');
  is(narrowed.levelStat, null, 'S36 no previous window content is left standing');
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
  ok(/\b1 of 3 meal responses in 14:00–16:00 · 2 not attributed\b/.test(panel.levelStat || ''),
    `S37 the panel preserves the drawn window's three-meal population (${panel.levelStat})`);
  const ticks = await marks(page, 'Occurrences');
  is(ticks.length, 1, 'S37 the canvas draws exactly that one occurrence');
  is(ticks[0].meta.t, LATE_MEAL.t, 'S37 ... whose own trigger is at 13:00, outside the window');
  await page.click('#seg-align button:nth-child(2)');
  await page.locator('.ec-surface').waitFor();
  await settle(page, 700);
  const chart = await page.evaluate(() => {
    const projection = window.__diagnoseEventComparison?.projection;
    return {
      label: projection?.coordinates?.window?.label ?? null,
      scoped: projection?.coordinates?.window?.scoped ?? null,
      denominator: projection?.population?.denominator ?? null,
      caption: document.querySelector('.ec-window-context')?.textContent.trim() ?? null,
    };
  });
  is(chart.scoped, true, 'S37 the projection answered for a scoped window');
  is(chart.label, '14:00–16:00', 'S37 the chart counted the reader\'s own window');
  is(chart.denominator, 3, 'S37 ... and counted the same three-meal population the panel did');
  is(chart.caption, null, "S37 RETIRED 2026-08-20 Connor Griffin: Drop all that shit. It's a chart.");
};


/** S38 · A published finding whose event-view family holds NONE of this
    window's evidence still opens, framed on that family. A lever claims
    evidence only in the families it hit, so `Correction on active insulin` over
    07:00-10:15 carries one correction cluster and no low, while its event view
    names `lows`. Framing on nothing left a row the server published that did
    not move when it was clicked: no case file, no message, no crumb. Framing on
    the family holding more episodes instead is NOT the repair — that is the
    panel/chart disagreement this rule exists to retire. */
// STORY:finding-evidence-routing:S38
export const S38 = async (page) => {
  const opening = await state(page);
  is(opening.pressed, ['Overnight'], 'S38 precondition: opens on the Overnight preset');
  await drawWindow(page, [420, 615], [0, 360]);
  const drawn = await state(page);
  is(drawn.chip, 'Window 07:00–10:15', `S38 the reader drew 07:00–10:15 (${drawn.chip})`);
  ok(drawn.queue.some((row) => row.title === 'Correction on active insulin'),
    'S38 precondition: the server published this row for this window');
  await clickQueueRow(page, 'Correction on active insulin');
  const opened = await state(page);
  is(opened.crumb[opened.crumb.length - 1], 'Correction on active insulin',
    'S38 the published row opens rather than swallowing the click');
  ok(/\b0 of 0 low episodes in 07:00–10:15\b/.test(opened.levelStat || ''),
    `S38 it frames on the family its event view names, empty and saying so (${opened.levelStat})`);
  ok(!/correction cluster/i.test(opened.levelStat || ''),
    `S38 ... not on the family that happens to hold this window's evidence (${opened.levelStat})`);
  is(opened.bandKeys, [],
    'S38 no verdict split is drawn for a family the server published no split for');
};

/** S39 · A window change ASKS the server for its rows, and until they land the
    pane counts nothing rather than counting the window that just left. Showing
    the previous population under the new window's label is a caption asserting
    a population the canvas did not draw. */
// STORY:finding-evidence-routing:S39
export const S39 = async (page) => {
  await clickQueueRow(page, 'Late bolus');
  const before = await state(page);
  ok(/\b2 of 20 meal responses in 00:00–24:00 · 18 not attributed\b/.test(before.levelStat || ''),
    `S39 precondition: the whole-day population is on screen (${before.levelStat})`);
  await page.click('#seg-window button:nth-child(3)');   // Afternoon
  await settle(page, 250);                               // inside the flight
  const during = await state(page);
  is(during.levelLoading, 'true', 'S39 the pane declares it is waiting on the server');
  is(during.levelStat, null, "S39 the previous window's counts are withdrawn");
  is(during.levelEmpty, 'Counting 12:00–18:00…', 'S39 the pane names the window it is counting');
  is(during.crumbMeta, '12:00–18:00', 'S39 the meta prints the window with no numbers under it');
  ok(!/\b2 of 20\b/.test(JSON.stringify(during)), 'S39 no stale count survives anywhere on the pane');
  await settle(page, 1400);
  const after = await state(page);
  is(after.levelLoading, 'false', 'S39 the wait ends when the rows land');
  ok(/ meal responses in 12:00–18:00\b/.test(after.levelStat || ''),
    `S39 the new window's own counts land under its own label (${after.levelStat})`);
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
// STORY:finding-evidence-routing:D1
// STORY:finding-evidence-routing:D2
// STORY:finding-evidence-routing:D3

/** Each story names the state it must open in, and — where the shipped payload
    cannot pose its shape — the synthetic override it opens on. */
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
  ['S34', S34, 'dense', { comparisonStatus: 500 }],
  ['S35', S35, 'dense', {
    findingsInputs: twoFamilyInputs,
    exposuresInputs: async () => (await twoFamilyInputs()).exposures,
  }],
  ['S36', S36, 'dense'],
  ['S37', S37, 'typical', {
    findingsInputs: withLateConsequence,
    exposuresInputs: (d) => withLateConsequence(d).exposures,
  }],
  ['S38', S38, 'typical'],
  ['S39', S39, 'dense', { findingsDelayMs: 900 }],
  ['S40', S40, 'typical'],
  ['S41', S41, 'typical', {
    analysisInputs: (analysis) => withIsfVerdict(analysis, {
      direction: 'weaken', recommended: 47, assertsMove: false,
      annotation: 'Corrections keep overshooting into lows, so the correction factor eases weaker.',
    }),
  }],
  ['S42', S42, 'typical', {
    analysisInputs: (analysis) => withIsfVerdict(analysis, {
      direction: 'weaken', recommended: 47, omitVerdict: true,
      annotation: 'Corrections keep overshooting into lows, so the correction factor eases weaker.',
    }),
    findingsProjectionInputs: withoutIsfProjectionVerdict,
  }],
  ['S43', S43, 'typical', {
    analysisInputs: (analysis) => withIsfVerdict(analysis, {
      direction: 'strengthen', recommended: 42, assertsMove: false,
      annotation: 'The conservative strengthen step rounds to the current Correction factor.',
    }),
  }],
  ['S44', S44, 'typical', {
    analysisInputs: (analysis) => withIsfVerdict(analysis, {
      direction: 'strengthen', recommended: 33.6, assertsMove: true,
      annotation: 'A conservative recommendation, capped to one ≤20% step from current.',
    }),
    pumpSettingsInputs: derivedPumpSettings,
    onPlanDraft: (draft) => TRUE_ISF_DRAFTS.push(draft),
  }],
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
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  const results = [];
  for (const [id, fn, want, options] of STORIES) {
    if (only && !only.has(id)) continue;
    const page = await openApp(browser, { state: want, ...(options || {}), appSource: 'server' });
    try {
      const note = await fn(page);
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
