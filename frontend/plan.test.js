// #99 — tests for the pure Plan deliverable module (plan.js).
//   node --test 'frontend/**/*.test.js'
// Vue-free, DOM-free: covers consolidation, provenance tagging, hand-edit
// merge, collapse, segment count, and Confirmation-B on-pump detection.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatStartMin,
  segmentAt,
  acceptedChips,
  assertSinglePlanFamily,
  buildDeliverable,
  collapseDeliverable,
  deliverableHasChanges,
  deliverableSegmentCount,
  effectivePlanItems,
  isDeliverableEditRevert,
  filterPlanItemsToFamily,
  isStageableIsf,
  normalizeIcBlockProvenance,
  normalizePlanItemsToSingleFamily,
  planFamilyState,
  planItemFamily,
  planParamFamily,
  detectOnPump,
  reconcileDeliverable,
  roundToPrecision,
} from './plan.js';

// --- fixtures --------------------------------------------------------------

// A simple two-segment active profile: midnight and noon.
const activeProfile = {
  segments: [
    { start_min: 0, basal_rate: 0.8, isf: 50, carb_ratio: 10, target_bg: 110 },
    { start_min: 720, basal_rate: 1.0, isf: 45, carb_ratio: 9, target_bg: 110 },
  ],
};

// Accepted picks that loosen overnight ISF (50 -> 55) and tighten noon ISF
// (45 -> 40). ISF is segment-aligned, so these change the whole segment without
// a slot-end revert — the deliverable stays a clean 2-segment shape. (Basal
// picks are single 30-min slots and revert after; that's exercised separately.)
// The deliverable diverges from current ONLY where the user accepted a change
// (or hand-edits), never from the raw model recommendation.
const accepted = [
  { type: 'isf', start_min: 0,   value: 55, recommended: 55 },
  { type: 'isf', start_min: 720, value: 40, recommended: 40 },
];

// --- helpers ---------------------------------------------------------------

test('formatStartMin zero-pads 24h wall clock', () => {
  assert.equal(formatStartMin(0), '00:00');
  assert.equal(formatStartMin(90), '01:30');
  assert.equal(formatStartMin(720), '12:00');
  assert.equal(formatStartMin(1410), '23:30');
});

test('segmentAt returns the last segment whose start_min <= t', () => {
  assert.equal(segmentAt(activeProfile.segments, 0).start_min, 0);
  assert.equal(segmentAt(activeProfile.segments, 700).start_min, 0);
  assert.equal(segmentAt(activeProfile.segments, 720).start_min, 720);
  assert.equal(segmentAt(activeProfile.segments, 1400).start_min, 720);
});

// --- ADR 0042: one tuning family per Plan ---------------------------------

test('plan family helpers identify item and deliverable parameter families', () => {
  assert.equal(planItemFamily({ type: 'basal' }), 'basal');
  assert.equal(planItemFamily({ type: 'target' }), 'target');
  assert.equal(planItemFamily({ type: 'behavior' }), null);
  assert.equal(planParamFamily('basal_rate'), 'basal');
  assert.equal(planParamFamily('carb_ratio'), 'ic');
  assert.equal(planParamFamily('target_bg'), 'target');
});

test('assertSinglePlanFamily allows empty, multi-slot basal, ISF fan-out, IC, and target', () => {
  assert.equal(assertSinglePlanFamily([]), null);
  assert.equal(assertSinglePlanFamily([
    { type: 'basal', start_min: 180, value: 0.6 },
    { type: 'basal', start_min: 210, value: 0.6 },
  ]), 'basal');
  assert.equal(assertSinglePlanFamily([
    { type: 'isf', start_min: 0, value: 55 },
    { type: 'isf', start_min: 720, value: 40 },
  ]), 'isf');
  assert.equal(assertSinglePlanFamily([
    { type: 'ic', start_min: 0, value: 9 },
    { type: 'ic', start_min: 720, value: 8 },
  ]), 'ic');
  assert.equal(assertSinglePlanFamily([
    { type: 'target', start_min: 0, value: 100 },
  ]), 'target');
});

test('assertSinglePlanFamily rejects mixed families and non-tuning items', () => {
  assert.throws(() => assertSinglePlanFamily([
    { type: 'basal', start_min: 180, value: 0.6 },
    { type: 'isf', start_min: 720, value: 40 },
  ]), /mixes tuning families/);
  assert.throws(() => assertSinglePlanFamily([
    { type: 'behavior', key: 'late-meal' },
  ]), /unsupported tuning family behavior/);
});

test('planFamilyState includes hand-edits when detecting mixed families', () => {
  const state = planFamilyState(
    [{ type: 'basal', start_min: 180, value: 0.6 }],
    { '720:isf': 42 },
  );
  assert.equal(state.mixed, true);
  assert.deepEqual(state.families, ['basal', 'isf']);
});

test('filterPlanItemsToFamily and normalizePlanItemsToSingleFamily clear off-family picks', () => {
  const items = [
    { type: 'basal', start_min: 180, value: 0.6 },
    { type: 'basal', start_min: 210, value: 0.6 },
    { type: 'ic', start_min: 720, value: 8 },
  ];
  assert.deepEqual(
    filterPlanItemsToFamily(items, 'basal').map((it) => it.type),
    ['basal', 'basal'],
  );
  const normalized = normalizePlanItemsToSingleFamily(items, 'ic');
  assert.equal(normalized.family, 'ic');
  assert.equal(normalized.dropped, 2);
  assert.deepEqual(normalized.items, [{ type: 'ic', start_min: 720, value: 8 }]);
});

