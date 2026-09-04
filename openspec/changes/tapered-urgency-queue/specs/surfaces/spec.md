## ADDED Requirements

### Requirement: The Diagnose findings rail is a tapered queue read off served order and tier

The un-drilled Diagnose findings rail SHALL render the findings projection's
rows in the server's order at three weights chosen from served facts only. The
first shown priced ranked row SHALL render as the hero: its served headline's
first sentence as the title, the remainder as the subtitle, its detail line,
and its flavor and served tier words, with no chart of its own. Every further
shown priced ranked row SHALL render as a compact row carrying a mini chart
drawn by the same registry option the charts drawer's cell draws for that row,
from data already fetched for that descriptor. Every shown unpriced ranked row
SHALL render title-only under the existing seam sentence. Held, blind and
history reads SHALL stay collapsed behind the Watching control unchanged. Tier
captions SHALL print once where the served tier of consecutive shown priced
rows changes, each caption's text drawn from one pinned map whose domain is
exactly the three served tier slugs and whose range is the design system's
tier words; unpriced rows carry no caption. The rail SHALL introduce no rank, tier, floor,
direction, threshold or ranking word of its own, and SHALL show no 0–100
number. When a compact row's mini host measures narrower than the rail's named
minimum the row SHALL omit its mini, mark it omitted, and keep its facts.

#### Scenario: The hero is the first priced row and carries no chart

- **GIVEN** a populated synthetic Diagnose window with at least two priced ranked rows
- **WHEN** the findings queue shows
- **THEN** the first priced row in served order renders as the hero with its served headline cut at its first sentence and its detail line
- **AND** the hero contains no chart element
- **AND** the stage holds that row's chart

#### Scenario: A compact row's mini is the drawer's own chart

- **WHEN** a compact row's descriptor has fetched data
- **THEN** the row's mini renders the same series the drawer's cell for that chart renders
- **AND** no additional request was made for it

#### Scenario: Tier captions come from the pinned map only

- **WHEN** consecutive shown priced rows change served tier
- **THEN** exactly one caption prints between them, and its text is the pinned map's word for the new tier
- **AND** no tier word outside that map's range, and no word for an unpriced tier, appears in the rail

#### Scenario: A sift promotes the next priced row

- **WHEN** a sift hides the first priced row
- **THEN** the next shown priced row renders as the hero

#### Scenario: A narrow row keeps its facts

- **WHEN** a compact row's mini host measures narrower than the rail's named minimum
- **THEN** the row omits its mini and marks it omitted
- **AND** the row's title and detail line still render

### Requirement: A revision of the Diagnose findings rail ships with its ledger amendments and evidence

A revision of the shipped Diagnose findings rail SHALL amend the frozen
behavior ledger and its app-only replay for every added, changed, moved or
retired rail behavior in the same change and SHALL store before/after renders
of every affected state from the base and the revision served on the same
synthetic database at 1440×900, 1280×800, 1024×768, 768×1024 and 390×844.

#### Scenario: The replay proves the revision

- **WHEN** the amended replay runs against the built revision on the declared no-fetch server
- **THEN** it reports its applicable story count, zero failures and no skipped story
