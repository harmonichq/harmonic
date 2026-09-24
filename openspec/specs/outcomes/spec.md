# Outcomes

## Purpose

The outcomes layer surfaces two stories side by side: *how the user is doing right now* (the glycemic panel and clean rates over a selected flat window) and *whether a recent setting or behavior change is working* (a watched Trial or Focus, and trend series showing pre-change and post-change. It is independent of Harmonic's own analysis; it reads the glycemic data and the scenario engine's own lever attribution to show observed glycemic quality and whether changes are tracking in the right direction.

## Requirements

### Requirement: Outcome summary reports glycemic metrics and derived clean rates over a single flat window.

The system SHALL satisfy the following:

The summary is one snapshot over a user-selected window (14, 30, or 90 days) — not a trend, not indexed to prior windows. It reports two layers. *Metrics* are the 2019 consensus glycemic panel: Time in Range (70–180 mg/dL), Time Below Range at two levels (<70 and <54), Time Above Range at two levels (>180 and >250), mean glucose, GMI (A1c-analog), and coefficient of variation. The panel is honest about data quality: when coverage falls below the consensus gate (≥14 days AND ≥70% CGM active), it computes over the *real* span and labels the shortfall as "12 days @ 61%" rather than fabricating a representative number. *Clean rates* are derived "wins" — the fraction of each behavioral exposure (meals, lows, correction clusters, highs) that drew *no* negative lever attribution, inverse to the pattern rates. Clean rates carry Wilson confidence intervals so a thin meal count surfaces a wide range instead of a false precision.

#### Scenario: Outcome summary reports glycemic metrics and derived clean rates over a single flat window.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Watching a change means auto-detecting a Trial or pinning a Focus, moving through phases until resolution.

The system SHALL satisfy the following:

A **Trial** is a pump-programmable setting (basal slot, ISF, I:C, target, or whole-profile) the user has changed and the system auto-detects from the settings snapshot diff or dense feed. A **Focus** is a behavioral lever the user pins by hand. Both enter a *Maturing* phase while post-change data accrues, then *complete* and are ready to judge. The app enforces exactly one active watched change: a Trial takes precedence, and launching one mid-Focus preempts and drops the Focus (the drop is real — the user re-pins if the intent still holds). Resolution happens when the Trial completes post-data accrual or when the user resolves the Focus manually.

#### Scenario: Watching a change means auto-detecting a Trial or pinning a Focus, moving through phases until resolution.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Verdict availability is gated on data accrual, not model sufficiency.

The system SHALL satisfy the following:

A Trial is *Maturing* while the target metric's post-change **data-day** accrual is incomplete — not calendar days, but actual data days. An I:C trial (target = post-meal arc) matures on meal days; a TIR trial on CGM days. A meal-less stretch keeps the Trial maturing rather than prematurely trusting a delta the data cannot support. The Trial matures over a **fixed 14-day window**, independent of any trend or analysis window a caller selects, and maturity accrues only within the Trial's own bounded period (from the change through 14 days after it) — data landing after that period cannot complete it, and every surface reads the same count for the same change. Once that fixed window's worth of post-change data days are observed, the Trial moves to *complete* and is ready for a before/after read — the verdict that the change helped (or didn't) can only be formed then. A Focus has no data gate; its adherence is tracked by re-running the same behavioral detector that raised the lever, and its outcome reads off the existing clean-rate series.

#### Scenario: Verdict availability is gated on data accrual, not model sufficiency.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Trend series show rolling-window glycemic and behavioral movement, with documented uncertainty bounds.

The system SHALL satisfy the following:

