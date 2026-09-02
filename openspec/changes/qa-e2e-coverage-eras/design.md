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
segment, or I:C block. The executed serialized-row dump in `generated-facts.md`
pins `ExpectedAnalyzerRow` as a family-discriminated contract:

| Family | Exact expected fields |
| --- | --- |
| Basal | `safety_status`, top-level `direction`, `asserts_move`, and `omitted: frozenset[str]` |
| ISF | `asserts_move`, `direction` read from `evidence["direction"]`, and `omitted` |
| I:C | `state`, `direction`, `held_reason`, `asserts_move`, conditionally present `days_observed`, and `omitted` |

`omitted` is compared exactly and ranges only over the family's serialized field
names outside its value-pinned list. It names fields expected absent or `None`;
a value-pinned field whose value is `None` is pinned as that value and is never
also listed in `omitted`. Basal no-baseline uses `omitted={"current"}` because
`current` is outside basal's value-pinned list and serializes as `None`; ISF
direction-only similarly uses `omitted={"recommended"}`. I:C collecting and asserting blocks pin the exact
serialized `days_observed`; every other I:C block includes `days_observed` in
`omitted`. A non-collecting span is guarded by its exact `state`, not by a field
the serializer omits. `QaExpectation` gains
`analyzer_rows: Mapping[AnalyzerRowKey, ExpectedAnalyzerRow]`. Whole-set equality
already fails on every unexpected or missing key, so there is no separate analyzer
absence collection. Every case runs full `analyze`
(`scripts/qa_e2e_cases.py:162-168`). `QaCase.target_family` is
`"basal" | "isf" | "ic"` for new coverage cases and `None` for `showcase`,
`setting-recommendation`, and `behavioral-precedence`. `assert_expectation` pins
the target family's full emitted key set and each other family's exact set of keys
outside its measured quiet predicate. A `None` target pins that measured
non-quiet complement in all three families. The quiet predicates are:

* basal quiet is `safety_status` in `{NO_CHANGE, NO_DATA, None}`; `NO_DATA`
  projects a blind row, but the slot has no estimate and cannot hide a move;
* ISF quiet is `asserts_move == false` with no `evidence["direction"]`;
* I:C quiet is `state` in `collecting`, `below-floor`, or `unmeasured-alone`, or
  `state == "numeric"` with `asserts_move == false` and no `held_reason`.

The probe measured 48 basal slots as 41 no-change, five no-data, and two lower in
both stores; one directionless, non-asserting Fasting ISF row; and one collecting
short-span versus one directionless, non-asserting numeric mature I:C block. The
non-target set is measured from the exact complement of the predicates above; it
is never assumed empty. This keeps stray states fail-closed at a fraction of the
all-family literal volume.

`QaExpectation.support: Mapping[AnalyzerRowKey, ExpectedSupport]` pins the
serialized support beside those rows. Basal support is
`evidence["directional_support_count"]` (`analyzers/basal.py:562-564`); ISF
support is `evidence["n_steps"]` (`analyzers/isf.py:634-645`); I:C support is the
top-level `n_runs` plus `evidence["eligibility"]["effective_run_count"]`
(`result.py:330-366`; `analyzers/ic.py:2511-2518`). The executed support-field
probe and complete output are in `generated-facts.md`.
`basal-insufficient-seven-night` and `basal-insufficient-unsupported-sign` have
different literal support despite both being held; `ic-quiet-seven-run` and
`ic-raise` likewise separate below-floor and supported evidence through this map.

Every target-family expectation is authored literally per case as one default
`ExpectedAnalyzerRow` plus named per-key literal overrides copied by hand from
the design matrix. Neither the default nor an override may be constructed from a
`QaExecution` or analyzer output at test time. At least one generated
`test_case_*` perturbs a default row, rather than a named override, and must fail.
Queue rows and absences, support, rest windows, and history series obey the same
literal-only rule. Existing `behavioral_rows` and `finding_titles` are retained
verbatim; the extended contract adds to them and replaces none.

`QaCase` also gains a `recipe` callable, and `materialize_case` calls it directly
instead of using the current `if`/`elif` dispatch
(`scripts/qa_e2e_cases.py:147-157`). Sub-order 2 adds cases through that task-1
callable contract. `QaCase` gains
`scoped_windows: tuple[tuple[int, int], ...]`, expressed as clock minutes and
empty by default. `execute_case` keeps `whole_day()` and additionally projects
each declared window through `WindowQuery.clock`
(`window_membership.py:47-60`). Queue expectations and absences are keyed by
`(window | "whole_day", row key)`. Task 1 further extends the expectation to the
single Fasting ISF row's rest-window set keyed by
`(date, start, end)`; and one projected I:C history series per active identity
keyed by identity. The mapping is empty when no identity is active; an active
identity's expected series is never empty. Non-active identities remain available
through
`PreparedFindings.history_catalog` (`findings_projection.py:169-171`). Recipes
never accept or write a verdict, status, direction, held reason, lifecycle,
register, queue row, priority, or rank.

