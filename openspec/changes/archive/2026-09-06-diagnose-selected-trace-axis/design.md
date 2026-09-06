# Design — A selected occurrence's trace is drawn inside its own axis

## ADR 367 — The chart that draws the selected trace owns an axis that contains it

### Context

`frontend/diagnose-event-comparison.js` builds one option for every rank of the
response comparison. `option()` pushes `selectedSeries(surface, selected)`
whenever `!mini`, so the fullscreen stage and the canvas focal tile both draw the
reader's selected occurrence. Neither computes its range from that trace:

- `renderEventSurface` mounts with `glucoseRange(eventComparisonGlucoseValues(caseFile))`.
- The registry tile is handed the canvas-wide `fieldRange(...)`, which reaches the
  same `eventComparisonGlucoseValues`.

`eventComparisonGlucoseValues` collects cohort `points` and `episodes` and
deliberately omits `selection.detail.glucose`, under a documented rationale: the
shared tile range must not be widened by a reader state, or one click would
rescale every dock mini. That rationale is sound and is pinned by the test `a
selected occurrence trace never changes the field range`.

The defect is not the exclusion. It is that the one branch which *draws* the
selected series is handed the range computed without it. Reproduced through the
exported builder by `docs/scope/367-selected-trace-axis.spike.mjs`: a selection
peaking at 260 is drawn against a `[60, 200]` axis and leaves the plot. On the
synthetic QA showcase the same shape measures `[40, 200]` against a trace of
`[48, 260]` — one of five occurrences, and the only one that matched the finding.

The frozen behaviour ledger `mockups/finding-evidence-routing.behavior.md`
already states the guarantee at `C57`: selecting a matched-cohort occurrence
through its opaque server id leaves "the exact selected trace remains visible."
Its replay proves the trace's points reached ECharts — it compares the drawn
point count against the served count — which is not the same as proving they land
inside the drawn axis. The prose was right and unenforced.

### Decision

The non-mini branch draws against a range that contains what it draws. The
injected range is widened to cover the selected trace's extent, rounded outward
to `GLUCOSE_STEP`, and never narrowed on either side.

Three consequences are chosen deliberately:

**The shared ruler yields to containment, and only for the chart carrying the
extra series.** One glucose range across the arrangement exists so tiles side by
side are read against the same axis. A chart drawing a series outside its own
axis is a worse failure than a chart whose axis is taller than its neighbour's:
the first hides the value a reader opened the occurrence to see, and hides it in
a way that looks like missing data. Because the widening happens where the trace
is pushed rather than in the range's producer, only the chart that actually draws
a selection extends, and it extends outward from the shared range rather than
away from it — so the field ruler remains contained in the widened axis.

**The exclusion stays where it is.** `eventComparisonGlucoseValues`,
`glucoseRange` and `fieldRange` are untouched, so selection still cannot rescale
the tile field, and the mini rank — which never draws a selected trace — keeps
the injected range exactly. The documented rationale is about a field of tiles
and continues to hold for the field of tiles.

**Widening, not a clip indicator.** A marker that says "this trace continues off
the top" still withholds the peak, and the peak is the finding. The module
already carries the machinery for widening in fixed steps; the selected trace was
simply never offered to it.

### Behaviour ledger disposition

Preserved, not added. `C57` states the guarantee this change restores, so no new
executable story id is issued and the frozen ledger and its replay are unchanged
and must stay green. The containment proof lands in the fast gate, on the same
option object the replay reads back, where it runs deterministically without a
browser. Strengthening `C57`'s own replay assertion to match its prose is real
and is deliberately not taken here: it is a widening of a browser gate beyond
this defect, and belongs to a ticket of its own rather than to a one-expression
fix.

### Consequences

- A stage or focal comparison chart whose selected occurrence exceeds the cohort
  field is taller than its neighbouring tiles while that occurrence is selected,
  and returns to the shared range when the selection clears.
- The axis interval is unchanged, so a widened axis prints its labels on the same
  60 mg/dL spacing over a longer range.
- No backend, projection, population, or safety verdict is involved; the whole
  change is inside one frontend option builder.
