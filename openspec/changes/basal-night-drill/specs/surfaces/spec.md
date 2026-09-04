## ADDED Requirements

### Requirement: The basal slot panel drills into its steady nights

The Diagnose basal slot panel SHALL render, beneath its numbers-and-staging
block, a roster of the slot's steady nights through the shared occurrence-roster
mechanism: three groups keyed on the served per-night sign — ran above the
programmed rate, ran below it, ran as set — each header carrying its served
count, one button row per night printing that night's date, delivered against
programmed rate, and in-slot glucose mean, and one count line for the served
excluded-night count. Excluded nights SHALL NOT render as rows. The roster SHALL
read the same served night-evidence payload the basal evidence tile holds for
that slot and SHALL request it no second way. The panel SHALL derive no
direction, floor, threshold or safety verdict, and the numbers-and-staging block
SHALL render exactly as shipped. The panel SHALL NOT repeat the served headline.
Correction factor and carb ratio panels SHALL be unchanged.

#### Scenario: The roster groups nights by the served sign

- **WHEN** the reader opens a basal slot whose night-evidence payload carries
  nights with signs `1`, `-1` and `null` and a nonzero excluded-night count
- **THEN** the panel renders three group headers whose counts equal the served
  number of nights of each sign
- **AND** each night row prints the served date, delivered and programmed rate,
  and in-slot glucose mean
- **AND** one line prints the served excluded-night count and no excluded night
  renders as a row
- **AND** the Current / Estimate / Recommended block, its hedges, the support
  count and the staging control render exactly as before the roster existed

#### Scenario: The roster waits for the tile's payload

- **WHEN** the slot's night-evidence payload has not arrived or is marked stale
- **THEN** the roster area prints the panel's existing loading or unavailable
  state
- **AND** the panel issues no request of its own for that payload

### Requirement: Selecting a night draws its trace and its facts

Selecting a night in the basal slot panel's roster SHALL press that row alone,
push no inspector level, and move neither the breadcrumb nor the clock window.
It SHALL paint that night's served glucose trace over the pooled envelope on
Glucose by time of day through the same trace path a selected Finding occurrence
uses, and SHALL render a detail block beside the roster carrying the night's
date and slot span, delivered against programmed rate, that night's in-slot
glucose mean against the roster's mean, entering to leaving glucose, its
position within its group as `n of N`, a "Clear trace" control, and an
"Open <date> in Day" control routing to that night's day. Up and Down SHALL step
the selection within the night's group and keep focus on the newly selected
row. "Clear trace", a lane click that swaps the slot, and leaving the slot frame
SHALL release the selection and remove the trace.

#### Scenario: A night click selects in place

- **GIVEN** the reader stands on a basal slot panel with a rendered night roster
- **WHEN** they click one night row
- **THEN** that row alone reports pressed state
- **AND** the breadcrumb depth and the clock window are unchanged
- **AND** Glucose by time of day carries one trace series whose points are that
  night's served glucose values at their clock labels
- **AND** the detail block prints that night's date, delivered against
  programmed rate, its in-slot mean beside the roster mean, entering to leaving
  glucose, and `n of N` within its group

#### Scenario: Arrow keys step within the group and Clear trace releases

- **GIVEN** a night is selected in a group of more than one night
- **WHEN** the reader presses Down
- **THEN** the next night in that group is selected, pressed and focused, and
  the trace and detail block follow it
- **WHEN** the reader activates "Clear trace"
- **THEN** no row is pressed, the trace series is gone from Glucose by time of
  day, and the detail block is gone

### Requirement: A revision of the basal drill ships with its ledger amendments and evidence

A revision that adds night selection to the shipped Diagnose drill rail SHALL
amend the frozen finding-evidence-routing behavior ledger and its app-only
replay with executable stories for every added behavior in the same change,
SHALL record the base replay count, the fail-first replay result and the final
replay count in that ledger entry, and SHALL store before/after renders of the
basal drill at rest, with a night selected, and with its detail block, from the
base and the revision served on the same synthetic database.

#### Scenario: The amended replay proves the revision

- **WHEN** the amended replay runs against the built revision on the declared
  no-fetch server
- **THEN** it reports its applicable story count, zero failures and no skipped
  story
- **AND** every retired story prints its sanction
