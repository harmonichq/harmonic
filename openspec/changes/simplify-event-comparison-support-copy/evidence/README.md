# Rendered evidence — issue 99

These screenshots use the committed synthetic event-comparison fixture through
the built-app opener. The base is `983c48effc39fb069c4453b478da2d61b667d55e`;
the revision is the pull request working tree. No server, fetch path, or real
health data was used.

| State | Light | Dark |
| --- | --- | --- |
| Dense, base | [render](base/dense-light.png) | [render](base/dense-dark.png) |
| Dense, revision | [render](revision/dense-light.png) | [render](revision/dense-dark.png) |
| Sparse, base | [render](base/sparse-light.png) | [render](base/sparse-dark.png) |
| Sparse, revision | [render](revision/sparse-light.png) | [render](revision/sparse-dark.png) |
| Zero-event, base | [render](base/zero-fired-light.png) | [render](base/zero-fired-dark.png) |
| Zero-event, revision | [render](revision/zero-fired-light.png) | [render](revision/zero-fired-dark.png) |

The chart series, marks, axes, and layout remain identical. The revision removes
duplicated support words and point tallies, keeps `thin` on Limited cohorts, and
uses `nothing to draw` for the zero-event Withheld cohort without clipping.
