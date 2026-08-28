# canvas-tile-controls — design

## ADR 229 — Picked occurrences belong to the spotlight

Ruled by live judging, 2026-08-28. A dock mini is a front door to its chart in
the spotlight, not a second live chart competing for attention. A picked
Occurrence is therefore spotlight-only: the spotlight draws its selected trace
and deemphasizes the other cohort lines, while the dock mini remains the static
cohort view. The frozen event-comparison stories read each fact from the surface
that owns it and continue to reject a comparison canvas owned by no tile.

The dock is a surface that can be away: chart fullscreen puts it away, and the
spotlight-size rule hides it when the spotlight runs out of room. A frozen story
asking whether a Finding remains on screen therefore checks its tile across the
spotlight and the dock; only a story about mini-owned evidence asks the dock,
after explicitly bringing it back.

The comparison chart's keyboard cursor is un-retired in the spotlight. A reader
can focus the visible chart, step through five-minute points, and read the same
served cohort evidence in its on-screen readout and accessible label. The old
keyboard path was dishonest only while its chart was hidden and unfocusable;
making the chart visible makes that path real again.

The frozen stories read geometry and state from the surfaces that own them. A
brace drag derives the plot edges from the chart's exported grid insets, so a
canvas alignment change cannot leave the replay aiming at a retired plot. A
story about the Watching tail explicitly selects a scope that publishes
Watching reads and brings the dock up before asking for a tail cell, because an
all-ranked roster or a hidden dock deliberately draws none. Closing the
explorer returns focus to its opener, and a dock repaint preserves that focus
while it rebuilds the control.

## ADR 215 — Fixed canvas, membership pinning, Explore retired

Ruled by the operator, 2026-08-26, during the #215 polish slices, reversing
parts of the #135 lock after first live use on real data.

**Layout is fixed, not derived.** The Diagnose canvas is always the glucose
strip on top and four chart positions beneath: one focal, three minis. The
#135 pin-count arrangement map (0 focal+slots / 1 split / 2 pair / 3
one-plus-two / 4 quad) is retired; no derived arrangements, no layout
miniature states beyond the fixed geometry. Tabbing through the minis swaps
them into the focal position.

**Pinning is membership, not layout.** A pin says "this chart keeps one of
the canvas positions"; it never chooses an arrangement. Pins cap at three —
the focal position is never pinnable, so a finding click or mini tab always
owns it and no displacement rule is needed. Unpinned positions are seated by
findings rank (actual findings, not Watching). Unpin releases the position
back to seating.

**The chart explorer demotes to a view-all slide-out** beside the dock row
(Trial · Watching · Profile), used to browse every registered chart and
pin/unpin membership. It is not a mode.

**Explore mode is retired** — sanction: ConnorGriffin · 2026-08-26 · "It
keeps the interaction logic simple … we do not then have to distinguish
between advice enabled or advice not enabled." A browser-suite RETIRED
guard prints the sanction and fails loudly if a Findings|Explore mode
switch returns.

Why: the derived-arrangement machinery and the second mode were complexity
the operator's first live sessions could not craft well or even judge —
"I got a little ahead of myself in terms of functionality without getting
close enough to it to really craft it well." The fixed shape keeps the one
interaction that mattered in use: glucose as the driver, findings ranked,
click a finding and its evidence takes the focal position.

### Amendment — 2026-08-26 — a pin orders the dock, and the dock has three states

Ruled by the operator across the slice-3 design rounds, superseding the parts
of ADR 215 named below before they were built. Drawn and driven at
`openspec/changes/canvas-tile-controls/dock-states.wireframe.html`; every
figure here was measured off that specimen or off the shipped app on 8877,
not asserted.

**A pin orders the dock; it is not membership of a position.** ADR 215's
"pinning is membership", "pins cap at three" and "the focal position is never
pinnable" are withdrawn together. A pin says **keep this left-most**, so
pinned charts sort first and the rest follow in findings rank. There is no
cap: a fourth pin is not refused, it sits one scroll-tick to the right. The
pin therefore means the same thing on every tile, the spotlight's included —
where it says "when this returns to the dock, keep it left-most" — so no
position needs a shortened rail, a disabled control or an explanation of why
its pin does nothing.

Why: membership needed a cap, a cap needed a refusal, a refusal needed a
disabled control, and an unpinnable focal position needed a fourth rule to
explain why the biggest tile in the field was the one place a pin was inert.
Ordering needs none of that and reaches every chart rather than three.

**The dock holds ranked findings; Watching reads are pinned in.** `assert`
and `finding` are the registers the server ranks, and only those seat
themselves — the part of the membership ruling that survives intact. A `held`
or `blind` read is a parameter in force with evidence to plot, so it rides at
the end of the dock past a divider and reaches a seat only by being pinned. A
`history` read is not: it is a change already made, a past record the
inspector replays, and it publishes no chart. It appears nowhere on the
canvas, which is the exclusion `descriptorsFromFindings` already enforced.

**The spotlight is lifted out of the dock, and the dock stays sorted.**
Promoting a mini drops the demoted spotlight back to its own ordered position
— pinned rank, else findings rank — rather than into the seat the promoted
chart vacated. The dock is a sorted list at all times and no interaction
shuffles it, which retires #135's "a demoted focal chart returns to the slot
the promoted chart came from" and, with it, the candidate-order state that
rule needed.

#### The dock's three states

