import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIN_MINUTES, buildSlotLane, slotAssertsMove, snapWindow,
  renderCanvas, renderHistoryEvents, validateHistoryEvents, windowStats, windowSupport,
  commitSlide, commitWindow, minuteAtX, windowSpans, xAtMinute, windowSpanText, GRID,
  stripGlucoseRange, queuePreviewOption,
} from './diagnose-workstation-chart.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const historyCapture = JSON.parse(readFileSync(fileURLToPath(new URL(
  '../mockups/diagnose-workstation.synthetic/ic-history-events.capture.json', import.meta.url,
)), 'utf8'));
const fixture = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));
const previewColors = {
  text: '#f2ede2', muted: '#a49c90', line: '#3f3833', signal: '#86ad78',
  high: '#e2be4c', basal: '#a89a85', excluded: '#8d8579',
  cohorts: { matched: '#86ad78', nearly_matched: '#e2be4c', comparison: '#d08150' },
};

test('#341 · queue previews carry a purpose-built grammar for every evidence family', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const isf = fixture('../mockups/diagnose-workstation.synthetic/isf-rest-window-evidence.capture.json').payload;
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.directional_only;
  const event = fixture('../mockups/diagnose-workstation.synthetic/finding-case-files.json')
    .cases['finding:carb_undercount'].event;
  const options = {
    basal: queuePreviewOption({ kind: 'basal', data: basal }, null, previewColors),
    isf: queuePreviewOption({ kind: 'isf', data: isf }, null, previewColors),
    ic: queuePreviewOption({ kind: 'carb-ratio', data: ic }, [60, 240], previewColors),
    event: queuePreviewOption({ kind: 'event-comparison', data: event }, [60, 240], previewColors),
  };

  assert.equal(options.basal.series.find(({ id }) => id === 'queue:basal:departures').data.length,
    basal.nights.length, 'basal draws every served night around its programmed rate');
  assert.equal(options.isf.series.find(({ id }) => id === 'queue:isf:steps').data.length,
    isf.steps.length, 'correction factor draws every served dose/response step');
  assert.equal(options.ic.series.filter(({ id }) => id?.startsWith('queue:ic:run:')).length,
    ic.series.length, 'I:C preserves every served meal trace');
  assert.deepEqual(options.ic.series.find(({ id }) => id === `queue:ic:run:${ic.series[0].run_id}`).data,
    ic.series[0].points.map(({ minute, bg }) => [minute, bg]),
    'I:C does not smooth or manufacture points');
  const supported = event.projection.cohorts.filter((cohort) =>
    cohort.points.some((point) => point.support !== 'withheld' && Number.isFinite(point.median)));
  assert.equal(options.event.series.filter(({ id }) => id?.endsWith(':median')).length,
    supported.length, 'behavioral previews draw each cohort with served aggregate support');
  assert.ok(options.basal.series.some(({ id }) => id === 'queue:basal:programmed'));
  assert.ok(options.isf.series.some(({ id }) => id === 'queue:isf:zero'));
  assert.ok(options.ic.series.some(({ id }) => id === 'queue:ic:meal-anchor'));
  assert.ok(options.event.series.some(({ id }) => id === 'queue:event:event-anchor'));
  for (const option of Object.values(options)) {
    assert.equal(option.xAxis.show, false);
    assert.equal(option.yAxis.show, false);
    assert.equal(option.tooltip.show, false);
  }
});

