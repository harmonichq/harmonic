## MODIFIED Requirements

### Requirement: A Prompt answer moves the Day badge when the Prompts land

A Prompt answer SHALL move the Day screen's badge and its Lows and Rises
counts at once, by the answers in flight, and SHALL resolve once the Prompts
are read again, when the counts are the served ones. The live adapter SHALL
hold each answer from when it is made until a Prompts read begun after it was
saved, and a refused answer, with its prompt, until it is sent again, so that
leaving the Prompts or the tab loses none and a saved answer never reads as
unanswered (ADR 677). Each answer SHALL be sent as it is made, so that one
sent outlives the page. The Prompts SHALL be read again once no answer is in
flight, once for every answer made meanwhile, and each of those answers SHALL
resolve then. Another tab's Day badge SHALL move when the Prompts land. The
live adapter SHALL hold the day on screen as the day it last read for the Day
screen. The answers SHALL be followed by a read of that day alone. Every other
day visited this session SHALL be dropped and read again when it is next
shown, drawing its loading state until then, never its answer from before the
Prompt answer.

#### Scenario: Answering a Prompt with three days visited

- **GIVEN** the person has shown three days this session
- **WHEN** the person answers a Prompt
- **THEN** the Day badge and the count of the Prompt's kind are one less at
  once, and unchanged once the Prompts land; the day on screen is read again
  after them, and the other two days are not read
- **WHEN** the person shows one of the other two days
- **THEN** it draws its loading state, is read, and draws

#### Scenario: A refused answer returns its count

- **GIVEN** a Prompt answered with an engine that refuses it
- **WHEN** the engine refuses the answer
- **THEN** the card is back, and the badge and the count read as served, with
  "Not saved" and Retry

#### Scenario: Answers made row after row, then Back

- **GIVEN** the Lows, with two lows, and an engine that answers neither yet
- **WHEN** the person answers the first, goes Back to Day, opens the Lows
  again and answers the other
- **THEN** the Lows open on the other low, never the one being saved, and both
  answers are sent, one each
- **AND** the Prompts are read again once, after both are answered
- **WHEN** the engine refuses the second
- **THEN** its low is back in the count, and Day's bar reads "Not saved" with
  Retry, which sends it again

## ADDED Requirements

### Requirement: The Lows and Rises leave after their last answer, through history

The Lows and the Rises SHALL each open with one history entry at Day's address,
marked with which they are, as the other drill-downs do (ADR 669): "‹ Day" and
the platform's Back SHALL both return to Day, and a Forward onto the entry
SHALL open them again. Past the last prompt of their kind, as its answer is
drawn, and on a Back or Forward onto their entry with no prompt left, they
SHALL leave at once to Day through that entry; a Yes on the last SHALL leave
once its Next lets the card go, keeping "Recorded" and its grams field until
then (ADR 677).

#### Scenario: The last low answered

- **GIVEN** the Lows with one low left
- **WHEN** the person answers No
- **THEN** Day shows at once, with no Lows row and no badge, before the engine
  answers

#### Scenario: The platform's Back from the Lows stays on Day

- **GIVEN** the Lows open
- **WHEN** the person goes Back, by the platform's gesture or "‹ Day"
- **THEN** Day shows its own screen, at the same address

#### Scenario: Forward onto Lows with none left

- **GIVEN** Day, after the Lows were left with Back and every low was answered
- **WHEN** the person goes Forward
- **THEN** Day shows its own screen, not an empty Lows
