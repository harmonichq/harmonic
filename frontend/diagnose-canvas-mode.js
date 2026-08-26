import { createCanvasLayout, placeSeats } from './diagnose-canvas-layout.js';
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

export function seatCanvas(mode, findings, descriptors, registry, layout) {
  return placeSeats(candidateIdsForMode(mode, findings, descriptors, registry), layout);
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
