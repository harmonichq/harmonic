# Clock window crosses midnight

## ADR 130 — A clock window is a scope on a circular day, unrolled only while a hand is on it

**Context.** A clock window in Diagnose could not cross midnight. Every gesture that
sets one — drawing a new brace, dragging either grip, sliding the whole window — was
clamped to 00:00–24:00 in four places in the frontend, so a wearer who wanted to study
22:00–02:00 had to study 22:00–24:00 and 00:00–02:00 as two unrelated windows, and the
Findings projection never saw them as one. The overnight stretch is exactly where
basal evidence is counted, so this was not an exotic request.

Nothing behind the frontend needed changing. `WindowQuery.clock` already accepts an
end earlier than its start, `_segments` already splits such a window at midnight, and
the `start_min` / `end_min` route keys already round-trip whatever they are given. The
browser gates' mirror already implements the same split, and the frozen projection
table already freezes an `overnight` (22:00, 02:00) answer.

Two facts made the frontend gap dangerous rather than merely limiting. First, a
wrapped window could already reach this surface without any gesture: a finding's case
file carries its own window and a scoped one is taken verbatim from the backend.
Second, every number the canvas prints for a window came from ONE linear bin slice —
`windowStats` and `windowSupport` both took `a = floor(start / 15)`, `b = ceil(end / 15) - 1`
and sliced `a..b`. For 22:00–02:00 that is `a = 88`, `b = 7`: a zero-length sample. The
median, the 25–75 spread and the lowest point came back empty, and the support slice
was one bin, so the evidence floor was judged off a single bin. A wearer would have
read a shaded overnight window whose numbers described something else. Harmonic's
output is advisory insulin-dosing guidance.

**Decision.** A clock window is a scope on a circular day. It has exactly two clock
endpoints and midnight is never one of them, however many stretches are drawn for it.

- **One span derivation, two conventions, one home.** A window's linear spans are
  derived inside the chart module from the same `[startMin, endMin]` pair its functions
  always took: `[[start, end]]` when it does not wrap, `[[start, 1440], [0, end]]` when
  it does. This is the shape the repository already uses for a wrapping I:C block and
  the same rule as the backend's `_segments`; it is not a second source of truth. The
  module keeps two derivations from it deliberately — sampling (`floor` / `ceil - 1`,
  which is correct for a bin sample) and drawing (`round`, which reproduces the mark
  area's own prior endpoints). Unifying them regressed every unwrapped window's shaded
  band by one bin, so they stay separate and each is pinned by test.
- **The axis unrolls by panning, and only while a gesture holds it.** The chart stays
  full width at rest and never rescales. When the moving edge reaches either end of the
  day, the day translates underneath it at a constant minutes-per-pixel and the
  neighbouring day's hours arrive from the far side, repeated and dimmed so they read
  as a repeat rather than as new data. On release the axis rolls back to 00:00–24:00
  and the window commits to its split rendering. The wrap therefore exists only in
  committed state; during the gesture the display axis is monotonic, which is what
  keeps the thing under the cursor under the cursor.
- **The pan carries the data, not the labels.** Everything the axis scopes moves with
  it — the pooled envelope, the median, the p25/p75 edges, the captured day trace, the
  occurrence and meal marks, the basal lane, and the docked readout's bin. A pan that
  moved only the labels was built and rejected: it printed one bin's evidence under
  another bin's clock time, which is the same class of failure as the empty slice above.
- **Travel at the edge, aim in the plot.** The moving edge follows the cursor only
  while the cursor is inside the plot; past that it holds at the boundary and the pan
  supplies the travel, capped at one full day either side of the gesture's press. This
  makes the pan limit and the full-day stop the same place, so the gesture has no dead
  end and no near-miss. It also means a held boundary is *travel*, not aim: a snapped
  window exists on screen for roughly one and a half frames, so a window is chosen by
  bringing the pointer back inside the plot, never by releasing at the edge.
- **The whole day is still no window.** A draw or a resize that runs a full day commits
  the unscoped day scope the backend already expresses, rather than a 24-hour window. A
  slide preserves its length and has no such stop: a slide that travels a full day
  lands back on its own start.

**Alternatives rejected.** Reserving unroll room permanently taxes every at-rest view
for a rare gesture. Rescaling the axis on demand slides the data out from under the
cursor mid-gesture, which is the exact defect being fixed. Painting the next day over
the panel was built and driven, and needs somewhere to borrow from; at Diagnose's
current width the chart is already flush with the right margin, so the borrowed strip
ran off the page. Re-pivoting the axis to noon-to-noon reads better for overnight work
but moves every x-position a wearer has learned — held, not taken.

**Consequences.** Presets stay contiguous: a wrapped window is something the wearer
draws, not something they pick, and no preset gains a wrapped form here. A wrapping I:C
block keeps its current fallback of naming its hours in words with no shaded region.
The recorded ground for that fallback — "a wrapped span is not one span on a linear
clock axis" — stops holding once this lands, so whether such a block should now be
drawn is a real question, deliberately left to #141 rather than absorbed here.
