## ADDED Requirements

### Requirement: Verify serves period-owned comparisons of existing watched changes

Verify SHALL use the existing detected Trial identities and existing active Focus.
It SHALL apply the comparison-period and population rules in this change's
“ADR 340 — Resolve remaining scope under delegated design authority”. Comparison
serving SHALL NOT change Trial detection, revert suppression, active-watch timing,
Focus pinning or preemption, or analyzer dosing recommendations.

#### Scenario: A setting remains unchanged beyond the existing watch horizon

- **WHEN** an existing detected Trial remains eligible under the existing change/revert rules and its setting has not changed again
- **THEN** Verify can select that Trial and show continuing After evidence
- **AND** the comparison does not prolong the active-watch exclusion of a Focus

#### Scenario: The relevant setting changes again

- **WHEN** a later setting change intersects the selected Trial's parameter and affected clock span
- **THEN** the selected Trial's After evidence stops at that change
- **AND** the existing detection and revert rules determine which Trial identities appear

#### Scenario: A comparison boundary cuts an observation window

- **WHEN** an eligible event's response window crosses its owned period boundary
- **THEN** only readings inside that period feed the comparison
- **AND** unavailable sections remain gaps rather than being filled from the other period

#### Scenario: Previous-setting history is short

- **WHEN** the immediately preceding continuous relevant setting period supplies little evidence
- **THEN** Verify shows that short Before period and its actual support
- **AND** it does not borrow disconnected periods with matching setting values

### Requirement: Verify distinguishes observed outcomes from supported conclusions

Selected comparison detail SHALL serve the existing or narrowly added outcome
computations, denominators, observed differences, assessment states and reasons
specified by the delegated-design ADR. The frontend SHALL render those judgments
without recomputing support, uncertainty or direction. A descriptive response
spread or active-watch maturity SHALL NOT establish benefit.

#### Scenario: A well-supported outcome improves without a concerning guardrail

- **WHEN** the backend's scoped assessment supports a favorable observed outcome direction
- **THEN** Verify names the favorable observed change and shows its Before and After values, uncertainty and denominators
- **AND** it does not say the setting caused that outcome

#### Scenario: Evidence does not settle the result

- **WHEN** support is insufficient, an interval is non-estimable or degenerate, or it includes zero
- **THEN** Verify explicitly reports that the effect is unclear
- **AND** available observed values remain visible
- **AND** it does not report no effect, successful adherence, or improvement by default

#### Scenario: Favorable and concerning outcomes coexist

- **WHEN** a favorable outcome coexists with an observed increase in low exposure
- **THEN** Verify presents the concern alongside the favorable outcome as a mixed read
- **AND** each assessment retains its uncertainty
- **AND** the summary is not unqualified approval of the change

#### Scenario: Many meals come from one date

- **WHEN** a period contains many eligible meals from only one informative date
- **THEN** that period cannot earn a supported directional assessment through meal count alone

### Requirement: Verify reuses complete chart interactions for group comparisons

Verify SHALL reuse shipped chart rendering and interactions, with the approved
shared-scale and zero-marker extensions and the minimal shared data boundary for
a Before/After caller. It SHALL lead with groups and preserve selected subject,
periods and occurrence when switching paired and overlay presentations. The
running-app behavior contract SHALL govern fidelity; source inspection is not a
visual lock.

#### Scenario: Inspecting a meal comparison

- **WHEN** the user opens a meal comparison
- **THEN** the axis spans one hour before to five hours after its meal anchor and marks zero
- **AND** paired plots use one glucose scale
- **AND** the existing pointer and keyboard inspection expose the served values and counts

#### Scenario: Switching paired and overlay presentation

- **WHEN** the user toggles the comparison presentation
- **THEN** both presentations show the same served groups and period boundaries
- **AND** selection is preserved without refetching or reclassifying a different population

#### Scenario: A single event is all that is available

