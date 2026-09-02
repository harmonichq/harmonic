# qa-e2e-database Specification

## Purpose
The synthetic QA database is the one offline, generator-built source the app,
CI and design work run against: a committed showcase store for whole-app UI
composition, plus a catalog of isolated coverage eras, each a manufactured case
that drives the real analyzers, scenario engine and findings projection into one
named state and pins that state as a literal, whole-set expectation. It exists
so that every advisory-dosing surface can be exercised without real patient
data, so a green run can never assert less than the catalog declares, and so a
new finding or analyzer behavior has a fixed procedure for gaining a covering era.

## Requirements

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
`git diff --quiet origin/main -- the committed QA showcase database` SHALL exit 0 to
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
- **AND** `git diff --quiet origin/main -- the committed QA showcase database` exits 0

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
| `behavioral-late-bolus` | `(late_bolus, meals)` = `2 / 1 / 1 / 1 / 1`, denominator 6 | `(carb_undercount, meals)` = `1 / 2 / 0 / 0 / 3`, denominator 6 |
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

### Requirement: Remaining consumers migrate before revise-E2E retires

The 11 executable consumers resolved from the archived migration checklist SHALL be
accounted for by the `#319 migration` table in `design.md`. The CI drift step,
browser-gates server, route-level fixture copy, public-link pin and test, public
binary-policy test, agent instructions, and every direct database reference SHALL
use the QA showcase or an explicitly emitted named case store. Only the Diagnose
workstation behavior ledger is a database-backed browser consumer: its CI matrix
row has `server: true`. The event-comparison replay, comparison support audit, and
Verify behavior replay stub their own data, are not database consumers, and owe no
migration or database proof. The already-migrated
`harmonic-nofetch` launch entry and harness instructions SHALL remain on the QA
scratch-copy workflow.

The CI server SHALL first copy the committed QA showcase database to
`$RUNNER_TEMP/harmonic-qa.sqlite` and SHALL serve only that copy with
`--no-fetch`; it SHALL never serve the committed path. `/api/health` SHALL answer
inside the existing 30-attempt poll. The documented local serve SHALL retain
tokenless operation, scratch-copy isolation, and `--no-fetch`. The route test
SHALL copy the committed QA showcase into a temporary path, select
`finding:over_treated_low`, and pin summary `{"claimed": 1, "denominator": 5,
"noun": "lows"}`, verdict-count sum `5`, and occurrence count `5`. The QA generator and case
tests SHALL retain the old generator test's public production-composition proof:
analysis, exposures, scenarios, findings projection, and I:C history. The QA drift
step SHALL remain fail-closed. `tests/test_gen_qa_e2e_db.py` SHALL also port the
old data-boundary assertions that CLI output leaves no adjacent `-wal` or `-shm`
sidecar and that `store.get_credentials()` is `None` on the committed showcase.

Only after those replacements are proved SHALL the implementation delete
`scripts/gen_revise_e2e_db.py`, `tests/test_gen_revise_e2e_db.py`,
`mockups/revise-e2e.synthetic/`, and the old CI drift step.
`tests/test_revise_e2e_retired.py` SHALL fail closed on any hit from this exact
closed-surface command and SHALL separately require the generator file and fixture
directory to be absent:

```sh
rg -n --hidden 'revise-e2e|revise_e2e|gen_revise_e2e_db' AGENTS.md .claude .github harness scripts tests frontend mockups --glob 'AGENTS.md' --glob '.claude/**' --glob '.github/**' --glob 'harness/**' --glob 'scripts/**' --glob 'tests/**' --glob 'frontend/**' --glob 'mockups/**/*.mjs'
```

After both serial chunks land, the coordinator SHALL repeat that same command;
the expectation is no output and exit 1. `docs/`, `openspec/`, and
`mockups/*.md` are excluded because they are historical records that SHALL remain
unchanged.

