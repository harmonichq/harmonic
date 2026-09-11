// Amendment 1 acceptance: real manufactured records, served by the app.
import { waitForReplayAssertion } from '../frontend/replay-assertions.mjs';
import assert from 'node:assert/strict';
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
  await page.goto(new URL(`/v2/?to=changes&subject=history&occurrence=${encodeURIComponent(`record:trial:${id}`)}`, page.url()).href);
  await press(page, '[data-assessment="retained"]');
  await page.locator('[data-reassessment-context="retained"]').waitFor({ timeout: 30000 });
  return detail.reassessment.comparison;
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
  for (const [edge, from, to, target, span] of [
    ['b', 720, 1080, 1290, '12:00–21:30'],
    ['a', 720, 1290, 930, '15:30–21:30'],
  ]) {
    await settled(page);
    // Local until the c4 workstation animation helper lands on this branch.
    await page.waitForFunction(async () => {
      await document.fonts.ready;
      const plot = document.querySelector('#chart');
      const grips = ['#grip-a', '#grip-b'].map(selector => document.querySelector(selector));
      const chart = plot && globalThis.echarts.getInstanceByDom(plot);
      if (!chart || grips.some(grip => !grip) || document.querySelector('#brace')?.hidden) return false;
      const idle = () => chart.getZr().animation.isFinished() && !document.getAnimations().some(animation =>
        (animation.playState === 'running' || animation.pending)
        && animation.effect?.getComputedTiming().iterations !== Infinity);
      const boxes = () => [plot, ...grips].flatMap(node => {
        const box = node.getBoundingClientRect();
        return [box.x, box.y, box.width, box.height];
      });
      if (!idle() || plot.clientWidth <= 0 || plot.clientHeight <= 0) return false;
      const before = boxes();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return idle() && boxes().every((value, i) => Math.abs(value - before[i]) < 0.25);
    }, null, { timeout: 10000 });
    const grips = await page.locator('#chart').evaluate(() => Object.fromEntries(['a', 'b'].map(edge => {
      const box = document.querySelector(`#grip-${edge}`).getBoundingClientRect();
      return [edge, { x: box.x + box.width / 2, y: box.y + box.height / 2 }];
    })));
    const perMinute = (grips.b.x - grips.a.x) / (to - from);
    assert.ok(perMinute > 0, '#404 drawn-window premise: laid-out brace edges must be ordered');
    await page.mouse.move(grips[edge].x, grips[edge].y);
    await page.mouse.down();
    try {
      await page.mouse.move(grips.a.x + (target - from) * perMinute, grips[edge].y, { steps: 8 });
      // Pointerup cancels a queued drag repaint. Observe the snapped live chip
      // BEFORE release, so the final pointer move has actually been applied.
      await drawnChip404(page, span);
    } finally { await page.mouse.up(); }
    await settled(page);
    await drawnChip404(page, span);
  }
}
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
    return { left: clipped ? Math.max(clip.left, rect.left) : rect.left,
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
    rows: [...document.querySelectorAll('#level .case-occurrence')].map(row => {
      const only = row.querySelector('.only'); const tier = row.querySelector('.tier');
      return only && tier ? { label: only.textContent.trim(), cohort: tier.textContent.trim(),
        only: textBox(only), tier: textBox(tier) } : null;
    }).filter(Boolean),
  };
});
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
    assert.notEqual(await focal.getAttribute('data-chart-id'), previous,
      'S102 thin basal slot click left the Pattern graph on stage');
    assert.equal(await focal.getAttribute('data-chart-id'), 'basal:720',
      'S102 the stage must open the selected 12:00 basal graph, including its thin state');
  },
  async S103(page) {
    // Separate from S102: a graph failure must not mask the lost-window proof.
    const failures = [];
    for (const mode of ['24 h', 'Morning', 'drawn']) {
      await page.goto(new URL('/v2/?to=diagnose', page.url()).href);
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
    await page.goto(new URL('/v2/?to=changes&subject=plan', page.url()).href);
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
    const meal = page.locator('#tile-row .evidence-tile[data-chart-id="finding:meal_bolus_short"]');
    assert.ok(await meal.count(), 'S107 premise: showcase supplies the long meal cohort chart');
    await meal.click();
    await page.waitForFunction(id => document.querySelector('#tile-focal .evidence-tile')?.dataset.chartId === id,
      'finding:meal_bolus_short', { timeout: 30000 });
    await settled(page); await page.locator('#level .case-occurrence').first().waitFor({ timeout: 30000 });
    const drilled = await geometry404(page);
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
    assert.ok(drilled.rows.length, 'S107 premise: the long meal chart supplies comparison cohort rows');
    for (const row of drilled.rows) {
      const xOverlap = Math.max(0, Math.min(row.only.right, row.tier.right) - Math.max(row.only.left, row.tier.left));
      const yOverlap = Math.max(0, Math.min(row.only.bottom, row.tier.bottom) - Math.max(row.only.top, row.tier.top));
      if (xOverlap > 0 && yOverlap > 0) failures.push({ label: row.label, cohort: row.cohort, xOverlap, yOverlap,
        expected: 'description and cohort text do not overlap' });
    }
    assert.deepEqual(failures, [], 'S107 desk geometry must preserve labels, rails, focal placement and long cohort rows');
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
    await page.goto(new URL(`/v2/?to=diagnose&subject=${encodeURIComponent(row.id)}`, page.url()).href);
    await settled(page); await absent();
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('#level [data-register="history"]').count()), 0);
    }, "historicalAbsence");
  }
  for (const kind of ['trial', 'focus']) {
    const record = roster[kind === 'trial' ? 'trials' : 'focuses'][0];
    await page.goto(new URL(`/v2/?to=changes&subject=history&occurrence=${encodeURIComponent(`record:${kind}:${record.id}`)}`, page.url()).href);
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
