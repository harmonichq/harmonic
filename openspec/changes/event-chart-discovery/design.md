# Design — event-chart discovery

## ADR 83 — Event-chart discovery is a queue view backed by server-published coordinates

### Context

The Diagnose queue is the entry point for Findings and settings. Six behavioral
Findings already support the event-comparison canvas, but the browser decides
which ones by matching a case-file title against `ALIGN_FACTOR_BY_CAUSE` in
`frontend/diagnose-workstation.js`. The event-comparison backend separately owns
the same closed factor membership and its `view` / `factor` coordinates in
`ciq_autotune/event_comparison.py`. Issue 83 makes eligibility visible at the
queue root, so retaining the title-keyed browser copy would turn a presentation
string into a clinical-evidence routing rule.

The queue already receives a fixed-key server projection from
`ciq_autotune/findings_projection.py`; its JavaScript mirror and generated
fixtures are held equal by tests. The existing Sift is browser-owned selection
over server-published `chips`, and it changes only which rows are visible. ADR
31 keeps Align as a projection switch over a Finding already selected in the
pane. ADR 62 keeps the clock window and all membership under both alignments
server-owned. ADR 81 withholds projection-backed rows and counts while a new
window is pending or failed.

### Decision

Each projected queue row carries a nullable `event_chart` coordinate object. An
eligible behavioral Finding receives the canonical event-comparison `view` and
`factor`; settings and unsupported Findings receive null. Eligibility also
requires that the row's current server projection includes the canonical
event-view family (`meals` for the meals view, `lows` for the lows view). A
compatible Finding present only through another family receives null for that
window, because its case file has no population for the event chart. The value
is derived from `VIEW_CONFIG`, or from one shared helper generated from it, so
the closed factor set has one production source of truth. The frontend does not
inspect a title, lever name, chip, family, or occurrence to infer eligibility.

The fixture-only JavaScript mirror does not transcribe that closed set. Its
generator publishes an `inputs.event_charts` factor-to-coordinate object from
the same canonical Python configuration beside the three projection inputs;
the mirror consumes that generated object when it rebuilds arbitrary windows.
The frozen server answers still deep-compare the mirror output. The closed
factor lists in `frontend/diagnose-event-comparison.js` remain response-shape
validation for the event-comparison API; they do not decide queue eligibility
and are outside this refactor.

`All findings` and `Event charts` are alternative queue views. `All findings`
is the default. `Event charts` retains only rows whose server-published
coordinate is non-null, without reordering them. The View selection intersects
with the existing Sift selection: the browser may combine already-published row
facts, but it may not manufacture membership. Held, blind, setting, and
unsupported Finding rows are absent from the Event charts result rather than
collapsed into a secondary disclosure. Queue metadata describes the visible
result of the active root filters; pending and failed projections retain the
selected controls but withhold row counts under ADR 81.
When settled filters leave no visible row, queue metadata retains the existing
duration-only empty form and the pane reads `No findings match the current
filters.` The copy names both Sift and View rather than incorrectly blaming
chips alone.

The generic rendered `Inspector` label and its separate breadcrumb strip are
removed. The pane header itself owns the existing navigable trail and metadata:
at root it reads `Findings`; in a case file it reads `Findings › <Finding>`.
Existing deeper-path elision, breadcrumb navigation, Backspace navigation, the
30 px shared header seam, and the right-pane width remain. The accessible pane
name follows the visible Findings heading and does not expose the retired label.

At queue root, one compact `Filter` control in that header opens one menu with
two groups:

- Sift: Highs, Lows, Meals, Corrections.
- View: All findings, Event charts.

