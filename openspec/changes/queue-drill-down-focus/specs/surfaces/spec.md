## ADDED Requirements

### Requirement: A multi-cause Pattern opens a drill-down of its causes

A Pattern whose counter serves more than one cause (`cause_counts` on its
Pattern row, or on the row of the habit it is served as) SHALL be drawn on the
Queue with its count, impact line, trace chart and Snooze, and no Focus button.
Its trace chart SHALL be a control marked only with a trailing "›", which opens
the Pattern's drill-down. The drill-down SHALL show "‹ Queue" above the
Pattern's served title, then one open card per served cause in the served
order, each with the cause's served title, its served count over the Pattern's
own count in the Pattern card's form, the cause's served trace against the
Pattern's Typical, and the cause's Focus button as an outlined secondary in the
card's head. The drill-down SHALL draw no primary, no Snooze and no other
Queue item, and SHALL sort, filter or re-count no cause. On the phone it SHALL
replace the Queue above the tab bar and scroll as one page; on desktop it SHALL
open in the detail pane beside the list. "‹ Queue", the platform's Back and, on
desktop, Escape SHALL return to the Queue with the same card open, and the
address SHALL not change.

#### Scenario: The two-cause meal Pattern opens its causes

- **GIVEN** the `pattern-meal-two-causes` QA case, whose Highs after meals
  serves Late bolus (3) then Carb undercount (4) of its 7 meals
- **WHEN** the Queue opens Highs after meals
- **THEN** its card has no Focus button and its chart carries a trailing "›"
- **AND** tapping the chart shows "‹ Queue" over Highs after meals, then Late
  bolus, 3 of 7 meals, then Carb undercount, 4 of 7 meals, each drawing its
  own served trace against Typical, and no primary

#### Scenario: Back returns to the same card

- **GIVEN** the drill-down of Highs after meals, opened from its Queue card
- **WHEN** the person taps "‹ Queue", or goes Back, or presses Escape on desktop
- **THEN** the Queue shows with Highs after meals open, at the same address

#### Scenario: A single-cause Pattern keeps its button

- **GIVEN** a Pattern whose counter serves one cause or none
- **WHEN** the Queue opens it
- **THEN** its card offers Focus as before, and its chart opens nothing

### Requirement: A Focus is started from its own cause and announced

Every Pattern, habit and cause card's Focus action SHALL read "Focus". A
cause card's Focus SHALL start a Focus on that cause's lever under the
Pattern, and the write SHALL name that lever; a single-cause Pattern's and a
habit's Focus SHALL be sent as before. A started Focus SHALL show the transient
bar "Focus started" with the text action "Changes", which opens the Changes
tab; a refused or failed one SHALL put the card back with "Not saved" and
Retry. While a cause is the Pattern's active Focus, the Pattern's Queue card
SHALL show the caption "Focus" over that cause's served title in the button's
place, and the cause's card SHALL show the Focus pill in its button's place;
when no served cause names the watched lever, the Queue card SHALL show the
Focus pill.

#### Scenario: Focus on the second cause watches it

- **GIVEN** the `pattern-meal-two-causes` drill-down, where Carb undercount is
  the Pattern's first member and Late bolus is served first
- **WHEN** the person presses Focus on Late bolus
- **THEN** a Focus starts on Late bolus under Highs after meals, and the bar
  reads "Focus started" with Changes
- **AND** the Late bolus card shows the Focus pill, and the Queue card shows
  "Focus" over Late bolus

#### Scenario: Changes opens from the bar

- **WHEN** the person taps Changes in the "Focus started" bar
- **THEN** the Changes tab opens on that Focus

#### Scenario: A failed Focus is not saved

- **WHEN** a cause's Focus write fails
- **THEN** its card shows its Focus button again, and the bar reads "Not
  saved" with Retry

### Requirement: The Focus button shows only where the engine would start one

Every Focus button on the Queue and the drill-down SHALL render only while
`GET /api/focus` serves `admission.focus_pin.available` as true, and a cause
card's only while its served cause is `pinnable`. The card of the active
Focus SHALL show its pill. Nothing SHALL explain an absent button, and a cause
card's head SHALL keep the button's height in every state.

#### Scenario: No button while a change is watched

- **GIVEN** a store whose served admission is unavailable because a Focus is
  active
- **WHEN** the Queue and a drill-down render
- **THEN** no card offers Focus, the watched card shows its pill, and every
  other card shows its chart and, on the Queue, Snooze

#### Scenario: A cause the engine will not focus has no button

- **GIVEN** the `pattern-correction-collapse` QA case, whose Lows after
  correcting highs serves Correction on active insulin as `pinnable` and
  Correction stacking as not
- **WHEN** its drill-down renders
- **THEN** Correction on active insulin's card offers Focus and Correction
  stacking's card offers none, with its head at the same height

### Requirement: The snooze bar names its date in one phrase

The transient bar after a snooze SHALL read "Snoozed until <date>", the date
fourteen days after the engine's served decision time, with Undo.

#### Scenario: Snoozing shows the date

- **WHEN** the person snoozes a Queue item
- **THEN** the bar reads "Snoozed until" and the served date, with Undo