**Hidden · bottom-docked · full-canvas.** The same tiles, the same rails and
the same pins in all three; only the geometry differs.

- **Bottom-docked** is one horizontal row beneath the spotlight, scrolling
  sideways, with a sliced tile at the right edge as the scroll affordance —
  no fade, no chevron, no counter.
- **Full-canvas** gives the dock the whole canvas pane, **the glucose strip
  included**, as a grid that scrolls vertically. The column count is
  responsive, falling out of how many minis fit at their own width, so a wider
  screen gets more charts rather than bigger ones. Measured: 2 columns at
  480px, 3 at 660, 5 at 900, 8 at 1200.
- **Hidden** shows the spotlight alone, with a tab centred on the canvas's
  bottom edge to bring the dock back.

**Full-canvas is reachable at every viewport size.** On a short viewport it is
the most valuable state, not a forbidden one — it spends the glucose strip's
own space on the charts.

#### Two floors, and what each one asks

**The spotlight's floor is 220px; a mini is 148px.** They are deliberately
different numbers. "As tall as a mini" was tried and was wrong: at that floor a
floating dock covers the spotlight whole, title included, so the reader cannot
tell what is underneath and cannot click it to dismiss. 220 leaves 72px — the
nameplate and a sliver of plot — showing above a floating dock.

**The dock floor asks "is there room to seat both?"** — 220 + 148 + 8 = **376px
of canvas field**, about a 700px browser window. Above it the minis are not
hideable by anyone; below it the dock hides itself and the spotlight takes the
freed space. When the viewport grows back the minis return on their own.

**The raise floor asks "is bottom-docking worth doing?"** — one mini plus a
nameplate. Below it the tab still exists but **mounts to full-canvas instead of
bottom-docking**: the control never disappears and the reader is never offered
a state the surface cannot honour, it simply goes where the room actually is.
Full-canvas takes the whole pane, so it has no spotlight to leave visible and
no floor of its own to clear.

**A raised dock floats over the spotlight; it never squeezes it.** Splitting
the field below the dock floor gave the spotlight 0px at a 150px viewport,
breaking the very invariant that hid the dock and destroying the one required
way out by leaving nothing to click. Raised, the dock is clamped to the field
so it cannot spill over the glucose strip.

#### What dismisses a raised dock

In a short viewport a raised dock is temporary, and exactly two things put it
away: **clicking the spotlight**, and **drilling a finding**. Both are attention
moving off the dock. **Pinning a chart, full-screening a chart, and dragging the
glucose strip all leave it up** — the first two are what the dock is for, and
re-scoping the window is the thing the minis exist to be read against.

**Clicking a chart in full-canvas promotes it to the spotlight and closes the
dock**, landing the reader on the chart they picked. It is the same verb the
bottom-docked row already has, it makes mount → find it → read it one gesture,
and it is a second way out for a reader who never finds the close control.

**Full-screen remembers its door.** Backing out returns the reader to the state
they entered from — the browser if they were browsing, the docked row if they
were not — so examining one chart mid-browse is a detour rather than an exit.

#### Explore is retired

Unchanged from ADR 215 above, and now also struck from the capability spec:
`openspec/specs/surfaces/spec.md` loses its "Diagnose also hosts an Explore
mode" requirement. Sanction: ConnorGriffin · 2026-08-26 · "Diagnose does NOT
need to host an explore mode. we're building a better version of it right now."
The dock — every ranked finding's evidence, browsable at full canvas without
leaving the advisory surface — is that better version.

#### The control chrome

**The handle rides the dock's top edge**, which in the hidden state is the
canvas floor. It does not hop between unrelated edges: it is attached to one
object and moves because that object moved. Hidden, it is **always drawn** —
quietly, but never invisible, because with the dock away nothing else on screen
says the charts exist and a hover-revealed control does not exist at all on a
touch device. Docked, it may ghost: the dock underneath is its own proof.

**The chrome grows with what the state can afford.** Hidden pays one glyph;
docked pays the handle plus mount, and hide as well when the viewport is short;
mounted gets a real header row, because mounted is the only state with room for
one. Nothing overlaps a chart in any state.

**Mounted takes the whole left area, glucose strip included**, so the header row
the strip's caption occupied becomes the mounted thing's own header — a title, a
shrink and a close. That row is shared: a full-screened chart gets the same
treatment with its own name in it, which is why a mounted chart and the mounted
dock do not need two different answers.

**A control is absent where it cannot act, never disabled.** Hide is not drawn
on a tall viewport, because the minis are not hideable while there is room. Nor
is close drawn there: the resting state IS docked, so close and shrink would be
two controls with one outcome. On a short viewport both earn their place —
close goes to hidden, shrink to the raised row.

**The handle is a knurled tab with a centred knurl and no word — glyph only.**
The knurl sits at the tab's optical centre in every state, including the
one-glyph hidden state.

**Words on the left, controls on the right.** Ruled by the operator,
2026-08-27, superseding the centred-label layout recorded in the round above
(K1: left cell, label, right cell) and, with it, the clause K1 existed to serve
— that the tab holds one width in every state. The tab now sizes to its
contents, and what it carries is decided by what the state can afford:

- **Hidden** carries a word and its one control. It reads **"Charts"**.
- **Docked** carries **the controls alone**, with no word. The dock underneath
  is its own proof of what the handle is for.
- **Mounted** carries the full title and the controls, in the header row the
  glucose strip's caption vacates.

