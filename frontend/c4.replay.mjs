// Amendment 1 acceptance: real manufactured records, served by the app.
import { waitForReplayAssertion } from './replay-assertions.mjs';
import assert from 'node:assert/strict';
import { hhmm, xAtMinute } from './diagnose-workstation-chart.js';
import { boundedWait, C2_STORIES, waitForCharts, waitForDesk } from './c2.replay.mjs';
import { C3_STORIES } from './c3.replay.mjs';
import { captureStory } from './capture.mjs';
import { parseRoute } from './tab-routing.js';
import { stamp } from './frame.js';

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
// #429: the watch dock at the foot of the Diagnose inspector names Changes, and
// its link opens Changes on the watched record. The served admission is read
// first, so a case serving no active watch fails at a premise, never at the label.
async function watchDock429(page, id, kind) {
  const roster = await read(page, '/api/verify/trials');
  assert.equal(roster.admission?.state, 'available', `${id} premise: the case must publish available follow-up admission`);
  assert.equal(roster.admission.active_kind, kind, `${id} premise: the case must serve an active ${kind}`);
  const active = roster.admission.active_id;
  assert.ok(active != null, `${id} premise: the case must publish the active watch identity`);
  let slot = null; let detail = null;
  if (kind === 'trial') {
    const changes = (await read(page, '/api/verify/trials', { kind, selected: active })).selected?.changes || [];
    slot = changes.length === 1 ? changes[0].slot : null;
    assert.ok(slot, `${id} premise: the admitted Trial must serve one change with its slot`);
  } else {
    const pinned = roster.focuses.find(row => row.id === active)?.pinned_at;
    assert.ok(typeof pinned === 'string', `${id} premise: the admitted Focus must serve its pin date`);
    detail = `Pinned ${pinned.slice(5, 10)} · adherence and outcome are read in Changes`;
  }

  await press(page, 'nav.v2-nav [data-destination="diagnose"]');
  const dock = page.locator('.inspector > .watch');
  await waitForReplayAssertion(async seen => {
    assert.equal(seen(await dock.getAttribute('data-state')), kind, `${id} premise: the dock must report the watched ${kind}`);
  }, `${id} the dock reports the watched ${kind}`);
  await waitForReplayAssertion(async seen => {
    assert.equal(seen((await dock.locator('.go').innerText()).trim()), 'Open Changes ›',
      `${id} the dock's link must read "Open Changes ›"`);
    assert.doesNotMatch(seen(await dock.innerText()), /Verify/, `${id} no dock text may name Verify`);
    if (detail) assert.equal(seen((await dock.locator('.how').innerText()).trim()), detail,
      `${id} the Focus detail line must say where adherence and outcome are read`);
  }, `${id} the dock names Changes`);

  await dock.locator('.go').click();
  await waitForReplayAssertion(async seen => {
    const route = parseRoute(new URL(seen(page.url())));
    assert.equal(route.destination, 'changes', `${id} the dock's link must land on Changes`);
    assert.equal(route.context.subject, 'watch', `${id} the arrival must name the watch`);
  }, `${id} the dock's link opens Changes on the watch`);
  await page.locator(`.gf-stage-${kind}`).waitFor({ state: 'visible', timeout: 30000 });
  if (slot) await waitForReplayAssertion(async seen => {
    assert.ok(seen(await page.locator('.gf-stage-trial .gf-title').innerText()).includes(slot),
      `${id} the Trial's own view must be titled for the admitted Trial's slot ${slot}`);
  }, `${id} Changes shows the admitted Trial`);
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
      return { occurrenceId: row.dataset.occurrenceId || null,
        comparisonCohort: row.dataset.comparisonCohort || null,
        description: only ? textBox(only) : null, tier: tier ? textBox(tier) : null };
    }),
  };
});

const overlap404 = (left, right) => ({
  x: Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)),
  y: Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)),
});

// #432: the served-description contract S148, S150 and amended S107 read. A row
// whose anchor serves carbs reads its carbs, its dose and its served outcome; a
// row with a dose and no carbs reads that dose then its anchor label; any other
// row reads its anchor glucose then its label. Carbs and glucose print whole and
// a dose to at most one decimal.
const whole432 = value => (value == null ? '—' : String(Math.round(value)));
const dose432 = value => (value == null ? '—' : `${Math.round(value * 10) / 10} U`);
const figure432 = anchor => (anchor.carbs != null ? `${whole432(anchor.carbs)} g · ${dose432(anchor.insulin)}`
  : anchor.insulin != null ? dose432(anchor.insulin) : whole432(anchor.bg));
export function expectedDescription432(row) {
  const figure = figure432(row.anchor);
  if (row.anchor.carbs == null) return `${figure} · ${row.anchor.label}`;
  return row.outcome ? `${figure} · ${row.outcome.kind} ${whole432(row.outcome.bg)}` : figure;
}
const BAND432 = { fired: 'Meets criteria', near_miss: 'Borderline', clean: 'Does not meet',
  outranked: 'claimed by another finding', no_data: 'not comparable' };

// Each rendered roster row against its own served meal. A row is a premise only
// while it is a served Occurrence; the served facts themselves are the feature.
export function assertServedRowDescriptions432(id, served, rendered) {
  assert.ok(rendered.length, `${id} premise: the drilled case renders Occurrence rows`);
  const byId = new Map(served.occurrences.map(row => [row.id, row]));
  for (const row of rendered) {
    const source = byId.get(row.occurrenceId);
    assert.ok(source, `${id} premise: rendered row ${row.occurrenceId} is a served Occurrence`);
    assert.ok(source.anchor.carbs != null && source.anchor.insulin != null,
      `${id} every meal row must serve its carbs and dose; ${row.occurrenceId} serves ${JSON.stringify(source.anchor)}`);
    assert.doesNotMatch(row.text ?? '', /^—/, `${id} no meal row may lead with a dash: ${row.text}`);
    assert.equal(row.text, expectedDescription432(source),
      `${id} ${row.occurrenceId} must read its own served carbs, dose and outcome`);
  }
}

// The selected block against its served detail: the anchor figure, the outcome
// line, the served cause and every served habit with its band label, and no line
// that only counts readings or markers or describes the canvas.
export function assertSelectedFacts432(id, detail, block, { outcome = null } = {}) {
  assert.ok(detail && block, `${id} premise: a selected Occurrence and its rendered block`);
  assert.ok(detail.anchor?.carbs != null && detail.anchor.insulin != null,
    `${id} the selected meal must serve its carbs and dose; it serves ${JSON.stringify(detail.anchor)}`);
  assert.ok(block.figure.startsWith(figure432(detail.anchor)),
    `${id} the figure line must read the served carbs and dose: ${block.figure}`);
  if (outcome) {
    assert.equal(detail.outcome?.kind, outcome, `${id} the selected meal must serve its Arc ${outcome}`);
  }
  const outcomeLines = block.lines.filter(line => line.kind === 'outcome').map(line => line.text);
  assert.deepEqual(outcomeLines, detail.outcome ? [`${detail.outcome.kind === 'peak' ? 'Peak' : 'Nadir'} `
    + `${whole432(detail.outcome.bg)} mg/dL, ${Math.round(detail.outcome.minute)} min after the bolus`] : [],
  `${id} the outcome line must equal the served outcome`);
  assert.ok(detail.reason, `${id} the selected Occurrence must serve its reason`);
  const causeLines = block.lines.filter(line => line.kind === 'cause').map(line => line.text);
  assert.deepEqual(causeLines, detail.reason.cause ? [[`Attributed to ${detail.reason.cause.title}`,
    detail.reason.cause.text].filter(Boolean).join(' · ')] : [], `${id} the cause line must name the served cause`);
  assert.deepEqual(block.lines.filter(line => line.kind === 'habit').map(line => line.text),
    detail.reason.habits.map(habit => [habit.title, BAND432[habit.verdict], habit.detail].filter(Boolean).join(' · ')),
    `${id} the block must list each served habit with its band label and sentence`);
  for (const line of block.lines) {
    assert.doesNotMatch(line.text, /^\d+ (glucose readings|event markers)$/, `${id} no line may be only a count: ${line.text}`);
  }
  assert.doesNotMatch(block.text, /The canvas shows/, `${id} no sentence may describe the canvas`);
}

// #454: a claimed Occurrence prints its claimant's sentence once. The served cause
// carries it as text, the rendered cause line carries it, no other rendered line
// repeats it, and the claimant's habit line reads its title and band label only.
export function assertSentenceOnce454(id, detail, block) {
  assert.ok(detail && block, `${id} premise: a selected Occurrence and its rendered block`);
  const cause = detail.reason?.cause;
  assert.ok(cause, `${id} premise: the selected Occurrence is claimed and serves its cause`);
  const claimant = detail.reason.habits.find(habit => habit.lever === cause.lever);
  assert.ok(claimant, `${id} premise: the claimant is one of the served habits`);
  assert.ok(cause.text, `${id} the served cause must carry the claimant's sentence`);
  const [causeLine, ...extra] = block.lines.filter(line => line.kind === 'cause');
  assert.ok(causeLine?.text.includes(cause.text) && !extra.length,
    `${id} the cause line must carry the served sentence: ${JSON.stringify(causeLine)}`);
  for (const line of block.lines.filter(line => line !== causeLine)) {
    assert.ok(!line.text.includes(cause.text), `${id} the cause's sentence must print once; it repeats on: ${line.text}`);
  }
  assert.ok(block.lines.some(line => line.kind === 'habit'
    && line.text === `${claimant.title} · ${BAND432[claimant.verdict]}`),
  `${id} the claimant's habit line must read its title and band label only`);
}

const renderedRows432 = page => page.evaluate(() => [...document.querySelectorAll('#level .case-occurrence')]
  .map(node => ({ occurrenceId: node.dataset.occurrenceId || null,
    text: node.querySelector('.only')?.textContent.replace(/\s+/g, ' ').trim() ?? null })));
const selectedBlock432 = page => page.evaluate(() => {
  const detail = document.querySelector('#level .occ-detail');
  const figure = detail?.querySelector('.occ-nums');
  return detail && {
    text: [detail, ...document.querySelectorAll('#level .case-facts')]
      .map(node => node.textContent.replace(/\s+/g, ' ').trim()).join(' '),
    figure: figure ? figure.textContent.replace(/\s+/g, ' ').trim() : '',
    lines: [...document.querySelectorAll('#level .case-facts .vd')].map(node => ({
      kind: [...node.classList].find(name => name !== 'vd') ?? null,
      text: node.textContent.replace(/\s+/g, ' ').trim(),
    })),
  };
});
async function expandRoster432(page) {
  if (await page.locator('#level .more').count()) {
    await page.locator('#level .more').first().click();
    await settled(page);
  }
}
async function mealBolusShortCase432(page) {
  await fullDayDiagnose(page);
  await page.getByRole('button', { name: 'All charts', exact: true }).click();
  await page.locator('#chart-headacts button[aria-label="Close"]').waitFor({ timeout: 30000 });
  return (await drillMeal404(page, 'event')).served;
}
// The chartable Highs after meals Pattern, drilled from All charts to its event case;
// returns that case's coordinate.
async function highsAfterMealsCase432(page, id) {
  await fullDayDiagnose(page);
  const preparation = await read(page, '/api/diagnose/finding-case-file-preparation');
  const pattern = preparation.rendered_rows.find(row => row.id === 'pattern:highs_after_meals' && row.pattern_chart);
  assert.ok(pattern, `${id} premise: the case store serves a chartable Highs after meals Pattern`);
  await page.getByRole('button', { name: 'All charts', exact: true }).click();
  await press(page, `#tile-row .evidence-tile[data-chart-id="${pattern.id}"]`);
  await page.locator(`#tile-focal .evidence-tile[data-chart-id="${pattern.id}"]`).waitFor({ timeout: 30000 });
  await settled(page); await page.locator('#level .case-occurrence').first().waitFor({ timeout: 30000 });
  return { projection_id: preparation.projection_id, finding_id: pattern.id, alignment: 'event' };
}