## Coverage-case isolated-store spans

Span is the inclusive calendar-day write depth from the earliest basal, CGM, or
bolus event row through the latest basal or CGM event, which is the case's
store-derived `now`; bolus participates in the start only, and settings snapshots
are excluded (`analyze.py:200-206`). The analyzer rules below are stated as days
back from `now`. For an end-of-day `now`, the catalog's inclusive declaration is
days back plus one. They are minimums only when a case's pinned expectation
requires that family's maturity. An I:C case may declare a shorter span when it
pins `state="collecting"` and exact emitted `days_observed`; an ISF case may be
shorter when its pinned outcome does not need the prior-decision window. Every
new coverage case declares a span and `materialize_case` writes exactly that
depth. Task 1 asserts declared depth against recipe depth; it never applies a
family floor independently of the pinned expectation.
For each of the three existing cases, a test asserts the declaration against the
recipe's actual earliest event and `now`. The catalog imports the constants rather
than repeating their values:

| Family | Earliest event required | Inclusive declaration | Why |
| --- | --- | --- | --- |
| Basal | At least `window_days + _BOLUS_LEADIN` = 31 days back | At least 32 days | The 30-day segment lane reads basal rows from `window_start` and bolus-only IOB from `window_start - _BOLUS_LEADIN` when coverage recipes place boluses (`analyze.py:264-265,284`). |
| ISF | At least `window_days + _ISF_DECISION_INTERVAL + _BOLUS_LEADIN` = 38 days back | At least 39 days | The prior-decision replay reads from `prior_isf_start - _BOLUS_LEADIN` (`analyze.py:90,322,328-330`). |
| I:C | At least `BLOCK_WINDOW_DAYS` = 90 days back | At least 91 days | The block lane uses `block_start = now - BLOCK_WINDOW_DAYS` and all block inputs through `now` (`analyze.py:422,443-454`); maturity is `now - insulin_history_start >= BLOCK_WINDOW_DAYS` (`analyze.py:438-441`), with no segment-lane bolus lead-in. |

Because `observed_days` floors elapsed seconds, each coverage recipe anchors its
earliest event at or before `now`'s time of day. Collecting and asserting I:C rows
pin emitted `days_observed`; every other non-collecting row pins `state` and
requires `omitted` to contain `days_observed`, so a short maturity boundary still
fails loudly without expecting a field the serializer does not emit.