Why: it makes the tab and the mounted header **one object** rather than two
pieces of furniture to learn. The mounted header was already word-left /
controls-right, so the handle is that header shrunk to what a 19px edge can
afford, and dropping the word when docked leaves the same object with nothing
left but its controls.

**The plate keeps the word's slot when there is no word.** Measured in the app:
drawn tight to its single control, the docked handle was a 22×19 plate carrying
a 13px glyph, which read as a box inside a box rather than as a control. A 46px
minimum width makes the plate landscape in every state, so one silhouette
carries a word when there is one and empty plate when there is not.

**The centre is a word, not a knurl.** Knurling was tried and rejected: it is a
texture this app uses nowhere else, so it arrived as a new material beside an
idiom built from engraved type, recessed plates and hairlines. The centre reads
**"Chart dock"** — wording not final — engraved in the tile nameplates' manner.
This supersedes the earlier "knurled tab · no word · glyph only" ruling from the
same round.

**The glyphs are the tile rail's own.** Ruled by the operator, 2026-08-27,
superseding the pane-fill set recorded in the round above. The shipped
evidence-tile rail already draws `full` as four corner brackets facing out and
`dismiss` as four facing in, and on this very surface those two marks already
mean exactly mount and shrink — so mount and shrink **are** those marks,
referenced from the rail rather than redrawn. Bring-up and put-away extend the
same corner language to the vertical acts: the same four brackets, opened
downward to bring the dock up and upward to put it away.

Why: reusing them is not choosing a vocabulary, it is declining to invent a
second one beside the one the reader already reads on every tile. The pane-fill
set also cost the docked handle its legibility — a rounded square glyph on a
rounded square plate nested rather than read as a control.

The arrow-through-a-line drawn in an earlier round stays retired.

#### The wording

**The tab reads "Charts"; the mounted header reads "All charts".** Ruled by the
operator, 2026-08-27. "Chart dock" was the alternative and was declined on two
grounds, both checkable in the tree:

- **This app already ships an object called the dock** — the watched-change
  dock at the inspector's floor (ledger terms 46–49, `watched-change-dock.js`)
  — and it is on screen at the same time as this one, at the opposite corner of
  the same view. Naming this the chart dock puts two docks in front of the
  reader and makes "the dock" ambiguous in every sentence after it. `dock`
  stays what it is here: the name of the furniture in the code, not a word the
  reader is shown.
- **"All charts" is already this surface's own phrase for this exact concept.**
  The roster pull prints `All charts · 8` today. Mounted is not a new idea
  needing a new name; it is that idea given the whole pane.

#### The roster is retired

**The chart roster is struck, and the mounted dock is what replaces it.**
Sanction: ConnorGriffin · 2026-08-27 · "idk what the roster is but I assume it's
the old way of viewing the chart thumbnails? If so yes retire it, that's the
point of this slice."

ADR 215 demoted the chart explorer to a roster — a slide-out of thumbnails at
the inspector's floor, with pin and unpin. The mounted dock does that same job
with the real tiles, the real rails and the real pins, at full canvas, so
shipping both put two routes to one thing on screen at once: the mounted header
read `ALL CHARTS · 6 charts` while the roster pull read `All charts · 8`, six
inches apart, in the same view.

**The two counts differed because the dock was not yet carrying the Watching
reads.** The roster was the only route to a `held` or `blind` chart, so
retiring it and building the dock's tail had to land together — which is why
they are one change and not two. The tail is now drawn past a hairline divider
in both docked and mounted, and pinning from there is still what moves a
Watching read into a seat.

### Amendment — 2026-08-27 — the dock is a filmstrip cut into the field

Ruled by the operator while judging the built dock on the running app. Every
figure below was measured in the app, not asserted, and each ruling names the
earlier one it withdraws.

**The dock is the whole ordered set, and the spotlight is its current frame.**
This withdraws the amendment above's "the spotlight is lifted out of the dock".
Lifting it out left the dock holding the leftovers — whichever charts the
reader happened not to be looking at — with its membership re-forming on every
click. Operator, on the built row: "it still reads as a random array of charts,
now just pasted together." A set that re-forms under each interaction cannot
read as one object however it is framed. Every chart now keeps its cell in one
order and the one on stage is MARKED rather than removed, so clicking a cell
moves the stage instead of changing what the row contains.

What survives from the withdrawn rule is the part that mattered: the order is
still pins first then findings rank, and no interaction shuffles it.

**The dock is a RECESS; the spotlight keeps the raised plate.** Asked what the
dock gets when the spotlight is the star and takes the depth, the answer is the
other direction in the vocabulary the canvas already has — a plate is raised
(ring, lit top edge, pooled shadow) and the field is cut. A dock is a thing set
into a surface, so it is a well: the field's own inset lip shadow, one level
deeper, with the minis cut into it and no pooled shadow of its own.

A tray in the same material was tried first and rejected on sight: same depth
and same light as the tiles, so it only glued four plates together. One step
DOWN is a different depth, and that is what stops the row competing with the
chart above it.

**Selecting a chart never reorders the strip.** The dock's order is the
published rank — pins first, then findings rank — and it does not know which
chart is on stage. Operator, on the built strip: "spotlight is going far left,
I'm not lying to you..." It was: `placeSeats` returns the focal chart FIRST, and
the strip was built from that output, so the spotlighted chart was hoisted to
the head on every click — the precise behaviour the filmstrip exists to
prevent, reintroduced by the plumbing that implemented it. The strip now takes
its order from the candidate list instead. Driven: promoting the third cell
leaves all eight ids in identical positions and moves only the mark.

