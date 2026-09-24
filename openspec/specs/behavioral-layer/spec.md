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
from its three-population event comparison. The comparison names the matched,
nearly-matched and comparison counts and the count of roster Occurrences outside
the comparison, without recasting the Finding verdict account. Outside the
comparison counts the roster Occurrences in none of the three cohorts and is always
served, zero included. When the comparison is drawn from the case file's own
population, the three cohorts partition the roster: matched, nearly matched and
comparison add up to the denominator and nothing is outside the comparison. Only a
cross-population comparison can leave roster Occurrences outside it; there matched,
nearly matched and outside the comparison add up to the denominator. The case file
serves no count that repeats a cohort under another name.

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

#### Scenario: A same-population comparison leaves nothing outside it

- **GIVEN** a Pattern case file over six synthetic meals: three claimed, one near
  miss, one with no data and one calm
- **WHEN** its event projection is served
- **THEN** matched, nearly matched and comparison add up to six
- **AND** the served count outside the comparison is zero, although the no-data
  meal is one of the comparison cohort's members

#### Scenario: A cross-population comparison counts the Highs in no cohort

- **GIVEN** a Missed / unannounced meal case file over six synthetic Highs, two
  attributed and one near miss, compared against announced meals
- **WHEN** its event projection is served
- **THEN** the served count outside the comparison is three
- **AND** matched, nearly matched and outside the comparison add up to six, while
  the announced-meal comparison count stands apart from that total

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

### Requirement: An over-treated low's fired rebound owns every High it reaches

When an eligible Low's over-treated-low judgment fires, that Low SHALL own every
real CGM High run that begins after its nadir and at or before its guarded rebound
terminal, whether the High shares the Low's Episode or falls in a later one. A #155
synthesized rebound High-moment SHALL own through its own span, from the crash
nadir to the guarded terminal. A Low whose judgment does not fire owns nothing:
under its bar, owned by an announced meal, or refuted by a `no` answer. A High run
that begins after the terminal SHALL be judged on its own. Ownership SHALL be read
from the shared evaluation's own fired judgment, and no consumer SHALL re-judge it.
Ownership SHALL be span membership: the evaluation SHALL record every owned High,
whatever its own classifiers return.

An owned High SHALL attribute neither Missed / unannounced meal nor Meal bolus fell
short, and SHALL contribute no candidate or impact price to either. Only an
outcome of either classifier that would otherwise match or be priced SHALL become a
non-match with silence reason `upstream_cause`, whose detail names the owning
Low's nadir value and time. Every non-matching exit SHALL keep its own reason and
detail. These include too little data (`insufficient_data`), a flat or slow rise,
a digestion tail or no counted meal bolus (`no_trigger`), no correction following
(`horizon_expired`), and the context gate's own verdict. Both classifiers SHALL judge the context gate under the scenario
configuration they were given.

The owning Episode's scored span SHALL reach the later of its guarded terminal and
the end of every High run it owns. It SHALL never reach past the guarded scan's
meal-bolus stop, the next substantial carb-tagged meal bolus after the nadir. It
SHALL still stop at the next Episode that bears a Lever. An owned High SHALL NOT count toward the highs "no cause detected"
total, even when its own Episode draws no Lever. It SHALL remain a non-driver
Occurrence with no attributed Lever. No staging predicate, cap, support floor,
segmentation rule, gate lookback, rebound horizon or rebound bar SHALL change.

#### Scenario: A slow rebound that splits off is not a missed meal

- **GIVEN** a synthetic window in which, on several days, a sub-70 Low rebounds
  with no bolus into a High that crosses 250 mg/dL more than 90 minutes after the
  Low run ends and before the guarded terminal
- **WHEN** the shared evaluation runs
- **THEN** each rebound is attributed Over-treated low exactly once
- **AND** no Episode attributes Missed / unannounced meal or Meal bolus fell short
  to the High, whose own Episode is silent with `upstream_cause`

#### Scenario: A slow approach to the High is still owned

