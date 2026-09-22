## ADDED Requirements

### Requirement: A Pattern owns its causes in the rail

In the rail, a Pattern row SHALL hold its claimed causes beneath it on
the Pattern's own spine, one line per cause carrying the cause's name, the
count, denominator and noun of each of its served count sentences in served
order, never merged, and a drill chevron. A
toggle on the Pattern row SHALL name the number of causes, SHALL be open on the
first ranked row and closed on every later one on arrival, and SHALL be operable
by pointer and keyboard with its state exposed to assistive technology. Cause
lines SHALL carry no mini. A cause's chevron SHALL open that cause's case file
and the Pattern's chevron the Pattern's, exactly as before; Focus entry and
occurrence selection SHALL be unchanged. Claimed causes SHALL no longer appear
as sibling rail rows.

#### Scenario: Causes fold under their Pattern

- **GIVEN** a synthetic window whose first ranked row is a Pattern with claimed
  causes and a later Pattern with one
- **WHEN** Diagnose loads at each supported desktop size
- **THEN** the first Pattern shows its causes beneath it and the later one shows
  only its toggle, each toggle naming its served cause count
- **AND** no claimed cause is a sibling row and no cause line holds a chart
- **AND** opening a cause's chevron lands on that cause's case file

### Requirement: The rail shows served urgency

The first tier caption in the rail SHALL paint in the primary hue and
the rows of that tier SHALL carry a rank stripe and a primary rank numeral.
Later tiers SHALL stay quiet. The caption word, the tier membership and the rank
SHALL be the served values; the desk SHALL derive none of them.

#### Scenario: One tier still reads as ranked

- **GIVEN** a synthetic window in which every ranked row shares one served tier
- **WHEN** the rail renders
- **THEN** that tier's caption is primary and each of its rows carries the stripe
- **AND** the caption and ranks equal the served projection's

### Requirement: Every ranked rail row draws one mini instrument

Every ranked row's mini in the rail SHALL be the same instrument: the
matched cohort's label with its count at the left, `TYPICAL` with the
denominator at the right, the event named on the anchor line, the target band
dashed, and the rail's cohort palette. No mini SHALL draw in the comparison blue.
A row whose evidence cannot supply a cohort response SHALL keep its existing
honest unavailable state rather than a second instrument.

#### Scenario: A Cause mini matches a Pattern mini

- **GIVEN** a synthetic window holding a ranked Pattern, a ranked event-comparison
  Cause and a ranked high-carb-sequence Cause
- **WHEN** their minis render
- **THEN** each carries the cohort label and count, the typical denominator, the
  named anchor and the dashed target band
- **AND** every series colour resolves to a rail cohort token

### Requirement: Rail rows print the served count sentence

Every count-bearing rail row in the rail SHALL print each of the projection's
served count sentences for that row, in served order and never merged, with each
count and denominator emphasised. The desk SHALL hold no
noun or outcome word list of its own.

#### Scenario: One grammar

- **GIVEN** a synthetic window holding a Pattern row and a Cause row
- **WHEN** the rail renders
- **THEN** both rows read `n of d noun outcome` with the served words
- **AND** a Cause appearing in two families prints both served sentences

### Requirement: The basal lane names and paints every verdict

The basal lane SHALL show a head row above its cells carrying the
lane's name and a key of the served verdict short forms with their counts, fully
visible inside the lane at both supported desktop sizes. Every cell SHALL paint
its served verdict: hold a filled neutral, raise the high gold with an upward
glyph, lower the accent with a downward glyph, insufficient hatched, no data
dotted; each key mark SHALL match its cells' paint. A selected cell SHALL keep
the primary outline and a staged cell the underline. The lane SHALL stay compact.
Slot selection, keyboard traversal, the slot graph opening and every staging and
verdict decision SHALL be unchanged; the lane paints what is served.

#### Scenario: The key is visible and matches the cells

- **GIVEN** a synthetic store whose lane holds supported raise and lower slots,
  hold, insufficient and no-data slots, one selected and one staged
- **WHEN** the lane renders at each supported desktop size
- **THEN** the key's box lies wholly inside the visible lane above the cells
- **AND** each verdict's cells and its key mark share one computed paint, and
  hold cells are not the bare ground
- **AND** the key's words and counts equal the served lane counts

### Requirement: Diagnose opens on the 24 h window

On a cold arrival with no contextual entry and no retained window, the desk
SHALL open Diagnose on the 24 h window. A contextual entry's window and a
retained window SHALL still win.

#### Scenario: Cold arrival

- **GIVEN** the built app on the synthetic showcase
- **WHEN** the reader opens Diagnose with no entry context
- **THEN** the 24 h window is selected and the findings read is unscoped

### Requirement: A cold destination shows a count-free skeleton

While a desk destination loads cold, the desk SHALL show a skeleton of rail rows
and stage instruments in place of the empty block. The skeleton SHALL state no
count, title or value, SHALL shimmer slowly, SHALL hold still under reduced
motion, SHALL keep the loading status and its named text for assistive
technology, and SHALL keep the rail at the Diagnose reference width. The
retained-Day reload and the named roster and reassessment loading text SHALL be
unchanged.

#### Scenario: Cold Diagnose

- **GIVEN** the desk's Diagnose reads held open
- **WHEN** the loading frame stands at each supported desktop size
- **THEN** skeleton rail rows and stage instruments are visible, none holds text
  content, and the status element is still announced
- **AND** under reduced motion no skeleton element animates