This is the invariant the filmstrip rests on. A strip whose order changes when
you pick from it is the "random array" under a different name.

**The current frame is marked faintly, because the spotlight IS the mark.** The
frame being projected is already accented by standing at full size directly
above the strip; repeating that emphasis in the cell states the same fact twice
and makes a thumbnail compete with the chart it is a thumbnail of. Operator:
"we dont need to accent the spotlight chart for the selcted filstrip … It just
needs an accent in the filmstrip itself, but MUCH more subtle." One accent
hairline along the cell's top edge, and nothing else. This withdraws the
raised-plate treatment ruled earlier the same day.

**The drill accent is off inside the dock.** It marked the chart the inspector
is drilled into, which the spotlight now ALWAYS owns — so on a cell it either
duplicates the selected mark or contradicts it, and never adds a fact.

**The cells are furniture, not peers of the chart above.** A mini wore the
spotlight's own nameplate — same size, weight and ink — so the strip read as
charts of equal standing rather than as the set a spotlight is drawn from. They
step back a rank in the nameplate's own channels and by nothing else: no new
colour, no badge, and the plot untouched, because a quiet chart is still
evidence. The cells are separated by the field's own gutter so the well's ground
shows between them.

**The word rides every state the tab has.** This withdraws the same-day ruling
that docked carries its controls alone. Drawn without it, the docked handle was
an abstract mark floating in a gutter — operator: "it is not clear this is a
chart related thing. It kind of looks awful actually." The reasoning that
justified dropping it, that the dock underneath is its own proof, is false in
use: the dock proves charts exist, not that this tab is what moves them. The
ghosting went with it; a control the reader cannot see is not a control.

**Nothing overlaps a chart, and this was enforced by measurement.** The field's
gutter is 8px and the handle is 19px, so a handle centred on the dock's top edge
sat 13px over the spotlight's plot — measured in the running app, against this
ADR's own rule. The docked gutter is now the handle's height, and the handle is
seated in it: foot on the dock's lip, head on the spotlight's floor,
overlapping neither.

**Mounted draws no divider.** The grid already breaks the Watching tail onto its
own row, so a rule across the pane adds a line and no information. Operator:
"drop the hairline in the full size chart view, what is the point of it?" The
divider stays in the docked row, where the cells run continuously and a break
carries nothing on its own.

#### A well that carries marks — `--ck-well`

Found while building the dock, fixed in the same change because the dock's own
chrome sits on it. `--ck-inset` derives as `color-mix(--mk-bg 82%, #000)`, and
under Harmonic `--mk-bg` IS the dark desk, so in LIGHT it drops to near-black.
theme.css already records that trap and steps the wells that carry WORDS down
into the sheet instead. A well that carries GLYPHS needs the same step and never
got it: the hovered evidence-tile rail put #3D5848 marks on a #131D18 ground at
**2.16:1**, under the 3:1 floor a graphical object needs, which is why hover was
unreadable in light. `--ck-well` is that step, and the rail measures **6.16:1**
on it. Dark is deliberately untouched — its `--ck-inset` is stated outright at
#191614 and measures fine, while dark's `--wk-surface-sunken` is lifted for the
value tag's plate, so borrowing it there would invert the recess.

The dock's own well uses the same token, so the recess and the hover ground are
one fact with one definition.

#### Still open

**The craft of the dock is unsettled and is the next agent's work.** The
mechanism above is ruled and driven; what follows is judgement against renders,
not logic:

- The recess is **too shallow in light**. `--ck-well` there is #E7E4DD, a hair
  off the cell ground, so with real gutters between the cells the separation
  reads as white space rather than as a well they are set into. It reads
  correctly in dark, where the well is near-black.
- **The second-class step may be too quiet.** The cells drop a rank in nameplate
  ink and weight, but keep the spotlight's nameplate geometry and its full rail.
- The handle's plate, its rest weight and its seat on the lip have been judged
  once each and not since the dock became a recess.

The remaining slice work is the Explore spec strike, the RETIRED guards, and the
behaviour-ledger amendments.

### Amendment — 2026-08-27 — mounted dies, and the spotlight stops being an object

Ruled by the operator while judging the built dock on the running app, in the
same session that produced the filmstrip amendment above. Both rulings are
subtractions, and each names what it withdraws.

**Mounted is retired.** It hid the spotlight outright and spent the whole field
on a vertically scrolling grid of minis — which is the pre-spotlight canvas,
the arrangement this change exists to replace. It survived the spotlight's
arrival only because the handle had grown a control for it. Operator, on being
shown what the state actually renders: "oh yeah mounted dies."

This is what made the handle unsolvable, and every earlier round on it was
fighting the symptom. The surface had **three** ways to be big — the spotlight
over its strip, the grid of everything, and one chart fullscreen — reached from
different controls, two of them wearing the same `RAIL_FACES.full` mark. A tab
19px tall in a gutter cannot teach a three-way distinction that the surface
itself does not hold apart. With mounted gone the dock is one object in two
places, so the handle offers exactly one act in either state — the state the
reader is not in — and there is no vocabulary to learn.

Three things fall out and are recorded because each was load-bearing before:

