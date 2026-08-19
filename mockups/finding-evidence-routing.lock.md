# Lock manifest — finding → evidence routing (Diagnose + Verify)

Locked: 2026-08-19 by the operator (every ruling is theirs — four interview
rounds, seven wireframes, eleven mock rounds) with the coordinator writing the
record.
Mocks: `mockups/finding-evidence-routing.exploration/` — `index.html` (★ LOCKED
header, the narrative), `surface.js`, `chart.js`, `pooled.js`, `scene.css`,
plus the build-time extractions the surface is assembled from
(`app-base.extracted.css`, `chrome.extracted.html`,
`evidence-table.extracted.js`, `data.json`) and their producers `build.mjs`,
`harness.mjs`, `contrast-audit.mjs`. There is no shared `_theme.css` /
`_shell.js` scaffold on this surface **by design**: the mock links the running
app's own stylesheets in the app's own order and lifts the cockpit topbar and
footer out of the running app's DOM, which is the stronger form of the same
rule.
Directory name: the mock keeps its `.exploration` path. It is referenced by
`build.mjs`, `harness.mjs`, `contrast-audit.mjs` and the public allowlist;
renaming it is a rename of load-bearing paths, not a status change, and the ★
header is what carries the status.
Supersedes: — (first lock in this repository).
Carries forward, restated below and never referenced: four terms from
`ciq-autotune`'s `mockups/diagnose-workstation.lock.md` — its term 4
(breadcrumb-only navigation) → term 14 here; its term 18 (evidence is a table)
→ terms 30–31; its term 29 (the Day contract) → term 39; its terms 46–49 (the
watched-change dock as pane furniture, one reserved height, single reporter) →
terms 10–12. Term 48's reserved-floor clause is **re-settled as KEPT** in a new
form; see the re-settle record at the foot of this file.

