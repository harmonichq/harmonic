## ADDED Requirements

### Requirement: The shared expectation contract proves basal states exactly

Each basal coverage case SHALL materialize manufactured source rows into one
isolated store and SHALL run production analysis, exposure, scenario, findings,
and I:C-history composition. `AnalyzerRowKey` SHALL be analyzer family plus its
emitted parameter key: basal clock-slot label, ISF segment, or I:C block.
`ExpectedAnalyzerRow` SHALL be family-discriminated from the serialized-row dump:
basal SHALL contain exact `safety_status`, top-level `direction`, `asserts_move`,
and `omitted: frozenset[str]`; ISF SHALL contain exact `asserts_move`, `direction`
read from `evidence["direction"]`, and `omitted`; I:C SHALL contain exact `state`,
`direction`, `held_reason`, `asserts_move`, conditionally present
`days_observed`, and `omitted`. `omitted` SHALL compare exactly and SHALL range
only over the family's serialized field names outside its value-pinned list. A
value-pinned field whose value is `None` SHALL be pinned as that value and SHALL
NOT also appear in `omitted`. Basal no-baseline SHALL use
`omitted={"current"}` because `current` is outside basal's value-pinned list and
serializes as `None`; ISF direction-only SHALL use
`omitted={"recommended"}`. I:C collecting and asserting rows SHALL pin exact
emitted `days_observed`; every other I:C row SHALL include `days_observed` in
`omitted`, and its non-collecting span guard SHALL be exact `state`.
`QaExpectation` SHALL gain
`analyzer_rows: Mapping[AnalyzerRowKey, ExpectedAnalyzerRow]`. Whole-set equality
SHALL fail on every unexpected or missing analyzer key without a separate absence
collection. `QaCase` SHALL gain
`target_family: Literal["basal", "isf", "ic"] | None`. Every new #192 coverage
case SHALL name its family; `showcase`, `setting-recommendation`, and
`behavioral-precedence` SHALL use `None`. `assert_expectation` SHALL pin a named
target family's full emitted key set and each other family's exact set of keys
outside its measured quiet predicate. A `None` target SHALL pin that measured
non-quiet complement in all three families. The quiet predicates are: basal
quiet SHALL mean `safety_status` in
`{NO_CHANGE, NO_DATA, None}` (a `NO_DATA` blind slot has no estimate and cannot
hide a move); ISF quiet SHALL mean `asserts_move == false` with no
`evidence["direction"]`; I:C quiet SHALL mean `state` in `collecting`,
`below-floor`, or `unmeasured-alone`, or `state == "numeric"` with
`asserts_move == false` and no `held_reason`. The non-target set SHALL be the
exact measured complement of those predicates, never an assumed-empty set, so
stray states fail closed without repeating every quiet row. `QaCase` SHALL also gain
`scoped_windows: tuple[tuple[int, int], ...]`, expressed in clock minutes and
empty by default; `execute_case` SHALL project `whole_day()` and every declared
window through `WindowQuery.clock`. Queue rows and absences SHALL be keyed by
`(window | "whole_day", row key)`. `QaExpectation` SHALL also compare support
through `support: Mapping[AnalyzerRowKey, ExpectedSupport]`. Basal support SHALL
pin `evidence["directional_support_count"]` (`analyzers/basal.py:562-564`); ISF
support SHALL pin `evidence["n_steps"]` (`analyzers/isf.py:634-645`); I:C support
SHALL pin top-level `n_runs` and
`evidence["eligibility"]["effective_run_count"]` (`result.py:330-366`;
`analyzers/ic.py:2511-2518`). Support SHALL distinguish
`basal-insufficient-seven-night` from
`basal-insufficient-unsupported-sign`, and `ic-quiet-seven-run` from `ic-raise`.
The single Fasting ISF row's rest windows SHALL be an exact set
keyed by `(date, start, end)`. Projected I:C history series SHALL contain one
non-empty series per active identity keyed by identity; the mapping SHALL be empty
when no identity is active.

