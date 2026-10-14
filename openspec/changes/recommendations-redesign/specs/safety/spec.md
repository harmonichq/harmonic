## MODIFIED Requirements

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
`INSUFFICIENT`. A supported direction also needs the slot's served estimate range to
exclude the programmed rate: the range is closed, so a rate equal to either bound is
inside it, and a range that contains the programmed rate downgrades the slot to
`INSUFFICIENT` too, with its number and range still published and a sentence saying
the range still includes the set rate (ADR 489).

#### Scenario: A basal direction requires a family-corrected sign test

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: A supported direction whose range contains the programmed rate

- **GIVEN** a synthetic slot programmed at 0.60 U/h whose fourteen clean nights deliver
  0.60 and sixteen deliver 0.66, so every informative night supports a raise
- **WHEN** the basal analyzer serves the slot
- **THEN** its estimate is 0.66 with a range of 0.60 to 0.66, and the slot is
  `INSUFFICIENT`: it asserts no move, carries no setting action, moves no pump
  profile and adds nothing to the basal Priority

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
- a median-deferred nudge also needs the slot's served estimate range to exclude
  current (closed bounds): where the range contains current, the slot holds at
  current under the recurring-low gate, with a sentence saying the lows keep
  happening but the measured range still includes the set rate (ADR 489);
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

#### Scenario: Recurring lows against a range that contains the setting

- **GIVEN** a synthetic slot programmed at 0.60 U/h whose thirty clean nights deliver
  0.45 on fourteen, 0.54 on two and 0.66 on fourteen, and which printed attributed
  overnight lows on two nights
- **WHEN** the basal analyzer applies the harm layer
- **THEN** its median is 0.54 with a range of 0.45 to 0.66, and the slot is
  `HARM_GATED` at 0.60: it asserts no move, carries no setting action and keeps its
  recurring-low seriousness and its lows

### Requirement: One backend predicate decides whether an ISF row may stage

The system SHALL satisfy the following:

`isf_asserts_move` is the ISF staging decision. It is evaluated after
the harm gate from the final values that the analyzer publishes, and is true only
when the current programmed value exists, a direction is named, a recommendation
exists, that recommendation differs from current, and the fasting estimate's served
range excludes current (closed bounds, ADR 489). A direction-only weakening, a
hold, a missing programmed value, a rounded no-op, and a range that contains current
all carry `asserts_move = false`. A sized strengthen refused for its range is
published as a hold: no direction and no recommendation, with its estimate and range
kept and a sentence saying the measured range still includes the set value.
Consumers require the exact boolean `true`; an absent legacy field fails closed.

This predicate controls staging only. The harm and measurement channels still own
direction, the findings projection still derives its queue register from that
direction, and the ISF analyzer still owns its half-gap cap. ISF does
not inherit basal's `Status`, evidence floors, or consolidated-profile path merely
because it now shares the one-verdict staging invariant.

The same verdict decides whether ISF reaches the Queue (ADR 504). Guidance always
serves the `setting:isf` candidate, but admits it, and considers it as its next
concern, only when a member carries `asserts_move = true`. An admitted ISF ranks
among the other admitted candidates by its served Priority, an exact tie broken by
subject. Every other ISF row stays out of the Queue and leads no investigation.

#### Scenario: An asserted ISF joins the Queue

- **GIVEN** synthetic fasting nights whose ISF row asserts a strengthen
- **WHEN** guidance is read
- **THEN** the `setting:isf` candidate is admitted with that member's action

#### Scenario: An ISF the analyzer does not assert stays out of the Queue

- **GIVEN** a held, a direction-only, a range-held, or an unprogrammed ISF row
- **WHEN** guidance is read
- **THEN** the `setting:isf` candidate is served but not admitted, and guidance
  never selects it

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

#### Scenario: A sustained strengthen whose range contains the programmed value

- **GIVEN** synthetic fasting nights that read more sensitive than the programmed ISF
  on two decision points, and a fasting range that still contains the programmed ISF
- **WHEN** the analyzer publishes its row
- **THEN** the estimate and range remain visible, while the direction and
  `recommended` are empty, `asserts_move` is false and its Priority is 0
