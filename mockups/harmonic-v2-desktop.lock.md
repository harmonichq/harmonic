# Lock manifest — harmonic-v2-desktop

Locked: 2026-09-08 · direction selected by Connor Griffin on 2026-09-07 and
recorded in *ADR 348 — Adopt the reviewed desktop direction*; manifest authored
by Claude Opus 5 (high) as the #348 planning author.
Mocks: `mockups/harmonic-v2-glucose.html?source=journey` · `mockups/harmonic-v2-glucose.css` ·
`mockups/harmonic-v2-glucose.js` · `mockups/harmonic-v2-glucose-journey.js` ·
`mockups/harmonic-v2-glucose-setting.js` · `mockups/harmonic-v2-glucose-focus.js` ·
`mockups/harmonic-v2-glucose-day.js` · `mockups/harmonic-v2-glucose-utilities.js` ·
`mockups/harmonic-v2-glucose-basal.js` · scaffold `mockups/_theme.css` and
`mockups/_shell.js` · `mockups/harmonic-v2.exploration/chart-key.css` ·
`mockups/harmonic-v2.exploration/glossary.js` · generated inputs
`mockups/harmonic-v2.exploration/{journey,setting,focus,workstation,utilities,evidence}.json`
from `mockups/harmonic-v2.exploration/generate.py`.
Supersedes: no prior lock. This surface takes over the jobs of two **shipped v1
surfaces, both of which stay served and are not retired by this lock**:
the **Cockpit shell** (`frontend/index.html` + `frontend/shell.css` +
`frontend/theme.css`; behavior registered in `mockups/cockpit-shell.behavior.md`,
replayed by `frontend/cockpit-shell.browser.test.mjs`) and **Finding → evidence
routing (Diagnose + Verify)** (`frontend/diagnose-workstation.js`; behavior
registered in `mockups/finding-evidence-routing.behavior.md`, replayed by
`frontend/diagnose-workstation-behavior.replay.mjs`). Their v1 ledger rows in
`mockups/INDEX.md` stay `shipped`; the complete carried-job inventory is
`openspec/changes/harmonic-v2/predecessor.md`.

## RE-SETTLED TERM — 2026-09-10 — ADR 397 — HV2-09, HV2-10, HV2-11; HV2-14 evidence label and dependent copy

Sanction: Connor Griffin, 2026-09-08, the September 8 direction change recorded in openspec/changes/harmonic-v2/design.md: "v2 ships three destinations: Diagnose, Changes and Day. Overview and Explore collapse into Diagnose carrying the shipped v1 rail as-is".

Old (superseded): "Overview is the default destination. Overview, Explore, Changes, Day, scope, Log carbs, advisory status and utilities remain persistent chrome without moving across destination changes."
New: "Diagnose is the default destination. Diagnose, Changes, Day, scope, Log carbs, advisory status and utilities remain persistent chrome without moving across destination changes."

Old (superseded): "Overview owns the backend-selected active change or leading available priority and its next action. It does not duplicate Explore's full findings roster."
New: "Changes owns the backend-selected active change or leading available priority and its next action, alongside its HV2-12 responsibilities. It does not duplicate Diagnose's full findings roster."

Old (superseded): "Explore owns Findings, clock-window exploration, detailed evidence, the selected case file, Spotlight and All Charts. Its evidence stage remains geometrically stable relative to Overview."
New: "Diagnose owns Findings, clock-window exploration, detailed evidence, the selected case file, Spotlight and All Charts. It carries the shipped v1 Findings rail as-is, including #395's Patterns. Its evidence stage remains geometrically stable as the Findings, clock window and selected case change, under HV2-03–HV2-08."

Old (superseded): "`Overview` · `Explore` · `Changes` · `Day` (nav label `Main`)"
New: "`Diagnose` · `Changes` · `Day` (nav label `Main`)"

Old (superseded): "`Set aside` · `Restore` · `Return to Overview`"
New: "`Set aside` · `Restore` · `Return to Diagnose`"

Old (superseded): "The nights remain available in Explore."
New: "The nights remain available in Diagnose."

Old (superseded): "The lows remain available in Explore."
New: "The lows remain available in Diagnose."

Old (superseded): "The meals remain available in Explore."
New: "The meals remain available in Diagnose."

Old (superseded): "Keep through the adopted Overview/Explore/Changes/Day routes"
New: "Keep through the adopted Diagnose/Changes/Day routes"

Old (superseded): "Keep the retired old mode/layout/duplicate-tile mechanics retired. This does not retire ADR 348's Explore destination."
New: "Keep the retired old mode/layout/duplicate-tile mechanics retired. ADR 397 changes destination naming without reinstating those retired canvas mechanics."

Old (superseded): "navigate all four v2 destinations"
New: "navigate all three v2 destinations: Diagnose, Changes and Day"

Old (superseded): "Overview/guidance"
New: "Changes/guidance"

Old (superseded): "Explore/window"
New: "Diagnose/window"

Old (superseded): "full Day is not clipped to the Explore glucose window"
New: "full Day is not clipped to the Diagnose glucose window"

Old (superseded): "Repeatedly enter and leave Explore, Day, full-screen charts and utilities while requests are pending."
New: "Repeatedly enter and leave Diagnose, Day, full-screen charts and utilities while requests are pending."

Old (superseded): "Explore workflow and paired render"
New: "Diagnose workflow and paired render"

Old (superseded): "Explore/Changes/utility → Day → exact-return replays"
New: "Diagnose/Changes/utility → Day → exact-return replays"

Old (superseded): "extra terms: Overview is the default destination"
New: "extra terms: Diagnose is the default destination"

Old (superseded): "`Overview` / `Explore` / `Changes` / `Day`"
New: "`Diagnose` / `Changes` / `Day`"

Old (superseded): "**Per-destination chrome, so no term reads as \"mounts an existing surface unchanged\":** all four destinations keep the same topbar (identity, the four destination buttons"
New: "**Per-destination chrome:** all three destinations keep the same topbar (identity, the three destination buttons"

Old (superseded): "(HV2-33). ### Backend binding notes"
New: "(HV2-33). Diagnose carries the shipped Findings rail as-is within this chrome; this paragraph authorizes no rail redesign. ### Backend binding notes"

Old (superseded): "One dense populated state per destination whose"
New: "One dense populated state per destination: Diagnose, Changes and Day, whose"

Old (superseded): "**Guidance (HV2-10, HV2-15, HV2-16, HV2-31).**"
New: "**Changes guidance (HV2-10, HV2-15, HV2-16, HV2-31).**"

Old (superseded): "provable as intended rather than as a missing pane."
New: "provable as intended rather than as a missing pane. Empty Changes must not suppress a backend-selected available priority and next action owned by HV2-10."

Old (superseded): "the adopted Explore destination"
New: "Diagnose's Findings/evidence responsibilities"

Old (superseded): "default Overview and all destination transitions"
New: "default Diagnose and all three destination transitions"

Old (superseded): "The behavior ledger and its replay are **frozen before any production UI edit**, following `behavior-sweep`. The build then adds these finite story groups:"
New: "The existing frozen v2 behavior ledger and replay live on stopped #389 and are absent here. #389 must amend their affected entries before dependent production implementation resumes, retaining these finite story groups:"

Old (superseded): "remain frozen v1 ledgers.** Nothing in this lock edits them. The v2 behavior ledger is a new, separate `★ FROZEN` artifact owed before production implementation."
New: "remain frozen v1 ledgers.** Nothing in this lock edits them. The v2 behavior and fidelity artifacts live on stopped #389 and are absent here. #389 must amend its affected entries before dependent implementation resumes; this change creates no substitutes and claims no branch-local ledger update."

Old (superseded): "than redesigning it. This is prototype evidence."
New: "than redesigning it. Navigation and affected copy in these historical captures are superseded by ADR 397. Unchanged material/geometry evidence remains usable; these captures do not prove the amended build. This is prototype evidence."

Old (superseded): "Three authorities, in this order, over three different questions."
New: "ADR 397 and the dated amendment above supersede the selected prototype and repair records only for the enumerated destination and copy amendments. Historical executable bytes and captures remain unchanged; #389 owes their executable realization and updated fidelity evidence. Three authorities otherwise apply, in this order, over three different questions."

Old (superseded): "Copied from the selected mock, so text drift is a diff rather than a judgment call."
New: "Copied from the selected mock, with ADR 397's enumerated destination/copy amendments below. #389 owes the executable substitutions; historical prototype runtime strings are not current destination authority."

