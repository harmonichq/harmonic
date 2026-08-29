# Safety

## Purpose

Harmonic measures what a person's insulin settings *appear* to need; this capability
decides how much of that measurement is allowed to become advice. It owns the caps
that bound the size of any one move, the floors that decide whether a direction may
be asserted at all, and the backend-owned verdicts every other layer reads to learn
whether a slot, block, or segment may move. Basal expresses that verdict through
`Status`; I:C and ISF stamp explicit `asserts_move` booleans from their analyzer-local
rules. It does not compute estimates or confidence intervals (the estimate layer does
that), and it does not decide *which* change to show first (the ranking layer does
that). It is the reason a plausible but under-evidenced number does not reach a person
as a dosing recommendation.

The clinical stakes set the shape of every rule here. Basal insulin acts while
someone is asleep and unable to notice a drift, so an over-suggestion produces
nocturnal hypoglycemia rather than a mild inconvenience; a large single-pass change
overshoots and then reverses, so the schedule oscillates instead of converging; and
a direction inferred from a handful of nights is as likely to be noise as need. The
caps trade a slower approach to the right number for never taking a large step in a
direction the evidence cannot support.

## Requirements

### Requirement: Every recommendation is clamped to an absolute sane range

The system SHALL satisfy the following:

No recommended basal rate is ever emitted outside `SafetyConfig.abs_min` (0.1 U/h)
and `SafetyConfig.abs_max` (3.0 U/h), whatever the estimate says. This clamp applies
before any other rule and applies even when no current programmed rate is known, so
it is the one guard that can never be skipped.

#### Scenario: An estimate lands outside the sane range

- **GIVEN** a slot whose measured estimate exceeds `abs_max`
- **WHEN** the safety layer produces a recommendation for that slot
- **THEN** the recommendation is `abs_max`, never the raw estimate

### Requirement: A move from a known current setting is limited to one step

The system SHALL satisfy the following:

When a current programmed rate is known, the recommendation is clamped to
`current × (1 ± SafetyConfig.max_step_frac)` — 20% per pass. A recommendation that
had to be clamped reports `CAPPED_RAISE` or `CAPPED_LOWER` rather than `RAISE` or
`LOWER`, so a reader can tell a full measured move from a rate-limited one. The step
cap is deliberately a per-pass limit rather than a final answer: a genuinely larger
change is reached over successive windows, each re-measured, instead of in one jump
that the next window would have to undo.

#### Scenario: The measurement asks for more than one step

- **GIVEN** a slot with a known current rate whose supported measurement lies more
  than 20% away from it
- **WHEN** the safety layer produces a recommendation
- **THEN** the recommendation is exactly one step from current and the verdict is
  the capped form of the direction, not the plain one

#### Scenario: The measurement asks for less than one step

- **GIVEN** the same slot, but with a supported measurement inside 20% of current
- **WHEN** the safety layer produces a recommendation
- **THEN** the recommendation is the measured value and the verdict is the plain
  `RAISE` / `LOWER` form

### Requirement: A change smaller than the noise floor is reported as no change

The system SHALL satisfy the following:

A move whose magnitude is below `SafetyConfig.noise_floor` (0.05 U/h) resolves to
`NO_CHANGE`, holding at the current rate. Below that magnitude the difference is
indistinguishable from measurement noise, and re-programming a schedule for it
produces churn rather than benefit. The same threshold is the floor below which a
computed basal lean is not reported at all, and the floor for merging adjacent
segments into the consolidated profile.

#### Scenario: A sub-noise-floor difference

- **GIVEN** a slot whose capped recommendation differs from current by less than the
  noise floor
- **WHEN** the verdict is computed
- **THEN** the verdict is `NO_CHANGE` and the number carried forward is the current
  rate, not the recommendation

### Requirement: Without a current setting, only the absolute range applies

The system SHALL satisfy the following:

Control-IQ rarely lets the programmed profile show through, so many slots have no
recoverable baseline. Such a slot reports `NO_BASELINE`: the absolute range still
clamps it, but the relative step cap and the noise floor have no baseline to be
computed against and are not applied. `NO_BASELINE` is not an actionable verdict —
the number is shown, but nothing stages off it.

#### Scenario: Without a current setting, only the absolute range applies

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
### Requirement: A basal direction requires a family-corrected sign test

The system SHALL satisfy the following:

