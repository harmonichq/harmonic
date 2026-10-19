## ADDED Requirements

### Requirement: The app is five recommendation-first tabs composed from an approved component library

The app SHALL present exactly five tabs: Queue, Changes, Overview, Day and
Settings. Each tab owns only its own content: Queue owns the ranked
recommendations, Changes the active watched change and the last finished one,
Overview the standard metrics over 14, 30 and 90 days, Day one day together with
carb logging and prompts, and Settings the sync state, the pump profile and the
glossary. Screens SHALL be composed only from components of the approved
component library. No surface SHALL show explanatory prose, a prediction, or a
value the engine does not serve.

#### Scenario: Sync failure is shown only in Settings

- **WHEN** the last sync attempt failed
- **THEN** the Settings tab carries an alert badge, Settings shows the failure,
  and no other tab shows a banner, toast or strip about it

### Requirement: The app is the only shell, built ahead of time and served at its five tab paths

Harmonic SHALL have exactly one browser shell, the five-tab app (#495). It is
built ahead of time, loads with no login screen, and then makes
bearer-token-gated API calls to load data. The packaged runtime SHALL require no
Node runtime and no CDN at run time.

The server SHALL serve the app at exactly the page paths `/` (the Queue),
`/changes`, `/overview`, `/day` and `/settings`, and its fingerprinted built
assets beneath `/assets/`. Programmatic interfaces live below `/api`. The
non-API route set SHALL be closed: every served page path is named explicitly,
and every other path SHALL answer 404 rather than the shell. No retired address
is served or redirected: the desk's `/diagnose`, a `/v2/...` path, `/queue`, and
a retired v1 page path such as `/plan`, `/verify` or `/guide` all answer 404. A
fragment carries no route.

The browser router and the Python route policy SHALL name the same five tabs.

#### Scenario: The app answers at its five tab paths

- **WHEN** the built app is started against a synthetic database
- **THEN** `/`, `/changes`, `/overview`, `/day` and `/settings` each answer the
  app shell
- **AND** every asset the shell names is served beneath `/assets/`
- **AND** the built output references no CDN host

#### Scenario: A retired address is not served and is not redirected

- **GIVEN** an address the app no longer has, such as `/diagnose`, `/queue`,
  `/v2/`, `/plan`, `/verify` or `/guide`
- **WHEN** that address is requested
- **THEN** the server answers 404, not the shell and not a redirect

#### Scenario: A missing build fails loudly

- **WHEN** the app's build output is absent
- **THEN** each page path reports that the frontend build is missing and names
  the build command, rather than serving a blank or partial shell
- **AND** the API remains reachable

#### Scenario: The route set cannot grow silently

- **WHEN** the closed-set route assertion runs
- **THEN** it names the complete non-API route set, so a route cannot be added or
  kept without updating it

### Requirement: Queue ranks what guidance admits, and each item can be pinned or snoozed

The Queue SHALL list exactly the candidates the guidance read admits, the
person has not snoozed and the guidance does not serve as waiting for the pump,
by served priority, highest first, an exact tie broken by subject. It SHALL
re-derive no admission, floor, threshold or direction. A Pattern card SHALL offer
Pin, which starts a Focus on its habit, and SHALL draw the trace chart its case
file serves: the Pattern's episodes, or its median and band past eight, against
Typical's median and band, computing no band and choosing no episode (ADR 523).
A Setting card SHALL show the current value, the engine's estimate, its range,
its count and its evidence chart, one dot per item its estimate counts, and SHALL
end its evidence in one stat row in one order on every setting card: Estimate,
Range, then the served count (Nights, Meal runs, Fasting nights); a queued
correction factor SHALL use the Overview's ISF estimate card in the Queue's
frame. A queued carb ratio's findings row SHALL serve its block as its one
member, in the shape a basal run serves its slots, so its card draws the block,
current → recommended and its range. A Pattern served as its one habit SHALL be
drawn with the Pattern's own count and its rate levers' credited shares, which
that habit's row serves for it, and its case file SHALL be read under the
Pattern's subject. A standalone habit the guidance admits, one no Pattern owns,
SHALL be its own item (ADR 528): its row a Pattern's row with the Habit glyph and
no trailing value, and its card a Pattern's card, counting the episodes its case
file claims of its denominator and drawing its case file's trace chart, its own
episodes named Habit. Its card SHALL carry no Uncertain tag and no impact line,
which the engine serves only for a Pattern. Its Pin SHALL start a Focus on the
habit itself, under the habit's own subject, and its card SHALL show the Focus
pill while that Focus is active. A Setting card's primary SHALL be Done (#518), where Pin sits on a
Pattern card: it SHALL take the card out of the Queue at once, with a bar reading
"Waiting for pump" and an Undo that withdraws it. A Setting the guidance serves
as `not_on_pump` SHALL carry the Not on pump pill on its row and its card. Every
item SHALL offer Snooze, a text action beneath its primary, which sets it aside
until fourteen days after the engine's served decision time, with an Undo; on the
phone a row's swipe SHALL stay Snooze. The Snoozed list SHALL show each snoozed
item with its until date and a Restore, and SHALL be reachable only while at
least one item is snoozed.

#### Scenario: Done takes a Setting card out of the Queue

- **WHEN** the person presses Done on a Setting card
- **THEN** the card leaves the Queue, and a bar reads "Waiting for pump" with
  Undo
- **AND** Undo puts the card back

#### Scenario: A Setting back from an unchanged sync is marked

- **GIVEN** a basal candidate the guidance serves as `not_on_pump`
- **WHEN** the Queue renders
- **THEN** its row and its open card carry the Not on pump pill, and the card
  offers Done again

#### Scenario: A queued carb ratio draws its card

- **GIVEN** the QA case whose meals support lowering a whole-day carb ratio of 10
- **WHEN** the Queue renders
- **THEN** the I:C card shows 00:00–24:00, 10 → 9 g/U and its range

#### Scenario: A Pattern served as its habit is counted as the Pattern

- **GIVEN** the QA case where Lows after correcting highs is served as Correction
  on active insulin, which drives two of six lows, while a stacked pair of
  corrections reaches a third
- **WHEN** the Queue renders that Pattern and reads its case file
- **THEN** the card counts 3 of 6 lows, credited 2 to Correction on active
  insulin and 1 to Correction stacking, and its case file claims the same 3

#### Scenario: A Pattern card draws its served traces

- **GIVEN** the showcase, whose one over-treated low rebounds
- **WHEN** the Queue renders Highs after treating lows
- **THEN** its chart draws that one episode from the low's nadir over 0 to 180
  minutes against the other four lows' median and band, and no impact line, since
  one episode serves no bin

#### Scenario: A standalone habit is its own card

- **GIVEN** the `behavioral-missed-meal` QA case, whose missed-meal habit no
  Pattern owns and the guidance admits
- **WHEN** the Queue renders
- **THEN** it holds one Habit card, Missed / unannounced meal, counting 2 of 6
  highs, its chart drawing those two rises, with no Uncertain tag and no impact
  line

#### Scenario: Pin on a habit starts a Focus on that habit

- **GIVEN** the same case
- **WHEN** the person presses Pin on its card
- **THEN** a Focus starts under `habit:missed_meal`, with no Pattern, and the card
  shows the Focus pill
- **AND** Changes shows that Focus titled by the habit, with no Pattern name
- **AND** once the Focus is ended the card offers Pin again

#### Scenario: A queued carb ratio counts its meal runs

- **GIVEN** the QA case whose meals support lowering a whole-day carb ratio of 10
- **WHEN** the Queue renders its I:C card
- **THEN** it draws eight dots and its stat row reads Estimate, Range, Meal runs 8

#### Scenario: A held setting is not queued

- **GIVEN** a store whose correction factor the analyzer holds
- **WHEN** the Queue renders
- **THEN** no correction-factor card appears in the Queue

#### Scenario: Snoozing an item moves it to the Snoozed list

- **WHEN** the person snoozes a Queue item
- **THEN** it leaves the Queue, a bar offers Undo, and the Snoozed list shows it
  with its until date and Restore

### Requirement: Changes shows the current change and every previous one

Changes SHALL show the current change, one Trial or one Focus, then a Previous
row with its count that drills down to every previous change, newest first, with
no cutoff (ADR 524). A change still collecting its 14 days of after data SHALL
read Maturing; a matured change SHALL carry its served result, Better, Worse or
Unclear. End SHALL be a compact secondary action followed by a confirm sheet: a
Focus can be ended at any time, and a Trial once it has matured. The app SHALL
send no free-text conclusion. Between the current change and Previous, Changes
SHALL list under "Waiting for pump" each Setting the Trial roster serves as
waiting after a Done (#518), one row each in the Previous rows' columns, with its
name, its block and current → suggested, until the engine resolves it. Changes
SHALL read it from the roster, not the guidance. A maturing Trial SHALL show its
data as it forms (ADR 554): its meals, its trace and every metric module over
what its after period has read so far, each glucose module closed by the
readings it is read from, before → after; an after period with nothing read yet
SHALL show the before values beside an empty after. While it matures no result
SHALL be shown; each Δ SHALL still take its direction's colour (ADR 558).

#### Scenario: A maturing Trial shows its data as it forms

- **GIVEN** the `c3-ic-trial` QA case, a carb ratio Trial six days in that a
  release before #503 and #553 retained
- **WHEN** Changes renders
- **THEN** it reads Maturing with Meals before and after, the trace at each meal
  bolus for both periods, In range / Below 70 / Above 180 and Mean / GMI / CV,
  and each glucose module's Readings before → after
- **AND** no result and no End is offered

#### Scenario: A Trial in its first hours shows an empty after period

- **GIVEN** a carb ratio Trial read before its block has a reading after the
  change
- **WHEN** Changes renders
- **THEN** Meals after reads 0, the trace draws the before period alone, and
  each metric shows its before value beside an empty after with no Δ

#### Scenario: A Done waits on Changes

- **GIVEN** a Done on the basal card that no sync has resolved
- **WHEN** Changes renders
- **THEN** a "Waiting for pump" group lists one Basal row with its block and
  current → suggested, between the current change and Previous

#### Scenario: A maturing Trial cannot be ended from the app

- **GIVEN** an active Trial that has not matured
- **WHEN** Changes renders
- **THEN** it reads Maturing and offers no End

### Requirement: Every change is coloured by its direction

Every change the app draws between two values (a Δ: ▲ or ▼ and the amount)
SHALL be green where the value moved the good way for its metric and red where
it moved the bad way, on every screen: In range up; Below 70, Above 180, Mean,
GMI and CV down; Peak down; Nadir up; a Focus's habit share down. A Δ that
prints as zero SHALL have no arrow and no colour, and a Δ on a metric where
neither way is better (a basal Trial's Control-IQ rows) SHALL keep its arrow in
neutral ink. The colour SHALL NOT stand for the engine's verdict on the change,
which only the result pill carries (ADR 558).

#### Scenario: A maturing Trial's changes are coloured as they form

- **GIVEN** a basal Trial six days in whose In range has risen and whose Mean
  has risen
- **WHEN** Changes renders
- **THEN** In range's Δ is a green ▲ and Mean's a red ▲, and Control-IQ's
  Delivered, Above and Below are neutral
- **AND** it reads Maturing with no result

#### Scenario: The Overview colours every metric's change

- **GIVEN** a window whose previous period has data
- **WHEN** Overview renders
- **THEN** each of In range, Mean, GMI, CV, Below 70 and Above 180 shows its
  change green or red by the way it moved

### Requirement: Overview reports the standard metrics over a chosen window

Overview SHALL show, for the selected 14, 30 or 90 days, the selected window's
date span, In range and the standard CGM metrics against the period of the same
length before, one time-in-ranges bar, and the glucose profile. Below 54 and
Above 250 SHALL read as subsets of Below 70 and Above 180. Below the summary it
SHALL show the ISF estimate whatever the engine decides, drawing current →
recommended only when the analyzer's ISF staging verdict supports the change,
and beside it, the same size, the basal estimate: the day's 48 half-hour slots,
the programmed rate stepped, each slot's estimate over its range, and a mark on
each slot whose staging verdict asserts a move, in its served direction (ADR 523).
Below them, the same size, it SHALL show Meal size over the last 90 days whatever
window is selected: one dot row per size on one Climb axis, a dot per counted meal
with the size's served 25–75% and median, and beneath, aligned like a table, each
size's meal count and median Climb, To peak and At 3 h, At 3 h over its own count.
It SHALL compute none of these and print no explanatory text (ADR 501). Overview
SHALL carry nothing to act on.

#### Scenario: A held ISF shows its estimate without a recommendation

- **GIVEN** a store whose correction factor the analyzer holds
- **WHEN** Overview renders
- **THEN** the ISF estimate shows its estimate and range, and no current →
  recommended

#### Scenario: The basal estimate marks the slots the analyzer moves

- **GIVEN** the showcase, whose basal analyzer lowers 03:00 and 03:30
- **WHEN** Overview renders the 14-day window
- **THEN** the basal estimate draws all 48 slots and marks those two ▼

#### Scenario: Meal size keeps its window when another is chosen

- **GIVEN** the showcase, whose meals are all 40 g or more
- **WHEN** Overview renders, at any window
- **THEN** Meal size reads 90 d, draws 31 meals at 40–59 g and one at 60 g+, and
  shows "–" and 0 meals for the two smaller sizes

### Requirement: Day shows one day with its insulin, carb logging and Prompts

Day SHALL show one day's glucose, the day's insulin as one stacked bar of Basal,
Meal, Correction and Control-IQ, and the day chart, with a day navigator that
drops down a month from the header's date. It SHALL offer Log carbs, which records
carbs eaten without a bolus. While Prompts are unanswered, Day SHALL list them as
Lows and, beneath, Rises (the engine's missed-meal Prompts), each with its count and
hidden at none, and SHALL show each kind one at a time: a Low with Yes, No, False
low and Not sure, a Rise with Yes, No and Not sure at its served peak. Answers SHALL
post through the one prompt-answer path, a Rise's under its own identity. The Day
tab SHALL carry the count of both as a badge. Day SHALL show no aggregate beyond
that day. Day SHALL mark
every finding the per-day model read serves for that day: a Pattern glyph on the
chart at its time, and its habits' served titles on the event row of the bolus
it counted or, with no bolus at its time, on its own row with its reading. Day
SHALL decide no finding itself: it reads no anchor state and keeps no list of
habits.

#### Scenario: Unanswered Prompts are counted on the tab

- **GIVEN** two unanswered Prompts
- **WHEN** the app renders
- **THEN** the Day tab carries a count badge of 2

#### Scenario: A rise is asked about under the lows

- **GIVEN** one unanswered low and two unanswered missed-meal Prompts
- **WHEN** Day renders
- **THEN** it shows a Lows row counting 1 and beneath it a Rises row counting 2,
  and the Day tab carries a badge of 3
- **AND** Rises opens the first rise at its peak's time and reading, answered
  Yes, No or Not sure, with no False low

#### Scenario: Each finding of a day is marked and named

- **GIVEN** a day whose served findings are a meal counted as Carb undercount
  and a low counted as Over-treated low
- **WHEN** Day shows that day
- **THEN** the chart carries two Pattern glyphs at their times
- **AND** the meal's event row names Carb undercount, and the low is its own row
  naming Over-treated low with its reading in mg/dL

### Requirement: Settings holds the sync state, the pump profile and the glossary

Settings SHALL show three rows: Tandem Source with its inline sync state, Pump
profile and Glossary, each opening a drill-down. Tandem Source SHALL show the sync
and account state and an Update form for credentials. Pump profile SHALL show the
active profile's segments read-only. The Glossary SHALL list only the terms the
app prints.

#### Scenario: The pump profile is read-only

- **WHEN** the person opens Pump profile
- **THEN** it shows the active profile's segments with no control that changes them

### Requirement: A failed read or write is shown where it happened

When a read endpoint is unavailable, the affected screen SHALL show its title,
the label "Unavailable" and a Retry, and every other tab SHALL keep working. When
a write fails (pin, snooze, answer, log), the control SHALL return to its prior
state and a transient bar SHALL show "Not saved" with Retry.

#### Scenario: An unavailable read affects only its screen

- **GIVEN** the outcomes read answers 503
- **WHEN** the person opens Overview and then Queue
- **THEN** Overview shows Unavailable and Retry, and Queue renders its items

#### Scenario: A screen whose answers cannot be read again keeps them, marked stale

- **GIVEN** Overview drew its answers, from this visit or kept from an earlier one
- **WHEN** reading them again fails
- **THEN** Overview keeps drawing them, with Unavailable and Retry in its title row
- **AND** a Retry that succeeds draws the new answers and clears the mark

### Requirement: Each screen draws its last answers at once, and reads them again behind them

A tab the person has opened SHALL keep its answers on screen when they leave it
and come back, without a loading state and without reading them again. The app
SHALL keep each tab's answers in the browser, keyed by the build and by a hash of
the API token they were read under, and after a page refresh a tab read before
SHALL draw those answers at once while its first read asks the engine again. A
new token SHALL forget every answer kept under the last one, and storage the
browser refuses SHALL keep nothing, the app reading the engine as before (#522).

#### Scenario: A refresh draws the remembered Queue before the engine answers

- **GIVEN** the Queue was read in this browser under the current token
- **WHEN** the page is refreshed and the guidance read has not answered yet
- **THEN** the Queue draws the remembered items, and the guidance is read again
  behind them

#### Scenario: Answers kept under another token are never drawn

- **GIVEN** answers kept under one token
- **WHEN** the app runs under another token, or another build
- **THEN** no tab draws them, and saving drops them

### Requirement: Every served findings row carries one headline

Every row the findings projection publishes, an asserting setting row, a Finding
or a Pattern, SHALL carry a `headline`: a factual sentence composed only from the
row's own fields or from the analyzer payload the projection already holds. A
headline never states a count, direction or verdict the analyzer did not publish,
and is identical across reruns of the same window. The projection serves no held,
no-clean-day or past-setting row, so it serves no headline for one (ADR 531).

#### Scenario: Every served row carries a headline

- **WHEN** the projection publishes asserting basal, carb-ratio and correction-factor
  rows and Finding rows for one window
- **THEN** every row carries a non-empty headline drawn from served facts only
- **AND** each setting row's headline opens with its analyzer's served sentence

#### Scenario: A setting that asserts nothing serves no row

- **GIVEN** a basal slot or a carb-ratio block that asserts no move
- **WHEN** the projection publishes any window that holds it
- **THEN** it serves no row and no headline for it

### Requirement: Setting findings are titled by their user labels

The findings projection SHALL title a correction-factor row "Correction factor"
and a carb-ratio block "Carb ratio <span>", each with its direction suffix
(" · <direction>"). A basal row keeps "Basal <span>". The regenerated fixtures and
the QA finding-title literals SHALL carry the same titles. The projection lists no
setting that asserts nothing, so no title carries a lean (ADR 531).

#### Scenario: A correction-factor finding reads as Correction factor

- **GIVEN** the manufactured case isf-strengthen
- **WHEN** the findings projection publishes its correction-factor row
- **THEN** the row is titled "Correction factor · strengthen"
- **AND** no setting row's title contains "ISF" or "I:C"

## MODIFIED Requirements

### Requirement: The server serves a name beside every identifier the desk prints

The per-day model read SHALL serve `lever_title` on every episode: the
attributed Lever's title from the one lever name source, or null when the
episode carries no Lever. The guidance read SHALL serve, on every Pattern
candidate, a `title` on each member, an `action_title` on each member whose
action is non-null, and a `title` on the Pattern's action when that action is an
identified action rather than span rows. A habit member's names SHALL be its
Lever's title from the one lever name source, and a setting member's names
SHALL be the setting's user-facing label from guidance's closed setting-label
table: Basal, Correction factor or Carb ratio. The Pattern action's title SHALL
be the title of the member it came from. Names SHALL travel beside identifiers and SHALL NOT
replace, rename or be parsed from any identifier. Names SHALL NOT enter the
set-aside comparison state.

#### Scenario: Every episode is served with its Lever's name

- **GIVEN** a synthetic day with one attributed episode and one unattributed episode
- **WHEN** the per-day model read serves that day
- **THEN** the attributed episode's `lever_title` equals its Lever's title
- **AND** the unattributed episode's `lever_title` is null
- **AND** every Lever in the closed set has a non-empty title with no underscore

#### Scenario: Pattern members and their action are served with names

- **GIVEN** synthetic analyzer output whose Pattern roster carries habit and setting members
- **WHEN** the guidance read serves its Pattern candidates
- **THEN** every member carries a non-empty `title` with no `habit:`, `setting:` or underscore token
- **AND** a carb-ratio setting member is named "Carb ratio"
- **AND** every member with an action carries its `action_title`
- **AND** a Pattern whose action is identified carries that action's `title`
- **AND** each Pattern's set-aside baseline equals the baseline of the same candidate with its names removed

### Requirement: The Focus read names the watched behavior

The selected Focus read SHALL serve `lever_title` beside `lever`: the Lever's
title from the one lever name source, the override's title for the override, or
null for a stored lever outside that set. The name SHALL be derived when the
record is read and SHALL NOT be stored. The Focus's `title`, its `lever` and the
Focus roster rows SHALL be unchanged.

#### Scenario: Every behavior a Focus can watch is served with its name

- **GIVEN** a synthetic Focus pinned on each lever a Focus may pin alone, and a
  Pattern Focus on Highs after meals watching Carb undercount
- **WHEN** the selected Focus read serves each of them
- **THEN** each `lever_title` equals its Lever's title, and the override's is
  "Doses above pump calculation"
- **AND** no `lever_title` contains an underscore

#### Scenario: A Pattern Focus keeps its Pattern's title

- **GIVEN** a Pattern Focus on Highs after meals watching Carb undercount
- **WHEN** the selected Focus read serves it
- **THEN** its `title` is "Highs after meals" and its `lever_title` is
  "Carb undercount"

#### Scenario: A lever outside the set is served without a name

- **GIVEN** a stored Focus whose lever is no longer a Lever or the override
- **WHEN** the selected Focus read serves it
- **THEN** its `lever_title` is null and the read still answers

### Requirement: Every set-aside subject guidance lists carries its served name

The guidance read SHALL serve a `title` on every set-aside subject it lists.
For a set-aside subject the read no longer carries, the name SHALL come from the
backend's own name source for that subject, looked up by the whole subject and
never parsed from it:

| Subject | Name source |
|---|---|
| setting | the setting-label table |
| habit | its Lever's title |

Every Pattern is always served present with its roster title, so a set-aside
Pattern keeps that title.

A subject outside the closed subject set, such as a retired investigation
subject (ADR 499), SHALL be served with no title. No name
SHALL enter the set-aside comparison state.

#### Scenario: Set-aside subjects the read no longer carries are named

- **GIVEN** set-aside preferences for a setting and a habit that the read serves no candidate for
- **WHEN** the guidance read serves them as absent rows
- **THEN** the setting row is titled by its setting label and the habit row by its Lever's title
- **AND** each row remains set aside

#### Scenario: A set-aside Pattern is served present with its roster title

- **GIVEN** a set-aside Pattern preference
- **WHEN** the guidance read serves it
- **THEN** the Pattern is served present, not absent, with its roster title and remains set aside

## REMOVED Requirements

### Requirement: Eating-sequence charts reuse the shipped tile and served cohort values

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: Sequence drill reuses the shared clear control and frozen behavior

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: Diagnose draws eating-sequence evidence from the finding case file

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: High-carb response evidence is coherent with its selected population

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: Sequence response curves use an explicit observed end anchor

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: High-carb sequence reuses the Pattern response presentation

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: High-carb response retains the shipped interaction and evidence boundary

**Reason:** ADR 499 cuts this from the engine at the operator's direction ("Drop these from the engine."). The eating-sequence findings, their case evidence and charts are gone.

**Migration:** Issue #501 tracks a future Overview report card comparing carbs with the post-meal response.

### Requirement: The Findings band counts Findings, not rows

**Reason:** ADR 499 cuts behavior that some of this requirement's scenarios describe ("Drop these from the engine."). Its surviving behavior is unchanged and is restated without those scenarios as "The Findings band counts distinct Findings, not rows": a MODIFIED block cannot drop a scenario, so the requirement takes a new header.

**Migration:** Read "The Findings band counts distinct Findings, not rows", ADDED in this change.

### Requirement: A Focus names its watched behavior by its served name

**Reason:** ADR 499 cuts behavior that some of this requirement's scenarios describe ("Drop these from the engine."). Its surviving behavior is unchanged and is restated without those scenarios as "A Focus prints its watched behavior by its served name": a MODIFIED block cannot drop a scenario, so the requirement takes a new header.

**Migration:** Read "A Focus prints its watched behavior by its served name", ADDED in this change.

### Requirement: A setting value in Changes prints in its user form

**Reason:** ADR 499 cuts behavior that some of this requirement's scenarios describe ("Drop these from the engine."). Its surviving behavior is unchanged and is restated without those scenarios as "A setting value in Changes prints in the wearer's user form": a MODIFIED block cannot drop a scenario, so the requirement takes a new header.

**Migration:** Read "A setting value in Changes prints in the wearer's user form", ADDED in this change.

### Requirement: Diagnose surface asks "what tuning moves are available now?"

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Diagnose presents retired I:C regimes as non-actionable Watching evidence

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Diagnose renders Finding case files without browser-owned policy.

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Day surface asks "what happened on this day?"

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Diagnose separates clock-window selection from basal verdict state and keeps chart evidence legible

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Diagnose clock-window gestures work with direct tablet touch

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Dark Diagnose material hierarchy keeps advisory evidence distinct

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The basal evidence tile states its finding and draws each night as an independent delta

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Every settings evidence chart opens the parameter panel its queue row opens

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Finding occurrence lists share one roster presentation

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Clinical attention and tappable affordance do not share a hue

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The Diagnose stage holds the active finding's chart

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The stage card's title is the headline's only home

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A revision of the Diagnose left column ships with its ledger amendments and evidence

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A revision of the Diagnose findings rail ships with its ledger amendments and evidence

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Diagnose places selected evidence before the clock overview

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Ranked findings share one aligned row structure

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: All charts opens fullscreen without an intermediate dock

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A carb-ratio block names its interval the way the server labels it

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Diagnose evidence charts seat their axis names inside the chart

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A findings-queue row is exposed as the control it is

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A merged parameter finding stages every member the server published

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The desk is the only shell, built ahead of time and served at root

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The Episode Log words an outranked anchor as claimed, and Diagnose shares the word

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A claimed row names what the anchor matched and ends with the Finding that claimed it

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A claimed anchor keeps its Finding's hue and size

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The Episode Log bands are explained where a reader looks

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The Episode Log revision ships with its ledger stories and evidence

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A folded cause's count reads on its Pattern's population

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The Response comparison caption reconciles with its cohorts and the band

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The case-file counts revision ships with its ledger amendments

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Day counts each recorded day once

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Day names the subject it was opened from by its served name

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Episode Log rows name the attributed Lever by its served name

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Change records word their served facts

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A Pattern concern in Changes names its members and action

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The topbar's Day reopens the day last looked at until the page reloads

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The Day desk's viewed stamp is the reader's local clock

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Diagnose's address names the case the reader is on

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The watch dock names Changes for a watched Trial or Focus

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The watch dock opens Changes on the watched Trial or Focus

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: An open change record opens on its retained-context reassessment

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: An empty record figure says why it is empty

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A change record names when Harmonic recorded it

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Changes states a Plan's phase from its served verdict

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Changes keeps a recorded Plan apart from a newer draft

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The watch panel carries a recorded Plan awaiting the pump

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The case-file header carries no pending-Plan note

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Case-file Occurrence rows name what the Occurrence is

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A selected Occurrence reads as its facts and served reason

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The basal lane stays reachable on short desktop windows

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The basal lane key names a recurring-lows lower apart from a measured lower

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Each basal key verdict agrees with its slot's panel

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The basal evidence names why its nights were excluded

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A render keeps focus inside a seated Diagnose case file

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A Pattern owns its causes in the rail

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The rail shows served urgency

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Every ranked rail row draws one mini instrument

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Rail rows print the served count sentence

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The basal lane names and paints every verdict

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Diagnose opens on the 24 h window

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A cold destination shows a count-free skeleton

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Changes reads an older detected change's ending

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A superseded ending's note names no setting

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Changes and carb-utility Day links name their return target by identity

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A carb utility's Day return keeps the desk it returns to

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The Log carbs header names the reader's local date and time

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The served active change leads every plain arrival to Changes

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Open Plan holds for the visit in which it was pressed

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A Plan draft stays reachable while a change is watched

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Diagnose's return names the watched change

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Changes follows a watched Trial or Focus through

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The watch dock and Changes print one Trial day count

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: No authored Guide article names Verify

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Changes' Plan asks "what will I program into my pump?"

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Every served reason on a watched-change line prints in words

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Served states, verdicts, modes and denominators on watched-change lines print as words

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The Focus entry words why a Focus is not offered

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A refused change write reads as a sentence on the desk

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Changes lists every set-aside concern by a name

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Changes says why its concern leads in words

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Diagnose names the correction factor and carb ratio in the wearer's words

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The watch dock's title names the change and its values wrap below

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Desk copy joins no clauses with an em dash

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A later conclusion stays with the change record it was typed on

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The Plan lifecycle replay certifies the decision it recorded

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The glucose overview's window caption stays whole inside the chart

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The Spotlight's middle-rank verdict line keeps every fact inside the chart

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The glucose overview's header keeps its title at the narrowest split

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Chart furniture never strikes an axis label

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The basal slot panel drills into its steady nights

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Selecting a night draws its trace and its facts

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A revision of the basal drill ships with its ledger amendments and evidence

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Diagnose is retained across destination changes

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Changes lists records by edit and names its loading

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The desk renders served Pattern evidence and preserves selection

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The v2 desk preserves readable cross-destination evidence chrome

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Diagnose and Day keep the reader's navigation context

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Changes keeps completed and expired Trial records reachable

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Focus withholding and v2 destinations remain discoverable

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The watch dock reports the saved Plan draft

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Diagnose's staged marks follow the Plan draft

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: An ended record whose saved ending serves no periods draws a requested reassessment

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The Retained reassessment names its stored context in words

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A change record's differences and percent cells print at one decimal

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A figure with no curve takes no chart space

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: A saved ending with clock bins draws its saved curve

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: The Episode Log's Quiet line prints no time span

**Reason:** The desk retired with the swap to the five-tab app (#495, ADR 495). Its destinations, rail, stage, watch dock and Episode Log are gone, so this requirement describes no shipped surface.

**Migration:** The desk is preserved as release v0.1.0. The five tabs are specified by this change's ADDED requirements and locked in `docs/design/recommendations-redesign.md`.

### Requirement: Every findings row carries one served headline

**Reason:** Its held, blind and past-setting scenarios describe rows only the desk read; the findings answer no longer serves them (#531, ADR 531). It is restated without them as "Every served findings row carries one headline": a MODIFIED block cannot drop a scenario, so the requirement takes a new header.

**Migration:** Read "Every served findings row carries one headline", ADDED in this change.

### Requirement: Diagnose's setting findings are titled by their user labels

**Reason:** Its recurring-lows scenario titles a held row and its text names the JS findings mirror; the findings answer serves no held row and the mirror is gone (#531, ADR 531). It is restated without them as "Setting findings are titled by their user labels".

**Migration:** Read "Setting findings are titled by their user labels", ADDED in this change.

### Requirement: A rendered Finding row states one denominator

**Reason:** The case-file preparation no longer serves rendered rows or a copy of the findings (ADR 547). The five-tab app reads only the preparation's identity, and the Queue reads its rows, headlines and counts from the findings answer, whose headline composer this change leaves alone.

**Migration:** None. A Finding's row, headline and counts are the findings answer's; its case header still states its own case file's summary.

