// #101 — tests for the pure chart-option builders. Node's built-in runner, no
// npm deps / no package.json:
//
//     node --test           (auto-discovers *.test.js from the repo root)
//
// These import chart-builders.js with no importmap and no DOM — the whole point
// of the #101 split. Fixtures under __fixtures__/ carry the real ``/api/analyze`` and
// ``/api/timeline`` payload SHAPE, but are SYNTHETIC (#728): invented inputs run
// through the real analyzers/endpoint builders by
// scripts/gen_chart_builder_fixtures.py, never hand-written or captured from
// real data — see each fixture's own ``_generated_by``/``_note`` stamp.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  buildLanesOption, suspendRuns,
  addMinutesIso,
} from './chart-builders.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(HERE, '__fixtures__', f), 'utf8'));
const analysisFixture = load('analysis.json');
const dayFixture = load('daily.day.json');
const DAY = '2024-04-02';

// Mirrors the Day surface color dict. getComputedStyle stays in the app — here
// we pass the resolved dict, exactly as the seam requires.
const COLORS = {
  text: '#1B2126', muted: '#69727B', line: '#E3E7EA',
  primary: '#1C6E8C', accent: '#C2554D', secondary: '#566069',
  high: '#B3402C', inRange: '#1C6E8C', low: '#B3402C', surface: '#FFFFFF',
  onTarget: '#2E8B57', warn: '#D9A93A', surface2: '#F4F6F7',
  manualCarb: '#866619', manualCarbSoft: '#F6EFDC',
  basal: '#4A6FA5', onPrimary: '#FFFFFF',
};

// Deep-clone helper so per-test mutation of the shared fixture can't leak.
const clone = (o) => JSON.parse(JSON.stringify(o));

const findSeries = (opt, name) => opt.series.find((s) => s.name === name);

// ---------------------------------------------------------------------------
// (1) #82 suspend contract — a suspend is a contiguous run of basal_rate===0
//     rows, NOT the delivery_type string.
// ---------------------------------------------------------------------------

test('suspendRuns: contiguous zero-rate rows collapse into one run with width', () => {
  const basal = [
    { t: `${DAY} 01:00:00`, basal_rate: 0.6, duration_mins: 5 },
    { t: `${DAY} 01:05:00`, basal_rate: 0,   duration_mins: 5 },
    { t: `${DAY} 01:10:00`, basal_rate: 0,   duration_mins: 5 },
    { t: `${DAY} 01:15:00`, basal_rate: 0.8, duration_mins: 5 },
    { t: `${DAY} 02:00:00`, basal_rate: 0,   duration_mins: 5 }, // trailing run to EOD
  ];
  const runs = suspendRuns(basal);
  assert.equal(runs.length, 2);
  // First run: 01:05 → 01:15 (ends at the next non-zero row's start).
  assert.deepEqual(runs[0], [`${DAY} 01:05:00`, `${DAY} 01:15:00`]);
  // Trailing run ends at last zero row + its own duration (real width, no EOD row).
  assert.deepEqual(runs[1], [`${DAY} 02:00:00`, `${DAY}T02:05:00`]);
});

// ---------------------------------------------------------------------------
// (2) addMinutesIso is wall-clock stable across midnight (cf. #89).
// ---------------------------------------------------------------------------

test('addMinutesIso: is wall-clock stable and crosses midnight cleanly', () => {
  assert.equal(addMinutesIso(`${DAY} 23:30:00`, 0), `${DAY}T23:30:00`);
  assert.equal(addMinutesIso(`${DAY} 23:30:00`, 60), '2024-04-03T00:30:00');
});

// ---------------------------------------------------------------------------
// (3) buildLanesOption — five aligned signal strips on a shared clock (#276).
// ---------------------------------------------------------------------------

const toMs = (t) => new Date(String(t).replace(' ', 'T')).getTime();

