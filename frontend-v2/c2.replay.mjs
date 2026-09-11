import { waitForReplayAssertion } from '../frontend/replay-assertions.mjs';
// ADR 397 / coordinator amendment 1: app adaptations use the carried owner's
// controls and production responses. The historical prototype bodies stay in
// their original replay. No fixture projection or chart painter is duplicated.
import assert from 'node:assert/strict';
import { waitForLevelAnimations } from '../frontend/diagnose-workstation-behavior.replay.mjs';

// Bare coordination promises do not inherit Playwright's action deadlines.
export async function boundedWait(promise, description, timeout = 30000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out after ${timeout} ms: ${description}`)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

// Navigation marks aria-current before its served desk exists. Utilities and
// month navigation also publish explicit loading copy while their reads run.
export const waitForDesk = page => page.waitForFunction(() =>
  !document.querySelector('.gf-loading, .gf-nav-loading')
  && document.querySelector('#level')?.dataset.loading !== 'true'
  && ![...document.querySelectorAll('.gf-utility [role="status"]')]
    .some(node => /^Loading\b/.test(node.textContent.trim())), null, { timeout: 30000 });

// #chart mounts before the lazy evidence tiles. Count the complete composition
// on both sides of a teardown, not a cold first canvas against warm tiles.
export async function waitForCharts(page) {
  await page.locator('#chart canvas').first().waitFor({ timeout: 30000 });
  await page.waitForFunction(() => {
    const tiles = [...document.querySelectorAll('#tile-field .evidence-tile')];
    return tiles.length > 0 && tiles.every(tile =>
      !/Loading evidence/.test(tile.querySelector('.tile-state')?.textContent || '')
      && (tile.dataset.state !== 'ok' || tile.querySelector('canvas')));
  }, null, { timeout: 30000 });
}

const check = (condition, message) => assert.ok(condition, message);
const settled = page => page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false');
const read = async (page, path) => {
  const response = await page.request.get(new URL(path, page.url()).href);
  check(response.ok(), `${path}: ${response.status()}`);
  return response.json();
};
const press = async (page, selector) => {
  const control = page.locator(selector).filter({ visible: true }).first();
  await control.waitFor({ state: 'visible' }); await control.click();
};
const go = async (page, destination) => {
  await press(page, `nav.v2-nav [data-destination="${destination}"]`);
  await page.waitForFunction(id => document.querySelector('nav.v2-nav [aria-current="page"]')?.dataset.destination === id, destination);
  if (destination === 'diagnose') await settled(page);
  if (destination === 'changes') await page.locator('.gf-loading').waitFor({ state: 'hidden' });
};
const held = page => page.locator('#level .case-occurrence[aria-pressed="true"]').getAttribute('data-occurrence-id');
const responseFor = (page, path, predicate = () => true) => page.waitForResponse(response =>
  new URL(response.url()).pathname === path && predicate(response), { timeout: 30000 });
// Route callbacks only capture requests. Their waits and fulfill failures must
// belong to the story's await chain, not Playwright's detached route dispatch.
async function holdResponses(page, pattern) {
  const held = new Set();
  let arrive; const arrived = new Promise(resolve => { arrive = resolve; });
  const handler = route => { held.add(route); arrive(route); };
  await page.route(pattern, handler);
  const release = response => boundedWait(Promise.all([...held].map(async route => {
    await route.fulfill(response); held.delete(route);
  })), `release held response ${pattern}`);
  return {
    wait: description => boundedWait(arrived, description),
    release,
    close: async response => { await page.unroute(pattern, handler); await release(response); },
  };
}
const casePath = '/api/diagnose/finding-case-file';
const prepPath = '/api/diagnose/finding-case-file-preparation';
const choose = async (page, row) => {
  const id = await row.getAttribute('data-occurrence-id');
  await row.click();
  await page.waitForFunction(id => document.querySelector(`.case-occurrence[data-occurrence-id="${CSS.escape(id)}"]`)?.getAttribute('aria-pressed') === 'true', id);
  return id;
};
// A click's focus event may precede the awaited response and the next paint.
// Observe that exact outcome before pressing; keep it across later repaints.
// No polling window, synthetic focus, or fallback target can satisfy the proof.
export async function clickAndObserveFocus(page, control, selector) {
  const observation = await page.evaluateHandle(selector => {
    const state = { seen: false, active: false };
    const listener = event => {
      if (!event.target.matches(selector)) return;
      state.seen = true;
      state.active = document.activeElement === event.target;
    };
    document.addEventListener('focusin', listener, true);
    return { state, listener };
  }, selector);
  try {
    await control.click();
    await page.waitForFunction(observation => observation.state.seen && observation.state.active, observation, { timeout: 30000 });
    return await observation.evaluate(observation => observation.state.active);
  } finally {
    await observation.evaluate(observation => document.removeEventListener('focusin', observation.listener, true));
    await observation.dispose();
  }
}

async function openComparisonCase(page, id = 'finding:over_treated_low', openRow = row => row.click()) {
  await go(page, 'diagnose');
  await page.getByRole('button', { name: '24 h', exact: true }).click(); await settled(page);
  await waitForCharts(page);
  const row = page.locator(`#level .qrow[data-id="${id}"]`);
  await row.waitFor();
  const response = responseFor(page, casePath, r => new URL(r.url()).searchParams.get('finding_id') === id && r.ok());
  const [, file] = await Promise.all([openRow(row), response.then(reply => reply.json())]);
  await page.locator('#level .case-occurrence').first().waitFor();
  check(file.projection.alignment === 'event', 'the production case owns event alignment');
  return file;
}
async function openBasalLane(page) {
  await go(page, 'diagnose');
  await page.getByRole('button', { name: '24 h', exact: true }).click(); await settled(page);
  const { row } = await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('#lane > button.lane-cell').count()), 48);
    // This recipe's public projection supplies the slot; never use the current
    // top-ranked concern as the identity of a retained evidence entry.
    const preparation = seen(await read(page, prepPath));
    const row = preparation.rendered_rows.find(row => row.id?.startsWith('basal:'));
    check(row, 'generated basal case publishes a basal Finding');
    return { row };
  }, "openBasalLane");
  await page.locator(`#level .qrow[data-id="${row.id}"]`).click();
  await page.locator('#level .case-occurrence').first().waitFor();
  return row;
}
async function stageIntoPlan(page) {
  await go(page, 'changes');
  await press(page, '[data-set="stage"]');
  await press(page, '[data-set="open-plan"]');
  await page.locator('.gf-plan').waitFor();
}
async function initialFailure(page) {
  await page.route('**/api/analyze*', route => route.fulfill({ status: 503, json: { detail: 'Synthetic evidence failure' } }));
  await page.reload();
  await page.getByText('Evidence unavailable', { exact: true }).waitFor();
  await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('[data-action="retry"]').count()), 1);
    assert.equal(seen(await page.getByText('No priority needs action', { exact: true }).count()), 0);
  }, "initialFailure");
}
async function retryEvidence(page) {
  await initialFailure(page);
  await page.unroute('**/api/analyze*');
  await press(page, '[data-action="retry"]'); await settled(page);
  await waitForReplayAssertion(async seen => {
    check(seen(await page.locator('#level .qrow').count()) > 0, 'successful evidence reread restores the served roster');
    assert.equal(seen(await page.getByText('Evidence unavailable', { exact: true }).count()), 0);
  }, "retryEvidence");
}
async function failedCurrentRead(page) {
  await go(page, 'diagnose');
  await page.route('**/api/analyze*', route => route.fulfill({ status: 503, json: { detail: 'Synthetic replacement failure' } }));
  await press(page, 'nav.v2-nav [data-destination="diagnose"]');
  await page.getByText('Current read failed', { exact: true }).waitFor();
  await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('#level .qrow').count()), 0, 'a failed current read does not expose a stale roster');
  }, "failedCurrentRead");
  await press(page, '[data-action="retry"]');
  // The failed frame can paint before its Retry control receives focus.
  await page.waitForFunction(() => {
    const retry = document.querySelector('[data-action="retry"]');
    return retry && retry === document.activeElement
      && document.body.textContent.includes('Current read failed');
  }, null, { timeout: 30000 }).catch(async error => {
    const seen = await page.evaluate(() => ({
      focus: document.activeElement?.outerHTML,
      text: document.querySelector('.gf-reading')?.textContent,
    }));
    throw new Error(`S20b timed out waiting for the failed-read text and focus on Retry; saw ${JSON.stringify(seen)}`, { cause: error });
  });
  await page.unroute('**/api/analyze*');
  await press(page, '[data-action="retry"]'); await settled(page);
  await page.locator('#level .qrow').first().waitFor({ timeout: 30000 }); // the retried read paints its rows before the count is judged
  await waitForReplayAssertion(async seen => {
    check(seen(await page.locator('#level .qrow').count()) > 0, 'S20b the retried read renders the roster');
  }, "failedCurrentRead");
}
async function selectedMember(page) {
  const file = await openComparisonCase(page);
  const id = await choose(page, page.locator('#level .case-occurrence').first());
  await page.locator('#level .occ-detail').waitFor();
  return { file, id };
}
async function comparisonFigure(page, id) {
  const file = await openComparisonCase(page, id);
  const tile = page.locator(`#tile-field .evidence-tile[data-chart-id="${file.finding.id}"]`);
  if (!await tile.locator('.tile-fullscreen').isVisible()) {
    await page.getByRole('button', { name: 'All charts', exact: true }).click();
    await page.locator(`#tile-row .evidence-tile[data-chart-id="${file.finding.id}"]`).click();
  }
  await page.locator('#tile-focal .tile-fullscreen').click();
  await page.locator('#ec-chart canvas').first().waitFor();
  return file;
}
const chartOption = page => page.evaluate(() => {
  const node = document.querySelector('#ec-chart');
  const chart = node && window.echarts.getInstanceByDom(node);
  if (!chart) throw new Error('shared comparison did not mount');
  const option = chart.getOption();
  return { series: option.series.map(({ id, data }) => ({ id, data })), yAxis: option.yAxis, xAxis: option.xAxis };
});

