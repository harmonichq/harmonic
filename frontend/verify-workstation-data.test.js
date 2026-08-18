import test from 'node:test';
import assert from 'node:assert/strict';
import { toCaptures, initialTrial } from './verify-workstation-data.js';

const trial = (id, state, extra = {}) => ({ id, state, parameter: 'carb_ratio', ...extra });

const detail = (id, extra = {}) => ({
  trials: [],
  selected: {
    id,
    changes: [{ parameter: 'carb_ratio', slot: '12:00', before: 5, after: 4.6 }],
    envelopes: { before_period: [{ t: '00:00', n: 4, med: 120 }], trial_period: [] },
    rescue: { before_period: { n: 2 }, trial_period: { n: 1 } },
    day_rows: { before_period: [{}, {}, {}], trial_period: [{}] },
    ...extra,
  },
});

test('the per-Trial blocks land where the ported surface indexes them', () => {
  const cap = toCaptures({ trials: [trial('a', 'complete')] }, { a: detail('a') });

  assert.equal(cap.details.a.selected.id, 'a');
  assert.equal(cap._changes.a[0].after, 4.6);
  assert.equal(cap._envelopes.a.before_period[0].med, 120);
  assert.equal(cap._rescue.a.trial_period.n, 1);
  // the pane header's DAYS meta counts these rows
  assert.equal(cap._daydata.a.before_period.length, 3);
});

test('only an arc-target Trial gets a meal-anchored entry', () => {
  const cap = toCaptures(
    { trials: [trial('a', 'complete'), trial('b', 'maturing')] },
    { a: detail('a', { meal_arcs: { block: [720, 900], before_period: { n_meals: 4, bins: [] } } }),
      b: detail('b') });

  assert.deepEqual(cap._mealarcs.a.block, [720, 900]);
  assert.equal('b' in cap._mealarcs, false);
});

test('an unwrapped selected detail is accepted as-is', () => {
  const cap = toCaptures({ trials: [trial('a', 'complete')] }, { a: detail('a').selected });

  assert.equal(cap.details.a.selected.id, 'a');
});

test('a Trial whose detail failed to load carries no evidence maps', () => {
  const cap = toCaptures({ trials: [trial('a', 'complete'), trial('b', 'maturing')] },
                         { a: detail('a'), b: null });

  assert.equal(cap.roster.trials.length, 2);   // still nameable in the popover
  assert.equal('b' in cap.details, false);
});

test('the surface opens on the requested state, then the live Trial', () => {
  const trials = [trial('done', 'complete'), trial('live', 'maturing')];

  assert.equal(initialTrial(trials, 'complete').id, 'done');
  assert.equal(initialTrial(trials, null).id, 'live');
  // an unavailable request falls back rather than rendering nothing
  assert.equal(initialTrial([trial('done', 'complete')], 'maturing').id, 'done');
  assert.equal(initialTrial([], 'complete'), null);
});
