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

**Addendum (#462/#463 slice, 2026-09-24), decided autonomously during AFK run,
under the coordinator's authorization to reconcile point 7 with S164 and S165.**
Point 7's re-read runs only when another surface asked for a guidance read while
Diagnose was parked. The guidance module counts every ask, one joined to a read
already in flight included; Diagnose records the count when it parks and
compares it at the return. Every Changes arrival and every Plan write asks, and
Day and the utilities over Diagnose never do. So the re-read follows exactly the
returns that can have seen the draft move — through Changes, where the Plan
surface writes it and where a route or another tab's write is picked up — and
every other retained return (a Day or utility return, a top-nav press straight
back) reads the held status check alone, as S164, S165, S108, S137 and S138
require. A guidance read Diagnose itself started before it parked is not an ask
made while it was away, whenever it answers.

The slice's touched-story replays found this in three steps. S164 and S165
failed on the Plan, guidance, Focus and Pump settings reads the re-read started.
Narrowing to top-nav returns missed them, because a return from a Day that a
utility opened carries no Diagnose case in its context and reads as a top-nav
return. Narrowing to "a guidance read answered while parked" still failed
S164's second half: after its reload, the cold seat's own guidance read was
still in flight when the reader left for Day and answered while Diagnose was
away. A draft another tab writes while the reader never visits Changes is picked
up by the next fresh read. Every S186 leg visits Changes and keeps its re-read.

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

## ADR 462 — An ended record answers a requested reassessment

**Context.** Three decisions below are Connor's (2026-09-24, on the ticket and
in the AFK run's standing decisions); the rest were decided autonomously during
AFK run and are named in their own section. Since #442 most older detected
changes end, and on a store whose pump reads continue past their watch windows
their saved assessments are unavailable (`context_after_ending`, ADR 442 in
`openspec/changes/archive/2026-09-24-backfilled-record-endings/design.md`). The
desk draws the saved ending whatever it holds, so a requested reassessment
changes only the reading pane's Result line. The retained context is refused
whenever any `.py` file in the package differs from the build that captured it
(the harmonic-v2 contract,
`openspec/changes/archive/2026-09-24-harmonic-v2/contracts.md`), so every update
voids every retained comparison. A reassessment of an ended Trial reads to the
data tail, past the record's ending, into days under a later setting.

Reproduced on synthetic data at this change's base
(`docs/scope/462-record-comparison.repro.py`, `docs/scope/462-stage.repro.mjs`):
c4-isf's recipe plus one unchanged pump read after its window saves
`context_after_ending` with no periods; its Retained read is available on the
same build and `unsupported_retained_execution` after a simulated update, while
Current policy stays available; c4-ic's superseded record ends at 06-10 09:00
and both reassessments' Trial periods end at the data tail; and at node level the
stage is byte-identical after either mode press.

**Decision.**

1. **A requested reassessment reaches the stage when the saved ending serves no
   periods (Connor).** An ended record still opens on its saved ending (ADR 430
   decision 1 is unchanged for the first read). When its saved ending's
   assessment serves no periods and the reader presses Retained context or
   Current policy, the stage draws that reassessment: its figure, its periods and
   its outcome rows. The stage's instrument names the mode ("Retained context
   reassessment" or "Current policy reassessment") with the meta "recomputed
   now", never "Ending snapshot" or "as saved at the ending". The reading pane
   keeps the saved-ending part as it is. The stage never shows the two at once.
   An ended record whose saved ending serves periods keeps drawing that saved
   ending after any press (HV2-28; S96 and S157). This amends ADR 442's
   consequence that such records "open on their saved ending, and the labelled
   Retained context and Current policy reassessments stay available": they are
   now drawn when requested.
2. **Reassessment periods stop at the ending instant (Connor).** For a Trial
   record whose ending carries a kind, `review_trials` computes each requested
   reassessment with its data cutoff at the ending's effective instant (never
   later than the read's own data instant). Current policy then captures its
   context from the pump read as of the ending. ADR 442's rule for the saved
   assessment, "a retained context whose source pump read is later than the
   cutoff, or that names none, is unavailable `context_after_ending`", moves into
   the comparison itself, ahead of the version check, so the saved ending and a
   Retained reassessment answer it the same way; `capture_ending` no longer
   carries its own copy. This amends ADR 442's consequence that a reassessment of
   a live ending "still reads" the settling days after it. An open record reads
   to the data tail as before.
3. **The whole-package version gate is dropped (Connor: whichever is less code,
   no migration).** `_execution()` stops hashing the package's source files. A
   retained context is refused only when its context version, its comparison
   policy stamp or its scenario configuration differs from the running
   comparison's. The configuration stays in the gate because a Focus comparison
   executes the retained configuration. Dropping the hash is less code than
   narrowing it, which would need its own list of comparison files. The store
   stops requiring `code_version` on an available comparison context. Contexts
   already saved keep their `code_version` field, and nothing reads it. This
   amends the harmonic-v2 contract's "code/configuration identity" to
   "policy/configuration identity".
4. **The Retained line names its stored context in words.** It reads "Stored
   context recorded <that context's captured_at, formatted as the desk formats
   every stamp>", or "No stored context was recorded" when the context carries
   no capture time. No part of the context's id prints.
5. **`unsupported_retained_execution` names the read that is left.** Its words
   become "the retained context was saved by a different version of the
   comparison, so Current policy is the read left".

**Decided autonomously during AFK run.**

- Decision 1 takes the issue's option (a), not its recommended (b): Connor's
  decision names a *requested* reassessment, and (a) keeps every ended record's
  first read on its saved ending. Opening such records on Current policy by
  default is not built.
- The instrument words in decision 1 and the Retained line's words in decision 4.
- Decision 2 applies to Trial records only. A Focus comparison already ends its
  After period at the effective ending, and the ticket names Trials.
- The one-rule move of `context_after_ending` into the comparison (decision 2)
  follows the issue's own expectation that a Retained read answers the same
  reason as the saved ending.
- The c4 replay's `readiness` helper, which reads "the comparison the page
  shows", follows decision 1's rule so its comment and its selection stay true.
- The manufactured case `c4-isf-late-read`, c4-isf's recipe plus one unchanged
  pump read at 2024-06-30 12:00 before its one reconcile, is the committed state
  whose ending saves `context_after_ending`; no existing case reaches it.
- At start: the store's own validator test (`tests/test_follow_up_store.py`)
  deletes each key of its synthetic comparison-context fixture and expects a
  refusal, so decision 3's store change cannot land without that fixture losing
  its `code_version` key. The lock's Expected diff omitted the file; its one-line
  fixture edit ships with decision 3 rather than keeping the store requirement.
- At start: the new story takes S188, the next unissued id after slice 1's S187.

**Consequences.** On a regularly updated install, a record's retained
comparison survives updates, and an older detected change answers "did my change
help?" through a labelled, recomputed reassessment cut at its own ending. A
Retained reassessment computed by a later build can differ from what the
capturing build would have computed; it is labelled "recomputed now" and never
replaces a saved ending. S91's c4 part is amended: c4-isf's and c4-profile's
records are ended, so their Retained reads now count what their saved endings
count (27 and 28 Trial-arm dates, criterion not met) instead of 30 and 31. The
design exploration's generated JSON stops carrying a package hash and so stops
moving on every Python edit.

## ADR 463 — What a change record prints, draws, and knows about its Plan

**Context.** The first four decisions were decided autonomously during AFK run,
the first three taking the issue's recommendations; decision 5 carries Connor's
2026-09-24 decision for existing records. Reproduced on synthetic data at this
change's base (`docs/scope/463-record-display.repro.py`,
`docs/scope/463-figure.repro.mjs`, `docs/scope/463-redate.spike.py`):