// Comparison membership is grouped by a constant served cohort name. Ordinary
// case rows instead retain their row-tier column, so the geometry witness must
// prove both rendered shapes rather than treating one as the other. #432: each
// row's readable text is its own served description.
export function assertS107ComparisonGeometry(comparison, expectedCohorts, served) {
  assert.deepEqual(comparison.cohortHeadings, expectedCohorts.map(cohort => cohort.name),
    'S107 comparison headings must name the exact served cohorts once');
  const groupedRows = comparison.rows.filter(row => row.comparisonCohort);
  assert.ok(groupedRows.length, 'S107 premise: the long meal chart supplies comparison cohort rows');
  for (const row of groupedRows) {
    assert.ok(expectedCohorts.some(cohort => cohort.key === row.comparisonCohort),
      `S107 comparison row names an unknown cohort: ${row.comparisonCohort}`);
    assert.equal(row.tier, null, 'S107 comparison rows must not repeat their grouped cohort label');
    assert.ok(row.description?.text === servedDescription107(served, row) && !row.description.truncated,
      `S107 comparison event text must remain fully readable: ${JSON.stringify(row.description)}`);
  }
}

const servedDescription107 = (served, row) => {
  const source = served.occurrences.find(occurrence => occurrence.id === row.occurrenceId);
  return source ? expectedDescription432(source) : null;
};

export function assertS107TierGeometry(tierRows, served) {
  assert.ok(tierRows.length, 'S107 premise: the same meal case supplies ordinary tier rows');
  const labels = new Set(tierRows.map(row => row.tier?.text).filter(Boolean));
  assert.ok(labels.size > 1, `S107 needs mixed ordinary tier labels: ${JSON.stringify([...labels])}`);
  for (const row of tierRows) {
    assert.ok(row.description?.text === servedDescription107(served, row) && !row.description.truncated
      && row.tier && !row.tier.truncated,
      `S107 ordinary event text and tier must remain fully readable: ${JSON.stringify(row)}`);
    const overlap = overlap404(row.description, row.tier);
    assert.equal(overlap.x > 0 && overlap.y > 0, false,
      `S107 ordinary description and tier columns overlap: ${JSON.stringify({ row, overlap })}`);
  }
}

export function assertS107RosterGeometry({ comparison, tierRows, expectedCohorts, served }) {
  assertS107ComparisonGeometry(comparison, expectedCohorts, served);
  assertS107TierGeometry(tierRows, served);
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
  return heldStatusReturn(page, storyId, 'nav.v2-nav [data-destination="diagnose"]');
}
// Press `returnControl` (the topbar's Diagnose, or Day's Return to Diagnose)
// with /api/status held, and report every request the return issued.
async function heldStatusReturn(page, storyId, returnControl) {
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
    await press(page, returnControl);
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
// #428 (ADR 428): Diagnose's address names the case the reader is on. Each read
// here is the page's own address, as a reload or a shared link would carry it.
const address428 = page => page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
const heldOccurrence428 = page => page.evaluate(() =>
  document.querySelector('#level .case-occurrence[aria-pressed="true"]')?.dataset.occurrenceId ?? null);
const waitForHeld428 = (page, id) => page.waitForFunction(id =>
  document.querySelector('#level .case-occurrence[aria-pressed="true"]')?.dataset.occurrenceId === id,
id, { timeout: 30000 });
// The showcase's over-treated low at 24 h: hold the first of a served cohort's
// Occurrences (the ↑/↓ traversal steps within that cohort), open it in Day and
// return. The showcase serves this Finding re-scoped in the Afternoon only.
async function heldCaseThroughDay428(page, storyId) {
  const file = await C2_STORIES.openComparisonCase(page);
  const cohort = file.projection.cohorts.find(cohort => cohort.occurrence_ids.length > 1);
  assert.ok(cohort, `${storyId} premise: one served cohort must hold two Occurrences`);
  const [first, second] = cohort.occurrence_ids;
  const row = page.locator(`#level .case-occurrence[data-occurrence-id="${first}"]`);
  if (!await row.count()) await page.locator('#level .more').first().click();
  await selectOccurrence(page, row);
  await press(page, '.occ-foot button:last-child');
  await page.locator('.gf-stage-day').waitFor({ timeout: 30000 });
  await press(page, '[data-day="return"]');
  await waitForHeld428(page, first);
  await waitForDesk(page);
  return { subject: file.finding.id, first, second };
}
async function editChainRoster414(page) {
  await page.goto(new URL('/?to=changes&subject=history', page.url()).href);
  await page.locator('.gf-stage-table[aria-label="Change records"] table.gf-table').waitFor({ timeout: 30000 });
}
// #430: the Changes roster's first still-open record, from the roster itself.
async function openStillOpenRecord430(page, storyId) {
  await page.goto(new URL('/?to=changes&subject=history', page.url()).href);
  await page.locator('table.gf-table').waitFor({ timeout: 30000 });
  const open = page.locator('table.gf-table tr', { has: page.locator('[data-record-open="true"]') })
    .locator('[data-record]').first();
  assert.ok(await open.count(), `${storyId} premise: the roster serves a still-open record`);
  return open;
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

// #413: S116's scenario, factored out the same way as S113's below. The
// candidates are chosen by the served chart coordinate alone, so a desk that
// serves no count sentence still reaches the feature assertion.
export async function assertRankedMinis(page, rows) {
  // The ECharts instance lives on the `.mini` host itself (its canvas sits in
  // an inner div), and `getOption()` normalises the graphic list into one
  // group whose `elements` carry the texts.
  const graphicOf = async (id) => page.evaluate((rowId) => {
    const mini = document.querySelector(`.qrow[data-id="${CSS.escape(rowId)}"] .mini`);
    const chart = mini?.querySelector('canvas') && window.echarts.getInstanceByDom(mini);
    const graphic = chart?.getOption().graphic;
    return graphic ? graphic.flatMap((item) => item.elements || [item]).map((item) => item.style?.text) : null;
  }, id);
  const candidates = rows.filter((row) => row.pattern_chart || (row.event_chart && !row.claimed_by));
  assert.ok(candidates.length > 0, 'S116 premise: the showcase must rank a mini-bearing Pattern or Cause');
  await waitForReplayAssertion(async seen => {
    let mounted = 0;
    for (const row of candidates) {
      const graphic = seen(await graphicOf(row.id));
      if (!graphic) continue; // an unmounted mini (too narrow) is covered elsewhere, not this story
      mounted += 1;
      const sentence = row.count_sentences?.[0];
      assert.ok(sentence,
        `S116 ${row.id}'s mini must draw from its served count sentence; none is served, and it draws ${JSON.stringify(graphic)}`);
      assert.deepEqual(graphic, [
        `${sentence.outcome.toUpperCase()} · ${sentence.count}`,
        `TYPICAL · ${sentence.denominator}`,
      ], `S116 ${row.id}'s mini must draw the served outcome word and count, and TYPICAL with the denominator`);
    }
    assert.ok(mounted > 0, 'S116 at least one ranked mini must be mounted to compare');
  }, 'S116 every ranked mini draws the same instrument, from the served row');
}

// #433: one reading of the canvas pane and the basal lane inside it, in
// viewport pixels. It runs in the page (handed to `page.evaluate`), so it
// closes over nothing. It first waits until the layout has held still for five
// frames, so a resize or a wheel's scroll has landed before anything is read.
// Given `from`, the pane's scroll offset before a wheel, it first waits up to
// half a second for that offset to move: a scroll the compositor has not
// started yet must not read as a pane that cannot scroll.
async function laneGeometry(from) {
  const wrap = document.querySelector('#lane-wrap');
  const pane = wrap?.closest('.canvas-pane');
  if (!pane) return null;
  await document.fonts.ready;
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  for (let wait = 0; from != null && pane.scrollTop === from && wait < 30; wait += 1) await frame();
  const signature = () => JSON.stringify([pane.scrollTop, pane.clientHeight, wrap.getBoundingClientRect()]);
  for (let last = null, still = 0, count = 0; still < 5 && count < 90; count += 1) {
    await frame();
    const now = signature();
    still = now === last ? still + 1 : 0;
    last = now;
  }
  const box = node => {
    const { top, bottom, left, right, height } = node.getBoundingClientRect();
    return { top, bottom, left, right, height };
  };
  const root = document.scrollingElement;
  const ancestors = [];
  for (let node = wrap.parentElement; node && node !== root; node = node.parentElement) {
    if (node === pane) continue;
    ancestors.push({ name: node.id ? `#${node.id}` : [node.tagName.toLowerCase(), ...node.classList].join('.'),
      scrollTop: node.scrollTop, scrollLeft: node.scrollLeft });
  }
  const paneBox = pane.getBoundingClientRect();
  const head = pane.querySelector(':scope > header.canvas-head');
  return {
    viewport: { width: innerWidth, height: innerHeight },
    root: { scrollTop: root.scrollTop, scrollLeft: root.scrollLeft, scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight, scrollWidth: root.scrollWidth, clientWidth: root.clientWidth },
    // The pane's visible box is its client box: the border edge plus
    // clientTop/clientLeft, clientHeight/clientWidth across.
    pane: {
      top: paneBox.top + pane.clientTop, bottom: paneBox.top + pane.clientTop + pane.clientHeight,
      left: paneBox.left + pane.clientLeft, right: paneBox.left + pane.clientLeft + pane.clientWidth,
      overflowY: getComputedStyle(pane).overflowY, scrollTop: pane.scrollTop, scrollLeft: pane.scrollLeft,
      scrollHeight: pane.scrollHeight, clientHeight: pane.clientHeight,
    },
    head: head && head.getClientRects().length ? box(head) : null,
    wrap: box(wrap),
    key: box(document.querySelector('#lane-key')),
    entries: [...document.querySelectorAll('#lane-key > span')]
      .map(entry => ({ text: entry.textContent.replace(/\s+/g, ' ').trim(), ...box(entry) })),
    cells: [...document.querySelectorAll('#lane > .lane-cell')].map(cell => ({
      cell: cell.dataset.cell, verdict: cell.dataset.verdict, name: cell.getAttribute('aria-label'), ...box(cell),
    })),
    chart: box(document.querySelector('#chart')),
    ancestors,
  };
}

const px = value => `${Math.round(value * 100) / 100}px`;
// How far a box runs past its bounds on one axis: 0 inside, with 1px of slack
// for subpixel layout.
const overrunY = (box, bounds) => {
  const over = Math.max(bounds.top - box.top, box.bottom - bounds.bottom);
  return over > 1 ? over : 0;
};
const overrunX = (box, bounds) => {
  const over = Math.max(bounds.left - box.left, box.right - bounds.right);
  return over > 1 ? over : 0;
};
// The rows of the canvas pane a reader can see: its client box, cut to the
// viewport.
const seenY = lane => ({ top: Math.max(lane.pane.top, 0), bottom: Math.min(lane.pane.bottom, lane.viewport.height) });
const laneInReach = lane => [lane.wrap, lane.key, ...lane.entries, ...lane.cells]
  .every(box => !overrunY(box, seenY(lane)));
// The boxes that overrun, how many, and the furthest.
const furthest = (boxes, over) => {
  const hits = boxes.map(box => ({ box, amount: over(box) })).filter(hit => hit.amount);
  return hits.length ? { count: hits.length, ...hits.reduce((a, b) => (b.amount > a.amount ? b : a)) } : null;
};

// #433: every way the basal lane is out of reach at one split size, one line
// each, named by size and axis with the measured overrun. `rest` is read
// before any wheel, `reached` after wheeling the pane toward the lane.
export function laneReachFailures(size, rest, reached) {
  const at = `${size.width}×${size.height}`;
  const failures = [];
  for (const [state, lane] of [['at rest', rest], ['after wheeling', reached]]) {
    const { root } = lane;
    if (root.scrollTop || root.scrollLeft || root.scrollHeight > root.clientHeight + 1
        || root.scrollWidth > root.clientWidth + 1) {
      failures.push(`${at} document: the root scrolls ${state} (offset ${root.scrollLeft}, ${root.scrollTop}; `
        + `extent ${root.scrollWidth}×${root.scrollHeight} in ${root.clientWidth}×${root.clientHeight})`);
    }
    if (lane.pane.scrollLeft) {
      failures.push(`${at} horizontal: the canvas pane scrolled sideways by ${px(lane.pane.scrollLeft)} ${state}`);
    }
    for (const node of lane.ancestors.filter(node => node.scrollTop || node.scrollLeft)) {
      failures.push(`${at} scroll: ${node.name} moved by (${px(node.scrollLeft)}, ${px(node.scrollTop)}) ${state}; `
        + 'only the canvas pane may scroll');
    }
  }

  if (!rest.head) failures.push(`${at} vertical: the canvas pane shows no header rail to wheel over`);
  const clipped = overrunY(rest.wrap, seenY(rest));
  if (clipped && !['auto', 'scroll'].includes(rest.pane.overflowY)) {
    failures.push(`${at} vertical: #lane-wrap overruns the canvas pane's visible box by ${px(clipped)} at rest, `
      + `and the pane cannot scroll (overflow-y: ${rest.pane.overflowY})`);
  }
  const rows = seenY(reached);
  for (const [name, box] of [['#lane-wrap', reached.wrap], ['#lane-key', reached.key]]) {
    const amount = overrunY(box, rows);
    if (amount) {
      failures.push(`${at} vertical: ${name} still overruns the canvas pane's visible box by ${px(amount)} `
        + 'after wheeling the pane');
    }
  }
  const entriesY = furthest(reached.entries, box => overrunY(box, rows));
  if (entriesY) {
    failures.push(`${at} vertical: ${entriesY.count} of ${reached.entries.length} key entries still overrun the `
      + `canvas pane's visible box after wheeling the pane, "${entriesY.box.text}" by ${px(entriesY.amount)}`);
  }
  const cellsY = furthest(reached.cells, box => overrunY(box, rows));
  if (cellsY) {
    failures.push(`${at} vertical: ${cellsY.count} of ${reached.cells.length} cells still overrun the canvas `
      + `pane's visible box after wheeling the pane, by up to ${px(cellsY.amount)}`);
  }

  const entriesX = furthest(rest.entries, box => overrunX(box, rest.pane));
  if (entriesX) {
    failures.push(`${at} horizontal: ${entriesX.count} of ${rest.entries.length} key entries run past the canvas `
      + `pane's client box, "${entriesX.box.text}" by ${px(entriesX.amount)}`);
  }
  const cellsX = furthest(rest.cells, box => overrunX(box, rest.pane));
  if (cellsX) {
    failures.push(`${at} horizontal: ${cellsX.count} of ${rest.cells.length} cells run past the canvas pane's `
      + `client box, by up to ${px(cellsX.amount)}`);
  }
  const chartX = overrunX(rest.chart, rest.pane);
  if (chartX) failures.push(`${at} horizontal: #chart runs past the canvas pane's client box by ${px(chartX)}`);

  const [lead] = rest.entries;
  for (const entry of rest.entries.filter(entry => entry.height > lead.height + 1)) {
    failures.push(`${at} key: entry "${entry.text}" is split over lines, ${px(entry.height)} tall against the `
      + `lead entry's ${px(lead.height)}`);
  }
  return failures;
}

// Wheel over the canvas pane's header rail, one `deltaY` step at a time, until
// `done` holds or the pane stops moving. It never sets a scroll offset: the
// base's `overflow: hidden` ancestors can be scrolled by script or by focus,
// which would fake a reach the reader does not have.
async function wheelPane(page, lane, deltaY, done) {
  for (let step = 0; step < 8 && lane.head && !done(lane); step += 1) {
    await page.mouse.move((lane.head.left + lane.head.right) / 2, (lane.head.top + lane.head.bottom) / 2);
    await page.mouse.wheel(0, deltaY);
    const next = await page.evaluate(laneGeometry, lane.pane.scrollTop);
    if (next.pane.scrollTop === lane.pane.scrollTop) return next;
    lane = next;
  }
  return lane;
}

// #433: the desktop split sizes the lane must stay within reach at: the
// report's window, which does not clip; a short one, which does; and the
// narrowest split at that same short height.
export const LANE_REACH_SIZES = Object.freeze([
  Object.freeze({ width: 1200, height: 736 }),
  Object.freeze({ width: 1200, height: 560 }),
  Object.freeze({ width: 832, height: 560 }),
]);

// #433: S151's scenario, factored out as S113's is so a fake page can drive
// it. It checks every size and both axes before it judges, then fails once,
// listing every failure, and restores the run's size even when checks failed.
export async function assertBasalLaneReachable(page, sizes = LANE_REACH_SIZES) {
  const run = page.viewportSize();
  const failures = [];
  try {
    for (const size of sizes) {
      await page.setViewportSize(size);
      const rest = await page.evaluate(laneGeometry);
      assert.ok(rest, 'S151 premise: the canvas pane and its basal lane must render');
      const reached = await wheelPane(page, rest, 120, laneInReach);
      failures.push(...laneReachFailures(size, rest, reached));
      // back to rest the same way, so the next size starts unscrolled
      await wheelPane(page, reached, -120, lane => lane.pane.scrollTop === 0);
    }
  } finally {
    await page.setViewportSize(run);
  }
  if (failures.length) {
    assert.fail(`S151 the basal lane must stay within reach at every split size; ${failures.length} `
      + `failure${failures.length === 1 ? '' : 's'}:\n  - ${failures.join('\n  - ')}`);
  }
}

// #433: the opened slot panel, as S152, S153 and S113 read it. Runs in the page.
// `stage` counts only Stage change buttons that render (have a box).
function readSlotPanel() {
  const panel = document.querySelector('#level .slot-head')?.closest('.inner');
  if (!panel) return null;
  const recommended = [...panel.querySelectorAll('.numrow')]
    .find(row => row.querySelector('.k')?.textContent.trim() === 'Recommended');
  return {
    time: panel.querySelector('.slot-head .time')?.textContent.trim(),
    verdict: panel.querySelector('.slot-head .verdict')?.textContent.trim(),
    recommended: recommended?.querySelector('b')?.textContent.trim() ?? null,
    stage: [...panel.querySelectorAll('.stagebtn')].filter(button => button.getClientRects().length).length,
    text: panel.textContent.replace(/\s+/g, ' '),
  };
}
const RECOMMENDED_VALUE = /^\d+\.\d{2}$/;

// #433: the served cells per key entry — a verdict, or a verdict and the served
// reason behind it (D6's recurring-lows lower) — exactly as the key counts them.
const laneEntryCounts = page => page.evaluate(() => {
  const counts = {};
  for (const cell of document.querySelectorAll('#lane > .lane-cell')) {
    const entry = cell.dataset.reason ? `${cell.dataset.verdict}:${cell.dataset.reason}` : cell.dataset.verdict;
    counts[entry] = (counts[entry] || 0) + 1;
  }
  return counts;
});
// A cell or key-swatch selector scoped to exactly one entry, so a measured
// lower and a recurring-lows lower never answer for each other.
const entrySelector = entry => {
  const [verdict, reason] = entry.split(':');
  return `[data-verdict="${verdict}"]${reason ? `[data-reason="${reason}"]` : ':not([data-reason])'}`;
};

// "One computed paint": both the cell and its key mark read the SAME `--cell`
// custom property off the one shared `.lane-cell[data-verdict]` rule
// (diagnose-workstation.css) — that shared token, not a raw `backgroundColor`
// string, is what the two surfaces are built to agree on (the key's own swatch
// composites it over a different, explicit backing so a translucent
// raise/lower tint still reads as the same colour by eye). Insufficient/no-data
// additionally carry a structural hatch/dot pattern; compare its gradient kind,
// the one thing the key's `--lane-structure` indirection is built to mirror.
// #433: each check is scoped to one key entry, verdict plus reason, so every
// count stays exact on any lane.
async function assertLaneKeyMatchesCells(page, entries) {
  for (const [entry, count] of Object.entries(entries)) {
    const verdict = entry.split(':')[0];
    const scope = entrySelector(entry);
    const keySwatch = page.locator(`#lane-key .lane-cell${scope}`);
    const keyCount = await page.locator(`#lane-key [title]:has(.lane-cell${scope}) .t`).innerText();
    assert.equal(Number(keyCount), count, `S113 the key's ${entry} count must equal the served lane count`);

    const cellSelector = `#lane > .lane-cell${scope}`;
    const [cellToken, keyToken] = await Promise.all([
      page.locator(cellSelector).first().evaluate(el => getComputedStyle(el).getPropertyValue('--cell').trim()),
      keySwatch.evaluate(el => getComputedStyle(el).getPropertyValue('--cell').trim()),
    ]);
    assert.equal(keyToken, cellToken, `S113 the ${entry} key mark must share the cell's --cell paint token`);

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
        `S113 the ${entry} key mark's structure must match its cells' (hatched vs dotted)`);
    }
    if (verdict === 'up' || verdict === 'down') {
      const [cellGlyph, keyGlyph] = await Promise.all([
        page.locator(cellSelector).first().evaluate(el => getComputedStyle(el, '::before').content),
        keySwatch.evaluate(el => getComputedStyle(el, '::before').content),
      ]);
      assert.notEqual(cellGlyph, 'none', `S113 a ${entry} cell must carry its directional glyph`);
      assert.equal(keyGlyph, cellGlyph, `S113 the ${entry} key mark must carry the same glyph as its cells`);
    }
  }
}