Every case's target-family map SHALL be authored by hand as one literal per-case
default `ExpectedAnalyzerRow` plus named per-key literal overrides from the design
matrix. Neither default nor overrides SHALL be constructed from a `QaExecution`
or analyzer output at test time. At least one generated `test_case_*` SHALL
perturb the default row rather than a named override and SHALL fail. Queue rows
and absences, support, rest windows, and history series SHALL follow the same
literal-only rule. Existing `behavioral_rows` and `finding_titles` SHALL be
retained verbatim; the extended contract SHALL add to them and replace neither.
Fixture inputs SHALL NOT set analyzer verdicts, directions, held reasons,
registers, ranks, or queue rows. Perturbing any expected row, queue absence,
support value, or staging value SHALL fail. The basal cases SHALL cover every basal
condition in the design matrix.

#### Scenario: The eight-night basal floor is data-produced

- **GIVEN** isolated basal cases with seven and eight informative non-tie nights
- **WHEN** production analysis and findings projection run
- **THEN** the seven-night case publishes its exact held contract without staging
- **AND** the supported eight-night case stages only when the family-corrected
  sign test also passes

### Requirement: Isolated stores use family spans and leave showcase unchanged

Span SHALL mean inclusive calendar-day write depth from the earliest written
basal, CGM, or bolus event row through the latest basal or CGM event row, which
sets the case's store-derived `now`; bolus participates in the start only and
settings snapshots SHALL be excluded. Analyzer depth SHALL be stated as days back from `now`; for an
end-of-day `now`, inclusive calendar days SHALL equal days back plus one. Each new
coverage case SHALL declare its source span and `materialize_case` SHALL write
exactly that depth. The family days-back rule SHALL be a minimum only when the
case's pinned expectation requires family maturity. A case MAY declare a shorter
span when its pinned I:C `state` is `collecting` with exact emitted
`days_observed`, or when its pinned ISF outcome does not require the prior-decision
window. Task 1 SHALL assert declaration against recipe depth and SHALL NOT apply a
family floor independently of the pinned expectation. Mature basal coverage SHALL reach at least
`window_days + _BOLUS_LEADIN` = 31 days back for the segment lane, 32 inclusive;
ISF coverage whose outcome needs the prior-decision window SHALL reach at least
`window_days + _ISF_DECISION_INTERVAL + _BOLUS_LEADIN` = 38 days back, 39
inclusive; and mature I:C coverage SHALL reach at least `BLOCK_WINDOW_DAYS` = 90 days
back, 91 inclusive, because block maturity is
`now - earliest basal/CGM/bolus event >= BLOCK_WINDOW_DAYS` and that block lane
does not read `_BOLUS_LEADIN`. Because `observed_days` floors elapsed seconds,
coverage recipes SHALL anchor their earliest event at or before `now`'s time of
day. Collecting and asserting I:C rows SHALL pin exact emitted `days_observed`;
other non-collecting rows SHALL pin exact `state` and omit `days_observed`, so a
short depth still fails closed. `showcase` SHALL declare span 30 at its
existing anchor. The committed database bytes, showcase recipe, and its produced
rows SHALL remain unchanged; its expectation SHALL be re-expressed in the
extended contract with no observed value changing. `setting-recommendation`
SHALL declare span 12 and retain its
bolus-free recipe without a lead-in; `behavioral-precedence` SHALL declare span 5
for its unchanged 2024-06-25 through 2024-06-29 recipe. Tests SHALL assert all
three existing declarations against their recipes' actual event depth. The latter
two SHALL derive new exact
expectation fields from analyzer output.
Production composition SHALL retain `window_days=30`
and store-derived `now`.

