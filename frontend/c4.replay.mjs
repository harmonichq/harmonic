// Amendment 1 acceptance: real manufactured records, served by the app.
import { waitForReplayAssertion } from './replay-assertions.mjs';
import assert from 'node:assert/strict';
import { xAtMinute } from './diagnose-workstation-chart.js';
import { boundedWait, C2_STORIES, waitForCharts, waitForDesk } from './c2.replay.mjs';
import { C3_STORIES } from './c3.replay.mjs';
import { captureStory } from './capture.mjs';

const read = async (page, path, params = {}, timeout = 30000) => {
  const url = new URL(path, page.url());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await page.request.get(url.href, { timeout });
  assert.equal(response.status(), 200, `${path}: ${await response.text()}`);
  return response.json();
};
const press = async (page, selector) => {
  const node = page.locator(selector).filter({ visible: true }).first();
  await node.waitFor({ timeout: 30000 }); await node.click();
};
const settled = async page => {
  await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
};
async function capture(page, ctx, id, caseName) {
  if (process.env.CAPTURE_DIR) await captureStory(page, {
    directory: process.env.CAPTURE_DIR, id, target: 'app', viewport: ctx.viewport, caseName,
  });
}
async function retained(page) {
  const roster = await read(page, '/api/verify/trials');
  assert.ok(roster.trials.length, 'manufactured case must retain a Trial');
  const id = roster.admission.active_kind === 'trial' ? roster.admission.active_id : roster.trials[0].id;
  // #404 tracks S91's cold profile reassessment: rebuilding both evidence
  // periods and bootstrapping mean glucose/variability exceeded 30 s in CI.
  const detail = (await read(page, '/api/verify/trials', { selected: id, assessment: 'retained' },
    roster.trials.some(trial => trial.id === id && trial.parameter === 'profile') ? 120000 : undefined)).selected;
  await page.goto(new URL(`/?to=changes&subject=history&occurrence=${encodeURIComponent(`record:trial:${id}`)}`, page.url()).href);
  await press(page, '[data-assessment="retained"]');
  await page.locator('[data-reassessment-context="retained"]').waitFor({ timeout: 30000 });
  return detail.reassessment.comparison;
}
// #413: land on the rail at 24 h without drilling into any row — S113/S114's
// `openBasalLane`/`heldRequest414` both open something specific; this story
// pair needs the plain rail listing itself.
async function openDiagnoseRail(page) {
  await press(page, 'nav.v2-nav [data-destination="diagnose"]');
  await page.waitForFunction(() =>
    document.querySelector('nav.v2-nav [aria-current="page"]')?.dataset.destination === 'diagnose');
  await settled(page);
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settled(page);
}
async function readiness(page, unit, required) {
  const comparison = await retained(page);
  await waitForReplayAssertion(async seen => {
    for (const side of ['before', 'after']) {
      const arm = comparison.readiness[side];
      assert.equal(arm.unit, unit); assert.equal(arm.required, required);
      const node = page.locator(`[data-readiness="${side}"]`);
      assert.equal(seen(await node.getAttribute('data-criterion-met')), String(arm.criterion_met));
      const copy = seen(await node.innerText());
      assert.ok(copy.includes(unit)); assert.ok(copy.includes(String(arm.observed)));
      if (arm.reason) assert.ok(copy.includes(arm.reason));
    }
  }, "readiness");
  return comparison;
}

