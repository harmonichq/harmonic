## ADDED Requirements

### Requirement: On a phone the document never scrolls

The app's document SHALL never scroll or be scrollable: only a screen's page
(or a desktop pane, or the phone's Day month's weeks) SHALL scroll, so the
phone's tab bar stays at the bottom of the screen. Nothing a screen draws past
the screen's edge, a sheet rising from below it among them, SHALL make the
document scrollable, and a focus moved into a sheet as it opens SHALL NOT
scroll the document. The Advisory notice SHALL scroll as its own page where
the screen is too short for it.

#### Scenario: Log carbs rises on a phone

- **GIVEN** the Day tab on a 390 × 844 phone
- **WHEN** the person taps "+ Log carbs" and the sheet rises with its grams
  field focused
- **THEN** in no frame of the rise has the document scrolled or been
  scrollable, and the tab bar has not moved
