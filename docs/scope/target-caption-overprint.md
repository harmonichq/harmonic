# Scope ledger — the target caption is overprinted by the window gates (#370)

Triage ledger for harmonichq/harmonic#370, a child of the #350 Diagnose QA
sweep. `/scope` was invoked and returned **nothing to scope**: the mechanism was
measured before drafting and every remaining point had a forced default, so no
specialist was routed. This file exists to carry triage's decisions and the
mandatory-review instrumentation that step 12 of the `triage` verb owes.

## Decisions

- **The issue's suspected source is refuted; the crosser is the DOM brace.**
  `inline` — recorded in full as ADR 370 in the change's `design.md`. The
  `markPoint` the issue names holds one datum at `["06:00", 296]`, above the
  axis maximum; the element that hides the `0` is `.brace .grip`, a 7×22px
  opaque DOM pill on an overlay at `z-index: 4` above the canvas. Evidence: live
  option dump and DOM geometry at five widths against the sweep's shared
  synthetic revise-e2e server, reproduced from module math by
  `target-caption-overprint.spike.mjs`.
- **The label moves; the brace does not.** `→ ADR` (ADR 370). Frozen
  behaviour-ledger rows P02/P16/P56 pin the grips and the brace's draw, so
  moving them needs an operator sanction; `paintBrace` is in a Vue component no
  node test loads, while the chart module is vue-free and already node-tested.
- **The escape is conditional, not an unconditional relocation.** `inline`
  (ADR 370). Keeps the shipped rendering identical at every width where the
  caption is already correct, and keeps the existing prose describing it as the
  band's top-left caption true.
- **The escape is vertical, not horizontal.** `inline` (ADR 370), adopted at
  review round 1. A horizontal slide has no landing site at two of the five
  evidence widths: at 390px with the ordinary daytime window `[480, 960]` the
  gates carve the plot into clear regions of 98.4 / 94.4 / 95.2px against a
  108.8px caption box, and at the 768px viewport (chart 399.6px) the largest
  region is 101.6px. The grip band
  is height-pinned by contrast — `gripTop = Math.min(plotTop + 22, …)` with
  `PLOT_TOP = 20` and a 22px grip, so its floor is never below chart-local y 64 —
  so dropping the caption's box top to y 64 or lower clears every grip
  unconditionally, at every width and every window.
- **The predicate stays horizontal; the cosmetic over-move is accepted.**
  `inline` (ADR 370). Adding the vertical overlap to the predicate would spare a
  caption that was never going to be struck (axis maximum 260) from dropping, at
  the price of reading an `el.clientHeight` the module has never read and no
  existing test stub supplies. Not worth it: both placements print the right
  number.
- **No behaviour-ledger amendment is owed.** `inline` (ADR 370). The frozen
  ledger carries no story for this caption; the fix restores the rule the module
  itself declares. Moving any stored story stops the work for an operator ruling.
- **Flat, not chunked.** `inline`. Two rubric traits fire — live run inside the
  ticket, and lifecycle-gated surface revision — which would ordinarily point at
  a slice, but every candidate piece sits far below the 120k chunk floor, and
  the floor overrides the trait count. The nearest reviewer-memory anchors
  **disagree** with a flat call for Diagnose chart revisions in general; they are
  recorded against revisions that moved a whole interaction contract plus its
  theme audit, evidence capture and full replay, where this order moves one
  label's anchor under a measured predicate. #370 is itself already a slice of
  the #350 sweep.
- **Review depth `Targeted`.** `inline`. No sensitivity-floor category is
  touched: no authentication, secrets, destructive operation, or
  organization-shared behaviour.

### Risk contract

- **Must prevent:** a target-range caption that renders a number other than the
  configured range — the defect itself. Any frontend re-derivation of a backend
  safety verdict. Real patient data in any fixture, test constant, comment or
  captured evidence.
