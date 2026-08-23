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

- **The ticket's stated cause is WRONG, and the first draft of this ledger repeated
  it.** Corrected by the plan-review panel and re-verified in git. The issue blames
  `923722e` (#68) for adding an `auto` track "for an optional `railLead`". What
  actually happened:

  - `923722e` (#68, 2026-08-20) added the `auto` track **and, in the same commit, a
    third instrument to occupy it**: a global "Sift" chip group, `id="chips-group"`.
    `git show 923722e:frontend/diagnose-workstation.js | sed -n '61,79p'` shows
    WINDOW, then `chips-group`, then `align-group`. Three instruments, three tracks —
    ALIGN was the third child and sat in the `var(--side, 430px)` track, at the
    inspector's x. **#68 kept the ruling, it did not break it.**
  - `cd756b2` (#86, 2026-08-21) **removed** the Sift instrument and left the
    three-track list behind. `git log --oneline -S'chips-group' --
    frontend/diagnose-workstation.js` returns exactly `cd756b2` and `923722e`;
    `git show cd756b2 -- frontend/diagnose-workstation.css` touches no `.instruments`
    rule. No `chips-group` or `seg-chips` survives in the stylesheet or the module
    today — #86 cleaned everything except the track.
  - So **`cd756b2` (#86, 2026-08-21) is the regression commit**, and the drift window
    is two days, not months.

  `railLead` is a red herring. It is genuinely dead — its only call site was deleted
  by `1d06530` (#41/#55), an ancestor of `923722e` — but it is not what the middle
  track was for. Do not write the `railLead` story into the stylesheet or the ledger.
  `inline`

- **The `auto` track is dead code**, and that is the charter clause that licenses
  removing it. It is **not** a speculative seam under "build the seam when the second
  caller is real, not before" — it had a real, shipped caller for one day. Removing it
  restores the two-column form the ruling, the ledger amendment, the CSS comment at
  `frontend/diagnose-workstation.css:113-131`, and `verify-workstation.css:101` all
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

Between #68 and #86 the same three-track list held ALIGN in the third (`--side`)
track, so the ruling held structurally throughout that window; the defect appears only
once the third instrument is gone.

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

### The pinned assertion, spiked

Executed during triage against the running app at the replay's own defaults
(1440x900, dark), under the exact drive and registry state the order pins
(`state: 'typical'`, `openWholeDay` then `clickQueueRow('Over-treated low')` — the S40
drive; S40 is itself registered `'typical'` at `replay.mjs:3378`):

    BASE : alignShown=true geometry={"alignLeft":816,"inspectorLeft":1010}
           -> throws: S73 ALIGN starts at the inspector edge (ALIGN 816, inspector 1010): expected 1010, got 816
    FIXED: alignShown=true geometry={"alignLeft":1010,"inspectorLeft":1010}
           -> PASS

An earlier spike used `state: 'drawn'` with a direct row click; the panel objected that
this pinned a combination nothing had measured, and it was re-run as above.

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

Measured for orientation: the full replay leg at `7cddfe9` (this branch's own branch
point, before either sibling) reports `app: 89 of 89 stories passed`, exit 0. The
integration base should therefore measure 90 and this ticket should take it to 91 —
predictions, not inputs.

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
