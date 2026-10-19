## ADDED Requirements

### Requirement: A comparison serves a period with no readings yet as an empty period

A setting comparison SHALL be available when either of its periods has readings
(ADR 554). A period with none yet SHALL be served as an empty period: no
contributing meals, a trace of no episodes, and each outcome row's value for it
null with reason `no_readable_outcome` and no direction claimed. A comparison
whose periods both have no readings SHALL be unavailable with reason
`no_readable_period_evidence`.

#### Scenario: The hours after a change serve the before period beside an empty after

- **GIVEN** a carb ratio change read before its block has a reading after it
- **WHEN** its comparison is read
- **THEN** it is available, the before period served in full
- **AND** the after period has no meals, a trace of no episodes, and every row's
  after null with reason `no_readable_outcome`

## MODIFIED Requirements

### Requirement: A retained comparison context stays readable across Harmonic updates

A retained comparison context SHALL carry its context version, the comparison's
policy stamp and the scenario configuration, and SHALL NOT carry a hash of the
installed source files. The comparison SHALL refuse a retained context with
reason `unsupported_retained_execution` only when its context version or policy
stamp differs from the running comparison's, or, for a Focus, which executes its
scenario configuration, when a knob the running configuration reads is missing
from the retained configuration or holds another value there. A Trial's
comparison executes no scenario configuration, so its retained configuration
SHALL NOT refuse it. A knob a Focus's retained configuration carries that the
running configuration no longer has SHALL be ignored, and the Focus's comparison
SHALL execute the retained values of the knobs it reads (ADR 554). A context saved with a
source-file hash SHALL be read with that field ignored. The store SHALL accept
an available comparison context without a source-file hash.

#### Scenario: A context captured before an unrelated code change is read

- **GIVEN** a retained context whose source-file hash differs from what the
  running build would compute, or that carries none
- **WHEN** the record is read with a Retained context reassessment
- **THEN** the reassessment is available

#### Scenario: A Trial saved by an earlier configuration is read

- **GIVEN** a Trial whose retained configuration a release before #503 and #553
  saved: the knobs since retired, and none added since
- **WHEN** the record is read with a Retained context reassessment
- **THEN** the reassessment is available, and equals the one a fresh context
  gives

#### Scenario: A Focus saved before a knob was retired is read

- **GIVEN** a Focus whose retained configuration carries a knob the running
  configuration no longer has, every other knob as the running configuration
  holds it
- **WHEN** the record is read with a Retained context reassessment
- **THEN** the reassessment is available, and equals the one its context would
  give without the retired knob

#### Scenario: A changed comparison policy is still refused

- **GIVEN** a retained context whose policy stamp differs from the running
  comparison's, or a Focus whose retained configuration holds another value
  for, or lacks, a knob the running configuration reads
- **WHEN** the record is read with a Retained context reassessment
- **THEN** it is unavailable with reason `unsupported_retained_execution`
