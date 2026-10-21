## MODIFIED Requirements

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
`days_observed`. Task 1 SHALL assert declaration against recipe depth and SHALL NOT apply a
family floor independently of the pinned expectation. Mature basal coverage SHALL reach at least
`window_days + _BOLUS_LEADIN` = 31 days back for the segment lane, 32 inclusive;
and mature I:C coverage SHALL reach at least `BLOCK_WINDOW_DAYS` = 90 days
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

- **WHEN** new basal and I:C coverage cases are materialized
- **THEN** each declaration exactly matches its recipe's event depth
- **AND** a case whose pinned expectation requires family maturity meets the
  imported family-specific minimum without repeated numeric policy literals
- **AND** a collecting I:C case may declare a shorter depth
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
