## MODIFIED Requirements

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

## ADDED Requirements

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
the Pattern's count. The cause's count sentences and appearances, the Pattern's
count and denominator, and the Pattern roster the projection publishes SHALL be
unchanged.

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
