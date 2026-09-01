## ADDED Requirements

### Requirement: Finding occurrence lists share one roster presentation

Both occurrence lists a Finding case file renders — the verdict-band roster and
the response-comparison cohort roster — SHALL present occurrences through one
shared roster mechanism: grouped headers carrying their counts, one button row
per occurrence exposing its pressed state, at most one selected occurrence at a
time, and an over-cap show-more control whose gating count is the caller's
served figure — never a recount of rendered rows. Each list SHALL keep its own
grouping — verdict bands for one, server-named cohorts for the other — its own
header and empty-state wording, its own row text and row data attributes, and
selection SHALL remain keyed to server-owned Occurrence identity in both. The
mechanism SHALL preserve each list's rendered behavior exactly as shipped,
including the response-comparison list's single expansion state across its
cohorts.

#### Scenario: Selection behaves identically in both lists

- **WHEN** the reader selects an occurrence in either the verdict-band roster or
  the response-comparison roster
- **THEN** that row alone reports pressed state
- **AND** the previously selected row, in either list, releases it

#### Scenario: The show-more cap is one mechanism with caller-owned counts

- **GIVEN** a group holding more occurrences than the roster cap
- **WHEN** the reader toggles that group's show-more control
- **THEN** the list expands past the cap and collapses back to it
- **AND** the control's count is the caller's served figure — the published
  verdict count for the verdict-band list, each cohort's routed count for the
  response-comparison list — never a recount of rendered rows
- **AND** the response-comparison list keeps one expansion state across all its
  cohorts, exactly as shipped
