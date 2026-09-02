# Finish the graphite palette on the running app (#317)

## Why

#304 retired Light and shipped one dark theme with every computed value held
byte-identical to what shipped before (lock 1, PR #314). The graphite ladder
from ADR 255 is already that shipped surface: desk, well, field, sheet, rail,
rule and edge are the prototype's values. What the prototype never settled are
the collisions the ticket names, and they need the operator's eye on the
running app rather than a headless worker's guess:

- high-glucose marks and tappable controls share one burnt orange (`--high`
  and `--primary` are both `#e07f3f`), so clinical attention and affordance
  read as the same thing on the Day surface;
- the Verify trial ribbon's documented dark tints (32%/18%) never rendered
  because they were keyed on a theme attribute nothing set, so 20%/20%
  shipped and the intent was never seen;
- the cockpit chrome bar shares the page's outermost shade, which reads as a
  separate frame where a workstation fills the page (Diagnose, Verify) and as
  one flush sheet where cards sit on the page directly (Plan, Day);
- `DESIGN.md`'s palette swatches name the shipped values, so every value moved
  here moves there too.

## What changes

- The attended UI Craft revise round settles each ruling above in the running
  no-fetch app with the operator and records each as a dated sanction in this
  change's design record: high-glucose marks leave orange for a hue of their
  own; the ribbon tints are chosen from a side-by-side render; the bar moves
  one step only if Plan and Day read flush.
- The app's single `:root` token block and the rules that consume the moved
  tokens change to the sanctioned values; the two verbatim extraction
  generators regenerate; `DESIGN.md`'s swatches and prose follow.
- Every fast-gate pin and browser-gate pin that named a moved value re-bases;
  the contrast audit re-runs and its report regenerates; the cockpit ledger's
  S6 amends only if the bar moved.
- Evidence of record: a computed-style diff between the ticket base and the
  revision, served from two worktrees on the same synthetic database, proving
  that only colour-valued properties resolving from a moved token differ, and
  before/after renders of every affected state.

## Risk contract

- **Must prevent:** any change to advisory verdicts, staging, published chart
  data, or interactions; a frontend-derived staging verdict; weakening a
  browser gate or replay so it asserts less than it did (re-basing a pinned
  literal to the sanctioned value is not weakening; lowering a contrast floor
  without the operator's dated sanction is); a stale generated extract; a
  moved value that lands without its sanction in the design record; real data
  in fixtures, captures, or logs; silent incorrect success.
- **Must recover:** nothing automatically.
- **Accepted failure:** a missing browser driver, vendored asset, or synthetic
  database fails closed and needs manual environment repair.
- **Unsupported:** any ladder value from ADR 255 (desk, well, field, sheet,
  rail, rule, edge, inks); the mobile Day hero; any surface or token the
  attended round did not rule on; the `PRODUCT.md` palette sentence (stale
  since #736, tracked separately).
- **Evidence owed:** the design-record sanction for each ruling; the fast gate
  and all ten browser legs green; every `--check` generator current; the
  contrast audit's regenerated report; the palette-only computed-style diff
  with its complete output; before/after renders of the affected states at
  1440×900, 1280×800 and 390×844.

Why: this changes the colour that marks a high glucose reading on an advisory
dosing instrument, and the gates that guard it are the artifacts being
re-based.

Disposition: inline in this proposal and unchanged in the locked work order.

## Impact

- `frontend/index.html` (`:root` token block), `frontend/theme.css`,
  `frontend/shell.css` (only if the bar moves), `frontend/verify-workstation.js`
  (ribbon mix percentages).
- `mockups/diagnose-evidence-canvas.exploration/` and
  `mockups/finding-evidence-routing.exploration/`: regenerated extracts and
  the regenerated contrast report.
- `DESIGN.md` palette swatches and the Data Semantics entries for high glucose.
- `frontend/index.test.js`, `frontend/cockpit-shell.browser.test.mjs`,
  `frontend/diagnose-workstation.browser.test.mjs`,
  `frontend/diagnose-canvas-composition.browser.test.mjs`: pins that name a
  moved value; `mockups/cockpit-shell.behavior.md` S6 only if the bar moves.
- `mockups/INDEX.md` and `openspec/changes/graphite-palette/evidence/`.
- `docs/scope/317-graphite-palette.md`: the triage scope ledger.
