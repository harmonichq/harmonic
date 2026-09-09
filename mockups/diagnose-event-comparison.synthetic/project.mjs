/* Labeled-synthetic evidence producer for ADR 62's v3 wire contract.
 *
 * This is deliberately fixture-only: it turns the frozen #677 capture into a
 * server response for browser replay. Production callers use the Python
 * Event comparison preparation; frontend production code never imports this.
 */

const configs = {
  meals: { kind: 'meal', anchor: 'completed_carb_bolus', label: 'Completed carb bolus', window: [-60, 300] },
  lows: { kind: 'low', anchor: 'excursion_nadir', label: 'Low excursion', window: [-60, 120] },
};
const labels = {
  carb_undercount: 'Carb undercount', late_bolus: 'Late bolus',
  meal_over_delivery: 'Meal over-delivery', over_treated_low: 'Over-treated low',
  correction_on_iob: 'Correction on active insulin', correction_stacking: 'Correction stacking',
};
const boundaryLabels = {
  implied_carbs_g: ['Implied carbs', 'g'], logged_carbs_g: ['Logged carbs', 'g'],
  ratio: ['Carb ratio', '×'], gap_g: ['Carb gap', 'g'],
  pre_bolus_slope_mgdl_min: ['Pre-bolus slope', 'mg/dL/min'],
  suspend_duration_min: ['Suspend duration', 'min'],
  gate_window_nadir_mgdl: ['Gate-window nadir', 'mg/dL'],
  nadir_mgdl: ['Nadir', 'mg/dL'],
  guarded_rebound_peak_mgdl: ['Guarded rebound peak', 'mg/dL'],
  live_bar_mgdl: ['Live bar', 'mg/dL'], observed_nadir_mgdl: ['Observed nadir', 'mg/dL'],
  downstream_nadir_mgdl: ['Downstream nadir', 'mg/dL'], iob_at_correction_u: ['IOB at correction', 'U'],
  stack_gap_min: ['Stack gap', 'min'], iob_at_stack_u: ['IOB at stack', 'U'],
};
const allCohorts = ['fired', 'near_rule', 'neutral', 'another_factor', 'excluded'];

