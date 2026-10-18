## ADDED Requirements

### Requirement: An inconsistent Finding case is withheld by name, not served and not fatal

When one Finding's case-file projection cannot satisfy its own consistency checks,
case-file preparation SHALL withhold that Finding by name with the code
`inconsistent_projection` and SHALL still serve every other Finding's case. The
withheld Finding SHALL leave the rendered rows and the case headers, and no count
from the rejected projection SHALL be served. Requesting the withheld Finding's case
SHALL still answer the inconsistency error (ADR 488).

#### Scenario: One disagreeing case leaves the rest of the store inspectable

- **GIVEN** a prepared store in which one Finding's case producers disagree, so its
  case-file projection fails its own consistency checks
- **WHEN** the Finding case files are prepared
- **THEN** the preparation names that Finding as withheld with `inconsistent_projection`
- **AND** every other rendered Finding is served as it would be without the disagreement

### Requirement: Pattern populations preserve bounded episode ownership

Each episode SHALL have one owner. Whole-day claimed_by SHALL include served habit members and rate-lever subjects
without duplicates, preserving existing rate-only claims. Scoped queries SHALL
construct and serve a scoped Pattern population without inventing orphan
claimed_by relations. The existing nested painter, Pattern copy keys and
highs/meals chips SHALL remain.

For a named or drawn clock window, Pattern rows, membership, claimed count,
denominator, verdict counts, selected occurrence, evidence roster and rate inputs
SHALL derive from one producer-owned outcome-window population. The frontend
SHALL NOT derive membership, denominator, readiness, rate, attribution or other
clinical policy from a whole-day result. This does not prohibit viewport/chart
presentation of an already served population.

Membership SHALL use the family producer's outcome rule while preserving the
occurrence identity and full bounded episode context. For an attributed
over-treated-low Low opportunity, scope membership SHALL use its same-episode
High landing; the Low remains its exposure identity. An unattributed Low remains
a denominator opportunity under its existing rule and is not excluded merely
because it has no rebound. The producer's existing missing/thin representation
SHALL remain intact; this change SHALL NOT invent a status enum.

#### Scenario: A selected outcome window owns Pattern membership

- **GIVEN** synthetic opportunities with antecedents and outcomes on opposite
  sides of named, drawn, or circular half-open clock boundaries
- **WHEN** scoped Findings and a Pattern case file are served
- **THEN** every Pattern count, denominator, roster and selected occurrence uses
  the producer-owned outcome-window population
- **AND** an included outcome retains its full contributing episode evidence

#### Scenario: A rebound landing scopes a Low identity without dropping another Low

- **GIVEN** an attributed over-treated-low with a Low at 15:00 and same-episode
  rebound High at 19:00, plus an unattributed Low at 20:00
- **WHEN** the Evening and Afternoon Pattern populations are served
- **THEN** the attributed Low identity belongs to Evening rather than Afternoon
- **AND** the unattributed Low remains a denominator opportunity under its
  existing outcome rule

### Requirement: A Pattern served as its one habit is counted and inspected as the Pattern

A Pattern that collapses to its one admitted habit has no row of its own. That
habit's row SHALL serve the Pattern it is served as: the Pattern's subject, its
count sentence, and each rate lever's credited count of it, all from the one
crediting rule over the Pattern's window population, and none when the Pattern
serves no count sentence. The habit's own count sentences SHALL be unchanged. A
case file requested under that Pattern's subject SHALL be the Pattern's case file,
whenever the chartability predicate holds for it, so its claimed count is the
Pattern's count.

#### Scenario: A rate lever the Pattern does not admit still counts on it

- **GIVEN** the QA case where Correction on active insulin drives two of six lows
  and is the one admitted member of Lows after correcting highs, while a stacked
  pair of corrections reaches a third low
- **WHEN** the findings projection and the Pattern's case file are read
- **THEN** the habit's row still counts 2 of 6 lows as its own, and serves the
  Pattern's 3 of 6 lows, credited 1 to Correction stacking and 2 to Correction on
  active insulin
- **AND** the case file under the Pattern's subject claims those 3 lows and names
  each one's crediting lever

### Requirement: A folded cause serves its count on its Pattern's own population

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
the Pattern's count. The cause's count sentences and appearances, the
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

