## ADDED Requirements

### Requirement: An over-treated low's fired rebound owns every High it reaches

When an eligible Low's over-treated-low judgment fires, that Low SHALL own every
real CGM High run that begins after its nadir and at or before its guarded rebound
terminal, whether the High shares the Low's Episode or falls in a later one. A #155
synthesized rebound High-moment SHALL own through its own span, from the crash
nadir to the guarded terminal. A Low whose judgment does not fire owns nothing:
under its bar, owned by an announced meal, or refuted by a `no` answer. A High run
that begins after the terminal SHALL be judged on its own. Ownership SHALL be read
from the shared evaluation's own fired judgment, and no consumer SHALL re-judge it.

An owned High SHALL attribute neither Missed / unannounced meal nor Meal bolus fell
short, and SHALL contribute no candidate or impact price to either. Both retained
verdicts SHALL be non-matches with silence reason `upstream_cause`. When the
context gate already explains the rise, the gate's verdict SHALL be kept;
otherwise the detail SHALL name the owning Low's nadir value and time. Both
classifiers SHALL judge the context gate under the scenario configuration they
were given.

The owning Episode's scored span SHALL reach the later of its guarded terminal and
the end of every High run it owns, and SHALL still stop at the next Episode that
bears a Lever. An owned High SHALL NOT count toward the highs "no cause detected"
total, even when its own Episode draws no Lever. It SHALL remain a non-driver
Occurrence with no attributed Lever. No staging predicate, cap, support floor,
segmentation rule, gate lookback, rebound horizon or rebound bar SHALL change.

#### Scenario: A slow rebound that splits off is not a missed meal

- **GIVEN** a synthetic window in which, on several days, a sub-70 Low rebounds
  with no bolus into a High that crosses 250 mg/dL more than 90 minutes after the
  Low run ends and before the guarded terminal
- **WHEN** the shared evaluation runs
- **THEN** each rebound is attributed Over-treated low exactly once
- **AND** no Episode attributes Missed / unannounced meal or Meal bolus fell short
  to the High, whose own Episode is silent with `upstream_cause`

#### Scenario: A near-low rebound inside its own Episode is not a missed-meal candidate

- **GIVEN** a 72 mg/dL nadir that rebounds into a High inside the same Episode
- **WHEN** the shared evaluation runs
- **THEN** the Episode keeps Over-treated low
- **AND** no missed-meal match, candidate or impact price remains for that High

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

#### Scenario: An owned High is explained, not uncaused

- **GIVEN** a window whose only High is owned by an over-treated Low and sits in an
  Episode that draws no Lever
- **WHEN** the exposures producer tallies the highs family
- **THEN** that High is not counted as uncaused and carries no attributed Lever
