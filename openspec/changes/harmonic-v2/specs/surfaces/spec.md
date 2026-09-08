## ADDED Requirements

### Requirement: Python serves the v2 desktop beside v1 from one packaged runtime

The system SHALL serve the v2 desktop at `/v2/` and its fingerprinted assets
beneath `/v2/assets/`, built ahead of time and served by the existing Python
process. The packaged runtime SHALL require no Node runtime and no CDN at run
time. V1 SHALL remain served on its existing routes against the same
authenticated API and the same database; this change admits neither a root-route
cutover nor v1 retirement.

The server's non-API route set SHALL remain closed: every served page path is
named explicitly, and any other path SHALL answer 404. The browser-side
disk-serving harness and the Python route policy SHALL agree, because a harness
that serves a path the server does not is structurally blind to a missing route.
The publishable-tree inputs SHALL account for the new frontend source root and
its build configuration; a shipping path that is silently default-excluded is a
delivery defect even though the allowlist checker reports every path
dispositioned. Built output is generated during packaging and is not a tracked
input, so its delivery SHALL be proved in the packaged image rather than by
committing it.

#### Scenario: The packaged runtime serves both surfaces

- **WHEN** the installed package is started against a synthetic database and authenticated
- **THEN** `/` and every existing v1 page path serve the v1 shell, `/v2/` serves the v2 shell, and both answer from the same API and database
- **AND** the runtime image contains no Node executable and the built output references no CDN host

#### Scenario: An unlisted path is not served

- **WHEN** a path outside the declared page set and asset prefixes is requested
- **THEN** the server answers 404 rather than the shell
- **AND** the closed-set route assertion names the complete non-API route set, so a new route cannot be added without updating it

#### Scenario: A missing build fails loudly

- **WHEN** the v2 build output is absent
- **THEN** the v2 route reports that the frontend build is missing rather than serving a blank or partial shell, and the API remains reachable

#### Scenario: The published tree carries the new shipping paths

- **WHEN** the publishable tree is materialised into a scratch directory
- **THEN** it contains the v2 frontend source and its build configuration, so both surfaces can be built and packaged from that tree alone
- **AND** it does not contain built output, which is untracked and therefore never a candidate input
- **AND** it does not newly contain the design mockups or their retained sweep evidence
- **WHEN** the image is packaged and run
- **THEN** it contains both built surfaces and serves them

### Requirement: The desk carries persistent chrome, four destinations, Day and the utilities

The v2 desktop SHALL present one fixed desk: a persistent topbar and footer that
do not move as the destination changes, the four destinations Overview, Explore,
Changes and Day with Overview as the default, the scope and Log carbs controls,
the advisory line, and the utility strip. Pressing the destination already in
hand is the way back up within it.

Day SHALL be reachable two ways, and they SHALL be distinct. Direct entry from
the topbar invents no prior subject and offers no return. A contextual entry from
a concern, a supporting night, a follow-up or a utility SHALL carry its date,
moment, canonical subject, affected window, applicable lever, source destination
and precise return-focus target, and returning SHALL restore that exact target
rather than merely reopening a destination. Day SHALL own its five-track
chronology, week ribbon, month access, statistics and Episode Log. Return context
is frontend-owned route state, not a backend payload.

The utilities SHALL open into the reading pane's seat with the destination
standing underneath: Guide, Glossary, Log carbs, Carb questions with its open
count, and App settings, with Pump settings reached from Changes. A utility's own
contextual Day entry SHALL keep that utility open as its continuation, and
closing it SHALL reveal the Day desk's return named for that utility.

Destination arrival SHALL focus the pane heading unless the caller supplies a
precise target, which always wins. Escape SHALL follow one layered hierarchy and
restore the launcher or control that opened each layer, a field SHALL own Escape
so a stray press cannot discard an unsaved draft, and selection, cohort, chart
cursor, slot, night, date and utilities SHALL remain keyboard-operable with
visible focus. Colour semantics SHALL always carry label, shape or positional
redundancy.

#### Scenario: The desk holds still across destinations

- **WHEN** the reader moves between all four destinations
- **THEN** the topbar and footer keep their geometry measured against Overview as the reference view
- **AND** exactly one destination is marked current at a time

#### Scenario: Direct and contextual Day make different claims