### Requirement: A selected case-file Occurrence serves the reason it was judged

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
sentence otherwise. On a claimed row, the claimant's entry SHALL carry a null
sentence when its recorded sentence is the cause's text, so the reason serves that
sentence once, as the cause's text. A correction cluster SHALL be judged by its
Correction stacking verdict. The Missed / unannounced meal comparison's
announced-meal detail SHALL serve its bolus's dose and carbs, its Arc peak, and a
reason with no cause and no habit entries.

#### Scenario: Every reason agrees with its row

- **GIVEN** single-habit and Pattern case files prepared from analyzer output
- **WHEN** every Occurrence of each is selected
- **THEN** a cause is present exactly on claimed rows and names the claimant
- **AND** a single-habit row's verdict equals its one entry's verdict, an
  unclaimed Pattern row's verdict is its highest-precedence entry or clean when it
  has none, and a claimed row is fired
- **AND** every served sentence's recorded verdict reads as its entry's verdict

#### Scenario: A claimed row serves its sentence once

- **GIVEN** analyzer output in which a claimant's recorded sentence at the claimed
  anchor is also its attributed narrative, as for Carb undercount, Over-treated
  low, Correction on active insulin, Correction stacking and Missed / unannounced
  meal
- **WHEN** a claimed Occurrence is selected in a single-habit case file and in a
  Pattern case file
- **THEN** the cause carries that sentence as its text
- **AND** the claimant's habit entry carries a null sentence, and no habit entry's
  sentence equals the cause's text

### Requirement: A Carb-log prompt asks about eating only where no over-treated low owns the rise

The Carb-log prompt queue SHALL raise no "did you eat here?" prompt for a High
that the shared evaluation records as owned by an over-treated low's rebound,
whatever the missed-meal classifier returns for it. The queue SHALL read that
ownership from the shared evaluation walk over the queue's own window, under the
same scenario configuration and the same low-prompt answers the Scenario
evaluation reads, including their endpoint rule. It SHALL NOT judge a low, a
rebound or ownership itself. A High that no low owns SHALL be judged exactly as
before. Every sub-70 low SHALL keep its own "did you treat this low?" prompt. A
low refuted by a `no` answer owns nothing, so its rebound High SHALL be judged on
its own. No detector,
staging predicate, cap, support floor, segmentation rule, rebound horizon, bar or
meal stop, or context-gate default SHALL change.

#### Scenario: A slow rebound after a sub-70 low raises only the low's prompt

- **GIVEN** a synthetic day on which a sub-70 low rebounds, with no bolus, into a
  High whose 250 mg/dL crossing comes more than 90 minutes after the nadir
- **WHEN** the prompt queue derives its candidates
- **THEN** it raises one "did you treat this low?" prompt at the nadir
- **AND** it raises no "did you eat here?" prompt for the High

#### Scenario: A near-low's rebound raises no prompt

- **GIVEN** a 72 mg/dL nadir that rebounds into a High, within 90 minutes of the
  nadir or later
- **WHEN** the prompt queue derives its candidates
- **THEN** it raises no prompt for the near-low or for the High

#### Scenario: A refuted low's rebound High is asked about

- **GIVEN** the slow rebound above and a `no` answer to its low's prompt that was
  recorded by the queue's endpoint
- **WHEN** the prompt queue derives its candidates
- **THEN** it raises a "did you eat here?" prompt at the High's onset

#### Scenario: A rise beyond the rebound is still asked about

- **GIVEN** a sub-70 low whose rebound settles in range before a later unbolused
  rise crosses 250 mg/dL
- **WHEN** the prompt queue derives its candidates
- **THEN** it raises a "did you eat here?" prompt at that rise's onset

### Requirement: A scoped window serves a Pattern whose outcomes land in it

For a named or drawn clock window, the scoped Pattern roster SHALL carry, and the
findings projection SHALL serve as a row, exactly the `remain_pattern` Patterns
whose outcomes land in that window. Every Pattern counts over an Exposure family (ADR 499) and lands there when
its outcome-anchored count in the window is above zero, whether or not it is
admitted. Whether
a Pattern row carries a chart coordinate, and so a case file, SHALL remain the
chartability predicate's alone and SHALL NOT decide membership.

