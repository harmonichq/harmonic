// Node built-in test runner (no npm). Covers the vue-free MOBILE Day hero core (#332):
// the findings-vs-quiet RING BAND split (only findings + also-checked ring the curve;
// clean / no-data / explained near-misses recede to a faint tick off the line) and the
// single cross-track focus hairline across the hero + each open accordion strip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rowBand, buildHeroAnchorOverlay, heroFocusUpdate, stripFocusGraphic,
  buildHeroOption, buildBasalStripOption, buildContextStripOption, HERO,
} from './day-hero-chart.js';
import { buildRows, preemptedTimes, bgAt, anchorStateColor } from './day-chart.js';

const COLORS = { text: '#000', muted: '#888', line: '#ccc', surface: '#fff', primary: '#1C6E8C',
  warn: '#93701B', accent: '#C2554D', notindata: '#69727B', high: '#C2554D', low: '#B3402C',
  inRange: '#1C6E8C', manualCarb: '#866619', manualCarbSoft: '#F6EFDC', secondary: '#566069',
  onTarget: '#2A8C5E', basal: '#4A6FA5' };

// A day with one of every band: a FIRED meal (finding), a load-bearing near-miss
// (also-checked, an under-threshold verdict), an explained-away near-miss (quiet,
// upstream_cause), a CLEAN meal (quiet), and a no-data anchor (quiet).
function mixedDay() {
  return {
    date: '2026-07-12', midnight: '2026-07-12 00:00:00',
    window: {
      start: '2026-07-12 00:00:00', end: '2026-07-12 23:59:59',
      cgm: [
        { t: '2026-07-12 10:17:00', bg: 205 }, { t: '2026-07-12 13:00:00', bg: 150 },
        { t: '2026-07-12 16:00:00', bg: 120 }, { t: '2026-07-12 21:30:00', bg: 240 },
      ],
      carb_exclusion_spans: [],
    },
    episodes: [
      { id: 'ep-fired', lever: 'carb_undercount', spans_midnight: false,
        start: '2026-07-12 10:17:00', end: '2026-07-12 12:00:00', steps: [],
        anchors: [{ t: '2026-07-12 10:17:00', kind: 'meal', bg: null, insulin: 4, carbs: 40, state: 'fired',
          verdicts: [{ classifier: 'carb_undercount', matched: true, detail: 'ran away', evidence_tier: 'observed', silence_reason: null }] }] },
      { id: 'ep-near', lever: 'carb_undercount', spans_midnight: false,
        start: '2026-07-12 13:00:00', end: '2026-07-12 14:00:00', steps: [],
        anchors: [{ t: '2026-07-12 13:00:00', kind: 'meal', bg: 150, insulin: 3, carbs: 30, state: 'near_miss',
          verdicts: [{ classifier: 'carb_undercount', matched: false, detail: 'gap under bar', evidence_tier: 'observed', silence_reason: 'under_threshold' }] }] },
      { id: 'ep-explained', lever: null, spans_midnight: false,
        start: '2026-07-12 16:00:00', end: '2026-07-12 17:00:00', steps: [],
        anchors: [{ t: '2026-07-12 16:00:00', kind: 'high', bg: 120, state: 'near_miss',
          verdicts: [{ classifier: 'missed_meal', matched: false, detail: 'rescue rebound', evidence_tier: 'inferred', silence_reason: 'upstream_cause' }] }] },
      { id: 'ep-clean', lever: null, spans_midnight: false,
        start: '2026-07-12 21:30:00', end: '2026-07-12 22:00:00', steps: [],
        anchors: [{ t: '2026-07-12 21:30:00', kind: 'meal', bg: null, insulin: 2, carbs: 20, state: 'clean',
          verdicts: [{ classifier: 'carb_undercount', matched: false, detail: 'clean', evidence_tier: 'observed', silence_reason: 'no_trigger' }] }] },
      { id: 'ep-nodata', lever: null, spans_midnight: false,
        start: '2026-07-12 04:00:00', end: '2026-07-12 05:00:00', steps: [],
        anchors: [{ t: '2026-07-12 04:00:00', kind: 'low', bg: null, state: 'no_data', verdicts: [] }] },
    ],
  };
}

