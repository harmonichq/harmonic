// Frontend test harness, established by #100. Runs under Node's built-in test
// runner with no npm deps and no package.json:
//
//     node --test frontend/
//
// The rule this harness relies on: pure logic lives in vue-free .js modules
// (here, scenario-chart.js) so it imports with no importmap and no DOM. Vue
// components (which `import 'vue'`) are NOT node-tested — importing them here
// would fail on the bare 'vue' specifier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  scnBuildEpisodeOption, scnLookbackBandCoords, scnGlucoseYRange,
  scnPreemptedSummary,
} from './scenario-chart.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const episode = JSON.parse(
  readFileSync(join(HERE, '__fixtures__', 'episode.carb-undercount.json'), 'utf8'),
);

// scnColors() reads CSS custom properties off the live document and stays in
// index.html; the pure builder takes the resolved colors as a plain dict. This
// stand-in mirrors that dict's keys (see scnColors in index.html).
const COLORS = {
  text: '#1B2126', muted: '#69727B', line: '#E3E7EA',
  primary: '#1C6E8C', accent: '#C2554D', secondary: '#566069',
  high: '#B3402C', inRange: '#1C6E8C', low: '#B3402C', surface: '#FFFFFF',
  observed: '#1C6E8C', inferred: '#D9A93A', notindata: '#69727B',
  basal: '#9AA6B4',
};

