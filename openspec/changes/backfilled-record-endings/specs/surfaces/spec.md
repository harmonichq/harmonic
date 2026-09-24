## ADDED Requirements

### Requirement: Changes reads an older detected change's ending

A retained Trial record that a reconcile has ended SHALL read its served ending
in the Changes roster: the ending's words and its effective time, never "Still
open". This holds for a record first recorded after its ending. Opening the
record SHALL show that saved ending. Its periods note SHALL name the data
read-through time that the saved assessment carries.

#### Scenario: A superseded older change reads its ending, not Still open

- **GIVEN** the synthetic `c4-ic` case, whose one reconcile recorded carb-ratio
  changes on 06-01 and 06-10, with the 06-01 record past its watch window
- **WHEN** the reader opens the Changes records roster
- **THEN** the 06-01 record's row reads "Superseded by a later change" with its
  effective time, and carries no still-open cell
- **AND** opening it shows a saved ending of kind `superseded` whose periods note
  reads data through the same instant the ending names

### Requirement: A superseded ending's note names no setting

The saved-ending note for a `superseded` ending SHALL read "A later setting change
was detected inside the watch window. This record keeps the period it actually
observed." It SHALL NOT say that the later change was to the same setting, because
a later change of any setting ends a watch.

#### Scenario: The superseded note does not claim the same setting

- **GIVEN** a record whose saved ending is `superseded`
- **WHEN** its saved-ending part renders
- **THEN** the note reads "A later setting change was detected inside the watch
  window. This record keeps the period it actually observed."
- **AND** it does not contain "same setting"

### Requirement: A saved assessment bounded out by a later pump read says why in words

The desk's one word table for comparison reasons SHALL carry words for
`context_after_ending`: "its retained context was read from the pump after this
change ended". Every reason line that prints through that table SHALL print those
words for that code, never the code.

#### Scenario: The context-after-ending reason has words

- **GIVEN** the served reason `context_after_ending`
- **WHEN** the desk's word table names it
- **THEN** it reads "its retained context was read from the pump after this
  change ended", with no underscore
