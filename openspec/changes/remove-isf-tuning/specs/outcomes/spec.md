## ADDED Requirements

### Requirement: A correction-factor Trial is judged on its outcomes alone

A correction-factor edit the wearer makes on the pump SHALL still be detected
and watched as a Trial (ADR 564 rule 4), because Harmonic watches every change
made on the pump, whether or not it proposed the change. The Trial SHALL be
judged on its target metrics through the same readiness a target edit uses. It
SHALL read no fasting-step population and no fasting-window readiness, because
Harmonic serves no correction-factor estimate. A Trial record retained before
ADR 564 SHALL read without error on every surface that lists Trials.

#### Scenario: An ISF-only edit on the pump

- **GIVEN** a settings read whose only change is the correction factor
- **WHEN** watched changes are detected
- **THEN** a correction-factor Trial is opened, with its target metrics
- **AND** its comparison serves no fasting steps and its readiness counts no
  fasting rest windows

#### Scenario: A retained correction-factor Trial

- **GIVEN** a retained `isf-all-*` Trial record
- **WHEN** the Trial roster, the Trials verification read and the watched change
  are served
- **THEN** each serves the Trial without error
