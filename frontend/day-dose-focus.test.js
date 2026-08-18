// #385 — tests for the Day-chart dose-focus core. Node's built-in runner, no npm
// deps / no DOM: the pure event model, chronological reveal copy, PIXEL-proximity
// grouping, and the preview/pin state machine. The DOM overlay/capsule lifecycle
// lives in index.html and is exercised in the browser; here we lock the RULES a
// regression could quietly break.
//
//     node --test 'frontend/**/*.test.js'

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  doseEvents, eventLabel, eventValue, eventKey, clusterByPixels,
  initDoseFocus, doseFocusReduce,
} from './day-dose-focus.js';

const DAY = '2026-07-15';
const toMs = (t) => new Date(String(t).replace(' ', 'T')).getTime();

// A day with the reported cluster: two boluses ~1m40s apart (one a meal bolus with
// pump carbs), plus a separately-logged manual carb between them.
const day = () => ({
  boluses: [
    { t: `${DAY} 12:03:29`, insulin: 1.5, carbs: 0, bg: 180 },   // correction
    { t: `${DAY} 12:05:09`, insulin: 4.6, carbs: 25, bg: 0 },    // meal bolus + carbs
  ],
});
const carbs = () => [{ t: `${DAY} 12:04:30`, grams: 15, certainty: 'exact', source: 'manual' }];

// ---------------------------------------------------------------------------
// (1) The event model — one event per bolus (its pump-carb diamond stays PART of
//     the bolus, never a second event); a logged carb is its own event.
// ---------------------------------------------------------------------------

test('doseEvents: a meal bolus with pump carbs is ONE event, not two (#385 ×N guard)', () => {
  // Boluses only, no manual carbs: the meal bolus carries 25g but is a single event.
  const events = doseEvents(day(), [], toMs);
  assert.equal(events.length, 2);
  assert.equal(events.filter((e) => e.type === 'bolus').length, 2);
  // The carb-bearing bolus did not spawn a separate 'logged' event.
  assert.equal(events.filter((e) => e.type === 'logged').length, 0);
});

test('doseEvents: a manual carb counts as its own event, separate from boluses', () => {
  const events = doseEvents(day(), carbs(), toMs);
  assert.equal(events.length, 3);
  assert.equal(events.filter((e) => e.type === 'logged').length, 1);
  // Chronological order, and the manual carb lands between the two boluses.
  assert.deepEqual(events.map((e) => e.type), ['bolus', 'logged', 'bolus']);
});

test('doseEvents: tolerates a day with no boluses / no carbs', () => {
  assert.deepEqual(doseEvents({}, undefined, toMs), []);
  assert.deepEqual(doseEvents({ boluses: [] }, [], toMs), []);
});

// ---------------------------------------------------------------------------
// (2) Reveal copy — exact per-event value, NEVER a summed total.
// ---------------------------------------------------------------------------

test('eventValue/eventLabel: exact per-event dose, no aggregation', () => {
  const [correction, meal] = doseEvents(day(), [], toMs);
  assert.equal(eventLabel(correction), 'Correction');
  assert.equal(eventValue(correction), '1.5U');
  assert.equal(eventLabel(meal), 'Meal bolus');
  assert.equal(eventValue(meal), '4.6U · 25g');   // its OWN insulin + its OWN carbs, not a total
});

test('eventValue: logged-carb certainty preserved (~ estimate, ? unknown)', () => {
  const mk = (grams, certainty) => ({ type: 'logged', raw: { grams, certainty } });
  assert.equal(eventValue(mk(15, 'exact')), '15g logged');
  assert.equal(eventValue(mk(20, 'estimate')), '~20g logged');
  assert.equal(eventValue(mk(null, 'unknown')), '? logged');
});

// ---------------------------------------------------------------------------
// (3) Grouping is by VISUAL PIXEL PROXIMITY at the current width — not a fixed
//     time window. Two events far apart in TIME but close in PIXELS group; two
//     close in time but far in pixels do not.
// ---------------------------------------------------------------------------

test('clusterByPixels: groups by pixel gap, ignoring the time gap', () => {
  const events = doseEvents(day(), [], toMs);
  // Project onto pixels: the two boluses (100s apart in time) land 10px apart.
  events[0].x = 400;
  events[1].x = 410;
  const groups = clusterByPixels(events, 24);
  assert.equal(groups.length, 1, 'within the pixel span → one cluster');
  assert.equal(groups[0].events.length, 2);
});

test('clusterByPixels: same times, wider render → the cluster splits', () => {
  // Identical events/times as above, but a wider chart spreads them past the span.
  const events = doseEvents(day(), [], toMs);
  events[0].x = 400;
  events[1].x = 480;   // 80px apart now
  const groups = clusterByPixels(events, 24);
  assert.equal(groups.length, 2, 'pixel gap exceeds the span → two singles');
});