Old (superseded): "- `Open Day`"
New: "- `Open Day` - `Back to Diagnose` · `Open Diagnose` - `Written for the v1 tabs: Diagnose keeps its name here, Plan reads as Changes.`"

Old (superseded): "verbatim-first port of the prototype's CSS/JS with every adapted line range documented"; "same-byte prototype/built-app pairs for every eye term and required state".
New: "acceptance of the complete first usable release follows, under tasks 3.4 and 3.5. The verbatim-first port and same-byte pairing obligations have an exception for ADR 397's enumerated destination/copy amendments. #389 documents every adapted range and supplies updated evidence; no superseded navigation requirement survives through the port instruction."

Old (superseded): "1. **\"Explore\" as a destination name.** `predecessor.md`'s *Investigation name remains open* records that on 2026-09-06 no rename of v1's **Diagnose** was agreed. ADR 348 — Adopt the reviewed desktop direction then instructed: \"Keep the selected Overview / Explore / Changes / Day destinations.\" Both hold, because they answer different questions. **`/v2/` names its destination `Explore` under ADR 348; v1's `Diagnose` is not renamed, and this lock proposes no rename.** No new naming round is opened."
New: "1. **Diagnose survives as the destination name.** ADR 348's four-destination adoption is historical and superseded for navigation by the September 8 sanction and ADR 397. V1 and v2 use Diagnose for the Findings/evidence destination. No new naming round opens."

Old (superseded): "- Theme chooser/storage:"
New: "- Navigation: Connor Griffin, 2026-09-08, the September 8 direction change recorded in openspec/changes/harmonic-v2/design.md: \"v2 ships three destinations: Diagnose, Changes and Day. Overview and Explore collapse into Diagnose carrying the shipped v1 rail as-is\". ADR 397 records the amendment. - Theme chooser/storage:"

Old (superseded): "harmonic-v2-glucose.js: Back to Overview"
New: "harmonic-v2-glucose.js: Back to Diagnose"

Old (superseded): "harmonic-v2-glucose.js: Return to Overview"
New: "harmonic-v2-glucose.js: Return to Diagnose"

Old (superseded): "harmonic-v2-glucose.js: The meals remain available in Explore."
New: "harmonic-v2-glucose.js: The meals remain available in Diagnose."

Old (superseded): "harmonic-v2-glucose.js: Explore (destinationLabel fallback)"
New: "harmonic-v2-glucose.js: Diagnose (destinationLabel fallback)"

Old (superseded): "harmonic-v2-glucose.js: Overview (leading-change, quiet, set-aside and ending summaries)"
New: "harmonic-v2-glucose.js: Changes (leading-change, quiet, set-aside and ending summaries)"

Old (superseded): "harmonic-v2-glucose.js: emptyFrame('Overview', 'Evidence unavailable', ...)"
New: "harmonic-v2-glucose.js: emptyFrame('Diagnose', 'Evidence unavailable', ...)"

Old (superseded): "harmonic-v2-glucose-journey.js: Open Explore"
New: "harmonic-v2-glucose-journey.js: Open Diagnose"

Old (superseded): "harmonic-v2-glucose-journey.js: Overview (leading-change and quiet summaries)"
New: "harmonic-v2-glucose-journey.js: Changes (leading-change and quiet summaries)"

Old (superseded): "harmonic-v2-glucose-journey.js: emptyFrame('Overview', 'Current read failed', ...)"
New: "harmonic-v2-glucose-journey.js: emptyFrame('Diagnose', 'Current read failed', ...)"

Old (superseded): "harmonic-v2-glucose-setting.js: Return to Overview"
New: "harmonic-v2-glucose-setting.js: Return to Diagnose"

Old (superseded): "harmonic-v2-glucose-setting.js: The nights remain available in Explore."
New: "harmonic-v2-glucose-setting.js: The nights remain available in Diagnose."

Old (superseded): "harmonic-v2-glucose-setting.js: Overview (leading-change and set-aside summaries)"
New: "harmonic-v2-glucose-setting.js: Changes (leading-change and set-aside summaries)"

Old (superseded): "harmonic-v2-glucose-focus.js: Back to Overview"
New: "harmonic-v2-glucose-focus.js: Back to Diagnose"

Old (superseded): "harmonic-v2-glucose-focus.js: Return to Overview"
New: "harmonic-v2-glucose-focus.js: Return to Diagnose"

Old (superseded): "harmonic-v2-glucose-focus.js: The lows remain available in Explore."
New: "harmonic-v2-glucose-focus.js: The lows remain available in Diagnose."

Old (superseded): "harmonic-v2-glucose-focus.js: Overview (leading-change, set-aside and ending summaries)"
New: "harmonic-v2-glucose-focus.js: Changes (leading-change, set-aside and ending summaries)"

Old (superseded): "harmonic-v2-glucose-day.js: Return to Overview"
New: "harmonic-v2-glucose-day.js: Return to Diagnose"

Old (superseded): "harmonic-v2-glucose-utilities.js: Explore (destination label)"
New: "harmonic-v2-glucose-utilities.js: Diagnose (destination label)"

Old (superseded): "harmonic-v2-glucose-utilities.js: Written for the v1 tabs: Diagnose reads as Explore here, Plan as Changes."
New: "harmonic-v2-glucose-utilities.js: Written for the v1 tabs: Diagnose keeps its name here, Plan reads as Changes."

Old (superseded): "harmonic-v2-glucose-basal.js: Explore (destinationLabel)"
New: "harmonic-v2-glucose-basal.js: Diagnose (destinationLabel)"

Old (superseded): "_shell.js: Overview / Explore / Changes / Day"
New: "_shell.js: Diagnose / Changes / Day"

Old (superseded): "mockups/harmonic-v2-glucose.html: data. Four destinations — Overview, Explore, Changes, Day — behind one"
New: "mockups/harmonic-v2-glucose.html: data. Three destinations — Diagnose, Changes, Day — behind one"

Old (superseded): "mockups/harmonic-v2-glucose.html: changes. Overview is the default and owns the decision: the active change and its progress, or the leading available priority, with one named route to its evidence. Explore owns the findings roster, clock window, detailed evidence, the case file, Spotlight and All Charts."
New: "mockups/harmonic-v2-glucose.html: changes. Diagnose is the default; Changes owns the backend-selected active change or leading available priority and its next action. Diagnose carries the shipped v1 Findings rail as-is, including #395's Patterns, and owns clock-window exploration, detailed evidence, the selected case file, Spotlight and All Charts."

Old (superseded): "mockups/harmonic-v2-glucose.html: month, statistics and the Episode Log. The stage is the same object on Overview and Explore by intent; the pane beside it is what differs."
New: "mockups/harmonic-v2-glucose.html: month, statistics and the Episode Log. Diagnose's evidence stage remains geometrically stable as the Findings, clock window and selected case change, under HV2-03–HV2-08."

Old (superseded): "mockups/harmonic-v2-glucose.html: the global Explore control"
New: "mockups/harmonic-v2-glucose.html: the global Diagnose control"

Old (superseded): "mockups/harmonic-v2-glucose.html: STILL OWED BEFORE PRODUCTION IMPLEMENTATION. The v2 behavior ledger and its fail-closed replay are frozen first, following behavior-sweep. The"
New: "mockups/harmonic-v2-glucose.html: STILL OWED BEFORE DEPENDENT IMPLEMENTATION RESUMES. #389 amends its existing frozen behavior ledger and fail-closed replay, absent here. The"

Old (superseded): "mockups/harmonic-v2-glucose.js: the four destinations and their default (Overview)"
New: "mockups/harmonic-v2-glucose.js: the three destinations and their default (Diagnose)"

Old (superseded): "mockups/harmonic-v2-glucose.js: utility journeys. The stage is deliberately the same object on Overview and Explore; what differs is the pane beside it — the decision on Overview, the roster and detail on Explore."
New: "mockups/harmonic-v2-glucose.js: utility journeys. Changes owns the backend-selected leading change and next action; Diagnose carries the shipped Findings rail and evidence. Its evidence stage remains geometrically stable as the Findings, clock window and selected case change, under HV2-03–HV2-08."