// --- accepted chips --------------------------------------------------------

test('acceptedChips maps picks to removable provenance chips', () => {
  const items = [
    { type: 'basal', start_min: 0, label: '00:00', current: 0.8, value: 0.65, recommended: 0.65 },
    { type: 'isf', start_min: 720, label: '12:00', current: 45, value: 42, recommended: 40 },
  ];
  const chips = acceptedChips(items);
  assert.equal(chips.length, 2);
  assert.equal(chips[0].key, 'basal:0');
  assert.equal(chips[0].edited, false);
  assert.equal(chips[0].evidenceType, 'basal');
  // The ISF pick was hand-edited away from its recommendation.
  assert.equal(chips[1].edited, true);
  assert.equal(chips[1].evidenceType, 'isf');
});

test('acceptedChips keys a basal chip on the SLOT so removeChip can delete it', () => {
  // planItems is keyed `${type}:${item.key}` (planKeyOf); for basal `key` is the
  // slot (6), not start_min (180). The chip must carry that same key or the ✕
  // (planItems.delete(chip.key)) silently no-ops.
  const items = [
    { type: 'basal', key: 6, start_min: 180, label: '03:00', current: 0.72, value: 0.6, recommended: 0.6 },
  ];
  const chips = acceptedChips(items);
  assert.equal(chips[0].key, 'basal:6');
  assert.equal(chips[0].start_min, 180); // jumpToReview/edit-cleanup still use start_min
});

test('acceptedChips accepts a Map and sorts by start_min then type', () => {
  const m = new Map([
    ['isf:720', { type: 'isf', start_min: 720, value: 42, recommended: 42 }],
    ['basal:0', { type: 'basal', start_min: 0, value: 0.65, recommended: 0.65 }],
  ]);
  const chips = acceptedChips(m);
  assert.deepEqual(chips.map((c) => c.key), ['basal:0', 'isf:720']);
});

// --- deliverable build + provenance ---------------------------------------

test('buildDeliverable carries current values with provenance "current" when nothing accepted', () => {
  const rows = buildDeliverable({ activeProfile });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].basal_rate.value, 0.8);
  assert.equal(rows[0].basal_rate.provenance, 'current');
  assert.equal(rows[0].isf.provenance, 'current');
});

test('buildDeliverable applies accepted picks as "accepted" where they differ', () => {
  const rows = buildDeliverable({ activeProfile, acceptedItems: accepted });
  // Overnight ISF loosened by an accepted pick -> accepted.
  assert.equal(rows[0].isf.value, 55);
  assert.equal(rows[0].isf.provenance, 'accepted');
  // Overnight basal has no accepted pick -> stays current.
  assert.equal(rows[0].basal_rate.provenance, 'current');
  // Noon ISF tightened -> accepted.
  assert.equal(rows[1].isf.value, 40);
  assert.equal(rows[1].isf.provenance, 'accepted');
});

test('buildDeliverable does NOT auto-adopt the raw model recommendation (#93)', () => {
  // A model recommendation exists but nothing is accepted: the deliverable must
  // mirror the current profile exactly — no diffs, no new breaks for a fresh
  // user who has never accepted or locked a plan.
  const rows = buildDeliverable({ activeProfile });
  assert.equal(rows.length, activeProfile.segments.length);
  for (const row of rows) {
    assert.equal(row.isNewBreak, false);
    assert.equal(row.basal_rate.value, row.basal_rate.current);
    assert.equal(row.basal_rate.provenance, 'current');
    assert.equal(row.isf.provenance, 'current');
    assert.equal(row.carb_ratio.provenance, 'current');
    assert.equal(row.target_bg.provenance, 'current');
  }
});

test('buildDeliverable: an accepted pick sets the cell value and provenance', () => {
  const acceptedItems = [
    { type: 'basal', start_min: 0, value: 0.7, recommended: 0.65 },
  ];
  const rows = buildDeliverable({ activeProfile, acceptedItems });
  assert.equal(rows[0].basal_rate.value, 0.7);
  assert.equal(rows[0].basal_rate.provenance, 'accepted');
});

test('buildDeliverable: a target-family pick moves only target_bg', () => {
  const acceptedItems = [
    { type: 'target', start_min: 720, value: 100, recommended: 100 },
  ];
  const rows = buildDeliverable({ activeProfile, acceptedItems });
  assert.equal(rows[1].target_bg.value, 100);
  assert.equal(rows[1].target_bg.provenance, 'accepted');
  assert.equal(rows[1].isf.provenance, 'current');
  assert.equal(rows[1].carb_ratio.provenance, 'current');
});

test('buildDeliverable: a hand-edit flips provenance to "edited" and wins', () => {
  const rows = buildDeliverable({
    activeProfile,
    acceptedItems: accepted,
    edits: { '0:isf': 52 },
  });
  assert.equal(rows[0].isf.value, 52);
  assert.equal(rows[0].isf.provenance, 'edited');
  // current is still the active-profile "was".
  assert.equal(rows[0].isf.current, 50);
});

