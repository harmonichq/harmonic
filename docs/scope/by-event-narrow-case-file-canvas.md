# By-event case-file canvas at a narrow viewport

Issue harmonichq/harmonic#98. Scope ledger opened at triage, 2026-08-23.

> **Supersedes the first triage pass.** This ledger was first opened as
> `by-event-narrow-legend.md` and diagnosed #98 as a cohort-legend layout defect.
> That diagnosis was wrong and is retracted below with the measurements that
> refute it. The file was renamed rather than replaced so the correction stays
> visible.

## Decisions

- **Classify #98 as a bounded UI code change on a shipped surface (`revise`).**
  Reproduced headlessly at 390x844 against the committed synthetic fixtures, on
  the mount the reporter actually used — the Diagnose finding case file — driven
  through `openApp(browser, { appSource: 'fixture' })` from
  `frontend/diagnose-workstation-behavior.replay.mjs`, navigating 24 h → Filter →
  Event charts → first `#level .qrow` → ALIGN `By event`, the same path the
  passing test `#83 · Event charts opens By event` already walks
  (`frontend/diagnose-workstation.browser.test.mjs:493`). `openerProblems()`
  returned `[]`. `inline`

- **The defect is containment, not legend layout.** Measured on the case-file
  mount at 390x844: `#ec-chart` is 390x390 at y126–516 while `#ec-chart-key` is
  390x179 at y221.1–400.1 — the chart's box covers the legend's **entire**
  390x179 rectangle. `.ec-event-body` resolves to
  `grid-template-rows: 95.0781px 179px` with `scrollHeight` 390 against
  `clientHeight` 274 under `overflow: hidden`, so 116px of the chart is also cut
  off. The legend is `position: static`, `z-index: auto`, transparent
  background, so the ECharts canvas and the cohort text occupy the same pixels:
  cohort names and evidence states sit on the gridlines, the y-axis numbers and
  the target band. That is exactly the reported symptom. `inline`

