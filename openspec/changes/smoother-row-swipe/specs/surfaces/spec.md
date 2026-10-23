## ADDED Requirements

### Requirement: A phone swipe shows its decision before release and leaves before it acts

A Queue row's Snooze swipe and a Prompt's Not sure swipe SHALL become a swipe
only once the press has moved 10 px and more across than down, and a press
that moves down first SHALL never become one. The swiping element SHALL track
the finger one to one up to its reveal and with resistance past it, and SHALL
never be drawn right of rest. A release SHALL commit when the finger has
travelled half the element's width to the left, or is moving left faster than
500 px/s having travelled the reveal's full width; otherwise, and on a pointer
cancel, the element SHALL ease back to rest. While a release would commit, the reveal SHALL be filled with the
accent's tint. On a commit a Queue row SHALL slide off to the left and then
close its height before it is snoozed, and the bar SHALL rise only after it
has gone. Under reduced motion nothing SHALL travel after release: the commit SHALL fade
the row out where the finger left it and the cancel SHALL return it at once.

#### Scenario: A slow drag past half snoozes after the row has gone

- **GIVEN** the phone Queue with a row that is not open
- **WHEN** the person drags the row left past half its width and releases
- **THEN** the reveal is filled before the release, the row slides off and
  closes up, and then the bar reads "Snoozed until <date>" with Undo

#### Scenario: A short drag eases back

- **GIVEN** the phone Queue
- **WHEN** the person drags a row left less than half its width, slowly, and
  releases
- **THEN** the reveal is never filled, the row eases back to rest, and no
  snooze is written

#### Scenario: A flick snoozes short of half

- **WHEN** the person flicks a row left faster than 500 px/s and releases
  before half its width
- **THEN** the row is snoozed as a slow drag past half is

#### Scenario: A cancelled gesture never snoozes

- **WHEN** the system cancels the pointer while the row is past half its width
- **THEN** the row eases back and no snooze is written

#### Scenario: A vertical drag scrolls and never swipes

- **WHEN** the person's press moves down 10 px before it moves across, then
  across
- **THEN** no row moves and no reveal is drawn
