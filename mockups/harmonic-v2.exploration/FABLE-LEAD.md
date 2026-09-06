# Glucose first, rounds 3 and 4: design lead record (#348)

This preserves the design lead’s round-3c hand-back before the saved corrections.
For current observed behavior and the interrupted follow-up, read [REVIEW.md](REVIEW.md)
and [AUDIT.md](AUDIT.md). The earlier predicted copy and times below are historical.
Round 4 (the reviewed corrections and the shared history) is the last section of
this file.

Author: Claude Fable 5.1, design lead. Files: `mockups/harmonic-v2-glucose.js`,
`mockups/harmonic-v2-glucose-setting.js` (new in 3c),
`mockups/harmonic-v2-glucose-focus.js` (new in 3d),
`mockups/harmonic-v2-glucose-journey.js` (new in 4), `mockups/harmonic-v2-glucose.css`,
this record, and the round-3 and round-4 paragraphs of `BRIEF.md`.
`harmonic-v2-glucose.html` is unchanged (stylesheet order already seats
`frontend/theme.css` last). Unlocked exploration; no critique or lock is claimed
here. The 3d habit journey is recorded after the coordinator's status note.

## Verification status

Round 3a was rendered by the parent at 1280×720 and 390×624 (eight synthetic
screenshots under `.agentflow/348-fable-review-inputs/r3a-*.png`). Round 3b
was rendered and verified by the parent, not as a final aesthetic approval.
Round 3c (this turn) is unrendered: `node --check` passes on both scripts, and
nothing in 3c is claimed as seen.

Seen in 3a and 3b and kept: one desk of two panes with no banner or bottom
bar; the served nameplate rail; both figures on one spine with the anchor
line continuous; the shipped hover readout swapping into the Figure 1 rail;
the cohort, member and step lists in the reading pane; the Trial stage and
its reading pane; the narrow seat control and member sheet.

Corrected in 3c on the parent's review of 3b:

* The investigation subline printed `insufficient evidence`, a basal safety
  status borrowed from another parameter. It now prints the served queue
  tier through the shipped `TIER` map (`Worth a look` for this capture), the
  ranking word the findings queue already uses. A tier is a rank, not a
  permission to act; nothing in the prototype starts an action from it.
* `Close` is shipped copy (`frontend/index.html` dialog controls,
  `diagnose-workstation.js`), and moves off the new-copy list below.
* The Trial title read a hardcoded carb-ratio string. It now reads the served
  `changes[]`: one change names its parameter, its slot unless the change is
  uniform, and `before → after unit` with the shipped Plan heads' units; a
  change with no before value prints the after value alone; several changes
  print their count.
* The Trial subline reads the served `state` (`maturing` / `complete`), not
  the mock bar's scenario name.
* The evidence table follows the served `role`: target rows first with the
  role printed under the row name, denominators under every value, and a meal
  arc with no meals in a period prints `no meals in period` rather than a
  null. Nothing is printed as an effect when the count is zero.

## The decision

Round 2 read as a website because the frame was a website's. Round 3 is the
shipped Diagnose stage arranged for one job, and 3c puts a second job on the
same desk without a second frame.

* **One desk, two panes.** `.panes` with the shipped hairline between a stage
  pane (fluid) and a reading pane (300px, 256px under 1100px). No banner, no
  bottom bar, no tabs. Every rail is `.pane > header` or `.instruments`; every
  control is the shipped `.seg`.
* **The concern is the stage's header rail**, seated as the shipped spotlight
  nameplate: a kicker at Label rank, the served title at the spotlight's Title
  rank (1.14rem, under the No-Hero ceiling), and one subline of served counts
  and the served tier. The rail's end holds the actions the state allows.
* **One time spine.** Figure 1 is the aggregate; Figure 2 is the held member
  directly beneath, on the same left spine (`GRID.left`), fixed at 204px
  (186px under 1100px) including its key.
* **Aggregate and member coexist (3b).** No cohort or night is dimmed while a
  member is held; the reading pane's pressed row names the held member.
* **The reading pane holds lists and values, not prose.**
* **Trial leads when a Trial exists; a recorded decision leads when one is
  awaiting pump evidence** (journeys.md arrival states).
* **Narrow (≤700px)** is structural: the stage alone, one figure seat under
  one `.seg`, and the reading pane as a sheet over the figure opened from the
  member button in the same rail. Focus moves to the sheet's `Close` and back.

The round 3b record of the meals investigation (window control, cohort marks,
Figure 2 key, evidence-versus-advice projection) is unchanged in 3c and is not
repeated here; `stepText` and its rationale stand as written in 3b.

## The setting journey (3c)

`harmonic-v2-glucose-setting.js` owns the June setting case and borrows the
desk, rails, Trial stage, tables and forms from the main script through one
small kit. The two synthetic sources are two patients and are never pooled:
the mock bar's `Source` control chooses one, and each shows only its own
review controls.

**Data.** The Plan schedule is `buildDeliverable` + `collapseDeliverable`
from the served `active_profile` and `accepted_items`; reconciliation is the
shipped `reconcileDeliverable(rows, segments, captured_at, hasCommittedPlan)`,
where `hasCommittedPlan` is whether this page holds a recorded decision. The
basal figure is the shipped editorial basal chart fed a mirror of the served
night evidence (`basal_night_evidence.py` keys, read off the analyzer row);
the night figure is the shipped two-track Day builder cropped to the slot
±2 h with unlabelled slot-edge lines. The Trial stage, progress, evidence
table, limits, detected settings and conclusion form are the meals script's
own functions on the served `trials.active` / `trials.ready` records.

**Review controls (mock bar, outside product chrome).** `Clock` moves a
manufactured clock through four stations named by the fixture's own stamps:
`Jun 12, 2024 · 12:00 · before the decision`, `Jun 13, 2024 · 00:00 · pump
captured`, `Jun 18 · Trial, 6 of 14 days`, `Jun 27 · Trial, ready to judge`.
`Pump capture` chooses which captured Jun 13 profile the reconcile function
reads at the captured station: `As planned` (0.48 at 03:00) or `Mis-keyed
0.5 U/h at 03:00`. The mismatch is an alternative capture, not an extra
change in the following Trial's history: the Trial stations always read the
as-planned capture. `Next save fails` makes the next Save draft or Record
decision fail once. `?clock=` and `?capture=` are kept in the URL; page
memory (staging, draft, decision, conclusion, set-aside) is not, and reloading
clears it. None of these controls fetches, programs a pump, or is worded as
the wearer doing either.

**Page memory.** Staged, draft (stamp), decision (stamp + snapshot of what
was known: title, tier, change, support, headline), re-key asked (stamp),
finished record (conclusion, ending stamp, on-pump stamp, Trial snapshot),
set-aside (reason, stamp). It survives Overview / Explore / Changes / Day
navigation and the clock control; it is not persisted anywhere, and the Plan
and record panes say so (`Illustrative: v2 proposes keeping this snapshot
with the decision. The current capture does not persist it.`).

**Frames by state.** Overview: finished record if one exists; else Trial if
the clock is at a Trial station; else Plan if a decision is recorded
(reconciliation is the next step); else set-aside stage if set aside; else
the priority. Explore and Day: always the priority, with `Return to Trial`
or `Open Changes` at the rail's end when a Trial or decision exists, so
inspecting evidence never loses the selected setting and never starts a
second watch. Changes: the Plan once staged, else the no-change stage
offering `Stage change`.

