# By-event chart at a narrow viewport

Issue harmonichq/harmonic#98. Scope ledger opened at triage, 2026-08-23.

## Decisions

- Classify #98 as a bounded UI code change on a shipped surface (`revise`). Reproduced headless at 390×844 through the event-comparison replay's own app opener against the synthetic capture: the cohort legend (`#ec-chart-key`) collapses to two 155.5px grid tracks, cohort names wrap with their support label orphaned onto the next line, the mono detail breaks mid-phrase, and the legend mark is vertically centred on a three-line item instead of sitting on the name; the in-canvas `target 70–180` markArea label is painted `insideTopLeft`, where every cohort line enters the band. No horizontal overflow and no DOM clipping (`scrollWidth === clientWidth` everywhere), so this is a layout-legibility defect, not an overflow one. `inline`
- Fix the legend in `frontend/diagnose-event-comparison.css` only: one grid column below the app's existing mobile breakpoint (`(max-width: 430px)`, the `MOBILE_Q` the shell already uses), marks aligned to the first line (`align-items: start` with the mark offset to the name's line box), and the name-plus-support line kept whole. No JavaScript reflow, no viewport-conditional legend markup. `inline`
- Move the target-band label out of the line entry corridor. Default assumed at triage: `insideBottomLeft`, the one corner of the 70–180 band that stayed clear of every cohort line in all five synthetic states at both 390 and 1280 widths. Applied at every width (a single chart option, no viewport branch). `→ ADR`
- Regression evidence lives in the surface's own narrow replay story: S9 in `frontend/diagnose-event-comparison-behavior.replay.mjs` (the 390×844 leg) gains geometry assertions, and the support audit's `narrow-mixed-light` case is left as is. The frozen ledger `mockups/finding-evidence-routing.behavior.md` gets a dated revision amendment for S9, following the 2026-08-19 S9 amendment pattern. `inline`

### Risk contract

- **Must prevent:** a cohort losing its identity or support state in the legend at any width; a legend item overlapping another; the page acquiring horizontal overflow at 390px; any change to which series are drawn, their support boundaries, or the selected-trace behaviour the existing stories pin; secret or real-data exposure (none is reachable: all evidence is the committed synthetic capture).
- **Must recover:** none; static CSS and one chart option, no durable state.
- **Accepted failure:** a candidate layout fails the geometry assertions or the screenshot review; the build stops and the candidate is revised before the pull request.
- **Unsupported:** viewports narrower than 320px; redesigning the legend's copy (the evidence-state wording is issue #93's F1, a separate finding); changing the pooled (By clock) chart.
- **Evidence owed:** S9 geometry assertions that fail on the pre-change CSS and pass after (one-column legend at 390, every mark on its name's line, no pairwise legend-item overlap, name and support label on one line); light and dark screenshots of the five synthetic states at 390×844 and 1280×720 attached to the pull request; the nine-leg browser gate green.

Why: advisory dosing app, but this change cannot alter any number the model publishes; its credible harm is an unreadable comparison on a phone, which the fix is judged against directly.

Disposition: `inline`

## Open questions

- Target-band label position: `insideBottomLeft` at every width is the triage default; the alternative is a narrow-only relocation or hiding the label below 430px. Recorded for the coordinator; the order assumes the default.

## Spawned tasks

- None.
