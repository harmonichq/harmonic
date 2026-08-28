// Node built-in test runner (no npm). Covers the vue-free Day-surface core (#248, ADR 0027):
// flatten→sort into Episode-Log rows, pre-empted-low derivation, day-at-a-glance stats, the
// marker↔row link, and the chart option shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRows, rowReason, rowForT, rowDomId, preemptedTimes, dayStats, bgAt,
  buildAnchorOverlay, buildEpisodeLedger, evidenceFocusGraphic, focusUpdate, anchorStateColor,
  REASON_REFERENCE,
} from './day-chart.js';
import { buildLanesOption, LANE_SPAN } from './chart-builders.js';

// A tiny two-episode day: a fired over_treated_low + a clean meal, plus a CGM curve
// that dips low in the morning and spikes high midday.
function makeDay() {
  return {
    date: '2026-06-17',
    midnight: '2026-06-17 00:00:00',
    window: {
      start: '2026-06-17 00:00:00', end: '2026-06-17 23:59:59',
      cgm: [
        { t: '2026-06-17 03:00:00', bg: 60 },
        { t: '2026-06-17 03:05:00', bg: 58 },
        { t: '2026-06-17 08:00:00', bg: 120 },
        { t: '2026-06-17 12:00:00', bg: 200 },
        { t: '2026-06-17 18:00:00', bg: 110 },
      ],
      carb_exclusion_spans: [{ start: '2026-06-17 03:00:00', end: '2026-06-17 03:30:00' }],
    },
    episodes: [
      {
        id: '2026-06-17-ep0', lever: 'over_treated_low', spans_midnight: false,
        trigger: 'low', trigger_t: '2026-06-17 03:00:00',
        start: '2026-06-17 03:00:00', end: '2026-06-17 05:00:00',
        steps: [{ t: '2026-06-17 03:00:00', text: 'rescued past range', evidence_tier: 'observed' }],
        anchors: [
          { t: '2026-06-17 03:00:00', kind: 'low', bg: 60, insulin: null, carbs: null,
            state: 'fired',
            verdicts: [{ classifier: 'over_treated_low', matched: true, detail: 'rebound to 200', evidence_tier: 'observed', silence_reason: null }] },
        ],
      },
      {
        id: '2026-06-17-ep1', lever: null, spans_midnight: false,
        trigger: 'meal', trigger_t: '2026-06-17 12:00:00',
        start: '2026-06-17 11:30:00', end: '2026-06-17 13:00:00', steps: [],
        anchors: [
          { t: '2026-06-17 12:00:00', kind: 'meal', bg: null, insulin: 3.0, carbs: 45,
            state: 'clean',
            verdicts: [{ classifier: 'carb_undercount', matched: false, detail: 'peak under bar', evidence_tier: 'observed', silence_reason: 'no_trigger' }] },
        ],
      },
    ],
  };
}

test('buildRows: one row per anchor, chronological, carrying episode context', () => {
  const rows = buildRows(makeDay());
  assert.equal(rows.length, 2);
  assert.equal(rows[0].t, '2026-06-17 03:00:00');   // sorted
  assert.equal(rows[0].state, 'fired');
  assert.equal(rows[0].lever, 'over_treated_low');
  assert.equal(rows[0].headline.classifier, 'over_treated_low');
  assert.equal(rows[1].kind, 'meal');
});

test('reason reference keeps announced-meal ownership calm and server-owned', () => {
  const reason = REASON_REFERENCE.find((row) => row.id === 'owned_by_announced_meal');
  assert.equal(reason?.tier, 'inferred');
  assert.match(reason?.def || '', /announced meal/i);
});

test('episode ledger shows a midnight marker once for the July 6 six-anchor overnight episode', () => {
  const day = makeDay();
  day.episodes[0].spans_midnight = true;
  day.episodes[0].id = '2026-07-06-overnight';
  day.episodes[0].start = '2026-07-05 20:51:00';
  day.episodes[0].end = '2026-07-06 00:42:00';
  day.episodes[0].anchors = ['20:51:00', '21:20:00', '22:00:00', '23:00:00', '00:10:00', '00:42:00']
    .map((clock) => ({
      t: `2026-07-${clock < '12:00:00' ? '06' : '05'} ${clock}`, kind: 'correction', bg: 165, insulin: 1, carbs: null,
      state: 'near_miss',
      verdicts: [{ classifier: 'correction_on_iob', matched: false, detail: 'within tolerance', evidence_tier: 'inferred', silence_reason: 'under_threshold' }],
    }));

  const rows = buildRows(day);
  assert.ok(rows.every((row) => !('spansMidnight' in row)), 'anchors do not carry an episode-wide midnight tag');

  const ledger = buildEpisodeLedger(day);
  assert.equal(ledger.alsoChecked.filter((entry) => entry.episode?.spansMidnight).length, 1);
  assert.equal(ledger.alsoChecked.filter((entry) => entry.type === 'anchor').length, 6);
});

