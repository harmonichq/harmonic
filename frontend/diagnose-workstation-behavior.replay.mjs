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
  return {
    chip: q('#seg-window [data-follow]')?.textContent.replace('×', '').trim() || null,
    pressed: [...document.querySelectorAll('#seg-window button')]
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent.replace('×', '').trim()),
    crumb: [...document.querySelectorAll('#crumb-trail > *')]
      .map((n) => n.textContent.trim()).filter((t) => t !== '›'),
    crumbMeta: txt('#crumb-meta'),
    scope: txt('#canvas-scope'),
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
  appSource = 'server',
} = {}) {
  const payloadPath = process.env.PAYLOAD || fail('PAYLOAD is required for TARGET=app');
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
  const STUBS = [
    // #698: the endpoint serves the bounded server-owned projection per
    // coordinate; exposures ride on their own #654 endpoint again.
    [/^\/diagnose\/event-comparison/, (url) => projectSyntheticCapture(capture, {
      view: url.searchParams.get('view') || 'meals',
      factor: url.searchParams.get('factor') || undefined,
      block: url.searchParams.get('block') || 'all',
      another: url.searchParams.get('another') === '1',
      occurrenceId: url.searchParams.get('occ') || undefined,
    })],
    /* #735: the findings queue is a SERVER-owned projection (ADR 730) and the
       browser gates have no Python, so the stub answers from the fixture-only JS
       mirror, which `frontend/findings-projection-mirror.test.js` deep-compares
       against the real projection's own frozen output window for window. */
    [/^\/diagnose\/findings/, (url) => projectFindings(
      findingsInputs || { analysis: payload.analyze, exposures: payload.exposures, scenarios: payload.scenarios },
      url.searchParams.get('start_min') === null ? null : {
        start_min: Number(url.searchParams.get('start_min')),
        end_min: Number(url.searchParams.get('end_min')),
      })],
    [/^\/explore\/exposures/, () => payload.exposures],
    [/^\/analyze/, () => payload.analyze],
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
    [/^\/pump/, () => ({ settings: {} })],
  ];
  const page = await browser.newPage({ viewport });
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
// STORY:finding-evidence-routing:D1
// STORY:finding-evidence-routing:D2
// STORY:finding-evidence-routing:D3

/** Each story names the state it must open in. */
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
  ['S26', S26, 'dense'],
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
  for (const [id, fn, want] of STORIES) {
    if (only && !only.has(id)) continue;
    const page = await openApp(browser, { state: want });
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
