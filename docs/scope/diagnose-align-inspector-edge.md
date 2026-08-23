# Scope ledger — #106 Diagnose header: ALIGN no longer sits above the inspector edge

Split out of #95's triage. #95's own order names this regression in its Boundaries
and reserves `.instruments`' grid track list, `#align-group`'s padding rule, and
ALIGN's position for this ticket.

## Decisions

- **Scope verdict: nothing genuinely uncertain.** The visual outcome is already
  settled by a sanctioned owner ruling (Connor Griffin, 2026-08-19, recorded at
  `mockups/finding-evidence-routing.behavior.md:1254-1260`, decision
  harmonichq/harmonic#41). This ticket restores a contract, it does not take a new
  visual decision, so no `/ui-craft lock` is owed. `inline`

- **Surface lifecycle: `revise`.** UI Craft router
  (`routeSurface({embodiment:'shipped', runnability:'runnable', declaration:'complete',
  dataSource:'manufactured'})`) returned `{"mode":"revise","reason":"safe manufactured
  data source declared"}`. `inline`

- **The ticket's stated cause is right about the mechanism and wrong about the
  motive.** `923722e` (#68) did widen `.instruments` from
  `minmax(0, 1fr) var(--side, 430px)` to `minmax(0, 1fr) auto var(--side, 430px)`
  (verified by `git log -L 133,135:frontend/diagnose-workstation.css`). But
  `railLead`'s only call site — in `frontend/diagnose-event-comparison.js` — was
  **deleted by `1d06530` (#41/#55)**, which is an ancestor of `923722e`. So when #68
  added the `auto` track, `railLead` already had zero callers, and still has zero
  today (`grep -rn railLead` returns only the parameter, its comment, its two-line
  body in `frontend/diagnose-workstation.js:2688-2690`, and the S71 staging-seam
  string in the replay). The `auto` track has never carried anything on any shipped
  path. #68's own scope ledger (`docs/scope/diagnose-excursion-filter.md`) records no
  rationale for the track at all. `inline`

- **The `auto` track is a speculative seam under the charter** ("build the seam when
  the second caller is real, not before"). Removing it restores the two-column form
  the ruling, the ledger amendment, the CSS comment at
  `frontend/diagnose-workstation.css:120-131`, and `verify-workstation.css:101` all
  already describe. `inline`

- **Mechanism: restore the two-track list.** Carried to the order's *Open decisions*
  with its two rejected alternatives, since it is a real choice with a real cost
  (see below). `inline`

### Live reproduction (measured, not inferred)

Base `7cddfe9` (this branch's branch point), safe-start server
`uv run harmonic serve --no-fetch --port 8781 --db mockups/revise-e2e.synthetic/harmonic.sqlite`
(port 8765 was held by an unrelated stray process, PID 37842), driven through the
replay's own exported `openApp`, light theme.

**ALIGN shown** — `state: 'drawn'`, root row "Over-treated low":

| Viewport | `.instruments` tracks | `#align-group` left → right | `.panes > .pane` lefts |
|---|---|---|---|
| 1280x720 | `655.797px 194.203px 430px` | 655.8 → 850 | `[0, 850]` |
| 1440x900 | `815.797px 194.203px 430px` | 815.8 → 1010 | `[0, 1010]` |
| 1024x900 | `399.797px 194.203px 430px` | 399.8 → 594 | `[0, 594]` |

ALIGN is **right-aligned against** the inspector edge instead of starting at it. The
I:C history entry (`state: 'typical', history: true`, row "Carb ratio Morning. Past
setting.") measures identically. The ticket reports left 657; the measured value is
655.8 — record the measured one.

**With the two-track list restored** (`minmax(0, 1fr) var(--side, 430px)`), same
states and viewports:

| Viewport | tracks | `#align-group` left | `.panes > .pane` lefts |
|---|---|---|---|
| 1280x720 | `850px 430px` | 850 | `[0, 850]` |
| 1440x900 | `1010px 430px` | 1010 | `[0, 1010]` |
| 1024x900 | `594px 430px` | 594 | `[0, 594]` |

`#align-group`'s left is byte-equal to the inspector pane's left at every width, and
1010 at 1440x900 reproduces the exact number the 2026-08-19 amendment cites. The pane
boundary itself never moves, before or after.

**Side effect, real and visible.** At 1024x900 on the case-file path the `auto` track
was squeezing column 1 to 399.8px and clipping the WINDOW group (`.seg` carries
`overflow: hidden`): `#seg-window`'s right edge measured 399.8 before and 577.8 after.
Restoring the two-track list unclips WINDOW at that width. This is a second rendered
change and is owed to the ledger amendment and the evidence README — it is not
ALIGN's position.

**Narrow rail unaffected.** At 390x844 the `@media (max-width: 760px)` block
(`frontend/diagnose-workstation.css:884-893`) makes `.instruments` `display: flex`, so
the track list is inert there. Measured `#align-group` left is unchanged by the fix
(576.8 on the case-file path, 402.8 on I:C history), and `.panes` is single-column.

**With ALIGN hidden** (root frame) the fix changes tracks from
`790.078px 59.9219px 430px` to `850px 430px` at 1280 and leaves the pane lefts at
`[0, 850]`.

### Why no gate caught this

There is no assertion on ALIGN's geometry, or on `.instruments`' track list, anywhere
in `frontend/diagnose-workstation-behavior.replay.mjs`,
`frontend/diagnose-workstation.browser.test.mjs`, or `frontend/**/*.test.js` — grep
for `getBoundingClientRect` / `gridTemplateColumns` against `#align-group`,
`#seg-align` and `.instruments` returns nothing. The 2026-08-19 ruling was asserted
once, by hand, in prose, and never given an executable home. That is the gap this
ticket owes, not just the stylesheet line.

### Interaction with #95 and #96

Both amend the same frozen ledger and the same replay; this ticket is built on a
shared integration branch **after** both.

- **#95** adds `.instrument[hidden] { display: none; }` and replay story **S72**, and
  changes the replay's `alignShown` reader to rendered truth. Its consequence for this
  ticket: once #95 lands, a hidden `#align-group` generates **no box at all**, so
  ALIGN's position can only be measured in a state where ALIGN is *shown*. Any
  reproduction or assertion written against the root frame will read `null`, not a
  regression.
- **#95** also adds a "SUPERSEDED in part by #95, 2026-08-23" line at the head of the
  2026-08-19 amendment, for the hidden-measurement half of that paragraph. This ticket
  amends the *other* half — the position claim — and must not disturb #95's line.
- **#96** adds no replay story, so it does not move the count.

Story counts are therefore measured on the integration branch at execution time, never
carried over from #95's order.

### Risk contract

- **Must prevent:** moving the `.panes` pane boundary or the inspector's width;
  hiding or restyling ALIGN anywhere ADR 31 part 3 shows it; regressing the narrow
  (<=760px) rail; any change to insulin guidance, stored data, or the analysis path
  (none is reachable from a stylesheet track list); re-freezing the ledger against a
  base that was already red.
- **Must recover:** nothing. A static grid track list holds no durable state.
- **Accepted failure:** the ledger amendment or the new geometry story fails against
  the built app; the build stops and is fixed before the pull request opens.
- **Unsupported:** restoring or re-plumbing `railLead`; restyling the instrument rail;
  changing ALIGN's modes, labels or keyboard behaviour (#96); the event-comparison or
  I:C history canvases; the `@media (max-width: 760px)` rail's own layout.
- **Evidence owed:** one replay story that fails on the integration base for the right
  reason (ALIGN's left not equal to the inspector pane's left, in a state where ALIGN
  is shown) and passes after; every standing story still green; a before/after render
  pair at the widths where the two-pane split exists.

Why: advisory-app chrome, one grid track list. The credible harms are a pane-boundary
regression and a contract that stays unenforceable.

Disposition: `inline`

## Open questions

- One, carried to the order's *Open decisions*: which of three rendered-identical
  mechanisms to take. Not blocking — the recommended option is charter-grounded and
  measured.

## Spawned tasks

- None. Filing further issues is outside this session's authority.

## Plan review

- Recorded below once the panel returns.
