## ADDED Requirements

### Requirement: The outcomes-trend route serves only the watched change

`GET /api/outcomes/trend` SHALL answer `{"watched_change": …}` with the one active
Trial or Focus view, or `null` when nothing is watched. It SHALL add the
backend-owned `input_data_age` that every fixed read carries, and no other field:
no schema version, window tiling, profile, behavior, metric, arc, pre-meal or
overnight-low series. Its `watched_change` SHALL equal what `summarize_trend`
resolves for the same store, anchored at the latest basal, CGM or bolus instant.
The route SHALL take no window parameter, so a supplied one changes nothing. It
SHALL be cached and warmed under one window-free key. It SHALL persist its result
under a shape marker distinct from the full-trend payload it served before. The
rolling-window series stay available through the CLI's `outcomes-trend` command.

#### Scenario: A watched Trial is served alone

- **GIVEN** the synthetic `c3-trial` case store
- **WHEN** `/api/outcomes/trend` is read
- **THEN** the body's only fields are `watched_change` and, when served,
  `input_data_age`
- **AND** `watched_change` equals `summarize_trend(store, window_days=30)`'s
  `watched_change` for the same store

#### Scenario: A watched Focus, and no watched change, are served alone

- **GIVEN** the synthetic `c3-focus` case store, and then a synthetic store with
  nothing watched
- **WHEN** `/api/outcomes/trend` is read
- **THEN** `watched_change` is the Focus's view in the first case and `null` in
  the second, and neither body carries any other series

#### Scenario: The command line keeps the rolling-window series

- **WHEN** `harmonic outcomes-trend --json` runs over a synthetic store
- **THEN** its output still carries `schema_version`, `windows`, `behaviors`,
  `metrics`, `arc`, `pre_meal`, `overnight_lows` and `watched_change`
