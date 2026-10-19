## ADDED Requirements

### Requirement: A Focus is kept under its own key

Every Focus SHALL have one subject: its Pattern's, `pattern:<key>`, when it was
pinned from a Pattern, else its habit's, `habit:<lever>` (ADR 528). A new pin
SHALL store that subject on its record. The Focus list and the active watch SHALL
serve it for every Focus, a record stored before habits had a key reading as its
habit, and a retried pin SHALL be matched against it. A Focus pinned on a habit no
Pattern owns SHALL carry no Pattern key and no outcome window, and its follow-up
SHALL be the lever's own comparison.

#### Scenario: Pinning a standalone habit keeps the habit's key

- **GIVEN** the `behavioral-missed-meal` QA case, whose missed-meal habit no
  Pattern owns
- **WHEN** the person pins it with its subject `habit:missed_meal`
- **THEN** the record, the Focus list and the active watch serve
  `habit:missed_meal`, with no Pattern key and no outcome window
- **AND** before any data after the pin, its retained comparison waits for that
  data
- **AND** the same request pinned again returns that same Focus

#### Scenario: A Focus recorded before habits had a key reads as its habit

- **GIVEN** a retained Focus record on a lever with no stored subject and no
  Pattern key
- **WHEN** the Focus list is read
- **THEN** it serves that Focus under `habit:<lever>`