// #404 · 2026-09-10. These are prospective fail-first obligations; browser
// verdicts belong to the coordinator. No app response is replaced by a fixture.
async function drawnWindow404(page) {
  // Seed two interior edges with known minutes. Like drawWindow /
  // resizeWindowStart in the workstation replay, solve pixels from the standing
  // brace. Afternoon avoids the 24 h edge clamped to the last 23:45 category.
  await page.getByRole('button', { name: 'Afternoon', exact: true }).click();
  let grips = await laidOutBrace404(page, { label: 'Afternoon', range: [720, 1080] });
  const moves = [
    ['b', 720, 1080, 1290, '12:00–21:30'],
    ['a', 720, 1290, 930, '15:30–21:30'],
  ];
  for (const [index, [edge, from, to, target, span]] of moves.entries()) {
    const perMinute = (grips.b.x - grips.a.x) / (to - from);
    assert.ok(perMinute > 0, '#404 drawn-window premise: laid-out brace edges must be ordered');
    await page.mouse.move(grips[edge].x, grips[edge].y);
    await page.mouse.down();
    try {
      const targetX = grips.a.x + (target - from) * perMinute;
      await page.mouse.move(targetX, grips[edge].y, { steps: 8 });
      // Playwright's stepped move can leave the chart's frame coordinator at
      // its penultimate sample. Re-send the physical drag's final coordinate
      // before observing the live chip; pointerup would otherwise cancel that
      // outstanding repaint and make the accepted endpoint nondeterministic.
      await page.mouse.move(targetX, grips[edge].y);
      // Pointerup cancels a queued drag repaint. Observe the snapped live chip
      // BEFORE release, so the final pointer move has actually been applied.
      await drawnChip404(page, span);
    } finally { await page.mouse.up(); }
    await settled(page);
    await drawnChip404(page, span);
    if (index + 1 < moves.length) grips = await laidOutBrace404(page);
  }
}
async function laidOutBrace404(page, expected = null) {
  await settled(page);
  const width = await page.locator('#chart').evaluate(node => node.clientWidth);
  const positions = expected && expected.range.map(minute => xAtMinute({ clientWidth: width }, minute));
  // A loading flag can clear before a queued control repaint begins. Wait for
  // the actual named preset and its shared-chart brace, then sample it again;
  // dragging the old 24 h brace commits a whole day and removes the follow chip.
  await page.waitForFunction(async ({ label, width, positions: wanted }) => {
    await document.fonts.ready;
    const plot = document.querySelector('#chart');
    const handles = ['a', 'b'].map(edge => document.querySelector(`#grip-${edge}`));
    const chart = plot && globalThis.echarts.getInstanceByDom(plot);
    const selected = label == null || [...document.querySelectorAll('#seg-window button[aria-pressed="true"]')]
      .some(button => button.textContent.trim() === label);
    if (!chart || !selected || handles.some(handle => !handle)
      || document.querySelector('#brace')?.hidden || plot.clientWidth !== width) return false;
    const idle = () => chart.getZr().animation.isFinished() && !document.getAnimations().some(animation =>
      (animation.playState === 'running' || animation.pending)
      && animation.effect?.getComputedTiming().iterations !== Infinity);
    const boxes = () => [plot, ...handles].flatMap(node => {
      const box = node.getBoundingClientRect();
      return [box.x, box.y, box.width, box.height];
    });
    if (!idle() || wanted && handles.some((handle, index) =>
      Math.abs(parseFloat(handle.style.left) - wanted[index]) > .5)) return false;
    const beforeBoxes = boxes();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return idle() && boxes().every((value, index) => Math.abs(value - beforeBoxes[index]) < .25);
  }, { label: expected?.label ?? null, width, positions }, { timeout: 10000 });
  const measured = await readBrace404(page);
  if (expected) {
    assert.equal(measured.selected, expected.label,
      `#404 drawn-window premise: ${expected.label} must remain selected before dragging`);
    const wanted = expected.range.map(minute => xAtMinute({ clientWidth: measured.width }, minute));
    for (const [index, edge] of ['a', 'b'].entries()) assert.ok(
      Math.abs(measured.grips[edge].left - wanted[index]) <= .5,
      `#404 drawn-window premise: ${expected.label} brace must span 12:00–18:00 before dragging`,
    );
  }
  return measured.grips;
}
const readBrace404 = page => page.locator('#chart').evaluate(node => {
  const selected = [...document.querySelectorAll('#seg-window button[aria-pressed="true"]')]
    .find(button => button.textContent.trim());
  return {
    width: node.clientWidth,
    selected: selected?.textContent.trim() ?? null,
    grips: Object.fromEntries(['a', 'b'].map(edge => {
      const handle = document.querySelector(`#grip-${edge}`);
      const box = handle.getBoundingClientRect();
      return [edge, { x: box.x + box.width / 2, y: box.y + box.height / 2,
        left: parseFloat(handle.style.left) }];
    })),
  };
});
async function drawnChip404(page, span) {
  try {
    await page.waitForFunction(expected => {
      const text = document.querySelector('#seg-window [data-follow]')?.textContent;
      return text?.replace(/^Window\s+/, '').replace('×', '').trim() === expected;
    }, span, { timeout: 7000 });
  } catch {
    const seen = await page.locator('#seg-window').evaluate(node =>
      node.querySelector('[data-follow]')?.textContent.trim() ?? '(absent)');
    assert.fail(`#404 drawn-window premise: expected ${span}; chip seen: ${seen}`);
  }
}
async function slot404(page) {
  // pattern-near-tie has a Pattern and a thin 12:00 slot. Select the Pattern through
  // its chart control first; checking only aria-pressed missed this regression.
  const preparation = await read(page, '/api/diagnose/finding-case-file-preparation');
  const pattern = preparation.rendered_rows.find(row => row.kind === 'pattern' && row.pattern_chart);
  assert.ok(pattern, 'S102 premise: a chartable served Pattern exists');
  await page.getByRole('button', { name: 'All charts', exact: true }).click();
  await press(page, `#tile-row .evidence-tile[data-chart-id="${pattern.id}"]`);
  await page.locator(`#tile-focal .evidence-tile[data-chart-id="${pattern.id}"]`).waitFor();
  const slot = page.getByRole('button', { name: /^12:00 basal slot,/ });
  assert.match(await slot.getAttribute('data-verdict'), /insufficient|nodata/,
    'S102 premise: 12:00 is a thin slot, not an asserting chart');
  await slot.click();
  await page.waitForFunction(() => document.querySelector('#lane > button[aria-pressed="true"]')?.getAttribute('aria-label')?.startsWith('12:00 basal slot,'));
  return pattern.id;
}
async function selectedPattern404(page) {
  await fullDayDiagnose(page);
  const preparation = await read(page, '/api/diagnose/finding-case-file-preparation');
  const pattern = preparation.rendered_rows.find(row => row.kind === 'pattern' && row.pattern_chart);
  assert.ok(pattern, 'S106 premise: a chartable served Pattern exists');
  await page.getByRole('button', { name: 'All charts', exact: true }).click();
  await press(page, `#tile-row .evidence-tile[data-chart-id="${pattern.id}"]`);
  await page.locator(`#tile-focal .evidence-tile[data-chart-id="${pattern.id}"]`).waitFor({ timeout: 30000 });
  const occurrence = await selectOccurrence(page);
  const file = await read(page, '/api/diagnose/finding-case-file', {
    projection_id: preparation.projection_id, finding_id: pattern.id, alignment: 'event', occ: occurrence,
  });
  const detail = file.selection?.detail;
  assert.ok(Array.isArray(detail?.glucose) && detail.glucose.length,
    'S106 premise: selected Pattern detail supplies glucose');
  assert.ok(Array.isArray(detail?.markers) && detail.markers.length,
    'S106 premise: selected Pattern detail supplies markers');
  await waitForCharts(page);
  const observed = await page.evaluate(() => {
    const host = document.querySelector('#tile-focal .tile-chart');
    const chart = host && globalThis.echarts.getInstanceByDom(host);
    if (!chart) throw new Error('S106 focal Pattern ECharts instance is absent');
    const label = value => typeof value === 'string' ? value
      : typeof value?.formatter === 'string' ? value.formatter : '';
    const point = (value, source, series) => {
      const valueAt = value?.coord ?? value?.value ?? value;
      const coords = Array.isArray(valueAt) ? valueAt : [];
      const x = Number.isFinite(value?.xAxis) ? value.xAxis : coords[0];
      const y = Number.isFinite(value?.yAxis) ? value.yAxis : coords[1];
      const labels = [value?.name, label(value?.label), series.name, series.id].filter(Boolean).join(' ');
      const style = source === 'line' ? { ...series.lineStyle, ...value?.lineStyle }
        : { ...series.itemStyle, ...value?.itemStyle };
      const visible = source === 'line'
        ? style.opacity !== 0 && style.type !== 'none'
        : series.symbol !== 'none' && series.symbolSize !== 0 && style.opacity !== 0;
      return { source, x, y, labels, visible };
    };
    const series = chart.getOption().series.map(series => ({
      id: series.id ?? null, data: Array.isArray(series.data) ? series.data : null,
      markers: [
        ...(series.type === 'scatter' ? (series.data || []).map(value => point(value, 'scatter', series)) : []),
        ...((series.markPoint?.data || []).map(value => point(value, 'markPoint', series))),
        ...((series.markLine?.data || []).map(value => point(value, 'line', series))),
      ],
    }));
    return { series, markers: series.flatMap(entry => entry.markers) };
  });
  const expected = {
    trace: detail.glucose.map(point => [point.minute, point.bg]),
    markers: detail.markers.map(marker => ({ minute: marker.minute, kind: marker.kind })),
  };
  const actual = {
    trace: observed.series.find(series => series.id === 'selected:trace')?.data ?? null,
    markers: observed.markers,
  };
  // Keep both served facts in one observation: a highlighted roster row alone
  // is not proof that its trace and event markers reached the focal option.
  const matches = expected.markers.every(marker => actual.markers.some(observation =>
    observation.x === marker.minute
      && (Number.isFinite(observation.y) || observation.source === 'line')
      && observation.visible && observation.labels.toLowerCase().includes(marker.kind.toLowerCase())));
  const failures = [];
  if (JSON.stringify(actual.trace) !== JSON.stringify(expected.trace) || !matches) failures.push({
    expected: { selectedTrace: expected.trace, servedMarkers: expected.markers },
    actual: { selectedTrace: actual.trace, markerObservations: actual.markers },
  });
  assert.deepEqual(failures, [], 'S106 selected Pattern focal option must carry the served trace and markers together');
  const focusStatus = page.locator('[data-focus-context]');
  await focusStatus.waitFor({ timeout: 30000 });
  const visible = await focusStatus.innerText();
  const reason = await focusStatus.getAttribute('title');
  assert.match(visible, /^(View Plan|View Trial|View Focus|Focus unavailable|Focus status unavailable)$/,
    `S106 selected Pattern parent must expose a compact reachable Focus action in Diagnose: ${visible}`);
  assert.ok(reason?.trim(), 'S106 selected Pattern parent must retain the backend withholding explanation');
  assert.doesNotMatch(`${visible} ${reason}`, /reconciliation_required|active_trial/,
    'S106 Focus withholding copy must not expose backend admission tokens');
}
const geometry404 = page => page.evaluate(() => {
  const box = node => {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      width: rect.width, height: rect.height };
  };
  const textBox = node => {
    const range = document.createRange(); range.selectNodeContents(node);
    const rect = range.getBoundingClientRect(); const clip = box(node);
    const clipped = getComputedStyle(node).overflowX !== 'visible';
    return { text: node.textContent.trim(), truncated: node.scrollWidth > node.clientWidth,
      left: clipped ? Math.max(clip.left, rect.left) : rect.left,
      right: clipped ? Math.min(clip.right, rect.right) : rect.right,
      top: rect.top, bottom: rect.bottom };
  };
  return {
    rail: box(document.querySelector('.v2-diagnose .panes > .inspector, .gf-desk > .gf-reading')),
    focal: [...document.querySelectorAll('#tile-focal .tile-head')].map(head => ({
      head: box(head), control: box(head.querySelector('.tile-fullscreen')),
    })),
    actions: [...document.querySelectorAll('#chart-headacts button[data-act]')].map(button => ({
      text: button.textContent.trim(), aria: button.getAttribute('aria-label'),
      label: box(button.querySelector('span')), icon: box(button.querySelector('svg')),
    })),
    cohortHeadings: [...document.querySelectorAll('#level .ev-group > b')]
      .map(heading => heading.textContent.trim()),
    rows: [...document.querySelectorAll('#level .case-occurrence')].map(row => {
      const only = row.querySelector('.only'); const tier = row.querySelector('.tier');
      return { comparisonCohort: row.dataset.comparisonCohort || null,
        description: only ? textBox(only) : null, tier: tier ? textBox(tier) : null };
    }),
  };
});

const overlap404 = (left, right) => ({
  x: Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)),
  y: Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)),
});

// Comparison membership is grouped by a constant served cohort name. Ordinary
// case rows instead retain their row-tier column, so the geometry witness must
// prove both rendered shapes rather than treating one as the other.
export function assertS107ComparisonGeometry(comparison, expectedCohorts) {
  assert.deepEqual(comparison.cohortHeadings, expectedCohorts.map(cohort => cohort.name),
    'S107 comparison headings must name the exact served cohorts once');
  const groupedRows = comparison.rows.filter(row => row.comparisonCohort);
  assert.ok(groupedRows.length, 'S107 premise: the long meal chart supplies comparison cohort rows');
  for (const row of groupedRows) {
    assert.ok(expectedCohorts.some(cohort => cohort.key === row.comparisonCohort),
      `S107 comparison row names an unknown cohort: ${row.comparisonCohort}`);
    assert.equal(row.tier, null, 'S107 comparison rows must not repeat their grouped cohort label');
    assert.ok(row.description?.text.includes('Completed carb bolus') && !row.description.truncated,
      `S107 comparison event text must remain fully readable: ${JSON.stringify(row.description)}`);
  }
}

export function assertS107TierGeometry(tierRows) {
  assert.ok(tierRows.length, 'S107 premise: the same meal case supplies ordinary tier rows');
  const labels = new Set(tierRows.map(row => row.tier?.text).filter(Boolean));
  assert.ok(labels.size > 1, `S107 needs mixed ordinary tier labels: ${JSON.stringify([...labels])}`);
  for (const row of tierRows) {
    assert.ok(row.description?.text.includes('Completed carb bolus') && !row.description.truncated
      && row.tier && !row.tier.truncated,
      `S107 ordinary event text and tier must remain fully readable: ${JSON.stringify(row)}`);
    const overlap = overlap404(row.description, row.tier);
    assert.equal(overlap.x > 0 && overlap.y > 0, false,
      `S107 ordinary description and tier columns overlap: ${JSON.stringify({ row, overlap })}`);
  }
}

export function assertS107RosterGeometry({ comparison, tierRows, expectedCohorts }) {
  assertS107ComparisonGeometry(comparison, expectedCohorts);
  assertS107TierGeometry(tierRows);
}