- **The raise floor goes with it.** `RAISE_FLOOR` existed to answer "is
  bottom-docking worth doing here, or should this mount instead?" With nothing
  to divert to, the answer at every height is the raised dock, which floats over
  the spotlight and never squeezes it. `dockBringUp` is deleted; the handle's
  `up` states its destination rather than resolving one.
- **The want is no longer overruled in either direction.** A tall field used to
  refuse `hidden` — the minis "are not hideable by anyone" — which, once `mount`
  was gone, would have left the tall docked handle with no act at all: a control
  that exists and does nothing. The dock is a toggle at every height.
- **Fullscreen states its own view.** It borrowed `dockView(height, 'mounted')`
  to draw its header cells, which is why it carried a `hide` beside `shrink`.
  Its only job is to end, so it has one act, and the header row it takes is
  named for fullscreen rather than for the state that used to occupy it
  (`data-full`, `#full-title`, `.head-full`). That row now carries a chart name
  and never a standing title, so "All charts" is gone with the grid it named.

**The spotlight stops being an object.** This withdraws "the stage gets air on
three sides" and the raised stage plate ruled the same day. Operator, on the
built canvas: "the spotlight is all inset and ugly despite being the PRIMARY
thing on this screen, it's kind of... demoted feeling."

The plate was not mistuned, it was the wrong direction. A panel with a ring, a
lit top edge, a cast shadow and 18px of field ground on three sides is exactly
the treatment a mini gets at a larger size, so the eye files the spotlight as
one of the cells enlarged — and a card sitting in a tray reads as *contents of
the tray*. **Depth marks the subordinate thing.** Adding more ring or more cast
makes it more of an object, not more primary, which is why the previous round's
own "Still open" notes never converged: it was tuning two depths against each
other with the primary one on the losing side of the grammar.

So the fix is subtraction. The field carries no padding, the spotlight runs to
all three of its walls, and the tile keeps only the brightest ground the theme
owns — no radius, no edge, no cast. Nothing frames it, which leaves the dock as
the only drawn object on the surface, and the dock is therefore subordinate
because it is the only thing that has been drawn.

The boundary between them is not lost with the cast. The channel's top wall is
drawn on the pointer-inert plate laid OVER the frames (part 2 of the enclosure),
which is a stronger cut than a shadow falling onto them ever was — and it is the
same plate the recess already needed for its own reasons.

#### Still open

The dock's craft notes above stand, minus the one this amendment settles: the
spotlight is no longer competing with the strip for depth, so "the recess is too
shallow in light" should be re-judged against the full-bleed stage before
anything is re-tuned. The handle's plate and its rest weight have still been
judged once each, and not since it became a two-state toggle.

### Amendment — 2026-08-27 — the seam, the cells, and the lip

Ruled by the operator against the built full-bleed canvas, in the same session
as the amendment above. Four findings, one of which was a defect rather than a
judgement.

**The spotlight needs a seam, and the seam is ground, not a line.** Full-bleed
on all four sides took the boundary with the glucose chart away along with the
card — two near-white grounds met with nothing between them, and the pane read
as one continuous scroll of two charts. Operator: "spotlight needs visual sep
from the glucose chart above in some way."

A hairline is the wrong instrument here: this canvas separates by space and by
the theme's own ground everywhere else it separates (term 44), and a rule
between two identical grounds is the weakest mark available. So the field's top
edge is where its own trench shows through — the same material as the dock's
channel, saying "the evidence canvas starts here" in vocabulary the surface
already has. The spotlight still runs to the side walls and to the floor; only
the top is a seam, which is what keeps this a boundary rather than a
reinstated frame.

**A cell carries only the strip's own verb.** Every cell drew four marks in its
margin — fullscreen, pin, and two alignments — and three of those are "read this
properly" verbs, which is what the stage is for. On a 148px cell they were a
quarter of its height spent on controls, repeated across the row, and the plot
paid for all of it. The pin stays, because it is the one verb about the STRIP
rather than about reading a chart: it says "keep this cell left-most", and there
is nowhere else for it to mean that. Fullscreen and alignment are reached by
promoting the cell and acting on the stage.

Nothing is hidden to achieve this, which matters: the rail's standing rule is
that a control is ABSENT where it cannot act and never merely faded, because a
hover-revealed control does not exist at all on the tablet this surface is used
on. A cell now has one control rather than four quiet ones.

**A mini keeps no axis furniture at all.** The `mini` rank already dropped the
legend and the axis names; it kept 8px tick labels and split lines, and at that
size the labels ran together into a smear that reads as texture rather than as
numbers, while the grid they ruled spent most of the cell on furniture nobody
can use. A mini's question is whether there is a shape here worth opening, and
the plot alone answers it — every number is a click away on the stage. The mini
grid drops to 6px of air on all four sides, which is the 32px spine it was
reserving for numbers it no longer draws.

This does not settle whether a cell should be a chart or a sparkline; that
remains the operator's open question. It removes the furniture either answer
would have to remove.

**The lip is the control, and the tab is retired.** Operator: "the controls
suck ... I don't know how to get a control that lets the user summon the dock
from hidden, full screen it from docked, etc. without sacrificing something."
Nothing has to be sacrificed once mounted is gone and there are two states.

The tab was 148px wide and centred, which put a fifth floating object on a
surface that already had too many and centred it on a canvas where everything
else is left-aligned; being tab-shaped, it read as a label rather than as
something to take hold of. The strip's own top lip is the control instead: full
width, knurled at the left where a grip belongs, the word and the act's glyph at
either end of that run. It rides the dock's top edge in both states — in the
hidden state that edge is the canvas floor — so it is attached to one object and
moves because that object moved.

