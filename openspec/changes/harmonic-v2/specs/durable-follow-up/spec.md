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
- **AND** the qualified independent-review completion is recorded separately from
  the scratch replay; production persistence and UI Craft proof remain explicit
  downstream obligations

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

### Requirement: The backend delivers the durable-follow-up contract through compatible public operations

The production backend SHALL persist the `386:1` durable context, ending,
admission-frontier and available-assessment records through additive migration and
authenticated public operations while preserving existing v1 read behavior. It
SHALL make each lifecycle write source-revision aware and transactional, invalidate
the process-local result cache only after a committed durable write, and reconcile
ingested settings before a mutation without permitting a history read to mutate a
watch. It SHALL use synthetic, generator-owned data only where generated artifacts
are needed; it SHALL not introduce a historical data archive or change clinical or
statistical policy.

#### Scenario: Restart retains one real lifecycle record and legacy unknowns

- **GIVEN** a synthetic pre-migration store containing existing Plan or Focus rows
  and a newly recorded Plan, Trial, or Focus lifecycle record
- **WHEN** the Store migrates, the process restarts, and authenticated public reads
  retrieve both records
- **THEN** the newly recorded context, frontier and first ending retain their
  identities and explicit availability fields
- **AND** unstored legacy context, ending and assessment facts remain unavailable
  rather than being inferred from migration time, current data or a later model run

#### Scenario: Competing lifecycle requests preserve one authoritative result

- **GIVEN** synthetic concurrent or stale finish, resolve, preemption,
  reconciliation, withdrawal or duplicate requests for the same active identity
- **WHEN** authenticated public operations race or retry after an ordinary failure
- **THEN** one committed transaction determines the ending/frontier relationship
  and every losing or stale request returns that recorded result or an explicit
  conflict without a duplicate ending, released different watch, stale cache or
  partially persisted assessment
- **AND** an ingestion-triggered reconciliation uses the same ownership and cache
  path before a later mutation is admitted

#### Scenario: History and assessment remain bounded and distinguish original from later work

- **GIVEN** a retained Trial or ended Focus with an original context and ending
  snapshot, including a record whose assessment is unavailable for missing evidence
- **WHEN** an authenticated history or selected-record read and a separately
  requested reassessment are served
- **THEN** the original snapshot stays distinct and immutable, the read performs no
  active resolution, migration, reconciliation or Focus mutation, and a reassessment
  is labeled with its later source revision
- **AND** an available Focus assessment uses the exact half-open retained periods,
  common retained inference context, owned anchors and named denominators, while
  zero opportunities and missing evidence are explicitly unavailable

#### Scenario: Existing clients remain compatible while the backend capability is added

- **GIVEN** synthetic callers of the existing Plan, Focus and Verify operations
- **WHEN** the durable-follow-up operations are added and exercised through the
  public API
- **THEN** existing response fields and v1 behavior remain available, while new
  lifecycle fields are additive and backend-owned
- **AND** all production acceptance cases run without live vendor access, patient
  data, credentials or a rendered v2 surface