test('#341 · queue preview lines retain missing and withheld positions as real gaps', () => {
  const ic = queuePreviewOption({ kind: 'carb-ratio', data: {
    runs: [{ run_id: 'meal', in_pool: true }],
    series: [{ run_id: 'meal', points: [
      { minute: -5, bg: 110 }, { minute: 0, bg: null }, { minute: 5, bg: 130 },
    ] }],
  } }, [60, 240], previewColors);
  const meal = ic.series.find(({ id }) => id === 'queue:ic:run:meal');
  assert.deepEqual(meal.data, [[-5, 110], [0, null], [5, 130]]);
  assert.equal(meal.connectNulls, false);
  assert.notEqual(meal.symbol, 'none', 'isolated served meal points remain visible');
  assert.equal(meal.itemStyle.color, previewColors.signal,
    'meal symbols use the same evidence ink as their trace');

  const event = queuePreviewOption({ kind: 'event-comparison', data: { projection: {
    window_min: [-10, 20], cohorts: [{ key: 'matched', name: 'Matched', points: [
      { minute: -10, median: 100, p25: 90, p75: 110, support: 'supported' },
      { minute: -5, median: 105, p25: 95, p75: 115, support: 'supported' },
      { minute: 0, median: null, p25: null, p75: null, support: 'withheld' },
      { minute: 5, median: 120, p25: 108, p75: 132, support: 'limited' },
      { minute: 10, median: 125, p25: 112, p75: 138, support: 'limited' },
    ] }],
  } } }, [60, 240], previewColors);
  const median = event.series.find(({ id }) => id === 'queue:event:matched:median');
  assert.deepEqual(median.data, [
    [-10, 100], [-5, 105], [0, null], [5, 120], [10, 125],
  ]);
  assert.equal(median.connectNulls, false);
  assert.notEqual(median.symbol, 'none', 'isolated served cohort points remain visible');
  assert.equal(median.itemStyle.color, previewColors.cohorts.matched,
    'cohort symbols use the same evidence ink as their trace');
  assert.deepEqual(event.series.filter(({ id }) => id?.startsWith('queue:event:matched:band:'))
    .map(({ quantiles }) => quantiles), [[[-10, 90, 110], [-5, 95, 115]],
      [[5, 108, 132], [10, 112, 138]]], 'withheld evidence splits the quantile bands');
});

