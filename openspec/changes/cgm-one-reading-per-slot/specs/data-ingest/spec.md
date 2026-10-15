## ADDED Requirements

### Requirement: Two CGM records for one five-minute slot are one reading

The CGM reader SHALL return one reading per slot. Readings chained less than two
minutes apart SHALL be one slot. A record with no glucose value SHALL NOT count
as a disagreement. A slot whose glucose values agree SHALL be its first valued
reading. A slot holding two different glucose values SHALL be its first reading
with no glucose value. A ranged read SHALL include a slot exactly when the
reading it returns lies in the range, and SHALL return the same slot as the
whole read. Stored rows SHALL NOT be rewritten.

#### Scenario: The same reading recorded twice seconds apart is one reading

- **GIVEN** a synthetic store holding a five-minute stream in which one slot has
  two rows one second apart with the same glucose value
- **WHEN** the CGM readings are read
- **THEN** that slot is one reading at its first row's time, with that value

#### Scenario: Two disagreeing series leave their shared slots without a value

- **GIVEN** a synthetic store in which two slots each hold a second row 26
  seconds later with a different glucose value
- **WHEN** the CGM readings are read
- **THEN** each of those slots is one reading at its first row's time with no
  glucose value, and the unpaired readings around them keep their values

#### Scenario: A ranged read agrees with the whole read at its edges

- **GIVEN** pairs that straddle both the start and the end of a range
- **WHEN** the range is read
- **THEN** it returns exactly the whole read's slots that lie in the range

#### Scenario: A record with no value beside a reading leaves the reading

- **GIVEN** a reading with no-value records a second before and thirty seconds
  after it
- **WHEN** the CGM readings are read
- **THEN** that slot is the valued reading, at its own time
