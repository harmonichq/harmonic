## ADDED Requirements

### Requirement: On a phone the document never scrolls

While the tab bar is drawn, the app's document SHALL never scroll or be
scrollable: only a screen's page (or the phone's Day month's weeks) SHALL
scroll, so the tab bar stays at the bottom of the screen. Nothing a screen
draws past the screen's edge, a sheet rising from below it among them, SHALL
make the document scrollable, and a focus moved into a sheet as it opens SHALL
NOT scroll the document. In the rail layout, on a screen shorter than the
rail, every control SHALL still be able to be brought on screen.

#### Scenario: A sheet rises on a phone

- **GIVEN** a 390 × 844 phone, on Day or on Settings' Tandem Source
- **WHEN** the person taps "+ Log carbs" or Update and the sheet rises with
  its field focused
- **THEN** in no frame of the rise has the document scrolled or been
  scrollable, and the tab bar has not moved

#### Scenario: A short wide screen in the rail layout

- **GIVEN** the Queue on an 844 × 340 screen, a row selected
- **WHEN** the person scrolls to the detail's Snooze, then to the rail's last
  item
- **THEN** each is wholly on screen