- a reconciled copy of the committed showcase serves its watched carb-ratio
  record's Time in range difference as `-3.9000000000000057`, and the desk prints
  it verbatim; a 1-in-3 Rest-windows cell prints "33.333333333333336%";
- the figure keeps a `role="img"` chart seat in all four no-curve states, inside
  a 220px stage track (190px at the middle width);
- c4-profile's saved ending carries no clock views while its retained read
  serves 48 bins a side;
- a Trial that `_reconcile_plan` matched to a Plan with a recorded decision still
  serves the observed context (`action` None);
- a dose-detected basal Trial and a Plan confirmed from a pump read never link;
- a correction-factor and carb-ratio edit at 10:00 is dated at the day's 08:00
  bolus, which carried the old values; the first bolus carrying the new values
  was at 12:30.

**The unverifiable premise.** The issue asked the operator to check a fresh
snapshot: does the Plan's recorded time predate #443, and does the detected
day's first observation carry the old values? The operator is away, so neither
was checked. Both explanations are handled: (c) by decision 4's dating, (d) by
decision 3's link rule, which never compares a Plan's recorded time with a
change time.

**Decision.**

1. **One decimal, in the desk.** The Read column prints a served difference
   rounded to one decimal, with "+" before a positive value; a difference that
   rounds to zero prints "0". Percent cells print at most one decimal
   ("33.3%", and "100%" stays "100%"). The server keeps serving unrounded values,
   so no assessment, `low_exposure_worsened` included, can move, and saved
   endings, which cannot be rewritten, print the same way.
2. **No curve, no chart space.** The figure renders its chart seat and its
   `role="img"` chart only when it draws a curve (paired or Before-only). A
   stage whose figure draws no curve gives the figure's track only its legend's
   height, at every width. This holds for every evidence figure: an open or
   ended record, the watched Trial and a Focus.
   The baseline figure requirement's scenario "A saved ending keeps its rows
   and says it kept no curve" narrows to a saved ending with no clock bins,
   which renders no chart seat and nothing with `role="img"` (plan review
   round 1).