- **WHEN** group support is too thin for a median
- **THEN** Verify identifies the missing support
- **AND** individual evidence remains drill-down rather than replacing the group-first opening

### Requirement: Focus adherence and outcomes remain separate

Verify SHALL compute the active Focus's comparison at its actual pin boundary
using existing behavior populations and outcome semantics. A read of Verify
SHALL NOT resolve or drop a Focus. Rescue observation state SHALL remain distinct
from a zero event count.

#### Scenario: No eligible behavioral opportunities

- **WHEN** a Focus period has zero eligible opportunities
- **THEN** adherence is unknown with its denominator shown
- **AND** it is not rendered as perfect adherence

#### Scenario: Different adherence and outcome directions

- **WHEN** a Focus's observed adherence improves but its outcome does not show supported improvement
- **THEN** Verify shows those two assessments separately

### Requirement: Verify preserves the existing Revert boundary and removes Keep

Verify SHALL remove the session-only Keep acknowledgement. Revert SHALL retain
its existing availability and backend-supplied Plan route, including the current
manual-review behavior when no prior setting can be staged. No persistent Keep
state or direct pump action SHALL be introduced.

#### Scenario: A complete Trial is displayed

- **WHEN** Verify displays a Trial for which Revert is currently available
- **THEN** the decision area offers Revert to Plan and no Keep button
- **AND** the forwarded Plan intent comes from the selected Trial's backend route


### Requirement: Selected detail loads on demand through one Trial and Focus interface

The existing Verify read endpoint SHALL implement the discriminated selected-detail
contract in the delegated-design ADR. Roster reads SHALL return summaries without
computing every subject's detailed comparison. The browser SHALL load only the
selected detail and replace all subject-dependent content coherently.

#### Scenario: Many historical Trials are available

- **WHEN** Verify opens a roster containing many old Trials
- **THEN** it requests one roster and only the initially selected detail
- **AND** opening the picker does not compute every historical assessment

#### Scenario: A later selection overtakes a pending detail

- **WHEN** the user selects a second subject before the first detail request completes
- **THEN** the first response cannot replace the second subject's plots or assessment

#### Scenario: Selected detail fails

- **WHEN** a selected detail request fails
- **THEN** Verify shows failure and an explicit Retry
- **AND** any retained evidence keeps its original subject label
- **AND** the failure is not presented as a successful empty comparison

#### Scenario: A Focus is selected

- **WHEN** the existing eligible active Focus is selected by its served kind and ID
- **THEN** the same selected-detail envelope supplies its pin-anchored periods, outcomes, denominators and assessments
- **AND** the read does not change its stored status

#### Scenario: A period has eligible nights and zero lows

- **WHEN** a comparison period has eligible coverage-qualified nights but no low events
- **THEN** its low-event rate has a zero numerator and positive eligible-night denominator
- **AND** those nights count toward evidence support
- **AND** it is not mistaken for a period with no eligible observations

### Requirement: The design investigation returns an evidence-grounded revision handoff

The #340 investigation SHALL deliver the baseline behavior inventory, synthetic
running-app evidence, proposed presentation contract and integrated build handoff
specified by “ADR 340 — Design investigation delivery boundary”. It SHALL keep
production source unchanged and distinguish observed baseline behavior from
proposed behavior. Final revised-surface proof SHALL be an integrated-build gate.

#### Scenario: The investigation completes

- **WHEN** every existing Verify replay story passes and the baseline evidence and proposed contract are reviewed
- **THEN** the findings link the committed parent-plan artifacts and explicitly identify the future revised-surface verification matrix
- **AND** no production implementation, new build admission, or completed revised-surface visual proof is claimed

#### Scenario: A proposed state is absent from baseline fixtures

- **WHEN** the shipped synthetic fixtures cannot render a proposed state
- **THEN** the investigation records the missing baseline evidence and a generator-owned build verification obligation
- **AND** it does not substitute a fabricated render or report that state visually verified
