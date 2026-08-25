import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIN_MINUTES, buildMealMarkers, buildSlotLane, slotAssertsMove, snapWindow,
  renderCanvas, renderHistoryEvents, validateHistoryEvents, windowStats, windowSupport,
  commitSlide, commitWindow, minuteAtX, windowSpans, xAtMinute, windowSpanText,
} from './diagnose-workstation-chart.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const historyCapture = JSON.parse(readFileSync(fileURLToPath(new URL(
  '../mockups/diagnose-workstation.synthetic/ic-history-events.capture.json', import.meta.url,
)), 'utf8'));

test('buildSlotLane reads the backend verdict fields', () => {
  const lane = buildSlotLane([
    { label: '00:00', current: 0.8, recommended: 0.9, asserts_move: true, direction: 'raise' },
    { label: '00:30', current: 0.9, recommended: 0.8, asserts_move: true, direction: 'lower' },
    { label: '01:00', current: 1, recommended: null, asserts_move: false, safety_status: 'hold' },
    { label: '01:30', current: 1, recommended: null, asserts_move: false,
      safety_status: 'insufficient evidence' },
    { label: '02:00', current: 1, recommended: null, asserts_move: false, safety_status: 'no data' },
  ]);

  assert.deepEqual(lane.cells.map(({ verdict }) => verdict),
    ['up', 'down', 'hold', 'insufficient', 'nodata']);
});

test('a backend-asserted thin basal estimate remains asserted', () => {
  // #273/#465: the backend already applies the 8-night floor; the frontend must not reapply it.
  const [cell] = buildSlotLane([{
    label: '00:00', current: 0.8, recommended: 0.9, asserts_move: true, direction: 'raise',
    estimate: { n: 4, wide: true },
  }]).cells;

  assert.equal(cell.verdict, 'up');
  assert.equal(cell.asserts, true);
});

test('slotAssertsMove requires a sized backend recommendation', () => {
  assert.equal(slotAssertsMove({ asserts_move: true, recommended: null }), false);
});

test('buildMealMarkers uses 30-minute buckets and the 12 g floor', () => {
  const markers = buildMealMarkers({
    '2026-08-01': { window: { boluses: [
      { t: '2026-08-01 07:02:00', carbs: 12, insulin: 1 },
      { t: '2026-08-01 07:31:00', carbs: 24, insulin: 2 },
      { t: '2026-08-01 07:29:00', carbs: 11, insulin: 1 },
    ] } },
    '2026-08-02': { window: { boluses: [
      { t: '2026-08-02 07:11:00', carbs: 18, insulin: 1.5 },
    ] } },
  });

  assert.deepEqual(markers, [
    { minute: 420, index: 420 / BIN_MINUTES, count: 2, carbs: 30, medianCarbs: 15, insulin: 2.5 },
    { minute: 450, index: 450 / BIN_MINUTES, count: 1, carbs: 24, medianCarbs: 24, insulin: 2 },
  ]);
});

test('windowStats reads a snapped hand-built envelope window', () => {
  const envelope = {
    p25: [90, 95, 100, 105, 110, 115, 120],
    p50: [100, 105, 110, 115, 120, 125, 130],
    p75: [110, 115, 120, 125, 130, 135, 140],
    raw: [1, 2, 3, 4, 5, 6, 7],
  };
  const window = snapWindow([17, 31], 45);

  assert.deepEqual(window, [15, 105]);
  assert.deepEqual(windowStats(envelope, window), {
    a: 1, b: 6, median: 118, lowest: 105, lowestIndex: 1, spread: 20, readings: 27,
  });
});

