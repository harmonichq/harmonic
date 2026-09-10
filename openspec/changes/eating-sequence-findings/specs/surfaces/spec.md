## MODIFIED Requirements

### Requirement: Diagnose hosts a non-advisory aggregate-evidence section outside Audit and Watching

Diagnose SHALL nest supported eating-sequence lever findings as habit causes under
Highs after meals in its existing queue. They SHALL have their own sequence counts
and no rank numeral or extra Findings/Sift count. The eating-sequence descriptor
SHALL bring the registry to six entries; the parent SHALL retain pattern-case-file. It SHALL NOT
create a separate aggregate section or new stage, drawer or dock behavior. Neither
finding SHALL stage a Plan change. Its adapter SHALL reshape
served aggregates without deriving a verdict, median, difference, or status. An
insufficient cell SHALL remain visible as insufficient rather than numeric. The chart SHALL be built and reviewed through the existing frontend chart design
harness in manufactured mode, using the real chart module and Diagnose composition.

#### Scenario: An insufficient served aggregate remains insufficient in the adapter

- **GIVEN** an eating-sequence report cell with insufficient status and null metric
- **WHEN** Diagnose adapts it for aggregate evidence
- **THEN** the chart-ready cell retains that status and null value
- **AND** it is neither dropped nor zero-filled

#### Scenario: The adapter does not re-derive an eating-sequence judgment

- **GIVEN** served aggregates, comparisons, statuses, findings, and exclusions
- **WHEN** Diagnose adapts the report
- **THEN** its outputs use those values field-for-field
- **AND** no frontend threshold, median, difference, or verdict is calculated

#### Scenario: The section consumes the server-owned fixed window

- **GIVEN** Diagnose requests eating-sequence evidence
- **WHEN** its data helper loads the report
- **THEN** it requests `/api/diagnose/eating-sequences` without a window parameter
- **AND** the server-owned fixed Diagnose source window determines the report

#### Scenario: A fresh report response does not invent an input-data age

- **GIVEN** a fresh eating-sequence report response without `input_data_age`
- **WHEN** Diagnose records its response age
- **THEN** the report passes through unchanged
- **AND** only that report shape's recorded age is cleared

## ADDED Requirements

### Requirement: Eating-sequence charts reuse the shipped tile and served cohort values

The eating-sequence registry kind SHALL precede the generic behavioral comparison
match for its two lever values and serve their tile, thumbnail, compact mini and
fullscreen drawing through one chart implementation. It SHALL show the selected
comparison and the three served intervals with explicit cohort names, units,
counts and null/insufficient states. No frontend-derived price, verdict, median
or difference SHALL be introduced. Different units SHALL not share an unlabeled
axis. Cohort comparisons SHALL not appear as predicted individual glucose traces.

#### Scenario: Both chart stories exercise the real composition
- **WHEN** the manufactured harness opens either new lever's supported or insufficient story
- **THEN** the story establishes its declared clock window and the shipped registry, chart and tile render the requested served state
- **AND** long labels, null cells and selected periods retain their meaning across chart sizes

#### Scenario: Existing stage and drawer behavior survive
- **WHEN** a reader selects a new finding, opens its chart fullscreen and returns
- **THEN** the existing stage, drawer, focus and selection behavior remains intact
- **AND** the frozen Diagnose behavior replay passes against the built app

### Requirement: Sequence drill reuses the shared clear control and frozen behavior

Sequence detail and the occurrence footer SHALL use the same Clear trace control
and callback. Canonical drill, All charts, fullscreen and return SHALL preserve
selection, focus and window. Sequence detail SHALL NOT add a Day handoff. The
revision SHALL satisfy S151–S158 in the existing ledger, preserve every inherited
active story and retain S117's retirement.

#### Scenario: Clear trace is shared across evidence kinds
- **WHEN** a reader drills into either sequence cause from its row or All charts
- **THEN** the existing Clear trace control is mounted with its inherited behavior
- **AND** fullscreen and return preserve the canonical cause, selection, focus and window
