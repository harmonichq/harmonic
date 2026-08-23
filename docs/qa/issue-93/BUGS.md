# Issue 93 accepted bug inventory

Diagnose-only inventory of bugs reproduced in live interaction. Entries are
grouped by UI section and sorted by severity (P0 highest). All accepted reports
are P2: the surface remains usable, but a meaningful reading or interaction
task is impaired. No fixes, remediation, designs, implementation suggestions,
or child issues are proposed here.

## Diagnose header — Align

### P2 — Pointer-selecting Align has no effect

- **Fingerprint:** `initial-diagnose-align-affordance-inert`
- **Source:** [`findings-queue.md`](findings-queue.md#1-initial-diagnose-align-control)
- **Interaction path:** Open a fresh direct Diagnose view and pointer-select the visible Align affordance; repeat from a second fresh open.
- **Observed:** Align looks interactive, but offers no selectable option and pointer selection produces no visible state change.
- **Expected:** An interactive-looking Align control accepts selection and shows the selected alignment; if no choice exists, it is not presented as interactive.
- **Reproducibility:** Reproduced on two independent direct Diagnose opens.
- **Severity rationale:** P2 because this secondary chart-orientation control is inert while the primary Findings queue remains usable.

## Diagnose finding detail — Align keyboard traversal

### P2 — Keyboard traversal skips the visible Align choices

- **Fingerprint:** `kbd-diagnose-detail-align-skipped`
- **Source:** [`keyboard.md`](keyboard.md#kbd-93-04--align-choices-are-skipped-by-keyboard-traversal-in-finding-detail)
- **Interaction path:** Open a finding detail, tab forward through its controls, then Shift+Tab backward through the detail and chart controls; repeat in a second fresh session.
- **Observed:** View links, verdict choices, Occurrences, breadcrumbs, and trace controls receive focus, but the visible By clock and By event Align choices do not.
- **Expected:** The visible Align segmented control participates in keyboard traversal, exposes a focused choice, and supports activation.
- **Reproducibility:** Reproduced twice across separate detail sessions and in both traversal directions.
- **Severity rationale:** P2 because the detail remains reachable, but keyboard users cannot operate a visible chart-alignment target.

## Diagnose Findings queue — Watching/history

### P2 — Historical Carb-ratio rows appear as peers in the current queue

- **Fingerprint:** `diagnose-findings-current-queue-mixes-past-carb-ratio-history`
- **Source:** [`24h-reaudit.md`](24h-reaudit.md#24h-93-01--historical-carb-ratio-rows-are-peers-in-the-current-findings-queue)
- **Interaction path:** Select the `24 h` window, inspect the ordinary Findings queue without selecting a history mode, open one historical Carb-ratio row, return to Findings, and open a second historical Carb-ratio row.
- **Observed:** Historical Carb-ratio entries appear as ordinary selectable queue rows beside current setting and habit findings. The individual rows disclose Watching/Past-setting status, but no separate historical-results boundary precedes them.
- **Expected:** Retired Carb-ratio evidence is unmistakably separate from the active findings being reviewed for the current setting context.
- **Reproducibility:** Reproduced with two separately rendered historical Carb-ratio case files in the explicitly selected 24-hour queue.
- **Severity rationale:** P2 because the decision-review queue materially risks mixing retired setting evidence into the reading of active findings, although the individual rows disclose their historical status.

## Diagnose event case file — By-event response comparison

### P2 — Narrow By-event chart labels and lines overlap or clip

- **Fingerprint:** `diagnose.event-comparison.narrow-cohort-overlap`
- **Source:** [`graphs-align.md`](graphs-align.md#11-narrow-viewport-pooled-and-by-event-charts)
- **Interaction path:** At a narrow viewport, open a meal-related event case file, select By event, and repeat in a separate event case file.
- **Observed:** The chart container and page fit the viewport, but cohort names and evidence-state labels overlap or clip against the plotted lines in both By-event charts.
- **Expected:** The narrow viewport keeps cohort labels, evidence states, and plotted evidence distinguishable enough for response comparison.
- **Reproducibility:** Reproduced independently in two event case files at the same narrow viewport.
- **Severity rationale:** P2 because the chart is present and navigable, but the primary comparison task is materially impaired on a narrow screen.

### P2 — Cohort evidence-state labels are opaque

- **Fingerprint:** `diagnose.event-comparison.cohort-state-opaque`
- **Source:** [`graphs-align.md`](graphs-align.md#f1--event-cohort-evidence-states-are-not-self-explanatory)
- **Interaction path:** Open meal-, correction-, and separate meal-related event findings, select By event, and read the legend, lower key, and hover readout.
- **Observed:** Cohort rows such as “claimed by another factor” and “not comparable” appear with “limited,” “withheld,” and “withheld points,” but the chart does not explain what the user can conclude from either vocabulary or how the aggregate and point-level states relate.
- **Expected:** The chart’s own labels explain whether each cohort line is usable for the comparison and how its evidence state affects interpretation.
- **Reproducibility:** Reproduced across separate event case files and their corresponding keys.
- **Severity rationale:** P2 because the chart remains operable, but evidence comparison cannot be read reliably without interpretation not supplied by the surface.

## Diagnose finding drill-in — focus management

### P2 — Opening a finding leaves focus on the document body

- **Fingerprint:** `kbd-diagnose-finding-open-body-focus`
- **Source:** [`keyboard.md`](keyboard.md#kbd-93-03--finding-drill-resets-focus-to-the-document-body)
- **Interaction path:** Tab through chart trace controls to the first finding row and press Enter; repeat the same path in a fresh browser session.
- **Observed:** Finding detail opens, but the active element is `BODY`; focus is not placed on the detail breadcrumb, heading, Align group, evidence control, or first trace control.
- **Expected:** Opening a finding places keyboard focus on the opened detail surface at its first meaningful control.
- **Reproducibility:** Reproduced twice in separate browser sessions.
- **Severity rationale:** P2 because the visual transition succeeds, but keyboard users lose a reliable starting point in the newly displayed evidence.

## Diagnose finding case file — Occurrences keyboard navigation

### P2 — A vertical occurrence roster advances with Left/Right instead of Up/Down

- **Fingerprint:** `diagnose-occurrence-roster-left-right-overrides-vertical-traversal`
- **Source:** [`24h-reaudit.md`](24h-reaudit.md#24h-93-02--selected-occurrence-navigation-uses-leftright-despite-a-vertical-occurrence-roster)
- **Interaction path:** Select the `24 h` window, open a multi-row high-pattern case file, focus and open the first occurrence, then try ArrowDown and ArrowRight; repeat in a separate multi-row meal-pattern case file.
- **Observed:** ArrowDown leaves the selected occurrence unchanged, while ArrowRight advances to the next vertically displayed occurrence. The same direction model occurs in both case-file varieties.
- **Expected:** Keyboard traversal follows the occurrence roster's visible vertical order, or otherwise presents a clearly discoverable navigation model consistent with the rendered list.
- **Reproducibility:** Reproduced in two populated multi-row case files after explicitly selecting the 24-hour window.
- **Severity rationale:** P2 because keyboard readers can open the roster but cannot traverse its visible order using the expected spatial keys.

## Diagnose basal-slot case file — evidence copy

### P2 — Retired “clean nights” wording remains in the drill-down

- **Fingerprint:** A Diagnose basal-slot case file contains the literal phrase `clean nights` in evidence or safety copy.
- **Source:** [`drilldown-trace.md`](drilldown-trace.md#bug-93-dt-001--retired-clean-nights-wording-remains-in-diagnose-drill-down)
- **Interaction path:** Select an insufficient-evidence basal slot, read its case file, return to the queue, select a no-data basal slot, and read that case file; repeat both selections in a fresh Diagnose pass.
- **Observed:** Both case files use “clean nights,” including the empty state.
- **Expected:** The surface uses “nights of steady data”; an empty state says that no nights of steady data are available without calling absent evidence clean.
- **Reproducibility:** Reproduced twice across both slot states during the fresh restored pass.
- **Severity rationale:** P2 because the evidence state is still safe and recoverable, but the vocabulary conflicts with the locked user-facing terminology and can misstate an empty or thin state.

## Tested hypotheses not reproduced

- **Meal-bolus filtering:** The finding appeared only in eligible windows, disappeared in an ineligible overnight window, and returned when the eligible window was restored; event charts did not retain a stale copy. Source: [`findings-queue.md`](findings-queue.md#2-meal-bolus-fell-short-and-active-eventclock-window-filtering).
- **Direct Diagnose link initialization:** A settled fresh context reached the populated workstation through both direct-link and in-app navigation; the earlier short-wait failure was discarded as a route/cold-load artifact. Source: [`app-snob.md`](app-snob.md#discarded-route-candidate).

The targeted 24-hour re-audit supersedes the original historical Carb-ratio and single-row occurrence-list conclusions. Both are accepted above as reproduced P2 bugs. Source: [`24h-reaudit.md`](24h-reaudit.md).

## Discarded non-product observations

- An evidence-loading failure was traced to an invalid harness companion key and is excluded from the bug count. Source: [`findings-queue.md`](findings-queue.md#discarded-non-product-observation).
- The short fixed-wait direct-link failure was a cold-load/route artifact and is excluded from the bug count. Source: [`app-snob.md`](app-snob.md#discarded-route-candidate).