Scope: selected v2 desktop only; supersedes prior destination/copy authority.
Historical prototype executable bytes, implementation comments, captures and
unselected variants remain unchanged. They do not depict the amended navigation.
Changes' leading-change ownership is the coordinator's explicit placement
instruction in #397's order, separate from the quoted September 8 sanction.
#389 owes executable substitutions and adaptation evidence. Contextual Day
return still follows HV2-14's source and precise target, including Changes.
The v2 behavior/fidelity ledgers and replay live on stopped #389 and are absent
here. #389 must amend affected frozen behavior entries, permanent retirement
records, LOCK assertions and fidelity rows before dependent implementation
resumes. No local executable LOCK assertion exists: HV2-nn is illustrative.
#389 must prove each amended assertion fails for the intended reason before
restoring green, and change fidelity rows from re-settle requested to met only
with new evidence. No ledger, executable proof or release acceptance is claimed.

ADR 135's historical Explore canvas mode is distinct from the v2 destination.
S109/S112/S113 retain their old mode/layout/duplicate-tile retirements; this
ruling reinstates none of those mechanics. V1 ledgers and unrelated INDEX
history remain unchanged. Both Evidence unavailable and Current read failed
frames belong to Diagnose under HV2-11.

## Classification and pinned authority

- Surface: `harmonic-v2-desktop`
- Lifecycle: greenfield `/v2/` alongside shipped v1, with a legacy predecessor inventory
- UI Craft route: `lock`. `/v2/` has no shipped embodiment, so the pre-flight
  refusal for a shipped surface does not apply. The predecessor inventory is
  mandatory anyway, because this surface takes over jobs v1 performs today.
- UI source pin: `d8217ef4e362ebba1fff2fe5532ad3cdeaf8cd63`
- Selected surface: `mockups/harmonic-v2-glucose.html?source=journey`
- Adopted direction: ADR 348, `openspec/changes/harmonic-v2/design.md`
- Completed repair authority, in force where earlier rounds differ:
  `mockups/harmonic-v2.exploration/BRIEF.md`, `REVIEW.md`, `FABLE-REVIEW.md`,
  `COLD-WALKTHROUGHS.md`, `OPUS-QA-REPAIRS.md`, `AUDIT.md`
- Backend binding pin: `3686b417`, unchanged at final CI candidate
  `a301951a4bb72b73647c0f0dba1bc500d2d6cf97`. No backend capability is owed.
- Comparison-policy pin: `1ee53b341192b0943c83aae94b47dc6b33c571e3`
- Target viewports: `1280×720` and `1440×900`
- Theme: dark only. The theme chooser and theme storage are retired; dark
  material is not.
- Build route: `/v2/`, assets beneath `/v2/assets/`, v1 still served
- Data: committed generator-owned synthetic fixtures only
- Excluded from the child this lock admits: mobile design and acceptance, root
  cutover, v1 retirement, new navigation/naming/concept work, and
  clinical/readiness calibration

### Chrome ground truth and material fidelity

The shipped app's own dark token layer is the material truth, not mockup
lineage. The role ladder in HV2-07 is `frontend/index.html:69–71`
(`--wk-canvas`, `--wk-surface-sunken`, `--wk-field`, `--wk-surface`,
`--wk-surface-rail`, `--wk-rule`, `--wk-rule-strong`, `--wk-ink`,
`--wk-ink-body`, `--wk-ink-meta`, `--wk-ink-nav`), pinned by
`frontend/index.test.js:14–18`. **A build consumes those tokens; it does not
transcribe the hex values into a second layer.** The shell rows in HV2-04 are
`frontend/shell.css:26` and its `@media (max-height: 860px)` rule at `:327`.
The mock links the app's own stylesheets (`frontend/theme.css`,
`frontend/diagnose-workstation.css`, `frontend/diagnose-event-comparison.css`)
rather than forking them.

The round-zero fidelity gate passed on 2026-09-06 before concept fan-out
(`BRIEF.md`, *Material fidelity gate*): empty shell beside shipped Diagnose at
1280×720, computed header `rgb(20, 18, 15)`, canvas `rgb(15, 13, 11)`, header
height 38px, no console errors.

Charts render through the app's shipping renderers and its shipping ECharts
5.5.0 — `frontend/diagnose-event-comparison.js`,
`frontend/diagnose-evidence-charts.js`, `frontend/diagnose-workstation-chart.js`,
`frontend/scenario-chart.js`, `frontend/day-hero-chart.js`,
`frontend/verify-workstation-chart.js`. No hand-rolled facsimile stands behind
any judgment in this manifest.

### Accepted render evidence

Existing accepted synthetic captures remain valid for unchanged visual bytes.
No render, server or browser command was rerun to write this manifest.

| Capture | Size | SHA-1 |
|---|---:|---|
| `/tmp/harmonic-348-contract-final/1.png` | 1280×720 | `7922a733e4099e5cfd38e7823a70130cad6aa135` |
| `/tmp/harmonic-348-contract-final/2.png` | 1280×720 | `6c39a0c5d384add68125713d281f25a4a5219960` |
| `/tmp/harmonic-348-contract-final/3.png` | 1280×720 | `b3d6ee386721fc540e41d3fa587bae7bc1d0ed1a` |
| `/tmp/harmonic-348-contract-final/4.png` | 1280×720 | `2c9c65a5702c5ed8d6a0a20cc061775a23c8decf` |

Root's 1440×900 follow-up (`viewport-1440/verification.json`,
`verified-capture.log`) captured and visually inspected Overview, Explore, empty
Changes, Day and staged Plan on unchanged selected bytes: reading pane 300px,
shell rows 42/832/26px, no page overflow, empty console. Empty Changes has no
reading pane by intent, and HV2-05/HV2-06 preserve that observed state rather
than redesigning it. Navigation and affected copy in these historical captures
are superseded by ADR 397. Unchanged material/geometry evidence remains usable;
these captures do not prove the amended build.

This is prototype evidence. Built-app fidelity pairs, the fidelity ledger and
human release acceptance belong to the build and to task 3.4/3.5.

## Re-settlement — 2026-09-08, historical past-setting reads

Sanction: Connor Griffin · 2026-09-08 · “We dont' need historical reads in the app.”
This supersedes the proposed Watching-only parity correction. HV2-31's former
“historical states” included past-setting tuning reads; the amended term excludes
those reads entirely while preserving Trial/Focus original records and endings.
No source data is deleted. Held/thin current-setting evidence and the past glucose
observations used for a current setting remain available.

The same ruling changes the selected-I:C fixture obligation to current `ic-lower`
and retires the historical-setting predecessors named in the registry below.
HV2-30/S98 still owe coherent replacement, failure, retry and dated stale-state
proof on a current setting. R18 owes rendered absence from an input that actually
contains a historical row. Earlier prototype captures are evidence only for
unchanged states; new absence evidence is owed by the build.

## Precedence

ADR 397 and the dated amendment above supersede the selected prototype and
repair records only for the enumerated destination and copy amendments.
Historical executable bytes and captures remain unchanged; #389 owes their
executable realization and updated fidelity evidence.

Three authorities otherwise apply, in this order, over three different questions.

1. **The selected prototype and the adopted repair records govern `/v2/`
   arrangement, hierarchy, destination behavior, acknowledgment and return
   behavior.** Where an earlier exploration round differs from
   `OPUS-QA-REPAIRS.md`, `COLD-WALKTHROUGHS.md` or `AUDIT.md` round 9, the
   repair record wins.
2. **The shipped v1 token layer, role-based chrome rules, sibling geometry and
   production chart renderers govern component material** wherever the mock
   scaffold differs from the app. The mock's own scaffold (`_theme.css`,
   `_shell.js`) authored the design; it is not the material ground.
3. **Backend responses govern identity, eligibility, readiness, admission,
   permissions, evidence populations, periods, comparison results, persistence
   and endings.** The frontend re-derives none of these. Where the prototype's
   arrangement is fed by a page-memory field, the build keeps the arrangement
   and binds it to the serialized field named in *Backend binding notes* below.

## Terms

Stable term IDs are `HV2-01` through `HV2-34`; a replay function cites its term
as `LOCK:harmonic-v2-desktop:HV2-nn`.