test('#130 · a zero-extent window answers with an empty sample, never a throw', () => {
  const envelope = {
    p25: Array.from({ length: 96 }, () => 100), p50: Array.from({ length: 96 }, () => 120),
    p75: Array.from({ length: 96 }, () => 140), raw: Array.from({ length: 96 }, () => 3),
    counts: Array.from({ length: 96 }, () => 12),
  };
  /* paintChart calls windowStats BEFORE renderCanvas on the same range, so a
     throw here fires before renderCanvas's own hardening can answer. All three
     of these degenerate ranges must give one empty-sample answer, the same
     shape windowSupport already gives them. */
  for (const range of [[0, 0], [360, 360], [1440, 1440]]) {
    assert.deepEqual(windowStats(envelope, range), {
      a: 0, b: 0, median: null, lowest: null, lowestIndex: -1, spread: null, readings: 0,
    }, `${range} reads as an empty sample`);
    assert.deepEqual(windowSupport(envelope, range), { thinnest: 0, supported: false });
  }
});

test('#130 · a window that ends on the day boundary names that instant 24:00', () => {
  /* The circular commit stores an end-of-day endpoint as 0, so the boundary has
     to be read off the pair, not off the endpoint alone. The preset grammar is
     the reference: Evening is 18:00–24:00, never 18:00–00:00. */
  assert.deepEqual(commitSlide(1260, 180), [1260, 0], 'a slide to the day end commits end 0');
  assert.equal(windowSpanText(commitSlide(1260, 180)), '21:00–24:00');
  assert.equal(windowSpanText([1080, 1440]), '18:00–24:00', 'the preset form still reads 24:00');
  assert.equal(windowSpanText([1260, 0]), '21:00–24:00');

  // a genuinely wrapped window keeps its own end, and 00:00 survives where it means 00:00
  assert.equal(windowSpanText([1380, 60]), '23:00–01:00');
  assert.equal(windowSpanText(commitSlide(1380, 120)), '23:00–01:00');
  assert.equal(windowSpanText([0, 360]), '00:00–06:00', 'a day-start window still starts 00:00');
  assert.equal(windowSpanText([0, 1440]), '00:00–24:00');
});

test('unrolled display windows snap, preserve their anchor, and commit circularly', () => {
  assert.deepEqual(snapWindow([22 * 60, 26 * 60], 45), [1320, 1560]);
  assert.deepEqual(commitWindow([1320, 1560]), [1320, 120]);
  assert.deepEqual(snapWindow([-60, 3 * 60], 45, 'end'), [-60, 180]);
  assert.deepEqual(commitWindow([-60, 180]), [1380, 180]);
  assert.deepEqual(snapWindow([1425, 1440], 45), [1425, 1515]);
  assert.deepEqual(snapWindow([1425, 1440], 10), [1425, 1455]);
  assert.equal(commitWindow([1200, 2640]), null);
  assert.deepEqual(commitSlide(23 * 60 + 30, 180), [1410, 150]);
  assert.deepEqual(commitSlide(11 * 60 + 1440, 180), [660, 840]);
});

test('window spans and pointer mapping share the panned display domain', () => {
  assert.deepEqual(windowSpans([1320, 120]), [[1320, 1440], [0, 120]]);
  const el = { clientWidth: 1054 };
  assert.equal(minuteAtX(el, 52, -120), -120);
  assert.equal(minuteAtX(el, 1002, -120), 1305);
  assert.equal(xAtMinute(el, -120, -120), 52);
  assert.equal(xAtMinute(el, 1305, -120), 1002);
});

test('wrapped windows pool both stretches for stats and support', () => {
  const values = Array.from({ length: 96 }, () => null);
  const p25 = values.slice();
  const p50 = values.slice();
  const p75 = values.slice();
  const raw = Array.from({ length: 96 }, () => 0);
  const counts = Array.from({ length: 96 }, () => 12);
  for (const [index, lo, mid, hi, readings] of [
    [88, 130, 140, 160, 2], [89, 140, 150, 170, 3],
    [0, 90, 100, 110, 5], [1, 100, 110, 130, 7],
  ]) {
    p25[index] = lo;
    p50[index] = mid;
    p75[index] = hi;
    raw[index] = readings;
  }
  counts[1] = 7;

  assert.deepEqual(windowStats({ p25, p50, p75, raw }, [1320, 120]), {
    a: 88, b: 95, median: 125, lowest: 100, lowestIndex: 0, spread: 28, readings: 17,
  });
  assert.deepEqual(windowSupport({ counts }, [1320, 120]), { thinnest: 7, supported: false });
  assert.deepEqual(windowSupport({ counts }, [1320, 1350]), { thinnest: 12, supported: true });
});

