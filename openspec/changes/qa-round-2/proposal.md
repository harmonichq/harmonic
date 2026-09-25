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

## #467

Pressing Overnight drops "Overnight lows with no insulin on board", the one
Pattern whose whole population lies in that window. A scoped window serves a
Pattern only when it is chartable, and this Pattern never is: it has no habit
member and its population is band nights, not an Exposure family. The same gate
drops setting-staged and unadmitted Patterns from every scoped window, even the
explicit 00:00–24:00 scope, leaving their causes unfolded.

- A scoped window serves a Pattern when its outcomes land in it: an
  Exposure-family Pattern when its outcome-anchored count in the window is above
  zero, the harm-band Pattern when the window overlaps 00:00–06:00 (Connor's
  option A, 2026-09-24). Membership is decided where the scoped roster is built.
- In a scoped window the harm-band Pattern keeps its band counts, and its count
  sentence names the band.
- Chartability goes back to deciding only the chart coordinate and the case file.
- The JS mirror and the generated fixture follow; no QA expectation moves.

Impact: the scoped Pattern roster, the findings projection's Pattern rows and
count sentence, the fixture mirror and generator, one ledger story. Staging,
pricing, queue order, the Harm signal's band and counts, and Pattern Focus
admission are unchanged. Triage record:
`docs/scope/467-scoped-pattern-membership.md`.

## #469

The findings rail breaks the one urgency ranking (Connor, 2026-09-24: the queue
is one ranking by urgency across settings and habits) in four places: a Pattern
admitted through its setting takes a second ranked position at that setting's
Priority while reading "0 of N"; a scoped window ranks on 30-day Priority while
printing the window's counts; the tier headings repeat and nothing explains
them; and the direction-only correction-factor weaken sits under a tail note
that gives the wrong reason.

- A Pattern admitted through its setting sits beneath that setting's row, in its
  position, and says it is ranked with its setting.
- The served tiers become bands of the one ranking, so each tier heading prints
  at most once and the urgency stripe marks one leading run. The Glossary
  explains each tier word and the tail sentence.
- In a scoped window, a ranked Pattern or cause that prints the window's counts
  says it is ranked on all 30 days.
- An asserting row that cannot stage prints its staging refusal and stands
  before the tail note, never under it.

Impact: the findings projection's order, tiers and two served row fields, the
mirror and fixture, the rail, the ISF panel's shared refusal wording, the
Glossary and its design-exploration extract, CONTEXT.md and DESIGN.md, and one
ledger story. Priority, the Pattern price, staging predicates and caps are
unchanged, and no QA expectation moves. Triage record:
`docs/scope/469-queue-rank.md`.

## #470

A meal bolused as a first carb bolus plus a top-up minutes later counts as two
meals everywhere meals are counted: Highs after meals and Lows after meals double
their denominator, the Pattern's case file lists two rows whose first peak stops at
the top-up, and Carb undercount judges each half on its own carbs, so a split meal
can be flagged where the same meal dosed once is not. ADR 0030's same-meal grace
existed, but only inside Carb undercount's peak window.

- ADR 0030's 30-minute grace becomes the single meal-identity rule (Connor,
  2026-09-24): a carb bolus of 10 g or more within 30 minutes of a meal's first
  bolus is part of that meal, measured from the first bolus and never chained.
- A meal is anchored and identified by its first bolus; its carbs and dose are
  summed over its members, a cancelled leg's carbs counted once.
- Every meal counter reads the one rule: the meal opportunities and anchors, the
  completed carb-bolus population, the meal classifiers, Meal over-delivery's
  suspend ownership, Meal bolus short's implicated meal, the Post-meal arc (which
  now reads through a top-up to the next separate meal), the Trial and
  watched-change cohorts, the follow-up comparison and the time-of-day meal count.
- A manufactured case, `behavioral-split-meal`, holds top-ups inside, at and just
  outside the grace.

Impact: a new meal-identity module and every meal counter named above; the
Diagnose workstation demo set, the event-comparison capture and the
eating-sequence findings payload, whose inputs hold same-meal pairs; one QA case
and one ledger story; CONTEXT.md. Eating windows, the carb-ratio analyzer's meal
and run ledgers, every staging predicate, cap and support floor, and every
`ScenarioConfig` value are unchanged, and no committed QA expectation moves.
Triage record: `docs/scope/470-meal-identity.md`.

## #461

Highs after meals counts a meal as "ran high" whenever Late bolus fires, and Late
bolus never looks at glucose after the dose, so meals that climbed a little before
the bolus and then fell back in range are claimed, and advised to "blunt the
spike" that never happened.

- Late bolus matches only when the meal's Arc peak is above the 180 range line
  (Connor, 2026-09-24, option A); otherwise it stays silent with a new calm reason,
  "stayed in range".
- The peak Late bolus judges and the peak its case-file row prints are one reading
  from one implementation, cut at the next separate meal (ADR 470).
- `behavioral-late-bolus` and `behavioral-carb-undercount` are re-shaped so each
  still fires Late bolus on a real high, and `behavioral-late-bolus` gains a meal
  that peaks at exactly 180 and stays calm.

Impact: the Late bolus classifier, the silence taxonomy and its calm sets, the
Guide, the shared peak reader, two QA cases and their spec tallies, the design
exploration's captures, one ledger story, CONTEXT.md. Staging, caps, floors,
Priority inputs and the frontend are unchanged. Triage record:
`docs/scope/461-late-bolus-outcome.md`.
