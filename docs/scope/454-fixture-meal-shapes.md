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
- **Chunked, three serial sub-orders.** Why: after the widening, five slicing traits
  fire (multiple deliverable artifacts, live run inside the ticket, split-path
  evidence, lockstep copies, lifecycle-gated revision), and each sub-order
  projects inside the 120k–180k band. The served rule and S182 come first; the rows
  and the mirror's family filter follow in order, because each regenerates what the
  next reads. Reviewer-memory anchor: absent. inline.

### Risk contract

Copied verbatim into `openspec/changes/fixture-meal-shapes/design.md` ("Risk
contract"), which is the admitted authority.

## Open questions

- **Q6 (new finding, returned to the coordinator).** The browser-gate population
  (`frontend/browser-fixture-population.js` `populateFindingsProjectionInput`)
  supplies only the whole-day Pattern roster, so in every scoped window the findings
  mirror serves no Pattern row and folds no Cause, where the server serves both
  Patterns and folds Late bolus and Correction on active insulin (base 06:00–12:00
  verified). Base counts match only by coincidence. After the Q2 re-claim, the
  mirror serves `counts.finding` 5 and `chip_counts.lows` 2 in 06:00–12:00 and
  12:00–18:00, where the server serves 4 and 1. The Afternoon fast-gate test
  already pins the mirror's answer. Default recommended to the coordinator: widen
  #454's third sub-order to freeze the server's scoped rosters for the closed set of
  windows the browser gates request, have the population supply them, and fail
  closed for any other scoped window.

## Spawned tasks

None.

## Review rounds

- Round 0 (triage draft, lock 1 at 99bb43cd): returned to the coordinator.
- Round 1 (coordinator rulings Q1–Q5, 2026-09-23): change amended and re-pinned;
  awaiting the coordinator's `/plan-review`.
