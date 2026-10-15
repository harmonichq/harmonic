# A change made on the pump is a Trial, and ends what is active (#500)

## Why

A carb-ratio change made on the pump was thrown away unless a Plan proposed it.
On the operator's own data, the settings reads show the carb ratio for one time
block changing on 2026-10-12. No applied Plan matched it, so no Trial was
recorded and follow-up admission said there was no active change. An in-place
edit of the active profile was seen from the settings reads only for carb ratio,
and only with a Plan behind it. Every other in-place edit was seen only through
delivery history.

Connor: "Don't throw something away just because it wasn't started in-app. User
making profile changes on pump is authoritative and ends any existing trial or
focus."

## What changes

- Every pair of consecutive settings reads whose active profile differs is a
  pump change: an active-profile switch, or an in-place edit of the active
  profile. An edit to an inactive profile is not one.
- A pump change confined to one setting is one targeted Trial per time block it
  moved. The block, its before and its after are read off the two reads. A
  carb-ratio Trial owns its block as its identity and cohort, as it did under
  ADR 581. A change to several settings is one whole-profile Trial.
- A Plan is never required. An applied Plan group that uniquely matches a
  carb-ratio change still supplies its member starts, and the Plan receipt
  still names its Trial.
- A detected pump change ends any open Trial outside its own Edit as
  `superseded`, and any active Focus as `trial_preempted`, and becomes the
  active Trial. Both ending kinds already exist. A walk-back still closes both
  sides.
- A dose or delivery observation of the same move, after the read before the
  one that shows it, is the same change. A slotted observation counts as the
  same change only inside the block the reads moved. A change already recorded
  from delivery is not recorded a second time.

No analyzer's staging verdict changes: not `asserts_move`, `ic_asserts_move` or
`isf_asserts_move`, and not the basal floor. This is follow-up tracking only.

## Impact

- `ciq_autotune/watched_change.py`: pump-change detection, Trial candidates,
  corroboration, the reversal check.
- `openspec/specs/outcomes`: the new requirement. The in-place-edit Plan
  scenarios this change rewrote moved to `recommendations-redesign`, whose ADR
  518 (Done on a Setting card) replaces that confirmation requirement.
