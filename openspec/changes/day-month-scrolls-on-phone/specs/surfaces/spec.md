## ADDED Requirements

### Requirement: The phone's Day month ends above the tab bar and scrolls its weeks

On phone, the Day month drop-down SHALL end at least a tap's strip of scrim
above the tab bar, and the device's bottom inset under it, at every phone size
and for a month of any number of weeks. Where its weeks do not fit, they SHALL
scroll inside it while its name and ‹ › stay in place, and it SHALL open with
the selected day's week in view. Tapping the strip SHALL close it unchanged.
This panel SHALL be the only component that scrolls on its own (the lock's
§2.3 ban 6 exception of 2026-11-10); the story check SHALL allow it by name and
fail any other nested scroll area. Its scrolling weeks SHALL NOT be a Tab stop
of their own, and Escape SHALL still close it and return focus to the header's
day.

#### Scenario: A six-week month on a phone

- **GIVEN** a month spanning six weeks, dropped down on a 375 × 812 phone with
  a home indicator
- **WHEN** the person scrolls its weeks to the end
- **THEN** the drop-down ends at least 44 px above the tab bar, its name and
  ‹ › have not moved, and the last week is wholly in view
- **AND** tapping a day in that week opens that day

#### Scenario: A short phone opens on the selected week

- **GIVEN** the latest day selected on a 375 × 667 phone
- **WHEN** the month drops down
- **THEN** the selected day's week is in view, and a tap on the scrim beneath
  the drop-down closes it with the day unchanged

#### Scenario: Any other nested scroll area still fails

- **GIVEN** a story that draws the month's weeks scrolling outside the phone's
  month drop-down
- **WHEN** the Storybook gate checks it
- **THEN** it reports a nested scroll area there, and none for the month's own