test('buildDeliverable adds a new segment break for a pick mid-segment', () => {
  const acceptedItems = [
    { type: 'basal', start_min: 360, value: 0.6, recommended: 0.6 },
  ];
  const rows = buildDeliverable({ activeProfile, acceptedItems });
  const row6am = rows.find((r) => r.start_min === 360);
  assert.ok(row6am, 'a row at 06:00 exists');
  assert.equal(row6am.isNewBreak, true);
  assert.equal(row6am.basal_rate.value, 0.6);
  // Its other params carry forward from the 00:00 segment.
  assert.equal(row6am.isf.value, 50);
  assert.equal(row6am.isf.provenance, 'current');
});

test('buildDeliverable returns empty when no active profile segments', () => {
  assert.deepEqual(buildDeliverable({ activeProfile: { segments: [] } }), []);
  assert.deepEqual(buildDeliverable({}), []);
});

// --- collapse + count ------------------------------------------------------

test('collapseDeliverable folds adjacent identical rows', () => {
  const rows = [
    { start_min: 0, basal_rate: { value: 0.8 }, isf: { value: 50 }, carb_ratio: { value: 10 }, target_bg: { value: 110 } },
    { start_min: 360, basal_rate: { value: 0.8 }, isf: { value: 50 }, carb_ratio: { value: 10 }, target_bg: { value: 110 } },
    { start_min: 720, basal_rate: { value: 1.0 }, isf: { value: 45 }, carb_ratio: { value: 9 }, target_bg: { value: 110 } },
  ];
  const collapsed = collapseDeliverable(rows);
  assert.equal(collapsed.length, 2);
  assert.deepEqual(collapsed.map((r) => r.start_min), [0, 720]);
});

// A 03:00–07:00 profile block at 0.72, framed by 0.6 either side — the real
// P003 shape where a single-slot basal pick must revert, not bleed forward.
const revertProfile = { segments: [
  { start_min: 0,   basal_rate: 0.6,  isf: 40, carb_ratio: 5, target_bg: 110 },
  { start_min: 180, basal_rate: 0.72, isf: 40, carb_ratio: 5, target_bg: 110 },
  { start_min: 420, basal_rate: 0.9,  isf: 40, carb_ratio: 5, target_bg: 110 },
] };

test('an accepted basal slot reverts to current at slot-end, not the next segment', () => {
  // Pick lowers the 03:00 slot (0.72) to 0.6. It covers ONLY 03:00–03:30; at
  // 03:30 basal must revert to the 0.72 it bleeds from — the pick must not run
  // to 07:00. And the 03:00 change stays visible even though 00:00 is also 0.6.
  const rows = buildDeliverable({
    activeProfile: revertProfile,
    acceptedItems: [{ type: 'basal', start_min: 180, value: 0.6, recommended: 0.6 }],
  });
  const collapsed = collapseDeliverable(rows);
  assert.deepEqual(collapsed.map((r) => r.start_min), [0, 180, 210, 420]);
  const changed = collapsed.find((r) => r.start_min === 180);
  assert.equal(changed.basal_rate.current, 0.72);
  assert.equal(changed.basal_rate.value, 0.6);
  assert.equal(changed.basal_rate.provenance, 'accepted');
  const revert = collapsed.find((r) => r.start_min === 210);
  assert.equal(revert.basal_rate.value, 0.72);
  assert.equal(revert.basal_rate.provenance, 'current');
});

test('two non-adjacent basal slots each get their own block and revert', () => {
  // Picks at 03:00 and 05:00 (real bug repro): each is a 30-min slot with 0.72
  // between and after. Both must appear as distinct 0.72->0.6 blocks — not fold
  // into one 03:00-07:00 run.
  const rows = buildDeliverable({
    activeProfile: revertProfile,
    acceptedItems: [
      { type: 'basal', start_min: 180, value: 0.6, recommended: 0.6 },
      { type: 'basal', start_min: 300, value: 0.6, recommended: 0.6 },
    ],
  });
  const collapsed = collapseDeliverable(rows);
  // 00:00(0.6) 03:00(->0.6) 03:30(0.72) 05:00(->0.6) 05:30(0.72) 07:00(0.9)
  assert.deepEqual(collapsed.map((r) => r.start_min), [0, 180, 210, 300, 330, 420]);
  assert.equal(collapsed.find((r) => r.start_min === 300).basal_rate.value, 0.6);
});

test('two adjacent basal slots fold into one block that reverts after both', () => {
  // Picks at 03:00 and 03:30 (contiguous slots 6 & 7) both -> 0.6: they merge
  // into one 03:00–04:00 block, reverting to 0.72 at 04:00.
  const rows = buildDeliverable({
    activeProfile: revertProfile,
    acceptedItems: [
      { type: 'basal', start_min: 180, value: 0.6, recommended: 0.6 },
      { type: 'basal', start_min: 210, value: 0.6, recommended: 0.6 },
    ],
  });
  const collapsed = collapseDeliverable(rows);
  assert.deepEqual(collapsed.map((r) => r.start_min), [0, 180, 240, 420]);
  assert.equal(collapsed.find((r) => r.start_min === 240).basal_rate.value, 0.72);
});

