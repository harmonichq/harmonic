// #389 — tests for the Plan surface's own decisions (plan-view.js).
//   node --test 'frontend/**/*.test.js'
//
// The schedule itself belongs to frontend/plan.js and is tested there. What is
// this module's own is narrower and is what is asserted here: which concerns can
// be staged at all, that a staged draft carries the SERVED action values rather
// than anything computed here, and how a setting value is spelled for a wearer.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDeliverable, reconcileDeliverable } from './plan.js';

// The one transport, installed before anything imports frontend/data.js, which
// binds its default fetch when it is first evaluated. Each read answers its path.
// A write whose path `refused` names answers with that durable 409 refusal.
// While `plans.stateful` holds, each draft save is recorded and becomes the
// served draft, as the store does (#459).
const served = {};
const refused = {};
const plans = { stateful: false, saves: [] };
globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url, 'http://desk.invalid').pathname;
  if (options.method && options.method !== 'GET' && refused[path]) {
    return { ok: false, status: 409, statusText: 'Conflict', json: async () => ({ detail: refused[path] }) };
  }
  if (plans.stateful && path === '/api/plan' && options.method === 'PUT') {
    const { items } = JSON.parse(options.body);
    plans.saves.push(items.map((item) => `${item.type}@${item.start_min}`));
    served[path] = { items, updated_at: `t${plans.saves.length}` };
  }
  return { ok: true, status: 200, statusText: 'OK', json: async () => served[path] ?? {} };
};
const {
  PLAN_HEAD, SETTING_NAME, loadPlanState, mount, phase, planUnderway, profileTable, replacesDraft, stage, userValue,
} = await import('./plan-view.js');
const { loadGuidance } = await import('./guidance.js');

const basalCandidate = {
  subject: 'setting:basal_rate',
  kind: 'setting',
  parameter: 'basal_rate',
  units: 'U/h',
  action: [
    { start_min: 180, end_min: 210, direction: 'lower', units: 'U/h', recommended: 0.48 },
    { start_min: 210, end_min: 240, direction: 'lower', units: 'U/h', recommended: 0.48 },
  ],
};

test('staging a served action puts the desk on Staged with a change underway', () => {
  // The values the draft carries are the served ones; the rendered schedule is
  // what shows them, and the browser suite asserts them there.
  assert.equal(stage(basalCandidate), true);
  assert.equal(phase(), 'Staged');
  assert.equal(planUnderway(), true);
});

test('a concern the backend staged no action for cannot be staged here', () => {
  // The backend's action list is the only permission to stage. Held, absent and
  // empty all fail closed, whatever else the concern carries.
  assert.equal(stage({ ...basalCandidate, action: [] }), false);
  assert.equal(stage({ ...basalCandidate, action: null }), false);
  assert.equal(stage(null), false);
});

test('a parameter the deliverable has no family for cannot be staged', () => {
  // A subject naming something the Plan cannot express is refused rather than
  // guessed into the nearest family.
  assert.equal(stage({ ...basalCandidate, parameter: 'something_else' }), false);
});

test('nothing is underway before anything is staged', async () => {
  // A fresh module: staging is the only state this desk holds itself, so a
  // module that has done nothing must report nothing underway.
  const fresh = await import(`./plan-view.js?case=${Math.random()}`);
  assert.equal(fresh.planUnderway(), false);
  assert.equal(fresh.phase(), null);
});

test('a correction factor reads insulin first; every other setting is its number', () => {
  assert.equal(userValue('isf', 40), '1 U : 40 mg/dL');
  assert.equal(userValue('basal_rate', 0.48), '0.48');
  assert.equal(userValue('carb_ratio', 10), '10');
  assert.equal(userValue('target_bg', 110), '110');
});

test('an absent setting value renders as nothing, not as a zero', () => {
  // A blank cell says "this profile carries no value here". A 0 would say the
  // pump is programmed to zero, which is a different and dangerous claim.
  assert.equal(userValue('basal_rate', null), '');
  assert.equal(userValue('basal_rate', undefined), '');
  assert.equal(userValue('isf', ''), '');
  assert.equal(userValue('basal_rate', 0), '0');
});

