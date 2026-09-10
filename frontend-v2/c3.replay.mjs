// App-only c3 bodies. Every read/write below uses the production API of a fresh
// generator-owned case store. Historical prototype bodies remain unchanged.
import assert from 'node:assert/strict';
import { boundedWait } from './c2.replay.mjs';

export const C3_CASES = Object.freeze({
  ...Object.fromEntries('S36,S45,S45b,S46,S47,S48,S49,S50,S51,S52,S53,S55,S91,S92,S94'.split(',').map(id => [id, 'c3-trial'])),
  S54: 'c3-history', S54b: 'c3-history', S96: 'c3-history',
  S56: 'c3-pin', S56b: 'c3-pin', S57: 'c3-focus', S59: 'c3-focus', S93: 'c3-focus',
  S58: 'c3-preempted', S95: 'c3-preempted',
});
const read = async (page, path, params = {}) => {
  const url = new URL(path, page.url());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const r = await page.request.get(url.href, { timeout: 30000 });
  assert.equal(r.status(), 200, `${path}: ${await r.text()}`); return r.json();
};
const press = async (page, selector) => {
  const control = page.locator(selector).filter({ visible: true }).first();
  await control.waitFor({ state: 'visible', timeout: 30000 }); await control.click();
};
const changes = async page => {
  await page.goto(new URL('/v2/?to=changes', page.url()).href);
  await page.locator('.gf-loading').waitFor({ state: 'hidden', timeout: 30000 });
};
async function active(page, kind = 'trial') {
  const roster = await read(page, '/api/verify/trials');
  assert.equal(roster.admission.active_kind, kind, 'case must publish the required active watch');
  const id = roster.admission.active_id;
  const response = await read(page, '/api/verify/trials', { kind, selected: id, assessment: 'retained' });
  await changes(page);
  await page.locator(`.gf-stage-${kind}`).waitFor({ state: 'visible', timeout: 30000 });
  return { id, roster, detail: response.selected, comparison: response.selected.reassessment.comparison };
}
async function record(page, kind, id) {
  await page.goto(new URL(`/v2/?to=changes&subject=history&occurrence=${encodeURIComponent(`record:${kind}:${id}`)}`, page.url()).href);
  await page.locator('[data-record-part="ending"]').waitFor({ timeout: 30000 });
}
async function ending(page) {
  const { id } = await active(page);
  await page.fill('#conclusion', 'Synthetic observation: no clear answer.');
  await press(page, '[data-form="finish"] [type="submit"]');
  await page.locator('[data-ending-kind="user_finished"]').waitFor({ timeout: 30000 });
  const saved = await read(page, '/api/verify/trials', { selected: id });
  assert.equal(saved.selected.original.ending.conclusion, 'Synthetic observation: no clear answer.');
  return { id, saved: saved.selected.original.ending };
}
async function readiness(page, kind = 'trial') {
  const context = await active(page, kind);
  for (const period of ['before', 'after']) {
    const arm = context.comparison.readiness[period];
    const node = page.locator(`[data-readiness="${period}"]`);
    assert.equal(await node.getAttribute('data-criterion-met'), String(arm.criterion_met));
    const copy = await node.innerText();
    assert.ok(copy.includes(arm.unit));
    assert.ok(copy.includes(String(arm.observed)), 'the served count stays readable');
    if (arm.verdict) {
      assert.equal(await node.locator('[data-opportunity-verdict]').getAttribute('data-opportunity-verdict'), arm.verdict);
      assert.ok(copy.includes(`${arm.count} of ${arm.gate}`));
      assert.doesNotMatch(await node.locator('[data-elapsed]').innerText(), /of .*days elapsed/);
    }
    if (arm.reason) assert.ok(copy.includes(arm.reason));
  }
  return context;
}
async function startForm(page, drill = false) {
  const offered = (await read(page, '/api/focus')).pinnable_patterns[0];
  assert.ok(offered, 'case must publish a pinnable Pattern');
  if (drill) {
    await page.goto(new URL('/v2/?to=diagnose', page.url()).href);
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    const source = await read(page, '/api/guidance');
    const candidate = source.candidates.find(row => row.subject === offered.subject);
    const caseId = candidate.collapse === 'collapse_to_member'
      ? candidate.chosen_member.subject.replace(/^habit:/, 'finding:') : offered.subject;
    const row = page.locator(`#level .qrow[data-id="${caseId}"]`);
    await row.waitFor({ timeout: 30000 });
    assert.equal(await page.locator('[data-start-focus]').count(), 0, 'background tile reads cannot offer a selected Focus');
    await row.click();
    await press(page, `[data-start-focus="${offered.subject}"]`);
  } else {
    await changes(page); await press(page, '[data-start-focus]');
  }
  await page.locator('[data-focus="pin"]').waitFor({ timeout: 30000 });
  return offered;
}
async function pin(page, drill = false) {
  const offered = await startForm(page, drill);
  await press(page, '[data-focus="pin"]');
  await page.locator('.gf-stage-focus').waitFor({ timeout: 30000 });
  const roster = await read(page, '/api/focus');
  const saved = roster.focuses.find(row => row.id === roster.admission.active_id);
  assert.equal(saved.pattern_key, offered.key);
  assert.equal(new URL(page.url()).searchParams.get('to'), 'changes');
  assert.equal(await page.locator('[data-focus="retry-pin"]').count(), 0);
  await page.reload(); await page.locator('.gf-stage-focus').waitFor({ timeout: 30000 });
  assert.ok((await page.locator('.gf-stage-focus').innerText()).includes(offered.subject));
}
async function preempted(page) {
  const roster = await read(page, '/api/verify/trials');
  const dropped = roster.focuses.find(row => row.ending?.kind === 'trial_preempted');
  assert.ok(dropped?.pattern_key, 'the manufactured preempted record retains Pattern identity');
  await record(page, 'focus', dropped.id);
  assert.match(await page.locator('[data-record-part="ending"]').innerText(), /preempted|does not resume/i);
  assert.equal(await page.locator('[data-focus="pin"]').count(), 0);
  await page.reload(); await page.locator('[data-ending-kind="trial_preempted"]').waitFor();
  assert.equal((await read(page, '/api/verify/trials')).admission.active_kind, 'trial');
  return roster;
}

