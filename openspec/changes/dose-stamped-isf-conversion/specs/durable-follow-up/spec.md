## ADDED Requirements

### Requirement: A retained comparison keeps the ISF it was captured with

The system SHALL satisfy the following:

A comparison context captured before conversions read the dose-stamped ISF
retains one programmed ISF, and SHALL keep executing every conversion with that
value, so its result neither moves nor reads as an unsupported retained
execution. A context captured after SHALL record that it converts with the
dose-stamped ISF, SHALL carry no ISF value, and SHALL convert each meal with the
dose-stamped rule over the settings snapshots before its cutoff. Both SHALL read
without error.

#### Scenario: A comparison retained before the change reads the same after it

- **GIVEN** a Trial and a Focus whose comparison contexts were captured with a
  programmed ISF before the change
- **WHEN** each comparison is read after the change
- **THEN** each is available and serves the same result it served before

#### Scenario: A comparison captured after the change carries no ISF value

- **GIVEN** a Trial ended after the change
- **WHEN** its comparison context is captured
- **THEN** the context records the dose-stamped ISF source and no ISF value, and
  the store accepts it
