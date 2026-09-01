## ADDED Requirements

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
slot, the analyzer SHALL stamp `roster_glucose_mean`: the mean of the per-night
`glucose_mean` values, each roster night counting once, nights with a null mean
excluded. A roster night without usable in-window CGM SHALL serve null glucose
facts and SHALL remain in the roster. The projection SHALL copy these facts
verbatim, SHALL fail closed when `roster_glucose_mean` is absent from a payload
that carries a night roster, and SHALL derive nothing; no safety verdict,
membership decision, or support floor SHALL change on account of glucose
evidence.

#### Scenario: A night's divergence is readable against the roster norm

- **WHEN** the night-evidence payload serves a slot whose roster nights carry
  in-window glucose means and the slot carries its roster-level mean
- **THEN** each night's mean and the roster norm are in the same units, the
  norm counting every night once

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

#### Scenario: The trace is drawable by the shipped trace path

- **WHEN** a roster night carries its CGM trace
- **THEN** the trace is a sparse list of `{t, minute, bg}` points — absolute
  wall-clock `t`, `minute` relative to slot start — spanning from 60 minutes
  before slot start through slot end
- **AND** for the midnight-adjacent slot, lead points carry the prior date in
  `t` rather than an inferred one
