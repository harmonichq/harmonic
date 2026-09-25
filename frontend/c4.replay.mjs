// Amendment 1 acceptance: real manufactured records, served by the app.
import { waitForReplayAssertion } from './replay-assertions.mjs';
import assert from 'node:assert/strict';
import { GRID, hhmm, xAtMinute } from './diagnose-workstation-chart.js';
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
  return (await openRetained(page)).reassessment.comparison;
}
// The case's watched (else first) Trial record, opened with its retained
// reassessment shown; the served selected detail comes back whole.
async function openRetained(page) {
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
  return detail;
}
// #413: land on the rail at 24 h without drilling into any row — S113/S114's
// `openBasalLane`/`heldRequest414` both open something specific; this story
// pair needs the plain rail listing itself.
async function openDiagnoseRail(page) {
  await openDiagnose(page);
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await settled(page);
}
async function openDiagnose(page) {
  await press(page, 'nav.v2-nav [data-destination="diagnose"]');
  await page.waitForFunction(() =>
    document.querySelector('nav.v2-nav [aria-current="page"]')?.dataset.destination === 'diagnose');
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
// #447: a watched Trial's dock and Changes' Watch maturity print one day count,
// the served `days_elapsed`, and Changes' outcomes lead with the Trial's served
// target metric. The admission and the selected Trial are read first, so a case
// serving no complete Trial past its requirement, or no row-keyed target, fails
// at a premise, never at the count.
async function trialDayCount447(page) {
  const roster = await read(page, '/api/verify/trials');
  assert.equal(roster.admission?.active_kind, 'trial', 'S169 premise: the case must serve an active Trial');
  const selected = (await read(page, '/api/verify/trials', { kind: 'trial', selected: roster.admission.active_id })).selected;
  assert.equal(selected?.state, 'complete', 'S169 premise: the active Trial must be served complete');
  const { days_elapsed: n, days_required: r } = selected.maturing;
  assert.ok(n > r, `S169 premise: the served count must run past its requirement (${n} against ${r})`);
  const target = selected.target_metrics?.length === 1 && selected.target_metrics[0] !== 'arc'
    ? selected.target_metrics[0] : null;
  assert.ok(target, `S169 premise: the Trial must serve one row-keyed target metric (${JSON.stringify(selected.target_metrics)})`);
  const ready = `Ready to judge — ${n} days since ${selected.changed_at.slice(5, 10)} · ${r} required`;

  await press(page, 'nav.v2-nav [data-destination="diagnose"]');
  const dock = page.locator('.inspector > .watch');
  // #451: the dock's detail line leads with the Trial's values when it has them;
  // those values carry no second day count.
  await waitForReplayAssertion(async seen => {
    const how = seen((await dock.locator('.how').innerText()).trim());
    const values = how === ready ? '' : how.endsWith(` · ${ready}`) ? how.slice(0, -` · ${ready}`.length) : null;
    assert.ok(values !== null && !/\bdays?\b|required/.test(values),
      `S169 the dock must print the served day count in Changes' words, once: ${how}`);
  }, 'S169 the dock prints the served count');
  await dock.locator('.go').click();
  await page.locator('.gf-stage-trial').waitFor({ state: 'visible', timeout: 30000 });
  await waitForReplayAssertion(async seen => {
    const figure = seen(await page.locator('[data-part="maturity"] .gf-figure').innerText()).replace(/\s+/g, ' ').trim();
    assert.ok(figure.startsWith(`${n} days`), `S169 the Watch maturity figure must print the served count: ${figure}`);
    assert.ok(figure.includes(`${r} required`), `S169 the Watch maturity figure must print the requirement: ${figure}`);
    const bar = page.locator('progress[aria-label="Trial progress"]');
    assert.equal(seen(await bar.getAttribute('value')), String(r), 'S169 only the progress bar clamps, at its requirement');
    assert.equal(seen(await bar.getAttribute('max')), String(r), 'S169 the progress bar runs to the requirement');
  }, 'S169 Changes prints the same count');
  await waitForReplayAssertion(async seen => {
    const lead = page.locator('.gf-stage-trial [data-table="outcomes"] tbody tr').first();
    assert.equal(seen(await lead.getAttribute('data-outcome')), target,
      `S169 Changes' outcomes must lead with the served target metric ${target}`);
    assert.match(seen(await lead.getAttribute('class')) || '', /\bgf-target\b/,
      'S169 the served target row must be marked as the Trial\'s target');
  }, 'S169 Changes leads with the served target');
}
// #447: the Guide's "Reading the Diagnose surface" article names no Verify, and
// its Cause-lever line sends those levers to a Focus that Changes follows.
async function guideArticle447(page) {
  const response = await page.request.get(new URL('/api/kb/reading-diagnose', page.url()).href, { timeout: 30000 });
  assert.equal(response.status(), 200, 'S170 premise: the Guide article must be served');
  assert.match(await response.text(), /◈ Cause/, 'S170 premise: the served article must carry its ◈ Cause line');
  await press(page, '[data-utility="guide"]');
  await press(page, '[data-utility-slug="reading-diagnose"]');
  await waitForReplayAssertion(async seen => {
    const article = seen(await page.locator('.gf-article').innerText()).replace(/\s+/g, ' ');
    assert.doesNotMatch(article, /Verify/, 'S170 the article must name no Verify');
    assert.ok(article.includes('flow to a Focus, followed in Changes'),
      'S170 the Cause-lever line must send levers to a Focus, followed in Changes');
  }, 'S170 the Guide article names Changes');
}
// #442: the page's readiness lines print the comparison the page shows, which
// is an ended record's saved ending assessment when it serves periods, else the
// retained reassessment the helper pressed (ADR 462). It returns the record
// read, so every S91 assertion reads the retained comparison and the saved
// ending it came with.
export async function readiness(page, unit, required) {
  const detail = await openRetained(page);
  const comparison = detail.reassessment.comparison;
  const ending = detail.original.ending;
  const shown = ending.kind && Object.keys(ending.assessment.periods || {}).length ? ending.assessment : comparison;
  await waitForReplayAssertion(async seen => {
    for (const side of ['before', 'after']) {
      const arm = comparison.readiness[side];
      assert.equal(arm.unit, unit); assert.equal(arm.required, required);
      const printed = shown.readiness[side];
      const node = page.locator(`[data-readiness="${side}"]`);
      assert.equal(seen(await node.getAttribute('data-criterion-met')), String(printed.criterion_met),
        `the ${side} readiness line must print the criterion of the comparison the page shows`);
      const copy = seen(await node.innerText());
      assert.ok(copy.includes(unit));
      assert.ok(copy.includes(String(printed.observed)),
        `the ${side} readiness line must print the count of the comparison the page shows`);
      // #449 amendment (ADR 450): a served reason prints in words, never its code.
      const criterion = seen(await node.locator('[data-criterion]').innerText()).trim();
      assert.ok(criterion, 'each arm states its criterion');
      if (printed.reason) assert.notEqual(criterion, `Not met — ${printed.reason}.`, 'a served reason prints in words, never its code');
    }
  }, "readiness");
  return detail;
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

// #445 (ADR 445): a Day link from Changes or a carb utility names its return
// target by an identity its origin owns, and the return lands on the control
// the reader pressed. A value reads as a selector when it carries a bracket or
// leads with a class or id mark.
function identityAddress445(storyId, day) {
  assert.equal(Object.hasOwn(day, 'focus'), false, `${storyId} the Day address must carry no return-focus key`);
  assert.ok(!Object.values(day).some(value => /[[\]]|^[.#]/.test(value)),
    `${storyId} the Day address must carry no CSS selector: ${JSON.stringify(day)}`);
}
const focusedOn445 = (page, selector) => page.evaluate(selector =>
  document.activeElement === document.querySelector(selector), selector);
// The reading pane's first supporting-date control, once the change's evidence
// has rendered it.
async function supportingDate445(page, storyId) {
  const control = page.locator('.gf-reading [data-day-date]').first();
  await control.waitFor({ timeout: 30000 });
  const date = await control.getAttribute('data-day-date');
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `${storyId} premise: a supporting date names an ISO date`);
  return { control, date };
}
// Text of a control in the inspector, which a seated utility hides: innerText
// reads nothing from a hidden element, so these read its text content.
const text445 = (page, selector) => page.locator(selector).evaluate(node => node.textContent.trim());
// S138's drill: the showcase's over-treated low in the Afternoon preset, its
// first roster Occurrence held.
async function heldAfternoonCase445(page) {
  const subject = 'finding:over_treated_low';
  await press(page, '[data-destination="diagnose"]'); await settled(page);
  await page.getByRole('button', { name: 'Afternoon', exact: true }).click(); await settled(page);
  const row = page.locator(`#level .qrow[data-id="${subject}"]`);
  await row.waitFor({ timeout: 30000 });
  await row.click();
  await page.locator('#level .case-occurrence').first().waitFor({ timeout: 30000 });
  return { subject, held: await selectOccurrence(page) };
}
// Every request a Return from Day issues, from the press until the desk has
// settled. heldStatusReturn holds the status read and stops recording at its
// answer; a re-read Diagnose decides on that answer comes after it, and keeps
// the loading frame standing until it lands, so this listens through
// heldStatusReturn's own closing waitForDesk.
async function wholeReturn445(page, storyId) {
  const requests = [];
  const onRequest = request => requests.push(new URL(request.url()).pathname);
  page.on('request', onRequest);
  try { await heldStatusReturn(page, storyId, '[data-day="return"]'); } finally { page.off('request', onRequest); }
  return requests;
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
    '05:00 basal slot, suggests a lower because lows keep happening overnight',
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

// #446 · 2026-09-23. The served active change leads every plain arrival to
// Changes, and Open Plan holds for one visit (ADR 446). Every read inside a
// retried assertion is a count or a text list, which never waits, so a failure
// names the frame that took the seat. The premises come from the production
// routes first, so a case serving the wrong state fails there, never at a label.
const url446 = (page, path) => new URL(path, page.url()).href;
async function seat446(page) {
  const count = selector => page.locator(selector).count();
  return {
    changes: await count('nav.v2-nav [aria-current="page"][data-destination="changes"]'),
    trial: await count('.gf-stage-trial'), focus: await count('.gf-stage-focus'), plan: await count('.gf-plan'),
  };
}
async function admitted446(page, id, kind) {
  const roster = await read(page, '/api/verify/trials');
  assert.equal(roster.admission?.state, 'available', `${id} premise: the case must publish available follow-up admission`);
  assert.equal(roster.admission.active_kind, kind, `${id} premise: the server must admit ${kind ? `an active ${kind}` : 'no watched change'}`);
}
/** The served concern's basal action, as the Plan items staging it would save. */
function basalItems446(guidance, id) {
  const action = guidance.selected?.action || [];
  assert.ok(action.length && action.every(row => row.parameter === 'basal_rate'),
    `${id} premise: the served concern must carry a basal action to stage`);
  return action.flatMap(row => (row.member_start_mins || [row.start_min])
    .map(start => ({ type: 'basal', start_min: start, value: row.recommended })));
}
/** Save a draft while the change is watched and require the guidance read to serve
    it beside the active change. The items restore the recorded Plan's source value
    at each slot, as S146 saves them: values the store already held. */
async function draftWhileWatched446(page, id, items = null) {
  if (!items) {
    const [recorded] = (await read(page, '/api/plan/history')).history;
    const source = recorded?.deliverable?.source_profile?.segments;
    assert.ok(source?.length, `${id} premise: the recorded Plan must serve its source profile`);
    const at = minute => [...source].reverse().find(row => row.start_min <= minute).basal_rate;
    items = recorded.items.map(item => ({ type: item.type, start_min: item.start_min, value: at(item.start_min) }));
  }
  const saved = await page.request.put(url446(page, '/api/plan'), { data: { items } });
  assert.equal(saved.status(), 200, `${id} premise: a Plan draft saves while the change is watched: ${await saved.text()}`);
  const guidance = await read(page, '/api/guidance');
  assert.equal(guidance.disposition, 'active_change', `${id} premise: the server still serves the active change`);
  assert.ok((guidance.draft?.items || []).length > 0, `${id} premise: the guidance read serves the saved draft`);
  return read(page, '/api/plan');
}
async function topbar446(page, destination) {
  await press(page, `nav.v2-nav [data-destination="${destination}"]`);
  await page.waitForFunction(id => document.querySelector('nav.v2-nav [aria-current="page"]')?.dataset.destination === id,
    destination, { timeout: 30000 });
}
/** Changes shows the watched Trial or Focus, and not the Plan. */
async function watched446(page, id, kind, step) {
  await waitForReplayAssertion(async seen => {
    const shown = seen(await seat446(page));
    assert.equal(shown.plan, 0, `${id} ${step} must not show the Plan in the watched ${kind}'s seat`);
    assert.ok(shown.changes === 1 && shown[kind] === 1, `${id} ${step} must show the watched ${kind}'s own view`);
  }, `${id} ${step} lands on the watched ${kind}`);
}
/** The Plan at its explicit address, showing a saved draft. */
async function planDraft446(page, id, step) {
  await waitForReplayAssertion(async seen => {
    const route = parseRoute(new URL(seen(page.url())));
    assert.deepEqual([route.destination, route.context.subject], ['changes', 'plan'],
      `${id} ${step} must land at /changes?subject=plan`);
    assert.equal(seen((await seat446(page)).plan), 1, `${id} ${step} must show the Plan`);
    // The kicker is set in capitals by CSS; its <b> carries the served phase.
    assert.deepEqual(seen(await page.locator('.gf-stage .gf-kicker b').allTextContents()), ['Draft saved'],
      `${id} ${step} must show the saved draft`);
  }, `${id} ${step} opens the saved draft`);
}
/** The nameplate's controls, in order, for a watched Trial's or Focus's view. */
const nameplate446 = (page, kind) => page.locator(`.gf-stage-${kind} .gf-end button`)
  .evaluateAll(buttons => buttons.map(button => button.dataset.action || (button.hasAttribute('data-follow-up-inspect') ? 'inspect' : '')));

// #449/#450 (ADR 449, ADR 450). Every served name and code is read from the
// API and compared with the rendered page; nothing here imports a renderer, so
// this harness laid over the base fails at its feature assertions, not at link.
const focusDetail449 = async (page, id, assessment) => (await read(page, '/api/verify/trials',
  { kind: 'focus', selected: id, ...(assessment ? { assessment } : {}) })).selected;
async function openFocusRecord449(page, id) {
  await page.goto(new URL(`/?to=changes&subject=history&occurrence=${encodeURIComponent(`record:focus:${id}`)}`, page.url()).href);
  await page.locator('[data-record-part="ending"]').waitFor({ timeout: 30000 });
}
// Every served code a saved Focus ending can print on its record lines.
function endingCodes449(assessment) {
  const codes = new Set(assessment.reason ? [assessment.reason] : []);
  for (const side of ['before', 'after']) {
    const arm = (assessment.adherence || {})[side] || {};
    for (const reason of [arm.availability?.reason, arm.harm_availability?.reason,
      ((assessment.readiness || {})[side] || {}).reason]) if (reason) codes.add(reason);
  }
  return codes;
}
// No line on the page prints a served code, nor a bare served verdict.
function assertWordsOnly449(id, texts, codes, verdicts = []) {
  for (const text of texts) {
    for (const code of codes) assert.ok(!text.includes(code), `${id} a served code must print in words: ${text}`);
    for (const verdict of verdicts) {
      assert.notEqual(text.split(' · ')[0].trim(), verdict, `${id} the opportunity verdict must print as a word, never its served value`);
    }
  }
}

/* ---- #455: Diagnose chart text at the narrowest split (S183–S185) ---------
   Each story checks every size and state before it judges, then fails once,
   listing every failure by size, state and check with the measured amount in
   px. Each restores the run's size even when checks failed, and none sets a
   scroll offset. The judgments are pure and exported, so fake geometry drives
   them in node. */

// #455: runs in the page (handed to `locator.evaluate`), so it closes over
// nothing. Every non-empty text span the chart on `host` paints, and every
// background box a text element draws (a rich token's knock-out pad), in the
// host's own pixels with each element's transform applied, grouped by the text
// element that owns them, in paint order. Given `keepSelector`, it also reads
// that control's box in the host's coordinates.
function readPaintedText(host, keepSelector = null) {
  const chart = globalThis.echarts.getInstanceByDom(host);
  if (!chart) return null;
  const owners = new Map();
  const spans = [];
  const pads = [];
  for (const item of chart.getZr().storage.getDisplayList()) {
    const owner = item.parent;
    if (owner?.type !== 'text' || (item.type !== 'tspan' && item.type !== 'rect')) continue;
    if (item.invisible || item.style?.opacity === 0) continue;
    const text = item.type === 'tspan' ? String(item.style.text ?? '') : null;
    if (text !== null && !text.trim()) continue;
    if (!owners.has(owner)) owners.set(owner, owners.size);
    const rect = item.getBoundingRect().clone();
    if (item.transform) rect.applyTransform(item.transform);
    const box = { group: owners.get(owner), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    if (text === null) pads.push(box);
    else spans.push({ ...box, text });
  }
  const keepNode = keepSelector && document.querySelector(keepSelector);
  const hostBox = host.getBoundingClientRect();
  const keepBox = keepNode?.getBoundingClientRect();
  return {
    width: host.clientWidth, height: host.clientHeight, spans, pads,
    keep: keepBox ? { x: keepBox.x - hostBox.x, y: keepBox.y - hostBox.y,
      width: keepBox.width, height: keepBox.height } : null,
  };
}

// #455: a resize with no press has settled when the chart on `selector` has
// been resized to its host's content box, that box has held still for a frame,
// the chart is idle, and two more animation frames have passed.
async function settledResize(page, selector) {
  await page.waitForFunction(async selector => {
    await document.fonts.ready;
    const host = document.querySelector(selector);
    const chart = host && globalThis.echarts.getInstanceByDom(host);
    if (!chart) return false;
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const box = () => {
      const style = getComputedStyle(host);
      return [host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        host.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)];
    };
    const [width, height] = box();
    await frame();
    const [nextWidth, nextHeight] = box();
    if (nextWidth !== width || nextHeight !== height
      || Math.abs(chart.getWidth() - width) > 1 || Math.abs(chart.getHeight() - height) > 1
      || !chart.getZr().animation.isFinished()) return false;
    await frame(); await frame();
    return true;
  }, selector, { timeout: 10000 });
}

// #455: a chart re-lays out in a later animation frame than the resize that
// prompts it, so a reading taken right after a viewport change can still show
// the old width's layout. Read again, through the replay's retry helper, until
// `judge` (the story's own check) finds nothing, or the bound elapses; either
// way return the last reading, which the story then judges with that same
// check. Nothing is loosened: a reading that never comes clean keeps every
// failure, and an error that is not an assertion is rethrown.
export async function readSettled(read, judge, description, timeout = 10000) {
  let reading = null;
  try {
    await waitForReplayAssertion(async seen => {
      reading = seen(await read());
      const failures = judge(reading);
      assert.equal(failures.length, 0, `${description}: ${failures.join('; ')}`);
    }, description, timeout);
  } catch (error) {
    if (!(error.cause instanceof assert.AssertionError)) throw error;
  }
  return reading;
}

// #455: Diagnose at rest, with its overview and every tile drawn.
async function diagnoseAtRest(page) {
  await openDiagnose(page);
  await waitForCharts(page);
}

const spanRight = box => box.x + box.width;
const spanBottom = box => box.y + box.height;
// How far a box runs outside `[0, width] × [0, height]`: 0 inside, with 1px of
// slack for subpixel layout.
const outsideBy = (box, width, height) => {
  const over = Math.max(-box.x, spanRight(box) - width, -box.y, spanBottom(box) - height);
  return over > 1 ? over : 0;
};
// The two boxes' shared extent on each axis; they overlap when both exceed 1px.
const overlapOf = (a, b) => ({
  x: Math.min(spanRight(a), spanRight(b)) - Math.max(a.x, b.x),
  y: Math.min(spanBottom(a), spanBottom(b)) - Math.max(a.y, b.y),
});
const overlaps = (a, b) => { const shared = overlapOf(a, b); return shared.x > 1 && shared.y > 1; };
// Spans on one line share a top within 1px.
const linesOf = spans => spans.reduce((lines, span) => {
  const line = lines.find(([first]) => Math.abs(first.y - span.y) <= 1);
  if (line) line.push(span); else lines.push([span]);
  return lines;
}, []);
// A text element's spans in reading order: line by line from the top, each
// line left to right. Paint order is not reading order: ZRender lays a line of
// right-aligned tokens from its right end, so a caption parked left of its
// window paints its tail before its head.
const readingOrder = spans => linesOf([...spans].sort((a, b) => a.y - b.y))
  .flatMap(line => line.sort((a, b) => a.x - b.x));
// A caption's or a verdict's words: its spans' text in reading order, split on
// whitespace, the `·` separator ignored. A word split across two spans reads
// as two words, so it can never match the whole word it was cut from.
const wordsOf = texts => texts.join(' ').split(/\s+/).filter(word => word && word !== '·');
// The painted text elements, each with its spans in reading order and its pad
// boxes.
const textGroups = reading => {
  const groups = new Map();
  const group = id => groups.get(id) ?? groups.set(id, { spans: [], pads: [] }).get(id);
  for (const span of reading.spans) group(span.group).spans.push(span);
  for (const pad of reading.pads) group(pad.group).pads.push(pad);
  return [...groups.values()].filter(({ spans }) => spans.length)
    .map(({ spans, pads }) => ({ spans: readingOrder(spans), pads }));
};
const sizeName = size => `${size.width}×${size.height}`;
const failOnce = (story, what, failures) => {
  if (failures.length) {
    assert.fail(`${story} ${what}; ${failures.length} failure${failures.length === 1 ? '' : 's'}:\n  - `
      + failures.join('\n  - '));
  }
};

// #455: the Window presets, in S183's order, each with its caption's head as
// the overview prints it, written here as literals.
export const OVERVIEW_PRESETS = Object.freeze([
  Object.freeze({ label: 'Overnight', head: 'OVERNIGHT 00:00–06:00', range: [0, 360] }),
  Object.freeze({ label: 'Morning', head: 'MORNING 06:00–12:00', range: [360, 720] }),
  Object.freeze({ label: 'Afternoon', head: 'AFTERNOON 12:00–18:00', range: [720, 1080] }),
  Object.freeze({ label: 'Evening', head: 'EVENING 18:00–24:00', range: [1080, 1440] }),
  Object.freeze({ label: '24 h', head: '24 H 00:00–24:00', range: [0, 1440] }),
]);
// #455: the narrowest split, at the tall and the short window.
const NARROW_SPLIT_SIZES = Object.freeze([
  Object.freeze({ width: 832, height: 720 }),
  Object.freeze({ width: 832, height: 560 }),
]);
const NOTICE_WORDS = ['INSUFFICIENT', 'SAMPLE', '—', 'thinnest', 'bin', 'holds'];
const SPREAD_WORDS = ['25–75', 'spread', null, 'mg/dL'];
const WHOLE_COUNT = /^\d+$/;

// #455: every way the glucose overview's text fails one check, one line each,
// named by size, state and check with the measured amount. `check` carries the
// size, the state's name, the preset's head and range, whether this is the
// run's own size (`runSize`, where the caption must stand on one line) and
// whether this check carries the thin-path premise (`premiseThin`), and the
// `readPaintedText` reading of #chart.
export function overviewTextFailures({ size, state, head, range, runSize = false, premiseThin = false, reading }) {
  const at = `${sizeName(size)} ${state}`;
  if (!reading) return [`${at}: #chart draws no chart`];
  const failures = [];
  const headWords = wordsOf([head]);
  const captions = textGroups(reading).filter(({ spans }) => {
    const words = wordsOf(spans.map(span => span.text));
    return headWords.every((word, index) => words[index] === word);
  });
  if (captions.length !== 1) {
    failures.push(`${at}: ${captions.length} painted captions begin with "${head}"; exactly one must`);
  } else {
    const [caption] = captions;
    const words = wordsOf(caption.spans.map(span => span.text));
    const thin = caption.spans.some(span => span.text.includes('INSUFFICIENT'));
    const tail = words.slice(headWords.length);
    const tailWhole = thin
      ? tail.length === NOTICE_WORDS.length + 1 && NOTICE_WORDS.every((word, index) => tail[index] === word)
        && WHOLE_COUNT.test(tail.at(-1))
      : !tail.length || (tail.length === SPREAD_WORDS.length
        && SPREAD_WORDS.every((word, index) => (word === null ? WHOLE_COUNT.test(tail[index]) : tail[index] === word)));
    if (!tailWhole) {
      failures.push(`${at}: the caption reads ${JSON.stringify(words)}; it must read the words of "${head}"`
        + (thin ? ', then of "INSUFFICIENT SAMPLE — thinnest bin holds <n>" with a whole count' : '')
        + ', every word whole');
    }
    if (premiseThin && !thin) {
      failures.push(`${at}: premise: the 24 h caption must carry the insufficient-sample notice, so the store `
        + 'exercises the thin path');
    }
    for (const span of caption.spans) {
      const over = outsideBy(span, reading.width, reading.height);
      if (over) {
        failures.push(`${at}: caption span "${span.text}" lies ${px(over)} outside #chart's `
          + `${reading.width}×${reading.height} box`);
      }
    }
    const lines = linesOf(caption.spans);
    if (runSize && lines.length > 1) {
      failures.push(`${at}: the caption stands on ${lines.length} lines at the run's own size; it must stand on one`);
    }
    const gates = range.map(minute => ({ minute, x: xAtMinute({ clientWidth: reading.width }, minute) }));
    const boxes = [...caption.spans.map(span => ({ name: `caption span "${span.text}"`, ...span })),
      ...caption.pads.map((pad, index) => ({ name: `caption pad box ${index + 1}`, ...pad }))];
    for (const box of boxes) {
      const left = GRID.left - box.x;
      if (left > 1) {
        failures.push(`${at}: ${box.name} reaches ${px(left)} left of the plot's left edge, into the y-axis `
          + 'label column');
      }
      const right = spanRight(box) - reading.width;
      if (right > 1) failures.push(`${at}: ${box.name} reaches ${px(right)} past #chart's right edge`);
      for (const gate of gates) {
        const straddle = Math.min(gate.x - box.x, spanRight(box) - gate.x);
        if (straddle > 1) {
          failures.push(`${at}: ${box.name} straddles the window's ${hhmm(gate.minute)} gate by ${px(straddle)}`);
        }
      }
    }
  }
  const spans = reading.spans;
  for (const [index, a] of spans.entries()) {
    for (const b of spans.slice(index + 1)) {
      if (!overlaps(a, b)) continue;
      const shared = overlapOf(a, b);
      failures.push(`${at}: painted text "${a.text}" and "${b.text}" overlap by ${px(shared.x)} × ${px(shared.y)}`);
    }
  }
  return failures;
}

// #455: S183's judgment over every check it took, failing once.
export function assertOverviewText(checks) {
  failOnce('S183', 'the glucose overview\'s text must stay whole, inside the chart and unstruck at every size',
    checks.flatMap(overviewTextFailures));
}

// #455: the Spotlight's middle-rank verdict line on the replay store's 00:00
// slot, as literals copied from its 1200×560 render, fact by fact.
const SPOTLIGHT_FACTS = Object.freeze(['SUPPORTED', '0.70 U/h', '(0.70–0.70)', 'programmed now 0.60']);
const SPOTLIGHT_TALLY = '30 steady nights';
// #455: S184's sizes, pressing nothing between them.
const SPOTLIGHT_SIZES = Object.freeze([
  Object.freeze({ width: 1200, height: 736 }), ...NARROW_SPLIT_SIZES,
]);

// #455: every way the Spotlight's verdict line fails one check, one line each.
// `oneLine` marks the size at which the verdict must stand on one line.
export function spotlightVerdictFailures({ size, oneLine = false, reading }) {
  const at = sizeName(size);
  if (!reading) return [`${at}: the Spotlight draws no chart`];
  const groups = textGroups(reading);
  const verdicts = groups.filter(({ spans }) => spans[0].text.startsWith(SPOTLIGHT_FACTS[0]));
  if (verdicts.length !== 1) {
    return [`${at}: ${verdicts.length} painted lines begin with "${SPOTLIGHT_FACTS[0]}"; exactly one verdict must`];
  }
  const [{ spans }] = verdicts;
  const failures = [];
  for (const span of spans) {
    const over = outsideBy(span, reading.width, reading.height);
    if (over) {
      failures.push(`${at}: verdict span "${span.text}" lies ${px(over)} outside the Spotlight chart's `
        + `${reading.width}×${reading.height} box`);
    }
    if (reading.keep && overlaps(span, reading.keep)) {
      failures.push(`${at}: verdict span "${span.text}" runs ${px(overlapOf(span, reading.keep).x)} under the `
        + 'Keep control');
    }
  }
  const words = wordsOf(spans.map(span => span.text));
  const expected = wordsOf(SPOTLIGHT_FACTS);
  const lines = linesOf(spans);
  if (JSON.stringify(words) !== JSON.stringify(expected)) {
    failures.push(`${at}: the verdict line reads ${JSON.stringify(words)}; it must read ${JSON.stringify(expected)}`);
  } else {
    // a break may fall only where one fact ends and the next begins
    const ends = SPOTLIGHT_FACTS.map((_, index) => wordsOf(SPOTLIGHT_FACTS.slice(0, index + 1)).length);
    let count = 0;
    for (const line of lines.slice(0, -1)) {
      count += wordsOf(line.map(span => span.text)).length;
      if (!ends.includes(count)) {
        failures.push(`${at}: a line break falls inside a fact, after "${expected[count - 1]}"`);
      }
    }
  }
  if (oneLine && lines.length > 1) {
    failures.push(`${at}: the verdict line stands on ${lines.length} lines; at this size it must stand on one`);
  }
  const tallies = groups.filter(group => group.spans[0].text.startsWith(SPOTLIGHT_TALLY));
  if (tallies.length !== 1) {
    failures.push(`${at}: ${tallies.length} painted lines begin with "${SPOTLIGHT_TALLY}"; exactly one tally must`);
  } else {
    const verdictBottom = Math.max(...spans.map(spanBottom));
    const tallyTop = Math.min(...tallies[0].spans.map(span => span.y));
    if (verdictBottom - tallyTop > 1) {
      failures.push(`${at}: the tally line starts ${px(verdictBottom - tallyTop)} above the verdict's last line ends`);
    }
  }
  return failures;
}

// #455: S184's judgment over every size it read, failing once.
export function assertSpotlightVerdict(checks) {
  failOnce('S184', 'the Spotlight\'s verdict line must keep every fact whole inside the chart',
    checks.flatMap(spotlightVerdictFailures));
}

// #455: S185's sizes before the run's own: the narrowest split, and the 1024px
// tablet width of the 2026-08-19 owner ruling.
const CANVAS_HEAD_SIZES = Object.freeze([
  ...NARROW_SPLIT_SIZES, Object.freeze({ width: 1024, height: 768 }),
]);

// #455: runs in the page. The canvas header, its title, provenance and All
// charts control with the control's word, each with its box, clientWidth and
// scrollWidth, once the header's box has held still for two frames; and the
// box of what the reader sees of the control, its rendered icon and word
// (`controlInk`). The control's own box is taller than the header rail: the
// shell's 36px button floor outranks its 20px height, and its transparent,
// borderless box overhangs the rail by 3.5px while its icon and word sit
// inside it (ADR 455).
async function readCanvasHead() {
  await document.fonts.ready;
  const head = document.querySelector('#canvas-head');
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  for (let last = null, still = 0, count = 0; head && still < 2 && count < 60; count += 1) {
    await frame();
    const now = JSON.stringify(head.getBoundingClientRect());
    still = now === last ? still + 1 : 0;
    last = now;
  }
  const part = node => {
    if (!node) return null;
    const { left, right, top, bottom, width } = node.getBoundingClientRect();
    return { left, right, top, bottom, width, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
      shown: node.getClientRects().length > 0 && width > 0 };
  };
  const title = head?.querySelector('.head-rest h2');
  const control = document.querySelector('#explorer-trigger');
  const inks = [...(control?.children ?? [])].map(child => child.getBoundingClientRect())
    .filter(box => box.width > 0 && box.height > 0);
  const edge = (pick, key) => pick(...inks.map(box => box[key]));
  return {
    controlInk: inks.length ? { left: edge(Math.min, 'left'), right: edge(Math.max, 'right'),
      top: edge(Math.min, 'top'), bottom: edge(Math.max, 'bottom') } : null,
    head: part(head), title: part(title), provenance: part(document.querySelector('#canvas-pool')),
    control: part(control), word: part(document.querySelector('#explorer-trigger > span')),
    titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : null,
    controlName: control?.getAttribute('aria-label') ?? null,
    controlTitle: control?.getAttribute('title') ?? null,
  };
}

// #455: every header part's box width, clientWidth and scrollWidth, as S185
// prints them in each failure and in its measurement line.
const headWidths = reading => ['title', 'provenance', 'control', 'word'].map(name => {
  const part = reading[name];
  return part ? `${name} ${px(part.width)} box, clientWidth ${part.clientWidth}, scrollWidth ${part.scrollWidth}`
    : `${name} absent`;
}).join('; ');

// #455: every way the canvas header fails at one size, one line each, each
// printing every part's widths. `narrow` marks the narrowest split, where the
// title need only show a letter and an ellipsis; elsewhere the control shows
// its word and the title prints whole. The control is placed by what the
// reader sees of it, its icon and word, not by its overhanging box.
export function canvasHeadFailures({ size, narrow, reading }) {
  const at = sizeName(size);
  const parts = ['title', 'provenance', 'control'];
  const measured = headWidths(reading);
  const failures = [];
  const fail = message => failures.push(`${at}: ${message} (${measured})`);
  const seen = name => (name === 'control' ? reading.control && reading.controlInk : reading[name]);
  const shown = parts.filter(seen);
  for (const name of parts.filter(name => !seen(name))) {
    fail(name === 'control' && reading.control ? 'the All charts control draws no icon or word'
      : `the header has no ${name}`);
  }
  for (const name of shown) {
    const box = seen(name);
    const over = reading.head && Math.max(reading.head.left - box.left, box.right - reading.head.right,
      reading.head.top - box.top, box.bottom - reading.head.bottom);
    if (!reading.head || over > 1) {
      fail(`${name === 'control' ? 'the All charts control\'s icon and word lie' : `the ${name} lies`} `
        + `${px(over || 0)} outside the header's box`);
    }
  }
  const centres = shown.map(name => (seen(name).top + seen(name).bottom) / 2);
  const spread = centres.length ? Math.max(...centres) - Math.min(...centres) : 0;
  if (spread > 2) fail(`the title, provenance and control do not share one line; their centres differ by ${px(spread)}`);
  const { provenance, title, word } = reading;
  if (provenance && provenance.scrollWidth > provenance.clientWidth) {
    fail(`the provenance is cut: it needs ${provenance.scrollWidth}px and shows ${provenance.clientWidth}px`);
  }
  if (reading.controlName !== 'All charts' || reading.controlTitle !== 'All charts') {
    fail(`the All charts control is named "${reading.controlName}" with the tooltip "${reading.controlTitle}"; `
      + 'both must be "All charts"');
  }
  if (narrow) {
    if (title && title.width < 2 * reading.titleFont) {
      fail(`the title's box is ${px(title.width)} wide, under twice its ${reading.titleFont}px type, so it cannot `
        + 'show a letter and an ellipsis');
    }
  } else {
    if (!word?.shown) fail('the All charts control\'s word does not render');
    if (title && title.scrollWidth > title.clientWidth) {
      fail(`the title is cut: it needs ${title.scrollWidth}px and shows ${title.clientWidth}px`);
    }
  }
  return failures;
}

// #455: S185's judgment over every size it read, failing once.
export function assertCanvasHead(checks) {
  failOnce('S185', 'the canvas header must keep its title, provenance and All charts control on one line',
    checks.flatMap(canvasHeadFailures));
}

// #451: the correction factor in the wearer's words, on the manufactured
// isf-strengthen store. Every expected number comes from the story's own served
// reads. The rounding below restates each line's own: the queue trims two
// decimals to one, the panel and the dock print two. The queue's served-scope
// note is restated the same way, because the base overlay runs this harness over
// an app with no shared source for it; this replay's node test pins the
// restatement to the queue's own printing. The status words are the desk's table
// (frontend/guidance.js).
const queueNum451 = value => {
  const text = Number(value).toFixed(2).replace(/0$/, '');
  return text.endsWith('.') ? `${text}0` : text;
};
const panelNum451 = value => Number(value).toFixed(2);
const correctionFactor451 = value => `1 U : ${value} mg/dL`;
/** The note a served whole-day row that is not a Pattern carries after its line. */
const scopeNote451 = row => (row.window_scope === 'whole_day' && row.kind !== 'pattern' ? ' · Whole day' : '');
/** The served correction-factor row's queue numbers line, as the queue prints it:
    both values insulin first at the queue's rounding, then the row's served scope
    note. */
export const queueNumbers451 = row =>
  `now ${correctionFactor451(queueNum451(row.current))} → ${correctionFactor451(queueNum451(row.recommended))}`
  + scopeNote451(row);
const STATUS_WORDS_451 = ['Ready to stage', 'Staged', 'Ready to start a Focus', 'Focus withheld',
  'Action identified', 'Evidence to inspect'];
const ENGINE_WORDS_451 = /mg\/dL\/U|\bISF\b|eligible_action|guided_investigation|active_change|pending_plan/;
async function servedLead451(page, id) {
  const guidance = await read(page, '/api/guidance');
  assert.equal(guidance.disposition, 'eligible_action', `${id} premise: the case must serve an eligible action`);
  const action = Array.isArray(guidance.selected?.action) ? guidance.selected.action[0] : null;
  assert.equal(action?.parameter, 'isf',
    `${id} premise: the selected concern must carry a correction-factor instruction`);
  return { guidance, action };
}
/** Changes' nameplate sub-line and its Action heading's words, as rendered. */
const changesWords451 = page => page.evaluate(() => {
  const head = [...document.querySelectorAll('.gf-reading .gf-section h3')]
    .find(node => node.firstChild?.textContent.trim() === 'Action');
  return {
    sub: document.querySelector('.gf-stage .gf-head .gf-sub')?.textContent.trim() ?? null,
    action: head ? head.querySelector('.meta')?.textContent.trim() ?? '' : null,
  };
});

/* ---- #460: the watch dock and the staged marks follow the Plan draft (S186) ----
   ADR 460. Four legs on one basal-lower store, each from an empty draft on a
   fresh load, run in turn; the story fails once, naming every leg that failed,
   so a base run records each leg's own verdict on its status line. */
const DOCK460 = '.inspector > .watch';
/** Diagnose on screen with its desk read: no loading frame (a return's status
    check stands one over the parked desk), the rail read and the lane drawn. */
const diagnoseSeated460 = page => page.waitForFunction(() => !document.querySelector('.gf .gf-loading')
  && document.querySelector('nav.v2-nav [aria-current="page"]')?.dataset.destination === 'diagnose'
  && document.querySelector('#level')?.dataset.loading === 'false'
  && document.querySelectorAll('#lane > button.lane-cell').length > 0, null, { timeout: 30000 });
async function fresh460(page) {
  const cleared = await page.request.put(new URL('/api/plan', page.url()).href, { data: { items: [] } });
  assert.equal(cleared.status(), 200, 'S186 premise: the draft clears before each leg');
  await page.goto(new URL('/', page.url()).href, { waitUntil: 'domcontentloaded' });
  await diagnoseSeated460(page);
}
const dock460 = page => page.locator(DOCK460).evaluate(node => ({
  kind: node.querySelector('.kind')?.textContent, what: node.querySelector('.what')?.textContent }));
async function dockStaged460(page, leg) {
  await waitForReplayAssertion(async seen => {
    assert.equal(seen(await dock460(page)).kind, 'Plan · staged', `S186 ${leg}: the dock must read "Plan · staged"`);
  }, `S186 ${leg}: the staged dock`);
}
/** The open panel's stage control, in its own words without the sub-line. */
const stageWords460 = page => page.locator('#level .stagebtn').evaluate(button => {
  const words = button.cloneNode(true);
  words.querySelector('.sub')?.remove();
  return words.textContent.trim();
});
/** Stage the served lower run from Diagnose's lane, and return its staged cells
    once the save and the guidance read it ends with have both answered. */
async function stageRun460(page, ctx) {
  const guided = () => ctx.requests.filter(request => request.path === '/api/guidance').length;
  const before = guided();
  await page.locator('#lane > .lane-cell[data-verdict="down"]').first().click();
  await press(page, '#level .stagebtn[data-staged="false"]');
  await waitForReplayAssertion(async seen => {
    assert.ok(seen((await read(page, '/api/plan')).items.length) > 0, 'S186 premise: the stage save lands');
    assert.ok(seen(guided()) > before, "S186 premise: the save's guidance read answers");
    assert.equal(seen(await page.locator('#level .stagebtn').getAttribute('data-staged')), 'true',
      'S186 premise: the press stages the run');
  }, 'S186 the stage from Diagnose settles');
  return page.locator('#lane > .lane-cell[data-staged="true"]').evaluateAll(cells => cells.map(cell => cell.dataset.cell));
}
async function toChanges460(page) {
  await press(page, 'nav.v2-nav [data-destination="changes"]');
  await page.waitForFunction(() => document.querySelector('nav.v2-nav [aria-current="page"]')?.dataset.destination === 'changes'
    && !document.querySelector('.gf .gf-loading') && document.querySelector('.gf-stage'), null, { timeout: 30000 });
}
/** The change records, opened in place as a history step: a saved draft seats
    Changes on the Plan, whose draft offers no change-record door of its own. A
    store with no record draws the records' empty frame instead of their roster. */
const RECORDS460 = '[aria-label="Change records"], .gf-empty [data-destination-action="diagnose"]';
async function toRecords460(page) {
  await page.evaluate(() => { history.pushState(null, '', '/changes?subject=history'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.locator(RECORDS460).first().waitFor({ timeout: 30000 });
}
async function toDiagnose460(page) {
  await press(page, 'nav.v2-nav [data-destination="diagnose"]');
  await diagnoseSeated460(page);
}
const LEGS460 = [
  ['leg 1, a draft saved in Changes', async (page) => {
    await C2_STORIES.stageIntoPlan(page);
    await press(page, '[data-set="save-draft"]');
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('.gf-stage .gf-kicker b').textContent()), 'Draft saved',
        'S186 leg 1 premise: the draft saves');
    }, 'S186 leg 1 the draft saves');
    await toRecords460(page);
    await toDiagnose460(page);
    await dockStaged460(page, 'leg 1');
    await page.locator(`${DOCK460} .go`).click();
    await waitForReplayAssertion(async seen => {
      const route = parseRoute(new URL(seen(page.url())));
      assert.equal(route.destination, 'changes', 'S186 leg 1: "Open Changes ›" must land on Changes');
      assert.equal(route.context.subject, 'plan', 'S186 leg 1: "Open Changes ›" must land on the Plan');
    }, 'S186 leg 1 the dock opens the Plan');
    await page.locator('.gf-plan').waitFor({ timeout: 30000 });
  }],
  ['leg 2, a return after staging on Diagnose', async (page, ctx) => {
    await stageRun460(page, ctx);
    await toChanges460(page);
    await toRecords460(page);
    await toDiagnose460(page);
    await dockStaged460(page, 'leg 2');
  }],
  ['leg 3, a reload before the return, its Plan read landing last', async (page, ctx) => {
    await stageRun460(page, ctx);
    await toChanges460(page);
    await toRecords460(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(RECORDS460).first().waitFor({ timeout: 30000 });
    const held = [];
    const hold = route => (route.request().method() === 'GET' ? held.push(route) : route.fallback());
    await page.route('**/api/plan', hold);
    try {
      await toDiagnose460(page);
      assert.ok(held.length > 0, 'S186 leg 3 premise: the Plan read is held until the payload has settled');
    } finally {
      await page.unroute('**/api/plan', hold);
      for (const route of held.splice(0)) await route.continue();
    }
    let failure = null;
    try { await dockStaged460(page, 'leg 3'); } catch (error) { failure = error; }
    // Task 10's render is this leg's endpoint, base and branch alike.
    await capture(page, ctx, 'S186-leg3', 'basal-lower');
    if (failure) throw failure;
  }],
  ['leg 4, a draft replaced through the Plan route', async (page, ctx) => {
    const run = await stageRun460(page, ctx);
    assert.ok(run.length, 'S186 leg 4 premise: the staged run marks its lane cells');
    const analysis = await read(page, '/api/analyze', { window: 30, pool: 1 });
    const other = analysis.basal.find(slot => slot.asserts_move !== true && slot.current != null);
    assert.ok(other, 'S186 leg 4 premise: the analysis serves a basal slot it does not let stage');
    await toChanges460(page);
    const replaced = await page.request.put(new URL('/api/plan', page.url()).href,
      { data: { items: [{ type: 'basal', start_min: other.slot * 30, value: other.current }] } });
    assert.equal(replaced.status(), 200, 'S186 leg 4 premise: the Plan route replaces the draft');
    await toDiagnose460(page);
    const title = `Basal ${hhmm(other.slot * 30)}`;
    await waitForReplayAssertion(async seen => {
      const marks = seen(await page.locator('#lane > .lane-cell').evaluateAll((cells, ids) =>
        cells.filter(cell => ids.includes(cell.dataset.cell)).map(cell => cell.dataset.staged), run));
      assert.ok(marks.length === run.length && marks.every(mark => mark === 'false'),
        "S186 leg 4: the replaced run's lane cells must drop their staged mark");
      const dock = seen(await dock460(page));
      assert.equal(dock.kind, 'Plan · staged', 'S186 leg 4: the dock must read "Plan · staged"');
      assert.equal(dock.what, title, `S186 leg 4: the dock must name the new row, ${title}`);
    }, 'S186 leg 4 the marks and the dock follow the replaced draft');
    await page.locator(`#lane > .lane-cell[data-cell="${run[0]}"]`).click();
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await stageWords460(page)), 'Stage change', "S186 leg 4: the run's control must read \"Stage change\"");
    }, "S186 leg 4 the run's control");
  }],
];

