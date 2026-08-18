# Basal suggestion

## Purpose

Harmonic turns the basal a Control-IQ pump actually delivered into a suggested
basal profile: one estimate per time-of-day slot, each carrying its confidence
interval, its evidence, and a verdict on whether the data supports moving that
slot at all. The reading is of **maintenance need** measured over **clean
windows** only, and it is advisory — nothing here programs a pump.

This capability owns the clean-window filter, the per-slot estimate, the
direction verdict, and the consolidation of those estimates into a
pump-programmable **consolidated profile**. It does not own the safety rules
that turn an estimate into a bounded recommendation (the step cap, the absolute
range, the noise floor, the status vocabulary) nor the harm layer that reacts to
printed lows; it calls both and reports their verdicts unchanged. ISF and I:C
are separate capabilities; this one only carries their values forward when it
assembles a whole-profile deliverable.

## Requirements

### Requirement: Basal is reasoned about on the pump's local wall clock

A **basal profile** is a wall-clock schedule, so every timestamp reaching this
capability is already normalized to the pump's local wall clock, and every clean
minute is assigned to the slot its local hour and minute fall in. The day is
divided into fixed slots of a configured length (half an hour by default, so 48
slots). The calendar date of a minute's wall-clock time is the day it counts
toward. No slot is derived from UTC, and no slot is derived from elapsed time
since some anchor.

#### Scenario: The same clock time on different days is one slot

- **GIVEN** clean minutes recorded at the same local clock time on several
  different days
- **WHEN** the per-slot estimate is computed
- **THEN** all of those minutes belong to the same slot, and each day
  contributes one independent observation to that slot

### Requirement: Only clean minutes may inform a slot's number

A minute is eligible only when every one of these holds: delivered basal is
actually flowing at that minute (a delivery segment covers it and its rate is
above zero, and the segment is not a manual or algorithm suspension); no
excluded pump event — site or cartridge change, cartridge-empty shutdown, user
suspension, exercise — is within the configured margin; reconstructed
**bolus-only IOB**, decayed at the **Gate DIA**, has fallen to the
bolus-clear threshold, so no meal or correction insulin is still acting; a
glucose reading exists within the staleness limit and sits inside the in-range
window; and the least-squares glucose slope over the trailing slope window is
flat within the configured limit. Manual **Carb log** entries additionally bar a
span around each entry — a fixed backward clock-skew buffer plus a
grams-scaled forward span from the carb-on-board decay, with an entry of unknown
grams keeping a flat forward window. The carb log is an exclusion signal only:
it can remove minutes, never add or reweight them.

Anything that disqualifies a minute simply drops it. There is no partial credit
and no imputation.

#### Scenario: A minute in the shadow of a bolus is not clean

- **GIVEN** a minute whose reconstructed bolus-only IOB is still above the
  bolus-clear threshold
- **WHEN** the clean-window filter runs
- **THEN** that minute is excluded, even if glucose is in range and flat

#### Scenario: An unbolused carb entry hides its own minutes

- **GIVEN** a manual carb-log entry, which leaves no bolus IOB behind it
- **WHEN** the clean-window filter runs over the minutes following it
- **THEN** those minutes are excluded until the carb-on-board decay plus its
  trailing guard has cleared, so in-range flat minutes driven by food never read
  as maintenance need

#### Scenario: A slope that cannot be trusted is skipped, not used

- **GIVEN** a slope window containing too few glucose samples, or samples
  clustered across too small a fraction of the window
- **WHEN** the filter evaluates flatness for a minute in that window
- **THEN** no slope is produced and the minute is excluded, exactly as if
  glucose were missing — a sparse cluster must never emit a large apparent rate
  of change

### Requirement: A slot's number is the median of clean delivered basal, never the mean

Control-IQ's clean delivery is right-skewed: it adds corrective basal when
glucose runs high but still in range, and that long upper tail is the algorithm
working, not baseline need. A mean chases the tail and over-suggests, so the
suggestion is always a median. The estimate is taken in two stages, because
clean minutes inside one night are autocorrelated and bootstrapping over them
would understate uncertainty: each (slot, day) pair collapses to that day's
median first, and the slot's estimate is the bootstrap median over those
independent per-day values. The reported `n` is therefore a count of days, not
of minutes, and the interval is a percentile bootstrap at the project's standard
interval mass.

#### Scenario: A corrective tail does not lift the suggestion

- **GIVEN** a slot whose clean delivered rates are right-skewed by a minority of
  high corrective minutes
- **WHEN** the slot estimate is computed
- **THEN** the reported value is the median of the per-day medians, which sits
  below the arithmetic mean of the same data

#### Scenario: One night reads as one night

- **GIVEN** a slot with many clean minutes but all on a single day
- **WHEN** the slot estimate is computed
- **THEN** `n` is one and the interval reads as wide, rather than the minute
  count making the slot look well supported

### Requirement: Each slot is measured against the programmed basal in force, and cut to its own setting epoch

The baseline a slot is compared against is the **programmed basal** from the
current settings snapshot's active schedule when one is available, and the
reconstruction from the dense programmed-rate feed otherwise. Separately, each
slot's measurement window is cut at that slot's own **setting epoch** start —
the moment its programmed rate last changed — so editing one profile segment
shortens only the slots that segment actually moved, and untouched slots keep
the full requested window. Minutes predating a slot's cut are held aside rather
than discarded; an opt-in pooling mode may restore them, but only when the
pre-edit and post-edit day-collapsed estimates have overlapping intervals and
the post-edit subset is thick enough to run that comparison. When they disagree,
the post-edit-only reading stands and the divergence is recorded as a per-slot
data-quality note.

### Requirement: A slot may assert a direction only when the family-corrected night sign test supports it