async function retryPlanWrite(page, method, path) {
  // Retry clears its error before refreshing and writing. Its disappearance
  // cannot establish that the durable write has finished.
  const [response] = await Promise.all([
    responseFor(page, path, response => response.request().method() === method),
    press(page, '[data-set="retry-save"]'),
  ]);
  check(response.ok(), `${method} ${path} retry failed`);
}

async function planFailure(page, ctx, kind) {
  await stageIntoPlan(page);
  const before = await read(page, '/api/plan/history');
  const path = kind === 'draft' ? '/api/plan' : '/api/plan/apply';
  ctx.failNext(kind === 'draft' ? 'PUT' : 'POST', path);
  await press(page, `[data-set="${kind === 'draft' ? 'save-draft' : 'record'}"]`);
  await page.locator('[data-set="retry-save"]').waitFor();
  await waitForReplayAssertion(async seen => {
    check(/failed/i.test(seen(await page.locator('.gf-desk').innerText())), 'failed write must be visible');
    assert.deepEqual((seen(await read(page, '/api/plan/history'))).history, before.history, 'failed save creates no decision');
    if (kind === 'draft') assert.equal((seen(await read(page, '/api/plan'))).items.length, 0);
    assert.equal(seen(await page.locator('[data-set="retry-save"]').evaluate(node => node === document.activeElement)), true);
  }, "planFailure");
  await retryPlanWrite(page, kind === 'draft' ? 'PUT' : 'POST', path);
  await page.locator('[data-set="retry-save"]').waitFor({ state: 'hidden' });
  await waitForReplayAssertion(async seen => {
    if (kind === 'draft') check((seen(await read(page, '/api/plan'))).items.length > 0, 'retry saves the draft');
    else check((seen(await read(page, '/api/plan/history'))).history.length > before.history.length, 'retry records the decision');
  }, 'Plan retry persistence');
}
async function planPersistence(page, ctx) {
  await planFailure(page, ctx, 'draft');
  const draft = await read(page, '/api/plan');
  await page.reload(); await page.locator('.gf-plan').waitFor();
  await waitForReplayAssertion(async seen => {
    assert.deepEqual((seen(await read(page, '/api/plan'))).items, draft.items);
  }, 'Plan reloaded draft');
  const history = await read(page, '/api/plan/history');
  ctx.failNext('POST', '/api/plan/apply');
  await press(page, '[data-set="record"]'); await page.locator('[data-set="retry-save"]').waitFor();
  await waitForReplayAssertion(async seen => {
    assert.deepEqual((seen(await read(page, '/api/plan/history'))).history, history.history, 'failed decision is not saved');
  }, 'Plan failed decision history');
  await retryPlanWrite(page, 'POST', '/api/plan/apply');
  await page.locator('[data-set="withdraw"]').waitFor();
  const saved = await waitForReplayAssertion(async seen => {
    const saved = (seen(await read(page, '/api/plan/history'))).history.at(-1);
    check(saved.applied_at, 'saved decision has its durable time');
    check(saved.deliverable, 'saved decision retains its deliverable');
    return saved;
  }, 'Plan durable decision');
  await page.reload(); await page.locator('[data-set="withdraw"]').waitFor();
  await waitForReplayAssertion(async seen => {
    const pump = seen(await read(page, '/api/pump-settings'));
    const text = seen(await page.locator('.gf-desk').innerText());
    check(/Pending|waiting/i.test(text), 'recording before the next pump capture is pending reconciliation');
    check(!/On pump\s+202/.test(text), 'a recorded decision is not a pump observation');
    check(pump.profile, 'reconciliation consumes the detected profile');
  }, "planPersistence");
  ctx.failNext('POST', '/api/plan/history/withdraw');
  await press(page, '[data-set="withdraw"]'); await page.locator('[data-set="retry-save"]').waitFor();
  await waitForReplayAssertion(async seen => {
    assert.deepEqual((seen(await read(page, '/api/plan/history'))).history.at(-1).withdrawal, saved.withdrawal);
  }, 'Plan failed withdrawal history');
  await retryPlanWrite(page, 'POST', '/api/plan/history/withdraw');
  await page.locator('[data-set="retry-save"]').waitFor({ state: 'hidden' });
  await page.reload();
  await waitForReplayAssertion(async seen => {
    const withdrawn = (seen(await read(page, '/api/plan/history'))).history.find(row => row.applied_at === saved.applied_at);
    check(withdrawn.withdrawal?.state === 'available', 'withdrawal survives reload');
    assert.deepEqual(withdrawn.deliverable, saved.deliverable, 'withdrawal does not rewrite the retained schedule');
  }, 'Plan reloaded withdrawal');
}