| # | Term | Kind | Evidence expected |
|---|---|---|---|
| HV2-01 | Python serves the new surface at `/v2/` and its packaged assets beneath `/v2/assets/`; no Node runtime or CDN is required in production. | gate | Built-wheel/static-route assertion and cold Python-only launch |
| HV2-02 | V1 and `/v2/` coexist against the same authenticated Python API and database. This contract admits neither cutover nor v1 retirement. | gate | Route/auth matrix exercising both surfaces |
| HV2-03 | At `1280×720` and `1440×900`, the document has no root/page scroll or horizontal overflow; populated stage and reading content scroll only inside their owned panes. | gate | Computed geometry assertions and paired renders |
| HV2-04 | Shell rows are `38px / minmax(0,1fr) / 24px` below `860px` viewport height, including `1280×720`; at `1440×900` they are `42px / minmax(0,1fr) / 26px`. | gate | Computed grid-track assertions |
| HV2-05 | Paired evidence/reading states use one flexible evidence stage plus a `300px` reading pane separated by the shipped one-pixel hairline. Preserve the selected full-width empty Changes state when no change is underway; do not manufacture a reading pane there. The approved intermediate-width rule for paired states is `256px` at `701–1100px`; it is inherited behavior, not mobile admission. | gate | Computed width/divider assertions |
| HV2-06 | Preserve the premium fixed cockpit: dark diagnostic desk, paired stage/reading panes where the selected state uses them, the selected full-width empty states, and flat role-based surfaces. No page banner, hero-metric template, repeated card grid, or bottom action bar. | eye | Named eye judgment at both target sizes |
| HV2-07 | Material uses the shipped dark role ladder: desk `#0F0D0B`, chart well `#14120F`, field `#1E1A17`, sheet `#221E1B`, rail `#2B2622`, rule `#3F3833`, edge `#453D35`, and inks `#F2EDE2`, `#CFC8BD`, `#A49C90` with nav `#C6BFB3`. Theme controls and theme storage remain absent; their retirement does not retire dark material. | gate | Computed styles on consuming elements |
| HV2-08 | Inter remains the single UI family. Stage titles use the selected `1.14rem`, weight `700`, line-height `1.3`, tracking `-.01em`; clinical numbers use tabular figures. No heading exceeds the design-system `1.5rem` ceiling. | gate/eye | Computed type assertions plus eye judgment |
| HV2-09 | Diagnose is the default destination. Diagnose, Changes, Day, scope, Log carbs, advisory status and utilities remain persistent chrome without moving across destination changes. | gate | Route/default and cross-view geometry replay |
| HV2-10 | Changes owns the backend-selected active change or leading available priority and its next action, alongside its HV2-12 responsibilities. It does not duplicate Diagnose's full findings roster. | gate | Guidance-state replay |
| HV2-11 | Diagnose owns Findings, clock-window exploration, detailed evidence, the selected case file, Spotlight and All Charts. It carries the shipped v1 Findings rail as-is, including #395's Patterns. Its evidence stage remains geometrically stable as the Findings, clock window and selected case change, under HV2-03–HV2-08. | gate | Diagnose workflow and paired render |
| HV2-12 | Changes owns current Plan or Focus, Trial/Focus progress, endings, saved conclusions, original records, history, reassessments and Pump settings. | gate | Setting and habit history workflows |
| HV2-13 | Day owns the five-track chronology, week ribbon, month access, statistics and Episode Log. Direct Day entry invents no prior subject or return target. | gate | Direct-Day workflow |
| HV2-14 | Contextual Day entry carries date, moment, canonical subject, occurrence/night, affected window, applicable lever, source destination and precise return-focus target. Returning restores that context rather than merely reopening a destination. | gate | Diagnose/Changes/utility → Day → exact-return replays |
| HV2-15 | One active change leads. Setting and habit work cannot simultaneously claim the active-change seat; the UI renders backend admission and action permissions verbatim. | gate | Conflicting-action negative cases |
| HV2-16 | Set aside retains the same subject, optional reason, roster group and visible Restore, while naming the next backend-selected priority. Restore returns the eligible subject. | gate | Durable set-aside/reload/restore replay |
| HV2-17 | All 48 basal slots remain independently discoverable. Slot selection retains its supporting nights, original evidence, current/suggested values, interval, support, hold/stageability and Basal/Night/Day figures. | gate | Dense 48-slot fixture and keyboard/Day replay |
| HV2-18 | Event comparison retains served Matched, Nearly matched and other eligible cohorts, support labels, member traversal, selected trace, Episode/Day actions, full-screen containment and shared-renderer cleanup. | gate | Shared-renderer replay |
| HV2-19 | Basal, Correction factor and Carb ratio keep their distinct production evidence and delivery paths. The frontend derives no support floor, direction, staging verdict, confidence criterion, evidence membership, readiness criterion or finishing permission. | gate | Payload-to-render assertions and negative fixtures |
| HV2-20 | Plan retains one setting family, the complete pump-entry schedule, source-owned segment use/capacity, proposed versus detected values, draft save, decision recording, pending reconciliation, mismatch, match and withdrawal. | gate | Full Plan lifecycle replay |
| HV2-21 | Capacity copy renders values supplied or calculated by the existing Plan deliverable contract. Literal examples are fixture-specific; no Trial or schedule is required to show another fixture's count. | gate | At least two different synthetic schedules |
| HV2-22 | Follow-up readiness renders the backend-owned facts from the selected record's comparison: evidence unit, observed qualifying count, contributing dates, criterion-met status and reason, alongside separate action permissions. Setting arms carry a required count and criterion availability. Pattern Focus arms carry their backend-owned opportunity gate and observed opportunity count; no elapsed-day rule or client criterion replaces it. A collapsed single-member pattern's Focus arm uses the same opportunity count in the same unit as its owning pattern. Watch maturity copy does not supply evidence readiness. | gate | Each setting family and Focus; negative proof that the UI derives no criterion |
| HV2-23 | Readable live values, charts, directional labels, evidence and accumulating progress remain visible before readiness and after an inconclusive finish when available. The surface is not final-only. | gate | Maturing, ready, inconclusive and ended comparisons |
| HV2-24 | Comparison readiness has no universal fourteen-day minimum or cutoff and does not automatically end a watch. Existing watch maturity and expiry remain separate lifecycle metadata. Source-owned criteria are resolved: eight effective qualifying I:C meal runs for the captured block; fourteen qualifying clean nights for every affected basal slot; thirty distinct qualifying Rest windows for Correction factor; thirty coverage-qualified informative dates and thirty elapsed days for a whole profile; and backend-owned opportunity readiness for a pattern Focus (12 qualifying meals or lows, or 12 harm-band source nights, by pattern). The UI renders each record's backend criterion. | gate | Different evidence units; accumulation beyond fourteen days; readiness met with uncertain inference |
| HV2-25 | Trial finish records a durable conclusion and backend ending assessment without implying Harmonic programmed the pump. The retired session-only Keep action does not return. Revert-to-Plan remains the backend-supplied manual-entry route. | gate | Finish/retry/reload plus Revert negative/positive cases |
| HV2-26 | Focus leads with the intended behavior and renders adherence separately from mapped glucose outcomes. Zero opportunities, absent measurements and positive denominators with zero unwanted events remain distinct. | gate | Focus comparison matrix |
| HV2-27 | Manual Focus ending, Trial preemption and lever-unavailable ending remain distinct. A preempted Focus is dropped, retained in history and never silently resumed. | gate | Ending/preemption/restart replay |
| HV2-28 | History distinguishes original decision or first-observed context, observed change, immutable saved ending, current/retained reassessment and explicitly unavailable legacy facts. A finished record first opens itself rather than immediately promoting another concern. | gate | Historical selection and sequential-change replay |
| HV2-29 | A new-window load or failed replacement obeys P19b: show only count-free loading/error content for the requested range, withdraw former rows/recommendations/support/staging, and never masquerade the previous projection as the new result. | gate | P19b pending/failed/sliced-window replay |
| HV2-30 | P19b does not erase the selected I:C exception: a replacement may preserve the last coherent selected I:C case/canvas pair while withholding staging. A clearly dated same-subject stale result may also remain during an ordinary failed refresh. These are separate states. | gate | I:C coherent-pair and same-subject refresh fixtures |
| HV2-31 | Quiet, held, held-for-safety, thin, missing, pending, ready, unavailable, failed, stale and superseded states, plus retained Trial/Focus records, make distinct claims and expose only backend-permitted actions. Unavailable carries a served reason; it is not an unresolved criterion. Historical past-setting tuning reads are absent from Diagnose, Changes, Day, Watching, All Charts, counts and selection in both app surfaces. | gate | One addressable fixture per state |
| HV2-32 | Destination arrival focuses its pane heading unless the caller supplies a precise target. Selection, cohort, chart cursor, slot, night, date and utilities remain keyboard-operable; color semantics always have label, shape or positional redundancy. Fractional-hour chart speech is repaired in `frontend/diagnose-event-comparison.js`, not in a v2-only formatter. | gate | Keyboard, accessible-name/readout and color-redundancy checks |
| HV2-33 | Escape follows the repaired hierarchy, restores launcher/focus, preserves established unsaved utility input, and does not discard a draft implicitly. Destination changes preserve only state owned by their route contract. | gate | Layered Escape, focus and scroll replay |
| HV2-34 | Rebinding, chart replacement, `ResizeObserver`, pagehide/unmount and late-response paths clean up fully. Mock source/clock/failure controls, scenario switchers and Review notes never enter production. | gate | Repeated mount/unmount, stale-response and DOM-absence assertions |

