# #431 scope ledger — one served Plan verdict

Triage worker ledger for #431 (change `plan-state-one-verdict`). Grounded on
`origin/main` a4d374a7 against synthetic QA case stores only. The in-process
reproduction is `docs/scope/431-plan-state-repro.py` with its browser half
`docs/scope/431-plan-state-repro.mjs`.

## Decisions

- **D5 (operator, 2026-09-23, relayed by the release coordinator): the server
  confirms a pending Plan once the latest pump read matches it, and the
  pending-Plan note leaves the case-file header for the watch panel.** Why:
  nothing else moves a Plan out of pending, and a note that depends on the
  selected case contradicts the one watched-change rule. → ADR (ADR 431 in
  `openspec/changes/plan-state-one-verdict/design.md`).
- **Watch-panel Plan states route with "Open Changes ›"** (release coordinator,
  matching #429's Trial and Focus wording). Why: the Plan destination is Changes;
  "Open Plan" names a retired page. inline.
- **Q2 standing UI sanction** (Connor Griffin, 2026-09-23): "Yes. I record your
  answer as the approval for every change these 13 checklists call for, and write
  the wording in CONTEXT.md terms." Covers every shipped-surface revision and
  ledger amendment this checklist calls for. inline.
- **The confirming read is the first read of the unbroken run of matching reads
  after the decision, ending at the latest.** Why: the latest read decides (D5),
  but the time shown must not move with every fetch (defect 2), and a lagging
  reconciliation must not stamp a later time than the pump was first seen
  holding the Plan. → ADR.
- **A Plan recorded before its schedule was captured (before #388) is compared
  as its recorded values over that read.** Why: without it, D5 cannot confirm the
  oldest stuck Plans, which carry no captured schedule; the comparison is the
  one the browser already made for them. → ADR.
- **Only the newest recorded Plan can be pending; an older unconfirmed Plan is
  superseded.** Why: `pending_plan` returns the newest unconfirmed record, so
  confirming or withdrawing the newest would surface an older, never-comparable
  Plan and block the desk again. Recording and withdrawing already keep new
  history to one open Plan; only pre-#386 history holds several. → ADR.
- **A pump-read confirmation creates no Plan–Trial relationship.** Why: ADR 386
  requires a real observed transition for that relationship; confirmation and
  relationship are separate facts. The Trial-matched receipt still wins when both
  are available in one reconciliation pass. → ADR.
- **The theory item is confirmed by reading and reproduction**: after a
  confirmed Plan, `plan-view.js` compares a newer draft with the committed flag
  set, so a draft that differs from the pump reads as a keying-error mismatch
  under an "On pump" head, and the frame offers neither Save draft nor Record
  decision. inline (fixed by this change).
- **The issue's "keyed first" theory is only partly right**: a profile switch
  keyed before recording creates a Trial, and an active Trial refuses the
  decision; the reachable stuck paths are in-place edits (no settings read shares
  a dose-stream change time) and any Plan no Trial matches. inline (evidence in
  the reproduction).
- **Incomparable recorded Plans (release coordinator ruling, review round 1):**
  a Plan with any item lacking an integer `start_min` or a numeric `value` is
  never confirmed by a read, serves `pending` with `on_pump` false, leaves by
  Withdraw, and neither the reconciler nor the verdict raises on it. Why:
  pre-#388 rows can hold key-only items; the comparison raises on them, and a
  null value would let an unchanged read appear to hold the Plan. → ADR.
- **Verdict states (release coordinator ruling, review round 1):** `pending` is
  newest, not confirmed, and the latest read after the decision holds it (or
  there is none, or it is incomparable); `mismatch` is newest, not confirmed,
  comparable, and the latest read does not hold it. Why: the first draft left
  "an earlier read differed, the latest holds, not yet reconciled" in neither
  state. → ADR.
- **A confirmed Plan keeps "View change record" and offers no Withdraw**
  (release coordinator ruling, review round 1). Why: S105's no-op Plan is
  confirmed by the server once this lands, and today that door comes only from
  the pending branch. inline (surfaces requirement 1).
- **Lock shape (release coordinator rulings, review round 1):** workers' done
  condition is review-clean and committed on the ticket branch with no push and
  no pull request; the full `acceptance.test.py` binds a port and is
  coordinator-run, workers run its port-free classes and the `inventory` leg;
  the rewritten browser test keeps "pending Plan" in its title (`pass 2`); every
  sub-order runs on Opus; ledger additions go in a dated `## #431 amendment —
  2026-09-23` section. inline.
- **Third-panel rulings (release coordinator, the review cap; none reopens a
  decision):** a withdrawn Plan's verdict is decided first, so a withdrawn newest
  Plan reads `withdrawn` and agrees with guidance's absent pending Plan; the
  verdict drops `checked_at`, which no surface reads; the coordinator captures
  the render evidence into `docs/scope/release-422-434-evidence/431/`; each new
  story's base proof runs this branch's replay harness over a4d374a7, with
  S146's unreachable premise accepted and its unit test as the fail-first half;
  the replay tasks name every `acceptance.test.py` literal the inventory moves.
  → ADR (verdict) / inline (evidence and tasks).
- **Default assumed, returned to the coordinator: a confirmed Plan keeps no
  watch-panel state.** Why: the panel shows what holds the one active-change
  seat, the server releases that seat on confirmation, and an indefinitely shown
  confirmed Plan would outlive the schedule it names. The issue offered a
  confirmed state "if no Trial takes over"; flipping this default adds one dock
  state and one story. → issue comment (coordinator question).

### Risk contract

- **Must prevent:** a Plan served or shown as confirmed or on the pump when no
  pump read after its decision holds its schedule (silent incorrect success on
  advisory dosing guidance); two surfaces making different claims about one Plan
  record; a hold, floor or staging verdict moving into the frontend; real
  glucose, insulin or schedule values in any committed test, fixture, capture or
  comment.
- **Must recover:** none beyond the existing reconciliation on every ingest.
- **Accepted failure:** a Plan whose pump reads stopped matching before any
  reconciliation saw a match stays pending with a visible mismatch and leaves by
  Withdraw; an incomparable recorded Plan (an item without an integer start
  minute or a numeric value) is never confirmed by a read, stays pending, and
  leaves by Withdraw; an older unconfirmed Plan superseded by a newer record is
  neither confirmed nor withdrawn, and is not listed as either.
- **Unsupported:** an out-of-process CLI fetch while `serve` runs (the existing
  process-local cache rule); viewports other than the two supported desktop
  sizes.
- **Evidence owed:** backend tests through the public routes and
  `reconcile_ingested_follow_up` (in-place edit after the decision; dose-stream
  Trial; read before the decision; mismatch; a Plan without a captured schedule;
  an incomparable Plan through reconciliation, both reads and Withdraw; a
  holding read not yet reconciled; superseded history; the confirmed time
  holding across a later read; history and guidance serving one verdict; the
  store's receipt identity rule), each asserting changed behavior shown failing
  on the base and each guard shown passing there; frontend unit tests for the
  Changes phase, status, actions, Decision block and newer-draft frame and for
  the watch panel's Plan states; the browser test and replay stories named in
  the change; the desk ledger's inherited stories preserved.
- Why: these screens are read as advisory insulin-dosing guidance; the harm is a
  false "on the pump", not downtime. Disposition: admitted into
  `openspec/changes/plan-state-one-verdict/design.md` unchanged.

## Open questions

1. Coordinator: keep the default that a confirmed Plan releases the watch panel
   (recommended), or add a confirmed state shown while the latest read still
   holds the Plan and until a Trial or Focus starts after its confirmation?

## Spawned tasks

None. No issue is filed from triage.

## Review rounds

Instrumentation for `/plan-review` rounds, dispatched by the coordinator:
blockers found per round, each tagged `authoring` or `injected`.

- **Round 1** (cold pass and persona panel, both BLOCKED; findings verified by
  the coordinator): 6 blockers, all `authoring` — incomparable legacy Plans
  raising and falsely holding; the verdict-state gap; a done condition naming a
  commit the release never produces; S105's lost change-record door; the full
  acceptance test binding a port; a filtered browser leg with no pass count.
  6 notes folded in. 0 `injected`.
- **Round 2** (the same cold reviewer on the round-1 deltas): countersigned;
  3 notes folded into the draft only (the six test modules listed in the
  expected diff, the summary's incomplete-items wording, the `Amended S42 ·`
  line form). 0 blockers.
- **Round 3** (fresh cold pass, the load-bearing tier's third panel and the
  cap): BLOCKED, 4 blockers and 1 note, all `authoring` — the verdict states
  never excluded a withdrawn Plan; `checked_at` served with no reader; no render
  evidence leg; base proofs not stated against this branch's harness; the note
  on the acceptance-test literals. Settled by coordinator rulings. 0
  `injected`.
