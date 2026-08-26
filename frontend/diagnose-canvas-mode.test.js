import test from 'node:test';
import assert from 'node:assert/strict';

import { createCanvasLayout } from './diagnose-canvas-layout.js';
import {
  advisoryPresentation,
  candidateIdsForMode,
  dismissFullscreen,
  enterFullscreen,
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

test('Explore extinguishes advice while preserving reader and signal marks', () => {
  assert.deepEqual(advisoryPresentation('explore'), {
    rankFilament: false,
    rankChips: false,
    tallies: false,
    staging: false,
    recommendationCopy: false,
    pinAccent: true,
    measuredSignal: true,
  });
  assert.equal(advisoryPresentation('findings').staging, true);
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