**Default view and persistent chrome** are stated in HV2-09 rather than in two
extra terms: Diagnose is the default destination, and the destination switcher
itself (`Diagnose` / `Changes` / `Day`) is named as persistent
chrome alongside scope, Log carbs, the advisory line and the utility strip.

**Per-destination chrome:** all three destinations keep the same topbar (identity, the three
destination buttons, scope, Log carbs) and the same footer (advisory line, Carb
questions with its open count, Guide, Settings, Glossary). What differs is only
the pane content each destination owns, per HV2-10 through HV2-14. Pump settings
is reached from Changes (HV2-12), not from the footer strip. An open utility
takes the reading pane's seat and leaves the destination underneath standing
(HV2-33). Diagnose carries the shipped Findings rail as-is within this chrome;
this paragraph authorizes no rail redesign.

### Backend binding notes

The prototype fed some arrangements from page memory. The build keeps the
arrangement and binds it to the serialized field, per precedence rule 3.

- **Readiness is two different fields, and the prototype's one label hides
  that.** `selected.readiness` (`watched_change.py:1142`) is watch-maturity copy
  — "Maturing" / "Ready to judge" — and is lifecycle metadata. Type-specific
  evidence readiness lives only under
  `selected.reassessment.comparison.readiness.{before,after}` at
  `assessment=retained`. HV2-22, HV2-23 and HV2-24 bind to the comparison path;
  the maturity label stays where it is and supplies no evidence readiness.
- **Pre-ready values need a second request.** An active Trial or Focus has no
  ending, so `selected.original.assessment` is
  `{state:"unavailable", reason:"not_recorded"}`. `assessment=retained` is
  rejected with 422 unless `selected` is supplied. HV2-23 binds to that second
  request, not to a roster field.
- **Setting and Focus readiness have different shapes.** Setting arms carry
  `{unit, required, observed, contributing_dates, criterion_met, reason,
  available, elapsed_days}`.
  **Amended 2026-09-10 — #389 Coordinator Amendment 2, under ADR 391/395.**
  Old (superseded): The Focus override omits `available` and `required`
  and carries `{unit, observed, measured, unmeasured, elapsed_days,
  required_elapsed_days: 14, criterion_met, contributing_dates, reason}`. A
  Focus surface renders the actual positive/measured population and elapsed
  days, never an "X of Y required" meter.
  New: Legacy non-Pattern Focus retains that shape; Pattern Focus retains all
  those fields with `required_elapsed_days: null` and adds
  `{count, gate, verdict, required}`. The backend opportunity owner supplies
  `count`, `gate`, `verdict`, `unit`, `contributing_dates` and `reason` for each
  retained arm; `observed` aliases `count`, `required` aliases `gate`, and
  `criterion_met` reflects the served verdict. `measured` and `unmeasured`
  retain the lever's behavior-observation counts, with their denominator in
  `adherence`; they need not sum to the Pattern count. A Pattern Focus surface
  renders the served opportunity count, gate and verdict alongside separate
  behavior measurements, with elapsed days descriptive and no client criterion.
- **No unresolved criterion exists.** Every `_comparison_readiness` branch sets
  a concrete `required` and a boolean `criterion_met`. The unavailable-evidence
  cases stay; an unresolved-criterion state has no producer (HV2-31).
- **There is no overall favorable verdict.** `comparison.assessment.state` is
  only `concerning`, `unclear` or `context`; favorable exists per outcome row.
  No HV2-23 or HV2-26 summary may claim a favorable ending.
- **`admission.state: unavailable` has exactly one reason**,
  `reconciliation_required`. An active Trial or Focus keeps `state: available`
  and moves that fact into `reason`. HV2-15 and HV2-31 must not treat "a change
  is active" as an unavailable admission.
- **Set aside and Restore are durable Store writes outside the #387 receipt
  envelope**: no `request_id`, no body `input_revision`, no `record`/`admission`
  in the response, legacy plain-string `detail` on 409/404. Retry is not
  idempotent by receipt, so HV2-16 re-reads `/api/guidance` after either call.
- **`pinnable` is the lever universe, not permission.** Permission is
  `admission.focus_pin.available` only.
- **`availability.reason` is an open provider-owned field**, not a closed enum.
  The Focus branch forwards a classifier-owned `measurement_reason` verbatim.
  The UI renders whatever `availability.state` and `reason` arrive.
- **Trial finish requires durable fields; Focus resolve keeps a legacy bodyless
  branch.** A v2 client that always sends durable fields gets idempotent retries
  on a closed Focus. This is legacy compatibility, not an asymmetry to design
  around.
- **Day return-focus context is frontend-owned** route/URL state
  (`openspec/changes/url-state-contract`), not a #387 payload. HV2-14 is a UI
  obligation, not a backend gap.
- **Conflict codes and ending kinds are backend vocabulary** rendered verbatim:
  endings `user_finished, manual, reverted, superseded, expired_unreviewed,
  trial_preempted, lever_unavailable`; durable 409 bodies carry
  `detail: {code, input_revision, admission}`.

Exact routes, keys, producers and public tests are in the verified binding map
at `3686b417`. The frontend uses no aliases for them.

## Fixture obligations

A fixture that cannot show a term cannot prove it. Every fixture is
generator-owned and synthetic; none is hand-written and none carries real data.
Implementing this matrix belongs to the build; defining it belongs here.

1. **Geometry (HV2-03–HV2-08).** One dense populated state per destination: Diagnose, Changes and Day, whose
   stage and reading content both overflow their own panes, so inner scrolling
   is observable while root scroll stays absent at both target sizes. One empty
   Changes state with no change underway, so the full-width empty case is
   provable as intended rather than as a missing pane. Empty Changes must not
   suppress a backend-selected available priority and next action owned by HV2-10.
2. **Changes guidance (HV2-10, HV2-15, HV2-16, HV2-31).** A leading available priority;
   an active change occupying the seat; a quiet disposition; a set-aside subject
   that survives reload with its reason and roster group and a next named
   priority; an unavailable disposition carrying its served reason; and a failed
   read that cannot render as quiet.
3. **Basal evidence (HV2-17, HV2-19).** A capture serving all 48 slots with each
   slot's supporting nights, original evidence, current and suggested values,
   interval, support and staging verdict — including at least one held slot and
   one thin slot that keep their numbers but cannot stage, and complete
   night-to-Day links.
4. **Correction factor and Carb ratio (HV2-19).** Their own evidence populations
   and delivery paths, proving three distinct families rather than one
   interchangeable staging rule.
5. **Plan (HV2-20, HV2-21).** At least two different synthetic schedules with
   different segment capacities, so capacity copy is proven as served rather
   than as a memorized literal. Plus: a draft save failure, a decision-record
   failure, a pending reconciliation resolving to mismatch and to match, an
   empty plan, a divergent first plan and a withdrawal.
6. **Readiness (HV2-22–HV2-24).** One record per evidence unit — I:C closed meal
   runs, per-slot basal clean nights, Correction-factor Rest windows,
   whole-profile coverage-qualified dates, and Focus elapsed days with a
   measured behavior population. At least one accumulating past fourteen days,
   one criterion met with unclear inference, one unavailable comparison with its
   served reason, and one inconclusive ending.
7. **Focus (HV2-26, HV2-27).** Zero opportunities; an absent measurement against
   a nonzero population; a positive denominator with zero unwanted events; a
   manual ending; a `trial_preempted` ending whose dropped record stays reachable
   and never resumes; and a `lever_unavailable` ending.
