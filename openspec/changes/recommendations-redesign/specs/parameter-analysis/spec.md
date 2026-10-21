## MODIFIED Requirements

### Requirement: The basal analyzer stamps per-night glucose evidence on the night roster

For each night in a basal slot's night roster, the analyzer SHALL stamp, beside
the existing rate facts: `glucose_mean`, the mean of every CGM reading in the
half-open window [slot start, slot end); `glucose_entry` and `glucose_exit`,
the reading nearest each window boundary within the analyzer's staleness cap,
null when none qualifies; and `glucose_trace`, the night's CGM readings from 60
minutes before slot start through slot end as a sparse list of `{t, minute,
bg}` points — `t` the absolute wall-clock timestamp, `minute` relative to slot
start and negative across the lead, the case file's `detail.glucose` fields —
where a lead point before midnight carries the prior date in `t`. Per
slot, the analyzer SHALL stamp `roster_glucose_mean` unconditionally: the mean
of the per-night `glucose_mean` values, each roster night counting once, nights
with a null mean excluded, and null when no night has a mean — an empty roster
included. A roster night without usable in-window CGM SHALL serve null glucose
facts and SHALL remain in the roster. No safety verdict, membership decision, or
support floor SHALL change on account of glucose evidence. No route projects the
roster separately (ADR 547); the analysis answer serves it on the slot's evidence.

#### Scenario: A night's divergence is readable against the roster norm

- **WHEN** the analyzer stamps a slot whose roster nights carry in-window glucose
  means
- **THEN** each night's mean and the slot's roster-level mean are in the same
  units, the norm counting every night once

#### Scenario: A gappy night serves a null mean without leaving the roster

- **GIVEN** a roster night whose CGM sits only in the staleness-capped lead,
  with no reading inside the slot window itself
- **WHEN** the analyzer stamps glucose evidence
- **THEN** that night's `glucose_mean` is null and `roster_glucose_mean`
  excludes it
- **AND** `glucose_entry`, `glucose_exit` and `glucose_trace` follow their own
  rules — served where a qualifying reading exists, null or empty where none
  does
- **AND** the night remains in the roster and in every count it appears in
  today

#### Scenario: The last slot of the day reaches midnight

- **GIVEN** a roster night on the 23:30 slot
- **WHEN** the analyzer stamps glucose evidence
- **THEN** the window is [23:30, next-day 00:00): `glucose_mean` covers those
  readings and `glucose_exit` may resolve to the next day's 00:00 reading
- **AND** no slot's window is empty by construction

#### Scenario: The trace is drawable by the shipped trace path

- **WHEN** a roster night carries its CGM trace
- **THEN** the trace is a sparse list of `{t, minute, bg}` points — absolute
  wall-clock `t`, `minute` relative to slot start — spanning from 60 minutes
  before slot start through slot end
- **AND** for the midnight-adjacent slot, lead points carry the prior date in
  `t` rather than an inferred one

## ADDED Requirements

### Requirement: Every excluded basal night carries one analyzer-named reason

For each basal slot the analyzer SHALL stamp `excluded_night_reasons` beside
`excluded_night_count`: an object with exactly six integer keys, always all
present — `before_current_setting`, `below_range_or_suspended`, `above_range`,
`insulin_acting`, `carb_log` and `other` — in which every excluded night (a
source night of the slot absent from the slot's final estimate, the population
`excluded_night_count` counts) is counted exactly once, so the six values sum to
`excluded_night_count`.

An excluded night SHALL count as `before_current_setting` when it has a source
minute before the slot's setting-epoch cut and the slot's estimate did not pool
its pre-cut nights back in. Every other excluded night SHALL take the first of
these that any of its minutes in the slot meets, where its minutes are the
clean-window filter's own minutes in that slot on that night:
`below_range_or_suspended`, when a delivery segment covers the minute at zero rate
or as a manual or algorithm suspension, or the filter's glucose reading is below
the in-range window; `above_range`, when that reading is above the window;
`insulin_acting`, when bolus-only IOB at the Gate DIA is above the bolus-clear
threshold; `carb_log`, when a Carb log exclusion span covers the minute; and
`other`, when no delivery segment covers the minute, an excluded pump event is
within its margin, no glucose reading is within the staleness limit, or the slope
is untrustworthy or not flat. An excluded night none of whose minutes meets any of
these SHALL count as `other`.

Each rule predicate SHALL have one implementation, shared by the clean-window
filter and the reasons. The set of clean minutes, the estimate and its interval,
the night roster, `excluded_night_count`, `directional_support_count`, pooling
decisions, the supported-nights floor, `asserts_move`, statuses, caps and the Harm
signal SHALL be unchanged.

#### Scenario: Six causes land in six reasons and sum to the count

- **GIVEN** sixteen synthetic nights in one slot: three before the slot's setting
  cut, eight steady, one suspended at a low, one high, one under bolus insulin,
  one under a Carb log entry, and one rising steadily inside the range
- **WHEN** the analyzer runs without pooling
- **THEN** `excluded_night_reasons` counts 3 `before_current_setting` and 1 each of
  `below_range_or_suspended`, `above_range`, `insulin_acting`, `carb_log` and
  `other`
- **AND** the six values sum to the slot's `excluded_night_count` of 8

#### Scenario: A low minute outranks a high night

- **GIVEN** the same nights, with one glucose reading below range on the
  otherwise high night
- **WHEN** the analyzer runs
- **THEN** that night counts as `below_range_or_suspended` and `above_range` is 0

#### Scenario: Pooled pre-cut nights leave the setting reason

- **GIVEN** the same nights, with pooling admitting the slot's pre-cut nights
- **WHEN** the analyzer runs with pooling on
- **THEN** `before_current_setting` is 0 and the six values still sum to
  `excluded_night_count`


### Requirement: A carb-ratio block serves the meal runs its estimate counts

Each carb-ratio block SHALL serve `evidence.counted_runs`: every pooled meal run
of its roster, in roster order, with its time and its ratio. The I:C Setting
card's dots and its Meal runs count SHALL read that one list (ADR 523).

#### Scenario: The counted runs are the pooled runs

- **GIVEN** the `basal-and-carb-ratio-lower` QA case, whose whole-day block the
  engine stages a move for from eight pooled runs
- **WHEN** the analysis is read
- **THEN** the block's counted runs are those eight runs, with the ratio each run
  serves

## REMOVED Requirements

### Requirement: The basal analyzer names one reason for every excluded night

**Reason:** Its last scenario held the reasons through the basal night-evidence route, which is removed (ADR 547): the five-tab app never reads it.

**Migration:** Read "Every excluded basal night carries one analyzer-named reason", ADDED in this change: the same rule, read from the analyzer's own slot evidence.

