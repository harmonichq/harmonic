// Each story precheck fires on the violation it exists for, and a clean story
// passes. Synthetic inputs only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { precheckProblems } from './prechecks.js';

const sources = {
  fixtures: { outcomes: { 14: { window_days: 14 } }, prompts: [{ answer: null }, { answer: 'yes' }],
    tbr: { lvl1: 8.1, lvl2: 2.4 }, span: { start_min: 180 },
    slot: { current: 0.9, nights: [{ rate: 0.171 }, { rate: 0.52 }, { rate: 0.85 }] } },
  allowed: new Set(['pin', 'queue', 'd', 'snooze', 'may']),
};
const clean = {
  texts: [{ text: 'Pin', source: null }, { text: '14', source: 'outcomes.14.window_days' },
    { text: 'd', source: null }, { text: '1', source: 'prompts[answer=null].length' }, { text: '!', source: null },
    { text: '5.7', source: 'tbr.lvl1 − tbr.lvl2', format: 'fixed1' },
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

test('(f) a scroll area anywhere but a screen page or pane fails', () => {
  assert.deepEqual(run({ scrolls: ['div.ui-row__cell'] }), ['(f) a nested scroll area: div.ui-row__cell']);
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
  assert.match(run({ texts: [{ text: '5.6', source: 'tbr.lvl1 − tbr.lvl2', format: 'fixed1' }] })[0],
    /^\(e\) "5\.6" is not tbr\.lvl1 − tbr\.lvl2 as fixed1 \(5\.7\)/);
  assert.match(run({ texts: [{ text: '3:00', source: 'span.start_min', format: 'clock' }] })[0], /^\(e\) "3:00"/);
});

test('(e) a scale label may be a plain or signed number, clock, range or bound, and only that', () => {
  for (const text of ['0.45', '06:00', '54–69', '<54', '>250', '10–90%', '+1.9', '−1.4']) {
    assert.deepEqual(run({ texts: [{ text, source: null, axis: true }] }), [], text);
  }
  assert.match(run({ texts: [{ text: '06:00 d', source: null, axis: true }] })[0], /^\(e\) "06:00 d" names no fixture field/);
  assert.match(run({ texts: [{ text: '0.45 d', source: null, axis: true }] })[0], /^\(e\) "0.45 d" names no fixture field/);
  assert.match(run({ texts: [{ text: '0.45', source: null }] })[0], /^\(e\) "0.45" names no fixture field/);
  assert.match(run({ texts: [{ text: '+1.9', source: null }] })[0], /^\(e\) "\+1.9" names no fixture field/);
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

test('(e) filters on one list apply in turn', () => {
  // Day's Rises row (#529): the unanswered prompts of one detector.
  const fixtures = { prompts: [{ detector: 'low', answer: null }, { detector: 'missed-meal', answer: null },
    { detector: 'missed-meal', answer: 'no' }, { detector: 'missed-meal', answer: null }] };
  const check = (texts) => precheckProblems({ ...clean, texts }, { ...sources, fixtures });
  assert.deepEqual(check([{ text: '2', source: 'prompts[detector=missed-meal][answer=null].length' }]), []);
  assert.deepEqual(check([{ text: '1', source: 'prompts[answer=null][detector=low].length' }]), []);
  assert.match(check([{ text: '3', source: 'prompts[detector=missed-meal][answer=null].length' }])[0],
    /^\(e\) "3" is not prompts\[detector=missed-meal\]\[answer=null\]\.length \(2\)/);
});

test('a derived difference is taken between the values as printed', async () => {
  const { resolveSource, formatValue } = await import('./provenance.js');
  const root = { rate: { before: 0.25539, after: 0.23256 } };
  const shown = formatValue(resolveSource(root, 'rate.before − rate.after', 'pct1'), 'pct1');
  // 25.5 − 23.3 as printed, not the 2.3 of the unrounded rates.
  assert.equal(shown, '2.2');
});

test('(e) a count of two lists, less a literal, resolves left to right', () => {
  // Changes' "Previous · N" (#524): every Trial and ended Focus but the active one.
  const fixtures = { store: { trials: [1, 2, 3], focuses: [1, 2] } };
  const check = (texts) => precheckProblems({ ...clean, texts }, { ...sources, fixtures });
  assert.deepEqual(check([{ text: '4', source: 'store.trials.length + store.focuses.length − 1' }]), []);
  assert.match(check([{ text: '5', source: 'store.trials.length + store.focuses.length − 1' }])[0],
    /^\(e\) "5" is not store\.trials\.length \+ store\.focuses\.length − 1 \(4\)/);
});

test('(e) a share resolves over the values as printed', () => {
  const fixtures = { ins: { basal: 29.4229, meal: 22.1017, total: 62.4429 } };
  const check = (texts) => precheckProblems({ ...clean, texts }, { ...sources, fixtures });
  // 29.4 ÷ 62.4 as printed: 47.1%, shown whole.
  assert.deepEqual(check([{ text: '47', source: 'ins.basal ÷ ins.total', format: 'share' }]), []);
  assert.deepEqual(check([{ text: '35', source: 'ins.meal ÷ ins.total', format: 'share' }]), []);
  assert.match(check([{ text: '47.1', source: 'ins.basal ÷ ins.total', format: 'share' }])[0],
    /^\(e\) "47\.1" is not ins\.basal ÷ ins\.total as share \(47\)/);
});

test('a signed value prints its sign, a true minus and no stray space (#559)', async () => {
  const { formatValue } = await import('./provenance.js');
  assert.deepEqual([24.4, -6.2, 0, -0.4, 0.4].map((v) => formatValue(v, 'signed')), ['+24', '−6', '0', '0', '0']);
});