test('rowBand: findings + load-bearing near-miss are loud; clean/no-data/explained are quiet', () => {
  const rows = buildRows(mixedDay());
  const band = (t) => rowBand(rows.find((r) => r.t === t));
  assert.equal(band('2026-07-12 10:17:00'), 'finding');       // fired
  assert.equal(band('2026-07-12 13:00:00'), 'alsoChecked');   // under-threshold near-miss
  assert.equal(band('2026-07-12 16:00:00'), 'quiet');         // explained upstream
  assert.equal(band('2026-07-12 21:30:00'), 'quiet');         // clean
  assert.equal(band('2026-07-12 04:00:00'), 'quiet');         // no data
});

test('hero overlay rings ONLY findings + also-checked; clean/no-data/explained fall to the tick rail (#332)', () => {
  const day = mixedDay();
  const rows = buildRows(day);
  const bgLookup = (t) => bgAt(day, t);
  const series = buildHeroAnchorOverlay(day, rows, COLORS, null, preemptedTimes(day), bgLookup);

  const rings = series.find((s) => s.id === 'day-anchor-markers').data;
  const ticks = series.find((s) => s.id === 'day-anchor-quiet').data;

  // Exactly the two loud moments ring the curve (on the glucose lane, grid 0)…
  assert.equal(rings.length, 2);
  assert.deepEqual(rings.map((m) => m._t).sort(),
    ['2026-07-12 10:17:00', '2026-07-12 13:00:00']);
  const ringSeries = series.find((s) => s.id === 'day-anchor-markers');
  assert.equal(ringSeries.xAxisIndex, 0, 'rings sit on the glucose lane');
  assert.equal(ringSeries.yAxisIndex, 0);

  // …and the three quiet moments become faint ticks off the line (dosing lane, grid 1).
  assert.equal(ticks.length, 3);
  assert.deepEqual(ticks.map((m) => m._t).sort(),
    ['2026-07-12 04:00:00', '2026-07-12 16:00:00', '2026-07-12 21:30:00']);
  const tickSeries = series.find((s) => s.id === 'day-anchor-quiet');
  assert.equal(tickSeries.yAxisIndex, 1, 'quiet ticks ride the dosing strip, not glucose');

  // The clutter bug this guards: a CLEAN anchor must NEVER be drawn as a ring.
  assert.ok(!rings.some((m) => m._t === '2026-07-12 21:30:00'),
    'a clean anchor is quiet — it must not ring the curve');
});

test('hero rings resolve a bg=null meal anchor to its nearest CGM value', () => {
  const day = mixedDay();
  const rows = buildRows(day);
  const bgLookup = (t) => bgAt(day, t);
  const series = buildHeroAnchorOverlay(day, rows, COLORS, null, preemptedTimes(day), bgLookup);
  const fired = series.find((s) => s.id === 'day-anchor-markers').data.find((m) => m._t === '2026-07-12 10:17:00');
  assert.equal(fired.value[1], 205, 'the fired meal rings at the 10:17 CGM value, not null');
});

test('heroFocusUpdate: focus ⇒ exactly ONE hero hairline (state hue, spanning the card); blur ⇒ zero (#332)', () => {
  const day = mixedDay();
  const rows = buildRows(day);
  const bgLookup = (t) => bgAt(day, t);
  const fakeChart = {
    convertToPixel: (_finder, v) => {
      assert.equal(typeof v, 'number');
      assert.ok(Number.isFinite(v), 'focus x is a finite epoch-ms value');
      return 180;
    },
    getHeight: () => 300,
  };
  const args = (focusT) => ({ mvDay: day, rows, colors: COLORS, focusT, preempted: preemptedTimes(day), bgLookup });

  const focT = '2026-07-12 10:17:00';
  const { series, graphic } = heroFocusUpdate(fakeChart, args(focT));
  assert.equal(graphic.length, 1, 'one hairline while focused');
  assert.deepEqual([graphic[0].shape.x1, graphic[0].shape.x2], [180, 180], 'vertical at the focused x');
  assert.equal(graphic[0].shape.y1, HERO.spanTop);
  assert.equal(graphic[0].shape.y2, HERO.spanBottom);
  assert.equal(graphic[0].style.stroke, anchorStateColor('fired', COLORS));
  // the focused ring is the enlarged one, id-tagged so the host merges (never rebuilds).
  const markers = series.find((s) => s.id === 'day-anchor-markers');
  assert.equal(markers.data.find((m) => m._t === focT).symbolSize, 16);

  const blurred = heroFocusUpdate(fakeChart, args(null));
  assert.equal(blurred.graphic.length, 0, 'no hairline when nothing is focused');
});