The menu replaces the Sift instrument in the global rail and uses the shipped
app's tokens and control idioms. It is an ARIA menu: Sift choices are
`menuitemcheckbox` controls, View choices are `menuitemradio` controls, and one
item has roving focus. Opening focuses Highs; Up/Down wrap, Home/End jump, and
Enter/Space changes the focused choice without closing the menu so several
filters can be composed. Escape closes the menu, restores focus to Filter, and
consumes that key before the drawn-window Escape handler can clear the range.
Tab closes without trapping focus and continues in document order. Clicking
outside closes without changing a selection; the trigger toggles closed with
focus retained. Returning from a case file restores the selections with the
menu closed. The trigger visibly and accessibly reports how many of the Sift
and View groups are non-default. The menu does not add a second header row and
is hidden at every case-file and setting-detail depth.

Align remains in Diagnose and retains its current case-file-only position and
`By clock` / `By event` choices. Opening an eligible row while the Event charts
view is active seeds that case-file frame to `By event`; opening the same row
from All findings keeps the existing `By clock` default. The reader may switch
either direction without changing the Finding, window, or queue filters.
Returning to the queue disposes the event canvas, restores the pooled clock
canvas, and preserves the View selection, Sift selection, clock window or drawn
range, queue scroll position, and queue ordering.

A compatible Finding whose canonical event family is absent remains reachable
under All findings with `event_chart: null`; Filter hides it from Event charts
and Align is hidden on that window-specific case file. The existing zero-family
clock fallback remains as defense for a projection that changes after entry,
not as the normal result of selecting an Event charts row.

### Risk contract

- **Must prevent:** a title, client allowlist, absent canonical event family, or
  stale projection routing a reader to wrong or empty event evidence; filtering
  changing the server population, pooled chart, ranking, safety verdict, or
  staged advice; a pending or failed projection retaining old rows or counts.
- **Must recover:** an event-comparison request or response validation failure
  restores By clock and its header, keeps the reader on the same Finding, and
  preserves the window and root filter state, extending frozen story S34 to
  direct Event charts entry.
- **Accepted failure:** an unavailable event comparison may leave the reader on
  the compatible Finding in By clock; it must not synthesize or substitute an
  event chart. A failed findings projection continues to show ADR 81's explicit
  unavailable state and recovers when another window is selected.
- **Unsupported:** issue 83 does not repair the pre-existing inability to change
  a case-file clock window at 390×844. The queue-root Filter itself and every
  menu item remain reachable and inside that viewport because this change moves
  an existing control there.
- **Evidence owed:** projection/mirror contract tests; queue and accessibility
  tests; built-app replay for success, zero-result, pending, failure, direct
  entry, switching, and restoration; live interaction review; and
  base/revision comparisons for every affected state. Revision-only states use
  the nearest shipped base state as a labeled comparator; the base is never
  modified to fabricate new UI.

Why: silent incorrect evidence routing is the harmful outcome; fetch failure is
recoverable without inventing evidence. Disposition: issue 83 work order.

### Interface and wiring

The producer is the findings projection row serializer. Its `event_chart`
coordinate is consumed by the queue's Event charts predicate, the case-file
entry default, and the existing Align projection loader. The existing
event-comparison projection API remains unchanged and consumes the published
`view` and `factor`. The JavaScript projection mirror and generated fixtures
carry the same nullable field and remain byte-for-byte contract checks, not a
second eligibility source. This is an additive field on the existing
`diagnose-findings-v1` projection: every row carries the key, including null,
and the schema name does not change, matching the projection's established
additive-field practice.

The root Filter control owns browser interaction state only. The workstation
extends the queue renderer's existing view-state object with the Event charts
selection rather than introducing a second queue implementation. Sift continues
to consume server-published chips. View consumes only the server-published
event-chart coordinate. Both feed the existing queue renderer; neither changes
the pooled chart or requests a different findings population. The case-file
frame retains the existing server row id plus whether entry requested event
alignment; it never stores coordinates. Every Align visibility and request
decision re-resolves that id through `findingRowFor(frame)` and reads the live
row's `event_chart` from the current settled projection. If a window change
makes that value null, the case file stays open, disposes the event canvas,
returns By clock, and hides Align.

### Surface lifecycle and visual source

Surface lifecycle is `revise`. `AGENTS.md` declares the only safe app start:

