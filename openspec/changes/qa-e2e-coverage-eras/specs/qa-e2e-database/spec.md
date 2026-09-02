## ADDED Requirements

### Requirement: The shared expectation contract proves basal states exactly

Each basal coverage case SHALL materialize manufactured source rows into one
isolated store and SHALL run production analysis, exposure, scenario, findings,
and I:C-history composition. `QaExpectation` SHALL compare exact whole sets of
analyzer rows and absences, scoped and unscoped queue rows and absences, support
values, and `asserts_move` values. ISF rest windows SHALL be keyed by ISF row
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

Each new coverage case SHALL declare its source span and `materialize_case` SHALL
write that many manufactured days ending at the case's `now`. Basal spans SHALL
derive from the production request and SHALL add imported `_BOLUS_LEADIN` when a
recipe places boluses; ISF spans SHALL also include imported
`_ISF_DECISION_INTERVAL`; I:C spans SHALL derive from imported
`BLOCK_WINDOW_DAYS` plus `_BOLUS_LEADIN`. `showcase` SHALL declare span 30 at its
existing anchor and SHALL retain its recipe, rows, and expectation
byte-identically. `setting-recommendation` SHALL declare span 12 and retain its
bolus-free recipe without a lead-in; `behavioral-precedence` SHALL declare span 30
and retain its current recipe shape. The latter two SHALL derive new exact
expectation fields from analyzer output.
Production composition SHALL retain `window_days=30`
and store-derived `now`.

`scripts/gen_qa_e2e_db.py --case <name> --out <path>` SHALL emit one named case as
a provenance-stamped, uncommitted SQLite store through the catalog materializer.
`--out` SHALL be mandatory with `--case`, and `--case` with `--check` SHALL be an
argument error. A test SHALL prove that `--case <name>` without `--out` exits
nonzero and writes nothing; an unknown name SHALL exit nonzero while naming the
available catalog.
The default generator and `--check` SHALL continue to materialize and compare only
`showcase`; the committed database and showcase expectation SHALL remain
byte-identical. One generated test method per catalog case SHALL make
`--durations=0` report each case independently. Tests SHALL assert that the set of
generated per-case method names equals `{case.name for case in QA_CASES}` and
SHALL retain the exact catalog-tuple assertion so a dropped or misnamed case fails
closed.

#### Scenario: Family constants determine source depth

- **WHEN** new basal, ISF, and I:C coverage cases are materialized
- **THEN** their source spans derive from the imported family constants in the
  design without repeated numeric policy literals
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
  `BLOCK_WINDOW_DAYS + _BOLUS_LEADIN`
- **WHEN** production analysis runs
- **THEN** the 30-day case is exactly `collecting`
- **AND** the mature case reaches `BLOCK_WINDOW_DAYS` and may produce the matrix's
  non-collecting states

#### Scenario: The eight-run I:C floor is data-produced

- **GIVEN** mature isolated I:C cases with seven and eight effective closed meal
  runs
- **WHEN** production analysis and findings projection run
- **THEN** the seven-run block remains below-floor and non-stageable
- **AND** the eight-run block asserts only when every analyzer-owned eligibility
  condition passes

#### Scenario: Held, blind, quiet, direction-only, and history remain distinct

- **WHEN** isolated ISF and I:C cases run the unscoped whole-day and named scoped
  projections
- **THEN** asserting, held, blind, quiet or absent, direction-only non-stageable,
  and active history outcomes match their exact expected rows and absences
- **AND** direction-only ISF weaken never gains a recommendation, rank, or move
