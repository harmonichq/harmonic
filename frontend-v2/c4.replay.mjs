// Amendment 1 acceptance: real manufactured records, served by the app.
import assert from 'node:assert/strict';
import { C3_STORIES } from './c3.replay.mjs';
import { captureStory } from './capture.mjs';

const read = async (page, path, params = {}) => {
  const url = new URL(path, page.url());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await page.request.get(url.href, { timeout: 30000 });
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
  const detail = (await read(page, '/api/verify/trials', { selected: id, assessment: 'retained' })).selected;
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
