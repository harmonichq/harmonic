## MODIFIED Requirements

### Requirement: Verdict availability is gated on data accrual, not model sufficiency.

The system SHALL satisfy the following:

A Trial is *Maturing* while the target metric's post-change **data-day** accrual is incomplete — not calendar days, but actual data days. An I:C trial (target = post-meal arc) matures on meal days; a TIR trial on CGM days. A meal-less stretch keeps the Trial maturing rather than prematurely trusting a delta the data cannot support. The Trial requires a **fixed 14 data days**, independent of any trend or analysis window a caller selects. Maturity accrues only within the Trial's own period, which ends 14 days after the change when its 14 data days are in by then, otherwise at the close of the date its 14th data day lands, otherwise at the end of its 28-day watch window. Data landing after that period cannot complete it, and every surface reads the same count for the same change. Once the required data days are observed, the Trial moves to *complete* and is ready for a before/after read — the verdict that the change helped (or didn't) can only be formed then. A Trial that reaches the end of its watch window short of them takes the ending that window records. A Focus has no data gate; its adherence is tracked by re-running the same behavioral detector that raised the lever, and its outcome reads off the existing clean-rate series.

#### Scenario: Verdict availability is gated on data accrual, not model sufficiency.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: A sparse Trial keeps counting past its fourteenth day

- **GIVEN** a block-bound carb ratio Trial with in-block meals on nine dates in the
  14 days after its change and on five more dates after them
- **WHEN** the roster is read after the last of those dates
- **THEN** the Trial is complete with `days_elapsed` 14
- **AND** its Trial period ends at the close of the date of its 14th data day, and a
  later meal feeds neither its count nor its evidence

#### Scenario: A Trial counts nothing past its watch window

- **GIVEN** a retained Trial short of 14 data days with a meal after the change plus
  28 days
- **WHEN** the roster is read after that meal
- **THEN** the meal is not counted and the Trial period ends at the change plus 28 days
