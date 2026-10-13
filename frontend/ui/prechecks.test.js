// Each story precheck fires on the violation it exists for, and a clean story
// passes. Synthetic inputs only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { precheckProblems } from './prechecks.js';

const sources = {
  fixtures: { outcomes: { 14: { window_days: 14 } }, prompts: [{ answer: null }, { answer: 'yes' }],
    pattern: { n: 6, wilson: { lo: 0.1477 } }, span: { start_min: 180 },
    slot: { current: 0.9, nights: [{ rate: 0.171 }, { rate: 0.52 }, { rate: 0.85 }] } },
  allowed: new Set(['pin', 'queue', 'd', 'snooze', 'may']),
};
const clean = {
  texts: [{ text: 'Pin', source: null }, { text: '14', source: 'outcomes.14.window_days' },
    { text: 'd', source: null }, { text: '1', source: 'prompts[answer=null].length' }, { text: '!', source: null },
    { text: '1', source: 'pattern.wilson.lo × pattern.n', format: 'round' },
    { text: '03:00', source: 'span.start_min', format: 'clock' }],
  names: ['Snooze'],
  buttons: [{ role: 'primary', height: 50, label: 'Pin' }, { role: 'segment', height: 28, label: '14 d' },
    { role: 'row', height: 73, label: 'Pin' }],
  primaries: 1,
};
const run = (shown) => precheckProblems({ ...clean, ...shown }, sources);

test('a clean story passes', () => {
  assert.deepEqual(run({}), []);
});

test('(a) a sentence or a question fails', () => {
  assert.match(run({ texts: [{ text: 'Pin queue.', source: null }] })[0], /^\(a\)/);
  assert.match(run({ texts: [{ text: 'Pin?', source: null }] })[0], /^\(a\)/);
});

test('(b) a word outside the glossary fails, visible or as an accessible name', () => {
  assert.deepEqual(run({ texts: [{ text: 'Dismiss', source: null }] }), ['(b) "Dismiss" is not in the glossary allowlist']);
  assert.deepEqual(run({ names: ['Close'] }), ['(b) "Close" is not in the glossary allowlist']);
});

test('(c) a button off its role height, or with no role, fails', () => {
  assert.match(run({ buttons: [{ role: 'secondary', height: 36, label: 'Pin' }] })[0], /^\(c\) secondary .* 36px, not 32px/);
  assert.match(run({ buttons: [{ role: null, height: 32, label: 'Pin' }] })[0], /^\(c\) .* no known role/);
  assert.match(run({ buttons: [{ role: 'row', height: 40, label: 'Pin' }] })[0], /^\(c\) row .* 40px, under 48px/);
  assert.match(run({ buttons: [{ role: 'answer', height: 32, label: 'Pin' }] })[0], /^\(c\) answer .* 32px, not 44px/);
});

test('the Glossary list may hold a sentence, words and numbers; nothing outside it may', () => {
  const definition = { text: 'Remove from the Queue for 14 days.', source: null, glossary: true };
  assert.deepEqual(run({ texts: [definition] }), []);
  assert.match(run({ texts: [{ ...definition, glossary: false }] })[0], /^\(a\)/);
});

test('(d) two primary-filled controls fail', () => {
  assert.deepEqual(run({ primaries: 2 }), ['(d) 2 primary-filled controls']);
});

test('(e) a number with no field, a missing field, or a different value fails', () => {
  assert.deepEqual(run({ texts: [{ text: '7', source: null }] }), ['(e) "7" names no fixture field']);
  assert.match(run({ texts: [{ text: '7', source: 'outcomes.7.window_days' }] })[0], /^\(e\) "7": no field "7"/);
  assert.match(run({ texts: [{ text: '30', source: 'outcomes.14.window_days' }] })[0], /^\(e\) "30" is not outcomes\.14\.window_days/);
});

test('(e) a derived or formatted number must equal its formula, as printed', () => {
  assert.match(run({ texts: [{ text: '2', source: 'pattern.wilson.lo × pattern.n', format: 'round' }] })[0],
    /^\(e\) "2" is not pattern\.wilson\.lo × pattern\.n as round \(1\)/);
  assert.match(run({ texts: [{ text: '3:00', source: 'span.start_min', format: 'clock' }] })[0], /^\(e\) "3:00"/);
});

test('(e) a scale label may be a plain number, clock, range or bound, and only that', () => {
  for (const text of ['0.45', '06:00', '54–69', '<54', '>250', '10–90%']) {
    assert.deepEqual(run({ texts: [{ text, source: null, axis: true }] }), [], text);
  }
  assert.match(run({ texts: [{ text: '06:00 d', source: null, axis: true }] })[0], /^\(e\) "06:00 d" names no fixture field/);
  assert.match(run({ texts: [{ text: '0.45 d', source: null, axis: true }] })[0], /^\(e\) "0.45 d" names no fixture field/);
  assert.match(run({ texts: [{ text: '0.45', source: null }] })[0], /^\(e\) "0.45" names no fixture field/);
});

test('(e) a difference, one decimal and a day of the month resolve like any other formula', () => {
  const fixtures = { m: { tbr_lvl1: 4.8, tbr_lvl2: 3.1, tir: 75 }, day: { iso: '2025-05-04', t: '2025-05-04 13:27:00' } };
  const check = (texts) => precheckProblems({ ...clean, texts }, { ...sources, fixtures });
  assert.deepEqual(check([{ text: '1.7', source: 'm.tbr_lvl1 − m.tbr_lvl2', format: 'fixed1' }]), []);
  assert.deepEqual(check([{ text: '75.0', source: 'm.tir', format: 'fixed1' }]), []);
  assert.deepEqual(check([{ text: '4', source: 'day.iso', format: 'day' }]), []);
  assert.deepEqual(check([{ text: '4 May', source: 'day.iso', format: 'date' }]), []);
  assert.deepEqual(check([{ text: '13:27', source: 'day.t', format: 'time' }]), []);
  assert.deepEqual(check([{ text: '18 May', source: 'day.t', format: 'until' }]), []);
  assert.match(check([{ text: '1.7', source: 'm.tbr_lvl2 − m.tbr_lvl1', format: 'fixed1' }])[0],
    /^\(e\) "1.7" is not m\.tbr_lvl2 − m\.tbr_lvl1 as fixed1 \(-1\.7\)/);
});

test('(e) a fixed-precision value and a bounded count resolve like any other field', () => {
  assert.deepEqual(run({ texts: [{ text: '0.90', source: 'slot.current', format: 'fixed2' }] }), []);
  assert.match(run({ texts: [{ text: '0.9', source: 'slot.current', format: 'fixed2' }] })[0], /^\(e\) "0.9" is not slot\.current as fixed2 \(0\.90\)/);
  assert.deepEqual(run({ texts: [{ text: '2', source: 'slot.nights[rate<0.6].length' }] }), []);
  assert.deepEqual(run({ texts: [{ text: '1', source: 'slot.nights[rate>0.6].length' }] }), []);
});
