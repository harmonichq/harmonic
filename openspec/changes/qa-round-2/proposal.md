# QA round 2 (#459–#470)

## Why

A second QA round on the shipped desk found twelve defects and gaps, filed as
#459–#470. They are delivered as one change through one integration branch.
Each ticket has its own `## #<issue>` section below, its own tasks in
`tasks.md`, its own decision records in `design.md` and its own spec deltas.

## What Changes

Each ticket's section says what changes for it. Two conventions hold for the
whole change:

- `tasks.md` numbers its checklist positionally across the whole file. A later
  ticket appends its tasks; nothing is renumbered.
- Acceptance anchors are positional **per delta file**: "surfaces 1" is the
  first requirement in `specs/surfaces/spec.md`, counting its ADDED, MODIFIED,
  REMOVED and RENAMED requirements in file order. A later ticket appends its
  requirements to the end of a file, so earlier positions do not move.

## #460

Diagnose's watch dock reads "Nothing being watched" while a Plan draft is saved.
The dock's staged line comes from marks the Diagnose surface seeds once, when it
boots, from a page-memory copy of the draft that may not have loaded yet. After
boot the marks move only when Diagnose itself stages. So a fresh seat whose Plan
read lands after the payload, a draft item the current analysis no longer
admits, and a draft saved from Changes while Diagnose was parked all leave the
dock idle, and the first and third leave the lane marks and stage button
unmarked too.

- The dock reads the served Plan draft from the guidance read, next to the
  served pending Plan it already reads. When this surface's own marks name no
  staged change and the served draft holds items, the dock reports the draft,
  named from its own items.
- Diagnose seeds its staged marks again whenever it refreshes, so the lane
  marks, the stage button and the dock agree with the saved draft whichever read
  lands first, and after a return.
- The dock's precedence, kind labels and route are unchanged. No server change;
  the draft save keeps its no-bump exception.

## #459

Staging a change to a second setting silently drops the change already staged.
A Plan holds one setting at a time by design, and that stays (Connor,
2026-09-24). What is missing is the notice.

- Before the press, a finding's stage control says it will replace the staged
  change, and names that change.
- After a stage that replaced another setting, the replaced setting's own stage
  control no longer claims it is staged.
- The Plan spec's placeholder scenario for the one-setting rule becomes a real
  one.
- A manufactured case with both a stageable basal slot and a stageable carb-ratio
  block makes the replacement reproducible in the served app.

## Impact

- #459 and #460 change the shipped frontend only: Diagnose's destination,
  workstation and watch dock, and the Plan surface's stage callback. The server,
  the analyzers, the staging predicates and `validate_plan_items` are unchanged.
- The frozen desk behavior ledger gains stories for #459 and #460; neither
  amends or retires an existing story.
- #459 adds one manufactured QA case.

Each ticket keeps its triage reproduction and plan-review ledger in
`docs/scope/<issue>-<slug>.md`, the repository's scope-record convention.

## #462

Most past changes never show a Before/Trial comparison. An older detected
change ends with a saved assessment that is unavailable when its retained
context came from a pump read after its ending, every Harmonic update makes a
retained comparison unreadable, and a requested reassessment never reaches an
ended record's stage. A reassessment of an ended Trial also reads past the
record's ending, into days under a later setting.

- An ended record whose saved ending serves no periods draws a requested
  Retained context or Current policy reassessment on its stage, labelled with its
  mode and "recomputed now", never beside the saved ending (Connor, 2026-09-24).
- A reassessment of an ended Trial reads evidence only up to the record's ending
  instant; Current policy then reads the pump settings as of the ending (Connor).
- A Harmonic update no longer voids retained comparisons: the whole-package
  version gate is dropped, with no migration (Connor).
- The Retained line names its stored context by when it was recorded, never by
  an internal id.
- A manufactured case whose ending saves `context_after_ending` makes the fix
  reproducible in the served app.

Impact: the comparison, the ending capture and the record read on the server;
the change-record stage in the desk; one new QA case and one ledger story; S91's
c4 part is amended. Staging, the Plan, saved endings and the analyzers are
unchanged. Triage record: `docs/scope/462-record-comparison.md`.

## #463

A change record prints differences with binary float tails, reserves an empty
chart box for an ended record it cannot draw, and says no decision was recorded
for a change a Plan produced; a change seen only in delivery history can be
dated hours before it was made.

- Differences and percent cells print at one decimal in the desk.
- A figure with no curve takes no chart space; new endings save their clock
  envelope so they draw their saved curve.
- A Trial matched to a Plan shows the Plan's decision, and a Trial detected after
  its Plan's pump-read confirmation links to that Plan.
- A delivery-detected change is dated at the first observation of its new
  value; existing records keep their time and identity (Connor, 2026-09-24).

Impact: Trial detection, the ending capture, the reconcile's Plan link and the
record read on the server; the evidence figure, outcome table and stage layout
in the desk; one ledger story and one desk-suite test. The analyzers' epochs,
every classifier, cap, floor, staging predicate and assessment rule, and every
saved ending and Plan receipt are unchanged. Triage record:
`docs/scope/463-record-display.md`.

## #465

A slot with recurring overnight lows whose steady nights already run within a
hundredth of its setting stages a one-hundredth-of-a-U/h cut, below the noise
floor every other basal move respects. It stages like a real move, nudges the
consolidated profile, and can take the Basal lever's headline.

- A recurring-lows cut smaller than the noise floor or one full step, whichever
  is smaller, is not taken: the slot holds at its setting under the
  recurring-low gate, with its own served sentence naming the lows (Connor,
  2026-09-24: no invented minimum step, never "leaning lower").
- The one check lives in the harm layer, for the median-deferred cut and the
  no-median full step alike. Cuts at or above the threshold are unchanged.
- The held queue row names no lower lean; the served sentence names the lows.
- A manufactured case, `basal-recurring-low-within-floor`, reproduces it.

Impact: the harm layer, the basal sentence, the findings projection's held-row
title with its JS mirror and generated fixture, one QA case and one ledger
story. No committed case store's verdict moves. Triage record:
`docs/scope/465-recurring-low-floor.md`.

## #466

A basal slot lowered for recurring lows tells the reader the data does not
establish a move, shows none of the lows behind it, and says "at this hour"
although recurrence is counted across the whole night.

- The interval sentence on a recurring-lows lower says the steady nights alone
  do not establish the step and that it comes from the overnight lows listed.
- The backend serves the recurrence count the nudge actually used and its bar;
  the slot lists that count and each of its half hour's lows, each opening its
  day in Day. Held slots with lows list them too.
- The copy says "overnight", not "at this hour" (Connor, 2026-09-24).
- The nights roster gains column headers.

Impact: the harm evidence, the recurring-lows sentence, the basal slot panel
and its roster, the lane cell's name, one QA case, one generated fixture key,
one ledger story and S113's amendment. The Recommended value, staging and every
harm rule are unchanged. Triage record: `docs/scope/466-recurring-low-explain.md`.
