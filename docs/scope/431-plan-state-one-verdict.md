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
  Withdraw; an older unconfirmed Plan superseded by a newer record is neither
  confirmed nor withdrawn, and is not listed as either.
- **Unsupported:** an out-of-process CLI fetch while `serve` runs (the existing
  process-local cache rule); viewports other than the two supported desktop
  sizes.
- **Evidence owed:** backend tests through the public routes and
  `reconcile_ingested_follow_up` that fail on the base (in-place edit after the
  decision; dose-stream Trial; read before the decision; mismatch; a Plan without
  a captured schedule; superseded history; the confirmed time holding across a
  later read; history and guidance serving one verdict; the store's receipt
  identity rule); frontend unit tests for the Changes phase, status, Decision
  block and newer-draft frame and for the watch panel's Plan states; the browser
  test and replay stories named in the change; the desk ledger's inherited
  stories preserved.
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

- (none yet)
