## MODIFIED Requirements

### Requirement: Diagnose renders Finding case files without browser-owned policy.

The system SHALL satisfy the following:

Diagnose loads the server-owned case-file preparation and renders its exact rows.
Opening any visible behavioral Finding, changing its clock window or alignment,
or selecting an Occurrence sends the preparation identity and opaque coordinates to
the case-file endpoint. The Inspector renders the returned header, verdict account,
full roster, 12-bucket clock or three server-named event cohorts, comparison state,
selection, and selected trace without mapping titles to Exposure families, joining a
second population, recounting cohorts, or falling back from event to clock alignment.

An active failed request preserves the last internally consistent queue,
Inspector, and canvas while showing the structured error. On `stale_projection`,
the replacement preparation and replacement case are built in shadow state and
all three surfaces swap only after both succeed. Responses superseded by newer
coordinates are discarded by generation and projection/Finding identity. Initial
load failure, queue-level refresh failure, case failure after refresh, and a valid
unavailable selection remain distinct visible states.

For Missed / unannounced meal, the event view renders the server's attributed-
missed and all-completed-carb-bolus announced cohorts as separate populations.
It displays each cohort's served count under its served name, and the served count
of Highs outside the comparison whenever it is non-zero; it anchors missed rows at
detected rise onset and announced rows at completed carb-bolus time, and uses the
fixed `[-60, +300]` axis. A zero attributed-missed cohort is an explicit empty
state, not a fallback to High verdict membership; announced rows remain selectable
through their server-owned Occurrence identity. The five-way High verdict band and
its denominator remain a separate account.

#### Scenario: Diagnose renders Finding case files without browser-owned policy.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: Missed meal shows its Highs outside the comparison

- **GIVEN** the synthetic Missed / unannounced meal case file with 3 Highs outside
  the comparison
- **WHEN** Diagnose renders its event view
- **THEN** the caption shows the three served cohorts under their served names with
  their counts, and "3 highs outside the comparison"
- **AND** no caption count is labelled "not comparable"

### Requirement: A Pattern owns its causes in the rail

In the rail, a Pattern row SHALL hold its claimed causes beneath it on
the Pattern's own spine, one line per cause carrying the cause's name, the
count, denominator and noun of each of its served fold sentences in served
order, never merged, and a drill chevron. A rate-lever cause's first fold
sentence is its count on the Pattern's own population; every fold sentence the
projection marks as outside the Pattern's count SHALL be set apart from the
Pattern's-scope sentence behind the words "outside the count", and a cause line
SHALL print no outcome word. A
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

#### Scenario: A folded cause shows its share of the Pattern first

- **GIVEN** the synthetic case where Lows after correcting highs counts 2 of 2 lows
  and Correction stacking is folded beneath it
- **WHEN** the fold is open
- **THEN** Correction stacking's line reads 2 of 2 lows first, then, set apart
  behind "outside the count", its correction-cluster count

## ADDED Requirements

### Requirement: The Response comparison caption reconciles with its cohorts and the band

An event-aligned case file's Response comparison caption SHALL name every served
cohort by its served name with its served count, in served order, so each caption
term matches a cohort section heading and its count. When a cohort serves the
verdict-band state it holds, the caption SHALL follow that cohort's name once with
the band's own words for that state. The caption SHALL print the served count
outside the comparison, after the case file's population noun and in the words
"outside the comparison", only when that count is non-zero. No caption count SHALL
be labelled "not comparable"; the verdict band's residue line keeps that word for
no data. The desk SHALL compute no caption count and derive no band link.

#### Scenario: A same-population Pattern caption adds up

- **GIVEN** the synthetic Highs after meals case file of 3 of 6 meals with one
  Borderline, one no-data and one calm meal
- **WHEN** Diagnose renders its event view
- **THEN** the caption reads the Matched, Nearly matched and Other meal
  opportunities counts under those served names, linked once to Meets criteria and
  Borderline, and they add up to six
- **AND** nothing outside the comparison is printed, and the only visible count
  labelled "not comparable" is the band's one no-data meal

### Requirement: The case-file counts revision ships with its ledger amendments

The revision of the case-file caption and the Pattern fold SHALL amend the desk's
frozen behavior ledger and its app-only replay in the same change: new stories for
the same-population caption, the cross-population caption and a folded cause's
share of its Pattern, each on a named manufactured case store, and an amendment of
every inherited story whose assertion reads a folded cause's sentences. They SHALL
be recorded in a dated amendment section of the ledger without rewriting any
existing freeze block, and the replay driver's pinned story counts SHALL equal the
ledger's story entries. Each new story SHALL fail on the base at its feature
assertion and pass on the revision, at both desktop sizes.

#### Scenario: The replay proves the counts revision

- **WHEN** the amended desk replay runs against the built revision at both desktop
  sizes
- **THEN** the new and amended stories execute with zero failures
- **AND** the replay driver's pinned counts equal the ledger's story entries