`scripts/gen_qa_e2e_db.py --case <name> --out <path>` SHALL emit one named case as
a provenance-stamped, uncommitted SQLite store through the catalog materializer.
The parser's `--out` SHALL use `default=None`; without `--case`, `None` SHALL
resolve to `DEFAULT_OUTPUT`, preserving the bare generator and `--check`, while
`--case <name>` without `--out` SHALL be an argument error that exits nonzero and
writes nothing. `--case` with `--check` SHALL be an argument error; an unknown
name SHALL exit nonzero while naming the available catalog.
The default generator and `--check` SHALL continue to materialize and compare only
`showcase`. The committed database bytes, showcase recipe, and showcase-produced
rows SHALL remain unchanged; the expectation SHALL be re-expressed in the
extended contract without changing any observed value. `QaCase` SHALL gain a
`recipe` callable, and `materialize_case` SHALL call it directly instead of using
the current `if`/`elif` dispatch. One unittest method named
`test_case_<name with '-' replaced by '_'>` per catalog case SHALL make
`--durations=0` report each case independently, and each generated method SHALL
carry the original case name. Tests SHALL decode those method names and assert
that the resulting case-name set equals `{case.name for case in QA_CASES}`. They
SHALL retain the literal exact catalog-tuple assertion so a dropped or misnamed
case fails closed. The generated methods SHALL replace
`test_each_catalog_case_runs_the_real_producer_composition` and
`test_setting_recommendation_case_runs_the_real_producer_composition`; the exact
catalog-tuple and decoded-name-set tests SHALL be the only retained
execution-free catalog tests.
Generator tests SHALL snapshot `DEFAULT_OUTPUT`'s bytes and mtime and assert that
every generator invocation in the suite leaves both unchanged. Resolution of an
unsupplied `--out` to `DEFAULT_OUTPUT` SHALL be proved only through the read-only
bare `--check`; the suite SHALL NOT exercise bare write mode against the committed
path. Named-case tests SHALL retain the valid scratch-emission and failure-mode
coverage above.

`gen_qa_e2e_db.py --check` SHALL report the showcase's logical contents current.
`git diff --quiet origin/main -- mockups/qa-e2e.synthetic/harmonic.sqlite` SHALL exit 0 to
prove the committed store's bytes were untouched.

#### Scenario: Pinned maturity determines source depth

- **WHEN** new basal, ISF, and I:C coverage cases are materialized
- **THEN** each declaration exactly matches its recipe's event depth
- **AND** a case whose pinned expectation requires family maturity meets the
  imported family-specific minimum without repeated numeric policy literals
- **AND** a collecting I:C case or an ISF case that does not need prior-decision
  replay may declare a shorter depth
- **AND** collecting and asserting I:C rows pin emitted `days_observed`, while
  every other I:C row pins its exact state and omits that field
- **AND** each case runs using only its own rows and snapshots

#### Scenario: A named case can be emitted for no-fetch UI work

- **WHEN** the generator receives a valid catalog name through `--case` and an
  output path through `--out`
- **THEN** it writes only that case with the standard synthetic provenance stamp
- **AND** no named case store becomes a committed artifact

#### Scenario: Unsafe named-case invocations fail closed

- **WHEN** `--case` is given without `--out`, with `--check`, or with an unknown
  name
- **THEN** the command exits nonzero without writing the committed database
- **AND** the unknown-name error identifies the available catalog

#### Scenario: The committed database remains showcase-only

- **WHEN** either #192 task completes or stops early
- **THEN** the committed database bytes remain unchanged
- **AND** the existing showcase-only `--check` reports current
- **AND** `git diff --quiet origin/main -- mockups/qa-e2e.synthetic/harmonic.sqlite` exits 0

#### Scenario: Fixed budgets stop the phase

- **WHEN** committed showcase size, drift, focused-suite time, isolated-case time,
  or whole-pytest time exceeds its recorded limit
- **THEN** the worker commits source and tests without touching the committed
  database, opens no pull request, reports the measurement on #192, and stops
- **AND** only a newer lock authorizes resumption

### Requirement: ISF and I:C eras prove analyzer-owned states exactly

Each ISF and I:C case SHALL use the shared expectation contract and its declared
span. Cases SHALL cover every ISF and I:C condition in the design matrix,
including direction-only non-stageable ISF, explicit 30-day I:C collecting, quiet
I:C, and the history register. Their isolated executions SHALL compare exact
analyzer rows, queue rows and absences, support values, staging values, the single
Fasting ISF row's keyed rest windows, and one keyed I:C history series per active
identity.

#### Scenario: I:C observation age is analyzer-produced

- **GIVEN** a 30-day I:C case and a mature I:C case whose span derives from
  `BLOCK_WINDOW_DAYS` days back, or 91 inclusive calendar days
