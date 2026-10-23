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
