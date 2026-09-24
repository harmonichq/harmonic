## ADDED Requirements

### Requirement: The watch dock reports the saved Plan draft

The Diagnose watch dock SHALL read the guidance read's served Plan draft. Its
precedence is unchanged: a watched Trial, then a watched Focus, then a recorded
Plan awaiting the pump, then a staged Plan, then idle. The staged Plan state
SHALL read "Plan · staged" whenever the served draft holds items, even when the
Diagnose surface marks nothing as staged. When the surface's own staged marks
name a change, the dock SHALL name it as it does today, with the served
direction and values. When they name none, the dock SHALL name the draft from
its own items: the setting in the wearer's words and the span the items cover,
with no direction. It SHALL print a current-to-proposed pair only where every
draft item carries the same pair. The dock SHALL derive no direction, floor or
eligibility from the draft.

#### Scenario: A saved draft with no marks on the surface reads staged

- **GIVEN** a served Plan draft holding basal rows at 03:00 and 03:30, no
  watched Trial or Focus, no recorded Plan awaiting the pump, and no staged
  marks on the Diagnose surface
- **WHEN** the watch dock renders
- **THEN** it reads "Plan · staged" with the title "Basal 03:00 to 04:00"
- **AND** its title carries no direction
- **AND** it offers "Open Changes ›" to the Plan

#### Scenario: A draft the analysis no longer admits still reads staged

- **GIVEN** a served Plan draft holding a basal row whose slot the current
  analysis no longer lets stage, and no staged marks on the surface
- **WHEN** the watch dock renders
- **THEN** it reads "Plan · staged" and its title names Basal

#### Scenario: Values print only where every draft item carries the same pair

- **GIVEN** a served Plan draft whose items carry different current values, or
  carry none
- **WHEN** the watch dock names the draft from its own items
- **THEN** its detail line carries no current-to-proposed pair

#### Scenario: A watched change and a recorded Plan still outrank the draft

- **GIVEN** a served Plan draft with items
- **WHEN** a Trial or a Focus is watched, or a recorded Plan awaits the pump
- **THEN** the watch dock reports that object, not the draft

### Requirement: Diagnose's staged marks follow the saved Plan draft

The Diagnose surface's staged marks (the lane marks, each stage control's
staged state and the watch dock's staged line) SHALL agree with the saved Plan
draft whichever of the Plan read and the Diagnose payload lands first, and
after a return to Diagnose from another destination. The surface SHALL ask the
staging verdict again whenever it refreshes, except while a stage save it
issued is in flight, so a repaint never undoes the mark a press has just
painted. It SHALL derive no staging eligibility of its own: a mark follows the
draft only where the analysis lets that item stage.

#### Scenario: A fresh seat whose Plan read lands last shows the saved draft

- **GIVEN** a saved basal draft for a slot the analysis lets stage
- **WHEN** Diagnose seats fresh and the Plan read lands after the Diagnose
  payload has settled
- **THEN** that slot's lane cell is marked staged, its stage control reads
  "Staged · Undo", and the watch dock reads "Plan · staged"

#### Scenario: A draft saved in Changes shows on return to Diagnose

- **GIVEN** Diagnose was opened, then the reader staged the leading concern's
  action in Changes and saved the draft
- **WHEN** the reader opens the change records and then presses Diagnose in the
  top nav
- **THEN** the watch dock reads "Plan · staged"
- **AND** "Open Changes ›" lands on the Plan

#### Scenario: A reload before returning keeps the draft on the dock

- **GIVEN** a basal change staged from Diagnose and saved
- **WHEN** the reader goes to Changes, opens the change records, reloads the
  page, and then presses Diagnose in the top nav
- **THEN** the watch dock reads "Plan · staged"