/* ---- #459: the stage control warns before it replaces another setting (S187) ----
   ADR 459, on Connor's 2026-09-24 decision: a Plan holds one setting, and a press
   that would replace the change staged for another setting says so first, naming
   it. basal-and-carb-ratio-lower serves a stageable basal slot and a stageable
   carb ratio at once. The checks are gathered and the story fails once, so a
   base run still reaches the replacement and its renders. */
const guidanceReads459 = ctx => ctx.requests.filter(request => request.path === '/api/guidance').length;
/** The open panel's stage control: its state, its words and its sub-line. */
const control459 = page => page.locator('#level .stagebtn').evaluate(button => {
  const words = button.cloneNode(true);
  const sub = words.querySelector('.sub');
  sub?.remove();
  return { staged: button.dataset.staged, words: words.textContent.trim(), sub: sub?.textContent.trim() ?? null };
});
/** Press the open panel's unstaged control; returns once its save and the
    guidance read it ends with have answered. */
async function stage459(page, ctx, what) {
  const before = guidanceReads459(ctx);
  await press(page, '#level .stagebtn[data-staged="false"]');
  await waitForReplayAssertion(async seen => {
    assert.ok(seen(guidanceReads459(ctx)) > before, `S187 premise: the ${what} save's guidance read answers`);
    assert.equal(seen(await page.locator('#level .stagebtn').getAttribute('data-staged')), 'true',
      `S187 premise: the press stages the ${what}`);
  }, `S187 the ${what} stage settles`);
}
/** The carb-ratio queue row's panel, from the Findings queue: a drilled level
    returns through its crumb, as S147 does, since re-pressing the Window preset
    already chosen lists nothing. */
