import { createCanvasLayout } from './diagnose-canvas-layout.js';
import { eventChartCoordinate } from './diagnose-findings-queue.js';

/* THE ROW SEATS RANKED FINDINGS AND NOTHING ELSE (ADR 215). `assert` and
   `finding` are the two registers the server prices and ranks; `held`, `blind`
   and `history` are the Watching reads, and a Watching read never seats itself
   on the canvas. They stay reachable from the roster, and pinning one there is
   what brings it onto the row — which is a deliberate act, not a rank.

   The order IS the server's row order. This used to sort by registry kind, so
   whichever kind the registry happened to list first led the field regardless
   of what the analysis actually found; the published rank is the only ordering
   the reader has been shown anywhere else on this surface. */
const RANKED_REGISTERS = Object.freeze(['assert', 'finding']);

function rankedIds(findings, descriptors) {
  const live = new Set(descriptors.map(({ chartId }) => chartId));
  return (findings?.rows || [])
    .filter((row) => RANKED_REGISTERS.includes(row.register) && live.has(row.id))
    .map((row) => row.id);
}

/* WHAT MAY SEAT ITSELF, AND WHAT MAY ONLY BE PUT THERE. These two lists differ
   by exactly one thing and that difference is the ruling: a Watching chart is
   live, so the roster browses it, but it reaches the row only by being pinned.
   Nothing else separates them, which is why they are two functions over one
   rank rather than two orderings. */
export function seatableChartIds(findings, descriptors, pins = []) {
  const ranked = rankedIds(findings, descriptors);
  const live = new Set(descriptors.map(({ chartId }) => chartId));
  return [...ranked, ...pins.filter((chartId) => live.has(chartId)
    && !ranked.includes(chartId))];
}

/** Every live chart the roster browses: ranked ones, retained reads, then Watching. */
export function rosterChartIds(findings, descriptors, pins = []) {
  const ranked = rankedIds(findings, descriptors);
  const live = descriptors.map(({ chartId }) => chartId);
  const retained = pins.filter((chartId) => live.includes(chartId)
    && !ranked.includes(chartId));
  return [...ranked, ...retained, ...live.filter((chartId) => !ranked.includes(chartId)
    && !retained.includes(chartId))];
}

/** The chart the top-ranked row publishes, when it publishes one. */
export function recommendedFocalId(findings, descriptors) {
  const first = findings?.rows?.[0];
  if (!eventChartCoordinate(first)) return null;
  return descriptors.find((descriptor) => descriptor.chartId === first.id
    && descriptor.kind === 'event-comparison')?.chartId || null;
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

/* A CHART CLICK IS ONE LEVEL, ALWAYS THE SAME ONE (ADR 294). The behavioral
   branch already resolved a chart click by finding the findings row whose id
   equals the chart's own id and handing it to the row route; evidence chart
   descriptors are generated one per findings row and carry that row's id as
   their chart identity, so the same resolution reaches every settings kind
   too — basal, ISF and I:C open the identical panel
   their findings-queue row opens, never a second implementation of it.

   NOT EVERY LEVEL-2 FRAME CARRIES `rowId`. A frame the row route creates
   does, but `slot` and `block` are also reachable straight from the lane —
   `pickCell(cell)` / `pickBlock(cell)` default `rowId` to `null` there — and
   a CFG-restored boot frame carries no `rowId` at all. "Already standing on
   this chart" therefore delegates to `drilledChartIdForFrame`, the one place
   that already knows how to recover a frame's real chart identity per kind
   (a cell's own coordinates for `slot`/`block`, kind alone for `isf`,
   `rowId` only where the frame actually has one) rather than trusting a
   field only some frames set. A click that lands anywhere else pops to root
   before routing, so a parameter's panel replaces whatever stood before it
   rather than stacking under it. */
export function chartClickRoute(descriptor, standingFrame, findingsRows) {
  if (!descriptor) return { action: 'noop' };
  const standing = standingFrame && standingFrame.k !== 'factors' ? standingFrame : null;
  if (standing && drilledChartIdForFrame(standing, [descriptor]) === descriptor.chartId) {
    return { action: 'noop' };
  }
  const popToRoot = Boolean(standing);
  const behavioral = descriptor.kind === 'event-comparison';
  const row = (findingsRows || []).find((item) => item.id === descriptor.chartId) || null;
  if (behavioral && !row?.lever) {
    return {
      action: 'placeholder',
      popToRoot,
      message: 'This behavioral chart has no published lever, so its case file is withheld.',
    };
  }
  if (row) return { action: 'drill', popToRoot, row };
  return { action: 'noop' };
}

/* THE QUESTION IS WHETHER THE FINDING IS LIVE, NOT WHETHER THE TILE IS
   (ADR 294). `reconcileTileDescriptors` deliberately keeps a PINNED chart's
   descriptor alive after its findings row drops out — `{...previous, data:
   null, state: 'empty'}` — so a chart frame's own `chartId` can still resolve
   through `tileDescriptors` long after the finding it names is gone; a
   descriptor-presence check reads that retained pin as "still there" and
   states something untrue. The finding a `chart` frame names is exactly the
   findings row sharing its id (chart identity IS the row id, one per row),
   so this reads the one ground truth neither pinning nor tile-runtime
   retention can shadow. */
export function chartFrameFindingIsLive(chartId, findingsRows) {
  return (findingsRows || []).some((row) => row.id === chartId);
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

/* All charts repeats the spotlight's chart as a navigable cell. A drill marks
   the stage, not that cell, so there is one drilled tile per current frame. */
export function isDrilledSpotlight(seat, chartId, drilledChartId) {
  return seat?.seat === 'focal' && chartId === drilledChartId;
}

export function popInspector(stack, index, descriptors) {
  const next = stack.slice(0, index + 1);
  return { stack: next, drilledChartId: drilledChartIdForFrame(next.at(-1), descriptors) };
}

/* THE STAGE HOLDS THE ACTIVE FINDING'S CHART, NEVER THE CHART JUST LEFT (ADR
   306). A reconcile whose prior focal chart vanished, and a pop that lands
   with no drill to re-seat, resolve to the same fallback: the rank-1 event
   chart, else the first ranked candidate, else the first pin, else none. Both
   callers share this one tail so the fallback can never diverge from what the
   reconcile already used to fall back to. */
export function fallbackFocalId(findings, descriptors, candidates, pins) {
  return recommendedFocalId(findings, descriptors) || candidates[0] || pins[0] || null;
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