async function projectionReplacement(page) {
  await openBasalLane(page);
  await waitForReplayAssertion(async seen => {
    check(seen(await page.locator('#level .stagebtn').count()) > 0, 'old projection has an advisory control to withdraw');
  }, "projectionReplacement");
  const pending = await holdResponses(page, '**/api/diagnose/finding-case-file-preparation*');
  const failure = { status: 503, json: { detail: 'Synthetic scoped failure' } };
  try {
    await page.getByRole('button', { name: 'Evening', exact: true }).click(); await pending.wait('S97 scoped preparation request');
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('#level').getAttribute('data-loading')), 'true');
      assert.equal(seen(await page.locator('#level .qrow, #level .stagebtn, #level .numrow, #level .case-occurrence').count()), 0);
      check(/Loading findings/.test(seen(await page.locator('#level').innerText())));
      check(!/\d+ (findings|nights|meals)/.test(seen(await page.locator('#crumb-meta').innerText())), 'pending meta is count-free');
    }, "projectionReplacement");
    await pending.release(failure);
    await page.getByText(/Findings unavailable for/).waitFor();
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('#level .qrow, #level .stagebtn, #level .numrow, #level .case-occurrence').count()), 0);
    }, "projectionReplacement");
  } finally { await pending.close(failure); }
  const response = responseFor(page, prepPath, r => r.ok());
  await page.getByRole('button', { name: 'Overnight', exact: true }).click();
  const served = await (await response).json(); await settled(page);
  await page.locator('#crumb-trail button').first().click();
  // Expand the shared owner's collapsed rows before comparing identities.
  const more = page.getByRole('button', { name: /Watching/ });
  if (await more.count()) await more.first().click();
  await waitForReplayAssertion(async seen => {
    const ids = seen(await page.locator('#level .qrow').evaluateAll(rows => rows.map(row => row.dataset.id)));
    check(ids.length > 0, 'the recovered slice retains its own matching basal Finding');
    check(ids.every(id => served.rendered_rows.some(row => row.id === id)), 'the slice paints only its served rows');
    check(served.window?.scoped || served.findings?.window?.scoped, 'recovery is a scoped producer result');
  }, "projectionReplacement");
}

