import test from 'node:test';
import assert from 'node:assert/strict';

let handle;
globalThis.fetch = async (url, options = {}) => {
  const result = await handle(url, options);
  return { ok: result.status < 400, status: result.status, statusText: '', json: async () => result.body };
};
const guidance = await import('./guidance.js');
const profile = { segments: [{ start_min: 0, basal_rate: 0.6, isf: 40, carb_ratio: 10, target_bg: 110 }] };
const candidate = { subject: 'setting:basal_rate', kind: 'setting', parameter: 'basal_rate',
  action: [{ start_min: 180, end_min: 210, recommended: 0.48 }] };
const settle = () => new Promise(resolve => setImmediate(resolve));
function host() {
  const buttons = ['save-draft', 'record', 'retry-save', 'withdraw'].map(set => ({ dataset: { set } }));
  return { innerHTML: '', querySelector: () => null,
    querySelectorAll: selector => selector === '[data-set]' ? buttons : [],
    async press(action) {
      assert.ok(this.innerHTML.includes(`data-set="${action}"`), `visible ${action} action required`);
      await buttons.find(button => button.dataset.set === action).onclick();
      await settle();
    } };
}

test('a refused draft stays unsaved; retry saves exactly the held proposal', async () => {
  let draft = { items: [], updated_at: null, input_revision: 8 };
  let refuse = true;
  const writes = [];
  handle = (url, options) => {
    if (url === '/api/guidance') return { status: 200, body: { selected: candidate, candidates: [candidate], disposition: 'eligible_action', analysis_generation: 'synthetic:r8' } };
    if (url === '/api/plan/history') return { status: 200, body: { history: [] } };
    if (url === '/api/pump-settings') return { status: 200, body: { profile, fetched_at: '2024-06-01 00:00:00' } };
    assert.equal(url, '/api/plan');
    if (options.method === 'PUT') {
      writes.push(JSON.parse(options.body));
      if (refuse) return { status: 400, body: { detail: 'Synthetic draft refusal' } };
      draft = { ...draft, ...writes.at(-1), updated_at: '2024-06-02 00:00:00' };
    }
    return { status: 200, body: draft };
  };
  const plan = await import(`./plan-view.js?save=${Date.now()}`);
  await guidance.loadGuidance({ force: true });
  await plan.loadPlanState();
  plan.stage(candidate);
  const surface = host();
  plan.mount(surface);
  await surface.press('save-draft');
  plan.mount(surface);
  assert.equal(plan.phase(), 'Save failed');
  assert.match(surface.innerHTML, /Synthetic draft refusal/);
  assert.doesNotMatch(surface.innerHTML, /Draft saved 2024/);
  assert.equal(draft.items.length, 0);
  refuse = false;
  await surface.press('retry-save');
  plan.mount(surface);
  assert.equal(plan.phase(), 'Draft saved');
  assert.deepEqual(writes[1], writes[0]);
  assert.equal(draft.items[0].value, 0.48);
});

test('a pending decision keeps its captured deliverable when the current draft is empty', async () => {
  const record = { id: '2024-06-02 00:00:00', applied_at: '2024-06-02 00:00:00',
    items: [{ type: 'basal', start_min: 180, value: 0.48 }],
    deliverable: { state: 'available', source_profile: profile },
    decision_context: { state: 'available', subjects: ['setting:basal_rate'] },
    reconciliation: { state: 'unavailable' }, withdrawal: { state: 'unavailable' },
    verdict: { state: 'pending', confirmed_at: null, on_pump: false } };
  handle = url => ({ status: 200, body: url === '/api/guidance'
    ? { disposition: 'pending_plan', selected: null, candidates: [candidate], pending_plan: record }
    : url === '/api/plan/history' ? { history: [record] }
    : url === '/api/pump-settings' ? { profile, fetched_at: '2024-06-01 00:00:00' }
    : { items: [], updated_at: null, input_revision: 9 } });
  const plan = await import(`./plan-view.js?retained=${Date.now()}`);
  await guidance.loadGuidance({ force: true });
  await plan.loadPlanState();
  const surface = host();
  plan.mount(surface);
  assert.match(surface.innerHTML, /0\.48/);
  assert.equal(plan.phase(), 'Pending');
  assert.match(surface.innerHTML, /data-set="withdraw"/);
});

