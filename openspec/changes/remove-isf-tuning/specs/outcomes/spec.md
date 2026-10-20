## ADDED Requirements

### Requirement: A correction-factor Trial shows its outcomes and advises nothing

A correction-factor edit the wearer makes on the pump SHALL still be detected
and watched as a Trial (ADR 564 rule 4), because Harmonic watches every change
made on the pump, whether or not it proposed the change. The Trial SHALL serve
what a target edit's Trial serves: In range as its target metric, the generic
coverage readiness, and each outcome's before, after, interval and assessment
state, which the result reads as better, worse or unclear. It SHALL serve no
recommendation, direction or advice to keep, revert or change the correction
factor, and no Queue card or guidance concern SHALL follow from its result:
the wearer decides what to do with it. It SHALL read no fasting-step population
and no fasting-window readiness, because Harmonic serves no correction-factor
estimate. A Trial record retained before ADR 564 SHALL read without error on
every surface that lists Trials.

#### Scenario: An ISF-only edit on the pump

- **GIVEN** a settings read whose only change is the correction factor
- **WHEN** watched changes are detected
- **THEN** a correction-factor Trial is opened with In range as its target
  metric, and its readiness counts coverage-qualified informative dates
- **AND** its comparison serves no fasting steps
- **AND** once it matures, its result is the target metric's assessment state
  and nothing about the correction factor is recommended

#### Scenario: A matured correction-factor Trial queues nothing

- **GIVEN** a matured correction-factor Trial whose In range worsened
- **WHEN** guidance is served
- **THEN** no candidate concerns the correction factor

#### Scenario: A retained correction-factor Trial

- **GIVEN** a retained `isf-all-*` Trial record
- **WHEN** the Trial roster, the Trials verification read and the watched change
  are served
- **THEN** each serves the Trial without error
