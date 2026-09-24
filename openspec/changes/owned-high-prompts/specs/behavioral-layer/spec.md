## ADDED Requirements

### Requirement: A Carb-log prompt asks about eating only at a rise no over-treated low owns

The Carb-log prompt queue SHALL raise no "did you eat here?" prompt for a High
that the shared evaluation records as owned by an over-treated low's rebound,
whatever the missed-meal classifier returns for it. The queue SHALL read that
ownership from the shared evaluation walk over the queue's own window, under the
same scenario configuration and the same low-prompt answers the Scenario
evaluation reads, including their endpoint rule. It SHALL NOT judge a low, a
rebound or ownership itself. A High that no low owns SHALL be judged exactly as
before. Every sub-70 low SHALL keep its own "did you treat this low?" prompt. A
low refuted by a `no` answer owns nothing, so its rebound High SHALL be judged on
its own. No detector, staging predicate, cap, support floor, segmentation rule,
rebound horizon, bar or meal stop, or context-gate default SHALL change.

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

### Requirement: Every classifier judges the context gate under its scenario configuration

Every behavioral classifier that consults the shared context gate SHALL judge it
under the scenario configuration it was given, never under the gate's defaults,
so a changed gate low line or lookback reaches its verdict. This includes late
bolus and carb undercount.

#### Scenario: A configured gate moves the late-bolus and carb-undercount verdicts

- **GIVEN** a from-flat pre-bolus rise whose only low reading sits outside the
  default gate but inside a configured lookback or under a configured low line
- **WHEN** the late-bolus or carb-undercount classifier judges the meal under that
  configuration
- **THEN** the context gate explains the rise and the classifier does not match,
  with silence reason `upstream_cause`
- **AND** under the default configuration the same meal still matches