3. **New endings save their clock views (the issue's option 1).**
   `capture_ending` keeps `views.before.clock` and `views.after.clock` on the
   saved assessment, and nothing else from the views. An ending with clock bins
   draws its curve, labelled as saved at the ending. Older endings keep the
   collapsed figure of decision 2. The store's ending validator already accepts
   the extra key.
4. **A delivery-detected change is dated at its new value's first
   observation.** A dose-stamped regime starts at the first bolus of its first
   settled day that carries the regime's value, and a basal slot regime at the
   first sample of that day that carries it. That day is the day the old rule
   picked, so a re-dated start is never earlier and never on another day.
   Epochs, the analyzer's own change point, are unchanged; the `Regime`
   docstring stops claiming it matches them.
5. **Existing records keep their time and identity (Connor).** A record saved
   before this change carries the date the earlier dating gave its change: the
   first observation of the change's first settled day (for a whole-profile
   change, the latest of its parts'). A delivery-detected change keeps an
   existing record only when all of these hold: the parameter, slot and block
   match; the record's change time equals, to the second, the date that earlier
   dating gives this change, computed from the same data; and the record's
   before and after values match wherever it carries them. A whole-profile
   record carries no values, so it matches on that exact instant alone. Each
   record is kept by one change at most, the earliest. A record whose change
   time is a pump-read switch instant, reverted switches included, is never kept
   by a delivery-detected change; the switch's own candidate carries it. So an
   old-dated record keeps its time and id by construction, and any other record
   — one dated under this change, a switch's, or a later change on the same day
   — is never taken by a change it does not name exactly (review rounds 1–3).
   The comparison's setting-period lookup and the reversal check accept a
   record dated at its regime's start or at that exact earlier date.
   Nothing is rewritten or migrated. The spike moved
   no regime start and no derived id on any of 73 committed case stores, so this
   rule acts on real stores only.
6. **A matched Trial shows its Plan's decision.** A Trial record whose receipt
   names a Plan serves that Plan's decision context as its original context when
   the context is available, and its observed context otherwise. The desk
   already prints "Original decision" for a context with an action.
7. **A Trial detected after its Plan's pump-read confirmation links to it
   (addendum to ADR 431,
   `openspec/changes/archive/2026-09-23-plan-state-one-verdict/design.md`).**
   After the pump-read confirmation in each reconcile, a Trial record with no
   receipt and no captured carb-ratio block links to a Plan confirmed from a
   pump read with no Trial when all of these hold:
   - the Trial's setting is the Plan's setting (a basal Trial's slot is one of
     the Plan's item start minutes), or the Trial is whole-profile;
   - the Trial's change time is within one day of the confirming read's capture
     time;
   - exactly one such Plan qualifies for the Trial, exactly one such Trial
     qualifies for the Plan, and no Trial record already names that Plan.
   The link writes only the Trial's receipt, naming the Plan, the confirming read
   and the Plan's matched schedule. The Plan's receipt, its served verdict and its
   confirmed time are unchanged, because nothing rewrites a Plan (R443). The one
   day absorbs a pre-#443 read stamped on a UTC clock. The rule never reads a
   Plan's recorded time.
   `tests/test_plan_verdict.py`'s dose-stream test puts its confirming read
   about 46 hours after the Trial's change time, so it stays unlinked and
   becomes the more-than-a-day guard; a sibling test with the read within a
   day proves the link (plan review round 1).

**Decision 5's exact match, decided autonomously during AFK run (coordinator design
ruling at code review round 3, the review cap).** Three review rounds each found the
same-change rule taking a record it should not: a second same-day switch (round 1),
a second same-day delivery-detected whole-profile change (round 2), and a reverted
switch's record (round 3). The cause was structural. A record does not store what
created it, and a whole-profile identity carries no values. The former window
rule, any earlier record on the change's day, therefore inferred identity from time
order alone. The
rule is now exact: the record's change time must equal the date the earlier dating
gives the candidate, to the second, and a switch instant is never kept. An
old-dated record carries that date by construction, so it still keeps its time and
id. Every other record is either the candidate's own id or not the candidate at all.

Two consequences are accepted, both found by the scoped cold check of the exact
rule, both matching main's own behavior in kind, and neither changing any dose
advice:

- **Grouping edge.** Whole-profile grouping and the switch-corroboration drop
  compare the new change instants against their one-day tolerance, where the
  earlier dating compared day-first observations. When re-dating moves a gap
  across that tolerance, the parts group differently. Example: a basal slot
  changes at 08:00 on day D−1, whose own instant is its earlier date; carb ratio's
  first bolus on day D is at 07:00 at the old value, and its new value is first
  seen at 12:30. The earlier dating saw a 23-hour gap and saved one profile record
  at D 07:00. The new dating sees 28.5 hours and derives separate basal and
  carb-ratio candidates, which the parameter check does not match to that profile
  record, so the roster shows three rows for one edit where main showed one.
  Grouping is not re-run on earlier dates for the keeper match.
- **A shifted earlier observation.** A re-decoded or late-arriving observation
  that moves a settled day's first observation moves the earlier-dating date
  computed for its change. An old-dated record then no longer matches, and the
  change mints a second id, as main does when its own day-first date moves.

**Decided autonomously during AFK run.** Decisions 1–4, 6 and 7, and their
words: the ticket offered no option for 1, 2, 4, 6 or 7 beyond its example rule,
and 3 is its recommendation. Rounding stays in the desk because a server rounding
would still leave every saved ending unrounded. The link rule is the issue's own
example rule, made fail-closed in both directions as ADR 581's block matching is.

Also decided autonomously during AFK run, at start: `tests/test_durable_follow_up.py`,
which the lock's Expected diff omitted, pinned that a finished ending saves no
`views`; decision 3 reverses that, so its assertion now reads the Before and
Trial clock envelopes alone. Below 700px the stage seats the figure in its
flexible track, so a figure with no curve gets an `auto` track there too, the
desktop templates' rows otherwise kept, which carries decision 2's "every
width" to the narrow desk. The new story takes S189, after #462's S188.

**The whole-pytest budget for this slice, decided autonomously during AFK run
(coordinator ruling after code review round 1).** On one machine in one quiet
session, back to back, the slice's whole pytest took 421.12 s wall and the
unchanged base (origin/main 59fa4737) 417.88 s wall (416.74 s as pytest reports
it): the base already exceeds the 400 s ceiling of record there, and wall
against wall the slice adds 3.24 s (0.8%). For this run the whole-pytest budget
is judged against the base measured on the same machine in the same session. No
limit is raised. Lock #462's Expectation line ("every … budget leg passes with
no QA budget limit raised") is therefore unmet as written: the budget leg exits
with a breach. The coordinator accepts it by this ruling, pending Connor.
Re-baselining the 160 s figure the ceiling is 2.5× of is Connor's decision, and
both are flagged in the pull request body.

**Consequences.** Every ending `capture_ending` saves from now on carries clock
views, generated case stores included, so c3-history's finished record and a Trial finished in the
served app draw their saved curves. The showcase's watched record prints
"difference -3.9". A linked Trial's `deliberate` flag turns true; nothing in the
desk reads it. No committed case records a Plan, so the Plan-linked decision is
evidenced by backend tests only; the ledger amendment names that limit. Trial
dating now differs from the analyzer's epoch change point by up to a day's
hours on a mid-day edit.

## ADR 465 — A recurring-lows basal cut within the threshold holds

**Context.** Connor decided the shape on 2026-09-24 (the issue's option 1, no
rounding up): below the threshold the slot holds, no minimum step is invented,
the held reason names the recurring lows, and the phrase "leaning lower" is not
used. The held state's words, the sentence mechanism and the title rule below
were decided autonomously during AFK run. Reproduced on synthetic data at this
change's base (`docs/scope/465-recurring-low-floor.repro.py`):

- twelve in-range nights delivering 0.71 against a programmed 0.72, with lows
  at 03:00 on two nights, serve 03:00 as `HARM_LOWER` at 0.71 with
  `asserts_move` true and a `lower` action; without the harm layer the same
  slot is `NO_CHANGE`;
- the consolidated profile then moves 00:00–06:00 from 0.72 to 0.719, while the
  Plan would stage 0.71 at one half hour;
- `apply_harm` returns `HARM_LOWER` for setting 0.72 with median 0.71, setting
  0.20 with median 0.19, setting 0.11 with no median (to 0.10), and setting
  0.10 with no median (to 0.10, no move at all);
- a trivial nudged slot on more clean nights takes the Basal lever's headline:
  priority 15 and "14 of 14", against priority 11 and "9 of 9" with that slot
  at its setting;
- across the 74 committed synthetic stores, the only recurring-lows cuts are
  `basal-recurring-low-lower` (0.06 U/h) and
  `basal-recurring-low-no-clean-median` (0.12 U/h), both at or above the
  threshold, so no committed verdict moves.

**Decision.**

1. **One threshold, one check, in `apply_harm`.** The threshold is the noise
   floor or one full step, whichever is smaller:
   `min(noise_floor, current * max_step_frac)`. Every nudge target, the
   median-deferred one and the no-median full step alike, passes through one
   check: when `current - target` is below the threshold, the slot holds at
   `current` as `HARM_GATED`. `target` is the clamped target before
   `round(…, 3)`: against the rounded target, settings of 0.137, 0.131 and
   0.126 U/h would hold instead of taking their full step (0.137 steps to 0.11,
   0.027 against a threshold of 0.0274; plan review round 1). The comparison
   carries a 1e-9 tolerance so that a target exactly one full step away still
   moves in floating point. The check lives nowhere else: not in `cap()`, the
   projection, the lever or the frontend.
2. **The hold keeps its status and gets its own served sentence.** The status
   stays `HARM_GATED`, so staging, the deliverable schedule, consolidation, the
   priority tally, the lane and the queue register all read it as the hold they
   already handle. The analyzer chooses the sentence: a `HARM_GATED` slot that
   is nudged and whose clean median is absent or at or below its setting reads
   "lows keep happening overnight, but the step down is smaller than the
   smallest change worth making, so the rate stays as it is"; every other `HARM_GATED` slot (a raise
   withheld, whether nudged with a median above the setting or gated by a
   single low) keeps "a low printed at this hour, so a step up is withheld and
   the rate stays as it is". The median-at-setting hold of ADR 412 reads the new
   sentence too: it is the same reader situation. `_annotation_for` takes the
   choice as a keyword that defaults to the raise-gate sentence, so its other
   caller, the findings-fixture generator, is unchanged unless it asks.
