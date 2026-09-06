# Change: Make Diagnose evidence first and open All charts directly

## Why

The first findings row uses a raised card while its peers use compact rows, so
rank and selection compete for emphasis and the type labels do not share a
column. The glucose overview occupies the top of the evidence pane after the
reader has used it to choose a window. The dock repeats chart previews already
available in the queue.

## What Changes

- Adopt Connor's selected arrangement A: spotlight above the glucose overview,
  with the findings/details inspector on the right and clock scope at the top.
- Give ranked findings one row structure, including the top-ranked row's mini.
- Replace the docked chart strip with direct full-screen All charts access.
- Keep immediate row-to-detail navigation and the existing shared chart-click
  route. The wireframe's preview-only selection and Open finding step do not ship.
- Carry the changed and retired behavior through the existing replay contract,
  generated consumers, and synthetic browser evidence.

## Impact

The surfaces delta is the normative product contract. The design record maps
that contract to shipped ownership, the operator's decisions, and the risk
contract. Tasks divide implementation from live verification; one ticket branch
and one human-reviewed PR carry the whole change. No backend or analysis change.

## Delivery

Triage prepares a reviewed source pin. Implementation starts in a fresh ticket
session after authorization. No agent merges into main. The disposable wireframe
is removed before the implementation PR opens; the decision and screenshots stay.