async function icReplacement(page) {
  await go(page, 'diagnose');
  await page.getByRole('button', { name: '24 h', exact: true }).click(); await settled(page);
  const row = page.locator('#level .qrow[data-id^="ic:"]').first();
  await row.waitFor(); const id = await row.getAttribute('data-id'); await row.click();
  await page.locator(`#tile-focal .evidence-tile[data-chart-id="${id}"] canvas`).first().waitFor();
  const { before, subject } = await waitForReplayAssertion(async seen => {
    const before = seen(await page.locator('#level').innerText());
    const subject = seen(await page.locator('#crumb-trail .here').innerText());
    const coherent = seen(await page.evaluate(id => {
      const tile = document.querySelector(`.evidence-tile[data-chart-id="${CSS.escape(id)}"]`);
      const host = tile?.querySelector('.tile-chart');
      const chart = host && window.echarts.getInstanceByDom(host);
      return { values: [...document.querySelectorAll('#level .numrow b')].map(n => n.textContent),
        series: chart?.getOption().series?.map(({ id, data }) => ({ id, data })) || null };
    }, id));
    check(coherent.series && coherent.values.length, 'the current I:C case and canvas are both populated');
    return { before, subject };
  }, "icReplacement");
  const staging = () => page.locator('#level .stagebtn').evaluateAll(buttons => buttons.map(button => ({
    text: button.textContent, staged: button.dataset.staged,
  })));
  const originalStaging = await staging();
  // Shipped S106 + withGeneratedCarbRatioRecovery: keep/drill the same tile,
  // then adopt an Afternoon preparation with a changed generation. A preset
  // alone reuses I:C evidence when its descriptor coordinates are unchanged.
  await page.getByRole('button', { name: 'All charts', exact: true }).click();
  await page.locator(`.evidence-tile[data-chart-id="${id}"] .tile-pin`).click();
  await page.locator(`.evidence-tile[data-chart-id="${id}"] .tile-body`).click();
  const scoped = await holdResponses(page, '**/api/diagnose/finding-case-file-preparation*');
  const replacement = await holdResponses(page, '**/api/diagnose/findings*');
  const failure = { status: 503, json: { detail: 'Synthetic replacement failed' } };
  let staleSent = false;
  await page.route('**/api/diagnose/carb-ratio-block-evidence*', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('block_id') !== id.slice('ic:'.length) || staleSent) return route.fallback();
    staleSent = true;
    return route.fulfill({ status: 409, json: { detail: {
      code: 'analysis_generation_mismatch', message: 'Evidence changed. Refresh findings.',
    } } });
  });
  try {
    await page.getByRole('button', { name: 'Afternoon', exact: true }).click();
    const request = await scoped.wait('S98 Afternoon preparation request');
    const response = await boundedWait(request.fetch({ timeout: 30000 }), 'S98 served Afternoon preparation');
    check(response.ok(), `S98 Afternoon preparation: ${response.status()}`);
    const preparation = await boundedWait(response.json(), 'S98 Afternoon preparation body');
    const servedRow = preparation.rendered_rows.find(row => row.id === id);
    check(servedRow, 'the served scope retains the same I:C identity');
    check(preparation.findings.window?.scoped && typeof preparation.findings.analysis_generation === 'string',
      'S106 generation perturbation requires a served scoped generation');
    // The S106 fixture adapter changes only this token. Keep all actual rows,
    // coordinates, counts and verdicts from the synthetic server unchanged.
    preparation.findings.analysis_generation += ':scoped';
    await scoped.release({ response, json: preparation });
    await replacement.wait('S98 findings recovery after scoped generation and selected I:C 409');
    check(staleSent, 'the selected block actually returned the one-shot I:C 409');
    await page.getByRole('button', { name: 'All charts', exact: true }).click();
    await page.getByText('Evidence changed. Refresh findings.', { exact: true }).first().waitFor();
    await waitForReplayAssertion(async seen => {
      check(seen(await page.locator(`#tile-field .evidence-tile[data-chart-id="${id}"]`).count()) === 1, 'stale state keeps the exact current I:C identity');
    }, "icReplacement");
    await replacement.release(failure);
    await waitForReplayAssertion(async seen => {
      check((seen(await page.locator('#level').innerText())).length > 0, 'failed replacement names its state');
      // ADR 397 / coordinator amendment 11: the shipped stale state retains the
      // subject but replaces its canvas, preventing evidence-generation mixing.
      check(/current/i.test(before), 'the source was a current-setting case'); // innerText carries the label's text-transform
      const tile = `#tile-field .evidence-tile[data-chart-id="${id}"]`;
      assert.equal(seen(await page.locator(tile).count()), 1, 'failed replacement retains the exact I:C tile identity');
      assert.equal(seen(await page.locator('#crumb-trail .here').innerText()), subject,
        'failed replacement retains the selected subject rather than choosing another I:C block');
      // Amendment 12: _ic_rows publishes asserts_move as the row's register.
      // A tile failure does not change that verdict; S89 proves stale-write 409.
      assert.equal(seen(await page.locator('#level .stagebtn').count()), servedRow.register === 'assert' ? 1 : 0,
        'staging follows the backend verdict on the served I:C row');
      assert.deepEqual(seen(await staging()), originalStaging, 'failed tile replacement adds or substitutes no staging control');
      assert.equal(seen(await page.locator(tile).getAttribute('data-state')), 'stale-generation');
      check((seen(await page.locator(`${tile} .tile-state`).innerText())).includes('Evidence changed. Refresh findings.'),
        'the retained tile presents the served stale wording');
      assert.equal(seen(await page.locator(`${tile} canvas`).count()), 0,
        'the named stale state replaces the old canvas');
    }, "icReplacement");
  } finally {
    await page.unroute('**/api/diagnose/carb-ratio-block-evidence*');
    await scoped.close(failure); await replacement.close(failure);
  }
}

async function permittedActions(page) {
  const guidance = await read(page, '/api/guidance');
  await go(page, 'changes');
  const { selected } = await waitForReplayAssertion(async seen => {
    const selected = guidance.selected;
    const eligible = Array.isArray(selected?.action) && selected.action.length > 0;
    assert.equal(seen(await page.locator('[data-set="stage"]').count()), eligible ? 1 : 0,
      'Changes exposes only the backend-selected setting action');
    if (guidance.disposition === 'unavailable') {
      check(guidance.reasons, 'unavailable has a served reason');
      check(/No action from this read/.test(seen(await page.locator('.gf-stage[aria-label="Changes"]').innerText())));
    }
    return { selected };
  }, "permittedActions");
  await go(page, 'diagnose');
  await page.getByRole('button', { name: '24 h', exact: true }).click(); await settled(page);
  const lane = page.locator('#lane > button').first(); await lane.click();
  await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('#level .stagebtn').count()), 0, 'manufactured thin evidence offers no stage action');
    check(/nothing to stage|no direction asserted/i.test(seen(await page.locator('#level').innerText())));
  }, "permittedActions");
  // Named transport perturbation of the already-probed unavailable envelope:
  // this tests rendering of a served refusal, not a new clinical policy.
  await page.route('**/api/guidance', route => route.fulfill({ status: 200, json: {
    ...guidance, selected: null, disposition: 'unavailable', unavailable: 'reconciliation_required',
  } }));
  await page.goto(new URL('/v2/?to=changes', page.url()).href);
  await page.getByText('No action from this read', { exact: true }).waitFor();
  await waitForReplayAssertion(async seen => {
    check(/reconcil/i.test(seen(await page.locator('.gf-stage[aria-label="Changes"]').innerText())), 'the unavailable reason remains visible');
    assert.equal(seen(await page.locator('[data-set="stage"], [data-action="aside"]').count()), 0);
  }, "permittedActions");
  await page.unroute('**/api/guidance');
}

