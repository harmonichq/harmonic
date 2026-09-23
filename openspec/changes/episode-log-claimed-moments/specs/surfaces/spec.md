## ADDED Requirements

### Requirement: The Episode Log words an outranked anchor as claimed, and Diagnose shares the word

The Day Episode Log SHALL print the word `claimed` as the tier word of an anchor
whose served state is `outranked`, never the engine state name. The desk SHALL
hold one definition of the anchor-state words, and Diagnose's case-file word for
an outranked occurrence (the verdict band's footer and the selected occurrence's
tag) SHALL be built from that same definition's claimed word, reading
`claimed by another finding`. The engine state SHALL stay available as the tier
element's data attribute. No other anchor state's word SHALL change.

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

### Requirement: A claimed row names the Finding that claimed it and what it matched

A claimed row SHALL name the Finding that claimed it by the served episode cause
title, and SHALL name each Lever its own matched verdicts matched by that
verdict's served title, without repeating a title equal to the claiming
Finding's. The model-view read SHALL serve a Lever title on every retained
verdict, from the one Lever name source the served episode cause title also
reads. The desk SHALL keep no Lever-key-to-name table and SHALL print no raw
Lever key. The verdicts other consumers copy out of the shared episode view
SHALL be unchanged.

#### Scenario: The model view serves the verdict title for a claimed low

- **GIVEN** manufactured events in which a meal over-delivery episode's meal
  drives it and its level-2 low matches correction on IOB on its own
- **WHEN** the model-view read assembles that day through the evaluator
- **THEN** the low's state is `outranked` and its matched verdict carries the
  served title for correction on IOB
- **AND** every retained verdict on every anchor carries a served title

#### Scenario: The claimed row states the relationship

- **GIVEN** that served day, with the served episode cause title for meal
  over-delivery
- **WHEN** the Day desk renders the low's row
- **THEN** the row names meal over-delivery as the claiming Finding and
  correction on IOB as what the low matched
- **AND** the row text contains no underscore token

### Requirement: A claimed anchor keeps its Finding's hue and size

A claimed anchor's tier word, its Evidence-strip ring, the narrow hero ring and
the cross-track focus hairline SHALL use the same hue as a fired anchor's, and
its resting marker SHALL be the same size as a fired anchor's. The Episode Log
and its chart overlay SHALL not use the warning hue. The claimed word SHALL
remain the redundant, non-colour signal that tells a claimed anchor from the
anchor that drove its episode.

#### Scenario: A claimed level-2 low is not demoted

- **GIVEN** the served day with a fired meal anchor and a claimed low
- **WHEN** the anchor overlay and the Episode Log styles resolve
- **THEN** the low's ring, hairline and tier word take the fired anchor's hue,
  not the warning hue
- **AND** the low's resting marker is as large as the fired meal's

### Requirement: The Findings band counts Findings, not rows

The Episode Log's Findings caption SHALL state the number of Findings in the
band, one per distinct served episode among its rows, whether or not that
episode has a fired row. When the band holds claimed rows, the caption SHALL
name their count separately and SHALL never add it into the Findings number.
Rows SHALL keep their chronological order.

#### Scenario: One Finding and one claimed anchor

- **GIVEN** a served day with one episode holding one fired anchor and one
  claimed anchor
- **WHEN** the Episode Log renders
- **THEN** the caption states one Finding and one claimed anchor

#### Scenario: A sequence Finding with no fired row

- **GIVEN** a served day whose only Finding is a high-carb sequence episode
  holding two claimed anchors and no fired anchor
- **WHEN** the Episode Log renders
- **THEN** the caption states one Finding and two claimed anchors

### Requirement: The Episode Log bands are explained where a reader looks

The Glossary SHALL carry an Episode Log group defining Finding, Claimed, Also
checked and Quiet, the last naming its clean, explained and no-data counts, in
CONTEXT.md's terms. CONTEXT.md SHALL define the Episode Log and Claimed. The
Guide's "Reading a Day" article SHALL describe the three bands and the claimed
word and SHALL keep its Day handoff. Each band caption SHALL carry a
keyboard-operable control, named for its band, that opens the Glossary with the
Episode Log group in view; closing the Glossary SHALL return focus to that
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

The revision SHALL add desk behavior stories S121 (the claimed row's word,
relationship, hue and the Findings count) and S122 (a band caption opens the
Glossary and returns focus) to the frozen desk ledger under a dated #423
amendment carrying the operator's sanction, with replay functions, node
regression tests that tell each story's feature assertion from a setup error,
and the ledger inventory's pinned counts moved to match. Each story SHALL fail
on the ticket's base for its feature reason and pass on the branch at 1280x720
and 1440x900, and before and after renders SHALL record every affected state at
both sizes.

#### Scenario: The stories prove the revision in the built app

- **GIVEN** the synthetic `pattern-near-tie` case store, whose Day 2024-05-25
  shows a claimed low inside a carb undercount episode
- **WHEN** S121 and S122 replay against the base and then the branch at both
  sizes
- **THEN** each fails on the base naming its feature assertion and passes on the
  branch