8. **History (HV2-28).** An original record, an immutable saved ending, a
   retained reassessment, a legacy record with explicitly unavailable facts, and
   a genuine sequential change that does not promote an older candidate.
9. **Replacement (HV2-29, HV2-30).** The three P19b projections —
   `issue81PendingProjection`, `issue81FailedProjection`,
   `issue81SlicedProjection` — plus a coherent selected I:C case/canvas pair
   surviving a failed replacement with staging withheld, and a clearly dated
   same-subject stale result during an ordinary failed refresh.
10. **Event comparison (HV2-18).** Served Matched, Nearly matched and other
    eligible cohorts with their support labels, at least one withheld-support
    cohort, and enough members for traversal.
11. **Day (HV2-13, HV2-14).** A recorded week and month with day payloads for
    every recorded date, a five-track chronology, an Episode Log, and entry
    points from a setting night, an event occurrence, a Focus and a Carb
    question, each with its own precise return target.
12. **Utilities (HV2-33).** Guide, Glossary, Log carbs with an invalid entry and
    a failed save, Carb questions with an open count, App settings with an
    unsaved draft, and Pump settings reached from Changes.

## Verbatim strings

Copied from the selected mock, with ADR 397's enumerated destination/copy
amendments below. #389 owes the executable substitutions; historical prototype
runtime strings are not current destination authority.

**Persistent chrome** (`mockups/_shell.js:15–16`, plus the utilities module's
footer injection):

- Identity: `Harmonic` with `advisory` as its small mark
- Destinations: `Diagnose` · `Changes` · `Day` (nav label `Main`)
- Scope: `Scope` · `30 d`
- `＋Log carbs` (the mark is U+FF0B, fullwidth plus)
- Advisory line: `Advisory only — review with your clinician before changing pump settings.`
- Footer utilities (nav label `Utilities`): `Carb questions` with its open
  count · `Guide` · `Settings` · `Glossary`
- Utility pane titles: `App settings` · `Pump settings` · `Log carbs` ·
  `Carb questions` · `Guide` · `Glossary`

**Decision and evidence routes:**

- `Inspect nights` (setting) · `Inspect lows` (habit) · `Inspect meals`
  (investigation)
- `Revisit nights` · `Revisit lows` · `Revisit meals`
- `Set aside` · `Restore` · `Return to Diagnose`
- `Findings` — the persistent parent crumb in the basal lane's head
- `Stage change` · `Start Focus`
- `View change record` · `View Focus record`
- `Open Day`
- `Back to Diagnose` · `Open Diagnose`
- `Written for the v1 tabs: Diagnose keeps its name here, Plan reads as Changes.`

**Empty and set-aside states:**

- `No change underway`
- `No priority needs action`
- `Set aside` heading, with the served reason, or
  `The nights remain available in Diagnose.` /
  `The lows remain available in Diagnose.` /
  `The meals remain available in Diagnose.`
- `Trial finished` · `Focus resolved`
- `Day remains available.` · `Day and the change record remain available.`

**Plan and Trial:**

- `<n> of <capacity> segments used` — for example `3 of 16 segments used`;
  the number is the profile's segment **capacity**, and the value is served,
  never memorized
- `Nothing here is sent to your pump.`
- `Saving the draft failed` / `Recording the decision failed`, each followed by
  `: no response from the store.`
- `Retry saving the draft` · `Retry recording the decision`
- `Evidence accrued`
- Progress figure, still maturing: `<elapsed> of <required> days`, with
  `<gap_count> data gaps` beneath
- Progress figure, criterion met: `<elapsed> days`, with
  `<required> required · <gap_count> data gaps` beneath. The bar is clamped to
  its maximum, never overfilled — this is the B-08 repair, and `15 of 14 days`
  must not return.
- `Conclusion` — the one required, user-written field. The app puts no words in
  the wearer's mouth.
- `From the Trial record` — provenance on the original-read view
- `Return to Carb questions` — the utility-origin Day return

**Ranking vocabulary is the shipped findings queue's** (`TIER` in
`frontend/diagnose-findings-queue.js`), including `Next in line`. `Matched`,
`Nearly matched` and the other cohort names are established comparison
language. Neither was reworded by this lock, and neither may be reworded by the
build.

## Consistency check across locked artifacts

Every artifact this lock touches was read. Two apparent contradictions were
found; both are resolved here rather than left to the implementer.

1. **Diagnose survives as the destination name.** ADR 348's four-destination
   adoption is historical and superseded for navigation by the September 8
   sanction and ADR 397. V1 and v2 use Diagnose for the Findings/evidence
   destination. No new naming round opens.
2. **Watch maturity copy versus evidence readiness.** The prototype renders one
   `readiness.label` over a days-elapsed figure. The backend has two separate
   facts behind that. Resolved in *Backend binding notes*: the arrangement is
   preserved, the maturity label stays lifecycle metadata, and the evidence
   figure binds to `comparison.readiness`.

Also reconciled, without contradiction:

- **`AUDIT.md`'s two P2 findings.** Fractional-hour speech
  (`+0.08333333333333333 h`) is inherited from the shipped comparison
  renderer's private axis formatter, whose public interface exposes no
  replacement — round 9 confirmed the earlier expectation that the #350 QA merge
  would fix it was wrong. HV2-32 assigns the repair to
  `frontend/diagnose-event-comparison.js`, and it remains work for the build.
  Compact touch geometry belongs to the separately requested mobile design and
  is outside this desktop lock.
- **`OPUS-QA-REPAIRS.md`'s deferred A-07.** Cohort rows sit in the reading pane
  under the roster; the chart key above them stays non-interactive; the shipped
  comparison legend was not edited and no cohort is hidden. HV2-18 freezes that
  observed arrangement.
- **`INDEX.md` siblings.** The two `shipped` v1 rows stay `shipped`; this lock
  neither retires them nor rewrites their ledgers. The historical
  `finding-evidence-routing.exploration/` retraction record stays as it is —
  preserved evidence, not cleanup.
- **`cockpit-shell.behavior.md` and `finding-evidence-routing.behavior.md`
  remain frozen v1 ledgers.** Nothing in this lock edits them. The v2 behavior
  and fidelity artifacts live on stopped #389 and are absent here. #389 must
  amend its affected entries before dependent implementation resumes; this
  change creates no substitutes and claims no branch-local ledger update.

## Predecessor preservation

Existing command evidence is retained in
`ui-contract-prep/behavior-raw-tool-receipts.json` and
`behavior-root-disposition.md`. The verified executions were Diagnose `168/168`,
event comparison `14/14`, Day `3/3`, Plan `4/4`, Verify `8/8`, and cockpit
`19 passed / 0 failed / 2 intentional screenshot-hook skips`. **These prove v1
predecessor behavior only**, not that the prototype performs it.

No row below is `missed`. Every `retired` row carries a sanction from outside
this manifest — a lock may not sanction the omissions it is itself freezing.

### Cockpit ledger — `mockups/cockpit-shell.behavior.md`

| IDs | Disposition | Destination terms |
|---|---|---|
| S1, S6, S8, S9 | Keep | HV2-03–HV2-09 |
| S2 | Keep through the adopted Diagnose/Changes/Day routes | HV2-02, HV2-09 |
| S3, S10 | Retire the chooser/storage behavior only | HV2-07 |
| S4 | Keep | HV2-12, HV2-33 |
| S5 | Keep | HV2-12, HV2-33 |
| S7 | Deferred to separate later mobile acceptance; not retired | Outside this desktop lock |
| S11 | Keep | HV2-29–HV2-31 |
| R1 | Keep permanently retired; successor is in-place case/Day routing | HV2-11, HV2-14 |

### Finding/evidence ledger — `mockups/finding-evidence-routing.behavior.md`

