## ADDED Requirements

### Requirement: Changes follows a watched Trial or Focus through

Changes SHALL answer "are my changes working?" for the active Trial and Focus
(ADR 397). For a Trial it SHALL show the Before and Trial periods the server bounds
from the served change date. Beside them it SHALL show the served comparison
outcomes with the mapped outcome first and overall time in range alongside, the
served evidence readiness, and the served watch maturity. For a Focus it SHALL
show adherence beside outcome. Changes SHALL read every one of these from the
server and SHALL recompute no readiness, maturity, comparison or verdict. No text
Changes renders for a Trial or Focus SHALL name Verify.

#### Scenario: A watched Trial reads its own comparison in Changes

- **GIVEN** a synthetic store whose server serves an active Trial
- **WHEN** Changes opens on the watch at 1280×720 and at 1440×900
- **THEN** the Trial's view shows the served Before and Trial periods, the served
  comparison outcomes with the mapped outcome first, the served evidence
  readiness and the served watch maturity
- **AND** no text in the view names Verify

#### Scenario: A watched Focus reads adherence beside outcome in Changes

- **GIVEN** a synthetic store whose server serves an active Focus
- **WHEN** Changes opens on the watch at 1280×720 and at 1440×900
- **THEN** the Focus's view shows its adherence table beside its outcome table
- **AND** no text in the view names Verify

### Requirement: The watch dock and Changes print one Trial day count

For a Trial, the watch dock and Changes' Watch maturity SHALL print one day
count: the served `days_elapsed` that the served readiness rule compares with the
served `days_required`. Neither surface SHALL clamp, round or re-derive that
count. Each SHALL pick its form from the served verdict: the dock reads the
served `is_maturing`, and Changes reads the served `state`. While the Trial
matures, both SHALL print "‹n› of ‹R› days". Once it is ready, both SHALL print
"‹N› days" with "‹R› required". Neither SHALL print "‹N› of ‹R›" with ‹N› greater
than ‹R›. The dock SHALL read "Maturing — ‹n› of ‹R› days since ‹MM-DD›" and
"Ready to judge — ‹N› days since ‹MM-DD› · ‹R› required", where ‹MM-DD› is the
served change date. A clamp MAY shape Changes' progress bar, never a printed
number.

#### Scenario: A completed Trial whose period spans fifteen dates prints fifteen on both surfaces

- **GIVEN** a synthetic store whose server serves an active Trial with
  `days_elapsed` 15, `days_required` 14 and a complete state
- **WHEN** Diagnose is seated, and then its dock's link opens Changes, at
  1280×720 and at 1440×900
- **THEN** the dock's detail reads "Ready to judge — 15 days since ‹MM-DD› ·
  14 required" for the served change date
- **AND** Changes' Watch maturity figure reads "15 days" with "14 required"
- **AND** Changes' Trial progress bar holds the value 14 of a maximum of 14

#### Scenario: A maturing Trial prints the same partial count on both surfaces

- **GIVEN** a served maturing Trial with `days_elapsed` 6 and `days_required` 14
- **WHEN** the dock's view and Changes' Watch maturity are rendered from it
- **THEN** the dock reads "Maturing — 6 of 14 days since ‹MM-DD›" and Changes
  reads "6 of 14 days"

### Requirement: No authored Guide article names Verify

Every authored Guide article served at `/api/kb/<slug>` SHALL name only
destinations the desk has, and none SHALL name Verify. The "Reading the Diagnose
surface" article SHALL say that Cause levers flow to a Focus followed in Changes.
The Guide's locked preface for the authored articles stays as it is.

#### Scenario: The served articles name no Verify

- **WHEN** each authored article (`start-here`, `reading-diagnose`, `reading-day`,
  `the-plan-tab`) is read from `/api/kb/<slug>`
- **THEN** no article's markdown contains "Verify"
- **AND** the `reading-diagnose` markdown says Cause levers flow to a Focus,
  followed in Changes

#### Scenario: The Guide renders the Diagnose article without Verify

- **GIVEN** the desk's Guide utility on a synthetic store
- **WHEN** the reader opens "Reading the Diagnose surface" at 1280×720 and at
  1440×900
- **THEN** the rendered article names no Verify and carries the Cause-lever line
  naming a Focus followed in Changes

### Requirement: Changes' Plan asks "what will I program into my pump?"

The desk has no separate Plan destination. The Plan is a seat in Changes
(ADR 397). Changes' Plan SHALL render the complete pump-entry schedule built from
the detected active profile plus the changes staged into it, with the capacity
copy "‹n› of ‹capacity› segments used" and "Nothing here is sent to your pump.".
It SHALL keep the detected pump settings distinct from the proposed schedule.
Saving a draft and recording a decision SHALL be durable writes. A recorded
Plan's phase SHALL come from its served verdict, as "Changes states a Plan's
phase from its served verdict" requires. Changes' Plan SHALL decide no Plan
phase from a pump comparison of its own.

#### Scenario: A staged change reads as the complete schedule in Changes' Plan

- **GIVEN** a synthetic store and a change staged from Diagnose
- **WHEN** Changes opens on the Plan at 1280×720 and at 1440×900
- **THEN** it renders the complete pump-entry schedule with "‹n› of ‹capacity›
  segments used" and "Nothing here is sent to your pump."
- **AND** Pump settings opens from Changes, distinct from the proposed schedule

## REMOVED Requirements

### Requirement: Verify surface asks "are my changes working?"

**Reason:** #416 retired v1's Verify surface. Changes owns Trial and Focus progress under ADR 397, and the desk renders no outcome trends or behavior-trend tiles, which were the rest of this requirement.
**Migration:** Use "Changes follows a watched Trial or Focus through" above. "The watch dock and Changes print one Trial day count" carries the maturity count both surfaces print.

### Requirement: Plan surface asks "what will I program into my pump?"

**Reason:** #416 retired v1's Plan page, and the Plan is a seat in Changes (ADR 397). A recorded Plan's reconciliation is the server's verdict (ADR 431), not a browser comparison. The desk offers no hand-edit layer.
**Migration:** Use "Changes' Plan asks 'what will I program into my pump?'" above and the existing "Changes states a Plan's phase from its served verdict".