async function openCarbRatio459(page) {
  const findings = page.locator('#crumb-trail').getByRole('button', { name: 'Findings', exact: true });
  if (await findings.count()) { await findings.click(); await settled(page); }
  await page.locator('#level .qrow[data-id^="ic:"]').first().click();
  await page.locator('#level .stagebtn').waitFor({ timeout: 30000 });
}
/** A basal draft's own name, as ADR 460 point 3 spells it: its start, or its
    first start to its last start plus half an hour. */
function basalDraftName459(items) {
  const starts = items.map(item => item.start_min).sort((a, b) => a - b);
  return starts.length === 1 ? `Basal ${hhmm(starts[0])}`
    : `Basal ${hhmm(starts[0])} to ${hhmm(starts[starts.length - 1] + 30)}`;
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
  // #446 · 2026-09-23. Open Plan holds for one visit, before and after a Trial
  // begins. The page loads once, at the Plan's address, and is never reloaded:
  // a reload discards the remembered state this story is about.
  async S166(page, ctx) {
    assert.ok(ctx.capturePump, 'S166 requires CASE_STORE_DIR for a synthetic pump capture');
    basalItems446(await read(page, '/api/guidance'), 'S166');
    await admitted446(page, 'S166', null);
    await page.goto(url446(page, '/?to=changes&subject=plan'));
    // 1. Stage in the Plan's own frame keeps the Plan, with Save draft in hand.
    await press(page, '[data-set="stage"]');
    await waitForReplayAssertion(async seen => {
      const route = parseRoute(new URL(seen(page.url())));
      assert.deepEqual([route.destination, route.context.subject], ['changes', 'plan'],
        "S166 Stage in the Plan's own frame must keep the Plan's address");
      assert.equal(seen((await seat446(page)).plan), 1, "S166 Stage in the Plan's own frame must keep the Plan");
      assert.equal(seen(await page.evaluate(() => document.activeElement?.dataset?.set || null)), 'save-draft',
        'S166 Save draft must take focus');
    }, "S166 the Plan's own Stage keeps the Plan");
    // 2. A plain arrival shows the staged concern, and so does a return after Open Plan.
    const stagedConcern = step => waitForReplayAssertion(async seen => {
      assert.equal(seen((await seat446(page)).plan), 0, `S166 ${step} must not reopen the Plan`);
      const end = seen(await page.locator('.gf-stage .gf-end').allTextContents()).join(' ');
      const controls = seen({ undo: await page.locator('.gf-stage [data-set="unstage"]').count(),
        openPlan: await page.locator('.gf-stage [data-set="open-plan"]').count() });
      assert.ok(/Staged/.test(end) && controls.undo === 1 && controls.openPlan === 1,
        `S166 ${step} must show the staged concern with Staged, Undo and Open Plan`);
    }, `S166 ${step} shows the staged concern`);
    await topbar446(page, 'changes');
    await stagedConcern("the topbar's Changes");
    await press(page, '[data-set="open-plan"]');
    await page.locator('.gf-plan').waitFor({ timeout: 30000 });
    await topbar446(page, 'day');
    await topbar446(page, 'changes');
    await stagedConcern('a return from Day by the topbar');
    // 3. Open Plan reopens the Plan with the staged change; record the decision.
    await press(page, '[data-set="open-plan"]');
    await waitForReplayAssertion(async seen => {
      assert.deepEqual(seen(await page.locator('.gf-stage .gf-kicker b').allTextContents()), ['Staged'],
        'S166 Open Plan must reopen the Plan with the staged change');
    }, 'S166 Open Plan reopens the staged change');
    await press(page, '[data-set="record"]');
    await page.locator('[data-set="withdraw"]').waitFor({ timeout: 30000 });
    // 4. A synthetic `match` pump read starts a Trial; a draft is saved while it runs.
    await ctx.capturePump('match');
    await admitted446(page, 'S166', 'trial');
    await draftWhileWatched446(page, 'S166');
    // 5. Diagnose's first read in this page refreshes guidance and the Plan state;
    //    then the topbar's Changes lands on the Trial, which offers the draft.
    const refreshed = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/guidance' && response.ok(), { timeout: 60000 });
    await topbar446(page, 'diagnose');
    await refreshed;
    await settled(page);
    await topbar446(page, 'changes');
    await watched446(page, 'S166', 'trial', "the topbar's Changes after an earlier Open Plan");
    await waitForReplayAssertion(async seen => {
      assert.ok(seen(await nameplate446(page, 'trial')).includes('open-plan'),
        "S166 the watched Trial's nameplate must offer Open Plan while a draft is saved");
    }, 'S166 the Trial offers its draft');
    // 6. Diagnose's return from the Trial's nights lands on the Trial.
    await press(page, '.gf-stage-trial [data-follow-up-inspect]');
    await waitForReplayAssertion(async seen => {
      assert.deepEqual(seen(await page.locator('[data-action="watch"]').allTextContents()).map(text => text.trim()),
        ['Return to Trial'], 'S166 Diagnose opened from the watched Trial must offer "Return to Trial"');
    }, 'S166 Diagnose offers the return to the Trial');
    await press(page, '[data-action="watch"]');
    await watched446(page, 'S166', 'trial', '"Return to Trial"');
  },
  // #446 · 2026-09-23. A watched Trial reaches the draft saved beside it, and the
  // server, not the desk, refuses to record it. The page reloads after every
  // write the story makes through its own requests, so it reads the store.
  async S167(page, ctx) {
    assert.ok(ctx.capturePump, 'S167 requires CASE_STORE_DIR for a synthetic pump capture');
    const items = basalItems446(await read(page, '/api/guidance'), 'S167');
    const drafted = await page.request.put(url446(page, '/api/plan'), { data: { items } });
    assert.equal(drafted.status(), 200, 'S167 premise: the Plan draft saves');
    const applied = await page.request.post(url446(page, '/api/plan/apply'), { data: {} });
    assert.equal(applied.status(), 200, `S167 premise: the Plan decision records: ${await applied.text()}`);
    await ctx.capturePump('match');
    await admitted446(page, 'S167', 'trial');
    const watching = await read(page, '/api/guidance');
    assert.equal(watching.disposition, 'active_change', 'S167 premise: the server serves the active Trial');
    assert.equal((watching.draft?.items || []).length, 0, 'S167 premise: no draft is served before the story saves one');
    // 1. With no draft, the Trial's nameplate offers no Open Plan.
    await page.goto(url446(page, '/?to=changes'));
    await watched446(page, 'S167', 'trial', 'an arrival with no draft');
    assert.ok(!(await nameplate446(page, 'trial')).includes('open-plan'),
      "S167 with no draft, the Trial's nameplate must offer no Open Plan");
    // 2. With a draft saved while it runs, it offers Open Plan beside View change
    //    record, and the Revert to Plan section keeps its own control.
    const saved = await draftWhileWatched446(page, 'S167');
    await page.goto(url446(page, '/?to=changes'));
    await watched446(page, 'S167', 'trial', 'an arrival with a saved draft');
    await waitForReplayAssertion(async seen => {
      const end = seen(await nameplate446(page, 'trial'));
      assert.equal(end[end.indexOf('history') + 1], 'open-plan',
        "S167 the Trial's nameplate must offer Open Plan beside View change record");
      assert.equal(seen(await page.locator('[data-part="plan-route"] [data-action="plan-route"]').count()), 1,
        'S167 the Revert to Plan section must keep its own control');
    }, 'S167 the Trial offers its draft');
    // 3. The nameplate's Open Plan: the explicit Plan arrival, the draft unchanged.
    await press(page, '.gf-stage-trial [data-action="open-plan"]');
    await planDraft446(page, 'S167', "the Trial's Open Plan");
    const after = await read(page, '/api/plan');
    assert.deepEqual([after.items, after.updated_at], [saved.items, saved.updated_at],
      "S167 the Trial's Open Plan must leave the saved draft unchanged");
    // 4. Record decision is refused by the server while the Trial is watched.
    const recorded = (await read(page, '/api/plan/history')).history.length;
    await press(page, '[data-set="record"]');
    await waitForReplayAssertion(async seen => {
      const desk = seen(await page.locator('.gf-desk').allTextContents()).join(' ');
      assert.ok(/Recording the decision failed/.test(desk) && seen(await page.locator('[data-set="retry-save"]').count()) === 1,
        'S167 Record decision must fail visibly while the Trial is watched');
      assert.equal(seen((await read(page, '/api/plan/history')).history.length), recorded,
        'S167 a refused record must add no Plan history record');
    }, 'S167 the server refuses the record');
    // 5. The next topbar Changes lands on the Trial.
    await topbar446(page, 'changes');
    await watched446(page, 'S167', 'trial', "the next topbar Changes");
  },
  // #446 · 2026-09-23. A watched Focus names its return and reaches its draft.
  // Diagnose's return label is read before the nameplate, so a base run
  // captures the crumb before it fails.
  async S168(page) {
    await admitted446(page, 'S168', 'focus');
    const [segment] = (await read(page, '/api/pump-settings')).profile?.segments || [];
    assert.ok(segment, 'S168 premise: the case must serve a pump profile');
    await draftWhileWatched446(page, 'S168', [{ type: 'basal', start_min: segment.start_min, value: segment.basal_rate }]);
    // 1. Changes shows the Focus's own view.
    await page.goto(url446(page, '/?to=changes'));
    await watched446(page, 'S168', 'focus', 'an arrival with a saved draft');
    // 2. Diagnose, opened from the Focus's Inspect evidence, names the Focus.
    await press(page, '.gf-stage-focus [data-follow-up-inspect]');
    await waitForReplayAssertion(async seen => {
      assert.deepEqual(seen(await page.locator('[data-action="watch"]').allTextContents()).map(text => text.trim()),
        ['Return to Focus'], 'S168 Diagnose opened from the watched Focus must offer "Return to Focus" and no "Return to Trial"');
    }, 'S168 Diagnose names the Focus in its return');
    // 3. It lands on the Focus.
    await press(page, '[data-action="watch"]');
    await watched446(page, 'S168', 'focus', '"Return to Focus"');
    // 4. The Focus's nameplate Open Plan opens the draft at the Plan's address.
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('.gf-stage-focus .gf-end [data-action="open-plan"]').count()), 1,
        "S168 the watched Focus's nameplate must offer Open Plan while a draft is saved");
    }, 'S168 the Focus offers its draft');
    await press(page, '.gf-stage-focus [data-action="open-plan"]');
    await planDraft446(page, 'S168', "the Focus's Open Plan");
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
  // #452 (ADR 452): a record's later conclusion — its typed words, a failed
  // save and that save's request id — stays with the record it was typed on.
  // Leaving the record for the roster and reopening it from there starts an
  // empty form whose next save sends a request id of its own. The carry into a
  // different expired Trial is proved at node level, because no committed case
  // store serves two; this proves the same rule on the one this store serves.
  async S180(page) {
    await page.goto(new URL('/?to=changes&subject=history', page.url()).href);
    await page.locator('table.gf-table').waitFor({ timeout: 30000 });
    const roster = await read(page, '/api/verify/trials');
    const expired = (roster.trials || []).filter(row => row.ending?.kind === 'expired_unreviewed');
    assert.ok(expired.length >= 1, 'S180 premise: the store serves an expired Trial');
    const { id } = expired[0];
    const record = await read(page, '/api/verify/trials', { kind: 'trial', selected: id });
    assert.notEqual(record.selected.original.late_conclusion?.state, 'available',
      'S180 premise: the expired Trial has no later conclusion saved');

    const CONCLUSION_POST = /\/api\/verify\/trials\/[^/]+\/conclusion$/;
    const row = page.locator(`table.gf-table [data-record="trial:${id}"]`);
    const form = page.locator('[data-form="late-conclusion"]');
    const field = page.locator('#late-conclusion-conclusion');
    await row.click();
    await form.waitFor({ timeout: 30000 });

    // The first save is refused by a routed synthetic answer, so nothing reaches
    // the store; its request id is recorded from the routed request.
    const refused = [];
    const refuse = async route => {
      refused.push(route.request().postDataJSON());
      await route.fulfill({ status: 503, contentType: 'application/json',
        body: JSON.stringify({ detail: 'Synthetic refusal' }) });
    };
    await page.route(CONCLUSION_POST, refuse);
    try {
      await field.fill('Synthetic observation typed before leaving');
      await form.locator('[type="submit"]').click();
      await page.locator('[data-save-error="conclude"]').waitFor({ timeout: 30000 });
    } finally { await page.unroute(CONCLUSION_POST, refuse); }
    assert.equal(refused.length, 1, 'S180 premise: the routed save must be sent once and refused');

    await page.locator('[data-record-close]').click();
    await page.locator('table.gf-table').waitFor({ timeout: 30000 });
    await row.click();
    await form.waitFor({ timeout: 30000 });
    assert.equal(await field.inputValue(), '',
      'S180 reopening the record from the roster must start its later conclusion empty');
    assert.equal(await page.locator('[data-save-error]').count(), 0,
      'S180 reopening the record must carry no failed save');

    const posted = [];
    const listener = request => {
      if (request.method() === 'POST' && CONCLUSION_POST.test(new URL(request.url()).pathname)) {
        posted.push(request.postDataJSON());
      }
    };
    page.on('request', listener);
    try {
      await field.fill('Synthetic observation recorded after reopening');
      await form.locator('[type="submit"]').click();
      await page.locator('[data-late-conclusion="available"]').waitFor({ timeout: 30000 });
    } finally { page.off('request', listener); }
    assert.equal(posted.length, 1, 'S180 the next save must be sent once');
    assert.notEqual(posted[0].request_id, refused[0].request_id,
      'S180 the next save must send a request id of its own');
    assert.equal(await page.locator('[data-late-conclusion-text]').innerText(),
      'Synthetic observation recorded after reopening', 'S180 the next save must record the later conclusion');
  },
  // #442 (ADR 442): an older detected change that a later one superseded reads
  // its saved ending in the roster and on its record, never "Still open". The
  // words of every reason line belong to the full ledger, not to this story.
  async S157(page) {
    const roster = await read(page, '/api/verify/trials');
    assert.ok(roster.trials.length >= 2, 'S157 premise: the case serves two or more Trial rows');
    assert.equal(roster.admission.active_kind, 'trial', 'S157 premise: the case serves an active Trial');
    const older = roster.trials.find(trial => trial.id !== roster.admission.active_id);
    assert.equal((older.ending || {}).kind, 'superseded',
      'S157 the older Trial row must carry its served superseded ending');
    await editChainRoster414(page);
    // A `has` locator is queried inside each row, so it names the button alone.
    const record = `[data-record="trial:${older.id}"]`;
    const row = page.locator('table.gf-table tr', { has: page.locator(record) });
    const button = row.locator(record);
    await waitForReplayAssertion(async seen => {
      const cell = seen(await row.locator('td.v').innerText()).trim();
      assert.ok(cell.startsWith('Superseded by a later change'), `S157 the roster row must read its ending: ${cell}`);
      assert.ok(!cell.includes('Still open'), `S157 an ended record's roster row must not read Still open: ${cell}`);
      assert.equal(seen(await row.locator('[data-record-open="true"]').count()), 0,
        'S157 an ended record must carry no still-open cell');
    }, 'S157 the roster row reads its ending');
    await button.click();
    await page.locator('[data-record-part="ending"] [data-ending-kind]').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      const kind = page.locator('[data-record-part="ending"] [data-ending-kind="superseded"]');
      assert.equal(seen(await kind.count()), 1, 'S157 the opened record must show its saved superseded ending');
      const words = seen(await kind.innerText()).trim();
      assert.equal(words, 'Superseded by a later change',
        `S157 the ending kind line must read its words, never an underscore-token code: ${words}`);
      const ending = seen(await page.locator('[data-record-part="ending"]').innerText());
      assert.ok(!ending.includes('same setting'), 'S157 the saved-ending note must not claim the same setting');
      const finished = seen(await page.locator('[data-record-part="ending"] dt', { hasText: 'Finished' })
        .locator('xpath=following-sibling::dd[1]').innerText()).trim();
      const note = seen(await page.locator('[data-part="periods"]').innerText());
      const readTo = (/data was read to (.+?)\.\s*$/.exec(note.trim()) || [])[1];
      assert.ok(finished, 'S157 the saved ending must name its Finished time');
      assert.equal(readTo, finished, 'S157 the periods note must read data to the saved ending\'s Finished time');
    }, 'S157 the opened record reads its saved superseded ending');
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
  // #447: the dock and Changes print one Trial day count, the served one.
  async S169(page) { await trialDayCount447(page); },
  // #447: the Guide's Diagnose article names no Verify.
  async S170(page) { await guideArticle447(page); },
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
  // #455: the glucose overview's text stays whole, inside the chart and
  // unstruck: every Window preset at the run's own size and at the narrowest
  // split, tall and short, and the Evening caption after the window is
  // narrowed with nothing pressed, which waits, bounded, for the relayout to
  // land (`readSettled`). Each press differs from the one before it, so every
  // check reads a fresh render. `assertOverviewText` judges.
  async S183(page) {
    await openDiagnoseRail(page);
    const run = page.viewportSize();
    const checks = [];
    const look = async (size, state, preset, extra = {}) => checks.push({ size, state, head: preset.head,
      range: preset.range, reading: await page.locator('#chart').evaluate(readPaintedText), ...extra });
    const choose = async preset => {
      await page.getByRole('button', { name: preset.label, exact: true }).click();
      await laidOutBrace404(page, { label: preset.label, range: preset.range });
    };
    const evening = OVERVIEW_PRESETS.find(preset => preset.label === 'Evening');
    try {
      for (const preset of OVERVIEW_PRESETS) {
        await choose(preset);
        await look(run, preset.label, preset, { runSize: true });
      }
      await choose(evening);
      await page.setViewportSize(NARROW_SPLIT_SIZES[0]);
      await settledResize(page, '#chart');
      const narrowed = { size: NARROW_SPLIT_SIZES[0], state: 'Evening, narrowed with nothing pressed',
        head: evening.head, range: evening.range };
      checks.push({ ...narrowed, reading: await readSettled(
        () => page.locator('#chart').evaluate(readPaintedText),
        reading => overviewTextFailures({ ...narrowed, reading }), 'S183 the narrowed overview re-lays out') });
      for (const size of NARROW_SPLIT_SIZES) {
        await page.setViewportSize(size);
        await settledResize(page, '#chart');
        for (const preset of OVERVIEW_PRESETS) {
          await choose(preset);
          await look(size, preset.label, preset,
            { premiseThin: size === NARROW_SPLIT_SIZES[0] && preset.label === '24 h' });
        }
      }
    } finally {
      await page.setViewportSize(run);
    }
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await settled(page);
    assertOverviewText(checks);
  },
  // #455: with Diagnose at rest, the Spotlight's verdict line keeps every fact
  // whole inside its chart and clear of the Keep control at 1200×736 and at the
  // narrowest split, reached by resizing with nothing pressed. Each reading
  // waits, bounded, for the relayout to land (`readSettled`).
  // `assertSpotlightVerdict` judges.
  async S184(page) {
    await diagnoseAtRest(page);
    const run = page.viewportSize();
    const checks = [];
    try {
      for (const size of SPOTLIGHT_SIZES) {
        await page.setViewportSize(size);
        await settledResize(page, '#tile-focal .tile-chart');
        const check = { size, oneLine: size === SPOTLIGHT_SIZES[0] };
        checks.push({ ...check, reading: await readSettled(
          () => page.locator('#tile-focal .tile-chart').evaluate(readPaintedText, '#tile-focal .tile-pin'),
          reading => spotlightVerdictFailures({ ...check, reading }), `S184 the Spotlight re-lays out at ${sizeName(size)}`) });
      }
    } finally {
      await page.setViewportSize(run);
    }
    assertSpotlightVerdict(checks);
  },
  // #455: with Diagnose at rest, the canvas header keeps its title, whole
  // provenance and named All charts control on one line at the narrowest split,
  // at 1024×768 and at the run's own size. The header's rule is CSS alone, so
  // each reading follows the resize once the header has held still for two
  // animation frames. `assertCanvasHead` judges.
  async S185(page) {
    await diagnoseAtRest(page);
    const run = page.viewportSize();
    const checks = [];
    try {
      for (const size of [...CANVAS_HEAD_SIZES, run]) {
        await page.setViewportSize(size);
        checks.push({ size, narrow: size.width < 1024, reading: await page.evaluate(readCanvasHead) });
      }
    } finally {
      await page.setViewportSize(run);
    }
    // the measured widths at every size, passing or not, for the change's record
    for (const { size, reading } of checks) process.stdout.write(`# S185 ${sizeName(size)} ${headWidths(reading)}\n`);
    assertCanvasHead(checks);
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
  // #445 (ADR 445): a contributing date of the active Trial opens Day naming
  // that date and no selector, and Return to Changes lands on its control.
  async S162(page) {
    const roster = await read(page, '/api/verify/trials');
    assert.equal(roster.admission?.active_kind, 'trial', 'S162 premise: the case must serve an active Trial');
    await press(page, 'nav.v2-nav [data-destination="changes"]');
    await page.locator('.gf-stage-trial').waitFor({ timeout: 30000 });
    const { control, date } = await supportingDate445(page, 'S162');
    await control.click();
    await page.locator('.gf-stage-day').waitFor({ timeout: 30000 });
    const day = await address428(page);
    assert.equal(day.date, date, 'S162 the Day address must name the supporting date');
    assert.equal(day.from, 'changes', 'S162 the Day address must return to Changes');
    identityAddress445('S162', day);
    await press(page, '[data-day="return"]');
    await page.locator('.gf-stage-trial').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await focusedOn445(page, `[data-day-date="${date}"]`)), true,
        `S162 Return to Changes must land focus on the ${date} control once the evidence has rendered`);
    }, 'S162 the return focus');
  },
  // #445: the same from the Trial's change record, reached as S142 reaches it.
  async S163(page) {
    const open = await openStillOpenRecord430(page, 'S163');
    const record = `record:${await open.getAttribute('data-record')}`;
    await open.click();
    await page.locator('[data-record-part="reassessment"]').waitFor({ timeout: 30000 });
    const { control, date } = await supportingDate445(page, 'S163');
    await control.click();
    await page.locator('.gf-stage-day').waitFor({ timeout: 30000 });
    const day = await address428(page);
    assert.equal(day.date, date, 'S163 the Day address must name the supporting date');
    assert.equal(day.occurrence, record, 'S163 the Day address must name the record');
    assert.equal(day.from, 'changes', 'S163 the Day address must return to Changes');
    identityAddress445('S163', day);
    await press(page, '[data-day="return"]');
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await address428(page)).occurrence, record, 'S163 the return must reopen the same record');
      assert.equal(seen(await page.locator('[data-record-part="reassessment"]').count()), 1,
        'S163 the reopened record must show its evidence');
      assert.equal(seen(await focusedOn445(page, `[data-day-date="${date}"]`)), true,
        `S163 the return must land focus on the ${date} control`);
    }, 'S163 the return reopens the record on its date');
  },
  // #445: Log carbs over a drilled case, on both return paths. Logging moves
  // the store, so the first return re-reads and restores the case (ADR 414);
  // after a reload Diagnose has read the moved store, so the second is retained.
  async S164(page) {
    const { subject, held } = await heldAfternoonCase445(page);
    const caseAddress = { subject, occurrence: held, window: '720-1080' };
    await waitForReplayAssertion(async seen => {
      assert.deepEqual(seen(await address428(page)), caseAddress, 'S164 premise: the address names the held case');
    }, 'S164 premise: the held case');
    const { latest_data_day: latest } = await read(page, '/api/status');
    const at = `${latest} 12:07:00`;
    const before = new Set((await read(page, '/api/carbs')).carb_entries.map(entry => entry.id));
    await press(page, '.cockpit-log-carbs');
    await press(page, '[data-utility-when="custom"]');
    await page.fill('#ut-custom', `${latest}T12:07`);
    await press(page, '.gf-utility .gf-chips [data-certainty="exact"]');
    const entry = await waitForReplayAssertion(async seen => {
      const logged = seen(await read(page, '/api/carbs')).carb_entries
        .find(row => row.t === at && !before.has(row.id));
      assert.ok(logged, `S164 premise: the entry logged at ${at} must be served`);
      return logged;
    }, 'S164 premise: the logged entry');
    // Found by its Remove control, which the base names the same way.
    const opener = `.gf-entry-row:has([data-utility-remove="${entry.id}"]) [data-action="day"]`;
    const control = `.gf-utility [data-action="day"][data-subject="carb:${entry.id}"]`;
    await press(page, opener);
    await page.locator('.gf-stage-day').waitFor({ timeout: 30000 });
    const day = await address428(page);
    assert.equal(day.subject, `carb:${entry.id}`, 'S164 the Day address must name the entry by its id');
    assert.ok(day.title?.startsWith('Log carbs · '), `S164 the Day address must carry the printed title: ${JSON.stringify(day)}`);
    identityAddress445('S164', day);

    await press(page, '[data-utility-close]');
    // The moved store's re-read makes its own status read first, so its
    // guidance read lands a round trip after the return's status answer —
    // after the window heldStatusReturn records. Watch for it from the press.
    const reread = page.waitForRequest(request => new URL(request.url()).pathname === '/api/analyze', { timeout: 30000 })
      .then(() => true, () => false);
    await press(page, '[data-day="return"]');
    assert.ok(await reread, 'S164 the return after logging must re-read Diagnose: the store moved');
    await waitForDesk(page);
    await waitForHeld428(page, held);
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('.gf-utility[data-utility="carbs"]').count()), 1,
        'S164 Log carbs must be open over the restored case');
      assert.deepEqual(seen(await address428(page)), caseAddress, 'S164 the address must name the restored case');
      assert.equal(seen(await focusedOn445(page, control)), true,
        'S164 focus must land on the entry\'s Open Day control once the restoration settles');
    }, 'S164 the return after logging');

    await page.reload();
    await waitForHeld428(page, held);
    await settled(page);
    const trailBefore = await text445(page, '#crumb-trail .here');
    await press(page, '.cockpit-log-carbs');
    await press(page, control);
    await page.locator('.gf-stage-day').waitFor({ timeout: 30000 });
    await press(page, '[data-utility-close]');
    const kept = await wholeReturn445(page, 'S164');
    assert.deepEqual(kept.filter(path => path !== '/api/status'), [],
      'S164 the return after a reload must issue no request besides the held status check');
    assert.equal(kept.filter(path => path === '/api/status').length, 1,
      'S164 the return after a reload must issue exactly one GET /api/status');
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await heldOccurrence428(page)), held, 'S164 the retained case must keep its Occurrence');
      assert.equal(seen(await text445(page, '#crumb-trail .here')), trailBefore, 'S164 the drilled case must remain open');
      assert.equal(seen(await page.locator('.gf-utility[data-utility="carbs"]').count()), 1,
        'S164 Log carbs must be open over the retained case');
      assert.deepEqual(seen(await address428(page)), caseAddress,
        'S164 the address must name the retained case, with no title, from or focus');
      assert.equal(seen(await focusedOn445(page, control)), true, 'S164 focus must land on the entry\'s Open Day control');
    }, 'S164 the return after a reload');
  },
  // #445: Carb questions over a drilled case with a window pressed (S137's
  // path) is a retained return: one status read, the case and window kept.
  async S165(page) {
    // After its Day return the address still carries that entry's own keys
    // until the case changes (ADR 428); a plain return names the case alone,
    // as S137 reads it.
    const { subject, first } = await heldCaseThroughDay428(page, 'S165');
    const trailBefore = await text445(page, '#crumb-trail .here');
    const windowBefore = await text445(page, '#seg-window [aria-pressed="true"]');
    const caseAddress = { subject, occurrence: first };
    assert.ok((await read(page, '/api/prompts')).length > 0, 'S165 premise: the showcase must serve a carb question');
    await press(page, '[data-utility="questions"]');
    const open = page.locator('.gf-utility [data-action="day"][data-date]').filter({ visible: true }).first();
    await open.waitFor({ timeout: 30000 });
    const identity = await open.getAttribute('data-subject');
    await open.click();
    await page.locator('.gf-stage-day').waitFor({ timeout: 30000 });
    await press(page, '[data-utility-close]');
    const requests = await wholeReturn445(page, 'S165');
    assert.deepEqual(requests.filter(path => path !== '/api/status'), [],
      'S165 the Carb questions return must issue no request besides the held status check');
    assert.equal(requests.filter(path => path === '/api/status').length, 1,
      'S165 the Carb questions return must issue exactly one GET /api/status');
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await text445(page, '#seg-window [aria-pressed="true"]')), windowBefore,
        'S165 the pressed window must remain pressed');
      assert.equal(seen(await text445(page, '#crumb-trail .here')), trailBefore, 'S165 the drilled case must remain open');
      assert.equal(seen(await page.locator('.gf-utility[data-utility="questions"]').count()), 1,
        'S165 Carb questions must be open over the retained case');
      assert.equal(seen(await focusedOn445(page, `.gf-utility [data-action="day"][data-subject="${identity}"]`)), true,
        'S165 focus must land on the prompt\'s Open Day control');
      assert.deepEqual(seen(await address428(page)), caseAddress,
        'S165 the address must name the retained case, with no title, from or focus');
    }, 'S165 the retained return');
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
  // #451: fail-first on b03431d2, where the Action figure prints the bare served
  // number, the nameplate prints the raw disposition code, and the Diagnose row,
  // panel, dock and "What was known" name the engine's ISF and its mg/dL/U unit.
  async S177(page) {
    const { guidance, action } = await servedLead451(page, 'S177');
    const priority = `${guidance.selected.priority ?? '—'} priority`;
    await press(page, 'nav.v2-nav [data-destination="changes"]');
    await page.locator('.gf-reading .gf-figure').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      const figure = seen(await page.locator('.gf-reading .gf-figure')
        .evaluate(node => node.firstChild?.textContent ?? ''));
      assert.equal(figure, `${action.direction} to ${correctionFactor451(action.recommended)}`,
        'S177 the Action figure reads the served instruction, the correction factor insulin first');
      assert.deepEqual(seen(await changesWords451(page)), { sub: `${priority} · Ready to stage`, action: 'Ready to stage' },
        'S177 an eligible setting instruction reads Ready to stage on the nameplate and the Action heading');
      assert.doesNotMatch(seen(await page.locator('.gf-desk').innerText()), ENGINE_WORDS_451,
        'S177 the Changes desk prints no engine unit, engine name or disposition code');
    }, 'S177 the plain arrival reads in the wearer\'s words');

    await press(page, '[data-set="stage"]');
    await page.locator('[data-set="unstage"]').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      assert.deepEqual(seen(await changesWords451(page)), { sub: `${priority} · Staged`, action: 'Staged' },
        'S177 a staged change reads Staged, as the pane does');
    }, 'S177 staged');
    await press(page, '[data-set="unstage"]');
    await page.locator('[data-set="stage"]').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      assert.deepEqual(seen(await changesWords451(page)), { sub: `${priority} · Ready to stage`, action: 'Ready to stage' },
        'S177 Undo returns the words to Ready to stage');
    }, 'S177 unstaged');

    await press(page, '[data-action="aside"]');
    await page.locator('#aside-reason').waitFor({ timeout: 30000 });
    await press(page, 'form[data-form="aside"] button[type="submit"]');
    // Both the nameplate and the set-aside section carry this Restore; either one
    // proves the write and its re-read have landed.
    await page.locator(`[data-restore="${guidance.selected.subject}"]`).first().waitFor({ timeout: 30000 });
    const reread = await read(page, '/api/guidance');
    const held = reread.candidates.find(row => row.subject === guidance.selected.subject);
    assert.ok(held?.preference?.set_aside, 'S177 premise: the concern set aside must be served set aside');
    await waitForReplayAssertion(async seen => {
      const { sub } = seen(await changesWords451(page));
      assert.equal(sub, `${held.priority ?? '—'} priority · Set aside`,
        'S177 a set-aside concern on screen carries no status words for the concern that leads next');
      assert.ok(STATUS_WORDS_451.every(words => !sub.includes(words)), `S177 no status words on a set-aside seat: ${sub}`);
    }, 'S177 the set-aside seat');
  },
  async S178(page) {
    await fullDayDiagnose(page);
    const preparation = await read(page, '/api/diagnose/finding-case-file-preparation');
    const row = preparation.rendered_rows.find(candidate => candidate.parameter === 'isf');
    assert.ok(row && row.register === 'assert' && row.asserts_move === true && row.direction
      && row.current != null && row.recommended != null,
      'S178 premise: the case must serve an asserting, stageable correction-factor row with its numbers');
    const title = `Correction factor · ${row.direction}`;
    const node = page.locator(`#level .qrow[data-id="${row.id}"]`);
    await node.waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      assert.equal(seen((await node.locator('.lab').innerText()).trim()), title,
        'S178 the queue row is titled by the setting and its served direction');
      const numbers = seen((await node.locator('.den.nums').innerText()).trim());
      assert.equal(numbers, queueNumbers451(row),
        'S178 the queue numbers read insulin first, at the queue\'s own rounding, then the row\'s served scope');
      assert.doesNotMatch(numbers, /mg\/dL\/U/, 'S178 the queue numbers never print the engine unit');
    }, 'S178 the correction-factor queue row');

    await node.click();
    await settled(page);
    const values = `${correctionFactor451(panelNum451(row.current))} → ${correctionFactor451(panelNum451(row.recommended))}`;
    await waitForReplayAssertion(async seen => {
      assert.equal(seen((await page.locator('#level .slot-head .time').innerText()).trim()), 'Correction factor',
        'S178 the panel heading names the setting');
      const numbers = seen(await page.locator('#level .numrow b').allInnerTexts()).map(text => text.trim());
      assert.equal(numbers[0], correctionFactor451(panelNum451(row.current)), 'S178 the panel\'s current value reads insulin first');
      assert.equal(numbers[2], correctionFactor451(panelNum451(row.recommended)), 'S178 the panel\'s recommended value reads insulin first');
      // `.dw[data-state]` is the Diagnose workstation root alone: the desk surface
      // around it carries the `dw` theme class too, but no `data-state`.
      assert.doesNotMatch(seen(await page.locator('.dw[data-state]').innerText()), /mg\/dL\/U|\bISF\b/,
        'S178 the Diagnose desk prints neither the engine unit nor the engine name');
    }, 'S178 the correction-factor panel');

    await press(page, '#level .stagebtn[data-staged="false"]');
    await page.locator('#level .stagebtn[data-staged="true"]').waitFor({ timeout: 30000 });
    await page.locator('.inspector > .watch[data-state="plan"]').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      const dock = seen(await page.locator('.inspector > .watch').evaluate(node => {
        const what = node.querySelector('.what'); const how = node.querySelector('.how');
        const box = element => { const rect = element.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }; };
        return {
          what: what.textContent, whatFits: what.scrollWidth <= what.clientWidth,
          how: how.textContent, howFits: how.scrollWidth <= how.clientWidth + 1 && how.scrollHeight <= how.clientHeight + 1,
          howBox: box(how), dockBox: box(node), viewport: { width: innerWidth, height: innerHeight },
        };
      }));
      assert.equal(dock.what, title, 'S178 the staged title names the setting and its served direction');
      assert.ok(dock.whatFits, `S178 the staged title must not truncate: ${JSON.stringify(dock)}`);
      assert.ok(dock.how.startsWith(`${values} · `), `S178 the values lead the dock's detail line: ${dock.how}`);
      assert.ok(dock.howFits && dock.howBox.bottom <= dock.dockBox.bottom + 1 && dock.howBox.right <= dock.dockBox.right + 1
        && dock.dockBox.top >= 0 && dock.dockBox.bottom <= dock.viewport.height + 1,
        `S178 the dock's values must be fully visible: ${JSON.stringify(dock)}`);
      assert.doesNotMatch(seen(await page.locator('.dw[data-state]').innerText()), /mg\/dL\/U|\bISF\b/,
        'S178 the staged Diagnose desk prints neither the engine unit nor the engine name');
    }, 'S178 the staged dock');
  },
  async S179(page) {
    await servedLead451(page, 'S179');
    await C2_STORIES.stageIntoPlan(page);
    await press(page, '[data-set="record"]');
    await page.locator('[data-set="withdraw"]').waitFor({ timeout: 30000 });
    const context = (await read(page, '/api/plan/history')).history[0]?.decision_context;
    assert.ok(context?.state === 'available' && context.subjects?.[0] === 'setting:isf'
      && context.settings?.length === 1 && Array.isArray(context.action) && context.action[0]?.parameter === 'isf',
      'S179 premise: the recorded Plan must retain its correction-factor decision');
    await waitForReplayAssertion(async seen => {
      const known = seen(await page.evaluate(() => {
        const section = [...document.querySelectorAll('.gf-reading .gf-section')]
          .find(node => node.querySelector('h3')?.textContent.trim() === 'What was known');
        if (!section) return null;
        const values = [...section.querySelectorAll('dd')].map(node => node.textContent.trim());
        return { concern: values[0], change: values[1], explanation: section.querySelector('p')?.textContent.trim(),
          text: section.textContent };
      }));
      assert.ok(known, 'S179 the recorded Plan shows what was known');
      assert.equal(known.concern, 'Correction factor', 'S179 the recorded concern is named, never its identifier');
      assert.equal(known.change, correctionFactor451(context.settings[0].value),
        'S179 the recorded value reads insulin first');
      assert.equal(context.explanation, 'Correction factor', 'S179 the recorded explanation names the setting');
      assert.equal(known.explanation, context.explanation, 'S179 the explanation prints as recorded');
      assert.doesNotMatch(known.text, /setting:|mg\/dL\/U/, 'S179 what was known prints no identifier or engine unit');
    }, 'S179 what was known');
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
        const detail = await readiness(fresh, unit, required);
        const comparison = detail.reassessment.comparison;
        assert.ok(comparison.readiness.after.elapsed_days > 14, 'actual accumulation continues past fourteen days');
        if (name !== 'c4-ic') {
          // #462: these records ended, so their Retained read stops at the
          // ending and counts what the saved ending counts (ADR 462).
          assert.deepEqual(comparison.readiness, detail.original.ending.assessment.readiness,
            'S91 an ended record\'s Retained read counts what its saved ending counts');
          assert.equal(comparison.assessment.state, 'unclear', 'the Retained read manufactures no direction');
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
  // ADR 449/450: the active Focus names its behavior by its served name, and its
  // opportunity verdicts in words.
  async S173(page) {
    const roster = await read(page, '/api/verify/trials');
    assert.equal(roster.admission?.active_kind, 'focus', 'S173 premise: the case must serve an active Focus');
    const id = roster.admission.active_id;
    const detail = await focusDetail449(page, id);
    const comparison = (await focusDetail449(page, id, 'retained')).reassessment.comparison;
    assert.ok(comparison.adherence, 'S173 premise: the retained comparison must serve Observed behavior rows');
    const verdicts = Object.values(comparison.readiness || {}).map(arm => arm.verdict).filter(Boolean);
    assert.ok(verdicts.length, 'S173 premise: the retained comparison must serve a Pattern opportunity verdict');
    await page.goto(new URL('/?to=changes', page.url()).href);
    await page.locator('.gf-stage-focus [data-table="adherence"]').waitFor({ timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      const name = detail.lever_title;
      const row = seen(await page.locator('[data-table="adherence"] tr.gf-target td').first().innerText()).trim();
      assert.ok(name && row.startsWith(name), `S173 the Observed behavior row must name the served behavior: ${row}`);
      assert.ok(!row.includes(detail.lever), 'S173 the Observed behavior row must not print the lever key');
      if (!detail.original?.context?.explanation) {
        const intent = seen(await page.locator('[data-part="intent"]').innerText());
        assert.ok(intent.includes(name), `S173 What this Focus watches must name the served behavior: ${intent}`);
      }
      const lines = seen(await page.locator('[data-opportunity-verdict]').allInnerTexts());
      assert.equal(lines.length, verdicts.length, 'S173 premise: every served Pattern arm shows its opportunity line');
      assertWordsOnly449('S173', lines, [], verdicts);
    }, 'S173 the active Focus names its behavior and verdicts in words');
  },
  // ADR 450, R450: a saved Focus ending names its served reason in words, and so
  // does every line of the record that the saved comparison serves.
  async S174(page) {
    const roster = await read(page, '/api/verify/trials');
    const row = roster.focuses.find(focus => focus.ending?.kind === 'manual');
    assert.ok(row, 'S174 premise: the case must retain a Focus ended by hand');
    const assessment = (await focusDetail449(page, row.id)).original.ending.assessment || {};
    assert.equal(assessment.state, 'unavailable', 'S174 premise: the saved ending assessment must be served unavailable');
    assert.ok(assessment.reason, 'S174 premise: the saved ending must serve its reason');
    const codes = endingCodes449(assessment);
    await openFocusRecord449(page, row.id);
    await waitForReplayAssertion(async seen => {
      const line = seen(await page.locator('[data-ending-assessment]').innerText()).trim();
      const words = line.startsWith('Unavailable · ') ? line.slice('Unavailable · '.length).trim() : '';
      assert.ok(words && !words.includes(assessment.reason),
        `S174 the saved ending must name its reason in words, never its served code: ${line}`);
      assert.ok(seen(await page.locator('[data-harm]').count()) > 0, 'S174 premise: the record shows its harm cells');
      assert.ok(seen(await page.locator('[data-criterion]').count()) > 0, 'S174 premise: the record shows its readiness lines');
      const verdicts = Object.values(assessment.readiness || {}).map(arm => arm.verdict).filter(Boolean);
      for (const selector of ['[data-harm]', '[data-criterion]', '[data-opportunity-verdict]']) {
        assertWordsOnly449('S174', seen(await page.locator(selector).allInnerTexts()), codes, verdicts);
      }
    }, 'S174 a saved Focus ending names its reason in words');
  },
  // ADR 450: an unmeasured behavior cell names its reason in words and keeps
  // its measured count; a still-collecting arm says so in words.
  async S175(page) {
    const roster = await read(page, '/api/verify/trials');
    const row = roster.focuses.find(focus => focus.ending?.kind);
    assert.ok(row, 'S175 premise: the case must retain an ended Focus');
    const assessment = (await focusDetail449(page, row.id)).original.ending.assessment || {};
    const unmeasured = ['before', 'after'].map(side => [side, (assessment.adherence || {})[side] || {}])
      .filter(([, arm]) => arm.opportunities && arm.rate == null && arm.availability?.reason);
    assert.ok(unmeasured.length, 'S175 premise: the saved ending must serve an unmeasured behavior arm');
    const collecting = ['before', 'after'].filter(side => {
      const arm = (assessment.readiness || {})[side] || {};
      return arm.reason === 'collecting' && !arm.criterion_met;
    });
    assert.ok(collecting.length, 'S175 premise: the saved ending must serve a still-collecting readiness arm');
    await openFocusRecord449(page, row.id);
    await waitForReplayAssertion(async seen => {
      for (const [side, arm] of unmeasured) {
        const cell = seen(await page.locator(`[data-adherence="${side}"]`).innerText());
        assert.ok(!cell.includes(arm.availability.reason),
          `S175 the Observed behavior cell must name its reason in words, never its served code: ${cell}`);
        assert.ok(cell.includes(`${arm.measured_opportunities} of ${arm.opportunities} measured`),
          `S175 the Observed behavior cell must keep its measured count: ${cell}`);
      }
      for (const side of collecting) {
        const line = seen(await page.locator(`[data-readiness="${side}"] [data-criterion]`).innerText()).trim();
        assert.ok(line.startsWith('Not met — ') && line !== 'Not met — collecting.',
          `S175 a still-collecting arm must say so in words: ${line}`);
      }
    }, 'S175 an unmeasured behavior names its reason in words');
  },
  // ADR 449, Q1: a Focus record's "What changed" names the watched behavior by
  // its served name while the nameplate keeps the Focus's own title.
  async S176(page) {
    const roster = await read(page, '/api/verify/trials');
    const patterned = roster.focuses.filter(focus => focus.pattern_key);
    const plain = roster.focuses.filter(focus => !focus.pattern_key);
    assert.ok(patterned.length && plain.length,
      'S176 premise: the case must retain a Pattern Focus record and a record with no Pattern');
    for (const row of [...patterned, ...plain]) {
      const detail = await focusDetail449(page, row.id);
      await openFocusRecord449(page, row.id);
      await waitForReplayAssertion(async seen => {
        assert.equal(seen(await page.locator('.gf-stage .gf-title').first().innerText()).trim(), detail.title,
          'S176 the nameplate must keep the served title');
        const change = seen(await page.locator('[data-record-part="change"]').innerText());
        assert.ok(!change.includes(detail.lever), `S176 What changed must not print the lever key: ${change}`);
        if (row.pattern_key || detail.lever_title) {
          assert.ok(detail.lever_title && change.includes(`The intended behavior: ${detail.lever_title}.`),
            `S176 What changed must name the served behavior: ${change}`);
          if (detail.title !== detail.lever_title) assert.ok(!change.includes(detail.title),
            `S176 What changed must not name the behavior by the nameplate title: ${change}`);
        } else {
          assert.ok(change.includes('no longer an offered lever') && !/intended behavior: Focus\b/.test(change),
            `S176 a record whose behavior has no served name must say it is no longer an offered lever: ${change}`);
        }
      }, `S176 Focus record ${row.id} names its behavior`);
    }
  },
  async S186(page, ctx) {
    const failures = [];
    for (const [leg, run] of LEGS460) {
      try {
        await fresh460(page);
        await run(page, ctx);
        process.stdout.write(`# S186 ${leg}: pass\n`);
      } catch (error) {
        const reason = String(error?.message || error).split('\n')[0];
        failures.push(`${leg}: ${reason}`);
        process.stdout.write(`# S186 ${leg}: fail — ${reason}\n`);
      }
    }
    failOnce('S186', 'the watch dock and the staged marks must follow the Plan draft', failures);
  },
  async S187(page, ctx) {
    const failures = [];
    const check = async (assertion, description) => {
      try { await waitForReplayAssertion(assertion, description); } catch (error) {
        failures.push(String(error?.message || error).split('\n')[0]);
      }
    };
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await settled(page);
    await openCarbRatio459(page);
    assert.equal((await control459(page)).words, 'Stage change', 'S187 premise: nothing is staged yet');
    await stage459(page, ctx, 'carb ratio');
    const carbRatio = await waitForReplayAssertion(async seen => {
      const dock = seen(await dock460(page));
      assert.equal(dock.kind, 'Plan · staged', 'S187 premise: the dock reports the staged carb ratio');
      assert.match(dock.what, /^Carb ratio /, 'S187 premise: the dock names the staged carb-ratio change');
      return dock.what;
    }, 'S187 the staged carb ratio');

    await page.locator('#lane > .lane-cell[data-verdict="down"]').first().click();
    await page.locator('#level .stagebtn').waitFor({ timeout: 30000 });
    await check(async seen => {
      const control = seen(await control459(page));
      assert.equal(control.words, 'Replace staged change',
        'S187 before the press, the basal control must read "Replace staged change"');
      assert.equal(control.sub, `replaces ${carbRatio}`,
        'S187 before the press, the basal control must name the staged carb-ratio change as the dock names it');
      assert.equal(control.staged, 'false', 'S187 before the press, the basal control is not staged');
    }, 'S187 the basal control warns before the press');
    await capture(page, ctx, 'S187-replace', 'basal-and-carb-ratio-lower');

    await stage459(page, ctx, 'basal');
    const draft = await read(page, '/api/plan');
    assert.ok(draft.items.length, 'S187 premise: the basal press saves a draft');
    const basal = basalDraftName459(draft.items);
    await check(async seen => {
      assert.ok(seen(draft.items.map(item => item.type)).every(type => type === 'basal'),
        'S187 the served draft must hold only basal rows');
      const dock = seen(await dock460(page));
      assert.equal(dock.kind, 'Plan · staged', 'S187 the dock must read "Plan · staged" after the replacement');
      assert.ok(dock.what.startsWith(basal), `S187 the dock must name the basal change, ${basal}`);
    }, 'S187 the replacement');
    await capture(page, ctx, 'S187-replaced', 'basal-and-carb-ratio-lower');

    await openCarbRatio459(page);
    await check(async seen => {
      const control = seen(await control459(page));
      assert.equal(control.staged, 'false', 'S187 the replaced carb ratio must report itself unstaged');
      assert.notEqual(control.words, 'Staged · Undo', 'S187 the replaced carb ratio must never read "Staged · Undo"');
      assert.equal(control.words, 'Replace staged change', 'S187 the carb-ratio control must read "Replace staged change"');
      assert.equal(control.sub, `replaces ${basal}`, 'S187 the carb-ratio control must name the staged basal change');
    }, 'S187 the replaced carb ratio');
    failOnce('S187', 'the stage control must warn before it replaces another setting', failures);
  },
  // #462: an ended record whose saved ending serves no periods, because its
  // context was read from a pump read after it ended, draws the reassessment the
  // reader presses, cut at its ending, under that read's own mode (ADR 462).
  async S188(page, ctx) {
    const failures = [];
    const check = async (assertion, description) => {
      try { await waitForReplayAssertion(assertion, description); } catch (error) {
        failures.push(String(error?.message || error).split('\n')[0]);
      }
    };
    const roster = await read(page, '/api/verify/trials');
    assert.equal(roster.trials.length, 1, 'S188 premise: the case serves one Trial record');
    const [{ id, ending }] = roster.trials;
    assert.equal((ending || {}).kind, 'expired_unreviewed', 'S188 premise: the record ended unreviewed');
    assert.equal(ending.assessment.reason, 'context_after_ending',
      'S188 premise: its saved ending was read from a pump read after it ended');
    const late = 'this change’s context was recorded after it ended';
    await page.goto(new URL(`/?to=changes&subject=history&occurrence=${encodeURIComponent(`record:trial:${id}`)}`, page.url()).href);
    await page.locator('[data-record-part="ending"] [data-ending-kind]').waitFor({ timeout: 30000 });
    const stage = page.locator('.gf-stage-trial');
    // The caption is set in capitals by the stylesheet, so its words compare
    // without case.
    const instrument = async () => (await stage.locator('.instruments .instrument').first().innerText())
      .replace(/\s+/g, ' ').trim().toLowerCase();
    const figure = stage.locator('[data-trial-chart]');
    await waitForReplayAssertion(async seen => {
      assert.ok(seen(await instrument()).includes('as saved at the ending'), 'S188 premise: the record opens on its saved ending');
      assert.equal(seen(await figure.getAttribute('data-figure-state')), 'unavailable',
        'S188 premise: the saved ending draws no curve');
      assert.equal(seen(await figure.locator('[data-figure-reason]').innerText()).trim(), late,
        'S188 premise: the saved ending names its late-context reason in words');
    }, 'S188 the saved ending');
    await capture(page, ctx, 'S188-original', 'c4-isf-late-read');

    const current = (await read(page, '/api/verify/trials', { selected: id, assessment: 'current' }, 120000))
      .selected.reassessment.comparison;
    await press(page, '[data-assessment="current"]');
    await page.locator('[data-reassessment-context="current"]').waitFor({ timeout: 120000 });
    await check(async seen => {
      const words = seen(await instrument());
      assert.ok(words.includes('current policy reassessment') && words.includes('recomputed now'),
        `S188 after pressing Current policy, the stage must name "Current policy reassessment" and "recomputed now": ${words}`);
      assert.ok(!words.includes('as saved at the ending'), 'S188 the Current policy stage must not read "as saved at the ending"');
      assert.equal(seen(await figure.getAttribute('data-figure-state')), 'paired',
        'S188 after pressing Current policy, the stage must draw a paired figure');
      assert.ok(seen(await stage.locator('[data-table="outcomes"] [data-outcome]').count()) > 0,
        'S188 after pressing Current policy, the stage must show its outcome rows');
      assert.ok(current.periods.after.end <= ending.effective_at,
        `S188 the Current policy Trial period must end at or before the record's Finished time: ${current.periods.after.end}`);
      const printed = seen(await page.locator('[data-part="periods"] [data-period="after"]').innerText());
      assert.ok(printed.includes(stamp(current.periods.after.end)), 'S188 the page must print that Trial period\'s end');
    }, 'S188 Current policy');
    await capture(page, ctx, 'S188-current', 'c4-isf-late-read');

    await press(page, '[data-assessment="retained"]');
    await page.locator('[data-reassessment-context="retained"]').waitFor({ timeout: 120000 });
    await check(async seen => {
      assert.ok(seen(await instrument()).includes('retained context reassessment'),
        'S188 after pressing Retained context, the stage must name "Retained context reassessment"');
      assert.equal(seen(await figure.getAttribute('data-figure-state')), 'unavailable',
        'S188 the Retained read must read unavailable');
      assert.equal(seen(await figure.locator('[data-figure-reason]').innerText()).trim(), late,
        'S188 the Retained read must name the same late-context reason');
      const context = seen(await page.locator('[data-reassessment-context="retained"]').innerText());
      assert.doesNotMatch(context, /[0-9a-f]{8,}/, `S188 the Retained line must print no id characters: ${context}`);
    }, 'S188 Retained context');
    failOnce('S188', 'an ended record whose saved ending has no periods must draw the reassessment the reader presses', failures);
  },
  // #463: a change record prints one decimal (leg 1, the showcase's watched
  // Trial, whose served Time in range difference keeps a binary tail) and an
  // ending saved with its clock bins draws its curve (leg 2, c3-history's
  // finished record). Each leg runs; the story fails once, naming each failed leg.
  async S189(page, ctx) {
    const failures = [];
    for (const [leg, run] of [['leg 1 · one decimal', readColumn463], ['leg 2 · saved curve', savedCurve463]]) {
      try {
        await run(page, ctx);
        process.stdout.write(`# S189 ${leg}: pass\n`);
      } catch (error) {
        const reason = String(error?.message || error).split('\n')[0];
        failures.push(`${leg}: ${reason}`);
        process.stdout.write(`# S189 ${leg}: fail — ${reason}\n`);
      }
    }
    failOnce('S189', 'a change record must print one decimal and draw a saved curve', failures);
  },
  // #465: recurring lows at 03:00 point to a step down a hundredth deep, below
  // the threshold, so the slot holds (ADR 465). The lane paints it a hold with
  // no recurring-lows reason, the key counts no recurring-lows lower, and the
  // panel reads the served hold sentence with nothing to stage. The lane opens
  // on the plain 24 h rail, as S113's recurring-lows variant does.
  async S190(page) {
    await openDiagnoseRail(page);
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('#lane > button.lane-cell').count()), 48,
        'S190 premise: the within-threshold store must render all 48 basal slots');
    }, 'S190 the lane renders on the 24 h rail');
    const cell = page.locator('#lane > .lane-cell[data-cell="6"]');
    assert.equal(await cell.getAttribute('data-verdict'), 'hold',
      'S190 the 03:00 lane cell must read a hold, not a recurring-lows lower');
    assert.equal(await cell.getAttribute('data-reason'), null,
      'S190 the 03:00 lane cell must carry no recurring-lows reason');
    const entries = await page.locator('#lane-key > span')
      .evaluateAll(spans => spans.map(span => span.textContent.replace(/\s+/g, ' ').trim()));
    assert.ok(!entries.some(entry => entry.startsWith('lower · recurring lows')),
      `S190 the key must count no recurring-lows lower; it reads ${JSON.stringify(entries)}`);
    await cell.click();
    await waitForReplayAssertion(async seen => {
      const panel = seen(await page.evaluate(readSlotPanel));
      assert.ok(panel?.time?.startsWith('03:00'), `S190 premise: the 03:00 slot's panel must open; it shows ${panel?.time}`);
      assert.equal(panel.verdict, 'holds at current', 'S190 the panel must read "holds at current"');
      assert.ok(panel.text.includes('lows keep happening overnight, but the step down is smaller than the '
        + 'smallest change worth making, so the rate stays as it is'),
      'S190 the panel must read the served recurring-lows hold sentence');
      assert.equal(panel.stage, 0, 'S190 the held slot must offer no Stage change button');
    }, 'S190 the held 03:00 panel names the recurring lows and stages nothing');
  },
  // #466: a recurring-lows slot says the overnight lows own its move and lists
  // them. Leg 1 opens basal-recurring-low-spread's 03:00 lower, whose interval
  // reaches the setting; leg 2 opens basal-recurring-low-within-floor's held
  // 03:00 (ADR 465). Each leg runs; the story fails once, naming each failed leg.
  async S191(page, ctx) {
    const failures = [];
    for (const [leg, run] of [
      ['leg 1 · the spread lower', recurringLowsLower466],
      ['leg 2 · the held slot', () => ctx.withCase('basal-recurring-low-within-floor', recurringLowsHold466)],
    ]) {
      try {
        await run(page, ctx);
        process.stdout.write(`# S191 ${leg}: pass\n`);
      } catch (error) {
        const reason = String(error?.message || error).replace(/\s+/g, ' ').slice(0, 800);
        failures.push(`${leg}: ${reason}`);
        process.stdout.write(`# S191 ${leg}: fail — ${reason}\n`);
      }
    }
    failOnce('S191', 'a recurring-lows slot must say what owns its move and show its lows', failures);
  },
  // #467: a scoped window serves a Pattern when its outcomes land in it. The
  // overnight Pattern owns no chart, so it draws no mini at 24 h, and Overnight
  // keeps it with the band's counts; Afternoon, clear of the band, lists none.
  // It asserts no rank numeral, tier or position (#469 moves those).
  async S192(page) {
    const id = 'pattern:overnight_lows_no_iob';
    await openDiagnoseRail(page);
    await patternRow467(page, id, '2 of 30 nights ran low overnight', '24 h');
    await page.getByRole('button', { name: 'Overnight', exact: true }).click(); await settled(page);
    await patternRow467(page, id, '2 of 30 nights ran low between 00:00 and 06:00', 'Overnight');
    await page.getByRole('button', { name: 'Afternoon', exact: true }).click(); await settled(page);
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('#seg-window [aria-pressed="true"]').innerText()).trim(), 'Afternoon',
        'S192 premise: the Afternoon preset must be pressed');
      assert.equal(seen(await page.locator(`#level .qrow[data-id="${id}"]`).count()), 0,
        'S192 Afternoon must list no overnight Pattern row');
    }, 'S192 Afternoon lists no overnight Pattern');
  },
};

