// Amendment 1 acceptance: real manufactured records, served by the app.
import assert from 'node:assert/strict';
import { C2_STORIES, waitForCharts } from './c2.replay.mjs';
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
  for (const side of ['before', 'after']) {
    const arm = comparison.readiness[side];
    assert.equal(arm.unit, unit); assert.equal(arm.required, required);
    const node = page.locator(`[data-readiness="${side}"]`);
    assert.equal(await node.getAttribute('data-criterion-met'), String(arm.criterion_met));
    const copy = await node.innerText();
    assert.ok(copy.includes(unit)); assert.ok(copy.includes(String(arm.observed)));
    if (arm.reason) assert.ok(copy.includes(arm.reason));
  }
  return comparison;
}

export const C4_STORIES = {
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
      assert.equal(comparison.availability.state, 'unavailable');
      assert.ok(comparison.availability.reason);
      assert.ok((await fresh.locator('.gf-reading').innerText()).includes(comparison.availability.reason));
      assert.ok(comparison.outcomes.some(row => row.before === 0 && row.after == null),
        'producer must supply observed zero and missing measurement in distinct arms');
      for (const row of comparison.outcomes) {
        const after = await fresh.locator(`[data-outcome="${row.key}"] td:nth-child(3)`).innerText();
        if (row.after == null) assert.match(after, /no |unavailable/i, 'missing outcome cannot render zero');
      }
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
    for (const row of historical) {
      assert.equal(await page.locator(`[data-id="${row.id}"], [data-chart-id="${row.id}"]`).count(), 0,
        'past-setting identity must be absent from roster, selection and chart catalog');
    }
  };
  await absent();
  // This case publishes five Pattern rows, one current basal row and one
  // historical I:C row. The last must enter neither visible nor Watching counts.
  assert.equal((await page.locator('#crumb-meta').innerText()).trim(), '6 findings · 30 days');
  const watching = page.getByRole('button', { name: /Watching/ });
  assert.equal(await watching.count(), 0, 'no historical read may create a Watching disclosure');
  await absent();
  const currentRow = page.locator(`#level .qrow[data-id="${current[0].id}"]`);
  await currentRow.waitFor(); await currentRow.click();
  await page.locator('#lane > button').first().waitFor({ timeout: 30000 });
  assert.equal(await page.locator('#lane > button:not([disabled])').count(), 48, 'current basal evidence remains browsable');
  await press(page, '#explorer-trigger'); await absent();
  for (const row of historical) {
    await page.goto(new URL(`/v2/?to=diagnose&subject=${encodeURIComponent(row.id)}`, page.url()).href);
    await settled(page); await absent();
    assert.equal(await page.locator('#level [data-register="history"]').count(), 0);
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
  const id = await row.getAttribute('data-occurrence-id');
  assert.ok(id, 'the served occurrence must have an identity');
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
const absent = async (page, selector, message) => assert.equal(await page.locator(selector).count(), 0, message);
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
    assert.doesNotMatch(new URL(page.url()).hash, /occurrenceModal/);
    assert.ok(await page.locator('#level .occ-detail').isVisible(), 'R2 in-place selected case remains');
    assert.ok(await page.locator('.occ-foot button:last-child').isEnabled(), 'R2 contextual Day remains');
  },
  async R3(page) {
    process.stdout.write('AMENDED R3 premise — ADR 397 · Connor Griffin · 2026-09-08; coordinator amendment 4 transcribed 2026-09-10: drill the shipped Finding row; cohorts remain served member groups.\n');
    await fullDayDiagnose(page); const before = await clockWindow(page);
    await C2_STORIES.openComparisonCase(page);
    assert.deepEqual(await clockWindow(page), before, 'R3 a Finding drill must not rewrite the clock window');
    assert.ok(await page.locator('#level .case-occurrence').count() > 0, 'R3 drilled findings remain reachable');
  },
  async R4(page) {
    await C2_STORIES.openComparisonCase(page); const before = await clockWindow(page);
    const rows = page.locator('#level .case-occurrence');
    assert.ok(await rows.count() > 1, 'R4 requires multiple served members');
    const first = await selectOccurrence(page, rows.first());
    const second = await selectOccurrence(page, rows.nth(1));
    assert.notEqual(first, second);
    assert.deepEqual(await clockWindow(page), before, 'R4 occurrence selection must not rewrite the clock window');
    assert.ok(await page.getByRole('button', { name: 'Morning', exact: true }).isEnabled(), 'R4 clock window remains independently settable');
  },
  async R5(page) {
    await C2_STORIES.openBasalLane(page);
    assert.ok(await page.locator('#level .case-occurrence').count() > 1, 'R5 needs multiple nights');
    const first = await selectOccurrence(page);
    await page.locator('#level .case-occurrence[aria-pressed="true"]').focus();
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      await page.keyboard.press(key);
      assert.equal(await page.locator('#level .case-occurrence[aria-pressed="true"]').getAttribute('data-occurrence-id'), first,
        'R5 horizontal keys must not step the roster');
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
    assert.ok(!(await glucoseSeries(page)).some(id => /occurrence[- ]?dot/i.test(id)), 'R7 occurrence dots returned');
    await selectOccurrence(page);
    assert.ok(await page.locator('#level .occ-detail').isVisible(), 'R7 occurrences remain reachable from Findings');
  },
  async R8(page) {
    await fullDayDiagnose(page);
    assert.ok(!(await glucoseSeries(page)).some(id => /meal[- ]?(glyph|marker)/i.test(id)), 'R8 meal markers returned');
    const file = await C2_STORIES.comparisonFigure(page, 'finding:carb_undercount');
    assert.equal(file.finding.id, 'finding:carb_undercount', 'R8 requires meal evidence');
    assert.ok(await page.locator('#ec-chart canvas').count() > 0, 'R8 meal comparison remains reachable');
    await page.keyboard.press('Escape');
    await selectOccurrence(page);
    await press(page, '.occ-foot button:last-child');
    await page.locator('.gf-stage-day').waitFor({ timeout: 30000 });
    assert.ok(await page.locator('[aria-label="Episode Log"]').count() > 0, 'R8 the Day log remains reachable');
  },
  async R9(page) {
    await comparisonSelection(page);
    await absent(page, '.occurrence-level, .drill-level, .counter-example-subgroup', 'R9 separate drill level returned');
    assert.ok(await page.locator('.inspector #level .occ-detail').isVisible(), 'R9 selected detail occupies the standing inspector');
  },
  async R10(page) {
    await fullDayDiagnose(page);
    await absent(page, '.ic-lane, [data-lane="ic"]', 'R10 standalone carb-ratio lane returned');
    const row = page.locator('#level .qrow[data-id^="ic:"]').first();
    await row.waitFor({ timeout: 30000 }); const id = await row.getAttribute('data-id'); await row.click();
    await page.locator(`#tile-focal .evidence-tile[data-chart-id="${id}"] canvas`).first().waitFor({ timeout: 30000 });
    assert.ok(await page.locator('#level .numrow').count() > 0, 'R10 carb-ratio case evidence remains');
  },
  async R11(page) {
    await comparisonSelection(page);
    const rows = await page.locator('#level .case-occurrence').allTextContents();
    assert.ok(rows.length > 0, 'R11 evidence rows remain activatable');
    assert.ok(rows.every(text => !/[›»❯]/.test(text)), 'R11 redundant evidence-row chevrons returned');
  },
  async R12(page) {
    await comparisonSelection(page);
    await absent(page, '.lens-inspector, [data-lens]', 'R12 standalone lens inspector returned');
    assert.ok(await page.locator('.inspector #level .occ-detail').isVisible(), 'R12 shared inspector remains');
    assert.ok((await glucoseSeries(page)).includes('That day'), 'R12 selected trace remains on the shipped clock canvas');
    await press(page, '.occ-foot button:last-child');
    await page.locator('.gf-stage-day').waitFor({ timeout: 30000 });
    assert.ok(await page.locator('[data-day="return"]').isVisible(), 'R12 contextual Day route remains');
  },
  async R13(page) {
    await C2_STORIES.comparisonFigure(page);
    await absent(page, '[data-filter="event-charts"], .event-charts-root, [data-control="by-event"]', 'R13 global Event charts / By event controls returned');
    assert.ok(await page.locator('#ec-chart canvas').count() > 0, 'R13 case-file-backed comparison tile remains reachable');
  },
  async R15(page) {
    process.stdout.write('AMENDED R15 premise — ADR 397 · Connor Griffin · 2026-09-08; transcribed 2026-09-10: Diagnose preserves Findings, Spotlight and All Charts.\n');
    await fullDayDiagnose(page);
    await absent(page, '[data-dock-mode], .dock-layout-toggle, .duplicate-tile', 'R15 retired dock mechanics returned');
    await absent(page, '[data-destination="overview"], [data-destination="explore"]', 'R15 retired destinations returned');
    assert.equal(await page.locator('[data-destination="diagnose"]').count(), 1);
    assert.equal(await page.locator('[data-destination="changes"]').count(), 1);
    assert.ok(await page.locator('#level .qrow').count() > 0, 'R15 Findings remain');
    assert.equal(await page.locator('#tile-focal').count(), 1, 'R15 Spotlight remains');
    assert.equal(await page.locator('#explorer-trigger').count(), 1, 'R15 All charts remains');
    await page.getByRole('button', { name: 'All charts', exact: true }).click();
    assert.ok(await page.locator('#tile-row .evidence-tile').count() > 0, 'R15 All charts opens the catalog');
  },
  async R17(page) {
    process.stdout.write('AMENDED R17 premise — ADR 397 · Connor Griffin · 2026-09-08; coordinator amendment 4 transcribed 2026-09-10: a served finishable Trial replaces the prototype ready scenario.\n');
    const roster = await read(page, '/api/verify/trials');
    assert.equal(roster.admission.active_kind, 'trial', 'R17 requires a served active Trial');
    assert.equal(roster.admission.can_finish_trial, true, 'R17 requires a finishable Trial');
    await press(page, '[data-destination="changes"]');
    await page.locator('.gf-stage-trial').waitFor({ timeout: 30000 });
    assert.equal(await page.getByRole('button', { name: 'Keep', exact: true }).count(), 0, 'R17 session-only Keep returned');
    assert.ok(await page.locator('[data-part="plan-route"] [data-action="plan-route"]').isVisible(), 'R17 Revert-to-Plan remains');
    assert.ok(await page.locator('[data-form="finish"] #conclusion').isVisible(), 'R17 conclusion form remains');
    await C3_STORIES.S52(page);
    await page.reload();
    await page.locator('[data-ending-kind="user_finished"]').waitFor({ timeout: 30000 });
    assert.equal(await page.getByRole('button', { name: 'Keep', exact: true }).count(), 0, 'R17 durable finish does not restore Keep');
  },
};