The three existing cases receive literal declarations matching their current
recipe extents rather than family-derived policy: `showcase` declares span 30 at
its existing anchor; the committed database bytes, showcase recipe, and produced
rows remain unchanged, while its expectation is re-expressed in the extended
contract with no observed value changing;
`setting-recommendation` declares span 12 and keeps its bolus-free recipe without
a lead-in; `behavioral-precedence` declares span 5 because its unchanged recipe
writes events from 2024-06-25 through its 2024-06-29 `now`. The latter two derive
any new exact expectation fields from analyzer output. The materialized min/max
query—minimum over basal/CGM/bolus, maximum over basal/CGM—and complete output are
recorded in `generated-facts.md`. `window_days` remains
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
| Basal insufficient — seven-night floor | A visible estimate differs from current but seven informative nights exit below `_MIN_SUPPORTED_NIGHTS` (`safety.py:63-71,192-222`; `analyzers/basal.py:503-509,562-564`). | Exact analyzer/support row, `QaCase.scoped_windows` `held`, no global assert, `asserts_move=false`. |
| Basal insufficient — unsupported sign | At least eight informative nights produce a visible estimate, but their sign hypothesis fails the Benjamini–Hochberg family cutoff (`safety.py:74-106,192-222`; `analyzers/basal.py:503-509,562-564`). | Exact analyzer/support row distinct from the seven-night floor, scoped `held`, no global assert, `asserts_move=false`. |
| Basal blind | No clean day yields an estimate (`safety.py:197-204`; `analyzers/basal.py:499-509`). | Exact `QaCase.scoped_windows` `blind` row and no global row. |
| Basal no baseline | A clean estimate exists without a programmed current value (`safety.py:200-204`; `result.py:156-166`). | Exact `QaCase.scoped_windows` `held` with `omitted={"current"}`, no global assert. |
| Basal no change | The bounded estimate is within 0.05 U/h of current (`safety.py:143-148,212-214`). | Exact analyzer row and absence from `QaCase.scoped_windows`/global queues. |
| Basal recurring-low lower | Recurring basal-attributed lows and a clean median below current move the safe direction lower (`safety.py:229-279`; `analyzers/basal.py:510-522`). | Exact lower `assert`, `asserts_move=true`; never blind. |
| Basal recurring-low no-clean median | Recurring basal-attributed lows with `median is None` take the explicit full-step `HARM_LOWER` branch (`safety.py:257-260,268-273`; `analyzers/basal.py:510-522`). | Exact lower `assert` from the no-clean-median harm branch, distinct from the median-below-current branch; never blind. |
| Basal recurring-low gate | A low gates a raise or recurring lows meet a median at/above current (`safety.py:238-260,268-283`). | Exact `QaCase.scoped_windows` `held`, no global assert, `asserts_move=false`. |
| ISF strengthen | Fully observed rescue history is silent, no correction harm exists, the band and vote support strengthen, and the signal held at the prior decision point (`analyzers/isf.py:509-525,611-622`). | Exact ranked `assert` with recommendation and `asserts_move=true`. |
| ISF weaken / direction-only | Correction-caused lows or attributed rescues clear recurrence; the analyzer emits weaken without a recommendation (`analyzers/isf.py:528-591,818-827`). | Exact visible direction with `omitted={"recommended"}`, no queue rank, `asserts_move=false`. |
| ISF held | An estimate is visible but no direction is owned because harm gates, observation is incomplete, evidence is wide, current is confirmed, or persistence is absent (`analyzers/isf.py:593-628`). | Exact `held` row and analyzer-owned reason. |
| I:C collecting | A 30-day store leaves `days_observed < BLOCK_WINDOW_DAYS`, which forces every block to `collecting` (`analyze.py:438-441`; `analyzers/ic.py:2429-2430`). | Exact collecting analyzer row including `days_observed`, and absence from `QaCase.scoped_windows`/global queues. |
| I:C raise / lower | `days_observed` reaches `BLOCK_WINDOW_DAYS`; at least eight effective closed meal runs produce a non-wide, band-excluding, regime-supported recommendation different from current (`analyzers/ic.py:120-163,1449-1472,2429-2438,2503-2523`). | Exact `assert`, direction, support count, `days_observed`, and `asserts_move=true`. |
| I:C capped raise / lower | The same mature-span conditions hold and the half-gap exceeds the ±20% bound (`analyzers/ic.py:1449-1464`). | Exact `assert`, bounded recommendation, and emitted `days_observed`. |
| I:C held | The mature block names a move but the regime bracket straddles programmed or meal/pre-empted harm gates tightening (`analyzers/ic.py:2448-2501,2524-2526,2633-2643`). | Exact `held`, no global assert, `asserts_move=false`, and `omitted` containing `days_observed`. |
| I:C quiet | The mature block is below the eight-run floor, unmeasured alone, agrees with programmed, or otherwise owns neither move nor held reason (`analyzers/ic.py:2430-2446,2638-2643`). Include a seven-run case separately from collecting. | Exact analyzer block with `omitted` containing `days_observed`, plus explicit `QaCase.scoped_windows`/global absence. |
| I:C history register | A snapshot-proven past block identity differs from current, is ever publishable, and has enough in-window runs for an active measurement (`analyzers/ic.py:2198-2278`). | Exact active history row and one exact projected series per active identity. |

## Named #192 coverage cases

These are the exact new catalog entries. Span is the inclusive declaration from
the family table above. `—` means the case projects `whole_day` only; every listed
clock window is additionally projected through `QaCase.scoped_windows`. The
generated unittest method is mechanically `test_case_<name with '-' replaced by
'_'>`.

| Case name | Family | Span days | Scoped windows | Matrix condition |
| --- | --- | ---: | --- | --- |
| `basal-raise` | basal | 32 | — | Basal raise |
| `basal-lower` | basal | 32 | — | Basal lower |
| `basal-capped-raise` | basal | 32 | — | Basal capped raise |
| `basal-capped-lower` | basal | 32 | — | Basal capped lower |
| `basal-insufficient-seven-night` | basal | 32 | `(180, 240)` | Basal insufficient at the seven-night floor |
| `basal-insufficient-unsupported-sign` | basal | 32 | `(180, 240)` | Basal insufficient with ≥8 nights but no family-corrected sign support |
| `basal-blind` | basal | 32 | `(180, 240)` | Basal blind |
| `basal-no-baseline` | basal | 32 | `(180, 240)` | Basal no baseline |
| `basal-no-change` | basal | 32 | `(180, 240)` | Basal no change |
| `basal-recurring-low-lower` | basal | 32 | — | Basal recurring-low lower |
| `basal-recurring-low-no-clean-median` | basal | 32 | — | Basal recurring-low lower with no clean median |
| `basal-recurring-low-gate` | basal | 32 | `(180, 240)` | Basal recurring-low gate |
| `isf-strengthen` | isf | 39 | — | ISF strengthen |
| `isf-direction-only-weaken` | isf | 39 | — | ISF weaken / direction-only non-stageable |
| `isf-held` | isf | 39 | — | ISF held |
| `ic-collecting` | ic | 30 | `(0, 720)` | I:C collecting |
| `ic-raise` | ic | 91 | — | I:C raise |
| `ic-lower` | ic | 91 | — | I:C lower |
| `ic-capped-raise` | ic | 91 | — | I:C capped raise |
| `ic-capped-lower` | ic | 91 | — | I:C capped lower |
| `ic-held` | ic | 91 | `(0, 720)` | I:C held |
| `ic-quiet-seven-run` | ic | 91 | `(0, 720)` | I:C quiet at the seven-run floor |
| `ic-history-register` | ic | 91 | — | I:C history register |