test('clusterByPixels: proves it is NOT a fixed time window', () => {
  // Two events 6 HOURS apart in time but rendered 8px apart (e.g. a zoomed-out day).
  const events = [
    { type: 'bolus', ms: toMs(`${DAY} 06:00:00`), x: 200 },
    { type: 'bolus', ms: toMs(`${DAY} 12:00:00`), x: 208 },
  ];
  const groups = clusterByPixels(events, 24);
  assert.equal(groups.length, 1, 'a time-window grouper would keep these apart; a pixel one clusters them');
});

test('clusterByPixels: assigns draw-order index and a stable id', () => {
  const events = [
    { type: 'bolus', ms: 3, x: 300 },
    { type: 'bolus', ms: 1, x: 100 },
    { type: 'logged', ms: 2, x: 108 },
  ];
  const groups = clusterByPixels(events, 24);
  assert.deepEqual(groups.map((g) => g.index), [0, 1]);
  // Sorted by x → the first group holds the two pixel-near events (x100, x108),
  // keyed by type:ms; the far event (x300) is its own group.
  assert.equal(groups[0].id, `${eventKey({ type: 'bolus', ms: 1 })}|${eventKey({ type: 'logged', ms: 2 })}`);
  assert.equal(groups[1].id, eventKey({ type: 'bolus', ms: 3 }));
});

// ---------------------------------------------------------------------------
// (4) The preview/pin state machine. A pin ignores hover elsewhere; another pin
//     switches it; Close/Escape restore-focus does NOT reopen the capsule.
// ---------------------------------------------------------------------------

const g1 = { id: 'g1', events: [{ type: 'bolus', ms: 1 }] };
const g2 = { id: 'g2', events: [{ type: 'bolus', ms: 2 }] };

test('doseFocusReduce: hover previews; leaving the same source clears it', () => {
  let s = initDoseFocus();
  s = doseFocusReduce(s, { type: 'preview', group: g1, source: 'chart' });
  assert.equal(s.activeGroup, g1);
  assert.equal(s.pinned, false);
  s = doseFocusReduce(s, { type: 'clearPreview', source: 'chart' });
  assert.equal(s.activeGroup, null);
});

test('doseFocusReduce: a PIN ignores a later hover elsewhere (hover cannot replace a pin)', () => {
  let s = initDoseFocus();
  s = doseFocusReduce(s, { type: 'pin', group: g1 });
  assert.equal(s.pinned, true);
  s = doseFocusReduce(s, { type: 'preview', group: g2, source: 'chart' });
  assert.equal(s.activeGroup, g1, 'the pin held; hover did not switch it');
  assert.equal(s.pinned, true);
});

test('doseFocusReduce: clicking another target SWITCHES the pin', () => {
  let s = initDoseFocus();
  s = doseFocusReduce(s, { type: 'pin', group: g1 });
  s = doseFocusReduce(s, { type: 'pin', group: g2 });
  assert.equal(s.activeGroup, g2);
  assert.equal(s.pinned, true);
});

test('doseFocusReduce: a pinned clearPreview is a no-op', () => {
  let s = initDoseFocus();
  s = doseFocusReduce(s, { type: 'pin', group: g1 });
  s = doseFocusReduce(s, { type: 'clearPreview', source: 'chart' });
  assert.equal(s.activeGroup, g1, 'a stray hover-out cannot dismiss a pin');
});

test('doseFocusReduce: Close with restoreFocus does NOT reopen when focus returns to the trigger', () => {
  const trigger = { id: 'trigger-node' };
  let s = initDoseFocus();
  s = doseFocusReduce(s, { type: 'pin', group: g1 });
  s = doseFocusReduce(s, { type: 'close', restoreFocus: true, trigger });
  assert.equal(s.activeGroup, null, 'closed');
  assert.equal(s.suppressedTrigger, trigger);
  // The caller restores keyboard focus to the trigger — that focus must NOT reopen.
  s = doseFocusReduce(s, { type: 'focus', group: g1, trigger });
  assert.equal(s.activeGroup, null, 'focus on the just-closed trigger stays closed');
  assert.equal(s.suppressedTrigger, null, 'suppression is consumed once');
  // A subsequent, deliberate focus DOES preview again.
  s = doseFocusReduce(s, { type: 'focus', group: g2, trigger: { id: 'other' } });
  assert.equal(s.activeGroup, g2);
});

test('doseFocusReduce: a blank-click close (no restoreFocus) clears without arming suppression', () => {
  let s = initDoseFocus();
  s = doseFocusReduce(s, { type: 'pin', group: g1 });
  s = doseFocusReduce(s, { type: 'close' });
  assert.equal(s.activeGroup, null);
  assert.equal(s.suppressedTrigger, null);
});
