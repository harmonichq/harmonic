# Parameter analysis

## Purpose

Harmonic estimates the two tunable dosing parameters that are not the basal
schedule: ISF (insulin sensitivity factor — how far one unit moves glucose) and
I:C (the grams of carb one unit covers). Neither is ever logged by the pump, so
both are *inferred* from glucose response, and this capability owns that
inference: which stretches of history are admissible evidence, what the estimate
and its interval mean, and whether an estimate has earned the right to move a
deliverable schedule.

It does not own the basal schedule, the caps/floors/verdicts the safety layer
applies, or the reconstruction of insulin activity — it consumes the last of
these as the bolus-and-basal activity curve every calculation here is measured
against.

## Requirements

### Requirement: ISF is a single fasting number, never a time-of-day schedule

The ISF analyzer produces exactly one estimate, labelled for the fasting regime,
carried in the result schema as a one-row list anchored at the start of the day.
Daytime ISF is not separately identifiable from this data — meal boluses logged
with no carbs are indistinguishable from corrections — so the analysis measures
the one regime it can read cleanly and reports it alone. The programmed ISF it
compares against is the median of the programmed segments overlapping the
nocturnal envelope, because the pump's schedule is per-segment and the fasting
regime spans several segments and wraps midnight.

### Requirement: ISF is the slope of glucose change against insulin that acted

Over each consecutive pair of CGM readings inside a fasting window, the analyzer
regresses the glucose change on the units of insulin that were absorbed across
that step — total activity, boluses plus the pump's own basal micro-doses, read
off the shared exponential activity curve. ISF is the negation of the fitted
slope; the intercept absorbs steady-state drift so the slope isolates insulin's
marginal effect. Steps whose endpoints are further apart than a sensor gap
allows, or whose glucose change is physiologically implausible, are dropped
before the fit.

### Requirement: The fasting window is a detected rest window with no carbs in play

A step is admissible only when **both** of its CGM endpoints fall inside the
*same* detected rest window for that night — the behaviorally inferred at-rest
period, clamped to a nocturnal envelope, not a fixed clock — **and** no carbs
were in play. Carbs disqualify a step through two distinct guards, because a
carb-bearing bolus and an unbolused Carb log entry contaminate differently:

- A carb-bearing bolus is masked by a flat lookback of roughly one duration of
  insulin action, because the covering insulin acts for that whole span and the
  post-meal descent would read as false insulin potency.
- A known-grams Carb log entry is masked by static forward-decay COB, so a small
  rescue releases the window in a fraction of that time. An entry with no
  recorded grams is never decayed and keeps the flat lookback.

#### Scenario: A carb-bearing bolus falls inside the lookback

- **GIVEN** a CGM step wholly inside a detected rest window
- **WHEN** a carb-bearing bolus was delivered within the flat lookback before the
  step, or at any point up to its end
- **THEN** the step is excluded from the fit entirely, and no partial or
  grams-scaled credit is given for it

#### Scenario: Sleep starts late

- **GIVEN** a night where the user was awake and eating well past midnight
- **WHEN** the rest-window detector places that night's window later than the
  usual hours
- **THEN** fasting steps are taken from the detected window for that night, not
  from a fixed clock, and the waking hours inside the nocturnal envelope
  contribute nothing

### Requirement: The Carb log is an exclusion signal only

The manual Carb log — user-entered unbolused carbs, in practice a rescue log — is
threaded into ISF purely to de-bias the fasting window. It scales how long a
window stays masked and nothing else. It is never a modelling input, never
converted into a synthetic bolus, and its COB is never re-fit from CGM shape:
inferring absorption from the glucose curve would launder the very residual the
ISF fit exists to measure.

#### Scenario: A rescue is logged overnight

- **GIVEN** a fasting night in which the user logged rescue carbs
- **WHEN** ISF is estimated for that window
- **THEN** the steps under that entry's decayed COB are excluded, and the entry
  contributes no dose, no carb term, and no adjustment to the fitted slope

### Requirement: Every estimate carries an interval, and a wide interval blocks assertion

Estimates ship as a point value, an 80% percentile-bootstrap interval, and the
sample size behind them; thin data surfaces as a wide interval and a visible `n`,
never as a blank. The resampling unit is the correlated cluster, not the raw
observation — whole nights for ISF, whole meal runs for I:C — so same-night steps
and same-run meals cannot read as independent evidence. An estimate is *wide*
when its half-width exceeds a quarter of the point value, when fewer than three
observations back it, or when a clustered estimate rests on fewer than two
clusters. A wide estimate still displays; it simply cannot support a move.

#### Scenario: Many fasting steps, one night

- **GIVEN** hundreds of admissible fasting steps that all come from a single
  detected rest window
- **WHEN** the ISF interval is computed
- **THEN** the estimate reads as wide on the cluster floor alone, regardless of
  how narrow the raw step-level band would have been

### Requirement: Harm evidence owns the ISF direction; the measurement may only strengthen

