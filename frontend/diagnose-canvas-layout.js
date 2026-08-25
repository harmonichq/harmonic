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

export function pinChart(layout, chartId) {
  if (layout.pins.includes(chartId)) return { accepted: true, layout };
  if (layout.pins.length === PIN_CAP) return { accepted: false, layout };
  const pins = [...layout.pins, chartId];
  return { accepted: true, layout: createCanvasLayout({
    focalId: pins.length >= 2 ? pins[0] : layout.focalId,
    pins,
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
  const ordered = pins.length >= 2
    ? [...pins]
    : [focal, ...pins, ...candidates].filter(Boolean);
  const chartIds = [...new Set(ordered)].slice(0, capacity);
  return chartIds.map((chartId, index) => ({
    chartId,
    seat: index === 0 ? 'focal' : `slot-${index}`,
    pinned: pins.includes(chartId),
  }));
}

const coordinateValue = (name, row, findings, window) => {
  if (name === 'slot') return row.slot ?? Math.floor((row.span?.start_min ?? 0) / 30);
  if (name === 'block_id') return row.block_id ?? row.span?.start_min;
  if (name === 'analysis_generation') return findings.analysis_generation;
  if (name === 'view' || name === 'factor') return row.event_chart?.[name];
  if (name === 'window') return window;
  return row[name];
};

export function descriptorsFromFindings(findings, registry, window = null) {
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
      name, coordinateValue(name, row, findings, window),
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

export function refreshStillCurrent(requestKey, currentKey) {
  return requestKey === currentKey;
}

export async function recoverStaleGeneration(descriptor, layout, {
  stale, refresh, reload, hasData, redraw = () => {},
}) {
  if (stale?.stale !== true || typeof stale.message !== 'string') {
    throw new TypeError('stale recovery needs the typed generation-mismatch result');
  }
  redraw({ descriptor: { ...descriptor, data: null, state: 'stale-generation' },
    layout, message: stale.message });
  const refreshed = await refresh(descriptor);
  if (!refreshed) {
    const result = { descriptor, layout, message: stale.message };
    redraw(result);
    return result;
  }
  const data = await reload(refreshed);
  if (data?.stale === true) {
    const result = { descriptor: { ...refreshed, data: null, state: 'stale-generation' },
      layout, message: data.message };
    redraw(result);
    return result;
  }
  const result = { descriptor: { ...refreshed, data,
    state: hasData({ ...refreshed, data }) ? 'ok' : 'empty' }, layout, message: null };
  redraw(result);
  return result;
}
