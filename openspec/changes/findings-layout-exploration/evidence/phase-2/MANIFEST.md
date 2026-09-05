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
| `revision-projection-*` | projection fixture | `codex/341-findings-layout-c2`, based on phase-1 `aefe07c` | root; full-day root; lower-rank drill/return; All charts/Close; selected fullscreen/Close | pass |
| `revision-qa-showcase-*` | QA showcase | `codex/341-findings-layout-c2`, based on phase-1 `aefe07c` | root; All charts/Close; selected fullscreen/Close | pass |
| `base-*` | both sources | phase-1 `aefe07c` | matching revision-mode paths | placement-refinement context only; not the original ticket baseline |

The QA showcase does not publish a second ranked queue row in these captures,
so a lower-ranked drill/return pair is unavailable from that source. It is not
fabricated; the projection fixture supplies that pair. Likewise, the pinned
checkout is driven through its original Charts dock and return controls, never
through revision-only All charts assumptions.

The capture process output is retained in `original-base-capture-final.txt`
and `revision-capture-final.txt`. Each log contains both synthetic sources at
all five viewports; every run reports zero document-level horizontal overflow.

The projection `root-full-day` renders show the required mixed-family ranked
population: I:C, basal, and behavioral rows together. The ordinary projection
root remains the Overnight two-basal-row state so the window-specific layout is
also represented.

## Measurements and targeted states

- Every revision matrix measurement reported zero document-level horizontal
  overflow. At rest the Spotlight bottom precedes the overview header, and the
  overview header precedes its chart at all five sizes.
- The live browser witness measures every rendered desktop queue preview at or
  above the existing 120 px host-width floor.
- The live narrow witness measures chart controls at a minimum 44×44 px hit
  area while retaining the existing 13 px marks.
- `special-states/` contains the current pending, failed, stale, empty,
  selected-Watching, retained-star, direction-only and Sift-promotion renders.
  The applicable replay passed 13/13 at 760×900; desktop-only S139/S140 passed
  2/2 at 1440×900.
- The final 390×844 `drill-return` render visibly starts at the rank-one tier
  and title. `all-charts-dismissed` carries the same corrected root state while
  preserving the catalog dismissal contract.

## Gate evidence

| Gate | Result | Log |
|---|---|---|
| Python | 2227 passed, 1 skipped | `pytest.txt` |
| frontend fast gate | 586 passed | `frontend-fast-gate.txt` |
| OpenSpec, docs and frontend drift | 73 OpenSpec items and all checks passed | `docs-frontend-drift-gates.txt` |
| backend generator drift | all 13 checks passed | `backend-drift-gates.txt` |
| materialized public tree | 398 files; links clean; contamination scan 0 findings | `public-tree-gates.txt` |
| Diagnose workstation browser | 53 passed | `diagnose-workstation-browser-final-clean.txt` |
| Diagnose canvas composition | 14 passed | `diagnose-canvas-composition-browser-final.txt` |
| cockpit shell | 14 passed, 2 pre-existing skips | `cockpit-shell-browser-final.txt` |
| shared browser runner | 1 passed | `browser-runner-browser-final.txt` |
| Day lifecycle | 3 passed | `day-surface-browser-final.txt` |
| first Plan reconciliation | 4 passed | `plan-first-match-browser-final.txt` |
| Diagnose aggregate replay | 163 passed | `diagnose-workstation-replay-final-clean.txt` |
| event-comparison replay | 14 passed | `diagnose-event-comparison-replay-final.txt` |
| event-comparison support audit | 5 passed | `diagnose-event-comparison-support-audit-final.txt` |
| Verify aggregate replay | 8 passed | `verify-660-story-replay-final.txt` |
| special-state replay | 15 passed across applicable sizes | `special-states-replay-760.txt`, `special-states-replay-1440.txt` |

The two cockpit-shell skips are pre-existing platform branches and are retained
honestly in `cockpit-shell-browser-final.txt` (14 runnable cases passed). The initial
159/163 replay logs and the later mixed-process retry logs are retained as
diagnostic evidence; the two `*-final-clean.txt` files are the authoritative
workstation and aggregate results. All ten browser legs were run against the
completed surface.