// #413: S113's scenario, factored out of the story so a fake page can drive
// it directly, from this module's own node regression test, without also
// faking `openBasalLane`'s own network reads and navigation — the same
// boundary S31-S35 already draw (no fake-page test covers their shared
// opener either).
export async function assertBasalLaneGallery(page) {
  const entries = await laneEntryCounts(page);
  const verdicts = Object.keys(entries).map(entry => entry.split(':')[0]);
  for (const verdict of ['up', 'down', 'hold', 'insufficient', 'nodata']) {
    assert.ok(verdicts.includes(verdict),
      `S113 premise: the gallery case must serve a ${verdict} slot; saw ${JSON.stringify(entries)}`);
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

  // #433: at the run's own size (1280×720 or 1440×900) the whole lane stands
  // inside the canvas pane at rest, its key on one line, in a pane with no
  // scroll range — so ADR 433's short-window scroll and key wrap move nothing
  // at the supported sizes.
  await waitForReplayAssertion(async seen => {
    const lane = seen(await page.evaluate(laneGeometry));
    assert.ok(lane, 'S113 premise: the canvas pane and its lane must render');
    const outside = [['#lane-wrap', lane.wrap], ...lane.entries.map(entry => [`key entry "${entry.text}"`, entry])]
      .map(([name, box]) => [name, Math.max(overrunY(box, lane.pane), overrunX(box, lane.pane))])
      .filter(([, amount]) => amount);
    assert.deepEqual(outside, [], 'S113 the lane and every key entry must stand wholly inside the canvas pane at rest; '
      + outside.map(([name, amount]) => `${name} overruns it by ${px(amount)}`).join(', '));
    const [lead] = lane.entries;
    const wrapped = lane.entries.filter(entry => Math.abs(entry.top - lead.top) > 1).map(entry => entry.text);
    assert.deepEqual(wrapped, [], `S113 the key must stand on one line at this size; ${wrapped.join(', ')} `
      + 'wrapped below the lead entry');
    assert.ok(lane.pane.scrollHeight <= lane.pane.clientHeight + 1, 'S113 the canvas pane must have no scroll range '
      + `at this size; it scrolls ${lane.pane.scrollHeight - lane.pane.clientHeight}px`);
  }, 'S113 the whole lane stands inside the canvas pane at rest, its key on one line');

  await assertLaneKeyMatchesCells(page, entries);

  // The selection, the stage and the lower verdict are three different marks
  // (#413 critique 7): the selected cell keeps the PRIMARY outline, the staged
  // cell an underline, and a lower cell its fill; and every cell stands wholly
  // inside the lane's own track, so none of the three is clipped (critique 1).
  const marks = await page.evaluate(() => {
    const lane = document.querySelector('#lane');
    const probe = document.createElement('span');
    probe.style.color = 'var(--primary)';
    lane.append(probe);
    const primary = getComputedStyle(probe).color;
    probe.remove();
    const selected = document.querySelector('#lane > .lane-cell[aria-pressed="true"]');
    const staged = document.querySelector('#lane > .lane-cell[data-staged="true"]');
    const selectedStyle = getComputedStyle(selected);
    const underline = getComputedStyle(staged, '::after');
    const track = lane.getBoundingClientRect();
    const cells = [...lane.querySelectorAll(':scope > .lane-cell')].map((cell) => cell.getBoundingClientRect());
    return {
      primary, outlineStyle: selectedStyle.outlineStyle, outlineColor: selectedStyle.outlineColor,
      fill: selectedStyle.backgroundColor, underline: underline.content, underlineHeight: underline.height,
      clipped: cells.filter((box) => box.top < track.top - 1 || box.bottom > track.bottom + 1).length,
    };
  });
  assert.equal(marks.clipped, 0, `S113 every lane cell must stand wholly inside the lane's track; ${marks.clipped} overflow it`);
  assert.equal(marks.outlineStyle, 'solid', 'S113 the selected cell must carry an outline');
  assert.equal(marks.outlineColor, marks.primary, 'S113 the selected cell must keep the primary outline');
  assert.notEqual(marks.outlineColor, marks.fill, 'S113 the selected lower cell\'s outline must read apart from its fill');
  assert.notEqual(marks.underline, 'none', 'S113 the staged cell must carry its underline');
  assert.equal(marks.underlineHeight, '2px', 'S113 the staged mark must be an underline, not a fill');
}

// #433 (D6): S113's variant on a lane whose only asserting slot is a
// recurring-lows lower with no steady nights (`basal-recurring-low-no-clean-median`,
// scripts/qa_e2e_cases.py, which serves it at 05:00).
async function assertRecurringLowsLower(page) {
  await waitForReplayAssertion(async seen => {
    const entries = seen(await page.locator('#lane-key > span')
      .evaluateAll(spans => spans.map(span => span.textContent.replace(/\s+/g, ' ').trim())));
    assert.ok(entries.includes('lower · recurring lows 1'),
      `S113 the key must read "lower · recurring lows 1"; it reads ${JSON.stringify(entries)}`);
    assert.ok(!entries.some(entry => /^lower \d+$/.test(entry)),
      `S113 a recurring-lows lower must not also count under "lower"; the key reads ${JSON.stringify(entries)}`);
  }, 'S113 the key names the recurring-lows lower apart from a measured lower');
  await assertLaneKeyMatchesCells(page, await laneEntryCounts(page));

  const cell = page.locator('#lane > .lane-cell[data-verdict="down"][data-reason="recurring-lows"]');
  assert.equal(await cell.count(), 1, 'S113 premise: the case must serve exactly one recurring-lows lower');
  assert.equal(await cell.getAttribute('aria-label'),
    '05:00 basal slot, suggests a lower because lows keep happening at this hour',
    'S113 the recurring-lows lower cell\'s name must say the lower comes from recurring lows');
  await cell.click();
  await waitForReplayAssertion(async seen => {
    const panel = seen(await page.evaluate(readSlotPanel));
    assert.ok(panel?.time?.startsWith('05:00'), `S113 premise: the 05:00 slot's panel must open; it shows ${panel?.time}`);
    assert.equal(panel.verdict, 'lower (recurring lows)', 'S113 the panel must read the served verdict');
    assert.match(panel.recommended ?? '', RECOMMENDED_VALUE,
      `S113 the recurring-lows lower must show a Recommended value; it shows ${panel.recommended}`);
    assert.equal(panel.stage, 1, 'S113 the recurring-lows lower must offer the Stage change button');
  }, 'S113 the recurring-lows lower opens its staging panel');
}

// #433 (D6): S113's variant route, exported so a fake page can drive it. It
// cannot reuse `openBasalLane`: that opener drills the basal Finding and waits
// for the slot's first steady night (`#level .case-occurrence`), and this
// store's 05:00 slot serves none — no steady nights is the case's point. The
// lane is canvas furniture that renders on the plain rail, so the variant opens
// Diagnose at 24 h, waits for all 48 slots, and opens the 05:00 cell itself.
export async function assertRecurringLowsVariant(page) {
  await openDiagnoseRail(page);
  await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('#lane > button.lane-cell').count()), 48,
      'S113 premise: the recurring-lows store must render all 48 basal slots');
  }, 'S113 the recurring-lows lane renders on the 24 h rail');
  await assertRecurringLowsLower(page);
}

