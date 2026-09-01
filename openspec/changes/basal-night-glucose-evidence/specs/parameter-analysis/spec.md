## ADDED Requirements

### Requirement: The basal analyzer stamps per-night glucose evidence on the night roster

For each night in a basal slot's night roster, the analyzer SHALL stamp, beside
the existing rate facts: the night's mean glucose within the slot window; the
glucose entering and leaving the window, each the reading nearest that boundary
within the analyzer's staleness cap and null when none qualifies; and the
night's CGM trace from 60 minutes before slot start through slot end, served as
five-minute `{minute, bg}` bins with minutes relative to slot start — the same
shape the Finding case file's occurrence trace ships. Per slot, the analyzer
SHALL stamp one roster-level mean in-block glucose: the mean of the per-night
in-window means, each roster night counting once, nights with a null mean
excluded. A roster night without usable in-window CGM SHALL serve null glucose
facts and SHALL remain in the roster. The projection SHALL copy these facts
verbatim and derive nothing, and no safety verdict, membership decision, or
support floor SHALL change on account of glucose evidence.

#### Scenario: A night's divergence is readable against the roster norm

- **WHEN** the night-evidence payload serves a slot whose roster nights carry
  in-window glucose means and the slot carries its roster-level mean
- **THEN** each night's mean and the roster norm are in the same units, the
  norm counting every night once

#### Scenario: A gappy night serves nulls without leaving the roster

- **GIVEN** a roster night with no usable CGM inside the slot window
- **WHEN** the analyzer stamps glucose evidence
- **THEN** that night's glucose facts are null
- **AND** the night remains in the roster and in every count it appears in today
- **AND** the roster-level mean excludes it

#### Scenario: The trace is drawable by the shipped trace path

- **WHEN** a roster night carries its CGM trace
- **THEN** the trace is five-minute `{minute, bg}` bins, minutes relative to
  slot start, spanning from 60 minutes before slot start through slot end