| Canonical IDs | Disposition |
|---|---|
| P01–P10 | Keep clock draw, movement, resize, cancellation, click-no-op, cursor/live feedback, snap and floor. |
| **P55 boundary-crossing draw**, P56–P59, P122 | Keep midnight crossing, two endpoints, travel, aim, wrap and one-day limits. |
| P11–P19 | Keep Escape/clear, margin guard, non-drag basal lane, braceless selection, resize, preset/draw precedence, persistence and span-owner release. |
| **P19b** | Keep exactly under HV2-29/HV2-30; proof is S39 plus `issue81PendingProjection`, `issue81FailedProjection` and `issue81SlicedProjection`. |
| P20 | Retired only: a factor drill does not rewrite the clock window to its peak. |
| P21 | Retired only: occurrence selection does not rewrite the clock window. |
| P22 | Keep setting spans and midnight-wrapping blocks. |
| P23–P25 | Keep pop, vertical Up/Down stepping, end stops, focus restoration and `n/N`; retire only the old horizontal roster-key model. |
| P26 | Keep keyboard chart cursor/readout; repair fractional-hour speech under HV2-32. |
| P27 | Retire installed segmented Arrow/Home/End behavior; ordinary Tab navigation remains. |
| P28 | Keep pooled docked hover. |
| P29 | Keep pooled hover; retire only occurrence dots and meal glyphs on the glucose chart. |
| P30–P34 | Keep non-stacking rebind, redraw hover clearing, titles and basal-lane accessibility. |
| P35 | Retire only the separate occurrence level; keep in-place case selection. |
| P36–P43 | Keep classifier-owned case content, histogram, coincidence routing, staging, Plan badge, setting cases, queue drillability, lane shortcut and backend verdict paint. |
| P44 | Retire only the old standalone I:C lane; preserve its queue/case successor. |
| P45–P47 | Keep bounded case navigation, crumb elision, focus and reduced-motion behavior. |
| P48 | Retire redundant evidence-row chevrons; keep row activation. |
| P49 | Retire the nested counter-example subgroup; retain flat selected verdicts and the evidence-cap control. |
| P50–P51 | Keep guarded observers and route-owned updates. |
| P52 | Retire the standalone lens inspector; keep the shared case-file inspector, selected trace and Day route. |
| P53 | Keep route restoration/generation safety under the `/v2/` owner; do not revive old global-Align coordinates. |
| P54 | Keep selected-occurrence Day and full-window review routes. |
| **P55 global Align Tab-stop story** | Its reused identifier does not affect boundary drawing. The globally retired Align control does not return. |

**The two P55 rows are two different stories that share a reused identifier.**
Cite them by ledger path plus story title:
`mockups/finding-evidence-routing.behavior.md` → *boundary-crossing draw*
(kept) and → *global Align Tab-stop* (retired under its existing sanction). No
historical ledger edit and no new sanction is needed or made.

### Diagnose registry

Completely covered: `S01–S116`, `S118–S144`, `C41–C62`, `D1–D3`. S117 is
intentionally absent.

| IDs | `/v2/` disposition |
|---|---|
| S01–S08 | Keep shell and clock fundamentals. |
| S09–S23 | Keep selection/roster/setting successors; honor the partial retirements in S12 and S17. |
| S24–S40 | Keep case/event successors; old global mechanics in S33–S35 and S37–S38 remain retired. |
| S41–S71 | The 2026-09-08 historical-setting ruling retires S41, S43–S48, S53–S56, S63–S64 and S68 as attributed absence checks. S42 keeps the held/blind Watching disclosure and sift. Earlier global-canvas retirements remain in force. Current-setting replacement obligations remain under HV2-29/HV2-30. |
| S72–S91 | Keep current window/selection successors; S74 retains default-collapsed held/blind Watching and footer absence, with historical rows removed. Do not revive global Align. |
| S92–S101 | Keep the retired old fixed-seat mechanics retired; preserve the successor Spotlight/All Charts behavior. |
| S102–S108 | Keep chart state, scale, retry and full-screen behavior. |
| S109, S112, S113 | Keep the retired old mode/layout/duplicate-tile mechanics retired. ADR 397 changes destination naming without reinstating those retired canvas mechanics. |
| S110 | Keep the owning-chart mark; retire only the duplicate provenance word chip. |
| S111, S114–S116 | Keep catalog/full-screen/selection behavior. |
| S118–S120 | Keep catalog and chart retention. S120's chart Keep is unrelated to Trial Keep. |
| S121–S126 | Keep queue order, case state and restoration. |
| S127 | Keep the retired old dock grow-back retired; retain the direct All Charts successor. |
| S128–S132 | Keep current All Charts behavior. |
| S133–S138 | Keep basal-night evidence and Day routing. |
| S139–S144 | Keep priority/price-rail behavior. |
| C41–C45 | Keep comparison cohorts and the shared renderer. |
| C46–C53 | Keep the retired old global Event-charts host mechanics retired. |
| C54–C58 | Keep current support, keyboard, selection and containment. |
| C59–C62 | Keep staging, draft reload, replacement and failure behavior. |
| D1–D3 | Keep shared renderer composition and selection contracts. |

### Other executable lists

| IDs | Disposition |
|---|---|
| Event S1–S7 | Keep fail-closed host, cohorts, anchors, rerender, server support and case selection; retain the recorded standalone/global-control retirements. |
| Event S8 | Keep keyboard/readout; add the shared-renderer speech repair. |
| Event S9–S14 | Keep render matrix, withheld support, alignment, downgrade/spread, header and containment. |
| Day S1–S3 | Keep cold direct route, obsolete-read cancellation and week/month labels. |
| Plan S1–S4 | Keep exact first match, divergent pending, empty staged state and edit-then-revert behavior. |
| Verify S1–S4 | Keep selected-record control and dismissal behavior. |
| Verify S5–S6 | Keep shared chart hover/readout and restoration. |
| Verify S7 | Deferred to separate responsive/mobile acceptance; not retired. |
| Verify S8 readiness | Keep backend-owned readiness and action availability, generalized under HV2-22–HV2-24. |
| Verify S8 session Keep | Retire under ADR 340 only; preserve Revert-to-Plan and add the ADR 348 durable finish. |

### Sanctions — no broader retirement permitted

Each line is the operator ruling that sanctions its retirement. None of them
originates in this manifest.

- Navigation: Connor Griffin, 2026-09-08, the September 8 direction change recorded in openspec/changes/harmonic-v2/design.md: "v2 ships three destinations: Diagnose, Changes and Day. Overview and Explore collapse into Diagnose carrying the shipped v1 rail as-is". ADR 397 records the amendment.
- Theme chooser/storage: Connor Griffin · 2026-09-01 · **"light theme retired by operator decision."**
- Occurrence modal/hash route: Connor Griffin · 2026-08-18 · **"the dead occurrenceModal hash machinery goes with them."**
- P20: Connor Griffin · 2026-08-25 · **"it just keeps my selector. The selection is a slicing method that lets me then dig into findings. Those findings will show up as dots on the chart anyway that I can then trace into."**
- P21: Connor Griffin · 2026-08-19 · **"Occurrence selection should not change the window. The window is a filter view in order to get to selectable occurrences. Having selectable occurrences then retrace the window would be tautological."**
- Old horizontal roster keys: Connor Griffin · 2026-08-23 · **"the roster is drawn vertically; one key model per list."**
- P27: Connor Griffin · 2026-08-23 · **"#55 removed installSegKeys; the shipped Align control is two ordinary Tab stops".**
- Occurrence dots: Connor Griffin · 2026-08-27 · **"these dots mean nothing, just take them off the glucose chart. User can get to them from the findings panel."**
- Meal glyphs: Connor Griffin · 2026-08-27 · **"Please also remove meal markers from the glucose chart."**
- P35/P49 old nested level: Connor Griffin · 2026-08-19 · **"I don't find the content of the drill-down view particularly useful. So, I think we could just simply have the if there's a current specific detail that needs to show, I think it should just mutate the standing screen."**
- P44/P48/P52: Connor Griffin · 2026-08-19 · **"Decided by Connor Griffin in a ruling session on 2026-08-19."** This sanctions only the ledger's named mechanics.
- Global Event-charts filter/control: Connor Griffin · 2026-08-25 · **"Rewrite or retire every replay story and browser-test contract that still drives the retired 'Event charts' root filter and the global 'By event' control."**
- ADR 215 old seats: 2026-08-26 · **"A pin orders the dock; it is not membership of a position."**
- S113: ADR 215 · **"The dock is the whole ordered set, spotlight included."**
- S110 duplicate chip: Connor Griffin · 2026-08-26 · **"The ring and the raised rail mark the drilled tile. The chip was noise."**
- S127 old dock restoration: Connor Griffin · 2026-09-04 — direct All Charts, selection-preserving Close/Escape, Spotlight-specific Expand.
- Trial session-only Keep: ADR 340 records Connor's 2026-09-04 **"Sure."** after the proposal stated that Keep saved nothing and Revert-to-Plan should remain.
- Pattern Focus elapsed-day readiness: ADR 391 — Focus readiness is opportunity-gated · 2026-09-08. This sanctions only the replacement of the retired elapsed-day admission wording with the backend-owned pattern opportunity gate.
- Pattern correction-cluster readiness: ADR 395 — Two Patterns count what the reader sees · 2026-09-09. This amends HV2-24 so every event Pattern is gated by 12 qualifying meals or lows; correction clusters remain evidence for the Correction stacking finding, not a Pattern Focus readiness unit.