test('renderCanvas draws a wrapped window as two areas with one range label', () => {
  const labels = Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`);
  const envelope = {
    labels,
    p10: Array.from({ length: 96 }, () => 80), p25: Array.from({ length: 96 }, () => 100),
    p50: Array.from({ length: 96 }, () => 120), p75: Array.from({ length: 96 }, () => 140),
    p90: Array.from({ length: 96 }, () => 160), counts: Array.from({ length: 96 }, () => 12),
    raw: Array.from({ length: 96 }, () => 1), days: 12, pool: 45,
  };
  const colors = {
    muted: '#111', warn: '#222', danger: '#333', targetFill: '#444', targetText: '#555',
    rail: '#666', windowFill: '#777', windowEdge: '#888', bandOuter: '#999',
    bandInner: '#aaa', bandEdge: '#bbb', median: '#ccc', targetEdge: '#ddd',
    onAccent: '#eee', text: '#123', surface2: '#234', line: '#345', occurrence: '#456', meal: '#567', grid: '#678',
  };
  let option = null;
  const chart = { setOption(next) { option = next; }, off() {}, on() {} };

  renderCanvas({ clientWidth: 4000 }, { getInstanceByDom() { return chart; } }, {
    envelope, markers: [], colors, stats: { spread: 27 }, range: [60, 220],
    window: [1320, 120], windowLabel: '22:00–02:00',
  });

  assert.deepEqual([option.yAxis[0].min, option.yAxis[0].max], [60, 220],
    'the strip draws on the injected arrangement range');

  const context = option.series.find((series) => series.name === '__context');
  const areas = context.markArea.data.filter(([start]) => start.xAxis != null);
  assert.deepEqual(areas.map(([start, end]) => [start.xAxis, end.xAxis]), [
    ['22:00', '23:45'], ['00:00', '02:00'],
  ]);
  assert.equal(areas.filter(([start]) => start.label.show).length, 1);
  assert.match(areas[0][0].label.formatter, /25–75 spread 27 mg\/dL/);
  assert.deepEqual(areas[1][0].label, { show: false });
  assert.equal(context.markPoint.data.at(-1).label.formatter, 'CONTINUES');

  renderCanvas({ clientWidth: 4000 }, { getInstanceByDom() { return chart; } }, {
    envelope, markers: [], colors, range: [40, 300],
    window: [15, 105], windowLabel: '00:15–01:45',
  });
  assert.deepEqual(option.series.find((series) => series.name === '__context').markArea.data
    .filter(([start]) => start.xAxis != null)
    .map(([start, end]) => [start.xAxis, end.xAxis]), [['00:15', '01:45']]);

  for (const window of [[1320, 0], [1440, 120]]) {
    renderCanvas({ clientWidth: 4000 }, { getInstanceByDom() { return chart; } }, {
      envelope, markers: [], colors, range: [40, 300], window, windowLabel: 'SELECTED WINDOW',
    });
    const degenerateAreas = option.series.find((series) => series.name === '__context').markArea.data
      .filter(([start]) => start.yAxis == null);
    assert.ok(degenerateAreas.flat().every((point) => envelope.labels.includes(point.xAxis)),
      'every degenerate area endpoint must be a chart axis label');
    assert.equal(degenerateAreas.length, 1);
  }

  assert.doesNotThrow(() => renderCanvas({ clientWidth: 4000 }, { getInstanceByDom() { return chart; } }, {
    envelope, markers: [], colors, range: [40, 300],
    window: [0, 0], windowLabel: 'SELECTED WINDOW',
  }));
  assert.equal(option.series.find((series) => series.name === '__context').markArea.data
    .filter(([start]) => start.xAxis != null).length, 0);
});

test('renderCanvas pans labels and every data series into dimmed neighbouring days', () => {
  const labels = Array.from({ length: 96 }, (_, index) =>
    `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`);
  const filled = (value) => Array.from({ length: 96 }, () => value);
  const envelope = {
    labels, p10: filled(80), p25: filled(100), p50: filled(120), p75: filled(140),
    p90: filled(160), counts: filled(12), raw: filled(1), days: 12, pool: 45,
  };
  const colors = {
    muted: '#111111', warn: '#222', danger: '#333', targetFill: '#444', targetText: '#555',
    rail: '#666', windowFill: '#777', windowEdge: '#888', bandOuter: '#999',
    bandInner: '#aaa', bandEdge: '#bbb', median: '#ccc', targetEdge: '#ddd',
    onAccent: '#eee', text: '#123', surface2: '#234', line: '#345', occurrence: '#456', meal: '#567', grid: '#678',
  };
  let option = null;
  const chart = { setOption(next) { option = next; }, off() {}, on() {} };

  renderCanvas({ clientWidth: 1200 }, { getInstanceByDom() { return chart; } }, {
    envelope, markers: [{ index: 4, count: 1, minute: 60, medianCarbs: 20 }], colors,
    range: [40, 300],
    window: [1320, 120], displayWindow: [1320, 1560], displayOffset: 135,
  });

  assert.equal(option.xAxis[0].data.length, 288);
  assert.equal(option.xAxis[0].min, 105);
  assert.equal(option.xAxis[0].max, 200);
  const medians = option.series.filter((series) => series.name === 'Median');
  assert.equal(medians.length, 3);
  assert.equal(medians[0].data[96], 120);
  assert.equal(medians[2].data[192], 120);
  assert.ok(medians[2].lineStyle.opacity < (medians[0].lineStyle.opacity ?? 1));
  const context = option.series.find((series) => series.name === '__context');
  assert.deepEqual(context.markArea.data.filter(([start]) => start.xAxis != null)
    .map(([start, end]) => [start.xAxis, end.xAxis]), [['1320', '1560']]);
  assert.match(option.xAxis[0].axisLabel.formatter('-60'), /neighbour.*23:00/);
  assert.equal(option.xAxis[0].axisLabel.rich.neighbour.color, 'rgba(17,17,17,0.42)');
});

test("#130 · a full-travel slide keeps its live band on the unrolled axis", () => {
  const labels = Array.from({ length: 96 }, (_, index) =>
    `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`);
  const filled = (value) => Array.from({ length: 96 }, () => value);
  const envelope = {
    labels, p10: filled(80), p25: filled(100), p50: filled(120), p75: filled(140),
    p90: filled(160), counts: filled(12), raw: filled(1), days: 12, pool: 45,
  };
  const colors = {
    muted: '#111111', warn: '#222', danger: '#333', targetFill: '#444', targetText: '#555',
    rail: '#666', windowFill: '#777', windowEdge: '#888', bandOuter: '#999',
    bandInner: '#aaa', bandEdge: '#bbb', median: '#ccc', targetEdge: '#ddd',
    onAccent: '#eee', text: '#123', surface2: '#234', line: '#345', occurrence: '#456', meal: '#567', grid: '#678',
  };
  let option = null;
  const chart = { setOption(next) { option = next; }, off() {}, on() {} };

  /* A slide is the one gesture whose far edge can outrun the pan: both of these
     are reachable by dragging a committed 2–3h window to the pan's own limit.
     An endpoint the ordinal scale cannot resolve takes the whole live band and
     its label off the plot for the rest of the travel. */
  for (const [displayWindow, displayOffset, expected] of [
    [[2760, 2940], 1425, ['2760', '2865']],     // slid right to panMax: end ran past 23:45
    [[-1455, -1335], -1440, ['-1440', '-1335']], // grabbed after midnight, slid left to panMin
    [[1320, 1560], 135, ['1320', '1560']],       // in range: untouched
  ]) {
    renderCanvas({ clientWidth: 1200 }, { getInstanceByDom() { return chart; } }, {
      envelope, markers: [], colors, range: [40, 300],
      window: [1320, 60], displayWindow, displayOffset,
    });
    const axis = option.xAxis[0].data;
    const points = option.series.find((series) => series.name === '__context').markArea.data
      .filter(([start]) => start.xAxis != null).flatMap(([start, end]) => [start.xAxis, end.xAxis]);
    assert.deepEqual(points, expected, `${displayWindow} stays on the axis`);
    for (const point of points) {
      assert.ok(axis.includes(point),
        `${point} must be a real category — an unresolvable one hides the live band`);
    }
  }
});

test('#130 · the docked readout reads the pooled bin under a panning axis pointer', () => {
  const labels = Array.from({ length: 96 }, (_, index) =>
    `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`);
  /* Every bin carries its OWN number, so a readout that lands on the wrong bin
     reports a wrong value rather than the same value everywhere. */
  const perBin = (base) => Array.from({ length: 96 }, (_, index) => base + index);
  const envelope = {
    labels, p10: perBin(200), p25: perBin(300), p50: perBin(400), p75: perBin(500),
    p90: perBin(600), counts: perBin(1), raw: perBin(0), days: 12, pool: 45,
  };
  const colors = {
    muted: '#111111', warn: '#222', danger: '#333', targetFill: '#444', targetText: '#555',
    rail: '#666', windowFill: '#777', windowEdge: '#888', bandOuter: '#999',
    bandInner: '#aaa', bandEdge: '#bbb', median: '#ccc', targetEdge: '#ddd',
    onAccent: '#eee', text: '#123', surface2: '#234', line: '#345', occurrence: '#456', meal: '#567', grid: '#678',
  };
  const handlers = {};
  const chart = { setOption() {}, off() {}, on(name, fn) { handlers[name] = fn; } };
  let reported = null;
  const render = (extra) => renderCanvas({ clientWidth: 1200 }, { getInstanceByDom() { return chart; } }, {
    envelope, markers: [], colors, range: [40, 300], window: [1320, 120],
    onHover: (item) => { reported = item; }, ...extra,
  });

  /* A PANNING axis is the three-day DISPLAY_AXIS, so `axis.value`'s ordinal
     index counts from the previous day's 00:00: display index j carries display
     minute (j - 96) * 15 and reads pooled bin j mod 96. Reading the index as a
     minute printed another time of day's median and IQR into the docked header
     for the whole gesture, and could never map past ~05:00. */
  render({ displayWindow: [1320, 1560], displayOffset: 135 });
  for (const [index, label, bin] of [[96, '00:00', 0], [100, '01:00', 4],
    [140, '11:00', 44], [191, '23:45', 95]]) {
    handlers.updateAxisPointer({ axesInfo: [{ value: index }] });
    assert.equal(reported.label, label, `display index ${index} reads ${label}`);
    assert.deepEqual([reported.p50, reported.p25, reported.p75, reported.n],
      [400 + bin, 300 + bin, 500 + bin, 1 + bin],
      `display index ${index} carries bin ${bin}'s own pooled numbers`);
  }

  // at rest the axis is the canonical day and the index is the bin outright
  render({});
  handlers.updateAxisPointer({ axesInfo: [{ value: 44 }] });
  assert.equal(reported.label, '11:00');
  assert.equal(reported.p50, 444);
  handlers.updateAxisPointer({ axesInfo: [{ value: 400 }] });
  assert.equal(reported.label, '23:45', 'a resting index past the day clamps to the last bin');
});

