## ADDED Requirements

### Requirement: The outcomes-trend route serves only the watched change

`GET /api/outcomes/trend` SHALL answer `{"watched_change": …}` with the one active
Trial or Focus view, or `null` when nothing is watched. It SHALL add no other
field, except the backend-owned `input_data_age`, which a fixed read carries only
while it serves the prior revision's answer during a rebuild: no schema version,
window tiling, profile, behavior, metric, arc, pre-meal or overnight-low series. Its `watched_change` SHALL equal what `summarize_trend`
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

#### Scenario: A prior answer served during a rebuild keeps its input-data age

- **GIVEN** the synthetic `c3-trial` case store, read once through
  `/api/outcomes/trend`, and then given a new synthetic CGM reading
- **WHEN** the route is read again while its rebuild is still in flight
- **THEN** the body carries the prior answer's `watched_change` and its
  `input_data_age`, and no other field

#### Scenario: A settings read after the last data point does not move the anchor

- **GIVEN** the synthetic `c3-trial` case store with an unchanged settings
  snapshot captured `2024-06-15 00:00:00`, past the Trial's 28-day watch horizon,
  reconciled at its latest basal, CGM or bolus instant
- **WHEN** `/api/outcomes/trend` is read and `summarize_trend` runs over the same
  store
- **THEN** both give the live basal 03:00 Trial changed `2024-05-15 00:00:00`,
  with `days_elapsed` 15 of 14 required, not `null`

#### Scenario: The command line keeps the rolling-window series

- **WHEN** `harmonic outcomes-trend --json` runs over a synthetic store
- **THEN** its output still carries `schema_version`, `windows`, `behaviors`,
  `metrics`, `arc`, `pre_meal`, `overnight_lows` and `watched_change`