- **WHEN** production analysis runs
- **THEN** the 30-day case exactly asserts its `days_observed` and `collecting`
- **AND** the mature case asserts a non-collecting state; an asserting block pins
  `days_observed == BLOCK_WINDOW_DAYS`, while another mature state omits the field

#### Scenario: The eight-run I:C floor is data-produced

- **GIVEN** mature isolated I:C cases with seven and eight effective closed meal
  runs
- **WHEN** production analysis and findings projection run
- **THEN** the seven-run block remains below-floor and non-stageable
- **AND** the eight-run block asserts only when every analyzer-owned eligibility
  condition passes

#### Scenario: Held, blind, quiet, direction-only, and history remain distinct

- **WHEN** isolated ISF and I:C cases run the whole-day projection and the clock
  windows named by `QaCase.scoped_windows`
- **THEN** asserting, held, blind, quiet or absent, direction-only non-stageable,
  and active history outcomes match their exact expected rows and absences
- **AND** direction-only ISF weaken never gains a recommendation, rank, or move

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
`ExpectedVerdictTally` SHALL contain a literal denominator and a literal counts
mapping with exactly the five `FINDING_VERDICTS` keys. Assertion SHALL require
exact tally key-set equality; non-negative integer counts; all five keys; counts
summing to the denominator; the denominator equaling the exact
`exposures[family]["n"]`; equality with the matching finding row's
`verdict_counts_by_family[family]`; and aggregate `verdict_counts` equal to the
sum of its per-family tallies. No expected state, count, or denominator SHALL be
constructed from `QaExecution`, `execute_case`, analyzer output, exposure output,
or projection output at assertion time.

Each of the eight scenario-Lever cases SHALL contain exactly six target-family
Occurrences and SHALL literally expect two `fired` plus one `outranked`, one
`near_miss`, one `no_data`, and one `clean`. Its `(lever, family)` denominator
SHALL therefore be six with exact counts `{fired: 2, outranked: 1, near_miss: 1,
no_data: 1, clean: 1}`. The meal-bolus-short recurrence appearance SHALL retain
its separately policy-owned completed-meal denominator. At least one generated
case test SHALL independently perturb a literal state, a literal denominator,
and a zero-valued verdict count and SHALL fail for each mutation.

`QaExpectation` SHALL also gain an exact whole-window `uncaused_highs` value,
defaulted so existing cases retain their output. The `behavioral-uncaused-highs`
case SHALL produce two high Occurrences that are both non-driver/clean at the
family level while exactly one whole Episode has no Lever; it SHALL pin
`uncaused_highs == 1`. The five negative cases SHALL prove, through exact whole-set
rows, titles, tallies, and denominators, that a false-low excursion is removed, a
`low:no` answer suppresses over-treated-low attribution without deleting the
printed low, an unbolused Carb-log entry is exclusion-only and never a meal, one
correction creates no correction cluster, and precedence retains an outranked
anchor while only the earlier driver owns attribution.

Before the remaining 16 cases are authored, the first representative
scenario-Lever case SHALL be timed and task 3 SHALL project
`16 × representative case time + 11.38 s` against the unchanged 90-second focused
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

#### Scenario: Every Lever band shares its exact family denominator

- **GIVEN** each scenario-Lever case's six target-family Occurrences
- **WHEN** its finding row is projected
- **THEN** its five literal counts are `2, 1, 1, 1, 1` in
  `FINDING_VERDICTS` order and sum to six
- **AND** six equals both the target exposure family's `n` and the matching
  `verdict_counts_by_family` denominator
- **AND** aggregate counts equal the sum of the exact per-family tallies

#### Scenario: Negative evidence cannot become a finding

- **WHEN** the five named negative cases execute
- **THEN** false-low, `low:no`, unbolused-carb, lone-correction, and preempted
  conditions retain exactly the rows and absences named by the design
- **AND** no recipe injects the verdict or attribution that the assertion expects

#### Scenario: Behavioral coverage leaves the showcase and budgets fixed

- **WHEN** task 3 completes or stops on a budget breach
- **THEN** the committed showcase drift check remains current and its bytes remain
  unchanged against `origin/main`
- **AND** the five measured budgets are recorded without raising a limit
