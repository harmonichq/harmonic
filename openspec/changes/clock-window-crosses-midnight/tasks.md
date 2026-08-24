# Tasks — Clock window crosses midnight (#130)

Delivered in two serial pieces, each on its own branch merged back into the ticket
branch. Every box was verified through a public interface or a replayed behaviour
story, never through a hand-set fixture flag.

## 1. The wrapped window's numbers, and the chart's own drawing of it

- [x] A window's linear spans are derived inside the chart module from the
      `[startMin, endMin]` pair its functions already took, reusing the wrapped-span
      shape the repository already carries for an I:C block.
- [x] `windowStats` and `windowSupport` sample every bin in every span, so a wrapped
      window's median, 25–75 spread, lowest point and thinnest count are taken over
      both stretches. The evidence floor comparison is unchanged; only the sample moves.
- [x] The window's `markArea` draws two areas when it wraps, one carrying the label and
      its spread tail, the other a continuation marker and no label.
- [x] The unwrapped path returns exactly what it returned before, pinned by test: an
      earlier attempt to unify the sampling and drawing conventions shortened every
      unwrapped band by one bin.
- [x] Degenerate windows are safe: a window with no extent draws no highlight rather
      than throwing, and no span endpoint indexes outside the axis.

## 2. The unrolling gesture, the brace it draws, and its browser evidence

- [x] The four clamps are replaced by a display-minute domain running one day either
      side of the clock; the pan is capped at one full day either side of the press.
- [x] The plotted day, the basal lane and every mark pan with the axis, repeated and
      dimmed on the neighbouring day. The docked readout reports the pooled bin under
      the pointer, read as a category index rather than a minute.
- [x] Committing normalises onto the circular day, keeps the 15-minute grid and the
      pooling-derived floor, and commits a full-day draw or resize as the unscoped day.
- [x] The brace places its two edges and grips at the window's two clock endpoints and
      none at midnight; the lane's dimming and both hit tests read the spans.
- [x] The behaviour ledger supersedes the slide's clamp clause and adds propositions
      for the wrap in each gesture, the pan and return, and the full-day stop. Every
      one carries `operator-ruled: PENDING - #130` — the operator has not ruled yet.
- [x] Eight replay stories cover the six wrapped gestures plus the full-day draw and
      the full-day slide, and the browser gate covers the wrapped brace and lane.

## Verification

- [x] `uv run python -m pytest` — 2044 passed, 1 skipped.
- [x] `node --test 'frontend/**/*.test.js'` — 444 passed, 0 failed, 0 skipped.
- [x] `node mockups/clock-window-wrap.exploration/window-model.spike.mjs` — 10/10.
- [x] The three repository guards and all eight generator drift checks.
- [x] Both Diagnose browser legs, run with escalated permissions against the sanctioned
      offline server.
