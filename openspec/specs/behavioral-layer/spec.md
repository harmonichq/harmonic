# Behavioral layer

## Purpose

The behavioral layer detects *actionable patterns* — habits and mistakes the user can change — distinct from *settings parameters* (basal, ISF, I:C, target). A behavioral pattern is a decision point in how someone uses their pump (when they bolus, how they treat lows, how they respond to highs), while settings parameters are configuration values the pump enforces automatically. The layer segments the timeline into episodes, attributes each to a single cause from a closed taxonomy, and surfaces ranked patterns so a user sees their most-impactful behavioral opportunities.

## Requirements

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

### Requirement: A pattern asserts only when enough evidence backs it.

The system SHALL satisfy the following:

Before a detector can assert a behavioral lever in an episode, three gates must open: the behavior must produce a matched verdict (not just a near-miss), the verdict must rest on sufficiently firm evidence (observed, not inferred from absence), and the downstream lever must clear its own eligibility bar. Eight silence reasons name why an instance did *not* assert — insufficient data, no trigger, under threshold, an upstream cause already explains it, a high baseline, an earlier bolus owns the rise, an announced meal owns a low's rebound, or the outcome never arrived in time. The silence reason is machine-readable; the human detail still carries the numbers. When an episode finds no assertable lever, it generates no pattern contribution and produces a silence reason instead.

#### Scenario: A pattern asserts only when enough evidence backs it.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Behavioral and settings levers rank on a single 0–100 Priority axis.

The system SHALL satisfy the following:

Both flavors compose Priority identically as `100 · √(impact · recurrence)`, a geometric mean where one weak factor drags the score low. Behavioral impact is the hypo-weighted effect size of the bad outcome (0–1 range); settings impact is insulin-unit currency — basal/ISF/I:C changes priced through a shared soft-saturation curve so a 0.3 U/day move reads the same impact whether it moves basal or ISF. Recurrence is a Wilson lower bound that fuses "how often" and "how sure" into one unified confidence-adjusted rate, measured over each lever's own exposure denominator (meals for meal levers, lows for low levers, correction pairs for stacking, etc.). Because behavioral and settings impact live on the same axis without a hard ceiling, a strong recurring habit can outrank a thin setting change.

#### Scenario: Behavioral and settings levers rank on a single 0–100 Priority axis.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Exposure and Cause are different lists; the layer names both.

The system SHALL satisfy the following:

Exposure is the outcome family an episode lands in — "all meals," "all lows," "all correction pairs," "all highs" — paired to each lever by its nature (a meal lever like carb undercount exposes against meals; a low lever like over-treated low exposes against lows). A Pattern groups episodes by their attributed Lever and scores against that lever's recurrence population, which the evidence-population policy below owns and which is the same as its Exposure family for every lever but one. Cause is an internal construct for attribution — the early driver logic that picks the one lever each episode will carry — but a Cause is never surfaced as something a user changes. The recommendation always flows from the attributed Lever, never from the internal cause reasoning.

#### Scenario: Exposure and Cause are different lists; the layer names both.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: One policy owns each lever's complete evidence populations.

The system SHALL satisfy the following:

A single backend policy declares, per behavioral lever, the population its
recurrence is denominated on and the noun that names it, the population its event
comparison baselines against and that population's served name, the
occurrence-to-comparison anchor and comparison window, whether the comparison
crosses populations, and the lever's unique-occurrence identity. Recurrence and
comparison are distinct concepts and the policy keeps them distinct; for ordinary
levers both derive from the same Exposure opportunities.

A lever's recurrence population is therefore a policy-owned concept rather than
its Exposure family. "Meal bolus fell short" recurs over eligible completed
carb-bolus meals — completion Completed, insulin above zero, carbs at or above the
anchor minimum — because its claim is about a meal dose, not about the high that
followed. Only such a meal can implicate it, so its attributed count is a subset
of its denominator by construction rather than by a clamp, and several highs
implicating one meal count once at the pattern gate, in the occurrence list, in
the attributed count and in ranking, represented by their worst episode.

"Missed / unannounced meal" is the only lever whose comparison crosses
populations: it recurs over highs and compares against completed carb-bolus
meals. Every other lever compares within its own population, and the three
ordinary meal levers name theirs "other meal opportunities" because that
population admits any carb-tagged bolus over the carb minimum, cancelled and
insulin-free rows included.