Task 1 therefore adds 12 basal cases. Task 2 adds 3 ISF and 8 I:C cases. Those
counts are load-bearing inputs to the pre-authoring runtime projections below;
the generated test-name guard derives from this same closed table.

## ADR 192 — Isolated coverage stores, showcase-only committed database

**Decision.** The committed database remains showcase-only. Concatenating older
coverage data changes analyzer semantics: `analyze` loads streams unwindowed and
derives `span_start` and `insulin_history_start` store-wide
(`analyze.py:174-176,200-206`), caps I:C `observed_days` from that earliest history
(`analyze.py:438-441`), and I:C forces blocks to collecting below
`BLOCK_WINDOW_DAYS` (`analyzers/ic.py:2429-2430`). ISF also needs its prior
decision replay (`analyze.py:90,317-330`). Each new coverage case therefore runs
in its own store with its declared span above; existing catalog recipes
retain the shapes recorded in the preceding section.

This supersedes ADR 190's coverage-membership clause. ADR 190's other rulings stay
in force. The bytes of `mockups/qa-e2e.synthetic/harmonic.sqlite`, the showcase
recipe and its produced rows remain unchanged. `gen_qa_e2e_db.py --check`
reports its logical contents current, while
`git diff --quiet origin/main -- mockups/qa-e2e.synthetic/harmonic.sqlite` proves its bytes
were untouched.
The showcase expectation is re-expressed in the extended contract with no
observed value changing. The committed database membership is exactly one case:
`showcase`.

The executed span probe and complete output in `generated-facts.md` demonstrate
the boundary with existing recipes: the 30-day showcase is collecting at 29
observed days, while its 91-inclusive-calendar-day long store places its earliest
event at least 90 days back and produces a numeric I:C state. The printed long-
store `observed_days: [90]` is the probe's `row.get(..., BLOCK_WINDOW_DAYS)`
fallback, not an emitted analyzer value; maturity is proved by `numeric`, because
a sub-90 block is forced to `collecting` and would serialize `days_observed`.
The same 30-day store still emits one ISF row, but the
family span is required for prior-decision outcomes. This probe is frozen evidence
of the pre-change tree at `origin/main` `6defd69`; it is not re-run after chunk 1,
and no chunk repairs it.

## Per-case emission for UI work

`scripts/gen_qa_e2e_db.py --case <name> --out <path>` materializes exactly one
catalog case into a provenance-stamped SQLite store through the same public
materializer used by tests. The parser changes `--out` to `default=None`; without
`--case`, `None` resolves to `DEFAULT_OUTPUT`, preserving the documented bare
generator and `--check`. With `--case`, an unsupplied `--out` is an argument
error that writes nothing. `--case` and `--check` are mutually exclusive, and an
unknown case fails while naming the available catalog. Generator tests snapshot
`DEFAULT_OUTPUT`'s bytes and mtime and require every invocation in the suite to
leave both unchanged. Default-output resolution is exercised only through the
read-only bare `--check`; tests never invoke bare write mode against the committed
path.
The output is scratch data and is never committed. A one-line `AGENTS.md`
amendment permits it through the existing mandatory copy-then-serve, `--no-fetch`
workflow by substituting either a `$TMPDIR` scratch path or the already-pinned
committed path, never a new repository path token: public-link exceptions are
pinned per `(document, token)` (`check_public_links.py:125-145`). The generator's
default mode and `--check` remain showcase-only. The follow-on task still owns
the complete named-case and UI-decision guidance in `AGENTS.md` and `CONTEXT.md`.

