## ADDED Requirements

### Requirement: The status read serves how many days carry data

The status endpoint SHALL serve `data_day_count`: the number of distinct
pump-local wall-clock days — each reading bucketed by the date of its naive local
time, as the first and last data day are — on which at least one CGM reading
carries a glucose value. A day whose readings all lack a glucose value (a sensor
HIGH or LOW) SHALL NOT be counted, and a day with no reading SHALL NOT be counted.
An empty store SHALL serve `0`. The count SHALL be read in the same store read as
`earliest_data_day` and `latest_data_day`, and the status endpoint SHALL remain
an uncached cheap read.

#### Scenario: A gap day and a glucose-less day are not counted

- **GIVEN** a store with glucose readings on three days, no reading on a day
  between them, and only a HIGH/LOW reading on another day
- **WHEN** the status endpoint is read
- **THEN** `data_day_count` is 3
- **AND** `earliest_data_day` and `latest_data_day` are unchanged by the count

#### Scenario: An empty store counts no days

- **GIVEN** a store with no CGM reading
- **WHEN** the status endpoint is read
- **THEN** `data_day_count` is 0
