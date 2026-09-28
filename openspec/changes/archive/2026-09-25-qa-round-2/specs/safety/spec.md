## ADDED Requirements

### Requirement: A basal slot's harm evidence serves the recurrence count its nudge used

Every basal slot that printed an attributed overnight low SHALL serve, in its harm
evidence, `recurrence_nights`, the number of distinct nights with an attributed low
anywhere in the overnight band that the nudge counted for that slot (only nights on or
after that slot's setting epoch), and `recurrence_bar`, the number of such nights a
nudge needs. The slot SHALL be nudged exactly when `recurrence_nights` is at least
`recurrence_bar`. This is the one served recurrence count: no surface SHALL recount
it from `band_nights`, `slot_nights` or the listed lows.

#### Scenario: A setting edit mid-window counts only the nights after it

- **GIVEN** a synthetic store whose 03:00 basal setting changed mid-window, with
  attributed overnight lows on two nights before the change and one night after it
- **WHEN** the basal analyzer serves 03:00
- **THEN** its harm evidence serves `band_nights` 3, `recurrence_nights` 1 and
  `recurrence_bar` 2
- **AND** the slot is not nudged

#### Scenario: The nudge follows the served count

- **GIVEN** the same store with a second attributed overnight low after the change
- **WHEN** the basal analyzer serves 03:00
- **THEN** its harm evidence serves `recurrence_nights` 2 and `recurrence_bar` 2
- **AND** the slot is nudged

## MODIFIED Requirements

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
  still argue downward and there is nothing to reconcile against;
- a nudge whose step from current would be smaller than the noise floor or one full
  step, whichever is smaller, is not taken: the slot holds at current under the
  recurring-low gate, with its own served sentence naming the recurring lows. No
  minimum step is invented to reach that threshold. This one check applies to the
  median-deferred target and to the no-median full step alike, measures the step to
  the target before it is rounded, and lives in the harm layer alone.

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

#### Scenario: Recurring lows against a median within the noise floor

- **GIVEN** a synthetic slot programmed at 0.72 U/h whose twelve clean nights deliver
  0.71 U/h, and which printed attributed overnight lows on two nights
- **WHEN** the basal analyzer applies the harm layer
- **THEN** the slot is `HARM_GATED` at 0.72, does not assert a move, and carries no
  setting action
- **AND** its served sentence says the lows keep happening overnight and the step down
  is smaller than the smallest change worth making, and its guidance keeps the
  recurring-low seriousness
- **AND** the consolidated profile carries 0.72 through the overnight run

#### Scenario: The threshold is one full step at low settings

- **GIVEN** a slot programmed at 0.20 U/h with recurring attributed overnight lows
- **WHEN** its clean median is 0.16 U/h, one full step below
- **THEN** the slot is `HARM_LOWER` at 0.16
- **WHEN** its clean median is instead 0.19 U/h
- **THEN** the slot holds at 0.20 under the recurring-low gate
- **AND** a slot programmed at 0.137 U/h in the same state with no clean median, or
  with a clean median of 0.10, is `HARM_LOWER` at 0.11: the step is measured
  against the target before it is rounded

#### Scenario: A no-median step near the minimum rate follows the same threshold

- **GIVEN** a slot programmed at 0.11 U/h with recurring attributed overnight lows and
  no clean median
- **WHEN** the harm layer is applied
- **THEN** the slot holds at 0.11 under the recurring-low gate rather than stepping to
  the 0.1 U/h minimum
- **AND** a slot programmed at 0.72 U/h in the same state still steps one full step,
  to 0.576
