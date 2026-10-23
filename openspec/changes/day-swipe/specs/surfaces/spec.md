## ADDED Requirements

### Requirement: A phone swipe on the Day body steps to the adjacent day with data

On the phone, a horizontal swipe on the Day body SHALL step to the previous
or the next day with data, by the same axis lock, flick speed and
pointer-cancel rule as a Queue row's swipe. The body SHALL follow the finger
one to one both ways, and the day it would step to SHALL be drawn beside it, coming in
from the side the finger moves away from: moving left shows the next day,
moving right the previous. A release SHALL step when the finger has travelled
half the body's width that way, or is moving that way faster than 500 px/s
having travelled at least the flick's minimum, and that way had a served day
with data when the press became a swipe; otherwise the body SHALL ease back.
Where no served day with data lies that way, the body SHALL be resisted and
SHALL ease back. A press that starts at either screen edge SHALL be left to the
platform. The step SHALL cross month boundaries through the day navigator,
reading the next month when the served weeks do not reach a day with data.
The stepped-to day's chart SHALL be its skeleton until its timeline is
served. The swipe SHALL NOT exist on desktop or inside the Prompts. Under
reduced motion nothing SHALL travel after release: a step SHALL change the day
in place.

#### Scenario: A swipe left past half steps to the next day with data

- **GIVEN** the phone Day screen on a day with a later day with data
- **WHEN** the person drags the body left past half its width and releases
- **THEN** the next day slides in from the right, the header names it, and its
  chart is drawn, or its skeleton while its timeline loads

#### Scenario: A swipe right steps to the previous day, across a month

- **GIVEN** the phone Day screen on the first day with data of a month
- **WHEN** the person swipes the body right past half its width
- **THEN** the header names the previous month's last day with data

#### Scenario: The last day with data resists

- **GIVEN** the phone Day screen on the latest day with data
- **WHEN** the person drags the body left past half its width and releases
- **THEN** the body moved less than the finger and eases back, and the header
  still names the same day

#### Scenario: A short drag eases back

- **WHEN** the person drags the body less than half its width, slowly, and
  releases
- **THEN** the body eases back and the day is unchanged

#### Scenario: An edge press is the platform's

- **WHEN** the person's press starts at the screen's left or right edge and
  moves across
- **THEN** the body does not move and the day is unchanged

#### Scenario: A vertical drag scrolls and never steps

- **WHEN** the person's press moves down 10 px before it moves across
- **THEN** the body does not move across and the day is unchanged

#### Scenario: The Prompts keep their own swipe

- **GIVEN** the phone Day screen's Prompts
- **WHEN** the person swipes the card past half its width
- **THEN** it records Not sure as before, and the day is unchanged