test('#341 · behavioral preview bands plot served p25/p75 coordinates directly', () => {
  const event = fixture('../mockups/diagnose-workstation.synthetic/finding-case-files.json')
    .cases['finding:carb_undercount'].event;
  const option = queuePreviewOption({ kind: 'event-comparison', data: event }, [60, 240], previewColors);
  const band = option.series.find(({ id, quantiles }) => id?.includes(':comparison:band:')
    && quantiles?.some(([, p25, p75]) => p75 > p25));
  assert.ok(band, 'the served comparison cohort publishes a nonzero spread');
  const rendered = band.renderItem({ coordSys: { x: 0, y: 0, width: 300, height: 90 } }, {
    coord: ([minute, value]) => [minute, value],
  });
  const expected = band.quantiles.length === 1
    ? [[band.quantiles[0][0], band.quantiles[0][2]], [band.quantiles[0][0], band.quantiles[0][1]]]
    : [
      ...band.quantiles.map(([minute, , p75]) => [minute, p75]),
      ...band.quantiles.toReversed().map(([minute, p25]) => [minute, p25]),
    ];
  const points = rendered.type === 'polygon'
    ? rendered.shape.points
    : [[rendered.shape.x1, rendered.shape.y1], [rendered.shape.x2, rendered.shape.y2]];
  assert.deepEqual(points, expected, 'the rendered spread uses the served quantiles, not a stack delta');
});

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
    assert.deepEqual(windowSupport(envelope, range, 8), { thinnest: 0, supported: false });
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
  /* The two ends of the plot, named by the shared spine rather than by the
     pixel it happens to sit at — this asserts the round trip, not the inset. */
  const el = { clientWidth: 1054 };
  const plotLeft = GRID.left;
  const plotRight = el.clientWidth - GRID.right;
  assert.equal(minuteAtX(el, plotLeft, -120), -120);
  assert.equal(minuteAtX(el, plotRight, -120), 1305);
  assert.equal(xAtMinute(el, -120, -120), plotLeft);
  assert.equal(xAtMinute(el, 1305, -120), plotRight);
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
  assert.deepEqual(windowSupport({ counts }, [1320, 120], 8), { thinnest: 7, supported: false });
  assert.deepEqual(windowSupport({ counts }, [1320, 1350], 8), { thinnest: 12, supported: true });
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
    bandInner: '#aaa', median: '#ccc', targetEdge: '#ddd',
    onAccent: '#eee', text: '#123', surface2: '#234', line: '#345', occurrence: '#456', meal: '#567', grid: '#678',
  };
  let option = null;
  const chart = { setOption(next) { option = next; }, off() {}, on() {} };

  renderCanvas({ clientWidth: 4000, setAttribute() {} }, { getInstanceByDom() { return chart; } }, {
    envelope, markers: [], colors, supportFloor: 8, stats: { spread: 27 }, range: [60, 220],
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

  renderCanvas({ clientWidth: 4000, setAttribute() {} }, { getInstanceByDom() { return chart; } }, {
    envelope, markers: [], colors, supportFloor: 8, range: [40, 300],
    window: [15, 105], windowLabel: '00:15–01:45',
  });
  assert.deepEqual(option.series.find((series) => series.name === '__context').markArea.data
    .filter(([start]) => start.xAxis != null)
    .map(([start, end]) => [start.xAxis, end.xAxis]), [['00:15', '01:45']]);

  for (const window of [[1320, 0], [1440, 120]]) {
    renderCanvas({ clientWidth: 4000, setAttribute() {} }, { getInstanceByDom() { return chart; } }, {
      envelope, markers: [], colors, supportFloor: 8, range: [40, 300], window, windowLabel: 'SELECTED WINDOW',
    });
    const degenerateAreas = option.series.find((series) => series.name === '__context').markArea.data
      .filter(([start]) => start.yAxis == null);
    assert.ok(degenerateAreas.flat().every((point) => envelope.labels.includes(point.xAxis)),
      'every degenerate area endpoint must be a chart axis label');
    assert.equal(degenerateAreas.length, 1);
  }

  assert.doesNotThrow(() => renderCanvas({ clientWidth: 4000, setAttribute() {} }, { getInstanceByDom() { return chart; } }, {
    envelope, markers: [], colors, supportFloor: 8, range: [40, 300],
    window: [0, 0], windowLabel: 'SELECTED WINDOW',
  }));
  assert.equal(option.series.find((series) => series.name === '__context').markArea.data
    .filter(([start]) => start.xAxis != null).length, 0);
});

