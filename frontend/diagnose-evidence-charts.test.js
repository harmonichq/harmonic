import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeDeps } from './data.js';

import {
  DIAGNOSE_EVIDENCE_CHARTS,
  GLUCOSE_ENVELOPE,
  GLUCOSE_STEP,
  glucoseRange,
} from './diagnose-evidence-charts.js';

const fixture = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

function fakeFetch(body = {}) {
  const calls = [];
  return {
    calls,
    fetch: async (url, opts = {}) => {
      calls.push({ url, opts });
      return { ok: true, status: 200, statusText: 'OK', json: async () => body };
    },
  };
}

test('the shared glucose range contains the envelope and expands in 20 mg/dL steps', () => {
  assert.equal(GLUCOSE_STEP, 20);
  assert.deepEqual(GLUCOSE_ENVELOPE, [60, 200]);
  assert.deepEqual(glucoseRange([]), [60, 200]);
  assert.deepEqual(glucoseRange([100, 160]), [60, 200]);
  assert.deepEqual(glucoseRange([55, 210]), [40, 220]);
  assert.deepEqual(glucoseRange([38, 301]), [20, 320]);
  assert.deepEqual(glucoseRange([NaN, Infinity]), [60, 200]);
});

test('Diagnose evidence clients send each feed its declared request coordinates', async () => {
  const transport = fakeFetch();
  const deps = makeDeps({ fetch: transport.fetch });

  await deps.fetchDiagnoseBasalNightEvidence({ slot: 11 });
  await deps.fetchDiagnoseIsfRestWindowEvidence();
  await deps.fetchDiagnoseCarbRatioBlockEvidence({
    blockId: 1200, analysisGeneration: 'process:7',
  });

  assert.deepEqual(transport.calls.map(({ url }) => url), [
    '/api/diagnose/basal-night-evidence?slot=11',
    '/api/diagnose/isf-rest-window-evidence',
    '/api/diagnose/carb-ratio-block-evidence?block_id=1200&analysis_generation=process%3A7',
  ]);
});

test('I:C block evidence turns only a stale-generation 409 into a typed stale result', async () => {
  const detail = { code: 'analysis_generation_mismatch',
    message: 'Evidence changed. Refresh findings.' };
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return { ok: false, status: 409, statusText: 'Conflict',
      json: async () => ({ detail }) };
  };

  assert.deepEqual(await makeDeps({ fetch }).fetchDiagnoseCarbRatioBlockEvidence({
    blockId: 660, analysisGeneration: 'process:8',
  }), { stale: true, message: 'Evidence changed. Refresh findings.' });
  assert.equal(calls, 1, 'the transport reports staleness without retrying');
});

test('the registry declares four stateless chart kinds and their request coordinates', () => {
  assert.deepEqual(DIAGNOSE_EVIDENCE_CHARTS.map(({ kind }) => kind), [
    'basal', 'isf', 'carb-ratio', 'event-comparison',
  ]);
  assert.deepEqual(DIAGNOSE_EVIDENCE_CHARTS.map(({ coordinateSchema }) => coordinateSchema), [
    ['slot'], [], ['block_id', 'analysis_generation'], ['view', 'factor', 'window'],
  ]);
  assert.deepEqual(DIAGNOSE_EVIDENCE_CHARTS.map(({ modes }) => modes), [
    ['clock', 'event'], ['event', 'clock'], ['event', 'clock'], null,
  ]);
  assert.ok(DIAGNOSE_EVIDENCE_CHARTS.every((entry) => !Object.hasOwn(entry, 'coordinates')));
});

test('entries build different alignments simultaneously with one optical spine', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const isf = fixture('../mockups/diagnose-workstation.synthetic/isf-rest-window-evidence.capture.json').payload;
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.cross_midnight;
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  const basalClock = byKind.basal.option('clock', {
    data: basal, range: null, explore: false, mini: false, window: [1320, 120],
  });
  const isfEvent = byKind.isf.option('event', {
    data: isf, range: null, explore: false, mini: false, window: [1320, 120],
  });
  const icEvent = byKind['carb-ratio'].option('event', {
    data: ic, range: [80, 220], explore: false, mini: false, window: [1320, 120],
  });
  const event = fixture('./__fixtures__/event-comparison-mirror.json').windows.meals_default;
  const comparison = byKind['event-comparison'].option(null, {
    data: event, range: [80, 220], explore: false, mini: false, window: [1320, 120],
  });

  assert.equal(basalClock.xAxis.type, 'category');
  assert.equal(isfEvent.xAxis.name, 'insulin acted (U)');
  assert.deepEqual(icEvent.yAxis.min, 80);
  assert.deepEqual(icEvent.yAxis.max, 220);
  assert.deepEqual(basalClock.grid, isfEvent.grid);
  assert.deepEqual(isfEvent.grid, icEvent.grid);
  assert.deepEqual(icEvent.grid, comparison.grid);
});

