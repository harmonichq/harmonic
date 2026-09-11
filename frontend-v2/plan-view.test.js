// #389 — tests for the Plan surface's own decisions (plan-view.js).
//   node --test 'frontend-v2/**/*.test.js'
//
// The schedule itself belongs to frontend/plan.js and is tested there. What is
// this module's own is narrower and is what is asserted here: which concerns can
// be staged at all, that a staged draft carries the SERVED action values rather
// than anything computed here, and how a setting value is spelled for a wearer.
import test from 'node:test';
import assert from 'node:assert/strict';

import { PLAN_HEAD, SETTING_NAME, phase, planUnderway, profileTable, stage, userValue } from './plan-view.js';

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
