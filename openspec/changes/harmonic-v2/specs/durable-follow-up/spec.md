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
denominators. Zero opportunities SHALL remain unknown; positive opportunities with
unreadable required measurement SHALL retain their denominator and unavailable
judgment. The contract SHALL
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
statistical inference methods or recommendation/classifier policy. The operator-
authorized follow-up readiness refinement for Trials and Focus in ADR 387 MAY be
selected only after its preregistered validation and independent review; this
exception SHALL NOT change recommendation support or inference methods.

#### Scenario: Restart retains one real lifecycle record and legacy unknowns

- **GIVEN** a synthetic pre-migration store containing existing Plan or Focus rows
  and newly recorded Plan, Trial and Focus context through the Store interface
- **WHEN** the Store migrates, writes a bounded record/receipt/frontier transaction,
  restarts and reads the records through its public persistence interface
- **THEN** their canonical identities and first context/ending/assessment fields
  survive unchanged, and a failed transaction leaves no partial durable result
- **AND** legacy unknowns remain unavailable without writing during a history read;
  an earlier ending cannot be overwritten and one active Focus remains enforced

#### Scenario: Competing lifecycle requests preserve one authoritative result

- **GIVEN** synthetic concurrent or stale finish, resolve, preemption,
  reconciliation, withdrawal or duplicate requests for the same active identity
- **WHEN** authenticated public operations race or retry after an ordinary failure
- **THEN** one committed transaction determines the ending/frontier relationship
  and every losing or stale request returns that recorded result or an explicit
  conflict without a duplicate ending, released different watch, stale cache or
  partially persisted assessment
- **AND** unique versus ambiguous actual Plan matches, pending intent withdrawal,
  canonical block/tie identities and sequential changes use the one verdict;
  ingestion reconciliation uses that same owner before admitting a later mutation

#### Scenario: Setting and Focus comparisons use their exact retained inputs

- **GIVEN** synthetic retained setting Trial and Focus records with available
  evidence, and records with missing context, coverage or opportunities
- **WHEN** the read-only comparison interface computes their selected periods
  under retained context or an explicitly requested current-policy context
- **THEN** both an available setting assessment and an available Focus assessment
  are produced where evidence exists, using the #340 policy and ADR 386/387 refinements
- **AND** full half-open periods, captured setting membership, owned anchors,
  named denominators and common inference context agree across evidence and
  scalar rows; unclear inference and unavailable data remain distinct
- **AND** zero unwanted events with positive opportunities is an observed zero
  only when the required measurement is readable under the ADR 387 observation
  contract; unreadable behavior or harm retains the original opportunity denominator
  and explicit unavailability without erasing known positive behavior
- **AND** zero opportunities, legacy missing endings and unsupported retained
  execution remain explicitly unavailable without inventing an assessment

#### Scenario: Follow-up readiness uses the selected change's evidence

- **GIVEN** a setting Trial or Focus with readable values and accumulating evidence
- **WHEN** the backend reports readiness under an independently validated ADR 387 criterion
- **THEN** the required evidence unit and exact-arm qualifying count remain distinct
  from inferential confidence, recommendation eligibility and watch lifecycle
- **AND** I:C retains eight effective qualifying closed runs, including existing
  fractional ownership and exclusions; no raw meal count substitutes for that unit
- **AND** count-met but non-estimable or uncertain comparisons cannot assert benefit

#### Scenario: Longer follow-up does not end on a favorable look

- **GIVEN** a Trial or Focus whose settled comparison bounds continue beyond fourteen days
- **WHEN** later evidence or a favorable directional assessment becomes available
- **THEN** readable values and progress continue under the existing effective bounds
- **AND** neither day fourteen nor a favorable result silently clips or ends follow-up;
  the ADR 387 validation measures accumulating-look behavior separately from its final look

#### Scenario: Public history is immutable and existing clients remain compatible

- **GIVEN** retained Trial and Focus records, including ended and legacy records,
  an active watch and synthetic existing v1 callers
- **WHEN** authenticated history/selected reads and explicit reassessments are
  served through the contracts.md #387 public interfaces after restart
- **THEN** original context and ending assessments remain separate and immutable,
  later work carries its own revision/context, and reads perform no resolution,
  migration, reconciliation, frontier advance or Focus mutation
- **AND** available setting and Focus ending assessments are saved atomically by
  public writes; raw evidence loss leaves the retained record readable
- **AND** existing request/response fields and legacy validation behavior remain
  compatible while durable fields and operations are added; the complete existing
  repository verification runs on synthetic data without a rendered v2 surface