// #467: the overnight Pattern's row in the pressed window prints its served
// count sentence and draws no mini.
async function patternRow467(page, id, sentence, preset) {
  await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('#seg-window [aria-pressed="true"]').innerText()).trim(), preset,
      `S192 premise: the ${preset} preset must be pressed`);
    const row = page.locator(`#level .qrow[data-id="${id}"]`);
    assert.equal(seen(await row.count()), 1, `S192 ${preset} must list the overnight Pattern row`);
    const text = seen(await row.locator('.den').innerText()).replace(/\s+/g, ' ').trim();
    assert.ok(text.includes(sentence), `S192 ${preset}'s overnight Pattern row must print "${sentence}"; it prints "${text}"`);
    assert.equal(seen(await row.locator('.mini canvas').count()), 0,
      `S192 ${preset}'s overnight Pattern row must draw no mini`);
  }, `S192 the ${preset} overnight Pattern row`);
}

// #466: open the 24 h rail's 03:00 slot and read the served harm evidence it
// lists, as S190 opens its lane.
async function openSlot0300466(page) {
  await openDiagnoseRail(page);
  await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('#lane > button.lane-cell').count()), 48,
      'S191 premise: the store must render all 48 basal slots');
  }, 'S191 the lane renders on the 24 h rail');
  const analysis = await read(page, '/api/analyze');
  const harm = analysis.basal.find(row => row.label === '03:00')?.evidence?.harm;
  assert.ok(harm?.lows?.length, 'S191 premise: the 03:00 slot must serve its recurring lows');
  await page.locator('#lane > .lane-cell[data-cell="6"]').click();
  await waitForReplayAssertion(async seen => {
    const panel = seen(await page.evaluate(readSlotPanel));
    assert.ok(panel?.time?.startsWith('03:00'), `S191 premise: the 03:00 slot's panel must open; it shows ${panel?.time}`);
  }, 'S191 the 03:00 panel opens');
  return harm;
}