`tests/test_qa_e2e_cases.py` generates one unittest method named
`test_case_<name with '-' replaced by '_'>` for every catalog case. Each method
carries its original case name. A guard decodes those methods back to case names
and compares the set with `{case.name for case in QA_CASES}`; the literal exact
catalog-tuple test remains a separate drop guard. These generated methods replace
`test_each_catalog_case_runs_the_real_producer_composition` and
`test_setting_recommendation_case_runs_the_real_producer_composition`; the tuple
guard and decoded-name-set pin are the only retained execution-free tests.

## #193 eras

Task 3 keeps the #192 case interface and adds 17 isolated behavioral cases. The
three analyzer findings and the unexplained-highs projection are not scenario
Levers; they prove their own production output and still pin the complete
`behavioral_rows` set. The eight scenario-Lever cases additionally pin the
server's row-relative verdict band. Their occurrence budgets are per-Lever,
because the production classifiers do not all expose the same silences or append
a verdict to every anchor. The measured source inventory is frozen by
`evidence/silence-taxonomy-probe.py` and recorded in `generated-facts.md`.

Every target tally below includes two `fired` Occurrences for the engine's pattern
floor and exactly one of every other row-relative band that the classifier path can
produce. Zeroes remain literal and load-bearing. A co-Lever named below is the
driver that makes the target's `outranked` Occurrence possible; its full literal
tally is part of that same case. Counts are written in
`fired / outranked / near_miss / no_data / clean` order.

| Lever case | Classifier silences; append behavior | Target-family tally | Required co-Lever tally |
| --- | --- | --- | --- |
| `behavioral-carb-undercount` | `insufficient_data`, `no_trigger`, `under_threshold`, `upstream_cause`; every meal anchor | `(carb_undercount, meals)` = `2 / 1 / 1 / 1 / 1`, denominator 6 | `(late_bolus, meals)` = `1 / 2 / 0 / 0 / 3`, denominator 6 |
| `behavioral-late-bolus` | `insufficient_data`, `no_trigger`, `upstream_cause`, `prior_high_baseline`, `owned_by_prior_bolus`; every meal anchor | `(late_bolus, meals)` = `2 / 1 / 1 / 1 / 1`, denominator 6 | `(carb_undercount, meals)` = `1 / 2 / 0 / 0 / 3`, denominator 6 |
| `behavioral-meal-over-delivery` | `insufficient_data`, `no_trigger`, `horizon_expired`; every meal anchor | `(meal_over_delivery, meals)` = `2 / 1 / 1 / 1 / 1`, denominator 6 | `(carb_undercount, meals)` = `1 / 2 / 0 / 0 / 3`, denominator 6 |
| `behavioral-over-treated-low` | `insufficient_data`, `no_trigger`, `under_threshold`, `owned_by_announced_meal`; omitted for a refuted or split-off low | `(over_treated_low, lows)` = `2 / 1 / 1 / 1 / 1`, denominator 6 | `(correction_on_iob, lows)` = `1 / 2 / 0 / 0 / 3`, denominator 6 |
| `behavioral-correction-stacking` | `no_trigger`, `upstream_cause`, `horizon_expired`; only the matching or last correction anchor | `(correction_stacking, correction_clusters)` = `2 / 0 / 1 / 1 / 1`, denominator 5 | none; a driver correction necessarily has the matching stacking verdict, so this row cannot be `outranked` |
| `behavioral-correction-on-iob` | `no_trigger`, `upstream_cause`; every low anchor | `(correction_on_iob, lows)` = `2 / 1 / 1 / 0 / 1`, denominator 5 | `(over_treated_low, lows)` = `1 / 2 / 0 / 0 / 2`, denominator 5 |
| `behavioral-missed-meal` | `insufficient_data`, `no_trigger`, `upstream_cause`; omitted for a split rebound high | `(missed_meal, highs)` = `2 / 1 / 1 / 1 / 1`, denominator 6 | `(meal_bolus_short, highs)` = `1 / 2 / 1 / 1 / 1`, denominator 6 |
| `behavioral-meal-bolus-short` | `insufficient_data`, `no_trigger`, `upstream_cause`, `horizon_expired`; omitted for a split rebound high | `(meal_bolus_short, highs)` = `2 / 1 / 1 / 1 / 1`, denominator 6 | `(missed_meal, highs)` = `1 / 2 / 0 / 1 / 2`, denominator 6 |

