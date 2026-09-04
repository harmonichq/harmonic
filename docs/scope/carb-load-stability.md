# Scope ledger — carb load vs glucose stability

Exploration: relationship between carb load (isolated high-carb eating windows;
rolling multi-day carb averages) and glucose stability (time in range,
pre/post-meal swing, average glucose), including knock-on effects 6–12+ hours
after a high-carb window. Goal: prototype scripts → candidate detection methods
and charts for Diagnose.

## Decisions

- Route: prototype (data exploration in running code), coordinated under
  /orchestrate with Codex workers per routing table. Why: hypothesis is
  empirical, only testable against data. — inline
- Prototypes get a coordinator review pass before dispatch/merge, mirroring the
  /ticket review bar, per operator instruction. — inline

- Q1: ground against a real read-only snapshot of the operator's own database,
  taken via harmonic-db-fetch, opened `Store.open_readonly` only, deleted when
  done; no record-level value leaves the machine. Why: the hypothesis is
  empirical and synthetic fixtures cannot contain it. — inline
- Q2: file the exploration ticket now; all prototype work runs from a
  spin-worktree worktree. — → issue
- Q3: eating window = chain of boluses where each new bolus re-opens the chain
  while the gap to the previous bolus is ≤ the merge threshold; default 30 min,
  agent may widen up to 60 min if findings are light; carbs summed across the
  chain. High-carb cutoffs and knock-on horizons are measured (quantiles;
  sweep 4/6/8/12/16 h), not assumed. — inline
- Everything the agents build is relative to the user's own averages and
  distribution — no fixed carb-gram, glucose, or horizon constants anywhere in
  a detection method or chart; constants may exist only as sweep defaults the
  data overrides. Why: operator decision 2026-08-30. — inline

### Risk contract

- Must prevent: secret exposure; any record-level value from the snapshot
  (glucose, doses, event timestamps) appearing in a commit, ticket, PR body,
  CI log, or worker prompt — row counts, quantile summaries, correlations, and
  wall times only; silent incorrect success (a script that runs green on zero
  qualifying windows must say so).
- Must recover: nothing automatic — exploration scripts may stop on error.
- Accepted failure: light or null findings; scripts report "no supported
  relationship" and the exploration closes with a written negative result.
- Unsupported: live database access, `harmonic fetch`/normal `serve`, staging
  any recommendation into the Plan — this is analysis only, no safety-path or
  analyzer changes in this ticket.
- Evidence owed: prototype scripts are throwaway (no shipped tests owed);
  each script's output states its window count and exclusion counts so a
  hollow run is visible.

Why: snapshot-grounded exploration on one person's health data; the harm
surface is data leakage, not dosing (nothing stages). Disposition: copy into
the exploration ticket at admission.

- Round-1 findings (real snapshot, 422 d / 939 windows): isolated high-carb
  windows recover cleanly (best TIR at 6–12 h); instability concentrates in
  windows followed by further eating windows within the horizon, strongly
  carb-graded in the evening (TIR 75%→40–50% Q1→Q5 at 4–6 h). Rolling
  24/48/72 h load: rho ≈ −0.1..0.2, no effect. Next-day/overnight knock-on:
  none (overnight best of all). Swing scales with window carbs (median
  37→58 mg/dL Q1→Q5). ~236/421 days fail the 70% CGM-coverage gate. — inline
- Round 2: re-center detection on **eating sequences** — windows chained when
  the next window starts within N h of the previous window's end; sequence
  carb total is the load measure; must separate repeat-eating effect from
  total-carb effect at matched loads. Why: that is where round 1's signal
  lives; operator approved 2026-08-30. — inline

- Round-2 findings (real snapshot, 516 sequences at 3 h chain gap): sequence
  carb load grades in-span TIR monotonically (pooled 100→74% Q1→Q5; evening
  100→37%, Q5 mean 192). Post-sequence effect persists at 4–6 h (pooled 4 h
  Q5 67% vs ~87–93%), washed out by 12 h except evening Q4. Repeat eating
  amplifies at matched carbs (middle quintile, 2+ windows vs 1: 12 h TIR 71%
  vs 89%, SD 47 vs 33). Worst well-populated cell: 3+ windows × Q5 at 4 h —
  TIR 54%, mean 173 (n=46). Q5 sequences: median 123 g / 3 windows, spans to
  11 h. Detection candidates: high-carb-sequence detector (user-relative top
  quintile, evening-weighted) and repeat-eating amplifier (3+ windows).
  — inline

