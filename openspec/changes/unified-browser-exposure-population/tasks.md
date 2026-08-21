# Tasks — Unified browser exposure population (#64)

## 1. Generate one exposure population

- [x] Extend the fixed-seed Diagnose workstation generator with the meals and
      lows identities needed by both browser fixtures while preserving synthetic
      provenance and the workstation replay's required shapes. Preserve at least
      one deliberate repeated episode-and-time pair for the existing opaque-id
      selection proof; remove the accidental four-way reuse of every meal pair.
- [x] Select one `browser_exposures` object and write its `window` and
      `exposures` fields to the provenance-wrapped workstation exposure capture
      and as `payload.exposures`; preserve both files' existing provenance and
      remove their current one-day window discrepancy.
- [x] Make the event-comparison generator derive both families' episode ids,
      anchor times, dates, and source window from that population; keep its
      comparison-only cohorts, traces, verdicts, and support facts local.
- [x] Regenerate the workstation and event-comparison committed fixtures.
- [x] Regenerate the Python event-comparison projection mirror after the capture.
- [x] Make the event generator import-safe around one build/validation interface,
      require the comparison plan's full source-row cardinality without modulo
      reuse, then test one removed source row, an outside-window date, exact
      window equality, and projected-window republication through dependency-
      free tests.

## 2. Prove both panes use it

- [x] Add stable story S40, a lows roster-selection story beside the existing
      meal story, in the
      shipped Diagnose behavior replay. Drive the visible finding, switch to By
      event, select a visible low row, and assert that the endpoint-selected
      occurrence and drawn trace carry that row's join key while an observed
      request URL carries the opaque occurrence id. Strengthen the meal story to
      observe its request too.
- [x] Register S40 in the replay's closed inventory, update the ledger's story
      count and #64 enumeration, and preserve fail-closed zero-story behavior.
- [x] Run the full fast gate, every committed drift check, and all browser gates
      exactly as `AGENTS.md` documents them, using only the sanctioned no-fetch
      synthetic server command for the served legs.
- [x] Finish this change record before opening one draft pull request. Do not
      merge.

## Verification

- `uv sync --frozen --extra api --extra sync`: 53 packages checked.
- Backend: 1,857 passed, 1 conditional skip, 0 failures.
- Frontend: 374 passed, 0 skipped, 0 failures.
- ADR, owned-identifier, and public-allowlist guards: all passed.
- All Python and JavaScript fixture drift checks: current.
- Non-served browser legs: Day 3/3; Diagnose 14/14; cockpit 10 passed with its
  declared render-matrix skip; browser runner 1/1; first-plan reconcile 4/4.
- Served browser legs: Diagnose 43/43; event comparison 13/13; support audit 7
  renders; Verify 8/8. The server used only the documented generated database
  and `--no-fetch` command.

The first whole-gate pass caught three integration assumptions that the focused
chunk checks did not: expanded rows changed the workstation sift shape,
workstation attribution leaked into comparison-local outcomes, and S37/S39/S13
still asserted pre-unification population counts. Each was corrected at its
own authority and re-reviewed before the complete gate passed on the assembled
branch.
