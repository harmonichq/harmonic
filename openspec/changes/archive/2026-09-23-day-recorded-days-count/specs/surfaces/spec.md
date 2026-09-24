## ADDED Requirements

### Requirement: Day counts each recorded day once

The Day rail's "N recorded days · <first day> to <last day>" SHALL print the
served `data_day_count` from the same status read as its first and last day,
never a count of the month reads the desk has loaded, so paging the Month
calendar SHALL NOT change it. The desk SHALL merge its loaded month reads to one
row per day before the week ribbon, the month grid, the month head or
recorded-day stepping reads them; when two reads carry the same day, the read of
the month that day belongs to SHALL supply it, and a neighbouring read's padding
row SHALL stand for that day only while its own month is not loaded. A month's
head SHALL count only that month's days with data, each once.

#### Scenario: Paging the month leaves the rail count alone

- **GIVEN** a store whose status read serves 52 days with data, with the held
  day's month read loaded
- **WHEN** the reader pages the Month calendar forward and back again
- **THEN** the rail reads "52 recorded days" before, between and after the pages

#### Scenario: A month counts its own days once with its neighbour loaded

- **GIVEN** two adjacent month reads loaded, each padded with a week of the
  other, June holding 29 days with data and July 23
- **WHEN** either month is shown
- **THEN** June's head reads "29 recorded days" and July's reads "23 recorded
  days"
- **AND** each shown month's cells come from that month's own read