- **GIVEN** a Low whose rebound climbs fast, then creeps across 250 mg/dL too slowly
  to count as a rise, more than 90 minutes after the Low run ends
- **WHEN** the shared evaluation runs and the exposures producer tallies highs
- **THEN** the High's verdicts keep `no_trigger`
- **AND** the High is recorded as owned and is not counted as uncaused

#### Scenario: A near-low rebound inside its own Episode is not a missed-meal candidate

- **GIVEN** a 72 mg/dL nadir that rebounds into a High inside the same Episode
- **WHEN** the shared evaluation runs
- **THEN** the Episode keeps Over-treated low
- **AND** no missed-meal match, candidate or impact price remains for that High

#### Scenario: A High beyond the rebound is still judged on its own

- **GIVEN** a Low whose rebound settles in range before a later unbolused rise, and
  a continuous climb that first crosses 250 mg/dL after the 180-minute horizon
- **WHEN** the shared evaluation runs
- **THEN** each of those Highs still attributes Missed / unannounced meal

#### Scenario: The rebound's out-of-range time counts on the Low's Episode

- **GIVEN** a split-off owned High in an Episode that draws no Lever
- **WHEN** the Over-treated-low Episode is scored
- **THEN** its span reaches the later of the guarded terminal and the owned High
  run's end
- **AND** a later Episode that bears a Lever still bounds it
- **AND** a substantial meal bolused during the owned High ends the span no later
  than that bolus

#### Scenario: An owned High is explained, not uncaused

- **GIVEN** a window whose only High is owned by an over-treated Low and sits in an
  Episode that draws no Lever
- **WHEN** the exposures producer tallies the highs family
- **THEN** that High is not counted as uncaused and carries no attributed Lever

### Requirement: Each event cohort names the verdict-band state it holds

Every event cohort of a case file SHALL serve the verdict-band state it holds
exactly, or none. A matched cohort drawn from the Occurrences whose verdict is
`fired` SHALL name `fired`; a nearly-matched cohort SHALL name `near_miss`; a
comparison cohort, and a matched cohort limited to the attributed Occurrences of a
cross-population comparison, SHALL name none. When a cohort names a state, every
member's verdict SHALL be that state and the cohort's count SHALL equal the verdict
count for that state. The cohort names SHALL stay as served today.

#### Scenario: Matched is Meets criteria on a same-population case file

- **GIVEN** a synthetic Highs after meals case file with three Meets criteria and
  one Borderline meal
- **WHEN** its event projection is served
- **THEN** the Matched cohort names `fired` and holds three, the Nearly matched
  cohort names `near_miss` and holds one, and the comparison cohort names none

#### Scenario: Missed meal's Matched cohort names no band state

- **GIVEN** a synthetic Missed / unannounced meal case file
- **WHEN** its event projection is served
- **THEN** its attributed Matched cohort names none and its Nearly matched cohort
  names `near_miss`

### Requirement: A folded cause serves its count on its Pattern's population

The Pattern producer SHALL own one rule that credits each of a Pattern's claimed
Occurrences to exactly one rate lever: the first, in the Pattern's rate-lever order,
whose claims include it. The Pattern's count, a Pattern case file's per-meal
member, and a folded cause's credited count SHALL all come from that one rule over
the same window population. The findings projection SHALL serve fold sentences on
every row it folds under a Pattern. Under a Pattern that serves a count sentence, a
rate-lever cause's fold sentences SHALL lead with its credited count on the
Pattern's denominator and noun, marked as the Pattern's scope, followed by its
count sentences on any other family, marked as outside the Pattern's count, in
served order. A cause that is not one of the Pattern's rate levers SHALL serve all
its count sentences marked as outside the Pattern's count. When the Pattern serves
no count sentence, because it has no admission route or its counts are under
review, every fold sentence of every cause folded under it SHALL be marked outside
the Pattern's count and no credited count SHALL be served. Under a Pattern that
serves a count sentence, the credited counts of its folded causes SHALL add up to
the Pattern's count. A Pattern that shows no shares is exempt from that add-up:
Overnight lows with no insulin on board takes its count from harm-band nights, has
no rate levers and folds no cause. The cause's count sentences and appearances, the
Pattern's count and denominator, and the Pattern roster the projection publishes
SHALL be unchanged.

