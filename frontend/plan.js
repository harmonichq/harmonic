/* =========================================================================
   #99 PLAN MODULE — pure deliverable-building logic for the Plan.

   The Plan has two layers:
     1. Active-profile reference (rendered straight from /api/pump-settings).
     2. Deliverable — a unified ≤16-segment four-parameter pump-ready table
        built from the current active profile + the accepted changes. The raw
        model recommendation (#98's
        ConsolidatedProfile) is NOT a source here — only accepted picks move a
        cell off its current value (see #93: one source of truth for "the new
        profile").

   This module owns everything that is *pure* about layer 2: merging the
   accepted plan onto the current profile into unified rows, and provenance
   tagging. No Vue, no DOM, no fetch — so `node --test` imports it with no
   importmap.

   Provenance vocabulary (per row, per parameter):
     'current'   — carried forward unchanged from the active profile.
     'accepted'  — value came from an accepted Review change (a plan pick).

   SHAPES
   ------
   activeProfile.segments: [{ start_min, basal_rate, isf, carb_ratio, target_bg }]
   consolidated (from analysis.consolidated_basal, #98):
     { segments: [{ start_min, label, basal_rate, isf, carb_ratio, target_bg,
                    basal_slots, basal_max_deviation }], ... }
   acceptedItems: Map|Array of plan picks, each
     { type: 'basal'|'isf'|'ic'|'target', start_min, value, recommended, label, ... }
   ========================================================================= */

/** Tuning variable families allowed in one Plan draft (ADR 0042). */
export const PLAN_FAMILIES = ['basal', 'isf', 'ic', 'target'];

/** Map deliverable-table params back to their one-variable Plan family. */
export const PLAN_PARAM_FAMILY = {
  basal_rate: 'basal',
  isf: 'isf',
  carb_ratio: 'ic',
  target_bg: 'target',
};

/** The four deliverable parameters, in column order, with their plan `type`. */
export const PLAN_PARAMS = [
  { param: 'basal_rate', type: PLAN_PARAM_FAMILY.basal_rate },
  { param: 'isf', type: PLAN_PARAM_FAMILY.isf },
  { param: 'carb_ratio', type: PLAN_PARAM_FAMILY.carb_ratio },
  { param: 'target_bg', type: PLAN_PARAM_FAMILY.target_bg },
];

/**
 * Whether an ISF finding may be staged into the Plan at all (#468).
 *
 * The backend's final predicate is the only permission to stage. Exact true is
 * intentional: false, null, missing, and malformed legacy values all fail closed,
 * even when a direction or recommendation is present.
 */
export function isStageableIsf(item) {
  return !!item && item.asserts_move === true;
}

/** Minutes in a day, and the fixed width of a basal recommendation slot. */
const DAY_MIN = 1440;
export const BASAL_SLOT_MIN = 30;