Correction-caused printed lows and correction-attributed rescue logs decide when
ISF eases weaker. That check runs first, and it clears whenever the Wilson lower
bound of the low-day rate over the covered window exceeds the day-rate floor. The
pooled regression's interval never decides direction on its own — it is
leverage-fragile, and a handful of contaminated high-leverage nights drag it
toward stronger corrections precisely when the lows say the opposite. The
measurement channel may assert a direction only in silence, only toward
*stronger* corrections, only when its estimate is not wide, and only when the
same signal held across two consecutive decision points. A single
correction-caused low or rescue log on record blocks any move toward stronger
corrections outright.

#### Scenario: Recurring lows while the fit points the other way

- **GIVEN** correction-caused low days recurring past the day-rate floor
- **AND** a pooled fasting interval sitting entirely on the stronger side of the
  programmed ISF
- **WHEN** the ISF card is produced
- **THEN** the direction is weaken, and the card says plainly that the overnight
  reading points the other way but is unsteady and the lows carry the decision

#### Scenario: A quiet window the rescue log did not cover

- **GIVEN** a window with no correction-caused lows and no rescue logs recorded
- **AND** part of that window predates the Carb log's first-ever entry
- **WHEN** the strengthen gate is evaluated
- **THEN** the window is treated as unobserved rather than quiet, no strengthen is
  asserted, and no strengthen signal is carried forward as a prior decision point

### Requirement: A harm-owned weaken is direction-only and never names a new ISF

When lows own the direction, the analysis states the direction and withholds the
number: no recommended value is emitted, so nothing can be staged or programmed
from it. The capped half-gap toward the robust per-night median survives only as
an internal basis for pricing the lever's ranking — it is never rendered, never
stageable, and never a schedule value. Harm evidence establishes that corrections
are too aggressive; it does not identify a trustworthy replacement.

### Requirement: I:C is measured from closed meal-run ledgers