test('episode ledger leads with findings, keeps near-misses within tolerance, and retains a focused quiet anchor', () => {
  const day = makeDay();
  day.episodes.push({
    id: '2026-06-17-ep2', lever: 'carb_undercount', spans_midnight: false,
    start: '2026-06-17 16:00:00', end: '2026-06-17 17:00:00', anchors: [{
      t: '2026-06-17 16:00:00', kind: 'meal', bg: 185, insulin: 4, carbs: 35,
      state: 'near_miss',
      verdicts: [{ classifier: 'carb_undercount', matched: false, detail: 'gap stayed small', evidence_tier: 'inferred', silence_reason: 'under_threshold' }],
    }],
  });

  const ledger = buildEpisodeLedger(day);
  assert.equal(ledger.findings.length, 1, 'fired anchors lead');
  assert.equal(ledger.alsoChecked.length, 1, 'actionable near-misses are separately checked');
  assert.equal(ledger.quiet.clean, 1, 'clean anchors collapse into the quiet stretch');

  const focused = buildEpisodeLedger(day, {
    selectedLever: 'over_treated_low', focusT: '2026-06-17 12:00:00',
  });
  assert.ok(focused.quiet.rows.some((entry) => entry.row.t === '2026-06-17 12:00:00'),
    'a focused clean anchor survives the lever filter for its deep-link');
});

test('episode ledger folds an explained-away anchor but keeps a real near-miss visible', () => {
  const day = makeDay();
  day.episodes.push({
    id: 'explained', lever: null, spans_midnight: false,
    start: '2026-06-17 16:00:00', end: '2026-06-17 17:00:00', anchors: [{
      t: '2026-06-17 16:00:00', kind: 'high', bg: 185, insulin: null, carbs: null,
      state: 'near_miss',
      verdicts: [{ classifier: 'missed_meal', matched: false, detail: 'explained upstream', evidence_tier: 'inferred', silence_reason: 'upstream_cause' }],
    }],
  });
  const ledger = buildEpisodeLedger(day);
  assert.equal(ledger.quiet.explained, 1);
  assert.equal(ledger.alsoChecked.length, 0);
});

test('preemptedTimes: over_treated_low lever + a nearby carb-exclusion span both tag the low', () => {
  const pre = preemptedTimes(makeDay());
  assert.ok(pre.has('2026-06-17 03:00:00'));
  assert.equal(pre.size, 1);
});

test('preemptedTimes: no spans + no over_treated lever → empty', () => {
  const day = makeDay();
  day.episodes[0].lever = null;
  day.window.carb_exclusion_spans = [];
  assert.equal(preemptedTimes(day).size, 0);
});

test('dayStats: distinct low/high runs + TIR over the target day', () => {
  const st = dayStats(makeDay());
  assert.equal(st.low, 1);   // 60,58 = one contiguous low run
  assert.equal(st.high, 1);  // single 200 tick
  assert.equal(st.n, 5);
  // in-range readings: 120, 110 → 2 of 5
  assert.equal(st.tir, 40);
});

test('rowForT + rowDomId: marker→row link is stable', () => {
  const rows = buildRows(makeDay());
  const row = rowForT(rows, '2026-06-17 12:00:00');
  assert.equal(row.kind, 'meal');
  assert.equal(rowDomId(row), 'day-row-2026-06-17-ep12026-06-17 12:00:00');
  assert.equal(rowForT(rows, 'nope'), null);
});

test('bgAt: nearest CGM to a bg=null (meal) anchor', () => {
  assert.equal(bgAt(makeDay(), '2026-06-17 12:00:00'), 200);
});

test('rowReason: only near_miss rows carry a bucket reason', () => {
  const rows = buildRows(makeDay());
  assert.equal(rowReason(rows[0]), null); // fired
});

const OVERLAY_COLORS = { text: '#000', muted: '#888', line: '#ccc', surface: '#fff', primary: '#1C6E8C',
  warn: '#93701B', accent: '#C2554D', notindata: '#69727B', high: '#C2554D', low: '#B3402C',
  inRange: '#1C6E8C', manualCarb: '#866619', manualCarbSoft: '#F6EFDC' };

