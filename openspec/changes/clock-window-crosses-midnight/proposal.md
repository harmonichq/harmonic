# Clock window crosses midnight (#130)

## Why

A wearer could not study one overnight stretch as one window. Every gesture that sets
a clock window on the Day-shaped strip in Diagnose was clamped to 00:00–24:00, so
22:00–02:00 had to be studied as 22:00–24:00 and 00:00–02:00 — two unrelated windows
of two different days, which the Findings projection never saw as one. Overnight is
where basal evidence is counted, so this is the stretch the surface is least able to
answer for.

The limit was in the frontend only. The backend already models the circular day, and
so does the browser gates' projection mirror.

Worse than the limitation: a window that crossed midnight could already reach this
surface from a finding's own case file, and every number the canvas printed for it came
from a single linear bin slice that a wrapped window empties. Its median, its 25–75
spread and its lowest point came back blank, and its evidence floor was judged off one
bin. A wearer would have read a shaded overnight window whose numbers described
something else. Harmonic's output is advisory insulin-dosing guidance.

## What changes

- All three gestures — drawing a new window, dragging either of its edges, sliding the
  whole window — can carry it across midnight in either direction, keeping what is
  under the cursor under the cursor for the whole gesture.
- While a gesture holds an edge at the boundary, the day pans underneath it at a
  constant rate and the neighbouring day's hours arrive from the far side, repeated and
  dimmed. Everything the axis scopes pans with it — the pooled bands, the median, the
  captured day, the occurrence and meal marks, the basal lane and the docked readout —
  not just the labels. On release the axis returns to 00:00–24:00.
- A committed window that crosses midnight draws as two highlighted stretches under one
  label, the second carrying a continuation marker, and its median, spread and evidence
  count are read from both stretches instead of an empty slice.
- A draw or a resize that travels a full day commits the unscoped whole day. A slide
  preserves its length and lands back on its own start.
- The brace carries one edge and one grip at each of the window's two clock endpoints
  and none at midnight, and the basal lane dims only what falls outside both stretches.

## What does not change

- Presets keep their contiguous forms and gain no wrapped members.
- The backend, the findings projection and its browser mirror are untouched: both
  already answer for a wrapped window.
- The noon-to-noon axis pivot stays rejected.
- A wrapping I:C block keeps its current treatment. Whether it should now be drawn is
  #141, which this change unblocks rather than settles.