- **WHEN** Day is opened from the topbar
- **THEN** no prior subject and no return target exist
- **WHEN** Day is opened from a concern, a night, a follow-up or a utility
- **THEN** the desk names the subject it came from, and following the return restores that exact selection and focus target

#### Scenario: A utility keeps its place across a Day visit

- **WHEN** a dated moment inside a utility opens Day
- **THEN** that utility stays open over the Day desk as the continuation
- **AND** closing it reveals a return named for that utility, which reopens it over the destination it was opened on

#### Scenario: Escape is layered and a field owns it

- **WHEN** Escape is pressed with a utility seated, then with a sheet open, then with a form open
- **THEN** exactly one layer steps back per press and focus returns to what opened it
- **WHEN** Escape is pressed while a text field holds focus
- **THEN** the draft is retained and no layer closes

### Requirement: The desk renders one selected concern, its evidence and the Plan journey

The v2 desktop SHALL render the backend-selected leading priority or active
change on Overview with a concise reason and one named route into its evidence,
without duplicating Explore's full roster. Set aside SHALL retain the same
subject, its optional reason and a visible Restore while naming the next
backend-selected priority, and Restore SHALL return the eligible subject.

Explore SHALL own the findings roster, the clock window, the event-comparison
cohorts with their served support labels and member traversal, the selected case
file, and all 48 basal slots independently discoverable with their supporting
nights, values, interval, support and staging verdict. Basal, Correction factor
and Carb ratio SHALL keep their distinct evidence and delivery paths.

Plan SHALL own one setting family at a time, the complete pump-entry schedule
with its served capacity, the distinction between the detected and the proposed
schedule, draft save, decision recording, pending reconciliation resolving to
mismatch or match, re-keying, and withdrawal. Nothing in Plan SHALL imply that
Harmonic programmed the pump.

The browser SHALL NOT derive a support floor, a direction, a staging verdict, an
evidence membership or a readiness criterion. A failed draft save or decision
record SHALL say so, keep what the wearer entered, offer an explicit retry, and
record no success; a successful retry SHALL record it.

#### Scenario: Overview leads with one concern and its route

- **WHEN** guidance serves a leading available priority
- **THEN** Overview renders that subject, its served reason and one named route into its evidence
- **AND** Overview does not render Explore's full findings roster

#### Scenario: Set aside is durable and returns its subject

- **WHEN** the reader sets a concern aside with a reason and reloads
- **THEN** the concern is still set aside with that reason and a visible Restore, and the next backend-selected priority is named
- **WHEN** Restore is pressed
- **THEN** the eligible subject returns

#### Scenario: Every basal slot stays discoverable

- **WHEN** the basal evidence is opened
- **THEN** all 48 slots are independently reachable, each carrying its supporting nights, current and suggested values, interval, support and staging verdict
- **AND** a held or thin slot keeps its numbers and cannot stage unless the backend permits it

#### Scenario: A failed Plan write is never shown as saved

- **WHEN** a draft save or decision record fails
- **THEN** the surface says which operation failed, keeps the entered schedule, offers an explicit retry, and records no decision
- **WHEN** the retry succeeds
- **THEN** the decision is recorded and reconciliation proceeds

### Requirement: The desk renders follow-up, endings and history for both arms

The v2 desktop SHALL render the follow-up of a detected setting Trial and of a
behavioral Focus, and SHALL keep their evidence semantics distinct.

Follow-up readiness SHALL be read from the selected record's retained comparison,
not from watch maturity: the record's maturity label and message are lifecycle
metadata and SHALL NOT be rendered as an evidence criterion. Pre-ready values
SHALL come from the retained-assessment request rather than from the roster.
Setting arms and the Focus arm SHALL be rendered on their own shapes; the Focus
arm carries no fixed required population count and no availability flag, and
SHALL NOT be rendered as a proportion of a required count. An overall assessment
SHALL be rendered only as concerning, unclear or context; a favourable reading
exists per outcome row and SHALL NOT be summarised as a favourable ending.
Readable values, charts, directional labels and accumulating progress SHALL
remain visible before readiness and after an inconclusive finish, and a progress
figure SHALL NOT exceed its own maximum.