- **Retract the legend-layout diagnosis.** The legend's own narrow layout is
  sound and is not what the reporter saw. Measured at 390x844 on both mounts:
  `grid-template-columns` is `155.5px 155.5px`, gap 15px, padding
  `6px 12px 8px 52px`, zero document overflow, zero legend scroll overflow, and
  **zero pairwise `.ec-key-item` overlap**. The standalone lens (`?view=meals`)
  at the same 390x844 renders chart-above-legend cleanly and legibly, with each
  cohort's `<em class="ec-support-label">` sitting on its name's last line
  ("Rule matched Supported", "Near rule Limited", "Rule did not match
  Supported") — not orphaned. Reworking the legend is therefore out of scope for
  #98. `inline`

- **Retract the target-band relocation.** The first pass proposed moving the
  `target 70–180` `markArea` label from `insideTopLeft`
  (`frontend/diagnose-event-comparison.js:532`) to `insideBottomLeft` at every
  width. With containment corrected the label reads clear of every plotted
  cohort line at 390x844, and it already reads clear on the standalone lens,
  which has correct containment today. A chart option applied at every width to
  fix a symptom that containment already resolves is unnecessary scope and a
  desktop regression risk. Leave line 532 alone. `inline`

- **Root cause, and why it shipped.** The narrow-width height path is written
  entirely against elements the case-file mount never creates. In
  `frontend/diagnose-event-comparison.css` under `@media (max-width: 760px)`,
  `.ec-panes { display: flex; flex-direction: column }` (:228) and
  `.ec-canvas { min-height: 500px }` (:235) are what absorb
  `.ec-chart { min-height: 390px }` (:236, raised from the 310px base at :84).
  But `createSurfaceMarkup` returns the bare body when a `headerHost` is passed
  (`frontend/diagnose-event-comparison.js:315`), and the case-file mount passes
  one (`frontend/diagnose-workstation.js:1920`), so neither `.ec-panes` nor
  `.ec-canvas` exists there. The chart's 390px minimum then overflows a
  ~274px canvas pane — at ≤760px `.panes` is
  `grid-template-rows: minmax(250px, 42%) minmax(0, 1fr)`
  (`frontend/diagnose-workstation.css:895`). That mount arrived with #72
  (`fdf6846`, "Share the Diagnose chart header across alignments"); the narrow
  height path was never extended to it, and no regression pins the case-file
  By-event canvas at a narrow viewport, which is why it shipped. `inline`

- **Fix shape: grow and scroll inside the canvas pane.** At ≤760px the
  case-file By-event surface takes its natural height — the chart at its narrow
  minimum, the legend below it — and scrolls within the canvas pane. This is the
  same "grow and scroll" contract the standalone lens already ships
  (`.ec-surface { height: auto; min-height: 100% }` at :221 plus
  `.cockpit-stage:has(.ec-surface) { overflow-y: auto }` at :215), localised to
  the pane because the workstation owns a fixed two-row `.panes` grid the stage
  cannot grow. Measured with the rule injected at runtime: chart/legend overlap
  falls to **0**, the chart keeps its 390px height, and `.ec-event-body` reports
  `scrollHeight` 562 against `clientHeight` 274 with `overflow-y: auto`, so
  nothing is lost. `→ ADR`

  Rejected alternatives, both measured at 390x844 on the case-file mount:
  - *Shrink the chart to fit.* `#ec-chart { min-height: 0 }` scoped to the mount
    removes the overlap and clips nothing, but collapses the chart to
    **390x95.1**. A 95px response-comparison chart defeats the task the ticket
    is about.
  - *Grow the canvas pane.* Reaching chart+legend = 569px without scrolling
    inside an 844px viewport requires editing `.panes` row sizing in
    `frontend/diagnose-workstation.css`, which the By-clock pooled chart and the
    Verify workstation both share, and starves the findings queue beneath it.
    Higher blast radius than the defect.

### Risk contract

- **Must prevent:** the By-event cohort legend and the plotted chart occupying
  the same pixels at any width; any legend item becoming unreachable at 390x844;
  the page acquiring horizontal overflow at 390px; any change to which series
  are drawn, their support boundaries, the cohort taxonomy, or the
  selected-trace behaviour the frozen stories pin; any change to the By-clock
  pooled chart or the Verify workstation; secret or real-data exposure (none is
  reachable — all evidence is committed synthetic fixtures served by the
  fixture opener).
- **Must recover:** none. Static CSS in one stylesheet; no durable state, no
  network, no persisted setting.
- **Accepted failure:** a candidate layout fails the new geometry assertions or
  the visual review; the build stops and the candidate is revised before the
  pull request opens.
- **Unsupported:** viewports narrower than 320px; the cohort legend's copy and
  evidence-state wording (that is #93's finding F1, a separate ticket); the
  pooled By-clock chart, which #93 section 11 explicitly recorded as showing no
  bug at this viewport; the pre-existing narrow-viewport WINDOW-preset
  reachability observation already recorded in
  `mockups/finding-evidence-routing.behavior.md` and ruled not-this-change's.
- **Evidence owed:** a browser assertion that fails on the pre-change CSS for
  the right reason and passes after — no intersection between `#ec-chart` and
  `#ec-chart-key` rectangles on the case-file mount at 390x844, every
  `.ec-key-item` reachable, and no horizontal page overflow; the existing nine
  browser-gate legs and the fast gate green; light and dark renders of the
  narrow case-file By-event state before and after, plus a 1440x900 pair proving
  the desktop layout is untouched.

Why: an advisory dosing app, but this change cannot alter any number the model
publishes. Its credible harm is an unreadable response comparison on a phone —
which is the defect itself, and the fix is judged directly against it.

Disposition: `inline` for the CSS and the regression; `→ ADR` for the
narrow-viewport containment contract.

### The spiked assertion

The acceptance predicate was written and executed during triage rather than
prosed, against the case-file mount at 390x844:

```js
const box = (s) => document.querySelector(s).getBoundingClientRect();
const c = box('#ec-chart'), k = box('#ec-chart-key');
const overlapW = Math.max(0, Math.min(c.right, k.right) - Math.max(c.left, k.left));
const overlapH = Math.max(0, Math.min(c.bottom, k.bottom) - Math.max(c.top, k.top));
// must be 0
const collision = overlapW * overlapH;
```

Measured: **69810** (390 x 179) on the unmodified stylesheet, **0** with the
grow-and-scroll rule injected. It therefore fails first, and for the right
reason.

### Verification baselines, measured live this session

The frozen ledger records `frontend/diagnose-workstation.browser.test.mjs` at
"13 pass"; that record is stale. Run on this branch at `9ae8172`:

- `node --test frontend/diagnose-workstation.browser.test.mjs` → **30 pass, 0
  fail**
- `node frontend/diagnose-event-comparison-behavior.replay.mjs` → **`13/13
  stories passed against app`**
- `node mockups/diagnose-event-comparison-support-audit.mjs` → **`PASS 7 issue
  #694 support renders against app`**

### Plan-review instrumentation

Two cold panels, no persona panel (ordinary plan: one CSS rule, one regression,
with code review as a downstream backstop).

- **Panel 1 — 11 blockers, all `authoring`, 0 `injected`.** Two independent cold
  reviewers converged on the same core defect: the first draft's root-cause
  narrative pointed at the wrong element. It claimed the narrow `.ec-surface`
  rules did not reach the case-file mount; in fact they do (`#align-canvas`
  carries class `ec-surface`), and what defeats them is
  `#align-canvas { min-height: 0 }` at `frontend/diagnose-workstation.css:287`
  winning on specificity, with `.ec-event-body`
  (`frontend/diagnose-event-comparison.css:56`) as the element that actually
  clips. A second reviewer independently found that the draft's proposed
  `:not(:has(.ec-canvas))` selector would also match the retired-I:C history
  canvas, which mounts ECharts directly on the same host
  (`frontend/diagnose-workstation.js:1894` →
  `frontend/diagnose-workstation-chart.js:411-419`) — a `height: auto` there
  collapses a live chart. Also found: an acceptance criterion that passes in the
  broken state, an unsatisfiable `git diff --stat` criterion, a five-vs-four
  miscount of the fast gate, and a verification set covering three of the nine
  browser legs the risk contract owes. The order was rewritten clean rather than
  patched.
- **Panel 2 — 1 blocker, 1 note, both `authoring`, 0 `injected`.** A fresh cold
  reviewer verified the rewritten order in a live browser across widths 320 to
  900, both themes, all four fixture case files, and with a Selected-trace
  legend item appended; confirmed a CSS-only fix suffices (the ResizeObserver at
  `frontend/diagnose-event-comparison.js:679` observes `#ec-chart`, whose box the
  fix does not change) and that hover readout, keyboard traversal and scrolling
  all survive the container becoming a scrollport. Its blocker: the order told
  the implementer to correct a "stale" figure at
  `mockups/finding-evidence-routing.behavior.md:1335`, which is not a live
  baseline but a dated measurement inside `## Revision — 2026-08-20, base
  8cc3c99`; editing it would falsify history in a ★ FROZEN record. Its note: the
  header count at `:12-14` has genuinely drifted, but its own provenance
  breakdown sums to 77 rather than 74 or 89, so reconciling it in place is
  archaeology this ticket does not own. Both discharged by making the ledger
  edit append-only.

Injected blockers stayed at zero across both rounds, so the rewrite-clean signal
never fired a second time.

## Open questions

- None blocking. The fix shape was settled by measurement rather than
  preference; the two rejected alternatives are priced above. The one judgment
  call carried to the coordinator is whether scrolling to reach the legend is
  acceptable narrow-viewport behaviour, versus a shorter chart that needs no
  scroll — recorded in the work order and defaulted to scroll, on the grounds
  that the standalone lens already behaves that way.

## Spawned tasks

- None. The legend copy finding (#93 F1) and the WINDOW-preset reachability
  observation are pre-existing and separately tracked.