A basal direction is not read off the estimate's confidence interval. Each clean
night contributes one sign per slot — delivered basal above or below the programmed
rate that was in force *that night*. Ties (Control-IQ simply delivering the profile)
and nights with no as-of programmed rate carry no directional information and are
excluded. Both directions for every clock slot form one fixed multiplicity family,
and Benjamini-Hochberg controls the false-discovery rate across that family at
`_BASAL_DIRECTION_FDR` (0.05), rather than pretending adjacent half-hour slots are
independent tests. Only a slot whose supported direction agrees with the proposed
move keeps a directional verdict; disagreement or no support downgrades it to
`INSUFFICIENT`.

#### Scenario: A basal direction requires a family-corrected sign test

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
### Requirement: A basal slot below the minimum-supported-nights floor cannot assert a direction

The system SHALL satisfy the following:

A slot with fewer than `_MIN_SUPPORTED_NIGHTS` (8) informative non-tie nights is
assigned p = 1 in the sign test, so it can never clear the family correction and can
never assert a move. Clearing the floor only makes a slot *eligible* for the
corrected sign test; it does not by itself assert anything. The floor exists because
a narrow confidence interval built on a handful of nights reads as confident while
carrying almost no evidence — that combination is exactly what would otherwise stage
a basal change.

#### Scenario: Just below the supported-nights floor

- **GIVEN** a basal slot with seven informative non-tie nights and a narrow
  confidence interval that excludes the programmed rate
- **WHEN** the safety layer computes its verdict
- **THEN** the verdict is `INSUFFICIENT`, the slot's estimate and interval remain
  visible, and no consumer may move that slot

#### Scenario: Just above the supported-nights floor

- **GIVEN** the same slot with eight informative non-tie nights
- **WHEN** the safety layer computes its verdict
- **THEN** the slot enters the family-corrected sign test, and it asserts a direction
  only if its corrected p-value clears the false-discovery threshold — reaching the
  floor is necessary, never sufficient

### Requirement: The minimum-directional-days floor is a distinct, weaker guard

The system SHALL satisfy the following:

`_MIN_DIRECTIONAL_DAYS` (3) is not the supported-nights floor and must not be
confused with it. It guards the interval-based direction rule, which applies to
callers that supply no externally computed direction: such a caller's estimate is
refused a sign when it is flagged wide, when fewer than three days back it, or when
the current setting lies strictly inside the open interval. The same three-day
threshold decides whether a post-edit subset is thick enough to be tested for
agreement against pre-edit data before the two are pooled. The basal path does not
use the interval rule at all — it supplies the family-corrected sign verdict — so
the eight-night floor, not the three-day one, is what governs a basal assertion.

#### Scenario: The minimum-directional-days floor is a distinct, weaker guard

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
### Requirement: A wide estimate never asserts a direction, and neither does a band that spans the current setting

The system SHALL satisfy the following:

Under the interval rule, an estimate flagged wide by the estimate layer — a broad
band relative to its point value, too few observations, or too few independent
clusters behind a clustered estimate — is refused a direction outright. A narrow band
is not sufficient either: if the current setting lies strictly inside the interval,
the data does not distinguish the current setting from the estimate and no direction
may be asserted, however ample the sample. The interval is treated as open, so a band
that merely touches the current value at an endpoint survives.

#### Scenario: Narrow band, current setting inside it

- **GIVEN** an estimate that is not flagged wide, backed by ample days, whose interval
  strictly contains the current setting
- **WHEN** the interval direction rule is applied
- **THEN** the verdict is `INSUFFICIENT` — a narrow band alone does not license a move

### Requirement: An I:C block asserts only when it meets the minimum-supported-runs floor

The system SHALL satisfy the following:

An I:C block — a maximal contiguous group of programmed segments sharing one value on
the circular day, which is the unit a person can actually edit on the pump — may
assert a direction only when it has at least `_MIN_SUPPORTED_BLOCK_RUNS` (8) units of
effective support: whole closed meal runs owned by the block plus the block's
fractional carb-share ownership of chained runs that span a boundary. The number is
deliberately the same as the basal supported-nights floor: a per-block I:C
assertion is the same shape of dosing decision as a basal slot's, so it carries the
same evidence bar. The floor gates assertion only. A block below it still prints its
measured ratio and its band once a smaller display pool has filled, so a reader sees
the emerging number without it being able to move anything.

#### Scenario: Just below the supported-runs floor

- **GIVEN** an I:C block with a completed 90-day block window, a non-null estimate,
  and just under eight units of effective support from whole closed meal runs plus
  fractional carb-share ownership of chained boundary-spanning runs
