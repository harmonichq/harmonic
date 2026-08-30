# Settle the glucose-by-clock strip

## Why

Ticket #204's pre-correction audit of the shipped Diagnose glucose-by-clock
strip confirmed the four Dark defects rolled in from #258: the outside-window
scrim was too faint to state the selected window, four unapproved percentile
boundary strokes out-shone the median, the median drew in the warm-grey text
family rather than the forest data family, and the top-right legend rendered
as low-contrast artifacts.

## What Changes

- The four percentile boundary strokes are removed; the bands read as fills.
  Percentile data and band membership are untouched.
- The Dark outside-window scrim rises from 0.06 to 0.28 alpha so the selected
  window reads unmistakably while rails and fills stay above the non-text
  floor. Light keeps its original scrim.
- The Dark median becomes lightened primary — the clearest continuous data
  mark, in the forest family. Light keeps primary-600.
- The legend is removed. The naming job moves to the chart root: `role="img"`
  plus an `aria-label` naming the bands and the median line.

## Impact

- Affected specs: surfaces (one scenario line: legend → accessible mark naming)
- Affected code: `frontend/diagnose-workstation-chart.js`,
  `frontend/diagnose-workstation.js`, their public tests, and the Diagnose
  workstation browser suite's composited-legibility assertions.
- Frozen behavior: none. The behavior replay passes unchanged. The meal-marker
  retirement (operator ruling 2026-08-27, pinned by the canvas-composition
  suite) stands untouched.
