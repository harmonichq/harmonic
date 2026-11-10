## ADDED Requirements

### Requirement: Every drill-down goes back and forward through history

The Queue's drill-downs, Changes' Previous, and Settings' Tandem Source, Pump
profile and Glossary SHALL each open with one history entry at the tab's own
address, marked with which drill-down it is (ADR 594, ADR 669). The drill-down's
"‹ Parent" and the platform's Back SHALL both return to the tab's own screen; a
Back from another tab onto the entry SHALL open that drill-down as it was; a
Forward onto the entry SHALL open that drill-down again, unless it has nothing
left to show, when it SHALL leave at once to the tab's own screen; and a reload
SHALL land on the tab.

#### Scenario: Back from Previous stays on Changes

- **GIVEN** Changes with Previous open
- **WHEN** the person goes Back, by the platform's gesture or "‹ Changes"
- **THEN** Changes shows its own screen, at the same address

#### Scenario: Forward reopens a Settings drill-down

- **GIVEN** Settings, after Glossary was opened and the person went Back
- **WHEN** the person goes Forward
- **THEN** Glossary shows again under "‹ Settings"

#### Scenario: Forward reopens the Queue's drill-down

- **GIVEN** the Queue, after a Pattern's drill-down was left with Back
- **WHEN** the person goes Forward
- **THEN** that Pattern's drill-down shows again with its causes

#### Scenario: Forward onto an emptied drill-down leaves it

- **GIVEN** the Queue, after Snoozed was left with Back and its last item was restored
- **WHEN** the person goes Forward
- **THEN** the Queue shows its own screen, not an empty Snoozed
