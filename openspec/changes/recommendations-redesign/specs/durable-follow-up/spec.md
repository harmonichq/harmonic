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

### Requirement: An unreconciled admission still names the change it admitted

When an input has committed since the follow-up frontier was last reconciled, as
each window of a fetch does before the fetch reconciles, the admission SHALL be
unavailable for reconciliation and SHALL permit no End and no Focus pin. It
SHALL still name the change the frontier last admitted, its kind, identity and
maturity, so a read in that span shows the active change as last known rather
than no active change (#557).

#### Scenario: A fetch's status write does not hide the active Trial

- **GIVEN** a synthetic store whose reconciled frontier admits a live Trial
- **WHEN** a fetch status is recorded and the Trial roster is read before any
  reconcile
- **THEN** the admission is unavailable for reconciliation, with no End and no
  Focus pin
- **AND** it names that Trial as the active change

### Requirement: No local write leaves a current frontier behind

A credentials save and a pattern sign-off SHALL run the existing local
reconciliation after they commit, as a carb, prompt or preference write does. A
late conclusion, which never reconciles, SHALL carry a frontier that was current
when it began forward with it, and SHALL leave one that was behind for the next
reconcile (#557).

#### Scenario: Each write keeps the admission available

- **GIVEN** a synthetic store whose frontier is reconciled, admitting a live
  Trial where one is recorded
- **WHEN** credentials are saved, a cleared pattern is signed off, or an expired
  Trial takes a late conclusion
- **THEN** the next admission read is available
- **AND** it names the live Trial it admitted
