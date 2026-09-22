## ADDED Requirements

### Requirement: The findings projection serves each count-bearing row's count sentences

The findings projection SHALL serve count sentences in the form
`n of d noun outcome`, each with its count, denominator, noun and outcome words
served as their own values alongside the whole sentence. A Pattern row that
carries a count and a denominator SHALL serve exactly one, its outcome words
keyed by the Pattern's own served key. A Cause row SHALL serve one per family
appearance it already serves, in the served appearance order and never merged
into a total, each outcome keyed by the Cause's own lever together with that
appearance's family. The outcome words SHALL come from one closed table owned by
the projection. Two Patterns or two Causes that share a family SHALL be able to
serve different outcomes. A Pattern key, or a lever-and-family pair the
projection can emit, that has no entry SHALL fail the projection's tests rather
than serve a sentence without an outcome. A row whose counts are under review,
or that carries no denominator, SHALL serve no count sentence and SHALL keep its
existing served status words. Each sentence SHALL use the same count, denominator
and noun the row already serves, window-local where the row's counts are. No
staging, tier, rank, verdict or priority value SHALL change.

#### Scenario: A cause row serves its outcome per appearance

- **GIVEN** a synthetic store whose window holds a Cause row appearing in two
  families
- **WHEN** the findings projection is read for that window
- **THEN** the row serves two count sentences in appearance order, each with the
  count, denominator and noun of its own appearance, followed by that lever's
  outcome words for that family
- **AND** the row's tier, rank, priority and register are unchanged

#### Scenario: Opposite outcomes in one family stay apart

- **GIVEN** the projection's closed sets of Pattern keys and of lever-and-family
  pairs
- **WHEN** the outcome table is compared with those sets
- **THEN** every member has exactly one entry, the two Patterns counted in meals
  serve different outcome words, and the fixture-only browser mirror answers the
  same sentences window for window