const lowsCountLine466 = harm => {
  const nights = n => `${n} night${n === 1 ? '' : 's'}`;
  return `Overnight lows on ${nights(harm.recurrence_nights)} counted since this rate was set, across the `
    + `whole night, not this half hour alone. A step down needs lows on ${nights(harm.recurrence_bar)}.`;
};
const lowRowText466 = low => `${new Date(`${low.t.slice(0, 10)}T00:00:00`)
  .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${low.t.slice(11, 16)} · ${Math.round(low.bg)} mg/dL`;
const readLows466 = page => page.evaluate(() => ({
  count: document.querySelector('#level .low-count')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
  rows: [...document.querySelectorAll('#level .low-row')].map(row => row.textContent.replace(/\s+/g, ' ').trim()),
  occurrences: document.querySelectorAll('#level .low-row.case-occurrence').length,
  // N1: each header name, and how far its right edge sits from the first
  // night row's value it names (0 when it stands in that value's track).
  header: [...document.querySelectorAll('#level .ev-cols > span')].map(cell => {
    const value = document.querySelector(`#level .ev-row.case-occurrence .${cell.className}`);
    const right = box => Math.max(...[...box.children].map(line => line.getBoundingClientRect().right));
    return [cell.title, value ? Math.round(right(cell) - value.getBoundingClientRect().right) : null];
  }),
}));

