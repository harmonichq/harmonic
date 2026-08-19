# Design — finding-evidence-routing

## ADR 31 — The inspector is the only steering wheel, and the canvas is a projection of what it selects

**Ruling.** The cockpit has **one inspector** — breadcrumb path, subject case
file, watched-change dock floor — and it is the sole mechanism for selecting
what evidence is on screen. The canvas is **one chart surface that answers
wherever the inspector stands**. Every instrument that used to select data is
retired into something the inspector already is: which view you are looking at
is what you drilled into, which factor is in play is the inspector's own
control, and how the events are laid out is a projection over that
already-made selection. The same inspector serves **Diagnose and Verify**;
Verify becomes the same view system in trial-driven filter mode rather than a
second content model. Day stays off the spine as the deep-context surface that
receives claim context and offers a route back.

Selection is **one-dimensional: the factor**. There is no cohort filter
anywhere; the evidence canvas always draws every verdict.

**Context.** Diagnose had two steering wheels for one chart. The
event-comparison lens carried its own instrument row (VIEW · FACTOR · FILTER),
its own inspector pane and its own occurrence dropdown, while the workstation
inspector carried the drill grammar — so the same evidence was reachable two
ways, holding two pieces of state that could disagree. Verify carried a third
content model on top. Free browsing had no home at all, and the recurring
proposal was a new "explore" mode, which is a fourth.

The disagreement was not cosmetic. Two controls over one chart is how a reader
ends up looking at a view whose title, filter and denominator were set by
different gestures, and this app's output is advisory insulin-dosing guidance:
a reader who cannot tell what population a number is over cannot judge the
number.

**Decision, in six parts.**

1. **Findings are routers, not leaves.** Clicking a finding routes the canvas
   to its evidence, filtered to that finding's events, with the inspector still
   in hand. The finding's drill level is its **case file**; the occurrence
   table is the selection mechanism — a row and its mark on the canvas are two
   reads of one selection.
2. **Free browse is population rows in the queue**, not a mode. Standing rows
   open the same evidence unfiltered, and the case file renders a population
   subject with identical grammar. No new surface, no new content model.
3. **The projection toggle.** The canvas gains exactly one control — `By clock`
   / `By event` — a switch over already-selected data, in the instrument row's
   `ALIGN` group, and present only where the canvas is showing a factor's
   events. `By clock` is the wall-clock read that settings coincidence lives
   on; `By event` is the nadir-aligned typical-of-its-kind read. **VIEW is
   deleted** in the same stroke, by absorption rather than by scope cut: it
   conflated the projection with the data selection, and both now have homes.
   `WINDOW` stays, because a reader viewing by clock can also filter by clock.
4. **The verdict band.** A drilled population states its split proportionally
   and shows one verdict's roster at a time. The split's nouns — `Meets
   criteria` / `Borderline` / `Does not meet` — are one vocabulary across the
   control, the group rule, the row cells and the chart's own series names.
5. **Selection is evidence, never navigation of the viewport.** Hovering does
   nothing to the canvas. Selecting an occurrence draws that occurrence's
   evidence and **does not move the clock window** — the window is the reader's
   own filter, and a filter the data keeps resetting is not a filter. Drilling
   the verdict band scopes the **roster** only: every occurrence stays plotted
   and the drilled verdict's are emphasised, so the denominator a reader counts
   never moves under them.
6. **Scope membership is server-owned.** Which events a finding filter selects,
   which findings and views a trial deems relevant, and every window-local
   denominator are server projections. The frontend composes nothing. This is
   the existing re-derivation rule extended to routing, and it is a safety rule
   before it is an architecture one: client-side re-derivation of membership is
   the bug family the safety invariants exist to block.

**Consequences.**

- The lens's own inspector pane, its occurrence dropdown and the dead
  `occurrenceModal` hash machinery retire **app-wide**; the lens becomes
  canvas-only. So does the "when it lands" histogram — the occurrences table is
  the timing record.
- Every cross-view route carries claim context in and a route back, under one
  URL-state contract covering view, finding, occurrence and trial. The current
  hash/query-string split retires, and Verify's dead end into evidence closes.
