## ADDED Requirements

### Requirement: The shared expectation contract proves basal states exactly

Each basal coverage case SHALL materialize manufactured source events and settings
into an isolated temporary store and SHALL run the production analysis, exposure,
scenario, findings-projection, and I:C-history composition. `QaExpectation` SHALL
compare exact whole sets of analyzer rows and absences, scoped and unscoped queue
rows and absences, support values, and `asserts_move` values. ISF rest windows
SHALL be keyed by ISF row identity plus `(date, start, end)`, observed across every
ISF row rather than row zero, and SHALL express an empty ISF list. I:C history
series SHALL contain one series per active identity keyed by identity, and a case
with no active identity SHALL expect an empty keyed set. Every case SHALL declare
the full-catalog identities and lifecycles it contributes to concatenation, and
its isolated complete I:C history catalog SHALL be keyed by identity across every
lifecycle. Each keyed expectation SHALL compare the complete row payload, not a
count. Fixture inputs SHALL NOT set `asserts_move`,
safety status, direction, held reason, register, queue row, priority, or
attribution. Perturbing any expected row, absence, support value, or staging value
SHALL fail. The basal cases SHALL cover every basal condition in the design matrix.

#### Scenario: The eight-night basal floor is data-produced

- **GIVEN** isolated basal cases with seven and eight informative non-tie nights
- **WHEN** the production analyzer and findings projection run
- **THEN** the seven-night case publishes the exact held analyzer/projection
  contract without staging, and the supported eight-night case publishes its exact
  direction and stageability only when the family-corrected sign test also passes

### Requirement: The committed QA database contains eras without cross-era leakage

The QA generator SHALL append coverage eras before the showcase and SHALL verify
from materialized rows that showcase is newest in basal, CGM, bolus, and settings
time. It SHALL allocate descending, non-overlapping date slots from era index for
timestamp-keyed tables and disjoint `era index × stride` `seq_num` blocks for every
seq-keyed table. Each coverage era's latest basal, CGM, or bolus event SHALL be
strictly more than `ciq_autotune.analyzers.ic.BLOCK_WINDOW_DAYS` plus
`ciq_autotune.analyze._BOLUS_LEADIN` before showcase's earliest event; the
generator SHALL import `BLOCK_WINDOW_DAYS` rather than duplicate its numeric
value. Stored row counts SHALL equal the sum written by all recipes. The complete
concatenated `analysis["ic_history"]` identity set across active, aged-out, and
unavailable lifecycles SHALL equal the union of the identity → lifecycle
declarations made by every catalog case, failing on every undeclared or missing
identity. Every case SHALL remain independently runnable with only its own rows
and snapshots and SHALL assert its isolated full catalog exactly. The generated
SQLite artifact SHALL retain its synthetic provenance and logical drift
comparison.

#### Scenario: Earlier coverage eras cannot own an analysis lane

- **WHEN** all #192 eras and showcase are materialized into the committed database
- **THEN** the production 30-day projection derives its cutoff from showcase and no
  earlier event or settings snapshot enters it
- **AND** no earlier bolus enters the fixed I:C block lane or its one-day lead-in

#### Scenario: Every concatenated history identity is declared

- **GIVEN** an earlier era has enough carb-bearing boluses and a carb-ratio snapshot
  to make a past identity publishable
- **WHEN** the concatenated showcase analysis runs
- **THEN** that case declares the identity and lifecycle it contributes, and the
  concatenated complete all-lifecycle I:C history identity set equals the union of
  every case declaration
- **AND** any undeclared or missing active, aged-out, or unavailable identity fails
  the generator even when active findings projection omits it

#### Scenario: Era storage keys cannot silently merge

- **GIVEN** each era owns a descending date slot and a disjoint `seq_num` block
- **WHEN** all eras are concatenated
- **THEN** timestamp-keyed rows do not overlap, seq-keyed rows do not collide, and
  every table's stored row count equals the sum written by its recipes

#### Scenario: A case stays isolated from concatenation

- **WHEN** any #192 catalog case is materialized by itself
- **THEN** its exact analyzer and queue expectations pass using only that case's
  source rows and settings snapshots

#### Scenario: An incomplete or over-budget chunk stops without a database

- **WHEN** a chunk exceeds any recorded limit or ends before its Done-when
- **THEN** the worker commits its source and tests on the chunk branch without
  regenerating or committing the database, opens no pull request, reports the
  measurements or stopping point on #192, and stops
- **AND** a red drift check on that stopped branch is expected until a newer lock
  authorizes resumption

### Requirement: ISF and I:C eras prove their analyzer-owned states exactly

Each ISF and I:C coverage case SHALL use the shared exact expectation contract and
production composition. The cases SHALL cover every ISF and I:C condition in the
design matrix, including direction-only non-stageable ISF, quiet I:C, and the
history register. Their isolated and concatenated executions SHALL compare exact
analyzer rows, queue rows and absences, support values, staging values, keyed ISF
rest windows, one keyed I:C history series per active identity, per-case catalog
declarations, and each isolated case's complete all-lifecycle I:C history catalog.

#### Scenario: The eight-run I:C floor is data-produced

- **GIVEN** isolated I:C cases with seven and eight effective closed meal runs
- **WHEN** the production analyzer and findings projection run
- **THEN** the seven-run block remains below-floor and non-stageable, while the
  eight-run block asserts only when every analyzer-owned eligibility condition
  passes

#### Scenario: Held, blind, quiet, direction-only, and history outcomes stay distinct

- **WHEN** the isolated ISF and I:C cases run the unscoped whole-day projection and
  the scoped clock projections named by their expectations
- **THEN** asserting, held, blind, quiet or absent, direction-only non-stageable,
  and active history outcomes match their exact expected rows and absences
- **AND** direction-only ISF weaken never gains a recommendation, priority rank, or
  stageable move
- **AND** projected history IDs and series match exactly while the full catalog
  separately accounts for every lifecycle