Focus SHALL lead with the intended behavior and render adherence separately from
mapped glucose outcomes; zero opportunities, absent measurements and a positive
denominator with zero unwanted events SHALL remain distinct claims. Manual
ending, Trial preemption and lever-unavailable ending SHALL remain distinct, and
a preempted Focus SHALL be dropped, retained in history and never silently
resumed.

A finished record SHALL open on itself before another concern is offered, and
history SHALL distinguish the original or first-observed context, the observed
change, the immutable saved ending, a retained or current reassessment, and
explicitly unavailable legacy facts. Trial finish SHALL record a durable
conclusion without implying Harmonic programmed the pump; Revert-to-Plan remains
the manual-entry route. A failed finish, pin or resolve SHALL say so, keep what
the wearer wrote, offer an explicit retry and record no ending.

#### Scenario: Readiness is read from the record's comparison

- **WHEN** a follow-up record is opened before it is ready to judge
- **THEN** the surface renders the served evidence unit, observed count, contributing dates, criterion status and reason from the retained comparison
- **AND** the watch maturity label is rendered as lifecycle metadata, not as the evidence criterion

#### Scenario: The Focus arm is not rendered against a required count

- **WHEN** a Focus follow-up is rendered
- **THEN** its measured and unmeasured populations and elapsed days are shown as served, without an "X of Y required" meter and without an availability flag
- **AND** zero opportunities is not rendered as perfect adherence, and a missing measurement is not rendered as an observed zero

#### Scenario: An ending is recorded once and kept

- **WHEN** a Trial is finished with a written conclusion
- **THEN** the finished record opens on itself before any other concern is offered, and the saved ending is immutable
- **WHEN** the same record is reopened later
- **THEN** the original context, the observed change and the ending remain distinct, and a current reassessment never replaces the original

#### Scenario: A preempted Focus stays history

- **WHEN** a genuinely later setting Trial preempts an active Focus
- **THEN** the Focus ends as preempted, names that reason, remains reachable in history and never resumes

### Requirement: The built surface is proved against its frozen contract

The built v2 desktop SHALL be accepted only on executed evidence. The frozen
behavior ledger `mockups/harmonic-v2-desktop.behavior.md` SHALL replay against
the built, Python-served app at both accepted desktop sizes, reporting a nonzero
applicable story count; a run that executes zero stories SHALL fail rather than
pass. Every sanctioned retirement SHALL assert its absence and its premise and
print the sanction that authorised it. The stories that could not be exercised
against the design prototype SHALL be proved here, because no prototype run can
close them.

Each term of the 34-term lock SHALL carry exactly one fidelity row with its
evidence, and every `eye` term SHALL carry a named human judgment; paired
prototype and built-app renders SHALL use identical bytes at both sizes. Every
committed fixture SHALL come from a committed generator carrying a provenance
stamp and a drift check in the same change.

#### Scenario: The frozen ledger replays against the built app

- **WHEN** the behavior replay runs against the built Python-served app at 1280×720 and at 1440×900
- **THEN** every story reports a pass, the applicable story count is nonzero and reported, and each retirement prints its sanction

#### Scenario: A dropped behavior is visible rather than silent

- **WHEN** a behavior the ledger records is absent from the build
- **THEN** its story fails and names the behavior, rather than the run reporting success with fewer stories executed

#### Scenario: Fixtures carry their generator

- **WHEN** a committed synthetic fixture is regenerated from its committed generator
- **THEN** the bytes match, and the drift check fails when they do not
- **AND** the retained prototype fixtures the behavior contract was frozen against are unchanged

#### Scenario: Each increment proves its own capability, and the whole contract is proved once

- **GIVEN** the surface is delivered in serial increments against one shared replay
- **WHEN** an increment is complete
- **THEN** it proves the stories for the capability it delivered, selected explicitly, against the built app
- **AND** it is not required to prove a story for a capability a later increment delivers
- **WHEN** the final increment is complete
- **THEN** the complete frozen ledger replays with no story deferred, none weakened and none deleted

#### Scenario: New interface coverage is discovered by the test commands

- **WHEN** tests are added under a source root the existing commands do not glob
- **THEN** the fast-gate command and the browser-suite wiring are extended to discover them in the same increment that adds them
- **AND** a passing pre-existing suite is not accepted as coverage for the new interfaces
