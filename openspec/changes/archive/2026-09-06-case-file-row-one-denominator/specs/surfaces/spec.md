## ADDED Requirements

### Requirement: A rendered Finding row states one denominator

The Finding case-file preparation SHALL publish every rendered finding row with
a `headline` composed from that row's own published `appearances` and `tier`
through the findings projection's headline composer, so the row's queue detail
line, its `case_header` summary and its served headline name the same count,
denominator and population noun. A rendered row SHALL NOT carry the sentence
the projection composed from the appearances the preparation replaced.

The rendered row SHALL retain every family appearance the findings projection
published for that finding. It SHALL substitute the case file's own claimed
count, denominator and population noun for the case file's own family, and
SHALL publish that family as the row's first appearance so the composed
sentence names it. Every other family's appearance SHALL keep the count and
denominator the projection published for it.

The preparation's own `findings` payload SHALL be published unchanged, and no
frontend module SHALL compose, recompose or re-derive the sentence.

#### Scenario: The case file's denominator differs from the projection's

- **GIVEN** a prepared window whose case-file population for a finding counts a
  different denominator than the findings projection published for that finding
- **WHEN** the preparation renders that finding's row
- **THEN** the row's first appearance, its `case_header` summary and its
  `headline` state the same count, denominator and noun
- **AND** the preparation's `findings` payload keeps the appearances and the
  headline the projection composed

#### Scenario: The finding appears in more than one family

- **GIVEN** a projection row whose appearances name two families in family-name
  order, and whose first appearance is not the case file's recurrence family
- **WHEN** the preparation renders that row
- **THEN** the rendered row's `appearances` still name both families
- **AND** the case file's own family is the first appearance, carrying the case
  file's claimed count, denominator and noun
- **AND** the other family's appearance keeps the count and denominator the
  projection published
- **AND** the rendered `headline` states the case file's own family noun and
  its counts
