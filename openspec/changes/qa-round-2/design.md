# QA round 2 — design

## ADR 460 — The watch dock and Diagnose's staged marks follow the Plan draft

**Context.** Parts of this record were decided autonomously during AFK run;
they are named in their own section below. The watch dock at the foot of the
Diagnose inspector reports one watched-change object. Two of its three inputs are served: the watched Trial or
Focus, and the recorded Plan awaiting the pump (#431). The third, the staged
Plan draft, is not. The workstation builds it from three sets of marks it keeps
itself, seeded once at boot by asking `callbacks.isStaged` about every basal
lane cell, every carb-ratio block and the correction factor. That answer reads
the Plan surface's page-memory copy of the draft, which fills only when
`loadPlanState()` runs. After boot the marks move only when Diagnose stages or
unstages, and `refresh()` only repaints.

Reproduced in-process on main at e4862000: a cold Diagnose seat whose `/api/plan`
answer lands after the payload reads asks `isStaged` once, at boot, and gets
`false`; at the later refresh the same question answers `true`, but the
workstation never asks it; the callbacks carry no served draft; and the dock
given the served one-item draft and no marks reads `idle`.

The guidance read already serves the store's draft on every call, read directly
rather than from the result cache, and `frontend/guidance.js` exposes it as
`planDraft()`. Changes and the Trial page read it; Diagnose does not.

**Decision.**

1. Diagnose's destination hands the workstation the served draft
   (`planDraft`) through its callbacks, the same way it hands `pendingPlan`.
2. The dock takes two new inputs: the served draft (`draft`) and whether a stage
   save this surface issued is in flight (`saving`). Its precedence is
   unchanged: Trial, Focus, recorded Plan awaiting the pump, staged Plan, idle.
   The staged Plan state reads, in order:
   - this surface's own marks, when they name a staged change. The dock names
     it exactly as it does today, with the served direction and the values the
     surface's descriptor carries;
   - otherwise, when `saving` is false and the served draft holds items, the
     draft itself, named from its own items.
   While a save is in flight, the served draft is the one read before the
   press. Skipping it then keeps an Undo from reading "Plan · staged" over a
   draft being emptied.
3. The draft's own name, `draftName(draft)` exported from the dock's module, is
   the setting in the wearer's words and the span its items cover, spelled as
   the surface spells the same change:
   - basal: "Basal <start>" for one item, else "Basal <first start> to <last
     start plus 30 minutes>";
   - carb ratio: "Carb ratio <block span>" from the items' block provenance,
     spelled with the lane's span formatter (`windowSpanText`), or
     "Carb ratio <first start>" when the items carry no provenance;
   - correction factor: "Correction factor".
   The name carries no direction: the dock derives none (ADR 451), and the
   draft carries none. Values lead the detail line only where every item
   carries the same current and proposed pair, in the wearer's form (a
   correction factor insulin first).
4. In `stageAndSettle`, the in-flight flag rises before the press's optimistic
   toggle and paint, not after them, so that paint already runs with `saving`
   true. The re-entrancy guard is unchanged: a press while the flag is up is
   still dropped.
5. The workstation's three sets of marks come from one seeding function that
   first clears all three sets and then asks `callbacks.isStaged` for every
   cell, so a mark the draft no longer holds drops. It runs at three moments:
   - at boot;
   - on every `refresh()` while no stage save is in flight, so a repaint that
     lands mid-save never undoes the press's mark;
   - after an accepted stage save settles and the flag has cleared, followed by
     a repaint. This moment is needed because a seated, unparked Diagnose does
     not refresh its workstation on the guidance render that the save
     triggers.
   A refused save keeps #358's replay of the toggle.
6. `callbacks.isStaged` stays `evidenceIsStaged`, unchanged. It answers from
   the Plan surface's draft as it holds it: the saved draft, or a pick made in
   Changes and not yet saved. Boot seeding already reads it that way on
   e4862000, so re-seeding changes when the marks are read, not what they
   mean.
