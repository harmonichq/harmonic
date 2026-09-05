# Phase 2 evidence manifest

Captured 2026-09-04 from synthetic sources only. Every base/revision pair below
uses identical source bytes.

| Source | Committed artifact | SHA-256 | Base/revision bytes |
|---|---|---|---|
| projection fixture | `mockups/diagnose-workstation.synthetic/payload.json` | `1509b275e9b333041ea1fb11d782a865f0a762195b720161791514210f9fdf75` | identical |
| QA showcase | `mockups/qa-e2e.synthetic/harmonic.sqlite` | `158615f7db8dbc81d4fb9b4e8697bd9db49929d9ef9e59f561bb42a44560ccc1` | identical |

## Checkouts and rendered states

All rows cover 1440×900, 2084×742, 1024×768, 760×900 and 390×844.
`pass` means the render was opened through the named checkout's real user path,
captured, and visually inspected.

| Files | Source | Checkout | States | Verdict |
|---|---|---|---|---|
| `original-base-projection-*` | projection fixture | pinned pre-ticket `be8b09bc7de258ae4a8c8afdac7551e6ea8bb127` | root; lower-rank drill/return; Charts raised; Show every chart/Back to dock; selected fullscreen/Back to dock | pass |
| `original-base-qa-showcase-*` | QA showcase | pinned pre-ticket `be8b09bc7de258ae4a8c8afdac7551e6ea8bb127` | root; Charts raised; Show every chart/Back to dock; selected fullscreen/Back to dock | pass |
| `eec92c6-final-projection-*` | projection fixture | implementation `eec92c6` plus the bounded long-title verification correction in this evidence commit | root; full-day root; lower-rank drill/return; All charts/Close; selected fullscreen/Close | pass |
| `eec92c6-final-qa-showcase-*` | QA showcase | implementation `eec92c6` plus the bounded long-title verification correction in this evidence commit | root; All charts/Close; selected fullscreen/Close | pass |
| `base-*` | both sources | phase-1 `aefe07c` | matching revision-mode paths | placement-refinement context only; not the original ticket baseline |
| `revision-*` | both sources | revisions before `eec92c6` | earlier placement and responsive refinement states | historical only |

The QA showcase does not publish a second ranked queue row in these captures,
so a lower-ranked drill/return pair is unavailable from that source. It is not
fabricated; the projection fixture supplies that pair. Likewise, the pinned
checkout is driven through its original Charts dock and return controls, never
through revision-only All charts assumptions.

The authoritative capture process output is retained in
`original-base-capture-final.txt` and `eec92c6-revision-capture-final.txt`.
Each log covers both synthetic sources at all five viewports; every current run
reports zero document-level horizontal overflow. Earlier `revision-capture-*`
logs and images remain historical evidence and are not claimed as the completed
surface.

The projection `root-full-day` renders show the required mixed-family ranked
population: I:C, basal, and behavioral rows together. The ordinary projection
root remains the Overnight two-basal-row state so the window-specific layout is
also represented.

## Measurements and targeted states

- Every revision matrix measurement reported zero document-level horizontal
  overflow. At rest the overview header precedes its chart at all five sizes.
  At 760 and 390 px the Spotlight field and overview header boxes share 2 px of
  border geometry; the live boundary witness proves the Spotlight tile and its
  body both clear the overview header's content rather than overlapping it.
- The final 390×844 full-day projection render keeps the complete long I:C
  headline while leaving a readable chart. Its live witness requires a chart
  host of at least 170 px, a plot of at least 90 px, and at least 14 px between
  rendered y-axis ticks. The fail-first witness measured 77.25 px, 9 px and
  1.29 px respectively before the responsive height correction.
- The live browser witness measures every rendered desktop queue preview at or
  above the existing 120 px host-width floor.
- `preview-followup/` contains the focused useful-mini revision at desktop,
  short, tablet and narrow sizes. Mixed-projection captures show I:C, basal and
  behavioral rows; the default projection's expanded Watching state supplies
  ISF. Dedicated chart-scroll captures show the chart where the short inspector
  viewport cannot contain a complete row at once. `capture.txt` records uniform
  92 px preview heights, widths from 340–710 px, and zero horizontal overflow.
- The live narrow witness measures chart controls at a minimum 44×44 px hit
  area while retaining the existing 13 px marks.
- `special-states/` contains the current pending, failed, stale, empty,
  selected-Watching, retained-star, direction-only and Sift-promotion renders.
  The applicable replay passed 13/13 at 760×900; desktop-only S139/S140 passed
  2/2 at 1440×900.
- The final 390×844 `drill-return` render visibly starts at the rank-one tier
  and title. `all-charts-dismissed` carries the same corrected root state while
  preserving the catalog dismissal contract.
- The live narrow queue witness scrolls all five supported preview families
  fully inside the queue viewport above the watched-change dock; each remains
  mounted and clears the existing width floor.

## Gate evidence

The table below is authoritative for implementation `eec92c6` plus the bounded
responsive correction made during final verification. Complete stdout/stderr is
retained in the named logs. Earlier unprefixed and non-final logs remain
historical or diagnostic evidence and are not relabeled as covering this state.

| Gate | Result | Log |
|---|---|---|
| Python | 2227 passed, 1 skipped | `eec92c6-pytest-final.txt` |
| frontend fast gate | 589 passed | `eec92c6-frontend-fast-gate-final.txt` |
| OpenSpec, docs and frontend drift | 73 OpenSpec items and all checks passed | `eec92c6-docs-frontend-drift-gates-current-final.txt` |
| backend generator drift | all 13 checks passed | `eec92c6-backend-drift-gates-final.txt` |
| materialized public tree | 398 files; 360 documents/links clean; contamination scan 0 findings | `eec92c6-public-tree-gates-final-pass.txt` |
| Diagnose workstation browser | 58 passed | `eec92c6-browser-02-diagnose-workstation-final.txt` |
| Diagnose canvas composition | 14 passed | `eec92c6-browser-03-canvas-composition.txt` |
| cockpit shell | 14 passed, 2 pre-existing skips | `eec92c6-browser-04-cockpit-shell.txt` |
| shared browser runner | 1 passed | `eec92c6-browser-05-runner.txt` |
| Day lifecycle | 3 passed | `eec92c6-browser-01-day-surface.txt` |
| first Plan reconciliation | 4 passed | `eec92c6-browser-06-plan-first-match.txt` |
| Diagnose aggregate replay | 163 passed | `eec92c6-browser-07-diagnose-replay-final.txt` |
| event-comparison replay | 14 passed | `eec92c6-browser-08-event-comparison-replay-final.txt` |
| event-comparison support audit | 5 passed | `eec92c6-browser-09-event-comparison-support-final.txt` |
| Verify aggregate replay | 8 passed | `eec92c6-browser-10-verify-660-replay-final.txt` |
| special-state replay | 15 passed across applicable sizes | `special-states-replay-760.txt`, `special-states-replay-1440.txt` |

The two cockpit-shell skips are pre-existing platform branches and are retained
honestly (14 runnable cases passed). The initial 159/163 historical replay, the
`eec92c6` 161/163 replay that exposed superseded S140/S143 assertions, the
initial detached-canvas workstation retry, the fail-first long-title witness,
and sandbox/cache or wrapper failures remain diagnostic evidence. The `final`
logs named above are authoritative. All ten browser legs were run against the
completed surface on the owned no-fetch server recorded in
`eec92c6-browser-owned-server-final-metadata.txt`; the render matrix used the
separate owned server recorded in `eec92c6-capture-owned-server-metadata.txt`.
