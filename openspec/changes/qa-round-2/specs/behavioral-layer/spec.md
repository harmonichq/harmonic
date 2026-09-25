## ADDED Requirements

### Requirement: A scoped window serves a Pattern when its outcomes land in it

For a named or drawn clock window, the scoped Pattern roster SHALL carry, and the
findings projection SHALL serve as a row, exactly the `remain_pattern` Patterns
whose outcomes land in that window. An Exposure-family Pattern lands there when
its outcome-anchored count in the window is above zero, whether or not it is
admitted. The harm-band Pattern, "Overnight lows with no insulin on board", lands
there when the window overlaps the Harm signal's 00:00–06:00 band and its band
count of source nights is above zero; it SHALL keep the k and n counted over the
whole band, and in a scoped window its count sentence SHALL name the band. Whether
a Pattern row carries a chart coordinate, and so a case file, SHALL remain the
chartability predicate's alone and SHALL NOT decide membership. The browser-gate
findings mirror SHALL serve the same rows from the server's frozen scoped roster.

#### Scenario: The Overnight window serves the overnight-lows Pattern

- **GIVEN** the manufactured case `basal-recurring-low-lower`
- **WHEN** the findings projection publishes the 00:00–06:00 window
- **THEN** `pattern:overnight_lows_no_iob` is served with the k, n, admission
  route and Priority of its whole-day row, `window_scope` "window" and no chart
- **AND** its count sentence reads "2 of 30 nights ran low between 00:00 and
  06:00"

#### Scenario: A window reaching part of the band serves the band counts

- **GIVEN** the same case
- **WHEN** the findings projection publishes 02:00–05:00
- **THEN** the overnight-lows Pattern is served with its whole-band k and n and
  the sentence naming the band

#### Scenario: A window clear of the band serves no overnight-lows Pattern

- **GIVEN** the same case
- **WHEN** the findings projection publishes 14:00–21:00
- **THEN** neither its rows nor its published roster carry the overnight-lows
  Pattern

#### Scenario: Setting-staged and unadmitted Patterns join a scoped window

- **GIVEN** the findings-fixture projection
- **WHEN** it publishes the explicit 00:00–24:00 scope
- **THEN** it serves every whole-day Pattern row whose n is above zero, Lows
  after meals and Lows after correcting highs among them
- **AND** every rate-lever cause row carries the same `claimed_by` as in the
  whole day, and every `claimed_by` names a served Pattern row

### Requirement: The findings queue serves one urgency ranking

The findings projection SHALL present the one urgency ranking without giving a
Priority two ranked positions. A Pattern served with admission route
`setting_staging` SHALL carry `anchored_by`, the id of the first served, priced,
asserting row of its setting's parameter in queue order (for the harm-band
Pattern, only such a row whose span starts inside the 00:00–06:00 band, the rule
that admits it), and SHALL
sort directly after that row, its claimed causes directly after it. With no such
row served it SHALL carry no anchor. Its Priority SHALL remain the Pattern producer's.

The served tiers SHALL be bands of the ranking: the leading run of priced,
top-level asserting rows is `next_in_line`, every later priced top-level row is
`worth_a_look`, an anchored Pattern takes its anchor's tier, a claimed cause keeps
`worth_a_look` when priced, and every unpriced row is `noted`. Among unpriced
ranked rows, asserting rows SHALL sort before findings.

Each row SHALL carry `rank_note`: "Ranked with its setting" on an anchored
Pattern; "Ranked on all N days", N the analysis window, on a priced top-level
Pattern or Cause row in a scoped window; null otherwise. No Priority, Priority
input, Pattern price, support floor, staging predicate or cap SHALL change.

#### Scenario: A Pattern admitted through its setting shares its setting's position

- **GIVEN** the findings-fixture projection's whole day
- **WHEN** the queue is published
- **THEN** Highs after meals and Lows after meals carry `anchored_by` "ic:720" and
  follow it, and the overnight-lows Pattern carries `anchored_by` "basal:30-90"
  and follows it, each with `rank_note` "Ranked with its setting"
- **AND** every top-level `next_in_line` row precedes every top-level
  `worth_a_look` row

#### Scenario: A scoped window says the rank is taken from all 30 days

- **GIVEN** the findings-fixture projection's 14:00–21:00 window
- **WHEN** the queue is published
- **THEN** `finding:over_treated_low` carries `rank_note` "Ranked on all 30 days"
- **AND** no setting row carries a `rank_note`

#### Scenario: A setting-admitted Pattern whose setting is outside the window ranks alone

- **GIVEN** the findings-fixture projection's 06:00–11:00 window, which serves
  no asserting carb-ratio row
- **WHEN** the queue is published
- **THEN** Highs after meals carries no anchor and `rank_note` "Ranked on all 30
  days"