test('buildLanesOption: FIVE grids/axes on a shared time range (regression guard)', () => {
  const opt = buildLanesOption(dayFixture, DAY, { colors: COLORS });
  // The five aligned strips: glucose · evidence · insulin+carbs · basal Δ · context.
  assert.equal(opt.grid.length, 5);
  assert.equal(opt.xAxis.length, 5);
  assert.equal(opt.yAxis.length, 5);
  // Every strip shares the same x min/max so columns line up.
  const mins = opt.xAxis.map((a) => a.min);
  assert.ok(mins.every((m) => m === mins[0]));
  // Only the bottom strip shows time labels.
  assert.equal(opt.xAxis[0].axisLabel.show, false);
  assert.notEqual(opt.xAxis[4].axisLabel.show, false);
  assert.equal(opt.xAxis[4].axisLabel.formatter, '{HH}:{mm}');
  assert.equal(opt.xAxis[0].axisLabel.formatter, undefined);
});

test('buildLanesOption: NO persistent full-height evidence/flag lines (#276)', () => {
  // The Day chart draws no on-plot flag markLines: its only lengthwise guides
  // are the 70/180 glucose dashes and the basal zero line.
  const opt = buildLanesOption(dayFixture, DAY, { colors: COLORS });
  const flagLines = opt.series.filter((s) => s.markLine && (s.markLine.data || [])
    .some((d) => d && d.flagN != null));
  assert.equal(flagLines.length, 0);
  // The evidence strip (grid 1) carries no builder series — the Day surface fills it.
  assert.ok(opt.series.every((s) => s.xAxisIndex !== 1),
    'evidence strip is left empty for the anchor overlay');
});

test('buildLanesOption: basal strip shows the SIGNED delivered−programmed difference', () => {
  const opt = buildLanesOption(dayFixture, DAY, { colors: COLORS });
  const diff = findSeries(opt, 'Basal difference');
  assert.ok(diff, 'signed-difference series exists');
  assert.equal(diff.type, 'custom');
  assert.equal(diff.xAxisIndex, 3);
  // Each datum is [startMs, endMs, signedDiff]; every drawn delta matches one of
  // the raw slots' delivered−programmed (plateaus merge equal-delta slots, so the
  // block count can be < row count, but no phantom deltas appear).
  const rowDeltas = new Set(dayFixture.basal.map((b) =>
    +(((b.basal_rate ?? 0) - (b.profile_basal_rate ?? 0)).toFixed(3))));
  diff.data.forEach(([, , v]) => assert.ok(rowDeltas.has(v)));
  // The zero-centered linear axis spans both signs.
  assert.ok(opt.yAxis[3].min < 0 && opt.yAxis[3].max > 0);
});

// ---------------------------------------------------------------------------
// #394 — the BASAL Δ lane is duration-true stepped plateaus, not a smear. Each
// block spans only its own slots; a data gap is empty lane; equal-delta runs
// merge into one command; unequal ones stay separate.
// ---------------------------------------------------------------------------

// A partial-day fixture: the last synced basal row is a single 5-min +2.86 spike
// at 12:01, with the day's `end` at midnight (the mid-day view the reporter saw).
const emptyDay = () => ({
  start: `${DAY} 00:00:00`, end: `${DAY} 23:59:59`,
  cgm: [], boluses: [], pump_events: [], sleep_windows: [], basal: [],
});
const partialDay = () => ({
  ...emptyDay(),
  basal: [
    { t: `${DAY} 00:00:00`, duration_mins: 5, basal_rate: 0.6, profile_basal_rate: 0.6 },
    { t: `${DAY} 12:01:00`, duration_mins: 5, basal_rate: 3.463, profile_basal_rate: 0.6 },
  ],
});

test('#394 partial day: the last synced slot ends at its own +5 min, NOT end-of-day', () => {
  const opt = buildLanesOption(partialDay(), DAY, { colors: COLORS });
  const diff = findSeries(opt, 'Basal difference');
  const spike = diff.data.find(([, , v]) => v > 2);        // the +2.86 slot
  assert.ok(spike, 'the 12:01 spike is drawn');
  // Right edge is 12:06 — its own duration — not xMax (23:59:59). This assertion
  // fails against the pre-#394 smear, which set the last row's end to end-of-day.
  assert.equal(spike[1], toMs(`${DAY} 12:06:00`));
  assert.ok(spike[1] < toMs(`${DAY} 23:00:00`), 'no smear across the empty afternoon');
});