**What was deliberately not walked.** `Accept pump values` is not offered on
the mismatch: the following Trial fixture is 0.6→0.48, so accepting 0.5
would fork a history the capture does not hold. The re-baseline step is not
walked. A true next-priority policy remains a planning question: set aside
offers the other fixture patient only as a labelled review control.

## Navigation walk (3c)

Open `harmonic-v2-glucose.html?source=setting`. Desktop 1280×720, then narrow
390×624 where noted. These are the states the code intends; none is rendered
yet, and the Plan row count and break labels are the shipped builder's to
confirm.

1. Overview, clock `before the decision`. Priority stage: kicker `BASAL ·
   JUN 1 TO JUN 12, 2024`, title `Basal 03:00 to 04:00 · lower`, subline `12
   nights of steady data · 30 d basal run · Next in line`; rail end `Set
   aside`, `Stage change`. Figure 1: the shipped basal chart, `Delivered vs
   programmed · nights at or above each rate · one step per night`, `03:00–
   04:00 · 0 excluded`. Figure 2: `NIGHT · Jun 1, 2024 · 03:00 · Ran below ·
   1 of 12`, ↑↓, `Night | Day`. Reading pane `Nights · 12 of 12 nights`:
   `THIS SLOT` (`0.6 → 0.48 U/h`, `Supported · lower`, the served headline,
   the estimate line), `Ran below · 12 nights` and the twelve rows, `SELECTED
   NIGHT` with the shipped occ-nums lines and `Open Day`.
2. Press a night row: Figure 2 follows, the row is pressed, focus stays on
   it. ↓ steps to the next night. `Day` in the rail shows the full served day
   with the slot edges marked; `Night` returns. The title, subline and
   actions do not change.
3. `Open Day` (reading pane) or the shell's Day button: same priority frame
   with the Day seat; Escape returns to Night. The shell's Overview button
   returns to the priority with the same night held.