`QaExpectation` gains
`verdict_tallies: Mapping[tuple[str, str], ExpectedVerdictTally]`, keyed by
`(lever, family)`. Its keys equal the whole-day projection's complete flattened
set of `(lever, family)` entries across every finding row's
`verdict_counts_by_family`; no projected finding-family pair may be omitted and no
extra expectation key may be present. `ExpectedVerdictTally` contains a literal `denominator` and a
literal five-key `counts` mapping in `FINDING_VERDICTS` order. The comparison
requires exact key-set equality, non-negative integer values, all five keys, the
sum of counts equal to the denominator, the denominator equal to
`execution.exposures["exposures"][family]["n"]`, and equality with the matching
finding row's `verdict_counts_by_family[family]`. It also requires aggregate
`verdict_counts` to equal the per-family sum. No value may be built from
`QaExecution`, `execute_case`, analyzer output, or projection output at assertion
time. At least one generated `test_case_*` perturbs a literal state, a literal
denominator, and one zero-valued count, and each perturbation must fail. This is a
new expectation field because `behavioral_rows` pins `(family, t, state)` but
cannot carry the per-finding, per-family denominator
(`scripts/qa_e2e_cases.py:105-128,1339-1387`;
`findings_projection.py:526-552`).

The unexplained-highs case also adds one literal `uncaused_highs` expectation,
compared with the whole-window projection value. It distinguishes a high whose
anchor did not drive from a high whose whole Episode drew no Lever: two high
Occurrences are clean at the family level, exactly one is uncaused
(`explore_exposures.py:57-75,176-181`; `findings_projection.py:261-280`;
`tests/test_meal_bolus_short_attribution.py:416-435`). The existing three cases'
new fields use empty/default values and retain every observed value unchanged.

“Produce” below always means manufactured source rows drive the production
analyzer, exposure builder, scenario engine, and findings projection. A recipe
never accepts or writes an anchor state, classifier verdict, finding, attribution,
rank, denominator, or projected row. `iob_events` stays empty; all active insulin
comes from the bolus log through the accounting-DIA reconstruction.