The served case file publishes the recurrence population's noun and the
cross-population flag, so no consumer infers either from a lever's name.

#### Scenario: One policy owns each lever's complete evidence populations.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: One canonical opportunity population owns every Finding case file.

The system SHALL satisfy the following:

The layer builds identity-bearing opportunities for the four declared Exposure
families: meals, sub-70 runs, adjacent correction pairs, and >250 runs. Exposure
counts and Finding case files consume those same opportunity objects. Every
attributed Lever instance must associate with one opportunity in the population
its policy declares; a caused-low split associates its rebound High back to the source Low.
If an attribution cannot be associated without inventing membership, that Finding
is withheld rather than published as inspectable.

A case-file population owns its denominator, attributed count, verdict counts,
complete Occurrence roster, clock membership, selection, and event projection.
Clock membership uses the Finding-relative outcome time, including the linked
rebound time for a caused Low. Event alignment publishes matched, nearly-matched,
and named comparison populations from the same prepared case file; it never
substitutes the broader Explore feed. Correction-cluster and High projections use
this same contract without changing classifier thresholds or support floors.

For an eligible Low, one projection-facing rebound judgment owns the guarded
scan, tiered firing bar, and 20 mg/dL near floor used by both Findings and Event
comparison. A fired rebound is matched; a rebound inside the near band is under
threshold; an observed rebound below the near floor is no trigger; and an absent
guarded peak is insufficient data. Findings maps that judgment row-relatively to
fired, near miss, clean or no data, with a competing attributed Lever producing
outranked. The case file preserves its five Finding verdict counts independently
from its three-population event comparison. The comparison names matched,
nearly-matched, comparison, and not-comparable counts without recasting the
Finding verdict account.

A substantial announced meal owns an eligible Low's rebound when its carb-tagged
bolus falls inclusively between ten minutes before the nadir and the nadir. The
shared judgment then returns the calm `owned_by_announced_meal` non-match before
the rebound can split into a separate Over-treated-low moment. The canonical
sub-70 Low remains in the case population as a clean comparison, including when a
prompt confirms low treatment. A meal before that interval does not suppress the
judgment, while a meal after the nadir retains its existing role as the guarded
scan boundary. This ownership rule does not suppress meal-owned levers or
independently evidenced correction levers.

#### Scenario: One canonical opportunity population owns every Finding case file.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: The layer refuses to assert on insufficient evidence and surfaces why.

The system SHALL satisfy the following:

No judgment fires without a verdict grounded in data — either observed (a hard fact from the feed, like a bolus of 10 U) or inferred (shape-derived and hedged, like "likely rescue carbs, but we didn't see them"). A classifier never returns "this might maybe be late" — it returns matched=false with the specific silence reason (insufficient data / no trigger / under threshold / upstream cause / prior high baseline / owned by prior bolus / owned by announced meal / horizon expired). When enough clean windows exist to measure a pattern's rate via Wilson bounds, the bounds are wide enough to name the uncertainty honestly; when data is too thin, the pattern collapses behind an expander so no single rate gets fabricated from noise.

#### Scenario: The layer refuses to assert on insufficient evidence and surfaces why.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Event alignment windows are per exposure family

Every Finding case file's event projection SHALL align on its policy's
per-family window, in minutes relative to the anchor: meals (−60, +300), lows
(−60, +120), correction clusters (−120, +180), highs (−150, +300). The served
`window_min` SHALL equal that window and every served cohort trace SHALL cover
no minute outside it. 

#### Scenario: A low's comparison opens one hour before the nadir

- **WHEN** a case file is prepared for a lows-family Lever with event alignment
- **THEN** its `window_min` is [-60, 120]
- **AND** no cohort trace carries a minute outside that window

#### Scenario: A correction cluster's comparison opens two hours before the pair

- **WHEN** a case file is prepared for the correction-stacking Lever with event alignment
- **THEN** its `window_min` is [-120, 180]

#### Scenario: Meals and highs are unchanged

- **WHEN** a case file is prepared for a meals-family or highs-family Lever
- **THEN** its `window_min` is [-60, 300] or [-150, 300] respectively

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
