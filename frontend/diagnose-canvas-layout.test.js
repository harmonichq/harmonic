import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PIN_CAP,
  arrangementFor,
  arrangementRange,
  createCanvasLayout,
  descriptorsFromFindings,
  focusSwap,
  optionForDescriptor,
  pinChart,
  placeSeats,
  seatCountFor,
  tileStatePresentation,
} from './diagnose-canvas-layout.js';

test('every pin count derives its arrangement', () => {
  assert.equal(PIN_CAP, 4);
  assert.deepEqual(Array.from({ length: 5 }, (_, count) => arrangementFor(count)),
    ['focal', 'split', 'pair', 'onetwo', 'quad']);
  assert.throws(() => arrangementFor(5), RangeError);
});

test('pinning alone reaches every arrangement before refusing the fifth pin', () => {
  let layout = createCanvasLayout({ focalId: 'a' });
  const reached = [layout.arrangement];
  for (const chartId of ['a', 'b', 'c', 'd']) {
    const result = pinChart(layout, chartId);
    assert.equal(result.accepted, true);
    layout = result.layout;
    reached.push(layout.arrangement);
  }
  assert.deepEqual(reached, ['focal', 'split', 'pair', 'onetwo', 'quad']);
  assert.equal(pinChart(layout, 'e').accepted, false);
});

test('a fifth pin is refused rather than evicting the oldest', () => {
  const layout = createCanvasLayout({ focalId: 'a', pins: ['a', 'b', 'c', 'd'] });
  const result = pinChart(layout, 'e');
  assert.equal(result.accepted, false);
  assert.deepEqual(result.layout.pins, ['a', 'b', 'c', 'd']);
});

test('a demoted focal chart returns to the slot the promoted chart came from', () => {
  const layout = createCanvasLayout({ focalId: 'a' });
  const result = focusSwap(['a', 'b', 'c', 'd'], layout, 'c');
  assert.equal(result.layout.focalId, 'c');
  assert.deepEqual(result.candidates, ['c', 'b', 'a', 'd']);
});

test('focus swap exchanges two pinned seats without losing either pin', () => {
  const layout = createCanvasLayout({ focalId: 'held-a', pins: ['held-a', 'held-b'] });
  const result = focusSwap(['held-a', 'held-b', 'candidate'], layout, 'held-b');
  assert.deepEqual(result.layout.pins, ['held-b', 'held-a']);
  assert.deepEqual(placeSeats(result.candidates, result.layout), [
    { chartId: 'held-b', seat: 'focal', pinned: true },
    { chartId: 'held-a', seat: 'slot-1', pinned: true },
  ]);
});

test('placeSeats fills only unpinned positions in candidate order', () => {
  const layout = createCanvasLayout({ focalId: 'candidate-a', pins: ['held'] });
  assert.deepEqual(placeSeats(['candidate-a', 'candidate-b', 'held'], layout), [
    { chartId: 'candidate-a', seat: 'focal', pinned: false },
    { chartId: 'held', seat: 'slot-1', pinned: true },
  ]);
});

test('placeSeats drops surplus candidates with every pin intact', () => {
  const layout = createCanvasLayout({ focalId: 'candidate-a', pins: ['held-a', 'held-b'] });
  assert.deepEqual(placeSeats(['candidate-a', 'candidate-b', 'candidate-c'], layout), [
    { chartId: 'held-a', seat: 'focal', pinned: true },
    { chartId: 'held-b', seat: 'slot-1', pinned: true },
  ]);
});

test('seat counts belong to the derived arrangement', () => {
  assert.deepEqual(['focal', 'split', 'pair', 'onetwo', 'quad'].map(seatCountFor),
    [4, 2, 2, 3, 4]);
});