test('S49/S70 · history event validation accepts one exact id and generation', () => {
  const projection = historyCapture.cases.all_runs;
  assert.equal(validateHistoryEvents(projection, {
    historyId: projection.history_id,
    analysisGeneration: projection.analysis_generation,
    selectedRunId: null,
  }), projection);
});

test('S51/S52 · selected member remains one run with every published meal offset', () => {
  const projection = historyCapture.cases.selected_run;
  const accepted = validateHistoryEvents(projection, {
    historyId: projection.history_id,
    analysisGeneration: projection.analysis_generation,
    selectedRunId: projection.selected_run_id,
  });
  assert.deepEqual(accepted.run_ids, historyCapture.cases.all_runs.run_ids);
  assert.deepEqual(
    accepted.series.find((run) => run.run_id === accepted.selected_run_id).member_offsets_min,
    [0, 120],
  );
});

test('history event chart exposes the server population to assistive technology', () => {
  const accepted = validateHistoryEvents(historyCapture.cases.all_runs, {
    historyId: historyCapture.cases.all_runs.history_id,
    analysisGeneration: historyCapture.cases.all_runs.analysis_generation,
  });
  const attrs = new Map();
  const element = {
    dataset: {},
    setAttribute(name, value) { attrs.set(name, value); },
  };
  const chart = { setOption() {} };
  renderHistoryEvents(element, {
    getInstanceByDom() { return chart; },
  }, accepted, {
    primary: '#000', meal: '#111', rail: '#fff', muted: '#222', line: '#333', grid: '#444',
  });
  assert.equal(attrs.get('role'), 'img');
  assert.equal(attrs.get('aria-label'),
    `Past-setting glucose evidence for ${historyCapture.cases.all_runs.series.length} meal runs.`);
});

