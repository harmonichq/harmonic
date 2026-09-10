import test from 'node:test';
import assert from 'node:assert/strict';

let fail = true;
const requests = [];
let kind = 'trial';
let identity = 'basal_rate-03-00-synthetic';
let context = {};
const admission = () => ({ state: 'available', active_kind: kind, active_id: identity,
  can_finish_trial: true, focus_pin: { available: false } });
const comparison = { availability: { state: 'available' }, periods: {}, views: {}, outcomes: [],
  assessment: { state: 'unclear' }, readiness: { before: { observed: 0, required: 14, criterion_met: false, unit: 'nights', contributing_dates: [] }, after: { observed: 0, required: 14, criterion_met: false, unit: 'nights', contributing_dates: [] } } };
globalThis.fetch = async (path, options = {}) => {
  requests.push({ path, options });
  if (options.method === 'POST') return { ok: !fail, status: fail ? 503 : 200,
    json: async () => fail ? { detail: 'Synthetic refusal' } : { id: identity, record: { id: identity } } };
  const selected = new URL(path, 'http://synthetic').searchParams.get('selected');
  const result = { input_revision: 7, admission: admission(),
    trials: kind === 'trial' ? [{ id: identity }] : [],
    focuses: kind === 'focus' ? [{ id: identity, title: 'Highs after meals', pattern_key: 'served-pattern', pinned_at: '2024-05-05 00:00:00' }] : [],
    ...(selected ? { selected: { id: identity, kind, changes: kind === 'trial' ? [{ parameter: 'basal_rate', slot: '03:00', before: 0.6, after: 0.54 }] : [],
      lever: kind === 'focus' ? 'late_bolus' : undefined, original: { context },
      reassessment: { comparison } } } : {}),
  };
  return { ok: true, json: async () => result };
};
globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#222222' });
const { mount, configureFollowUp, retainedEvidenceContext } = await import('./follow-up.js');
const { mount: mountHistory } = await import('./history.js');
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
function host() {
  const field = { value: '' }; const form = {};
  return { innerHTML: '', field, form,
    querySelectorAll: () => [],
    querySelector(selector) { return selector === '#conclusion' && this.innerHTML.includes('id="conclusion"') ? field
      : selector === '[data-form="finish"]' && this.innerHTML.includes('data-form="finish"') ? form : null; },
  };
}
async function mountActive(seat, navigation) {
  for (let step = 0; step < 3; step++) { mount(seat, { navigation, hold() {} }); await flush(); }
  assert.match(seat.innerHTML, /data-form="finish"/);
}

test('public mount reads retained evidence and failed finish/resolve retain the draft and durable retry id', async () => {
  const saved = [];
  configureFollowUp({ openRecord: (...args) => saved.push(args) });
  for (const [index, current] of ['trial', 'focus'].entries()) {
    kind = current; identity = `${current}-synthetic`; fail = true;
    const seat = host(); await mountActive(seat, index);
    assert.ok(requests.some(r => r.path.includes(`selected=${identity}`) && r.path.includes('assessment=retained')));
    seat.field.oninput({ target: { value: 'My synthetic observation' } });
    seat.form.onsubmit({ preventDefault() {} }); await flush();
    mount(seat, { navigation: index, hold() {} });
    assert.match(seat.innerHTML, /Synthetic refusal/);
    assert.match(seat.innerHTML, /My synthetic observation/);
    assert.equal(saved.length, index);
    const failed = requests.filter(r => r.options.method === 'POST').at(-1);
    fail = false; seat.form.onsubmit({ preventDefault() {} }); await flush();
    const retried = requests.filter(r => r.options.method === 'POST').at(-1);
    assert.equal(JSON.parse(failed.options.body).request_id, JSON.parse(retried.options.body).request_id);
    assert.deepEqual(saved[index], [kind, identity]);
    assert.equal(JSON.parse(retried.options.body).conclusion, 'My synthetic observation');
  }
});

test('retained inspection uses the original slot and canonical Pattern identity', () => {
  assert.deepEqual(retainedEvidenceContext({ changes: [{ parameter: 'basal_rate', slot: '03:00' }], original: { context: {} } }),
    { subject: 'setting:basal_rate', from: 'changes', occurrence: '', window: '180-210', lever: 'basal_rate', focus: '#crumb-trail' });
  assert.equal(retainedEvidenceContext({ pattern_key: 'served-pattern', lever: 'late_bolus' }).subject, 'pattern:served-pattern');
  assert.equal(retainedEvidenceContext({ lever: 'retired-unmapped' }).subject, '', 'an unmapped legacy record cannot impersonate a Pattern');
});

test('Focus mount uses the served record title and keeps its explanation in the body only', async () => {
  kind = 'focus'; identity = 'focus-title-synthetic';
  context = { state: 'available', explanation: 'Watch meal timing.', subjects: ['pattern:served-pattern'] };
  try {
    const seat = host(); await mountActive(seat, 'focus-title');
    assert.match(seat.innerHTML, /<h2 class="gf-title"[^>]*>Highs after meals<\/h2>/);
    assert.equal(seat.innerHTML.split('Highs after meals').length - 1, 1);
    assert.match(seat.innerHTML, /<p>Watch meal timing\.<\/p>/);
    assert.equal(seat.innerHTML.split('Watch meal timing.').length - 1, 1);
    assert.doesNotMatch(seat.innerHTML, />pattern:served-pattern</);
  } finally { context = {}; }
});

test('history mounts the served Pattern title in both its roster row and open record', async () => {
  kind = 'focus'; identity = 'focus-history-synthetic';
  context = { state: 'available', explanation: 'Watch meal timing.', subjects: ['pattern:served-pattern'] };
  try {
    const seat = host();
    for (const route of [{}, { occurrence: `record:focus:${identity}` }]) {
      for (let step = 0; step < 3; step++) {
        mountHistory(seat, { context: route, hold() {} }); await flush();
      }
      assert.match(seat.innerHTML, /Highs after meals/);
      assert.doesNotMatch(seat.innerHTML, />pattern:served-pattern</);
      if (route.occurrence) {
        assert.match(seat.innerHTML, /<h2 class="gf-title"[^>]*>Highs after meals<\/h2>/);
        assert.match(seat.innerHTML, /Original explanation<\/dt><dd>Watch meal timing\.<\/dd>/);
      }
    }
  } finally { context = {}; }
});

test('Focus does not repeat a retained explanation identical to its served title', async () => {
  kind = 'focus'; identity = 'focus-repeated-title-synthetic';
  context = { state: 'available', explanation: 'Highs after meals' };
  try {
    const seat = host(); await mountActive(seat, 'focus-repeated-title');
    assert.match(seat.innerHTML, /<h2 class="gf-title"[^>]*>Highs after meals<\/h2>/);
    assert.equal(seat.innerHTML.split('Highs after meals').length - 1, 1);
  } finally { context = {}; }
});