Direction is decided per night, not from the pooled estimate. Each night's clean
minutes in a slot yield a median departure from the programmed basal that was in
force **that night**; a night whose departure is exactly zero is Control-IQ
simply delivering the profile and carries no directional information, and a
night with no as-of programmed rate is unavailable. The surviving signs feed an
exact one-sided binomial tail for each direction, and both directions of every
slot form one fixed multiplicity family controlled by Benjamini-Hochberg at the
configured false-discovery rate — adjacent half-hour slots are not pretended to
be independent. A proposed move is downgraded to insufficient evidence unless
the supported direction for that slot agrees with the move's sign.

#### Scenario: A consistent lean in too few slots of the day still fails the family test

- **GIVEN** a slot whose informative nights lean one way but whose one-sided
  tail does not clear the Benjamini-Hochberg cutoff for the whole
  slots-by-directions family
- **WHEN** the verdict is assembled
- **THEN** the slot reports insufficient evidence and asserts no move

### Requirement: Below the supported-nights floor a slot holds, while still showing its number and interval

A basal direction needs at least the supported-nights floor of informative
non-tie nights — currently eight — before the sign test can return any support
at all; below it, both directional tails are reported as certain non-evidence,
so no direction can be supported no matter how tight the interval is. This is
deliberate: a narrow interval at a handful of nights would otherwise read as
actionable. The slot is not blanked. Its median, its interval, its day count,
its per-day evidence points, and its annotation are all still reported; only the
assertion is withheld.

#### Scenario: A tight interval on thin data still holds

- **GIVEN** a slot with fewer informative nights than the supported-nights
  floor, whose bootstrap interval happens to be narrow and excludes the
  programmed rate
- **WHEN** the verdict is assembled
- **THEN** the slot's status is insufficient evidence, its number and interval
  remain visible, and it moves nothing downstream

### Requirement: `asserts_move` is the single predicate that lets a slot move anything

Whether a slot may move the deliverable schedule, count toward the tuning
**Priority** impact tally, or be staged into a **Plan** is decided by exactly one
predicate on the slot: `asserts_move`, which is true only when the safety verdict
for that slot asserted a real direction. Every consumer — the consolidated
profile, the priority tally, and the staging surface — reads that one flag and
re-derives no eligibility of its own.

This is load-bearing. Any new reason to hold a slot belongs inside that
predicate and nowhere else. A hold added in a surface while the deliverable keeps
reading the raw recommendation produces a schedule that moves slots the surface
says are held, which is a dosing error rather than a display bug. The same rule
governs the carb-ratio side, whose block-level flag is likewise the only
eligibility test its consumers may apply.

#### Scenario: A held slot moves nothing

- **GIVEN** a slot whose status is insufficient evidence, no change, no data, or
  a withheld raise
- **WHEN** the consolidated profile, the priority tally, and Plan staging are
  built
- **THEN** the deliverable carries that slot's current programmed rate forward,
  the tally excludes it, and staging returns nothing for it — even though the
  safety layer still returned a bounded recommended number for display

#### Scenario: A surface must not invent its own hold

- **GIVEN** a slot the engine marked as asserting a move
- **WHEN** a consumer would prefer to withhold it on a rule of its own
- **THEN** the correct change is to the engine predicate, so that the
  deliverable schedule, the tally, and staging all hold the slot together

### Requirement: Safety and harm adjust the recommendation, never the measurement

The clean-window median stays the measurement. The safety layer produces the
bounded recommended number and the status from it, and the harm layer is applied
on top of that result and only ever toward less insulin — withholding a raise for
a slot that printed an overnight low, and on recurrence moving the slot down
toward its own median rather than fabricating a larger cut. Neither layer
rewrites the estimate, and a slot's reported median, interval, and day count are
identical whether or not either layer acted.

#### Scenario: A recurring-low nudge may move a slot the sufficiency floor holds

- **GIVEN** a slot below the supported-nights floor, for which overnight lows
  attributed to basal recur
- **WHEN** the harm layer is applied
- **THEN** the slot may move — but only downward, bounded by the safety step
  cap — while the same thinness still forbids any upward move

### Requirement: Slots consolidate into a profile the pump can actually accept

The pump accepts a limited number of profile segments, so the per-slot rates are
consolidated. Each slot contributes its deliverable rate: the moved
recommendation when and only when the slot asserts a move, otherwise the current
programmed rate, falling back to the recommendation and then the raw estimate
only when no baseline exists. Adjacent rates within the noise floor merge, a
single-slot excursion between two neighbours that agree within the noise floor
collapses into them at the larger neighbour's rate, and the resulting basal
boundaries are unioned with the ISF, carb-ratio, and target step functions so
every segment names all four parameters. If that union still exceeds the pump's
segment limit, adjacent pairs merge cheapest-first by duration-weighted basal
delta until it fits, and the profile reports that forced merges occurred along
with the worst basal deviation they introduced.

#### Scenario: Fitting the pump's segment limit is disclosed, not hidden

- **GIVEN** recommendations spanning more distinct rates than the pump's segment
  limit allows
- **WHEN** the consolidated profile is assembled
- **THEN** boundaries are force-merged until it fits, the profile is flagged as
  force-merged, and it carries a note naming the largest resulting deviation in
  delivered rate

### Requirement: A slot whose clean glucose is one-sided is flagged, not suppressed

The clean-window filter admits only in-range glucose, so a person who runs high
leaves a left-truncated distribution in which the median drifts toward the
corrective end. When more than the configured fraction of a slot's clean minutes
sit above the midpoint of the in-range window, the slot carries an advisory
verdict stating the fraction and an estimate of how much the number may lean
high, computed as the gap between the slot's full median and the median of its
lower-glucose half. The verdict is a review cue attached to the slot's evidence;
it never blocks or alters the estimate.