- **WHEN** block eligibility is computed
- **THEN** the block reports a below-floor state, prints its number and band, and
  asserts no move

#### Scenario: At the supported-runs floor

- **GIVEN** the same block with its completed 90-day block window and non-null
  estimate held constant, and exactly eight units of effective support from whole
  closed meal runs plus fractional carb-share ownership of chained boundary-spanning
  runs
- **WHEN** block eligibility is computed
- **THEN** the block becomes numeric and may assert only if *all* remaining
  conditions also hold — its band excludes the programmed ratio, the regime bracket
  does not straddle the programmed value with a non-empty on-regime pool, and the
  capped recommendation names a real move off the current setting

### Requirement: Historical I:C measurements can never become dosing advice

The system SHALL satisfy the following:

The supported-runs floor governs only the currently programmed I:C block. A retired
regime may remain visible with a point estimate, interval, and support above or below
that floor, but it carries no recommendation, direction, lean, priority, assertion,
consolidated-profile contribution, staging affordance, or Plan entry. Its lifecycle
and finished annotation are analyzer-owned facts; a consumer may not reinterpret a
non-null estimate, a narrow interval, or ample support as permission to act.

#### Scenario: Retired evidence clears the current assertion floor

- **GIVEN** a retired I:C regime with at least eight proved closed meal runs and a
  narrow interval excluding today's programmed value
- **WHEN** analysis, ranking, delivery, and staging consumers read it
- **THEN** it remains a historical measurement only, contributes no current move,
  and says no change is suggested

### Requirement: A held estimate keeps its number and its band visible

The system SHALL satisfy the following:

A verdict that withholds a direction never blanks the measurement. The capped
recommendation, the point estimate, the confidence interval, and the sample size all
remain in the payload for a held slot, block, or segment. Withholding the *assertion*
while showing the *evidence* is the intended posture: hiding a thin number would deny
a reader the ability to see a signal forming, while presenting it as actionable would
be the failure this capability exists to prevent.

#### Scenario: A held estimate keeps its number and its band visible

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
### Requirement: The verdict is the only staging and delivery predicate

The system SHALL satisfy the following:

The safety verdict — exposed as `SlotEstimate.asserts_move` for basal and as the I:C
and ISF analyzers' own single eligibility flags — is what every
downstream consumer reads to decide whether a change may move a deliverable schedule
or be staged into a plan. Basal and I:C also use that same eligibility when counting
actionable priority; ISF ranking remains independently priced from its
direction and never treats stageability as its register or priority gate. **No other
layer may re-derive an evidence floor of its own.** Not the consolidated-profile
builder, not the ranking layer, not any frontend surface. This is the invariant this
codebase has regressed on repeatedly:
each recurrence took the form of a second predicate — a display-only thinness marker,
a `not wide` check, an extra "has a recommendation" test — placed at one call site
while the verdict underneath kept admitting the move, so the change was held in one
place and delivered in another. A new hold belongs *inside* the verdict; a consumer
that re-tests a condition the verdict already covers is a defect regardless of whether
it currently agrees.

#### Scenario: A consumer sees a moved recommendation on a held slot

- **GIVEN** a slot whose verdict is `INSUFFICIENT` but which still carries a capped
  recommendation different from its current rate
- **WHEN** the consolidated profile, the priority tally, or a staging surface reads
  that slot
- **THEN** each of them carries the *current programmed rate* forward and stages
  nothing, because each keys on the verdict and none re-derives eligibility from the
  recommendation, the interval width, or the day count

#### Scenario: An ISF row carries a stale-looking recommendation

- **GIVEN** an ISF row whose recommendation is present but whose
  backend `asserts_move` verdict is false or absent
- **WHEN** Diagnose, Plan, or any fixture-only projection consumes that row
- **THEN** it stages nothing and shows no actionable number, even if the direction
  register still reports the analyzer's independent direction

#### Scenario: A new hold is needed for basal

- **GIVEN** a newly identified condition under which a basal slot must not move
- **WHEN** that hold is implemented
- **THEN** it is expressed as part of the verdict computation, so that the deliverable
  schedule, the priority tally, and every surface inherit it at once

### Requirement: The harm layer may only ever move toward less insulin

The system SHALL satisfy the following:

Estimates are measured on clean windows, which by construction exclude the lows the
current settings caused — a low is out of range and filtered out, so it is never
measured. The harm layer is applied *on top of* a computed verdict to close that
blind spot, and it is directional by design:

- a slot that printed an attributed overnight low has any would-be raise withheld and
  holds at its current rate (`HARM_GATED`); a lowering or holding verdict is left
  untouched, so the gate never adds insulin and never blocks a cut;