test('collapse carries proposal provenance onto a survivor when a keyed-in change folds (#462)', () => {
  // The user staged noon I:C 5.4 -> 5.7, keyed it into the pump, and refetched.
  // The pump now carries 5.7 at BOTH 00:00 and noon, so the two deliverable rows
  // are byte-identical and fold into one. Value === current everywhere, but the
  // noon cell was an accepted pick — that provenance must ride onto the survivor,
  // or the plan reads as "nothing here" and can never confirm.
  const refetched = { segments: [
    { start_min: 0,   basal_rate: 0.8, isf: 50, carb_ratio: 5.7, target_bg: 110 },
    { start_min: 720, basal_rate: 0.8, isf: 50, carb_ratio: 5.7, target_bg: 110 },
  ] };
  const rows = buildDeliverable({
    activeProfile: refetched,
    acceptedItems: [{ type: 'ic', start_min: 720, value: 5.7, recommended: 5.7 }],
  });
  const collapsed = collapseDeliverable(rows);
  assert.equal(collapsed.length, 1);            // the two rows folded
  assert.equal(collapsed[0].carb_ratio.value, 5.7);
  assert.equal(collapsed[0].carb_ratio.provenance, 'accepted');  // survived the fold
  // The source rows are untouched — the survivor is a clone.
  assert.equal(rows[0].carb_ratio.provenance, 'current');
});

test('deliverableSegmentCount counts distinct collapsed segments for the N/16 badge', () => {
  const rows = buildDeliverable({ activeProfile, acceptedItems: accepted });
  // Two distinct segments (midnight and noon) after the accepted changes.
  assert.equal(deliverableSegmentCount(rows), 2);
});

// --- #393: deliverableHasChanges ----------------------------------------

test('deliverableHasChanges is false when nothing is staged (all provenance "current")', () => {
  // Regression test: an all-current deliverable must NOT be treated as pending.
  const rows = buildDeliverable({ activeProfile });
  assert.equal(deliverableHasChanges(rows), false);
});

test('deliverableHasChanges is true when an accepted pick changes a value', () => {
  const rows = buildDeliverable({ activeProfile, acceptedItems: accepted });
  assert.equal(deliverableHasChanges(rows), true);
});

test('deliverableHasChanges is true for a hand-edit with zero accepted picks', () => {
  // The edit-only case: no chips, but a genuine pending change exists.
  const edits = { '0:isf': 60 }; // hand-edit midnight ISF 50 -> 60
  const rows = buildDeliverable({ activeProfile, edits });
  assert.equal(deliverableHasChanges(rows), true);
});

test('deliverableHasChanges is false for empty rows', () => {
  assert.equal(deliverableHasChanges([]), false);
  assert.equal(deliverableHasChanges(null), false);
});

// --- Confirmation B: on-pump detection ------------------------------------

test('detectOnPump is false when the pump snapshot still shows the old profile', () => {
  const rows = buildDeliverable({ activeProfile, acceptedItems: accepted });
  const res = detectOnPump(rows, activeProfile.segments, '2026-07-02 08:00');
  assert.equal(res.onPump, false);
  assert.equal(res.matchedAt, null);
});

test('detectOnPump is true once the snapshot matches the deliverable', () => {
  const rows = buildDeliverable({ activeProfile, acceptedItems: accepted });
  // Simulate the user programming the deliverable: new snapshot = deliverable.
  const newSnapshot = [
    { start_min: 0, basal_rate: 0.8, isf: 55, carb_ratio: 10, target_bg: 110 },
    { start_min: 720, basal_rate: 1.0, isf: 40, carb_ratio: 9, target_bg: 110 },
  ];
  const res = detectOnPump(rows, newSnapshot, '2026-07-02 09:00');
  assert.equal(res.onPump, true);
  assert.equal(res.matchedAt, '2026-07-02 09:00');
});

test('detectOnPump tolerates float noise within 1e-6', () => {
  const rows = buildDeliverable({ activeProfile });
  const snap = [
    { start_min: 0, basal_rate: 0.8 + 1e-9, isf: 50, carb_ratio: 10, target_bg: 110 },
    { start_min: 720, basal_rate: 1.0, isf: 45, carb_ratio: 9, target_bg: 110 },
  ];
  assert.equal(detectOnPump(rows, snap).onPump, true);
});

test('detectOnPump is false with empty inputs', () => {
  assert.equal(detectOnPump([], activeProfile.segments).onPump, false);
  assert.equal(detectOnPump(buildDeliverable({ activeProfile }), []).onPump, false);
});

// --- #94 reconcile: planned deliverable vs detected pump profile ----------

test('roundToPrecision rounds per pump precision and passes null through', () => {
  assert.equal(roundToPrecision(0.6549, 3), 0.655);
  assert.equal(roundToPrecision(49.6, 0), 50);
  assert.equal(roundToPrecision(9.04, 1), 9.0);
  assert.equal(roundToPrecision(null, 3), null);
});

test('reconcile is pending with nothing to compare', () => {
  assert.equal(reconcileDeliverable([], activeProfile.segments).state, 'pending');
  const rows = buildDeliverable({ activeProfile });
  assert.equal(reconcileDeliverable(rows, []).state, 'pending');
});