test('buildAnchorOverlay: evidence-strip markers (grid 1), rescue mark, NO persistent line (#276)', () => {
  const day = makeDay();
  const rows = buildRows(day);
  const series = buildAnchorOverlay(day, rows, OVERLAY_COLORS, '2026-06-17 03:00:00', preemptedTimes(day));
  assert.ok(Array.isArray(series));
  // every overlay series now binds the dedicated EVIDENCE strip (grid 1), not glucose.
  assert.ok(series.every((s) => s.xAxisIndex === 1 && s.yAxisIndex === 1));
  // NO overlay series draws a persistent full-height line — the only cross-track
  // mark is the single hairline (evidenceFocusGraphic), drawn by the host.
  assert.ok(series.every((s) => !s.markLine), 'no scrubber/flag markLine on the strip');
  // the clickable anchor markers carry _t; the focused one is enlarged + accent-ringed
  const markerSeries = series[series.length - 1];
  const low = markerSeries.data.find((m) => m._t === '2026-06-17 03:00:00');
  assert.equal(low.symbolSize, 15);
  assert.equal(low.itemStyle.borderColor, OVERLAY_COLORS.accent);
  // at rest a non-focused marker is a quiet OUTLINED ring (hollow surface fill)
  const rest = buildAnchorOverlay(day, rows, OVERLAY_COLORS, null, preemptedTimes(day));
  const restMarker = rest[rest.length - 1].data[0];
  assert.equal(restMarker.itemStyle.color, OVERLAY_COLORS.surface, 'hollow at rest');
  assert.notEqual(restMarker.itemStyle.borderColor, OVERLAY_COLORS.surface, 'ringed in its state color');
  // the pre-empted low carries a ⤴ rescue mark
  const rescue = series.find((s) => (s.data || []).some((d) => d.label && d.label.formatter === '⤴'));
  assert.ok(rescue, 'rescue ⤴ mark present');
});

test('buildAnchorOverlay: selectedLever dims off-lever anchors + rings the focus (#272)', () => {
  const day = makeDay();
  const rows = buildRows(day);
  const series = buildAnchorOverlay(day, rows, OVERLAY_COLORS, '2026-06-17 03:00:00',
    preemptedTimes(day), 'over_treated_low');
  const markers = series[series.length - 1].data;
  // the low (on the selected lever, and the focus) is full-opacity + accent-ringed
  const low = markers.find((m) => m._t === '2026-06-17 03:00:00');
  assert.equal(low.itemStyle.opacity, 1);
  assert.equal(low.itemStyle.borderColor, OVERLAY_COLORS.accent);
  assert.equal(low.itemStyle.borderWidth, 2.5);
  // the meal (lever null) is dimmed out
  const meal = markers.find((m) => m._t === '2026-06-17 12:00:00');
  assert.equal(meal.itemStyle.opacity, 0.18);
});

test('evidenceFocusGraphic: focus ⇒ exactly ONE cross-track hairline; blur ⇒ zero (#276)', () => {
  // Focused: a single vertical line graphic spanning the strip stack.
  const g = evidenceFocusGraphic(120, 8, 500, '#C2554D');
  assert.equal(g.length, 1);
  assert.equal(g[0].type, 'line');
  assert.deepEqual([g[0].shape.x1, g[0].shape.x2], [120, 120], 'vertical');
  assert.ok(g[0].shape.y2 > g[0].shape.y1, 'spans top→bottom');
  // Not focused / off-plot: no line at all.
  assert.equal(evidenceFocusGraphic(null, 8, 500, '#000').length, 0);
  assert.equal(evidenceFocusGraphic(NaN, 8, 500, '#000').length, 0);
});

