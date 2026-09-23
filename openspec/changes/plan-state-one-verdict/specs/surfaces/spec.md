## ADDED Requirements

### Requirement: Changes states a Plan's phase from its served verdict

Changes SHALL name a recorded Plan's phase, status and Decision block from that
Plan's served verdict, and SHALL NOT decide from its own pump comparison whether
a Plan is on the pump. The phase SHALL read Pending for `pending`, Mismatch for
`mismatch`, On pump for `confirmed` while `on_pump` is true, and Confirmed for
`confirmed` once `on_pump` is false. The confirmed status SHALL name the served
`confirmed_at`, so a later pump read does not move it: "✓ On pump since
<confirmed_at> — the pump matches your plan." while the pump holds the Plan, and
"✓ Confirmed on the pump <confirmed_at>. The latest pump read no longer matches
this Plan." after it stops. The pending and mismatch status wording SHALL stay as
shipped. The browser's pump comparison SHALL only draw the planned-versus-pump
rows, and only under a served `mismatch`. The recorded Plan Changes reads SHALL
be the newest served record that is neither withdrawn nor superseded.

#### Scenario: A server-pending Plan with a matching pump read reads Pending

- **GIVEN** a recorded Plan whose served verdict is `pending` and a detected
  pump profile that holds its schedule
- **WHEN** Changes renders the Plan
- **THEN** the phase reads Pending and no status claims the pump matches

#### Scenario: The On pump time stays on the confirming read

- **GIVEN** a Plan served as `confirmed` with its `confirmed_at`
- **WHEN** a later pump read arrives and Changes renders again
- **THEN** the status still names the served `confirmed_at`, not the later read

#### Scenario: A confirmed Plan the pump no longer holds reads Confirmed

- **GIVEN** a Plan served as `confirmed` with `on_pump` false
- **WHEN** Changes renders the Plan
- **THEN** the phase reads Confirmed and the status says the latest read no
  longer matches

### Requirement: Changes keeps a recorded Plan apart from a newer draft

The Decision block SHALL describe only the recorded Plan: when it was recorded,
its pump confirmation (the served confirmed time, "Awaiting pump evidence", or
"The latest pump read doesn't match") and any re-key request. A draft saved while
a Plan is pending SHALL show as a separate line, "Next change: draft saved
<time>. It can be recorded once this Plan is confirmed or withdrawn.", never as
a field of the recorded Plan. With no Plan pending, a staged or saved draft SHALL
be the frame's subject: its phase SHALL read Staged or Draft saved, it SHALL NOT
be compared as a committed Plan, it SHALL offer Save draft and Record decision,
and the newest confirmed Plan SHALL show as a separate line, "Previous Plan:
recorded <time>, confirmed on the pump <confirmed_at>."

#### Scenario: A draft saved during a pending Plan stays out of its fields

- **GIVEN** a pending Plan and a draft saved after its decision
- **WHEN** Changes renders the Plan
- **THEN** the Decision block's fields carry the Plan's decision time and no
  draft time
- **AND** a next-change line names the draft's saved time

#### Scenario: A different draft after a confirmed Plan reads Draft saved

- **GIVEN** a Plan served as `confirmed` and a newer saved draft that differs
  from the detected pump profile
- **WHEN** Changes renders
- **THEN** the phase reads Draft saved and no status says the pump does not
  match the plan
- **AND** Save draft and Record decision are offered
- **AND** a previous-Plan line names the confirmed Plan

### Requirement: The watch panel carries a recorded Plan awaiting the pump

The Diagnose watch panel SHALL show a recorded Plan whose served verdict is
`pending` or `mismatch`, read from the guidance read's served pending Plan,
whenever no Trial or Focus is watched. Its kind SHALL read "Plan · awaiting
pump"; its title SHALL name the Plan's setting in the wearer's words (Basal,
Correction factor, Carb ratio, Target) and the month and day it was recorded, as
"Basal · recorded 09-20"; its detail SHALL read "Recorded — waiting for a pump
read that matches" under `pending` and "The latest pump read doesn't match this
Plan" under `mismatch`; its route SHALL read "Open Changes ›" and open Changes on
the Plan (`subject=plan`), never the watched-change address. A watched Trial or
Focus SHALL keep precedence over the Plan, and the Plan SHALL take precedence
over a draft staged on this surface. The staged-draft state SHALL route with
"Open Changes ›" to the same Plan address. A confirmed Plan SHALL hold no
watch-panel state.

#### Scenario: A pending Plan with nothing watched does not read idle

- **GIVEN** a served pending Plan, no watched Trial or Focus and no staged draft
- **WHEN** the watch panel renders
- **THEN** it reads "Plan · awaiting pump" with the Plan's setting and recorded
  day, and offers "Open Changes ›"

#### Scenario: A watched Trial outranks a pending Plan

- **GIVEN** a served pending Plan and a watched Trial
- **WHEN** the watch panel renders
- **THEN** it shows the Trial

#### Scenario: Open Changes lands on the Plan

- **GIVEN** the watch panel showing a pending Plan
- **WHEN** the reader activates "Open Changes ›"
- **THEN** Changes opens on the Plan at `subject=plan`

### Requirement: The case-file header carries no pending-Plan note

While a Plan is pending, the Diagnose case-file header SHALL carry no
pending-Plan note and no Plan route, for every selected case. Start Focus SHALL
stay withheld exactly as the served admission says. The same pending Plan SHALL
read the same in every window and case, carried by the watch panel alone.

#### Scenario: A Pattern case shows no pending-Plan note

- **GIVEN** a pending Plan and a selected case that links to a Pattern
- **WHEN** Diagnose renders the case file at each supported desktop size
- **THEN** the header shows no pending-Plan note, no Plan route and no Start
  Focus
- **AND** the watch panel shows the pending Plan

#### Scenario: Two windows read the same pending Plan the same way

- **GIVEN** a pending Plan
- **WHEN** the reader moves Diagnose between two windows
- **THEN** the watch panel reads the same in both and neither case-file header
  carries a pending-Plan note
