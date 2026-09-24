import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('a Pattern concern names its members and its action by their served names', async () => {
  failure = false;
  const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/findings-projection.json', import.meta.url), 'utf8'));
  const patterns = fixture.browser_guidance_patterns;
  assert.ok(patterns.some((row) => row.members.length && row.action?.action_id),
    'the fixture serves a Pattern with members and an identified action');
  for (const pattern of patterns) {
    const selected = { ...pattern, preference: {} };
    answer = { disposition: 'eligible_action', selected, candidates: [selected], reasons: {} };
    await loadGuidance({ force: true }); mount(host);
    for (const member of pattern.members) {
      assert.ok(host.innerHTML.includes(`<tr><td>${member.title}</td><td>${member.action_title || 'No action'}</td></tr>`),
        `${pattern.subject} names ${member.subject} by its served title`);
    }
    if (pattern.action?.action_id) {
      assert.ok(host.innerHTML.includes(`<div class="gf-figure">${pattern.action.title}<small>`),
        `${pattern.subject} names its action by its served title`);
    }
    assert.doesNotMatch(host.innerHTML, /habit:|setting:/);
  }
});

test('a habit concern names its action by the concern\'s served title, never its id', async () => {
  failure = false;
  // Shaped like the served behavioral-missed-meal selection: a habit concern whose
  // identified action carries only its id, and no title of its own.
  const habit = { subject: 'habit:missed_meal', kind: 'habit', lever: 'missed_meal',
    title: 'Missed / unannounced meal', units: null, action: { action_id: 'habit:missed_meal' },
    members: [], unknowns: [], preference: {} };
  answer = { disposition: 'eligible_action', selected: habit, candidates: [habit], reasons: {} };
  await loadGuidance({ force: true }); mount(host);
  assert.ok(host.innerHTML.includes('<div class="gf-figure">Missed / unannounced meal<small>'),
    'the Action figure names the concern by its served title');
  assert.doesNotMatch(host.innerHTML, /habit:/);
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

// #451 — shapes follow the served isf-strengthen, behavioral-carb-undercount and
// behavioral-missed-meal selections.
const { readFocusOptions } = await import('./focus-entry.js');
const text = (html) => html.replace(/<[^>]*>/g, ' ');
const instruction = (parameter, direction, recommended, units) => ({
  kind: 'setting_instruction', parameter, start_min: 0, end_min: 1440, direction, units, recommended,
});
const carried = (row) => ({ subject: 'pattern:lows_after_correcting_highs', kind: 'pattern',
  title: 'Lows after correcting highs', units: null, action: [row], members: [], preference: {},
  readiness: { count: 0, gate: 12, verdict: 'withheld', reason: 'Focus is withheld: 0 opportunities, gate 12.' } });
const withheldPattern = { subject: 'pattern:highs_after_meals', kind: 'pattern', title: 'Highs after meals',
  units: null, action: { action_id: 'habit:carb_undercount', title: 'Carb undercount' }, members: [],
  preference: {}, readiness: { count: 6, gate: 12, verdict: 'withheld', reason: 'Focus is withheld: 6 opportunities, gate 12.' } };
const habitLead = { subject: 'habit:missed_meal', kind: 'habit', lever: 'missed_meal',
  title: 'Missed / unannounced meal', units: null, action: { action_id: 'habit:missed_meal' },
  members: [], unknowns: [], preference: {} };

async function served(read) {
  failure = false;
  answer = { reasons: {}, ...read };
  await loadGuidance({ force: true });
  await readFocusOptions();
  mount(host);
  return host.innerHTML;
}

test('an Action figure prints each setting instruction in the wearer\'s form', async () => {
  const isf = carried(instruction('isf', 'strengthen', 32, 'mg/dL/U'));
  let html = await served({ disposition: 'eligible_action', selected: isf, candidates: [isf] });
  assert.ok(html.includes('<div class="gf-figure">strengthen to 1 U : 32 mg/dL<small>'), html);
  const ic = carried(instruction('carb_ratio', 'lower', 9, 'g/U'));
  html = await served({ disposition: 'eligible_action', selected: ic, candidates: [ic] });
  assert.ok(html.includes('<div class="gf-figure">lower to 9 g/U<small>'), html);

  const setting = { subject: 'setting:isf', kind: 'setting', parameter: 'isf', title: 'Correction factor',
    units: 'mg/dL/U', action: [instruction('isf', 'strengthen', 32, 'mg/dL/U')], preference: {},
    members: [{ span: { start_min: 0, end_min: 1440 }, asserts_move: true, direction: 'strengthen',
      safety_status: null, held_reason: null }] };
  html = await served({ disposition: 'eligible_action', selected: setting, candidates: [setting] });
  assert.match(html, /<h2 class="gf-title" tabindex="-1">Correction factor<\/h2>/);
  assert.doesNotMatch(html, /ISF|mg\/dL\/U/);
});

test('Changes says why its concern leads in words, never the served code', async () => {
  const offered = { ...withheldPattern, readiness: { count: 14, gate: 12, verdict: 'ready',
    reason: 'Focus is ready from the backend opportunity count.' } };
  const cases = [
    ['a setting instruction', { disposition: 'eligible_action', selected: carried(instruction('isf', 'strengthen', 32, 'mg/dL/U')) }, 'Ready to stage'],
    ['an identified action with a served Focus offer', { disposition: 'eligible_action', selected: offered,
      input_revision: 7, admission: { focus_pin: { available: true } },
      pinnable_patterns: [{ subject: offered.subject, key: 'highs_after_meals' }] }, 'Ready to start a Focus'],
    ['a withheld Pattern', { disposition: 'eligible_action', selected: withheldPattern }, 'Focus withheld'],
    ['a legacy habit lead', { disposition: 'eligible_action', selected: habitLead }, 'Action identified'],
    ['an investigation', { disposition: 'guided_investigation', selected: { ...withheldPattern, action: null } }, 'Evidence to inspect'],
  ];
  for (const [label, read, words] of cases) {
    const html = await served({ ...read, candidates: [read.selected] });
    assert.ok(html.includes(`<h3>Action <span class="meta">${words}</span></h3>`), `${label}: Action head says "${words}"`);
    assert.match(html, new RegExp(`priority</b> · ${words}</div>`), `${label}: nameplate says "${words}"`);
    assert.doesNotMatch(html, /eligible_action|guided_investigation|active_change|pending_plan/, label);
  }
  const unknown = await served({ disposition: 'future_rule', selected: habitLead, candidates: [habitLead] });
  assert.ok(unknown.includes('<h3>Action</h3>'), 'a code outside the table prints no words');
  assert.doesNotMatch(unknown, /future_rule/);
});

test('a set-aside row prints its served name, and an unnamed one says so', async () => {
  const aside = (subject, title) => ({ subject, title, kind: null, absent: true, action: null, members: [],
    preference: { set_aside: true, return_reason: null }, decision: { reason: null } });
  const rows = [aside('setting:isf', 'Correction factor'), aside('habit:correction_stacking', 'Correction stacking'),
    aside('habit:retired_lever', null)];
  const lead = carried(instruction('isf', 'strengthen', 32, 'mg/dL/U'));
  for (const read of [{ disposition: 'quiet', selected: null, candidates: rows },
    { disposition: 'eligible_action', selected: lead, candidates: [lead, ...rows] }]) {
    const words = text(await served(read));
    assert.match(words, /Correction factor/, read.disposition);
    assert.match(words, /Correction stacking/, read.disposition);
    assert.match(words, /A concern no longer in this read/, read.disposition);
    assert.doesNotMatch(words, /setting:|habit:|pattern:/, read.disposition);
  }
});

test('set-aside Escape follows the frozen order without opening a sheet', async () => {
  failure = false;
  answer = { disposition: 'eligible_action', selected: candidate, candidates: [candidate], reasons: {} };
  await loadGuidance({ force: true });
  const { startDesk, view, ESCAPE_ORDER } = await import('./routes.js');
  assert.deepEqual(ESCAPE_ORDER, ['utility', 'sheet', 'aside', 'day', 'journey', 'figure']);
  const { installChanges } = await import('./changes.js');
  const listeners = new Map();
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const controls = new Map();
  const seat = {
    innerHTML: '', dataset: {},
    querySelectorAll(selector) {
      if (selector === '[data-action="open-sheet"]') return [controls.get('open-sheet')].filter(Boolean);
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
      if (selector === '.gf-sheet-toggle') return controls.get('open-sheet');
      return selector === '[data-action="aside"]' ? controls.get('aside') : null;
    },
  };
  const field = { value: '' };
  globalThis.document = { activeElement: { tagName: 'BODY' }, querySelectorAll: () => [] };
  const browser = { location: { pathname: '/', search: '?to=changes', hash: '' },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: (name, listener) => listeners.set(name, listener) };
  globalThis.window = browser;
  try {
    installChanges(); startDesk(seat, { browser });
    controls.get('aside').onclick();
    assert.equal(view.sheetOpen, false, 'opening the form must not seat the sheet');
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

    controls.get('open-sheet').onclick();
    assert.equal(view.sheetOpen, true, 'the sheet control seats its own layer');
    controls.get('aside').onclick();
    assert.equal(view.sheetOpen, true, 'opening the form preserves an already seated sheet');
    field.value = 'held behind the sheet'; field.oninput();
    document.activeElement = { tagName: 'BODY' };
    listeners.get('keydown')({ key: 'Escape' });
    assert.equal(view.sheetOpen, false, 'the sheet precedes aside in the frozen hierarchy');
    assert.match(seat.innerHTML, /data-form="aside"/);
    assert.match(seat.innerHTML, /held behind the sheet/, 'closing the sheet does not cancel the form');
    assert.equal(document.activeElement.dataset.action, 'open-sheet');
    listeners.get('keydown')({ key: 'Escape' });
    assert.doesNotMatch(seat.innerHTML, /data-form="aside"/, 'the next Escape cancels the form');
    assert.equal(document.activeElement.dataset.action, 'aside');
  } finally {
    await (await import('./focus-entry.js')).readFocusOptions();
    globalThis.document = previousDocument; globalThis.window = previousWindow;
  }
});
