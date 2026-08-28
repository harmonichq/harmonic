# Design — Star means keep (#226)

## ADR 226 — A star retains a chart without changing findings rank

### Context

ADR 215's shipped dock model sorts starred charts ahead of the server-ranked
findings. The same record later established the dock as a filmstrip whose current
frame is marked without re-forming the row. Those rules conflict in use: starring
a chart teleports it left and makes the filmstrip jump.

The implementation already separates membership from placement. `seatableChartIds`
returns server-ranked charts followed by any still-live unranked stars. The later
`placeSeats` and `dockOrder` helpers currently sort stars to the front, and the
workstation paints the resulting ranked/starred set before the Watching tail.

### Decision

A star means **keep this chart in the dock**. It never changes a ranked chart's
position.

Ranked charts remain in server rank order. If a starred chart leaves rank while
its descriptor remains live, it follows the ranked group and precedes the
Watching divider. Stopping retention returns that chart to the existing automatic
membership rules. The spotlight remains a separate reader selection and never
changes row order.

The change deepens the existing interfaces rather than adding a new seam:
`seatableChartIds` continues to own ranked-plus-retained membership;
`placeSeats` and `dockOrder` preserve that candidate order; `paintTiles` renders
the resulting retained group before the existing Watching tail. Unlimited stars,
the star glyph, per-chart alignment, fullscreen, explorer, stale-generation
recovery, and chart rendering stay unchanged.

The 2026-08-26 ADR 215 amendment that says a pin orders the dock is superseded by
this decision. Its historical text remains in place with a forward reference to
ADR 226 rather than being rewritten as if the old behavior never shipped.

### Consequences

- Findings rank and filmstrip position remain stable while the reader stars and
  unstars ranked charts.
- A star still has visible value when rank or the selected window changes: the
  chart stays reachable immediately after the ranked group.
- The Watching divider continues to distinguish automatically ranked/retained
  charts from the unranked tail.
- No backend rank, recommendation, evidence, or staging semantics change.

## Safe revise source

The exact safe-start declaration is in `AGENTS.md` and names the generated
database `mockups/revise-e2e.synthetic/harmonic.sqlite`. The generator is
`scripts/gen_revise_e2e_db.py`. No fetch, credentials, `.env`, `tconnect-data/`,
live database, or patient data may participate.

## Verification design

The existing helper tests first demonstrate that pin-first sorting moves a later
ranked chart ahead of an earlier one. The revised assertions require candidate
order to survive star toggles while the membership helper continues to append a
live unranked star after ranked findings.

The built-app composition and frozen replay then exercise the same behavior
through the Diagnose surface: star a ranked dock cell without moving it, change
to a findings window where it is no longer ranked, observe it after all ranked
cells but before the first `data-tail-head` cell, and stop retention so the
existing Watching membership resumes. The old replay must fail before the new
one passes. Evidence uses the same generated synthetic source in desktop and
narrow viewports, Light and Dark.

### Observed revision results

The old helper, composition, workstation, and S120 replay assertions failed on
the expected pin-first ordering and copy before production edits. After the
revision, the complete fast gate passed (2,101 backend tests with one intentional
skip; 523 frontend tests), all thirteen documented drift checks were current,
the affected browser suites passed 41/41 and 13/13 tests, and the app-only
Diagnose replay passed 140/140 stories including S120. Sixteen paired synthetic
base/revision images cover both required states at 1440×900 and 390×844 in Light
and Dark.