/** Format a wall-clock start-of-day minute as "HH:MM" (24h, zero-padded). */
export function formatStartMin(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const UNIT = { basal_rate: 'U/h', carb_ratio: 'g/U', target_bg: 'mg/dL' };

/**
 * One programmed value in its own unit; a correction factor reads insulin first
 * (CONTEXT.md). The desk's one setting-value formatter (ADR 451): it lives here,
 * the import-free leaf, so every surface can reach it without a cycle.
 */
export function settingValue(parameter, value) {
  if (value == null) return 'not recorded';
  if (parameter === 'isf') return `1 U : ${value} mg/dL`;
  return `${value} ${UNIT[parameter] || ''}`.trim();
}

/** The active-profile segment covering `startMin` (last start_min <= it). */
export function segmentAt(segments, startMin) {
  let result = segments && segments.length ? segments[0] : null;
  for (const s of segments || []) {
    if (s.start_min <= startMin) result = s;
  }
  return result;
}

/** Normalize a Map|Array of accepted plan items to a plain array. */
function toArray(items) {
  if (!items) return [];
  if (items instanceof Map) return Array.from(items.values());
  if (Array.isArray(items)) return items;
  // Reactive Map-likes expose values(); fall back to Object.values.
  if (typeof items.values === 'function') return Array.from(items.values());
  return Object.values(items);
}

/** The Plan family carried by one accepted draft item, or null if unsupported. */
export function planItemFamily(item) {
  const family = item && item.type;
  return PLAN_FAMILIES.includes(family) ? family : null;
}

/**
 * Collect the tuning families represented by accepted picks.
 * Invalid entries are reported separately so callers can choose whether to
 * reject or clear them.
 */
export function planFamilyState(acceptedItems = null) {
  const seen = new Set();
  const invalid = [];
  const addFamily = (family) => {
    if (family && !seen.has(family)) seen.add(family);
  };

  toArray(acceptedItems).forEach((item, idx) => {
    if (!item || typeof item !== 'object') {
      invalid.push(`item ${idx} is not a plan item`);
      return;
    }
    const family = planItemFamily(item);
    if (!family) {
      invalid.push(`item ${idx} has unsupported tuning family ${String(item.type)}`);
      return;
    }
    addFamily(family);
  });

  const families = Array.from(seen);
  return {
    families,
    invalid,
    family: families.length === 1 ? families[0] : null,
    mixed: families.length > 1,
    valid: invalid.length === 0 && families.length <= 1,
  };
}

/** Return the one Plan family, or throw if entries are invalid or mixed. */
export function assertSinglePlanFamily(acceptedItems = null) {
  const state = planFamilyState(acceptedItems);
  if (state.invalid.length) {
    throw new Error(`Invalid Plan draft: ${state.invalid.join('; ')}`);
  }
  if (state.mixed) {
    throw new Error(`Plan draft mixes tuning families: ${state.families.join(', ')}`);
  }
  return state.family;
}

/**
 * Index accepted plan items by `${start_min}:${type}` for O(1) lookup.
 * Later items win on collision (last write is the current draft state).
 */
function indexAccepted(items) {
  const byKey = new Map();
  for (const it of toArray(items)) {
    if (it && it.type != null && it.start_min != null) {
      byKey.set(`${it.start_min}:${it.type}`, it);
    }
  }
  return byKey;
}

/**
 * Build the unified ≤16-segment deliverable table.
 *
 * The deliverable is the current programmed profile with the user's *accepted*
 * changes carried in — NOT the raw model recommendation. Until
 * a change is accepted on Review, every cell mirrors the
 * active profile, so a fresh user sees their current profile with no diffs and
 * no new breaks. (Auto-adopting the consolidated recommendation here was the
 * "two competing sources of truth" the Review→Plan rework killed — see #93.)
 *
 * Boundaries are the union of the active profile's segment starts, every
 * accepted pick's start_min, and — for basal picks only — the slot-END of each
 * accepted basal change. A basal pick is a single 30-minute slot (Review splits
 * every basal change into its own one-slot hunk), so it covers exactly
 * [start_min, start_min + 30); without the closing boundary the accepted value
 * would bleed forward to the next segment start, swallowing the revert to the
 * current profile (and any later pick). ISF/IC/target picks are segment-aligned:
 * they persist from their own start_min until the next active-profile segment
 * boundary for that parameter — a boundary introduced by an unrelated parameter
 * (a basal pick's start or its synthetic slot-end) does NOT revert them.
 *
 * Each row carries all four params with a value + provenance. Precedence per cell:
 *   1. accepted plan pick at this exact start_min                         -> 'accepted'
 *   1b. for ISF/IC/target: most recent accepted pick of that type still in-effect
 *       (pick.start_min <= boundary AND same active-profile segment)      -> 'accepted'
 *   2. carried forward from the active profile                            -> 'current'
 *
 * `current` on each cell is always the active-profile value (the "was").
 *
 * @param {object} args
 * @param {object} args.activeProfile    { segments: [...] }
 * @param {Map|Array} [args.acceptedItems]
 * @returns {Array<row>} rows sorted by start_min, each:
 *   { start_min, label, isNewBreak, count (filled by caller),
 *     basal_rate:{current,value,provenance}, isf:{...},
 *     carb_ratio:{...}, target_bg:{...} }
 */
export function buildDeliverable({
  activeProfile,
  acceptedItems = null,
} = {}) {
  assertSinglePlanFamily(acceptedItems);
  const segments = (activeProfile && activeProfile.segments) || [];
  if (!segments.length) return [];

  const accepted = indexAccepted(acceptedItems);

  // Union of boundary start_mins: the active profile, accepted picks, and the
  // slot-end of each accepted basal pick (so a 30-min change reverts after it).
  const starts = new Set();
  for (const s of segments) starts.add(s.start_min);
  for (const it of accepted.values()) {
    starts.add(it.start_min);
    if (it.type === 'basal') {
      const end = it.start_min + BASAL_SLOT_MIN;
      if (end < DAY_MIN) starts.add(end);
    }
  }

  const activeStarts = new Set(segments.map((s) => s.start_min));
  const sorted = Array.from(starts).sort((a, b) => a - b);

  // For ISF/IC/target carry-forward: build per-type arrays of accepted picks
  // sorted by start_min so we can find the most recent still-in-effect pick at
  // a boundary.
  const acceptedByType = new Map();
  for (const it of accepted.values()) {
    if (!acceptedByType.has(it.type)) acceptedByType.set(it.type, []);
    acceptedByType.get(it.type).push(it);
  }
  for (const arr of acceptedByType.values()) arr.sort((a, b) => a.start_min - b.start_min);

  return sorted.map((start_min) => {
    const seg = segmentAt(segments, start_min) || {};
    const row = {
      start_min,
      label: formatStartMin(start_min),
      isNewBreak: !activeStarts.has(start_min),
    };
    for (const { param, type } of PLAN_PARAMS) {
      const current = seg[param] != null ? seg[param] : null;
      const pick = type != null ? accepted.get(`${start_min}:${type}`) : null;

      let value = current;
      let provenance = 'current';
      // #581: the I:C block this cell's value traces back to, if any.
      let icBlockProvenance = null;

      // 1: an explicit accepted pick at this boundary.
      if (pick != null && pick.value != null) {
        value = pick.value;
        provenance = 'accepted';
        if (type === 'ic' && pick.ic_block_provenance) icBlockProvenance = pick.ic_block_provenance;
      } else if (type === 'isf' || type === 'ic' || type === 'target') {
        // 1b: carry-forward — find the most recent accepted pick of this type
        // whose start_min <= this boundary AND falls in the same active-profile
        // segment (no active-profile segment boundary has intervened).
        const candidates = acceptedByType.get(type) || [];
        for (let i = candidates.length - 1; i >= 0; i--) {
          const c = candidates[i];
          if (c.start_min > start_min) continue;
          // Same active-profile segment iff segmentAt at pick start equals
          // segmentAt at this boundary.
          const pickSeg = segmentAt(segments, c.start_min);
          if (pickSeg && seg.start_min === pickSeg.start_min && c.value != null) {
            value = c.value;
            provenance = 'accepted';
            if (type === 'ic' && c.ic_block_provenance) icBlockProvenance = c.ic_block_provenance;
          }
          break;
        }
      }

      row[param] = { current, value, provenance };
      if (icBlockProvenance) row[param].ic_block_provenance = icBlockProvenance;
    }
    return row;
  });
}

/**
 * Collapse adjacent deliverable rows into one row per distinct segment (the
 * pump-programmable shape), keeping `isNewBreak` from the first row of a run.
 *
 * Rows merge only when they agree on BOTH the delivered value AND the baseline
 * (`current`) for all four params. Matching on value alone would silently fold
 * an accepted change into an unchanged neighbour that happens to carry
 * the same number (e.g. lowering 03:00 from 0.72 to 0.6 when 00:00 is already
 * 0.6) — erasing the change, and its current→new diff, from the schedule the
 * user has to verify. Requiring the baseline to match too keeps every changed
 * boundary visible while still folding a truly redundant run (adjacent segments
 * with the same value and the same "was").
 */
export function collapseDeliverable(rows) {
  if (!rows || !rows.length) return rows || [];
  const same = (a, b) =>
    PLAN_PARAMS.every(({ param }) =>
      a[param].value === b[param].value && a[param].current === b[param].current);
  const out = [rows[0]];
  for (let i = 1; i < rows.length; i++) {
    if (!same(rows[i], out[out.length - 1])) out.push(rows[i]);
  }
  return out;
}

/**
 * Segment count for the "N / 16" badge — number of distinct collapsed rows.
 */
export function deliverableSegmentCount(rows) {
  return collapseDeliverable(rows).length;
}

/**
 * How many schedule segments the pump profile can hold.
 *
 * A Tandem profile is a fixed sixteen-segment schedule, which is why the
 * deliverable is a "≤16-segment" table throughout this module. The number was a
 * literal in each surface that showed it; one fact with two spellings drifts, so
 * it is named once here and read by every surface that renders the badge.
 */
export const PROFILE_SEGMENT_CAPACITY = 16;

/**
 * The deliverable's segment use against that capacity, as one fact.
 *
 * `used` is computed from the rows — a different schedule counts differently —
 * and `capacity` is the profile's, never a number the caller remembers. `text`
 * is the copy both surfaces show, so the wording cannot diverge either.
 *
 * @param {Array<row>} rows  from buildDeliverable (uncollapsed OK)
 * @returns {{ used: number, capacity: number, over: boolean, text: string }}
 */
export function segmentCapacity(rows) {
  const used = deliverableSegmentCount(rows || []);
  return {
    used,
    capacity: PROFILE_SEGMENT_CAPACITY,
    over: used > PROFILE_SEGMENT_CAPACITY,
    text: `${used} of ${PROFILE_SEGMENT_CAPACITY} segments used`,
  };
}

/**
 * The effective plan the user is committing — one item per proposal cell (an
 * accepted pick), carrying the value actually in effect.
 *
 * This is what the draft saves, and recording the decision copies the saved
 * draft into Plan history. Provenance is the source of truth here, so the items
 * survive the keyed-in-and-refetched case where value === current (#462).
 *
 * Pass the UNCOLLAPSED deliverable rows so every changed boundary is captured
 * (a basal pick's one slot, an ISF fan-out's every segment).
 *
 * Runs through `normalizeIcBlockProvenance` (#581) before returning, so a
 * partial or disagreeing I:C block never reaches the caller carrying
 * a provenance claim it no longer backs.
 *
 * @param {Array<row>} rows  from buildDeliverable (uncollapsed)
 * @returns {Array<{ type, start_min, key, label, current, value,
 *   ic_block_provenance? }>} one per proposal cell, ordered by start_min then
 *   column.
 */
export function effectivePlanItems(rows) {
  if (!rows || !rows.length) return [];
  const items = [];
  for (const row of rows) {
    for (const { param, type } of PLAN_PARAMS) {
      const cell = row[param];
      if (!cell || cell.provenance === 'current') continue;
      const item = {
        type,
        start_min: row.start_min,
        key: type === 'basal' ? row.start_min / BASAL_SLOT_MIN : row.start_min,
        label: row.label,
        current: cell.current,
        value: cell.value,
      };
      if (type === 'ic' && cell.ic_block_provenance) item.ic_block_provenance = cell.ic_block_provenance;
      items.push(item);
    }
  }
  return normalizeIcBlockProvenance(items);
}

/** Signature identifying which I:C block a provenance object claims. */
function icBlockGroupKey(prov) {
  return `${prov.block_start_min}:${prov.block_end_min}:${(prov.block_member_start_mins || []).join(',')}`;
}

/**
 * Strip `ic_block_provenance` from any I:C plan item whose claimed block no
 * longer holds together (#581).
 *
 * A block's provenance is only trustworthy on every member row when: every
 * minute listed in `block_member_start_mins` is present as exactly one item
 * carrying that same provenance (no member removed, no stray extra claiming
 * the block), AND every one of those items' effective `value` agrees at
 * 4-decimal precision (no member carrying a different value from the rest).
 * Any other item (non-`ic`, or `ic` with no provenance) passes through
 * untouched.
 *
 * This is the ONE place the Plan lifecycle re-validates a block claim.
 * `effectivePlanItems` runs every item it records through it, because those
 * items come from the served draft or record, durable state that can hold a
 * group that no longer holds together.
 *
 * @param {Array<object>} items  plan items, optionally carrying
 *   `ic_block_provenance: {block_start_min, block_end_min, block_member_start_mins}`
 * @returns {Array<object>} the same items, with provenance stripped from any
 *   item whose group failed to survive intact.
 */
export function normalizeIcBlockProvenance(items) {
  if (!items || !items.length) return items || [];

  const groupKeys = new Set();
  for (const it of items) {
    if (it && it.type === 'ic' && it.ic_block_provenance) {
      groupKeys.add(icBlockGroupKey(it.ic_block_provenance));
    }
  }
  if (!groupKeys.size) return items;

  const validGroups = new Set();
  for (const groupKey of groupKeys) {
    const members = items.filter((it) =>
      it && it.type === 'ic' && it.ic_block_provenance
      && icBlockGroupKey(it.ic_block_provenance) === groupKey);
    const expected = members[0].ic_block_provenance.block_member_start_mins || [];
    const presentStarts = new Set(members.map((it) => it.start_min));
    const complete = presentStarts.size === expected.length
      && expected.every((m) => presentStarts.has(m));
    const firstValue = roundToPrecision(members[0].value, 4);
    const valuesAgree = members.every((it) => roundToPrecision(it.value, 4) === firstValue);
    if (complete && valuesAgree) validGroups.add(groupKey);
  }

  return items.map((it) => {
    if (!it || it.type !== 'ic' || !it.ic_block_provenance) return it;
    if (validGroups.has(icBlockGroupKey(it.ic_block_provenance))) return it;
    const { ic_block_provenance, ...rest } = it;
    return rest;
  });
}

/* =========================================================================
   #94 RECONCILE — draw the cells a mis-keyed pump holds.

   The server decides whether a recorded Plan is pending, confirmed or a
   mismatch (ADR 431). When it serves a mismatch, Changes draws the divergent
   cells from this comparison: the planned deliverable against the latest
   /api/pump-settings active profile (NOT the changelog), cell by cell.
   scripts/check_guidance_plan_contract.mjs holds it to the server's rule.

   Match rule (per parameter, no tolerance band): round BOTH sides to the
   pump-programmable precision, then require exact equality. A difference that
   survives rounding is a real mis-key.
   ========================================================================= */

/**
 * Pump-programmable precision per parameter, in decimal places. A value is
 * "matched" iff planned and actual are equal after rounding both to this many
 * places. No tolerance band — rounding is the only slack.
 */
export const PARAM_PRECISION = {
  basal_rate: 3, // 0.001 U/h
  isf: 0,        // whole mg/dL/U
  carb_ratio: 1, // 0.1 g/U
  target_bg: 0,  // whole mg/dL
};

/** Round to a fixed number of decimal places (null passes through). */
export function roundToPrecision(value, places) {
  if (value == null) return null;
  const f = Math.pow(10, places);
  return Math.round(value * f) / f;
}

/** True iff planned/actual are equal after rounding both to param precision. */
function paramMatches(param, planned, actual) {
  const p = roundToPrecision(planned, PARAM_PRECISION[param]);
  const a = roundToPrecision(actual, PARAM_PRECISION[param]);
  return p === a;
}

/**
 * The cells where the detected (active) pump profile differs from the planned
 * deliverable, as planned→actual, grouped by start time so Changes renders one
 * block per boundary.
 *
 * Samples the UNION of both sides' segment boundaries; at each union start_min
 * both sides are read via `segmentAt`, and all four params are compared under
 * per-param rounding. A redundant break that carries the same value on both
 * sides produces no diff (benign); only a genuine value divergence flags.
 *
 * @param {Array<row>} deliverableRows  from buildDeliverable (uncollapsed OK)
 * @param {Array} [detectedSegments]    latest /api/pump-settings active-profile
 *                                       segments [{ start_min, basal_rate, isf,
 *                                       carb_ratio, target_bg }]
 * @returns {{ groups: Array<{ start_min, label, cells: Array<{ param,
 *   planned, actual }> }> }}
 *   `groups` is empty when the two match, and when either side is empty (no
 *   deliverable, or no detected profile yet): nothing to compare draws nothing.
 */
export function reconcileDeliverable(deliverableRows, detectedSegments) {
  const planned = collapseDeliverable(deliverableRows || []);
  const actual = detectedSegments || [];
  if (!planned.length || !actual.length) return { groups: [] };

  // Union of both sides' boundaries.
  const starts = new Set();
  for (const r of planned) starts.add(r.start_min);
  for (const s of actual) starts.add(s.start_min);
  const sorted = Array.from(starts).sort((a, b) => a - b);

  const groups = [];
  for (const start_min of sorted) {
    const planSeg = segmentAt(planned, start_min);
    const pumpSeg = segmentAt(actual, start_min);
    const cells = [];
    for (const { param } of PLAN_PARAMS) {
      const p = planSeg && planSeg[param] ? planSeg[param].value : null;
      const a = pumpSeg && pumpSeg[param] != null ? pumpSeg[param] : null;
      if (!paramMatches(param, p, a)) {
        cells.push({
          param,
          planned: roundToPrecision(p, PARAM_PRECISION[param]),
          actual: roundToPrecision(a, PARAM_PRECISION[param]),
        });
      }
    }
    if (cells.length) {
      groups.push({ start_min, label: formatStartMin(start_min), cells });
    }
  }
  return { groups };
}