// #424 · 2026-09-23. The case-file counts revision's fail-first obligations
// (S124–S126, and S115's amended fold lines). Each story reads the served payload
// first: the base serves no `outside_comparison`, `band_verdict` or
// `fold_sentences`, so that presence check is where the base fails, before any
// rendered word is read. Every asserted number comes from the served payload.
export function assertServedComparison424(id, file) {
  const { cohorts = [], counts = {} } = file?.projection || {};
  assert.ok(Object.hasOwn(counts, 'outside_comparison') && !Object.hasOwn(counts, 'not_comparable')
    && cohorts.length > 0 && cohorts.every(cohort => Object.hasOwn(cohort, 'band_verdict')),
  `${id} the case file must serve its count outside the comparison and each cohort's band state`);
}

/* The Response comparison caption, read against its served case file: every
   cohort under its served name and count, in served order, matching its section
   heading; the band's own words once after a cohort that holds a band state; the
   Occurrences outside the comparison only when their served count is non-zero;
   and no visible count but the band's no-data one labelled "not comparable". */
export function assertComparisonCaption424(id, file, view) {
  const { cohorts, counts } = file.projection;
  const terms = view.caption ? view.caption.split(' · ') : [];
  cohorts.forEach((cohort, index) => {
    const lead = cohort.band_verdict ? view.bandLeads[cohort.band_verdict] : null;
    const expected = `${counts[cohort.key]} ${cohort.name}${lead ? ` (${lead.toLowerCase()})` : ''}`;
    assert.equal(terms[index], expected, `${id} caption term ${index + 1} must read "${expected}"`);
    assert.deepEqual(view.headings[index], { name: cohort.name, count: counts[cohort.key] },
      `${id} the caption's ${cohort.name} must match its section heading`);
  });
  const outside = counts.outside_comparison;
  const rest = terms.slice(cohorts.length);
  if (outside) {
    const noun = outside === 1 ? file.summary.noun.replace(/s$/, '') : file.summary.noun;
    assert.deepEqual(rest, [`${outside} ${noun} outside the comparison`],
      `${id} the caption must name the ${outside} ${noun} outside the comparison`);
  } else {
    assert.deepEqual(rest, [], `${id} nothing outside the comparison may print when none is served`);
  }
  const noData = file.verdict_counts.no_data;
  assert.deepEqual(view.notComparable, noData ? [`${noData} not comparable`] : [],
    `${id} only the band's no-data count may read "not comparable"`);
  if (noData) {
    assert.ok(view.foot.includes(`${noData} not comparable`),
      `${id} the band's no-data count keeps "not comparable": ${view.foot}`);
  }
}

export function assertServedFold424(id, members) {
  assert.ok(members.length > 0 && members.every(member => Array.isArray(member.fold_sentences)
    && member.fold_sentences.length > 0), `${id} every folded cause must serve its fold sentences`);
}

/* A folded cause's line, read against its served fold sentences: its share of
   the Pattern's count beside its name, every outside sentence set apart behind
   "outside the count", and never an outcome word. */
export function assertFoldLine424(id, member, line) {
  const counted = (text, sentence) => text.includes(`${sentence.count} of ${sentence.denominator} ${sentence.noun}`);
  const share = member.fold_sentences.filter(sentence => sentence.scope === 'pattern');
  const outside = member.fold_sentences.filter(sentence => sentence.scope === 'outside');
  for (const sentence of share) {
    assert.ok(counted(line.den, sentence),
      `${id} ${member.id} must print its share of the Pattern beside its name: "${line.den}"`);
  }
  for (const sentence of outside) {
    assert.ok(line.out.startsWith('outside the count') && counted(line.out, sentence) && !counted(line.den, sentence),
      `${id} ${member.id} must set its other counts apart behind "outside the count": "${line.den}" / "${line.out}"`);
  }
  if (!outside.length) {
    assert.equal(line.out, '', `${id} ${member.id} serves nothing outside the count, so prints no such row`);
  }
  for (const sentence of member.fold_sentences) {
    assert.ok(!`${line.den} ${line.out}`.includes(sentence.outcome),
      `${id} ${member.id} must not print an outcome word: "${line.den} ${line.out}"`);
  }
}

const comparisonView424 = page => page.evaluate(() => {
  const level = document.querySelector('#level');
  const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  const cap = [...level.querySelectorAll('.lvl-cap')].find(node => text(node).startsWith('Response comparison'));
  return {
    caption: text(cap?.querySelector('.meta')),
    headings: [...level.querySelectorAll('.ev-group')].map(group => ({
      name: text(group.querySelector('b')),
      count: Number((text(group.querySelector('.n')).match(/\d+/) || [Number.NaN])[0]),
    })),
    bandLeads: Object.fromEntries([...level.querySelectorAll('.vband .key[data-verdict]')]
      .map(key => [key.dataset.verdict, text(key.querySelector('.lead'))])),
    notComparable: level.innerText.match(/\d+ not comparable/g) || [],
    foot: text(level.querySelector('.vband-foot')),
    denominator: Number(text(level.querySelector('.statline b:nth-of-type(2)'))),
  };
});

async function openPatternFold(page, parentId) {
  await page.evaluate((id) => {
    const item = document.querySelector(`#level .qrow[data-id="${CSS.escape(id)}"]`).parentElement;
    const toggle = item.querySelector(':scope > .qfold');
    if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
  }, parentId);
}

async function foldLines424(page, parentId, members) {
  const lines = {};
  for (const member of members) {
    const line = page.locator(`#level .qitem:has(> .qrow[data-id="${parentId}"]) .qcauses .qmember[data-id="${member.id}"]`);
    await line.waitFor({ timeout: 30000 });
    const text = async selector => (await line.locator(selector).count()
      ? (await line.locator(selector).innerText()).replace(/\s+/g, ' ').trim() : '');
    lines[member.id] = { den: await text('.den'), out: await text('.out') };
  }
  return lines;
}

// #423: open Day and pick `iso` from the Month calendar, paging back from the
// arrival month (pattern-near-tie arrives on its latest recorded day, 2024-06-08).
async function openDay423(page, id, iso) {
  await press(page, 'nav.v2-nav [data-destination="day"]');
  await waitForDesk(page);
  await press(page, '.gf-month-toggle');
  await waitForDesk(page);
  const cell = page.locator(`.gf-nav-cell[data-pick="${iso}"]`);
  for (let paged = 0; paged < 12 && !(await cell.count()); paged += 1) {
    assert.equal(await page.locator('[data-day="prev-month"]').isEnabled(), true,
      `${id} premise: ${iso} must lie in a recorded month before the arrival month`);
    await press(page, '[data-day="prev-month"]');
    await waitForDesk(page);
  }
  assert.equal(await cell.isEnabled(), true, `${id} premise: ${iso} must be a recorded day in the Month calendar`);
  await cell.click();
  await waitForDesk(page);
  await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator(`.gf-nav-col[data-pick="${iso}"]`).getAttribute('aria-pressed')), 'true',
      `${id} premise: the Day desk must hold ${iso}`);
  }, `${id} Day holds ${iso}`);
}

// #423: one reading of the held Day's Episode Log and its anchor overlay. It
// runs in the page (handed to `page.evaluate`), so it closes over nothing.
// `claimed` and `fired` are the two anchors' served times. Marker styles come
// from the chart's own option, by series id: on pattern-near-tie both rings sit
// before the Day axis, so the axis clips them from view.
function readClaimedLog423({ claimed, fired }) {
  const tierAt = (t) => document.querySelector(`.gf-log-row[data-day-row="${t}"] .tier`);
  const probe = document.createElement('span');
  probe.style.color = 'var(--mk-warn)';
  document.body.append(probe);
  const warnInk = getComputedStyle(probe).color;
  probe.remove();
  const host = document.querySelector('.gf-stage-day .gf-chart');
  const chart = host && window.echarts?.getInstanceByDom(host);
  const data = chart?.getOption().series.find((series) => series.id === 'day-anchor-markers')?.data || null;
  const marker = (t) => {
    const found = data?.find((item) => item._t === t);
    return found ? { size: found.symbolSize, border: found.itemStyle?.borderColor, fill: found.itemStyle?.color } : null;
  };
  const tier = tierAt(claimed);
  const firedTier = tierAt(fired);
  const root = getComputedStyle(document.documentElement);
  return {
    claimed: tier ? {
      word: tier.textContent.trim(), state: tier.dataset.state, ink: getComputedStyle(tier).color,
      text: tier.closest('.gf-log-row').querySelector('.text')?.textContent.trim() ?? '',
    } : null,
    firedInk: firedTier ? getComputedStyle(firedTier).color : null,
    warnInk,
    captions: [...document.querySelectorAll('.gf-reading .gf-log-cap')]
      .map((cap) => (cap.querySelector('.gf-log-title') || cap).textContent.trim()),
    markers: data ? { claimed: marker(claimed), fired: marker(fired) } : null,
    surface: root.getPropertyValue('--surface').trim(),
    accent: root.getPropertyValue('--accent').trim(),
  };
}