test('#394 gap: two rows 30 min apart produce no bar spanning the gap', () => {
  const day = {
    ...emptyDay(),
    basal: [
      { t: `${DAY} 08:00:00`, duration_mins: 5, basal_rate: 1.2, profile_basal_rate: 0.6 },
      { t: `${DAY} 08:30:00`, duration_mins: 5, basal_rate: 1.2, profile_basal_rate: 0.6 },
    ],
  };
  const diff = findSeries(buildLanesOption(day, DAY, { colors: COLORS }), 'Basal difference');
  // Two separate blocks, each 5 min wide — the 25-min gap is NOT bridged despite
  // identical deltas (contiguity, not equal-value, drives the merge).
  assert.equal(diff.data.length, 2);
  diff.data.forEach(([t0, t1]) => assert.equal(t1 - t0, 5 * 60000));
});

test('#394 plateau merge: equal-delta run is one block; unequal slots stay separate', () => {
  const day = {
    ...emptyDay(),
    basal: [
      { t: `${DAY} 09:00:00`, duration_mins: 5, basal_rate: 1.1, profile_basal_rate: 0.6 },
      { t: `${DAY} 09:05:00`, duration_mins: 5, basal_rate: 1.1, profile_basal_rate: 0.6 },
      { t: `${DAY} 09:10:00`, duration_mins: 5, basal_rate: 1.1, profile_basal_rate: 0.6 },
      { t: `${DAY} 09:15:00`, duration_mins: 5, basal_rate: 0.2, profile_basal_rate: 0.6 },
    ],
  };
  const diff = findSeries(buildLanesOption(day, DAY, { colors: COLORS }), 'Basal difference');
  assert.equal(diff.data.length, 2);
  // Block 1: the merged +0.5 run, 09:00 → 09:15 (three slots as one command).
  assert.equal(diff.data[0][0], toMs(`${DAY} 09:00:00`));
  assert.equal(diff.data[0][1], toMs(`${DAY} 09:15:00`));
  assert.ok(diff.data[0][2] > 0);
  // Block 2: the −0.4 cut stays its own block.
  assert.ok(diff.data[1][2] < 0);
});

test('#394 tooltip: still reports signed Δ, delivered, programmed, plus plateau duration', () => {
  const opt = buildLanesOption(partialDay(), DAY, { colors: COLORS });
  const html = opt.tooltip.formatter([{ axisValue: toMs(`${DAY} 12:03:00`) }]);
  assert.match(html, /Basal Δ/);
  assert.match(html, /Delivered basal/);
  assert.match(html, /Programmed basal/);
  assert.match(html, /5 min/);               // the hovered plateau's held duration
});

test('#394 tooltip: an empty data gap does not present the preceding basal row as current', () => {
  const opt = buildLanesOption(partialDay(), DAY, { colors: COLORS });
  const html = opt.tooltip.formatter([{ axisValue: toMs(`${DAY} 13:00:00`) }]);
  assert.doesNotMatch(html, /Basal Δ/);
  assert.doesNotMatch(html, /Delivered basal/);
  assert.doesNotMatch(html, /Programmed basal/);
  assert.doesNotMatch(html, /Command held/);
});

test('buildLanesOption: rest windows shade the fasting context ribbon, gated by showContext', () => {
  const restWindows = [{ start: `${DAY} 00:00:00`, end: `${DAY} 06:00:00` }];
  const on = buildLanesOption(dayFixture, DAY, { colors: COLORS, restWindows });
  const fasting = findSeries(on, 'Fasting');
  assert.equal(fasting.data.length, 1);
  assert.equal(fasting.xAxisIndex, 4, 'fasting rides the context strip');
  const off = buildLanesOption(dayFixture, DAY, { colors: COLORS, restWindows, showContext: false });
  assert.equal(findSeries(off, 'Fasting').data.length, 0);
});

