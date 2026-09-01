## ADDED Requirements

### Requirement: Finding occurrence lists share one roster presentation

Both occurrence lists a Finding case file renders — the verdict-band roster and
the response-comparison cohort roster — SHALL present occurrences through one
shared roster mechanism: grouped headers carrying their counts, one button row
per occurrence exposing its pressed state, at most one selected occurrence at a
time, and an over-cap show-more control with the same cap and toggle behavior in
both lists. Each list SHALL keep its own grouping — verdict bands for one,
server-named cohorts for the other — and its own row text, and selection SHALL
remain keyed to server-owned Occurrence identity in both.

#### Scenario: Selection behaves identically in both lists

- **WHEN** the reader selects an occurrence in either the verdict-band roster or
  the response-comparison roster
- **THEN** that row alone reports pressed state
- **AND** the previously selected row, in either list, releases it

#### Scenario: The show-more cap is one behavior

- **GIVEN** a group holding more occurrences than the roster cap
- **WHEN** the reader toggles the show-more control
- **THEN** the list expands past the cap and collapses back to it
- **AND** the cap and its toggle wording behave the same in both lists