test('reconcile confirms an exact match and reports the fetch time', () => {
  const rows = buildDeliverable({ activeProfile, acceptedItems: accepted });
  // The pump now delivers exactly the deliverable.
  const detected = [
    { start_min: 0, basal_rate: 0.8, isf: 55, carb_ratio: 10, target_bg: 110 },
    { start_min: 720, basal_rate: 1.0, isf: 40, carb_ratio: 9, target_bg: 110 },
  ];
  const res = reconcileDeliverable(rows, detected, '2026-07-02 09:00');
  assert.equal(res.state, 'confirmed');
  assert.equal(res.matchedAt, '2026-07-02 09:00');
  assert.deepEqual(res.groups, []);
});

test('reconcile confirms when differences vanish under per-param rounding', () => {
  const rows = buildDeliverable({ activeProfile, acceptedItems: accepted });
  // Each param is off by less than its rounding step: basal < 0.0005,
  // ISF/target < 0.5, I:C < 0.05. All round to the planned value.
  const detected = [
    { start_min: 0, basal_rate: 0.8004, isf: 55.4, carb_ratio: 10.04, target_bg: 109.6 },
    { start_min: 720, basal_rate: 1.0004, isf: 40.3, carb_ratio: 8.96, target_bg: 110.2 },
  ];
  const res = reconcileDeliverable(rows, detected);
  assert.equal(res.state, 'confirmed');
});

test('reconcile flags a mis-key that survives rounding, only for the bad cell', () => {
  const rows = buildDeliverable({ activeProfile, acceptedItems: accepted });
  // ISF mis-keyed at midnight (planned 55 -> keyed 60); everything else exact.
  const detected = [
    { start_min: 0, basal_rate: 0.8, isf: 60, carb_ratio: 10, target_bg: 110 },
    { start_min: 720, basal_rate: 1.0, isf: 40, carb_ratio: 9, target_bg: 110 },
  ];
  const res = reconcileDeliverable(rows, detected, '2026-07-02 09:00');
  assert.equal(res.state, 'mismatch');
  assert.equal(res.matchedAt, null);
  assert.equal(res.groups.length, 1);
  assert.equal(res.groups[0].start_min, 0);
  assert.equal(res.groups[0].cells.length, 1);
  assert.equal(res.groups[0].cells[0].param, 'isf');
  assert.equal(res.groups[0].cells[0].planned, 55);
  assert.equal(res.groups[0].cells[0].actual, 60);
});

test('reconcile per-param rounding: a basal difference below 0.001 is not a mis-key but above it is', () => {
  const rows = buildDeliverable({ activeProfile });
  // Below precision at 00:00 (0.8 vs 0.8004 -> both 0.800); above at 12:00
  // (1.0 vs 1.002 -> 1.000 vs 1.002).
  const detected = [
    { start_min: 0, basal_rate: 0.8004, isf: 50, carb_ratio: 10, target_bg: 110 },
    { start_min: 720, basal_rate: 1.002, isf: 45, carb_ratio: 9, target_bg: 110 },
  ];
  const res = reconcileDeliverable(rows, detected);
  assert.equal(res.state, 'mismatch');
  assert.equal(res.groups.length, 1);
  assert.equal(res.groups[0].start_min, 720);
  assert.equal(res.groups[0].cells[0].param, 'basal_rate');
  assert.equal(res.groups[0].cells[0].planned, 1.0);
  assert.equal(res.groups[0].cells[0].actual, 1.002);
});

test('reconcile samples the union of boundaries and flags a divergence only the pump introduced', () => {
  const rows = buildDeliverable({ activeProfile });
  // The pump has an extra boundary at 06:00 that lowers basal there — a break
  // the plan never had. Union sampling must catch the 06:00 divergence.
  const detected = [
    { start_min: 0, basal_rate: 0.8, isf: 50, carb_ratio: 10, target_bg: 110 },
    { start_min: 360, basal_rate: 0.5, isf: 50, carb_ratio: 10, target_bg: 110 },
    { start_min: 720, basal_rate: 1.0, isf: 45, carb_ratio: 9, target_bg: 110 },
  ];
  const res = reconcileDeliverable(rows, detected);
  assert.equal(res.state, 'mismatch');
  assert.deepEqual(res.groups.map((g) => g.start_min), [360]);
  assert.equal(res.groups[0].cells[0].param, 'basal_rate');
  assert.equal(res.groups[0].cells[0].planned, 0.8);
  assert.equal(res.groups[0].cells[0].actual, 0.5);
});

test('reconcile: a redundant same-value break on either side is benign (no diff)', () => {
  const rows = buildDeliverable({ activeProfile });
  // The pump splits the 00:00 segment at 06:00 but keeps the SAME values — a
  // redundant break. Union sampling reads identical values on both sides, so
  // no cell diverges: confirmed.
  const detected = [
    { start_min: 0, basal_rate: 0.8, isf: 50, carb_ratio: 10, target_bg: 110 },
    { start_min: 360, basal_rate: 0.8, isf: 50, carb_ratio: 10, target_bg: 110 },
    { start_min: 720, basal_rate: 1.0, isf: 45, carb_ratio: 9, target_bg: 110 },
  ];
  const res = reconcileDeliverable(rows, detected, '2026-07-02 10:00');
  assert.equal(res.state, 'confirmed');
  assert.equal(res.matchedAt, '2026-07-02 10:00');
});

