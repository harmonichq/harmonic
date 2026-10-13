## MODIFIED Requirements

### Requirement: Store-facing report construction shares Diagnose's source window

The eating-sequences module SHALL expose
`build_report(boluses, cgm, carb_log, *, window_start, window_end, config)` as a
pure event-list entry returning `EatingSequenceReport`. The served report SHALL be
the report of the scenario evaluation behind the exposures payload, carried on that
payload as `sequence_report`, so that it and the sequence evidence beside it are one
evaluation (ADR 488). No served path SHALL rebuild the report from the store with
other inputs. That evaluation reads basal solely to derive `span_end`, never as a
modeling input. Its `span_end` SHALL be the latest basal-or-CGM timestamp, and its
start SHALL be `span_end - timedelta(days=window_days)`, matching `build_scenarios`.
It SHALL slice the bolus, CGM and Carb-log streams to `[start, span_end]` (both ends
inclusive, the same predicate as Scenario's `_slice`), and SHALL read only the
Carb-log entries already recorded at `span_end`. `build_report` SHALL treat the
lists it receives as complete window content and SHALL construct no sequence from
an event outside `[window_start, window_end]`.

#### Scenario: Store wrapper reports the same fixed source bounds as Diagnose

- **GIVEN** a store with CGM history
- **WHEN** the exposures payload is built with the fixed Diagnose window
- **THEN** its report window ends at the latest basal-or-CGM timestamp
- **AND** its start is exactly thirty days earlier

#### Scenario: A basal delivery later than the last CGM reading sets the window end

- **GIVEN** a store whose latest basal delivery is later than its latest CGM reading
- **WHEN** the exposures payload is built
- **THEN** its report window ends at that basal delivery

#### Scenario: Events before the source window build no sequence

- **GIVEN** otherwise qualifying bolus, CGM, and Carb-log events before the source window
- **WHEN** the served report is prepared
- **THEN** those events produce no eating sequence

#### Scenario: A carb entry logged after the window end excludes no sequence

- **GIVEN** a Carb-log entry inside a highest-carb sequence's selected period, recorded after the latest reading
- **WHEN** the Finding case files are prepared
- **THEN** the served report and the high-carb sequence evidence count the same sequences
- **AND** neither excludes that sequence for Carb-log contamination
