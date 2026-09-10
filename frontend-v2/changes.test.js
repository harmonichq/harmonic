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

test('a fresh Changes read keeps Restore as a control when no concern is selected', async () => {
  failure = false;
  const setAside = { ...candidate, preference: { set_aside: true }, decision: { reason: '<optional reason>' } };
  for (const disposition of ['quiet', 'unavailable']) {
    answer = { disposition, selected: null, candidates: [setAside], unavailable: 'reconciliation_required' };
    await loadGuidance({ force: true }); mount(host);
    assert.match(host.innerHTML, /<button class="gf-btn" data-restore="pattern:served">Restore<\/button>/);
    assert.match(host.innerHTML, /&lt;served &amp; title&gt;/);
    assert.doesNotMatch(host.innerHTML, /&lt;button|<served/);
  }
});

test('one Escape outside the reason field cancels the innermost set-aside form like Cancel', async () => {
  failure = false;
  answer = { disposition: 'eligible_action', selected: candidate, candidates: [candidate], reasons: {} };
  await loadGuidance({ force: true });
  const { startDesk, view } = await import('./routes.js');
  const { installChanges } = await import('./changes.js');
  const listeners = new Map();
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const controls = new Map();
  const seat = {
    innerHTML: '', dataset: {},
    querySelectorAll(selector) {
      if (selector !== '[data-action]') return [];
      controls.clear();
      for (const match of this.innerHTML.matchAll(/data-action="([^"]+)"/g)) {
        controls.set(match[1], { dataset: { action: match[1] },
          focus() { document.activeElement = this; } });
      }
      return [...controls.values()];
    },
    querySelector(selector) {
      if (selector === 'form[data-form="aside"]' && this.innerHTML.includes('data-form="aside"')) {
        return { querySelector: () => field };
      }
      return selector === '[data-action="aside"]' ? controls.get('aside') : null;
    },
  };
  const field = { value: '' };
  globalThis.document = { activeElement: { tagName: 'BODY' }, querySelectorAll: () => [] };
  const browser = { location: { pathname: '/v2/', search: '?to=changes', hash: '' },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: (name, listener) => listeners.set(name, listener) };
  globalThis.window = browser;
  try {
    installChanges(); startDesk(seat, { browser });
    controls.get('aside').onclick();
    field.value = 'half-written'; field.oninput();
    document.activeElement = { tagName: 'TEXTAREA' };
    listeners.get('keydown')({ key: 'Escape' });
    assert.match(seat.innerHTML, /data-form="aside"/, 'a field retains its draft');
    document.activeElement = { tagName: 'BODY' };
    listeners.get('keydown')({ key: 'Escape' });
    assert.doesNotMatch(seat.innerHTML, /data-form="aside"/, 'first Escape closes the form');
    assert.equal(view.sheetOpen, false);
    assert.equal(document.activeElement.dataset.action, 'aside', 'Escape returns launcher focus');
    controls.get('aside').onclick();
    assert.doesNotMatch(seat.innerHTML, /half-written/, 'Escape discards the same cancelled reason as Cancel');
    controls.get('cancel-aside').onclick();
    assert.doesNotMatch(seat.innerHTML, /data-form="aside"/);
    assert.equal(view.sheetOpen, false);
    assert.equal(document.activeElement.dataset.action, 'aside', 'Cancel returns the same launcher focus');
  } finally {
    globalThis.document = previousDocument; globalThis.window = previousWindow;
  }
});
