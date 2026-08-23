# Diagnose header: the initial ALIGN control renders while hidden

Issue #95. Fingerprint `initial-diagnose-align-affordance-inert`. From the #93
cold-QA sweep (P2).

## Decisions

- Classify #95 as a bounded UI code change on the shipped Diagnose workstation,
  `revise` lifecycle. `node scripts/route.mjs --embodiment shipped --runnability
  runnable --declaration complete --data-source manufactured` returns
  `{"mode":"revise","reason":"safe manufactured data source declared"}`. `inline`

- The ticket's "expected" is already settled and is **hide it**, not make it
  interactive. ADR 31 part 3
  (`openspec/changes/finding-evidence-routing/design.md:44-50`): the canvas gains
  exactly one `ALIGN` control, "present only where the canvas is showing a
  factor's events". The initial `#/diagnose` frame shows no factor's events, so
  ALIGN must not be presented there. No new decision is taken, so no new ADR is
  owed. `inline`

- Root cause is a cascade defect, not a logic defect. `paintAlign`
  (`frontend/diagnose-workstation.js:1842`) already sets
  `el('align-group').hidden = !mappedCase && !isHistory` correctly, and the
  markup ships the attribute (`frontend/diagnose-workstation.js:82`). But
  `frontend/diagnose-workstation.css:140` `.instrument { display: flex; }` is an
  author-origin declaration and outranks the user-agent `[hidden] { display:
  none }` regardless of specificity, and no author-origin `[hidden]` reset exists
  anywhere under `frontend/`. So the hidden group paints. `inline`

- Fix by the repo's own convention for hidden elements — an explicit
  `.instrument[hidden] { display: none; }` rule beside the `.instrument` base
  rule. Precedent: `.canvas-head[hidden]` (css:214), `.brace[hidden]` (css:295),
  `.readout[hidden]` (css:309), `.filter-menu[hidden]` (css:439),
  `.cockpit-utility-menu[hidden]` (`shell.css:319`), `.trial-pop[hidden]`
  (`verify-workstation.css:153`). No JavaScript change. `inline`

- Deepen the replay's reader so the gate can see this class of bug: `state()`
  reads `alignShown: !q('#align-group').hidden`
  (`frontend/diagnose-workstation-behavior.replay.mjs:99`) — the DOM property,
  which was `true`-for-hidden the whole time the surface was wrong. The same
  `state()` already carries a `rendered()` helper (line 73, used for
  `clockHead`), and the ledger's S33 entry already rules that this replay "reads
  computed display and layout presence ... never the DOM `hidden` property
  alone". Apply that existing rule to ALIGN. `inline`

- ALIGN's x-position regression is **out of scope and goes to its own ticket**.
  Separate, pre-existing, and traced to a different change. `→ issue`

### Live reproduction (measured, not inferred)

Against the declared safe start —
`uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`
— at 1280×720, light theme, on a fresh `#/diagnose`:

| Read | Before | With `.instrument[hidden] { display: none; }` |
|---|---|---|
| `#align-group` `hidden` attribute | present | present |
| computed `display` | `flex` | `none` |
| `getClientRects().length` | 1 | 0 |
| bounding box | 59 x 14 at (791, 52) | none |
| `#seg-align` buttons | 0 | 0 |
| `#seg-align` box | 6 x 6, 1px border, filled | not rendered |
| `.instruments` tracks | `790.8px 59.2px 430px` | `850px 0px 430px` |
| `.panes > .pane` lefts | `[0, 850]` | `[0, 850]` |

So the reader sees an `ALIGN` cap and an empty bordered pill with nothing in it,
and the inspector column boundary is unmoved by the fix.

On the I:C history level, with the same rule installed, `#align-group` loses the
attribute, computes `display: flex`, and `#seg-align` carries `By clock`
(`aria-pressed="true"`) and `By event` — the real control is untouched.

Sweep of every `[hidden]` element on the initial frame: 5 present, and
`#align-group` is the **only** one whose computed display is not `none`. The
defect is isolated, not a class.

### Out of scope — ALIGN's x-position since #68

`923722e` (#68) widened `.instruments` from
`grid-template-columns: minmax(0, 1fr) var(--side, 430px)` to
`minmax(0, 1fr) auto var(--side, 430px)` so an optional `railLead` instrument
(`frontend/diagnose-workstation.js:2688-2690`) could lead the rail. On the plain
Diagnose surface there is no `railLead`, so ALIGN falls into the new `auto`
middle track: measured shown, it occupies left 657 to right 850 while the
inspector pane starts at 850. The 2026-08-19 owner ruling and the ledger
amendment (`mockups/finding-evidence-routing.behavior.md:1254-1260`) and the CSS
comment (`diagnose-workstation.css:120-131`) all still describe the two-column
grid in which ALIGN started at the inspector's x. That is a separate regression
from #68 and is not #95's to fix.

What #95 *does* owe: that same ledger amendment closes by citing a measurement of
`#align-group.getBoundingClientRect().left` **taken while the group was hidden**.
After this fix a hidden `#align-group` has no box at all, so that sentence's
cited evidence becomes unreproducible. #95 amends that one claim and nothing else
in the paragraph.

### Risk contract

- **Must prevent:** hiding ALIGN anywhere ADR 31 part 3 shows it (behavioral case
  files, I:C history, event charts); any change to insulin guidance, stored data,
  or the analysis path (none is reachable from a stylesheet rule); a green gate
  that asserts the `hidden` property rather than what renders.
- **Must recover:** nothing. A static stylesheet rule holds no durable state.
- **Accepted failure:** the ledger amendment or the new replay story fails against
  the built app; the build stops and is fixed before the pull request opens.
- **Unsupported:** restyling the instrument rail, moving ALIGN, changing ALIGN's
  modes or keyboard behaviour, and the event-comparison or I:C history canvases.
- **Evidence owed:** one replay story that fails on the base commit for the right
  reason (ALIGN rendered on the initial frame) and passes after; every standing
  story still passing, re-frozen against the base commit as this ledger's own
  convention requires; the existing ALIGN stories (S32, S38, S40) still passing
  where ALIGN is meant to show.

Why: advisory-app chrome, one author-origin stylesheet rule. The credible harms
are a regression that hides a real control and a gate that cannot see the bug.

Disposition: `inline`

## Open questions

- None. ADR 31 part 3 settles the expected behaviour; repo precedent settles the
  form of the fix; the reproduction is measured.

## Spawned tasks

- Recommended issue (not filed — filing was outside this session's authority):
  "Diagnose instrument rail: ALIGN no longer sits above the inspector since #68".
  Evidence in *Out of scope* above.

## Plan review

- Pending; recorded below once the panel returns.
