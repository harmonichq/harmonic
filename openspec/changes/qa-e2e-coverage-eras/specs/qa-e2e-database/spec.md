## ADDED Requirements

### Requirement: Coverage eras prove analyzer-owned parameter states exactly

Each basal, ISF, and I:C coverage case SHALL materialize manufactured source
events and settings into an isolated temporary store and SHALL run the production
analysis, exposure, scenario, findings-projection, and I:C-history composition.
The case SHALL compare exact whole sets of expected analyzer rows and queue rows,
including explicit absences, support-floor counts, and `asserts_move` values.
Fixture inputs SHALL NOT set `asserts_move`, safety status, direction, held reason,
register, queue row, priority, or attribution. A case whose expected analyzer row,
queue row or absence, support count, or `asserts_move` value is perturbed SHALL
fail.

#### Scenario: The eight-night basal floor is data-produced

- **GIVEN** isolated basal cases with seven and eight informative non-tie nights
- **WHEN** the production analyzer and findings projection run
- **THEN** the seven-night case publishes the exact held analyzer/projection
  contract without staging, and the supported eight-night case publishes its exact
  direction and stageability only when the family-corrected sign test also passes

#### Scenario: The eight-run I:C floor is data-produced

- **GIVEN** isolated I:C cases with seven and eight effective closed meal runs
- **WHEN** the production analyzer and findings projection run
- **THEN** the seven-run block remains below-floor and non-stageable, while the
  eight-run block asserts only when every analyzer-owned eligibility condition
  passes

#### Scenario: Held, blind, quiet, direction-only, and history rows stay distinct

- **WHEN** the isolated cases run the unscoped whole-day projection and the scoped
  clock projections named by their expectations
- **THEN** asserting, held, blind, quiet/absent, direction-only non-stageable, and
  active history outcomes match their exact expected rows and absences
- **AND** a direction-only ISF weaken never gains a recommendation, priority rank,
  or stageable move

### Requirement: The committed QA database preserves showcase ownership while adding eras

The QA generator SHALL append coverage eras before the showcase era and SHALL
verify from materialized rows that the showcase is newest in basal/CGM event time
and settings-snapshot order, every coverage-era settings snapshot precedes every
showcase snapshot, and each coverage era's latest basal/CGM event is strictly more
than 30 days before the showcase's earliest basal/CGM event. Every catalog case
SHALL remain independently runnable with only its own rows and settings snapshots.
The generated SQLite artifact SHALL retain its synthetic provenance stamp and
logical `--check` drift comparison.

#### Scenario: Earlier coverage eras cannot own the app projection

- **WHEN** all #192 eras and the showcase are materialized into the committed QA
  database
- **THEN** the production 30-day projection derives its cutoff from the showcase's
  latest event and no earlier era or settings snapshot enters that projection

#### Scenario: A case stays isolated from concatenation

- **WHEN** any #192 catalog case is materialized by itself
- **THEN** its exact analyzer and queue expectations pass using only that case's
  source rows and settings snapshots

#### Scenario: A budget breach stops the phase

- **WHEN** the appended database exceeds 25 MiB, logical drift check exceeds 30
  seconds, the focused QA suite exceeds 90 seconds, or any case exceeds 15 seconds
- **THEN** the replacement database is not committed and the split decision returns
  to the operator without raising a limit