test('the profile table renders one row per served segment, with all four columns', () => {
  const html = profileTable({ segments: [
    { start_min: 0, basal_rate: 0.6, isf: 40, carb_ratio: 10, target_bg: 110 },
    { start_min: 720, basal_rate: 0.8, isf: 35, carb_ratio: 9, target_bg: 110 },
  ] });
  assert.equal(html.match(/<tr>/g).length, 3); // one head row, two segments
  assert.ok(html.includes('00:00'));
  assert.ok(html.includes('12:00'));
  assert.ok(html.includes('1 U : 40 mg/dL'));
  for (const head of Object.values(PLAN_HEAD)) assert.ok(html.includes(head), `missing column ${head}`);
});

test('a profile with no segments renders an empty body rather than failing', () => {
  const html = profileTable({ segments: [] });
  assert.ok(html.includes('<tbody></tbody>'));
  assert.equal(profileTable(null).match(/<tr>/g).length, 1);
});

test('the four settings are named as the wearer names them', () => {
  assert.equal(SETTING_NAME.basal_rate, 'Basal');
  assert.equal(SETTING_NAME.isf, 'Correction factor');
  assert.equal(SETTING_NAME.carb_ratio, 'Carb ratio');
  assert.equal(SETTING_NAME.target_bg, 'Target');
});

test('every setting a mismatch diff can list is named in the wearer\'s words (#451)', () => {
  // The diff prints SETTING_NAME[cell.param] with no fallback, so every parameter
  // the mismatch reader can emit must have a name: here all four are mis-keyed.
  const activeProfile = { segments: [{ start_min: 0, basal_rate: 0.8, isf: 50, carb_ratio: 10, target_bg: 110 }] };
  const rows = buildDeliverable({ activeProfile, acceptedItems: [{ type: 'isf', start_min: 0, value: 55, recommended: 55 }] });
  const detected = [{ start_min: 0, basal_rate: 0.9, isf: 60, carb_ratio: 12, target_bg: 120 }];
  const cells = reconcileDeliverable(rows, detected).groups.flatMap((group) => group.cells);
  assert.deepEqual(cells.map((cell) => cell.param).sort(), ['basal_rate', 'carb_ratio', 'isf', 'target_bg']);
  for (const cell of cells) assert.ok(SETTING_NAME[cell.param], `${cell.param} has a name`);
});

test('What was known names the recorded concern and its value in the wearer\'s words (#451)', async () => {
  const profile = { segments: [{ start_min: 0, basal_rate: 0.6, isf: 30, carb_ratio: 10, target_bg: 110 }] };
  served['/api/guidance'] = { disposition: 'pending_plan', selected: null, candidates: [], reasons: {} };
  served['/api/plan'] = { items: [], updated_at: null };
  served['/api/pump-settings'] = { profile, fetched_at: '2024-06-30 08:00:00' };
  served['/api/plan/history'] = { history: [{
    applied_at: '2024-06-30 09:00:00', items: [{ type: 'isf', start_min: 0, value: 32, recommended: 32 }],
    verdict: { state: 'pending', on_pump: false }, deliverable: { source_profile: profile, rows: [] },
    decision_context: {
      state: 'available', captured_at: '2024-06-30 09:00:00', explanation: 'Correction factor',
      subjects: ['setting:isf'], subject_titles: ['Correction factor'],
      action: [{ parameter: 'isf', start_min: 0, end_min: 1440, direction: 'strengthen',
        units: 'mg/dL/U', recommended: 32 }],
      settings: [{ value: 32, unit: 'mg/dL/U' }], unknowns: [],
    },
  }] };
  await loadGuidance({ force: true });
  await loadPlanState();
  const host = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
  mount(host);
  const known = host.innerHTML.match(/<h3>What was known<\/h3>[\s\S]*?<\/section>/)?.[0] || '';
  assert.ok(known, 'the recorded Plan shows what was known');
  assert.match(known, /<dd>Correction factor<\/dd>/);
  assert.match(known, /<dd>1 U : 32 mg\/dL<\/dd>/);
  assert.match(known, /<p>Correction factor<\/p>/, 'the recorded explanation prints as recorded');
  assert.doesNotMatch(known, /setting:|mg\/dL\/U/);
});