test('a lost decision response retries the same durable request after the reread sees it', async () => {
  let draft = { items: [], updated_at: null, input_revision: 8 };
  let recorded = null;
  const requests = [];
  handle = (url, options) => {
    if (url === '/api/guidance') return { status: 200, body: { selected: recorded ? null : candidate, candidates: [candidate], disposition: recorded ? 'pending_plan' : 'eligible_action', analysis_generation: recorded ? 'synthetic:r9' : 'synthetic:r8' } };
    if (url === '/api/plan/history') return { status: 200, body: { history: recorded ? [recorded] : [] } };
    if (url === '/api/pump-settings') return { status: 200, body: { profile, fetched_at: '2024-06-01 00:00:00' } };
    if (url === '/api/plan/apply') {
      requests.push(JSON.parse(options.body));
      if (requests.length === 1) {
        recorded = { id: 'synthetic-plan', applied_at: '2024-06-02 00:01:00', items: draft.items,
          deliverable: { state: 'available', source_profile: profile }, reconciliation: { state: 'unavailable' }, withdrawal: { state: 'unavailable' },
          verdict: { state: 'pending', confirmed_at: null, on_pump: false } };
        draft = { items: [], updated_at: null, input_revision: 9 };
        throw new TypeError('Synthetic response lost');
      }
      return { status: 200, body: recorded };
    }
    assert.equal(url, '/api/plan');
    if (options.method === 'PUT') draft = { ...draft, ...JSON.parse(options.body), updated_at: '2024-06-02 00:00:00' };
    return { status: 200, body: draft };
  };
  const plan = await import(`./plan-view.js?receipt=${Date.now()}`);
  await guidance.loadGuidance({ force: true });
  await plan.loadPlanState();
  plan.stage(candidate);
  const surface = host();
  plan.mount(surface);
  await surface.press('record');
  plan.mount(surface);
  assert.equal(plan.phase(), 'Save failed');
  await surface.press('retry-save');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(plan.phase(), 'Pending');
});

// #431 — Changes reads the served Plan verdict. Every record below carries the
// verdict the server serves on /api/plan/history; nothing here decides one.
const { stamp } = await import('./frame.js');
// The pump after the Plan is keyed: its one accepted slot at 0.48, the rest as it was.
const held = { segments: [
  { start_min: 0, basal_rate: 0.48, isf: 40, carb_ratio: 10, target_bg: 110 },
  { start_min: 30, basal_rate: 0.6, isf: 40, carb_ratio: 10, target_bg: 110 }] };
function planRecord(appliedAt, verdict) {
  return { id: appliedAt, applied_at: appliedAt,
    items: [{ type: 'basal', start_min: 0, value: 0.48 }],
    deliverable: { state: 'available', source_profile: profile },
    decision_context: { state: 'available', subjects: ['setting:basal_rate'] },
    reconciliation: { state: verdict.state === 'confirmed' ? 'available' : 'unavailable' },
    withdrawal: { state: verdict.state === 'withdrawn' ? 'available' : 'unavailable' },
    verdict: { confirmed_at: null, on_pump: false, ...verdict } };
}
const emptyDraft = { items: [], updated_at: null, input_revision: 9 };
async function servedPlan(name, { history, draft = emptyDraft, pump, route = () => null }) {
  const served = typeof history === 'function' ? history : () => history;
  handle = (url, options) => {
    const open = served().find(row => ['pending', 'mismatch'].includes(row.verdict.state));
    return route(url, options) || { status: 200, body: url === '/api/guidance'
      ? { disposition: open ? 'pending_plan' : 'eligible_action', selected: open ? null : candidate,
        candidates: [candidate], pending_plan: open || null }
      : url === '/api/plan/history' ? { history: served() }
      : url === '/api/pump-settings' ? pump
      : draft };
  };
  const plan = await import(`./plan-view.js?${name}=${Date.now()}`);
  await guidance.loadGuidance({ force: true });
  await plan.loadPlanState();
  const surface = host();
  plan.mount(surface);
  return { plan, surface };
}
const statusOf = html => /<div class="gf-status"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] || '';
const field = (html, label) => new RegExp(`<dt>${label}</dt><dd>([^<]*)</dd>`).exec(html)?.[1] ?? null;

test('a server-pending Plan reads Pending even when the detected profile holds it', async () => {
  // The browser's own comparison would call this a match; only the server confirms.
  const { plan, surface } = await servedPlan('pending-held', {
    history: [planRecord('2024-06-02 00:00:00', { state: 'pending' })],
    pump: { profile: held, fetched_at: '2024-06-03 08:05:00' } });
  assert.equal(plan.phase(), 'Pending');
  assert.match(surface.innerHTML, /class="gf-status" data-state="pending"/);
  assert.doesNotMatch(statusOf(surface.innerHTML), /On pump since|matches your plan/);
  assert.match(surface.innerHTML, /data-set="withdraw"/);
});

