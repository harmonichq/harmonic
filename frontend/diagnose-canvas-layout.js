export const PIN_CAP = 4;

const ARRANGEMENTS = Object.freeze(['focal', 'split', 'pair', 'onetwo', 'quad']);
const SEAT_COUNTS = Object.freeze({ focal: 4, split: 2, pair: 2, onetwo: 3, quad: 4 });
const TILE_STATES = Object.freeze(['ok', 'empty', 'error', 'stale-generation']);

export function arrangementFor(pinCount) {
  if (!Number.isInteger(pinCount) || pinCount < 0) {
    throw new RangeError(`pin count must be a non-negative integer, got ${pinCount}`);
  }
  if (pinCount > PIN_CAP) {
    throw new RangeError(`pin count exceeds the cap of ${PIN_CAP}`);
  }
  return ARRANGEMENTS[pinCount];
}

export function seatCountFor(arrangement) {
  const count = SEAT_COUNTS[arrangement];
  if (!count) throw new RangeError(`unknown arrangement ${arrangement}`);
  return count;
}

export function createCanvasLayout({ focalId = null, pins = [] } = {}) {
  if (!Array.isArray(pins) || new Set(pins).size !== pins.length || pins.length > PIN_CAP) {
    throw new RangeError(`pins must contain at most ${PIN_CAP} unique chart ids`);
  }
  return { focalId, pins: [...pins], arrangement: arrangementFor(pins.length) };
}

/* PINNING HOLDS AND LAYERS — it never moves focus. A pin is one verb: it holds
   a chart against the slicer and layers it into view, and the arrangement is
   derived from the pin count. Focus changes on a click on a slot chart and on
   nothing else, so pinning a second chart must leave the focal chart where the
   reader put it. */
export function pinChart(layout, chartId) {
  if (layout.pins.includes(chartId)) return { accepted: true, layout };
  if (layout.pins.length === PIN_CAP) return { accepted: false, layout };
  return { accepted: true, layout: createCanvasLayout({
    focalId: layout.focalId,
    pins: [...layout.pins, chartId],
  }) };
}

export function unpinChart(layout, chartId) {
  return createCanvasLayout({
    focalId: layout.focalId,
    pins: layout.pins.filter((id) => id !== chartId),
  });
}

export function focusSwap(candidateIds, layout, chartId) {
  const candidates = [...candidateIds];
  const current = candidates.indexOf(layout.focalId);
  const next = candidates.indexOf(chartId);
  if (next < 0) return { candidates, layout };
  if (current >= 0 && current !== next) {
    [candidates[current], candidates[next]] = [candidates[next], candidates[current]];
  }
  const pins = [...layout.pins];
  const pinnedCurrent = pins.indexOf(layout.focalId);
  const pinnedNext = pins.indexOf(chartId);
  if (pinnedCurrent >= 0 && pinnedNext >= 0 && pinnedCurrent !== pinnedNext) {
    [pins[pinnedCurrent], pins[pinnedNext]] = [pins[pinnedNext], pins[pinnedCurrent]];
  }
  return {
    candidates,
    layout: createCanvasLayout({ focalId: chartId, pins }),
  };
}

export function placeSeats(candidateIds, layout) {
  const arrangement = arrangementFor(layout.pins.length);
  const capacity = seatCountFor(arrangement);
  const candidates = [...new Set(candidateIds)];
  const pins = [...layout.pins];
  const focal = layout.focalId && candidates.includes(layout.focalId)
    ? layout.focalId : candidates.find((id) => !pins.includes(id));
  /* From two pins on, the field IS the pins — but WHICH of them takes the focal
     seat is still the reader's, not the order they were pinned in. A pinned
     focal chart keeps the focal seat; only a click on another chart moves it. */
  const ordered = pins.length >= 2
    ? [...(pins.includes(focal) ? [focal] : []), ...pins]
    : [focal, ...pins, ...candidates].filter(Boolean);
  const chartIds = [...new Set(ordered)].slice(0, capacity);
  return chartIds.map((chartId, index) => ({
    chartId,
    seat: index === 0 ? 'focal' : `slot-${index}`,
    pinned: pins.includes(chartId),
  }));
}

const coordinateValue = (name, row, findings) => {
  if (name === 'slot') return row.slot ?? Math.floor((row.span?.start_min ?? 0) / 30);
  if (name === 'block_id') return row.block_id ?? row.span?.start_min;
  if (name === 'analysis_generation') return findings.analysis_generation;
  /* The case-file coordinates are opaque transport values: the served
     generation, the row's own id, and the alignment this tile draws. */
  if (name === 'projection_id') return findings.projection_id;
  if (name === 'finding_id') return row.id;
  if (name === 'alignment') return 'event';
  return row[name];
};

/* THE LIVE CHART LIST IS THE FINDINGS PAYLOAD'S — one tile per basal slot and
   per carb-ratio block THE READER CURRENTLY HAS, read off the rows the server
   published for this window. A `history` row is not one of those: it is a
   change the reader already made, a past record the history register carries so
   the inspector can replay it, not a parameter currently in force with evidence
   to plot. So the register filter stays; the live list is still the payload's
   and there is no second chart list. */
export function descriptorsFromFindings(findings, registry) {
  const byKind = new Map(registry.map((entry) => [entry.kind, entry]));
  return (findings?.rows || []).flatMap((row) => {
    if (row.register === 'history') return [];
    const kind = row.event_chart
      ? 'event-comparison'
      : row.parameter === 'basal_rate' ? 'basal'
        : row.parameter === 'isf' ? 'isf'
          : row.parameter === 'carb_ratio' ? 'carb-ratio' : null;
    const entry = byKind.get(kind);
    if (!entry) return [];
    const coordinates = Object.fromEntries(entry.coordinateSchema.map((name) => [
      name, coordinateValue(name, row, findings),
    ]));
    return [{
      chartId: row.id,
      kind,
      mode: entry.modes?.[0] ?? null,
      coordinates,
      data: null,
      state: 'empty',
    }];
  });
}

export function arrangementRange(descriptors, registry, glucoseRange) {
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
    name: descriptor.state,
    message: pending ? 'Loading evidence…' : message || fallback,
  };
}
