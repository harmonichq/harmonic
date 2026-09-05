## MODIFIED Requirements

### Requirement: Patterns are detected by instance classifiers that judge one behavior at a time.

The system SHALL satisfy the following:

Each behavioral classifier (late bolus, missed meal, carb undercount, etc.) is a pure function that inspects *one concrete occurrence* — "is this meal bolus late?" — and returns a judgment, a one-line reason, and an honesty tier. The scenario engine layers these instance verdicts into episodes, attributes each episode to its earliest actionable driver, and groups episodes by lever into patterns. A single dinner that trips multiple classifiers into three separate instance matches becomes one attributed episode, not three: co-occurring behaviors are narrated as consequences of the earliest cause, never as separate advice.

#### Scenario: Patterns are detected by instance classifiers that judge one behavior at a time.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

For an episode with an admitted High-carb sequence or Repeat eating candidate,
the shared evaluation SHALL retain every matched explanation and select the largest
candidate observed impact under the following requirements instead of the earliest
driver. Without such a candidate, the existing attribution rule SHALL remain.

## ADDED Requirements

### Requirement: Sequence competition prices observed impact before ownership

The behavioral evaluator SHALL compute candidate observed impact before ownership,
using the existing hypo-weighted severity and normalization on bounded episodes and
the mean over unique occurrence representatives. A multi-episode sequence SHALL use
its worst member as representative. The evaluation SHALL freeze outcome geometry
before comparing candidates, retaining the existing splits, rebound terminal and
non-overlap rules. A sequence SHALL associate through the clinically significant
CGM outcome witness in its selected half-open report interval, not by nearby trigger
time or an invented meal. Missing witness SHALL withhold that association.

Contested episodes SHALL select the largest unrounded candidate impact. Repeat
eating SHALL win exact ties with High-carb sequence; other exact ties SHALL retain
the existing chronological classifier order. Candidate matches and their prices
SHALL remain inspectable after losing. Model-view outranked state and findings'
row-relative fired criterion SHALL retain their distinct meanings.

Only winning episodes SHALL contribute attributed counts. Several winning episodes
from one sequence SHALL count once for that lever. Published impact SHALL retain
the candidate price used for comparison; recurrence SHALL use the existing Wilson
lower bound on winning unique occurrences over eligible opportunities, and Priority
SHALL use the shared formula. No iterative repricing from winners or additive
counting of overlapping 4-hour/6-hour windows SHALL occur. Price SHALL describe
observed burden, never expected benefit or an inferred dose.

#### Scenario: Observed impact reverses the winner
- **GIVEN** synthetic populations with a supported sequence candidate and an existing matched explanation on one episode
- **WHEN** their independently observed candidate impacts are ordered in either direction
- **THEN** the larger-impact candidate owns the contested episode in both configurations
- **AND** both matches remain inspectable while only the winner receives its attributed count

#### Scenario: Ownership does not change its own price
- **GIVEN** several contested episodes and a multi-episode sequence
- **WHEN** the public evaluation constructs its Patterns
- **THEN** published contender impact equals its pre-ownership price
- **AND** k does not exceed n, sequence identity is counted once, and bounded owned episodes do not double-charge outcome time

#### Scenario: Uncontested legacy attribution remains stable
- **GIVEN** no admitted sequence candidate in an episode
- **WHEN** Scenario, tally and model-view consume the evaluation
- **THEN** they preserve the existing ownership and occurrence identity for that episode

### Requirement: Sequence findings are served coherently through existing finding interfaces

The two closed behavioral levers SHALL produce normal server-ranked Pattern rows
and sequence case evidence through the existing findings and preparation interfaces.
Scenario, exposure, model-view, outcome counts and case files SHALL consume the same
evaluation rather than recompute ownership. Full-source-window prices SHALL remain
stable under a drawn clock window; scoped membership SHALL read the served outcome
witness. Finding, report and chart SHALL belong to one analysis generation and
retain the existing stale-generation retry behavior. Both levers SHALL remain
outside Plan, tuning schedules and safety-path judgment.

#### Scenario: Analyzer output reaches a scoped finding
- **GIVEN** sufficient synthetic sequences evaluated through the public analyzer interface
- **WHEN** the corresponding outcome witness falls inside a clock window while its trigger is outside
- **THEN** the finding includes the winning occurrence in that window with the source-window Priority
- **AND** its sequence identity and counts agree across the served interfaces

#### Scenario: A new behavioral finding cannot stage
- **GIVEN** either new lever is supported and ranked first
- **WHEN** its finding, catalog metadata and Plan inputs are inspected
- **THEN** there is no pump-setting mapping, staged item, schedule move or safety assertion from it
