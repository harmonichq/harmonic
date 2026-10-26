## ADDED Requirements

### Requirement: Day's and Changes' writes draw their written state before the engine answers

Log carbs' Save SHALL close the entry and draw its mark on its day at once.
A refused save SHALL remove the mark, and the transient bar SHALL read "Not
saved" with Retry, which sends the same grams and time again; a Prompt
answer SHALL NOT clear that bar. The entry SHALL
have no Saving or Not saved state of its own. Confirming End SHALL draw at
once the screen the engine will serve after End: no active change, the
Previous count one more, and in the Previous list the ended change's row with
its served date and before → after. That row SHALL draw no result pill until
the engine's answer carries the result End saved. A refused End SHALL return
the active change with "Not saved" and Retry. Each screen SHALL draw a held
write by setting the served fields it writes. It SHALL NOT derive a verdict
or a count of its own.

#### Scenario: Log carbs draws its entry before the save is answered

- **GIVEN** the Day screen on today, with an engine that has not yet answered
  a carb save
- **WHEN** the person types 30 g in Log carbs and presses Save
- **THEN** the entry closes at once and a 30 g mark draws at its time
- **WHEN** the engine saves it
- **THEN** the mark is drawn as before

#### Scenario: A refused Log carbs save

- **GIVEN** a Log carbs entry drawn before its save was answered
- **WHEN** the engine refuses it
- **THEN** the mark leaves and the bar reads "Not saved" with Retry
- **WHEN** the person presses Retry
- **THEN** the same grams and time, on the same date, are sent again and the
  mark draws again

#### Scenario: End draws the ended screen before the engine answers

- **GIVEN** an active Trial, with an engine that has not yet answered an End
- **WHEN** the person confirms End
- **THEN** Changes reads "No active change" (or its Waiting rows), and the
  Previous count is one more
- **AND** in Previous, the ended Trial's row shows its date and before → after
  with no result pill
- **WHEN** the engine answers
- **THEN** the row carries the result End saved

## MODIFIED Requirements

### Requirement: A Prompt answer moves the Day badge when the Prompts land

A Prompt answer SHALL move the Day screen's badge and its Lows and Rises
counts at once, by the answers in flight, and SHALL resolve once the Prompts
are read again, when the counts are the served ones. Another tab's Day badge
SHALL move when the Prompts land. The live adapter SHALL hold the day on
screen as the day it last read for the Day screen. The answer SHALL be
followed by a read of that day alone. Every other day visited this session
SHALL be dropped and read again when it is next shown, drawing its loading
state until then, never its answer from before the Prompt answer.

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
