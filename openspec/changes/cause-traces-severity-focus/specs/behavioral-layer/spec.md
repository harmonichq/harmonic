## ADDED Requirements

### Requirement: A Pattern serves its causes largest harm first

Each claimed Occurrence in the exposures feed SHALL serve, for every lever that
claims it, the severity of the episode that lever's claim came from: the
hypo-weighted time outside range the scenario engine scores for that episode,
the largest when one lever claims it from more than one episode. The Pattern
producer SHALL own one rule that orders a Pattern's causes, its rate levers with
a share, by the summed severity of the Occurrences credited to each, largest
first, ties in rate-lever order. Crediting SHALL be unchanged: each claimed
Occurrence is still credited to the first rate lever, in rate-lever order, that
claims it, and only the served order moves. The findings projection SHALL serve
a Pattern's shares in that order wherever it serves them: on the row of a habit
the Pattern is served as, and on every Pattern row that serves a count
sentence, in the same entry shape. A Pattern row that serves no count sentence
SHALL serve no shares. Every served share SHALL say whether its cause is
`pinnable`: one of the Pattern's pinnable habit members, decided by the one
predicate the Focus endpoint admits a sent lever by, and nothing else. The
Pattern case file's per-cause traces SHALL come in
the same order, from the same rule over the same window population.

#### Scenario: A Pattern served as its habit serves its causes by severity

- **GIVEN** the `pattern-correction-collapse` QA case, where Lows after
  correcting highs is served as Correction on active insulin, credited two lows,
  while Correction stacking, first in rate-lever order, is credited one
- **WHEN** the findings projection is read for the whole day
- **THEN** the habit row's served shares are Correction on active insulin (2)
  then Correction stacking (1)
- **AND** Correction on active insulin is `pinnable` and Correction stacking,
  credited but no member of the Pattern, is not

#### Scenario: A meal Pattern serves its causes on its own row

- **GIVEN** the `pattern-meal-two-causes` QA case, where Highs after meals keeps
  its row with Carb undercount credited four meals of milder rises and Late
  bolus three of longer highs
- **WHEN** the findings projection is read for the whole day
- **THEN** the Pattern row serves its shares as Late bolus (3) then Carb
  undercount (4), adding up to the Pattern's count of 7, both `pinnable`
- **AND** the Pattern's count, denominator and published roster are unchanged

#### Scenario: A doubly claimed meal is still credited in roster order

- **GIVEN** a synthetic Pattern population where one meal is claimed by both
  rate levers and the second lever's claims are the more severe
- **WHEN** the shares are read
- **THEN** that meal counts once, to the first lever in rate-lever order, and
  only that lever's claim severity sums into its place in the order

### Requirement: A Pattern case file serves each cause's own trace

Every Pattern case file SHALL serve, beside its pooled trace, one trace per
cause, in the served cause order, each naming its cause's subject. A cause's
trace SHALL draw that cause's credited Occurrences exactly as the Pattern's own
episodes are drawn: the same start and minutes, the same bins, the same
ten-minute lead, and its episodes' readings when it draws eight or fewer. Every
cause SHALL be drawn against the Pattern's one Typical, which is not served
again. A cause's trace SHALL draw no Occurrence credited to another cause, and
the causes' traces together SHALL draw the anchors the Pattern's trace draws.

#### Scenario: Each meal cause is drawn from its own meals

- **GIVEN** the `pattern-meal-two-causes` QA case
- **WHEN** its Highs after meals case file is read
- **THEN** it serves Late bolus's trace then Carb undercount's, drawing that
  cause's three and four meals at their boluses with each meal's readings
- **AND** the occurrences each trace draws are the occurrences whose member is
  that cause, and Typical is the Pattern's one

#### Scenario: Each correction cause is drawn from the doses its lows followed

- **GIVEN** the `pattern-correction-collapse` QA case
- **WHEN** its Lows after correcting highs case file is read
- **THEN** Correction on active insulin's trace starts at the two 20:00
  corrections its lows followed and Correction stacking's at the one 14:40
  stacking dose, in that order
