## ADDED Requirements

### Requirement: The watch dock reports the saved Plan draft

The Diagnose watch dock SHALL read the guidance read's served Plan draft. Its
precedence is unchanged: a watched Trial, then a watched Focus, then a recorded
Plan awaiting the pump, then a staged Plan, then idle. The staged Plan state
SHALL read "Plan · staged" whenever the served draft holds items and no stage
save the surface issued is in flight, even when the Diagnose surface marks
nothing as staged. When the surface's own staged marks name a change, the dock
SHALL name it as it does today, with the served direction and values. When they
name none, the dock SHALL name the draft from its own items: the setting in the
wearer's words and the span the items cover, with no direction. It SHALL print a
current-to-proposed pair only where every draft item carries the same pair.
While a stage save the surface issued is in flight, the dock SHALL NOT report
the served draft, which is the one read before the press. The dock SHALL derive
no direction, floor or eligibility from the draft.

#### Scenario: A saved draft with no marks on the surface reads staged

- **GIVEN** a served Plan draft holding basal rows at 03:00 and 03:30, no
  watched Trial or Focus, no recorded Plan awaiting the pump, no staged marks on
  the Diagnose surface and no stage save in flight
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

#### Scenario: An Undo in flight does not read staged

- **GIVEN** a basal change staged from Diagnose and saved as the only change in
  the Plan draft
- **WHEN** the reader presses Undo on it and the save has not yet settled
- **THEN** the watch dock does not read "Plan · staged"

#### Scenario: A watched change and a recorded Plan still outrank the draft

- **GIVEN** a served Plan draft with items
- **WHEN** a Trial or a Focus is watched, or a recorded Plan awaits the pump
- **THEN** the watch dock reports that object, not the draft

### Requirement: Diagnose's staged marks follow the Plan draft

The Diagnose surface's staged marks (the lane marks, each stage control's
staged state and the watch dock's staged line) SHALL agree with the Plan draft
whichever of the Plan read and the Diagnose payload lands first, after a return
to Diagnose from another destination, and after a stage save settles. The
surface SHALL clear its marks and ask the staging verdict again whenever it
refreshes while no stage save it issued is in flight, and once an accepted
stage save settles, so a mark the draft no longer holds drops. A return to
Diagnose SHALL re-read the Plan draft and guidance before it refreshes, except
while a stage save the surface issued is pending, when it SHALL skip that
re-read. A
refresh that lands while a save is in flight SHALL NOT undo the mark the press
painted. The verdict SHALL be the Plan surface's own, unchanged: the saved
draft, or a pick made in Changes and not yet saved. The surface SHALL derive no
staging eligibility of its own: a mark follows the draft only where the analysis
lets that item stage.

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
  page, and then presses Diagnose while the Plan read is held until the
  Diagnose payload has settled
- **THEN** the watch dock reads "Plan · staged"

#### Scenario: Undoing the only staged change leaves nothing staged

- **GIVEN** a basal slot staged from Diagnose and saved as the only change in
  the Plan draft
- **WHEN** the reader presses Undo on it and the save settles
- **THEN** its stage control reads "Stage change"
- **AND** the watch dock reads "Nothing being watched"

#### Scenario: A refresh during a stage save keeps the pressed mark

- **GIVEN** the reader has pressed Stage change on a basal slot and its draft
  save has not yet settled
- **WHEN** Diagnose refreshes, as on a return from another destination
- **THEN** the slot's lane cell stays marked staged and its stage control keeps
  "Staged · Undo"

#### Scenario: A draft changed elsewhere drops the stale mark on return

- **GIVEN** a basal run staged from Diagnose and saved
- **WHEN** the reader goes to Changes, the saved draft is replaced through the
  Plan route by one basal row at a slot the analysis does not let stage, and
  the reader presses Diagnose in the top nav
- **THEN** the run's lane cells are no longer marked staged and their stage
  control reads "Stage change"
- **AND** the watch dock reads "Plan · staged" named for the new row

#### Scenario: A return during a stage save keeps the saved change marked

- **GIVEN** the reader has pressed Stage change on a basal slot and its draft
  save has not yet settled
- **WHEN** the reader goes to Changes, presses Diagnose in the top nav, and the
  save then settles
- **THEN** the slot's lane cell stays marked staged, because the return did not
  re-read the Plan draft while the save was pending
