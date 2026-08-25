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
    { kind: 'basal', modes: ['clock', 'event'], coordinateSchema: ['slot'] },
    { kind: 'isf', modes: ['event', 'clock'], coordinateSchema: [] },
    { kind: 'carb-ratio', modes: ['event', 'clock'],
      coordinateSchema: ['block_id', 'analysis_generation'] },
    { kind: 'event-comparison', modes: null, coordinateSchema: ['view', 'factor', 'window'] },
  ];
  const findings = { analysis_generation: 'process:7', rows: [
    { id: 'basal:30-60', register: 'assert', parameter: 'basal_rate',
      span: { start_min: 30, end_min: 60 } },
    { id: 'ic:720', register: 'assert', parameter: 'carb_ratio',
      span: { start_min: 720, end_min: 1440 } },
  ] };
  assert.deepEqual(descriptorsFromFindings(findings, registry).map(({ chartId, coordinates }) =>
    [chartId, coordinates]), [
    ['basal:30-60', { slot: 1 }],
    ['ic:720', { block_id: 720, analysis_generation: 'process:7' }],
  ]);
  assert.deepEqual(Object.keys(descriptorsFromFindings(findings, registry)[0]).sort(),
    ['chartId', 'coordinates', 'data', 'kind', 'mode', 'state']);

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

test('all four per-request states render their own name', () => {
  const states = ['ok', 'empty', 'error', 'stale-generation'];
  assert.deepEqual(states.map((state) => tileStatePresentation({ state }).name), states);
  assert.equal(tileStatePresentation({ state: 'empty' }, true).message, 'Loading evidence…');
  assert.equal(tileStatePresentation({ state: 'stale-generation' }).message,
    'Evidence changed. Refresh findings.');
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
  assert.equal(workstation.match(/await refreshFindingsGeneration\(/g)?.length, 2,
    'one findings-generation fetch, reached through requestFindingsGeneration and the retirement path');
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
