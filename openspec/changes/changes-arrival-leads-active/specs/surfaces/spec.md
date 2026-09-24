## MODIFIED Requirements

### Requirement: The watch dock opens Changes on the watched Trial or Focus

Activating the watch dock's link for a watched Trial or Focus SHALL open Changes
with an arrival that names the watch, and the address SHALL read
`/changes?subject=watch`. While the server serves an active change, that arrival
SHALL open the watched Trial's or Focus's own view in Changes. A Plan the reader
opened earlier in the same page session SHALL NOT take that seat, even when a
staged or saved Plan draft exists. When the server no longer serves an active
change, the arrival SHALL render what any other arrival to Changes renders.
Every other arrival to Changes SHALL follow the requirement "The served active
change leads every plain arrival to Changes".

#### Scenario: The link lands on the watched Trial

- **GIVEN** a synthetic store whose server serves an active Trial, with Diagnose
  seated
- **WHEN** the reader activates the dock's link
- **THEN** the desk is on Changes with the address `/changes?subject=watch`
- **AND** Changes shows that Trial's own view, titled for the served Trial

#### Scenario: The link lands on the watched Focus

- **GIVEN** a synthetic store whose server serves an active Focus, with Diagnose
  seated
- **WHEN** the reader activates the dock's link
- **THEN** the desk is on Changes with the address `/changes?subject=watch`
- **AND** Changes shows that Focus's own view

#### Scenario: A Plan opened earlier does not take the watched record's seat

- **GIVEN** earlier in the same page session the reader staged a concern and
  pressed Open Plan in Changes, and a staged Plan draft still exists
- **AND** the server now serves an active change
- **WHEN** Changes receives the dock's arrival
- **THEN** Changes opens the watched record's own view, not the Plan
- **AND** an explicit arrival to the Plan still opens the Plan

#### Scenario: A watch that has ended opens Changes as any arrival would

- **GIVEN** the reader pressed Open Plan earlier in the page session and a staged
  Plan draft exists
- **AND** the server serves no active change
- **WHEN** Changes receives the dock's arrival
- **THEN** Changes renders exactly what an arrival with no context renders

## ADDED Requirements

### Requirement: The served active change leads every plain arrival to Changes

A plain arrival to Changes is any arrival that asks neither for the Plan
(`/changes?subject=plan`) nor for the change record. That includes the topbar's
Changes, Diagnose's return to the watched change, the landing after a Focus pin,
a history step back to Changes and the watch dock's arrival. While the server
serves an active change, every plain arrival SHALL open the watched Trial's or
Focus's own view. A Plan the reader opened on an earlier visit SHALL NOT take
that seat, whether or not a staged, saved or pending Plan exists. An explicit
Plan arrival SHALL still open the Plan, and a change-record arrival SHALL still
open that record. The desk SHALL read which change is active from the served
disposition alone.

#### Scenario: The topbar's Changes after an earlier Open Plan lands on the watched Trial

- **GIVEN** the synthetic `basal-lower` store, where the reader staged the served
  basal concern, pressed Open Plan and recorded the decision
- **AND** a later synthetic pump read switches the profile, so the server serves
  an active Trial, and a Plan draft is saved while it runs
- **WHEN** the reader goes to Diagnose and then presses the topbar's Changes
- **THEN** Changes shows the Trial's own view, not the Plan

#### Scenario: Diagnose's return after an earlier Open Plan lands on the watched Trial

- **GIVEN** the same page, with the Trial's own view in Changes
- **WHEN** the reader inspects its nights in Diagnose and presses "Return to Trial"
- **THEN** Changes shows the Trial's own view, not the Plan

#### Scenario: The landing after a Focus pin lands on the Focus

- **GIVEN** earlier in the page session the reader staged a concern and pressed
  Open Plan, and the Plan still holds that staged change
- **AND** the server then serves an active Focus
- **WHEN** the desk arrives at Changes the way the Focus-pin landing does, with
  no context
- **THEN** Changes reads the watched record's follow-up and not the Plan

#### Scenario: An explicit Plan arrival still opens the Plan

- **GIVEN** the server serves an active change and the reader pressed Open Plan
  earlier
- **WHEN** Changes receives an arrival at `/changes?subject=plan`
- **THEN** Changes opens the Plan

