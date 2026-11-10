// Each story precheck fires on the violation it exists for, and a clean story
// passes. Synthetic inputs only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { contrastProblems, contrastRatio, interactionProblems, precheckProblems } from './prechecks.js';

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

// The interactivity prechecks (#582): a clean walk passes, and each rule fires.
const control = (label, more = {}) => ({
  label, role: 'button', handler: true, focusable: true, tabindex: null, hidden: false, exempt: [], name: label,
  state: false, needsState: false, rect: { x: 0, y: 0, w: 80, h: 44 }, fixed: false, pane: -1, misses: [], ...more,
});
const walk = {
  controls: [control('Pin'), control('Snooze', { rect: { x: 100, y: 0, w: 80, h: 44 } }),
    control('Queue', { rect: { x: 0, y: 60, w: 80, h: 44 } })],
  sequence: [{ index: 0, label: 'Pin', changed: true }, { index: 1, label: 'Snooze', changed: true },
    { index: 2, label: 'Queue', changed: true }],
  graphics: [{ label: 'svg', name: 'Glucose' }],
  statuses: [{ text: 'Not saved', live: true }],
  dialogs: [{ name: 'End', trigger: 'End', opened: true, modal: true, beside: 0, inside: true, trapped: true,
    closed: true, returned: true }],
};
const walked = (changes) => interactionProblems({ ...walk, ...changes });
const withControl = (i, more) => walk.controls.map((c, j) => (j === i ? { ...c, ...more } : c));

test('a clean keyboard walk passes', () => {
  assert.deepEqual(walked({}), []);
});

test('(g) a tap target with no role, or one Tab never reaches, fails; an exemption skips it', () => {
  assert.deepEqual(walked({ controls: withControl(2, { role: null, name: null }) }),
    ['(g) "Queue" responds to a tap but has no role']);
  assert.deepEqual(walked({ sequence: walk.sequence.slice(0, 2) }), ['(g) "Queue" is not reached by Tab']);
  assert.deepEqual(walked({ sequence: walk.sequence.slice(0, 2), controls: withControl(2, { exempt: ['g'] }) }), []);
  // A Tab stop that is no visible control (drawn at opacity 0, say) fails, whatever else it is.
  assert.deepEqual(walked({ sequence: [...walk.sequence, { index: -1, label: 'Snooze', changed: true, visible: false }] }),
    ['(g) Tab stops on "Snooze", which is not a visible control']);
  // A visible stop that is no control (a pane the browser lets Tab scroll) is a stop like any.
  assert.deepEqual(walked({ sequence: [...walk.sequence, { index: -1, label: 'Basal', changed: true, visible: true }] }), []);
  // An exemption from (g) is no exemption from a name.
  assert.deepEqual(walked({ controls: withControl(2, { exempt: ['g', 'l'], name: '' }) }), ['(i) button "Queue" has no accessible name']);
});

test('(h) a stop that looks the same focused fails', () => {
  assert.deepEqual(walked({ sequence: [walk.sequence[0], { ...walk.sequence[1], changed: false }, walk.sequence[2]] }),
    ['(h) "Snooze" looks the same focused']);
});

test('(i) an unnamed control or graphic, a toggle with no state, or focus inside aria-hidden fails', () => {
  assert.deepEqual(walked({ controls: withControl(0, { name: '' }) }), ['(i) button "Pin" has no accessible name']);
  assert.deepEqual(walked({ graphics: [{ label: 'svg.ui-trace', name: '' }] }),
    ['(i) a graphic (svg.ui-trace) has no accessible name and is not aria-hidden']);
  assert.deepEqual(walked({ controls: withControl(0, { needsState: true }) }), ['(i) "Pin" exposes no pressed or selected state']);
  assert.deepEqual(walked({ controls: withControl(0, { needsState: true, state: true }) }), []);
  assert.deepEqual(walked({ controls: withControl(0, { hidden: true }), sequence: walk.sequence.slice(1) }),
    ['(i) "Pin" is focusable inside aria-hidden']);
});

test('(i) a name that runs text together, or carries its badge, fails', () => {
  assert.deepEqual(walked({ controls: withControl(0, { name: 'Peak43 of 137' }) }), ['(i) "Peak43 of 137" runs text together']);
  assert.deepEqual(walked({ controls: withControl(0, { name: '5 Day', badges: ['5'] }) }),
    ['(i) "5 Day" carries its badge "5" in its name']);
  assert.deepEqual(walked({ controls: withControl(0, { name: 'Day', badges: ['5'] }) }), []);
  assert.deepEqual(walked({ controls: withControl(0, { name: 'Basal 04:00–07:30 · 1.80 U/h · mg/dL' }) }), []);
  // Two pieces of text the name reads with nothing between them run together, words or not.
  assert.deepEqual(walked({ controls: withControl(0, { name: 'GlucoseBasal', pieces: ['Glucose', 'Basal'] }) }),
    ['(i) "GlucoseBasal" runs text together']);
  assert.deepEqual(walked({ controls: withControl(0, { name: 'Glucose Basal', pieces: ['Glucose', 'Basal'] }) }), []);
  assert.deepEqual(walked({ controls: withControl(0, { name: 'Snoozed until Mon', pieces: ['Snoozed until ', 'Mon'] }) }), []);
});

test('(i) a graphic drawn as an image that hides its own text fails', () => {
  assert.deepEqual(walked({ graphics: [{ label: 'svg.ui-ribbon__chart', name: 'Time in range', hides: '82%' }] }),
    ['(i) a graphic drawn as an image (svg.ui-ribbon__chart) hides its text "82%"']);
});

