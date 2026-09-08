## ADDED Requirements

### Requirement: The v2 plan carries one bounded durable-follow-up contract

The active v2 change SHALL record an implementation-ready contract for durable
Plan, Trial, and Focus context and endings. The contract SHALL name the
versioned records, their public read/write owner, and the representation of
unknown legacy facts. It SHALL keep detected change time distinct from first
observation and Plan intent, and SHALL link a Plan to a Trial only through
actual schedule reconciliation.

#### Scenario: A Trial first observed without a Plan retains only observed facts

- **GIVEN** a detected Trial for which no reconciled Plan exists
- **WHEN** the durable-follow-up contract is read
- **THEN** first-observed context and detected-change time remain distinct
- **AND** no earlier Plan, decision snapshot, or ending fact is invented

### Requirement: The v2 plan defines one Trial finish and admission verdict

The contract SHALL define one backend-owned finish and admission verdict shared
by the active watch, the Verify roster, and the Focus pin guard. A finished
Trial SHALL remain historical after refresh and retry; it SHALL NOT promote an
older candidate. A genuinely new detected change MAY form a new Trial, and
manual Focus resolution SHALL remain distinct from Trial preemption.

#### Scenario: A repeat finish preserves the recorded ending

- **GIVEN** a Trial already finished under the backend-owned verdict
- **WHEN** the same finish is retried
- **THEN** the recorded ending is returned without reopening or duplicating it
- **AND** an older candidate does not become the active watch

### Requirement: The v2 plan makes historical Focus comparison periods coherent

The contract SHALL define exact Focus periods from pin to recorded ending, use
one named source context for adherence and outcomes, and preserve named
denominators. Zero opportunities SHALL remain unknown. The contract SHALL
preserve ADR 131's fixed-follow-up rationale and describe the existing
correction-family disagreement as an inference-context difference, not an
improvement or a causal claim.

#### Scenario: A legacy Focus has no invented ending boundary

- **GIVEN** a legacy Focus row without an ending time
- **WHEN** its historical comparison is requested
- **THEN** the unavailable boundary is reported explicitly
- **AND** no period, adherence result, outcome result, or causal conclusion is
  reconstructed from its terminal status alone