async function cleanup(page, ctx, pagehide = false) {
  await go(page, 'diagnose');
  await waitForCharts(page);
  const counts = () => page.locator('[data-v2-diagnose] canvas').count();
  const before = await counts(); const errors = ctx.consoleErrors.length;
  if (pagehide) {
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.locator('[data-v2-diagnose]').waitFor({ state: 'detached', timeout: 30000 }).catch(async error => {
      const mounted = await page.locator('[data-v2-diagnose]').count();
      throw new Error(`S84 timed out waiting for pagehide teardown; saw ${mounted} mounted view(s)`, { cause: error });
    });
  } else {
    for (let i = 0; i < 3; i += 1) {
      await go(page, 'changes'); await waitForReplayAssertion(async seen => {
        assert.equal(seen(await page.locator('[data-v2-diagnose]').count()), 0);
      }, "cleanup");
      await go(page, 'diagnose');
      await waitForCharts(page);
      await press(page, '[data-utility="guide"]'); await waitForDesk(page);
      await press(page, '[data-utility-close]'); await waitForCharts(page);
      await waitForReplayAssertion(async seen => {
        assert.equal(seen(await page.locator('[data-v2-diagnose]').count()), 1);
        assert.equal(seen(await page.locator('.gf-utility').count()), 0);
      }, "cleanup");
    }
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await counts()), before, 'repeated entry does not accumulate mounted canvases');
    }, "cleanup");
  }
  assert.deepEqual(ctx.consoleErrors.slice(errors), [], 'shipped cleanup emits no browser error');
}

