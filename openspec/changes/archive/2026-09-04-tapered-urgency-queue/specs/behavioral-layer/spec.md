## ADDED Requirements

### Requirement: Event alignment windows are per exposure family

Every Finding case file's event projection SHALL align on its policy's
per-family window, in minutes relative to the anchor: meals (−60, +300), lows
(−60, +120), correction clusters (−120, +180), highs (−150, +300). The served
`window_min` SHALL equal that window and every served cohort trace SHALL cover
no minute outside it. 

#### Scenario: A low's comparison opens one hour before the nadir

- **WHEN** a case file is prepared for a lows-family Lever with event alignment
- **THEN** its `window_min` is [-60, 120]
- **AND** no cohort trace carries a minute outside that window

#### Scenario: A correction cluster's comparison opens two hours before the pair

- **WHEN** a case file is prepared for the correction-stacking Lever with event alignment
- **THEN** its `window_min` is [-120, 180]



#### Scenario: Meals and highs are unchanged

- **WHEN** a case file is prepared for a meals-family or highs-family Lever
- **THEN** its `window_min` is [-60, 300] or [-150, 300] respectively
