# Design — Diagnose fullscreen chart containment (#232)

## ADR 232 — Fullscreen frame owns geometry and resize lifecycle

### Context

The workstation already owns the fullscreen pane, name, controls, dismissal, and
ordinary ECharts mounts. Behavioral comparison alone adds a nested `.ec-surface`,
minimum plot/key heights, and a `ResizeObserver` created inside
`renderEventSurface`. The workstation then receives that mount through a special
fullscreen branch. At a 2084×450 synthetic viewport, the plot extends 24 px below
the shared frame and overlaps the cohort key.

### Decision

The workstation's fullscreen frame is the sole owner of fullscreen bounds,
overflow, resize observation, theme repaint, mount replacement, disposal, and
dismissal restoration.

Chart adapters receive the bounded host and contribute only chart content and
chart-specific controls. `renderEventSurface` returns an observer-free mount
record containing its chart and content cleanup. The workstation installs the
fullscreen observer against the supplied host/chart and disposes that observer
and mount exactly once. A still-real compatibility-shell caller installs only its
own outer-frame observer through the same explicit caller-owned mechanism.

The change stays in the existing workstation and event-comparison modules. A new
fullscreen-frame module is not justified while there is only one frame owner.

### Consequences

- Basal, ISF, carb-ratio, and event-comparison share one fullscreen lifecycle and
  containment contract.
- Event comparison retains its chart-specific cohort key, selection, trace, label,
  and keyboard behavior without retaining a second fullscreen sizing authority.
- Browser tests can assert the same frame edges and disposal behavior for every
  registry kind.
- Non-fullscreen callers remain responsible for their own outer frame; the
  low-level event renderer does not infer layout ownership.

## Safe revise source

Use committed synthetic fixtures and the replay app opener for deterministic
browser coverage. If a served app is needed, the only permitted command is the
no-fetch synthetic declaration in `AGENTS.md`. No live pull, credentials, `.env`,
`tconnect-data/`, or real database is in scope.

## Verification design

The browser regression first records the current failure at 2084×450, where the
Carb undercount plot escapes the frame and overlaps the key. It then evaluates one
live descriptor for every registered chart family at that viewport and at
2084×742. Assertions compare all four edges of the plot, axis-bearing canvas,
key/legend, and host against the frame and separately prove plot/key disjointness.

Each family is dismissed through the reader's Back control and must restore the
exact prior Spotlight and dock state. Existing event-comparison replays continue
to own selected-occurrence, cohort-key, and keyboard-cursor behavior. Missing
browser dependencies or fixtures fail closed.

## Triage review

Preflight traced the shipping mount and disposal paths and reproduced the issue
with committed synthetic data. Independent targeted plan review first blocked on
missing executable geometry evidence and ambiguous observer ownership. Both were
corrected and the same reviewer countersigned the resulting work order.

## Revision record — 2026-08-28

The implementation follows the decision without introducing another module.
`renderEventSurface` now returns the chart, its resize host, and content cleanup
without constructing a `ResizeObserver`. The workstation installs the single
observer for both ordinary and event-comparison mounts, and its existing teardown
path disconnects the observer, disposes the chart, releases content listeners,
and restores event-comparison globals.

The retired desktop `310px` event-chart minimum and nested overflow authority
were removed. The mobile event-comparison minimum remains unchanged because
mobile redesign is outside this revision.

The fail-first capture reproduced the event-comparison defect in both themes at
2084×450: the plot and canvas ended 24 px below the fullscreen frame and
overlapped the cohort key. The revision matrix passed all 16 combinations of four
registered families, two themes, and two viewports, including exact Back-state
restoration, one active resize owner, and exactly-once chart disposal. The 32
same-fixture screenshots are under `evidence/base/` and `evidence/revision/`.

Verification passed with 2,093 backend tests (one skipped), 520 frontend tests,
13/13 composition tests, 41/41 workstation browser tests, 139/139 workstation
replay stories, 14/14 event-comparison replay stories, five support-audit renders,
and every drift and publishability check declared in `AGENTS.md`.