test('buildLanesOption: suspend ribbon comes from zero-rate runs, not delivery_type', () => {
  // The fixture has two zero-rate runs → two context ribbon rects, keyed off
  // basal_rate === 0 (#82), never the delivery_type string.
  const clean = buildLanesOption(dayFixture, DAY, { colors: COLORS });
  assert.equal(findSeries(clean, 'Suspend').data.length, 2);
  const noLabel = clone(dayFixture);
  noLabel.basal.forEach((b) => { b.delivery_type = 'algorithmDelivery'; });
  assert.equal(findSeries(buildLanesOption(noLabel, DAY, { colors: COLORS }), 'Suspend').data.length, 2);
});

test('buildLanesOption: nearest-signal tooltip reports glucose AND both basal rates', () => {
  const opt = buildLanesOption(dayFixture, DAY, { colors: COLORS });
  // Axis trigger gives one column (ms); hover a real basal slot. The basal
  // strip only DRAWS the difference, but the tooltip must still name delivered
  // AND programmed in U/h.
  const html = opt.tooltip.formatter([{ axisValue: toMs(`${DAY} 08:05:00`) }]);
  assert.match(html, /mg\/dL/);              // glucose present
  assert.match(html, /Delivered basal/);
  assert.match(html, /Programmed basal/);
  assert.match(html, /U\/h/);
});

test('buildLanesOption: midnight-spanning exercise ribbon is clipped to the day', () => {
  const opt = buildLanesOption(dayFixture, DAY, { colors: COLORS });
  const ex = findSeries(opt, 'Exercise');
  assert.equal(ex.data.length, 1);
  // [startMs, endMs, row]; the exercise starts 23:30 and is clipped at the day end.
  assert.equal(ex.data[0][0], toMs(`${DAY} 23:30:00`));
  assert.ok(ex.data[0][1] <= toMs(`${DAY} 23:59:59`), 'clipped to the day end');
});

test('buildLanesOption: busy day keeps every signal available at once', () => {
  // A single busy fixture with boluses, bolus-carbs, manual carbs, basal
  // divergence, sleep + exercise context — nothing is dropped for quietness.
  const opt = buildLanesOption(dayFixture, DAY, { colors: COLORS, carbEntries: CARB_ENTRIES });
  assert.ok(findSeries(opt, 'Glucose').data.length > 0);
  assert.ok(findSeries(opt, 'Bolus').data.length > 0);
  assert.ok(findSeries(opt, 'Bolus carbs').data.length > 0);
  assert.equal(findSeries(opt, 'Carbs (logged)').data.length, CARB_ENTRIES.length);
  assert.ok(findSeries(opt, 'Basal difference').data.length > 0);
  assert.ok(findSeries(opt, 'Sleep').data.length > 0);
  assert.ok(findSeries(opt, 'Exercise').data.length > 0);
});

// ---------------------------------------------------------------------------
// (#126 in #134) manual carb-entry markers — the distinct amber pill in the
// carb lane (inlined into buildLanesOption's 'Carbs (logged)' series): certainty
// remains legible on the chart.
// ---------------------------------------------------------------------------

const CARB_ENTRIES = [
  { id: 1, t: `${DAY} 10:05:00`, grams: 6, certainty: 'estimate', source: 'manual', note: 'nuts' },
  { id: 2, t: `${DAY} 14:30:00`, grams: 30, certainty: 'exact', source: 'manual', note: null },
  { id: 3, t: `${DAY} 22:10:00`, grams: null, certainty: 'unknown', source: 'manual', note: null },
];
const loggedCarbs = (carbEntries) =>
  findSeries(buildLanesOption(dayFixture, DAY, { colors: COLORS, carbEntries }), 'Carbs (logged)');

test('buildLanesOption: one logged-carb pill datum per entry', () => {
  const s = loggedCarbs(CARB_ENTRIES);
  assert.equal(s.name, 'Carbs (logged)');
  assert.equal(s.data.length, 3);
});

