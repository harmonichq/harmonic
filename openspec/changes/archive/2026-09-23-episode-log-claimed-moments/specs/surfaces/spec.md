## ADDED Requirements

### Requirement: The Episode Log words an outranked anchor as claimed, and Diagnose shares the word

The Day Episode Log SHALL print the word `claimed` as the tier word of an anchor
whose served state is `outranked`, never the engine state name. `Claimed` SHALL
mean only the fact the two surfaces share: the anchor or occurrence belongs to
an episode another Finding owns. It SHALL NOT be defined as "matched" or "did not
match". On Day the row names separately what the anchor matched. On Diagnose a
claimed occurrence is the row-relative verdict: this Finding's own criterion was
not met and another Lever drove the episode. The behavioral-layer requirement
that model-view outranked state and findings' row-relative fired criterion
retain their distinct meanings stands.

The desk SHALL hold one definition of the anchor-state words, and Diagnose's
label for an outranked occurrence (the verdict band's footer and the selected
occurrence's tag) SHALL be built from that same definition's claimed word,
reading `claimed by another finding`. The engine state SHALL stay available as
the tier element's data attribute. No other anchor state's word SHALL change.

#### Scenario: A claimed low reads claimed on Day

- **GIVEN** a served model-view day whose meal over-delivery episode holds a
  fired meal anchor and an outranked low anchor
- **WHEN** the Day desk renders its Episode Log
- **THEN** the low's tier word is `claimed` and its tier element still carries
  `data-state="outranked"`
- **AND** no Episode Log row prints the word `outranked`

#### Scenario: Diagnose and Day read one definition

- **WHEN** the desk's source is read
- **THEN** Diagnose's outranked label is built from the same exported claimed
  word Day prints
- **AND** the phrase `claimed by another factor` appears nowhere in the desk

### Requirement: A claimed row names what the anchor matched and ends with the Finding that claimed it

A claimed row SHALL name each Lever its own matched verdicts matched, by that
verdict's served title, and SHALL end with the episode's served `lever_title`,
the claiming Finding named last, as #426's surfaces requirement has every row
whose episode carries a Lever end. A matched title equal to the episode's
`lever_title` SHALL not be repeated before it. The model-view read SHALL serve a
Lever title on every retained verdict, from the one Lever name source
`lever_title` also reads. The Day desk (`frontend/day.js`,
`frontend/day-chart.js`) SHALL keep no Lever-key-to-name table, and this change
SHALL add none. No claimed row SHALL print a raw Lever key. The verdicts other
consumers copy out of the shared episode view SHALL be unchanged.

#### Scenario: The model view serves the verdict title for a claimed low

- **GIVEN** manufactured events in which a meal over-delivery episode's meal
  drives it and its level-2 low matches correction on IOB on its own
- **WHEN** the model-view read assembles the day on which that episode ends,
  the day after its anchors
- **THEN** the low's state is `outranked` and its matched verdict carries the
  served title for correction on IOB
- **AND** every retained verdict on every anchor carries a served title

#### Scenario: The claimed row states the relationship

- **GIVEN** that served day, whose episode serves meal over-delivery's
  `lever_title`
- **WHEN** the Day desk renders the low's row
- **THEN** the row names correction on IOB as what the low matched and ends with
  meal over-delivery's `lever_title`
- **AND** the row text contains no underscore token

### Requirement: A claimed anchor keeps its Finding's hue and size

A claimed anchor's tier word, its Evidence-strip ring, the narrow hero ring and
the cross-track focus hairline SHALL use the same hue as a fired anchor's, and
its resting marker SHALL be the same size as a fired anchor's. The Episode Log
and its chart overlay SHALL not use the warning hue. The claimed word SHALL
remain the non-colour signal that tells a claimed anchor from the anchor that
drove its episode.

#### Scenario: A claimed level-2 low is not demoted

- **GIVEN** the served day with a fired meal anchor and a claimed low
- **WHEN** the anchor overlay, the focus hairline and the Episode Log styles
  resolve
- **THEN** the low's ring, hairline and tier word take the fired anchor's hue,
  not the warning hue
- **AND** the low's resting marker is as large as the fired meal's

### Requirement: The Findings band counts Findings, not rows

The Findings band lists the fired and claimed anchors, each belonging to an
episode attributed to a Lever; which anchors it holds SHALL be unchanged. The
Findings caption SHALL state the number of distinct Findings those anchors'
episodes belong to: one per distinct served Lever among the band's rows,
whether or not that Lever's episode has a fired row. Two episodes attributed to
the same Lever SHALL count once, as one Finding, in CONTEXT.md's terms and as
Diagnose counts it. When the band holds claimed rows, the caption SHALL name
their count separately and SHALL never add it into the Finding number. Rows
SHALL keep their chronological order.

#### Scenario: One Finding and one claimed anchor

- **GIVEN** a served day with one attributed episode holding one fired anchor
  and one claimed anchor
- **WHEN** the Episode Log renders
- **THEN** the caption reads `Findings · 1` and names 1 claimed anchor

#### Scenario: Two episodes of one Lever are one Finding

- **GIVEN** a served day with two episodes attributed to the same Lever, each
  holding one fired anchor
- **WHEN** the Episode Log renders
- **THEN** the caption reads `Findings · 1`

#### Scenario: A sequence Finding with no fired row

- **GIVEN** a served day whose only attributed episode is a high-carb sequence
  episode holding two claimed anchors and no fired anchor
- **WHEN** the Episode Log renders
- **THEN** the caption reads `Findings · 1` and names 2 claimed anchors

### Requirement: The Episode Log bands are explained where a reader looks

The Glossary SHALL carry an Episode Log group, in CONTEXT.md's terms, with four
entries:

- *Finding*: the Findings band lists the fired and claimed anchors of episodes
  the engine attributed to a Lever, and the caption counts the distinct Findings
  those episodes belong to;
- *Claimed*: only the shared fact that the anchor belongs to an episode another
  Finding owns;
- *Also checked*;
- *Quiet*, naming its clean, explained and no-data counts.

CONTEXT.md SHALL define the Episode Log and Claimed to the same effect. The
Guide's "Reading a Day" article SHALL describe the three bands and the claimed
word and SHALL keep its Day handoff. Each band caption SHALL carry a
keyboard-operable control, named for its band, that opens the Glossary with the
Episode Log group in view. Closing the Glossary SHALL return focus to that
control. The Glossary SHALL not describe its definitions as v1's.

#### Scenario: A band caption opens its explanation

- **GIVEN** a Day whose Episode Log shows a Findings caption
- **WHEN** the reader activates the caption's Glossary control
- **THEN** the Glossary takes the reading seat with its Episode Log group in view
- **AND** closing it returns focus to the same caption control

#### Scenario: The Glossary carries the band terms

- **WHEN** the desk's Glossary groups are read
- **THEN** an Episode Log group defines Finding, Claimed, Also checked and Quiet

### Requirement: The Episode Log revision ships with its ledger stories and evidence

The revision SHALL add desk behavior stories S121 and S122 to the frozen desk
ledger, in the change's own dated `## #423 amendment — 2026-09-23` section
carrying the operator's sanction. S121 covers the claimed row's word, its
relationship, its hue and size, and the Findings count. S122 covers a band
caption opening the Glossary and returning focus. The stories SHALL come with
replay functions, node regression tests that tell each story's feature
assertion from a setup error, and the inventory literals in the ledger
inventory check moved to match. They SHALL NOT change an existing frozen block
or its header count line. Each story SHALL fail on the ticket's base for its
feature reason and pass on the branch at 1280x720 and 1440x900. Before and after
renders SHALL record the affected rendered states at both sizes: the claimed
row, its tier word, the Findings caption, the Glossary opened from a caption,
and Diagnose's claimed label.

Where the claimed anchors sit before the Day chart's time axis, the ring hue,
hairline hue and resting marker size SHALL be proven by node tests and by the
story's readback of the anchor overlay option by series id, not by captures.
That readback SHALL read each unfocused marker's `itemStyle.borderColor` and
`symbolSize` before any row is pressed. An
episode is served on the day it ends, so an evening episode's anchors are
stamped the day before and are clipped from the axis.

#### Scenario: The stories prove the revision in the built app

- **GIVEN** the synthetic `pattern-near-tie` case store, whose Day 2024-05-25
  Episode Log shows a claimed low inside a carb undercount episode whose
  anchors are stamped 2024-05-24
- **WHEN** S121 and S122 replay against the base and then the branch at both
  sizes
- **THEN** each fails on the base naming its feature assertion and passes on the
  branch
- **AND** S121 reads the claimed and fired markers' unfocused
  `itemStyle.borderColor` and `symbolSize` from the `day-anchor-markers` series
  option before pressing any row
