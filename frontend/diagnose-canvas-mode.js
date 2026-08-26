import { createCanvasLayout } from './diagnose-canvas-layout.js';
import { eventChartCoordinate } from './diagnose-findings-queue.js';

const CANVAS_MODES = Object.freeze(['findings', 'explore']);

const assertMode = (mode) => {
  if (!CANVAS_MODES.includes(mode)) throw new RangeError(`unknown canvas mode ${mode}`);
};

export function advisoryPresentation(mode) {
  assertMode(mode);
  const advice = mode === 'findings';
  return {
    rankFilament: advice,
    rankChips: advice,
    tallies: advice,
    staging: advice,
    recommendationCopy: advice,
    pinAccent: true,
    measuredSignal: true,
  };
}

function registryCandidateIds(descriptors, registry) {
  const order = new Map(registry.map((entry, index) => [entry.kind, index]));
  return descriptors.map((descriptor, index) => ({ descriptor, index }))
    .sort((a, b) => (order.get(a.descriptor.kind) ?? registry.length)
      - (order.get(b.descriptor.kind) ?? registry.length) || a.index - b.index)
    .map(({ descriptor }) => descriptor.chartId);
}

export function candidateIdsForMode(mode, findings, descriptors, registry) {
  assertMode(mode);
  const natural = registryCandidateIds(descriptors, registry);
  if (mode === 'explore') return natural;
  const first = findings?.rows?.[0];
  const recommended = eventChartCoordinate(first)
    && descriptors.find((descriptor) => descriptor.chartId === first.id
      && descriptor.kind === 'event-comparison')?.chartId;
  return recommended ? [recommended, ...natural.filter((id) => id !== recommended)] : natural;
}

export function reconcileTileDescriptors(
  generated, previous, layout, { policyChanged = false } = {},
) {
  const generatedIds = new Set(generated.map(({ chartId }) => chartId));
  const previousById = new Map(previous.map((descriptor) => [descriptor.chartId, descriptor]));
  const pins = layout.pins.filter((chartId) => generatedIds.has(chartId)
    || previousById.has(chartId));
  const vanishedPinnedIds = pins.filter((chartId) => !generatedIds.has(chartId));
  const descriptors = [...generated, ...vanishedPinnedIds.map((chartId) => ({
    ...previousById.get(chartId), data: null, state: 'empty',
  }))];
  const available = new Set(descriptors.map(({ chartId }) => chartId));
  const focalId = !policyChanged && available.has(layout.focalId)
    ? layout.focalId : null;
  return {
    descriptors,
    vanishedPinnedIds,
    layout: createCanvasLayout({ focalId, pins }),
  };
}

export function drilledChartIdForFrame(frame, descriptors) {
  if (!frame) return null;
  if (frame.k === 'chart') return frame.chartId;
  if (frame.rowId && descriptors.some(({ chartId }) => chartId === frame.rowId)) {
    return frame.rowId;
  }
  if (frame.k === 'slot') {
    return descriptors.find(({ kind, coordinates }) => kind === 'basal'
      && coordinates?.slot === frame.cell?.i)?.chartId || null;
  }
  if (frame.k === 'block') {
    return descriptors.find(({ kind, coordinates }) => kind === 'carb-ratio'
      && coordinates?.block_id === frame.cell?.id)?.chartId || null;
  }
  if (frame.k === 'isf') {
    return descriptors.find(({ kind }) => kind === 'isf')?.chartId || null;
  }
  return null;
}

export function popInspector(stack, index, descriptors) {
  const next = stack.slice(0, index + 1);
  return { stack: next, drilledChartId: drilledChartIdForFrame(next.at(-1), descriptors) };
}

export function inspectorStackForMode(mode, stack, drilledChartId, descriptors) {
  assertMode(mode);
  const root = { k: mode === 'explore' ? 'explore' : 'factors' };
  const descriptor = descriptors.find(({ chartId }) => chartId === drilledChartId);
  if (!descriptor) return [root];
  if (descriptor.kind === 'event-comparison') {
    const factor = stack.find((frame) => frame.k === 'factor'
      && frame.rowId === drilledChartId);
    return factor ? [root, factor] : [root];
  }
  return [root, { k: 'chart', chartId: drilledChartId, rowId: drilledChartId }];
}

export function enterFullscreen(layout, chartId) {
  return {
    chartId,
    priorLayout: createCanvasLayout({ focalId: layout.focalId, pins: layout.pins }),
  };
}

export function dismissFullscreen(fullscreen) {
  if (!fullscreen) return null;
  return createCanvasLayout({
    focalId: fullscreen.priorLayout.focalId,
    pins: fullscreen.priorLayout.pins,
  });
}

export function untraceDrill(drill) {
  return drill ? { ...drill, selectedId: null } : drill;
}
