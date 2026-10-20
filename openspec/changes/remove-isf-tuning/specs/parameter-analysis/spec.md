## ADDED Requirements

### Requirement: Harmonic does not estimate the correction factor or advise moving it

The analysis SHALL NOT estimate ISF and SHALL serve no correction-factor
estimate, recommendation, direction or staging verdict (ADR 564). No passive
method identifies ISF under Control-IQ: insulin delivery responds to glucose, so
insulin and glucose movement are confounded. Recurring correction lows are a
habit, owned by the correction habit detectors, and are not a setting signal.
Harmonic SHALL NOT replace the estimate with an experiment it assigns, such as
an engine-assigned basal Trial or a correction challenge. The programmed ISF
and each meal's dose-stamped ISF stay inputs Harmonic reads: the dose-stamped
ISF converts a meal's glucose miss into insulin (ADR 563), and the programmed
ISF is carried, unchanged, in every pump profile Harmonic shows or delivers.

#### Scenario: The analysis serves no ISF estimate

- **GIVEN** any store, including one with many clean fasting nights and
  correction boluses
- **WHEN** the analysis runs
- **THEN** its result carries no `isf` rows, no ISF tuning lever, no ISF settling
  gate and no ISF setting epoch
- **AND** its basal and carb-ratio rows are what they would be with the fasting
  nights removed

#### Scenario: Correction lows stay a habit

- **GIVEN** a window of recurring lows after corrections given over the
  calculator's insulin-on-board credit
- **WHEN** the analysis and the behavioral layer run
- **THEN** the correction habit detectors judge those lows as they did before
- **AND** no correction-factor direction or recommendation is served for them

#### Scenario: The programmed correction factor is still read

- **GIVEN** a meal bolus stamped with an ISF and a programmed ISF schedule
- **WHEN** the carb-ratio ledger converts that meal and the deliverable profile
  is built
- **THEN** the meal converts with its stamp, and the profile carries the
  programmed ISF unchanged

### Requirement: Every I:C estimate carries an interval, and a wide interval blocks assertion

The system SHALL satisfy the following:

Estimates ship as a point value, an 80% percentile-bootstrap interval, and the
sample size behind them; thin data surfaces as a wide interval and a visible `n`,
never as a blank. The resampling unit is the correlated cluster, not the raw
observation — whole meal runs for I:C — so same-night steps
and same-run meals cannot read as independent evidence. An estimate is *wide*
when its half-width exceeds a quarter of the point value, when fewer than three
observations back it, or when a clustered estimate rests on fewer than two
clusters. A wide estimate still displays; it simply cannot support a move.

#### Scenario: Many meals, one run

- **GIVEN** several meals that all belong to a single closed meal run
- **WHEN** the I:C interval is computed
- **THEN** the run is resampled as one cluster, so its meals cannot read as
  independent evidence

## MODIFIED Requirements

### Requirement: The Carb log is an exclusion signal only

The system SHALL satisfy the following:

The manual Carb log — user-entered unbolused carbs, in practice a rescue log — is
threaded into the analysis purely to de-bias basal's clean minutes. It scales
how long a span stays masked and nothing else. It is never a modelling input, never
converted into a synthetic bolus, and its COB is never re-fit from CGM shape:
inferring absorption from the glucose curve would launder the very residual the
clean-minute filter exists to exclude.

#### Scenario: A rescue is logged overnight

- **GIVEN** a night in which the user logged rescue carbs
- **WHEN** basal's clean minutes are taken for that night
- **THEN** the minutes under that entry's decayed COB are excluded, and the entry
  contributes no dose, no carb term, and no adjustment to the basal number

### Requirement: The analysis names what it refuses to assert

The system SHALL satisfy the following:

Several silences are deliberate and must survive refactoring:

- **No correction-factor estimate and no correction-factor advice.** No passive
  method identifies ISF under Control-IQ (ADR 564), and Harmonic assigns no
  experiment to identify it.
- **No dynamic COB anywhere.** Carb absorption is a static forward decay from the
  logged amount; re-fitting it from CGM shape would absorb the glucose residual the analysis attributes to insulin.
- **No pooled ratio behind a fabricated denominator.** A run that crosses a block
  boundary may enter numeric pooling only through the joint inverse-ratio fit, which
  assigns each block its carb-share ownership. Effective support remains whole runs
  plus fractional carb-share ownership, with the floor unchanged at eight.
- **No mean of per-meal ratios.** A whole-run pool divides total carbs by total
  insulin; the joint cross-block fit instead pools each run's inverse-ratio
  response against its carb-share ownership. Neither averages meal ratios, which
  would overweight small meals and bias the number high.

#### Scenario: The analysis names what it refuses to assert

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

## REMOVED Requirements

### Requirement: ISF is a single fasting number, never a time-of-day schedule

**Reason:** ADR 564: Harmonic does not estimate or tune the correction factor, because no passive method identifies it under Control-IQ.

**Migration:** None. No correction-factor estimate is served, so nothing reads it.

### Requirement: ISF is the slope of glucose change against insulin that acted

**Reason:** ADR 564: Harmonic does not estimate or tune the correction factor, because no passive method identifies it under Control-IQ.

**Migration:** None. No correction-factor estimate is served, so nothing reads it.

### Requirement: The fasting window is a detected rest window with no carbs in play

**Reason:** ADR 564: Harmonic does not estimate or tune the correction factor, because no passive method identifies it under Control-IQ.

**Migration:** None. No correction-factor estimate is served, so nothing reads it.

### Requirement: Harm evidence owns the ISF direction; the measurement may only strengthen

**Reason:** ADR 564: Harmonic does not estimate or tune the correction factor, because no passive method identifies it under Control-IQ.

**Migration:** None. No correction-factor estimate is served, so nothing reads it.

### Requirement: A harm-owned weaken is direction-only and never names a new ISF

**Reason:** ADR 564: Harmonic does not estimate or tune the correction factor, because no passive method identifies it under Control-IQ.

**Migration:** None. No correction-factor estimate is served, so nothing reads it.

### Requirement: One predicate decides whether an ISF row may stage

**Reason:** ADR 564: Harmonic does not estimate or tune the correction factor, because no passive method identifies it under Control-IQ.

**Migration:** None. No correction-factor estimate is served, so nothing reads it.

### Requirement: Every estimate carries an interval, and a wide interval blocks assertion

**Reason:** ADR 564: Harmonic does not estimate or tune the correction factor, because no passive method identifies it under Control-IQ. Its correction-factor clauses go; the rest is restated as "Every I:C estimate carries an interval, and a wide interval blocks assertion".

**Migration:** None; the basal and I:C behavior it states is unchanged.