**No sanction retires dark material, clock boundary drawing, chart retention,
Diagnose's Findings/evidence responsibilities, Revert-to-Plan, durable conclusions, or precise
Day return.** A build that drops one of those is violating this lock, not
honoring a ruling.

## Built-app acceptance matrix

Finite, and owed to the build. It tests readiness display and action
permission, never calibration; it selects no Basal, Correction factor,
whole-profile or Focus threshold.

| Acceptance case | Positive workflow | Required negative cases | Dependency |
|---|---|---|---|
| Shell/package | Start the installed Python package; authenticate; open `/` and `/v2/`; navigate all three v2 destinations: Diagnose, Changes and Day. | Missing asset fails loudly; invalid auth exposes no protected content; v1 routes/assets remain intact; no Node/CDN dependency. | Final asset/route protocol |
| Desktop fidelity | Render the same labeled synthetic bytes in the selected prototype and the built app at 1280×720 and 1440×900. | No root scroll/overflow; exact shell tracks, reading-pane width, divider, role colors and type; every eye term receives a named judgment. | This lock and its comparator |
| Changes/guidance | Load priority, active Plan/Trial/Focus and quiet guidance states. | Failed/unavailable cannot become quiet; the frontend cannot choose a competing action or infer admission. | #387 admission envelope |
| Diagnose/window | Draw, resize, slide, cross midnight, clear, restore route, select roster/case and open All Charts. | Click without movement does nothing; occurrence selection does not change the window; global Align and Event-charts controls stay absent. | Existing APIs/renderers |
| P19b replacement | Select a new window, hold its request pending, fail it, retry, then settle it. | No former projection counts, rows, recommendation, support or staging masquerades as the new result. | Existing findings protocol |
| Selected I:C replacement | Open a coherent selected current-setting I:C case (`ic-lower`), request a replacement, fail and retry. | Preserve only the coherent case/canvas pair; never mix generations or expose staging. | Existing findings protocol |
| Setting evidence | Open Basal, Correction factor and Carb ratio; inspect evidence and all 48 basal slots; open a night in Day and return. | Held/thin/missing rows keep values but cannot stage unless the backend permits; no frontend support/readiness derivation. | Existing producers |
| Plan | Stage one family, inspect complete schedule/capacity, save draft, record decision, reconcile pending→mismatch/match, withdraw where allowed. | Save/apply failure records no success; stale revision conflicts; empty plan; divergent first plan; edit-revert manufactures no history. | #387 lifecycle protocol |
| Trial/readiness | Open an accumulating Trial; inspect live chart/value/direction; render its type-specific unit/count/criterion; finish when permitted; reload the record. | Unavailable comparison; count met but inference unclear; >14-day accumulation; inconclusive finish; immature finish refused; no session Keep; Revert uses the supplied Plan route only. | #387 readiness fields/permissions |
| Trial history | Reopen the original and the saved ending; request retained/current reassessment. | Reassessment never replaces the original; legacy missing facts remain unavailable; finishing the latest does not promote an older candidate. | #387 persistence/comparison |
| Focus | Start an eligible Focus; inspect opportunities, adherence and outcomes; end manually; reload. | Zero opportunities ≠ perfect adherence; missing measurement ≠ observed zero; a favorable outcome is not required to end; an unavailable pin gives no action. | #387 readiness/admission |
| Focus preemption | Start a Focus, introduce a genuine later Trial and reconcile. | Focus becomes `trial_preempted`, remains history, never resumes; a future attempt receives a new identity. | #387 sequential-change support |
| Sequential settings | Finish the latest Trial, retain history, ingest/reconcile a genuinely later change. | An older peer/candidate is not promoted; the same change observed later does not create another Trial; a conflicting/racing write yields a winner or an explicit conflict. | #387 lifecycle |
| Day | Open directly; navigate a recorded week/month; select the Episode Log; enter from a setting, an event, a Focus and a question utility; return. | Direct entry invents no subject; a rapid obsolete read cannot win; full Day is not clipped to the Diagnose glucose window; the exact focus target restores. | Existing Day plus v2 route state |
| Utilities | Open Guide/Glossary, Log carbs, Carb questions, app settings and Pump settings; save/retry and return. | Invalid/save failure stays explicit; Undo/remove work; password reveal/clear follows the existing contract; Escape retains the established draft and restores the launcher. | Existing authenticated APIs |
| Loading/failure | Exercise first load, same-subject refresh, new-window replacement, stale dated result, write failure and retry. | No blank success, false saved state, mixed generations or quiet inference; each state owns the correct retained/withdrawn content. | Final revision/error envelope |
| Accessibility | Traverse every destination, roster, cohort, slot, night, chart cursor, Day and utility by keyboard. | Visible focus, correct pressed/expanded state, focus restoration, reduced-motion path, color redundancy, formatted fractional-hour speech. | Shared-renderer repair |
| Cleanup | Repeatedly enter and leave Diagnose, Day, full-screen charts and utilities while requests are pending. | No duplicate handler, observer, chart instance, stale callback, hidden focus target or pagehide leak. | Final mount architecture |

## Owed before production implementation

The existing frozen v2 behavior ledger and replay live on stopped #389 and are
absent here. #389 must amend their affected entries before dependent production
implementation resumes, retaining these finite story groups:

1. `/v2/` boot, auth, persistent chrome, default Diagnose and all three destination transitions.
2. Desktop geometry and cross-destination no-reflow at both target sizes.
3. Clock draw/resize/slide/wrap, case selection and All Charts without the retired global controls.
4. Guidance, Set aside/Restore and eligible meaningful return through the durable APIs.
5. P19b new-window pending/failed/sliced replacement, the selected-I:C coherent-pair exception, and the same-subject dated stale refresh.
6. All three setting evidence families, 48-slot basal navigation and exact night-to-Day return.
7. Complete Plan and Trial lifecycle: draft, decision, failure/retry, reconciliation, withdrawal, readiness, Revert, durable finish and reload.
8. Type-specific readiness with different units/counts, unavailable comparisons, live pre-ready values, more than fourteen days and an inconclusive ending.
9. Focus selection, pin failure/retry, opportunities, separate adherence/outcomes, manual ending, preemption and reload.
10. Original/retained/current history, legacy unavailable facts and a genuine sequential change.
11. Direct and contextual Day, utility-to-Day return, rapid navigation and stale response suppression.
12. Guide, Glossary, carb/question logging, settings/credentials, Escape and return focus.
13. Shared chart hover, keyboard cursor, the accessible speech repair, full-screen containment and event/basal cleanup.
14. Python-only packaged assets, authentication and simultaneous v1/v2 availability.
15. Permanent absence assertions for every sanctioned retirement, printing its sanction and checking its premise.

Every replay function cites its `LOCK:harmonic-v2-desktop:<term>` tags, executes
against the built Python-served app, fails closed when a dependency, asset or
story is absent, and is demonstrated failing once for the intended reason.

Also owed to the build, in its proper stage: the complete acceptance fixture
matrix above; verbatim-first port of the prototype's CSS/JS with every adapted
line range documented; preserved selectors or a sanctioned resettlement;
same-byte prototype/built-app pairs for every eye term and required state at
both target sizes; a fidelity ledger with exactly one status/evidence row per
`HV2-*` term; and proof that each gate can fail for its intended reason. Human
acceptance of the complete first usable release follows, under tasks 3.4 and 3.5.
The verbatim-first port and same-byte pairing obligations have an exception for ADR 397's
enumerated destination/copy amendments. #389 documents every adapted range
and supplies updated evidence; no superseded navigation requirement survives
through the port instruction.

## What this lock does not do

It does not implement anything, does not prove built-app fidelity, and does not
carry release acceptance. It admits no mobile design, no root-route cutover and
no v1 retirement — those remain separate later gates under tasks 4.1–4.3. It
opens no new concept, navigation or naming round, and it reopens neither the
selected desktop arrangement nor the source-owned readiness rules. Watch 14-day
maturity and 28-day expiry remain accepted lifecycle metadata and are not
relitigated here.
