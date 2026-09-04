# Behavior and consumer map

The surfaces delta is the normative product contract. This map identifies the
current owners and the expected amendment surface, not a second set of rules.
Reconcile it to the actual frozen ledger when implementation begins; additions
made upstream must be inventoried before changing the live app.

## Current ownership

| Concern | Existing owner / public interface | Work in this ticket |
|---|---|---|
| Window controls, overview, spotlight and inspector | `frontend/diagnose-workstation.js`: `createDiagnoseWorkstation`, `MARKUP`, `paintTiles` | Rearrange existing hosts; no duplicate route or app |
| Clock coordinates and resize | `frontend/diagnose-workstation-chart.js`: existing canvas helpers | Preserve caller contract; change only geometry coupling exposed by the host move |
| Queue structure | `frontend/diagnose-findings-queue.js`: `queueRows`, `renderFindingsQueue` | One priced-row layout; use served fields and current filters |
| Queue previews | workstation `mountRowMinis` / `mountDescriptorChart`; `MIN_ROW_MINI_WIDTH` | Include top rank; retain common option builder, descriptor lifetime and readable-width policy |
| Dock/explorer state | `frontend/diagnose-canvas-state.js`; workstation `dockButton`, `paintDock`, `paintTiles` | Delete retired dock-only behavior; keep explorer and single-chart ownership in the existing module |
| Chart-to-finding route | `chartClickRoute`, workstation `drillFinding`, `push`, `popTo` | Preserve immediate drill, identity, one inspector level, parameter-specific scope and focus return |
| Theme and chrome roles | `frontend/diagnose-workstation.css`, `frontend/theme.css`, scoped shell rules | Reuse shipped material; no token palette or theme change |

No new module, framework, endpoint, generic modal library, or persisted state is
required. The exported workstation interface to the app shell stays unchanged.
The existing module continues to own async cancellation and generation matching;
layout controls do not acquire a second analysis or case-file lifecycle.

## Existing contract witnesses

The generated facts appendix records current paths, source locations and replay
inventory. The named groups below are the initial reconciliation set, not
permission to ignore other matches found by the complete scan.

- Clock gestures/readout/lane: preserve the live story group for preset, draw,
  slide, resize, wrapping windows, no-motion press, touch and lane exclusivity;
  move their coordinate assertions with the overview.
- S75/S76: Watching and direct drill/focus; keep end-user behavior while removing
  any dock-only setup. S76 must continue to open details on Enter.
- S114–S116 and S118–S120: inspect each explorer, Watching-tail, focus, viewport
  and selected-star consumer. Retain behavior that survives the dock; replace
  retired setup with direct All charts entry.
- S127 and S130–S131: reconcile dock visibility, resize and drawer-pick witnesses
  into permanent retired-mode absence checks plus surviving browser-pick checks.
  Do not delete historical retirement entries or executable IDs silently.
- S128–S129 and S132: retain root-stage fallback, shared explorer drill and served
  headline ownership; replace the removed drawer's current-cell witness with the
  corresponding current-chart indication in All charts.
- S122–S126: preserve settings chart/queue parity and per-parameter clock-window
  release. Moving the overview changes no advisory judgment.
- S139–S144: amend tapered geometry, first-row no-mini, tier placement and drawer
  comparison assumptions. Compare each row mini against the existing registry
  mini option over the same descriptor data; the All charts full-size plot is
  not a pixel-equivalent mini oracle. Retain unpriced drill, width omission and
  Sift-to-root-stage witnesses.
- C41–C57 and D1–D3: preserve case-file/evidence behavior in the full replay;
  avoid selectors whose presence formerly depended on the dock being mounted.

Retirement sanction: ADR 341 in `design.md`, including the quoted proposal and
Connor's confirmation. The ledger amendment must carry the operator, date,
quotation, premise and permanent executable absence witness required by ui-craft.
The current ledger remains frozen for the current base until implementation
creates and validates its amended revision.

## Closed consumer inventory for the implementation

Implementation and tests:
- `frontend/diagnose-workstation.js`
- `frontend/diagnose-workstation.css`
- `frontend/diagnose-findings-queue.js`
- `frontend/diagnose-canvas-state.js`
- `frontend/diagnose-canvas-layout.js`
- `frontend/diagnose-workstation-chart.js`
- `frontend/theme.css`
- `frontend/shell.css`
- `frontend/diagnose-findings-queue.test.js`
- `frontend/diagnose-canvas-state.test.js`
- `frontend/diagnose-canvas-layout.test.js`
- `frontend/diagnose-workstation.test.js`
- `frontend/diagnose-workstation-chart.test.js`
- `frontend/index.test.js`
- `frontend/diagnose-workstation.browser.test.mjs`
- `frontend/diagnose-canvas-composition.browser.test.mjs`
- `frontend/cockpit-shell.browser.test.mjs`
- `frontend/diagnose-workstation-behavior.replay.mjs`
- `frontend/diagnose-event-comparison-behavior.replay.mjs`
- `frontend/verify-660-story-behavior.replay.mjs`
- `frontend/diagnose-behavior-ledger-parity.test.js`

Current documentation and generated consumers:
- `DESIGN.md`
- `mockups/INDEX.md`
- `mockups/finding-evidence-routing.behavior.md`
- `mockups/finding-evidence-routing.exploration/data.json`
- `mockups/finding-evidence-routing.exploration/evidence-table.extracted.js`
- `mockups/finding-evidence-routing.exploration/app-base.extracted.css`
- `mockups/diagnose-evidence-canvas.exploration/index.html`

The generated files are outputs only: use their existing producers unchanged.
Historical change records and independent historical mock templates are context,
not descriptions of the revised app to rewrite. No production API is renamed;
`harness/` API strings therefore require no change. The public surfaces spec is
changed by this change's delta and normal archive workflow, not by editing the
baseline `openspec/specs/surfaces/spec.md` during implementation.