async function drillMeal404(page, alignment) {
  const meal = page.locator('#tile-row .evidence-tile[data-chart-id="finding:meal_bolus_short"]');
  assert.ok(await meal.count(), 'S107 premise: showcase supplies the long meal cohort chart');
  const response = page.waitForResponse(reply => {
    const url = new URL(reply.url());
    return url.pathname === '/api/diagnose/finding-case-file'
      && url.searchParams.get('finding_id') === 'finding:meal_bolus_short'
      && url.searchParams.get('alignment') === alignment && reply.ok();
  }, { timeout: 30000 });
  await meal.click();
  const served = await (await response).json();
  assert.equal(served.projection.alignment, alignment,
    `S107 meal drill must use the served ${alignment} case`);
  await page.waitForFunction(id => document.querySelector('#tile-focal .evidence-tile')?.dataset.chartId === id,
    'finding:meal_bolus_short', { timeout: 30000 });
  await settled(page); await page.locator('#level .case-occurrence').first().waitFor({ timeout: 30000 });
  return { served, geometry: await geometry404(page) };
}

async function deskGeometry404(page, destination) {
  await press(page, `nav.v2-nav [data-destination="${destination}"]`);
  await waitForDesk(page);
  const report = await geometry404(page);
  assert.ok(report.rail, `S107 premise: ${destination} publishes its reading rail`);
  return report.rail.width;
}

const compactControl404 = page => page.evaluate(() => {
  const fields = ['height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'borderTopWidth',
    'borderTopStyle', 'borderTopColor', 'borderRadius', 'backgroundColor', 'color', 'boxShadow'];
  const read = node => Object.fromEntries(fields.map(field => [field, getComputedStyle(node)[field]]));
  const filter = document.querySelector('#filter-trigger');
  const selected = document.querySelector('#seg-window button[aria-pressed="true"]');
  const resting = [...document.querySelectorAll('#seg-window button')]
    .find(button => button.getAttribute('aria-pressed') === 'false');
  const level = document.querySelector('#level');
  if (!filter || !selected || !resting || !level) throw new Error('S107 Filter parity premise is absent');
  return { loading: level.dataset.loading, filter: read(filter), selected: read(selected), resting: read(resting) };
});

async function filterParity404(page) {
  const failures = [];
  const before = await compactControl404(page);
  if (JSON.stringify(before.filter) !== JSON.stringify(before.resting)) failures.push({ state: 'resting', before });
  await page.locator('#filter-trigger').click();
  const expanded = await compactControl404(page);
  if (JSON.stringify(expanded.filter) !== JSON.stringify(expanded.selected)) failures.push({ state: 'expanded', expanded });
  await page.locator('#filter-trigger').click();
  let release; let arrive;
  const arrived = new Promise(resolve => { arrive = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  // Root Findings owns this preparation. Holding it proves Filter retains the
  // compact resting control while its own visible header is loading.
  await page.route('**/api/diagnose/finding-case-file-preparation*', async route => {
    arrive(); await gate; await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'Morning', exact: true }).click();
    await boundedWait(arrived, 'S107 held Findings preparation');
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'true', null,
      { timeout: 30000 });
    const loading = await compactControl404(page);
    if (loading.loading !== 'true' || JSON.stringify(loading.filter) !== JSON.stringify(loading.resting)) {
      failures.push({ state: 'loading', loading });
    }
  } finally {
    release(); await page.unroute('**/api/diagnose/finding-case-file-preparation*');
  }
  await settled(page);
  assert.deepEqual(failures, [],
    'S107 Filter must share Window compact-control geometry and states, including Findings loading');
}

// #414 chunk 3: Diagnose retention through a Changes round trip, and the
// edit-chain roster's grouped presentation. Fail-first against the base build,
// which has neither the retained desk nor the grouped Edit entry at all.
async function drilledDiagnose414(page) {
  await fullDayDiagnose(page);
  const row = page.locator('#level .qrow[data-id]').first();
  await row.waitFor({ timeout: 30000 });
  const subject = await row.getAttribute('data-id');
  await row.click();
  await page.waitForFunction(() => Boolean(document.querySelector('#crumb-trail .here')?.textContent),
    null, { timeout: 30000 });
  return subject;
}
// The one status read a Diagnose return owns (ADR 414): navigate away, hold
// /api/status, observe the loading frame standing, then release and settle.
// `storyId` names every assertion and timeout this raises, so a caller's own
// failure never reads with a different story's id.
async function heldReturnToDiagnose414(page, storyId) {
  await press(page, 'nav.v2-nav [data-destination="changes"]');
  await page.locator('.gf-stage-table, .gf-stage-trial, .gf-empty').first().waitFor({ timeout: 30000 });
  const requests = [];
  const onRequest = request => requests.push(new URL(request.url()).pathname);
  page.on('request', onRequest);
  let release; let arrive;
  const gate = new Promise(resolve => { release = resolve; });
  const arrived = new Promise(resolve => { arrive = resolve; });
  const handler = async route => { arrive(); await gate; await route.continue(); };
  await page.route('**/api/status*', handler);
  const STATUS_TIMEOUT = `${storyId} the return must issue GET /api/status; none arrived within 30 s`;
  const completion = page.waitForResponse(r => new URL(r.url()).pathname === '/api/status' && r.ok());
  // Playwright's own wait races the held-request wait below on the same
  // 30 s clock and can reject first. A bare promise like this one is flagged
  // as an unhandled rejection — aborting the whole runner, not just this
  // story — the instant it rejects with nothing yet awaiting it. Attach a
  // swallowing handler immediately, and surface the real failure as this
  // story's own assertion instead of letting it escape as a crash.
  const settled = completion.catch(() => null);
  try {
    await press(page, 'nav.v2-nav [data-destination="diagnose"]');
    await boundedWait(arrived, STATUS_TIMEOUT);
    await page.locator('.gf-loading[aria-label="Loading Diagnose"]').waitFor({ timeout: 30000 });
    release();
    assert.ok(await settled, STATUS_TIMEOUT);
  } finally {
    release(); await settled;
    await page.unroute('**/api/status*', handler); page.off('request', onRequest);
  }
  await waitForDesk(page);
  return requests;
}
async function editChainRoster414(page) {
  await page.goto(new URL('/?to=changes&subject=history', page.url()).href);
  await page.locator('.gf-stage-table[aria-label="Change records"] table.gf-table').waitFor({ timeout: 30000 });
}
// Holds the next request matching `pattern` that also satisfies `matches`
// (other traffic on the same pattern is let through), so a caller can prove
// which named loading frame stands for which in-flight read.
async function heldRequest414(page, pattern, matches) {
  let release; let arrive;
  const gate = new Promise(resolve => { release = resolve; });
  const arrived = new Promise(resolve => { arrive = resolve; });
  const handler = async route => {
    if (matches && !matches(route.request())) { await route.continue(); return; }
    arrive(); await gate; await route.continue();
  };
  await page.route(pattern, handler);
  return {
    wait: description => boundedWait(arrived, description),
    release: () => release(),
    close: () => page.unroute(pattern, handler),
  };
}