// --- #120 baseline gate: no committed plan ⇒ never mismatch ---------------

test('reconcile is pending on fresh DB even when deliverable differs from pump', () => {
  // Deliverable carries accepted changes (basal lowered, ISF changed). The
  // pump still has the old values. Without a committed plan this is a
  // proposal, not a keying error — must return pending.
  const rows = buildDeliverable({ activeProfile, acceptedItems: accepted });
  const pumpSegs = activeProfile.segments; // old values still on pump
  const res = reconcileDeliverable(rows, pumpSegs, '2026-07-02 08:00', false);
  assert.equal(res.state, 'pending');
  assert.equal(res.matchedAt, null);
  assert.deepEqual(res.groups, []);
});

test('reconcile confirms an exact first-plan pump match with empty apply history (#462)', () => {
  // The user keyed the staged deliverable into a new pump profile and activated
  // it before ever applying a plan. Exact equality is unambiguous, so the
  // empty-history safeguard must not hold it pending forever.
  const rows = buildDeliverable({ activeProfile, acceptedItems: accepted });
  const detected = [
    { start_min: 0, basal_rate: 0.8, isf: 55, carb_ratio: 10, target_bg: 110 },
    { start_min: 720, basal_rate: 1.0, isf: 40, carb_ratio: 9, target_bg: 110 },
  ];
  const res = reconcileDeliverable(rows, detected, '2026-07-02 09:00', false);
  assert.equal(res.state, 'confirmed');
  assert.equal(res.matchedAt, '2026-07-02 09:00');
  assert.deepEqual(res.groups, []);
});

test('reconcile confirms the first exact match against the already-refetched pump (#462)', () => {
  // The real sequence: the user keys the change in, the next fetch returns the new
  // profile, so the deliverable is rebuilt on top of it. Every cell now equals the
  // pump — but the accepted chip is still standing, so this is a plan that landed.
  const refetched = { segments: [
    { start_min: 0, basal_rate: 0.8, isf: 55, carb_ratio: 10, target_bg: 110 },
    { start_min: 720, basal_rate: 1.0, isf: 40, carb_ratio: 9, target_bg: 110 },
  ] };
  const rows = buildDeliverable({ activeProfile: refetched, acceptedItems: accepted });
  const res = reconcileDeliverable(rows, refetched.segments, '2026-07-02 09:00', false);
  assert.equal(res.state, 'confirmed');
  assert.equal(res.matchedAt, '2026-07-02 09:00');
});

test('reconcile stays pending on a first plan with nothing staged (#393)', () => {
  // No accepted picks and no edits: the deliverable is a byte-copy of the pump.
  // That is trivially "equal" but there is no plan to confirm — claiming the pump
  // matches your plan (and offering to re-baseline) would be a lie, and there is
  // no draft to apply.
  const rows = buildDeliverable({ activeProfile });
  const res = reconcileDeliverable(rows, activeProfile.segments, '2026-07-02 09:00', false);
  assert.equal(res.state, 'pending');
  assert.equal(res.matchedAt, null);
  assert.deepEqual(res.groups, []);
});

test('reconcile confirms a first exact match even when the change folds into an equal neighbor (#462)', () => {
  // The UI hands reconcile the COLLAPSED rows. When a keyed-in change lands equal
  // to its neighbor after refetch, the accepted boundary folds away — but its
  // provenance rides onto the survivor, so the plan is still detected as a real
  // proposal and confirms instead of deadlocking pending.
  const refetched = { segments: [
    { start_min: 0,   basal_rate: 0.8, isf: 50, carb_ratio: 5.7, target_bg: 110 },
    { start_min: 720, basal_rate: 0.8, isf: 50, carb_ratio: 5.7, target_bg: 110 },
  ] };
  const rows = buildDeliverable({
    activeProfile: refetched,
    acceptedItems: [{ type: 'ic', start_min: 720, value: 5.7, recommended: 5.7 }],
  });
  const collapsed = collapseDeliverable(rows);
  const res = reconcileDeliverable(collapsed, refetched.segments, '2026-07-02 09:00', false);
  assert.equal(res.state, 'confirmed');
  assert.equal(res.matchedAt, '2026-07-02 09:00');
  assert.deepEqual(res.groups, []);
});

test('reconcile flags a real mis-key after a plan has been committed', () => {
  // Same deliverable vs pump mismatch as above, but the user has committed at
  // least one plan — now the delta IS a keying error.
  const rows = buildDeliverable({ activeProfile, acceptedItems: accepted });
  // ISF stayed at 50 on the pump instead of the planned 55 (accepted).
  const pumpSegs = activeProfile.segments; // isf 50 vs planned 55
  const res = reconcileDeliverable(rows, pumpSegs, '2026-07-02 09:00', true);
  assert.equal(res.state, 'mismatch');
  assert.ok(res.groups.length > 0);
  const isfGroup = res.groups.find((g) => g.start_min === 0);
  assert.ok(isfGroup, 'midnight ISF mismatch group exists');
  const isfCell = isfGroup.cells.find((c) => c.param === 'isf');
  assert.ok(isfCell, 'isf cell flagged');
  assert.equal(isfCell.planned, 55);
  assert.equal(isfCell.actual, 50);
});