#### Scenario: The overnight Pattern sits beneath the basal run that admitted it

- **GIVEN** the findings-fixture inputs with 00:30–01:30 quiet and a supported
  basal raise over 05:30–06:30, which starts inside the band and crosses 06:00
- **WHEN** the whole-day queue is published
- **THEN** the overnight-lows Pattern carries `anchored_by` "basal:330-390" and
  `rank_note` "Ranked with its setting"

#### Scenario: The overnight Pattern never anchors beneath a daytime basal row

- **GIVEN** the findings-fixture inputs with 05:30 quiet and a supported 06:30
  basal raise
- **WHEN** the findings projection publishes 05:00–08:00
- **THEN** the overnight-lows Pattern carries no anchor and `rank_note` "Ranked
  on all 30 days"

#### Scenario: An asserting row that cannot stage sorts before the unranked findings

- **GIVEN** the findings-fixture inputs with the direction-only
  correction-factor weaken and no Pattern roster, so two unpriced causes with one
  episode each are top-level rows
- **WHEN** the whole-day queue is published
- **THEN** the correction-factor row, unpriced, sorts before both causes

### Requirement: A meal is its first carb bolus plus its same-meal top-ups

Every meal counter SHALL read one meal-identity rule. A carb bolus at or over the
meal floor (`anchor_meal_min_carbs`) that is not already a member opens a meal, and
every later such bolus at most `carb_undercount_same_meal_grace_min` (30 minutes)
after that first bolus joins it; the grace is measured from the first bolus and
never chained, and a bolus exactly at the grace is a member. Carb-free boluses and
carb boluses under the floor are never members. A meal's anchor time and identity
SHALL be its first bolus's, so a one-bolus meal's identity does not move. Its
judged carbs SHALL be the sum over its members the pump completed (or over every
member when none completed), its dose the sum of every member's delivered insulin,
and its carb ratio the first member's stamp. The meal opportunities, the completed
carb-bolus population, the meal classifiers, Meal over-delivery's suspend
ownership, Meal bolus short's implicated meal, the Post-meal arc's meal set and
truncation, the Trial and watched-change meal cohorts, the follow-up comparison and
the time-of-day meal count SHALL all read it, and no other module SHALL
re-implement it. Eating windows, the workstation's pooled 12 g meal track and the
carb-ratio analyzer's meal and run ledgers SHALL be unchanged.

#### Scenario: Two halves of one meal are judged as one meal

- **GIVEN** a synthetic store of fourteen days, each with a 45 g / 4.5 U meal
  bolus, a 20 g / 2 U top-up ten minutes later and a rise to a peak of 210
- **WHEN** the real exposure, scenario and Pattern producers run
- **THEN** Highs after meals serves 0 of 14 and no meal occurrence lists Carb
  undercount, as it does for the same meal dosed once as 65 g / 6.5 U

#### Scenario: A cancelled leg and its re-issue count their carbs once

- **GIVEN** a cancelled 45 g carb leg that delivered part of its dose and a
  completed 45 g re-issue two minutes later
- **WHEN** they are grouped into meals
- **THEN** they form one meal with 45 g and the insulin both delivered

#### Scenario: Meal over-delivery's suspend belongs to the meal

- **GIVEN** a split meal followed by a Control-IQ suspend and a near-low
- **WHEN** the scenario producers run
- **THEN** Lows after meals holds one meal opportunity for it, and Meal
  over-delivery judges the suspend for that meal, never for its top-up

### Requirement: Late bolus claims a meal only when it ran above the range line

Late bolus SHALL match a meal only when, after its pre-bolus slope, context gate,
prior-carb-bolus and start-level checks would match, the meal's Arc peak is above
the 180 mg/dL range line. The Arc peak SHALL be the one peak definition the
Post-meal arc uses: the highest CGM reading in (first bolus, first bolus + 3 h],
cut at the next meal's first bolus, computed by the one shared implementation. A
peak at or under the line SHALL return the calm silence reason `stayed_in_range`
(tier Observed), which reads clean and never near miss; a peak window with no
reading SHALL return `insufficient_data`. Highs after meals' count, the Late bolus
Finding, its Cause row's count sentence and its advice SHALL all read that one
verdict, and no frontend gate SHALL re-derive it.

#### Scenario: Meals that stayed in range are not claimed

- **GIVEN** a synthetic 30-day store of fourteen meals that climb 2 mg/dL/min to
  160 at the bolus, read 165 once and fall, with no low, suspend or earlier carb
  bolus
- **WHEN** the real exposure and Pattern producers run
- **THEN** Highs after meals serves 0 of 14 and no meal occurrence lists Late bolus
- **AND** the same climb with a post-bolus peak of 240 still fires Late bolus on
  every meal and counts toward the Pattern