7. A retained return to Diagnose (a plain top-nav press while the input
   revision is unchanged) re-reads Plan state and guidance, the same pair a
   cold read starts, and then refreshes the workstation while it is still
   seated and on screen, when that read moved the Plan surface's draft (which
   the marks read) or the served draft or pending Plan (which the dock reads).
   A draft save does not move the input revision, so
   without this a draft written while Diagnose was parked, by a route or
   another tab, would leave the Plan surface's copy stale and the re-seed
   would keep the old marks. Both reads are query-only and uncached. The
   destination keeps the promise the `stage` callback returns, and a retained
   return skips the re-read while that stage save is pending: a re-read issued
   before the save commits could resolve after it and overwrite the Plan
   surface's copy with the pre-press draft. The clearing re-seed after the save
   settles (point 5) already covers that return. Decided autonomously during
   AFK run (plan-review round-3 re-check).
8. Nothing on the server changes. The guidance read already reads the draft
   fresh, so the draft save keeps its no-bump exception and no second exception
   is added.

**Decided autonomously during AFK run.** The ticket left these choices open.
Each was taken as the simplest option consistent with the settled decisions:

- The surface's marks stay the dock's first source, and the served draft is its
  fallback. This keeps the staged dock's shipped title, direction and values
  (story S178) byte-identical, and the fallback covers exactly the cases the
  marks miss.
- The dock skips the fallback while a save is in flight, and the flag rises
  before the press's paint (points 2 and 4).
- The marks keep `evidenceIsStaged`'s reading, unsaved Changes picks included
  (point 6). Narrowing it to the saved draft only would change Changes'
  staging, which is outside this ticket.
- The seed clears before it asks, and the retained return re-reads Plan state
  and guidance (points 5 and 7), so a mark can drop when the draft changes
  elsewhere (coordinator scope resolution, plan-review round 3).
- The design states `?mode=slot` and `?mode=icassert` paint an at-rest staged
  mark at boot with no draft behind it. The refresh re-seed does not re-apply
  those marks. No test or story opens either state.
- The ledger story #460 adds changes no existing story. It is recorded under
  the AFK run's delegation rather than a quoted operator sentence.
- A retained return has already refreshed the workstation at its re-seat, so
  after point 7's re-read it refreshes again only when the read moved the Plan
  surface's draft, the served draft or the pending Plan. An unconditional
  second refresh rebuilt the reading pane under the focus a Day return had just
  put on its Occurrence's Open in Day control, and the desk suite's Day-return
  check caught it (decided autonomously during AFK run, start verification
  round 1). The Plan surface's draft is part of that comparison because
  Changes re-reads guidance on every arrival but not the Plan surface's copy:
  a draft replaced before a Changes visit is already in the served draft when
  Diagnose returns, and comparing the served draft alone kept the stale marks
  (review round 1).
- S186 opens the change records in place, as a history step: a saved draft
  seats Changes on the Plan, and a draft-only Plan offers no change-record door.
  Its four legs run in turn and the story fails once, naming each failed leg,
  so a base run records every leg's own verdict (decided autonomously during
  AFK run).

**Consequences.** A partially admitted draft (some items the analysis still
admits, some it no longer does) is named by the admitted part, because the
surface's marks win. That is today's behavior for the admitted part, and the
Plan in Changes still shows the whole draft.

## ADR 459 — Warn before a stage replaces the staged setting

**Context.** The behavior is Connor's decision; its words and geometry were
decided autonomously during AFK run and are named in their own section below.
A Plan holds one setting at a time (Plan spec; CONTEXT.md, Plan;
`validate_plan_items` refuses a mixed draft). Diagnose's stage callback,
`stageEvidence`, keeps only the draft rows of the new item's own setting before
it saves, so the server accepts and the earlier setting is gone. The callback
answers only `true` or `false`, Diagnose reacts only to `false`, and the dock
shows one change with no count.

Reproduced in-process on main at e4862000 with a stubbed transport: staging a
carb-ratio block, then a basal slot, then a second basal slot through
`stageEvidence` answered `true` three times; the saves held
`ic@360,ic@480`, then `basal@120`, then `basal@120,basal@180`; and after the
second save the carb-ratio block no longer counted as staged.

Diagnose's own marks also went stale: nothing clears the replaced setting's
mark, so returning to it in the same visit shows "Staged · Undo" for a change
the draft no longer holds.

