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

/** Every live chart the roster browses: ranked ones first, then the Watching reads. */
export function rosterChartIds(findings, descriptors) {
  const ranked = rankedIds(findings, descriptors);
  return [...ranked, ...descriptors.map(({ chartId }) => chartId)
    .filter((chartId) => !ranked.includes(chartId))];
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
   too — basal, correction factor and carb ratio open the identical panel
   their findings-queue row opens, never a second implementation of it.

   Every level-2 frame the row route creates (`factor`, `chart`, `isf`,
   `slot`, `block`) carries `rowId` set to that same finding row id, so
   "already standing on this chart" is one comparison, not one per frame
   kind. A click that lands anywhere else pops to root before routing, so a
   parameter's panel replaces whatever stood before it rather than stacking
   under it. */
export function chartClickRoute(descriptor, standingFrame, findingsRows) {
  if (!descriptor) return { action: 'noop' };
  const standing = standingFrame && standingFrame.k !== 'factors' ? standingFrame : null;
  if (standing && standing.rowId === descriptor.chartId) return { action: 'noop' };
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

/* The dock repeats the spotlight's chart as a navigable echo. A drill marks
   the stage, not that echo, so there is one drilled tile per current frame. */
export function isDrilledSpotlight(seat, chartId, drilledChartId) {
  return seat?.seat === 'focal' && chartId === drilledChartId;
}

export function popInspector(stack, index, descriptors) {
  const next = stack.slice(0, index + 1);
  return { stack: next, drilledChartId: drilledChartIdForFrame(next.at(-1), descriptors) };
}

/* ONE ROOT, BECAUSE THERE IS ONE MODE (ADR 215). The inspector's root frame was
   `factors` under advice and `explore` without it; Explore is retired, so the
   root is `factors` and the normalization no longer takes a mode to branch on. */
export function inspectorStack(stack, drilledChartId, descriptors) {
  const root = { k: 'factors' };
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

/* ---- the dock's two states (ADR 215 amendment) -----------------------
   HIDDEN · BOTTOM-DOCKED. The same tiles, rails and pins in both; only the
   geometry differs. Everything below is pure arithmetic over one measured
   number — the canvas field's inner height — so the resolution is node-testable
   and the painter holds no rules of its own.

   MOUNTED IS GONE, and with it the third verb the handle could never carry.
   Mounted hid the spotlight and spent the whole field on a grid of minis: the
   pre-spotlight canvas, kept alive only because the handle had grown a control
   for it. Operator, judging the built dock: "mounted dies." One chart at full
   size over a strip of the rest is what this surface is now, and the reader
   reaches every other chart through the strip or through fullscreen — so a
   state that deleted the spotlight to show the strip larger was answering a
   question the spotlight had already answered.

   What is left is one object in two places, which is why there is one act in
   every state and no vocabulary to learn. */
export const SPOTLIGHT_FLOOR = 220;
export const MINI_FLOOR = 148;
const FIELD_GAP = 8;
export const DOCK_FLOOR = SPOTLIGHT_FLOOR + MINI_FLOOR + FIELD_GAP;

/* WHAT THE READER ASKED FOR IS WHAT THEY GET. `wanted` used to be a request the
   measured field could overrule — a short viewport turned a docked want into a
   mounted one, and a tall viewport refused to hide the minis at all. Neither
   override survives mounted: there is nothing to divert a short field to, and
   the tall-field refusal left the handle with no act to offer, which is a
   control that exists and does nothing. The dock is a toggle at every height. */
export const DOCK_WANTS = Object.freeze(['docked', 'hidden']);

/* THE FIELD DECIDES ONE THING ONLY: whether a docked strip has the room to sit
   BELOW the spotlight or has to float over it. It never decides which state the
   reader is in. */
export function dockView(fieldHeight, wanted = 'docked') {
  if (!DOCK_WANTS.includes(wanted)) {
    throw new RangeError(`unknown dock want ${wanted}`);
  }
  const short = fieldHeight < DOCK_FLOOR;
  /* A RAISED DOCK FLOATS OVER THE SPOTLIGHT; IT NEVER SQUEEZES IT. Splitting
     the field below the dock floor gave the spotlight 0px at a 150px viewport,
     destroying the one required way out by leaving nothing to click. Floating
     holds at any height, which is what lets the raise floor go with mounted:
     there is no height at which bottom-docking has to divert somewhere else. */
  const raised = wanted === 'docked' && short;
  /* TWO ACTS, AND THEY ARE DIFFERENT KINDS OF THING. The first is the toggle
     between the dock's two resting states, and it is always the state the
     reader is not in. `explore` is not a resting state at all — it opens the
     explorer, every chart at full size over the canvas — so it is offered
     alongside the toggle rather than instead of it, and it is the same act at
     every height because the explorer takes the pane rather than the field. */
  return {
    state: wanted,
    raised,
    short,
    acts: [wanted === 'hidden' ? 'up' : 'hide', 'explore'],
  };
}

/** Attention leaving a raised dock puts it away; a seated or hidden dock stays
    in the state the reader chose. Both a spotlight click and a finding drill
    use this transition (ADR 215). */
export function dismissRaisedDock(wanted, fieldHeight) {
  return dockView(fieldHeight, wanted).raised ? 'hidden' : wanted;
}
