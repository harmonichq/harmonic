# Retained visual evidence

The retained set contains nine synthetic screenshots. Repeated viewport matrices and intermediate iterations were removed at Connor’s request. Existing manifests and reviewer reports describe the captures available when those reviews ran; their historical filenames are not promises that every capture remains committed. Raw test logs, review findings, and capture scripts remain available.

## Before and after

| Surface | Before | After |
| --- | --- | --- |
| Desktop, 1440×900 | [Original layout](phase-2/original-base-projection-1440x900-root.png) | [Revised layout](final-projection/final-1440x900-root.png) |
| Phone, 390×844 | [Before phone correction](phone-flow-followup/before-bc58840-390x844-root.png) | [Continuous page flow](final-projection/final-390x844-root.png) |
| Phone queue, 390×844 | [Before phone correction](phone-flow-followup/before-bc58840-390x844-scrolled-queue.png) | [Retained queue charts](final-projection/final-390x844-scrolled-queue.png) |

These projection captures use the existing synthetic replay inputs. The desktop baseline is the original ticket baseline; phone baselines are the rejected pre-correction revision `bc58840`. The final captures are from `b7b8ade`, as described in the adjacent manifests. They establish layout comparisons, not passing remote CI: PR #346 subsequently reported two phone-test failures.

## Design decision context

The selected wireframe’s [root](wireframe-root.png), [detail](wireframe-detail.png), and [All charts](wireframe-all-charts.png) remain as decision context, not as production fidelity requirements.

The [verification closure](phone-integration-recheck/README.md) records local test results. The [review reports](reviews/) preserve their original findings.