#### Scenario: Setting-staged and unadmitted Patterns join a scoped window

- **GIVEN** the findings-fixture projection
- **WHEN** it publishes the explicit 00:00–24:00 scope
- **THEN** it serves every whole-day Pattern row whose n is above zero, Lows
  after meals and Lows after correcting highs among them
- **AND** every rate-lever cause row carries the same `claimed_by` as in the
  whole day, and every `claimed_by` names a served Pattern row

### Requirement: The findings queue serves a single urgency ranking

The findings projection SHALL present the one urgency ranking without giving a
Priority two ranked positions. A Pattern served with admission route
`setting_staging` SHALL carry `anchored_by`, the id of the first served, priced,
asserting row of its setting's parameter in queue order, and SHALL
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
  follow it, each with `rank_note` "Ranked with its setting"
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

#### Scenario: An asserting row that cannot stage sorts before the unranked findings

- **GIVEN** the findings-fixture inputs with the direction-only
  correction-factor weaken and no Pattern roster, so two unpriced causes with one
  episode each are top-level rows
- **WHEN** the whole-day queue is published
- **THEN** the correction-factor row, unpriced, sorts before both causes

### Requirement: A Pattern case file serves its episodes and Typical aligned at one start

Every Pattern case file SHALL serve `traces`: the start its episodes are aligned
at, the minutes drawn, the Pattern's own episodes and Typical, its comparison
episodes, each as the anchors it draws and its 5-minute bins with their median
and 25–75 band. A bin SHALL be served only from three readings. The Pattern
SHALL also serve each episode's readings when it draws eight or fewer, and none
past that. An episode with no reading in the first ten minutes of its window
SHALL be left off its cohort. A meal Pattern SHALL start at the meal's bolus, over
−30 to 240 minutes, against its event comparison's meals; Highs after treating
lows SHALL start at the low's nadir, over 0 to 180 minutes, against every other
low; Lows after correcting highs SHALL start at the correction each low it counts
followed, over 0 to 240 minutes, against every other lone correction, a user
correction with no other within the stacking window either side (ADR 523).

#### Scenario: A correction Pattern is drawn from the doses its lows followed

- **GIVEN** the `pattern-correction-fold` QA case, where Correction on active
  insulin claims two lows from 20:00 corrections and Correction stacking two from
  14:40 stacking doses
- **WHEN** its Lows after correcting highs case file is read
- **THEN** its Pattern anchors are those four doses, and Typical's is the one
  other lone correction

#### Scenario: A low Pattern is compared with every other low

- **GIVEN** the same case, where one low is over-treated
- **WHEN** its Highs after treating lows case file is read
- **THEN** its Pattern anchor is that low's nadir and Typical's are the other six
  lows

#### Scenario: An episode that starts in a gap is left off

- **GIVEN** the same case with the first fifteen minutes after its Typical
  correction removed
- **WHEN** the case file is read
- **THEN** Typical draws no episode and the Pattern's four are unchanged

#### Scenario: Past eight episodes the Pattern is its median and band

- **GIVEN** a meal Pattern counting nine meals
- **WHEN** its case file is read
- **THEN** it serves no episodes and serves each bin's median over the nine

### Requirement: A low a correction habit claims names the dose it followed

The exposures feed SHALL serve, on each low a correction habit claims, the time
of the correction that habit names for it, keyed by the habit: the correction a
Correction on active insulin verdict judged, or the stacking dose of the
Correction stacking episode that reached it. It SHALL read the verdict the
attribution retained and run no classifier again (ADR 523).

#### Scenario: Each claimed low names its correction

- **GIVEN** the `pattern-correction-fold` QA case
- **WHEN** the exposures feed is built
- **THEN** the 22:00 low Correction on active insulin claims names its 20:00
  correction, the 16:05 low Correction stacking reached names its 14:40 stacking
  dose, and an unclaimed low names none

### Requirement: A Pattern case file judges only the habit members in its own rate family

A Pattern case file SHALL judge each roster row, and each selected Occurrence's
reason, by exactly the Pattern's habit members whose lever's rate family is the
Pattern's own rate family, where a lever's rate family is its evidence-population
policy's closed recurrence account. A member outside that family — Correction
stacking, which is counted over correction clusters, under Lows after correcting
highs — SHALL contribute no state to a row's verdict and no habit entry to a
reason, while it MAY still claim a row as one of the Pattern's rate levers and be
named as that row's cause. The case producer's own test proves it (ADR 531).