test('payload counts stay distinct in chart and thumbnail presentation', () => {
  const basal = {
    roster_count: 19, directional_support_count: 3, nights: [],
    asserts_move: false, safety_status: 'insufficient evidence', slot: 0,
  };
  const isf = {
    counts: { detected_windows: 7, qualifying_windows: 2, qualifying_steps: 41 },
    windows: [], steps: [], finding: { asserts_move: false, direction: null },
  };
  const ic = {
    block: { label: 'Overnight', examined_runs: 11, support: 4, excluded_runs: 7,
      start_min: 1200, end_min: 420 },
    runs: [], series: [],
  };
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  assert.match(byKind.basal.option('clock', { data: basal, mini: false }).aria.description,
    /19 nights.*3 directional/);
  assert.match(byKind.isf.option('event', { data: isf, mini: false }).aria.description,
    /7 detected.*2 qualifying windows.*41 qualifying steps/);
  assert.match(byKind['carb-ratio'].option('clock', { data: ic, mini: false,
    window: [1200, 420] }).aria.description, /11 examined.*4 support.*7 excluded/);
  assert.equal(byKind.basal.thumbnail(basal).graphic[1].style.text, '19 / 3');
  assert.equal(byKind.isf.thumbnail(isf).graphic[1].style.text, '7 / 2 / 41');
  assert.equal(byKind['carb-ratio'].thumbnail(ic).graphic[1].style.text, '11 / 4');
});

test('glucose projections expose served values and thumbnails have no axis furniture', () => {
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.below_floor;
  const event = fixture('./__fixtures__/event-comparison-mirror.json').windows.meals_default;
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  assert.equal(byKind.basal.glucoseValues, null);
  assert.equal(byKind.isf.glucoseValues, null);
  assert.ok(byKind['carb-ratio'].glucoseValues(ic).includes(220));
  assert.ok(byKind['event-comparison'].glucoseValues(event).includes(237));
  for (const entry of DIAGNOSE_EVIDENCE_CHARTS) {
    const thumbData = entry.kind === 'basal' ? { roster_count: 0, directional_support_count: 0, nights: [] }
      : entry.kind === 'isf' ? { counts: { detected_windows: 0, qualifying_windows: 0,
        qualifying_steps: 0 }, windows: [], steps: [] }
        : entry.kind === 'carb-ratio' ? { block: { examined_runs: 0, support: 0 }, runs: [], series: [] }
          : event;
    const thumbnail = entry.thumbnail(thumbData);
    assert.equal(thumbnail.xAxis.show, false);
    assert.equal(thumbnail.yAxis.show, false);
    assert.match(thumbnail.graphic[0].style.font, /600/);
    assert.match(thumbnail.graphic[1].style.font, /monospace/);
  }
});

test('the event-comparison entry reuses continuous shipped traces with the injected range', () => {
  const event = fixture('./__fixtures__/event-comparison-mirror.json').windows.meals_default;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'event-comparison');
  const option = entry.option(null, { data: event, range: [80, 240] });

  assert.equal(option.yAxis.min, 80);
  assert.equal(option.yAxis.max, 240);
  const traces = option.series.filter((series) => series.type === 'line' && series.data.length);
  assert.ok(traces.length > 0);
  assert.ok(traces.every((series) => series.connectNulls === true));
  assert.equal(option.legend.length, 2, 'the option carries a two-column cohort key');
  assert.ok(option.legend.every(({ orient, bottom }) => orient === 'vertical' && bottom === 0));
});

test('selected and thin-cohort event traces also join across missing samples', () => {
  const windows = fixture('./__fixtures__/event-comparison-mirror.json').windows;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'event-comparison');
  for (const payload of [windows.selection, windows.wrapping]) {
    const traces = entry.option(null, { data: payload, range: [60, 240] }).series
      .filter((series) => series.type === 'line' && series.data.length);
    assert.ok(traces.length > 0);
    assert.ok(traces.every((series) => series.connectNulls === true));
  }
});

test('current I:C event options render every published meal member', () => {
  const cases = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases;
  const ic = cases.cross_midnight;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'carb-ratio');
  const option = entry.option('event', { data: ic, range: [60, 200] });
  const expectedMembers = ic.runs.reduce((count, run) => count + run.member_offsets_min.length, 0);
  const markers = option.series.filter(({ type }) => type === 'scatter');
  const traces = option.series.filter((series) => series.type === 'line' && series.data.length);

  assert.deepEqual(markers.map(({ symbol }) => symbol), ['diamond', 'emptyDiamond']);
  assert.equal(markers.reduce((count, series) => count + series.data.length, 0), expectedMembers);
  assert.ok(traces.every(({ connectNulls }) => connectNulls === true));
  assert.deepEqual(option.legend.data.map(({ name }) => name),
    ['Support run', 'Directional-only run']);

  const mixed = entry.option('event', { data: cases.directional_only, range: [60, 200] });
  const mixedTraces = mixed.series.filter((series) => series.type === 'line' && series.data.length);
  assert.ok(mixedTraces.every(({ connectNulls }) => connectNulls === true));
  assert.ok(mixedTraces.some(({ lineStyle }) => lineStyle.type === 'solid'));
  assert.ok(mixedTraces.some(({ lineStyle }) => lineStyle.type === 'dashed'));
  assert.deepEqual(mixed.series.filter(({ type }) => type === 'scatter').map(({ symbol }) => symbol),
    ['diamond', 'emptyDiamond']);
});

test('glucose chart options fail closed without one injected arrangement range', () => {
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.below_floor;
  const event = fixture('./__fixtures__/event-comparison-mirror.json').windows.meals_default;
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  assert.throws(() => byKind['carb-ratio'].option('event', { data: ic }),
    /arrangement glucose range/);
  assert.throws(() => byKind['event-comparison'].option(null, { data: event }),
    /arrangement glucose range/);
});