It is also ONE element, one target and one label. The tab was a container of
buttons, so its word was inert and only two 44px cells were pressable; a
full-width 30px button is a target no finger has to find, which is the tablet
requirement the 30px gutter was grown for in the first place. The drawn plate
path goes with the tab — a full-width lip has no silhouette to draw — and the
lit top edge and channel edge it is lit by are the recess's own.

The hidden and narrow fields now pay the lip's height as floor padding for the
same reason the docked field pays it as a gutter. Without it the lip sat across
the spotlight's own x-axis, which is the invariant this ADR has enforced by
measurement twice before.

#### A blank frame in the strip — the divider was taking a cell

Found on the built strip and fixed in the same change. The divider before the
dock's tail was its own `<span>` child of the row, and the row sizes every child
it flows to one mini's width — so a 1px hairline was handed a full 404px column
and the strip grew a blank frame with no name and no plot between the ranked
charts and the Watching reads. It is a box-shadow on the first tail cell now,
which costs no cell; `overflow: hidden` on a tile clips its descendants, never
its own cast.

### Amendment — 2026-08-27 — the explorer, and the big states are one surface

Ruled by the operator against the built canvas. Two rulings and one defect they
uncovered.

**The strip gets a full-size explorer, and it is not mounted returning.** Asked
for after the two-state dock landed: "the CHART explorer needs to go full-screen
too ... when I view all charts, it should do that same thing with all of the
charts as an explorer."

Mounted was deleted for what it drew, not for the slot it filled. It put the
strip's own 148px thumbnails — furniture stripped, unreadable — into the
spotlight's place, which is more of the small thing. The explorer puts every
chart at the STAGE's rank: full axes, legend, nameplate and rail, in a grid
whose column count falls out of how many fit at a readable width, so a wider
screen gets more charts rather than bigger ones. 420px is the floor a chart
needs to hold its own axis labels and 240px the height at which its plot is
still a plot.

It is not a dock state. Like chart fullscreen it is a temporary state the reader
opens, picks from and leaves, so it lives beside `fullscreen` rather than inside
`dockView`, whose two states are where the strip RESTS. Picking a chart closes
it and lands the reader on that chart; Escape and shrink also close it.

**The explorer shows the Watching tail, and this is the one place that is not
optional.** It answers "show me every chart", and the Watching reads are most of
what "every" means — drawn without them it shows only what the server ranked,
which is the one list the reader could already see. Found by building it without
them: the explorer opened on a single chart.

**Its opener is the tile rail's own `full` mark, on the lip's far cell.** The
lip is two cells: the wide one is the toggle between the dock's resting states,
and the 44px cell at the end opens the explorer. Same mark, same meaning, one
rank up — make this big, applied to a chart or to the whole strip.

**A big state is the pane, not a card in it.** Opened fullscreen, a chart was a
plated tile with its own ring and its own nameplate, inset inside a pane whose
header already carried that same name — the title drawn twice, 400px apart, with
a frame between them. Operator: "do you see how this chart right now is
full-screen, but the titles duplicated? That's not what we want. We want to be
able to full-screen things, have the title become part of where findings
currently live, and make it render like it's on one surface."

So the pane header IS the nameplate in both big states, and everything that made
the tile a separate object comes off: its plate, its ring, its radius, its own
header row, and the drill accent — which in fullscreen outlines the whole pane
in held ink to say the inspector is holding the only chart there is. The
explorer takes the identical treatment; its cells are flat on one ground, told
apart by the grout between them. They keep their own nameplates for the one
reason fullscreen does not: a single band cannot carry N names.

#### Every chart on this surface was created at 0 × 0

Found while building the explorer, and it is a defect of the tile painter rather
than of any state. `echarts.init` reads the host's box, and the painter called
it while the tile was still detached — the chart was always born zero-sized and
only ever rescued by the resize observer firing once the tile landed. In the
docked strip that rescue always came, so the bug was invisible; in the
explorer's grid it did not, and every chart opened as an empty frame with a
nameplate over it.

The mounts are now collected during the build and run once the whole field is in
the DOM, so the first measurement a chart takes is the real one and the observer
is left doing what it is for — later resizes.

### Amendment — 2026-08-27 — the dock puts itself away, and the lip is one reach

Ruled by the operator on the built lip and the built fullscreen.

**The dock hides itself when the spotlight runs out of room, and comes back
when the room does.** Restored on the ruling "we had a rule in place that said
that when the spotlight chart got to a certain size, the chart dock would
automatically hide. Can we bring that back." It was lost with mounted, whose
branch had carried it.

It fires on the CROSSING of the dock floor rather than on every measurement,
which is what keeps it from overruling the reader: below the floor they can
still bring the dock up by hand, and it floats over the spotlight rather than
squeezing it, exactly as the raised state has always done. Only the field
growing back, or shrinking past the floor, moves the want on its own. That also
keeps `dockView` a pure resolution — the auto-hide is a transition in the
painter, not a second rule inside the arithmetic.

**The lip's controls sit beside its word.** Drawn with the grip at the far left
and the acts at the far right, one control was split across the whole width of
the canvas. Operator: "my mouse wants to go all the way to the left to bring it
up, and then if I want to full screen it or bring it down, I have to go all the
way to the right. It just feels a little disjointed."

