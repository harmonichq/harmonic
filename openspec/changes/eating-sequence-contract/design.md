# Design — eating-sequence aggregate detector contract (#274)

## ADR 274 — A separate, advisory-only aggregate report locks user-relative evidence

The carb-load stability scope ledger settles the eating-sequence definitions and
the later delivery order (#274–#278). This record makes those settled decisions
one implementable contract rather than reopening them.

- **The report is advisory-only and separate from the tuning result.**
  `AnalysisResult` is the tuning result, with its Plan, Consolidated profile,
  deliverable, `TuningLever`, Priority, and safety-path relationships. An
  eating-sequence report describes aggregate associations in pump-recorded carb
  and CGM history, so it receives its own immutable,
  `eating-sequence-report-v1` contract under `analyzers/`. It neither imports
  nor couples to `safety.py`, and its public shape excludes timestamps, event
  rows, Day links, raw EGVs, and per-occurrence data. This keeps an aggregate
  observation from becoming a setting recommendation. [Scope ledger:
  advisory-only risk boundary and build-phase decisions.]
- **Carb grouping is empirical and user-relative.** The config holds only
  code-owned definitions and data-quality gates. It has no fixed carb cutoff:
  all sequences sort by `(carb total, sequence start)` and receive balanced
  empirical Q1–Q5 ranks; boundaries are adjacent-value midpoints. The served
  rows use 1-based quintile labels, while the implementation may use the pinned
  0-based calculation internally. Boundaries interpret this user's cohorts and
  are never reusable clinical thresholds. [Scope ledger: eating-sequence
  contract pin.]
- **Insufficiency is a present, non-concluding result.** Each interval carries
  `status` and its true qualifying `n`. Below eight, all metrics are null and
  the row cannot support a comparison or headline. The zero-sequence report is
  a complete all-insufficient skeleton, not missing output or an empty success.
  This directly closes the ledger's must-prevent hollow-run risk. [Scope ledger:
  risk contract and build-phase decisions.]
- **The analysis window is Diagnose's fixed source window.** Later producers
  use `findings_projection.DIAGNOSE_SOURCE_WINDOW_DAYS`, not a detector-local
  range, so every aggregate denominator has the same named source window as
  Diagnose. [Scope ledger: build-phase decisions.]
- **#275 owns the committed JSON fixture and generator.** #274 adds only a
  synthetic event-stream builder for tests. Before #275 builds store-event
  primitives and a report producer there is no production-shaped artifact to
  generate; committing JSON now would violate the repository rule that every
  committed fixture ships with its producer and `--check` gate. #275 therefore
  adds `scripts/gen_eating_sequence_fixtures.py`, its generated fixture, and
  drift check together. [Scope ledger: risk contract; AGENTS.md fixture rule.]

The future detector modules own construction, eligibility, and conclusions but
must consume this contract: windows chain carb-bearing boluses within 30
minutes; sequences chain windows within three hours; intervals are in-sequence,
post-4-hour, and post-6-hour only; scopes are pooled and evening; and the
two-window band remains descriptive. The report contract records their
eventual input and output shape without bringing their implementation into this
change.