#### Scenario: An out-of-family member is judged by no row or reason

- **GIVEN** the findings-fixture inputs over the workstation exposure feed, with
  scenario Patterns for Correction on active insulin and Correction stacking, whose
  roster then carries both under Lows after correcting highs
- **WHEN** the case producer serves that Pattern's clock case, whole and selected
  at each Occurrence
- **THEN** no row's member is Correction stacking
- **AND** every selected reason carries a habit entry for Correction on active
  insulin only

### Requirement: Manufactured workstation rows carry only shapes their producer can serve

Every exposure Occurrence the Diagnose workstation fixture generator manufactures
SHALL carry only what the real exposure feed can serve for its family: the anchor
kind and label the episode view serves for that family (low · Low, meal · Meal
bolus, high · High, correction · Correction); exactly the classifier verdicts the
attribution step judges at that anchor kind (a low: Over-treated low and Correction
on active insulin; a meal: Carb undercount, Late bolus and Meal over-delivery; a
high: Missed / unannounced meal; a correction: Correction
stacking, and only as its episode's stacking dose or last correction); each silence
reason from the closed silence-reason set; a claim only by a lever the attribution
step can drive from that anchor kind, so a correction row is claimed by Correction
stacking and never by Correction on active insulin, which only a low drives; on a
claimed row, its claiming lever's verdict matched, with that verdict's sentence as
the row's cause text, and every other judged classifier unmatched; on an unclaimed
row, every judged classifier unmatched and no cause text; and on a High, an anchor
glucose at or above the high-anchor threshold. A manufactured case-file member its
lever claims SHALL carry its recorded sentence as its cause text, as the producer's
attribution does.

#### Scenario: Every manufactured row is a servable shape

- **GIVEN** the committed workstation payload
- **WHEN** each of its exposure Occurrences is read
- **THEN** its kind, label and judged classifier set are its family's
- **AND** no verdict names a classifier that is not a Lever or a silence reason
  outside the closed set
- **AND** a claimed row's claiming lever is one its anchor kind can drive, and that
  lever's verdict reads matched with its detail equal to the row's text
- **AND** a High's anchor glucose reaches the high-anchor threshold

## MODIFIED Requirements

### Requirement: The findings projection serves each count-bearing row's count sentences

The findings projection SHALL serve count sentences in the form
`n of d noun outcome`, each with its count, denominator, noun and outcome words
served as their own values alongside the whole sentence. A Pattern row that
carries a count and a denominator SHALL serve exactly one, its outcome words
keyed by the Pattern's own served key. A Cause row SHALL serve one per family
appearance it already serves, in the served appearance order and never merged
into a total, each outcome keyed by the Cause's own lever together with that
appearance's family. The outcome words SHALL come from one closed table owned by
the projection. Two Patterns or two Causes that share a family SHALL be able to
serve different outcomes. A Pattern key, or a lever-and-family pair the
projection can emit, that has no entry SHALL fail the projection's tests rather
than serve a sentence without an outcome. A row whose counts are under review,
or that carries no denominator, SHALL serve no count sentence and SHALL keep its
existing served status words. Each sentence SHALL use the same count, denominator
and noun the row already serves, window-local where the row's counts are. No
staging, tier, rank, verdict or priority value, and no served `headline`, SHALL
change.

#### Scenario: A cause row serves its outcome per appearance

- **GIVEN** a synthetic store whose window holds a Cause row appearing in two
  families
- **WHEN** the findings projection is read for that window
- **THEN** the row serves two count sentences in appearance order, each with the
  count, denominator and noun of its own appearance, followed by that lever's
  outcome words for that family
- **AND** the row's tier, rank, priority, register and headline are unchanged

#### Scenario: Opposite outcomes in one family stay apart

- **GIVEN** the projection's closed sets of Pattern keys and of lever-and-family
  pairs
- **WHEN** the outcome table is compared with those sets
- **THEN** every member has exactly one entry, and the two Patterns counted in
  meals serve different outcome words

### Requirement: Patterns are detected by instance classifiers that judge one behavior at a time.

The system SHALL satisfy the following:

Each behavioral classifier (late bolus, missed meal, carb undercount, etc.) is a pure function that inspects *one concrete occurrence* — "is this meal bolus late?" — and returns a judgment, a one-line reason, and an honesty tier. The scenario engine layers these instance verdicts into episodes and groups episodes by lever into lever patterns. It attributes each episode to its earliest actionable driver (ADR 499). A single dinner that trips several classifiers becomes one attributed episode, with losing explanations retained as evidence rather than separate attributed counts.

#### Scenario: Patterns are detected by instance classifiers that judge one behavior at a time.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Exposure and Cause are different lists; the layer names both.

The system SHALL satisfy the following:

Exposure is the outcome family an episode lands in — "all meals," "all lows," "all correction pairs," "all highs" — paired to each lever by its nature (a meal lever like carb undercount exposes against meals; a low lever like over-treated low exposes against lows). A Pattern groups episodes by their attributed Lever and scores against that lever's recurrence population, which the evidence-population policy below owns and which is its Exposure family for every lever (ADR 499). Cause is an internal construct for attribution — the early driver logic that picks the one lever each episode will carry — but a Cause is never surfaced as something a user changes. The recommendation always flows from the attributed Lever, never from the internal cause reasoning.

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

Every lever recurs over its own Exposure family, named by that family's noun
(ADR 499).

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
- **WHEN** the meals Exposure family and the completed carb-bolus comparison
  population are built
- **THEN** each holds one meal for the pair, identified by the first bolus

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

An owned High SHALL NOT attribute Missed / unannounced meal (ADR 499). Only an
outcome of that classifier that would otherwise match SHALL become a
non-match with silence reason `upstream_cause`, whose detail names the owning
Low's nadir value and time. Every non-matching exit SHALL keep its own reason and
detail. These include too little data (`insufficient_data`), a flat or slow rise,
a digestion tail or no counted meal bolus (`no_trigger`), no correction following
(`horizon_expired`), and the context gate's own verdict. The classifier SHALL judge the context gate under the scenario
configuration it was given.

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
- **AND** no Episode attributes Missed / unannounced meal to the High, whose own Episode is silent with `upstream_cause`

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
- **AND** no missed-meal match remains for that High

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
outcome when that arc half has no reading or its nadir window does not qualify. A
low Occurrence SHALL serve one outcome reading taken from its own drawn trace, from
the anchor to the comparison window's far edge: the highest reading when the case
file judges a high outcome (an over-treated low's rebound), the lowest when it
judges a low outcome, each with the reading's time and its minutes after the anchor,
and no outcome when that span has no reading. No
meal or correction-cluster Occurrence SHALL serve an anchor glucose, and no
episode-level reading SHALL stand in for the arc. The exposure feed SHALL serve
each exposure Occurrence's anchor bolus dose and carbs, copied from the analyzer's
anchor, so a Pattern roster carries them without matching a bolus by time.
Verdicts, verdict counts, cohorts, denominators and claims SHALL be unchanged.

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

#### Scenario: A low reads its rebound peak or its nadir

- **GIVEN** the QA case where a low at 13:55 is over-treated and rebounds to 260
  forty minutes later
- **WHEN** the Highs after treating lows and Lows after correcting highs case files
  are read
- **THEN** that low serves a peak of 260 forty minutes after it in the first, and
  every low serves its own reading as its nadir in the second

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
ownership, the Post-meal arc's meal set and
truncation, the Trial and watched-change meal cohorts, the follow-up comparison and
the time-of-day meal count SHALL all read it, and no other module SHALL
re-implement it. The workstation's pooled 12 g meal track and the
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

## REMOVED Requirements

### Requirement: Sequence competition prices observed impact before ownership

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The High-carb sequence and Repeat eating Levers are gone, so no candidate competes for an Episode and no candidate impact is priced.

**Migration:** Every Episode is attributed to its earliest actionable driver. Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: Sequence findings are served coherently through existing finding interfaces

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). Neither sequence Lever is produced, served or nested under Highs after meals.

**Migration:** None for findings; the `sequence` outcome kind no longer exists. Issue #501 tracks the replacement report card.

### Requirement: Habit associations preserve bounded episode ownership

**Reason:** ADR 499 cuts behavior that some of this requirement's scenarios describe ("Drop these from the engine."). Its surviving behavior is unchanged and is restated without those scenarios as "Pattern populations preserve bounded episode ownership": a MODIFIED block cannot drop a scenario, so the requirement takes a new header.

**Migration:** Read "Pattern populations preserve bounded episode ownership", ADDED in this change.

### Requirement: A folded cause serves its count on its Pattern's population

**Reason:** ADR 499 cuts behavior that some of this requirement's scenarios describe ("Drop these from the engine."). Its surviving behavior is unchanged and is restated without those scenarios as "A folded cause serves its count on its Pattern's own population": a MODIFIED block cannot drop a scenario, so the requirement takes a new header.

**Migration:** Read "A folded cause serves its count on its Pattern's own population", ADDED in this change.

### Requirement: A selected case-file Occurrence serves why it was judged

**Reason:** ADR 499 cuts behavior that some of this requirement's scenarios describe ("Drop these from the engine."). Its surviving behavior is unchanged and is restated without those scenarios as "A selected case-file Occurrence serves the reason it was judged": a MODIFIED block cannot drop a scenario, so the requirement takes a new header.

**Migration:** Read "A selected case-file Occurrence serves the reason it was judged", ADDED in this change.

### Requirement: A Carb-log prompt asks about eating only at a rise no over-treated low owns

**Reason:** ADR 499 cuts behavior that some of this requirement's scenarios describe ("Drop these from the engine."). Its surviving behavior is unchanged and is restated without those scenarios as "A Carb-log prompt asks about eating only where no over-treated low owns the rise": a MODIFIED block cannot drop a scenario, so the requirement takes a new header.

**Migration:** Read "A Carb-log prompt asks about eating only where no over-treated low owns the rise", ADDED in this change.

### Requirement: A scoped window serves a Pattern when its outcomes land in it

**Reason:** ADR 499 cuts behavior that some of this requirement's scenarios describe ("Drop these from the engine."). Its surviving behavior is unchanged and is restated without those scenarios as "A scoped window serves a Pattern whose outcomes land in it": a MODIFIED block cannot drop a scenario, so the requirement takes a new header.

**Migration:** Read "A scoped window serves a Pattern whose outcomes land in it", ADDED in this change.

### Requirement: The findings queue serves one urgency ranking

**Reason:** ADR 499 cuts behavior that some of this requirement's scenarios describe ("Drop these from the engine."). Its surviving behavior is unchanged and is restated without those scenarios as "The findings queue serves a single urgency ranking": a MODIFIED block cannot drop a scenario, so the requirement takes a new header.

**Migration:** Read "The findings queue serves a single urgency ranking", ADDED in this change.

### Requirement: The browser-gate findings mirror serves the server's scoped Pattern list or fails

**Reason:** The desk's browser gates and the fixture-only JS findings mirror they read retired with the swap to the five-tab app (#495, ADR 495).

**Migration:** The desk is preserved as release v0.1.0. The five-tab app is specified in the surfaces capability.

### Requirement: The browser-gate test desk projects the server's own inputs

**Reason:** The desk suite this projected for retired with the swap to the five-tab app (#495, ADR 495).

**Migration:** The desk is preserved as release v0.1.0. The five-tab app is specified in the surfaces capability.

### Requirement: A Pattern case file judges only the habit members in its rate family

**Reason:** Its text and both scenarios hold the rule through the fixture-only Pattern case-file mirror and the event-comparison capture's frozen family table; the mirror left with the desk (ADR 495) and the capture and the frozen cases it read are removed (#531, ADR 531). The rule is restated without them as "A Pattern case file judges only the habit members in its own rate family", proved by the case producer's own test.

**Migration:** Read "A Pattern case file judges only the habit members in its own rate family", ADDED in this change.

### Requirement: Manufactured browser-gate rows carry only shapes their producer can serve

**Reason:** The browser gates are gone (ADR 495), and the event-comparison capture whose comparison rows it constrained, the before-and-after projection it recorded and the frozen clock case its last scenario read are removed (#531, ADR 531). The workstation rows' shape rule is restated as "Manufactured workstation rows carry only shapes their producer can serve".

**Migration:** Read "Manufactured workstation rows carry only shapes their producer can serve", ADDED in this change.