#### Scenario: A claimed row prints the peak its verdict judged

- **GIVEN** a synthetic store whose meals carry a top-up inside the same-meal grace
- **WHEN** a meal-family case file that judges a high outcome is read
- **THEN** every fired row serves an Arc peak above the range line, the same
  reading its verdict judged

## MODIFIED Requirements

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
its Exposure family. "Meal bolus fell short" recurs over completed meals — meals (a
first carb bolus plus its same-meal top-ups, ADR 470) with at least one member
whose completion is Completed, insulin above zero and carbs at or above the anchor
minimum — because its claim is about a meal dose, not about the high that
followed. Only such a meal can implicate it, so its attributed count is a subset
of its denominator by construction rather than by a clamp, and several highs
implicating one meal count once at the pattern gate, in the occurrence list, in
the attributed count and in ranking, represented by their worst episode.

"Missed / unannounced meal" is the only lever whose comparison crosses
populations: it recurs over highs and compares against completed carb-bolus
meals. Every other lever compares within its own population, and the three
ordinary meal levers name theirs "other meal opportunities" because that
population admits every meal, cancelled and insulin-free boluses included.

The served case file publishes the recurrence population's noun and the
cross-population flag, so no consumer infers either from a lever's name.

#### Scenario: One policy owns each lever's complete evidence populations.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: A split meal is one completed meal

- **GIVEN** a synthetic store with a 45 g completed meal bolus and a 20 g completed
  top-up ten minutes later
- **WHEN** Meal bolus fell short's recurrence population and the completed
  carb-bolus comparison population are built
- **THEN** each holds one meal for the pair, identified by the first bolus

### Requirement: One canonical opportunity population owns every Finding case file.

The system SHALL satisfy the following:

The layer builds identity-bearing opportunities for the four declared Exposure
families: meals, sub-70 runs, adjacent correction pairs, and >250 runs. A meal
opportunity is one meal: a first carb bolus at or over the meal floor plus every
later one within the 30-minute same-meal grace measured from it, never chained,
identified by its first bolus and carrying every member (ADR 470). Exposure
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

#### Scenario: A same-meal top-up is not a second meal

- **GIVEN** a synthetic store of fourteen days, each with a 45 g meal bolus and a
  20 g top-up ten minutes later, run through the real exposure and scenario
  producers
- **WHEN** the meals family and Highs after meals are served
- **THEN** the meals family holds fourteen occurrences, each at its first bolus
  with 65 g
- **AND** a top-up at exactly thirty minutes joins its meal, while one at
  thirty-five minutes stays a separate meal

### Requirement: Case-file Occurrences serve the facts their anchor has

Every anchor object a Finding case file serves, in single-habit and Pattern case
files alike, SHALL carry its anchor bolus's delivered dose and carbs beside its
anchor glucose: a meal serves its members' summed dose and carbs, a correction
cluster serves its second correction's dose, and a low, a high and a detected
rise-onset anchor serve neither, as explicit nulls. A meal Occurrence SHALL also
serve one outcome reading taken from the Post-meal arc of its first bolus: the
Arc peak when the case file judges a high outcome, the Arc nadir when it judges a
low outcome, each with the reading's time and its minutes after the bolus. The arc
SHALL be computed by the existing Outcomes trend arc implementation over the
readings the analyzer judged, truncated at the next meal's first bolus, so a
same-meal top-up never cuts it, and SHALL serve no
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

#### Scenario: A split meal's row reads its peak through the top-up

- **GIVEN** a synthetic store of fourteen days, each with a 45 g meal bolus, a 20 g
  top-up ten minutes later and a rise to 360
- **WHEN** the Highs after meals case file is read
- **THEN** it serves fourteen rows, each with 65 g and the Arc peak of 360 read
  past the top-up

### Requirement: The layer refuses to assert on insufficient evidence and surfaces why.

The system SHALL satisfy the following:

No judgment fires without a verdict grounded in data — either observed (a hard fact from the feed, like a bolus of 10 U) or inferred (shape-derived and hedged, like "likely rescue carbs, but we didn't see them"). A classifier never returns "this might maybe be late" — it returns matched=false with the specific silence reason (insufficient data / no trigger / under threshold / upstream cause / prior high baseline / owned by prior bolus / owned by announced meal / horizon expired / stayed in range). When enough clean windows exist to measure a pattern's rate via Wilson bounds, the bounds are wide enough to name the uncertainty honestly; when data is too thin, the pattern collapses behind an expander so no single rate gets fabricated from noise.

#### Scenario: The layer refuses to assert on insufficient evidence and surfaces why.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: The silence taxonomy is closed at nine

- **WHEN** the Guide catalog is served
- **THEN** it lists exactly the nine silence reasons, stayed in range among them,
  each with its label, tier and body
