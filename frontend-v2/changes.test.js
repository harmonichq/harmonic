import test from 'node:test';
import assert from 'node:assert/strict';
let answer; let failure = false;
globalThis.fetch = async () => {
  if (failure) throw new Error('Synthetic guidance read failed');
  return { ok: true, json: async () => answer };
};
const { loadGuidance } = await import('./guidance.js');
const { mount } = await import('./changes.js');
const host = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
const candidate = { subject: 'pattern:served', kind: 'pattern', title: '<served & title>',
  action: [{ parameter: 'basal_rate', start_min: 180, end_min: 210, recommended: .54, direction: 'lower' }],
  members: [], preference: {}, readiness: { count: 99, gate: 12, verdict: 'withheld', reason: 'The served verdict is withheld.' } };

test('Changes renders the served selection, escapes text and does not derive readiness from counts', async () => {
  answer = { disposition: 'eligible_action', selected: candidate, candidates: [candidate], reasons: {} };
  await loadGuidance({ force: true }); mount(host);
  assert.match(host.innerHTML, /&lt;served &amp; title&gt;/);
  assert.match(host.innerHTML, /The served verdict is withheld\./);
  assert.match(host.innerHTML, /data-set="stage"/, 'served setting action remains distinct from Focus readiness');
  answer = { ...answer, disposition: 'guided_investigation', selected: { ...candidate, action: null } };
  await loadGuidance({ force: true }); mount(host);
  assert.doesNotMatch(host.innerHTML, /data-set="stage"/);
});

test('unavailable retains its served reason and is distinct from quiet', async () => {
  answer = { disposition: 'unavailable', unavailable: 'Synthetic source is unavailable <reason>', candidates: [], selected: null };
  await loadGuidance({ force: true }); mount(host);
  assert.match(host.innerHTML, /Synthetic source is unavailable &lt;reason&gt;/);
  assert.match(host.innerHTML, /No action from this read/);
  assert.doesNotMatch(host.innerHTML, /No priority needs action|data-set="stage"/);
});

test('a failed guidance replacement cannot expose the previous read as a current action', async () => {
  answer = { disposition: 'eligible_action', selected: candidate, candidates: [candidate], reasons: {} };
  await loadGuidance({ force: true }); mount(host);
  assert.match(host.innerHTML, /data-set="stage"/);
  failure = true;
  await loadGuidance({ force: true }); mount(host);
  assert.match(host.innerHTML, /Guidance unavailable/);
  assert.doesNotMatch(host.innerHTML, /data-set="stage"|data-action="aside"|data-restore=/);
});
