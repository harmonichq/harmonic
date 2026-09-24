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