- **Must recover:** nothing automatic. The change has no failure mode at
  runtime; a wrong placement is visible in the rendered evidence.
- **Accepted failure:** the caption may move as the selected window changes, and
  it clears the gate positions even in the block-selection state where the brace
  is hidden, because `renderCanvas` is not told whether the brace is drawn. It
  also drops on a dataset whose axis maximum already held it clear, because the
  predicate is horizontal only. And at the dropped position the brace's 1px
  `.edge` still crosses the glyphs: that hairline spans the full plot height and
  is escapable on neither axis without moving the brace, but it reads as linework
  rather than as a hidden digit, so it does not produce a wrong number.
- **Unsupported:** plot heights so short that the target band's floor rises above
  chart-local y 64 and the grip band spans the whole plot, leaving no clear
  single-line position inside the band; window shapes other than the two gates
  the brace draws.
- **Evidence owed:** a node test through `renderCanvas`'s public interface that
  fails first for the right reason and drives the daytime window `[480, 960]` at
  390 and 768 as well as `[0, 360]` at the reported boundary; the full six-command
  fast gate with its measured tails; and, run unsandboxed, before/after renders at
  390, 768, 900, 1100 and 1440 on both the Overnight preset and the daytime
  window, plus a pass of the frozen ledger's app replay. A Chromium launch
  failure is escalated for an unsandboxed run, never recorded as a result.

Why: the caption states a clinical range a reader may act on, and the harm is a
plausible wrong number rather than visibly broken output.
Disposition: copied unchanged into the posted work order.

## Open questions

None. `/scope` returned no route.

## Spawned tasks

None. Sibling ticket #366 (the window label parked off the plot) was filed by the
sweep and is triaged separately; it touches the same file's `markPoint` and is
not a dependency of this order.

## Mandatory review rounds

| Round | Blockers | `authoring` | `injected` | Disposition |
|---|---|---|---|---|
| 1 | 2 | 2 | 0 | both adopted |

Round 1 was dispatched by the #350 coordinator to a cold reviewer
(`gpt-5.6-terra`, read-only) and returned **REVISE**. Both blockers were authoring
defects in the draft, raised independently by the cold pass and the coordinator's
own grounding pass, and both were re-measured before adoption. None was injected:
this triage planted no canary.

1. *The escape was pinned to the axis that can run out of room.* A horizontal
   slide has no landing site at 390 or 768 for the ordinary daytime window
   `[480, 960]`, so the must-prevent outcome recurred at two of the five evidence
   widths while the order's single-window regression test stayed green. Adopted
   in full: the escape is now the vertical drop below the height-pinned grip
   band, the regression test drives that window at both widths, the residual 1px
   `.edge` crossing is named in the accepted-failure clause, and the rendered
   evidence covers the daytime window as well as Overnight.
2. *`Verification:` named one command where the repo owes eight, and `Done when`
   let the rendered evidence be skipped.* Adopted in full: `Verification:` is now
   the complete six-command fast gate with tails measured in this worktree, plus
   the ledger replay and the five-width before/after renders a `revise` owes, and
   the "reported as unavailable" escape is deleted from both `Done when` and
   `tasks.md` — a Chromium launch failure is escalated, never a result.

A third correction was made in the same pass, uncaught by the review: the change
record quoted the control checkout's retired `revise-e2e` serve as the declared
safe entrypoint. This branch's `AGENTS.md` declares exactly one permitted offline
serve — copy `mockups/qa-e2e.synthetic/harmonic.sqlite` to scratch and serve it
with `--no-fetch --token ''` — and the order, `tasks.md` and `design.md` now quote
that one.

Four further candidate objections were checked by the reviewer and refuted rather
than forwarded: a caption/window-label collision, `xAtMinute` not reproducing the
brace geometry, the caption colliding with the plotted traces, and the placeholder
`Source:` OID. The reviewer's evidence spot check passed: the spike regenerates
its five rows exactly as cited, and every cited code location was confirmed exact.