// #413: S113's scenario, factored out of the story so a fake page can drive
// it directly (frontend/c4.replay.test.js) without also faking
// `openBasalLane`'s own network reads and navigation — the same boundary
// S31-S35 already draw (no fake-page test covers their shared opener either).
export async function assertBasalLaneGallery(page) {
  const verdicts = await page.evaluate(() => {
    const counts = {};
    for (const cell of document.querySelectorAll('#lane > .lane-cell')) {
      counts[cell.dataset.verdict] = (counts[cell.dataset.verdict] || 0) + 1;
    }
    return counts;
  });
  for (const verdict of ['up', 'down', 'hold', 'insufficient', 'nodata']) {
    assert.ok(verdicts[verdict] > 0,
      `S113 premise: the gallery case must serve a ${verdict} slot; saw ${JSON.stringify(verdicts)}`);
  }

  // Select the raise cell (opens its detail, matching S31-S35's own route),
  // then stage it, then select a different cell — staged and selected must
  // be two distinct cells so both marks are provable at once.
  const raiseCell = page.locator('#lane > .lane-cell[data-verdict="up"]').first();
  await raiseCell.click();
  const stageButton = page.locator('.stagebtn[data-staged="false"]');
  await stageButton.waitFor({ timeout: 30000 });
  await stageButton.click();
  await page.locator('.stagebtn[data-staged="true"]').waitFor({ timeout: 30000 });
  const lowerCell = page.locator('#lane > .lane-cell[data-verdict="down"]').first();
  await lowerCell.click();
  await waitForReplayAssertion(async seen => {
    assert.equal(seen(await raiseCell.getAttribute('data-staged')), 'true',
      'S113 premise: the raise cell must carry the staged mark');
    assert.equal(seen(await lowerCell.getAttribute('aria-pressed')), 'true',
      'S113 premise: the lower cell must be the current selection');
    assert.notEqual(seen(await raiseCell.getAttribute('aria-pressed')), 'true',
      'S113 premise: the staged cell and the selected cell must be distinct');
  }, 'S113 one cell is staged and a different cell is selected');

  await waitForReplayAssertion(async seen => {
    const order = seen(await page.evaluate(() => [...document.querySelectorAll('#lane-wrap > *')].map(el => el.id)));
    assert.deepEqual(order, ['lane-key', 'lane'], 'S113 the key must render as the lane\'s head row, above the cells');
    const wrap = seen(await page.locator('#lane-wrap').boundingBox());
    const key = seen(await page.locator('#lane-key').boundingBox());
    const lane = seen(await page.locator('#lane').boundingBox());
    assert.ok(wrap && key && lane, 'S113 premise: the lane, its key and their wrap must all render');
    assert.ok(key.y >= wrap.y - 1 && key.y + key.height <= wrap.y + wrap.height + 1,
      "S113 the key's box must lie wholly inside the visible lane");
    assert.ok(key.x >= wrap.x - 1 && key.x + key.width <= wrap.x + wrap.width + 1,
      "S113 the key's box must lie wholly inside the visible lane");
    assert.ok(key.y + key.height <= lane.y + 1, 'S113 the key must sit above the cells, not beneath them');
  }, 'S113 the key stands fully visible above the cells');

  // "One computed paint": both the cell and its key mark read the SAME
  // `--cell` custom property off the one shared `.lane-cell[data-verdict]`
  // rule (diagnose-workstation.css) — that shared token, not a raw
  // `backgroundColor` string, is what the two surfaces are built to agree
  // on (the key's own swatch composites it over a different, explicit
  // backing so a translucent raise/lower tint still reads as the same
  // colour by eye). Insufficient/no-data additionally carry a structural
  // hatch/dot pattern; compare its gradient kind, the one thing the key's
  // `--lane-structure` indirection is built to mirror.
  for (const [verdict, count] of Object.entries(verdicts)) {
    const keySwatch = page.locator(`#lane-key .lane-cell[data-verdict="${verdict}"]`);
    const keyCount = await page.locator(`#lane-key [title]:has(.lane-cell[data-verdict="${verdict}"]) .t`).innerText();
    assert.equal(Number(keyCount), count, `S113 the key's ${verdict} count must equal the served lane count`);

    const cellSelector = `#lane > .lane-cell[data-verdict="${verdict}"]`;
    const [cellToken, keyToken] = await Promise.all([
      page.locator(cellSelector).first().evaluate(el => getComputedStyle(el).getPropertyValue('--cell').trim()),
      keySwatch.evaluate(el => getComputedStyle(el).getPropertyValue('--cell').trim()),
    ]);
    assert.equal(keyToken, cellToken, `S113 the ${verdict} key mark must share the cell's --cell paint token`);

    if (verdict === 'hold') {
      const groundToken = await page.locator('#lane').evaluate(el => getComputedStyle(el).backgroundColor);
      const cellPaint = await page.locator(cellSelector).first().evaluate(el => getComputedStyle(el).backgroundColor);
      assert.notEqual(cellPaint, groundToken, 'S113 a hold cell must not paint as the bare ground');
    }
    if (verdict === 'insufficient' || verdict === 'nodata') {
      const [cellImage, keyImage] = await Promise.all([
        page.locator(cellSelector).first().evaluate(el => getComputedStyle(el).backgroundImage),
        keySwatch.evaluate(el => getComputedStyle(el).backgroundImage),
      ]);
      const kind = image => (image.includes('repeating-linear-gradient') ? 'hatch'
        : image.includes('radial-gradient') ? 'dot' : image);
      assert.equal(kind(keyImage), kind(cellImage),
        `S113 the ${verdict} key mark's structure must match its cells' (hatched vs dotted)`);
    }
    if (verdict === 'up' || verdict === 'down') {
      const [cellGlyph, keyGlyph] = await Promise.all([
        page.locator(cellSelector).first().evaluate(el => getComputedStyle(el, '::before').content),
        keySwatch.evaluate(el => getComputedStyle(el, '::before').content),
      ]);
      assert.notEqual(cellGlyph, 'none', `S113 a ${verdict} cell must carry its directional glyph`);
      assert.equal(keyGlyph, cellGlyph, `S113 the ${verdict} key mark must carry the same glyph as its cells`);
    }
  }
}