3. **The held row names no lower lean.** A held basal slot whose served
   `evidence.harm.nudged` is true prints no "leaning lower" suffix: its title is
   the setting name alone ("Basal 03:00"), and the served sentence names the
   recurring lows. A raise lean and every other held slot keep their titles.
   The projection's `_basal_key` and the fixture-only JS mirror's `basalKey`
   change together, and the findings-fixture generator gains one nudged
   within-threshold slot at 03:00, built through the real `apply_harm` and
   `_annotation_for`, so the mirror's deep comparison exercises the rule.
4. **Guidance and evidence are unchanged.** The slot keeps
   `seriousness: "recurring_low"` and its full `evidence.harm`; only the
   direction, the action and the staging verdict go.
5. **#435's wording.** Connor asked for the held wording to use #435's guard
   wording. #435 shows guards as measurements: a plain verdict, the value
   against the bar, and what would change it ("Enough nights — 11 of 8 ✓",
   "Lows at this hour — 3 in 30 days"; read from the issue by the coordinator
   at plan review). The sentence above follows that register: the verdict (the
   rate stays), the measured step against its bar (smaller than the smallest
   change worth making), and, by implication, what would change it (a larger
   gap). The served headline appends the measured rate against the setting
   ("Delivered 0.71 U/h across 12 steady nights against 0.72 programmed."). It
   says "overnight", per Connor's #466 decision, and never "leaning lower".
   #435 (out of scope here) owns adding this case to its staging test.