test('a pending Plan the latest read holds reads as on the pump awaiting confirmation, with no Withdraw', async () => {
  // Served pending with on_pump true: the store refuses Withdraw on it, because
  // its withdraw lifecycle reconciles first and would confirm it.
  const { plan, surface } = await servedPlan('pending-on-pump', {
    history: [planRecord('2024-06-02 00:00:00', { state: 'pending', on_pump: true })],
    pump: { profile: held, fetched_at: '2024-06-03 08:05:00' } });
  assert.equal(plan.phase(), 'Pending');
  const status = statusOf(surface.innerHTML);
  assert.match(surface.innerHTML, /class="gf-status" data-state="pending"/);
  assert.match(status, /on the pump, awaiting confirmation/);
  assert.doesNotMatch(status, /On pump since|matches your plan|program these/);
  assert.doesNotMatch(surface.innerHTML, /data-set="withdraw"/);
  assert.match(surface.innerHTML, /View change record/);
});

test('a Withdraw the store refuses as no longer pending re-reads the served verdict instead of failing', async () => {
  let confirmed = false;
  const { plan, surface } = await servedPlan('withdraw-refused', {
    history: () => [planRecord('2024-06-02 00:00:00', confirmed
      ? { state: 'confirmed', confirmed_at: '2024-06-03 08:05:00', on_pump: true }
      : { state: 'pending' })],
    pump: { profile: held, fetched_at: '2024-06-03 08:05:00' },
    route: url => {
      if (url !== '/api/plan/history/withdraw') return null;
      confirmed = true;
      return { status: 409, body: { detail: { code: 'nonpending_plan', input_revision: 10 } } };
    } });
  await surface.press('withdraw');
  plan.mount(surface);
  assert.equal(plan.phase(), 'On pump');
  assert.doesNotMatch(surface.innerHTML, /Withdrawing failed|data-set="retry-save"/);
  assert.match(statusOf(surface.innerHTML), new RegExp(`On pump since ${stamp('2024-06-03 08:05:00')}`));
});

test('the On pump time stays on the confirming read after a later read', async () => {
  const { plan, surface } = await servedPlan('confirmed-later-read', {
    history: [planRecord('2024-06-02 00:00:00', { state: 'confirmed', confirmed_at: '2024-06-03 08:05:00', on_pump: true })],
    pump: { profile: held, fetched_at: '2024-06-05 09:40:00' } });
  assert.equal(plan.phase(), 'On pump');
  const status = statusOf(surface.innerHTML);
  assert.match(status, new RegExp(`✓ On pump since ${stamp('2024-06-03 08:05:00')}\\. The pump matches your plan\\.`));
  assert.doesNotMatch(status, new RegExp(stamp('2024-06-05 09:40:00')));
  assert.equal(field(surface.innerHTML, 'On pump'), stamp('2024-06-03 08:05:00'));
});

test('a confirmed Plan the latest read no longer holds reads Confirmed', async () => {
  const { plan, surface } = await servedPlan('confirmed-off-pump', {
    history: [planRecord('2024-06-02 00:00:00', { state: 'confirmed', confirmed_at: '2024-06-03 08:05:00', on_pump: false })],
    pump: { profile, fetched_at: '2024-06-05 09:40:00' } });
  assert.equal(plan.phase(), 'Confirmed');
  assert.match(statusOf(surface.innerHTML), new RegExp(
    `✓ Confirmed on the pump ${stamp('2024-06-03 08:05:00')}\\. The latest pump read no longer matches this Plan\\.`));
  assert.doesNotMatch(surface.innerHTML, /gf-diff|data-set="rekey"/);
});

test('a confirmed Plan with no newer draft keeps View change record and offers no Withdraw', async () => {
  const { surface } = await servedPlan('confirmed-door', {
    history: [planRecord('2024-06-02 00:00:00', { state: 'confirmed', confirmed_at: '2024-06-03 08:05:00', on_pump: true })],
    pump: { profile: held, fetched_at: '2024-06-03 08:05:00' } });
  assert.match(surface.innerHTML, /data-action="history">View change record</);
  assert.doesNotMatch(surface.innerHTML, /data-set="withdraw"|data-set="save-draft"|data-set="record"/);
});

