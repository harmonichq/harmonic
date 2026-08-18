/* =========================================================================
   #99 PLAN MODULE — pure deliverable-building logic for the Plan tab.

   The Plan tab has three layers:
     1. Active-profile reference (rendered straight from /pump-settings).
     2. Accepted-changes list — removable provenance chips (add/remove only),
        each linking back to the Review evidence it came from.
     3. Deliverable — a unified ≤16-segment four-parameter pump-ready table
        built from the current active profile + the accepted changes, editable
        as the source of truth. A hand-edit flips that row's provenance to
        "manually edited". The raw model recommendation (#98's
        ConsolidatedProfile) is NOT a source here — only accepted picks move a
        cell off its current value (see #93: one source of truth for "the new
        profile").

   This module owns everything that is *pure* about layer 3 (and the
   Confirmation-B detection): merging the accepted plan onto the current profile
   into unified rows, provenance tagging, hand-edit merge, and detecting when
   the deliverable has landed on the pump. No Vue, no DOM, no fetch — so
   `node --test` imports it with no importmap.

   Provenance vocabulary (per row, per parameter):
     'current'   — carried forward unchanged from the active profile.
     'accepted'  — value came from an accepted Review change (a plan pick).
     'edited'    — the user hand-edited this cell away from both current and
                   the accepted recommendation.

   SHAPES
   ------
   activeProfile.segments: [{ start_min, basal_rate, isf, carb_ratio, target_bg }]
   consolidated (from analysis.consolidated_basal, #98):
     { segments: [{ start_min, label, basal_rate, isf, carb_ratio, target_bg,
                    basal_slots, basal_max_deviation }], ... }
   acceptedItems: Map|Array of plan picks, each
     { type: 'basal'|'isf'|'ic'|'target', start_min, value, recommended, label, ... }
   edits: { [`${start_min}:${param}`]: number } — hand-edited overrides.
   ========================================================================= */

/** Tuning variable families allowed in one Plan draft (ADR 0042). */
export const PLAN_FAMILIES = ['basal', 'isf', 'ic', 'target'];

/** Human-readable labels for plan family controls/messages. */
export const PLAN_FAMILY_LABEL = {
  basal: 'Basal',
  isf: 'ISF',
  ic: 'I:C',
  target: 'Target',
};

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
 * Only a finding that names a new ISF is stageable. A harm-owned weaken is
 * deliberately **direction-only** — recurring correction-caused lows say which way
 * to move but do not size the move — so it carries no recommended value and must
 * never become a Plan chip or reach the deliverable schedule.
 */
