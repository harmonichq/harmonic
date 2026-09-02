# Design — QA E2E coverage eras

## Standing authority

The archived [ADR 190](../archive/2026-09-01-qa-e2e-database/design.md#adr-190--one-showcase-first-qa-database-with-isolated-coverage-cases)
remains authoritative for one showcase-first committed database, production
composition, synthetic provenance, and no test-only clock seam. The archived
[ADR 194](../archive/2026-09-01-qa-e2e-database/design.md#adr-194--dense-showcase-background-served-from-a-scratch-copy)
remains authoritative for the dense showcase and scratch-copy no-fetch serve. ADR
192 below supersedes only ADR 190's coverage-membership ruling.

## Existing seam and shared expectation contract

`scripts/qa_e2e_cases.py` owns three manufactured cases, dense-background and
focused-recipe primitives, and production-path execution. `execute_case` runs
`analyze`, exposures, scenarios, findings projection, and I:C history. Today
`assert_expectation` compares four collections exactly, reads rest windows from
ISF row zero only, and compares ISF rest windows and I:C history series by integer
count (`scripts/qa_e2e_cases.py:187-210`).

Task 1 keeps that public fixture language and defines `AnalyzerRowKey` as the
analyzer family plus its emitted parameter key: basal clock-slot label, ISF
segment, or I:C block. `ExpectedAnalyzerRow` records the exact `safety_status`,
direction when applicable, `asserts_move`, and whether the value is expected to
be omitted. `QaExpectation` gains
`analyzer_rows: Mapping[AnalyzerRowKey, ExpectedAnalyzerRow]` and
`absent_analyzer_rows`. Every case pins all three analyzer families over the
full emitted key set because every case runs full `analyze`
(`scripts/qa_e2e_cases.py:162-168`); the compact row shape makes that exhaustive
contract tractable and makes a stray stageable move in a non-target family fail
closed.

`QaCase` also gains
`scoped_windows: tuple[tuple[int, int], ...]`, expressed as clock minutes and
empty by default. `execute_case` keeps `whole_day()` and additionally projects
each declared window through `WindowQuery.clock`
(`window_membership.py:47-60`). Queue expectations and absences are keyed by
`(window | "whole_day", row key)`. Task 1 further extends the expectation to
support values; ISF rest-window rows keyed by ISF row identity plus
`(date, start, end)` across every ISF row, including an empty ISF list; and one
projected I:C history series per active identity keyed by identity, including an
empty set. Non-active identities remain available through
`PreparedFindings.history_catalog` (`findings_projection.py:169-171`). Recipes
never accept or write a verdict, status, direction, held reason, lifecycle,
register, queue row, priority, or rank.

## Coverage-case isolated-store spans

New coverage cases declare a source span in days, and `materialize_case` writes
that many manufactured days ending at the case's `now`. The catalog imports the
constants rather than repeating their values:

| Family | Declared source span | Why |
| --- | --- | --- |
| Basal | `window_days`, plus `_BOLUS_LEADIN` when the recipe places boluses | The 30-day production request needs the bolus-only IOB lead-in only when bolus rows exist. |
| ISF | `window_days + _ISF_DECISION_INTERVAL + _BOLUS_LEADIN` | The prior-decision replay reads seven days before the current request (`analyze.py:90,317-330`). |
| I:C | `BLOCK_WINDOW_DAYS + _BOLUS_LEADIN` | Block observation age and meal-run evidence read the fixed I:C history span (`analyze.py:438-457`). |

The three existing cases receive literal declarations matching their current
recipe extents rather than family-derived policy: `showcase` declares span 30 at
its existing anchor; the committed database bytes, showcase recipe, and produced
rows remain unchanged, while its expectation is re-expressed in the extended
contract with no observed value changing;
`setting-recommendation` declares span 12 and keeps its bolus-free recipe without
a lead-in; `behavioral-precedence` declares span 30 and keeps its current recipe
shape. The latter two derive any new exact expectation fields from analyzer
output. `window_days` remains
30 and production still derives `now` from the store's latest basal/CGM event.
`_BOLUS_LEADIN` and `_ISF_DECISION_INTERVAL` come from
`ciq_autotune.analyze`; `BLOCK_WINDOW_DAYS` comes from
`ciq_autotune.analyzers.ic`. No test-only clock seam or continuous IOB is added.

## Era condition matrix

“Produce” below means source rows must drive the production analyzer to the
condition; it never permits writing the condition into a fixture.

| Era | Analyzer-produced condition to prove | Queue contract |
| --- | --- | --- |
| Basal raise / lower | At least eight informative non-tie nights on the same side of programmed basal survive the family-corrected sign test, and the median differs from current beyond the noise floor (`safety.py:32-39,63-106,206-226`; `analyzers/basal.py:348-374,499-509`). | Exact `assert` row with matching direction and `asserts_move=true`. |
| Basal capped raise / lower | The supported condition holds and the uncapped target exceeds the ±20% step (`safety.py:143-148,200-226`). | Exact `assert` row with cap status and bounded recommendation. |
| Basal insufficient | A visible estimate differs from current but has no supported matching sign, including a seven-night below-floor case (`safety.py:63-71,192-222`; `analyzers/basal.py:503-509,562-564`). | Exact analyzer/support row, `QaCase.scoped_windows` `held`, no global assert, `asserts_move=false`. |
| Basal blind | No clean day yields an estimate (`safety.py:197-204`; `analyzers/basal.py:499-509`). | Exact `QaCase.scoped_windows` `blind` row and no global row. |
| Basal no baseline | A clean estimate exists without a programmed current value (`safety.py:200-204`; `result.py:156-166`). | Exact `QaCase.scoped_windows` `held`, missing current value, no global assert. |
| Basal no change | The bounded estimate is within 0.05 U/h of current (`safety.py:143-148,212-214`). | Exact analyzer row and absence from `QaCase.scoped_windows`/global queues. |
| Basal recurring-low lower | Recurring basal-attributed lows move the safe direction lower, including the zero-clean-day variant (`safety.py:229-279`; `analyzers/basal.py:510-522`). | Exact lower `assert`, `asserts_move=true`; never blind. |
| Basal recurring-low gate | A low gates a raise or recurring lows meet a median at/above current (`safety.py:238-260,268-283`). | Exact `QaCase.scoped_windows` `held`, no global assert, `asserts_move=false`. |
| ISF strengthen | Fully observed rescue history is silent, no correction harm exists, the band and vote support strengthen, and the signal held at the prior decision point (`analyzers/isf.py:509-525,611-622`). | Exact ranked `assert` with recommendation and `asserts_move=true`. |
| ISF weaken / direction-only | Correction-caused lows or attributed rescues clear recurrence; the analyzer emits weaken without a recommendation (`analyzers/isf.py:528-591,818-827`). | Exact visible direction, no queue rank or recommendation, `asserts_move=false`. |
| ISF held | An estimate is visible but no direction is owned because harm gates, observation is incomplete, evidence is wide, current is confirmed, or persistence is absent (`analyzers/isf.py:593-628`). | Exact `held` row and analyzer-owned reason. |
| I:C collecting | A 30-day store leaves `observed_days < BLOCK_WINDOW_DAYS`, which forces every block to `collecting` (`analyze.py:438-457`; `analyzers/ic.py:2429-2430`). | Exact collecting analyzer row and absence from `QaCase.scoped_windows`/global queues. |
| I:C raise / lower | `observed_days` reaches `BLOCK_WINDOW_DAYS`; at least eight effective closed meal runs produce a non-wide, band-excluding, regime-supported recommendation different from current (`analyzers/ic.py:120-163,1449-1472,2429-2438,2503-2523`). | Exact `assert`, direction, support count, and `asserts_move=true`. |
| I:C capped raise / lower | The same mature-span conditions hold and the half-gap exceeds the ±20% bound (`analyzers/ic.py:1449-1464`). | Exact `assert` and bounded recommendation. |
| I:C held | The mature block names a move but the regime bracket straddles programmed or meal/pre-empted harm gates tightening (`analyzers/ic.py:2448-2501,2524-2526,2633-2643`). | Exact `held`, no global assert, `asserts_move=false`. |
| I:C quiet | The mature block is below the eight-run floor, unmeasured alone, agrees with programmed, or otherwise owns neither move nor held reason (`analyzers/ic.py:2430-2446,2638-2643`). Include a seven-run case separately from collecting. | Exact analyzer block and explicit `QaCase.scoped_windows`/global absence. |
| I:C history register | A snapshot-proven past block identity differs from current, is ever publishable, and has enough in-window runs for an active measurement (`analyzers/ic.py:2198-2278`). | Exact active history row and one exact projected series per active identity. |

## ADR 192 — Isolated coverage stores, showcase-only committed database

**Decision.** The committed database remains showcase-only. Concatenating older
coverage data changes analyzer semantics: `analyze` loads streams unwindowed and
derives `span_start` and `insulin_history_start` store-wide
(`analyze.py:174-176,200-206`), caps I:C `observed_days` from that earliest history
(`analyze.py:438-441`), and I:C forces blocks to collecting below
`BLOCK_WINDOW_DAYS` (`analyzers/ic.py:2429-2430`). ISF also needs its prior
decision replay (`analyze.py:90,317-330`). Each new coverage case therefore runs
in its own store with the applicable family span above; existing catalog recipes
retain the shapes recorded in the preceding section.

This supersedes ADR 190's coverage-membership clause. ADR 190's other rulings stay
in force. The bytes of `mockups/qa-e2e.synthetic/harmonic.sqlite`, the showcase
recipe and its produced rows, and `gen_qa_e2e_db.py --check` remain unchanged.
The showcase expectation is re-expressed in the extended contract with no
observed value changing. The committed database membership is exactly one case:
`showcase`.

The executed span probe and complete output in `generated-facts.md` demonstrate
the boundary with existing recipes: the 30-day showcase is collecting at 29
observed days, while the imported-constant long store reaches 90 observed days
and a numeric I:C state. The same 30-day store still emits one ISF row, but the
family span is required for prior-decision outcomes.

## Per-case emission for UI work

`scripts/gen_qa_e2e_db.py --case <name> --out <path>` materializes exactly one
catalog case into a provenance-stamped SQLite store through the same public
materializer used by tests. `--out` is mandatory whenever `--case` is present;
`--case` and `--check` are mutually exclusive. A missing output fails without
writing anything, and an unknown case fails while naming the available catalog.
The output is scratch data and is never committed. A one-line `AGENTS.md`
amendment permits it through the existing mandatory copy-then-serve, `--no-fetch`
workflow by substituting the emitted path for the committed path. The generator's
default mode and `--check` remain showcase-only. The follow-on task still owns
the complete named-case and UI-decision guidance in `AGENTS.md` and `CONTEXT.md`.

`tests/test_qa_e2e_cases.py` generates one unittest method named
`test_case_<name with '-' replaced by '_'>` for every catalog case. Each method
carries its original case name. A guard decodes those methods back to case names
and compares the set with `{case.name for case in QA_CASES}`; the literal exact
catalog-tuple test remains a separate drop guard.

## Exactness, public-tree scan, and provenance

Expectation comparison is whole-set equality for analyzer rows, each queried
queue, each explicit absence, support values, and staging values. Tests perturb
one expected value in each class and require failure. No subset assertion
satisfies the contract.

Every committed artifact is generator-built and provenance-stamped. Each era's
literal 48-slot half-hour basal series (`findings_projection.py:75`) is hoisted to
its own module-level constant directly below a
`# SYNTHETIC-FIXTURE: <reason>` marker, never inline in `QA_CASES`. Exact analyzer
prose containing dose or ratio units such as `U/h` and `g/U` is accepted only
through the generated dose-ratio baseline. For Python files the scan reads only
comment text (`scan_public_tree.py:540-561`), so its printed delta may be empty;
an empty delta needs no re-record. When the delta is non-empty, confirm every
addition is manufactured catalog data, then re-record with
`python3 scripts/scan_public_tree.py <tree> --accept-dose-ratio-baseline`; never
hand-edit `scripts/public_scan_config.txt`. No real snapshot, `.env`,
`tconnect-data/`, live fetch, or normal serve enters this work.

## Budgets and stop rule

Each chunk records literal command output for all five measurements in
`coverage-appendix.md`; the coordinator transcribes it from the chunk report.
The budget record binds committed showcase size ≤25 MiB,
showcase drift ≤30 s, focused QA suite ≤90 s, each isolated case ≤15 s, and whole
pytest ≤2.5× that chunk's own pre-change local baseline, measured on its worker's
machine at session start. The recorded 137.69 s local measurement and CI's 2 min
57 s are references only. The committed showcase bytes are not replaced in either
chunk. Task 1 raises the `pytest (backend)` job timeout from 10 to 15 minutes so
the expanded suite retains CI headroom; that one line is the only permitted CI
workflow edit.

On a budget breach, or whenever a worker session ends before its sub-order's
Done-when, the worker commits source and tests on the chunk branch, does not touch
the committed database, opens no pull request, posts the measurements or stopping
point on #192, and stops. `--check` remains green because its showcase input and
committed output remain unchanged. Only a newer lock on #192 resumes the chunk.

## Change lifetime

This change remains active after tasks 1 and 2. Task 3 adds #193's behavioral and
verdict-band eras. Task 4 completes the remaining migration and evidence-based
revise-e2e retirement, adds agent guidance, and archives the change.