- The findings projection must carry the event ids its evidence view filters
  to, since the frontend may not assemble them.
- **The fixture generators owe one population.** Three committed synthetic
  families currently hold disjoint populations, and the day behind a drilled
  occurrence is a positional join across two of them. Under part 6 that state
  is ill-formed by construction; the lock renders the disagreements verbatim as
  evidence rather than papering over them, and the repair belongs in the
  generators.
- Verify's bespoke chart and data modules converge onto the shared views, with
  before/after comparison as **one** shared chart-chrome layer any evidence view
  gains under a trial filter — never per-view reimplementations.
- The watched-change dock's reserved floor is **re-settled as kept**, in a
  one-line form: one reserved height across every state, so the column's floor
  never moves. The arrival state's height deficit was paid out of layout air
  rather than by moving the dock or letting the column scroll, which is the test
  of whether that floor was real.

**Deferred, deliberately.**

- **`Decide now` is unreachable and must not render** until a cross-parameter
  headline exists on the server. Correction factor earns its asserting register
  from its own predicate, independently of the staging classifier it sits
  outside, so the first asserting row in server order can be one that recommends
  no number — [#26](https://github.com/harmonichq/harmonic/issues/26) records
  exactly that on a real 30-day run. Any client-side "top row = decide now" is
  the defect this defers around.
- **Explore is excluded by name.** Arbitrary cohort slicing and
  compare-anything stay in fog, quarantined in their own mode *if* they ever
  become a real job. Population rows cover free browse, which is what the fog
  was standing in for.
- **Which evidence views come next.** Routing is wired into the existing lows
  and meals lenses first (the proving case, zero new chart code); the carb-ratio
  meal-response and per-regime views are the first genuinely new ones, which
  unblocks [#22](https://github.com/harmonichq/harmonic/issues/22). After those,
  correction factor and then highs are the candidates — correction factor is the
  one parameter with no canvas of its own and the question is already open on
  #26. That ordering stays fog on map
  [#19](https://github.com/harmonichq/harmonic/issues/19) rather than being
  settled here. Basal and correction factor keep the glucose canvas as their
  evidence surface until then.

**Rejected, with reasons.**

- *Instruments stay on the canvas* (status quo extended): two steering wheels
  for one chart is the disagreement machine this ruling exists to remove.
- *Trial-verdict panel as Verify's inspector level 1*: keeps the two content
  models that made Verify a dead end.
- *Lens as sole evidence, table retired*: loses the tier column, the expandable
  narrative and the scannable index. The operator's own read of the shipped
  drill level confirmed the table is the keeper.
- *A separate explore mode now*: heavier than the job. Population rows cover it.
- *Client-derived trial relevance or finding membership*: re-derivation is the
  recurring bug family the safety invariants block.

**The visual contract** — defaults, persistent chrome, geometry, the verdict
vocabulary, the accessibility floors and the fixture obligations — is
`mockups/finding-evidence-routing.lock.md`, locked from
`mockups/finding-evidence-routing.exploration/`.

Decision: harmonichq/harmonic#31, 2026-08-19.

### Amendment — 2026-08-19: the visual contract is retracted; the decisions are not

**The decisions above stand. The lock manifest derived from them does not, and
is deleted.** The paragraph immediately above this one points at
`mockups/finding-evidence-routing.lock.md`; that pointer is **void** — the file
no longer exists. This is an amendment, not a rewrite: the record of what was
decided on #31, and of what the manifest claimed, is left standing so the next
round can read how this happened.

**What was retracted.** `mockups/finding-evidence-routing.lock.md`, merged the
same day in [PR #40](https://github.com/harmonichq/harmonic/pull/40) — a 60-term
contract over the finding-to-evidence surface. Deleted, along with the ★ LOCKED
headers on the mock. The mock returns to being an exploration draft, and the
surface ledger row returns to `exploring`.

**Why.** A **predecessor inventory** — the backward-looking pass that did not
exist when the lock was written — diffed the mock against the Diagnose
workstation running in the app. Of **55 shipped behaviours it found 12 kept and
43 missing**, and **not one of the 43 had been ruled on by anyone**. The ledger
is committed at `mockups/finding-evidence-routing.behavior.md`: 55 rows, each
driven against a real browser engine rather than read out of source, each
carrying its evidence.

The failure was not that the mock drew the wrong thing. It was that the manifest
**read as a complete description of the surface while being a partial one** — and
a lock manifest is exactly the artifact a build agent is entitled to read that
way. Left on `main`, those 43 absences were the spec, and a faithful build would
have taken working capability out of a reader's hands. Among them: the
occurrence case file (every classifier's read on one occurrence, matched **and
not matched** — the counter-evidence a reader needs to judge a finding against
their own data); staging a change into the Plan at all; the parameter case file
for a basal slot, an I:C block or the correction factor; keyboard navigation of
the inspector; the lens chart's keyboard cursor and its live aria-label; the
when-it-lands histogram; and the drag-to-draw selection window, which is
seventeen behaviours by itself.

The mechanism that let it through is worth recording, because it is repeatable.
A comment in the mock (`surface.js`) asserted that "the presets and the
drag-to-draw brace are exactly what the #31 ruling retires". That was **false**.
#31 retires the lens instrument row, the event-comparison inspector pane and its
occurrence dropdown, the dead `occurrenceModal`, and the I:C lane. Part 3 above
keeps `WINDOW` in as many words, and the #31 resolution amendment keeps the
brace, migrating the day-trace overlay into the clock projection "with the
window brace". **A retirement nobody sanctioned cited the operator's own ruling
as its warrant, and survived ten review rounds on that citation.** Every
instance of that claim is corrected in this change.

**What is kept, deliberately.**

- **Every decision recorded above**, parts 1–6. They came out of the operator's
  interview on #31 and nothing in the inventory disturbs them: one inspector
  spanning Diagnose and Verify, factor-only selection with no cohort filter, the
  `By clock` / `By event` projection, the verdict band scoping the roster while
  the canvas keeps every occurrence, and selection showing evidence without
  moving the reader's clock window.
- **The `button.entry` CSS scoping fix** in `frontend/diagnose-workstation.css`
  and its regression test `frontend/diagnose-evidence-row-box.test.js`. A rule
  written for the slot lane's staging button was also matching the evidence
  table's numeric cell, laying every evidence row out at 42px instead of the
  ~24px its own rule asks for. That is a defect in the shipped app, found
  through this work but independent of the lock.
- **The exploration mock itself**, narrative headers included, as the design
  record of how parts 1–6 were reached.

**What must precede the next lock.**

1. **Every one of the 43 missed rows gets a verdict from the operator** — kept,
   or retired with a sanction line naming who ruled, when, and their reason in
   their own words. Six are already named by a merged term or by the #31 ruling
   and want only their sanction transcribed; 37 have never been ruled on at all.
   No agent may write a sanction line; neither the ledger nor this record does.
2. **The ledger is frozen** once those verdicts land. A ledger carrying a
   `missed` row cannot be frozen, and a manifest cannot honestly describe a
   surface until it is.
3. **The predecessor inventory runs before the lock round, not after it.**
   Running it after the lock had merged is why the whole artifact had to be
   withdrawn rather than amended: a manifest absent 43 of 55 behaviours is not
   amendable into truth.

Decision: harmonichq/harmonic#41, 2026-08-19.

## ADR 42 — Queue tiers name no cross-parameter headline

**Decision.** Every priced row whose `register` is `assert` receives the same
server-owned ranking tier, `next_in_line`. `decide_now` remains unreachable until
the server publishes a cross-parameter headline predicate.

**Context.** Correction factor earns `register: "assert"` from its own predicate,
independently of the staging classifier it sits outside. As issue
[#26](https://github.com/harmonichq/harmonic/issues/26) records, the first
asserting row in server order can therefore recommend no number. Calling that row
`Decide now` would make the product speak more strongly than the finding
establishes.

**Consequence.** Queue-tier assignment does not inspect row position or nominate a
top asserting row. When a cross-parameter headline exists on the server, it must
arrive as its own predicate and be tested at this projection boundary.

Decision: harmonichq/harmonic#42, 2026-08-19.