export const C2_STORIES = {
  openBasalLane, openComparisonCase, comparisonFigure, stageIntoPlan,
  S6: async page => {
    await waitForReplayAssertion(async seen => {
      const overflow = seen(await page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight })));
      check(overflow.x <= 1 && overflow.y <= 1, `root overflow ${JSON.stringify(overflow)}`);
      check(seen(await page.locator('#level').count()), 'the shipped reading pane owns scrolling');
    }, "S6");
  },
  S7: async page => {
    await go(page, 'diagnose');
    await waitForReplayAssertion(async seen => {
      const inspector = seen(await page.locator('.inspector').boundingBox());
      const canvas = seen(await page.locator('.canvas-pane').boundingBox());
      assert.equal(Math.round(inspector.width), 430, 'Diagnose keeps the carried rail width');
      check(canvas.width > inspector.width);
      const roster = seen(await read(page, '/api/verify/trials'));
      assert.equal(roster.admission?.active_kind, 'trial', 'S7 requires a change underway');
    }, "S7");
    await go(page, 'changes');
    await page.locator('.gf-desk > .gf-stage-trial').waitFor({ state: 'visible', timeout: 30000 });
    await waitForReplayAssertion(async seen => {
      const reading = seen(await page.locator('.gf-desk > .gf-reading').boundingBox());
      const stage = seen(await page.locator('.gf-desk > .gf-stage').boundingBox());
      assert.equal(Math.round(reading.width), 300, 'paired Changes keeps the desk reading-pane width');
      check(stage.width > reading.width);
    }, "S7");
  },
  S9: async page => {
    await go(page, 'changes');
    await waitForReplayAssertion(async seen => {
      const type = seen(await boundedWait(page.locator('.gf-title').first().evaluate(async node => {
        const face = getComputedStyle(node);
        await document.fonts.load(`${face.fontWeight} ${face.fontSize} ${face.fontFamily}`, node.textContent);
        await document.fonts.ready; const css = getComputedStyle(node);
        return { family: css.fontFamily, size: parseFloat(css.fontSize), weight: css.fontWeight,
          loaded: [...document.fonts].some(face => face.family.replace(/['"]/g, '') === 'Inter' && face.status === 'loaded') };
      }), 'S9 document fonts ready'));
      check(type.family.includes('Inter') && type.loaded); check(Math.abs(type.size - 18.24) < .75); assert.equal(type.weight, '700');
    }, 'S9 rendered heading font');
  },
  S10b: async page => {
    await go(page, 'diagnose'); await waitForReplayAssertion(async seen => {
      check(seen(await page.locator('.inspector').isVisible())); check(seen(await page.locator('.canvas-pane').isVisible()));
      assert.equal(seen(await page.locator('.gf-sheet-toggle:visible, .gf-sheet-close:visible').count()), 0);
    }, "S10b");
  },
  S12: async page => {
    await comparisonFigure(page); const before = await page.locator('#canvas-head').boundingBox();
    await page.locator('#ec-chart').hover(); await waitForReplayAssertion(async seen => {
      const after = seen(await page.locator('#canvas-head').boundingBox());
      check(Math.abs(before.height - after.height) < 1, 'shared hover header reserves its height');
    }, "S12");
  },
  S13: async (page, ctx) => {
    const widths = [];
    for (const [source, caseName] of [['meals', 'behavioral-carb-undercount'], ['setting', 'basal-lower'], ['focus', 'pattern-near-tie'], ['journey', 'showcase']]) {
      const opened = await ctx.open({ source, state: 'investigate', viewport: ctx.viewport, caseName, nestedCase: true });
      try {
        await settled(opened.page);
        widths.push(await waitForReplayAssertion(async seen => {
          const pane = seen(await opened.page.locator('.inspector').boundingBox());
          const width = Math.round(pane.width);
          assert.equal(width, 430, `S13 ${source} retains the reading-pane width`);
          return width;
        }, `S13 ${source} pane width`));
      }
      finally { await opened.context.close(); }
    }
    assert.equal(widths.length, 4); assert.deepEqual([...new Set(widths)], [430]);
  },
  S14: async page => { await go(page, 'changes'); await waitForReplayAssertion(async seen => {
    const g = seen(await read(page, '/api/guidance')); check(g.selected); check((seen(await page.locator('.gf-desk').innerText())).includes(g.selected.title)); check(seen(await page.locator('[data-action="explore"]').count())); assert.equal(seen(await page.locator('.gf-reading .qrow').count()), 0);
  }, "S14"); },
  S15: async page => { await go(page, 'changes'); await press(page, '[data-action="aside"]'); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('#aside-reason').evaluate(n => n === document.activeElement)), true);
  }, "S15"); await page.fill('#aside-reason', 'Synthetic reason'); await press(page, 'form[data-form="aside"] [type="submit"]'); await page.locator('[data-restore]').first().waitFor(); await waitForReplayAssertion(async seen => {
    check((seen(await page.locator('.gf-desk').innerText())).includes('Synthetic reason'));
  }, "S15"); },
  S16: async page => { await go(page, 'changes'); await press(page, '[data-action="aside"]'); await press(page, 'form[data-form="aside"] [type="submit"]'); await page.locator('[data-restore]').first().waitFor(); await press(page, '[data-restore]'); await page.locator('[data-action="aside"]').waitFor(); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('[data-restore]').count()), 0);
  }, "S16"); },
  S17: async page => { await go(page, 'changes'); const before = await read(page, '/api/guidance'); await press(page, '[data-action="aside"]'); await page.fill('#aside-reason', 'cancelled'); await press(page, '[data-action="cancel-aside"]'); await waitForReplayAssertion(async seen => {
    assert.deepEqual(seen(await read(page, '/api/guidance')), before); assert.equal(seen(await page.locator('[data-action="aside"]').evaluate(n => n === document.activeElement)), true);
  }, "S17"); },
  S18: async page => { await go(page, 'changes'); await page.getByText('No priority needs action', { exact: true }).waitFor(); await waitForReplayAssertion(async seen => {
    check(seen(await page.locator('[data-action="day"]').count()));
  }, "S18"); },
  S19: initialFailure, S20: retryEvidence, S20b: failedCurrentRead,
  S21: async page => { const file = await comparisonFigure(page); await waitForReplayAssertion(async seen => {
    const marks = seen(await page.locator('.ec-key-item').evaluateAll(nodes => nodes.map(n => ({ key: n.dataset.cohort, support: n.dataset.support, text: n.textContent, mark: !!n.querySelector('.ec-key-mark') })))); for (const cohort of file.projection.cohorts) { const mark = marks.find(m => m.key === cohort.key); check(mark?.mark && mark.support === cohort.support && mark.text.includes(cohort.name), `served support and shared legend for ${cohort.key}`); }
  }, "S21"); },
  S22: async page => { await openComparisonCase(page); const { rows, cohorts } = await waitForReplayAssertion(async seen => {
    const rows = page.locator('#level .case-occurrence'); const cohorts = seen(await rows.evaluateAll(ns => [...new Set(ns.map(n => n.dataset.comparisonCohort))])); check(cohorts.length > 1);
    return { rows, cohorts };
  }, "S22"); await choose(page, rows.first()); await choose(page, page.locator(`#level .case-occurrence[data-comparison-cohort="${cohorts[1]}"]`).first()); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('#level .case-occurrence[aria-pressed="true"]').count()), 1);
  }, "S22"); },
  S23: async page => { const file = await openComparisonCase(page); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('#level .case-occurrence[aria-pressed="true"]').count()), file.selection.state === 'selected' ? 1 : 0, 'arrival renders the served selection'); if (file.selection.state === 'none') assert.equal(seen(await page.locator('#level .occ-detail').count()), 0);
  }, "S23"); const id = await choose(page, page.locator('#level .case-occurrence').first()); await page.locator('#level .occ-detail').waitFor(); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await held(page)), id);
  }, "S23"); },
  S24: async page => {
    const file = await openComparisonCase(page);
    const cohort = file.projection.cohorts.find(cohort => cohort.occurrence_ids.length > 1);
    check(cohort, 'S24 requires two occurrences in one served cohort');
    const [first, second] = cohort.occurrence_ids;
    // Display order need not equal the source's traversal order. The shared
    // handler steps within the selected cohort's served occurrence_ids.
    const row = page.locator(`#level .case-occurrence[data-occurrence-id="${first}"]`);
    if (!await row.count()) await page.locator('#level .more').first().click();
    await choose(page, row);
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(id => document.querySelector('#level .case-occurrence[aria-pressed="true"]')?.dataset.occurrenceId === id, second);
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(id => document.querySelector('#level .case-occurrence[aria-pressed="true"]')?.dataset.occurrenceId === id, first);
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('#level .case-occurrence[aria-pressed="true"]').evaluate(n => n === document.activeElement)), true);
    }, "S24");
    await page.keyboard.press('ArrowUp');
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await held(page)), first, 'the shipped cohort traversal stops at its first member');
    }, "S24");
  },
  S25: async page => {
    const { file, id } = await selectedMember(page);
    await waitForReplayAssertion(async seen => {
      const params = new URLSearchParams({ projection_id: file.projection_id, finding_id: file.finding.id, alignment: 'event', occ: id });
      const selected = seen(await read(page, `${casePath}?${params}`));
      const text = seen(await page.locator('#level .case-facts').innerText());
      check(text.includes(`${selected.selection.detail.glucose.length} glucose readings`));
      check(text.includes(`${selected.selection.detail.markers.length} event markers`));
      check((seen(await page.locator('#level .occ-detail').innerText())).includes(file.projection.cohorts.find(c => c.key === selected.selection.detail.comparison_cohort).name));
    }, "S25");
  },
  S26: async page => { await selectedMember(page); await press(page, '.occ-foot button:last-child'); await page.locator('.gf-stage-day').waitFor(); await waitForReplayAssertion(async seen => {
    const url = new URL(seen(page.url())); check(url.searchParams.get('subject')?.startsWith('finding:')); check(url.searchParams.get('occurrence'));
  }, "S26"); await press(page, '[data-day="return"]'); await page.locator('#level .case-occurrence[aria-pressed="true"]').waitFor(); },
  S27: async page => { const file = await comparisonFigure(page); const { before } = await waitForReplayAssertion(async seen => {
    const before = seen(await chartOption(page)); assert.equal(before.xAxis[0].min, file.projection.window_min[0]); assert.equal(before.xAxis[0].max, file.projection.window_min[1]);
    return { before };
  }, "S27"); await page.locator('#ec-chart').focus(); await page.keyboard.press('ArrowRight'); await waitForReplayAssertion(async seen => {
    const after = seen(await chartOption(page)); assert.deepEqual(after.series, before.series, 'cursor/visible inspection changes no served series'); assert.deepEqual(after.yAxis, before.yAxis);
  }, "S27"); },
  S28: cleanup,
  S29: async page => {
    let focused;
    const file = await openComparisonCase(page, 'finding:over_treated_low', async row => {
      focused = await clickAndObserveFocus(page, row, '#level');
    });
    // openComparisonCase has now awaited the case file and rendered roster.
    assert.equal(focused, true, 'S29 opening a case focuses the reading pane');
    const restored = await clickAndObserveFocus(page,
      page.getByRole('button', { name: 'Findings', exact: true }),
      `#level .qrow[data-id="${file.finding.id}"]`);
    assert.equal(restored, true, 'S29 Findings restores the originating row');
    await go(page, 'diagnose'); await waitForReplayAssertion(async seen => {
      check(seen(await page.locator('#level .qrow').count()));
    }, "S29");
  },
  S30: async page => { await openBasalLane(page); await page.getByRole('button', { name: 'Findings', exact: true }).click(); await waitForReplayAssertion(async seen => {
    check(seen(await page.locator('#level .qrow').count()));
  }, "S30"); },
  S31: async page => { await openBasalLane(page); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('#lane > button:not([disabled])').count()), 48);
  }, "S31"); },
  S32: async page => {
    await openBasalLane(page);
    const cells = page.locator('#lane > button');
    const waitForLaneRepaint = async key => {
      // Slot evidence and tile completion both repaint the lane, replacing its
      // buttons after the key handler's immediate selection/focus has landed.
      try {
        await waitForDesk(page);
        await waitForCharts(page);
        // The rail marks its pending night evidence aria-busy
        // (diagnose-workstation.js) and removes that line when the read lands;
        // no settled line carries the attribute, so its absence is the read
        // having landed, with no copied copy a renamed noun could void.
        await page.waitForFunction(() => {
          const level = document.getElementById('level');
          return level && level.dataset.loading !== 'true' && !level.querySelector('[aria-busy="true"]');
        }, null, { timeout: 30000 });
        await waitForLevelAnimations(page);
      } catch (error) {
        const seen = await page.evaluate(() => ({
          loading: document.getElementById('level')?.dataset.loading,
          text: document.getElementById('level')?.textContent,
          animations: document.getElementById('level')?.getAnimations().map(animation => animation.playState),
          tiles: [...document.querySelectorAll('#tile-field .tile-state')].map(node => node.textContent),
          cells: [...document.querySelectorAll('#lane > button')].map(node => ({
            label: node.getAttribute('aria-label'), pressed: node.getAttribute('aria-pressed'), focused: node === document.activeElement,
          })),
        }));
        throw new Error(`S32 timed out waiting for lane repaint before ${key}; saw ${JSON.stringify(seen)}`, { cause: error });
      }
    };
    const assertSelectedEdge = async edge => {
      // The key handler selects and focuses the wrapped-to cell. This bounded
      // assertion proves both before the next key reaches that control.
      await page.waitForFunction(edge => {
        const cells = [...document.querySelectorAll('#lane > button')];
        const cell = edge === 'first' ? cells[0] : cells.at(-1);
        return cell?.getAttribute('aria-pressed') === 'true' && cell === document.activeElement;
      }, edge, { timeout: 30000 }).catch(async error => {
        const seen = await cells.evaluateAll(nodes => nodes.map(node => ({
          cell: node.dataset.cell, pressed: node.getAttribute('aria-pressed'), focused: node === document.activeElement,
        })));
        throw new Error(`S32 timed out waiting for ${edge} cell aria-pressed=true and focus; saw ${JSON.stringify(seen)}`, { cause: error });
      });
    };
    await cells.first().click();
    await waitForLaneRepaint('ArrowLeft');
    await cells.first().press('ArrowLeft');
    await assertSelectedEdge('last');
    await waitForLaneRepaint('ArrowRight');
    // The key goes to the selected cell. The lane repaint keeps focus on it
    // (renderLane restores the focused cell after an evidence repaint), so
    // locator.press's own focus-first is belt and braces; the story's claim is
    // the wrap, asserted below with focus on the moved-to cell.
    await page.locator('#lane > button[aria-pressed="true"]').press('ArrowRight');
    await assertSelectedEdge('first');
  },
  S33: async page => { await openBasalLane(page); const { rows } = await waitForReplayAssertion(async seen => {
    const rows = page.locator('#level .case-occurrence'); check(seen(await rows.count()) > 1);
    return { rows };
  }, "S33"); const id = await choose(page, rows.first()); await page.keyboard.press('ArrowDown'); await page.waitForFunction(id => document.querySelector('.case-occurrence[aria-pressed="true"]')?.dataset.occurrenceId !== id, id); await page.keyboard.press('ArrowUp'); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await held(page)), id);
  }, "S33"); },
  S34: async page => { await openBasalLane(page); const cells = page.locator('#lane > button'); await cells.nth(4).click(); await cells.nth(5).click(); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await cells.nth(5).getAttribute('aria-pressed')), 'true');
  }, "S34"); await cells.nth(4).click(); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await cells.nth(4).getAttribute('aria-pressed')), 'true');
  }, "S34"); },
  S35: async page => { await openBasalLane(page); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('.occ-foot').count()), 0, 'no night is selected on arrival');
  }, "S35"); await choose(page, page.locator('#level .case-occurrence').first()); await waitForReplayAssertion(async seen => {
    check(seen(await page.locator('.occ-foot button:last-child').isEnabled()));
  }, "S35"); await press(page, '.occ-foot button:last-child'); await page.locator('.gf-stage-day').waitFor(); await waitForReplayAssertion(async seen => {
    check(new URL(seen(page.url())).searchParams.get('subject')?.startsWith('basal:'));
  }, "S35"); },
  S37: async page => { await go(page, 'changes'); const g = await read(page, '/api/guidance'); check(g.selected); await press(page, '[data-action="explore"]'); await settled(page); await waitForReplayAssertion(async seen => {
    assert.equal(new URL(seen(page.url())).searchParams.get('subject'), g.selected.subject);
  }, "S37"); await page.getByText(g.selected.title, { exact: false }).first().waitFor(); },
  S37b: async page => { const row = await openBasalLane(page); await waitForReplayAssertion(async seen => {
    check(row.id.startsWith('basal:')); assert.equal(seen(await page.locator('#lane > button').count()), 48); assert.equal(seen(await page.locator('#lane > button[aria-pressed="true"]').count()), 1);
  }, "S37b"); },
  S38: async page => { await go(page, 'changes'); await press(page, '[data-set="stage"]'); await page.locator('[data-set="unstage"]').waitFor(); await waitForReplayAssertion(async seen => {
    check(seen(await page.locator('[data-set="open-plan"]').count()));
  }, "S38"); await press(page, '[data-set="unstage"]'); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('[data-set="stage"]').evaluate(n => n === document.activeElement)), true);
  }, "S38"); },
  S39: async page => { await stageIntoPlan(page); await waitForReplayAssertion(async seen => {
    check(/\d+ of \d+ segments used/.test(seen(await page.locator('.gf-desk').innerText()))); check((seen(await page.locator('.gf-desk').innerText())).includes('Nothing here is sent to your pump.'));
  }, "S39"); },
  S40: (page, ctx) => planFailure(page, ctx, 'draft'), S41: (page, ctx) => planFailure(page, ctx, 'decision'),
  S42: async (page, ctx) => {
    check(ctx.capturePump, 'S42 requires CASE_STORE_DIR for manufactured pump captures');
    await stageIntoPlan(page); await press(page, '[data-set="record"]');
    await page.locator('[data-set="withdraw"]').waitFor();
    await ctx.capturePump('mismatch'); await page.reload();
    await page.locator('[data-set="rekey"]').waitFor();
    await press(page, '[data-set="rekey"]');
    await waitForReplayAssertion(async seen => {
      check(/Re-key the flagged values on your pump/.test(seen(await page.locator('.gf-desk').innerText())));
    }, "S42");
    await ctx.capturePump('match');
    await page.goto(new URL('/v2/?to=changes&subject=plan', page.url()).href);
    await page.getByText(/On pump as of/).waitFor();
    const record = (await read(page, '/api/plan/history')).history.at(-1);
    assert.equal(record.reconciliation.state, 'available', 'the Store, not the browser, observes the match');
  },
  S43: async page => { await openBasalLane(page); await C2_STORIES.S33(page); },
  S44: async page => { await C2_STORIES.S35(page); },
  S61: async page => {
    const { id, file } = await selectedMember(page);
    await press(page, '.occ-foot button:last-child'); await page.locator('.gf-stage-day').waitFor();
    await waitForReplayAssertion(async seen => {
      const query = new URL(seen(page.url())).searchParams;
      assert.equal(query.get('subject'), file.finding.id); assert.equal(query.get('occurrence'), id);
      check(query.get('moment')); check(/opened from/i.test(seen(await page.locator('.gf-desk').innerText())));
    }, "S61");
    await page.locator('[data-day="return"]').waitFor();
  },
  S62: async page => {
    const { id } = await selectedMember(page);
    await press(page, '.occ-foot button:last-child'); await page.locator('.gf-stage-day').waitFor();
    await press(page, '[data-day="return"]');
    await page.waitForFunction(id => document.querySelector('.case-occurrence[aria-pressed="true"]')?.dataset.occurrenceId === id, id);
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('.occ-foot button:last-child').evaluate(node => node === document.activeElement)), true);
    }, "S62");
  },
  S77: async page => {
    await go(page, 'changes'); await press(page, '[data-action="pump"]');
    await page.locator('.gf-utility[data-utility="pump"]').waitFor();
    await page.locator('.gf-utility[data-utility="pump"]').getByRole('heading', { name: /Detected on the pump/ }).waitFor();
    await waitForReplayAssertion(async seen => {
      check(/detected/i.test(seen(await page.locator('.gf-utility[data-utility="pump"]').innerText())), 'loaded Pump settings names its detected schedule');
      assert.equal(seen(await page.locator('footer [data-utility="pump"]').count()), 0);
    }, "S77");
  },
  S78: async page => { await go(page, 'changes'); await press(page, '[data-utility="guide"]'); await page.keyboard.press('Escape'); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('.gf-utility').count()), 0);
  }, "S78"); await press(page, '[data-action="aside"]'); await page.locator('#aside-reason').evaluate(n => n.blur()); await page.keyboard.press('Escape'); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.locator('form[data-form="aside"]').count()), 0);
  }, "S78"); },
  S79: async page => { await go(page, 'changes'); await press(page, '[data-action="aside"]'); await page.fill('#aside-reason', 'half-written'); await page.keyboard.press('Escape'); await waitForReplayAssertion(async seen => {
    assert.equal(seen(await page.inputValue('#aside-reason')), 'half-written');
  }, "S79"); },
  S81: async page => {
    await openBasalLane(page);
    const more = page.locator('#level .more').first();
    if (await more.count()) await more.click();
    const { rows } = await waitForReplayAssertion(async seen => {
      const rows = page.locator('#level .case-occurrence');
      check(seen(await rows.count()) > 5, 'the generated night roster has a below-fold member');
      return { rows };
    }, "S81");
    const row = rows.last();
    await row.scrollIntoViewIfNeeded();
    const { before } = await waitForReplayAssertion(async seen => {
      const before = seen(await page.locator('#level').evaluate(n => n.scrollTop));
      check(before > 0, 'the selected night is reached by scrolling the reading pane');
      return { before };
    }, "S81");
    await choose(page, row);
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('#level').evaluate(n => n.scrollTop)), before, 'same-subject night selection retains reading scroll');
    }, "S81");
    await go(page, 'changes'); await go(page, 'diagnose');
    await waitForReplayAssertion(async seen => {
      assert.equal(seen(await page.locator('#level').evaluate(n => n.scrollTop)), 0, 'a new subject arrives at its head');
    }, "S81");
  },
  S82: async page => C2_STORIES.S21(page), S83: cleanup, S84: (page, ctx) => cleanup(page, ctx, true),
  S89: planPersistence, S97: projectionReplacement, S98: icReplacement, S99: permittedActions,
};

// Bound the full exported execution too: page evaluations and caller-owned
// setup/cleanup promises have no Playwright locator timeout of their own.
for (const [id, run] of Object.entries(C2_STORIES)) {
  C2_STORIES[id] = (...args) => boundedWait(run(...args), `${id} story completion`, 180000);
}