// ADR 450: a refused Plan write prints the served sentence, never its code, a
// status beside it or "[object Object]". Both Plan writes that can be refused
// are pressed the way a reader presses them.
const STALE = { code: 'stale_input_revision', message: 'New pump or sensor data arrived since this page was read.' };
function pressable(host) {
  const buttons = new Map();
  host.querySelectorAll = (selector) => {
    if (selector !== '[data-set]') return [];
    return [...host.innerHTML.matchAll(/data-set="([^"]+)"/g)].map(([, set]) => {
      if (!buttons.has(set)) buttons.set(set, { dataset: { set } });
      return buttons.get(set);
    });
  };
  host.querySelector = () => null;
  return (set) => {
    mount(host);
    const button = buttons.get(set);
    assert.ok(button?.onclick, `premise: the Plan offers ${set}`);
    button.onclick();
  };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
function assertSentence(html, line) {
  const failure = html.match(/<p class="gf-error">([^<]*)<\/p>/)?.[1] || '';
  assert.equal(failure, `${line}: ${STALE.message}`);
  assert.doesNotMatch(html, /stale_input_revision|\(409\)|\b409\b|\[object Object\]/);
}

test('a refused Plan record prints the served sentence, never its code (ADR 450)', async () => {
  const profile = { segments: [{ start_min: 0, basal_rate: 0.6, isf: 30, carb_ratio: 10, target_bg: 110 }] };
  served['/api/guidance'] = { disposition: 'draft', selected: basalCandidate, candidates: [basalCandidate], reasons: {} };
  served['/api/plan'] = { items: [{ type: 'basal', start_min: 180, value: 0.48 }], updated_at: '2024-06-30 08:30:00', input_revision: 5 };
  served['/api/pump-settings'] = { profile, fetched_at: '2024-06-30 08:00:00' };
  served['/api/plan/history'] = { history: [] };
  refused['/api/plan/apply'] = STALE;
  try {
    await loadGuidance({ force: true });
    await loadPlanState();
    const host = { innerHTML: '' };
    pressable(host)('record');
    await settle();
    mount(host);
    assertSentence(host.innerHTML, 'Recording the decision failed');
  } finally { delete refused['/api/plan/apply']; }
});

test('a refused Plan withdraw prints the served sentence, never its code (ADR 450)', async () => {
  const profile = { segments: [{ start_min: 0, basal_rate: 0.6, isf: 30, carb_ratio: 10, target_bg: 110 }] };
  served['/api/guidance'] = { disposition: 'pending_plan', selected: null, candidates: [], reasons: {} };
  served['/api/plan'] = { items: [], updated_at: null, input_revision: 5 };
  served['/api/pump-settings'] = { profile, fetched_at: '2024-06-30 08:00:00' };
  served['/api/plan/history'] = { history: [{
    applied_at: '2024-06-30 09:00:00', items: [{ type: 'basal', start_min: 180, value: 0.48 }],
    verdict: { state: 'pending', on_pump: false }, deliverable: { source_profile: profile, rows: [] },
    decision_context: { state: 'unavailable', subjects: ['setting:basal_rate'] },
  }] };
  refused['/api/plan/history/withdraw'] = STALE;
  try {
    await loadGuidance({ force: true });
    await loadPlanState();
    const host = { innerHTML: '' };
    pressable(host)('withdraw');
    await settle();
    mount(host);
    assertSentence(host.innerHTML, 'Withdrawing failed');
  } finally { delete refused['/api/plan/history/withdraw']; }
});

/* #459 — a stage press on Diagnose replaces a draft of a different setting, and
   the stage control warns first (ADR 459). Synthetic values throughout. */
