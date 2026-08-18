// #157 — tests for the pure Guide-tab render helpers. Node's built-in runner,
// no npm deps / no package.json:
//
//     node --test           (auto-discovers *.test.js from the repo root)
//
// These import guide.js with no importmap and no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  guideGroups, guideTierLabel, guideLeverTitles, guideMd, guideDefFor,
  guideWorkedRows, guideRowClass, guideSpark,
} from './guide.js';

// A trimmed catalog shaped like /api/catalog.
const CAT = {
  exposures: [
    { value: 'meals', label: 'Meals', denominator: 'per meal' },
    { value: 'lows', label: 'Lows', denominator: 'per low' },
    { value: 'highs', label: 'Unexplained highs', denominator: 'per high' },
  ],
  levers: [
    { value: 'carb_undercount', title: 'Carb undercount', exposure: 'meals' },
    { value: 'late_bolus', title: 'Late bolus', exposure: 'meals' },
    { value: 'over_treated_low', title: 'Over-treated low', exposure: 'lows' },
  ],
  tiers: [
    { value: 'observed', label: 'Observed' },
    { value: 'inferred', label: 'Inferred' },
  ],
};

test('guideGroups buckets levers under their exposure, in catalog order', () => {
  const g = guideGroups(CAT);
  assert.deepEqual(g.map((x) => x.value), ['meals', 'lows']); // 'highs' has no levers → dropped
  assert.deepEqual(g[0].levers.map((l) => l.value), ['carb_undercount', 'late_bolus']);
  assert.equal(g[0].denominator, 'per meal');
  assert.deepEqual(g[1].levers.map((l) => l.value), ['over_treated_low']);
});

test('guideGroups is empty for a missing catalog', () => {
  assert.deepEqual(guideGroups(null), []);
});

test('guideTierLabel resolves from the payload, falls back to the raw value', () => {
  assert.equal(guideTierLabel(CAT.tiers, 'inferred'), 'Inferred');
  assert.equal(guideTierLabel(CAT.tiers, 'not_in_data'), 'not_in_data');
  assert.equal(guideTierLabel(undefined, 'observed'), 'observed');
});

test('guideLeverTitles is the value->title map the payload owns', () => {
  assert.deepEqual(guideLeverTitles(CAT), {
    carb_undercount: 'Carb undercount',
    late_bolus: 'Late bolus',
    over_treated_low: 'Over-treated low',
  });
  assert.deepEqual(guideLeverTitles(null), {});
});

test('guideMd renders bold spans only', () => {
  assert.equal(guideMd('a **b** c'), 'a <b>b</b> c');
  assert.equal(guideMd(''), '');
  assert.equal(guideMd(undefined), '');
});

test('guideDefFor finds the stage def, falls back muted', () => {
  const chain = [{ step: 'Anchor', color: '--primary', one_liner: 'x', body: 'y' }];
  assert.equal(guideDefFor(chain, 'Anchor').color, '--primary');
  assert.equal(guideDefFor(chain, 'Nope').color, '--muted');
});

const WORKED = {
  steps: [
    { stage: 'Anchor', text: 'a' },
    { stage: 'Episode', text: 'b' },
    { stage: 'Lever', text: 'c' },
  ],
  verdict: { stage: 'Lever', title: 'Carb undercount' },
  pattern: { stage: 'Pattern', rate: '~28%' },
};

test('guideWorkedRows rides the verdict into its stage row and appends the pattern', () => {
  const rows = guideWorkedRows(WORKED);
  assert.equal(rows.length, 4); // 3 steps + pattern
  assert.equal(rows[0].kind, 'step');
  assert.equal(rows[0].verdict, null);
  assert.equal(rows[1].verdict, null); // Episode step, no verdict
  assert.equal(rows[2].stage, 'Lever');
  assert.equal(rows[2].verdict.title, 'Carb undercount'); // verdict rides the Lever row
  assert.equal(rows[3].kind, 'pattern');
  assert.equal(rows[3].pattern.rate, '~28%');
  assert.deepEqual(guideWorkedRows(null), []);
});

test('guideRowClass marks first / terminal / last-terminal', () => {
  const rows = guideWorkedRows(WORKED);
  assert.deepEqual(guideRowClass(rows[0], 0, rows.length), { first: true, terminal: false, 'last-terminal': false });
  assert.deepEqual(guideRowClass(rows[2], 2, rows.length), { first: false, terminal: true, 'last-terminal': false }); // Lever + verdict
  assert.deepEqual(guideRowClass(rows[3], 3, rows.length), { first: false, terminal: true, 'last-terminal': true }); // pattern, final
});

test('guideSpark returns geometry with an end dot on the last point', () => {
  const s = guideSpark([0, 5, 10]);
  assert.equal(s.w, 200);
  assert.equal(s.h, 46);
  assert.equal(s.dot.x, 196); // pad(4) + last index → w - pad
  assert.equal(s.dot.y, 4); // max value → top (h - pad - full) = pad
  assert.ok(typeof s.path === 'string' && s.path.split(' ').length === 3);
  assert.ok(s.band.startsWith('4,')); // band drawn at pad x-start
});

test('guideSpark tolerates a flat series without dividing by zero', () => {
  const s = guideSpark([50, 50, 50]);
  assert.ok(Number.isFinite(s.dot.y));
});
