# Evidence — event-chart discovery

All renders use committed synthetic inputs. No personal or production health
data appears here.

## Provenance

- Base: `02d400ed6b62c79a8eb8d8283c0c7c83c95421de`, served from a detached
  worktree with `harmonic serve --no-fetch` and
  `mockups/revise-e2e.synthetic/harmonic.sqlite`.
- Revision: this change, served with the same no-fetch command and the same
  generator-authored SQLite bytes.
- Deterministic API reads: `mockups/diagnose-workstation.synthetic/payload.json`
  and the generated findings-projection mirror.
- Themes: Light and Dark.
- Standard viewports: 1440×900 and 1024×900.
- Narrow root viewport: 390×844.

## Matrix

`base/` and `revision/` contain exact pairs for:

- root;
- deepest breadcrumb;
- setting detail;
- eligible Finding detail;
- incompatible Finding detail;
- pending findings projection;
- failed findings projection;
- By event; and
- By clock after returning from By event.

Each paired state is rendered at both standard viewports in both themes. The
base root is also rendered at 390×844 in both themes.

Revision-only states use the shipped base root as their labeled comparator:

- `menu-open`;
- `filtered-root`; and
- `returned-root`.

Those states are rendered at both standard viewports in both themes. Revision
root and menu-open are also rendered at 390×844 in both themes; the Filter
trigger and all six menu items are wholly inside that viewport.

## Review observations

- The canvas and Findings pane headers remain one 30px seam at both standard
  viewports and in both themes.
- Removing the global Sift instrument does not move the chart, pooled data, or
  pane boundary.
- The Filter menu uses the shipped rail, surface, rule, ink, and focus tokens;
  it does not introduce a new material or color role.
- Event charts preserves server order and changes only the visible queue rows.
- Direct entry replaces only the canvas projection; the Findings path and
  right-pane width stay fixed.
- The known predecessor defect at 390×844 remains outside this issue: the
  underlying two-pane/chart layout is clipped. The new root Filter itself is
  reachable and contained, which is the narrow contract owed by issue #83.