- when such lows recur, the slot is nudged downward (`HARM_LOWER`), and the magnitude
  defers to the clean-window median rather than fabricating a full step: the target is
  the median where the median sits below current, floored at one step cap, and the
  slot merely holds where the median sits at or above current;
- with no clean median to defer to, one full step down stands, since recurring lows
  still argue downward and there is nothing to reconcile against.

`HARM_LOWER` is actionable and moves the deliverable schedule exactly as a clean
lowering verdict does. `HARM_GATED` is not actionable — it only withholds, so the slot
carries its current rate forward. Recurring-low evidence deliberately overrides the
clean-window sufficiency floors in the downward direction only: an observed low is
direct evidence, independent of how many clean nights the slot has, and the asymmetry
is the point.

#### Scenario: A thin slot with recurring attributed lows

- **GIVEN** a slot below the supported-nights floor whose clean median sits below its
  current rate, and which printed recurring attributed overnight lows
- **WHEN** the harm layer is applied
- **THEN** the slot moves downward toward the median, floored at one step cap, even
  though the same slot could not have asserted a raise on that evidence

#### Scenario: Recurring lows against a median that disagrees

- **GIVEN** a slot with recurring attributed overnight lows whose clean median sits at
  or above its current rate
- **WHEN** the harm layer is applied
- **THEN** the slot holds at current under the recurring-low gate, and no downward cut
  is invented against a median that contradicts it

### Requirement: ISF and I:C moves are half-gap steps under the same 20% cap

The system SHALL satisfy the following:

The ISF and I:C analyzers do not route through the basal cap;
each computes its own recommendation as half the gap from the programmed value toward
its measured target, clamped to ±20% of the programmed value. Moving halfway per
window converges on the right value while re-measuring at each step, where repeated
full steps overshoot and reverse. The ±20% clamp is the same per-pass limit the basal
step cap enforces, applied to a different parameter.

#### Scenario: ISF and I:C moves are half-gap steps under the same 20% cap

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
### Requirement: One backend predicate decides whether an ISF row may stage

The system SHALL satisfy the following:

`isf_asserts_move` is the ISF staging decision. It is evaluated after
the harm gate from the final values that the analyzer publishes, and is true only
when the current programmed value exists, a direction is named, a recommendation
exists, and that recommendation differs from current. A direction-only weakening, a
hold, a missing programmed value, and a rounded no-op all carry `asserts_move = false`.
Consumers require the exact boolean `true`; an absent legacy field fails closed.

This predicate controls staging only. The harm and measurement channels still own
direction, the findings projection still derives its queue register from that
direction, and the ISF analyzer still owns its half-gap cap. ISF does
not inherit basal's `Status`, evidence floors, or consolidated-profile path merely
because it now shares the one-verdict staging invariant.

#### Scenario: No programmed ISF exists

- **GIVEN** a trustworthy fasting measurement but no programmed ISF
- **WHEN** the analyzer publishes its row
- **THEN** the estimate, interval, support, and evidence remain visible, while
  `recommended` is empty and `asserts_move` is false

#### Scenario: Rounding removes the proposed move

- **GIVEN** a named strengthen direction whose final recommendation rounds back to
  the current programmed ISF
- **WHEN** the final staging predicate is evaluated
- **THEN** the direction remains available for explanation, but `asserts_move` is
  false and no consumer may stage the row

### Requirement: A direction without a trustworthy number recommends nothing

The system SHALL satisfy the following:

Where harm evidence establishes a direction but the measurement cannot supply a value
worth programming, no recommendation is emitted at all. Recurring correction-caused
lows weaken ISF as a *direction*, and if the supporting overnight
median is absent or points the other way, the recommendation stays empty and nothing
can be staged or programmed — a number is never manufactured to give the direction
something to carry. Conversely, a move toward *stronger* corrections requires observed
silence: zero attributed lows and zero attributed rescue logs over a window the rescue
log was actually recording across, a measurement that is not flagged wide, and the same
signal holding on two consecutive decision points. A quiet stretch that merely predates
the rescue log is unknown, not silence, and may never license a stronger correction.

#### Scenario: A single attributed low with no recurrence

- **GIVEN** one correction-attributed low on record and a measurement that would
  otherwise support a stronger ISF
- **WHEN** the ISF recommendation is computed
- **THEN** the setting is held as it is; a single low is enough to gate a move toward
  more insulin even though it is not enough to force one away from it