The trend is a sequence of equal-width windows (index-aligned oldest to newest) tiling the full selected span. It is `summarize_trend`'s payload, rendered by the CLI's `outcomes-trend` command; `/api/outcomes/trend` serves none of these series, only the watched change. For each window, the payload carries one row per glycemic metric (TIR, TBR, post-meal arc peak/nadir) and one per behavioral exposure (clean rate of meals, lows, etc.). A reader may see that "pre-bolusing improved by 2 meals" or "overnight lows trended down" — the relative direction and the series shape. What a reader *cannot* infer: that the absolute glycemic target is now "good" (no baseline to compare against), or that a setting change *caused* the observed movement (correlation, not causation). The app stamps this limitation explicitly: "Observed movement does not establish that the setting caused it."

#### Scenario: Trend series show rolling-window glycemic and behavioral movement, with documented uncertainty bounds.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Every retained change record ends by one rule

At every reconcile, after recording the changes it newly detects, the system
SHALL evaluate every retained Trial record whose saved ending carries no kind.
It SHALL evaluate them oldest detected change first, then by record id,
including the admission frontier record. For each record the system SHALL
record the first of these that applies:

- `reverted`, effective at the detector's reversal of the record's change;
- `superseded`, effective at the earliest change the reconcile detects that is
  strictly later than the record's change, is not in the record's own Edit, and
  is earlier than the end of its watch window, which is the change plus 28 days;
- `expired_unreviewed`, effective at the end of the watch window, once the
  reconcile's data instant has reached it.

An Edit is the existing grouping of retained records that landed within a day
of each other, as read over the retained records of the reconcile that records
the ending. The rule SHALL read it from that one grouping and SHALL NOT add
another. A later regrouping SHALL NOT change a saved ending. A record meeting none of these SHALL stay open. The rule SHALL NOT replace a
saved ending, reopen an ended record, promote a record to the watch, move the
admission frontier, change a Focus preemption, or change a recorded Plan's
receipt or verdict. It SHALL NOT add an ending kind or an open state. An ending's
recorded time SHALL be the reconcile's time.

#### Scenario: Changes older than the watch window all end on one reconcile

- **GIVEN** a synthetic store with four detected correction-factor changes, each
  more than 28 days after the one before, and no retained record yet
- **WHEN** it is reconciled once through the public reconcile path
- **THEN** each of the four records ends `expired_unreviewed`, effective 28 days
  after its own change
- **AND** no retained record is left without an ending

#### Scenario: A later change inside the window supersedes an older record

- **GIVEN** two detected carb-ratio changes nine days apart, both first recorded
  by one reconcile after both windows have passed
- **WHEN** the reconcile runs
- **THEN** the older record ends `superseded`, effective at the later change's
  detected time
- **AND** the later record ends `expired_unreviewed` at the end of its own window

#### Scenario: A later change of another setting supersedes too

- **GIVEN** a detected correction-factor change and a detected carb-ratio change
  ten days later, both first recorded by one reconcile
- **WHEN** the reconcile runs
- **THEN** the correction-factor record ends `superseded`, effective at the
  carb-ratio change's detected time, as the live watch does

#### Scenario: A multi-slot edit's records never supersede each other

- **GIVEN** a detected basal edit that moves the 01:00 and 03:00 slots on one
  day, and a detected change to the 05:00 slot ten days later, all first
  recorded by one reconcile after every window has passed
- **WHEN** the reconcile runs
- **THEN** the 01:00 and 03:00 records both end `superseded`, effective at the
  05:00 change's detected time
- **AND** neither ends at the other's detected time

#### Scenario: A change that settles later does not reopen an ending

- **GIVEN** a correction-factor profile switch on 05-11 at 20:00, a carb-ratio
  edit known only from doses stamped from 05-12, and a target profile switch on
  05-13 at 06:00
- **WHEN** reconciles run at 05-13 07:00 and 05-13 19:00
- **THEN** the first ends the correction-factor record `superseded`, effective
  05-13 06:00, when the two switches sit in separate Edits
- **AND** after the second, the carb-ratio change has settled and the three
  records read as one Edit, and the correction-factor ending is unchanged

#### Scenario: A reversal comes before supersession

- **GIVEN** an open retained record whose change the detector reports reverted,
  and a later detected change inside its window after the reversal
