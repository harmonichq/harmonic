# Design — Setting panel label column (#362)

## ADR 362 — The setting panel's label column is sized by its labels, not by a constant

### Context

`.numrow` laid its label, value and qualifier on `88px auto 1fr` with an 8px
gutter. The label is uppercased and tracked at `--ck-micro`, and that band is not
one value: 10px where the token is declared, 11px inside the workstation, and
14px for a past-setting read below 760px. Measured in the running app with the
shipped type: `CURRENT` 58.6px, `ESTIMATE` 61.0px, `RECOMMENDED` 97.1px,
`PAST SETTING` 88.9px, `MEASURED` 68.1px at 11px; `RECOMMENDED` 123.6px and
`PAST SETTING` 113.1px at 14px. At the 10px the constant was evidently sized
against, `RECOMMENDED` already measured 88.3px.

So the constant fits neither band it now serves. A single-word label overruns —
`RECOMMENDED` puts 9px of glyphs into the 8px gutter and onto the number — and a
two-word label wraps instead, which is how the past-setting read has been
rendering a two-line label at every viewport.

### Decision

The label column is sized from the labels of the panel it belongs to. The rows of
one panel are grouped in a `.numrows` grid whose first track is
`minmax(88px, max-content)`, and each `.numrow` becomes a subgrid of that group,
so the column is as wide as the longest label present and every row of the panel
still shares it. The 88px survives as a floor, so a panel whose labels are all
short is unmoved.

### Alternatives rejected

- **Widen the constant.** No value serves both bands: 97px is needed at 11px and
  113px at 14px, so a width that fits the narrow past-setting read wastes a third
  of the setting panel's label column, and the next label or micro-band change
  re-opens the defect. This is the failure being fixed, not a repair of it.
- **`minmax(88px, max-content)` on `.numrow` with no grouping.** Measured in the
  app: the overrun clears, but each row then sizes its own column and the
  Recommended value starts 9px right of the two above it. `renderParamLevel`
  exists to keep one geometry across basal, I:C and the correction factor, and a
  reader comparing three numbers is exactly who a staggered column costs.
- **`display: contents` on `.numrow`.** Reaches the same shared column, but
  removes the row's own box, and with it the row rhythm and any future per-row
  rule. Subgrid keeps the row a real element and changes one track list.

### Consequences

The setting panel's numbers sit 9px further right, within the pane; the
qualifier column absorbs it. Subgrid is new to this stylesheet; it is supported
in the browser the gates drive and in every browser the app already requires for
CSS grid. The geometry is asserted by measurement in the browser gate rather than
by a value pinned in a test, so a future label longer than its column fails the
gate instead of shipping.

This revises a shipped surface, so its frozen behaviour ledger
(`mockups/finding-evidence-routing.behavior.md`) and replay
(`frontend/diagnose-workstation-behavior.replay.mjs`) are the contract, and both
are unamended here: no story's behaviour changes, because this restores geometry
the panel already promises. That claim is tested rather than asserted — the replay
runs against the built app on this branch and must pass every frozen story, 163 of
163 at this change's base. It is deliberately not left to first run on the shared
sweep pull request, where a failure would arrive attributed across sixteen tickets
instead of this one.