**Consequences.** A slot whose steady nights already run within the threshold of
its setting gets a warning, not a move to stage; a one-hundredth cut can no
longer take the lever's headline or nudge the consolidated profile. At settings
below 0.125 U/h with no clean median, recurring lows no longer "lower" to the
0.1 U/h minimum they already sit near. Every harm cut at or above the threshold,
and every committed case store, is unchanged.

## ADR 466 — A recurring-lows slot says what owns its move and shows its lows

**Context.** Connor decided on 2026-09-24 that when recurrence is counted across
the overnight band the copy says so and shows the count the nudge actually
used; that answers the issue's open question, so the copy says "overnight", not
"at this hour". The words below, the held-slot list, and the roster headers'
accessibility shape were decided autonomously during AFK run. Reproduced on
synthetic data at this change's base
(`docs/scope/466-recurring-low-explain.repro.py`,
`docs/scope/466-slot-panel.repro.mjs`):

- thirty steady nights either side of a programmed 0.60 (fourteen at 0.45, two
  at 0.54, fourteen at 0.66) with lows at 03:00 on two nights serve 03:00 as
  "lower (recurring lows)" at 0.54, `asserts_move` true, with an interval of
  0.45–0.66 that contains 0.60; the same shape through the store and
  `analyze()` serves the same;
- the slot panel on that served row prints Stage change and "not established by
  it", never "something outside the estimate set it", and no low's date;
- one low at 03:00 on one night and one at 04:00 on another nudge both half
  hours, each with `slot_nights` 1 and one served low;
- with 03:00's rate edited mid-window and band lows on two nights before the
  edit and one after, 03:00 serves `band_nights` 3 against a bar of 2 and is not
  nudged, and nothing served says the nudge counted one night.

**Decision.**

1. **The served count.** A basal slot's `evidence.harm` gains
   `recurrence_nights`, the band nights `basal_harm` counted for that slot on or
   after its setting epoch, and `recurrence_bar`, `min_recurrence_nights`. The
   nudge reads the same count (`nudged` is exactly
   `recurrence_nights >= recurrence_bar`), so the two cannot disagree. Every
   gated slot serves both. This is the one count; #435's guard list reads it.
2. **"Overnight" copy.** The `HARM_LOWER` sentence reads "lows keep happening
   overnight, so the rate steps down toward the measured rate (20% at most)",
   and the lane cell's name "suggests a lower because lows keep happening
   overnight". The gate's "a low printed at this hour" stays: a gated slot
   printed its own low.
