## ADDED Requirements

### Requirement: Diagnose's address names the case the reader is on

Once the reader acts inside Diagnose — picks a Finding or Pattern row, selects
or clears an Occurrence, chooses a clock window, picks a basal slot, or steps
back along the crumb — the desk SHALL replace the current address in place, with
no new history entry, so that it names the case on screen: its subject (the
Finding or Pattern row, or the basal slot), its Occurrence while one is
selected, and its window, plus a `from` that names a destination other than
Diagnose. It SHALL carry no date, moment, lever or return-focus key. At the
Findings index it SHALL carry no case. The address SHALL be rewritten whenever
the case on screen changes after a reader action, and SHALL NOT be rewritten by
the desk's own restoration of an entry. A Day return's own address SHALL stay as
it is until the reader acts.

The Day entry Diagnose writes SHALL take its subject, Occurrence and window from
the same case the address names, SHALL name its return target by the
Occurrence's served id, and SHALL carry no CSS selector. Returning SHALL put
focus on that Occurrence's own Open in Day control, whether the return re-reads
or is retained.

A return into a retained Diagnose whose context names no case SHALL be a
retained return whatever entry the desk last held, and the address SHALL then
name the retained case. Reloading a case address SHALL re-open that subject and,
when named, that Occurrence, applying the named window first when it is one of
the Window control's presets.

#### Scenario: Acting after a Day return re-addresses to the case on screen

- **GIVEN** the reader returned to Diagnose from Day on a Finding's case file with
  an Occurrence held
- **WHEN** the reader chooses the Overnight window, which keeps that case file
  open re-scoped
- **THEN** the address names that Finding and the Overnight window and carries no
  date, moment, lever or return-focus key
- **AND** the browser history holds no more entries than before the choice

#### Scenario: Stepping back to Findings leaves no case in the address

- **GIVEN** the reader acted inside Diagnose after a Day return
- **WHEN** the reader steps back along the crumb to Findings
- **THEN** the address is `/diagnose` with no subject, Occurrence or return-focus key
- **AND** reloading it lands on Findings with no case file open

#### Scenario: A case address re-opens its case

- **GIVEN** the reader selected an Occurrence in a Finding's case file in a clock
  window other than Overnight
- **WHEN** the address is reloaded
- **THEN** the same Finding opens in that window with the same Occurrence held

#### Scenario: The Day return lands on the same Occurrence without a selector

- **WHEN** the reader opens a held Occurrence in Day from its case file
- **THEN** the Day address names the Occurrence and carries no CSS selector
- **AND** returning holds that Occurrence and puts focus on its Open in Day control
- **AND** a return to the case Diagnose already held makes one status read and no
  guidance read

#### Scenario: A plain return after a Day visit keeps the retained drill

- **GIVEN** the reader returned to Diagnose from Day and then opened Changes
- **WHEN** the reader presses Diagnose
- **THEN** exactly one status read is issued and no guidance or evidence read
- **AND** the window and the drilled case are as the reader left them, and the
  address names that case