export const C4_STORIES = {
  async S101(page) {
    await fullDayDiagnose(page);
    await drawnWindow404(page);
    const label = (await page.locator('#seg-window [data-follow]').innerText()).replace('×', '').trim();
    assert.equal(label, '15:30–21:30', 'S101 custom Window chip contains only the span');
  },
  async S102(page) {
    await fullDayDiagnose(page);
    const previous = await slot404(page);
    const focal = page.locator('#tile-focal .evidence-tile');
    // Lane selection precedes the asynchronous evidence repaint. Observe the
    // final focal identity once per attempt, rather than two intermediate frames.
    await waitForReplayAssertion(async seen => {
      const chartId = seen(await focal.getAttribute('data-chart-id'));
      assert.notEqual(chartId, previous,
        'S102 thin basal slot click left the Pattern graph on stage');
      assert.equal(chartId, 'basal:720',
        'S102 the stage must open the selected 12:00 basal graph, including its thin state');
    }, 'S102 selected thin basal focal chart');
  },
  async S103(page) {
    // Separate from S102: a graph failure must not mask the lost-window proof.
    const failures = [];
    for (const mode of ['24 h', 'Morning', 'drawn']) {
      await page.goto(new URL('/?to=diagnose', page.url()).href);
      await fullDayDiagnose(page);
      if (mode === 'drawn') await drawnWindow404(page);
      else if (mode !== '24 h') {
        await page.getByRole('button', { name: mode, exact: true }).click(); await settled(page);
      }
      const before = await clockWindow(page);
      await page.getByRole('button', { name: /^12:00 basal slot,/ }).click();
      await page.getByRole('button', { name: 'Findings', exact: true }).click();
      await settled(page);
      const after = await clockWindow(page);
      if (JSON.stringify(after) !== JSON.stringify(before)) failures.push({ mode, before, after });
    }
    assert.deepEqual(failures, [], 'S103 backing out of a slot must restore each reader-selected window');
  },
  async S104(page) {
    await press(page, 'nav.v2-nav [data-destination="day"]');
    await waitForDesk(page);
    await page.locator('.gf-stage-day .gf-chart canvas').first().waitFor();
    // Showcase ends on Sunday 2024-06-30: its arrival week contains only
    // that recorded day. S66's Previous recorded day control reaches Saturday
    // and the preceding populated week before we observe the click under test.
    const previous = page.getByRole('button', { name: 'Previous recorded day', exact: true });
    assert.equal(await previous.isEnabled(), true, 'S104 premise: an earlier recorded day exists');
    await previous.click();
    await waitForDesk(page);
    await page.locator('.gf-stage-day .gf-chart canvas').first().waitFor();
    const dates = await page.locator('.gf-nav-col[data-pick]:not([disabled]):not([aria-pressed="true"])')
      .evaluateAll(nodes => nodes.map(node => node.dataset.pick));
    assert.ok(dates.length, 'S104 premise: the preceding week contains another recorded day');
    const date = dates[0];
    const pick = page.locator(`.gf-nav-col[data-pick="${date}"]`);
    const nodes = await page.evaluateHandle(() => ({ stage: document.querySelector('.gf-stage-day'),
      reading: document.querySelector('.gf-reading'), nav: document.querySelector('#gf-nav') }));
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let arrive;
    const arrived = new Promise(resolve => { arrive = resolve; });
    const handler = async route => { arrive(); await gate; await route.continue(); };
    await page.route('**/api/model-view*', handler);
    const completion = page.waitForResponse(r => new URL(r.url()).pathname === '/api/model-view' && r.ok());
    try {
      await pick.click();
      await boundedWait(arrived, 'S104 selected-day model read');
      const retained = await nodes.evaluate(n => Object.fromEntries(Object.entries(n).map(([key, node]) => [key, node.isConnected])));
      assert.deepEqual(retained, { stage: true, reading: true, nav: true },
        'S104 day click detached the standing stage, reading pane or navigator while the read was pending');
      release(); await completion; await waitForDesk(page);
      assert.equal(await page.locator(`.gf-nav-col[data-pick="${date}"]`).getAttribute('aria-pressed'), 'true');
      assert.equal(await nodes.evaluate(n => n.stage === document.querySelector('.gf-stage-day')
        && n.reading === document.querySelector('.gf-reading')), true,
      'S104 settled day must retain the same frame nodes');
    } finally {
      release(); await completion; await page.unroute('**/api/model-view*', handler); await nodes.dispose();
    }
  },
  async S105(page, ctx) {
    assert.ok(ctx.capturePump, 'S105 requires CASE_STORE_DIR for a synthetic on-pump capture');
    await C3_STORIES.S52(page);
    const roster = await read(page, '/api/verify/trials');
    const ended = roster.trials.find(row => row.ending?.kind === 'user_finished');
    assert.ok(ended, 'S105 premise: c3-trial retains a finished Trial');
    assert.equal(roster.admission.active_kind, null, 'S105 premise: nothing is watched');
    // Record the already-programmed basal value at an eligible served slot.
    // The existing replay pump producer captures that same schedule. This
    // creates an on-pump Plan without inventing another setting change.
    const guidance = await read(page, '/api/guidance');
    const candidate = guidance.candidates.find(row => row.parameter === 'basal_rate' && row.action?.length);
    assert.ok(candidate, 'S105 premise: a served basal action admits the Plan slot');
    const pump = await read(page, '/api/pump-settings');
    const start = candidate.action[0].start_min;
    const current = [...pump.profile.segments].reverse().find(row => row.start_min <= start).basal_rate;
    const saved = await page.request.put(new URL('/api/plan', page.url()).href,
      { data: { items: [{ type: 'basal', start_min: start, value: current }] } });
    assert.equal(saved.status(), 200, 'S105 synthetic Plan draft must save');
    const applied = await page.request.post(new URL('/api/plan/apply', page.url()).href, { data: {} });
    assert.equal(applied.status(), 200, `S105 synthetic Plan decision: ${await applied.text()}`);
    // 'mismatch' captures the existing source profile without an IDP switch;
    // it matches this deliberately unchanged draft and creates no new Trial.
    await ctx.capturePump('mismatch');
    await page.goto(new URL('/?to=changes&subject=plan', page.url()).href);
    await page.locator('.gf-status[data-state="confirmed"]').waitFor({ timeout: 30000 });
    assert.equal((await read(page, '/api/verify/trials')).admission.active_kind, null,
      'S105 premise: confirmed Plan with no active watch');
    assert.equal(await page.getByRole('button', { name: 'View change record', exact: true }).count(), 1,
      'S105 on-pump Plan has no View change record door');
    await page.getByRole('button', { name: 'View change record', exact: true }).click();
    await press(page, `[data-record="trial:${ended.id}"]`);
    await page.locator('[data-record-part="ending"]').waitFor();
    const address = page.url();
    assert.equal(new URL(address).searchParams.get('occurrence'), `record:trial:${ended.id}`);
    await page.goto(address);
    await page.locator('[data-ending-kind="user_finished"]').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('occurrence'), `record:trial:${ended.id}`,
      'S105 record address must reopen the exact saved subject');
  },
  async S106(page) {
    await selectedPattern404(page);
  },
  async S107(page) {
    await fullDayDiagnose(page);
    await filterParity404(page);
    const diagnose = await geometry404(page);
    const allCharts = await page.getByRole('button', { name: 'All charts', exact: true }).evaluate(button => {
      const box = node => {
        const rect = node?.getBoundingClientRect();
        return rect && { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      };
      return { text: button.textContent.trim(), label: box(button.querySelector('span')), icon: box(button.querySelector('svg')) };
    });
    const rails = { diagnose: diagnose.rail?.width };
    assert.ok(Number.isFinite(rails.diagnose), 'S107 premise: Diagnose publishes its reading rail');
    rails.changes = await deskGeometry404(page, 'changes');
    rails.day = await deskGeometry404(page, 'day');
    await fullDayDiagnose(page);
    await page.getByRole('button', { name: 'All charts', exact: true }).click();
    await page.locator('#chart-headacts button[aria-label="Close"]').waitFor({ timeout: 30000 });
    const catalog = await geometry404(page);
    const eventMeal = await drillMeal404(page, 'event');
    const drilled = eventMeal.geometry;
    const failures = [];
    if (new Set(Object.values(rails)).size !== 1) failures.push({ rails });
    for (const [state, actions, expectedAction] of [
      ['all-charts', [allCharts], 'All charts'], ['catalog-close', catalog.actions, 'Close'], ['drilled-return', drilled.actions, 'All charts'],
    ]) {
      const matching = actions.filter(action => (action.aria || action.text) === expectedAction);
      if (matching.length !== 1) failures.push({ state, expectedAction, actions });
      for (const action of matching) {
        if (!action.label || !action.icon || action.label.right > action.icon.left) failures.push({ state,
          action: action.aria || action.text, label: action.label, icon: action.icon, expected: 'label before icon' });
      }
    }
    for (const focal of diagnose.focal) {
      if (!focal.control || focal.control.right > focal.head.right || focal.control.top < focal.head.top
          || focal.control.top >= focal.head.top + focal.head.height / 2) failures.push({
        focal, expected: 'top-right focal control',
      });
    }
    assertS107ComparisonGeometry(drilled,
      eventMeal.served.projection.cohorts.map(({ key, name }) => ({ key, name })));
    assert.deepEqual(failures, [], 'S107 desk geometry must preserve labels, rails, focal placement and long cohort rows');
  },
  async S108(page) {
    const subject = await drilledDiagnose414(page);
    assert.ok(subject, 'S108 premise: the first ranked row must drill');
    const trailBefore = (await page.locator('#crumb-trail .here').innerText()).trim();
    // The showcase's first ranked row drills straight to its own slot window
    // (e.g. "Slot 03:00"), not 24 h. The obligation is that whichever window
    // was left pressed survives, not that it is always the whole day.
    const windowBefore = (await page.locator('#seg-window [aria-pressed="true"]').innerText()).trim();
    const requests = await heldReturnToDiagnose414(page, 'S108');
    assert.deepEqual(requests.filter(path => path !== '/api/status'), [],
      'S108 the return to Diagnose must issue no request besides the held status check');
    assert.equal(requests.filter(path => path === '/api/status').length, 1,
      'S108 the return to Diagnose must issue exactly one GET /api/status');
    assert.equal((await page.locator('#seg-window [aria-pressed="true"]').innerText()).trim(), windowBefore,
      'S108 the selected window must remain pressed after the held return');
    assert.equal((await page.locator('#crumb-trail .here').innerText()).trim(), trailBefore,
      'S108 the drilled row must remain open after the held return');
  },
  async S109(page) {
    // Undrilled: a drilled pane fits its viewport exactly at 1440x900 (the
    // overflow is on the factors roster itself, not every level), so this
    // scrolls #level before any row is picked, at whatever bounded offset its
    // own overflow allows.
    await fullDayDiagnose(page);
    // The rail's own tile reads (diagnose-workstation.js fetchTile -> paint ->
    // paintLevel) land after the main read and each repaint the roster from
    // scratch, restoring only the workstation's own remembered drill position
    // (queueScrollTop) — 0 here, since nothing is drilled — which wipes any
    // scroll set before the last one lands. Those reads are the last traffic
    // this desk issues on arrival, so settle on the network rather than a
    // named set of paths: no in-flight request for 500 ms.
    await page.waitForLoadState('networkidle');
    const level = page.locator('#level');
    await level.waitFor({ timeout: 30000 });
    const scrolled = await level.evaluate(node => {
      node.scrollTop = Math.min(40, node.scrollHeight - node.clientHeight);
      return node.scrollTop;
    });
    assert.ok(scrolled > 0, 'S109 premise: the reading pane must actually be scrollable');
    // A repaint queued just before those reads landed could still be pending;
    // confirm the offset survives one more animation frame before leaving.
    const holds = await level.evaluate(node => new Promise(resolve =>
      requestAnimationFrame(() => resolve(node.scrollTop))));
    assert.equal(holds, scrolled, 'S109 premise: the scrolled offset must still hold before the round trip begins');
    await heldReturnToDiagnose414(page, 'S109');
    const after = await page.locator('#level').evaluate(node => node.scrollTop);
    assert.equal(after, scrolled, 'S109 the reading pane scroll must survive the round trip through Changes');
  },
  async S110(page) {
    await editChainRoster414(page);
    const editRows = page.locator('table.gf-table > tbody > tr.gf-edit-row');
    assert.equal(await editRows.count(), 1, 'S110 premise: edit-chain serves exactly one titled Edit entry');
    const summaryText = (await editRows.first().locator('.gf-edit-summary').innerText()).trim();
    assert.match(summaryText, /^3 setting changes/, 'S110 the titled entry must name its member count');
    const editKey = await editRows.first().getAttribute('data-edit');
    const members = page.locator(`table.gf-table > tbody > tr[data-edit-member="${editKey}"]`);
    assert.equal(await members.count(), 3, 'S110 the titled entry must carry its three member rows beneath it');
    const flatRows = page.locator('table.gf-table > tbody > tr:not(.gf-edit-row):not([data-edit-member])');
    assert.equal(await flatRows.count(), 1, 'S110 the lone record must render as one flat row');
    const memberButton = members.first().locator('[data-record]');
    const recordSelector = await memberButton.getAttribute('data-record');
    await memberButton.click();
    await page.locator('[data-record-part="original"]').waitFor({ timeout: 30000 });
    assert.equal(new URL(page.url()).searchParams.get('occurrence'), `record:${recordSelector}`,
      'S110 opening a member must open its exact record address');
    await page.goto(page.url());
    await page.locator('[data-record-part="original"]').waitFor({ timeout: 30000 });
    assert.equal(new URL(page.url()).searchParams.get('occurrence'), `record:${recordSelector}`,
      'S110 the record address must reopen the exact same subject on reload');
  },
  async S111(page) {
    await editChainRoster414(page);
    const cells = page.locator('[data-record-open="true"]');
    const count = await cells.count();
    assert.ok(count >= 4, 'S111 premise: edit-chain serves at least four still-open records');
    for (let index = 0; index < count; index += 1) {
      const word = (await cells.nth(index).locator('xpath=following-sibling::small').innerText()).trim();
      assert.doesNotMatch(word, /_/, `S111 a Still open cell must carry a word, never a raw disposition token: ${word}`);
      assert.equal(word, 'Not watched', `S111 every Still open cell must show the served disposition: ${word}`);
    }
  },
  async S112(page) {
    const rosterHold = await heldRequest414(page, '**/api/verify/trials*',
      request => !new URL(request.url()).searchParams.has('selected'));
    await page.goto(new URL('/?to=changes&subject=history', page.url()).href);
    await rosterHold.wait('S112 held roster read');
    await page.locator('.gf-loading', { hasText: 'Reading change records' }).waitFor({ timeout: 30000 });
    rosterHold.release(); await rosterHold.close();
    await page.locator('table.gf-table').waitFor({ timeout: 30000 });

    const recordHold = await heldRequest414(page, '**/api/verify/trials*', request => {
      const params = new URL(request.url()).searchParams;
      return params.has('selected') && !params.has('assessment');
    });
    const button = page.locator('table.gf-table [data-record]').first();
    await button.click();
    await recordHold.wait('S112 held record read');
    await page.locator('.gf-loading', { hasText: 'Reading change records' }).waitFor({ timeout: 30000 });
    recordHold.release(); await recordHold.close();
    await page.locator('[data-record-part="ending"]').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('[data-unavailable="ending"]').count(), 1,
      'S112 premise: an edit-chain record carries no ending');

    const reassessHold = await heldRequest414(page, '**/api/verify/trials*',
      request => new URL(request.url()).searchParams.has('assessment'));
    await press(page, '[data-assessment="retained"]');
    await reassessHold.wait('S112 held reassessment read');
    await page.locator('.gf-loading', { hasText: 'Computing reassessment' }).waitFor({ timeout: 30000 });
    reassessHold.release(); await reassessHold.close();
    await page.locator('[data-reassessment-context="retained"]').waitFor({ timeout: 30000 });
  },
  // #413: the lane's head row, key and verdict paint. `openBasalLane` opens
  // whichever basal slot the CASE_STORE_DIR case ranks first; the
  // `basal-verdict-gallery` QaCase (scripts/qa_e2e_cases.py) is built to
  // serve all five verdicts on one lane, so this story can require the full
  // scenario rather than accept whatever subset a general fixture happens to
  // carry. Premise failures (a missing verdict, no selection, no stage) read
  // distinctly from the feature assertions they gate. The scenario itself
  // (`assertBasalLaneGallery`) is a separate export so a fake page can drive
  // it directly, without also having to fake `openBasalLane`'s own network
  // reads and navigation.
  async S113(page) {
    await C2_STORIES.openBasalLane(page);
    await assertBasalLaneGallery(page);
  },
  // #413: a cold Diagnose arrival shows a count-free skeleton instead of an
  // empty loading block, while keeping the same status role, named text
  // (#414) and reference-width rail the shipped loading frame always had.
  async S114(page) {
    const analyzeHold = await heldRequest414(page, '**/api/analyze*');
    await page.reload();
    await analyzeHold.wait('S114 held analyze read');
    const loading = page.locator('.gf-loading[role="status"]');
    await loading.waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      const skeletons = seen(await page.locator('.gf-skeleton[aria-hidden="true"]').count());
      assert.equal(skeletons, 1, 'S114 the cold loading frame must carry one skeleton block');
      const marks = seen(await page.locator('.gf-skeleton .gf-skel').count());
      assert.ok(marks > 0, 'S114 the skeleton must draw at least one mark');
      const text = seen(await page.locator('.gf-skeleton').innerText());
      assert.equal(text.trim(), '', 'S114 the skeleton must state no count, title or value');
      const status = seen(await page.locator('.gf-loading').getAttribute('aria-label'));
      assert.equal(status, 'Loading Diagnose', 'S114 the loading status must still be announced');
      const rail = seen(await page.locator('.gf-desk > .gf-reading').boundingBox());
      const reference = seen(await page.evaluate(() =>
        getComputedStyle(document.querySelector('.gf')).getPropertyValue('--gf-reading').trim()));
      assert.equal(`${Math.round(rail.width)}px`, reference, 'S114 the rail must stay at the Diagnose reference width while cold');
    }, 'S114 the cold skeleton stands text-free at the reference width');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const animationName = await page.evaluate(() => {
      const el = document.querySelector('.gf-skel');
      return el ? getComputedStyle(el).animationName : null;
    });
    assert.equal(animationName, 'none', 'S114 the skeleton must hold still under reduced motion');
    await page.emulateMedia({ reducedMotion: null });
    analyzeHold.release(); await analyzeHold.close();
    await page.locator('#lane').waitFor({ timeout: 30000 });
  },
  // #413: a Pattern owning claimed causes folds them under its own spine —
  // never as sibling rail rows — behind a toggle naming the served count,
  // closed on arrival unless the Pattern is the first ranked row; every
  // served count sentence prints in served order, count and denominator
  // emphasised, and the first served tier's rows carry the urgency stripe.
  async S115(page) {
    await openDiagnoseRail(page);
    const preparation = await read(page, '/api/diagnose/finding-case-file-preparation');
    const rows = preparation.rendered_rows;
    const parent = rows.find(row => row.kind === 'pattern' && rows.some(member => member.claimed_by === row.id));
    assert.ok(parent, 'S115 premise: the showcase must serve a Pattern owning at least one claimed cause');
    const members = rows.filter(row => row.claimed_by === parent.id);
    assert.ok(members.length > 0, 'S115 premise: the owning Pattern must have at least one claimed member');
    const firstRankedTier = rows.find(row => row.priority != null)?.tier;
    assert.ok(firstRankedTier, 'S115 premise: the showcase must rank at least one row');

    await waitForReplayAssertion(async seen => {
      const rowIds = seen(await page.locator('#level .qrow').evaluateAll(nodes => nodes.map(n => n.dataset.id)));
      for (const member of members) {
        assert.ok(!rowIds.includes(member.id),
          `S115 ${member.id} must never be a sibling rail row`);
      }
      const toggle = page.locator(`#level .qfold`).first();
      assert.equal(seen(await toggle.count()), 1, 'S115 the owning Pattern must show one fold toggle');
      assert.equal(seen(await toggle.textContent()),
        `${members.length} ${members.length === 1 ? 'cause' : 'causes'}`,
        "S115 the toggle must name the served cause count");
    }, 'S115 causes fold under their Pattern, never as sibling rows');

    await page.evaluate((parentId) => {
      const list = document.querySelector('#level .q');
      const items = [...list.children];
      const at = items.findIndex(el => el.querySelector?.(`.qrow[data-id="${CSS.escape(parentId)}"]`));
      const next = items[at + 1];
      if (next?.classList.contains('qfold') && next.getAttribute('aria-expanded') !== 'true') next.click();
    }, parent.id);

    await waitForReplayAssertion(async seen => {
      for (const member of members) {
        const line = page.locator(`#level .qmember[data-id="${member.id}"]`);
        await line.waitFor({ timeout: 30000 });
        const text = seen(await line.locator('.den').innerText());
        for (const sentence of member.count_sentences) {
          assert.ok(text.includes(`${sentence.count} of ${sentence.denominator} ${sentence.noun}`),
            `S115 ${member.id} must print its served ${sentence.noun} sentence: ${text}`);
          assert.ok(!text.includes(sentence.outcome),
            `S115 a folded member line must not repeat the Pattern's own outcome word: ${text}`);
        }
      }
    }, 'S115 every served count sentence prints, in served order, never merged');

    if (parent.count_sentences?.length) {
      await waitForReplayAssertion(async seen => {
        const text = seen(await page.locator(`#level .qrow[data-id="${parent.id}"] .den`).innerText());
        for (const sentence of parent.count_sentences) {
          assert.ok(text.includes(`${sentence.count} of ${sentence.denominator} ${sentence.noun} ${sentence.outcome}`),
            `S115 the Pattern's own row must print its served sentence verbatim: ${text}`);
        }
        const bold = seen(await page.locator(`#level .qrow[data-id="${parent.id}"] .den .v`).count());
        assert.ok(bold > 0, 'S115 the count and denominator must be emphasised');
      }, "S115 the Pattern's own row prints the served count sentence");
    }

    await waitForReplayAssertion(async seen => {
      const urgent = seen(await page.locator(`#level .qrow[data-tier="${firstRankedTier}"][data-urgent="true"]`).count());
      assert.ok(urgent > 0, "S115 the first served tier's rows must carry the urgency stripe");
      const stray = seen(await page.locator(`#level .qrow[data-urgent="true"]:not([data-tier="${firstRankedTier}"])`).count());
      assert.equal(stray, 0, 'S115 no later tier carries the urgency stripe');
    }, 'S115 the rail shows served urgency');
  },
  // #413: every ranked row's mini draws the SAME instrument — the matched
  // cohort's outcome word and count at the left, TYPICAL and the denominator
  // at the right — sourced from the row's own served count sentence, never a
  // frontend word table, in the rail's own cohort palette.
  async S116(page) {
    await openDiagnoseRail(page);
    const preparation = await read(page, '/api/diagnose/finding-case-file-preparation');
    const rows = preparation.rendered_rows;
    const graphicOf = async (id) => page.evaluate((rowId) => {
      const row = document.querySelector(`.qrow[data-id="${CSS.escape(rowId)}"]`);
      const host = row?.querySelector('.mini canvas');
      const chart = host && window.echarts.getInstanceByDom(host.parentElement);
      return chart?.getOption().graphic?.map((item) => item.style?.text) || null;
    }, id);
    const candidates = rows.filter((row) => row.count_sentences?.length
      && (row.pattern_chart || (row.event_chart && !row.claimed_by)));
    assert.ok(candidates.length > 0, 'S116 premise: the showcase must rank a mini-bearing Pattern or Cause');
    await waitForReplayAssertion(async seen => {
      for (const row of candidates) {
        const graphic = seen(await graphicOf(row.id));
        if (!graphic) continue; // an unmounted mini (too narrow) is covered elsewhere, not this story
        const sentence = row.count_sentences[0];
        assert.deepEqual(graphic, [
          `${sentence.outcome.toUpperCase()} · ${sentence.count}`,
          `TYPICAL · ${sentence.denominator}`,
        ], `S116 ${row.id}'s mini must draw the served outcome word and count, and TYPICAL with the denominator`);
      }
    }, 'S116 every ranked mini draws the same instrument, from the served row');
  },
  // #413: "Diagnose opens on the 24 h window" — a cold arrival, with no
  // contextual entry and no retained window, reads unscoped. `openApp`
  // defaults every opener story to a fresh root ('/') Diagnose arrival, so
  // this story asserts against that same cold seat before touching anything.
  async S117(page) {
    await settled(page);
    await waitForReplayAssertion(async seen => {
      const pressed = seen(await page.locator('#seg-window button[aria-pressed="true"]').innerText());
      assert.equal(pressed.trim(), '24 h', 'S117 a cold arrival with no context must open on the 24 h window');
      const findings = seen(await read(page, '/api/diagnose/finding-case-file-preparation'));
      assert.equal(findings.findings?.window?.scoped, false, 'S117 the findings read must be unscoped');
    }, 'S117 a cold arrival opens on the 24 h window, unscoped');
  },
  async S91(page, ctx) {
    await C3_STORIES.S91(page);
    // Each new context removes S91's deliberate served-verdict perturbation.
    for (const [name, unit, required] of [
      ['c4-ic', 'effective qualifying closed meal runs', 8],
      ['c4-isf', 'qualifying fasting Rest windows', 30],
      ['c4-profile', 'coverage-qualified informative dates', 30],
    ]) {
      await ctx.withCase(name, async fresh => {
        const comparison = await readiness(fresh, unit, required);
        assert.ok(comparison.readiness.after.elapsed_days > 14, 'actual accumulation continues past fourteen days');
        if (name !== 'c4-ic') {
          assert.ok(Object.values(comparison.readiness).every(arm => arm.criterion_met));
          assert.equal(comparison.assessment.state, 'unclear', 'criterion met does not manufacture a direction');
        }
        await capture(fresh, ctx, `S91-${name}`, name);
      });
    }
  },
  async S49(page, ctx) {
    await C3_STORIES.S49(page);
    await ctx.withCase('c4-missing', async fresh => {
      const comparison = await retained(fresh);
      await waitForReplayAssertion(async seen => {
        assert.equal(comparison.availability.state, 'unavailable');
        assert.ok(comparison.availability.reason);
        assert.ok((seen(await fresh.locator('.gf-reading').innerText())).includes(comparison.availability.reason));
        assert.ok(comparison.outcomes.some(row => row.before === 0 && row.after == null),
          'producer must supply observed zero and missing measurement in distinct arms');
        for (const row of comparison.outcomes) {
          const after = seen(await fresh.locator(`[data-outcome="${row.key}"] td:nth-child(3)`).innerText());
          if (row.after == null) assert.match(after, /no |unavailable/i, 'missing outcome cannot render zero');
        }
      }, "S49");
      await capture(fresh, ctx, 'S49-c4-missing', 'c4-missing');
    });
  },
};

