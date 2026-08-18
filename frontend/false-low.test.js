// #381 — the false-low (compression low) frontend pieces: the greyed sensor-artifact
// ghost on the Day glucose lane, and the stored-answer label. Node's built-in runner,
// no importmap / no DOM — the same seam as chart-builders.test.js.
//
//     node --test 'frontend/**/*.test.js'

import test from 'node:test';
import assert from 'node:assert/strict';

import { falseLowGhost, buildLanesOption } from './chart-builders.js';
import { buildHeroOption } from './day-hero-chart.js';
import { answerLabel } from './prompt-queue.js';

const COLORS = {
  text: '#1B2126', muted: '#69727B', line: '#E3E7EA', primary: '#1C6E8C',
  accent: '#C2554D', secondary: '#566069', high: '#B3402C', inRange: '#1C6E8C',
  low: '#B3402C', surface: '#FFFFFF', onTarget: '#2E8B57', warn: '#D9A93A',
  surface2: '#F4F6F7', manualCarb: '#866619', manualCarbSoft: '#F6EFDC',
  basal: '#4A6FA5', onPrimary: '#FFFFFF',
};
const toMs = (t) => new Date(String(t).replace(' ', 'T')).getTime();

// A tiny overnight compression V: calm 110, a plunge to 47, a fake rebound to 186.
function vNight() {
  const cgm = [];
  const push = (hh, mm, bg) => cgm.push({ t: `2026-06-21 ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`, bg });
  for (let m = 0; m < 150; m += 5) push(Math.floor(m / 60), m % 60, 110);      // calm
  [[2, 30, 108], [2, 35, 90], [2, 40, 66], [2, 45, 49], [2, 50, 47]].forEach((r) => push(...r));
  [[2, 55, 90], [3, 0, 150], [3, 5, 186]].forEach((r) => push(...r));           // fake rebound
  [[3, 10, 140], [3, 15, 118], [3, 20, 111]].forEach((r) => push(...r));
  for (let m = 205; m <= 300; m += 5) push(Math.floor(m / 60), m % 60, 110);    // settle back
  return cgm;
}
const SPANS = [{ anchor_t: '2026-06-21 02:50:00', start: '2026-06-21 02:30:00', end: '2026-06-21 03:20:00' }];
const cgmSorted = (day) => day.cgm.filter((p) => p.bg != null).slice().sort((a, b) => a.t < b.t ? -1 : 1);


test('falseLowGhost is inert with no spans', () => {
  const g = falseLowGhost(cgmSorted({ cgm: vNight() }), [], COLORS, toMs);
  assert.equal(g.ghostSeries.length, 0);
  assert.equal(g.inSpan(toMs('2026-06-21 02:50:00')), false);
});

test('falseLowGhost marks in-span readings and builds a dashed ghost + tag', () => {
  const g = falseLowGhost(cgmSorted({ cgm: vNight() }), SPANS, COLORS, toMs);
  // The nadir AND the fake rebound (above 70) are both inside the span.
  assert.equal(g.inSpan(toMs('2026-06-21 02:50:00')), true);   // 47 nadir
  assert.equal(g.inSpan(toMs('2026-06-21 03:05:00')), true);   // 186 rebound
  assert.equal(g.inSpan(toMs('2026-06-21 05:00:00')), false);  // calm baseline
  const ghost = g.ghostSeries.find((s) => s.id === 'false-low-ghost');
  assert.equal(ghost.lineStyle.type, 'dashed');
  // The ghost carries the excursion's real values, nulled elsewhere (so it draws only there).
  const drawn = ghost.data.filter((d) => d.value[1] != null);
  assert.ok(drawn.length >= 3);
  const tag = g.ghostSeries.find((s) => s.id === 'false-low-tag');
  assert.equal(tag.data[0].label.formatter, 'excluded');
});

test('buildLanesOption bridges the live glucose curve across a flagged excursion', () => {
  const day = { cgm: vNight(), boluses: [], basal: [], sleep_windows: [], rest_windows: [],
    pump_events: [], false_low_exclusion_spans: SPANS, start: '2026-06-21 00:00:00', end: '2026-06-21 06:00:00' };
  const opt = buildLanesOption(day, '2026-06-21', { colors: COLORS });
  const glucose = opt.series.find((s) => s.name === 'Glucose');
  assert.equal(glucose.connectNulls, true);                    // bridges the gap
  // The 47 nadir is nulled out of the LIVE curve (it lives on the ghost instead).
  const nadir = glucose.data.find((d) => d.value[0] === toMs('2026-06-21 02:50:00'));
  assert.equal(nadir.value[1], null);
  // The greyed ghost series is present.
  assert.ok(opt.series.some((s) => s.id === 'false-low-ghost'));
});

test('buildHeroOption also greys the excursion (mobile hero, the locked mockup fork)', () => {
  const day = { cgm: vNight(), boluses: [], basal: [], sleep_windows: [], rest_windows: [],
    pump_events: [], false_low_exclusion_spans: SPANS };
  const opt = buildHeroOption(day, '2026-06-21',
    { colors: COLORS, xMin: toMs('2026-06-21 00:00:00'), xMax: toMs('2026-06-21 06:00:00') });
  const glucose = opt.series.find((s) => s.name === 'Glucose');
  assert.equal(glucose.connectNulls, true);
  assert.ok(opt.series.some((s) => s.id === 'false-low-ghost'));
});

test('answerLabel names the false-low answer', () => {
  assert.equal(answerLabel('false-low'), 'not real (sensor artifact)');
  assert.equal(answerLabel('no'), 'no carbs');            // others unchanged
  assert.equal(answerLabel('carbs'), 'logged carbs');
});
