import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIN_MINUTES, buildMealMarkers, buildSlotLane, slotAssertsMove, snapWindow,
  renderCanvas, renderHistoryEvents, validateHistoryEvents, windowStats, windowSupport,
  commitSlide, commitWindow, minuteAtX, windowSpans, xAtMinute,
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
    envelope, markers: [], colors, stats: { spread: 27 }, window: [1320, 120], windowLabel: '22:00–02:00',
  });

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
    envelope, markers: [], colors, window: [15, 105], windowLabel: '00:15–01:45',
  });
  assert.deepEqual(option.series.find((series) => series.name === '__context').markArea.data
    .filter(([start]) => start.xAxis != null)
    .map(([start, end]) => [start.xAxis, end.xAxis]), [['00:15', '01:45']]);

  for (const window of [[1320, 0], [1440, 120]]) {
    renderCanvas({ clientWidth: 4000 }, { getInstanceByDom() { return chart; } }, {
      envelope, markers: [], colors, window, windowLabel: 'SELECTED WINDOW',
    });
    const degenerateAreas = option.series.find((series) => series.name === '__context').markArea.data
      .filter(([start]) => start.yAxis == null);
    assert.ok(degenerateAreas.flat().every((point) => envelope.labels.includes(point.xAxis)),
      'every degenerate area endpoint must be a chart axis label');
    assert.equal(degenerateAreas.length, 1);
  }

  assert.doesNotThrow(() => renderCanvas({ clientWidth: 4000 }, { getInstanceByDom() { return chart; } }, {
    envelope, markers: [], colors, window: [0, 0], windowLabel: 'SELECTED WINDOW',
  }));
  assert.equal(option.series.find((series) => series.name === '__context').markArea.data
    .filter(([start]) => start.xAxis != null).length, 0);
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