3. **The interval sentence names the owner.** On a slot served
   "lower (recurring lows)" whose interval reaches the setting, the panel keeps
   the interval fact and replaces "A move is consistent with this data, not
   established by it." with "The steady nights alone do not establish this
   step down. It comes from the overnight lows listed below." The choice reads
   the served status string alone, as the lane key does (#433). Every other
   slot, and the carb-ratio and correction-factor panels, keep today's words.
4. **The lows list.** Under the numbers block, a slot whose served
   `evidence.harm` exists shows one count line, "Overnight lows on N night(s)
   counted since this rate was set, across the whole night, not this half hour
   alone. A step down needs lows on B nights.", then a caption "Lows in this half hour" and
   one button row per served low of this half hour, printing its date, nadir
   time and nadir glucose ("Jul 11 · 03:00 · 50 mg/dL") and opening that day in
   Day through the panel's existing hand-off with the low's served `t`. The
   rows and the count read served fields only. The list renders before, and
   independently of, the nights read.
5. **Held slots get the list too.** The issue left open whether a slot held by
   the recurring-low gate lists its lows. It does: the list keys on the served
   `evidence.harm` alone, which every gated slot carries, so a raise withheld,
   ADR 465's within-threshold hold and a recurring-lows lower all show the same
   list, and the frontend branches on nothing else.
6. **Roster headers.** One header row above the roster names "Delivered U/h",
   "Programmed U/h" and "Night mean mg/dL" in the rows' column order. The rows
   are buttons in a flat list, not table cells, so ARIA column headers would
   have no table to belong to; the header row is hidden from assistive
   technology, and each row's three values carry their column name and unit in
   visually hidden text (the desk's `.gf-visually-hidden`), so a screen reader
   hears "0.80 U/h delivered", "0.60 U/h programmed" and "116 mg/dL night mean".
7. **The drill requirement is amended, not bypassed.** The basal-drill
   requirement that the numbers-and-staging block "render exactly as shipped"
   now excepts the interval sentence of decision 3, and the lows list and
   roster headers join its roster description.
8. **`result.py`'s claim is corrected.** `asserts_move`'s docstring says a slot
   whose interval spans current is held everywhere except a recurring-lows
   lower, which the harm layer moves whatever its interval.

**Consequences.** A reader opening a recurring-lows lower sees why it moves and
which nights it moved on, and can open each in Day. S113's lane-name assertion
changes with decision 2, by a dated amendment. The excluded-night line and #434's
reasons, #290's deferral, the Recommended value, `asserts_move` and every harm
rule are unchanged.

## ADR 465 — The fixture's held 03:00 slot moves one Node count

**Context.** Decided autonomously during AFK run. Task 42 adds one nudged
within-threshold slot at 03:00 to the findings-fixture generator. The fixture's
`quiet` window (03:00–04:00) then holds two Watching rows instead of one, and a
Node test in `frontend/diagnose-findings-queue.test.js` pins that window's
weights to exactly one collapsed row. Task 42 names the Python projection tests
whose counts may move, not this Node twin, and the file is outside the lock's
expected diff. The fixture's `browser_inputs` are unchanged, so no browser leg
moves.

**Decision.** The Node test's pinned count is updated to the regenerated answer
(two collapsed rows), exactly as task 42 treats a moved Python count. The quiet
window stays all Watching, which is what the test holds; the slot and the window
are not moved to keep the old count.

**Consequences.** #465's diff carries one file beyond its lock's expected diff,
named here and in the commit message.

## ADR 466 — The roster header stands on the rows' grid, abbreviated

**Context.** Decided autonomously during AFK run, from code review round 1's
note N1. The first roster header was a flex row offset by a hand-copied 119px,
so in the 1440x900 render "Delivered U/h" spanned both rate values,
"Programmed U/h" sat over the glucose mean and "Night mean mg/dL" over empty
space. The rows' value tracks are 30, 30 and 42 px wide, and the full names are
about 70 px wide at the micro size, so no placement of the full words fits their
tracks.

**Decision.** The header shares the rows' one grid declaration, so a change to
the grid moves both, and each name stands in its value's track, right-aligned
like the value. The visible words are abbreviated over two lines, "Deliv. U/h",
"Prog. U/h" and "Mean mg/dL", and each label carries its full name
("Delivered U/h", "Programmed U/h", "Night mean mg/dL") as its title, which is
how the header still names the columns in order as ADR 466 decision 6 and the
surfaces requirement ask. The header stays hidden from assistive technology;
each row's values keep their full hidden labels. S191 now also requires each
name's right edge to meet its value's.

**Consequences.** The header reads as column heads over their values at every
width the rows keep. The visible names are shorter than decision 6's words; the
full words remain on hover and in every row's hidden text.

## ADR 467 — A scoped window serves a Pattern when its outcomes land in it

**Context.** Connor chose option A on 2026-09-24: the overnight-lows Pattern
joins any window overlapping the 00:00–06:00 band, with its band counts and a
sentence naming the band. Where membership is decided, the treatment of a
Pattern with no population, the sentence's words and the fixture's band
evidence were decided autonomously during AFK run. Reproduced on synthetic data
at this change's base (`docs/scope/467-scoped-pattern-membership.repro.py`):

- on the QA case `basal-recurring-low-lower`, the whole-day queue serves
  `pattern:overnight_lows_no_iob` at k 2 of n 30 nights, `setting_staging`,
  Priority 97; the 00:00–06:00, 02:00–05:00, 03:00–04:00 and 00:00–24:00
  windows serve no Pattern row at all, while the roster published beside them
  carries all five;
- on the findings-fixture projection, the explicit 00:00–24:00 scope drops Lows
  after meals, Lows after correcting highs and the overnight Pattern, and serves
  `finding:correction_stacking` and `finding:correction_on_iob` unfolded.

The gate is `pattern_chartable`, which ADR 395 built to decide a Pattern's chart
and case file and which #411 reused as scoped admission. The overnight Pattern
has no habit member and no Exposure family, so it fails it in every window.

**Decision.**

1. **One membership predicate, where the scoped roster is built.**
   `outcome_patterns.pattern_in_window(pattern, query)` is true when the
   Pattern's `n` is above zero and, for the harm-band Pattern (rate producer
   `harm_band_source_nights`), the window overlaps the Harm signal's band
   (`HarmConfig.overnight_start_min` to `overnight_end_min`). For an
   Exposure-family Pattern the scoped roster's `n` is already the
   outcome-anchored count in the window, so the rule is the Outcome anchor rule
   every other row follows; admission plays no part, matching the whole-day
   `remain_pattern` rule. `outcome_window_population` returns only the member
   Patterns for a scoped query, so the rows and the roster published beside them
   agree by construction.
2. **The projection serves the scoped roster.** `_pattern_rows` serves every
   `remain_pattern` Pattern of that roster. `pattern_chartable` decides only the
   chart coordinate and, through it, the case file.
3. **Band counts in any overlapping window.** The harm-band Pattern keeps k and n
   counted over the whole band in a partial window, as basal and carb-ratio rows
   keep their whole-span counts. In a scoped window its count sentence reads
   "k of n nights ran low between 00:00 and 06:00", the band's minutes printed
   from `HarmConfig`; the whole day keeps "ran low overnight". Its headline, chart
   (none) and Priority are unchanged.
4. **No population, no scoped row.** A Pattern whose `n` is zero joins no scoped
   window. The whole day still serves it, as today.
5. **The mirror follows the served roster.** The fixture mirror reads the
   server's frozen per-window roster, which is now membership-filtered, so it
   drops its scoped gate rather than re-deciding membership; its scoped chart
   uses the chartability predicate over the scoped `n` in place of its
   `pattern.n > 0` stand-in, and it transcribes decision 3's sentence. The
   fixture generator's 03:00 recurring-lows slot serves `band_nights` 2 and
   `harm_band_source_nights` 20, as the analyzer publishes them, so frozen
   windows exercise decision 3 in both implementations.

**Consequences.** The Overnight preset and any window reaching into the band
list the overnight Pattern with the counts the basal lower acted on. Scoped
Pattern Focus admission, which reads the scoped roster's readiness, answers as
before: a Pattern with no outcome in the window was already `withheld`. Across
the 75 QA cases, 34 scoped windows now serve a Pattern and no literal
expectation moves (`docs/scope/467-scoped-pattern-membership.spike.py --qa`).
Queue order and Pattern pricing are #469's. The live behavioral-layer text that
once omitted scoped Patterns left the spec when `v2-findings-ledger` archived;
this change adds the membership rule beside it.

## ADR 469 — The findings rail follows the one urgency ranking

**Context.** Connor settled on 2026-09-24 that the queue is one ranking by
urgency (health impact) across settings and habits, withdrew the issue's
ordering questions, and named four places the rail breaks that rule. How each is
fixed was decided autonomously during AFK run, taking the issue's recommended
shapes (2(b) and 3(a)) and the smallest change for the rest. Reproduced on the
committed fixture at this change's base (`docs/scope/469-queue-rank.repro.mjs`):

- in `global`, Highs after meals and Lows after meals rank 2 and 3 at the carb
  ratio's Priority (reading 1 of 3 and 0 of 3 meals) and the overnight Pattern
  ranks 6 at basal's (0 of 0 nights), each a second position for a Priority a
  setting row already holds; the committed showcase store ranks the overnight
  Pattern, "0 of 30 nights", second at 24 h the same way;
- in `afternoon`, `drawn` and `low_block`, Highs after meals ranks 2 at its
  30-day Priority while reading 0 of 1 meals, and nothing says the rank is not
  the window's;
- `global` paints four tier words, "Next in line" twice and "Worth a look"
  twice, and neither has a Glossary or CONTEXT.md entry;
- in `direction_only_windows.global`, the direction-only correction-factor
  weaken, unpriced because it has no new number to stage, sits under "Not
  recurring often enough to rank yet".

**Decision.**

1. **A setting-admitted Pattern sits in its setting's position.** A Pattern the
   projection serves with `admission_route` `setting_staging` carries a new row
   field, `anchored_by`: the id of the first served, priced, asserting row of its
   setting member's parameter in queue order. Every such row carries the same
   parameter-level Priority; for the harm-band Pattern decision 7 narrows the
   candidates to in-band rows. It
   sorts directly after that row, and its own claimed causes directly after it. Its `priority` stays the roster's price (ADR 391 and
   `tests/test_pattern_policy.py` unchanged); the rail gives it no numeral of its
   own. When no served row qualifies (a scoped window without the setting's row),
   it has no anchor and keeps its own ranked position.
2. **Tiers are bands of the one ranking.** Over the sorted rows, the leading run
   of priced, top-level asserting rows is `next_in_line`; every later priced
   top-level row is `worth_a_look`; an anchored Pattern takes its anchor's tier;
   a claimed cause keeps today's rule (priced `worth_a_look`, else `noted`);
   every unpriced row is `noted`. The rail's caption rule (a caption where the
   served tier changes) therefore prints each tier word at most once, and its
   stripe rule (the ranked rows of the first priced tier) marks one leading run.
   The rail's caption and stripe code does not change. The band order holds over
   top-level rows: every top-level `next_in_line` row precedes every top-level
   `worth_a_look` row, while a priced claimed cause keeps `worth_a_look` inside
   its Pattern's fold wherever that Pattern sits (review round 1, B1).
