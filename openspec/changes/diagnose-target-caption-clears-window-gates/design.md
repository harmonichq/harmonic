# Design — the target caption clears the drawn-window gates (#370)

## ADR 370 — The label moves; the brace does not

**Context.** The `TARGET 70–180 mg/dL` caption on Glucose by time of day is
overprinted by the drawn-window brace, so it reads `TARGET 70–18 mg/dL` at 390,
768 and 900px on the synthetic revise-e2e database. The issue's own suspected
source — an ECharts `markPoint` at `z: 10` outranking the `markArea` caption on a
`z: 0` carrier — is **refuted**. That `markPoint` is the parked window label, and
at the reproduced widths it holds a single datum at `["06:00", 296]`, above the
axis maximum of 220; it is the subject of sibling ticket #366. The actual crosser
is `.brace`, a DOM overlay at `z-index: 4` over the chart element, drawing a
full-plot-height 1px `.edge` at each gate and a 7×22px opaque `.grip` centred on
it (`frontend/diagnose-workstation.css`, `paintBrace` in
`frontend/diagnose-workstation.js`). A DOM sibling painted above a canvas cannot
be reached by any value of `z` inside the chart option.

**Decision.** Fix it by moving the **caption**, in the chart option, and leave the
brace overlay untouched.

**Why not the brace.** Three reasons, in order of force:

1. The grips are frozen contract. Behaviour-ledger row P02 pins two grab handles
   at 7×22 with `title="Drag to resize"`; P16 pins the brace re-seating on
   resize and P56 pins its two-edge, two-grip draw across midnight. Moving them
   is an unsanctioned amendment to an operator-sanctioned ledger, which triage
   cannot grant.
2. `paintBrace` lives in a Vue component that no node test loads, so a change
   there is provable only through a browser gate — which a sandboxed worker
   cannot run at all. The chart module is vue-free and already node-tested, so
   the same fix there is provable on the fast gate.
3. Ownership. The stated rule — *"a label must never be struck by linework"* —
   is the caption's own contract, declared in the chart module. The label is what
   must clear.

**Why this does not duplicate the overlay's geometry.** `paintBrace` places both
gates by calling `xAtMinute`, which the chart module exports, and `renderCanvas`
already receives the same window range and pan offset the brace draws from. The
caption's fit decision calls that same function, so there is one owner of where a
gate is; the module is reading its own fact back, not restating the overlay's.
Verified numerically: `xAtMinute` reproduces the measured `.brace .edge` x to
within 0.1px at all five widths (`docs/scope/target-caption-overprint.spike.mjs`
against the geometry measured in the running app).

**Why the caption drops rather than slides.** The first draft of this order moved
the caption *horizontally*, off the struck gate x. That is not always possible.
Sweeping every window the brace can draw through the module's own `plotBox` and
`xAtMinute`, the worst case is an ordinary daytime window rather than an exotic
one: at `clientWidth: 390` with `window: [480, 960]` (08:00–16:00) the plot box is
`{left: 34, width: 304}` and the gates land at 136.40 and 238.80, carving the plot
into clear regions of 98.4 / 94.4 / 95.2px once each grip's opaque half-width is
removed — against a caption box of 108.8px
(`estimateTextPx('TARGET 70–180 mg/dL', 10)` = 98.8px plus `padding: [2, 5]`). No
region fits. At the 768px viewport, where the layout gives the chart 399.6px, the
gates land at 139.6 and 245.3 and the largest clear region is 101.6px — none fits
there either. So at two of the five evidence widths a horizontal escape has
nowhere to land, on a
window a reader draws with the very grips the frozen ledger pins — and the
must-prevent outcome, a caption rendering a number other than the configured
range, would still occur behind a green build.