| Case name | Span days | Store shape | Detector / output | Source condition proved | Expected states and denominator |
| --- | ---: | --- | --- | --- | --- |
| `behavioral-meals-start-high` | 8 | dense | `analyzers/ic.py::_meals_start_high_finding` | At least the pooled meal-list floor has readable starts whose median is above target (`analyzers/ic.py:1382-1434`). | Exact finding-title set and complete `behavioral_rows`; no scenario-verdict tally. |
| `behavioral-carb-counting` | 8 | dense | `analyzers/ic.py::analyze_ic` | At least `min_runs` closed meals yield a wide pooled I:C interval (`analyzers/ic.py:1802-1833`). | Exact finding-title set and complete meal Occurrence states; no scenario-verdict tally. |
| `behavioral-post-meal-correction-burden` | 8 | dense | `analyzers/ic.py::analyze_ic` | At least `min_meals` pooled meals accumulate known-provenance post-meal correction insulin at or above the configured floor (`analyzers/ic.py:1837-1891`). | Exact finding-title set and complete meal Occurrence states; no scenario-verdict tally. |
| `behavioral-carb-undercount` | 30 | dense | `classifiers/carb_undercount.py::classify_carb_undercount` | Meal dose plus outcome implies the classifier's quantified carb shortfall, without injecting an I:C verdict (`analyzers/scenario/model_view.py:151-191`; `analyzers/scenario/attribute.py:389-405`). | Exact target and co-Lever six-Occurrence tallies in the reachable-band table. |
| `behavioral-late-bolus` | 30 | dense | `classifiers/late_bolus.py::classify_late_bolus` | A meal bolus lands in a qualifying from-flat rise not owned by a prior bolus or upstream recovery cause (`analyzers/scenario/model_view.py:151-191`; `analyzers/scenario/attribute.py:389-405`). | Exact target and co-Lever six-Occurrence tallies in the reachable-band table. |
| `behavioral-meal-over-delivery` | 30 | dense | `scenario/meal_suspend.py::classify_meal_owned_suspend` | A meal-owned suspend and low outcome select meal over-delivery after earlier meal classifiers remain silent (`analyzers/scenario/model_view.py:151-191`; `analyzers/scenario/attribute.py:389-405`). | Exact target and co-Lever six-Occurrence tallies in the reachable-band table. |
| `behavioral-over-treated-low` | 30 | dense | `scenario/attribute.py::over_treated_rebound_judgment` | A printed low rebounds past the treatment bar and is not refuted or owned by an announced meal (`analyzers/scenario/model_view.py:194-225`; `analyzers/scenario/attribute.py:443-478`). | Exact target and co-Lever six-Occurrence tallies in the reachable-band table. |
| `behavioral-correction-stacking` | 30 | dense | `classifiers/correction_stacking.py::classify_correction_stacking` | A qualifying correction pair acts before the first dose clears and overshoots low (`analyzers/scenario/model_view.py:291-307`; `analyzers/scenario/attribute.py:482-514`). | Five = 2 fired + 1 near-miss + 1 no-data + 1 clean; outranked is literal zero. |
| `behavioral-correction-on-iob` | 30 | dense | `classifiers/correction_on_iob.py::classify_correction_on_iob` | A correction lands on reconstructed bolus-only IOB and the combined action reaches a low (`analyzers/scenario/model_view.py:194-225`; `analyzers/scenario/attribute.py:443-478`). | Five = 2 fired + 1 outranked + 1 near-miss + 1 clean; no-data is literal zero, plus the co-Lever tally. |
| `behavioral-missed-meal` | 30 | dense | `classifiers/missed_meal.py::classify_missed_meal` | A from-flat meal-shaped high has no qualifying bolus and no upstream recovery cause (`analyzers/scenario/model_view.py:228-263`; `analyzers/scenario/attribute.py:544-588`). | Exact target and co-Lever six-Occurrence tallies in the reachable-band table. |
| `behavioral-meal-bolus-short` | 30 | dense | `classifiers/meal_bolus_short.py::classify_meal_bolus_short` | A completed carb-bolus meal is followed by a high and a qualifying cleanup correction; occurrence identity remains the implicated meal (`analyzers/scenario/model_view.py:228-263`; `analyzers/scenario/evidence_population.py:169-177`). | Exact target and co-Lever six-Occurrence tallies in the reachable-band table; recurrence retains its policy-owned meal denominator separately. |
| `behavioral-uncaused-highs` | 2 | sparse | `explore_exposures.py::build_exposures` | Two highs do not drive their Episodes, but exactly one Episode draws no Lever anywhere (`explore_exposures.py:57-75,176-181`). | High family denominator two, both anchor rows `clean`, `uncaused_highs == 1`; no finding row. |
| `behavioral-false-low-suppressed` | 2 | sparse | false-low preprocessing | A `false-low` response removes the complete flagged excursion before anchors are collected (`analyzers/scenario/engine.py:780-789`; `explore_exposures.py:95-103`). | Exact whole-set rows exclude the flagged low and its rebound; no low denominator is inflated. |
| `behavioral-low-no-suppressed` | 2 | sparse | over-treated-low prompt gate | A `low:no` answer refutes over-treated-low attribution at the matching printed low (`analyzers/scenario/model_view.py:203-224`). | The low remains in the exact roster, but `over_treated_low` is absent/fails to fire and the literal low-family tally reconciles. |
| `behavioral-carb-log-fasting-exclusion` | 2 | dense | Fasting ISF exclusion | A separate unbolused Carb-log entry excludes its production fasting steps without becoming a meal, bolus, or modeling input (`scripts/qa_e2e_cases.py:1213-1221`; `analyzers/isf.py:218-267`). | Exact Fasting ISF row/support pins `n_steps`; removing the entry changes that literal support value while behavioral rows remain unchanged. |
| `behavioral-lone-correction-clean` | 1 | sparse | `classifiers/correction_stacking.py::classify_correction_stacking` | One correction without a qualifying pair cannot become correction stacking (`analyzers/scenario/engine.py:97-108`; `analyzers/scenario/model_view.py:291-307`). | No correction-stacking finding; correction-cluster denominator is zero and the exact roster contains no manufactured pair. |
| `behavioral-preempted-detector` | 2 | sparse | attribution precedence | Two target matches surface the earlier actionable driver while a later detector's matching anchor is retained as `outranked` (`analyzers/scenario/model_view.py:18-26,311-321`; `analyzers/scenario/attribute.py:389-405`). | Exact whole-set rows include the named `outranked` anchor; only the winning Lever owns attribution and each affected literal tally reconciles. |

All 17 names are added to the existing literal catalog tuple and therefore gain
generated `test_case_*` methods. Dates remain before 2025-07-01. Each recipe
declares and proves its exact `source_span_days`; `target_family` remains `None`
because these cases target the behavioral layer rather than a tuning analyzer.
No new family value is introduced. The committed showcase recipe, produced rows,
and SQLite bytes remain unchanged.

Before authoring the remaining 16 cases, task 3 measures one representative
30-day dense scenario-Lever case—the dense-showcase cost class, approximately
2.4 seconds rather than the 0.32-second sparse-case class—and projects
`17 × representative case time + 11.38 s`, where 11.38 s is task 2's recorded
focused-suite total. A result above 90 seconds stops the phase. Task 3 records the same five post-change budgets as tasks 1 and 2 in
`coverage-appendix.md`: committed showcase size, showcase drift, focused suite,
slowest generated case, and whole pytest against the recorded 62.93 s baseline
and 157.33 s ceiling. No budget is raised. The existing budget-breach stop rule
applies, with the report posted on #193 rather than #192.

## Exactness, public-tree scan, and provenance

Expectation comparison is whole-set equality for analyzer rows, each queried
queue and queue absence, support values, and staging values. Tests perturb
one expected value in each class and require failure. No subset assertion
satisfies the contract.