test('buildAnchorOverlay: a busy multi-anchor day keeps one marker per anchor', () => {
  // Six anchors across four episodes with mixed states — none dropped, all on grid 1.
  const day = {
    date: '2026-06-17', midnight: '2026-06-17 00:00:00',
    window: { start: '2026-06-17 00:00:00', end: '2026-06-17 23:59:59',
      cgm: [{ t: '2026-06-17 07:00:00', bg: 210 }, { t: '2026-06-17 12:00:00', bg: 65 }],
      carb_exclusion_spans: [] },
    episodes: [
      { id: 'e0', lever: 'carb_undercount', spans_midnight: false, start: '2026-06-17 07:00:00', end: '2026-06-17 09:00:00', steps: [],
        anchors: [{ t: '2026-06-17 07:00:00', kind: 'meal', bg: 210, state: 'fired', verdicts: [] },
                  { t: '2026-06-17 08:00:00', kind: 'high', bg: 240, state: 'near_miss', verdicts: [] }] },
      { id: 'e1', lever: 'late_bolus', spans_midnight: false, start: '2026-06-17 10:00:00', end: '2026-06-17 11:00:00', steps: [],
        anchors: [{ t: '2026-06-17 10:00:00', kind: 'meal', bg: 180, state: 'outranked', verdicts: [] }] },
      { id: 'e2', lever: null, spans_midnight: false, start: '2026-06-17 13:00:00', end: '2026-06-17 14:00:00', steps: [],
        anchors: [{ t: '2026-06-17 13:00:00', kind: 'meal', bg: 120, state: 'clean', verdicts: [] }] },
      { id: 'e3', lever: 'over_treated_low', spans_midnight: false, start: '2026-06-17 12:00:00', end: '2026-06-17 13:00:00', steps: [],
        anchors: [{ t: '2026-06-17 12:00:00', kind: 'low', bg: 65, state: 'fired', verdicts: [] },
                  { t: '2026-06-17 18:00:00', kind: 'low', bg: 68, state: 'fired', verdicts: [] }] },
    ],
  };
  const rows = buildRows(day);
  const series = buildAnchorOverlay(day, rows, OVERLAY_COLORS, null, preemptedTimes(day), null);
  const markers = series[series.length - 1].data;
  assert.equal(markers.length, rows.length);
  assert.equal(markers.length, 6);
  assert.ok(markers.every((m) => m.itemStyle.opacity === 1));
});

// A busy day carrying EVERY signal at once — dosing, pump + hand-logged carbs,
// basal divergence, sleep/fasting/exercise context AND the model's own anchors —
// so the composed seam (timeline strips + evidence overlay + focus hairline) is
// exercised together, not each half against a fixture missing the other's signals.
const DAY = '2026-06-17';
function busyTimeline() {
  return {
    start: `${DAY} 00:00:00`, end: `${DAY} 23:59:59`,
    cgm: [
      { t: `${DAY} 03:00:00`, bg: 58 }, { t: `${DAY} 08:00:00`, bg: 120 },
      { t: `${DAY} 12:00:00`, bg: 210 }, { t: `${DAY} 18:00:00`, bg: 90 },
    ],
    boluses: [
      { t: `${DAY} 08:15:00`, insulin: 4.5, carbs: 55 },
      { t: `${DAY} 12:05:00`, insulin: 2.0, carbs: 30 },
    ],
    basal: [
      { t: `${DAY} 00:00:00`, basal_rate: 0.8, profile_basal_rate: 0.8 },
      { t: `${DAY} 03:00:00`, basal_rate: 0,   profile_basal_rate: 0.8 }, // CIQ cut → suspend run
      { t: `${DAY} 03:05:00`, basal_rate: 0,   profile_basal_rate: 0.8 },
      { t: `${DAY} 12:00:00`, basal_rate: 1.4, profile_basal_rate: 0.8 }, // CIQ added
    ],
    sleep_windows: [{ start: `${DAY} 00:00:00`, end: `${DAY} 06:00:00` }],
    pump_events: [{ t: `${DAY} 17:00:00`, event_type: 'Exercise', duration_mins: 45 }],
  };
}
function busyModelDay() {
  return {
    date: DAY, midnight: `${DAY} 00:00:00`,
    window: { start: `${DAY} 00:00:00`, end: `${DAY} 23:59:59`,
      cgm: [{ t: `${DAY} 03:00:00`, bg: 58 }, { t: `${DAY} 12:00:00`, bg: 210 }],
      carb_exclusion_spans: [{ start: `${DAY} 03:00:00`, end: `${DAY} 03:30:00` }] },
    episodes: [
      { id: 'ep0', lever: 'over_treated_low', spans_midnight: false,
        start: `${DAY} 03:00:00`, end: `${DAY} 05:00:00`, steps: [],
        anchors: [{ t: `${DAY} 03:00:00`, kind: 'low', bg: 58, state: 'fired', verdicts: [] }] },
      { id: 'ep1', lever: 'carb_undercount', spans_midnight: false,
        start: `${DAY} 08:00:00`, end: `${DAY} 10:00:00`, steps: [],
        anchors: [{ t: `${DAY} 08:15:00`, kind: 'meal', bg: null, insulin: 4.5, carbs: 55, state: 'near_miss', verdicts: [] }] },
      { id: 'ep2', lever: null, spans_midnight: false,
        start: `${DAY} 12:00:00`, end: `${DAY} 13:00:00`, steps: [],
        anchors: [{ t: `${DAY} 12:05:00`, kind: 'meal', bg: null, insulin: 2.0, carbs: 30, state: 'clean', verdicts: [] }] },
    ],
  };
}
const BUSY_CARBS = [{ id: 1, t: `${DAY} 15:00:00`, grams: 12, certainty: 'estimate', source: 'manual', note: 'apple' }];
const BUSY_REST = [{ start: `${DAY} 22:00:00`, end: `${DAY} 23:30:00` }];