test('scnBuildEpisodeOption returns a well-formed ECharts option', () => {
  const opt = scnBuildEpisodeOption(episode, 0, COLORS);

  // xAxis is a time axis clamped to the episode window.
  assert.equal(opt.xAxis.type, 'time');
  assert.equal(opt.xAxis.min, episode.window.start.replace(' ', 'T'));
  assert.equal(opt.xAxis.max, episode.window.end.replace(' ', 'T'));

  // Dual-plus-basal y-axes: mg/dL, insulin U, basal U/h.
  assert.ok(Array.isArray(opt.yAxis));
  assert.equal(opt.yAxis.length, 3);
  assert.deepEqual(opt.yAxis.map((y) => y.name), ['mg/dL', 'U', 'U/h']);

  // The named series the render path depends on are all present.
  const names = opt.series.map((s) => s.name);
  for (const n of ['Delivered basal', 'Programmed basal', 'Glucose',
                   'Bolus (food)', 'Carbs']) {
    assert.ok(names.includes(n), `missing series: ${n}`);
  }

  // Every CGM reading with a bg becomes one scatter point.
  const glucose = opt.series.find((s) => s.name === 'Glucose');
  const cgmWithBg = episode.window.cgm.filter((p) => p.bg != null).length;
  assert.equal(glucose.data.length, cgmWithBg);

  // Each point carries [ISO-timestamp, bg] and threshold markLines exist.
  const [ts, bg] = glucose.data[0].value;
  assert.match(ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(typeof bg, 'number');
  const markYs = glucose.markLine.data
    .filter((d) => d.yAxis != null).map((d) => d.yAxis);
  assert.ok(markYs.includes(70) && markYs.includes(180));
});

test('Carbs tooltip renders the plotted (negative) value as positive grams (#154)', () => {
  // The carb dot sits at a negative y so it plots below the glucose trace; the
  // axis tooltip must not surface that raw negative. A per-series valueFormatter
  // renders the absolute value in grams, leaving every other row on the default
  // path untouched.
  const opt = scnBuildEpisodeOption(episode, 0, COLORS);
  const carbs = opt.series.find((s) => s.name === 'Carbs');
  const fmt = carbs.tooltip.valueFormatter;
  assert.equal(fmt(-60), '60 g');
  assert.equal(fmt(-15), '15 g');

  // The other series carry no per-series formatter, so they render by default.
  for (const n of ['Glucose', 'Bolus (food)', 'Delivered basal']) {
    const s = opt.series.find((x) => x.name === n);
    assert.equal(s.tooltip && s.tooltip.valueFormatter, undefined,
      `${n} must keep the default tooltip`);
  }
});

test('scnBuildEpisodeOption renders an in-range markArea band (70–180, colors.inRange, opacity 0.05) on the glucose lane (#212)', () => {
  const opt = scnBuildEpisodeOption(episode, 0, COLORS);
  const band = opt.series.find((s) =>
    s.markArea && s.markArea.data && s.markArea.data.some(
      ([lo, hi]) => lo && lo.yAxis === 70 && hi && hi.yAxis === 180
    )
  );
  assert.ok(band, 'no series carries a [yAxis:70 → yAxis:180] markArea');
  const [lo] = band.markArea.data.find(([lo]) => lo.yAxis === 70);
  assert.equal(lo.itemStyle.color, COLORS.inRange);
  assert.equal(lo.itemStyle.opacity, 0.05);
});

test('scnBuildEpisodeOption is pure: colors dict drives styling, no globals', () => {
  // Passing a different color must change the output — proving no getComputedStyle
  // leaks across the seam.
  const a = scnBuildEpisodeOption(episode, 0, { ...COLORS, text: '#000000' });
  const b = scnBuildEpisodeOption(episode, 0, { ...COLORS, text: '#FFFFFF' });
  assert.equal(a.textStyle.color, '#000000');
  assert.equal(b.textStyle.color, '#FFFFFF');
});

// --- #158 auto-scaled glucose y-axis ----------------------------------------

const cgmWindow = (...bgs) => ({ cgm: bgs.map((bg, i) => ({ t: `T${i}`, bg })) });

test('scnGlucoseYRange frames a normal window and keeps the target band (#158)', () => {
  // The repro window (118–163 trace, worst BG 163): band-guaranteed to [70,180],
  // ±15 → [55,195], rounded outward to the nearest 10 → [50, 200].
  assert.deepEqual(scnGlucoseYRange(cgmWindow(118, 132, 150, 163)), { min: 50, max: 200 });
});

test('scnGlucoseYRange keeps the whole [70,180] band for a pure-high window (#158)', () => {
  // All data above 180: dataMin>70 so min collapses to the 70 guarantee → 55 → 50;
  // dataMax 320 drives the top → 335 → 340. Both target lines stay in frame.
  const r = scnGlucoseYRange(cgmWindow(210, 280, 320));
  assert.deepEqual(r, { min: 50, max: 340 });
  assert.ok(r.min <= 70 && r.max >= 180);
});

test('scnGlucoseYRange keeps the whole [70,180] band for a pure-low window (#158)', () => {
  // All data below 70: dataMax<180 so max collapses to the 180 guarantee → 195 → 200;
  // dataMin 45 drives the floor → 30 → clamped to 40. Both target lines in frame.
  const r = scnGlucoseYRange(cgmWindow(45, 58, 66));
  assert.deepEqual(r, { min: 40, max: 200 });
  assert.ok(r.min <= 70 && r.max >= 180);
});

test('scnGlucoseYRange clamps to the sensor range [40,400] (#158)', () => {
  assert.deepEqual(scnGlucoseYRange(cgmWindow(35, 260, 395)), { min: 40, max: 400 });
});

test('scnGlucoseYRange falls back to [40,220] with zero CGM points (#158)', () => {
  // Nothing to scale on — the band plus a wider pad, NOT the old 40–400.
  assert.deepEqual(scnGlucoseYRange({ cgm: [] }), { min: 40, max: 220 });
  assert.deepEqual(scnGlucoseYRange({}), { min: 40, max: 220 });
  // Null-bg readings don't count as data points.
  assert.deepEqual(scnGlucoseYRange(cgmWindow(null, null)), { min: 40, max: 220 });
});

test('scnBuildEpisodeOption feeds the auto-scaled range into the glucose axis only (#158)', () => {
  const opt = scnBuildEpisodeOption(episode, 0, COLORS);
  const glucoseAxis = opt.yAxis[0];
  assert.equal(glucoseAxis.name, 'mg/dL');
  const expected = scnGlucoseYRange(episode.window);
  assert.equal(glucoseAxis.min, expected.min);
  assert.equal(glucoseAxis.max, expected.max);
  // Not the old fixed scale, and both target lines remain in frame.
  assert.ok(!(glucoseAxis.min === 40 && glucoseAxis.max === 400 && expected.max !== 400));
  assert.ok(glucoseAxis.min <= 70 && glucoseAxis.max >= 180);
  // Insulin (U) and basal (U/h) axes keep their fixed scales.
  assert.deepEqual([opt.yAxis[1].min, opt.yAxis[1].max], [-80, 12]);
  assert.deepEqual([opt.yAxis[2].min, opt.yAxis[2].max], [0, 4]);
});

// --- #118 missed-meal lookback band ----------------------------------------

test('scnLookbackBandCoords maps a cited_window to markArea coords, else empty', () => {
  const band = scnLookbackBandCoords({
    cited_window: { start: '2026-06-11 13:50:00', end: '2026-06-11 16:20:00' },
  });
  assert.deepEqual(band, [[
    { xAxis: '2026-06-11T13:50:00' }, { xAxis: '2026-06-11T16:20:00' },
  ]]);
  // A step that scans no window (or none at all) yields no band.
  assert.deepEqual(scnLookbackBandCoords({ cited_window: null }), []);
  assert.deepEqual(scnLookbackBandCoords(null), []);
});

test('scnBuildEpisodeOption shades the lookback window of the active step only', () => {
  // Inject a digestion window on step 0 (a missed-meal trigger). The band renders
  // when that step is active and is absent when a windowless step is active.
  const win = { start: episode.window.start, end: episode.steps[0].t };
  const withWin = {
    ...episode,
    steps: episode.steps.map((s, i) => (i === 0 ? { ...s, cited_window: win } : s)),
  };

  const active0 = scnBuildEpisodeOption(withWin, 0, COLORS);
  const band0 = active0.series.find((s) => s.name === 'Lookback window');
  assert.ok(band0, 'Lookback window series missing');
  assert.equal(band0.markArea.data.length, 1);
  assert.deepEqual(band0.markArea.data[0], [
    { xAxis: win.start.replace(' ', 'T') }, { xAxis: win.end.replace(' ', 'T') },
  ]);

  // Stepping to a beat with no cited_window clears the band.
  const active1 = scnBuildEpisodeOption(withWin, 1, COLORS);
  const band1 = active1.series.find((s) => s.name === 'Lookback window');
  assert.equal(band1.markArea.data.length, 0);
});

// --- #172 pre-empted-low summary (ADR 0012): a count, never a rate -----------

test('scnPreemptedSummary buckets a mixed count in I:C → ISF → unattributed order', () => {
  const s = scnPreemptedSummary({ total: 4, ic: 2, isf: 1, unattributed: 1, floor_u: 0.3 });
  assert.equal(s.total, 4);
  assert.deepEqual(s.parts.map((p) => p.kind), ['ic', 'isf', 'unattributed']);
  assert.equal(s.parts[0].count, 2);
  assert.match(s.parts[0].label, /after meals/);
  assert.match(s.parts[0].hint, /I:C/);
  assert.match(s.parts[1].hint, /ISF/);
});

test('scnPreemptedSummary singularizes and omits empty buckets', () => {
  const s = scnPreemptedSummary({ total: 1, ic: 1, isf: 0, unattributed: 0, floor_u: 0.3 });
  assert.equal(s.parts.length, 1);
  assert.equal(s.parts[0].label, 'after a meal');
});

test('scnPreemptedSummary returns null when there is nothing to show', () => {
  assert.equal(scnPreemptedSummary({ total: 0, ic: 0, isf: 0, unattributed: 0, floor_u: 0.3 }), null);
  assert.equal(scnPreemptedSummary(null), null);
  assert.equal(scnPreemptedSummary(undefined), null);
});