test('the live descriptor list follows findings rows without a second chart list', () => {
  const registry = [
    { kind: 'basal', name: 'Basal · nights of steady data',
      modes: ['clock', 'event'], coordinateSchema: ['slot'],
      matches: (row) => row.parameter === 'basal_rate',
      coordinates: (row) => ({ slot: Math.floor(row.span.start_min / 30) }) },
    { kind: 'isf', name: 'Correction factor · rest windows',
      modes: ['event', 'clock'], coordinateSchema: [],
      matches: (row) => row.parameter === 'isf', coordinates: () => ({}) },
    { kind: 'carb-ratio', name: 'Carb ratio · meal runs', modes: ['event', 'clock'],
      coordinateSchema: ['block_id', 'analysis_generation'],
      matches: (row) => row.parameter === 'carb_ratio',
      coordinates: (row, findings) => ({ block_id: row.span.start_min,
        analysis_generation: findings.analysis_generation }) },
    { kind: 'event-comparison', name: 'Response comparison', modes: null,
      coordinateSchema: ['projection_id', 'finding_id', 'alignment', 'factor'],
      matches: (row) => Boolean(row.event_chart),
      nameFor: (row) => ({ title: row.title, meta: `${row.noun} aligned to each event` }),
      coordinates: (row, findings) => ({ projection_id: findings.projection_id,
        finding_id: row.id, alignment: 'event', factor: row.event_chart.lever }) },
    { kind: 'synthetic-fifth', name: 'Synthetic fifth', modes: ['clock'],
      coordinateSchema: ['cohort_id'],
      matches: (row) => row.parameter === 'synthetic_fifth',
      coordinates: (row) => ({ cohort_id: row.cohort_id }) },
  ];
  const findings = { analysis_generation: 'process:7', projection_id: 'fp_7', rows: [
    { id: 'basal:30-60', register: 'assert', parameter: 'basal_rate',
      span: { start_min: 30, end_min: 60 } },
    { id: 'ic:720', register: 'assert', parameter: 'carb_ratio',
      span: { start_min: 720, end_min: 1440 } },
    { id: 'finding:missed_meal', register: 'finding', title: 'Missed meal', noun: 'highs',
      event_chart: { lever: 'missed_meal', window: { scoped: false } } },
    { id: 'finding:late_bolus', register: 'finding', title: 'Late bolus', noun: 'meals',
      event_chart: { lever: 'late_bolus', window: { scoped: false } } },
    { id: 'synthetic:cohort', register: 'assert', parameter: 'synthetic_fifth',
      cohort_id: 'cohort-5' },
  ] };
  assert.deepEqual(descriptorsFromFindings(findings, registry).map(({ chartId, coordinates }) =>
    [chartId, coordinates]), [
    ['basal:30-60', { slot: 1 }],
    ['ic:720', { block_id: 720, analysis_generation: 'process:7' }],
    // each comparison tile asks the case-file path for its OWN row's factor
    ['finding:missed_meal', { projection_id: 'fp_7',
      finding_id: 'finding:missed_meal', alignment: 'event', factor: 'missed_meal' }],
    ['finding:late_bolus', { projection_id: 'fp_7',
      finding_id: 'finding:late_bolus', alignment: 'event', factor: 'late_bolus' }],
    // a fifth registry kind flows through with no conditional naming it
    ['synthetic:cohort', { cohort_id: 'cohort-5' }],
  ]);
  assert.deepEqual(Object.keys(descriptorsFromFindings(findings, registry)[0]).sort(),
    ['chartId', 'coordinates', 'data', 'kind', 'meta', 'mode', 'state', 'title']);
  /* TWO BEHAVIOURAL ROWS, TWO DISTINCT TILES. One static registry name printed
     look-alike tiles the reader could not tell apart, so the name comes from the
     entry's own row hook and the two must not collide. */
  const named = descriptorsFromFindings(findings, registry)
    .map(({ title, meta }) => [title, meta]);
  assert.deepEqual(named.slice(2, 4), [
    ['Missed meal', 'highs aligned to each event'],
    ['Late bolus', 'meals aligned to each event'],
  ]);
  assert.equal(new Set(named.map(([title]) => title)).size, named.length,
    'no two live tiles carry the same name');
  assert.equal(named[0][0], 'Basal · nights of steady data',
    'a kind with no row hook keeps the registry name');
  assert.equal(named[0][1], null, 'and defers its caption to the entry meta');

  findings.rows = [{ id: 'isf', register: 'held', parameter: 'isf' }];
  assert.deepEqual(descriptorsFromFindings(findings, registry).map(({ chartId }) => chartId), ['isf']);
});