// #466 leg 1: the spread lower names the lows as its step's owner, prints the
// served count and bar, lists both lows, labels its roster, and its first low
// opens Day on that low's date.
async function recurringLowsLower466(page) {
  const harm = await openSlot0300466(page);
  await waitForReplayAssertion(async seen => {
    const panel = seen(await page.evaluate(readSlotPanel));
    assert.ok(panel.text.includes('The steady nights alone do not establish this step down. It comes from the '
      + 'overnight lows listed below.'), 'S191 the interval sentence must name the overnight lows as the owner');
    assert.ok(!panel.text.includes('not established by it'), 'S191 the panel must not read "not established by it"');
    const lows = seen(await readLows466(page));
    assert.equal(lows.count, lowsCountLine466(harm), 'S191 the count line must print the served count and bar');
    assert.deepEqual(lows.rows, harm.lows.map(lowRowText466), 'S191 each low row must print its served date, time and glucose');
    assert.equal(lows.occurrences, 0, 'S191 a low row must not be a roster occurrence');
    assert.deepEqual(lows.header.map(([name]) => name), ['Delivered U/h', 'Programmed U/h', 'Night mean mg/dL'],
      'S191 the roster must show its header row, its columns in order');
    // A row's own 1 px border may sit between the two edges; N1's drift was tens of pixels.
    assert.ok(lows.header.every(([, offset]) => offset != null && Math.abs(offset) <= 2),
      `S191 each header name's widest line must end at its value's right edge; offsets ${JSON.stringify(lows.header)}`);
  }, 'S191 the spread lower explains its step and lists its lows');
  const iso = harm.lows[0].t.slice(0, 10);
  await page.locator('#level .low-row').first().click();
  await page.locator('.gf-stage-day').waitFor({ timeout: 30000 });
  await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator(`.gf-nav-col[data-pick="${iso}"]`).getAttribute('aria-pressed')), 'true',
      `S191 pressing the first low must open Day on ${iso}`);
  }, 'S191 the first low opens its day');
}