async function focusTables(page) {
  const heads = await page.locator('.gf-stage-focus table.gf-trend thead th:first-child').allTextContents();
  assert.equal(heads.length, 2); assert.match(heads[0], /observed behavior/i); assert.match(heads[1], /glucose outcomes/i);
  assert.doesNotMatch(await page.locator('.gf-stage-focus').innerText(), /\bnull\b|\bundefined\b|\bNaN\b/);
}

export const C3_STORIES = {
  // LOCK:harmonic-v2-desktop:14:17 — complete original Trial control to evidence.
  async S36(page) {
    const { detail } = await active(page);
    const slot = detail.changes[0].slot;
    const preparation = await read(page, '/api/diagnose/finding-case-file-preparation');
    const leading = preparation.rendered_rows.find(row => row.id?.startsWith('basal:'));
    assert.ok(leading, 'the case needs a current basal concern');
    const start = Number(slot.slice(0, 2)) * 60 + Number(slot.slice(3, 5));
    assert.notEqual(leading.id.split('-')[0], `basal:${start}`, 'current first-ranked basal concern must differ from the retained Trial slot');
    await press(page, '[data-follow-up-inspect]');
    await page.waitForFunction(slot => document.querySelector('#lane > button[aria-pressed="true"]')?.getAttribute('aria-label')?.startsWith(`${slot} basal slot,`), slot, { timeout: 30000 });
    assert.equal(new URL(page.url()).searchParams.get('to'), 'diagnose');
    assert.equal(new URL(page.url()).searchParams.get('window'), `${start}-${start + 30}`);
    assert.equal(new URL(page.url()).searchParams.get('from'), 'changes');
  },
  async S45(page) {
    const { detail } = await active(page);
    assert.ok((await page.locator('.gf-stage-trial .gf-title').innerText()).includes(detail.changes[0].slot));
    assert.ok(await page.locator('[data-trial-chart] canvas').count() > 0, 'the shipped hero rendered');
  },
  async S45b(page) {
    await active(page); await press(page, '[data-follow-up-inspect]');
    await press(page, '[data-action="watch"]');
    await page.locator('.gf-stage-trial').waitFor();
  },
  async S46(page) {
    await readiness(page);
    const bar = page.locator('progress');
    if (await bar.count()) assert.ok(Number(await bar.getAttribute('value')) <= Number(await bar.getAttribute('max')));
    assert.doesNotMatch(await page.locator('[data-part="maturity"]').innerText(), /15 of 14/);
  },
  async S47(page) {
    await active(page); await press(page, '[data-mode="daily"]');
    assert.equal(await page.locator('[data-mode="daily"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-select="evidence-day"]').waitFor();
    await press(page, '[data-mode="summary"]');
    assert.ok(await page.locator('.gf-stage-trial table').count() > 0);
  },
  async S48(page) {
    await active(page); await press(page, '[data-mode="daily"]');
    await page.selectOption('[data-select="evidence-period"]', 'before_period');
    const options = await page.locator('[data-select="evidence-day"] option').evaluateAll(nodes => nodes.map(node => node.value));
    assert.ok(options.length > 1);
    const prior = await page.locator('.gf-day-read').innerText();
    await page.selectOption('[data-select="evidence-day"]', options[1]);
    assert.notEqual(await page.locator('.gf-day-read').innerText(), prior);
    assert.match(await page.locator('.gf-day-read').innerText(), /not necessarily a complete day/);
  },
  async S49(page) {
    await active(page); await press(page, '[data-mode="daily"]');
    const copy = await page.locator('.gf-day-read').innerText();
    assert.match(copy, /no meals|unavailable|no readings/i);
    assert.doesNotMatch(copy, /\bnull\b|\bundefined\b|\bNaN\b/);
    await press(page, '[data-mode="summary"]');
    const table = await page.locator('.gf-stage-trial table').first().innerText();
    assert.match(table, /before/i); assert.match(table, /trial/i);
  },
  async S50(page) {
    await active(page);
    const copy = await page.locator('[data-trial-chart] .ds-chart-legend').innerText();
    assert.equal(/Trial above Before/i.test(copy) !== /no Trial readings to compare yet/i.test(copy), true);
  },
  async S51(page) {
    await active(page);
    const submit = page.locator('[data-form="finish"] [type="submit"]');
    assert.equal(await submit.isDisabled(), true);
    await page.fill('#conclusion', '   '); assert.equal(await submit.isDisabled(), true);
    await page.fill('#conclusion', 'Synthetic observation'); assert.equal(await submit.isDisabled(), false);
    assert.equal(await page.locator('#conclusion').getAttribute('placeholder'), null);
  },
  async S52(page) { await ending(page); },
  // LOCK:harmonic-v2-desktop:25 — the refusal never reaches the durable owner.
  async S53(page) {
    const { id } = await active(page);
    const path = '**/api/verify/trials/*/finish';
    let failedBody;
    await page.route(path, route => { failedBody = route.request().postDataJSON(); return route.fulfill({ status: 503, json: { detail: 'Synthetic finish refusal' } }); });
    await page.fill('#conclusion', 'Synthetic retained conclusion');
    await press(page, '[data-form="finish"] [type="submit"]');
    await page.locator('[data-retry-save="finish"]').waitFor();
    assert.equal(await page.locator('#conclusion').inputValue(), 'Synthetic retained conclusion');
    assert.equal((await read(page, '/api/verify/trials', { selected: id })).selected.original.ending.kind, undefined);
    await page.unroute(path);
    const request = page.waitForRequest(r => new URL(r.url()).pathname.endsWith('/finish'), { timeout: 30000 });
    await press(page, '[data-retry-save="finish"]');
    assert.equal((await boundedWait(request, 'finish retry')).postDataJSON().request_id, failedBody.request_id);
    await page.locator('[data-ending-kind="user_finished"]').waitFor();
  },
  async S54(page) {
    const roster = await read(page, '/api/verify/trials');
    const saved = roster.trials.find(row => row.ending?.kind === 'user_finished'); assert.ok(saved);
    await record(page, 'trial', saved.id);
    const copy = await page.locator('.gf-reading').innerText();
    for (const text of ['Earlier decision', 'Conclusion', 'Finished', 'Not recorded']) assert.ok(copy.includes(text));
    assert.match(copy, /before/i); assert.match(copy, /trial/i);
  },
  async S54b(page) {
    await changes(page); await press(page, '[data-action="history"]');
    const roster = await read(page, '/api/verify/trials');
    const ended = roster.trials.find(row => row.ending?.kind === 'user_finished'); assert.ok(ended);
    await press(page, `[data-record="trial:${ended.id}"]`);
    await page.locator('[data-record-part="ending"]').waitFor();
    await press(page, '[data-action="overview"]');
    assert.equal(new URL(page.url()).searchParams.get('to'), 'diagnose');
    assert.equal(new URL(page.url()).searchParams.get('subject'), 'setting:basal_rate');
    assert.equal(new URL(page.url()).searchParams.get('window'), '180-210');
  },
  async S55(page) { await active(page); assert.match(await page.locator('.gf-stage-trial .gf-title').innerText(), /Profile change · \d+ settings|·/); },
  async S56(page) { await pin(page); },
  async S56b(page) {
    const offered = await startForm(page, true);
    let first;
    await page.route('**/api/focus', route => route.request().method() === 'POST'
      ? (first = route.request().postDataJSON(), route.fulfill({ status: 503, json: { detail: 'Synthetic pin refusal' } })) : route.continue());
    await press(page, '[data-focus="pin"]'); await page.locator('[data-focus="retry-pin"]').waitFor();
    assert.equal(await page.locator('[data-focus="retry-pin"]').evaluate(el => el === document.activeElement), true);
    assert.equal((await read(page, '/api/focus')).focuses.length, 0);
    await page.unroute('**/api/focus');
    const retry = page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/api/focus', { timeout: 30000 });
    await press(page, '[data-focus="retry-pin"]');
    assert.equal((await boundedWait(retry, 'pin retry')).postDataJSON().request_id, first.request_id);
    await page.locator('.gf-stage-focus').waitFor();
    assert.equal((await read(page, '/api/focus')).focuses[0].pattern_key, offered.key);
  },
  async S57(page) {
    const { id } = await active(page, 'focus');
    await focusTables(page);
    const path = '**/api/focus/*/resolve';
    let failed;
    await page.route(path, route => { failed = route.request().postDataJSON(); return route.fulfill({ status: 503, json: { detail: 'Synthetic resolve refusal' } }); });
    await page.fill('#conclusion', 'Synthetic Focus observation');
    await press(page, '[data-form="finish"] [type="submit"]');
    await page.locator('[data-retry-save="resolve"]').waitFor();
    assert.equal((await read(page, '/api/verify/trials', { kind: 'focus', selected: id })).selected.original.ending.kind, undefined);
    assert.equal(await page.locator('#conclusion').inputValue(), 'Synthetic Focus observation');
    await page.unroute(path);
    const retry = page.waitForRequest(r => new URL(r.url()).pathname.endsWith('/resolve'), { timeout: 30000 });
    await press(page, '[data-retry-save="resolve"]');
    assert.equal((await boundedWait(retry, 'resolve retry')).postDataJSON().request_id, failed.request_id);
    await page.locator('[data-ending-kind="manual"]').waitFor();
    await page.reload(); await page.locator('[data-ending-kind="manual"]').waitFor();
    assert.equal(await page.locator('[data-conclusion]').innerText(), 'Synthetic Focus observation');
  },
  async S58(page) { await preempted(page); },
  async S59(page) {
    await active(page, 'focus'); await focusTables(page);
    assert.equal(await page.locator('[data-focus^="seat-"]:visible').count(), 0);
    assert.equal(await page.locator('.gf-stage-focus table.gf-trend:visible').count(), 2);
  },
  // LOCK:harmonic-v2-desktop:22 — mismatch proves rendering, not a client criterion.
  async S91(page) {
    await readiness(page);
    await page.route('**/api/verify/trials?*', async route => {
      const response = await route.fetch({ timeout: 30000 }); const data = await response.json();
      if (data.selected?.reassessment?.comparison?.readiness) {
        const arm = data.selected.reassessment.comparison.readiness.after;
        arm.observed = arm.required + 9; arm.criterion_met = false; arm.reason = 'Synthetic served hold';
      }
      await route.fulfill({ response, json: data });
    });
    await changes(page); await page.locator('.gf-stage-trial').waitFor();
    assert.equal(await page.locator('[data-readiness="after"]').getAttribute('data-criterion-met'), 'false');
    assert.match(await page.locator('[data-readiness="after"]').innerText(), /Synthetic served hold/);
    assert.equal(await page.locator('[data-form="finish"]').count(), 1, 'finish permission is separate from evidence readiness');
  },
  async S92(page) {
    const { comparison } = await readiness(page);
    assert.ok(Object.values(comparison.readiness).some(arm => !arm.criterion_met));
    assert.ok(await page.locator('[data-trial-chart] canvas').count() > 0);
    await ending(page);
    assert.match(await page.locator('[data-record-part="ending"]').innerText(), /unclear|no clear answer/i);
    assert.ok(await page.locator('[data-trial-chart]').count() > 0);
  },
  // LOCK:harmonic-v2-desktop:24 — a four-day Pattern arm is already ready.
  async S93(page) {
    const { comparison } = await readiness(page, 'focus');
    for (const arm of Object.values(comparison.readiness)) {
      assert.ok(arm.elapsed_days < 14); assert.equal(arm.verdict, 'ready');
      assert.equal(arm.required_elapsed_days, null);
    }
    assert.equal(comparison.assessment.state, 'unclear');
    assert.equal(await page.locator('[data-form="finish"]').count(), 1, 'readiness does not auto-end Focus');
  },
  async S94(page) {
    const { id, saved } = await ending(page);
    await page.reload(); await page.locator('[data-ending-kind="user_finished"]').waitFor();
    assert.deepEqual((await read(page, '/api/verify/trials', { selected: id })).selected.original.ending, saved);
    assert.match(await page.locator('.gf-reading').innerText(), /did not program|entered by hand/i);
  },
  async S95(page) {
    const roster = await preempted(page);
    for (const kind of ['manual', 'lever_unavailable', 'trial_preempted']) {
      const row = roster.focuses.find(row => row.ending?.kind === kind); assert.ok(row, `case must contain ${kind}`);
      await record(page, 'focus', row.id); await page.locator(`[data-ending-kind="${kind}"]`).waitFor();
    }
  },
  // LOCK:harmonic-v2-desktop:28 — the saved ending survives a real later switch.
  async S96(page) {
    const roster = await read(page, '/api/verify/trials');
    const old = roster.trials.find(row => row.ending?.kind === 'user_finished'); assert.ok(old);
    assert.notEqual(roster.admission.active_id, old.id);
    const original = await read(page, '/api/verify/trials', { selected: old.id });
    await record(page, 'trial', old.id);
    for (const mode of ['retained', 'current']) {
      await press(page, `[data-assessment="${mode}"]`);
      await page.locator(`[data-reassessment-context="${mode}"]`).waitFor();
      assert.equal(await page.locator('[data-conclusion]').innerText(), old.ending.conclusion);
      assert.deepEqual((await read(page, '/api/verify/trials', { selected: old.id, assessment: mode })).selected.original.ending, original.selected.original.ending);
    }
    assert.match(await page.locator('[data-record-part="original"]').innerText(), /Not recorded/);
  },
};