Grip, name and both acts are now one cluster at the canvas's own left margin,
and the rest of the lip is the grab surface it always was — pressing anywhere
along it toggles. The acts stay two cells because they are two kinds of thing,
and they stay buttons because they are what a keyboard reaches.

**A fullscreen chart's verbs ride the header, not a rail down the pane.** Left
on the tile, the rail was a 24px column glued down the whole height of the pane,
filling with well ground on hover and floating a chip under the pointer.
Operator: "the full screen has this like, I don't know, pop-up looking ugliness
to it." A chart that IS the pane has no margin of its own to keep controls in,
so they join the way back in the header — the same rule that moved its name
there, applied to the rest of what it carries.

**The explorer's cells get the field's own gutter.** At a hairline they read as
one crowded sheet — "they're just kind of rendering very, very tightly together"
— so they take the same air every other pair of tiles on this canvas takes, and
the ground between them does the separating.

#### Still open

The seam between the glucose chart and the spotlight is not settled. It is
currently the field's own trench showing in a 10px band, and the operator's read
is that the pane still breaks into three unrelated pieces: "these kind of all
feel like three separate controls to me." The suspicion recorded here for the
next round is that the boundary is not the problem — the pane stacks a HEADER
BAND over the glucose chart and a TILE NAMEPLATE over the spotlight, two
different naming idioms, and then separates them with a third treatment again.

### Amendment — 2026-08-27 — one construction: the canvas is rails and charts

Ruled by the operator on the built lip and the trench seam. Three rulings, and
they resolve to one rule.

**The spotlight's nameplate is a pane header rail.** The trench-band seam of the
amendment above was judged still wrong: "I'm still not sure I'm in love with the
visual separation between the glucose chart and the spotlight chart. These kind
of all feel like three separate controls to me."

The boundary was never the problem. The pane stacked a HEADER BAND over the
glucose chart and a TILE NAMEPLATE over the spotlight — two different naming
constructions — and then separated them with a third treatment again. Three
constructions in one column is what reads as three unrelated objects, and every
round spent tuning the gap between them was tuning the wrong thing.

So there is one construction. The spotlight's nameplate takes the pane header's
own rail — 30px, the rail ground, the rule beneath — and the canvas becomes a
stack of rails and charts: rail, glucose, rail, spotlight, lip, strip. The lip
is the third member of that family, told apart by its knurl, which is the one
mark in the stack that says "this one moves". No band of a fourth material is
added to say what a rail already says. The values are borrowed from theme.css's
pane-header rail rather than restated here, so the three rails cannot drift.

**One act on the lip, and the explorer's opener joins the header.** Drawn with
both acts on the lip they were two bracket glyphs a hand apart, and `hide` and
`full` differ only in which way the brackets open — at a glance the cluster read
as one control drawn twice. Operator: "Controls all on the left looks like
shit."

The explorer's opener was never the lip's act anyway: it makes the PANE show
every chart, which is the same kind of verb as fullscreen's way back, so it
lives where that lives — the pane header's own control column, which until now
was drawn only in fullscreen. The two "big" verbs sit together, and the lip
carries one mark.

**Hover steps away from the charts, never toward them.** Lifting the lip to
`--ck-rail` on hover painted it the charts' own ground, so the one edge in the
stack dissolved into the things it separates. Operator: "the hover makes
everything run together." It deepens instead, in the rail's own material.

### Amendment — 2026-08-27 — three rails told apart by role, and the channel retired

A visual-only pass, ruled from a handoff written against the rendered app. No
behaviour changed and the replay held at 124 of 133 stories across it, which is
the evidence that it is visual-only.

**There are TWO roles on this canvas, not three, and the pair that share one
say so by sharing a material.** Three tonal steps was the first attempt and it
failed twice over: the steps were too fine to read — "the glucose rail and the
correction factor rail look literally identical" — and, more importantly, a
tonal ladder says "these are ranked", when what the surface actually holds is
one permanent thing and one swappable one.

Operator: "the glucose chart lives forever up at the top. The correction factor
chart is associated with the overall chart drawer beneath it. And so those two
things need to tie together somehow."

So the glucose rail keeps the source-of-truth pane-header role — Verify shares
it, and fixing Diagnose by moving a sibling's ground would be a cross-surface
resettle done silently — and the focal nameplate and the Charts lip are cut from
ONE material, because they are two halves of one object: the nameplate names
whatever chart is currently in the slot, and the lip operates the strip that
changes it. The chart between them is held by two rails of the same substance,
which is the relationship stated outright rather than implied by rank. It is one
token, `--ck-slot-rail`, so the pair cannot drift apart.

**Dark takes the sunken role part way, and that is not a fudge.** theme.css
records that dark's `--wk-surface-sunken` is lifted for the value tag's plate.
Borrowing that lift whole made the lip the brightest object on a near-black
canvas — rendered, it was a stripe across the pane rather than a surface a
control sits on. The lip steps from the rail's own material toward it instead,
which is the same ruling measured against the ground it actually lands on. This
is the third time the `--ck-trench` trap has been recorded on this surface: a
token borrowed for its name rather than for the ground it will be painted on.

**The channel is retired: its ground band, its wall plate and its floor.** The
strip sits flush beneath the lip with no gutter, tray, recess or padding band.
The wall plate was drawn OVER the frames deliberately — an inset shadow on the
row paints behind its own children, so a plate was the only way the top wall's
falloff could cross them — and crossing them is exactly what made it wrong: the
falloff landed on the mini nameplates and dimmed the one part of a cell that has
to be read. A lip of its own material with a rule above and below separates by
stating a boundary rather than by shading what is on the far side of it, at
three rules rather than eleven shadows. `--ck-dock-floor` and `--ck-wall-k` go
with it; nothing else read either.

