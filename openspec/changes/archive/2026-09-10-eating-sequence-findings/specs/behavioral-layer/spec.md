## MODIFIED Requirements

### Requirement: Patterns are detected by instance classifiers that judge one behavior at a time.

The system SHALL satisfy the following:

Each behavioral classifier (late bolus, missed meal, carb undercount, etc.) is a pure function that inspects *one concrete occurrence* — "is this meal bolus late?" — and returns a judgment, a one-line reason, and an honesty tier. The scenario engine layers these instance verdicts into episodes and groups episodes by lever into lever patterns. Without an admitted sequence candidate it attributes each episode to its earliest actionable driver; sequence competition uses the observed-impact rule below. A single dinner that trips several classifiers becomes one attributed episode, with losing explanations retained as evidence rather than separate attributed counts.

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
- **WHEN** the public evaluation constructs its lever patterns
- **THEN** published contender impact equals its pre-ownership price
- **AND** k does not exceed n, sequence identity is counted once, and bounded owned episodes do not double-charge outcome time

#### Scenario: Uncontested legacy attribution remains stable
- **GIVEN** no admitted sequence candidate in an episode
- **WHEN** Scenario, tally and model-view consume the evaluation
- **THEN** they preserve the existing ownership and occurrence identity for that episode

### Requirement: Sequence findings are served coherently through existing finding interfaces

The two closed behavioral levers SHALL produce server-priced lever findings and
sequence case evidence through the existing findings and preparation interfaces.
They SHALL be habit members nested under Highs after meals, not new outcome
Patterns and not members of its rate_levers. Their own producer floors and habit
admission rules SHALL govern admission without pooling support. Each SHALL retain
its sequence denominator and Priority. Highs after meals SHALL retain its meals
denominator and the union of identities from its existing rate levers.
Scenario, exposure, model-view, outcome counts and case files SHALL consume the same
evaluation rather than recompute ownership. Full-source-window prices SHALL remain
stable under a drawn clock window; scoped membership SHALL read the served outcome
witness. Finding, report and chart SHALL belong to one analysis generation and
retain the existing stale-generation retry behavior. Both levers SHALL remain
outside Plan, tuning schedules and safety-path judgment.

Each new occurrence SHALL serve `outcome_minute` from its evaluated CGM witness.
The Python window-membership reader and its JS mirror SHALL prefer that field to
static outcome-kind lookup; the new closed-set marker `sequence` SHALL require an
explicit witness and SHALL NOT fall back to the trigger when it is missing.
Legacy occurrences SHALL retain their existing membership behavior. New lever
metadata SHALL use Meals display affinity with a custom `sequences` recurrence
population; this SHALL NOT charge sequence counts to a legacy Exposure clean-rate
account. Neither new lever SHALL enter the existing Verify behavior-trend roster.
Legacy levers SHALL retain their existing rollup mechanism using final winning counts.

#### Scenario: Analyzer output reaches a scoped finding
- **GIVEN** sufficient synthetic sequences evaluated through the public analyzer interface
- **WHEN** the corresponding outcome witness falls inside a clock window while its trigger is outside
- **THEN** the finding includes the winning occurrence in that window with the source-window Priority
- **AND** its sequence identity and counts agree across the served interfaces

#### Scenario: A new behavioral finding cannot stage
- **GIVEN** either new lever is supported and ranked first
- **WHEN** its finding, catalog metadata and Plan inputs are inspected
- **THEN** there is no pump-setting mapping, staged item, schedule move or safety assertion from it

#### Scenario: Opposite-direction witnesses share the served membership rule
- **GIVEN** supported synthetic sequence occurrences with both low and high outcome witnesses inside a drawn window and their triggers outside
- **WHEN** Python findings and its JS mirror decide membership
- **THEN** both directions belong to the witness window
- **AND** removing a required sequence witness withholds membership instead of using the trigger

#### Scenario: Sequence counts do not masquerade as meal clean-rate counts
- **GIVEN** a sequence owns several episodes while legacy levers retain other winning occurrences
- **WHEN** clean-rate accounts and the Verify behavior-trend roster are produced
- **THEN** sequence counts enter neither the legacy Exposure accounts nor a new trend tile
- **AND** legacy winners keep their existing rollup mechanism without converting the noun sequences to an Exposure

### Requirement: Habit associations preserve bounded episode ownership

The exposures producer SHALL associate a sequence habit member only with emitted
meal opportunities covered by its winning bounded episode. It SHALL NOT derive
targets from sequence membership, citations, nearby boluses or a chart mark.
Additive member_associations SHALL remain distinct from rate claims. Each episode
SHALL have one owner. A supported winner with no covered meal SHALL remain an
admissible habit finding without fabricating a Pattern occurrence or meal claim.
Whole-day claimed_by SHALL include served habit members and rate-lever subjects
without duplicates, preserving existing rate-only claims. Scoped queries SHALL
omit the whole-feed Pattern and SHALL NOT invent orphan claimed_by relations.
The existing nested painter, Pattern copy keys and highs/meals chips SHALL remain.

#### Scenario: A supported episode covers no meal opportunity
- **GIVEN** a supported sequence winner whose bounded episode covers no emitted meal opportunity
- **WHEN** findings and Pattern case evidence are prepared
- **THEN** the sequence cause remains nested under Highs after meals with its own sequence counts
- **AND** no Pattern meal occurrence, member association or rate claim is fabricated

#### Scenario: Covered meals are evidence without an added rate claim
- **GIVEN** a winning sequence episode covering emitted meal opportunities
- **WHEN** the parent case file is prepared
- **THEN** member_associations identify only those covered opportunities
- **AND** the parent rate and claiming-member tags retain only their existing rate-lever meaning
