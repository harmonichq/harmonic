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
5. **Existing records keep their time and identity (Connor).** A derived change
   that an existing retained record already names (same parameter, slot, block,
   before and after values, with the record's change time on the same pump day
   and at or before the derived time) is that record: it keeps the record's
   change time and id. The comparison's setting-period lookup and the reversal
   check accept the same match. Nothing is rewritten or migrated. The spike moved
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

**Decided autonomously during AFK run.** Decisions 1–4, 6 and 7, and their
words: the ticket offered no option for 1, 2, 4, 6 or 7 beyond its example rule,
and 3 is its recommendation. Rounding stays in the desk because a server rounding
would still leave every saved ending unrounded. The link rule is the issue's own
example rule, made fail-closed in both directions as ADR 581's block matching is.

**Consequences.** Every ending `capture_ending` saves from now on carries clock
views, generated case stores included, so c3-history's finished record and a Trial finished in the
served app draw their saved curves. The showcase's watched record prints
"difference -3.9". A linked Trial's `deliberate` flag turns true; nothing in the
desk reads it. No committed case records a Plan, so the Plan-linked decision is
evidenced by backend tests only; the ledger amendment names that limit. Trial
dating now differs from the analyzer's epoch change point by up to a day's
hours on a mid-day edit.