The I:C unit of evidence is a **meal run**: a maximal chain of qualifying meals
whose consecutive boluses sit no further apart than the isolation window. The run
closes once, at full accounting DIA after its last bolus, when every member's
insulin is spent. Its balance sheet totals carbs covered (member carbs plus
attributable rescue grams) against the insulin the carbs truly demanded (member
boluses at face value, post-meal corrections weighted by how much had acted at
the read, the acted Control-IQ basal delta versus programmed, and the
insulin-equivalent of glucose travelled from the run's starting value). The
implied ratio is carbs over that denominator. Because isolation is welded to the
outcome read, a run's outcome can never be contaminated by a following meal.
Prior-bolus IOB is deliberately not credited to a run: isolation is one-sided, so
that residual usually belongs to earlier carbs and crediting it would double-book
them.

#### Scenario: A meal chains into a later one

- **GIVEN** two qualifying meals bolused closer together than the isolation window
- **WHEN** the ledger is built
- **THEN** they close as one run read after the second bolus, rather than the
  first meal being discarded for lack of isolation

#### Scenario: The outcome confirms a hypo deep enough to empty the ledger

- **GIVEN** a run whose glucose-travel term drives its insulin denominator to or
  below zero
- **WHEN** the run is assembled
- **THEN** the denominator is floored and the run is marked directional-only: it
  remains over-coverage evidence and harm-gating input, and it is excluded from
  the numeric pool rather than pooled behind an assumed denominator

### Requirement: The carb-ratio block is the unit that decides; segments are display

A **block** is a maximal contiguous group of programmed I:C segments sharing one
value, on the circular day — the thing the user can actually edit, since adjacent
segments carrying the same ratio move together on the pump, and the thing the
meals can speak about, since no evidence distinguishes two adjacent segments
holding the same value. A flat profile degenerates to one whole-day block. Blocks
are measured over a fixed trailing 90 days, independent of the request's window,
because the run ledger starves at shorter spans; every quantity a block decision
reads — its lows, its rescues, its impact denominator, its recurrence channels —
uses that same span, and mixing a count from one span with a divisor from the
other is a defect. Per-segment rows survive as request-windowed pump-lane display
only, naming their owning block, and never assert a move.

Only runs lying wholly inside a block enter its numeric pool; a run spanning a
boundary is information-free at block scope and would only add cross-block
contamination. Such runs still count toward the block's coverage, which is how a
block where every meal chains into a neighbour is honestly reported as
unmeasurable on its own rather than as merely short of data.

### Requirement: One predicate decides whether a block's ratio may move anything

`ic_asserts_move` is **the** I:C eligibility decision. Every condition lives
inside it, and it is stamped onto the block from the evidence the analyzer just
assembled. Ranking, the consolidated deliverable profile, and Plan staging all
read that one flag and re-derive nothing. All of the following must hold:

1. the block's state is numeric — still collecting, below the run floor, or
   unmeasurable alone can never assert, whatever the other flags say;
2. the pool clears the supported-run floor the safety layer defines;
3. the clustered interval excludes the block's programmed value;
4. the regime bracket — the full-window reading against the reading from meals
   actually dosed under the currently programmed value — does not straddle the
   programmed value, and its on-regime side is not empty;
5. the recommendation names a real move off the current value.

**Any hold on an I:C move belongs in this predicate and nowhere else.** A second
gate elsewhere is how the system previously delivered a ratio for a block the
ranker was holding: with the eligibility split across a consumer-side check and a
producer-side one, each fix patched only one of them and the other kept injecting
the move underneath. Each condition is also recorded individually alongside the
verdict, so a surface can say *which* one is holding without re-implementing it.

#### Scenario: Evidence disagrees with the setting but a gate holds

- **GIVEN** a numeric block whose interval excludes the programmed value
- **WHEN** the regime bracket still straddles that value, or a meal-attributed low
  withholds a tighter move
- **THEN** the block asserts no move, its number and interval remain visible, and
  the reason it is held is carried for display verbatim from the annotation the
  gate already set — never recomputed by the consumer

#### Scenario: A tighter ratio is proposed while a meal-owned low is on record

- **GIVEN** a block whose recommendation would tighten the ratio, meaning more
  insulin per carb
- **WHEN** any meal-attributed printed low or pre-empted low exists anywhere on
  the carb-ratio arm
- **THEN** the move is withheld and the block is held at its current value — the
  insulin lands in a body, not in a time slot, so a low in one part of the day is
  a real reason not to dose another part harder. A *looser* move is judged only
  against the block's own lows, since it moves toward less insulin.

### Requirement: Scatter is reported as carb counting, not as a ratio

Under-bolusing a meal is ambiguous between a weak ratio and undercounted carbs;
consistency separates them. When enough closed runs exist but the whole-day
pooled ratio's interval is wide, the analysis declines to recommend a ratio and
emits a carb-counting Finding instead — no single ratio settles out, so a steadier
counting habit is the lever, not the setting. A tight interval does not fire it.

#### Scenario: Plenty of meals, no stable ratio

- **GIVEN** a pool that clears the minimum run count
- **WHEN** its pooled interval is wide
- **THEN** a medium-severity carb-counting Finding is raised with the individual
  meals as its occurrences, and no ratio change is recommended from it

### Requirement: A recommendation moves half the gap and is capped

Where a parameter change is recommended at all, it moves halfway from the
programmed value toward the measured target, then is clamped to ±20% of the
programmed value. Half-gap converges without the reversals a full-step chase
produces: the next window re-measures and prices the next half-gap rather than
overshooting. The step is priced once here; ranking never scales it a second
time. Floors on how much evidence a move requires are the safety layer's, read
from there rather than restated.

### Requirement: Meals that cannot be attributed leave the numeric pool without leaving the record

Evidence that cannot carry a numeric claim is demoted, not deleted. A meal or run
whose start carries more than the identifiability floor of reconstructed action
from earlier carb-bearing boluses is contaminated; one whose preceding
insulin-action span could not be reconstructed is unknown, never clean; a bolus
the pump did not finish delivering, and any immediately truncated re-issue of it,
cannot carry a ledger at all. Correction-only prehistory never disqualifies a
meal. Demoted evidence still counts as coverage, still gates, and is still shown
with the reason it is excluded and how many identifiable meals are still needed.

### Requirement: The analysis names what it refuses to assert

Several silences are deliberate and must survive refactoring:

- **No daytime ISF schedule.** Only the fasting regime is identifiable; a
  per-segment ISF would be invented.
- **No conditioning gate on individual fasting nights.** A short window sitting on
  a flat part of the insulin decay has almost no leverage, so an extreme
  single-night fit is expected rather than corrupt. The reduction over nights is a
  median plus a per-night vote, which weight such a night once each; gating them
  would tighten the pooled band and thereby unblock stronger-correction advice.
- **No direction from a pooled interval alone for ISF.** Nights, not five-minute
  steps, are the estimator and recurrence unit.
- **No dynamic COB anywhere.** Carb absorption is a static forward decay from the
  logged amount; re-fitting it from CGM shape would absorb the ISF residual.
- **No pooled ratio behind a fabricated denominator**, and no numeric pooling of a
  run that crosses a block boundary.
- **No mean of per-meal ratios.** The I:C point estimate pools total carbs over
  total insulin; averaging ratios overweights small meals and biases the number
  high.

### Requirement: The measured ISF feeds the I:C ledger's glucose-travel term

Turning a run's glucose travel into insulin units requires one representative ISF
for the window. The measured fasting ISF is used when the analyzer produced one;
otherwise the median programmed ISF stands in, and where neither exists the
ledger falls back to its correction-only form and flags those runs as
unconfirmed. Confirmed and fallback runs centre differently, so whenever any run
in a pool has a readable outcome the estimate is taken from that subpopulation
alone rather than folding a mixture into one number.