// #466 leg 2: the held within-threshold slot lists its lows under the count
// line and offers nothing to stage.
async function recurringLowsHold466(page) {
  const harm = await openSlot0300466(page);
  await waitForReplayAssertion(async seen => {
    const panel = seen(await page.evaluate(readSlotPanel));
    assert.equal(panel.stage, 0, 'S191 the held slot must offer no Stage change button');
    const lows = seen(await readLows466(page));
    assert.equal(lows.count, lowsCountLine466(harm), 'S191 the held slot must print the count line');
    assert.deepEqual(lows.rows, harm.lows.map(lowRowText466), 'S191 the held slot must list its lows');
  }, 'S191 the held slot lists its lows and stages nothing');
}

// #463 leg 1: Changes' watched Trial prints its Time in range difference at one
// decimal, and no difference or percent cell carries more than one.
async function readColumn463(page, ctx) {
  const roster = await read(page, '/api/verify/trials');
  assert.equal(roster.admission?.active_kind, 'trial', 'S189 premise: the showcase serves a watched Trial');
  const retained = (await read(page, '/api/verify/trials',
    { selected: roster.admission.active_id, assessment: 'retained' })).selected.reassessment.comparison;
  const tir = retained.outcomes.find(row => row.key === 'tir');
  assert.ok(tir && tir.difference !== Number(tir.difference.toFixed(1)),
    `S189 premise: the served Time in range difference keeps a binary tail (${tir?.difference})`);
  await press(page, 'nav.v2-nav [data-destination="changes"]');
  const table = page.locator('.gf-stage-trial [data-table="outcomes"]');
  await table.locator('[data-outcome="tir"]').waitFor({ state: 'visible', timeout: 60000 });
  await capture(page, ctx, 'S189-read', 'showcase');
  await waitForReplayAssertion(async seen => {
    const printed = seen(await table.locator('[data-outcome="tir"] [data-outcome-state] small').innerText()).trim();
    assert.equal(printed, `difference ${Number(tir.difference.toFixed(1))}`,
      'S189 the Time in range row must read its difference at one decimal');
    const cells = seen(await table.innerText());
    assert.doesNotMatch(cells, /difference [+-]?\d+\.\d{2,}|\d+\.\d{2,}%/,
      'S189 no printed difference or percent cell may carry more than one decimal');
  }, 'S189 the Read column');
}

