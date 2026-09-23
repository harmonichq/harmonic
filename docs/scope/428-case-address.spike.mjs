// #428 spike: the two rules ADR 428 depends on, as table tests. Not shipped
// code; the implementation owns its own copies in frontend/tab-routing.js
// (the case address) and frontend/diagnose.js (the preset match) with their own
// tests. Run: node --test docs/scope/428-case-address.spike.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

// The case address: exactly the case keys the entry restoration reads, plus a
// `from` that names a destination other than Diagnose (the Changes return that
// Diagnose itself renders). Every Day-hop key is dropped.
function caseAddress(onScreen = {}, from = '') {
  const address = {};
  for (const key of ['subject', 'occurrence', 'window']) if (onScreen[key]) address[key] = onScreen[key];
  if (from && String(from).split('.')[0] !== 'diagnose') address.from = from;
  return address;
}

// The clock presets the Window control offers (diagnose-workstation.js WINDOWS).
const PRESETS = [['Overnight', 0, 360], ['Morning', 360, 720], ['Afternoon', 720, 1080],
  ['Evening', 1080, 1440], ['24 h', 0, 1440]];
function presetFor(window) {
  const match = /^(\d+)-(\d+)$/.exec(window || '');
  if (!match) return null;
  const [start, end] = [Number(match[1]), Number(match[2])];
  return PRESETS.find(([, s, e]) => s === start && e === end)?.[0] || null;
}

test('the case address keeps only the case keys', () => {
  const dayReturn = { date: '2024-06-26', moment: '2024-06-26 13:55:00', subject: 'finding:x',
    occurrence: 'occ-7', window: '360-720', lever: 'late_bolus', from: 'diagnose',
    focus: '.occ-foot button:last-child' };
  assert.deepEqual(caseAddress(dayReturn, dayReturn.from),
    { subject: 'finding:x', occurrence: 'occ-7', window: '360-720' });
});

test('from survives only when it names another destination', () => {
  assert.deepEqual(caseAddress({ subject: 'finding:x' }, 'changes'), { subject: 'finding:x', from: 'changes' });
  assert.deepEqual(caseAddress({ subject: 'finding:x' }, 'diagnose'), { subject: 'finding:x' });
  assert.deepEqual(caseAddress({ subject: 'finding:x' }, 'diagnose.questions'), { subject: 'finding:x' });
});

test('no case on screen is no context at all', () => {
  assert.deepEqual(caseAddress({}, 'diagnose'), {});
  assert.deepEqual(caseAddress({ subject: '', occurrence: '', window: '' }), {});
  assert.deepEqual(caseAddress({}, 'changes'), { from: 'changes' });
});

test('an occurrence is named only while one is selected', () => {
  assert.deepEqual(caseAddress({ subject: 'basal:180', occurrence: null, window: '180-210' }),
    { subject: 'basal:180', window: '180-210' });
});

test('a window matches a clock preset only by exact range', () => {
  assert.equal(presetFor('0-360'), 'Overnight');
  assert.equal(presetFor('360-720'), 'Morning');
  assert.equal(presetFor('720-1080'), 'Afternoon');
  assert.equal(presetFor('1080-1440'), 'Evening');
  assert.equal(presetFor('0-1440'), '24 h');
  // A drawn window, a cross-midnight Pattern scope and an absent window match none.
  assert.equal(presetFor('135-285'), null);
  assert.equal(presetFor('1320-120'), null);
  assert.equal(presetFor(''), null);
  assert.equal(presetFor(undefined), null);
});
