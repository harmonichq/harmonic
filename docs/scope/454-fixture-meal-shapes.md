# #454 scope ledger — Pattern mirror family filter, producer-shaped rows, one served sentence

Triage worker ledger for #454 (change `fixture-meal-shapes`). Grounded on
`origin/main` b03431d2 against committed synthetic fixtures and QA case stores
materialized in process; no port was bound. Evidence scripts:
`docs/scope/454-mirror-family.repro.mjs`, `docs/scope/454-backend-family.repro.py`
and `docs/scope/454-row-shapes.measure.py`.

## Decisions

- **R454 (coordinator ruling under the Q3 delegation, 2026-09-23): "As the issue's
  checklist", with the instruction to mirror the backend's rate-family filter
  exactly and to put every manufactured row carrying a kind, verdict or cause text
  its producer never serves in scope.** Why: settled. inline.
- **The mirror reads the backend's own lever-to-rate-family table, frozen from the
  evidence-population policy, and is held to frozen Python answers for two real
  out-of-family rosters.** Why: generating the capture's unread, partly wrong
  hand table replaces a transcription; only the producer's answer checks "exactly".
  → ADR.
- **Manufactured rows take their producer's shapes.** Why: R454. → ADR.
- **Q1 (coordinator, 2026-09-23): accept the four band moves on claimed rows.**
  Why: the producer always marks a claimed row's own verdict matched. → ADR.
- **Q2 (coordinator, 2026-09-23): re-claim the two correction-cluster rows for
  Correction stacking and list every moved fact; the "no count moving elsewhere"
  boundary is amended for exactly those moves.** Why: `_low_lever` is the only
  judge of Correction on active insulin and `_correction_lever` returns Correction
  stacking alone. → ADR.
- **The re-claim stays row-level.** Why: no family manufactures a claimed row's
  episode siblings; adding the stacked pair's first dose and the reached low would
  change the twenty-row low population and credit Lows after correcting highs one
  more claim. → ADR (design.md "Row-level, not episode-level").
- **Q3 (coordinator, 2026-09-23): widen to the High anchor glucose.** → ADR.
- **Q4 (coordinator, 2026-09-23): widen to the duplicated sentence; each fact prints
  once; surface lifecycle revise; story S182.** Grounded: the duplicate is served
  (two served fields carry the same string), so the producer serves it once, as the
  cause's text, and the mirror follows. → ADR.
- **S182 runs on pattern-near-tie; `SMOKE_STORIES` does not change.** Why:
  `SmokeSelectionTest` passes on base with S150 on that store. inline.
- **Q5 (coordinator, 2026-09-23): widen to the event-comparison capture's lows
  comparison rows, which judge only what a low is judged by.** → ADR.
- **The two-family join test is re-pointed to a test-local Over-treated low rebound
  High.** Why: after the re-claim no committed Cause appears in two families, and
  Over-treated low is the one lever the producer drives from two anchor kinds, with
  its case-file family sorting second as the test requires. inline.
- **Chunked, serial sub-orders (four after round 2, five after round 3).** Why: after the widening, five
  slicing traits fire (multiple deliverable artifacts, live run inside the ticket,
  split-path evidence, lockstep copies, lifecycle-gated revision), and each
  sub-order projects inside the 120k–180k band. The served rule and S182 come
  first; the rows, the mirror's family filter and the scoped Pattern list follow in
  order, because each regenerates what the next reads. Reviewer-memory anchor:
  absent. inline.

### Risk contract

Copied verbatim into `openspec/changes/fixture-meal-shapes/design.md` ("Risk
contract"), which is the admitted authority.

### Coordinator rulings, round 2 (2026-09-23)

- **Q2 limit (coordinator, 2026-09-23): keep the re-claim to the rows themselves;
  record why whole episodes are not re-claimed.** → ADR (design.md).
- **Q6 (coordinator, 2026-09-23): freeze the server's Pattern list for each window
  the browser checks use, pass it in, fail loudly for any other window, amend the
  Afternoon test to the server's answer, list every moved fact; this release fixes
  it.** The windows are closed: 00:00–06:00 (desk suite), 02:15–04:45 and
  12:00–18:00 (fast gate). → ADR (design.md "The browser findings mirror serves the
  server's scoped Pattern list, or fails").
- **Q6 moves to its own sub-order 4, serial after the family filter.** Why: it
  shares the projection generator, capture and Pattern mirror with sub-order 3, and
  together they would exceed the 180k target. inline.

### Coordinator rulings, round 3 (2026-09-23)

- **Q6a (coordinator): freeze the narrowed-window Pattern case files too; any other
  narrowed Pattern request stops with an error naming it.** Why: the roster exposes
  charted scoped Patterns whose headers would otherwise read the whole day
  (00:00–06:00 Highs after meals 2 of 20 against the server's 0 of 4). → ADR.
- **Q7 (coordinator): a fifth serial step feeds the test desk the inputs the Pattern
  lists and prices come from, so its queue order matches the server's exactly in
  the whole day and each frozen window; the mirror check compares order.** → ADR
  (design.md "The test desk projects the server's own inputs").
- **The `memberless_low` mutation is deleted.** Why: it is the one input difference
  left once prices match; it makes the roster claim a meal the queue's exposures
  never claim. Measured: only Lows after meals moves (k 1 → 0); guidance Patterns do
  not. → ADR.
- **The desk suite's analysis and scenarios stubs serve the frozen inputs too.**
  Why: one input for every desk read, as in the app; the desk renders no scenario
  field and no tuning lever, so nothing rendered moves. → ADR.
- **No desk browser test or replay story encodes the old order.** Why: every
  position-dependent locator lands on the same element or does not depend on
  order, and no replay reads the fixture queue (design.md lists each). Three
  fast-gate tests encoded the old prices or order and are amended. inline.
- **Five serial sub-orders, one past the slicing rubric's practical ceiling of
  four.** Why: the coordinator ruled a fifth step; folding it into sub-order 4
  would push that chunk past the 180k target. Reported to the coordinator. inline.

## Open questions

None.

## Spawned tasks

None.

## Review rounds

- Round 0 (triage draft, lock 1 at 99bb43cd): returned to the coordinator.
- Round 1 (coordinator rulings Q1–Q5, 2026-09-23): change amended and re-pinned (a4b4106f).
- Round 2 (coordinator rulings Q2 limit and Q6, 2026-09-23): change amended and re-pinned (7b615133).
- Round 3 (coordinator rulings Q6a and Q7, 2026-09-23): change amended and re-pinned (4341bfe4).
- Plan-review r1 (2026-09-23): BLOCKED, 4 blocking + 1 note, all `authoring`
  (present since the draft): the memberless backend test the mutation's deletion
  breaks; the gate transcribed from a stale seven-line copy, and the dose/ratio
  baseline the regenerated fixtures move; per-sub-order verification lines; the
  basal row misnamed "04:00" (it is basal:420-450, 07:00); note: the ledger header's
  inventory line and ACCEPTANCE.md are coordinator-owned. All fixed in one commit
  and re-pinned; awaiting the coordinator's next `/plan-review` round.
