## ADDED Requirements

### Requirement: The basal evidence names why its nights were excluded

The Diagnose basal evidence tile and the basal slot panel SHALL name each nonzero
served excluded-night reason with its served count, beside the served
excluded-night total, in rank order and in these reader words: "before the
current rate" (`before_current_setting`), "low or suspended"
(`below_range_or_suspended`), "high" (`above_range`), "insulin on board"
(`insulin_acting`), "logged carbs" (`carb_log`) and "other reasons" (`other`). A
reason whose count is zero SHALL NOT print.

At full furniture the verdict rail SHALL carry the total on its own row, labelled
"excluded", followed by one row per nonzero reason, and no rail text SHALL overlap
another or cross the footer rule. At the middle rank the tally line SHALL end with
the total and, when its count is nonzero, the "low or suspended" count. The tile's
accessible description and the panel's one excluded-night line SHALL name the
total and every nonzero reason; the panel line SHALL still print only when the
total is nonzero. "excluded — not steady" SHALL NOT print. The tile and the panel
SHALL read the served counts only, and SHALL derive, sum or reclassify nothing.
The miniature SHALL be unchanged.

#### Scenario: The full rail names each reason

- **WHEN** a payload serves an excluded-night count of 5 with 3
  `before_current_setting`, 1 `below_range_or_suspended` and 1 `insulin_acting`
- **THEN** the full rail's rows after the direction counts read 5 "excluded",
  3 "before the current rate", 1 "low or suspended" and 1 "insulin on board"
- **AND** no rail row reads "excluded — not steady"
- **AND** the accessible description carries the clause "5 nights excluded: 3
  before the current rate, 1 low or suspended, 1 insulin on board"

#### Scenario: The low count survives the middle rank

- **WHEN** the same payload renders below the middle-rank width
- **THEN** the tally line ends "· 5 excluded (1 low or suspended)"

#### Scenario: The panel names each reason

- **WHEN** the basal slot panel renders the same payload
- **THEN** its one excluded-night line reads "5 excluded nights: 3 before the
  current rate, 1 low or suspended, 1 insulin on board"

#### Scenario: A crowded rail stays legible

- **GIVEN** a payload in which every reason is nonzero and one night has no
  programmed rate
- **WHEN** the tile renders at full furniture in a 950×307 canvas
- **THEN** every rail row prints, no two rail texts overlap, and none crosses the
  footer rule

#### Scenario: The served desk names the reasons

- **GIVEN** the synthetic showcase
- **WHEN** the reader opens a basal slot with excluded nights in Diagnose at each
  supported desktop size
- **THEN** the panel's excluded-night line and the tile's accessible description
  name the served total and each nonzero served reason with its served count