// --- effective plan: what confirmation records (#462) ----------------------

test('effectivePlanItems records a hand-edit-only plan (no accepted picks) (#462)', () => {
  // The user never accepted anything on Diagnose — they hand-edited a cell here.
  // The stored accepted-item draft is empty, so recording IT would apply nothing.
  // The effective plan must carry the edited value.
  const rows = buildDeliverable({ activeProfile, edits: { '0:isf': 60 } });
  const items = effectivePlanItems(rows);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'isf');
  assert.equal(items[0].start_min, 0);
  assert.equal(items[0].value, 60);
});

test('effectivePlanItems records an edited accepted pick at its post-edit value (#462)', () => {
  // Accepted ISF 55 at 00:00, then hand-edited to 58. History must record 58 —
  // the value keyed into the pump — not the pre-edit accepted 55.
  const rows = buildDeliverable({
    activeProfile,
    acceptedItems: [{ type: 'isf', start_min: 0, value: 55, recommended: 55 }],
    edits: { '0:isf': 58 },
  });
  const at0 = effectivePlanItems(rows).find((i) => i.type === 'isf' && i.start_min === 0);
  assert.ok(at0, 'the 00:00 ISF item exists');
  assert.equal(at0.value, 58);
});

test('effectivePlanItems survives keyed-in-and-refetched (value === current) (#462)', () => {
  // After keying the change in, current catches up to value so the cell reads
  // "no change" — but its accepted provenance still marks it as the committed plan.
  const refetched = { segments: [
    { start_min: 0,   basal_rate: 0.8, isf: 55, carb_ratio: 10, target_bg: 110 },
    { start_min: 720, basal_rate: 1.0, isf: 40, carb_ratio: 9, target_bg: 110 },
  ] };
  const rows = buildDeliverable({ activeProfile: refetched, acceptedItems: accepted });
  const items = effectivePlanItems(rows);
  assert.ok(items.length >= 1);
  assert.ok(items.every((i) => i.type === 'isf'));
});

test('effectivePlanItems is empty when nothing is staged', () => {
  const rows = buildDeliverable({ activeProfile });
  assert.deepEqual(effectivePlanItems(rows), []);
});

// --- I:C block provenance survives the Plan lifecycle (#581) ---------------
//
// A Diagnose-staged I:C block with members [720, 750] fans out into two
// accepted picks, each stamped with the identical block claim. The
// normalization contract: it survives untouched, unedited round-trips, and
// is stripped from every surviving member the moment the group is no longer
// complete-and-consistent (a member removed, or independently edited away
// from the rest) — but retained when the WHOLE group is edited to agree.

const icBlockProvenance = {
  block_start_min: 720, block_end_min: 900, block_member_start_mins: [720, 750],
};
const icBlockAccepted = [
  { type: 'ic', start_min: 720, value: 9.5, recommended: 9.5, ic_block_provenance: icBlockProvenance },
  { type: 'ic', start_min: 750, value: 9.5, recommended: 9.5, ic_block_provenance: icBlockProvenance },
];

test('effectivePlanItems preserves ic_block_provenance on an untouched, complete group', () => {
  const rows = buildDeliverable({ activeProfile, acceptedItems: icBlockAccepted });
  const items = effectivePlanItems(rows).filter((i) => i.type === 'ic');
  assert.equal(items.length, 2);
  for (const it of items) {
    assert.deepEqual(it.ic_block_provenance, icBlockProvenance);
  }
});

test('effectivePlanItems strips ic_block_provenance when one member was removed', () => {
  // Only the 720 pick survives (750 was removed via a chip removal) — it still
  // lists both members, so the group is incomplete.
  const rows = buildDeliverable({
    activeProfile,
    acceptedItems: [icBlockAccepted[0]],
  });
  const items = effectivePlanItems(rows).filter((i) => i.type === 'ic');
  assert.equal(items.length, 1);
  assert.equal(items[0].ic_block_provenance, undefined);
});

test('effectivePlanItems strips ic_block_provenance when one member was independently edited', () => {
  // Both members present, but 720 was hand-edited to a different value than 750.
  const rows = buildDeliverable({
    activeProfile,
    acceptedItems: icBlockAccepted,
    edits: { '720:carb_ratio': 11 },
  });
  const items = effectivePlanItems(rows).filter((i) => i.type === 'ic');
  assert.equal(items.length, 2);
  for (const it of items) {
    assert.equal(it.ic_block_provenance, undefined);
  }
});

test('effectivePlanItems retains ic_block_provenance when the whole group is edited to agree', () => {
  // Both members hand-edited to the SAME new value — still a complete, internally
  // consistent group, so the block claim survives.
  const rows = buildDeliverable({
    activeProfile,
    acceptedItems: icBlockAccepted,
    edits: { '720:carb_ratio': 11, '750:carb_ratio': 11 },
  });
  const items = effectivePlanItems(rows).filter((i) => i.type === 'ic');
  assert.equal(items.length, 2);
  for (const it of items) {
    assert.deepEqual(it.ic_block_provenance, icBlockProvenance);
    assert.equal(it.value, 11);
  }
});

test('normalizeIcBlockProvenance leaves unannotated items untouched', () => {
  const items = [{ type: 'ic', start_min: 720, value: 9.5 }];
  assert.deepEqual(normalizeIcBlockProvenance(items), items);
});