// RETIRED:Connor Griffin:2026-09-08 — the frozen R18 premise is non-vacuous.
export async function historicalAbsence(page) {
  process.stdout.write('RETIRED R18 — Connor Griffin · 2026-09-08 · "We dont\' need historical reads in the app."\n');
  const payload = await read(page, '/api/diagnose/finding-case-file-preparation');
  const historical = payload.findings.rows.filter(row => row.register === 'history');
  const current = payload.findings.rows.filter(row => row.register !== 'history' && row.kind === 'setting');
  assert.ok(historical.length, 'R18 premise requires an actual register=history input row');
  assert.ok(current.length, 'R18 premise requires current-setting evidence');
  const roster = await read(page, '/api/verify/trials');
  assert.ok(roster.trials.length && roster.focuses.length, 'R18 premise retains both Trial and Focus records');
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settled(page);
  const absent = async () => {
    await waitForReplayAssertion(async seen => {
      for (const row of historical) {
        assert.equal(seen(await page.locator(`[data-id="${row.id}"], [data-chart-id="${row.id}"]`).count()), 0,
          'past-setting identity must be absent from roster, selection and chart catalog');
      }
    }, "absent");
  };
  await absent();
  // This case publishes five Pattern rows, one current basal row and one
  // historical I:C row. The last must enter neither visible nor Watching counts.
  await waitForReplayAssertion(async seen => {
    assert.equal((seen(await page.locator('#crumb-meta').innerText())).trim(), '6 findings · 30 days');
    const watching = page.getByRole('button', { name: /Watching/ });
    assert.equal(seen(await watching.count()), 0, 'no historical read may create a Watching disclosure');
  }, "historicalAbsence");
  await absent();
  const currentRow = page.locator(`#level .qrow[data-id="${current[0].id}"]`);
  await currentRow.waitFor(); await currentRow.click();
  await page.locator('#lane > button').first().waitFor({ timeout: 30000 });
  await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('#lane > button:not([disabled])').count()), 48, 'current basal evidence remains browsable');
  }, "historicalAbsence");
  await press(page, '#explorer-trigger'); await absent();
  for (const row of historical) {
    await page.goto(new URL(`/?to=diagnose&subject=${encodeURIComponent(row.id)}`, page.url()).href);
    await settled(page); await absent();
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('#level [data-register="history"]').count()), 0);
    }, "historicalAbsence");
  }
  for (const kind of ['trial', 'focus']) {
    const record = roster[kind === 'trial' ? 'trials' : 'focuses'][0];
    await page.goto(new URL(`/?to=changes&subject=history&occurrence=${encodeURIComponent(`record:${kind}:${record.id}`)}`, page.url()).href);
    await page.locator('[data-record-part="original"]').waitFor({ timeout: 30000 });
    const detail = await read(page, '/api/verify/trials', { kind, selected: record.id });
    assert.equal(detail.selected.id, record.id);
  }
  const after = await read(page, '/api/verify/trials');
  assert.deepEqual(after.trials.map(row => row.id), roster.trials.map(row => row.id));
  assert.deepEqual(after.focuses.map(row => row.id), roster.focuses.map(row => row.id));
}