test('composed busy day: every timeline signal AND the model anchors coexist on the five strips (#276)', () => {
  const opt = buildLanesOption(busyTimeline(), DAY, { colors: OVERLAY_COLORS, carbEntries: BUSY_CARBS, restWindows: BUSY_REST });
  const mv = busyModelDay();
  const rows = buildRows(mv);
  opt.series.push(...buildAnchorOverlay(mv, rows, OVERLAY_COLORS, null, preemptedTimes(mv), null));
  const named = (n) => opt.series.find((s) => s.name === n);
  // The timeline signals are all present and non-empty…
  assert.ok(named('Glucose').data.length > 0);
  assert.ok(named('Bolus').data.length > 0);
  assert.ok(named('Bolus carbs').data.length > 0);
  assert.equal(named('Carbs (logged)').data.length, BUSY_CARBS.length);
  assert.ok(named('Basal difference').data.length > 0);
  assert.ok(named('Sleep').data.length > 0);
  assert.ok(named('Exercise').data.length > 0);
  assert.ok(named('Fasting').data.length > 0);
  assert.ok(named('Suspend').data.length > 0);
  // …AND the model anchors ride the dedicated EVIDENCE strip (grid 1), one per anchor.
  const anchors = opt.series.find((s) => s.id === 'day-anchor-markers');
  assert.equal(anchors.xAxisIndex, 1);
  assert.equal(anchors.data.length, rows.length);
});

test('focusUpdate: focusing an anchor (via pixel geometry) yields ONE hairline + an enlarged ring; blur clears it (#276)', () => {
  const mv = busyModelDay();
  const rows = buildRows(mv);
  const preempted = preemptedTimes(mv);
  // A fake chart supplying only the two hooks focusUpdate reads — no ECharts/DOM.
  // convertToPixel asserts it receives a finite epoch-ms number (the value type the
  // shared time axis natively uses), so the overlay↔lanes seam can't drift back to
  // handing the axis an ISO string.
  const fakeChart = {
    convertToPixel: (_finder, v) => {
      assert.equal(typeof v, 'number');
      assert.ok(Number.isFinite(v), 'focus x is a finite epoch-ms value');
      return 240;
    },
    getHeight: () => 600,
  };
  const args = (focusT) => ({ chart: fakeChart, day: mv, rows, colors: OVERLAY_COLORS,
    focusT, preempted, selectedLever: null, laneSpan: LANE_SPAN });

  // Focus the near-miss meal: exactly one cross-track hairline, drawn at its pixel x,
  // colored in that state's hue, spanning the strip stack.
  const focT = `${DAY} 08:15:00`;
  const { series, graphic } = focusUpdate(fakeChart, args(focT));
  assert.equal(graphic.length, 1);
  assert.deepEqual([graphic[0].shape.x1, graphic[0].shape.x2], [240, 240], 'vertical at the focused x');
  assert.equal(graphic[0].shape.y1, 600 * LANE_SPAN.top);
  assert.equal(graphic[0].shape.y2, 600 * LANE_SPAN.bottom);
  assert.equal(graphic[0].style.stroke, anchorStateColor('near_miss', OVERLAY_COLORS));
  // The overlay comes back id-tagged (so the host merges it, never a full rebuild),
  // and the focused ring is the enlarged one.
  const markers = series.find((s) => s.id === 'day-anchor-markers');
  assert.ok(series.find((s) => s.id === 'day-anchor-rescue'));
  assert.equal(markers.data.find((m) => m._t === focT).symbolSize, 15);

  // Blur: no focus ⇒ no hairline at all, and no ring is enlarged.
  const blurred = focusUpdate(fakeChart, args(null));
  assert.equal(blurred.graphic.length, 0);
  const blurMarkers = blurred.series.find((s) => s.id === 'day-anchor-markers');
  assert.ok(blurMarkers.data.every((m) => m.symbolSize < 15));
});

test('buildAnchorOverlay: no selectedLever leaves every anchor full-opacity', () => {
  const day = makeDay();
  const rows = buildRows(day);
  const colors = { muted: '#888', surface: '#fff', primary: '#1C6E8C', warn: '#93701B',
  accent: '#C2554D', notindata: '#69727B', manualCarb: '#866619' };
  const series = buildAnchorOverlay(day, rows, colors, null, preemptedTimes(day), null);
  const markers = series[series.length - 1].data;
  assert.ok(markers.every((m) => m.itemStyle.opacity === 1));
});