// #423: S121's scenario once Day holds the day, exported so a fake page can
// drive it. `model` is the day's served /api/model-view read. The premises name
// the store's facts; every feature check is collected, so a base run names each
// thing the revision changes rather than only the first.
export async function assertClaimedEpisodeLog(page, model) {
  const anchors = (model.episodes || []).flatMap((episode) => episode.anchors.map((anchor) => ({ ...anchor, episode })));
  const claimed = anchors.find((anchor) => anchor.state === 'outranked' && anchor.kind === 'low'
    && anchor.verdicts.some((verdict) => verdict.matched && verdict.classifier === 'correction_on_iob'));
  assert.ok(claimed, 'S121 premise: the day must serve a claimed low whose own verdict matched correction_on_iob');
  assert.equal(claimed.episode.lever, 'carb_undercount', 'S121 premise: a carb undercount episode must claim the low');
  const fired = anchors.find((anchor) => anchor.episode === claimed.episode && anchor.state === 'fired');
  assert.ok(fired, "S121 premise: the claimed low's episode must serve the anchor that drove it");
  const levers = new Set(anchors.filter((anchor) => (anchor.state === 'fired' || anchor.state === 'outranked') && anchor.episode.lever)
    .map((anchor) => anchor.episode.lever));
  const claimedCount = anchors.filter((anchor) => anchor.state === 'outranked').length;
  assert.deepEqual({ findings: levers.size, claimed: claimedCount }, { findings: 1, claimed: 1 },
    'S121 premise: the day must serve one Finding holding one claimed anchor');
  const title = claimed.verdicts.find((verdict) => verdict.matched && verdict.classifier === 'correction_on_iob').title;
  const leverTitle = claimed.episode.lever_title;

  // Before any row is pressed: the claimed row is rendered and the overlay
  // carries both anchors' resting markers.
  const rest = await waitForReplayAssertion(async seen => {
    const snapshot = seen(await page.evaluate(readClaimedLog423, { claimed: claimed.t, fired: fired.t }));
    assert.ok(snapshot.claimed, `S121 premise: the Episode Log must render the claimed low's row (${claimed.t})`);
    assert.ok(snapshot.firedInk, `S121 premise: the Episode Log must render the fired anchor's row (${fired.t})`);
    assert.ok(snapshot.markers?.claimed && snapshot.markers?.fired,
      'S121 premise: the day-anchor-markers series must carry both anchors\' markers');
    return snapshot;
  }, 'S121 the claimed row and both resting markers are read');

  const failures = [];
  const row = rest.claimed;
  if (row.word !== 'claimed') failures.push(`its tier reads "${row.word}", not "claimed"`);
  if (row.state !== 'outranked') failures.push(`its tier carries data-state="${row.state}", not the served "outranked"`);
  if (!title) failures.push("the model read serves no title on the low's matched correction_on_iob verdict");
  else if (!row.text.includes(` · ${title} · `)) failures.push(`the row "${row.text}" does not name what the low matched ("${title}") before its Finding`);
  // The episode's served name (#426) is part of the row's relationship, so a
  // desk that serves none (the pre-release base) fails here, never at a premise.
  if (!leverTitle) failures.push('the model read serves no lever_title on the claiming episode');
  else if (!row.text.endsWith(` · ${leverTitle}`)) failures.push(`the row "${row.text}" does not end with the claiming Finding's served name ("${leverTitle}")`);
  if (/\w_\w/.test(row.text)) failures.push(`the row "${row.text}" prints an underscore token`);
  if (row.ink !== rest.firedInk) {
    failures.push(`its tier word paints ${row.ink}, not the fired tier's ${rest.firedInk}${row.ink === rest.warnInk ? ' (it is the warning ink)' : ''}`);
  }
  const caption = rest.captions.find((text) => text.startsWith('Findings'));
  if (caption !== 'Findings · 1 · 1 claimed') failures.push(`the Findings caption reads "${caption}", not "Findings · 1 · 1 claimed"`);
  const { claimed: ring, fired: driver } = rest.markers;
  if (ring.size !== driver.size) failures.push(`its resting marker is ${ring.size}, not the fired marker's ${driver.size}`);
  if (ring.border !== driver.border) failures.push(`its resting ring is ${ring.border}, not the fired ring's ${driver.border}`);
  if (ring.fill !== rest.surface) failures.push(`its resting fill is ${ring.fill}, not the surface ${rest.surface}`);
  assert.deepEqual(failures, [], `S121 the claimed low must read as part of the Finding that claimed it: ${failures.join('; ')}`);

  // Pressing the claimed row still picks its moment: the accent ring at size 15.
  await press(page, `.gf-log-row[data-day-row="${claimed.t}"]`);
  await waitForReplayAssertion(async seen => {
    const pressed = seen(await page.evaluate(readClaimedLog423, { claimed: claimed.t, fired: fired.t })).markers?.claimed;
    assert.deepEqual({ size: pressed?.size, border: pressed?.border }, { size: 15, border: rest.accent },
      'S121 pressing the claimed row must ring its marker in the accent at size 15');
  }, 'S121 the pressed claimed row picks its marker');
}

// #423: S122's readings, run in the page. The Findings caption and its
// Glossary control; the open Glossary and whether its Episode Log group's
// heading stands inside the pane's visible box; and where focus is.
function readFindingsControl423() {
  const caption = [...document.querySelectorAll('.gf-reading .gf-log-cap')]
    .find((cap) => (cap.querySelector('.gf-log-title') || cap).textContent.trim().startsWith('Findings'));
  const control = caption?.querySelector('[data-log-glossary]');
  return { caption: Boolean(caption), control: control
    ? { band: control.dataset.logGlossary, name: control.getAttribute('aria-label'), tag: control.tagName } : null };
}
function readGlossaryInView423() {
  const pane = document.querySelector('.gf-utility[data-utility="glossary"]');
  const body = pane?.querySelector('.gf-pane-body');
  const heading = pane?.querySelector('[data-glossary-group="Episode Log"] h3');
  if (!pane || !body || !heading) return { open: Boolean(pane), group: Boolean(heading), inView: false };
  const box = body.getBoundingClientRect();
  const head = heading.getBoundingClientRect();
  return { open: true, group: true, inView: head.height > 0 && head.top >= box.top - 1 && head.bottom <= box.bottom + 1 };
}
function readFocus423() {
  const active = document.activeElement;
  return { onControl: Boolean(active?.matches('[data-log-glossary="findings"]')),
    was: active ? `${active.tagName.toLowerCase()}${active.className ? `.${String(active.className).trim().split(/\s+/).join('.')}` : ''}` : null };
}

