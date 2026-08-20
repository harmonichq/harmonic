# By-event window membership (#62)

## Why

Under `By event`, the chart and the inspector beside it counted two different
populations and printed one caption over both.

The findings queue takes the clock window the reader drew and places every
occurrence by where its consequence landed. The event-comparison lens took no
clock window at all: its only time coordinate was a fixed six-hour anchor-time
block matched on the raw trigger hour, so a drawn window was rounded to the
nearest standing preset and the drawn brace was dropped outright. Both read the
same exposure population underneath.

A reader saw the inspector count meal responses that met criteria while the
canvas drew none, with the same window written above both. Two further facts made
the disagreement look like breakage rather than disagreement: a cohort too thin
for an aggregate is correctly withheld, so it rendered as an empty chart, and the
clock canvas's own header stayed mounted underneath the event-aligned canvas,
which is what printed the wrong window.

Harmonic's output is advisory insulin-dosing guidance. A reader who cannot tell
what population a number is over cannot judge the number.

## What changes

- The lens takes the reader's clock window — drawn brace included, wrapping past
  midnight — and the six-hour anchor-time block retires from the wire, from the
  lens's own retained read path, and from the replay mirror together.
- Membership is outcome-anchored by the same rule the queue applies, implemented
  once and shared rather than transcribed. The outcome minute is stamped when the
  catalog is built, so a projection filters on a field instead of re-deriving an
  anchor.
- A cohort too thin for an aggregate draws its own episodes, faint and named as
  episodes. The comparison-support floor is unchanged: one occurrence never
  becomes a median.
- The canvas states both facts it stands on — the window it counted in, and that
  an episode joins that window by where its consequence landed rather than by
  when its meal was.
- The browser stops re-deriving membership anywhere, not just on the canvas. The
  roster, the factor header and the clock canvas read the keys the findings row
  already publishes.
- Selecting an occurrence under `By event` draws it, and the duplicated canvas
  header goes away.

## Impact

- Closes #62, #57 and #58.
- The response and capture schemas both bump; the coordinate change is not
  backward compatible.
- The fixture-only replay mirror gains the parity gate it never had, and the
  event capture's generator gains a real drift check.
- Evidence-only throughout: nothing here reaches Priority, a recommendation, Plan
  or a settings action, and the alignment spans, the support thresholds and the
  fixed 30-day source window are untouched.

Decisions are recorded in `design.md` as ADR 62 with its amendments, alongside the
revise lane's safe-start provenance.