3. **The rank basis is said where it differs from the counts.** A new row field,
   `rank_note`, is served as "Ranked with its setting" on an anchored Pattern, and
   as "Ranked on all N days" (N the analysis window, 30) on a priced, top-level
   Pattern or Cause row in a scoped window; otherwise it is null. The rail prints
   it after the row's detail line, where it prints " · Whole day".
4. **An asserting row that cannot stage gives its own reason.** Among unpriced
   ranked-head rows, the server sorts asserting rows before findings. In the rail,
   a row whose register is `assert` but whose served verdict does not let it stage
   never opens the tail seam, and its detail line is its staging refusal, chosen
   by one function beside `isfVerdict` that the correction-factor panel's foot
   note also uses ("No new number is available, so there is nothing to stage."
   for the direction-only weaken). The tail note keeps its words and now covers
   only rows that are unranked for want of recurrence.
5. **The words are explained.** The Glossary gains a "Findings queue" group
   defining "Next in line", "Worth a look", "Ranked with its setting", "Ranked on
   all 30 days" and "Not recurring often enough to rank yet". No caption control
   is added. CONTEXT.md gains a **Ranking tier** entry and its **Priority** entry
   says a setting-admitted Pattern shares its setting's position; DESIGN.md rule
   4 says what each tier word means and that each prints at most once; the queue
   module's header says the same.