test('(j) a positive tabindex, or Tab running up a column or left along a line, fails', () => {
  assert.deepEqual(walked({ controls: withControl(0, { tabindex: 2 }) }), ['(j) "Pin" has a positive tabindex (2)']);
  const [pin, snooze, queue] = walk.sequence;
  assert.deepEqual(walked({ sequence: [queue, pin, snooze] }), ['(j) Tab goes up from "Queue" to "Pin"']);
  assert.deepEqual(walked({ sequence: [snooze, pin, queue] }), ['(j) Tab goes left from "Snooze" to "Pin"']);
  // Up into the next column is reading order, and what is fixed in place is not read in the flow.
  assert.deepEqual(walked({ controls: withControl(2, { rect: { x: 300, y: 60, w: 80, h: 44 } }), sequence: [queue, pin, snooze] }), []);
  assert.deepEqual(walked({ controls: withControl(2, { fixed: true }), sequence: [queue, pin, snooze] }), []);
  // A scrolling pane and what lies outside it are read region by region.
  assert.deepEqual(walked({ controls: withControl(2, { pane: 0 }), sequence: [queue, pin, snooze] }), []);
});

test('(k) a dialog that keeps no focus, lets it out, ignores Escape or loses its trigger fails', () => {
  const dialog = walk.dialogs[0];
  assert.deepEqual(walked({ dialogs: [{ ...dialog, inside: false, trapped: false, closed: false, returned: false }] }), [
    '(k) dialog "End" from "End" does not take focus when it opens',
    '(k) dialog "End" from "End" lets Tab leave it while open',
    '(k) dialog "End" from "End" does not close on Escape',
    '(k) dialog "End" from "End" does not give focus back to its trigger',
  ]);
  // Marked modal exactly when nothing beside it takes a tap; modal or not, it keeps Tab.
  assert.deepEqual(walked({ dialogs: [{ ...dialog, modal: false }] }),
    ['(k) dialog "End" from "End" covers the page but is not marked modal (aria-modal)']);
  assert.deepEqual(walked({ dialogs: [{ ...dialog, beside: 3 }] }),
    ['(k) dialog "End" from "End" is marked modal, but 3 control(s) beside it still take a tap']);
  assert.deepEqual(walked({ dialogs: [{ ...dialog, modal: false, beside: 3 }] }), []);
  assert.deepEqual(walked({ dialogs: [{ ...dialog, modal: false, beside: 3, trapped: false }] }),
    ['(k) dialog "End" from "End" lets Tab leave it while open']);
  assert.deepEqual(walked({ dialogs: [{ name: '', trigger: 'End', opened: false }] }),
    ['(k) "End" declares a dialog that Enter does not open']);
  assert.deepEqual(walked({ dialogs: [{ name: '', trigger: 'End', opened: false, pending: true }] }),
    ['(k) "End" reads open but draws no dialog']);
  assert.deepEqual(walked({ undeclared: [{ name: 'End', opener: 'End' }] }),
    ['(k) "End" opens dialog "End" but does not declare it (aria-haspopup)']);
  // Drawn with no trigger in its story, its Escape and return are walked where its trigger is.
  assert.deepEqual(walked({ dialogs: [{ ...dialog, trigger: null, closed: null, returned: null }] }), []);
});

test('(k) focus that lands on a control an open dialog covers fails, once per control', () => {
  const dialog = walk.dialogs[0];
  assert.deepEqual(walked({
    sequence: [...walk.sequence, { index: 0, label: 'Snooze', changed: true, covered: true }],
    dialogs: [{ ...dialog, obscured: ['Snooze', 'Lows'] }],
  }).filter((line) => line.startsWith('(k)')), [
    '(k) focus lands on "Snooze", which an open dialog covers',
    '(k) focus lands on "Lows", which an open dialog covers',
  ]);
});

test('(l) a phone control that misses a tap 22 px from its centre fails', () => {
  assert.deepEqual(walked({ controls: withControl(1, { misses: ['above', 'below'] }) }),
    ['(l) "Snooze" takes no tap 22 px above, below of its centre']);
  assert.deepEqual(walked({ controls: withControl(1, { misses: ['above'], exempt: ['l'] }) }), []);
});

test('(l) a pinned control that loses a tap to one scrolled under it fails, at any width', () => {
  assert.deepEqual(walked({ controls: withControl(1, { stolen: ['End'] }) }),
    ['(l) "Snooze" loses a tap to "End" scrolled under it']);
});

test('(m) a status outside a live region fails', () => {
  assert.deepEqual(walked({ statuses: [{ text: 'Recorded', live: false }] }), ['(m) "Recorded" is not in a live region']);
});

test('(n) a token pair under its ratio fails; the ratio is WCAG\'s', () => {
  assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]).toFixed(2), '21.00');
  assert.equal(contrastRatio([118, 118, 118], [255, 255, 255]).toFixed(2), '4.54');
  assert.deepEqual(contrastProblems([{ fg: '--a', bg: '--b', min: 4.5, rgb: { fg: [119, 119, 119], bg: [255, 255, 255] } }]),
    ['(n) --a on --b is 4.48:1, under 4.5:1']);
  assert.deepEqual(contrastProblems([{ fg: '--a', bg: '--b', min: 4.5, rgb: { fg: [118, 118, 118], bg: [255, 255, 255] } }]), []);
});