const localTimestamp = (anchor, minute) => {
  const date = new Date(`${anchor.replace(' ', 'T')}Z`);
  date.setUTCMinutes(date.getUTCMinutes() + minute);
  return date.toISOString().slice(0, 19).replace('T', ' ');
};
const windowKey = (window) => window ? `${window.start_min}-${window.end_min}` : 'whole-day';
const hhmm = (minute) => minute === 1440 ? '24:00'
  : `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const windowWire = (window) => window ? {
  scoped: true, start_min: window.start_min, end_min: window.end_min,
  label: `${hhmm(window.start_min)}–${hhmm(window.end_min)}`,
} : { scoped: false, start_min: null, end_min: null, label: null };
const inWindow = (occurrence, window) => !window || (window.start_min < window.end_min
  ? occurrence.outcome_min >= window.start_min && occurrence.outcome_min < window.end_min
  : occurrence.outcome_min >= window.start_min || occurrence.outcome_min < window.end_min);
const quantile = (values, q) => {
  const sorted = [...values].sort((left, right) => left - right);
  const rank = (sorted.length - 1) * q;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  return lower === upper ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
};

function supportFacts(view, factor, window, variant) {
  const key = `${variant}:${factor}:${windowKey(window)}`;
  return view.visual_support?.[key];
}

const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// Mirrors ciq_autotune/event_comparison.py's `_support` exactly (withheld
// <=1, limited <5, otherwise the half-cohort demotion): this is the single
// derivation both the cohort tier and every point tier read, so support is
// computed from the occurrences this projection just binned rather than
// carried over from the capture's `visual_support` stamp (#711).
function support(count, usableCount) {
  if (count <= 1) return 'withheld';
  if (count < 5) return 'limited';
  return count * 2 >= usableCount ? 'supported' : 'limited';
}

function decodeStampedPoints(facts) {
  const stamps = new Map();
  for (const encoded of facts.points) {
    const [start, end, n, pointSupport] = encoded.split('|');
    for (let minute = Number(start); minute <= Number(end); minute += 5) {
      stamps.set(minute, { n: Number(n), support: pointSupport });
    }
  }
  return stamps;
}

function pointRows(occurrences, window, usableCount) {
  const samples = new Map();
  for (const occurrence of occurrences) {
    const bins = new Map();
    for (const point of occurrence.trace.cgm) {
      // Mirror the backend's _finite gate: malformed readings never bin (#706).
      if (!finiteNumber(point.bg) || !finiteNumber(point.minute)) continue;
      const minute = Math.floor(point.minute / 5 + .5) * 5;
      if (minute < window[0] || minute > window[1]) continue;
      const previous = bins.get(minute);
      if (!previous || Math.abs(point.minute - minute) < Math.abs(previous.minute - minute)) {
        bins.set(minute, point);
      }
    }
    for (const [minute, point] of bins) {
      if (!samples.has(minute)) samples.set(minute, []);
      samples.get(minute).push(point.bg);
    }
  }
  const rows = [];
  for (let minute = window[0]; minute <= window[1]; minute += 5) {
    const values = samples.get(minute) || [];
    const pointSupport = support(values.length, usableCount);
    const visible = pointSupport === 'withheld' ? [] : values;
    rows.push({
      minute, n: values.length, support: pointSupport,
      median: visible.length ? quantile(visible, .5) : null,
      p25: visible.length ? quantile(visible, .25) : null,
      p75: visible.length ? quantile(visible, .75) : null,
    });
  }
  return rows;
}

// A replay fixture is allowed to rewrite `source.occurrences` after the
// capture's `visual_support` stamps were generated (S12's #689 regression:
// the app leg must derive fresh support from rewritten glucose, not echo a
// stamp computed before the rewrite). When any id this cohort's stamp
// counted is no longer part of the live occurrence set, the stamp is stale
// for this cohort and its cross-check below is skipped rather than firing
// on an intentional, known divergence. Per-cohort, not per-request: a
// cohort whose stamped ids are all still live keeps its cross-check even
// when another cohort in the same request lost one (#5). The live set is
// the whole view's occurrences, never the window-filtered subset — a stamp
// names only in-window ids, and narrowing would read the window itself as
// staleness.
function stampIsStale(liveIds, stamped) {
  return stamped.occurrence_ids.some((id) => !liveIds.has(id));
}

function assertMatchesStamp(view, factor, window, variant, key, cohort, facts) {
  const stamped = facts.cohorts[key];
  const mismatch = (label, got, want) => {
    throw new Error(
      `visual_support mismatch ${view}/${factor}/${windowKey(window)}/${variant} cohort ${key} `
      + `${label}: derived ${JSON.stringify(got)} != stamped ${JSON.stringify(want)}`,
    );
  };
  if (cohort.support !== stamped.support) mismatch('support', cohort.support, stamped.support);
  const derivedIds = [...cohort.occurrence_ids].sort();
  const stampedIds = [...stamped.occurrence_ids].sort();
  if (derivedIds.length !== stampedIds.length
      || derivedIds.some((id, index) => id !== stampedIds[index])) {
    mismatch('occurrence_ids', derivedIds, stampedIds);
  }
  const stampedPoints = decodeStampedPoints(stamped);
  for (const point of cohort.points) {
    const want = stampedPoints.get(point.minute) || { n: 0, support: 'withheld' };
    if (point.n !== want.n || point.support !== want.support) {
      mismatch(`point ${point.minute}`, { n: point.n, support: point.support }, want);
    }
  }
}

function verdict(occurrence, factor) {
  const route = occurrence.routes[factor];
  const classifier = occurrence.verdicts.find((item) => item.classifier === factor) || {};
  return {
    factor, cohort: route.cohort, provenance: route.provenance,
    detail: classifier.detail ?? null, evidence_tier: classifier.evidence_tier ?? null,
    other_factors: (route.other_factors || []).map((key) => ({ key, label: labels[key] })),
    boundary_facts: Object.entries(route.boundary || {})
      .filter(([, value]) => Number.isFinite(value))
      .map(([key, value]) => ({ key, label: boundaryLabels[key]?.[0] || key,
        value, unit: boundaryLabels[key]?.[1] || '' })),
  };
}

function summary(occurrence, config, factor) {
  return {
    identity: { id: occurrence.id, kind: config.kind, ep_id: occurrence.ep_id, t: occurrence.anchor_t },
    anchor: { kind: config.anchor, t: occurrence.anchor_t, date: occurrence.date,
      bg: occurrence.anchor_bg ?? null, worst_bg: occurrence.worst_bg ?? null,
      label: config.label },
    verdict: verdict(occurrence, factor),
  };
}

/** Exploration-only synthetic projection. Shipped/browser evidence uses case files. */
export function projectSyntheticCapture(capture, {
  view = 'meals', factor, window = null, another = false, occurrenceId,
  state = 'dense',
} = {}) {
  const source = capture.views[view];
  const config = configs[view];
  if (!source || !config) throw new Error(`unknown fixture view ${view}`);
  const chosenFactor = source.factors.includes(factor) ? factor : source.default_factor;
  const variant = state === 'sparse' || state === 'zero-fired' ? state : 'dense';
  const facts = supportFacts(source, chosenFactor, window, variant);
  if (!facts) throw new Error(`missing synthetic support for ${view}/${chosenFactor}/${windowKey(window)}/${variant}`);
  const sourceInWindow = source.occurrences.filter((occurrence) => inWindow(occurrence, window));
  const liveIds = new Set(source.occurrences.map((occurrence) => occurrence.id));
  const visibleKeys = ['fired', 'near_rule', 'neutral', ...(another ? ['another_factor'] : [])];
  // Membership is routed straight off `routes[chosenFactor].cohort`, the same
  // signal the backend routes on — never off the capture's stamped
  // occurrence_ids. The sparse/zero-fired states are fixture-only rehearsal
  // knobs with no backend equivalent, so they're applied here as an explicit
  // slice on top of the derived membership (mirroring generate.mjs's own
  // `visualProjection`), not read back off the stamp either.
  const cohorts = visibleKeys.map((key) => {
    let occurrences = sourceInWindow.filter((occurrence) => occurrence.routes[chosenFactor]?.cohort === key);
    if (variant === 'sparse') occurrences = occurrences.slice(0, 2);
    if (variant === 'zero-fired' && key === 'fired') occurrences = [];
    const usableCount = occurrences.filter((occurrence) =>
      occurrence.trace.cgm.some((point) => finiteNumber(point.bg))).length;
    const cohort = {
      key, routed_count: occurrences.length,
      usable_count: usableCount,
      support: support(usableCount, usableCount),
      occurrence_ids: occurrences.map((occurrence) => occurrence.id),
      points: pointRows(occurrences, config.window, usableCount),
    };
    if (cohort.support === 'withheld') {
      cohort.episodes = occurrences.filter((occurrence) => occurrence.trace.cgm
        .some((point) => finiteNumber(point.bg))).map((occurrence) => ({
        identity: { id: occurrence.id, kind: config.kind, ep_id: occurrence.ep_id, t: occurrence.anchor_t },
        glucose: occurrence.trace.cgm.filter((point) => finiteNumber(point.bg) && finiteNumber(point.minute))
          .map((point) => ({ minute: Math.floor(point.minute / 5 + .5) * 5, bg: point.bg })),
      }));
    }
    // The stamp becomes a tripwire, not the source of truth: any *unexpected*
    // divergence between this derivation and the capture's `visual_support`
    // fails loudly instead of silently rendering whichever one the caller
    // happened to read. A stale stamp (see `stampIsStale`) is a deliberate
    // divergence, not a bug, so it's exempted rather than silenced outright.
    if (!stampIsStale(liveIds, facts.cohorts[key])) {
      assertMatchesStamp(view, chosenFactor, window, variant, key, cohort, facts);
    }
    return cohort;
  });
  const counts = Object.fromEntries(allCohorts.map((key) => [key, 0]));
  for (const cohort of cohorts) counts[cohort.key] += cohort.routed_count;
  counts.excluded = sourceInWindow.filter((occurrence) => occurrence.routes[chosenFactor].cohort === 'excluded').length;
  if (!another) counts.another_factor = sourceInWindow.filter((occurrence) =>
    occurrence.routes[chosenFactor].cohort === 'another_factor').length;
  const selectable = cohorts.flatMap((cohort) => sourceInWindow.filter((occurrence) =>
    cohort.occurrence_ids.includes(occurrence.id)));
  let resolvedId = occurrenceId;
  if (!resolvedId && state === 'selected-occurrence') {
    resolvedId = selectable.find((occurrence) => occurrence.routes[chosenFactor].cohort === 'fired')?.id
      || selectable[0]?.id;
  }
  const selected = selectable.find((occurrence) => occurrence.id === resolvedId);
  let selection = { state: 'none', detail: null };
  if (occurrenceId && !selected) selection = { state: 'unavailable', requested_id: occurrenceId, detail: null };
  if (selected) {
    const detail = summary(selected, config, chosenFactor);
    detail.glucose = selected.trace.cgm.map((point) => ({ t: localTimestamp(selected.anchor_t, point.minute), minute: point.minute, bg: point.bg }));
    // A null/non-positive gram amount never becomes a marker, mirroring the
    // backend's own filter (event_comparison.py's selection-markers loop):
    // this is a real drop exercised at projection time, not an artifact of
    // the fixture never carrying the row (#711).
    detail.markers = view === 'lows' ? (selected.trace.rescue_carbs || [])
      .filter((marker) => finiteNumber(marker.grams) && marker.grams > 0)
      .map((marker) => ({
        kind: 'rescue_carb', t: localTimestamp(selected.anchor_t, marker.minute), minute: marker.minute,
        grams: marker.grams, certainty: marker.certainty,
      })) : [];
    detail.day_target = { date: selected.date };
    selection = { state: 'selected', requested_id: resolvedId, detail };
  }
  return {
    schema: 'finding-case-file-event-capture-v1',
    coordinates: { view, factor: chosenFactor, window: windowWire(window), another: Boolean(another),
      source_window: capture.source_window, anchor: { kind: config.anchor, label: config.label },
      alignment_window_min: config.window, factor_options: source.factors.map((key) => ({ key, label: labels[key] })) },
    population: { denominator: Object.values(counts).reduce((sum, count) => sum + count, 0), counts },
    cohorts, occurrences: selectable.map((occurrence) => summary(occurrence, config, chosenFactor)), selection,
  };
}

const patternVerdicts = ['fired', 'outranked', 'near_miss', 'no_data', 'clean'];
const patternPrecedence = new Map([
  ['fired', 4], ['near_miss', 3], ['outranked', 2], ['no_data', 1], ['clean', 0],
]);

export function patternVerdict(states, claimed = false) {
  return claimed ? 'fired'
    : states.reduce((best, state) => patternPrecedence.get(state) > patternPrecedence.get(best)
      ? state : best, 'clean');
}

function patternState(occurrence, lever) {
  const fact = occurrence.verdicts.find((item) => item.classifier === lever);
  if (occurrence.cause_lever === lever) return 'fired';
  if (occurrence.cause_lever) return 'outranked';
  if (!fact) return 'no_data';
  if (fact.matched) return 'fired';
  if (fact.silence_reason === 'under_threshold') return 'near_miss';
  if (fact.silence_reason === 'insufficient_data') return 'no_data';
  return 'clean';
}

function patternOccurrence(row, habits, attributedMember) {
  const claimant = attributedMember?.startsWith('habit:')
    ? attributedMember.replace('habit:', '') : null;
  const states = habits.map((lever) => patternState(row, lever))
    .map((state) => !claimant && state === 'fired' ? 'outranked' : state);
  const verdict = patternVerdict(states, Boolean(claimant));
  return {
    id: row.id, date: row.date, verdict,
    member: claimant ? `habit:${claimant}` : 'clean',
    anchor: { kind: row.kind, label: row.label, t: row.anchor_t, bg: row.anchor_bg },
    trace: row.trace,
  };
}

function patternCohort(key, name, rows, window) {
  const usable = rows.filter((row) => row.trace.cgm.some((point) => finiteNumber(point.bg)));
  const tier = support(usable.length, usable.length);
  const cohort = {
    key, name, routed_count: rows.length, usable_count: usable.length, support: tier,
    occurrence_ids: rows.map((row) => row.id),
    points: pointRows(rows, window, usable.length),
  };
  if (tier === 'withheld') cohort.episodes = usable.map((row) => ({
    identity: { id: row.id, kind: row.anchor.kind, ep_id: row.id, t: row.anchor.t },
    glucose: row.trace.cgm.filter((point) => finiteNumber(point.bg) && finiteNumber(point.minute)),
  }));
  return cohort;
}

/** Fixture-only server answer for the canonical Pattern case-file coordinate. */
export function projectPatternCaseFile(capture, {
  patternChart, projectionId = `fp_${'2'.repeat(32)}`, alignment = 'event', occurrenceId,
} = {}) {
  if (!patternChart) return null;
  const { key } = patternChart;
  const pattern = capture.outcome_patterns.find((row) => row.key === key);
  if (!pattern || pattern.collapse !== 'remain_pattern') {
    throw new Error(`served Pattern coordinate has no roster entry: ${key}`);
  }
  const habits = pattern.members.filter((member) => member.kind === 'habit')
    .map((member) => member.subject.replace('habit:', ''));
  const rateLever = pattern.rate_levers.map((subject) => subject.replace('habit:', ''))
    .find((lever) => capture.pattern_families[lever]);
  if (!rateLever) throw new Error(`served Pattern coordinate has no rate family: ${key}`);
  const family = capture.pattern_families[rateLever];
  const source = capture.pattern_populations[family] || [];
  if (!source.length) throw new Error(`served Pattern coordinate has no population: ${key}`);
  const attribution = capture.pattern_attribution?.[key] || {};
  const occurrences = source.map((row) => patternOccurrence(row, habits, attribution[row.id]));
  const claimed = occurrences.filter((row) => row.member !== 'clean');
  const counts = Object.fromEntries(patternVerdicts.map((verdict) => [
    verdict, occurrences.filter((row) => row.verdict === verdict).length,
  ]));
  if (occurrences.length !== pattern.n || claimed.length !== pattern.k
      || counts.fired !== pattern.k) {
    throw new Error(`Pattern exposure counts diverged for ${key}`);
  }
  let projection;
  if (alignment === 'clock') {
    const buckets = Array.from({ length: 12 }, (_, index) => ({
      start_min: index * 120, end_min: (index + 1) * 120, n: 0, occurrence_ids: [],
    }));
    for (const row of claimed) {
      const minute = Number(row.anchor.t.slice(11, 13)) * 60 + Number(row.anchor.t.slice(14, 16));
      const bucket = buckets[Math.floor(minute / 120)];
      bucket.n += 1; bucket.occurrence_ids.push(row.id);
    }
    const peak = Math.max(...buckets.map((bucket) => bucket.n));
    projection = {
      alignment: 'clock', anchor: null, window_min: null, cohorts: [],
      clock: { bucket_hours: 2, total: claimed.length,
        peak_bucket_index: buckets.findIndex((bucket) => bucket.n === peak), buckets },
    };
  } else {
    const config = configs[family] || {
      anchor: family, label: source[0].label, window: [-60, 120],
    };
    const matched = occurrences.filter((row) => row.verdict === 'fired');
    const near = occurrences.filter((row) => row.verdict === 'near_miss');
    const comparison = occurrences.filter((row) => !['fired', 'near_miss'].includes(row.verdict));
    const cohorts = [
      patternCohort('matched', 'Matched', matched, config.window),
      patternCohort('nearly_matched', 'Nearly matched', near, config.window),
      patternCohort('comparison', `Other ${family.replace('_', ' ')}`, comparison,
        config.window),
    ];
    projection = {
      alignment: 'event', anchor: { kind: config.anchor, label: config.label },
      window_min: config.window, clock: null, cohorts,
      comparison: { name: cohorts[2].name,
        state: cohorts[2].support === 'withheld' ? 'unavailable' : 'available' },
      counts: { matched: matched.length, nearly_matched: near.length,
        comparison: comparison.length, not_comparable: comparison.length },
    };
  }
  const cleanOccurrences = occurrences.map(({ trace, ...row }) => row);
  const activeIds = new Set(alignment === 'event'
    ? projection.cohorts.flatMap((cohort) => cohort.occurrence_ids)
    : occurrences.map((row) => row.id));
  const selected = occurrences.find((row) => row.id === occurrenceId && activeIds.has(row.id));
  let selection = { state: 'none', requested_id: null, detail: null };
  if (occurrenceId && !selected) {
    selection = { state: 'unavailable', requested_id: occurrenceId, detail: null };
  } else if (selected) {
    const detail = {
      ...cleanOccurrences.find((row) => row.id === selected.id),
      glucose: selected.trace.cgm.map((point) => ({
        t: localTimestamp(selected.anchor.t, point.minute), ...point,
      })),
      markers: [], source_corrections: [], day_target: { date: selected.date },
    };
    if (alignment === 'event') {
      detail.comparison_cohort = projection.cohorts.find((cohort) =>
        cohort.occurrence_ids.includes(selected.id)).key;
    }
    selection = { state: 'selected', requested_id: occurrenceId, detail };
  }
  return {
    schema: 'diagnose-finding-case-file-v1', projection_id: projectionId,
    finding: { id: pattern.subject, lever: pattern.key, subject: pattern.subject,
      title: pattern.title },
    window: structuredClone(patternChart.window), family: family.replace('_', ' '),
    population: family.replace('_', ' '), cross_population: false,
    summary: { claimed: claimed.length, denominator: occurrences.length,
      noun: family.replace('_', ' ') },
    verdict_counts: counts, occurrences: cleanOccurrences, projection,
    selection,
  };
}
