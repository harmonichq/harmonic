## MODIFIED Requirements

### Requirement: Habit associations preserve bounded episode ownership

The exposures producer SHALL associate a sequence habit member only with emitted
meal opportunities covered by its winning bounded episode. It SHALL NOT derive
targets from sequence membership, citations, nearby boluses or a chart mark.
Additive member_associations SHALL remain distinct from rate claims. Each episode
SHALL have one owner. A supported winner with no covered meal SHALL remain an
admissible habit finding without fabricating a Pattern occurrence or meal claim.
Whole-day claimed_by SHALL include served habit members and rate-lever subjects
without duplicates, preserving existing rate-only claims. Scoped queries SHALL
construct and serve a scoped Pattern population without inventing orphan
claimed_by relations. The existing nested painter, Pattern copy keys and
highs/meals chips SHALL remain.

For a named or drawn clock window, Pattern rows, membership, claimed count,
denominator, verdict counts, selected occurrence, evidence roster and rate inputs
SHALL derive from one producer-owned outcome-window population. The frontend
SHALL NOT derive membership, denominator, readiness, rate, attribution or other
clinical policy from a whole-day result. This does not prohibit viewport/chart
presentation of an already served population.

Membership SHALL use the family producer's outcome rule while preserving the
occurrence identity and full bounded episode context. For an attributed
over-treated-low Low opportunity, scope membership SHALL use its same-episode
High landing; the Low remains its exposure identity. An unattributed Low remains
a denominator opportunity under its existing rule and is not excluded merely
because it has no rebound. The producer's existing missing/thin representation
SHALL remain intact; this change SHALL NOT invent a status enum.

#### Scenario: A supported episode covers no meal opportunity

- **GIVEN** a supported sequence winner whose bounded episode covers no emitted
  meal opportunity
- **WHEN** findings and Pattern case evidence are prepared
- **THEN** the sequence cause remains nested under Highs after meals with its own
  sequence counts
- **AND** no Pattern meal occurrence, member association or rate claim is
  fabricated

#### Scenario: Covered meals are evidence without an added rate claim

- **GIVEN** a winning sequence episode covering emitted meal opportunities
- **WHEN** the parent case file is prepared
- **THEN** member_associations identify only those covered opportunities
- **AND** the parent rate and claiming-member tags retain only their existing
  rate-lever meaning

#### Scenario: A selected outcome window owns Pattern membership

- **GIVEN** synthetic opportunities with antecedents and outcomes on opposite
  sides of named, drawn, or circular half-open clock boundaries
- **WHEN** scoped Findings and a Pattern case file are served
- **THEN** every Pattern count, denominator, roster and selected occurrence uses
  the producer-owned outcome-window population
- **AND** an included outcome retains its full contributing episode evidence

#### Scenario: A rebound landing scopes a Low identity without dropping another Low

- **GIVEN** an attributed over-treated-low with a Low at 15:00 and same-episode
  rebound High at 19:00, plus an unattributed Low at 20:00
- **WHEN** the Evening and Afternoon Pattern populations are served
- **THEN** the attributed Low identity belongs to Evening rather than Afternoon
- **AND** the unattributed Low remains a denominator opportunity under its
  existing outcome rule