**The knurl is removed and not replaced.** A grip texture promises a drag, and
this rail does not drag — it toggles on click. A mark describing the wrong
mechanic is worse than no mark, and the word on the text spine already says what
the rail is. No other decorative grip takes its place.

**Every control at a surface's right edge shares one centre line, and that line
is the tile rail's.** The focal chart's maximize stays in its nameplate and the
explorer's opener stays in the lip; they keep their separate meanings and their
own hit targets, and nothing connects them — no gutter, no vertical rule, no
control spine. What aligns them is arithmetic: all three surfaces derive their
right inset from `--ck-rail-col` and `--ck-rail-inset`, the shipped control
column's own two numbers.

Centred on `--ck-pad` instead, the maximize glyph and the lip's cells sat 13.5px
inboard of the star, flag and clock directly beneath them — operator: "this
full-screen thing needs to line up exactly with the other elements. It's bad
right now." Deriving all of them from one pair of numbers is what keeps them
aligned when any one of them moves; a second literal is how they came apart.
Measured at 997.5 for maximize, star, clock and the explorer alike, in both
themes.

The glucose strip is unchanged and still carries no control of its own.

### Amendment — 2026-08-27 — elevation carries hierarchy, the field goes slate, and the accent leaves the dock

Ruled by the operator across one live session on the synthetic canvas
(`codex/215-canvas-polish`, all uncommitted at time of writing). The ledger
reconciliation for these rulings is owed by this branch; #226 (star means
keep) carries its own record and is excluded here.

**Elevation replaces drawn boundaries.** The wall-of-flatness round tried a
stronger rule, an 8px desk band, and a whole-section ground step; each was
rejected rendered ("Really, your solution was to just put a black bar?"). What
held: the spotlight floats on the tray it always had — 10px margins, 6px
radius, one soft layered shadow — and the reference chart above stays flush
and flat as fixed chrome. Depth states the hierarchy; no new boundary is drawn.

**The dock is a contained panel that owns its children.** The lip is the
panel's header rail (top corners shared, its own 1px rule below), the cells
are 4px-radius cards 10px inside the panel walls, and the panel floats 10px
off the canvas floor in both dock states. The strip sizes cells to exact
thirds: the sliced-fourth affordance is retired — on a rounded card a slice
reads as occlusion, not "more here" ("it appears to always look covered").

**The field is slate; everything on it stays bone.** `--ck-field` /
`--ck-field-deep` (light `#6e7b71` / `#5e6b62`, dark `#202722` / `#2a332c`)
ground the tile field so the cards separate by hue, not by 4% value steps.
Two extensions were tried and rejected rendered, and stay rejected: the
drawer going slate ("the chart drawer shouldn't go with though") and every
title rail going slate ("look at how unreadable all of this is" — green on
green). Title rails keep the shipped bone pair; the drawer keeps a
three-value bone stack (lip darker than its rail-light interior, cells at
full surface).

**The accent leaves the dock entirely.** The spotlight is never accented —
being on stage is the mark, so the drill outline on the focal card is off in
every state. The picked cell is ringed in `--wk-rule-strong`, a neutral ink;
the earlier signal-ink top bar clipped against the card corners and read as a
paint defect. The hover well plate over a tile's plot is retired, and glyph
buttons (maximize, chevrons, lip cells) carry no hover paint — the lip's
title run keeps its whole-bar hover because it is the click target.

**One toggle module.** The clock/event alignment pair renders as one
`.tile-modes` well everywhere — spotlight rail, mini rail, explorer cell,
fullscreen header — a borderless track whose active cell carries a sunken
plate. Two forked rule sets for the same control are what produced the goofy
fullscreen render; hosts may set orientation and nothing else.

**Behavior corrected, ledger owed.** An explicit focus outranks rank-only
seating: clicking a Watching-tail chart now promotes it (it never could — the
ranked candidate list silently dropped the focus), the promoted tail chart
keeps its strip cell (tail derivation excludes only row-seated charts), and
tail cells stamp `selected`. These are behavior changes against the frozen
ledger and their STORY amendments are owed before this branch lands.

**Out of scope, standing.** The Basal mini's flat-line chart form is the
separately filed chart-form issue; the theme rethink has a playground at
`theme-workbench.wireframe.html` in this change directory (operator's, keep);
the remaining prior-session `*.wireframe.html` here are superseded scratch to
delete before any PR.

### Amendment — 2026-08-27 — mini rank binds every chart, and meal markers retire

**Mini rank binds every chart kind, including event-comparison.** This amends
the earlier mini-furniture ruling only to make its reach explicit: a mini draws
no axis furniture, is inert (no hover readout or tooltip), and carries no
per-occurrence traces. Episode and selected traces are stage-rank only.
Operator, 2026-08-27: "Minis should have their axes stripped … I should not be
able to interact with them" / "I don't want traces to draw on the minis".

**Meal markers are retired from the Diagnose glucose strip.** This withdraws
the strip's meal-bolus glyph track and its `Meal boluses` legend entry; the Day
surface is unchanged. Sanction: ConnorGriffin · 2026-08-27 · "Please also
remove meal markers from the glucose chart."
