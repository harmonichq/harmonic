## ADDED Requirements

### Requirement: Store-facing report construction shares Diagnose's source window

The eating-sequences module SHALL expose
`build_report(boluses, cgm, carb_log, *, window_start, window_end, config)` as a
pure event-list entry returning `EatingSequenceReport`. It SHALL also expose
`build_eating_sequence_report(store, *, window_days=30, now=None)`, which reads
BolusEvent, CgmReading, CarbEntry, and basal streams without writing and passes only
the first three to `build_report`. It SHALL read basal solely to derive `span_end`,
never as a modeling input. Its `span_end` SHALL be the latest basal-or-CGM timestamp,
its `now` SHALL be supplied `now` or `span_end` or `datetime.now()`, and its start
SHALL be `now - timedelta(days=window_days)`, matching `build_scenarios`. After that
derivation it SHALL slice all three modeling streams to `[start, now)` exactly as
`build_scenarios` slices its streams. `build_report` SHALL treat the lists it receives
as complete window content and SHALL construct no sequence from an event outside
`[window_start, window_end)`.

#### Scenario: Store wrapper reports the same fixed source bounds as Diagnose

- **GIVEN** a store with CGM history and no explicit `now`
- **WHEN** the store-facing report builder runs with the fixed Diagnose window
- **THEN** the report window ends at the latest basal-or-CGM timestamp
- **AND** its start is exactly thirty days earlier

#### Scenario: A basal delivery later than the last CGM reading sets the window end

- **GIVEN** a store whose latest basal delivery is later than its latest CGM reading
- **WHEN** the store-facing report builder runs without an explicit `now`
- **THEN** the report window ends at that basal delivery

#### Scenario: Events before the source window build no sequence

- **GIVEN** otherwise qualifying bolus, CGM, and Carb-log events before the source window
- **WHEN** the store-facing report builder prepares the report
- **THEN** those events produce no eating sequence

### Requirement: High-carb findings are supported aggregate associations only

For each scope and period, the detector SHALL compare Q5 with Q1–Q4. It SHALL
surface a high-carb finding only when both cohorts are supported and Q5 has lower
median TIR or higher median glucose SD. An evening candidate SHALL be headline
eligible only when both that evening comparison and its pooled counterpart clear the
floor. Among supported clinically legible candidates, it SHALL choose the largest
absolute Q5 TIR drop in percentage points, breaking ties by shorter period and then
pooled before evening. Without a supported candidate its status SHALL be
`insufficient` and its finding null. The summary SHALL be a fixed template using only
served scope, period label, the two median TIR values, and n; it SHALL state an
association and SHALL NOT state cause, a carb limit, or a setting change.

#### Scenario: Higher-carb cohort with worse supported TIR receives the headline

- **GIVEN** supported Q5 and Q1–Q4 post-period cohorts where Q5 median TIR is lower
- **WHEN** the detector builds the report
- **THEN** that comparison is supported and the report finding is non-null
- **AND** its summary is an aggregate association from the served values

#### Scenario: A better high-carb cohort does not produce a finding

- **GIVEN** supported cohorts where Q5 has no lower median TIR and no higher median glucose SD
- **WHEN** the detector builds the report
- **THEN** the report has no finding

### Requirement: Served eating-sequence evidence is generated and parity-checked

The repository SHALL commit `frontend/__fixtures__/eating-sequence-report.json` only
when `scripts/gen_eating_sequence_fixtures.py` produces it from deterministic
synthetic event streams through `build_report`. The fixture SHALL carry
`_generated_by` and `_note`, exercise a supported Q5-versus-Q1–Q4 comparison and a
non-null finding, and the generator's `--check` SHALL byte-compare it. A test SHALL
prove the committed JSON equals `build_report` over the builder streams and carries
the provenance pair.

#### Scenario: Generated populated fixture remains coherent with the analyzer

- **WHEN** the fixture parity test and generator check run
- **THEN** the committed JSON equals the analyzer-built report, has both provenance
  fields, and retains a populated high-carb finding