test('normalizeIcBlockProvenance rejects a stray extra claiming an already-complete group', () => {
  // Three rows claim the same two-member block — an impossible/duplicate claim;
  // none of them should retain provenance.
  const items = [
    ...icBlockAccepted,
    { type: 'ic', start_min: 780, value: 9.5, ic_block_provenance: icBlockProvenance },
  ];
  const out = normalizeIcBlockProvenance(items);
  for (const it of out) assert.equal(it.ic_block_provenance, undefined);
});

// --- hand-edit revert clears the override (#462) ---------------------------

test('isDeliverableEditRevert: returning a cell to the current profile is a revert', () => {
  // 50 -> 60 -> 50 on a cell with no accepted pick. The 60 override exists; typing
  // 50 back must read as a revert so the handler deletes it.
  assert.equal(
    isDeliverableEditRevert(activeProfile, [], { '0:isf': 60 }, 0, 'isf', 50), true);
});

test('isDeliverableEditRevert: a value still away from baseline is NOT a revert', () => {
  assert.equal(
    isDeliverableEditRevert(activeProfile, [], {}, 0, 'isf', 60), false);
});

test('isDeliverableEditRevert: returning to an accepted pick is a revert (pick still stands)', () => {
  // Accepted ISF 55 at 00:00, hand-edited to 58, then back to 55 — the edit is a
  // no-op over the accepted pick, so it clears; the pick itself remains staged.
  const acceptedIsf = [{ type: 'isf', start_min: 0, value: 55, recommended: 55 }];
  assert.equal(
    isDeliverableEditRevert(activeProfile, acceptedIsf, { '0:isf': 58 }, 0, 'isf', 55), true);
  // But dropping past the accepted pick to the current profile is a real edit.
  assert.equal(
    isDeliverableEditRevert(activeProfile, acceptedIsf, {}, 0, 'isf', 50), false);
});

test('isDeliverableEditRevert: compared under pump precision (basal below the 0.001 step)', () => {
  // active basal at 00:00 is 0.8; a value that rounds to 0.8 at 0.001 precision is
  // a revert even if it is not byte-equal.
  assert.equal(
    isDeliverableEditRevert(activeProfile, [], { '0:basal_rate': 0.9 }, 0, 'basal_rate', 0.8004), true);
});

test('a reverted hand-edit leaves an empty first Plan pending, with no history item (#462)', () => {
  // The end state after the handler deletes the reverted override: no accepted
  // picks, no edits. The deliverable proposes nothing, reconcile stays pending on
  // an empty apply history, and there is nothing to persist.
  const rows = buildDeliverable({ activeProfile, acceptedItems: [], edits: {} });
  assert.deepEqual(effectivePlanItems(rows), []);
  const res = reconcileDeliverable(rows, activeProfile.segments, '2026-07-02 09:00', false);
  assert.equal(res.state, 'pending');
});

// --- ADR 0042 deliverable gate: mixed families cannot be packaged ----------

test('buildDeliverable rejects accepted basal plus I:C picks', () => {
  const items = [
    { type: 'ic', start_min: 720, value: 5.4 },
    { type: 'basal', start_min: 930, value: 1.2 },
  ];
  assert.throws(
    () => buildDeliverable({ activeProfile, acceptedItems: items }),
    /mixes tuning families/,
  );
});

test('buildDeliverable rejects accepted basal plus ISF picks', () => {
  const items = [
    { type: 'isf', start_min: 720, value: 38 },
    { type: 'basal', start_min: 900, value: 1.3 },
  ];
  assert.throws(
    () => buildDeliverable({ activeProfile, acceptedItems: items }),
    /mixes tuning families/,
  );
});

test('buildDeliverable rejects an off-family hand-edit on an accepted Plan', () => {
  assert.throws(
    () => buildDeliverable({
      activeProfile,
      acceptedItems: [{ type: 'basal', start_min: 180, value: 0.6 }],
      edits: { '720:isf': 42 },
    }),
    /mixes tuning families/,
  );
});

test('buildDeliverable allows multiple hand-edits in one family', () => {
  const rows = buildDeliverable({
    activeProfile,
    edits: { '0:isf': 52, '720:isf': 41 },
  });
  assert.equal(rows[0].isf.value, 52);
  assert.equal(rows[0].isf.provenance, 'edited');
  assert.equal(rows[1].isf.value, 41);
  assert.equal(rows[1].isf.provenance, 'edited');
});

// --- #468: a direction-only ISF finding cannot be staged --------------------

test('a direction-only ISF finding is not stageable (#468)', () => {
  // Recurring correction-caused lows own the weaken direction but do not size a new
  // ISF, so the row carries no recommended value. It must never become a Plan chip.
  const directionOnly = {
    parameter: 'isf', label: 'Fasting', current: 36, recommended: null,
    evidence: { direction: 'weaken',
      recurrence_channels: { corr_low_days: 4, rescue_days: 0, covered_days: 30 } },
  };
  assert.equal(isStageableIsf(directionOnly), false);
  assert.equal(isStageableIsf(null), false);
  // A finding that does name a value is still stageable (the strengthen path).
  assert.equal(isStageableIsf({ parameter: 'isf', current: 36, recommended: 30.2 }), true);
});
