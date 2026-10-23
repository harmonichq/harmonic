## ADDED Requirements

### Requirement: On the phone an open Queue card swipes to Snooze and closes to its row

On the phone the open Pattern, habit or Setting card SHALL swipe to Snooze by a
Queue row's rule and exit: its reveal SHALL fill while a release would commit,
and on a commit it SHALL slide off and close its height before it is snoozed,
with the bar and Undo. The phone's open card SHALL draw no Snooze text action;
the desktop's open card SHALL keep it, with the shortcut S. On the phone the open
card's chevron SHALL be a control that closes the card to its row, leaving no
card open, and tapping a row SHALL open its card. The closed state SHALL belong
to the mounted screen only, so a tab change SHALL open the top card again.

#### Scenario: Swiping the open card snoozes it after it has gone

- **GIVEN** the phone Queue with a card open
- **WHEN** the person drags the card left past half its width and releases
- **THEN** the reveal is filled before the release, the card slides off and
  closes up, and then the bar reads "Snoozed until <date>" with Undo

#### Scenario: A swipe over a button does not press it

- **GIVEN** the phone Queue with a Setting card open
- **WHEN** the person drags left from Done, short of the commit rule, and
  releases
- **THEN** the card eases back, nothing is snoozed and Done is not pressed

#### Scenario: Snooze is a swipe on the phone and a text action on desktop

- **WHEN** the Queue draws an open card
- **THEN** on the phone the card has no Snooze button, and on desktop it has
  one beneath its primary

#### Scenario: The chevron closes the open card

- **GIVEN** the phone Queue with a card open
- **WHEN** the person taps the card's chevron
- **THEN** every item is a row and none is open, and tapping a row opens its
  card

## MODIFIED Requirements

### Requirement: A multi-cause Pattern opens a drill-down of its causes

A Pattern whose counter serves more than one cause (`cause_counts` on its
Pattern row, or on the row of the habit it is served as) SHALL be drawn on the
Queue with its count, impact line, trace chart and Snooze (on the phone, the
card's swipe; on desktop, its text action), and no Focus button.
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
  other card shows its chart and, on the Queue, Snooze (on the phone, the
  card's swipe; on desktop, its text action)

#### Scenario: A cause the engine will not focus has no button

- **GIVEN** the `pattern-correction-collapse` QA case, whose Lows after
  correcting highs serves Correction on active insulin as `pinnable` and
  Correction stacking as not
- **WHEN** its drill-down renders
- **THEN** Correction on active insulin's card offers Focus and Correction
  stacking's card offers none, with its head at the same height
