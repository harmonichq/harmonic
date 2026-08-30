# Design

## ADR 204 — The strip's mark key is the chart root's accessible name

**Context.** #258 ruled the top-right ECharts legend off the glucose-by-clock
strip: its chips rendered as low-contrast artifacts, and it was the last
naming surface the marks had — the docked hover readout is aria-hidden. The
shipped chart root is a bare `div`, whose generic role is name-prohibited, so
an `aria-label` alone would not surface.

**Decision.** The chart root carries `role="img"` and the fixed accessible
name "Glucose bands: 10th to 90th and 25th to 75th percentile ranges; median
line". The role is part of the contract, and the name is one fixed string — it
names the chart's mark vocabulary, not its current data. The #204 audit
briefly restored the retired meal-bolus track (the backend still publishes
`pooled.meals`) before the canvas-composition suite's pinned regression
surfaced the operator's 2026-08-27 ruling — "Please also remove meal markers
from the glucose chart" — so the track stays retired and the name stays
three-marked.

**Consequences.** The one spec scenario line that required the legend now
requires the composited marks plus the accessible naming (see this change's
surfaces delta). The browser suite measures the median as the one continuous
boundary and asserts the legend's absence and the root's name; the retired
boundary-stroke 3:1 rule from #260 is superseded by #258's fills-not-contours
ruling.
