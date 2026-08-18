// #95 — pure settling-helper tests (Node built-in runner, no DOM/importmap).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settlingByParam, settlingCountdown } from './settling.js';

const basal = {
  parameter: 'basal_rate', since: '2026-06-06 09:00:00',
  gate: { unit: 'clean days', needed: 3, soft: false,
          criteria: ['≥90 clean minutes per day in the slot', '≥3 distinct clean days'] },
  have: 1,
};
const ic = {
  parameter: 'carb_ratio', since: '2026-06-06 09:00:00',
  gate: { unit: 'meals', needed: 3, soft: false,
          criteria: ['≥10 g carbs', '≥0.3 U bolus', 'no other meal within 3 h'] },
  have: 1,
};
const isf = {
  parameter: 'isf', since: '2026-06-06 09:00:00',
  gate: { unit: null, needed: null, soft: true,
          criteria: ['CGM step inside the fasting window (00:00–06:00)',
                     'no carb-bearing bolus in the prior 5 h'] },
  have: null,
};

test('settlingByParam indexes by parameter and tolerates missing list', () => {
  const map = settlingByParam([basal, ic, isf]);
  assert.equal(map.basal_rate.parameter, 'basal_rate');
  assert.equal(map.carb_ratio.parameter, 'carb_ratio');
  assert.equal(map.isf.parameter, 'isf');
  assert.deepEqual(settlingByParam(null), {});
  assert.deepEqual(settlingByParam(undefined), {});
  assert.deepEqual(settlingByParam([]), {});
});

test('hard-gate countdown is in the parameter native unit with have/needed', () => {
  assert.equal(settlingCountdown(basal), '2 more clean days (1 of 3)');
  assert.equal(settlingCountdown(ic), '2 more meals (1 of 3)');
});

test('countdown never goes negative once have reaches needed', () => {
  const done = { ...basal, have: 5 };
  assert.equal(settlingCountdown(done), '0 more clean days (5 of 3)');
});

test('soft gate (ISF) shows a collecting line with NO fabricated number', () => {
  const line = settlingCountdown(isf);
  assert.match(line, /collecting/);
  assert.match(line, /no estimate yet/);
  assert.doesNotMatch(line, /\bmore\b/);   // no "N more <unit>"
});

test('countdown is empty for a null/absent settling entry', () => {
  assert.equal(settlingCountdown(null), '');
  assert.equal(settlingCountdown(undefined), '');
});