#### Scenario: A cause counted in another family still counts on the Pattern

- **GIVEN** the synthetic case where Lows after correcting highs counts 2 of 2 lows
  and its one cause, Correction stacking, appears only in correction clusters
- **WHEN** the findings projection is read for the whole day
- **THEN** Correction stacking's fold sentences lead with 2 of 2 lows in the
  Pattern's scope and follow with its correction-cluster count outside the
  Pattern's count
- **AND** its count sentences, the Pattern's count and the published roster are
  unchanged

#### Scenario: Two causes add up to the Pattern

- **GIVEN** the synthetic case where Highs after meals counts 3 of 6 meals with
  Carb undercount and Late bolus folded beneath it
- **WHEN** the findings projection is read for the whole day
- **THEN** the two causes' credited counts are on 6 meals and add up to 3

#### Scenario: A meal two causes claim is credited once

- **GIVEN** a synthetic Pattern population where one meal is claimed by two rate
  levers
- **WHEN** the Pattern's count, its case file and its folded causes are read
- **THEN** the meal is credited to the first of the two in the rate-lever order,
  the case file names that lever as its member, and the credited counts still add
  up to the Pattern's count

#### Scenario: A Pattern that serves no count credits no share

- **GIVEN** the synthetic projection fixture's whole-day window, where Lows after
  correcting highs has no admission route (1 of 5 lows, no count sentence) and folds
  Correction on active insulin and Correction stacking
- **WHEN** the findings projection is read for that window
- **THEN** every fold sentence of both causes is marked outside the Pattern's count
- **AND** none is in the Pattern's scope

#### Scenario: A Sequence habit is outside the Pattern's count

- **GIVEN** a synthetic Highs after meals Pattern with a Sequence habit folded
  beneath it
- **WHEN** the findings projection is read
- **THEN** every fold sentence of the Sequence habit is marked outside the
  Pattern's count

### Requirement: A Pattern case file's outranked meals stay outside its claimed count

A Pattern case file SHALL count as claimed exactly the Occurrences one of the
Pattern's rate levers claims, and SHALL give each of them the `fired` verdict. An
Occurrence that a member habit matched without such a claim, or whose episode
another lever drove, SHALL keep the `outranked` verdict and SHALL count among the
Occurrences not attributed to the Pattern: not attributed SHALL equal the
denominator minus claimed, which is the sum of the outranked, near-miss, no-data and
clean counts.

#### Scenario: Outranked meals are not attributed to the Pattern

- **GIVEN** a synthetic Highs after meals case file with one claimed meal, one
  meal where Late bolus matched although the meal did not drive its episode, and
  one meal Meal over-delivery drove
- **WHEN** the case file is served
- **THEN** claimed is one and equals the `fired` count
- **AND** both other meals read `outranked` and are counted in the denominator minus
  claimed

### Requirement: Case-file Occurrences serve the facts their anchor has

Every anchor object a Finding case file serves, in single-habit and Pattern case
files alike, SHALL carry its anchor bolus's delivered dose and carbs beside its
anchor glucose: a meal serves its meal bolus's dose and carbs, a correction
cluster serves its second correction's dose, and a low, a high and a detected
rise-onset anchor serve neither, as explicit nulls. A meal Occurrence SHALL also
serve one outcome reading taken from the Post-meal arc of its anchor bolus: the
Arc peak when the case file judges a high outcome, the Arc nadir when it judges a
low outcome, each with the reading's time and its minutes after the bolus. The arc
SHALL be computed by the existing Outcomes trend arc implementation over the
readings the analyzer judged, truncated at the next meal, and SHALL serve no
outcome when that arc half has no reading or its nadir window does not qualify. No
meal or correction-cluster Occurrence SHALL serve an anchor glucose, and no
episode-level reading SHALL stand in for the arc. The exposure feed SHALL serve
each exposure Occurrence's anchor bolus dose and carbs, copied from the analyzer's
anchor, so a Pattern roster carries them without matching a bolus by time.
Verdicts, verdict counts, cohorts, denominators and claims SHALL be unchanged, and
eating-sequence case files SHALL be unchanged.

