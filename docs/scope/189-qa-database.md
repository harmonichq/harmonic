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
- Round 3 (Opus, cold, panel cap): 2 blocking + 2 notes, all `authoring`.
  Blockers: the generator's default artifact content was undefined (resolved
  from ADR 190 — showcase case is the sole era; coverage cases stay in
  temporary stores); the public tree copies git-tracked files only, so an
  unstaged scan false-greens. Notes: rule-4 timestamp-series remedy is the
  `# SYNTHETIC-FIXTURE:` marker, not the dose-ratio baseline; the scan reads
  tests' prose too. All four folded into lock v1. Cap reached with blockers
  still arriving; both were derivable from the pinned source rather than
  unsettled decisions, and the posting call went to the operator with this
  disclosed.

## Triage — #194 (showcase cut)

Routed: interview mode (the operator ruling names the cut; what "migrate the
stage-1 harness" means and whether the thin showcase era honors the ruling's
intent are the operator's decisions).

Measured this session from origin/main 3886c63, showcase-only generator output
in scratch versus the committed revise-e2e store:

| Store | Size | Rows | Queue | ISF rest windows | I:C runs / history | Exposures (lows/meals/highs/corr) |
| --- | ---: | --- | --- | ---: | --- | --- |
| qa-e2e showcase | 139 KB | 356 CGM, 12 basal, 4 bolus, 1 settings (2024-06-01..29) | 1 basal assert, 3 findings, 0 history | 0 | 2 / 0 | 5 / 2 / 2 / 2 |
| revise-e2e | 4.2 MB | 28,800 CGM, 28,800 basal, 600 bolus, 2 settings (100 days) | 1 I:C assert, 1 finding, 1 history | 30 | 179 / 1 | 96 / 180 / 0 / 0 |

Other grounding: `tests/test_gen_qa_e2e_db.py` asserts a bare `--check` exits 1
while the artifact is absent (flips on commit); serving any committed store
flips it to WAL and writes `-wal`, `-shm` and `<db>.derived.sqlite` beside it,
none gitignored; the harness owns no database path (manufactured mode reads
JSON fixtures, live mode proxies port 8765; its README names the old generator
for restore); `scripts/check_public_links.py` pins the revise-e2e path for
AGENTS.md/CLAUDE.md only.

### Decisions (#194)

Operator delegated all four calls (2026-09-01): "you make the calls, you get
this shipped". Stated need: the committed store is too thin to render parts of
the app, so real data has had to stand in.

- Q1 = C: the showcase era gains a dense 30-day background (5-minute CGM and
  basal, daily meals, overnight fasting, one earlier carb-ratio setting) so
  every Diagnose story renders, before the offline app moves to it. Why: the
  ruling's payoff is a fed harness; moving to the thin era hands the operator a
  poorer app for ISF, I:C and clock-strip stories. Expectations stay
  analyzer-produced, never hand-set. `inline`
- Q2 = B: the harness migration is a launch entry that serves the qa-e2e store
  on port 8765 plus the README naming it; no new harness source. `inline`
- Q3 = B: that launch entry (and the documented command) serve a scratch copy,
  so the tracked store never flips to WAL; sidecar and derived-store patterns
  are gitignored as belt and braces. `inline`
- Q4 = A: launch, harness README, the AGENTS.md permitted command and its
  public-link pin move now; CI browser-gates server, case-file route test,
  allowlist pin and retirement wait for #192/#193. `inline`

### Open questions (#194)

None. Frontier empty after round 1.

## Triage instrumentation — #194

Flat order. Traits: multiple deliverable artifacts fires once (catalog
primitive + committed fixture + CI step + entrypoint docs), no live run (rendering
inputs proven through the producers in tests), no lockstep copies (generator and
fixture are checked by one tool). Nearby reviewer-memory slicing anchor (#191's
flat call on the same catalog/generator shape) agrees flat.

- Round 1 (Opus, cold, load-bearing): 3 blocking + 4 notes, all `authoring`.
  Blockers: AGENTS.md "no revise-e2e path" Done-when contradicted the
  browser-gates reproduction block that must keep naming what CI serves;
  dense-background composition order unspecified against last-write-wins
  upserts, and no non-empty floor on the regenerated expectation; the ISF
  rest-window count named no source and the obvious producer raises outside
  the API layer. Notes: shared `_BEHAVIORAL_ROWS` constant; baseline stated in
  queue units not catalog units; stale drift-check count sentence; launch entry
  missing `--token ''`. All seven reproduced against the tree and folded into
  lock v1; zero `injected`.
- Round 1b (same Opus reviewer, delta re-check): 2 blocking + 1 note, all
  `injected` by round-1 fixes. Blockers: the composition-order paragraph
  claimed timestamp-keyed upserts for every table (basal and bolus conflict on
  `seq_num`, so a dense-first background numbered from 1 gets rewritten in
  place); the "sole offline exception" sentence was left authorizing one serve
  while the document now prints two. Note: the revise-e2e pin reason no longer
  describes its citation. All reproduced and folded into lock v1.
- Round 1c (same reviewer, delta re-check): 1 blocking + 1 note, both
  `injected`. Blocker: disjoint `seq_num` ranges let a background delivery and
  a coverage delivery coexist at one timestamp (basal/bolus have no `t`
  uniqueness), the doubled-slot pathology; fixed by excluding coverage
  timestamps from the background and asserting at most one bolus per instant.
  Note: keep the mandatory `--no-fetch` statement through the sentence
  rewrite. Injected count climbing (0 → 2 → 1) is the rewrite-clean signal;
  the residual was one clause, so the order went to a fresh cold panel next
  rather than a fourth same-reviewer pass.
- Round 2 (Opus, fresh cold panel): 1 blocking `authoring` + 6 notes. Blocker:
  `_BasalTimeline` resolves each minute to the last segment started at or
  before it, so 5-minute background basal rows shadow the setting-recommendation
  recipe's hour-long 03:00 segments and the inherited asserting slots cannot
  survive; the composition rule and the "no instant carries two deliveries"
  invariant were unsatisfiable together. Rewritten clean: the background owns
  basal outright and carries the asserting night slot itself (task 4 amended,
  re-pinned); the showcase overlays only the behavioral recipe. Notes folded:
  pinned background span (window start derives from the store's last event),
  ledger committed with the re-pin, gitignore comment must not name the
  committed path, launch entry clears the scratch stem's sidecars, baseline
  commands named, new expectation fields default.
- Round 3 (Opus, fresh cold panel, cap): 3 blocking `authoring` + 5 notes.
  Blockers: the migration checklist and task 6 said the public-link pin
  "moves" while the order (correctly) adds it beside the revise-e2e pin, and
  the checklist was outside the closed diff; the two new expectation fields had
  no proof-of-failure clause (the risk contract's silently under-asserted run);
  the history acceptance was satisfiable by a row id with an empty series.
  Notes: `profile_settings` conflicts on `(captured_at, idp)` and both recipes
  already collide there; "no empty day" was five minutes wrong; isolated-case
  defaults unmeasured (measured: both cases publish 0 history ids, 0 rest
  windows, 0 history series); stale AGENTS.md harness-test sentence; stale
  proposal boundaries. All reproduced and folded; record amended and
  re-pinned. Cap reached with blockers still arriving, every one derivable
  from the pinned source rather than an unsettled decision; posted on the
  operator's delegation with this disclosed.

## #192 triage

The original `qa-e2e-database` change was archived by PR #312, so #192 opens
`openspec/changes/qa-e2e-coverage-eras/` as the active successor while citing
archived ADR 190 and ADR 194 as standing authority. The operator's 2026-09-01
rulings settle the remaining scope: this new change is the record home; the last
#194 cut is replaced by a follow-on ticket that owns the remaining migration,
retirement, and agent-facing guidance; and #192 concatenates its coverage eras
into the committed QA database while retaining isolated per-case stores. No
genuine uncertainty remains for a `/scope` interview.

Flat order. Traits fired: none. The work stays on one analyzer-fed fixture
boundary; it introduces no server projection implementation, rendered surface,
browser run, live resource, trust-boundary write, split-path harness, or unchecked
lockstep copy. The generator, catalog, and their two test files are shared by every
era, so parallel chunks would collide on file ownership. A nearby reviewer-memory
anchor agrees with the flat call.

Review rounds on the #192 draft lock (the coordinator fills this table):

| round | blockers | authoring | injected |
| --- | ---: | ---: | ---: |
| 1 | 7 | 7 | 0 |
