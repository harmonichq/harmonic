# Scope ledger — realistic QA database

Work: evolve the single-purpose revise-e2e synthetic DB into a canonical QA asset
that triggers every backend finding, calibrated (aggregates only) from a locally
fetched real snapshot. The countersigned plan and risk contract live on tracker
issue #189; the recorded decision is ADR 190 in
`openspec/changes/qa-e2e-database/design.md`.

Routed: plan-review (a written plan existed and needed stress-testing before
build).

## Decisions

- Real snapshot is calibration-only — no record-level value enters the repo;
  committed DBs stay generator-built synthetic with provenance + `--check`.
  Why: repo data boundary and contamination scan are non-negotiable. `inline`

- Cold review round 1 (Luna) returned 7 verified blocking objections (premise wrong:
  old fixture already runs projection; continuous IOB conflicts with bolus-only model
  contract; fixed 30-day/store-derived `now` breaks per-case cutoffs; QaCase schema
  underspecified; deletion test unproven; retirement blast radius; no measured
  baseline). Revision folded them in. `inline`

- Review round 2 verified fixes; three residual blocks (missed launch.json + CI
  server consumers, settings-snapshot leakage, showcase-era boundary) folded into
  plan v3 as enforced assertions. Plan countersigned. `inline`
- One committed `qa-e2e` DB (concatenated named eras, showcase-era-only projection
  with enforced >30-day separation) + per-case temporary stores for the coverage
  test; no test-only clock seam. Why: production composition fixes window_days=30
  and derives `now` from the latest store event. `→ issue`
- `scripts/qa_e2e_cases.py` owns the case catalog with published QaCase/QaExpectation
  interface (two real consumers: generator + coverage test). `→ issue`
- No continuous IOB generation — the model contract is bolus-only reconstruction.
  Why: dense IOB has no real-feed equivalent. `→ issue`
- Retirement of revise-e2e is evidence-based: enumerated executable consumers
  (generator/CI check, AGENTS/CLAUDE command, launch.json harmonic-nofetch,
  browser-gates server step, test_finding_case_file_api, public-link/allowlist pins)
  migrate first; immutable historical records stay untouched; a migration-completion
  check enforces it. `→ issue`
- Measured baseline gate before committing the full DB: two representative cases,
  coverage appendix, budgets (DB ≤25 MiB, --check ≤30 s, suite ≤90 s, case ≤15 s).
  `→ issue`
- Q1 settled: calibrate first — operator approved the real snapshot fetch;
  aggregates-only per data boundary. `inline`
- Q2 settled: replace revise-e2e (evidence-based retirement above). `inline`
- Q3 settled: verdict bands per (lever, family) with exact denominators. `inline`
- 2026-08-29 operator ruling (recorded in ADR 190): delivery reorder only —
  #191 builds the generator and case catalog; the showcase-only cut of #194
  commits the DB and migrates the stage-1 harness and launch configuration;
  #192/#193 add coverage eras afterward; the rest of #194 completes migration
  and retirement. `inline`

### Risk contract

- **Must prevent:** real record-level data (values, timestamps, quantiles) entering
  the repo in any form; silent incorrect success of the coverage test (a green run
  asserting fewer rows than the manifest); staging verdicts injected rather than
  analyzer-produced.
- **Must recover:** drift between committed DB and generator (--check fails closed
  in CI).
- **Accepted failure:** baseline budgets exceeded → hard stop before committing the
  full DB, split decision goes back to the operator; CI runner variance absorbed by
  a 3-minute step timeout.
- **Unsupported:** live-fetch data paths, multi-writer DB use, post-2025-07-01
  synthetic dates.
- **Evidence owed:** per-case exact queue rows/absences, support-floor counts,
  per-family verdict tallies, negative/suppression occurrences; generator
  showcase-boundary and snapshot-isolation assertions; migration-completion check.
- **Why:** the DB feeds QA of advisory dosing surfaces; wrong fixtures reproduce the
  historical hand-set-flag bug class. **Disposition:** copied into tracker issue
  #189 (authoritative).

## Spawned tasks

- #189 tracker — countersigned plan + risk contract (authoritative)
- #190 phase 1 — OpenSpec decision, consumer inventory, case interface (merged,
  PR #254)
- #191 phase 2 — generator skeleton, two measured cases, baseline gate
- #192 phase 3 — basal/ISF/I:C coverage eras
- #193 phase 4 — behavioral levers, suppression, verdict bands
- #194 phase 5 — commit DB, migrate consumers, retire revise-e2e

All `→ issue` dispositions above are discharged by #189–#194; no ADR-tagged
decisions remain (ADR 190 landed with #190).

## Triage instrumentation — #191

Flat order. Traits: one coherent capability (QA case catalog + generator
skeleton), one backend boundary (no projection/parity/surface work), ~4 new
files plus the change record — inside one worker context. Nearby
reviewer-memory slicing anchor (multi-boundary Diagnose work degrading broad
chunks) agrees flat is safe here: this order never crosses the
analyzer→projection→parity→surface path.

Review rounds on the #191 draft lock are instrumented here per triage 12b:

- Round 1 (Opus, cold, load-bearing): 5 blocking + 3 notes, all tagged
  `authoring`. Blockers: branch-from-default contradicted the branch-only pin;
  Expected diff vs Boundaries contradiction on this ledger; bare `--check`
  undefined with no committed artifact (fail-open risk); no Done-when covering
  whole-set expectation assertion (silent under-assertion must-prevent);
  `prepare_ic_history_events` dropped from the retained five-interface surface.
  Notes: CI drift step deferral unstated; suite-budget command ambiguous;
  generator-consumes-catalog not in Done-when. All eight folded into lock v1
  before posting; zero `injected`.
- Round 2 (Opus, cold): 1 blocking + 1 note, both `authoring` (the round-1
  fixes injected nothing). Blocker: the PR-gating contamination scan reads the
  new scripts' prose and the order neither ran it nor allowlisted
  `scripts/public_scan_config.txt` for the dose-ratio ack. Note: pin the
  `from scripts.…` namespace-package import form. Both folded into lock v1.