test("#366 · every parked label anchors on the strip's own ceiling, so it lands on the plot", () => {
  const labels = Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`);
  const filled = (value) => Array.from({ length: 96 }, () => value);
  const colors = {
    muted: '#111', warn: '#222', danger: '#333', targetFill: '#444', targetText: '#555',
    rail: '#666', windowFill: '#777', windowEdge: '#888', bandOuter: '#999',
    bandInner: '#aaa', median: '#ccc', targetEdge: '#ddd',
    onAccent: '#eee', text: '#123', surface2: '#234', line: '#345', occurrence: '#456', meal: '#567', grid: '#678',
  };
  let option = null;
  const chart = { setOption(next) { option = next; }, off() {}, on() {} };
  /* The ruler comes from the shipped producer, never a literal. Ten of the
     twelve `range:` injections in this file are [40, 300], the one ruler in the
     tree tall enough to seat a fixed anchor of 296 inside the plot — which is
     why the suite stayed green while the label painted off the top of it. */
  const paint = ({ p90, counts, clientWidth, window: win, windowLabel }) => {
    const envelope = {
      labels, p10: filled(80), p25: filled(100), p50: filled(120), p75: filled(140),
      p90: filled(p90), counts: filled(counts), raw: filled(1), days: 12, pool: 45,
    };
    renderCanvas({ clientWidth, setAttribute() {} }, { getInstanceByDom() { return chart; } }, {
      envelope, markers: [], colors, supportFloor: 8, stats: { spread: 27 },
      range: stripGlucoseRange(envelope), window: win, windowLabel,
    });
    const context = option.series.find((series) => series.name === '__context');
    const data = context.markPoint ? context.markPoint.data : [];
    assert.ok(data.length, 'the case must actually emit the placement it is about');
    for (const datum of data) {
      /* Equality against the axis the chart drew, read back from the emitted
         option: the ceiling is the one value that seats a label on the line the
         inside placement occupies, and a `<=` bound admits every value under it. */
      assert.equal(datum.coord[1], option.yAxis[0].max,
        'a parked label anchors on the drawn axis maximum');
    }
    return data;
  };

  // a window too narrow for its name at a narrow element width
  const [narrow] = paint({
    p90: 215, counts: 12, clientWidth: 600, window: [0, 360], windowLabel: 'OVERNIGHT 00:00–06:00',
  });
  assert.equal(option.yAxis[0].max, 220, 'this envelope rules well below the retired constant');
  assert.equal(narrow.label.formatter, 'OVERNIGHT 00:00–06:00');
  assert.equal(narrow.label.position, 'right');
  assert.equal(narrow.label.distance, 6);
  assert.equal(narrow.label.verticalAlign, 'top');
  assert.deepEqual(narrow.label.offset, [0, 5],
    "the parked text hangs below the ceiling on the inside placement's own distance");

  // a window whose thinnest bin is below the support floor: the notice rides along
  const [thin] = paint({
    p90: 255, counts: 0, clientWidth: 1396, window: [1080, 1440], windowLabel: 'EVENING 18:00–24:00',
  });
  assert.equal(option.yAxis[0].max, 260);
  assert.match(thin.label.formatter, /INSUFFICIENT SAMPLE — thinnest bin holds 0/);
  assert.equal(thin.label.position, 'left');
  assert.equal(thin.label.distance, 6);
  assert.equal(thin.label.verticalAlign, 'top');
  assert.deepEqual(thin.label.offset, [0, 5]);

  // a window wrapping midnight: the CONTINUES marker rides the same anchor
  const wrapped = paint({
    p90: 215, counts: 12, clientWidth: 1396, window: [1320, 120], windowLabel: '22:00–02:00',
  }).at(-1);
  assert.equal(wrapped.label.formatter, 'CONTINUES');
  assert.equal(wrapped.label.position, 'insideTop');
  assert.equal(wrapped.label.distance, 5);
});

test('a tile landing never changes the already-drawn strip range', () => {
  const labels = Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`);
  const filled = (value) => Array.from({ length: 96 }, () => value);
  const envelope = {
    labels, p10: filled(80), p25: filled(100), p50: filled(120), p75: filled(140),
    p90: filled(160), counts: filled(12), raw: filled(1), days: 12, pool: 45,
  };
  const colors = {
    muted: '#111', targetFill: '#444', targetText: '#555', rail: '#666', windowDim: '#777',
    windowEdge: '#888', bandOuter: '#999', bandInner: '#aaa', median: '#ccc',
    targetEdge: '#ddd', onAccent: '#eee', text: '#123', surface2: '#234', line: '#345', grid: '#678',
  };
  let option = null;
  const chart = { setOption(next) { option = next; }, off() {}, on() {} };
  const paint = () => renderCanvas({ clientWidth: 1200, setAttribute() {} }, { getInstanceByDom() { return chart; } }, {
    envelope, colors, supportFloor: 8, range: stripGlucoseRange(envelope), window: [0, 360], windowLabel: '00:00–06:00',
  });

  paint();
  const before = [option.yAxis[0].min, option.yAxis[0].max];
  const landedTileEvidence = [40, 360];
  assert.deepEqual(landedTileEvidence, [40, 360], 'the simulated tile would widen the field range');
  paint();
  assert.deepEqual([option.yAxis[0].min, option.yAxis[0].max], before,
    'the strip remains on its own envelope-and-target ruler after tile evidence lands');
});