test('every glucose chart in one arrangement receives one shared range', () => {
  const received = [];
  const registry = [
    { kind: 'a', glucoseValues: (data) => data.values,
      option: (_mode, { range }) => { received.push(range); return {}; } },
    { kind: 'b', glucoseValues: (data) => data.values,
      option: (_mode, { range }) => { received.push(range); return {}; } },
  ];
  const descriptors = [
    { chartId: 'a', kind: 'a', mode: null, state: 'ok', data: { values: [55, 120] } },
    { chartId: 'b', kind: 'b', mode: null, state: 'ok', data: { values: [180, 211] } },
  ];
  const range = arrangementRange(descriptors, registry, (values) => [
    Math.min(...values), Math.max(...values),
  ]);
  assert.deepEqual(range, [55, 211]);
  for (const descriptor of descriptors) {
    optionForDescriptor(descriptor, registry, range);
  }
  assert.equal(received.length, 2);
  assert.equal(received[0], received[1], 'every option receives the identical range object');
});

test('all four per-request states render product language rather than transport names', () => {
  const states = ['ok', 'empty', 'error', 'stale-generation'];
  assert.deepEqual(states.map((state) => tileStatePresentation({ state }).name), [
    'Evidence shown', 'Insufficient evidence', 'Evidence unavailable', 'Evidence changed',
  ]);
  assert.doesNotMatch(states.map((state) => tileStatePresentation({ state }).name).join(' '),
    /stale-generation|empty|ok\b|error/,
    'no request-state name reaches the reader');
  assert.equal(tileStatePresentation({ state: 'empty' }, true).name, 'Loading evidence');
  assert.equal(tileStatePresentation({ state: 'empty' }, true).message, 'Loading evidence…');
  assert.equal(tileStatePresentation({ state: 'stale-generation' }).message,
    'Evidence changed. Refresh findings.');
  assert.equal(tileStatePresentation({ state: 'stale-generation' }, true,
    'Server says this generation changed.').message, 'Server says this generation changed.',
    'the stale state stays visible while its recovery request is pending');
});

/* THE STALE-GENERATION RECOVERY IS NOT LAYOUT. It is the surface's one
   findings-generation authority, so it lives beside that primitive in
   frontend/diagnose-workstation.js and is driven end to end — typed 409 in,
   recovery run, tile redrawn, pin intact — by
   frontend/diagnose-canvas-composition.browser.test.mjs. A second copy of it
   here, over hand-made callbacks, is what let a recovery that restored a stale
   layout look correct. */

test('the layout module owns no findings-generation check of its own', () => {
  const layout = readFileSync(new URL('./diagnose-canvas-layout.js', import.meta.url), 'utf8');
  assert.doesNotMatch(layout, /refreshStillCurrent|recoverStaleGeneration/,
    'generation currency belongs to the workstation primitive, not to layout state');
  const workstation = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');
  assert.equal(workstation.match(/await refreshFindingsGeneration\(/g)?.length, 1,
    'all findings-generation refreshes pass through one request authority');
});

test('pinning holds and layers a chart without moving focus', () => {
  let layout = createCanvasLayout({ focalId: 'focal-chart' });
  for (const chartId of ['slot-a', 'slot-b', 'slot-c']) {
    layout = pinChart(layout, chartId).layout;
    assert.equal(layout.focalId, 'focal-chart',
      `pinning ${chartId} leaves the focal chart where the reader put it`);
  }
  assert.deepEqual(layout.pins, ['slot-a', 'slot-b', 'slot-c']);
});

test('a pinned focal chart keeps the focal seat whatever order it was pinned in', () => {
  const layout = createCanvasLayout({ focalId: 'second', pins: ['first', 'second'] });
  assert.deepEqual(placeSeats(['first', 'second'], layout), [
    { chartId: 'second', seat: 'focal', pinned: true },
    { chartId: 'first', seat: 'slot-1', pinned: true },
  ]);
});