The vertical axis has no such failure mode, because the occluder is pinned on it.
`paintBrace` sets `gripTop = Math.min(plotTop + 22, Math.max(plotTop, plotBottom - 22))`
with `PLOT_TOP = 20`, and `.grip` is 22px tall, so the grip band is chart-local
y 42–64 on a normal plot and moves only *upward* on a short one — its floor is
never below y 64 at any width, any window or any dataset. The target band's own
floor sits near y 122 on the reproducing geometry. Placing the caption's box top
at or below y 64 therefore clears every grip unconditionally, needs no gate-x
arithmetic to decide *where* to land, and cannot be defeated by a window that
leaves no sideways room.

The residual crosser at the dropped position is the 1px `.edge`, which spans the
full plot height and so is escapable on neither axis without moving the brace. It
is accepted: a hairline ruled through a glyph reads as linework, not as a hidden
digit, so it does not produce the plausible wrong number this change exists to
prevent. It is named in the risk contract's accepted-failure clause rather than
chased.

**Why conditional rather than an unconditional relocation.** An unconditional move
would change the shipped look at every width, including the widths where the
caption is already correct, and would falsify the prose that describes it as the
band's top-left knock-out caption
(`mockups/finding-evidence-routing.exploration/chart.js:312`,
`harness.mjs:350`). Conditional placement keeps the shipped rendering identical
wherever it is already right, keeps that prose true, and confines the visible
change to the states that are broken.

**Consequences.** The caption's position becomes a function of the selected
window, so it can move as the window changes — the same way the window label
already sheds tails and changes sides. `renderCanvas` is not told whether the
brace is actually drawn (`braceless` is not passed), so the caption clears the
gate positions whenever a window exists, including the block-selection state
where the brace is hidden; that matches how this function already draws the
window's own `markArea` and label on the same trigger, and passing a new flag
would widen the diff into the workstation component for a case with no visible
defect.

The predicate stays purely horizontal, which has one further consequence worth
stating plainly: on a dataset whose axis maximum already holds the caption clear
of the grip band — 260 rather than 220, where the caption sits at y 74.7–86.7 —
the caption will still drop when a gate falls inside its glyph run, even though it
was not going to be struck. That is a placement change with no wrong number on
either side of it. The alternative is to add the vertical overlap to the
predicate, which means reading `el.clientHeight`: an input `renderCanvas` has
never read and that no existing test stub in
`frontend/diagnose-workstation-chart.test.js` supplies. Paying that to suppress a
cosmetic move is not worth it; the horizontal predicate stands.

**Ledger disposition.** No behaviour-ledger amendment is owed. The frozen ledger
(`mockups/finding-evidence-routing.behavior.md`, ★ FROZEN 2026-08-21) carries no
story for this caption — the nearest statement is the code comment this change
corrects — and the fix restores the rule the module already declares rather than
changing a stored behaviour. If the implementation turns out to move any stored
story (P02, P16 or P56 above all), that is an unsanctioned retirement: stop and
return it for an operator ruling rather than amending the ledger in flight.

**Surface lifecycle.** `revise`. Route resolved through UI Craft's router as
`{"mode":"revise","reason":"safe manufactured data source declared"}` from
embodiment `shipped`, runnability `runnable`, declaration `complete`, data source
`manufactured`. The declared safe entrypoint is the one permitted offline serve in
this branch's `AGENTS.md` — copy `mockups/qa-e2e.synthetic/harmonic.sqlite` to a
scratch path and serve it with `--no-fetch --token '' --port 8765`. That database
is generated by `scripts/gen_qa_e2e_db.py` and carries synthetic provenance; where
one exact analyzer or Finding state is needed instead, `AGENTS.md` allows emitting
an uncommitted named case store from the same generator and using it as the `cp`
source. The contract is the frozen ledger above plus its app replay,
`frontend/diagnose-workstation-behavior.replay.mjs`.

The triage measurements quoted throughout this record were taken against the
sweep's shared synthetic revise-e2e server, which the #350 coordinator had already
running; every one of them is reproduced from the chart module's own exported
`plotBox` / `xAtMinute` / `estimateTextPx` by
`docs/scope/target-caption-overprint.spike.mjs`, so none depends on that server
staying up, and no record-level value from the operator's own snapshot appears in
this change, its spike, or any test.
