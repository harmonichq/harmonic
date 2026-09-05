## MODIFIED Requirements

### Requirement: Eating-sequence reporting is outside the tuning and safety paths

The eating-sequence report SHALL be a separate report contract, not an extension
of `AnalysisResult`. Neither detector nor report contract SHALL stage a Plan
item, feed the Consolidated profile or a deliverable schedule, create a
`TuningLever`, import `safety.py`, or use a fixed carb cutoff. Supported associations
MAY supply the two behavioral levers and their observed-impact Priority under the
behavioral-layer requirements; this does not create a setting recommendation.
The fixed numerical values in this capability SHALL be limited to the pinned
definition and data-quality gates and the 70–180 mg/dL TIR convention.

#### Scenario: An aggregate association cannot become a pump-setting move

- **WHEN** an eating-sequence report has supported adverse aggregates
- **THEN** its report remains aggregate association evidence and its behavioral finding remains non-staging
- **AND** it does not create a Plan, a deliverable schedule, a `TuningLever`,
  or a safety-path judgment

## ADDED Requirements

### Requirement: Sequence findings share one eligible occurrence population with their report

The system SHALL derive the aggregate report and identity-bearing sequence evidence
from one evaluation of the pinned source window, sequence construction, quintiles,
period eligibility and detector headline selection. The aggregate report SHALL retain
its existing public shape and record-level exclusion. Behavioral evidence SHALL
carry stable sequence identities and their member pump events separately.

High-carb recurrence opportunities SHALL be qualifying sequences in the chosen
comparison scope and period, with Q5 as candidate occurrences. Repeat-eating
opportunities SHALL be qualifying single-window and three-plus-window sequences in
the chosen comparison quintile and period; two-window sequences SHALL remain
comparison-matrix description only. Both reference and exposed cohorts SHALL have
at least eight qualifying sequences before candidates are admitted. A sequence
excluded from the selected period SHALL enter neither k nor n. The selected
window, comparison, population noun, counts and outcome interval SHALL be served.

#### Scenario: Seven in either cohort withholds the candidate
- **GIVEN** synthetic sequences with seven qualifying exposed sequences and eight reference sequences, or eight exposed and seven reference
- **WHEN** the public behavioral evaluation and findings projection run
- **THEN** neither configuration creates the unsupported sequence Pattern
- **AND** eight in both cohorts with an adverse comparison admits candidate evidence

#### Scenario: Sequence identity survives several episode members
- **GIVEN** one qualifying sequence whose stable pump-event membership covers several episode groups
- **WHEN** its episode members are evaluated and projected
- **THEN** they refer to one sequence occurrence and one recurrence opportunity
- **AND** excluded and two-window descriptive rows cannot inflate the candidate count
