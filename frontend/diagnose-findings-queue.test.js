/* The findings queue's copy and row grammar (lock terms 34–45), against the real
 * projection's own frozen output — never a hand-written row.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EMPTY_LINE, HELD_PREFIX, TAIL_NOTE, queueMeta, queueRows,
} from './diagnose-findings-queue.js';

const fixture = JSON.parse(readFileSync(
  fileURLToPath(new URL('./__fixtures__/findings-projection.json', import.meta.url)), 'utf8'));
const W = fixture.windows;

test('term 45 · the meta has three forms and no others', () => {
  assert.equal(queueMeta(W.global), '6 findings · 30 days');
  assert.equal(queueMeta(W.afternoon), '5 in this window');
  assert.equal(queueMeta(fixture.no_data.global), '30 days');
  // never sort language, never the window range restated — the chip owns the hours
  for (const projection of [W.global, W.afternoon, W.overnight, fixture.no_data.morning]) {
    const meta = queueMeta(projection);
    assert.doesNotMatch(meta, /ranked|sort|bar:/i, `${meta} carries sort language`);
    assert.doesNotMatch(meta, /\d\d:\d\d/, `${meta} restates the window range`);
  }
});

test('term 41 · a scoped EMPTY window says only how much history it looked at', () => {
  // term 41 governs an empty WINDOW, so the empty form beats the scoped one:
  // ranking language needs something ranked, and "0 in this window" counts a thing
  // that is not there
  assert.equal(fixture.no_data.morning.window.scoped, true);
  assert.equal(queueMeta(fixture.no_data.morning), '30 days');
  assert.equal(EMPTY_LINE, 'No pattern or setting asserts a direction in this window.');
});

test('term 34 · settings and habits interleave in one list, ordered by the server', () => {
  const rows = queueRows(W.global);
  assert.deepEqual(rows.map((r) => r.flavor),
    ['setting', 'setting', 'setting', 'habit', 'habit', 'habit']);
  // the order is the projection's, untouched
  assert.deepEqual(rows.map((r) => r.title), W.global.rows.map((r) => r.title));
});

test('term 36 · a row is flavored by the server register, glyph and word together', () => {
  for (const row of queueRows(W.afternoon)) {
    assert.equal(row.flavor, row.raw.kind === 'setting' ? 'setting' : 'habit');
  }
});

test('term 35 · a finding keeps EVERY family appearance, never a merged total', () => {
  const overTreated = queueRows(W.global).find((r) => r.title === 'Over-treated low');
  assert.deepEqual(overTreated.detail,
    { kind: 'appearances', parts: [{ count: '1 of 4', noun: 'highs' }, { count: '1 of 6', noun: 'lows' }] });
});

test('term 42 · the seam opens once, before the first UNPRICED ranked row', () => {
  const rows = queueRows(W.global);
  const seams = rows.filter((r) => r.seam);
  assert.equal(seams.length, 1);
  assert.equal(seams[0].title, 'Correction stacking');
  assert.equal(seams[0].raw.priority, null);
  // every row above it is priced; the seam is the boundary, not a heading
  const at = rows.indexOf(seams[0]);
  assert.ok(rows.slice(0, at).every((r) => r.raw.priority != null));
  assert.equal(TAIL_NOTE, 'Not recurring often enough to rank yet.');
});

test('term 42 · fixture windows never caption a held or blind row as the tail', () => {
  // These are the fixture's server-owned queue positions. A held/blind row is
  // demoted, but it is not the unpriced ranked row the tail sentence describes.
  const expected = {
    global: ['Correction stacking'],
    afternoon: ['Correction stacking'],
    low_block: [],
    morning: [],
    overnight: [],
    quiet: [],
    rebound: [],
  };
  for (const [window, titles] of Object.entries(expected)) {
    assert.deepEqual(queueRows(W[window]).filter((row) => row.seam).map((row) => row.title),
      titles, window);
  }
});

test('term 42 · held and blind rows never open the seam — they are their own register', () => {
  const rows = queueRows(W.afternoon);
  const demoted = rows.filter((r) => r.register === 'held' || r.register === 'blind');
  assert.ok(demoted.length >= 2);
  assert.ok(demoted.every((r) => !r.seam));
  // the server's unpriced-tail tier also covers the held and blind tail rows
  assert.ok(demoted.every((r) => r.tier === 'noted'));
});

test('the queue consumes the server tier and never reclassifies a row', () => {
  const projection = {
    ...W.global,
    rows: W.global.rows.map((row) => ({
      ...row,
      // Deliberately contradict the fields the former browser derivation read.
      register: row.register === 'assert' ? 'blind' : 'assert',
      priority: row.priority == null ? 99 : null,
    })),
  };
  const rows = queueRows(projection);
  assert.deepEqual(rows.map((row) => row.tier), W.global.rows.map((row) => row.tier));
});

test('term 14/38 · a held row is words-first and offers no stage affordance', () => {
  const isf = queueRows(W.low_block).find((r) => r.title === 'ISF');
  assert.equal(isf.register, 'held');
  assert.equal(isf.stageable, false);
  assert.deepEqual(isf.detail, {
    kind: 'reason',
    text: 'no direction asserted — your fasting data agrees with the set correction factor',
  });
  assert.equal(HELD_PREFIX, 'no direction asserted — ');
});

test('term 14 · a blind span carries the analyzer\u2019s own reason, verbatim', () => {
  const blind = queueRows(W.afternoon).find((r) => r.register === 'blind');
  assert.equal(blind.title, 'Basal 19:30 to 21:00');
  assert.equal(blind.detail.text, `${HELD_PREFIX}no data`);
  assert.equal(blind.stageable, false);
});

test('term 38 · the global queue is asserting-only, so every setting row stages', () => {
  const settings = queueRows(W.global).filter((r) => r.flavor === 'setting');
  assert.ok(settings.length > 0);
  assert.ok(settings.every((r) => r.register === 'assert' && r.stageable));
});

test('term 16 · a merged span prints its OWN support denominator, never an invented average', () => {
  const merged = queueRows(W.global).find((r) => r.title === 'Basal 00:30 to 01:30 · raise');
  assert.equal(merged.raw.current, null, 'the server left the span\u2019s numbers on its members');
  assert.deepEqual(merged.detail,
    { kind: 'support', parts: [{ count: '19', noun: 'clean nights' }, '30 d run'] });
});

test('a single asserting item prints the number pair the mock shows', () => {
  const slot = queueRows(W.global).find((r) => r.title === 'Basal 05:30 · raise');
  assert.deepEqual(slot.detail, { kind: 'nums', now: 'now 0.8 U/hr → ', then: '0.96 U/hr' });
  const ic = queueRows(W.global).find((r) => r.title.startsWith('I:C'));
  assert.deepEqual(ic.detail, { kind: 'nums', now: 'now 5.7 g/U → ', then: '5.0 g/U' });
});

test('an empty window yields no rows at all, so the calm line is what renders', () => {
  assert.deepEqual(queueRows(fixture.no_data.morning), []);
  assert.deepEqual(queueRows(null), []);
});

test('term 42 · with nothing priced there is no boundary, so no seam sentence', () => {
  // the shape the committed demo payload lands in: no tuning_levers, no scenario
  // priorities, so every ranked row is unpriced and the tail has nothing to follow
  const unpriced = {
    window: { scoped: false }, findings_window: { days: 30 },
    rows: fixture.windows.global.rows.map((r) => ({
      ...r, priority: null, tier: 'noted',
    })),
  };
  assert.equal(queueRows(unpriced).filter((r) => r.seam).length, 0);
});
