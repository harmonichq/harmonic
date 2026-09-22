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
    reconciliation: { state: 'unavailable' }, withdrawal: { state: 'unavailable' } };
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
          deliverable: { state: 'available', source_profile: profile }, reconciliation: { state: 'unavailable' }, withdrawal: { state: 'unavailable' } };
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