test('slice 4 · the outside-the-gates scrim is the exact complement of the window', () => {
  const labels = Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`);
  const filled = (value) => Array.from({ length: 96 }, () => value);
  const envelope = {
    labels, p10: filled(80), p25: filled(100), p50: filled(120), p75: filled(140),
    p90: filled(160), counts: filled(12), raw: filled(1), days: 12, pool: 45,
  };
  const colors = {
    muted: '#111', warn: '#222', danger: '#333', targetFill: '#444', targetText: '#555',
    rail: '#666', windowDim: '#77777788', windowEdge: '#888', bandOuter: '#999',
    bandInner: '#aaa', median: '#ccc', targetEdge: '#ddd',
    onAccent: '#eee', text: '#123', surface2: '#234', line: '#345', occurrence: '#456', meal: '#567', grid: '#678',
  };
  let option = null;
  const chart = { setOption(next) { option = next; }, off() {}, on() {} };
  const render = (extra) => renderCanvas({ clientWidth: 4000, setAttribute() {} }, { getInstanceByDom() { return chart; } }, {
    envelope, markers: [], colors, supportFloor: 8, range: [40, 300], ...extra,
  });
  // the dim is a CUSTOM series of rects (a markArea painted nothing in the
  // live app while every option dump swore it existed); its data is the
  // complement span list and its renderItem fills with colors.windowDim
  const dims = () => option.series.find((series) => series.name === '__dim').data;

  // a plain window dims before its start and after its end, clipped at the gates
  render({ window: [360, 720], windowLabel: '06:00–12:00' });
  assert.deepEqual(dims(), [['00:00', '06:00'], ['12:00', '23:45']]);
  const dim = option.series.find((series) => series.name === '__dim');
  assert.equal(dim.type, 'custom');
  // #258 — the bands read as fills: no traced percentile contour survives
  assert.equal(option.series.filter((series) => /^__p\d+$/.test(series.name)).length, 0,
    'the percentile boundary strokes stay retired');
  const rect = dim.renderItem(
    { coordSys: { x: 10, y: 20, width: 100, height: 50 } },
    { value: (i) => ['00:00', '06:00'][i], coord: ([v]) => [v === '00:00' ? 10 : 35, 0] });
  assert.deepEqual(rect.shape, { x: 10, y: 20, width: 25, height: 50 });
  assert.equal(rect.style.fill, '#77777788');

  // the window itself carries no fill and no dashed border — the scrim is the mark
  const context = option.series.find((series) => series.name === '__context');
  const [windowArea] = context.markArea.data.filter(([start]) => start.xAxis != null);
  assert.deepEqual(windowArea[0].itemStyle, { color: 'transparent' });

  // #130 — a wrapped window's remainder is the single contiguous middle gap
  render({ window: [1320, 120], windowLabel: '22:00–02:00' });
  assert.deepEqual(dims(), [['02:00', '22:00']]);

  // a window starting at midnight leaves only the trailing scrim
  render({ window: [0, 240], windowLabel: '00:00–04:00' });
  assert.deepEqual(dims(), [['04:00', '23:45']]);

  // no window, no scrim
  render({ window: [0, 0], windowLabel: 'SELECTED WINDOW' });
  assert.deepEqual(dims(), []);

  // panning: the scrim runs to the unrolled axis's own ends, real categories only
  render({ window: [1320, 120], displayWindow: [1320, 1560], displayOffset: 135, clientWidth: 1200 });
  assert.deepEqual(dims(), [['-1440', '1320'], ['1560', '2865']]);
  for (const point of dims().flat()) {
    assert.ok(option.xAxis[0].data.includes(point), `${point} must be a real category`);
  }
});

test('#370 · the target caption drops below the grip band when a drawn gate strikes it', () => {
  const labels = Array.from({ length: 96 }, (_, index) =>
    `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`);
  const filled = (value) => Array.from({ length: 96 }, () => value);
  const envelope = {
    labels, p10: filled(80), p25: filled(100), p50: filled(120), p75: filled(140),
    p90: filled(160), counts: filled(12), raw: filled(1), days: 12, pool: 45,
  };
  const colors = {
    muted: '#111', warn: '#222', danger: '#333', targetFill: '#444', targetText: '#555',
    rail: '#666', windowDim: '#77777788', windowEdge: '#888', bandOuter: '#999',
    bandInner: '#aaa', median: '#ccc', targetEdge: '#ddd',
    onAccent: '#eee', text: '#123', surface2: '#234', line: '#345', occurrence: '#456', meal: '#567', grid: '#678',
  };
  let option = null;
  const chart = { setOption(next) { option = next; }, off() {}, on() {} };
  /* clientWidth here is the CHART element's width, not the viewport's: the
     Diagnose layout gives the chart 390px inside a 390px viewport but 399.6px
     inside a 768px one, so 400 is this test's stand-in for the 768px evidence
     width. Driving 768 would render a 682px plot no gate reaches. */
  const render = (clientWidth, window) => {
    const el = { clientWidth, setAttribute() {} };
    renderCanvas(el, { getInstanceByDom() { return chart; } }, {
      envelope, markers: [], colors, supportFloor: 8, range: [40, 220],
      window, windowLabel: windowSpanText(window),
    });
    const context = option.series.find((series) => series.name === '__context');
    // the target band is the entry keyed by yAxis; the window entries are keyed by xAxis
    const [target] = context.markArea.data.filter(([start]) => start.yAxis != null);
    return { el, label: target[0].label };
  };
  /* Where the gates land, asked of the same exported function the brace itself
     places them with — never a copied constant. The caption is anchored to the
     plot's left edge and runs ~99px, so a gate inside that run hides a glyph. */
  const gates = (el, window) => window.map((minute) => Math.round(xAtMinute(el, minute) * 10) / 10);
  const dropped = { show: true, position: 'insideBottomLeft', distance: 0 };
  const shipped = { show: true, position: 'insideStartTop', distance: 10 };
  const rest = {
    color: '#555', fontSize: 10, fontWeight: 600, formatter: 'TARGET 70–180 mg/dL',
    backgroundColor: '#666', padding: [2, 5], borderRadius: 2,
  };

  // an ordinary 08:00–16:00 daytime window at the two narrowest evidence widths:
  // the window's own start gate lands in the caption's glyph run, and NO
  // horizontal slot between the gates is wide enough to hold the caption —
  // which is why the escape is vertical
  const daytime = render(390, [480, 960]);
  assert.deepEqual(gates(daytime.el, [480, 960]), [136.4, 238.8]);
  assert.deepEqual(daytime.label, { ...dropped, ...rest },
    'the caption must clear the grip band on a struck daytime window at 390');

  const daytimeWider = render(400, [480, 960]);
  assert.deepEqual(gates(daytimeWider.el, [480, 960]), [139.8, 245.5]);
  assert.deepEqual(daytimeWider.label, { ...dropped, ...rest },
    'the caption must clear the grip band on a struck daytime window at 400');

  // the struck side of the reported Overnight boundary: the window's end gate
  // sits inside the caption
  const narrow = render(400, [0, 360]);
  assert.deepEqual(gates(narrow.el, [0, 360]), [34, 113.3]);
  assert.deepEqual(narrow.label, { ...dropped, ...rest });

  // and its clear side, where that same gate has slid out past the caption's
  // tail: the shipped placement, unchanged
  const wide = render(1010, [0, 360]);
  assert.deepEqual(gates(wide.el, [0, 360]), [GRID.left, 267.4]);
  assert.deepEqual(wide.label, { ...shipped, ...rest },
    'a caption no gate reaches keeps the placement it ships with');
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
    bandInner: '#aaa', median: '#ccc', targetEdge: '#ddd',
    onAccent: '#eee', text: '#123', surface2: '#234', line: '#345', occurrence: '#456', meal: '#567', grid: '#678',
  };
  let option = null;
  const chart = { setOption(next) { option = next; }, off() {}, on() {} };

  renderCanvas({ clientWidth: 1200, setAttribute() {} }, { getInstanceByDom() { return chart; } }, {
    envelope, markers: [{ index: 4, count: 1, minute: 60, medianCarbs: 20 }], colors, supportFloor: 8,
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
    bandInner: '#aaa', median: '#ccc', targetEdge: '#ddd',
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
    renderCanvas({ clientWidth: 1200, setAttribute() {} }, { getInstanceByDom() { return chart; } }, {
      envelope, markers: [], colors, supportFloor: 8, range: [40, 300],
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
    bandInner: '#aaa', median: '#ccc', targetEdge: '#ddd',
    onAccent: '#eee', text: '#123', surface2: '#234', line: '#345', occurrence: '#456', meal: '#567', grid: '#678',
  };
  const handlers = {};
  const chart = { setOption() {}, off() {}, on(name, fn) { handlers[name] = fn; } };
  let reported = null;
  const render = (extra) => renderCanvas({ clientWidth: 1200, setAttribute() {} }, { getInstanceByDom() { return chart; } }, {
    envelope, markers: [], colors, supportFloor: 8, range: [40, 300], window: [1320, 120],
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

test('#204 · the legend is retired for an accessible chart name and the band outlines are gone', () => {
  const labels = Array.from({ length: 96 }, (_, index) =>
    `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`);
  const filled = (value) => Array.from({ length: 96 }, () => value);
  const envelope = {
    labels, p10: filled(80), p25: filled(100), p50: filled(120), p75: filled(140),
    p90: filled(160), counts: filled(12), raw: filled(1), days: 12, pool: 45,
  };
  const colors = {
    muted: '#111', warn: '#222', danger: '#333', targetFill: '#444', targetText: '#555',
    rail: '#666', windowDim: '#77777788', windowEdge: '#888', bandOuter: '#999',
    bandInner: '#aaa', median: '#ccc', targetEdge: '#ddd',
    onAccent: '#eee', text: '#123', surface2: '#234', line: '#345', meal: '#567', grid: '#678',
  };
  let option = null;
  const chart = { setOption(next) { option = next; }, off() {}, on() {} };
  const attrs = new Map();
  const el = { clientWidth: 1200, setAttribute: (name, value) => attrs.set(name, value) };
  renderCanvas(el, { getInstanceByDom() { return chart; } }, {
    envelope, colors, supportFloor: 8, range: [40, 300], window: [360, 720], windowLabel: '06:00–12:00',
  });

  assert.equal(option.legend, undefined, 'no legend rides the plot');
  assert.equal(attrs.get('role'), 'img',
    'the bare div root is name-prohibited without an explicit role');
  assert.equal(attrs.get('aria-label'),
    'Glucose bands: 10th to 90th and 25th to 75th percentile ranges; median line');

  const names = option.series.map((series) => series.name);
  for (const retired of ['__p10', '__p25', '__p75', '__p90']) {
    assert.ok(!names.includes(retired), `${retired} boundary stroke is retired`);
  }
  const median = option.series.find((series) => series.name === 'Median');
  assert.equal(median.lineStyle.color, '#ccc', 'the median keeps the injected mark colour');
  assert.equal(median.lineStyle.width, 2.4, 'the median stays the widest continuous data mark');
  const widest = Math.max(...option.series
    .filter((series) => series.type === 'line' && !series.name.startsWith('__'))
    .map((series) => series.lineStyle?.width || 0));
  assert.equal(widest, 2.4,
    'no other pooled-envelope mark out-weighs the median (a drilled day trace deliberately does)');

  // a drilled day trace joins the accessible name; the base name stays fixed
  renderCanvas(el, { getInstanceByDom() { return chart; } }, {
    envelope, colors, supportFloor: 8, range: [40, 300], window: [360, 720], windowLabel: '06:00–12:00',
    trace: envelope.p50.slice(),
  });
  assert.equal(attrs.get('aria-label'),
    'Glucose bands: 10th to 90th and 25th to 75th percentile ranges; median line; selected day trace');
});