- **WHEN** a reconcile runs
- **THEN** the record ends `reverted`, effective at the reversal

#### Scenario: A record inside its window stays open

- **GIVEN** a retained record whose watch window has not passed at the
  reconcile's data instant, with no later detected change and no reversal
- **WHEN** a reconcile runs
- **THEN** the record keeps an ending with no kind

#### Scenario: A second reconcile changes no saved ending

- **GIVEN** a store whose records were ended by one reconcile
- **WHEN** a second reconcile runs over the same and newer inputs
- **THEN** every saved ending, its effective time, recorded time and assessment
  are unchanged

#### Scenario: A Plan receipt is unchanged by the ending rule

- **GIVEN** a recorded Plan reconciled to an older retained record, with later
  detected changes that end that record
- **WHEN** the reconcile runs
- **THEN** the Plan's receipt and both records' reconciliation fields are the
  ones the reconcile recorded before this change

### Requirement: An ending's saved assessment reads evidence only up to its ending instant

Every Trial ending a reconcile records (`reverted`, `superseded`,
`expired_unreviewed`) SHALL save its assessment with its data cutoff equal to the
ending's effective instant. When the record's retained comparison context is
available and its source pump read was captured after that instant, the saved
assessment SHALL be unavailable with reason `context_after_ending`. No
comparison SHALL be computed for it. A context whose source pump read was
captured at or before the instant SHALL be used as it is. The unavailable
assessment SHALL be built by the comparison's own unavailable envelope, with
the record's retained context and that reason. A saved After period that ends
at a next relevant setting run the comparison reads at or before the cutoff
SHALL carry the end reason `next_relevant_setting_change`, including when that
run starts exactly at the cutoff. A pump read captured at the change is such a
run. A later change known only from dose-stamped boluses is not a settled run
at the cut. Its period, like a period with no next relevant change, SHALL keep
`data_tail`, and the record's ending SHALL still be `superseded`. The
comparison's periods, values and readiness criteria, and the record's retained
context, SHALL NOT change.

#### Scenario: An expiry recorded after the fact reads data to its own instant

- **GIVEN** a retained record whose watch window ended three days before the
  reconcile's data instant, with a retained context from a pump read before the
  window ended
- **WHEN** the reconcile records its `expired_unreviewed` ending
- **THEN** the saved assessment's data cutoff is the end of the watch window, not
  the reconcile's data instant

#### Scenario: A context read after the ending leaves the assessment unavailable

- **GIVEN** an older detected change first recorded by a reconcile whose latest
  pump read is later than the change's ending instant
- **WHEN** the reconcile records its ending
- **THEN** the saved assessment is unavailable with reason `context_after_ending`
- **AND** its data cutoff is the ending instant

#### Scenario: A pump-read supersession says its period ends at that change

- **GIVEN** two correction-factor changes nine days apart, each captured by a pump
  read at the change, one pump read before both, and one reconcile after both
  windows have passed
- **WHEN** the reconcile records the older record's `superseded` ending and the
  later record's `expired_unreviewed` ending
- **THEN** the older record's saved After period ends at the later change's time
  with end reason `next_relevant_setting_change`
- **AND** the later record's saved After period ends with end reason `data_tail`

#### Scenario: A dose-detected supersession reads data through that change

- **GIVEN** two carb-ratio changes nine days apart, known only from dose-stamped
  boluses, one pump read before both, and one reconcile after both windows have
  passed
- **WHEN** the reconcile records the older record's ending
- **THEN** the older record ends `superseded` at the later change's time
- **AND** its saved After period ends at that time with end reason `data_tail`

#### Scenario: A context read before the ending is used

- **GIVEN** an older record whose retained context comes from a pump read captured
  before the later change that supersedes it
- **WHEN** the reconcile records its `superseded` ending
- **THEN** the saved assessment is computed with that context and its After
  period reads data to the superseding change's instant