test('buildLanesOption: logged-carb certainty rides the pill outline (no inline label, #385)', () => {
  const s = loggedCarbs(CARB_ENTRIES);
  // #385: the inline `Ng`/`~Ng`/`?` text is gone (it overprinted when doses cluster);
  // exact grams now live in the dose-focus reveal. Certainty stays legible at rest via
  // the pill outline — dashed = estimate, solid = exact.
  assert.equal(s.data[0].itemStyle.borderType, 'dashed');
  assert.equal(s.data[1].itemStyle.borderType, 'solid');
});

test('buildLanesOption: logged-carb sits on the fixed carb row of the insulin strip', () => {
  const s = loggedCarbs(CARB_ENTRIES);
  assert.equal(s.xAxisIndex, 2, 'insulin+carbs strip');
  // All pills share the one carb row (y is a fixed lane position, not scaled grams).
  assert.ok(s.data.every((d) => d.value[1] === s.data[0].value[1]));
  // x is the entry time in ms so it lands on the shared time axis.
  assert.equal(s.data[1].value[0], toMs(`${DAY} 14:30:00`));
});

test('buildLanesOption: logged-carb uses the --manual-carb tokens, distinct from bolus grey', () => {
  const s = loggedCarbs(CARB_ENTRIES);
  assert.equal(s.data[0].itemStyle.color, COLORS.manualCarbSoft);
  assert.equal(s.data[0].itemStyle.borderColor, COLORS.manualCarb);
  assert.notEqual(s.data[0].itemStyle.borderColor, COLORS.secondary);
});

test('buildLanesOption: no carbEntries → empty logged-carb series (no throw)', () => {
  assert.equal(loggedCarbs([]).data.length, 0);
  assert.equal(loggedCarbs(undefined).data.length, 0);
});

// ---------------------------------------------------------------------------
// (#385) The insulin lane is marks-only at rest — no inline U/g value labels on
// any of the three dose series (they overprinted when boluses clustered within
// minutes). Exact amounts move to the hover/focus dose-focus reveal. Focus
// enlarges each native glyph in place (emphasis.scale), never an overlay symbol.
// ---------------------------------------------------------------------------

const DOSE_SERIES = ['Bolus', 'Bolus carbs', 'Carbs (logged)'];

// A cluster reproducing the reported failure: two boluses ~1m40s apart plus a
// manual carb, so every dose series carries data on the insulin lane.
const CLUSTER_DAY = () => {
  const d = clone(dayFixture);
  d.boluses = [
    { t: `${DAY} 12:03:29`, insulin: 1.5, carbs: 0, bg: 180 },
    { t: `${DAY} 12:05:09`, insulin: 4.6, carbs: 25, bg: 0 },
  ];
  return d;
};
const CLUSTER_CARBS = [{ id: 9, t: `${DAY} 12:04:00`, grams: 15, certainty: 'exact', source: 'manual' }];

test('buildLanesOption: no inline value label on any dose series at rest (#385)', () => {
  const opt = buildLanesOption(CLUSTER_DAY(), DAY, { colors: COLORS, carbEntries: CLUSTER_CARBS });
  for (const name of DOSE_SERIES) {
    const s = findSeries(opt, name);
    assert.ok(s.data.length > 0, `${name} has data`);
    // Neither a series-level nor a per-point label may show text at rest.
    assert.ok(!(s.label && s.label.show), `${name} series has no resting label`);
    for (const d of s.data) {
      assert.ok(!(d.label && d.label.show), `${name} point has no resting label`);
    }
  }
});

test('buildLanesOption: dose series enlarge their native glyph on focus (#385)', () => {
  const opt = buildLanesOption(CLUSTER_DAY(), DAY, { colors: COLORS, carbEntries: CLUSTER_CARBS });
  for (const name of DOSE_SERIES) {
    const s = findSeries(opt, name);
    assert.ok(s.emphasis && s.emphasis.scale > 1, `${name} scales its glyph on emphasis`);
  }
});
