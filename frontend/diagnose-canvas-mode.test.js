import test from 'node:test';
import assert from 'node:assert/strict';

import { createCanvasLayout, optionForDescriptor } from './diagnose-canvas-layout.js';
import { DIAGNOSE_EVIDENCE_CHARTS } from './diagnose-evidence-charts.js';
import {
  advisoryPresentation,
  candidateIdsForMode,
  dismissFullscreen,
  inspectorStackForMode,
  enterFullscreen,
  popInspector,
  reconcileTileDescriptors,
  seatCanvas,
  untraceDrill,
} from './diagnose-canvas-mode.js';

const registry = [
  { kind: 'basal' },
  { kind: 'isf' },
  { kind: 'carb-ratio' },
  { kind: 'event-comparison' },
];

const descriptors = [
  { chartId: 'ic:late', kind: 'carb-ratio' },
  { chartId: 'finding:meal', kind: 'event-comparison' },
  { chartId: 'basal:0-30', kind: 'basal' },
  { chartId: 'basal:30-60', kind: 'basal' },
  { chartId: 'isf', kind: 'isf' },
];

test('Explore renders basal evidence without an advisory verdict or move color', () => {
  const descriptor = {
    chartId: 'basal:0-30', kind: 'basal', mode: 'event', state: 'ok',
    data: { slot: 0, roster_count: 12, directional_support_count: 9,
      asserts_move: true, safety_status: 'raise' },
  };
  const option = optionForDescriptor(descriptor, DIAGNOSE_EVIDENCE_CHARTS, null, {
    presentation: advisoryPresentation('explore'),
  });
  const rendered = JSON.stringify(option);
  assert.doesNotMatch(rendered, /raise|directional support|analyzer verdict/i);
  assert.equal(option.series[0].name, 'Nights of steady data');
  assert.deepEqual(option.series[0].data, [12]);
  const held = optionForDescriptor({
    ...descriptor,
    data: { ...descriptor.data, asserts_move: false, safety_status: 'insufficient evidence' },
  }, DIAGNOSE_EVIDENCE_CHARTS, null, {
    presentation: advisoryPresentation('explore'),
  });
  const measured = optionForDescriptor({
    ...descriptor, mode: 'clock', data: { nights: [] },
  }, DIAGNOSE_EVIDENCE_CHARTS, null).series[1].lineStyle.color;
  assert.equal(option.series[0].itemStyle.color, measured);
  assert.equal(held.series[0].itemStyle.color, measured);
});

test('entering Explore collapses an advisory parameter frame to measured chart evidence', () => {
  const stack = [
    { k: 'factors' },
    { k: 'factor', rowId: 'finding:meal' },
    { k: 'slot', cell: { i: 0 } },
  ];
  assert.deepEqual(inspectorStackForMode('explore', stack, 'basal:0-30', descriptors), [
    { k: 'explore' },
    { k: 'chart', chartId: 'basal:0-30', rowId: 'basal:0-30' },
  ]);
});

test('findings candidates begin with the top-ranked row event chart', () => {
  const findings = { rows: [
    { id: 'finding:meal', event_chart: {
      lever: 'missed_meal',
      window: { scoped: false, start_min: null, end_min: null },
    } },
  ] };
  assert.deepEqual(candidateIdsForMode('findings', findings, descriptors, registry), [
    'finding:meal', 'basal:0-30', 'basal:30-60', 'isf', 'ic:late',
  ]);
});

test('findings fall back to registry order when the top row has no event chart', () => {
  const findings = { rows: [{ id: 'basal:0-30', event_chart: null }] };
  assert.deepEqual(candidateIdsForMode('findings', findings, descriptors, registry), [
    'basal:0-30', 'basal:30-60', 'isf', 'ic:late', 'finding:meal',
  ]);
  assert.deepEqual(candidateIdsForMode('explore', findings, descriptors, registry), [
    'basal:0-30', 'basal:30-60', 'isf', 'ic:late', 'finding:meal',
  ]);
});

test('seating policy delegates placement and never evicts a pin', () => {
  const findings = { rows: [{ id: 'finding:meal', event_chart: {
    lever: 'missed_meal',
    window: { scoped: false, start_min: null, end_min: null },
  } }] };
  const layout = createCanvasLayout({ focalId: 'finding:meal', pins: ['basal:0-30'] });
  assert.deepEqual(seatCanvas('findings', findings, descriptors, registry, layout), [
    { chartId: 'finding:meal', seat: 'focal', pinned: false },
    { chartId: 'basal:0-30', seat: 'slot-1', pinned: true },
  ]);
});

test('reconcileTileDescriptors retains a vanished pin as a named degraded tile', () => {
  const prior = [
    { chartId: 'basal:0-30', kind: 'basal', mode: 'clock', data: { nights: [{}] }, state: 'ok' },
    { chartId: 'isf', kind: 'isf', mode: 'event', data: null, state: 'empty' },
  ];
  const generated = [{ chartId: 'isf', kind: 'isf', mode: 'event', data: null, state: 'empty' }];
  const result = reconcileTileDescriptors(
    generated, prior, createCanvasLayout({ focalId: 'isf', pins: ['basal:0-30'] }),
    { policyChanged: true },
  );
  assert.deepEqual(result.layout.pins, ['basal:0-30']);
  assert.deepEqual(result.vanishedPinnedIds, ['basal:0-30']);
  assert.deepEqual(result.descriptors.find(({ chartId }) => chartId === 'basal:0-30'), {
    chartId: 'basal:0-30', kind: 'basal', mode: 'clock', data: null, state: 'empty',
  });
});

test('breadcrumb return restores provenance to the chart owning the returned inspector', () => {
  const stack = [
    { k: 'factors' },
    { k: 'factor', rowId: 'finding:meal' },
    { k: 'slot', cell: { i: 0 } },
  ];
  assert.deepEqual(popInspector(stack, 1, descriptors), {
    stack: [{ k: 'factors' }, { k: 'factor', rowId: 'finding:meal' }],
    drilledChartId: 'finding:meal',
  });
});

test('fullscreen dismissal restores the exact prior layout with pins intact', () => {
  const layout = createCanvasLayout({ focalId: 'isf', pins: ['basal:0-30', 'ic:late'] });
  const fullscreen = enterFullscreen(layout, 'finding:meal');
  layout.pins.push('changed-after-snapshot');
  const restored = dismissFullscreen(fullscreen);
  assert.deepEqual(restored, createCanvasLayout({
    focalId: 'isf', pins: ['basal:0-30', 'ic:late'],
  }));
});

test('un-trace clears the selected trace while the drilled chart stays open', () => {
  const drill = { chartId: 'finding:meal', rowId: 'finding:meal', open: true,
    selectedId: 'occ:7', requestedAlignment: 'event' };
  assert.deepEqual(untraceDrill(drill), { ...drill, selectedId: null });
});