```sh
uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite
```

The database is generated entirely by `scripts/gen_revise_e2e_db.py`; no live
fetch, credentials, or real patient data are permitted. The frozen behavior
ledger is `mockups/finding-evidence-routing.behavior.md` and the built-app replay
is `frontend/diagnose-workstation-behavior.replay.mjs`. There is no lock
manifest. `frontend/index.html` token blocks, `frontend/theme.css` roles, and
the shipped components are the visual source of truth. Temporary wireframe
colors and geometry are not implementation values.

### Verification evidence

The built-app contract adds stories for the root menu, the filtered root,
direct event entry, switching back to clock, and return-state restoration. Unit
and mirror tests prove the nullable projection field, the canonical six-member
set, filter intersection, preserved order, and the absence of title inference.
Exact base/revision pairs cover root, longest/deepest breadcrumb, one setting
detail, eligible and incompatible Finding details, pending, failed, By-event,
and By-clock at 1440×900 and 1024×900 in light and dark. Revision-only
menu-open, filtered-root, and returned-root renders sit beside a labeled shipped
base root with its Sift instrument. At 390×844 in both themes, the shipped base
root/Sift is compared with revision Filter closed and open, with
viewport-containment assertions for Filter and every menu item. Live `audit`
and `polish` judge hierarchy, menu grouping,
density, focus flow, and interaction feel in addition to mechanical geometry.
The pane and canvas header rules remain one continuous seam without clipping or
overlap. The exact implementation base is
`02d400ed6b62c79a8eb8d8283c0c7c83c95421de`; all 50 frozen stories must replay
against it and the base inventory must be reconciled before the issue 83 ledger
amendment.

### Closed document inventory

Current public and durable descriptions that implementation must reconcile are
`mockups/INDEX.md`, `mockups/finding-evidence-routing.behavior.md`,
`openspec/changes/finding-evidence-routing/design.md`,
`openspec/changes/finding-chip-sift/design.md`,
`openspec/changes/pane-header-single-seam/design.md`,
`openspec/changes/by-event-window-membership/design.md`, and
`openspec/changes/filter-unrelated-basal-findings/design.md`. Historical scope,
research, and exploration artifacts remain historical and are not rewritten to
describe the new shipped state.

### Consequences

Readers can discover all existing event charts without opening case files one
by one. The new queue view adds no chart, analysis, or clinical classification;
it exposes a server-owned capability already present. The broader Explore mode
remains parked as an incomplete decision ledger.

## Work-order review log

Round 1 — authoring blockers verified: canonical fixture-mirror data path; exact
menu semantics and Escape precedence; settled zero-result copy; re-freezing the
ledger at the current base; narrow-root reachability and complete paired visual
evidence; bounded risk contract; and one executable verification inventory.
One reviewer over-read the event-comparison response validators as queue
eligibility; verified disposition: retain them and state their separate role.
No injected blockers appeared in round 1.

Round 2 — one injected blocker verified: the first revision required a base
menu-open render even though the base has no Filter menu. Fixed by naming the
shipped Sift root as the comparator for revision-only states and forbidding a
fabricated base surface. All round-one authoring blockers rechecked closed.

Round 3 — one late authoring blocker verified: static compatibility alone could
publish Event charts for a scoped row whose canonical event family was empty,
then the existing guard would immediately return it to By clock. Fixed by
making the server field window-population-aware and keeping such rows in All
findings with Align hidden. No event-membership rule changed.

Round 4 / panel cap — one interface contradiction verified: the first wiring
text copied window-specific coordinates into the case frame, which could stale
after re-projection. Scope resolved without a user decision by following the
existing case-file interface: persist row id and requested entry mode only;
re-resolve `event_chart` from the live settled row on every paint. No new panel
will be added beyond the three-panel cap.

Final disposition: countersigned after the cap reviewer verified the revised
row-id lifetime and its browser/replay evidence. No posting blockers remain.
