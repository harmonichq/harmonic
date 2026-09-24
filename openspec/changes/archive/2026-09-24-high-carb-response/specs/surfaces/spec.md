## ADDED Requirements

### Requirement: High-carb response evidence is coherent with its selected population

High-carb sequence case files SHALL add the versioned response described in the design's Public interface section. The selected scope, period, summary, three aggregate comparisons, eligible identities and candidate/reference assignment SHALL originate in the same existing sequence evaluation. Curves SHALL use the corresponding false-low-filtered observed CGM retained by the preparation snapshot. The standalone aggregate report, sequence construction, quintiles, eligibility, findings, ownership, priorities and setting recommendations SHALL retain their existing behavior. Repeat eating SHALL retain its current transport and chart.

The full source-window eligible population SHALL supply the response cohorts, independent of the currently selected clock window. Candidate membership SHALL use the retained candidate flag, not episode ownership or current-window membership. Cohort routed counts SHALL equal their eligible membership counts. The response SHALL carry its own source-window bounds and selected scope, distinct from the window-specific occurrence summary. Missing or inconsistent source metadata SHALL produce the existing inconsistent-projection failure; it SHALL NOT trigger frontend reconstruction or a second evaluation.

#### Scenario: A scoped occurrence roster does not redefine the comparison

- **GIVEN** a supported high-carb finding with eligible candidate and reference sequences
- **WHEN** a clock window selects only witnessed occurrences
- **THEN** its occurrence roster retains current membership behavior
- **AND** the response retains the same source comparison population and labels its source-window scope independently

#### Scenario: False-low exclusion cannot change between evidence layers

- **GIVEN** confirmed false-low readings in a sequence source window
- **WHEN** its comparison metadata and response are prepared
- **THEN** the new response uses the same filtered observations as the source evaluation
- **AND** the existing aggregate-only report endpoint and detector verdicts retain their current contract

### Requirement: Sequence response curves use an explicit observed end anchor

Every response trace SHALL be aligned to the retained sequence end, meaning the final carb-bearing bolus timestamp, labeled `End of eating sequence`. Observations SHALL be confined to that sequence's retained half-open eligible interval, without padding, interpolation, carrying values across gaps or extending beyond the available source data. Point aggregation SHALL call the existing event-comparison cohort projector with its existing five-minute bins, one observation per sequence per bin, quantiles and point-support rules. Detector evidence floors and point-support grades SHALL remain separate concepts.

For a selected four- or six-hour post-sequence interval, the response axis SHALL run from zero to that interval's declared horizon. The response point grid SHALL stop one existing five-minute grid step before the axis endpoint, so nearest-bin rounding cannot place an observation at the excluded endpoint. For a selected in-sequence interval, the axis SHALL extend from the earliest retained sequence-start offset rounded outward to the existing grid through five minutes after the end anchor, with the response point grid ending at zero; each sequence contributes only inside its own retained interval. The caption SHALL explicitly say `During eating`, and SHALL NOT label that response as an after-eating result. Empty bins SHALL remain unavailable; a supported aggregate SHALL NOT manufacture a supported curve point.

#### Scenario: Different eating durations do not become invented trajectories

- **GIVEN** eligible sequences with different start times relative to their ends
- **WHEN** an in-sequence comparison is projected
- **THEN** their observations align at their actual sequence ends and have no samples outside each retained interval
- **AND** the chart identifies that it describes eating itself, with sample support allowed to vary over time

#### Scenario: A missing follow-up point remains missing

- **GIVEN** a cohort with insufficient observations at an aligned point
- **WHEN** its response is rendered
- **THEN** no median is invented for that point and the existing support/gap treatment is used
- **AND** no value beyond the retained interval endpoint is drawn

### Requirement: High-carb sequence reuses the Pattern response presentation

The High-carb stage and fullscreen SHALL use the existing response renderer with observed glucose in mg/dL over event-relative time, the target range, highest-carb and reference cohort curves, existing uncertainty/support treatment and accessible pointer/keyboard readout. Cohort names SHALL read `Highest-carb fifth` and `Other sequences`, using the existing matched and comparison visual roles without implying causal matching. A compact legend SHALL state cohort sample sizes and the comparison scope. The existing chart-range contract SHALL include the new cohort glucose; only the chart drawing a selected trace may widen for that trace.

The server-owned stage headline SHALL concisely name the glucose response: `Glucose after high-carb eating` for a post-sequence interval, and an equally concise during-eating title for an in-sequence interval. The full coherent comparison summary, including its percentages, comparison and sample counts, SHALL remain accessible in supporting detail. The title and summary timing SHALL agree with the curves. All three existing aggregate periods, their TIR and glucose-spread values, units, cohort counts and unavailable states SHALL remain accessible as supporting detail in the same finding; they SHALL NOT be connected into a purported glucose trace. The default presentation SHALL not require decoding Q1–Q4 or Q5. Quantile boundaries, if shown, SHALL remain user-relative descriptions rather than carb limits.

The same renderer SHALL supply the All charts and Findings miniature ranks with the existing inert miniature policy. Repeat eating and the other response charts SHALL preserve their existing presentation. No duplicate chart implementation, new charting dependency or new route SHALL be introduced.

#### Scenario: Opening the finding answers the reader's question

- **GIVEN** a supported post-sequence comparison with different observed glucose responses
- **WHEN** the reader opens High-carb sequence
- **THEN** the response chart shows the magnitude and duration of the observed difference, names both groups and the end anchor, and shows the correct period and source scope
- **AND** the summary agrees with that comparison without asserting that carbs caused the difference

#### Scenario: Aggregate information survives the new primary chart

- **WHEN** the reader inspects High-carb sequence supporting detail
- **THEN** all three served aggregate periods remain available with their units, counts and unavailable states
- **AND** a selected in-sequence comparison is explicitly distinguished from after-eating comparisons

### Requirement: High-carb response retains the shipped interaction and evidence boundary

Row pointer and keyboard activation, All charts entry, selected occurrence identity, Clear trace, fullscreen return/focus, clock selection and existing typed recovery SHALL survive the revision. Selecting an eligible roster occurrence SHALL expose and overlay only that occurrence's observed glucose within the same response interval and anchor. The original sequence metadata SHALL remain available. Unknown or out-of-roster selections SHALL retain the existing unavailable-selection result. Sequence detail SHALL NOT add a Day handoff.

The existing frozen sequence stories SHALL be amended only for the approved High-carb visual replacement, retaining their semantic assertions and the Repeat eating branches. Every new browser behavior SHALL be attached to the existing hand-listed suite and ledger. Published fixtures and rendered evidence SHALL be generator-owned synthetic data. Validation SHALL include both shells, the prescribed viewport matrix, source/transport parity, and the repository's affected browser ledgers.

#### Scenario: Fullscreen return keeps the reader's place

- **GIVEN** a selected High-carb sequence occurrence and clock window
- **WHEN** the reader opens fullscreen and closes it
- **THEN** the same sequence, window and originating focus remain selected, with the same observed response evidence

#### Scenario: A malformed response cannot masquerade as a result

- **GIVEN** a missing, invalid, inconsistent or stale response
- **WHEN** the chart attempts to display it
- **THEN** the existing explicit unavailable/error or stale-refresh behavior runs
- **AND** it does not draw a substitute curve or silently fall back to the retired aggregate-dot chart
