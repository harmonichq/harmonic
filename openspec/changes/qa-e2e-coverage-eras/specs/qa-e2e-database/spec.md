## ADDED Requirements

### Requirement: The shared expectation contract proves basal states exactly

Each basal coverage case SHALL materialize manufactured source rows into one
isolated store and SHALL run production analysis, exposure, scenario, findings,
and I:C-history composition. `AnalyzerRowKey` SHALL be analyzer family plus its
emitted parameter key: basal clock-slot label, ISF segment, or I:C block.
`ExpectedAnalyzerRow` SHALL contain exact `safety_status`, direction when
applicable, `asserts_move`, and `omitted: frozenset[str]`, compared exactly as the
serialized field names expected absent or `None`; basal no-baseline SHALL use
`omitted={"current"}` and ISF direction-only SHALL use
`omitted={"recommended"}`. I:C rows SHALL also contain exact `days_observed`, so
block maturity is asserted rather than assumed from fixture depth.
`QaExpectation` SHALL gain
`analyzer_rows: Mapping[AnalyzerRowKey, ExpectedAnalyzerRow]` and
`absent_analyzer_rows`. Each case's target family SHALL pin its full emitted key
set. Each non-target family SHALL pin the exact set of keys whose `asserts_move`
is true or whose `safety_status` is not that analyzer's quiet/no-change status;
the expected set SHALL be empty when no such row exists, so stray moves fail
closed without repeating every quiet row. `QaCase` SHALL gain
`scoped_windows: tuple[tuple[int, int], ...]`, expressed in clock minutes and
empty by default; `execute_case` SHALL project `whole_day()` and every declared
window through `WindowQuery.clock`. Queue rows and absences SHALL be keyed by
`(window | "whole_day", row key)`. `QaExpectation` SHALL also compare support
values exactly. ISF rest windows SHALL be keyed by ISF row
identity plus `(date, start, end)`, observed across every ISF row, and SHALL
express an empty ISF list. Projected I:C history series SHALL contain one series
per active identity keyed by identity; no active identity SHALL expect an empty
set. Fixture inputs SHALL NOT set analyzer verdicts, directions, held reasons,
registers, ranks, or queue rows. Perturbing any expected row, absence, support
value, or staging value SHALL fail. The basal cases SHALL cover every basal
condition in the design matrix.

#### Scenario: The eight-night basal floor is data-produced

- **GIVEN** isolated basal cases with seven and eight informative non-tie nights
- **WHEN** production analysis and findings projection run
- **THEN** the seven-night case publishes its exact held contract without staging
- **AND** the supported eight-night case stages only when the family-corrected
  sign test also passes

### Requirement: Isolated stores use family spans and leave showcase unchanged

Span SHALL mean inclusive calendar-day write depth from the earliest written
basal, CGM, or bolus event row through the case's `now`; settings snapshots SHALL
be excluded. Analyzer depth SHALL be stated as days back from `now`; for an
end-of-day `now`, inclusive calendar days SHALL equal days back plus one. Each new
coverage case SHALL declare its source span and `materialize_case` SHALL write
exactly that depth. Basal coverage SHALL reach at least
`window_days + _BOLUS_LEADIN` = 31 days back for the segment lane, 32 inclusive;
ISF coverage SHALL reach at least
`window_days + _ISF_DECISION_INTERVAL + _BOLUS_LEADIN` = 38 days back, 39
inclusive; and I:C coverage SHALL reach at least `BLOCK_WINDOW_DAYS` = 90 days
back, 91 inclusive, because block maturity is
`now - earliest basal/CGM/bolus event >= BLOCK_WINDOW_DAYS` and that block lane
does not read `_BOLUS_LEADIN`. Because `observed_days` floors elapsed seconds,
coverage recipes SHALL anchor their earliest event at or before `now`'s time of
day, and exact I:C `days_observed` expectations SHALL fail when the depth is
short. `showcase` SHALL declare span 30 at its
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
`recipe` callable, and a name-to-recipe registry SHALL replace the current
`if`/`elif` materializer dispatch. One unittest method named
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
Named-case tests SHALL assert that every `--case` invocation, including a valid
scratch emission and every failure mode, leaves `DEFAULT_OUTPUT` unwritten.

`gen_qa_e2e_db.py --check` SHALL report the showcase's logical contents current.
`git diff --quiet origin/main -- mockups/qa-e2e.synthetic/harmonic.sqlite` SHALL exit 0 to
prove the committed store's bytes were untouched.

#### Scenario: Family constants determine source depth

- **WHEN** new basal, ISF, and I:C coverage cases are materialized
- **THEN** their earliest events meet the imported family-specific days-back
  rules in the design without repeated numeric policy literals
- **AND** every I:C row exactly asserts analyzer-produced `days_observed`
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
family span. Cases SHALL cover every ISF and I:C condition in the design matrix,
including direction-only non-stageable ISF, explicit 30-day I:C collecting, quiet
I:C, and the history register. Their isolated executions SHALL compare exact
analyzer rows, queue rows and absences, support values, staging values, all-row ISF
rest windows, and one keyed I:C history series per active identity.

#### Scenario: I:C observation age is analyzer-produced

- **GIVEN** a 30-day I:C case and a mature I:C case whose span derives from
  `BLOCK_WINDOW_DAYS` days back, or 91 inclusive calendar days
- **WHEN** production analysis runs
- **THEN** the 30-day case exactly asserts its `days_observed` and `collecting`
- **AND** the mature case exactly asserts `days_observed == BLOCK_WINDOW_DAYS`
  and may produce the matrix's non-collecting states

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