// #423: S122's scenario once Day holds the day, exported so a fake page can
// drive it: the Findings caption's Glossary control, operated from the
// keyboard, opens the Glossary with its Episode Log group in view, and Close
// returns focus to that control.
export async function assertBandGlossary(page) {
  const found = await waitForReplayAssertion(async seen => {
    const reading = seen(await page.evaluate(readFindingsControl423));
    assert.ok(reading.caption, 'S122 premise: the held Day\'s Episode Log must show a Findings caption');
    return reading;
  }, 'S122 the Findings caption is rendered');
  assert.deepEqual(found.control, { band: 'findings', name: 'Explain Findings in the Glossary', tag: 'BUTTON' },
    'S122 the Findings caption must carry a Glossary button named for its band');
  const control = page.locator('[data-log-glossary="findings"]');
  await control.focus();
  await page.keyboard.press('Enter');
  await waitForReplayAssertion(async seen => {
    const glossary = seen(await page.evaluate(readGlossaryInView423));
    assert.deepEqual(glossary, { open: true, group: true, inView: true },
      'S122 the caption control must open the Glossary with its Episode Log group in view');
  }, 'S122 the Glossary opens at the Episode Log group');
  await press(page, '[data-utility-close]');
  await waitForReplayAssertion(async seen => {
    const focus = seen(await page.evaluate(readFocus423));
    assert.equal(focus.onControl, true, `S122 closing the Glossary must return focus to the Findings caption control; focus is on ${focus.was}`);
  }, 'S122 Close returns focus to the caption control');
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
    // #431: the server, not the browser, confirms it; the door is the confirmed frame's.
    assert.equal((await read(page, '/api/plan/history')).history[0].verdict?.state, 'confirmed',
      'S105 premise: the server confirms the recorded Plan');
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
  // #431 · 2026-09-23. The server confirms a recorded Plan from the pump read
  // that holds it (ADR 431); Changes names that read, never the latest fetch.
  // The first check reads the served verdict and the Changes status together,
  // so a base history row that serves no verdict fails it rather than throwing.
  async S145(page, ctx) {
    assert.ok(ctx.capturePump, 'S145 requires CASE_STORE_DIR for synthetic in-place pump captures');
    await C2_STORIES.stageIntoPlan(page);
    await press(page, '[data-set="record"]');
    await page.locator('[data-set="withdraw"]').waitFor({ timeout: 30000 });
    await ctx.capturePump('in-place');
    await page.goto(new URL('/?to=changes&subject=plan', page.url()).href);
    await page.locator('.gf-status').waitFor({ timeout: 30000 });
    const confirmedAt = await waitForReplayAssertion(async seen => {
      const newest = seen(await read(page, '/api/plan/history')).history[0];
      const status = seen(await page.locator('.gf-status').innerText());
      assert.ok(newest?.verdict?.state === 'confirmed' && /On pump since/.test(status),
        `S145 the server must confirm the in-place Plan and Changes must say so (verdict ${newest?.verdict?.state}; status "${status}")`);
      assert.ok(status.includes(`On pump since ${stamp(newest.verdict.confirmed_at)}`),
        'S145 Changes must name the served confirming read');
      return newest.verdict.confirmed_at;
    }, 'S145 the served confirmation and the Changes status agree');
    await ctx.capturePump('in-place');
    await page.reload();
    await page.locator('.gf-status[data-state="confirmed"]').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      const newest = seen(await read(page, '/api/plan/history')).history[0];
      const pump = seen(await read(page, '/api/pump-settings'));
      const status = seen(await page.locator('.gf-status').innerText());
      assert.notEqual(stamp(pump.fetched_at), stamp(confirmedAt), 'S145 premise: the second capture is a later pump read');
      assert.equal(newest.verdict.confirmed_at, confirmedAt, 'S145 a later pump read must not move the confirmation');
      assert.ok(status.includes(`On pump since ${stamp(confirmedAt)}`) && !status.includes(stamp(pump.fetched_at)),
        `S145 Changes must keep naming the confirming read after a later one ("${status}")`);
    }, 'S145 a later pump read leaves the confirmed time unchanged');
  },
  // #431 · 2026-09-23. A draft saved after a confirmed Plan is the frame's
  // subject: Draft saved, recordable, with the confirmed Plan on its own line.
  async S146(page, ctx) {
    assert.ok(ctx.capturePump, 'S146 requires CASE_STORE_DIR for a synthetic in-place pump capture');
    await C2_STORIES.stageIntoPlan(page);
    await press(page, '[data-set="record"]');
    await page.locator('[data-set="withdraw"]').waitFor({ timeout: 30000 });
    await ctx.capturePump('in-place');
    const confirmed = (await read(page, '/api/plan/history')).history[0];
    assert.equal(confirmed.verdict?.state, 'confirmed', 'S146 premise: the server confirms the in-place Plan');
    // The next draft restores the source profile's value at each recorded slot:
    // it differs from the pump, which now holds the Plan, and carries no value
    // the store did not already hold.
    const source = confirmed.deliverable.source_profile.segments;
    const at = minute => [...source].reverse().find(row => row.start_min <= minute).basal_rate;
    const items = confirmed.items.map(item => ({ type: item.type, start_min: item.start_min, value: at(item.start_min) }));
    const saved = await page.request.put(new URL('/api/plan', page.url()).href, { data: { items } });
    assert.equal(saved.status(), 200, 'S146 premise: the next draft saves');
    await page.goto(new URL('/?to=changes&subject=plan', page.url()).href);
    await page.locator('.gf-plan').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      // The kicker is set in capitals by CSS, so innerText reads "PLAN · DRAFT
      // SAVED"; the phase word is the served-state text inside its <b>.
      const phase = seen(await page.locator('.gf-stage .gf-kicker b').textContent());
      const desk = seen(await page.locator('.gf-desk').innerText());
      assert.equal(phase, 'Draft saved', 'S146 a draft after a confirmed Plan reads Draft saved');
      assert.ok(!/doesn't match your plan|keying error/i.test(desk), 'S146 a next draft is not read as a keying error');
      assert.equal(seen(await page.locator('[data-set="record"]').filter({ visible: true }).count()), 1,
        'S146 offers Record decision');
      assert.equal(seen(await page.locator('[data-set="save-draft"]').filter({ visible: true }).count()), 1,
        'S146 offers Save draft');
      assert.ok(desk.includes(`Previous Plan: recorded ${stamp(confirmed.applied_at)}, confirmed on the pump ${stamp(confirmed.verdict.confirmed_at)}.`),
        'S146 names the confirmed Plan on its own line');
    }, 'S146 a draft after a confirmed Plan');
  },
  // #431 · 2026-09-23. A pending Plan reads the same in every window and case:
  // the watch panel carries it, and no case-file header names it. Every header
  // is checked before the panel, because the base panel has no Plan state and a
  // panel-first story would fail there instead of at the base's header note.
  async S147(page) {
    // Record a Plan from the served basal action through the routes, as S105 does.
    const guidance = await read(page, '/api/guidance');
    const basal = guidance.candidates.find(row => row.subject === 'setting:basal_rate' && row.action?.length);
    assert.ok(basal, 'S147 premise: a served basal action admits a Plan');
    const items = basal.action.flatMap(action => (action.member_start_mins || [action.start_min])
      .map(start => ({ type: 'basal', start_min: start, value: action.recommended })));
    const saved = await page.request.put(new URL('/api/plan', page.url()).href, { data: { items } });
    assert.equal(saved.status(), 200, 'S147 premise: the Plan draft saves');
    const applied = await page.request.post(new URL('/api/plan/apply', page.url()).href, { data: {} });
    assert.equal(applied.status(), 200, `S147 premise: the Plan decision records: ${await applied.text()}`);
    const { applied_at: appliedAt } = await applied.json();
    assert.equal((await read(page, '/api/focus')).admission.focus_pin.reason, 'pending_plan',
      'S147 premise: the recorded Plan withholds Focus');
    // A fresh Diagnose arrival: the header's decisions wait for the Focus read,
    // which carries the guidance read.
    const focusRead = Promise.all(['/api/focus', '/api/guidance'].map(path => page.waitForResponse(
      response => new URL(response.url()).pathname === path && response.ok(), { timeout: 60000 })));
    await page.goto(new URL('/', page.url()).href);
    await focusRead;
    await settled(page);
    const pattern = 'pattern:highs_after_meals';
    const windows = ['24 h', 'Evening'];
    const headers = {};
    for (const window of windows) {
      await page.getByRole('button', { name: window, exact: true }).click();
      await settled(page);
      await press(page, `#level .qrow[data-id="${pattern}"]`);
      // The case's occurrences render only after its case read, and that read
      // settles the header before the workstation receives it.
      await page.locator('#level .case-occurrence').first().waitFor({ timeout: 30000 });
      headers[window] = await page.evaluate(() => ({
        note: document.querySelectorAll('[data-focus-context], [data-focus-reason]').length,
        startFocus: document.querySelectorAll('[data-start-focus]').length,
        planWords: /View Plan|awaiting confirmation/.test(document.querySelector('header.crumb')?.textContent || ''),
      }));
      // Back to the rail (as S29 and S103 do): a Window press on a drilled case
      // re-scopes that case instead of listing the rail, and clears the case
      // Diagnose had selected, so the next window's Pattern must be drilled anew.
      await page.getByRole('button', { name: 'Findings', exact: true }).click();
      await settled(page);
    }
    const clean = { note: 0, startFocus: 0, planWords: false };
    assert.deepEqual(headers, Object.fromEntries(windows.map(window => [window, clean])),
      `S147 no case-file header may carry a pending-Plan note (${pattern} in ${windows.join(' and ')})`);
    const expected = { state: 'recorded', kind: 'Plan · awaiting pump', what: `Basal · recorded ${appliedAt.slice(5, 10)}`,
      how: 'Recorded — waiting for a pump read that matches', go: 'Open Changes ›' };
    for (const window of windows) {
      await page.getByRole('button', { name: window, exact: true }).click();
      await settled(page);
      await waitForReplayAssertion(async seen => {
        assert.deepEqual(seen(await page.locator('.inspector > .watch').evaluate(node => ({
          state: node.dataset.state, kind: node.querySelector('.kind')?.textContent,
          what: node.querySelector('.what')?.textContent, how: node.querySelector('.how')?.textContent,
          go: node.querySelector('.go')?.textContent,
        }))), expected, `S147 the watch panel reads the pending Plan in ${window}`);
      }, `S147 the watch panel in ${window}`);
    }
    await press(page, '.inspector > .watch .go');
    await page.waitForFunction(() =>
      document.querySelector('nav.v2-nav [aria-current="page"]')?.dataset.destination === 'changes', null, { timeout: 30000 });
    const address = new URL(page.url());
    assert.equal(address.pathname, '/changes', 'S147 Open Changes lands on Changes');
    assert.equal(address.searchParams.get('subject'), 'plan', 'S147 Open Changes opens the Plan, never the watched-change address');
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
      eventMeal.served.projection.cohorts.map(({ key, name }) => ({ key, name })), eventMeal.served);
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

    // #430 (ADR 430): a record with no saved ending reads its retained
    // comparison right after the record read, with no control pressed, so the
    // reassessment hold stands before the record read is released.
    const reassessHold = await heldRequest414(page, '**/api/verify/trials*',
      request => new URL(request.url()).searchParams.has('assessment'));
    recordHold.release(); await recordHold.close();
    await reassessHold.wait('S112 held reassessment read, requested with no control pressed');
    await page.locator('.gf-loading', { hasText: 'Computing reassessment' }).waitFor({ timeout: 30000 });
    reassessHold.release(); await reassessHold.close();
    await page.locator('[data-reassessment-context="retained"]').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('[data-unavailable="ending"]').count(), 1,
      'S112 premise: an edit-chain record carries no ending');
  },
  // #430: the record door's default read, and the figure that names why it is
  // empty. Both open the roster's first still-open record by a press, as a
  // reader does, and press no assessment control.
  async S142(page) {
    const open = await openStillOpenRecord430(page, 'S142');
    const assessments = [];
    const listener = request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/verify/trials' && url.searchParams.has('assessment')) {
        assessments.push(url.searchParams.get('assessment'));
      }
    };
    page.on('request', listener);
    try {
      await open.click();
      await page.locator('[data-record-part="reassessment"]').waitFor({ timeout: 30000 });
    } finally { page.off('request', listener); }
    assert.deepEqual(assessments, ['retained'],
      'S142 opening a still-open record must request its retained comparison once, with no control pressed');
    await waitForReplayAssertion(async seen => {
      for (const period of ['before', 'after']) {
        assert.equal(seen(await page.locator(`[data-period="${period}"]`).count()), 1,
          `S142 the record must show its ${period} evidence period`);
      }
      assert.ok(seen(await page.locator('[data-figure-state="paired"] .gf-chart canvas').count()) > 0,
        'S142 the figure must be paired, with its chart mounted');
      assert.equal(seen(await page.locator('[data-assessment="retained"][aria-pressed="true"]').count()), 1,
        'S142 Retained context must read as the selected assessment');
      assert.equal(seen(await page.locator('[data-unavailable="ending"]').count()), 1,
        'S142 the saved-ending part must still say the change is still open');
    }, 'S142 an open record shows its retained comparison');
  },
  async S143(page) {
    const open = await openStillOpenRecord430(page, 'S143');
    const [kind, ...rest] = (await open.getAttribute('data-record')).split(':');
    const served = (await read(page, '/api/verify/trials', { kind, selected: rest.join(':'), assessment: 'retained' }))
      .selected.reassessment.comparison.availability;
    assert.equal(served.state, 'unavailable', 'S143 premise: edit-chain serves an unavailable retained comparison');
    assert.ok(served.reason, 'S143 premise: the unavailable comparison names its served reason');
    await open.click();
    await page.locator('[data-record-part="reassessment"]').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('[data-figure-state="unavailable"]').count()), 1,
        'S143 the figure must read as an unavailable comparison');
      const reason = seen(await page.locator('[data-figure-reason]').innerText()).trim();
      assert.ok(reason, 'S143 the figure must name why the comparison is unavailable');
      assert.ok(!reason.includes(served.reason), `S143 the figure must name the reason in words, never its code: ${reason}`);
      const result = seen(await page.locator('[data-reassessment-state]').innerText()).trim();
      assert.ok(result.startsWith('Unavailable · '), `S143 the reassessment result must read as unavailable: ${result}`);
      assert.equal(result.slice('Unavailable · '.length).trim(), reason,
        'S143 the figure and the reassessment result must name the reason in the same words');
      assert.equal(seen(await page.locator('.gf-stage .gf-chart canvas').count()), 0,
        'S143 an unavailable figure must mount no chart');
      const stage = seen(await page.locator('.gf-stage').innerText());
      for (const phrase of ['no clock envelope is retained', 'no readings yet', '0 → 0 half-hours read']) {
        assert.ok(!stage.includes(phrase), `S143 the stage must not say "${phrase}"`);
      }
    }, 'S143 an unavailable record names its reason');
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
  // #433 (D6): a variant on a second case store proves the recurring-lows key
  // word, through its own route (`assertRecurringLowsVariant`: that store serves
  // no steady night for `openBasalLane` to wait on). It keeps S113 the one story
  // on that store, so the fixed PR slice, which already holds S113, covers it
  // unchanged.
  async S113(page, ctx) {
    await C2_STORIES.openBasalLane(page);
    await assertBasalLaneGallery(page);
    await ctx.withCase('basal-recurring-low-no-clean-median', assertRecurringLowsVariant);
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
      // One skeleton per pane: stage instruments in the loading block, rail
      // rows in the reading pane (#413 critique 2).
      for (const [pane, selector] of [['stage', '.gf-loading .gf-skeleton[aria-hidden="true"]'],
        ['rail', '.gf-desk > .gf-reading .gf-pane-body > .gf-skeleton[aria-hidden="true"]']]) {
        const skeleton = page.locator(selector);
        assert.equal(seen(await skeleton.count()), 1, `S114 the cold loading frame must carry one ${pane} skeleton block`);
        const marks = seen(await skeleton.locator('.gf-skel').count());
        assert.ok(marks > 0, `S114 the ${pane} skeleton must draw at least one mark`);
        const text = seen(await skeleton.innerText());
        assert.equal(text.trim(), '', `S114 the ${pane} skeleton must state no count, title or value`);
      }
      // The loading card holds every stage mark: none runs past its box.
      const spilled = seen(await page.evaluate(() => {
        const card = document.querySelector('.gf-loading').getBoundingClientRect();
        return [...document.querySelectorAll('.gf-loading .gf-skel')].filter((mark) => {
          const box = mark.getBoundingClientRect();
          return box.top < card.top - 1 || box.bottom > card.bottom + 1;
        }).length;
      }));
      assert.equal(spilled, 0, `S114 the loading card must contain its skeleton; ${spilled} mark(s) run past it`);
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
  // Amended by #424: a member line prints its served fold sentences — its
  // share beside its name, the rest behind "outside the count".
  async S115(page) {
    await openDiagnoseRail(page);
    const preparation = await read(page, '/api/diagnose/finding-case-file-preparation');
    const rows = preparation.rendered_rows;
    const parent = rows.find(row => row.kind === 'pattern' && rows.some(member => member.claimed_by === row.id));
    assert.ok(parent, 'S115 premise: the showcase must serve a Pattern owning at least one claimed cause');
    const members = rows.filter(row => row.claimed_by === parent.id);
    assert.ok(members.length > 0, 'S115 premise: the owning Pattern must have at least one claimed member');
    // #424 (Q2 sanction, 2026-09-23): a folded member line reads its served fold
    // sentences, so the fold's served shape is checked before any line is read.
    assertServedFold424('S115', members);
    const firstRankedTier = rows.find(row => row.priority != null)?.tier;
    assert.ok(firstRankedTier, 'S115 premise: the showcase must rank at least one row');

    await waitForReplayAssertion(async seen => {
      const rowIds = seen(await page.locator('#level .qrow').evaluateAll(nodes => nodes.map(n => n.dataset.id)));
      for (const member of members) {
        assert.ok(!rowIds.includes(member.id),
          `S115 ${member.id} must never be a sibling rail row`);
      }
      const toggle = page.locator(`#level .qitem:has(> .qrow[data-id="${parent.id}"]) > .qfold`);
      assert.equal(seen(await toggle.count()), 1, 'S115 the owning Pattern must show one fold toggle inside its own item');
      assert.equal(seen(await toggle.textContent()),
        `${members.length} ${members.length === 1 ? 'cause' : 'causes'}`,
        "S115 the toggle must name the served cause count");
    }, 'S115 causes fold under their Pattern, never as sibling rows');

    await openPatternFold(page, parent.id);

    await waitForReplayAssertion(async seen => {
      // The cause is announced inside its Pattern's item, never as a sibling.
      const lines = seen(await foldLines424(page, parent.id, members));
      for (const member of members) {
        if (member.fold_sentences.some(sentence => sentence.scope === 'pattern')) {
          const line = page.locator(`#level .qitem:has(> .qrow[data-id="${parent.id}"]) .qcauses .qmember[data-id="${member.id}"]`);
          const [name, share] = [seen(await line.locator('.lab').boundingBox()), seen(await line.locator('.den').boundingBox())];
          assert.ok(Math.abs(name.y - share.y) < name.height,
            `S115 ${member.id} must read as one line, name and share side by side`);
        }
        assertFoldLine424('S115', member, lines[member.id]);
      }
    }, 'S115 every served fold sentence prints, in served order, never merged');

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
    await assertRankedMinis(page, preparation.rendered_rows);
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
  // #423: on pattern-near-tie Day 2024-05-25, a claimed low reads as part of
  // the Finding that claimed it: its word, its relationship, its hue and size,
  // and the Findings count. `assertClaimedEpisodeLog` is the scenario.
  async S121(page) {
    await openDay423(page, 'S121', '2024-05-25');
    await assertClaimedEpisodeLog(page, await read(page, '/api/model-view', { date: '2024-05-25' }));
  },
  // #423: the same day's Findings caption opens the Glossary at its Episode
  // Log group, and Close returns focus to it. `assertBandGlossary` is the scenario.
  async S122(page) {
    await openDay423(page, 'S122', '2024-05-25');
    await assertBandGlossary(page);
  },
  // #425: Day's recorded-day count is the served history total, whichever
  // months are loaded, and each month's head counts its own days once. Paging
  // is asserted before the served comparison, so an app that counts loaded rows
  // fails on the count moving, not only on the field it lacks.
  async S127(page) {
    await press(page, 'nav.v2-nav [data-destination="day"]');
    await waitForDesk(page);
    await page.locator('.gf-stage-day .gf-chart canvas').first().waitFor();
    const railCount = async () => {
      const text = await page.locator('.gf-stage-day .instrument .meta.gf-desk-only').textContent();
      const match = /^(\d+) recorded days? · /.exec(text || '');
      assert.ok(match, `S127 the rail must state a recorded-day count: ${JSON.stringify(text)}`);
      return Number(match[1]);
    };
    // The shown month once its own cells have landed (a paged month is a served
    // read): its label, its head, and how many of its cells are recorded.
    const landedMonth = async (previous = null) => (await page.waitForFunction(prior => {
      const grid = document.querySelector('#gf-nav .gf-nav-month');
      const label = grid?.getAttribute('aria-label');
      if (!label || label === prior || !grid.querySelector('.gf-nav-cell[data-pick]')) return null;
      return { label, head: grid.querySelector('.gf-nav-month-head .meta')?.textContent || '',
        enabled: grid.querySelectorAll('.gf-nav-cell[data-pick]:not([disabled])').length };
    }, previous, { timeout: 30000 })).jsonValue();
    const arrival = await railCount();
    await press(page, '.gf-month-toggle');
    const held = await landedMonth();
    assert.equal(held.head, `${held.enabled} recorded days`, `S127 ${held.label}'s head must count its own recorded days`);
    assert.equal(await page.locator('[data-day="prev-month"]').isEnabled(), true, 'S127 premise: an earlier recorded month exists');
    await press(page, '[data-day="prev-month"]');
    const earlier = await landedMonth(held.label);
    assert.equal(await railCount(), arrival, `S127 loading ${earlier.label} must not move the rail's recorded-day count`);
    assert.equal(earlier.head, `${earlier.enabled} recorded days`,
      `S127 ${earlier.label}'s head must count its own recorded days once, without ${held.label}'s overlapping week`);
    await press(page, '[data-day="next-month"]');
    const back = await landedMonth(earlier.label);
    assert.equal(back.label, held.label, 'S127 the next month must return to the arrival month');
    assert.equal(await railCount(), arrival, 'S127 paging back must not move the rail\'s recorded-day count');
    assert.equal(back.head, `${back.enabled} recorded days`, `S127 ${back.label}'s head must count its own recorded days`);
    assert.equal(back.head, held.head, `S127 ${held.label}'s head must read as it did before ${earlier.label} was loaded`);
    const status = await read(page, '/api/status');
    assert.equal(arrival, status.data_day_count, 'S127 the rail must print the served data_day_count');
  },
  // #429: a watched Trial's dock names Changes, and its link opens that Trial.
  async S139(page) { await watchDock429(page, 'S139', 'trial'); },
  // #429: the same for a watched Focus, including its detail line.
  async S140(page) { await watchDock429(page, 'S140', 'focus'); },
  // #433: the basal lane stays within reach on short and narrow desktop
  // windows. `assertBasalLaneReachable` is the scenario, exported so a fake
  // page can drive it.
  async S151(page) {
    await C2_STORIES.openBasalLane(page);
    await assertBasalLaneReachable(page);
  },
  // #433: at each of S151's sizes, every raise and lower cell is reached the
  // way S151 reaches the lane, pointed at where the reader sees it, and opens
  // its staging panel. Never a locator click, which would scroll it into view.
  async S152(page) {
    await C2_STORIES.openBasalLane(page);
    const run = page.viewportSize();
    try {
      for (const size of LANE_REACH_SIZES) {
        const at = `${size.width}×${size.height}`;
        await page.setViewportSize(size);
        let lane = await page.evaluate(laneGeometry);
        assert.ok(lane, 'S152 premise: the canvas pane and its basal lane must render');
        const targets = lane.cells.filter(cell => cell.verdict === 'up' || cell.verdict === 'down');
        assert.ok(['up', 'down'].every(verdict => targets.some(cell => cell.verdict === verdict)),
          `S152 premise: the gallery case must serve a raise and a lower slot; saw ${JSON.stringify(targets.map(cell => cell.verdict))}`);
        for (const { cell: id, name } of targets) {
          const cellOf = reading => reading.cells.find(cell => cell.cell === id);
          const inReach = reading => !overrunY(cellOf(reading), seenY(reading));
          lane = await wheelPane(page, lane, 120, inReach);
          assert.ok(inReach(lane), `S152 ${at}: "${name}" still overruns the canvas pane's visible box by `
            + `${px(overrunY(cellOf(lane), seenY(lane)))} after wheeling the pane, so the reader cannot point at it`);
          // the centre of the part the reader sees: the cell cut to the pane's
          // visible box and the viewport
          const cell = cellOf(lane);
          const left = Math.max(cell.left, lane.pane.left, 0);
          const right = Math.min(cell.right, lane.pane.right, lane.viewport.width);
          const top = Math.max(cell.top, lane.pane.top, 0);
          const bottom = Math.min(cell.bottom, lane.pane.bottom, lane.viewport.height);
          assert.ok(right - left >= 1, `S152 ${at}: "${name}" shows no width inside the canvas pane to point at`);
          await page.mouse.click((left + right) / 2, (top + bottom) / 2);
          const head = hhmm(Number(id) * 30);
          await waitForReplayAssertion(async seen => {
            assert.equal(seen(await page.locator(`#lane > .lane-cell[data-cell="${id}"]`).getAttribute('aria-pressed')),
              'true', `S152 ${at}: pointing at "${name}" must select it`);
            const panel = seen(await page.evaluate(readSlotPanel));
            assert.ok(panel?.time?.startsWith(head), `S152 ${at}: the panel must open on the ${head} slot; it shows ${panel?.time}`);
            assert.match(panel.recommended ?? '', RECOMMENDED_VALUE,
              `S152 ${at}: "${name}" must open with a Recommended value; it shows ${panel.recommended}`);
            assert.equal(panel.stage, 1, `S152 ${at}: "${name}" must open with the Stage change button`);
          }, `S152 ${at}: "${name}" opens its staging panel`);
          lane = await page.evaluate(laneGeometry);
          assert.ok(inReach(lane), `S152 ${at}: "${name}" must still lie inside the canvas pane's visible box once picked`);
        }
        await wheelPane(page, lane, -120, reading => reading.pane.scrollTop === 0);
      }
    } finally {
      await page.setViewportSize(run);
    }
  },
  // #433: the key and every slot's panel read the same served staging
  // verdict. Needs no application change; it guards the one-predicate rule
  // from the page end.
  async S153(page) {
    await C2_STORIES.openBasalLane(page);
    const cells = await page.evaluate(() => [...document.querySelectorAll('#lane > .lane-cell')]
      .map(cell => ({ id: cell.dataset.cell, verdict: cell.dataset.verdict })));
    for (const verdict of ['up', 'down', 'hold', 'insufficient', 'nodata']) {
      assert.ok(cells.some(cell => cell.verdict === verdict), `S153 premise: the gallery case must serve a ${verdict} slot`);
    }
    for (const { id, verdict } of cells) {
      await page.locator(`#lane > .lane-cell[data-cell="${id}"]`).click();
      const head = `${hhmm(Number(id) * 30)}–${hhmm((Number(id) + 1) * 30)}`;
      await waitForReplayAssertion(async seen => {
        const panel = seen(await page.evaluate(readSlotPanel));
        assert.equal(panel?.time, head, `S153 premise: the ${head} slot's panel must open`);
        if (verdict === 'up' || verdict === 'down') {
          assert.match(panel.recommended ?? '', RECOMMENDED_VALUE,
            `S153 the ${head} slot, counted as ${verdict}, must show a Recommended value; it shows ${panel.recommended}`);
          assert.equal(panel.stage, 1, `S153 the ${head} slot, counted as ${verdict}, must offer the Stage change button`);
        } else {
          assert.ok(panel.text.includes('no direction asserted'),
            `S153 the ${head} slot, counted as ${verdict}, must say no direction is asserted`);
          assert.equal(panel.stage, 0, `S153 the ${head} slot, counted as ${verdict}, must offer no Stage change button`);
        }
      }, `S153 the ${head} slot's panel agrees with its key verdict`);
    }
  },
  // #434: the served desk names why a basal slot's nights were left out. The
  // showcase's 12:30 slot serves three excluded nights, one under insulin on
  // board and two for other reasons (the served 30-day payload, read in-process
  // through the API test client over a scratch copy of the showcase,
  // 2026-09-23). The panel line is asserted before anything reads the new
  // served breakdown, so the base app fails at that line rather than at a
  // premise; the served breakdown is then held to the pinned counts, so the
  // words on screen are proven to be the served ones.
  async S154(page) {
    await openDiagnoseRail(page);
    const served = await read(page, '/api/diagnose/basal-night-evidence', { slot: 25 });
    assert.equal(served.excluded_night_count, 3,
      'S154 premise: the showcase must serve three excluded nights at 12:30');
    await page.getByRole('button', { name: /^12:30 basal slot,/ }).click();
    await page.waitForFunction(() => document.querySelector('#lane > button[aria-pressed="true"]')
      ?.getAttribute('aria-label')?.startsWith('12:30 basal slot,'), null, { timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      const lines = seen(await page.locator('#level .empty').allInnerTexts());
      assert.ok(lines.includes('3 excluded nights: 1 insulin on board, 2 other reasons'),
        `S154 the panel's excluded-night line must name each served reason: ${JSON.stringify(lines)}`);
    }, 'S154 the panel line names the served reasons');
    assert.deepEqual(served.excluded_night_reasons, { before_current_setting: 0,
      below_range_or_suspended: 0, above_range: 0, insulin_acting: 1, carb_log: 0, other: 2 },
    'S154 the pinned counts must be the served breakdown');
    await waitForReplayAssertion(async seen => {
      const label = seen(await page.locator('#tile-focal .evidence-tile[data-chart-id="basal:750"] .tile-chart')
        .getAttribute('aria-label'));
      assert.ok(label?.includes('; 3 nights excluded: 1 insulin on board, 2 other reasons'),
        `S154 the tile's accessible description must name each served reason: ${label}`);
    }, 'S154 the tile description names the served reasons');
  },
  // #428 (ADR 428): after a Day return, every change to the case on screen —
  // here a key, a window choice and Backspace, none of them a Diagnose click —
  // renames the address in place, and a reload reopens what was on screen.
  async S136(page) {
    const { subject, second } = await heldCaseThroughDay428(page, 'S136');
    await page.keyboard.press('ArrowDown');
    await waitForHeld428(page, second);
    await waitForReplayAssertion(async seen => {
      assert.deepEqual(seen(await address428(page)), { subject, occurrence: second },
        'S136 ↓ must re-address to the stepped Occurrence, with no focus and no Day-entry key');
    }, 'S136 ↓ re-addresses');
    // The showcase serves no Finding at Overnight (its case file answers
    // finding_unavailable there), so the preset that keeps this case file open
    // re-scoped is Afternoon.
    const entries = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: 'Afternoon', exact: true }).click();
    await settled(page);
    await waitForReplayAssertion(async seen => {
      const held = seen(await heldOccurrence428(page));
      assert.deepEqual(seen(await address428(page)), { subject, ...(held ? { occurrence: held } : {}), window: '720-1080' },
        'S136 the window choice must re-address to the Finding, the Occurrence on screen and the Afternoon window');
      assert.equal(seen(await page.evaluate(() => history.length)), entries, 'S136 the window choice must add no history entry');
    }, 'S136 the window choice re-addresses');
    await page.keyboard.press('Backspace');
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('#level .case-occurrence').count()), 0, 'S136 premise: Backspace returns to Findings');
      assert.equal(seen(await page.evaluate(() => `${location.pathname}${location.search}`)), '/diagnose',
        'S136 back at Findings the address must name no case');
    }, 'S136 Backspace re-addresses');
    await page.reload();
    await settled(page);
    await waitForReplayAssertion(async seen => {
      assert.ok(seen(await page.locator('#level .qrow[data-id]').count()) > 0, 'S136 the reload must land on the Findings rail');
      assert.equal(seen(await page.locator('#level .case-occurrence').count()), 0, 'S136 the reload must open no case file');
    }, 'S136 the reload lands on Findings');
  },
  // #428: ADR 414's retained return also covers a plain Diagnose press after a
  // Day return, and the address then names the retained case.
  async S137(page) {
    const { subject, first } = await heldCaseThroughDay428(page, 'S137');
    const trailBefore = (await page.locator('#crumb-trail .here').innerText()).trim();
    const windowBefore = (await page.locator('#seg-window [aria-pressed="true"]').innerText()).trim();
    const requests = await heldReturnToDiagnose414(page, 'S137');
    assert.deepEqual(requests.filter(path => path !== '/api/status'), [],
      'S137 the return to Diagnose after a Day return must issue no request besides the held status check');
    assert.equal(requests.filter(path => path === '/api/status').length, 1,
      'S137 the return to Diagnose after a Day return must issue exactly one GET /api/status');
    assert.equal((await page.locator('#seg-window [aria-pressed="true"]').innerText()).trim(), windowBefore,
      'S137 the pressed window must remain pressed after the return');
    assert.equal((await page.locator('#crumb-trail .here').innerText()).trim(), trailBefore,
      'S137 the drilled case must remain open after the return');
    await waitForReplayAssertion(async seen => {
      assert.deepEqual(seen(await address428(page)), { subject, occurrence: first },
        'S137 the address must name the retained case, with no Day-entry key and no from');
    }, 'S137 the address names the retained case');
  },
  // #428: a case address in a preset window other than Overnight reopens that
  // case in that window, and its Day hop names the Occurrence, not a selector.
  async S138(page) {
    const subject = 'finding:over_treated_low';
    await press(page, '[data-destination="diagnose"]'); await settled(page);
    await page.getByRole('button', { name: 'Afternoon', exact: true }).click(); await settled(page);
    const row = page.locator(`#level .qrow[data-id="${subject}"]`);
    await row.waitFor({ timeout: 30000 });
    await row.click();
    await page.locator('#level .case-occurrence').first().waitFor({ timeout: 30000 });
    const held = await selectOccurrence(page);
    await waitForReplayAssertion(async seen => {
      assert.deepEqual(seen(await address428(page)), { subject, occurrence: held, window: '720-1080' },
        'S138 the address must name the Finding, its held Occurrence and the Afternoon window, with no focus');
    }, 'S138 the case address');
    await page.reload();
    await waitForHeld428(page, held);
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('#seg-window [aria-pressed="true"]').innerText()).trim(), 'Afternoon',
        'S138 the reload must reopen the case in its Afternoon window');
    }, 'S138 the reload reopens the case');
    await press(page, '.occ-foot button:last-child');
    await page.locator('.gf-stage-day').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      const day = seen(await address428(page));
      assert.equal(day.subject, subject); assert.equal(day.occurrence, held); assert.equal(day.window, '720-1080');
      assert.equal(Object.hasOwn(day, 'focus'), false, 'S138 the Day address must carry no return-focus key');
      assert.ok(!Object.values(day).some(value => /button|:last-child|^[.#[]/.test(value)),
        `S138 the Day address must carry no CSS selector: ${JSON.stringify(day)}`);
    }, 'S138 the Day address');
    const requests = await heldStatusReturn(page, 'S138', '[data-day="return"]');
    assert.deepEqual(requests.filter(path => path !== '/api/status'), [],
      'S138 the Day return to the held case must issue no request besides the held status check');
    assert.equal(requests.filter(path => path === '/api/status').length, 1,
      'S138 the Day return to the held case must issue exactly one GET /api/status');
    await waitForHeld428(page, held);
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('.occ-foot button:last-child').evaluate(node => node === document.activeElement)), true,
        'S138 the return must focus that Occurrence\'s Open in Day control');
    }, 'S138 the return focus');
  },
  // #424: a same-population comparison's caption names each served cohort as its
  // section heading does, links the band's words once, adds up to the header
  // denominator and prints nothing outside the comparison.
  async S124(page) {
    const file = await C2_STORIES.openComparisonCase(page, 'pattern:highs_after_meals');
    assertServedComparison424('S124', file);
    const { cohorts } = file.projection;
    assert.ok(file.cross_population === false
      && ['fired', 'near_miss'].every(state => cohorts.some(cohort => cohort.band_verdict === state)),
    'S124 premise: the carb-undercount Pattern must compare its own meals, holding Meets criteria and Borderline cohorts');
    await waitForReplayAssertion(async seen => {
      const view = seen(await comparisonView424(page));
      assertComparisonCaption424('S124', file, view);
      const total = view.caption.split(' · ').reduce((sum, term) => sum + Number.parseInt(term, 10), 0);
      assert.equal(total, view.denominator, "S124 the caption's counts must add up to the header denominator");
    }, 'S124 the same-population caption reconciles with its cohorts and the band');
  },
  // #424: a cross-population comparison's caption names its served Highs outside
  // the comparison in those words, links no band to its attributed Matched cohort,
  // and leaves "not comparable" to the band's no-data count alone.
  async S125(page) {
    const file = await C2_STORIES.openComparisonCase(page, 'finding:missed_meal');
    assertServedComparison424('S125', file);
    assert.ok(file.cross_population === true && file.projection.counts.outside_comparison > 0
      && file.verdict_counts.no_data > 0,
    'S125 premise: the missed-meal case must compare against announced meals, leave Highs outside it and hold a no-data High');
    await waitForReplayAssertion(async seen => {
      assertComparisonCaption424('S125', file, seen(await comparisonView424(page)));
    }, 'S125 the cross-population caption names its Highs outside the comparison');
  },
  // #424: the open fold prints Correction stacking's share of Lows after
  // correcting highs first and its correction-cluster count behind "outside the
  // count"; the cause lines' shares add up to the Pattern's served count.
  async S126(page) {
    await openDiagnoseRail(page);
    const rows = (await read(page, '/api/diagnose/finding-case-file-preparation')).rendered_rows;
    const parent = rows.find(row => row.id === 'pattern:lows_after_correcting_highs');
    const members = rows.filter(row => parent && row.claimed_by === parent.id);
    assert.ok(members.some(member => member.id === 'finding:correction_stacking'),
      'S126 premise: the correction-stacking case must fold Correction stacking under Lows after correcting highs');
    assertServedFold424('S126', members);
    const [own] = parent.count_sentences || [];
    assert.ok(own, 'S126 premise: Lows after correcting highs must serve its own count');
    const stacking = members.find(member => member.id === 'finding:correction_stacking');
    assert.ok(stacking.fold_sentences[0].scope === 'pattern' && stacking.fold_sentences.some(sentence =>
      sentence.scope === 'outside' && sentence.noun === 'correction clusters'),
    'S126 Correction stacking must serve its share of the Pattern first and its correction-cluster count outside it');
    await openPatternFold(page, parent.id);
    await waitForReplayAssertion(async seen => {
      const lines = seen(await foldLines424(page, parent.id, members));
      for (const member of members) assertFoldLine424('S126', member, lines[member.id]);
      const shares = members
        .map(member => /^(\d+) of (\d+) (.+)$/.exec(lines[member.id].den.split('·')[0].trim()))
        .filter(Boolean);
      for (const [, , denominator, noun] of shares) {
        assert.equal(`${denominator} ${noun}`, `${own.denominator} ${own.noun}`,
          "S126 every share must count on the Pattern's own population");
      }
      assert.equal(shares.reduce((sum, [, count]) => sum + Number(count), 0), own.count,
        "S126 the cause lines' shares must add up to the Pattern's served count");
    }, 'S126 a folded cause shows its share of the Pattern first');
  },
  // #432: fail-first on a4d374a7, where every Meal bolus short row reads a dash
  // and its constant anchor label, and the served case file carries no dose,
  // carbs, outcome or reason.
  async S148(page) {
    const served = await mealBolusShortCase432(page);
    await expandRoster432(page);
    await waitForReplayAssertion(async seen => {
      assertServedRowDescriptions432('S148', served, seen(await renderedRows432(page)));
    }, 'S148 every Meal bolus short row names its own meal');
  },
  async S149(page) {
    const served = await mealBolusShortCase432(page);
    const matched = page.locator('#level .case-occurrence[data-comparison-cohort="matched"]').first();
    assert.ok(await matched.count(), 'S149 premise: the Meal bolus short case serves a matched meal');
    const occ = await selectOccurrence(page, matched);
    const file = await read(page, '/api/diagnose/finding-case-file', {
      projection_id: served.projection_id, finding_id: served.finding.id, alignment: 'event', occ,
    });
    await waitForReplayAssertion(async seen => {
      assertSelectedFacts432('S149', file.selection.detail, seen(await selectedBlock432(page)), { outcome: 'peak' });
    }, 'S149 the selected matched meal reads as its facts and served reason');
  },
  async S150(page) {
    const coordinate = await highsAfterMealsCase432(page, 'S150');
    const served = await read(page, '/api/diagnose/finding-case-file', coordinate);
    await waitForReplayAssertion(async seen => {
      assertServedRowDescriptions432('S150', served, seen(await renderedRows432(page)));
    }, 'S150 every Highs after meals row names its own meal');
    const occ = await selectOccurrence(page);
    const file = await read(page, '/api/diagnose/finding-case-file', { ...coordinate, occ });
    await waitForReplayAssertion(async seen => {
      assertSelectedFacts432('S150', file.selection.detail, seen(await selectedBlock432(page)));
    }, 'S150 a selected Highs after meals Occurrence lists its served habits');
  },
  // #454: fail-first on b03431d2, where the claimant's habit line repeats the
  // sentence the cause line already prints.
  async S182(page) {
    const coordinate = await highsAfterMealsCase432(page, 'S182');
    const matched = page.locator('#level .case-occurrence[data-comparison-cohort="matched"]').first();
    assert.ok(await matched.count(), 'S182 premise: the Highs after meals case serves a claimed meal');
    const occ = await selectOccurrence(page, matched);
    const file = await read(page, '/api/diagnose/finding-case-file', { ...coordinate, occ });
    await waitForReplayAssertion(async seen => {
      assertSentenceOnce454('S182', file.selection.detail, seen(await selectedBlock432(page)));
    }, 'S182 a claimed Occurrence prints its sentence once');
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
        // #430: the reading pane names the served reason in the desk's one set
        // of words, never its code, and the result and readiness lines agree.
        assert.ok(!(seen(await fresh.locator('.gf-reading').innerText())).includes(comparison.availability.reason),
          'S49 the reading pane must name the unavailable reason in words, never its served code');
        const result = seen(await fresh.locator('[data-reassessment-state]').innerText()).trim();
        const words = result.startsWith('Unavailable · ') ? result.slice('Unavailable · '.length).trim() : '';
        assert.ok(words, `S49 the reassessment result must name why it is unavailable: ${result}`);
        assert.ok((seen(await fresh.locator('[data-availability]').innerText())).includes(words),
          'S49 the readiness availability line must name the same reason in the same words');
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
