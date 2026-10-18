## ADDED Requirements

### Requirement: Every QA database consumer reads the showcase or an emitted case store

Every executable consumer of a synthetic QA database SHALL use the committed QA
showcase or a named case store that `scripts/gen_qa_e2e_db.py --case` emits. The consumers are:

- the CI drift step (`scripts/gen_qa_e2e_db.py --check`), which SHALL remain
  fail-closed;
- the served-app smoke test (`scripts/smoke_app.py`), the one database-backed
  serve in CI. It SHALL copy the committed showcase to a scratch path, or have
  the generator emit a named case store there, and serve only that store with
  `harmonic serve --no-fetch --token ''`, never the committed path; the image's
  smoke step SHALL likewise serve a copy;
- the live adapter's contract tests and the app's one browser smoke test
  (#475), which read only the serve that smoke test boots;
- the route-level test, which SHALL copy the committed showcase into a temporary
  path, select `finding:over_treated_low`, and pin summary `{"claimed": 1,
  "denominator": 5, "noun": "lows"}`, verdict-count sum `5` and occurrence
  count `5`;
- the public-link pin with its test, which allow the showcase's path only in the
  agent instructions, and the public binary-policy test, which keeps the
  `.sqlite` binary out of the public tree;
- the agent instructions and the `harmonic-nofetch` launch entry, whose
  documented local serve SHALL stay tokenless, isolated to a scratch copy, and
  `--no-fetch`.

The component library's Storybook suite answers from generated fixtures and is
not a database consumer. #416 deleted the Diagnose workstation behavior ledger and
the event-comparison, comparison-support and v1 Trial behavior replays, and the
swap to the five-tab app (#495) deleted the desk behavior-ledger replay and the
Trial and Pattern Focus browser suite. None of them remains a consumer.

The QA case tests SHALL keep the public production-composition proof: each case
runs through the production analysis, exposures, scenarios and findings
projection, and an I:C history case is among them.
`tests/test_gen_qa_e2e_db.py` SHALL assert that the generator's output leaves no
adjacent `-wal` or `-shm` sidecar, and that `store.get_credentials()` is `None` on
the committed showcase.

The retired revise-E2E store SHALL stay retired. `scripts/gen_revise_e2e_db.py`,
`tests/test_gen_revise_e2e_db.py` and `mockups/revise-e2e.synthetic/` stay absent.
`tests/test_revise_e2e_retired.py` SHALL fail closed on any retired spelling in
its executable surface: `AGENTS.md`, every file under `.claude`, `.github`,
`scripts`, `tests` and `frontend`, and the executable `.mjs` files under
`mockups/`. It SHALL separately require the old generator file and fixture
directory to be absent. `docs/`, `openspec/` and the rest of `mockups/` are
historical records outside that surface.

#### Scenario: Every direct consumer has one QA successor

- **WHEN** the executable consumers above are inspected
- **THEN** each names the committed QA showcase or a case store emitted by
  `scripts/gen_qa_e2e_db.py --case`
- **AND** the Storybook suite reads no database

#### Scenario: The smoke test serves a copy, never the committed store

- **WHEN** the served-app smoke test boots its server
- **THEN** that server reads a scratch copy of the committed showcase, or a
  case store the generator emitted into scratch, with `--no-fetch` and an empty
  token, and never the committed showcase path

#### Scenario: Retirement is evidence-based

- **WHEN** `tests/test_revise_e2e_retired.py` runs against its executable surface
- **THEN** any retired spelling produces a failure
- **AND** the test separately requires the old generator and fixture directory to
  be absent

#### Scenario: The showcase and active record do not move

- **WHEN** `scripts/gen_qa_e2e_db.py --check` runs
- **THEN** the committed showcase matches what its generator produces
- **AND** the #319 migration's decision record stays in the archived
  `qa-e2e-coverage-eras` change, unedited

### Requirement: ISF and I:C eras prove analyzer-owned states and the queue rows they serve exactly

Each ISF and I:C case SHALL use the shared expectation contract and its declared
span. Cases SHALL cover every ISF and I:C condition in the design matrix,
including direction-only non-stageable ISF, explicit 30-day I:C collecting, quiet
I:C, and an active past setting. Their isolated executions SHALL compare exact
analyzer rows, queue rows and absences, support values, staging values, the single
Fasting ISF row's keyed rest windows, and one keyed I:C history series per active
identity. The queue serves only asserting setting rows and Findings, so a held,
no-clean-day or past-setting state is proved by its analyzer row and its absence
from the queue (ADR 531).

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

#### Scenario: Only asserting settings reach the queue

- **WHEN** isolated ISF and I:C cases run the whole-day projection and the clock
  windows named by `QaCase.scoped_windows`
- **THEN** asserting, held, blind, quiet, direction-only non-stageable and active
  past-setting analyzer rows match their exact expected rows
- **AND** the queue rows are exactly the asserting ones expected, with no row for a
  held, blind, quiet or past-setting state
- **AND** direction-only ISF weaken never gains a recommendation, rank, or move

## MODIFIED Requirements

### Requirement: Behavioral eras prove occurrence states and verdict denominators exactly

Task 3 added the 17 isolated cases in the design's `#193 eras` table. ADR 499
removed `behavioral-meal-bolus-short` with its Lever, so exactly 16 SHALL remain:
11 positive behavioral/output cases and five suppression or negative guards. Each SHALL use the existing `QaCase.recipe`, `source_span_days`,
production composition, literal exact catalog tuple, and generated
`test_case_*` contract. Each SHALL set `target_family=None`; no new analyzer-family
value SHALL be introduced. Dates SHALL precede 2025-07-01. The committed showcase
recipe, produced rows, and SQLite bytes SHALL remain unchanged.

The three I:C behavioral findings SHALL be produced by `analyze_ic`; the seven
scenario Levers SHALL be produced by their production classifiers and attribution;
and unexplained highs SHALL be produced by the exposures feed.
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
| `behavioral-missed-meal` | `(missed_meal, highs)` = `2 / 0 / 1 / 1 / 2`, denominator 6 | none; no other Lever judges a High (ADR 499) |

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
serve as hidden context (`ciq_autotune/analyzers/scenario/engine.py:773-779`). At least one generated case test SHALL independently
perturb a literal state, a literal denominator, and a zero-valued verdict count
and SHALL fail for each mutation.

`QaExpectation` SHALL also gain an exact whole-window `uncaused_highs` value,
compared against the exposures feed's whole-window `highs.uncaused` count and
defaulted so existing cases retain their output. The `behavioral-uncaused-highs`
case SHALL produce two high Occurrences that are both non-driver/clean at the
family level in one whole Episode with no Lever; it SHALL pin
`uncaused_highs == 2`, counted once per high anchor by
`ciq_autotune/explore_exposures.py:155-156`. The five negative cases SHALL prove, through exact whole-set
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

## REMOVED Requirements

### Requirement: Sequence finding evidence is synthetic and reproducible

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). No sequence fixture, generator or QA recipe remains.

**Migration:** None; issue #501 tracks the replacement report card.

### Requirement: Dedicated sequence fixtures preserve served transport

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The dedicated eating-sequence payload, its generator and its twelve QA recipes are deleted.

**Migration:** None; issue #501 tracks the replacement report card.

### Requirement: Remaining consumers migrate before revise-E2E retires

**Reason:** The swap to the five-tab app (#495, ADR 495) retired the desk scenarios this requirement carried; it is restated without them as "Every QA database consumer reads the showcase or an emitted case store".

**Migration:** None; the server behavior it states is unchanged.

### Requirement: ISF and I:C eras prove analyzer-owned states exactly

**Reason:** Its last scenario proves held, blind and past-setting queue rows, which the findings answer no longer serves because nothing the app reads served them (#531, ADR 531). It is restated with that scenario replaced as "ISF and I:C eras prove analyzer-owned states and the queue rows they serve exactly".

**Migration:** Read "ISF and I:C eras prove analyzer-owned states and the queue rows they serve exactly", ADDED in this change. The held, blind and past-setting states stay proved through their analyzer rows.
