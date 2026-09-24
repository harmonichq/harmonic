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
5. The workstation's three sets of marks come from one seeding function over
   `callbacks.isStaged`, run at three moments:
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
7. Nothing on the server changes. The guidance read already reads the draft
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
- The design states `?mode=slot` and `?mode=icassert` paint an at-rest staged
  mark at boot with no draft behind it. The refresh re-seed does not re-apply
  those marks. No test or story opens either state.
- The ledger story #460 adds changes no existing story. It is recorded under
  the AFK run's delegation rather than a quoted operator sentence.

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

1. The warning reads the served draft that ADR 460 hands the workstation. A
   stage control whose item's setting differs from the served draft's setting,
   while the draft holds items, reads "Replace staged change" with the sub-line
   "replaces <the draft's own name>", the name ADR 460 point 3 defines. A
   control whose item is already staged keeps "Staged · Undo". Any other
   control keeps "Stage change" and "staged for Plan".
2. Which rows a stage drops is one fact with one implementation.
   `replacesDraft` says whether staging an item of one setting replaces the
   draft's rows, and `stageEvidence`'s keep-only-this-setting filter uses it.
3. The re-seed after an accepted stage save (ADR 460 point 5) clears the
   replaced setting's mark, so its control reads the replace state naming the
   change now staged. The interfaces are `replacesDraft(type, draftItems) →
   boolean` exported from the Plan surface, a workstation callback
   `replacing(item) → string | null` answering `draftName` of the served draft
   when that draft would be replaced, and a stage-panel option `replaces`
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
