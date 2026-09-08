## ADDED Requirements

### Requirement: The v2 plan carries one bounded durable-follow-up contract

The active v2 change SHALL record an implementation-ready contract for durable
Plan, Trial, and Focus context and endings. The contract SHALL name the
versioned records, their public read/write owner, and the representation of
unknown legacy facts. It SHALL keep detected change time distinct from first
observation and Plan intent, and SHALL link a Plan to a Trial only through
actual schedule reconciliation. Its synthetic replay SHALL explicitly assert,
print, and record in this change's evidence artifact the inputs and actual
observed/asserted outputs for every selected identity, ending, reconciliation,
preemption, and legacy case; a failed or unexercised case SHALL exit nonzero.

#### Scenario: A Trial first observed without a Plan retains only observed facts

- **GIVEN** a detected Trial for which no reconciled Plan exists
- **WHEN** the durable-follow-up contract is read
- **THEN** first-observed context and detected-change time remain distinct
- **AND** no earlier Plan, decision snapshot, or ending fact is invented

#### Scenario: Read the recorded implementation boundary

- **GIVEN** the findings of the #386 investigation
- **WHEN** the parent contract is consumed for a build brief
- **THEN** ADR 386 and contracts.md name version `386:1`, existing record identities,
  bounded context/ending fields and the backend public read/write owners
- **AND** production observations and proposed simulations remain separately labeled
- **AND** independent review, production persistence and UI Craft proof remain
  explicit downstream obligations, not implied by passing the scratch replay

#### Scenario: Reconcile one applied Plan without inventing intent

- **GIVEN** a detected setting change and one or more nearby Plan records
- **WHEN** the backend establishes a Plan-to-Trial relationship
- **THEN** one applied deliverable uniquely matches the actual observed transition
  under the existing schedule/precision and captured-block reconciliation rules
- **AND** draft equality, temporal proximity, a deliberate flag, or a matching
  parameter alone cannot establish the relationship
- **AND** missing or ambiguous historical evidence keeps the relationship unavailable

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

#### Scenario: Admit a genuinely new Trial after a finished one

- **GIVEN** the latest admitted Trial has a recorded ending
- **WHEN** candidates are refreshed
- **THEN** the backend retains its admission frontier and does not promote older
  candidates or a same-instant peer, even if the finished candidate is absent
- **AND** a genuinely later detected change can advance the frontier and preempt
  an active Focus, without changing the prior recorded ending
- **AND** active selection, Verify, guidance and the Focus pin guard consume that
  same canonical verdict, including proven captured-block I:C candidates

#### Scenario: Retain distinct endings without mutating history

- **GIVEN** a manual conclusion, detected reversal or supersession, unreviewed
  expiry, or Focus preemption
- **WHEN** the backend records the ending
- **THEN** it preserves the ending kind, effective and recorded times, and the
  available assessment with limitations; automatic endings supply no user conclusion
- **AND** subsequent history reads and repeat ending requests cannot replace that
  record, release a different watch, or drop an active Focus
- **AND** a setting watch ending does not silently change the separate #340
  comparison periods or overwrite the original ending assessment with later data

### Requirement: The v2 plan makes historical Focus comparison periods coherent

The contract SHALL define exact Focus periods from pin to recorded ending, use
one named source context for adherence and outcomes, and preserve named
denominators. Zero opportunities SHALL remain unknown. The contract SHALL
preserve ADR 131's fixed-follow-up rationale and describe the existing
correction-family disagreement as an inference-context difference, not an
improvement or a causal claim. The same synthetic replay SHALL explicitly assert,
print, and record in this change's evidence artifact the inputs and actual
observed/asserted outputs for exact periods, zero opportunities, and the
correction-context discrepancy; a failed or unexercised case SHALL exit nonzero.

#### Scenario: A legacy Focus has no invented ending boundary

- **GIVEN** a legacy Focus row without an ending time
- **WHEN** its historical comparison is requested
- **THEN** the unavailable boundary is reported explicitly
- **AND** no period, adherence result, outcome result, or causal conclusion is
  reconstructed from its terminal status alone

#### Scenario: Compare the exact historical Focus

- **GIVEN** a Focus with known pin and effective ending timestamps
- **WHEN** selected comparison detail is requested
- **THEN** Before is the available history within 90 elapsed days before pin,
  and After is the half-open pin-to-ending interval
- **AND** existing anchor ownership and clipping apply consistently to charts and
  scalar outcomes, with one source revision and named per-measure denominators
- **AND** zero opportunities is unavailable, distinct from zero unwanted behavior
  over a positive opportunity count

#### Scenario: Preserve the correction comparison context

- **GIVEN** the original Diagnosis used a different effective-ISF context from
  the Focus's retained programmed-profile context
- **WHEN** Focus adherence and outcomes are compared
- **THEN** both arms use the one retained follow-up context and its source identity
- **AND** the original Diagnosis remains separately dated and labeled
- **AND** an unchanged-record count difference across contexts is not presented as
  adherence improvement, an outcome difference, or a causal result
- **AND** missing retained context keeps exact comparison unavailable instead of
  silently borrowing today's settings or classifier version