4. `Stage change` (rail or Changes' empty stage). Changes opens the Plan:
   kicker `PLAN · Staged`, title `Basal 03:00 to 04:00 · 0.6 → 0.48 U/h`,
   subline `3 / 16 segments · Nothing here is sent to your pump.`, rail end
   `Save draft`, `Record decision`. Stage: `Draft not saved. Saving the draft
   preserves consideration.` then the shipped deliverable table (`Start time
   | Basal (U/h) | ISF (mg/dL/U) | I:C (g/U) | Target (mg/dL)`), rows 00:00,
   03:00 (`new break`, `~~0.6~~ 0.48`), 04:00 (`new break`), the retained
   ISF 40, I:C 10, Target 110 on every row. Reading pane `This change ·
   Staged`: `DECISION` (`Draft saved · Not saved`, `Decision recorded · Not
   recorded`), `DETECTED PUMP SETTINGS · Current` (the one served segment).
5. Tick `Next save fails`, press `Save draft`: `Plan save failed: no response
   from the store.` with `Retry`; focus on Retry; the DECISION rows still say
   `Not saved`. `Retry`: `Draft saved Jun 12, 2024 · 12:00. Recording the
   decision preserves what was known then.`; kicker `PLAN · Draft saved`.
6. Overview: the priority leads again (no decision yet), rail end `Staged ·
   Undo`, `Resume draft`; `THIS SLOT` notes `Draft saved Jun 12, 2024 ·
   12:00`. `Resume draft` returns to the Plan.
7. `Record decision`: the rail's actions clear; the shipped pending copy
   (`Pending — program these into your pump. …`); kicker `PLAN · Pending`;
   `DECISION` shows `Decision recorded Jun 12, 2024 · 12:00`, `On pump ·
   Awaiting pump evidence`; `WHAT WAS KNOWN` lists priority, change, support,
   the headline and the illustrative-persistence note. Overview now leads
   with this Plan (recorded intent awaiting pump evidence).
8. Clock `pump captured`, capture `Mis-keyed 0.5 U/h at 03:00`: kicker `PLAN
   · Mismatch`, the shipped mismatch copy and diff table (`03:00 · Basal ·
   0.48 · 0.5`), `Re-key & recheck`. Press it: the shipped flash line, and
   `Re-key asked Jun 13, 2024 · 00:00` under DECISION. `DETECTED PUMP
   SETTINGS · Captured Jun 13, 2024 · 00:00` shows 0.5 at 03:00.
9. Capture `As planned`: kicker `PLAN · On pump`, `✓ On pump as of Jun 13,
   2024 · 00:00 — the pump matches your plan.`; DECISION `On pump · Jun 13,
   2024 · 00:00`.
10. Clock `Trial, 6 of 14 days`: Overview leads with the Trial stage,
    `TRIAL · Maturing`, title `Basal 03:00 · 0.6 → 0.48 U/h`, subline
    `Detected Jun 13, 2024 · 03:00 · 6 of 14 days · 0 data gaps`; `Before /
    Trial` table with roles and denominators (`no meals in period` on the arc
    rows), `Available days`. Reading pane: `EVIDENCE ACCRUED` with the served
    readiness and focus messages (`Focus is unavailable while a Trial is
    live. …`), `DECISION` (recorded, on pump), `WHAT CHANGED` with `Observed
    on the pump. The decision was recorded Jun 12, 2024 · 12:00.`, `LIMITS OF
    THIS READ`. `Inspect nights` opens the priority with `· Maturing Trial
    continues` in the subline and `Return to Trial` at the rail's end; no
    second watch.
11. Clock `Trial, ready to judge`: `TRIAL · Ready to judge`, `15 days
    elapsed`; reading pane adds `CONCLUSION` with the required textarea and
    `Record conclusion & finish` (disabled until words are typed). Type a
    conclusion, submit.
12. Overview: `TRIAL · Finished`, rail `Ending snapshot`, the evidence table;
    reading pane `CONCLUSION` (the wearer's words, `Finished Jun 27, 2024 ·
    03:00`, `Original priority · Basal 03:00 to 04:00 · lower`), `DECISION`,
    `WHAT WAS KNOWN`, `EVIDENCE PERIODS`, `WHAT CHANGED`. Explore, Day and
    Changes keep this record on return.
13. Reload (memory cleared), Overview `Set aside`: the reason form in the
    reading pane; submit. Overview: `Set aside` stage with the reason,
    `Revisit nights`, `Return to Overview`, and the review-control note
    naming the other fixture patient under `Source`.
14. Narrow 390×624: the stage alone with seat control `Basal · Night · Day`
    and the night button opening the sheet (`Nights` pane, `Close` focused).
    The Plan and Trial stages open their panes from `This change ▾` / `This
    trial ▾`. Escape closes the sheet, then returns Day/Night to Basal.

## Copy provenance (3c additions)

Served or already-shipped, used verbatim:

* `Basal 03:00 to 04:00 · lower`, headline, `nights of steady data`, `12`,
  `30`: the served finding. `Next in line`, `Worth a look`: shipped `TIER`.
* `Ran above`, `Ran below`, `Ran as set`, `No programmed rate`; the occ-nums
  lines `… U/h delivered · … U/h programmed`, `… this night · … roster mean`,
  `… entry · … exit`; `Supported`; `Stage change`, `Staged · Undo`;
  `Delivered vs programmed`, `nights at or above each rate · one step per
  night`: the shipped Diagnose workstation and basal chart.
* `Accepted changes` (not used; the kicker is `Plan`), `N / 16 segments`,
  `Nothing here is sent to your pump.`, the deliverable heads, `new break`,
  the pending, confirmed and mismatch sentences, the diff heads, `Re-key &
  recheck`, the re-key flash, `Plan save failed: `: shipped Plan copy
  (`frontend/index.html`).
* `Close`: shipped dialog control.
* `Saving the draft preserves consideration.`, `Recording the decision
  preserves what was known then.`, `Detected pump settings`: journeys.md.
* `Set aside`, `Conclusion`, `Record conclusion & finish`: approved by the
  order. `Basal`, `Correction factor`, `Carb ratio`: CONTEXT.md.

New copy, not yet approved, flagged for a language decision:

* `Save draft`, `Record decision` (the two Plan actions; journeys.md names
  the acts, not the buttons).
* `Draft saved`, `Draft not saved`, `Decision recorded`, `Not recorded`,
  `Awaiting pump evidence`, `Re-key asked`, `On pump` as a row label,
  `Staged`, `Pending`, `Mismatch`, `Save failed` (Plan kicker states),
  `What was known`, `Original priority`, `Ending snapshot`, `Finished`.
* `no response from the store.` (the manufactured failure reason after the
  shipped `Plan save failed: ` prefix).
* `Detected schedule. The proposed schedule is the Plan beside it.`,
  `Captured`, `Current`, `Deliverable`, `pump-ready schedule`.
* `Illustrative: v2 proposes keeping this snapshot with the decision. The
  current capture does not persist it.`
* `Observed on the pump. The decision was recorded …`, `Observed on the pump.
  No earlier Plan decision was recorded; Harmonic first saw this change at
  detection.` (journeys.md's rule in a sentence).
* `Open Changes`, `Resume draft`, `Inspect nights`, `Revisit nights`,
  `Return to Trial`, `Retry`; `Night`, `Basal` (seat and figure names);
  `Nights`, `This slot`, `Selected night`, `This change`, `Plan`.
* `No change underway`, `… is supported and can be staged.`, `The nights
  remain available in Explore.`; the review-control note under set aside.
* `Trial continues`; `Profile change · N settings`; `not recorded` (a change
  with no before value); `no meals`, `no meals in period`, `readings`, `entries`.
* `Estimate … U/h, … to … · … nights · … in the asserted direction`.
* Mock bar only: `Source`, `Late bolus · May meals case`, `Basal 03:00 · June
  setting case`, `Clock`, the station labels, `Pump capture`, `As planned`,
  `Mis-keyed 0.5 U/h at 03:00`, `Next save fails`.

## Limits

* Round 3c is unrendered; `node --check` passed on both scripts.
* The served finding spans two analyzer slots (180–240); the figures and the
  nights list read slot 6 (`03:00`), which carries the roster. The Plan reads
  both accepted items, so the schedule shows 03:00 and 04:00 breaks.
* No served basal support floor is in `setting.json` (only the API adds
  `_MIN_SUPPORTED_NIGHTS`), so the shipped envelope canvas is not used: it
  would print `INSUFFICIENT SAMPLE` over supported evidence, and hardcoding
  the floor in the frontend is the exact bug the safety invariants forbid.
* The night figure is the two-track Day builder, not the five desktop tracks.
* `Accept pump values` and the re-baseline step are not walked (above).
* Page memory only. Nothing persists, and the failure is one manufactured
  save failure with an ordinary Retry, not a recovery subsystem.
* Set aside cannot show a next supported priority for this patient; none is
  invented, and the other fixture is offered only as a labelled review control.

## Producer inputs needed

* A served support floor beside the basal night evidence, so the shipped
  envelope canvas can seat here without a frontend floor.
* A served display label for an investigation whose lever has no eligible
  action (the meals case now shows the queue tier only).
* Served steps with evidence text separated from action text.
* A Plan decision and its snapshot joined to the Trial record, so `What was
  known` can be served rather than held in page memory.
* A next-priority policy result, so set aside can offer a real next candidate
  from one engine rather than a review control.
* A habit Focus record with its own progress fields, for the habit journey.


## Coordinator status after the provider stopped

The follow-up session saved setting corrections but ended at its provider session
limit before authoring the Focus surface. The parent verified its process group
had exited, rendered the saved result, and recorded findings in REVIEW.md and
AUDIT.md. The parent completed the already-authored half-hour control's missing
handler and made the stage beneath the narrow reading pane unfocusable; it did
not redesign the composition. The Focus/preemption input is generator-owned and
ready for continuation. This note is the coordinator's status record, not a
Fable completion claim or a visual lock.

## The habit journey (3d)

Unrendered. `node --check` passes on the three scripts, and a Node smoke run
of `createFocusJourney` against `focus.json` with a stub kit produced every
frame at every clock and destination, pinned, resolved and read the record
without throwing. Nothing in 3d is claimed as seen.

`harmonic-v2-glucose-focus.js` owns the May habit case (`source=focus`) and
borrows the desk, nameplate, reading header, sheet toggle, empty frame, Trial
stage, progress and detected-settings sections and the conclusion form from
the main script. The generator's `focus.json` supplies every count, rate,
window, status and time; the main script's `bundle()` hands the case file,
episodes and selections to the shared investigation frame, so Explore and Day
for this patient are the same shipped comparison and Day builders the meals
case uses. No chart is hand-drawn.

Decisions:

* **The action is the source pattern's own, and it is not a global ranking.**
  The reading pane's `Action` section prints the served queue tier and
  priority (`Worth a look · priority 28`), the shipped scenario panel's rate
  line (`~33% of lows`, `2 of 6 · typical severity (effect) 0.55`), the
  pattern's recommendation verbatim, and the shipped confidence row
  (`Recurrence rate 33.3% [14.8–59.1%] · Wide CI`). Nothing certifies it above
  the other two patients; the mock bar's Source control is the only way
  between them, and set aside says so as a review note, not product prose.
* **Focus is the wearer's decision, at the served pin time.** `Start Focus`
  sits in the nameplate's end beside `Set aside`. The source stores a pin
  time and a status, so the pin lands at `focus.pinned_at` and the served row
  is what later clocks read. The decision snapshot (`What was known`) is the
  served action as it stood, held in page memory and disclosed in the mock
  bar memo.
* **One-active-watch.** Once pinned the nameplate reads `Focus continues`
  with `Return to Focus`; Overview and Changes both lead with the Focus stage
  until it ends. `Start Focus` never appears while a Focus or Trial exists.
* **Follow-up compares behavior per eligible opportunity, then glucose,
  never as one figure.** The Focus stage is the Trial's table stage. Windows
  are columns headed `May 16 to May 30` with `CGM NN%` under each. The first
  table, `Observed behavior`, has one row (`attributed of lows · Inferred`)
  whose cells read `2 of 6` over `33.3% attributed`, or `no lows` over
  `unavailable` for a 0/0 window. The second, `Glucose outcomes`, prints the
  served metric titles with their ranges and units, marks the served
  `target_metric` row `· target`, prints `no readings` for a null, and ends
  with `Nights with a low` as `1 of 14` over its rate or `no nights ·
  unavailable`. Windows are the producer's fixed 14-day windows ending at the
  data tail; the rail says `Fixed 14-day windows · latest ends …` and nothing
  says "since Focus started".
* **No maturity or readiness gate.** The Focus reading pane holds the pinned
  time, the watched metric's served title, the window count, and the
  conclusion form (`Record conclusion & resolve`). Resolving is available at
  any clock once pinned.
* **Resolution keeps the ending snapshot.** A resolved Focus leads Overview
  with the wearer's conclusion (`Focus resolved`, `View Focus record`,
  `Inspect lows`); Changes shows the record: the stage tables as read at
  resolution (`Ending snapshot · … · read …`), the conclusion, `Resolved <time>
  · by you`, the served `resolved` status, and `What was known`.
* **Preemption is an alternative ending, never combined with resolution.**
  At the `preempted` clock the served Trial (correction factor 40 → 45,
  `Maturing`, 0/14, 2 gaps) leads through the shared Trial stage. Its reading
  pane adds `Focus ended`: the Focus title, served `Dropped` status, pin
  time, `Reason: Preempted by this Trial`, `Seen: <review time> review`, and
  `View Focus record`. That record (Changes) shows the last available read,
  `Conclusion: Not recorded`, the served `Focus is unavailable while a Trial
  is live…` sentence, and `What was known`. No control re-pins or resumes.
  A conclusion recorded at an earlier clock is not shown at `preempted`; the
  two endings are separate branches of the review clock, not one history.
* **Saves fail ordinarily.** `Next save fails` makes the next pin or resolve
  print `Focus save failed: no response from the store.` with `Retry` beside
  the form or the action; the form keeps its text and focus moves to Retry.

Interaction walk (`?source=focus&clock=before|following|preempted`; the mock
bar's Clock control sets the same parameter):

1. `before` (May 30 12:00, deciding). Overview is the investigation: Figure 1
   the served lows comparison, cohorts (`Matched`, `Nearly matched`, `Other
   eligible`) and members in the reading pane under `Lows`, the `Action`
   section first. Selecting a member holds its episode on the spine; `Day`
   opens the member's day; `Back` and Escape return as in the meals case.
   Nameplate end: `Set aside`, `Start Focus`. Changes: `No change underway ·
   Over-treated low is supported and can be a Focus · Start Focus`.
   `Set aside` asks an optional reason, then Overview reads `Set aside` with
   the reason, `Revisit lows`, `Return to Overview`, and the review note.
   `Start Focus` pins at the served time and lands on the Focus stage:
   kicker `Focus · Active`, subline `Pinned May 30, 2024 · 12:00 · 2 of 6 lows
   May 16 to May 30, 2024`, the two tables for the three `before` windows, the
   reading pane `This Focus`. With `Next save fails` checked, `Start Focus`
   instead shows the error and Retry in the `Action` section (the sheet opens
   on narrow so Retry is reachable).
2. `following` (Jun 29 12:00). The Focus is served active: Overview and
   Changes lead with the Focus stage over the five `following` windows
   (`0/0 · 0/0 · 2 of 6 · 0/0 · 2 of 6` behavior; glucose per window; CGM per
   window). `Inspect lows` opens the same May investigation with `Focus
   continues` and `Return to Focus` in the nameplate. Typing a conclusion
   enables `Record conclusion & resolve`; submitting resolves at Jun 29 12:00
   and returns to Overview (`Focus resolved` with the conclusion); Changes
   shows the record. A failed save keeps the form with the error and Retry.
3. `preempted` (Jul 1 12:00). Overview and Changes lead with the served
   Trial; `Focus ended` sits under progress; `View Focus record` opens the
   dropped record on Changes (`Back to Trial` returns). Navigating elsewhere
   clears the record view; Overview always returns to the Trial. Changing the
   clock back to `following` shows the Focus active again, because the
   preemption is the alternative branch, not a later state of the same one.
4. Narrow (≤700px): the Focus stage keeps one table body under the rail; the
   reading pane is the sheet from `This Focus` in the rail; the stage is
   inert beneath the open sheet (parent's fix, preserved); the mock bar is
   hidden, so the clock is the URL parameter.

Copy provenance (3d):

* Served verbatim: the Focus title, statuses (`active`, `resolved`,
  `dropped` as `Active`, `Resolved`, `Dropped`), pin time, review times,
  `window_days`, window bounds and `cgm_active`, behavior counts and
  `problem_rate`, the metric titles (`Time in range`, `Time below range`,
  `Mean glucose`, `Glucose variability (CV)`), ranges and units, `Nights with
  a low` and its threshold, the recommendation sentence, priority, tier,
  confidence fields, the Trial's title fields, readiness label and message,
  limits and `Focus is unavailable while a Trial is live. It will not queue
  behind this change.`
* Shipped: `~N% of lows (k of n)` and `Recurrence rate N% [lo–hi%]`, `times
  it happened`, `typical severity (effect)` (index.html scenario panel via
  `scnRateLine`); `Worth a look` (`TIER`); `Wide CI` (glossary); `Nothing here
  is sent to your pump.`; `Close`; the failure prefix pattern `… save failed:
  ` (Plan).
* journeys.md / CONTEXT.md: `Focus`, `Trial`, `Inferred`, adherence separate
  from outcome, `neither an empty denominator nor missing observations become
  success` (rendered as `unavailable`), `Observed on the pump. No earlier Plan
  decision was recorded…` (3c), `What was known`, `Ending snapshot` (3c).
* New, flagged for a language decision: `Start Focus`, `Return to Focus`,
  `Focus continues`, `Focus resolved`, `Focus ended`, `View Focus record`,
  `Back to Trial`, `Inspect lows`, `Revisit lows`, `This Focus`, `Record
  conclusion & resolve`, `Resolving ends the Focus.`, `Observed behavior`,
  `Glucose outcomes`, `attributed of lows`, `attributed`, `no lows`, `no
  nights`, `no readings`, `unavailable`, `Watching`, `Windows`, `days, fixed`,
  `available`, `A window with no lows has nothing to compare.`, `Preempted by
  …`, `Seen`, `Not recorded`, `by you`, `Reason`, `Ending`, `Last available
  read`, `Fixed N-day windows · latest ends`, `Pump-local time`, `… is
  supported and can be a Focus.`, `The lows remain available in Explore.`,
  `Focus pinned …`, `Lows` (reading pane name), `Focus save failed: no
  response from the store.` Mock bar only: `Over-treated low · May habit case`,
  the clock labels, `Next save fails`, the memo sentence.

Limits (3d):

* Unrendered; the smoke run is a Node stub, not a browser.
* The follow-up has no June case file, so per-member follow-up episodes are
  not selectable; the investigation stays the May capture and the trend is
  window-level, as the producer serves it.
* No shipped builder draws a windowed Focus trend (`verify-workstation-chart`
  needs Trial envelope pairs), so the follow-up is tables, not a chart.
* `focus.json` `episode_ids` is empty: the generator links an episode only
  when `episode.start == anchor.t`, and a low's anchor is its nadir. The main
  script's `episodeId()` stands in with a containment join (same lever,
  `start <= anchor.t <= end`) for both sources; disclosed here, not in
  product prose.
* The conclusion, ending time, ending snapshot and decision snapshot are page
  memory (mock bar memo). Set aside is page memory too and offers no next
  priority for this patient.
* `Watching` prints the served `target_metric` title; nothing in the client
  chooses or reclassifies a metric.

Producer inputs needed (3d):

* Link episodes by containment (`episode.start <= anchor.t <= episode.end`,
  same lever) in `generate.py`, so `episode_ids` is served for lows and the
  client join goes.
* A served Focus conclusion and `ended_at` (and the decision snapshot), so
  the record is stored rather than page memory.
* A follow-up case file for the `following` window, so members can be
  selected at the follow-up clock.
* A next-priority result across this patient's own findings, so set aside can
  offer a real next candidate.

Inherited pending fixes: none of #350 (Diagnose QA sweep) or #380 (Vite
build) is duplicated or cherry-picked here; the shipped modules this
prototype imports are used as they are on this branch.

## Round 4: the reviewed corrections and the shared history

Unrendered by this session. `node --check` passes on the four scripts. A Node
smoke of `createSharedJourney` against `journey.json` with stub branches and a
stub desk ran 35 checks of routing, page memory and copy, and a second smoke of
`createFocusJourney` against `focus.json` ran 17 (listed under verification
below); both were deleted before hand-back and drove no browser.
Nothing in round 4 is claimed as seen. The parent renders `?source=journey`
and `?source=focus` at 1280×720 and 390×624 on the synthetic preview (8772).

Files: `harmonic-v2-glucose-journey.js` (new; the shared history's controller),
`harmonic-v2-glucose.js`, `-setting.js`, `-focus.js`, `harmonic-v2-glucose.css`.
The meals selectors and composition are untouched. New rules are scoped to a
round-4 class (`gf-stage-focus`, `gf-stage-trial`, `gf-fig-focus`,
`gf-fig-trial`, `gf-detail`, `gf-roster*`) or to `[data-source="journey"]`,
with four shared additions that touch the meals desk: `.gf .instrument
{min-width:0}` (instruments may shrink), `.gf-windows th[scope="row"]` (row
heads in the windows table, unused by meals), `.gf-review label:has(input)`
and `.gf-review-memo` (mock bar only).

### The reviewed findings

* **Narrow reading control (A).** Every stage's reading control is the
  instruments row's own tool (`This Focus ▾`, `Nights ▾`, `Lows ▾`), never a
  rail button, and each instrument shrinks (`min-width:0`) so the row cannot
  push it past 390px. The Focus stage at narrow is one seat switched by
  `Progress` / `Windows`: the figure, or a windows table with the latest
  window first and only the behavior, target and time-in-range columns. The
  Trial stage at narrow seats the hero or its table the same way.
* **Retry admits like submit (B).** The failed resolve's `Retry` is a submit
  control of the conclusion form (`type="submit" form="finish-form"`),
  disabled while the conclusion is blank; the form's own handler is the only
  path in. A failed pin has no form, so its Retry repeats the pin.
* **The ending assessment is frozen whole (C).** Resolving stores the trend
  as read (`structuredClone`) and its read time; the record's stage reads only
  that snapshot — the nameplate's latest window, the figure, both tables and
  the rail (`Ending snapshot · … · read …`). No part of a record reads live
  data, at any later clock.
* **The action leads the active Focus (D).** The `Action` section reads: the
  pattern's recommendation verbatim, `k of n lows` with its window, the
  source's headline, then a `Source detail` disclosure holding priority,
  recurrence with its interval, severity (effect) and confidence. On the
  Focus stage the reading pane leads with the latest window's `k of n lows`
  and the target metric beside time in range, then the conclusion form.
* **A tier is a rank, not support (E).** `Changes` for an unpinned concern
  reads `<title> · Worth a look. <served headline>` and offers `Inspect
  lows`; the sentence `… is supported and can be a Focus` is gone. Priority
  prints only inside `Source detail`, never as a consequence figure.
* **A missing value reads against its population (F).** The Trial evidence
  table prints `unavailable` for a null metric with a nonzero count and `no
  meals` (or `no readings`) only when the count is zero; the meal count and
  the period's own `no meals in period` are separate cells.
* **The temporary containment join is removed.** The generator now serves
  `episode_ids` for the matched lows (`ep-000`, `ep-001` at the initial read,
  their own June identities later), so `episode()` reads the served link only;
  a member with no link has no episode, and the figure and seat fall back to
  Day and the comparison as they already did.
* **Asserting basal slots stay explorable.** Whichever concern leads
  Overview, the basal row in Explore opens the setting journey's own stage:
  the shipped basal chart over the held night, the nights list and its Day
  path, with `Set aside` or `Restore` in the nameplate. That holds at the
  original read; later reads serve no nights for it (limits below). No
  increase example was added.

### The Focus progress figure

`progressOption` (focus.js) draws three tracks on one date axis with the
shipped ECharts build: `attributed of lows in window` (an ink box for the
attributed count over a soft box for the lows in the window, so the
denominator is on the plot), the served `target_metric` (`Time below range`,
the Focus's watched outcome), and `Time in range`. Each served fixed window is
a box spanning its own dates with its reading printed in it; a window with no
lows or no readings is a dashed outline saying so; nothing joins the boxes,
so no line implies an observation between them; the pin is a dashed date
line. The key names each mark. The behavior track and the two glucose tracks
are separate tracks with separate axes, never one score. No maturity or
success gate reads the figure.

### The Trial comparison

`trialStage` (main) seats the shipped `heroOption` from
`frontend/verify-workstation-chart.js` over the served Trial's own envelopes,
bound as `verify-workstation.js` binds them (`envelopePairs` on
`days.before_period` / `days.trial_period`). A Trial with no Trial-side
readings pairs nothing: the cap reads `Before only`, the key names only the
Before line, and nothing calls it a comparison.

### The shared history (`?source=journey`)

`createSharedJourney` owns Overview, Explore and Changes for `journey.json`
and delegates a branch's own stages to `createSettingJourney` and
`createFocusJourney`, each created without its own review controls and with
the shared gate. Decisions:

* **The roster is the served queue.** Explore's reading pane is
  `queueRows` (the shipped findings-queue projection) over the read's
  `source_findings`: rank numeral, title, one detail line (`now → then`,
  `28 nights of steady data · 30 d run`, `2 of 6 lows`), the tier word; the
  `Worth a look` caption where the tier changes and the shipped tail note
  before the unranked row. Nothing re-ranks.
* **One concern leads Overview.** The first ranked concern not set aside is
  the priority; a branch that is staged, live or pinned leads instead. The
  basal concern leads at the original read with its own nights (the setting
  journey's priority stage); the over-treated-low concern leads through the
  habit journey's action hook; `correction_on_iob` (tier `noted`, no rank) is a
  guided look — the served headline, the tail note, and `A guided look opens
  the lows this showed up in. It does not start a Focus.` — with no aside and
  no Start Focus. It never leads.
* **A concern the read ranks but serves no bundle for is roster-only.** The
  stage lists the row's own facts (slots with now / recommended / nights, or
  the lows with time and verdict) and says the nights or case file are not in
  the capture. Nothing is drawn from a row.
* **Set aside moves to the next concern.** The optional reason and the clock
  stamp go to page memory; Overview reads the next ranked concern; Explore
  lists `Set aside · n` beneath the roster with the reason and `Restore`. A
  set-aside the current read no longer carries stays listed as `not in this
  read` with its Restore, so restore is always reachable. Set-asides survive
  the clock (ordinary new data keeps them aside).
* **One change at a time.** While the basal change is staged or on Trial the
  habit concern's hook reads `Trial continues` with the served `Focus is
  unavailable while a Trial is live. It will not queue behind this change.`;
  while the Focus is pinned the basal concern reads `Focus continues` with
  `One change at a time. The Focus continues; a setting change cannot stage
  beside it.` Set aside stays available under either.
* **Both branches start from the shared original context.** The original
  clock is the decision point for both; a branch clock serves that branch's
  later reads and sets the other branch back to `before`. The alternative
  first choice is never shown as a second action with the original's start
  date: the Focus at `following` is pinned at the served `2024-06-02 12:00`,
  and the basal Trial at `ready` began at its served capture.
* **A conclusion returns to the next concern and keeps the record.** After
  `Trial finished` or `Focus resolved`, Overview reads the next ranked concern
  from the current read, Changes keeps the branch's record (original decision,
  `What was known`, ending snapshot, conclusion), and the roster marks the
  finished row. A second sequential action is held: `A second action on this
  history needs a current read and its own decision. This read is from …; the
  capture holds no decision after the first, so nothing stages here.` That
  proposed contract is disclosed in the review record, not enforced by a
  frontend rule.
* **Reads fail ordinarily.** `Next read fails` makes the next clock change or
  Retry fail: Overview reads `Current read failed` with the last read that
  answered (`… from <stamp> · n findings. Nothing here changed.`) and `Retry`;
  Explore keeps the last roster with `The current read failed. This is the
  last read that answered.` and Retry; page memory is untouched. `Next save
  fails` reaches both branches and clears through whichever branch consumed
  it.

Interaction walk (`?source=journey&clock=<key>`; the mock bar's `Clock`
control sets the parameter and every branch station):

1. `original` (read Jun 1 23:59; clock Jun 2 12:00). Overview: the basal
   concern's priority stage over its own nights, `Set aside` in the nameplate,
   `Nights` reading pane with the Action section (`28 nights of steady data`,
   `30 d basal run`). Explore: the roster (1 basal, 2 over-treated low, tail
   note, · correction on active insulin), each row opening its concern; the
   habit row opens the shared investigation with the habit hook; the tail row
   opens the roster-only lows list with the guided look. Changes: the setting
   journey's staging. Set aside on the basal concern → Overview reads the
   habit concern with `Set aside`, `Start Focus`; Explore lists the aside with
   its reason and Restore; Changes reads `No change underway · Over-treated
   low · Worth a look …` with `Inspect lows`.
2. `captured` / `trial` (Jun 3 00:00, Jun 8 12:00; read Jun 1). The setting
   branch's own stations lead Overview and Changes as in 3c; the habit concern
   in Explore reads `Trial continues` with the served one-watch sentence.
3. `ready` (Jun 18 12:00; read Jun 18 23:55). The Trial is ready; the habit
   row reads the current evidence bundle. Recording a conclusion returns
   Overview to the habit concern, held by the sequential-action note; Changes
   keeps `Trial finished`; the roster marks the basal row `Trial finished`.
4. `following` (Jul 2 12:00; read stands in). The Focus stage leads Overview
   and Changes with the progress figure over five windows; the basal row in
   Explore is roster-only (`Slots in this read`) because the following read
   serves no nights for it; the roster note discloses the stand-in read time.
5. `preempted` (Jul 4 12:00). The served correction-factor Trial leads with
   `Focus ended` beneath, as in 3d.
6. `Next read fails`, then any clock: the failed frames above; Retry answers.
7. Narrow: the mock bar is hidden, so `source` and `clock` are URL parameters;
   every stage's reading pane is the sheet from its instruments-row control.

Clock map (`journey.json` → controller):

| key | now (branch station) | read | source of the roster |
| --- | --- | --- | --- |
| original | `focus_branch.reviewed_at.before` 2024-06-02 12:00 | `initial` | `initial.source_findings`, `initial.provenance.selected_clock` 2024-06-01 23:59 |
| captured | `setting_branch.detected.captured_at` 2024-06-03 00:00 | `initial` | same |
| trial | `setting_branch.reviewed_at.active` 2024-06-08 12:00 | `initial` | same |
| ready | `setting_branch.reviewed_at.ready` 2024-06-18 12:00 | `current` | `setting_branch.current_evidence` (`read_at` 2024-06-18 23:55) and `finding_evidence` |
| following | `focus_branch.reviewed_at.following` 2024-07-02 12:00 | `following` | `focus_branch.following_evidence` and `finding_evidence`; read time stands in |
| preempted | `focus_branch.preempted.reviewed_at` 2024-07-04 12:00 | `following` | same |

Evidence per concern: `basal:180-240` → the setting journey's own nights at
the initial read only; `finding:over_treated_low` →
`initial.behavioral_evidence`, then `current_evidence` / `following_evidence`;
`finding:correction_on_iob` → the row's own `evidence[]` list (no bundle is
served).

Copy provenance (round 4):

* Served verbatim: every title, headline, tier, count, noun, run, time and
  the Trial focus message; `Time below range`, `Time in range` and their
  ranges; `Pinned` time.
* Shipped: `queueRows` rows, `TIER` (`Next in line`, `Worth a look`),
  `TAIL_NOTE` (`Not recurring often enough to rank yet.`), the Verify hero,
  the Day legend shape, `Retry`, `Close`.
* New, flagged for a language decision: `Source detail`, `Progress`,
  `Windows`, `Before only`, `Before → Trial`, `median glucose by clock`,
  `attributed of lows in window`, `lows in window`, `pinned`, `unavailable`
  (key marks), `Findings` (reading pane name), `Guided look`, `A guided look
  opens the lows this showed up in. It does not start a Focus.`, `Noted`,
  `Set aside · n`, `Restore`, `not in this read`, `Trial continues`, `Focus
  continues`, `Trial finished`, `Focus resolved` (roster status words),
  `Slots in this read`, `Appearances in this read`, `Inspect nights`, `No
  priority needs action`, `n set aside`, `n noted, not ranked`, `Open
  Explore`, `Open Day`, `Current read failed`, `The last read that answered is
  from … Nothing here changed.`, `The current read failed. This is the last
  read that answered.`, `Nothing is ranked for action in this read.`, `The
  current read failed; nothing is ranked for action from the last read.`, the
  two one-change sentences, the sequential-action sentence, `The nights
  behind this read are not in the capture; staging waits on them.`, `… the
  original read's nights open from the shared clock.`, `No case file is
  served for this finding at this read; its lows are listed as the read names
  them.`, `Staging waits on this read's nights, which the capture does not
  serve.`, `The follow-up review time stands in for this read: the capture
  serves no read time for it.` Mock bar only: `Shared May 2024 history ·
  complete workflow`, `Shared context` / `Setting branch` / `Focus branch`,
  `Clock`, `Next save fails`, `Next read fails`, the memo sentence.

Verification this session could run (Node only): syntax on the four scripts;
the smoke's 35 checks — original Overview is the setting priority frame;
roster ranks 1, 2 and a tail with the tail note before the guided row and the
`Worth a look` caption; the guided concern is roster-only with no Start Focus
and no aside; aside → the habit leads with `initial.behavioral_evidence`
through the focus hook; the aside group lists reason and Restore; Changes →
the focus Changes frame; `ready` → the setting Overview; the aside persists;
the Jun 18 read; the habit at `ready` reads `current_evidence`; the one-watch
gate carries the served message; finish → the record in Changes and the next
concern held with the sequential note; `following` → the focus Overview with
the setting station back at `before`; the stand-in read note; the basal row
roster-only at `following` with Restore; the failed read frame with the last
stamp and the control cleared; the stale roster with Retry; Retry answers;
Restore → the setting concern leads; the save-fail control reaches both
branches and clears. The Focus smoke: the action leads with the
recommendation and priority appears only inside `Source detail`; Changes
before the pin prints the tier with no support claim; a failed pin offers
`retry-pin` and the retry pins; the stage seats the figure over both tables
with the `This Focus` control in the instruments row; narrow seats one of
`Progress` / `Windows`; a failed resolve keeps the form with Retry as a
submit control, disabled while the conclusion is blank; the record's rail
reads `Ending snapshot`; the record heading is byte-identical after the clock
moves; the exact finding-C reproduction (resolve at `before`, open history,
move to `following`) keeps `05-16 to 2024-05-30`; `preempted` leads with the
Trial and `Focus ended`.

Not verifiable here, for the parent: browser rendering at 1280×720 and
390×624 on 8772 (Chromium cannot launch in this sandbox); the progress
figure's fit in its 270px seat (three 50px tracks with 22px gaps and the key);
the Trial hero's fit in 220px; the roster row wrap at 390px; the sheet
opener's position at 390×624 on the Focus, Trial and roster-only stages;
keyboard order through the roster and the aside group; console cleanliness.

Limits (round 4):

* No lock, critique or visual approval is claimed; the CSS was written
  unrendered against the existing stage grid.
* The shared history's set-asides, staged change, pin, conclusion and endings
  are page memory (mock bar memo); nothing persists across a reload.
* The sequential-action hold is a proposed contract shown in the review record;
  the capture holds no second decision, so the prototype cannot show one.
* `following` has no served read time; the follow-up review time stands in
  and the roster says so.
* At `ready` the current read (`2024-06-18 23:55`) is later than the ready
  clock (`12:00`); the roster prints the read time as served.
* The basal concern's nights are served only for the initial read; at later
  reads the row is roster-only.
* The Focus figure and the Trial hero are unrendered; their seat heights are
  arithmetic on `FIG` and the shipped hero's geometry, not measurement.

Producer inputs needed (round 4):

* `focus_branch.following_evidence.read_at`, so the following read carries its
  own time.
* `initial.finding_evidence["finding:correction_on_iob"]` (or a served
  statement that no case file exists), so the guided look can open the served
  lows rather than the row's own list.
* A `current_evidence.read_at` at or before `reviewed_at.ready`, or a served
  read for the ready clock itself.
* Basal night evidence for the current and following reads, so the basal
  concern stays inspectable after the Trial.
* A served second-action policy (what a new intent needs after a conclusion),
  so the hold reads a contract rather than a review note.

### The desktop pass: Day, every basal slot, the retained utilities

Owned files after this pass: `mockups/harmonic-v2-glucose.html`,
`harmonic-v2-glucose.css`, `harmonic-v2-glucose.js`,
`harmonic-v2-glucose-setting.js`, `harmonic-v2-glucose-focus.js`,
`harmonic-v2-glucose-journey.js`, `harmonic-v2-glucose-day.js`,
`harmonic-v2-glucose-basal.js`, `harmonic-v2-glucose-utilities.js`, and this
record with `BRIEF.md`. Read only, Terra's: `generate.py`, `focus.json`,
`journey.json`, `utilities.json`, `glossary.js`. Parent's: `_shell.js`, the
theme files, the review wrapper and planning documents.

**Day (`harmonic-v2-glucose-day.js`).** One desk over every source's own
recorded days: the meals case file's days at the window it was read over, a
journey's at its clock (`dayset()` per source). The stage is the shipped
five-track day (`chart-builders.buildLanesOption`, `LANE_SPAN`) with the
shipped Episode Log (`day-chart.buildEpisodeLedger`, `buildRows`, `dayStats`,
`KIND_GLYPH` / `KIND_LABEL`) in the reading pane; the week ribbon and month
cells use `nav-chart` geometry (`weekOf`, `monthOf`, `monthCells`,
`sparkGeom`, `weekRibbonGeom`, `navSeverity`, `navDaySummary`) and
`daily-nav` bounds (`coldArrivalDay`, `clampDay`); the narrow seat is the
shipped two-track hero (`day-hero-chart.buildHeroOption`, `HERO`). The latest
recorded day opens first, never this machine's date. A direct entry (topbar
Day, a frame's plain Open Day) holds no subject; a contextual entry (Open
<date> from an occurrence, a night, a carb entry or a carb question) keeps
its subject under `Opened from` with `Return to <destination>`. A date the
current clock has not recorded yet moves to the nearest recorded day and the
pane says so. Manual carb entries logged in this page mark the day as the
shipped builder's manual carb points. Click path: topbar `Day` → `‹` `›`
`Latest` (recorded days) → `Month ▾` opens the month in place (`‹` `›` by
month, a cell picks its day, `Week ▴` closes) → a log row or a chart mark
holds a moment (`aria-pressed`); Escape drops the month, then the moment.

**Every basal slot (`harmonic-v2-glucose-basal.js`).** Explore's roster ends
with `Every slot · All basal slots` (`journey.json
initial.basal_exploration`, the original read's 48 slots and their nights);
the stage seats the shipped lane (`diagnose-workstation-chart.buildSlotLane`
markup, one cell per slot with the backend verdict) over the shipped slot
inspector (`diagnose-workstation.renderSlotLevel`) with the served night
evidence, and the figure seat shows the shipped basal evidence chart or the
held night's Night / Day figure. Nothing here derives a floor, a direction
or a number: a cell stages only where the source asserts a move, through the
setting journey's one staging, so Explore, Changes and the lane read one
change. Click path: Explore → `All basal slots` → a lane cell or `←` `→` →
a night row or `↑` `↓` → `Night` / `Day` figure → the night's `Open <date>`
into Day and `Return to Explore` → `Stage change` on 03:00 or 03:30 opens
Changes; the lane marks the staged cells; `Undo` from the inspector foot
unstages. The one-change gate and a change past staging replace the foot's
stage button with the reason and `Open Changes`.

**The display fix.** After `Stage change`, Explore's setting row read `TRIAL`
before any Trial existed. The row now reads the setting journey's `phase()`
(`Staged`, `Draft saved`, `Pending` / `On pump` / `Mismatch`, `Save failed`,
`Trial`, `Trial ready`, `Trial finished`), the same word the Plan nameplate
shows, so Explore never names a Trial before one runs.

**The retained utilities (`harmonic-v2-glucose-utilities.js`).** One pane
for six jobs, seated in the reading pane's place on whichever frame is up
(a frame with no desk gets one), so the destination, its stage and its
comparison stay underneath; on the narrow desk the pane is the sheet. The
footer's Guide / Settings / Glossary and the topbar's Log carbs open it from
every destination; the footer gains a `Carb questions · n` control (the v2
shell has no slot for it, so it is inserted beside Guide); Changes gains
`Pump settings` in its stage header; under 700px the desk carries a five-way
strip at 44px (the shell hides its footer utilities under 760px and Log carbs
under 700px). `Close` returns focus to the control that opened the pane;
Escape steps a Guide article back to its index, then closes the pane, before
the desk's own Escape chain. A destination change keeps the pane on the
desktop desk and closes it on the narrow one.

* Source bindings. `utilities.json`: `glossary`, `guide.articles` (the four
  source KB files' markdown, rendered by `kb.renderMarkdown`),
  `guide.catalog` (`/api/catalog`: engine, pipeline, tiers, silence reasons,
  levers, the worked example). Per source, `utilityContext()` gives the
  clock, the served questions, the detected profile and recorded changes:
  the shared journey reads `initial.utilities` at the original clock,
  `setting_branch.utilities_by_clock` (captured / active_trial / ready_trial)
  and `focus_branch.utilities_by_clock` (before / following / preempted); the
  setting and habit sources and the meals case serve no questions and show
  the true empty state. Shipped helpers: `carb-log` (`QUICKLOG_PRESETS`,
  `QUICKLOG_TIMES`, `buildCarbPayload`, `isLoggable`, `carbToast`),
  `prompt-queue` (`sortOldestFirst`, `detectorKicker`, `answerLabel`,
  `answerToSource`, `buildSparklineOption`), `kb` (`AUTHORED`, `GENERATED`,
  `CATEGORIES`, `articleBySlug`), `guide` (`guideGroups`, `guideTierLabel`,
  `guideMd`, `guideWorkedRows`), `glossary.js` (`glossaryGroups`).
* App settings: page-memory form only. API access token (password field,
  Show / Hide, `Save token`), Tandem credentials (email, password, region,
  `Save credentials`; the summary reads `Credentials saved in this page · US
  region · <clock>` and never repeats the email or password; the password
  field clears on save), Developer mode. No Fetch now, no connection or sync
  status, no localStorage.
* Pump settings: `Detected on the pump · Captured <date>` with the setting
  journey's captured profile once a capture exists, else the read's active
  profile as `Read <date>`, in the Plan's own table columns, with `detected
  schedule, not the Plan`; the Focus branch's preempted clock adds `Recorded
  changes` (the served ISF 40 → 45 at `changed_at`). A source with no profile
  says so and points to Changes.
* Log carbs: `4 g` / `8 g` / `12 g` each as exact or `~` estimate, another
  amount, `Ate something, don't know how much` (null grams, certainty
  unknown), When = now / the shipped offsets / a custom clock; `Logged in
  this page` lists entries with `Open <date>` into Day and `Remove`. Payload
  and validation are `buildCarbPayload` / `isLoggable`; the wall clock is the
  source's clock, not this machine's.
* Carb questions: the served pending prompts oldest first with the shipped
  kicker, the anchor clock, `n d before the read`, the shipped sparkline, the
  question and context; `Log carbs` (the amount controls in place, the entry
  at the prompt's anchor with the prompt source), `No`, `Not sure`, `Open
  <date>`, and for a low `Not real (sensor noise / compression low)`.
  `Undo` clears the answer and any entry it logged. Answers are page memory
  per source and survive destination changes; at a clock the branch serves
  no questions for, the pane reads `No open questions at this read.`
* Guide: the index by category, then the article; authored articles render
  the served markdown with the meta `Written for the v1 tabs: Diagnose reads
  as Explore here, Plan as Changes.` and their hand-off links as `<text>
  (Explore here)` buttons that navigate; generated articles read the served
  catalog. Glossary: `Correction factor` / `Carb ratio` labels with the v1
  key and unit in small mono as served (`ISF · mg/dL per U — Insulin
  Sensitivity Factor`), the served definitions verbatim.
* Mock bar: `Next utility save fails` (clears itself after one failure; the
  pane keeps the form with `Retry`) and the memo `Utility writes stay in
  this page; the read does not recalculate.`
* Read versus view: each pane's meta prints `read <date> · <clock>` and adds
  `viewed <date>` where the clock differs (the original journey clock reads
  Jun 1 23:59 and views Jun 2 12:00).

Checks this pass could run (Node only; none is browser verification):
`node --check` clean on all seven scripts. `smoke-utilities.mjs`: the mock
control mounts; the journey context serves three questions at the original
clock with the read profile and no changes; all six bodies render with a
Close; the glossary carries `Correction factor` and `Carb ratio` and no
`Sensitivity factor`; Pump settings reads `Detected on the pump` with no
recorded changes at the original clock; questions read `3 of 3 open` and the
strip count 3; settings has no `@`, no Fetch / Connected / Sync; the Plan
article renders as served with one `changes` hand-off and no raw v1 anchor;
Escape steps it back to the index; a preset logs `{grams 8, exact, manual}`
at the source clock; a failed save admits nothing and clears the control;
Retry admits the unknown-amount entry; `No` answers and `Undo` restores;
`Log carbs` at a question stores the entry at the prompt anchor with
`low-prompt` and its Undo removes it; credentials save clears the password
and echoes neither; the meals source sees an empty state while the journey's
memory persists; Close returns focus to the opener; the branch clocks serve
2 / 0 / 3 / 1 questions (captured / active_trial / following / preempted).
`smoke-day.mjs`: every source and clock cold-arrives at its latest recorded
day (journey Jun 1 / Jun 18 / Jul 1, setting Jun 12, focus May 28 / Jun 29,
meals May 28) with its log rows and seven ribbon columns, and an unserved
date moves with the note. `smoke-basal.mjs`: 48 cells, `2 suggest a lower ·
46 no nights of steady data · 30 d basal run`, read Jun 1 23:59 viewed Jun
18 12:00, the basal figure by default, two cells staged after Stage change
with Changes opened.

Not verifiable here, for the parent (Chromium cannot launch in this
sandbox): every render at 1280×720 and 390×624 on 8772; the utility pane's
fit in the 256px reading column and as the sheet; the strip under the sheet
at 390×624; the pump button's place in the Plan header beside Save draft and
Record decision; input styling against the shipped `input, select` rule
(copied verbatim into `.gf-utility`); the question sparkline at 120px;
focus return after Close on the footer, topbar, strip and Pump settings
openers; the Day ribbon and month at both widths; console cleanliness.

Limits and gaps (desktop pass):

* The v2 shell serves no Carb questions slot; the control is inserted at
  runtime beside Guide, and the narrow strip stands in for the footer the
  parent theme hides under 760px.
* Questions and a detected profile are served for the shared journey only;
  the other three sources show true empty states rather than borrowed May
  questions.
* Fetch now is omitted: the prototype makes no live pull and shows no
  connection state. The proposed manual-entry-plus-answer atomic contract
  stays proposed; page memory admits or fails the pair as one write.
* The preempted clock shows the read's profile plus the served recorded
  change, not a manufactured re-captured profile.
* `VERDICT_KEY` / `VERDICT_SHORT` and the lane markup are transcribed from
  `diagnose-workstation.js`, which keeps them private; a per-date model-view
  extract, a clock-aligned case, a pooled envelope and `supportFloor` are
  not served, so the lane reads verdict words only.
* Navigation names stay provisional (Explore versus Diagnose is open); the
  Guide keeps the v1 wording identifiable rather than rewriting it.
* Mobile design is a later phase; the narrow rules here keep the jobs
  reachable, nothing more.