// Coordinator amendment 4, 2026-09-10: the permanent retirements keep their
// original sanctions. Their app proof drives ADR 397's carried rail; the mock
// still executes its historical body. R3's cohort-button premise is re-settled
// in the ledger under Connor Griffin's 2026-09-08 ADR 397 ruling.
async function fullDayDiagnose(page) {
  await press(page, '[data-destination="diagnose"]'); await settled(page);
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settled(page); await waitForCharts(page);
}
const clockWindow = page => page.evaluate(() => {
  const selected = document.querySelector('#seg-window [aria-pressed="true"]');
  const chart = globalThis.echarts.getInstanceByDom(document.querySelector('#chart'));
  if (!selected || !chart) throw new Error('the shipped clock window and glucose chart must exist');
  const axis = chart.getOption().xAxis[0];
  return { label: selected.textContent.trim(), min: axis.min, max: axis.max };
});
async function selectOccurrence(page, row = page.locator('#level .case-occurrence').first()) {
  const { id } = await waitForReplayAssertion(async seen => {
    const id = seen(await row.getAttribute('data-occurrence-id'));
    assert.ok(id, 'the served occurrence must have an identity');
    return { id };
  }, "selectOccurrence");
  await row.click();
  await page.waitForFunction(id => document.querySelector('#level .case-occurrence[aria-pressed="true"]')?.dataset.occurrenceId === id,
    id, { timeout: 30000 });
  await page.locator('#level .occ-detail').waitFor({ timeout: 30000 });
  return id;
}
async function comparisonSelection(page) {
  const file = await C2_STORIES.openComparisonCase(page);
  await selectOccurrence(page);
  return file;
}
const absent = (page, selector, message) => waitForReplayAssertion(async seen => {
  assert.equal(seen(await page.locator(selector).count()), 0, message);
}, message);
async function glucoseSeries(page) {
  await waitForCharts(page);
  return page.evaluate(() => {
    const chart = globalThis.echarts.getInstanceByDom(document.querySelector('#chart'));
    if (!chart) throw new Error('retirement proof requires the rendered glucose chart');
    return chart.getOption().series.map(series => String(series.id || series.name || ''));
  });
}