test('a draft saved during a pending Plan stays out of its fields and shows the next-change line', async () => {
  const { plan, surface } = await servedPlan('pending-draft', {
    history: [planRecord('2024-06-02 00:00:00', { state: 'pending' })],
    draft: { items: [{ type: 'basal', start_min: 0, value: 0.52 }], updated_at: '2024-06-04 10:15:00', input_revision: 9 },
    pump: { profile, fetched_at: '2024-06-01 00:00:00' } });
  assert.equal(plan.phase(), 'Pending');
  const decision = /<h3>Decision<\/h3>([\s\S]*?)<\/section>/.exec(surface.innerHTML)[1];
  const fields = /<dl>([\s\S]*?)<\/dl>/.exec(decision)[1];
  assert.equal(field(fields, 'Decision recorded'), stamp('2024-06-02 00:00:00'));
  assert.equal(field(fields, 'On pump'), 'Awaiting pump evidence');
  assert.doesNotMatch(fields, new RegExp(stamp('2024-06-04 10:15:00')));
  assert.match(decision, new RegExp(`Next change: draft saved ${stamp('2024-06-04 10:15:00')}\\. It can be recorded once this Plan is confirmed or withdrawn\\.`));
  // The recorded Plan's own values, not the draft's, are the schedule.
  assert.match(surface.innerHTML, /0\.48/);
  assert.doesNotMatch(surface.innerHTML, /0\.52/);
});

test('a differing draft after a confirmed Plan reads Draft saved and can be recorded', async () => {
  const { plan, surface } = await servedPlan('confirmed-draft', {
    history: [planRecord('2024-06-02 00:00:00', { state: 'confirmed', confirmed_at: '2024-06-03 08:05:00', on_pump: true })],
    draft: { items: [{ type: 'basal', start_min: 0, value: 0.6 }], updated_at: '2024-06-04 10:15:00', input_revision: 9 },
    pump: { profile: held, fetched_at: '2024-06-04 09:00:00' } });
  assert.equal(plan.phase(), 'Draft saved');
  // The shape S146 reads: the kicker's phase word (CSS capitalises the kicker,
  // so the story reads this <b>'s own text), the head's two writes, the draft's
  // Decision fields, and the confirmed Plan on a line of its own.
  assert.equal(/<div class="gf-kicker">Plan · <b>([^<]*)<\/b><\/div>/.exec(surface.innerHTML)?.[1], 'Draft saved');
  assert.doesNotMatch(surface.innerHTML, /doesn't match your plan|keying error|gf-diff/i);
  const end = /<div class="gf-end">(.*?)<\/div><\/header>/.exec(surface.innerHTML)[1];
  assert.deepEqual([...end.matchAll(/data-set="([^"]+)"/g)].map(match => match[1]), ['save-draft', 'record']);
  const decision = /<h3>Decision<\/h3>([\s\S]*?)<\/section>/.exec(surface.innerHTML)[1];
  assert.deepEqual([...decision.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map(match => [match[1], match[2]]),
    [['Draft saved', stamp('2024-06-04 10:15:00')], ['Decision recorded', 'Not recorded']]);
  assert.match(decision, new RegExp(
    `<p class="gf-meta">Previous Plan: recorded ${stamp('2024-06-02 00:00:00')}, confirmed on the pump ${stamp('2024-06-03 08:05:00')}\\.</p>`));
});

test('with two served records the Decision block names the newest', async () => {
  // The history is served newest first.
  const { surface } = await servedPlan('two-records', {
    history: [
      planRecord('2024-06-04 00:00:00', { state: 'confirmed', confirmed_at: '2024-06-04 08:05:00', on_pump: true }),
      planRecord('2024-06-01 00:00:00', { state: 'confirmed', confirmed_at: '2024-06-01 08:05:00', on_pump: false })],
    pump: { profile: held, fetched_at: '2024-06-04 08:05:00' } });
  assert.equal(field(surface.innerHTML, 'Decision recorded'), stamp('2024-06-04 00:00:00'));
  assert.equal(field(surface.innerHTML, 'On pump'), stamp('2024-06-04 08:05:00'));
});

test('a served mismatch draws the planned-versus-pump rows and Re-key', async () => {
  const { plan, surface } = await servedPlan('mismatch-rows', {
    history: [planRecord('2024-06-02 00:00:00', { state: 'mismatch' })],
    pump: { profile, fetched_at: '2024-06-03 08:05:00' } });
  assert.equal(plan.phase(), 'Mismatch');
  assert.match(surface.innerHTML, /The pump doesn't match your plan/);
  assert.match(surface.innerHTML, /gf-diff[\s\S]*0\.48[\s\S]*0\.6/);
  assert.match(surface.innerHTML, /data-set="rekey"/);
  assert.equal(field(surface.innerHTML, 'On pump'), "The latest pump read doesn't match");
});
