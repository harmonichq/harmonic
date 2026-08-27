const TILE_STATES = Object.freeze(['ok', 'empty', 'error', 'stale-generation']);
/* WHAT THE READER IS TOLD ABOUT A TILE, never the request state's own name.
   `ok` says the evidence is drawn and NOT that the reading is supported: whether
   a parameter's evidence supports a move is the analyzer's verdict, which the
   chart's own legend carries for the one kind that has one. A tile head that
   said "Supported" over every drawn chart would assert a safety fact this state
   does not know. */
const TILE_STATE_NAMES = Object.freeze({
  ok: 'Evidence shown',
  empty: 'Insufficient evidence',
  error: 'Evidence unavailable',
  'stale-generation': 'Evidence changed',
});

/* THE FIELD IS FIXED (ADR 215): one focal chart, and beneath it a row of minis
   that scrolls. Nothing derives a geometry from a pin count any more — the
   five-arrangement map, its seat counts and the pin cap they needed are gone,
   and with them the miniature that painted them. */
export function createCanvasLayout({ focalId = null, pins = [] } = {}) {
  if (!Array.isArray(pins) || new Set(pins).size !== pins.length) {
    throw new RangeError('pins must be a list of unique chart ids');
  }
  return { focalId, pins: [...pins] };
}

/* A PIN ORDERS THE ROW; IT DOES NOT HOLD A POSITION (ADR 215 amendment). It
   says "keep this left-most", so it can never be refused: a fourth pin is not
   rejected, it sits one scroll-tick to the right of the three the row shows at
   rest. That is why there is no cap here and no `accepted` answer to give — the
   caller has no refusal to render. */
export function pinChart(layout, chartId) {
  return layout.pins.includes(chartId) ? layout : createCanvasLayout({
    focalId: layout.focalId,
    pins: [...layout.pins, chartId],
  });
}

export function unpinChart(layout, chartId) {
  return createCanvasLayout({
    focalId: layout.focalId,
    pins: layout.pins.filter((id) => id !== chartId),
  });
}

/* THE DOCK IS THE WHOLE ORDERED SET, SPOTLIGHT INCLUDED. Lifting the
   spotlighted chart out left the dock holding the leftovers — whichever charts
   the reader happened not to be looking at, with its membership changing on
   every click. A set that re-forms under each interaction cannot read as one
   object, however it is framed. Keeping every chart in one order and MARKING
   the one on stage makes the dock a filmstrip with a current frame: clicking a
   cell moves the stage, it does not change what the row contains.

   The order is the same one `placeSeats` sorts by, derived here without lifting
   anything, so the two can never disagree about what comes first. */
export function dockOrder(candidateIds, layout) {
  const candidates = [...new Set(candidateIds)];
  const pins = layout.pins.filter((id) => candidates.includes(id));
  return [...pins, ...candidates.filter((id) => !pins.includes(id))];
}

/* THE ROW IS A SORTED LIST AND NO INTERACTION SHUFFLES IT. The focal chart is
   lifted OUT of the row; everything else follows in one order — pins first, in
   the order they were pinned, then the ranked candidates. Promoting a mini
   therefore drops the demoted focal back to its own ordered position rather
   than into the seat the promoted chart vacated, which is #135's rule and is
   retired with the arrangements: a list that re-sorts itself under every click
   is a list a reader cannot keep their place in.

   This is also why no candidate-order state survives anywhere. The order is
   derived from the pins and the published rank on every paint, so there is
   nothing to carry across a reconcile and nothing to drop. */
export function placeSeats(candidateIds, layout) {
  const candidates = [...new Set(candidateIds)];
  const focal = layout.focalId && candidates.includes(layout.focalId)
    ? layout.focalId : candidates[0] || null;
  const pins = layout.pins.filter((id) => candidates.includes(id) && id !== focal);
  const row = [...pins, ...candidates.filter((id) => id !== focal && !pins.includes(id))];
  return [
    ...(focal ? [{ chartId: focal, seat: 'focal', pinned: layout.pins.includes(focal) }] : []),
    ...row.map((chartId) => ({ chartId, seat: 'mini', pinned: pins.includes(chartId) })),
  ];
}

/* THE LIVE CHART LIST IS THE FINDINGS PAYLOAD'S — one tile per basal slot and
   per carb-ratio block THE READER CURRENTLY HAS, read off the rows the server
   published for this window. A `history` row is not one of those: it is a
   change the reader already made, a past record the history register carries so
   the inspector can replay it, not a parameter currently in force with evidence
   to plot. So the register filter stays; the live list is still the payload's
   and there is no second chart list. */
export function descriptorsFromFindings(findings, registry) {
  return (findings?.rows || []).flatMap((row) => {
    if (row.register === 'history') return [];
    const entry = registry.find((candidate) => candidate.matches(row));
    if (!entry) return [];
    /* A kind that can publish several tiles in one window names each one from
       its own row; every other kind is one tile and keeps the registry's
       standing name. Either way the name is the ENTRY's, so no consumer of a
       descriptor has to know which kind it is holding. */
    const named = entry.nameFor ? entry.nameFor(row) : null;
    return [{
      chartId: row.id,
      kind: entry.kind,
      title: named?.title ?? entry.name,
      meta: named?.meta ?? null,
      mode: entry.modes?.[0] ?? null,
      coordinates: entry.coordinates(row, findings),
      data: null,
      state: 'empty',
    }];
  });
}

/* ONE GLUCOSE RANGE ACROSS THE WHOLE FIELD, so two charts drawn side by side
   are read against the same axis. It spans every chart the field holds, not
   only the ones currently scrolled into view — a range that changed as the row
   scrolled would redraw the focal chart's axis under a gesture that was only
   ever about the row. */
export function fieldRange(descriptors, registry, glucoseRange) {
  const byKind = new Map(registry.map((entry) => [entry.kind, entry]));
  return glucoseRange(descriptors.flatMap((descriptor) => {
    const values = byKind.get(descriptor.kind)?.glucoseValues;
    return descriptor.state === 'ok' && values ? values(descriptor.data) : [];
  }));
}

export function optionForDescriptor(descriptor, registry, range, context = {}) {
  const byKind = new Map(registry.map((entry) => [entry.kind, entry]));
  return byKind.get(descriptor.kind).option(descriptor.mode, {
    ...context, data: descriptor.data, range,
  });
}

export function tileStatePresentation(descriptor, pending = false, message = null) {
  if (!TILE_STATES.includes(descriptor.state)) {
    throw new RangeError(`unknown tile state ${descriptor.state}`);
  }
  const fallback = descriptor.state === 'empty'
    ? 'No evidence in this request.'
    : descriptor.state === 'error' ? 'Evidence request failed.'
      : descriptor.state === 'stale-generation'
        ? 'Evidence changed. Refresh findings.' : '';
  return {
    name: pending && descriptor.state !== 'stale-generation'
      ? 'Loading evidence' : TILE_STATE_NAMES[descriptor.state],
    message: pending && descriptor.state !== 'stale-generation'
      ? 'Loading evidence…' : message || fallback,
  };
}
