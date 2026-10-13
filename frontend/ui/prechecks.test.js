// Each story precheck fires on the violation it exists for, and a clean story
// passes. Synthetic inputs only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { precheckProblems } from './prechecks.js';

const sources = {
  fixtures: { outcomes: { 14: { window_days: 14 } }, prompts: [{ answer: null }, { answer: 'yes' }],
    pattern: { n: 6, wilson: { lo: 0.1477 } }, span: { start_min: 180 } },
  allowed: new Set(['pin', 'queue', 'd', 'snooze']),
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