6. **A filtered-out setting leaves its Pattern ranked but unlabelled.** When a
   filter hides an anchored Pattern's setting row, the rail shows the Pattern as
   a ranked row with its own numeral (the one visible holder of that Priority),
   but with no tier word, in the row or as a caption, and no stripe, and it takes
   no part in the rail's tier and stripe bookkeeping. Its served tier is its
   anchor's, and "Next in line" names setting changes, so printing it on a
   Pattern that cannot stage would contradict the Glossary. Its "Ranked with its
   setting" note still prints.
7. **The overnight Pattern anchors only where it is admitted.** Decided
   autonomously during AFK run (coordinator ruling on review round 1, N3,
   corrected on review round 2, F1). The harm-band Pattern ("Overnight lows with
   no insulin on board") anchors only to a served, priced, asserting basal row
   whose span starts inside the Harm signal's 00:00–06:00 band: the one rule
   (`outcome_patterns.starts_in_harm_band`) that admits it through its basal
   setting, read by the admission, the projection and the mirror alike. A basal
   run that starts in the band and crosses 06:00 therefore both admits and
   anchors it. In a window that overlaps the band but serves no such row
   (a 05:00–08:00 window whose only asserting basal row is a 06:30 raise), it has
   no anchor and keeps its own ranked position, "Ranked on all 30 days", rather
   than sitting "Ranked with its setting" beneath a daytime basal row.

**Consequences.** One Priority fills one ranked position: a reader looking for
the next change reads settings and the habits that outrank them in one order,
with the Patterns a setting admits beneath it. This amends, and does not
re-open, the settled rules: CONTEXT.md's one honest queue and #395's interleave
hold (settings and habits still interleave by Priority); ADR 302's one caption
per run holds, and runs are now unique; ADR 391's price holds, and only its
placement in the rail changes; #413's stripe on the first tier holds, and that
tier is now one run. No Priority, input, floor, staging predicate or cap moves,
and no QA expectation moves (`docs/scope/469-queue-rank.spike.py --qa`). S115
holds unchanged: it reads the served tiers.