The committed QA showcase SHALL remain byte-identical to `origin/main`. The
implementation SHALL leave this active change unarchived; `/ticket finalize`
owns archival after a human merges the implementation pull request.

#### Scenario: Every direct consumer has one QA successor

- **WHEN** the migration completes
- **THEN** the QA drift check is the only QA-database drift step
- **AND** the browser server copies the committed showcase to
  `$RUNNER_TEMP/harmonic-qa.sqlite` before serving, while the route-level API test
  uses its own temporary copy and the measured over-treated-low literals
- **AND** the QA-only public-link pin and binary-denial assertion remain
- **AND** launch and harness entrypoints remain on the QA scratch workflow

#### Scenario: The one database-backed browser consumer proves the migrated server

- **WHEN** the browser-gates job starts its declared synthetic server
- **THEN** it serves `$RUNNER_TEMP/harmonic-qa.sqlite` with `--no-fetch`
- **AND** `/api/health` answers inside the existing 30-attempt poll before the
  Diagnose workstation behavior ledger runs
- **AND** the three stub-backed browser rows owe no database migration or proof

#### Scenario: Retirement is evidence-based

- **WHEN** the committed retirement test and completion command run against the closed executable surface,
  including `.claude/` and `.github/`
- **THEN** any retired spelling produces a match and blocks completion
- **AND** the test separately requires the old generator and fixture directory to
  be absent
- **AND** when the command produces no output and exits 1, the old generator, test, fixture directory, and
  CI step are absent while historical evidence remains intact

#### Scenario: The showcase and active record do not move

- **WHEN** task 4 reaches the pull-request boundary
- **THEN** `git diff --quiet origin/main -- the committed QA showcase database`
  exits zero
- **AND** the active change remains under `openspec/changes/qa-e2e-coverage-eras/`
  for post-merge finalization to archive

### Requirement: Agent guidance explains era upkeep and UI use

`AGENTS.md` SHALL contain a short procedural recipe for adding or updating a
coverage era when an analyzer state or Finding changes. The recipe SHALL start
from a manufactured case recipe, require the author to execute the case and copy
the complete serialized row dump into literal expectations, identify the
catalog-generated `test_case_<case name with hyphens replaced by underscores>`
method as the per-case test, and require all five existing budgets to be
re-measured without raising their limits. It SHALL state that expectations are
never derived from analyzer or projection output at assertion time and that a
budget breach stops without changing the committed showcase.

The guide SHALL show `uv run python scripts/gen_qa_e2e_db.py --case <name> --out
<scratch path>` as the named-case emitter and SHALL connect that output to the
single documented copy-then-serve command with `--no-fetch` and an empty token.
It SHALL distinguish the UI questions each source answers: the showcase for
whole-app layout, dense chronology, navigation, and mixed-state composition; a
named case store for one exact analyzer or Finding state through production APIs;
and manufactured component-harness stories for isolated chart layout or
interaction before full-app integration. It SHALL forbid committing emitted case
stores, normal serve, and live fetch in automated work.

`CONTEXT.md` SHALL define **coverage era**, **case store**, and **showcase** as the
ubiquitous terms in `#319 agent guidance` without duplicating the catalog or
expectation contract.

#### Scenario: A new analyzer or Finding behavior gains a coverage era

- **GIVEN** a manufactured recipe for the new behavior
- **WHEN** an agent executes it through the production composition
- **THEN** the serialized rows become literal expectations owned by the case
- **AND** the generated per-case test and all five budgets prove the addition
- **AND** no expected verdict or row is derived at assertion time

#### Scenario: A named case drives a UI decision safely

- **WHEN** an agent needs one exact analyzer or Finding state in the full app
- **THEN** it emits the named case to an uncommitted scratch path
- **AND** serves a scratch copy through the documented tokenless `--no-fetch`
  command
- **AND** uses the showcase or component harness instead when the question is
  whole-app composition or isolated chart behavior, respectively
