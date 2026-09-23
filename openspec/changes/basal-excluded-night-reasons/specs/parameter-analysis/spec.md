## ADDED Requirements

### Requirement: The basal analyzer names one reason for every excluded night

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
signal SHALL be unchanged. The night-evidence projection SHALL copy
`excluded_night_reasons` verbatim, SHALL fail closed when a payload lacks it, and
SHALL derive nothing.

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

#### Scenario: The night-evidence payload carries the analyzer's reasons

- **WHEN** the night-evidence endpoint serves a slot
- **THEN** its `excluded_night_reasons` equals the analyzer row's
- **AND** a payload whose analyzer row lacks `excluded_night_reasons` is refused as
  incomplete rather than served without it
