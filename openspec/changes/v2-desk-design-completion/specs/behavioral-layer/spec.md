## ADDED Requirements

### Requirement: The findings projection serves each count-bearing row's count sentence

The findings projection SHALL serve, on every Pattern row and every Cause row
that carries a count and a denominator, one count sentence in the form
`n of d noun outcome`, with the count, the denominator, the noun and the outcome
words each served as their own value alongside the whole sentence. The outcome
words SHALL come from one closed table owned by the projection and keyed by the
row's own family; a family with no entry SHALL fail the projection's tests
rather than serve a sentence without an outcome. A row whose counts are under
review, or that carries no denominator, SHALL serve no count sentence and SHALL
keep its existing served status words. The sentence SHALL use the same count and
denominator the row already serves, window-local where the row's counts are.
No staging, tier, rank, verdict or priority value SHALL change.

#### Scenario: A cause row serves its outcome

- **GIVEN** a synthetic store whose window holds a Cause row with a served count
  and denominator
- **WHEN** the findings projection is read for that window
- **THEN** the row serves a count sentence whose count, denominator and noun
  equal the row's existing served support, followed by that family's outcome
  words
- **AND** the row's tier, rank, priority and register are unchanged

#### Scenario: Every family has its words

- **GIVEN** the projection's closed set of Pattern and Cause families
- **WHEN** the outcome table is compared with that set
- **THEN** each family has exactly one entry, and the fixture-only browser
  mirror answers the same sentence window for window