- Build-phase decisions (operator, 2026-09-04): the spec comment's five open
  recommendations are adopted as written — fixed Diagnose source window;
  headline only on a supported Q5-vs-Q1–Q4 or matched 3+-vs-1 comparison;
  evening headline only when pooled and evening both clear the floor;
  in-sequence / 4 h / 6 h intervals only; the 2-window band is descriptive
  only. A grounding pass may override one only on code or snapshot evidence.
  #274–#278 run in dependency order; #278's ui-craft lock call is the
  coordinator's; Opus polish/critique passes close #278. — inline
- The eating-sequence contract (#274) pins the exploration's own definitions:
  windows chain carb-bearing boluses by ≤30 min from the latest bolus in the
  chain; sequences chain windows by ≤3 h from the latest window's last bolus;
  balanced empirical quintiles assign rank i of n to quintile
  min(4, i·5 // n) over sequences ordered by (carb total, start time), with
  boundaries as midpoints between adjacent ordered values at each cut;
  coverage counts occupied five-minute slots over ceil(span/300 s). — inline

### #274 lock review rounds

- Round 1 (cold, Terra): 5 blockers, all `authoring` — anchors selected
  detector requirements the lock forbade; nested report keys unnamed; a
  test helper with no caller (charter deletion test); node fast gate missing
  from Verification; ambiguous branch line. Fixed in 738b206.
- Round 2 (same reviewer, deltas): 3 blockers — timestamp-rejection test vs
  mandated window bounds (`injected` by round-1 fix 2); no Q5-vs-Q1–Q4
  comparison rows (`authoring`); evening quintile assignment unspecified
  (`authoring`; grounded in the exploration: pooled assignment, evening
  filters). Fixed in 3378709.
- Round 3 (same reviewer, deltas): 0 blockers. Countersigned.

### #274 code review rounds (Luna, Targeted, two axes)

- Round 1: 2 findings — caller-owned `window`/`finding` dicts passed
  arbitrary keys through (fixed by typed frozen rows); TIR bounds float vs
  the spec's integer array (fixed; tasks.md amended under lock 2). One
  evidence gap: no non-divisible-n quintile test (added, n=13).
- Round 2: populated-finding serialisation test owed (added). The request
  for runtime type/enum validation inside the rows was discarded as
  assurance beyond the contract (charter: no guards for unreachable states).

### #275 lock review rounds

- Round 1 (cold, Terra): 3 blockers, all `authoring` — span_end derived from
  basal the wrapper was not told to read; the HTTP route absent from the
  acceptance anchors; prose acceptance anchors. Fixed in 5ffa4c3.
- Round 1 re-check: 1 `injected` blocker — the new route requirement demanded
  `input_data_age` on a fresh fixed response. Mechanical wording fix in
  3e1102c. Countersigned; fresh cold pass owed (sub-order 1 is Full).
- Fresh pass (panel 2, Terra): 3 blockers — warm roster contradicts the
  scheduled-fetch contract (`authoring`; dropped, deferred to #277); stream
  slicing to the window unspecified (`authoring`); 400 vs framework 422
  (`authoring`). Re-check: 2 `injected` — half-open slice stated against an
  inclusive `_slice`; stale warm sentence in the proposal. Mechanical fixes in
  9e3499c. Countersigned; panel 3 fresh pass dispatched.
- Panel 3 (fresh, Terra): 3 blockers — no generated-facts appendix
  (`authoring`; facts.md added); gate not transcribed byte-exact
  (`authoring`; lock rewritten); SD-only adverse comparison had no headline
  rule (`authoring`; settled: TIR-drop tier first, SD-rise tier only when no
  TIR drop, two fixed summary templates). Re-check: countersigned at the
  panel cap. Lock 1 posted.

### #275 code review rounds

- Chunk 1 (Opus, Full, two axes + mutants): r1 — task 4 evidence largely
  absent; cohort predicate duplicated in comparison and finding; r2 — 30-min
  merge boundary unobservable (nothing read `window_count`), TIR-over-SD
  precedence untested, Carb-log half-open bound untested; fixed by making
  `build_sequences`/`EatingSequence` the public primitive and pinning all
  three; r3 converged. Unconstructable by design: an evening headline
  withheld while pooled is insufficient (evening ⊂ pooled).
- Chunk 2 (Luna, Targeted, two axes): r1 — the 400 detail named no window;
  fixed to derive the day count from the fixed-window constant; converged.
- Whole diff (Opus, Full): converged; one latent gap closed by the
  coordinator — the frozen fixture was pinned to `build_report` only, and
  now the parity test also runs the served store wrapper against it.

### #276 lock review rounds

- Pre-review: spec-delta headers written as `### Requirement N:` were not
  parsed by openspec (`authoring`; coordinator renamed them, 772c396).
- Panel 1 (cold, Terra): 1 blocker — facts.md transcripts spliced and one
  line number stale (`authoring`; regenerated from scratch, 5830813).
  Re-check: countersigned. Panel 2 fresh pass dispatched (Full depth).

### #276 code review rounds (Opus, Full, two axes)

- r1: duplicated period-label map; band strings hardcoded beside a
  config-driven matrix; empty-window repeat skeleton untested through
  `build_report`. Fixed in 3dd0c43. r2: converged (one inert default copy
  of the band strings noted, and the finding sentence's "three or more" is
  fixed by the spec while the band boundary stays 3).

- Diagnose home for the eating-sequence report (coordinator decision,
  2026-09-04, grounded in the record): "Explore mode" was retired as a mode
  toggle (ADR 215, sanction 2026-08-26) and the named "better version" is the
  dock for ranked findings' evidence, which this non-finding aggregate does
  not fit; the drawer/stage field builds descriptors from findings rows only
  (ADR 306). The report therefore gets a distinct, explicitly non-advisory
  aggregate-evidence section on the Diagnose surface, outside Audit and
  outside Watching (whose definition is tuning reads only). #277 delivers
  the data plumbing (fetch, Vue-free adapter, age handling, browser-gate
  route answers, harness path) with no rendered surface; #278's ui-craft
  lock settles the section's name, placement and charts. The QA showcase
  yields an all-insufficient report (32 carb boluses ~24 h apart), so
  rendered evidence comes from the frozen synthetic fixture unless #278 adds
  a QA coverage era. — inline

### #277 lock review rounds

- Panel 1 (cold, Terra): r1 3 blockers — facts appendix stale (`authoring`);
  browser stubs with no consumer (`authoring`; deferred to #278); the paired
  Q5-vs-rest chart needed reference medians the report served only as
  differences (`authoring`; settled: comparison rows now carry both cohorts'
  aggregates, making the ticket two serial chunks). r1b 5 blockers, all
  `authoring` (facts outputs, repeat-row JSON, equality test scope, adapter
  interface, task numbering). r1c 3 `injected` transcription defects, fixed
  by the coordinator in place. r1d countersigned.

### #277 code review rounds (Luna, Targeted)

- Chunk 1: clean (13/13, 10/10). Chunk 2: clean (12/12, 11/11).
- Whole diff: 1 finding — the frozen fixture differs between supported
  interpreters (Python 3.12's compensated float `sum()` vs 3.9 in the
  per-sequence mean). Fixed by a follow-up chunk: `fmean` plus fixed served
  precision at the analyzer, fixture regenerated, `--check` proven on both
  interpreters.

## Open questions

(none)

## Spawned tasks

- exploration ticket: https://github.com/harmonichq/harmonic/issues/262
- detection + charts spec: https://github.com/harmonichq/harmonic/issues/262#issuecomment-5470787476
- build tickets (dependency order): #274 contract → #275 high-carb detector,
  #276 repeat-eating amplifier → #277 Diagnose projection → #278 charts
  (ui-craft lock then build)
- prototype scripts: branch 262-carb-load-stability, prototypes/262/ (4
  commits, never pushed; throwaway — not for merge to main)
