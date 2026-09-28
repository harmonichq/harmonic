## MODIFIED Requirements

### Requirement: Behavioral eras prove occurrence states and verdict denominators exactly

Task 3 SHALL add exactly the 17 isolated cases in the design's `#193 eras`
table: 12 positive behavioral/output cases and five suppression or negative
guards. Each SHALL use the existing `QaCase.recipe`, `source_span_days`,
production composition, literal exact catalog tuple, and generated
`test_case_*` contract. Each SHALL set `target_family=None`; no new analyzer-family
value SHALL be introduced. Dates SHALL precede 2025-07-01. The committed showcase
recipe, produced rows, and SQLite bytes SHALL remain unchanged.

The three I:C behavioral findings SHALL be produced by `analyze_ic`; the eight
scenario Levers SHALL be produced by their production classifiers and attribution;
and unexplained highs SHALL be produced by exposures and findings projection.
Fixture recipes SHALL NOT accept or write an anchor state, classifier verdict,
finding, attribution, rank, denominator, projected row, analyzer verdict, or
continuous IOB. `iob_events` SHALL remain empty; any active insulin SHALL be
reconstructed from bolus events.

Every case SHALL continue to compare the complete literal `behavioral_rows` and
finding-title sets. `QaExpectation` SHALL gain
`verdict_tallies: Mapping[tuple[str, str], ExpectedVerdictTally]`, keyed by
`(lever, family)`, with defaults that leave the existing cases unchanged.
Its key set SHALL equal the whole-day projection's complete flattened
`(lever, family)` set across every finding row's `verdict_counts_by_family`;
no projected pair may be omitted and no extra expectation key may be present.
`ExpectedVerdictTally` SHALL contain a literal denominator and a literal counts
mapping with exactly the five `FINDING_VERDICTS` keys. Assertion SHALL require
exact tally key-set equality; non-negative integer counts; all five keys; counts
summing to the denominator; the denominator equaling the exact
`exposures[family]["n"]`; equality with the matching finding row's
`verdict_counts_by_family[family]`; and aggregate `verdict_counts` equal to the
sum of its per-family tallies. No expected state, count, or denominator SHALL be
constructed from `QaExecution`, `execute_case`, analyzer output, exposure output,
or projection output at assertion time.

Each scenario-Lever case SHALL cover every row-relative band its own production
classifier path can emit, as measured by the design's source probe. Counts below
are in `fired / outranked / near_miss / no_data / clean` order and SHALL be
literal:

| Lever case | Target tally | Co-Lever tally required by target `outranked` |
| --- | --- | --- |
| `behavioral-carb-undercount` | `(carb_undercount, meals)` = `2 / 1 / 1 / 1 / 1`, denominator 6 | `(late_bolus, meals)` = `1 / 2 / 0 / 0 / 3`, denominator 6 |
| `behavioral-late-bolus` | `(late_bolus, meals)` = `2 / 1 / 1 / 1 / 2`, denominator 7 | `(carb_undercount, meals)` = `1 / 2 / 0 / 0 / 4`, denominator 7 |
| `behavioral-meal-over-delivery` | `(meal_over_delivery, meals)` = `2 / 1 / 1 / 1 / 1`, denominator 6 | `(carb_undercount, meals)` = `1 / 2 / 0 / 0 / 3`, denominator 6 |
| `behavioral-over-treated-low` | `(over_treated_low, lows)` = `2 / 1 / 1 / 1 / 1`, denominator 6 | `(correction_on_iob, lows)` = `1 / 2 / 0 / 0 / 3`, denominator 6 |
| `behavioral-correction-stacking` | `(correction_stacking, correction_clusters)` = `2 / 0 / 1 / 4 / 1`, denominator 8 | none; a driver correction necessarily carries the matching stacking verdict |
| `behavioral-correction-on-iob` | `(correction_on_iob, lows)` = `2 / 1 / 1 / 0 / 1`, denominator 5 | `(over_treated_low, lows)` = `1 / 2 / 0 / 0 / 2`, denominator 5 |
| `behavioral-missed-meal` | `(missed_meal, highs)` = `2 / 1 / 1 / 1 / 1`, denominator 6 | `(meal_bolus_short, highs)` = `1 / 2 / 1 / 1 / 1`, denominator 6 |
| `behavioral-meal-bolus-short` | `(meal_bolus_short, highs)` = `2 / 1 / 1 / 1 / 1`, denominator 6 | `(missed_meal, highs)` = `1 / 2 / 0 / 1 / 2`, denominator 6 |