#### Scenario: Meal rows carry the meal and its peak

- **GIVEN** a synthetic store with N completed carb boluses and CGM after each,
  run through the real analyzer, exposure builder and case-file preparation
- **WHEN** a meal-family case file that judges a high outcome is read, from a
  single habit and from a Highs after meals Pattern
- **THEN** every row serves its bolus's dose and carbs and a null anchor glucose
- **AND** a row whose arc has a reading serves the Arc peak with its time and
  minutes after the bolus, equal to the Outcomes trend arc for that meal
- **AND** the verdict counts and claims equal those served before the change

#### Scenario: A low-outcome meal case file reads the nadir

- **GIVEN** the same store
- **WHEN** the Meal over-delivery case file is read
- **THEN** each row whose arc nadir qualifies serves the Arc nadir, never the
  peak, and a row whose nadir window does not qualify serves no outcome

#### Scenario: Correction clusters serve their dose

- **GIVEN** a synthetic store with adjacent user corrections
- **WHEN** the Correction stacking case file is read
- **THEN** every row serves its second correction's dose, null carbs, a null
  anchor glucose and no outcome

#### Scenario: A rise-onset anchor carries explicit nulls

- **GIVEN** a Missed / unannounced meal case file with an attributed High
- **WHEN** its event projection and that Occurrence's selection are read
- **THEN** the row's comparison anchor and the selected detail's anchor serve
  null dose and null carbs

### Requirement: A selected case-file Occurrence serves why it was judged

A selected Occurrence's case-file detail SHALL serve a reason built from the claim
account and verdict states its roster row was built from, and SHALL never disagree
with the row's served verdict. The reason's cause SHALL be present exactly when
the row is claimed in the case file's claim account and SHALL name the claimant:
the case lever for a claimed single-habit row, the served member habit for a
claimed Pattern row. It SHALL carry the claimant's title and the attributed
narrative text the analyzer published for that claim, or an empty text when the
claimant did not drive the Occurrence's episode. The reason SHALL carry one habit
entry per habit the roster judged for the row with exactly the verdict the roster
assigned: a single-habit row's one entry carries the row's verdict; a Pattern
row's entries carry each habit's row-relative state, mapped from fired to
outranked on an unclaimed row as the roster maps it, with the claimant's entry
fired on a claimed row. Each entry SHALL carry the classifier's recorded sentence
at that anchor only when that recorded verdict reads as the entry's verdict (or
as fired for an entry an unclaimed Pattern row maps to outranked), and a null
sentence otherwise. A correction cluster SHALL be judged by its Correction
stacking verdict. The Missed / unannounced meal comparison's announced-meal detail
SHALL serve its bolus's dose and carbs, its Arc peak, and a reason with no cause
and no habit entries.

#### Scenario: A meal claimed by Meal bolus short inside a Pattern

- **GIVEN** analyzer output in which Meal bolus short claims a meal that belongs
  to a chartable Highs after meals Pattern roster
- **WHEN** that Occurrence is selected in the Pattern case file
- **THEN** its reason names the Meal bolus short cause, with the exposure text
  only when Meal bolus short drove that meal's episode and an empty text otherwise
- **AND** its habit entries carry the Pattern's per-habit states and no sentence
  that reads otherwise

#### Scenario: Every reason agrees with its row

- **GIVEN** single-habit and Pattern case files prepared from analyzer output
- **WHEN** every Occurrence of each is selected
- **THEN** a cause is present exactly on claimed rows and names the claimant
- **AND** a single-habit row's verdict equals its one entry's verdict, an
  unclaimed Pattern row's verdict is its highest-precedence entry or clean when it
  has none, and a claimed row is fired
- **AND** every served sentence's recorded verdict reads as its entry's verdict