Issue: [harmonichq/harmonic#31](https://github.com/harmonichq/harmonic/issues/31)
— the [resolution](https://github.com/harmonichq/harmonic/issues/31#issuecomment-5335368104)
and its [amendment](https://github.com/harmonichq/harmonic/issues/31#issuecomment-5337669525),
where the amendment wins wherever the two touch.
Decision record: ADR 31, `openspec/changes/finding-evidence-routing/design.md`.

**Explore is excluded from this lock by name.** It is the arbitrary-slicing
ambition, it does not exist, and it gets its own round when it does. No term
below governs it. The inspector this lock settles spans **Diagnose and Verify**,
and no further surface.

## Precedence

The mock wins for everything it states explicitly; the app's shipped design
system wins for anything it does not. Two carve-outs, because this mock is
assembled from the running app rather than drawn beside it:

1. **Where the mock renders a shipped module, the shipped module wins** — the
   findings queue painter, the evidence-table painter, the pooled canvas
   renderer and the `.has-tooltip` primitive are lifted at build time, not
   transcribed, and a difference between them and this mock is a bug in the
   lift. The build fails closed on a rename.
2. **Where the mock deliberately departs from the shipped app**, the departure
   is enumerated in `harness.mjs`'s EXPECTED tables with the finding it answers,
   and the mock wins. An unenumerated departure is drift and fails the harness.

## Terms

`gate` = mechanically assertable (geometry, overflow, colour, counts, text).
`eye` = needs a rendered judgement.

### Shell, defaults and persistent chrome

| # | Term | Kind | Evidence expected |
|---|------|------|-------------------|
| 1 | **Chrome that persists across every level, projection and state** — measured identical in 12 states × 2 themes × 2 sizes: the cockpit topbar (`1 Diagnose` · `2 Plan 0` · `3 Verify` · `Day` · `＋ Log carbs`); the cockpit footer (`Carb questions 0` · `Guide` · `Settings` · `Glossary` · `Theme` with its Light/Dark pair); the instrument row itself; the two-pane `main.panes` grid with the inspector pane always present; the inspector's own `<header>` reading `Inspector`; the crumb row, always present and always rooted at `Findings`; the 48-cell basal verdict strip under the pooled canvas; and the dock. Nothing in that list may be dropped by any view, including a view reached by routing in from elsewhere | gate | browser-gate assertion, every state × theme × size |
| 2 | **The switchers are themselves persistent chrome.** The instrument row is present in every state and is never dropped — it is the surface's toolbar in Diagnose and in Verify alike. `Window` is in it in every state. `Align` is the only group that comes and goes, and only by term 21's rule. There is no state in which the row is absent | gate | assertion |
| 3 | **Default on arrival** (queue root, no parameters, either theme, either size): `Window` = `24 h` pressed; `Align` **absent**; the factor dropdown **absent**; the verdict band **absent**; the canvas mounted is the **pooled** chart, titled `Glucose by time of day`; the crumb reads `Findings` with no trail and no count accessory | gate | assertion on a fresh load |
| 4 | **Default once drilled:** `Align` appears on every drilled level and rests on **`By clock`**. Exactly one canvas pane is mounted at a time (`data-canvas` = `pooled` under `By clock` and at the queue root, `lens` under `By event`); the other is `display: none`, never unmounted | gate | assertion |
| 5 | **The factor dropdown's default** is the frame's first segment (`Over-treated low`, count 7, on this fixture). It is present on a **population** level only; on a finding case file it stays absent, because the case file is already one factor | gate | assertion |
| 6 | **The verdict band's default** is the frame's first group, `Meets criteria`. The band renders only where the frame has **≥2 groups**; a one-group frame draws no band, because there is no split to state. "The band at `Meets criteria`" is the REST state of a drilled population, not a state a reader navigates to | gate | assertion at every frame |
| 7 | **Occurrence selection defaults to none**, and the occurrence table defaults **collapsed at 5 rows** with a two-way expander (`N more` ⇄ `Show first 5`) | gate | assertion |
| 8 | **No page scroll** at 1280×800 or 1440×900, in either theme, in any state — `documentElement` and `body` both 0px on x and y | gate | browser-gate assertion |
| 9 | **The inspector column does not scroll internally in any state**, at either locked size, in either theme. A state that does not fit is fixed by giving back air, never by letting the column scroll and never by moving the dock. **Two states violate this at lock time and are recorded as an open deficit below — do not read this term as satisfied** | gate | `contrast-audit.mjs` overflow reads, extended to the expanded states |
| 10 | **The dock is ONE reserved height across every state** — measured 28px in all 12 states × 2 themes × 2 sizes — so the column's floor never moves. It is pane furniture: mounted once, present at every level, never level-1 content, never scrolled away, never conditional on the queue's length. It is separated from the level above by a hairline and by space, not by a fill | gate | computed-style + rect assertion at every state |
| 11 | **The dock is the single reporter of the watched-change object.** The domain exposes at most one active watched-change object, never two lists, and no second status for it appears anywhere on this surface. On this fixture it holds its idle line in every reachable state | gate | assertion |
| 12 | The dock's line is one rank of type, never ellipsized, and never grows the reserve to fit | gate | assertion |

### Selection and navigation

| # | Term | Kind | Evidence expected |
|---|------|------|-------------------|
| 13 | **Selection is one-dimensional: the factor, and nothing else.** There is no cohort filter anywhere on this surface, in any control, at any level. The evidence canvas always draws all three verdicts | gate | assertion — no control on the page selects a cohort |
| 14 | **The crumb is the navigation.** Stacked levels, one visible at a time, ancestors clickable, the leaf inert and carrying `aria-current`; no back button and no back chevron. The subject's name prints exactly once, in the crumb leaf. Carried forward from the prior lock's breadcrumb-only term | gate | assertion + render |
| 15 | **The factor control is a collapsing dropdown at the top of the inspector column**, above the scrolling level track and never inside it. At REST it is one line at the column's own register: current factor · its count in tabular numerals · a chevron, reading as the column's working title | gate | assertion + render |
| 16 | **Expanded, the dropdown overlays and never pushes.** The column beneath it does not move, the dock does not move, and collapsing restores an identical column. It auto-collapses on **four** events: choosing a factor, a click outside the host, `Esc`, and focus leaving the host | gate | scripted interaction test, all four exits |
| 17 | **The list scales to 8+ entries without redesign.** The rest state costs one line whatever the list holds; the expanded list takes its own scroll before it takes the column's | gate | render at 8 entries (fixture obligation) |
| 18 | **One inspector, spanning Diagnose and Verify.** The same drill grammar serves the findings-driven and the trial-driven filter modes; Verify does not get a second content model. Day stays off the spine as the deep-context surface that receives claim context and offers the route back | gate | assertion on both modes (build-time; this mock renders the Diagnose mode) |
| 19 | **Universal route-back and one URL-state contract.** Every cross-view route carries claim context in and a route back — Verify→evidence included. View, finding, occurrence and trial survive reload and paste under one contract; the hash/query-string split retires | gate | scripted reload + paste test (build-time) |
| 20 | **Scope membership is server-owned.** Which events a finding filter selects, which findings and views a trial deems relevant, and every window-local denominator are server projections; the frontend composes nothing and re-derives no membership | gate | build-time assertion + fixture-generator CI gate |

### The canvas

| # | Term | Kind | Evidence expected |
|---|------|------|-------------------|
| 21 | **The projection toggle is `By clock` / `By event`, and it lives in the instrument row's `ALIGN` group** — same caption rank, same segmented control, same register as `Window`. It is visible **only when the canvas is showing a factor's events** (population browse, finding drill, event drill) and is **absent at the queue root**, where nothing is selected to re-project. Absent, not disabled | gate | assertion at every level |
| 22 | **`By clock` is the rest projection** — the pooled day envelope on a 00:00–24:00 axis with the factor's events as dots, drawn through the **shipped** `renderCanvas` path. Drilling an occurrence overlays that day's real CGM trace on the envelope, with the window brace | gate | assertion + chart-option diff against the shipped renderer |
| 23 | **`By event` is the lens draw** — nadir-aligned −5 h…+2 h, cohort comparison. Drilling the same occurrence highlights it among its cohort neighbours | gate | assertion + render |
| 24 | Switching projection **preserves the selection**: same factor, same drilled occurrence, drawn on the other axis. It is a switch over already-selected data, never a data selector | gate | scripted flow test |
| 25 | **Hover does nothing to the canvas.** No brace move, no day trace, no verdict tooltip, no row title attribute — selection is the only trigger. Measured: hovering a row leaves 0 rows selected, and 0 rows carry a native `title` | gate | harness `results.hover` (0 selected rows, 0 title attributes) |
| 26 | **Selecting an occurrence never moves the clock window.** The window is the reader's control — it is what `Window` sets and it decides which events are in play. A selection shows that event's evidence; it does not re-anchor the viewport, change the x-extent, or move the brace. After a selection the window is byte-identical to what it was before | gate | harness `results.windowUnchanged` (window + x-extent compared across a row click); written into `data.json` as `terms.selection_never_moves_the_window` |
| 27 | **All occurrences stay plotted at every band position**, and the drilled verdict's occurrences are **emphasised** against the rest — never drawn instead of them. The canvas keeps one stable denominator, so "how many lows did I have" reads the same wherever the reader stands. Measured: 17 dots drawn with the band at `Meets criteria`, 17 dots drawn with it drilled to `Borderline` | gate | harness `verdictBand.dotsDrawn` vs `verdictBandDrilled.dotsDrawn`; written into `data.json` as `terms.band_scopes_the_roster_only` |
| 28 | **One y-domain and one tick ladder across both projections: 40–240 at an interval of 40** (ladder 40 · 80 · 120 · 160 · 200 · 240; the max sits ON the interval). The interval is load-bearing, not cosmetic: **neither 70 nor 180 lands on it**, which is what lets the two clinical thresholds exist as the target band's own edges, in the band's own tone, rather than as numerals set in the same type as the value scale. The toggle must not re-scale or re-label the axis | gate | chart-option assertion on both projections |
| 29 | The target range is drawn **one way on both projections** — the shipped workstation treatment (fill, knock-out caption, dashed edges), never restyled per projection | gate | chart-option diff |

### The inspector's evidence

| # | Term | Kind | Evidence expected |
|---|------|------|-------------------|
| 30 | **The occurrence table is the SHIPPED production Diagnose table.** `renderEvidence` is extracted whole from `frontend/diagnose-workstation.js` at build time and is never forked or transcribed. It brings its own group rules, its own five-row cap, its own two-way expander, its own tier word and its own date/Δ formats. The extraction **fails closed**: a rename, or the painter no longer emitting `.ev-row` / `.ev-group` / `.more`, stops the build rather than freezing a stale copy | gate | build-time extraction assertion (`build.mjs --` fails closed) |
| 31 | **Evidence is a table:** one line per occurrence on a shared numeric spine (`date · time · entry→worst · Δ`), tabular numerals, group header as a ledger rule, 5 rows then expand. The rows **are** the selection mechanism — row ↔ canvas mark are two reads of one selection. Carried forward from the prior lock's evidence-is-a-table term, with the dropdown that used to select an occurrence retired | gate | assertion + render |
| 32 | **The verdict takes wireframe H3's form:** a proportional band stating the three-way split (one bar divided by count, plus a key row per group), with the **roster below it never longer than one verdict**, resting at the first group. The three flat section headers over one long list are retired | gate | assertion + render |
| 33 | **One noun per concept, across the dropdown, the band, the group rule and the row cells: `Meets criteria` / `Borderline` / `Does not meet`.** Never `classifier`, never `unclassified`, and never **`factor` as a user-facing noun** — CONTEXT.md lists it under _Avoid_ for **Lever**. The nouns reach the reader through the chart's aria description too, so the chart series names carry them as well | gate | text assertion across every surface that prints the split, incl. chart `aria` |
| 34 | **Residue is one dim, unfilled line ABOVE the expander**, its counts scoped to the frame being drawn, and the arithmetic closes on screen: **drawn + residue = the cap's denominator**. The other-verdict figure is computed as the remainder rather than tallied, so closing is structural rather than coincidental | gate | assertion — parse the line and the cap, assert the sum |
| 35 | **The per-row verdict cell is suppressed when a group is homogeneous**, and renders per row only where a group genuinely mixes. Data-driven, decided from the group's own occurrences through the shipped `tierOf` — not a change to the painter, and not a value written into the fixture (the painter reads one field for both the group rule's word and the row cell, so blanking the data would blank the header too) | gate | assertion on a mixed group and a uniform one (fixture obligation) |
| 36 | The `Occurrences` cap counts **what the table draws** — under H3 that is the drilled verdict — and states its window once: `entry → worst · Δ · N of M in <window>` | gate | assertion at every band position |
| 37 | **The route to a finding's case file is ONE right-aligned action, `Open case file ›`**, and it is **absent** — never apologised for, never disabled — where the frame has no case file | gate | assertion at a frame with and without one |
| 38 | **Occurrence rows carry no per-row chevron.** `›` means "there is somewhere to go", and an occurrence row selects rather than changes level; the glyph is reserved for the things that do change level | gate | assertion (0 `.chev` inside `.ev-row`) |
| 39 | **The selected occurrence carries one right-aligned `Open <day> in Day ›` route**, in the same treatment as `Open case file ›`, absent until a row is selected. Grounded in CONTEXT.md's "Jump to" contract (ADR 0037): an Occurrence anywhere it renders deep-links to Day at its day with that moment ringed. **This is the one term that ADDS a route the exploration had not drawn** — flagged in the ★ header so a reviewer can pull it back out | gate | assertion; flagged for review |
| 40 | The judgment block (cohort counts + the near-rule hedge) is present on a **finding** case file and **absent** at population level, where the band is the tally and a sentence restating its three numbers would be the same data twice | gate | assertion at both levels |
| 41 | **The near-rule hedge hangs off the canvas legend's Near-rule key**, only in frames where near-rule has events — not in the inspector column | gate | assertion + render |
| 42 | A frame with no comparison to draw renders the **honest empty state** — the chart's own greyed furniture with the range still on it, `No comparison drawn`, and one short line — never a comparison-shaped nothing | gate | render at the `Unclaimed` frame |

### The queue

| # | Term | Kind | Evidence expected |
|---|------|------|-------------------|
| 43 | **Ranking-tier eyebrows, one per RUN of rows**, from DESIGN.md rule 4's vocabulary: `Next in line` / `Worth a look` / `noted`. A tier continuing across two rows does not repeat itself. The 0–100 urgency number is never shown | gate | assertion + render |
| 44 | **`Decide now` is deliberately unreachable and must never render** until a cross-parameter headline exists **on the server**. The reason is recorded, not implied: correction factor earns `register: "assert"` from its own predicate, independently of the staging classifier it sits outside, so the first asserting row in server order can be a row that recommends no number — issue #26 records exactly that on a real 30-day run. A client-side "top row = decide now" is the defect this term forbids | gate | assertion — the string renders in no state |
| 45 | **The tail sits under the `WATCHING` section cap**, per CONTEXT.md's own section: a ledger rule at the section register with the shipped tail sentence as its right-hand meta. The sentence is not rewritten. The seam is a section, not a bare line of prose between two rows | gate | assertion + render |
| 46 | **The free-browse section**: cap `All events` with the capture's window as its right-hand meta, stated **once**; rows are bare nouns + tabular count + chevron. A row's label is its destination crumb leaf **byte for byte**, so routing never changes vocabulary mid-hop | gate | assertion — row label vs destination crumb leaf |
| 47 | A queue row's flavor tag carries the word alone; the dingbat glyph is dropped from the tag wherever it appears, queue row and subject strip alike | gate | assertion |

### Accessibility and craft

| # | Term | Kind | Evidence expected |
|---|------|------|-------------------|
| 48 | **Contrast floors, in BOTH themes: 4.5:1 for text, 3:1 for non-text marks and control boundaries.** Every ratio is composited the way a reader sees it — a translucent ink resolved against the actual painted stack beneath it, not against the token it was mixed from. Guarded by `contrast-audit.mjs`, which **fails closed**: 70 contrast measurements (35 pairs × 2 themes), 40 target-size reads, 20 overflow reads, and a pair whose element never appears is a failure rather than a skip | gate | `contrast-audit.mjs` exit 0 |
| 49 | **Target minimum 24×24 (WCAG 2.2 AA · 2.5.8), with ONE stated exception**: the 48 basal-slot cells, which cannot reach 24px wide in a 430px column and stay as they are drawn. Their keyboard equivalent is the roving-tabindex group — **one** tab stop for the strip, Arrow/Home/End moving within it. Measured: 48 cells, exactly 1 tab stop, in every state × theme × size. Where a control's painted size is smaller than its target, the hit box grows behind it and the paint does not | gate | `contrast-audit.mjs` target reads + tab-order walk |
| 50 | **Focus ring: `solid 2px` in the accent, on every control on this surface.** No control takes the browser's UA ring | gate | computed-style assertion per focusable stop |
| 51 | **`.has-tooltip` is the system's one define-a-term-inline primitive and is REUSED, never re-invented.** It is declared at `frontend/index.html:225–246` (an inline `<style>` block, which is why two rounds' stylesheet-only greps concluded it did not exist and wrote that false claim down twice). It arrives on this surface through the build's app-base extraction, which fails closed if it ever stops arriving | gate | build-time needle assertion + render |
| 52 | **Reduced motion is honoured**: every animated property on this surface resolves to `none` / `0s` under `prefers-reduced-motion: reduce`. Nothing bounces, nothing loops, no unbounded blur or filter | gate | computed-style assertion under the media query |
| 53 | Zero console errors, warnings, page errors or failed requests, in every state × theme × size | gate | harness console capture |
| 54 | Type recedes by weight and ink, never by shrinking below its rank; the residue line, the dock line and the crumb count all sit in **one** dim register rather than each finding their own | eye | paired render, both themes |
| 55 | The unselected occurrence dots read as recessive against the accent that marks the ones being read — in **both** themes. The relationship must not invert between grounds | eye | paired render, both themes |

### Known, deliberate, and recorded as such

| # | Term | Kind | Evidence expected |
|---|------|------|-------------------|
| 56 | **The chip-versus-table number disagreements render verbatim, on purpose.** The finding case file's crumb count reads `1 episode` (the projection's own figure) beside a table drawing `7 of 20` (the lens capture's). The three committed synthetic fixture families hold **disjoint populations** — findings projection (1 of 4 lows, 07-18→08-17), event-comparison capture (18–20 events, 07-13→08-11), workstation payload (3 captured CGM days, 48 basal slots). Nothing on the surface reconciles them and nothing tries. Recorded in `data.json` as `provenance.disjoint` and `provenance.queue_canvas`. **The fix is owed in the fixture GENERATORS, under ruling 5 (server-owned scope membership) — never in the surface** | gate | the provenance keys exist and say so; the generators' obligation is tracked |
| 57 | **`provenance.day_traces`: the day behind a drilled occurrence is a positional join across two unrelated fixture captures** — three days of one synthetic population against twenty lows of another, assigned by the view's occurrence order cycled over the sorted day keys. Deterministic, and not something any fixture carries. Under ruling 5 the server would carry it; the fixture generators owe it | gate | the provenance key exists and says so |
| 58 | **Two legend homes are KEPT.** The lens keeps its legend below the plot; the clock projection's keys sit in the canvas header rail beside the title. Kept deliberately so four shipped selectors stay inside the fidelity comparison — collapsing them to one home would drop those selectors out of the diff, which is the coverage this mock exists to hold | eye | paired render + the harness's shared-selector count |
| 59 | **The shipped painter's group rule hard-codes `, not confirmed` and `episode(s)`**, so a group renders as `Borderline, not confirmed · 4 episodes`. Removing them is a fork of the production painter, which term 30 forbids. It stands as rendered | gate | verbatim string assertion |
| 60 | **`Window` is a real control that THIS FIXTURE CANNOT EXERCISE.** The fixture is one 24 h window, so the group is drawn at its standing coordinate and is **not wired**. It is **not** a read-out and **must not** be marked disabled — a build that wires it is implementing the term, not violating it | gate | assertion: present, pressed at `24 h`, no `disabled` and no `aria-disabled` |

## Open deficits at lock time

Recorded rather than papered over. Neither is licensed by a term; both are
work the build inherits with its eyes open.

1. **Term 9 is violated in two states.** At **1280×800 only**, in **both**
   themes, expanding the occurrence table overflows `#level`: the finding case
   file by **7px** (7 rows) and the population case file by **12px** (7 rows).
   Every other state, and every state at 1440×900, measures 0. The two states
   are outside `contrast-audit.mjs`'s five-state list, which is why its overflow
   leg passes — **that list is the second half of the fix**: the guard must
   visit the expanded states before term 9 can be called satisfied. Round 11
   closed the arrival state's 20px deficit and grew several control hit boxes to
   clear the 24×24 floor in the same change; the expanded states are where that
   height went. Fix it the way round 11 fixed the queue root — give back air —
   never by moving the dock (term 10) and never by letting the column scroll.
2. **Production defects this surface surfaced but does not own.** They are
   named here so the build does not adopt them as intent: `evidence_tier`
   carrying an outcome (CONTEXT.md is explicit that tier and outcome must never
   be one badge — the collision #277 fixed); three cockpit-chrome contrast
   failures in the app's own topbar and footer (`.cockpit-log-carbs .plus`
   2.22:1 light, `.cockpit-flow-separator` 3.01:1 dark, `.cockpit-step-number`
   3.33:1 dark), deliberately excluded from `contrast-audit.mjs` so this mock's
   gate cannot fail on the app's authorship; `a.cockpit-day` taking the UA focus
   ring; and a 2px horizontal clip on `nav.cockpit-utilities`. Each is a
   production issue, owed separately.

## Fixture obligations

What a fixture must exercise for these terms to be provable. **A fixture that
cannot show a term cannot prove it** — so the three this fixture cannot show are
listed first, by name, rather than left to be discovered by a build agent whose
gate goes green having asserted nothing.

**This fixture CANNOT prove three terms:**

- **Term 60 / `Window`** — the committed set holds **one 24 h window**. Nothing
  on this surface re-scopes it, so the group's standing coordinate is the only
  coordinate it can be observed at, and the both-projections scoping rule (axis
  narrows under `By clock`; cohort shrinks and the axis holds under `By event`)
  is **unexercised**. A fixture with at least two windows over one population is
  owed before term 60 can be asserted rather than merely stated.
- **Term 17 / the 8+ factor list** — this fixture yields **three** frames
  (`Over-treated low` 7, `Correction on active insulin` 1, `Unclaimed` 10). The
  dropdown's whole reason for replacing a segmented control is a list that
  scales; three entries cannot demonstrate it, and the expanded list's own
  scroll behaviour at 8+ has never been rendered. A fixture with 8 or more
  claiming factors is owed.
- **Term 35 / the mixed-group verdict cell** — **every group in every frame this
  fixture can reach is homogeneous**, so the suppression is observable but the
  per-row cell it suppresses **never renders**. The branch that prints it is
  dormant. A fixture with at least one genuinely mixed group is owed, and until
  it exists the term's second half is unproven.

**What the committed set does provide**, and must keep providing:

- `mockups/diagnose-event-comparison.synthetic/capture.json` — 20 lows over
  Jul 13–Aug 11, split 7 / 4 / 6 across the three verdicts with 3 in residue,
  plus 10 unclaimed. This is what makes the band a genuine three-way split
  (term 32), the residue arithmetic close (term 34), and the emphasis layer have
  more than one state to emphasise (term 27). A capture whose lows fall into one
  verdict proves none of them.
- `mockups/diagnose-workstation.synthetic/payload.json` — the pooled envelope
  (96 bins, 3 captured CGM days), the target range, and **48** basal slots. The
  48 is load-bearing twice: it is term 1's persistent strip and term 49's stated
  target-size exception. A payload with a different slot count re-opens both.
- `mockups/diagnose-workstation.synthetic/explore-day.capture.json` — the real
  captured CGM days the clock projection lays over the envelope on a drill
  (term 22). Its join to the occurrences is term 57's positional one.
- `frontend/__fixtures__/findings-projection.json` — the ranked queue the
  shipped painter paints, carrying enough rows across enough registers to
  produce **more than one** ranking tier (term 43) and a tail under the
  `Watching` cap (term 45). A projection whose rows all share one tier cannot
  show that an eyebrow marks a run.
- Glucose spread wide enough that the p10–90 envelope is visible and the target
  band's edges are distinguishable from the tick ladder (term 28). This
  fixture's data spans 42–226 against a 40–240 domain.

**Standing rule.** Every committed fixture here is synthetic and carries its
provenance stamp; a fixture without a committed generator is how real data gets
committed. Under ruling 5 the generators owe **one population** across the three
families (terms 56–57).

## Verbatim strings

Copied exactly from the built mock, so text drift is a diff rather than a
judgement call.

**The verdict split (term 33), everywhere it prints:**
`Meets criteria` · `Borderline` · `Does not meet` · `Not claimed by any finding`

**Group rule, as the shipped painter renders it (term 59):**
`Borderline, not confirmed · 4 episodes`

**Ranking tiers (term 43):** `Next in line` · `Worth a look` · `noted`
— and `Decide now`, which must **never** render (term 44).

**Queue and browse:** `Findings` · `Watching` ·
`Not recurring often enough to rank yet.` · `All events` · `Jul 13–Aug 11` ·
`Lows` · `Meals` · `Recurs in ` (the habit row's lead clause)

**Instruments:** `Window` · `Overnight` · `Morning` · `Afternoon` · `Evening` ·
`24 h` · `Align` · `By clock` · `By event`

**Canvas:** `Glucose by time of day` · `Low response comparison` ·
`No comparison drawn` · `excursion nadir · −5 h to +2 h` ·
`10–90th` · `25–75th` · `Median` · `Meal boluses` · `Occurrences` ·
`Target range`

**Inspector:** `Inspector` · `Verdict` · `Occurrences` ·
`entry → worst · Δ` · `17 of 20 lows in Jul 13–Aug 11` (the band's meta form) ·
`Open case file ›` · `Open Aug 1 in Day ›` (the Day route's form —
`Open <day> in Day ›`) · `2 more` / `1 more` / `5 more` / `Show first 5`
(the expander's two-way forms)

**Residue clauses (term 34):** `N in other verdicts` ·
`N claimed by another factor` · `N not comparable` · `N claimed by a finding`

**Dock:**
`Nothing staged · stage a change from a finding to start a trial`

**Footer voice (DESIGN.md rule 8, applied to the app's own lifted chrome):**
`Correction factor` and `Carb ratio` — never `ISF` or `I:C` in user copy.

## Re-settle record — the inspector's floor, 2026-08-19 (#31)

**Carried forward and re-settled: the prior repository's lock term 48** — "ONE
reserved height across all four states, so the column's floor never moves.
Separated from the queue by SPACE and by the theme's own ground — never a
hairline". Restated here in full because a manifest that references another
repository's term does not stand alone.

**Settled: KEPT, in a new form.** The reserved height stands and is the point;
what changes is its value and its separator. The shipped dock is three ranks of
type in a 98px reserve, and at idle all three said the same thing — that nothing
is happening — so 98px of pane floor carried one dim sentence while the table
above it wanted the height. The dock is now **one line, hairline-topped and
unfilled, 28px in every state**, and the level above takes the difference back.
The hairline is the deviation from the prior term's "never a hairline" clause,
taken deliberately: with the fill gone, space alone did not separate the line
from the ledger.

**What did NOT change is the load-bearing half.** One reserved height across
every state; the floor never moves; the dock is pane furniture rather than
level-1 content; it is the single reporter of the watched-change object. Those
are terms 10–12 above and they are the prior term's substance.

**Proved on the arrival state.** Round 11's queue-root deficit at 1280×800 —
20px of the queue below the fold, hiding the row into one of only two standing
populations — was paid **out of the air above the browse section**, not by
moving the dock and not by letting the column scroll. That was the test of
whether the floor was really fixed, and it held.
