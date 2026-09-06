# Glucose first, round 3: design lead record (#348)

This preserves the design lead’s round-3c hand-back before the saved corrections.
For current observed behavior and the interrupted follow-up, read [REVIEW.md](REVIEW.md)
and [AUDIT.md](AUDIT.md). The earlier predicted copy and times below are historical.

Author: Claude Fable 5.1, design lead. Files: `mockups/harmonic-v2-glucose.js`,
`mockups/harmonic-v2-glucose-setting.js` (new in 3c), `mockups/harmonic-v2-glucose.css`,
this record, and the round-3 section of `BRIEF.md`. `harmonic-v2-glucose.html` is
unchanged (stylesheet order already seats `frontend/theme.css` last). Unlocked
exploration; no critique or lock is claimed here.

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