Each target and co-Lever tally SHALL preserve the denominator, count-sum,
`verdict_counts_by_family`, and aggregate reconciliation invariants above. The
correction-stacking tally SHALL come from four two-correction episodes: the
episode classifier selects one stacking pair (`ciq_autotune/analyzers/scenario/attribute.py:483-509`),
model-view appends the match only to that pair's second correction or a non-match
only to a non-firing episode's final correction
(`ciq_autotune/analyzers/scenario/model_view.py:291-307`), and the four remaining
anchors therefore project as `no_data`
(`ciq_autotune/findings_projection.py:584-605`). The scenario builder's analysis-window
slice occurs before episode construction, so an earlier prior correction cannot
serve as hidden context (`ciq_autotune/analyzers/scenario/engine.py:773-779`). The
meal-bolus-short recurrence appearance SHALL retain its separately policy-owned
completed-meal denominator. At least one generated case test SHALL independently
perturb a literal state, a literal denominator, and a zero-valued verdict count
and SHALL fail for each mutation.

`QaExpectation` SHALL also gain an exact whole-window `uncaused_highs` value,
defaulted so existing cases retain their output. The `behavioral-uncaused-highs`
case SHALL produce two high Occurrences that are both non-driver/clean at the
family level in one whole Episode with no Lever; it SHALL pin
`uncaused_highs == 2`, counted once per high anchor by
`ciq_autotune/explore_exposures.py:139-140`. The five negative cases SHALL prove, through exact whole-set
rows, titles, tallies, and denominators, that a false-low excursion is removed, a
`low:no` answer suppresses over-treated-low attribution without deleting the
printed low, an unbolused Carb-log entry reduces the exact Fasting ISF `n_steps`
support value without changing behavioral rows, one correction creates no
correction cluster, and precedence retains an outranked anchor while only the
earlier driver owns attribution. Removing the Carb-log entry SHALL change the
literal `n_steps` value, proving that case's expectation is load-bearing through
the current `QaExecution.analysis` surface.

Every case SHALL declare the exact `source_span_days` shown in the design table.
The six-Occurrence Lever cases and both five-Occurrence Lever cases SHALL use the
declared 30-day dense-store class; sparse negative cases SHALL not substitute for
the representative timing.

Before the remaining 16 cases are authored, the first representative 30-day dense
scenario-Lever case SHALL be timed and task 3 SHALL project
`17 × representative case time + 11.38 s` against the unchanged 90-second focused
suite limit. Any projected or measured budget breach SHALL invoke the existing
stop rule and SHALL be reported on #193. Task 3 SHALL record literal output for
the same five budgets in `coverage-appendix.md`, using task 2's 11.38 s focused
suite as the projection input and the recorded 62.93 s whole-pytest baseline /
157.33 s ceiling. No budget SHALL be raised.

#### Scenario: The closed occurrence vocabulary is analyzer-produced

- **WHEN** every generated behavioral case runs through production analysis,
  exposures, scenarios, and findings projection
- **THEN** the complete Occurrence-row set contains only `fired`, `outranked`,
  `near_miss`, `no_data`, and `clean`
- **AND** every required positive, negative, silence, and precedence condition in
  the design table matches its literal whole-set expectation

#### Scenario: Every Lever covers its reachable bands and exact family denominator

- **GIVEN** each scenario-Lever case's literal target and required co-Lever tallies
- **WHEN** its finding row is projected
- **THEN** the target covers every reachable band in the per-Lever table and keeps
  unreachable bands at literal zero
- **AND** every tally's count sum equals both its exposure family's `n` and the
  matching `verdict_counts_by_family` denominator
- **AND** aggregate counts equal the sum of the exact per-family tallies
- **AND** tally keys equal the projection's complete `(lever, family)` set

#### Scenario: Negative evidence cannot become a finding

- **WHEN** the five named negative cases execute
- **THEN** false-low, `low:no`, Carb-log fasting exclusion, lone-correction, and preempted
  conditions retain exactly the rows and absences named by the design
- **AND** no recipe injects the verdict or attribution that the assertion expects

#### Scenario: Behavioral coverage leaves the showcase and budgets fixed

- **WHEN** task 3 completes or stops on a budget breach
- **THEN** the committed showcase drift check remains current and its bytes remain
  unchanged against `origin/main`
- **AND** the five measured budgets are recorded without raising a limit

#### Scenario: Late bolus's cases keep a real high and an in-range band

- **GIVEN** `behavioral-late-bolus` and `behavioral-carb-undercount`
- **WHEN** each case is executed
- **THEN** every meal Late bolus fires on peaks above 180 after its bolus, and
  `behavioral-late-bolus`'s seventh meal, peaking at exactly 180, reads clean with
  `stayed_in_range`