test('S52 · every meal offset gets a marker even between CGM point minutes', () => {
  const projection = structuredClone(historyCapture.cases.selected_run);
  const run = projection.series[0];
  run.member_offsets_min = [123];
  run.points = [{ minute: 120, bg: 140 }, { minute: 125, bg: 145 }];
  let option = null;
  renderHistoryEvents({ dataset: {}, setAttribute() {} }, {
    getInstanceByDom() { return { setOption(next) { option = next; } }; },
  }, projection, {
    primary: '#000', meal: '#111', rail: '#fff', muted: '#222', line: '#333', grid: '#444',
  });
  assert.deepEqual(option.series.at(-1).data
    .filter((marker) => marker.runId === run.run_id).map((marker) => marker.value), [[123, 145]]);
  run.points = [];
  renderHistoryEvents({ dataset: {}, setAttribute() {} }, {
    getInstanceByDom() { return { setOption(next) { option = next; } }; },
  }, projection, {
    primary: '#000', meal: '#111', rail: '#fff', muted: '#222', line: '#333', grid: '#444',
  });
  assert.deepEqual(option.series.at(-1).data
    .filter((marker) => marker.runId === run.run_id).map((marker) => marker.value), [[123, 44]]);
});

test('S69/S70 · mismatched history pairs are rejected before paint', () => {
  const projection = historyCapture.cases.all_runs;
  for (const expected of [
    { historyId: 'different', analysisGeneration: projection.analysis_generation },
    { historyId: projection.history_id, analysisGeneration: 'different' },
  ]) {
    assert.throws(() => validateHistoryEvents(projection, expected), /coherent history evidence/);
  }
  assert.throws(() => validateHistoryEvents({ ...projection, schema: 'unknown' }, {
    historyId: projection.history_id, analysisGeneration: projection.analysis_generation,
  }), /coherent history evidence/);
  const nonmember = { ...projection, selected_run_id: 'opaque-run-not-in-population' };
  assert.throws(() => validateHistoryEvents(nonmember, {
    historyId: projection.history_id,
    analysisGeneration: projection.analysis_generation,
    selectedRunId: nonmember.selected_run_id,
  }), /coherent history evidence/);
  const duplicate = structuredClone(projection);
  duplicate.run_ids[1] = duplicate.run_ids[0];
  duplicate.series[1].run_id = duplicate.run_ids[0];
  assert.throws(() => validateHistoryEvents(duplicate, {
    historyId: projection.history_id,
    analysisGeneration: projection.analysis_generation,
  }), /coherent history evidence/);
  const malformed = structuredClone(projection);
  malformed.run_ids = [null];
  malformed.series = [{
    run_id: null, first_member_at: null, points: [{}], member_offsets_min: [null],
  }];
  assert.throws(() => validateHistoryEvents(malformed, {
    historyId: projection.history_id,
    analysisGeneration: projection.analysis_generation,
  }), /coherent history evidence/);
});