const icRows = [360, 480].map((start_min) => ({ type: 'ic', start_min, value: 11,
  ic_block_provenance: { block_start_min: 360, block_end_min: 600, block_member_start_mins: [360, 480] } }));
const basalRows = [{ type: 'basal', start_min: 120, value: 0.8 }];
const icCandidate = {
  subject: 'setting:carb_ratio', kind: 'setting', parameter: 'carb_ratio',
  action: [{ start_min: 360, end_min: 600, member_start_mins: [360, 480], direction: 'lower', recommended: 11 }],
};
const analyze459 = {
  basal: [{ slot: 4, label: '02:00', asserts_move: true, current: 0.9, recommended: 0.8 },
    { slot: 6, label: '03:00', asserts_move: true, current: 0.9, recommended: 0.8 }],
  ic_blocks: [{ block_id: 'b1', start_min: 360, end_min: 600, member_start_mins: [360, 480],
    current_values: [12], recommended: 11, asserts_move: true }],
};
/** A fresh Plan surface over a clean stateful store holding `items`. */
async function freshPlan459(items = []) {
  served['/api/plan'] = { items, updated_at: items.length ? 't0' : null };
  plans.saves.length = 0;
  const fresh = await import(`./plan-view.js?case=${Math.random()}`);
  await fresh.loadPlanState();
  return fresh;
}

test('#459 · a draft of another setting is replaced by a stage; the same setting or an empty draft is not', () => {
  assert.equal(replacesDraft('basal', icRows), true);
  assert.equal(replacesDraft('basal', basalRows), false);
  assert.equal(replacesDraft('basal', []), false);
});

test('#459 · the replaced draft is the one the marks read: a Changes pick not yet saved leads the saved draft', async () => {
  const unsavedPick = await freshPlan459();
  assert.equal(unsavedPick.stage(icCandidate), true, 'premise: a carb-ratio pick in Changes');
  assert.deepEqual(unsavedPick.replacedDraftItems('basal')?.map((row) => `${row.type}@${row.start_min}`), ['ic@360', 'ic@480'],
    'staging basal warns about the unsaved carb-ratio pick');
  const pickOverSaved = await freshPlan459(icRows);
  assert.equal(pickOverSaved.stage(basalCandidate), true, 'premise: a basal pick over a saved carb-ratio draft');
  assert.deepEqual(pickOverSaved.replacedDraftItems('isf')?.map((row) => `${row.type}@${row.start_min}`), ['basal@180', 'basal@210'],
    'staging the correction factor warns about the basal pick the marks and the dock show');
});

test('#459 guard · a cross-setting stage saves only the new setting\'s rows', async () => {
  plans.stateful = true;
  try {
    const { stageEvidence, evidenceIsStaged } = await freshPlan459();
    const { blockKey } = await import('./diagnose-workspaces.js');
    const ic = { family: 'ic', key: blockKey(analyze459.ic_blocks[0]) };
    assert.equal(await stageEvidence(ic, true, analyze459), true);
    assert.equal(await stageEvidence({ family: 'basal', key: 'basal:4', members: [120] }, true, analyze459), true);
    assert.deepEqual(plans.saves, [['ic@360', 'ic@480'], ['basal@120']]);
    assert.equal(evidenceIsStaged(ic, analyze459), false, 'the replaced carb ratio no longer counts as staged');
  } finally { plans.stateful = false; }
});

test('#459 guard · staging a second slot of the staged setting keeps the first', async () => {
  plans.stateful = true;
  try {
    const { stageEvidence } = await freshPlan459();
    assert.equal(await stageEvidence({ family: 'basal', key: 'basal:4', members: [120] }, true, analyze459), true);
    assert.equal(await stageEvidence({ family: 'basal', key: 'basal:6', members: [180] }, true, analyze459), true);
    assert.deepEqual(plans.saves, [['basal@120'], ['basal@120', 'basal@180']]);
  } finally { plans.stateful = false; }
});