Every committed artifact is generator-built and provenance-stamped. Every literal
series of 20 or more ascending clock-time values paired with numbers is hoisted
to its own module-level constant directly below a
`# SYNTHETIC-FIXTURE: <reason>` marker, which exempts that one top-level
assignment (`scan_public_tree.py:486-510,671-686`); such a series is never inline in
`QA_CASES`. Exact analyzer
prose containing dose or ratio units such as `U/h` and `g/U` is accepted only
through the generated dose-ratio baseline. For Python files the scan reads
comment and docstring text (`scan_public_tree.py:552-570`), so its printed delta
may be empty;
an empty delta needs no re-record. The baseline is keyed on `(path, matched
text)` (`scan_public_tree.py:755-766,788-800`); line numbers are retained only for
audit output (`scan_public_tree.py:745-752`), so line churn alone produces no
delta. Read every printed addition as new dose/ratio prose and confirm that its
value is manufactured; confirm removals likewise. Only then re-record with
`python3 scripts/scan_public_tree.py <tree> --accept-dose-ratio-baseline`; never
hand-edit `scripts/public_scan_config.txt`. No real snapshot, `.env`,
`tconnect-data/`, live fetch, or normal serve enters this work.

## Budgets and stop rule

Each chunk records literal command output for all five measurements in
`coverage-appendix.md`; the coordinator transcribes it from the chunk report.
The captured record reports 2 MiB for the committed showcase, `real 0.15` s for
showcase drift, `real 5.92` s for the focused suite, and `real 3.04` s for the
91-inclusive-day mature-store representative. It binds committed showcase size
≤25 MiB, showcase drift ≤30 s, focused QA suite ≤90 s, each isolated case ≤15 s, and whole
pytest in both chunks ≤2.5× chunk 1's pre-change local baseline, measured on its
worker's machine at session start. Chunk 2 reuses that recorded figure without
compounding it. Today no `test_case_*` method exists: the slowest focused-suite
entry is the 2.41 s showcase-bearing catalog execution test, while the 3.04 s
span-probe run is the mature-case representative. Once generated methods exist,
the slowest `test_case_*` entry is the post-change single-case measurement. The
recorded 137.69 s local measurement and CI's 2 min 57 s are references only. The
committed showcase bytes are not replaced in either chunk.

The coordinator-captured CI timestamps in `generated-facts.md` measure the backend
job at `21:39:39–21:43:01 = 202 s = 3:22`, and `Run tests` at
`21:39:49–21:42:46 = 177 s = 2:57`; all other job time is
`202 − 177 = 25 s = 0:25`. The projected 23-case delta is
`23 × 3.04 = 69.92 s`. Therefore the derived timeout is
`ceil((2.5 × 177 + 25 + 69.92) / 60) = ceil(8.957) = 9 minutes`. The existing
10-minute timeout already exceeds that result, so task 1 makes no CI workflow
edit. A backend-job timeout on the ticket pull request remains a budget breach.

After the first representative basal case and before the remaining basal cases,
sub-order 1 computes the sum of the representative time for each of its 11
remaining named basal cases plus the current focused-suite total. Sub-order 2
does the same by family after one representative ISF case and one mature I:C case:
3 ISF and 8 I:C cases total, subtracting the representatives already measured.
Each projection is `Σ over remaining planned cases of (measured representative
single-case time for that family) + current focused-suite total`. A result above
the 90-second focused-suite limit triggers the stop rule before the remaining
recipes are authored.

The captured pre-authoring proxy first projects chunk 1's post-change focused
suite as `12 × 3.04 + 5.92 = 42.40 s`. Chunk 2 then projects its 11 cases on top
of that POST-change total: `11 × 3.04 + 42.40 = 75.84 s` (about 75.8 s), leaving
`90 − 75.84 = 14.16 s` (about 14 s) headroom. The 3.04 s span probe times its
whole process and overstates one catalog case. Chunk 1 records the actual
per-case `test_case_*` durations and post-change focused-suite total; before
authoring, chunk 2 re-projects from that recorded total and measured basal
per-case times, then replaces those proxies with its own measured ISF and I:C
representatives as they exist. A projected breach stops the chunk; the 90 s limit
is not raised.

On a budget breach, or whenever a worker session ends before its sub-order's
Done-when, the worker commits source and tests on the chunk branch, does not touch
the committed database, opens no pull request, posts the measurements or stopping
point on #192, and stops. `--check` remains green because its showcase input and
committed output remain unchanged. Only a newer lock on #192 resumes the chunk.

## Change lifetime

This change remains active after tasks 1 and 2. Task 3 adds #193's behavioral and
verdict-band eras. Task 4 completes the remaining migration and evidence-based
revise-e2e retirement, adds agent guidance, and archives the change.