**Decision (Connor, 2026-09-24).** One setting per Plan stays. Before the press,
when staging a finding would replace a staged change to a different setting,
the stage control says so and names the change it will replace. Pressing it
replaces exactly as today.

**Implementation decisions.**

1. The warning reads the same draft the marks read: the Plan surface's own
   `draftItems()`, which holds a pick made in Changes and not yet saved ahead
   of the saved draft (ADR 460 point 6). So the warning and the marks can never
   disagree. A stage control whose item's setting differs from that draft's
   setting, while the draft holds items, reads "Replace staged change" with the
   sub-line "replaces <the draft's own name>", the name ADR 460 point 3
   defines, applied to those items. A
   control whose item is already staged keeps "Staged · Undo". Any other
   control keeps "Stage change" and "staged for Plan".
2. Which rows a stage drops is one fact with one implementation.
   `replacesDraft` says whether staging an item of one setting replaces the
   draft's rows, and `stageEvidence`'s keep-only-this-setting filter uses it.
3. The clearing re-seed after an accepted stage save (ADR 460 point 5) drops
   the replaced setting's mark, so its control reads the replace state naming
   the change now staged. The interfaces are `replacesDraft(type, draftItems) →
   boolean` and `replacedDraftItems(type) → items | null` (`draftItems()` when
   it would be replaced, else `null`), both exported from the Plan surface; a
   workstation callback `replacing(item) → string | null` answering
   `draftName({ items })` for those items; and a stage-panel option `replaces`
   carrying that answer to the shared stage control.
4. The Plan spec's one-setting requirement keeps its text and gains real
   scenarios for the replacement and its notice. Its placeholder scenario stays
   beside them: OpenSpec's strict validation refuses a MODIFIED requirement that
   drops a scenario the current spec carries, and earlier changes kept theirs
   the same way.
5. The save's answer stays `true` or `false`. The after-the-press report
   (the issue's option 2) is not built.
6. A manufactured QA case composes the `basal-lower` and `ic-lower` recipes,
   with the carb-ratio recipe's source span stretched so that both lanes end on
   the same day. Measured through `execute_case` on a scratch store: basal 03:00
   and the all-day carb ratio both assert a lower move, and the whole-day queue
   serves "Basal 03:00 · lower" and "Carb ratio 00:00 to 24:00 · lower" as
   assert rows.

**Decided autonomously during AFK run.** Connor's decision fixed the behavior,
not its words or geometry. The words above follow the issue's own example. The
stage button's 136px minimum box holds "Stage change" and "Staged · Undo"
without moving; the replace state may be wider, wraps inside the panel and
never truncates, and pressing it returns the button to the staged box. The
staged/unstaged rule is unchanged for the two existing states.

**Consequences.** Replacing is still one press, and undoing a replacement still
does not restore the earlier setting. The reader is now told what the press
will drop before making it.

**Decided autonomously during AFK run (plan-review round 3 scope resolution).**
The warning reads `draftItems()`, unsaved Changes picks included, rather than
the served draft, so it names whatever the marks and the dock show. One case
stays as today and is out of scope: a pick of the same setting made in Changes
and not yet saved is dropped without a warning when Diagnose stages that
setting, because `stageEvidence` builds from the saved draft and the setting
does not change.

**Decided autonomously during AFK run (start).** S187 gathers its checks and
fails once, so a run on task 11's commit still presses through the replacement
and records its before renders; its first failure is the pre-press warning. S187
joins the PR smoke slice as the only story on `basal-and-carb-ratio-lower`, as
S177 did for its store.

**Budget-record location (coordinator ruling on Q1, 2026-09-24; decided
autonomously during AFK run).** Task 11's QA budget measurements are recorded in
this change's own `coverage-appendix.md`, against the limits of record in
`openspec/changes/harmonic-v2/coverage-appendix.md`, and the harmonic-v2 file is
left unchanged. Appending them there made the round's diff touch two active
OpenSpec changes, which the outbound OpenSpec preflight refuses. The limits, the
measurements and the no-raise rule are unchanged; only where the record lives
moved. #459's lock 2 supersedes lock 1 for this location only.