### Requirement: Open Plan holds for the visit in which it was pressed

Pressing Open Plan in Changes SHALL open the Plan for the rest of that visit. A
re-render within the visit SHALL keep the Plan open. The next arrival to Changes
SHALL NOT reopen the Plan from that press. The desk SHALL clear the remembered
Plan-open state in one place, on each arrival. With nothing watched, a plain
arrival SHALL render what the served disposition leads with. For a staged
concern, that is its own frame, with "Staged", Undo and Open Plan. The served
`draft` and `pending_plan` dispositions SHALL still open the Plan. Stage pressed
in the Plan's own frame SHALL keep the reader on the Plan, with Save draft
focused.

#### Scenario: A plain return shows the staged concern, not the Plan

- **GIVEN** the synthetic `basal-lower` store, where the server serves no active
  change, and the reader staged the served concern and pressed Open Plan
- **WHEN** the reader leaves Changes and returns by the topbar
- **THEN** Changes shows the concern's own frame with "Staged", Undo and Open
  Plan, not the Plan
- **AND** pressing Open Plan opens the Plan again with the staged change

#### Scenario: A re-render within the visit keeps the Plan

- **GIVEN** the reader pressed Open Plan in Changes
- **WHEN** Changes renders again without a new arrival
- **THEN** the Plan is still what Changes shows

#### Scenario: Stage in the Plan's own frame keeps the Plan

- **GIVEN** the synthetic `basal-lower` store, where nothing is staged and the
  reader opened `/changes?subject=plan`
- **WHEN** the reader presses Stage change in the Plan's own frame
- **THEN** the desk stays on the Plan at the same address, showing the staged
  change, with Save draft focused

### Requirement: A Plan draft stays reachable while a change is watched

While the server serves an active change, the watched Trial's and Focus's own
view in Changes SHALL offer "Open Plan" whenever a Plan draft exists. A draft
exists when the guidance read serves a saved draft with items, or when the page
holds a staged or pending Plan. Open Plan SHALL open the Plan with an explicit
Plan arrival (`/changes?subject=plan`). With no draft, the view SHALL NOT offer
it. The Plan SHALL render as it does without a watch. The desk SHALL add no gate
of its own on recording that draft. The server's refusal SHALL show as a failed
record, with nothing recorded.

#### Scenario: A saved draft beside a watched Trial is reachable, and recording it is refused

- **GIVEN** the synthetic `basal-lower` store with an active Trial begun by a
  synthetic pump read, and a Plan draft saved while it runs
- **WHEN** the reader presses Open Plan on the Trial's own view
- **THEN** the desk is at `/changes?subject=plan` showing the saved draft, with
  Record decision offered
- **AND** pressing Record decision shows the record failed, and the served Plan
  history gains no record
- **AND** the next plain arrival to Changes shows the Trial's own view

#### Scenario: A saved draft beside a watched Focus is reachable

- **GIVEN** the synthetic `c3-focus` store with an active Focus, and a Plan draft
  saved while it runs
- **WHEN** the reader presses Open Plan on the Focus's own view
- **THEN** the desk is at `/changes?subject=plan` showing the saved draft

#### Scenario: No draft, no Open Plan

- **GIVEN** the server serves an active change and neither the guidance read nor
  the page holds a Plan draft
- **WHEN** Changes shows the watched change's own view
- **THEN** its nameplate offers no Open Plan

### Requirement: Diagnose's return names the watched change

When Diagnose is opened from the watched change's own view in Changes, its
return control SHALL name the kind of the served watched change. It reads
"Return to Trial" for a Trial and "Return to Focus" for a Focus. It SHALL land
on that change's own view.

#### Scenario: A watched Focus's return names the Focus

- **GIVEN** the synthetic `c3-focus` store with an active Focus
- **WHEN** the reader inspects the Focus's evidence in Diagnose
- **THEN** Diagnose offers "Return to Focus" and no "Return to Trial"
- **AND** pressing it shows the Focus's own view in Changes

#### Scenario: A watched Trial's return still names the Trial

- **GIVEN** a synthetic store whose server serves an active Trial
- **WHEN** the reader inspects the Trial's nights in Diagnose
- **THEN** Diagnose offers "Return to Trial", which lands on the Trial's own view