export const C4_RETIREMENTS = {
  async R2(page) {
    await comparisonSelection(page);
    await absent(page, '#occurrenceModal, .occurrence-modal', 'R2 occurrence modal returned');
    await waitForReplayAssertion(async seen => {
      assert.doesNotMatch(new URL(seen(page.url())).hash, /occurrenceModal/);
      assert.ok(seen(await page.locator('#level .occ-detail').isVisible()), 'R2 in-place selected case remains');
      assert.ok(seen(await page.locator('.occ-foot button:last-child').isEnabled()), 'R2 contextual Day remains');
    }, "R2");
  },
  async R3(page) {
    process.stdout.write('AMENDED R3 premise — ADR 397 · Connor Griffin · 2026-09-08; coordinator amendment 4 transcribed 2026-09-10: drill the shipped Finding row; cohorts remain served member groups.\n');
    await fullDayDiagnose(page); const before = await clockWindow(page);
    await C2_STORIES.openComparisonCase(page);
    await waitForReplayAssertion(async seen => {
      assert.deepEqual(seen(await clockWindow(page)), before, 'R3 a Finding drill must not rewrite the clock window');
      assert.ok(seen(await page.locator('#level .case-occurrence').count()) > 0, 'R3 drilled findings remain reachable');
    }, "R3");
  },
  async R4(page) {
    await C2_STORIES.openComparisonCase(page); const { before, rows } = await waitForReplayAssertion(async seen => {
      const before = seen(await clockWindow(page));
      const rows = page.locator('#level .case-occurrence');
      assert.ok(seen(await rows.count()) > 1, 'R4 requires multiple served members');
      return { before, rows };
    }, "R4");
    const first = await selectOccurrence(page, rows.first());
    const second = await selectOccurrence(page, rows.nth(1));
    await waitForReplayAssertion(async seen => {
      assert.notEqual(first, second);
      assert.deepEqual(seen(await clockWindow(page)), before, 'R4 occurrence selection must not rewrite the clock window');
      assert.ok(seen(await page.getByRole('button', { name: 'Morning', exact: true }).isEnabled()), 'R4 clock window remains independently settable');
    }, "R4");
  },
  async R5(page) {
    await C2_STORIES.openBasalLane(page);
    await waitForReplayAssertion(async seen => {
      assert.ok(seen(await page.locator('#level .case-occurrence').count()) > 1, 'R5 needs multiple nights');
    }, "R5");
    const first = await selectOccurrence(page);
    await page.locator('#level .case-occurrence[aria-pressed="true"]').focus();
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      await page.keyboard.press(key);
      await waitForReplayAssertion(async seen => {
        assert.equal(seen(await page.locator('#level .case-occurrence[aria-pressed="true"]').getAttribute('data-occurrence-id')), first,
          'R5 horizontal keys must not step the roster');
      }, "R5");
    }
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(id => {
      const held = document.querySelector('#level .case-occurrence[aria-pressed="true"]')?.dataset.occurrenceId;
      return held && held !== id;
    }, first, { timeout: 30000 });
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(id => document.querySelector('#level .case-occurrence[aria-pressed="true"]')?.dataset.occurrenceId === id,
      first, { timeout: 30000 });
  },
  async R7(page) {
    await C2_STORIES.openComparisonCase(page);
    await waitForReplayAssertion(async seen => {
      assert.ok(!(seen(await glucoseSeries(page))).some(id => /occurrence[- ]?dot/i.test(id)), 'R7 occurrence dots returned');
    }, "R7");
    await selectOccurrence(page);
    await waitForReplayAssertion(async seen => {
      assert.ok(seen(await page.locator('#level .occ-detail').isVisible()), 'R7 occurrences remain reachable from Findings');
    }, "R7");
  },
  async R8(page) {
    await fullDayDiagnose(page);
    await waitForReplayAssertion(async seen => {
      assert.ok(!(seen(await glucoseSeries(page))).some(id => /meal[- ]?(glyph|marker)/i.test(id)), 'R8 meal markers returned');
    }, "R8");
    const file = await C2_STORIES.comparisonFigure(page, 'finding:carb_undercount');
    await waitForReplayAssertion(async seen => {
      assert.equal(file.finding.id, 'finding:carb_undercount', 'R8 requires meal evidence');
      assert.ok(seen(await page.locator('#ec-chart canvas').count()) > 0, 'R8 meal comparison remains reachable');
    }, "R8");
    await page.keyboard.press('Escape');
    await selectOccurrence(page);
    await press(page, '.occ-foot button:last-child');
    await page.locator('.gf-stage-day').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      assert.ok(seen(await page.locator('[aria-label="Episode Log"]').count()) > 0, 'R8 the Day log remains reachable');
    }, "R8");
  },
  async R9(page) {
    await comparisonSelection(page);
    await absent(page, '.occurrence-level, .drill-level, .counter-example-subgroup', 'R9 separate drill level returned');
    await waitForReplayAssertion(async seen => {
      assert.ok(seen(await page.locator('.inspector #level .occ-detail').isVisible()), 'R9 selected detail occupies the standing inspector');
    }, "R9");
  },
  async R10(page) {
    await fullDayDiagnose(page);
    await absent(page, '.ic-lane, [data-lane="ic"]', 'R10 standalone carb-ratio lane returned');
    const row = page.locator('#level .qrow[data-id^="ic:"]').first();
    await row.waitFor({ timeout: 30000 }); const id = await row.getAttribute('data-id'); await row.click();
    await page.locator(`#tile-focal .evidence-tile[data-chart-id="${id}"] canvas`).first().waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      assert.ok(seen(await page.locator('#level .numrow').count()) > 0, 'R10 carb-ratio case evidence remains');
    }, "R10");
  },
  async R11(page) {
    await comparisonSelection(page);
    await waitForReplayAssertion(async seen => {
      const rows = seen(await page.locator('#level .case-occurrence').allTextContents());
      assert.ok(rows.length > 0, 'R11 evidence rows remain activatable');
      assert.ok(rows.every(text => !/[›»❯]/.test(text)), 'R11 redundant evidence-row chevrons returned');
    }, "R11");
  },
  async R12(page) {
    await comparisonSelection(page);
    await absent(page, '.lens-inspector, [data-lens]', 'R12 standalone lens inspector returned');
    await waitForReplayAssertion(async seen => {
      assert.ok(seen(await page.locator('.inspector #level .occ-detail').isVisible()), 'R12 shared inspector remains');
      assert.ok((seen(await glucoseSeries(page))).includes('That day'), 'R12 selected trace remains on the shipped clock canvas');
    }, "R12");
    await press(page, '.occ-foot button:last-child');
    await page.locator('.gf-stage-day').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      assert.ok(seen(await page.locator('[data-day="return"]').isVisible()), 'R12 contextual Day route remains');
    }, "R12");
  },
  async R13(page) {
    await C2_STORIES.comparisonFigure(page);
    await absent(page, '[data-filter="event-charts"], .event-charts-root, [data-control="by-event"]', 'R13 global Event charts / By event controls returned');
    await waitForReplayAssertion(async seen => {
      assert.ok(seen(await page.locator('#ec-chart canvas').count()) > 0, 'R13 case-file-backed comparison tile remains reachable');
    }, "R13");
  },
  async R15(page) {
    process.stdout.write('AMENDED R15 premise — ADR 397 · Connor Griffin · 2026-09-08; transcribed 2026-09-10: Diagnose preserves Findings, Spotlight and All Charts.\n');
    await fullDayDiagnose(page);
    await absent(page, '[data-dock-mode], .dock-layout-toggle, .duplicate-tile', 'R15 retired dock mechanics returned');
    await absent(page, '[data-destination="overview"], [data-destination="explore"]', 'R15 retired destinations returned');
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('[data-destination="diagnose"]').count()), 1);
      assert.equal(seen(await page.locator('[data-destination="changes"]').count()), 1);
      assert.ok(seen(await page.locator('#level .qrow').count()) > 0, 'R15 Findings remain');
      assert.equal(seen(await page.locator('#tile-focal').count()), 1, 'R15 Spotlight remains');
      assert.equal(seen(await page.locator('#explorer-trigger').count()), 1, 'R15 All charts remains');
    }, "R15");
    await page.getByRole('button', { name: 'All charts', exact: true }).click();
    await waitForReplayAssertion(async seen => {
      assert.ok(seen(await page.locator('#tile-row .evidence-tile').count()) > 0, 'R15 All charts opens the catalog');
    }, "R15");
  },
  async R17(page) {
    process.stdout.write('AMENDED R17 premise — ADR 397 · Connor Griffin · 2026-09-08; coordinator amendment 4 transcribed 2026-09-10: a served finishable Trial replaces the prototype ready scenario.\n');
    const roster = await read(page, '/api/verify/trials');
    assert.equal(roster.admission.active_kind, 'trial', 'R17 requires a served active Trial');
    assert.equal(roster.admission.can_finish_trial, true, 'R17 requires a finishable Trial');
    await press(page, '[data-destination="changes"]');
    await page.locator('.gf-stage-trial').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.getByRole('button', { name: 'Keep', exact: true }).count()), 0, 'R17 session-only Keep returned');
      assert.ok(seen(await page.locator('[data-part="plan-route"] [data-action="plan-route"]').isVisible()), 'R17 Revert-to-Plan remains');
      assert.ok(seen(await page.locator('[data-form="finish"] #conclusion').isVisible()), 'R17 conclusion form remains');
    }, "R17");
    await C3_STORIES.S52(page);
    await page.reload();
    await page.locator('[data-ending-kind="user_finished"]').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.getByRole('button', { name: 'Keep', exact: true }).count()), 0, 'R17 durable finish does not restore Keep');
    }, "R17");
  },
};