// #463 leg 2: c3-history's finished record, whose ending saved its clock bins,
// draws its paired curve under "as saved at the ending".
async function savedCurve463(page, ctx) {
  await ctx.withCase('c3-history', async fresh => {
    const roster = await read(fresh, '/api/verify/trials');
    const finished = roster.trials.find(trial => (trial.ending || {}).kind);
    assert.ok(finished, 'S189 premise: c3-history serves a finished record');
    await fresh.goto(new URL(`/?to=changes&subject=history&occurrence=${encodeURIComponent(`record:trial:${finished.id}`)}`,
      fresh.url()).href);
    const stage = fresh.locator('.gf-stage-trial');
    await stage.locator('[data-trial-chart]').waitFor({ state: 'visible', timeout: 30000 });
    await capture(fresh, ctx, 'S189-saved-curve', 'c3-history');
    const views = finished.ending.assessment.views || {};
    assert.ok((views.before || {}).clock?.length && (views.after || {}).clock?.length,
      'S189 the finished record\'s saved ending must keep its Before and Trial clock bins');
    await waitForReplayAssertion(async seen => {
      const instrument = seen(await stage.locator('.instruments .instrument').first().innerText()).replace(/\s+/g, ' ');
      assert.ok(instrument.includes('as saved at the ending'), 'S189 the stage must read "as saved at the ending"');
      assert.equal(seen(await stage.locator('[data-trial-chart]').getAttribute('data-figure-state')), 'paired',
        'S189 the finished record\'s stage must draw a paired figure');
      assert.equal(seen(await stage.locator('[data-trial-chart] .gf-chart[role="img"]').count()), 1,
        'S189 the paired figure must carry its chart');
    }, 'S189 the saved curve');
  });
}

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