test('stripFocusGraphic: one full-height line per open strip at the focus, none when blurred', () => {
  const fakeChart = { convertToPixel: () => 180, getHeight: () => 92 };
  const g = stripFocusGraphic(fakeChart, '2026-07-12 10:17:00', COLORS.primary);
  assert.equal(g.length, 1);
  assert.deepEqual([g[0].shape.y1, g[0].shape.y2], [0, 92], 'spans the full strip height');
  assert.equal(stripFocusGraphic(fakeChart, null, COLORS.primary).length, 0);
});

test('hero option: dosing marks carry NO inline U/g value labels (the rejected round-1 collision)', () => {
  const timeline = {
    start: '2026-07-12 00:00:00', end: '2026-07-12 23:59:59',
    cgm: [{ t: '2026-07-12 10:17:00', bg: 205 }],
    boluses: [{ t: '2026-07-12 10:17:00', insulin: 4.5, carbs: 55 }],
    basal: [{ t: '2026-07-12 00:00:00', basal_rate: 0.8, profile_basal_rate: 0.8 }],
    sleep_windows: [], pump_events: [],
  };
  const opt = buildHeroOption(timeline, '2026-07-12', {
    colors: COLORS, carbEntries: [{ t: '2026-07-12 15:00:00', grams: 12, certainty: 'estimate' }],
    xMin: 0, xMax: 1, showTimeAxis: true });
  for (const name of ['Bolus', 'Bolus carbs', 'Carbs (logged)']) {
    const s = opt.series.find((x) => x.name === name);
    assert.ok(s.data.every((d) => !d.label), `${name} marks must not carry an inline value label`);
  }
});

test('lowest-open-strip axis: showTimeAxis drives whether HH:MM labels render', () => {
  const timeline = {
    start: '2026-07-12 00:00:00', end: '2026-07-12 23:59:59',
    cgm: [{ t: '2026-07-12 10:00:00', bg: 120 }],
    boluses: [], basal: [{ t: '2026-07-12 00:00:00', basal_rate: 0.8, profile_basal_rate: 0.8 }],
    sleep_windows: [], pump_events: [],
  };
  const heroOn = buildHeroOption(timeline, '2026-07-12', { colors: COLORS, xMin: 0, xMax: 1, showTimeAxis: true });
  const heroOff = buildHeroOption(timeline, '2026-07-12', { colors: COLORS, xMin: 0, xMax: 1, showTimeAxis: false });
  assert.equal(heroOn.xAxis[1].axisTick.show, true);
  assert.equal(heroOff.xAxis[1].axisLabel.show, false);

  const basalBottom = buildBasalStripOption(timeline, { colors: COLORS, xMin: 0, xMax: 1, showTimeAxis: true });
  const basalHidden = buildBasalStripOption(timeline, { colors: COLORS, xMin: 0, xMax: 1, showTimeAxis: false });
  assert.equal(basalBottom.xAxis[0].axisTick.show, true);
  assert.equal(basalHidden.xAxis[0].axisLabel.show, false);

  const ctx = buildContextStripOption(timeline, { colors: COLORS, restWindows: [], xMin: 0, xMax: 1, showTimeAxis: true });
  assert.equal(ctx.xAxis[0].axisTick.show, true);
});