export function isStageableIsf(item) {
  return !!item && item.recommended != null;
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

/** The Plan family for a deliverable param, or null for an unknown param. */
export function planParamFamily(param) {
  return PLAN_PARAM_FAMILY[param] || null;
}

/** The Plan family carried by one accepted draft item, or null if unsupported. */
export function planItemFamily(item) {
  const family = item && item.type;
  return PLAN_FAMILIES.includes(family) ? family : null;
}

function editParam(editKey) {
  const s = String(editKey);
  const i = s.indexOf(':');
  return i === -1 ? s : s.slice(i + 1);
}

/**
 * Collect the tuning families represented by accepted picks and hand-edits.
 * Invalid entries are reported separately so callers can choose whether to
 * reject or clear them.
 */
export function planFamilyState(acceptedItems = null, edits = {}) {
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

  for (const key of Object.keys(edits || {})) {
    const param = editParam(key);
    const family = planParamFamily(param);
    if (!family) {
      invalid.push(`edit ${key} has unsupported deliverable parameter ${param}`);
      continue;
    }
    addFamily(family);
  }

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
export function assertSinglePlanFamily(acceptedItems = null, edits = {}) {
  const state = planFamilyState(acceptedItems, edits);
  if (state.invalid.length) {
    throw new Error(`Invalid Plan draft: ${state.invalid.join('; ')}`);
  }
  if (state.mixed) {
    throw new Error(`Plan draft mixes tuning families: ${state.families.join(', ')}`);
  }
  return state.family;
}

/** Keep only items in the requested family; useful when staging a new family. */
export function filterPlanItemsToFamily(items, family) {
  if (!PLAN_FAMILIES.includes(family)) return [];
  return toArray(items).filter((item) => planItemFamily(item) === family);
}

/**
 * Clear mixed or invalid items by keeping the preferred family, or the first
 * valid family already present when no preference is supplied.
 */
export function normalizePlanItemsToSingleFamily(items, preferredFamily = null) {
  const arr = toArray(items);
  let family = PLAN_FAMILIES.includes(preferredFamily) ? preferredFamily : null;
  if (!family) {
    const first = arr.find((item) => planItemFamily(item));
    family = first ? planItemFamily(first) : null;
  }
  const normalized = family ? filterPlanItemsToFamily(arr, family) : [];
  return {
    items: normalized,
    family,
    dropped: arr.length - normalized.length,
  };
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
 * The provenance chips for the accepted-changes layer — one chip per accepted
 * plan pick, carrying the info the template needs to render a removable chip
 * that links back to Review evidence.
 *
 * @param {Map|Array} acceptedItems
 * @returns {Array<{ key, type, start_min, label, current, value, recommended,
 *                   edited, evidenceType }>}
 */
export function acceptedChips(acceptedItems) {
  return toArray(acceptedItems)
    .filter((it) => it && it.type != null && it.start_min != null)
    .map((it) => ({
      // Must equal the planItems Map key (`${type}:${item.key}`) so removeChip's
      // `planItems.delete(chip.key)` actually hits — for basal `key` is the SLOT,
      // not start_min, so keying the chip on start_min silently no-ops the ✕.
      key: `${it.type}:${it.key != null ? it.key : it.start_min}`,
      type: it.type,
      start_min: it.start_min,
      label: it.label != null ? it.label : formatStartMin(it.start_min),
      current: it.current != null ? it.current : null,
      value: it.value,
      recommended: it.recommended != null ? it.recommended : it.value,
      // A chip is "manually edited" when the staged value diverges from the rec.
      edited: it.recommended != null && it.value !== it.recommended,
      // Which Review evidence surface this chip links back to.
      evidenceType: it.type,
    }))
    .sort((a, b) =>
      a.start_min - b.start_min || a.type.localeCompare(b.type));
}

/**
 * Build the unified ≤16-segment deliverable table.
 *
 * The deliverable is the current programmed profile with the user's *accepted*
 * changes (and hand-edits) carried in — NOT the raw model recommendation. Until
 * a change is accepted on Review (or hand-edited here), every cell mirrors the
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
 *   1. hand-edit (`edits`)                                                -> 'edited'
 *   2. accepted plan pick at this exact start_min                         -> 'accepted'
 *   2b. for ISF/IC/target: most recent accepted pick of that type still in-effect
 *       (pick.start_min <= boundary AND same active-profile segment)      -> 'accepted'
 *   3. carried forward from the active profile                            -> 'current'
 *
 * `current` on each cell is always the active-profile value (the "was").
 *
 * @param {object} args
 * @param {object} args.activeProfile    { segments: [...] }
 * @param {Map|Array} [args.acceptedItems]
 * @param {object} [args.edits]          { `${start_min}:${param}`: number }
 * @returns {Array<row>} rows sorted by start_min, each:
 *   { start_min, label, isNewBreak, count (filled by caller),
 *     basal_rate:{current,value,provenance}, isf:{...},
 *     carb_ratio:{...}, target_bg:{...} }
 */
export function buildDeliverable({
  activeProfile,
  acceptedItems = null,
  edits = {},
} = {}) {
  assertSinglePlanFamily(acceptedItems, edits);
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
      const editKey = `${start_min}:${param}`;
      const pick = type != null ? accepted.get(`${start_min}:${type}`) : null;

      let value = current;
      let provenance = 'current';
      // #581: the I:C block this cell's value traces back to, if any. Kept
      // riding through a hand-edit override below (rather than cleared) so
      // normalizeIcBlockProvenance can still tell which block the edit lives
      // in when it decides whether the group as a whole survives intact.
      let icBlockProvenance = null;

      // 2: an explicit accepted pick at this boundary.
      if (pick != null && pick.value != null) {
        value = pick.value;
        provenance = 'accepted';
        if (type === 'ic' && pick.ic_block_provenance) icBlockProvenance = pick.ic_block_provenance;
      } else if (type === 'isf' || type === 'ic' || type === 'target') {
        // 2b: carry-forward — find the most recent accepted pick of this type
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

      // 1: a hand-edit is the source of truth and flips provenance.
      if (Object.prototype.hasOwnProperty.call(edits, editKey)) {
        value = edits[editKey];
        provenance = 'edited';
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
 * an accepted/edited change into an unchanged neighbour that happens to carry
 * the same number (e.g. lowering 03:00 from 0.72 to 0.6 when 00:00 is already
 * 0.6) — erasing the change, and its current→new diff, from the schedule the
 * user has to verify. Requiring the baseline to match too keeps every changed
 * boundary visible while still folding a truly redundant run (adjacent segments
 * with the same value and the same "was").
 *
 * When a redundant row DOES fold in, its proposal provenance is carried onto the
 * survivor per cell (edited > accepted > current). Once a staged change is keyed
 * into the pump and refetched, its cell reads value === current — so a change
 * that lands equal to its neighbour would fold away and the survivor, tagged
 * `current`, would read as "no plan here" (#462). Promoting provenance keeps the
 * proposal detectable after the fold without changing any displayed number.
 */
const PROV_RANK = { current: 0, accepted: 1, edited: 2 };

export function collapseDeliverable(rows) {
  if (!rows || !rows.length) return rows || [];
  const same = (a, b) =>
    PLAN_PARAMS.every(({ param }) =>
      a[param].value === b[param].value && a[param].current === b[param].current);
  // Clone so promoting a survivor's provenance never mutates the source rows.
  const clone = (row) => {
    const copy = { ...row };
    for (const { param } of PLAN_PARAMS) copy[param] = { ...row[param] };
    return copy;
  };
  const out = [clone(rows[0])];
  for (let i = 1; i < rows.length; i++) {
    const survivor = out[out.length - 1];
    if (same(rows[i], survivor)) {
      for (const { param } of PLAN_PARAMS) {
        if (PROV_RANK[rows[i][param].provenance] > PROV_RANK[survivor[param].provenance]) {
          survivor[param].provenance = rows[i][param].provenance;
        }
      }
    } else {
      out.push(clone(rows[i]));
    }
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
 * Returns true iff the deliverable carries at least one pending change — i.e.
 * any row has any of the four params where value !== current.  An all-'current'
 * deliverable (nothing staged, no hand-edits) returns false.
 */
export function deliverableHasChanges(rows) {
  if (!rows || !rows.length) return false;
  return rows.some((row) =>
    PLAN_PARAMS.some(({ param }) => row[param].value !== row[param].current));
}

/**
 * Returns true iff the deliverable actually proposes something — any cell whose
 * value came from an accepted pick or a hand-edit rather than straight from the
 * current profile.
 *
 * Distinct from `deliverableHasChanges`, which asks value !== current: once the
 * user keys a staged change into the pump and refetches, `current` moves up to
 * the newly-programmed value and the deliverable reads as "no changes" while the
 * accepted chip is still standing. Provenance survives that, so this is the
 * right question for "is there a plan here at all".
 *
 * Module-private: `reconcileDeliverable` is the only caller. Kept out of the
 * public surface until a second caller is real.
 */
function deliverableIsProposal(rows) {
  if (!rows || !rows.length) return false;
  return rows.some((row) =>
    PLAN_PARAMS.some(({ param }) => row[param] && row[param].provenance !== 'current'));
}

/**
 * True iff setting the cell `${start_min}:${param}` to `value` returns it to the
 * value it would show with NO hand-edit there — its accepted pick, or (absent
 * one) the current profile. The edit handler uses this to DELETE the override on
 * such a revert instead of recording it.
 *
 * Without this a 50 → 60 → 50 round-trip keeps `edited` provenance, so the
 * reverted cell still reads as a proposal: an otherwise-empty first Plan would
 * confirm and persist a false 50 → 50 apply-history item (#462). Compared under
 * pump-programmable precision (the same rounding reconcile uses), so a value
 * differing only below the programmable step still counts as a revert.
 *
 * @param {object} active         active profile { segments }
 * @param {Map|Array} acceptedItems
 * @param {object} edits          the current hand-edit overrides
 * @param {number} start_min
 * @param {string} param          basal_rate | isf | carb_ratio | target_bg
 * @param {number} value          the newly-typed value
 */
export function isDeliverableEditRevert(active, acceptedItems, edits, start_min, param, value) {
  const key = `${start_min}:${param}`;
  const rest = {};
  for (const k of Object.keys(edits || {})) {
    if (k !== key) rest[k] = edits[k];
  }
  const baseline = buildDeliverable({ activeProfile: active, acceptedItems, edits: rest });
  const cell = segmentAt(baseline, start_min);
  const baseVal = cell && cell[param] ? cell[param].value : null;
  if (baseVal == null) return false;
  const places = PARAM_PRECISION[param];
  return roundToPrecision(value, places) === roundToPrecision(baseVal, places);
}

/**
 * The effective plan the user is committing — one item per proposal cell (an
 * accepted pick or a hand-edit), carrying the value actually in effect. A
 * hand-edit wins over the accepted pick, so the item records the post-edit
 * value, not the pre-edit pick.
 *
 * This is what confirmation must record in apply history: reading the stored
 * accepted-item draft instead would post an EMPTY draft for a hand-edit-only
 * plan (nothing was ever accepted) and record the pre-edit value for a mixed
 * accepted+edited plan (#462). Provenance is the source of truth here, so the
 * items survive the keyed-in-and-refetched case where value === current.
 *
 * Pass the UNCOLLAPSED deliverable rows so every changed boundary is captured
 * (a basal pick's one slot, an ISF fan-out's every segment).
 *
 * Runs through `normalizeIcBlockProvenance` (#581) before returning, so a
 * partial or independently-edited I:C block never reaches the caller carrying
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
 * 4-decimal precision (no member independently edited away from the rest).
 * Any other item (non-`ic`, or `ic` with no provenance) passes through
 * untouched.
 *
 * This is the ONE place the Plan lifecycle re-validates a block claim — call
 * it before every draft save, not just from `effectivePlanItems`, since a
 * chip removal or hand-edit can leave the *raw* accepted-picks list (not just
 * the derived deliverable) holding a now-broken group.
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

/**
 * Confirmation B: has the deliverable landed on the pump?
 *
 * Compares the (collapsed) deliverable against a freshly-fetched active-profile
 * snapshot. Returns { onPump: boolean, matchedAt } — `onPump` true iff every
 * collapsed deliverable segment's four values match the snapshot's schedule at
 * that time-of-day (the pump now delivers what the plan proposed).
 *
 * `snapshotSegments` is the /pump-settings active profile segments; `fetchedAt`
 * is the snapshot's capture time (shown as "✓ on pump as of <fetch>").
 *
 * @param {Array<row>} deliverableRows  from buildDeliverable
 * @param {Array} snapshotSegments      [{ start_min, basal_rate, isf, carb_ratio, target_bg }]
 * @param {string} [fetchedAt]
 * @returns {{ onPump: boolean, matchedAt: string|null }}
 */
export function detectOnPump(deliverableRows, snapshotSegments, fetchedAt = null) {
  const rows = collapseDeliverable(deliverableRows || []);
  const segs = snapshotSegments || [];
  if (!rows.length || !segs.length) return { onPump: false, matchedAt: null };
  const approx = (a, b) => {
    if (a == null || b == null) return a === b;
    return Math.abs(a - b) < 1e-6;
  };
  const onPump = rows.every((row) => {
    const seg = segmentAt(segs, row.start_min);
    if (!seg) return false;
    return PLAN_PARAMS.every(({ param }) =>
      approx(row[param].value, seg[param] != null ? seg[param] : null));
  });
  return { onPump, matchedAt: onPump ? fetchedAt : null };
}

/* =========================================================================
   #94 RECONCILE — catch pump-keying errors.

   After the user keys the deliverable into their pump, the next fetch's active
   profile is compared cell-by-cell against the planned deliverable. Either it
   matches (confirmed) or it diverges (mismatch, with a diff of the exact cells
   that are off — the mis-keys).

   Detection basis: the latest /pump-settings active profile (NOT the changelog).

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

/** Human-readable label per deliverable parameter (for the mismatch diff). */
export const PARAM_LABEL = {
  basal_rate: 'Basal (U/h)',
  isf: 'ISF (mg/dL/U)',
  carb_ratio: 'I:C (g/U)',
  target_bg: 'Target (mg/dL)',
};

/**
 * Reconcile the planned deliverable against the detected (active) pump profile.
 *
 * Samples the UNION of both sides' segment boundaries; at each union start_min
 * both sides are read via `segmentAt`, and all four params are compared under
 * per-param rounding. A redundant break that carries the same value on both
 * sides produces no diff (benign); only a genuine value divergence flags.
 *
 * State machine: with no divergence the plan is `confirmed`; otherwise
 * `mismatch` carrying the divergent cells (start_min × param) as planned→actual,
 * grouped by time so the UI can render one block per boundary.
 *
 * @param {Array<row>} deliverableRows  from buildDeliverable (uncollapsed OK)
 * @param {Array} detectedSegments      latest /pump-settings active-profile
 *                                       segments [{ start_min, basal_rate, isf,
 *                                       carb_ratio, target_bg }]
 * @param {string} [fetchedAt]          snapshot capture time
 * @param {boolean} [hasCommittedPlan]  true once the user has applied at least
 *                                       one plan (plan_history non-empty). When
 *                                       false the first plan is still a proposal
 *                                       and any delta from the pump is expected,
 *                                       not a keying error → a divergence returns
 *                                       `pending` with no diff. An exact match is
 *                                       unambiguous, so it still confirms (#462) —
 *                                       provided the deliverable actually proposes
 *                                       something; with nothing staged it is just a
 *                                       copy of the pump and stays `pending` (#393).
 * @returns {{ state: 'pending'|'confirmed'|'mismatch',
 *             matchedAt: string|null,
 *             groups: Array<{ start_min, label, cells: Array<{ param, label,
 *               planned, actual }> }> }}
 *   `pending` when there is nothing to reconcile (no deliverable or no
 *   detected profile yet), or when no plan has been committed yet.
 */
export function reconcileDeliverable(deliverableRows, detectedSegments, fetchedAt = null, hasCommittedPlan = true) {
  const planned = collapseDeliverable(deliverableRows || []);
  const actual = detectedSegments || [];
  if (!planned.length || !actual.length) {
    return { state: 'pending', matchedAt: null, groups: [] };
  }

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
          label: PARAM_LABEL[param],
          planned: roundToPrecision(p, PARAM_PRECISION[param]),
          actual: roundToPrecision(a, PARAM_PRECISION[param]),
        });
      }
    }
    if (cells.length) {
      groups.push({ start_min, label: formatStartMin(start_min), cells });
    }
  }

  // Before the first apply, a delta from the pump is an uncommitted proposal, not
  // a keying error — hold it pending with no diff (#120). Exact equality still
  // confirms (#462), but only when the deliverable proposes something: with
  // nothing staged the deliverable is a copy of the pump, and confirming that
  // would claim a plan the user never made (it also has no draft to apply, #393).
  if (!hasCommittedPlan && (groups.length || !deliverableIsProposal(deliverableRows))) {
    return { state: 'pending', matchedAt: null, groups: [] };
  }

  const state = groups.length ? 'mismatch' : 'confirmed';
  return { state, matchedAt: state === 'confirmed' ? fetchedAt : null, groups };
}
