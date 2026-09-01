# Ship one dark theme: retire Light (#304)

## Why

Harmonic maintains two palettes and neither gets full design attention. The
operator retired the light theme on 2026-09-01 so that one dark, cohesive theme
can be finished under the graphite direction already recorded by ADR 255. The
parent composition (#305) locks in dark, so the base theme lands before any
visual lock.

This change is the mechanical half of #304: Light becomes unreachable and every
Dark rule collapses into the base while Dark keeps rendering exactly as it does
today. The attended design round that finishes the graphite direction (green
confined to data marks, the shared orange between action controls and
high-glucose marks) follows in a second locked order on the same ticket once its
values are settled in the running app under UI Craft revise.

## What changes

- Retire the light palette, the footer Theme menu, the `theme` localStorage key,
  and the boot-time `html.dark` class gate. The document renders dark with no
  class and no stored preference.
- Collapse every `html.dark`- and `html:not(.dark)`-scoped rule into its base
  rule, preserving Dark's computed values and cascade order.
- Re-point the two verbatim-extract generators (evidence canvas, finding-evidence
  routing) and the local screenshot wrapper at the single token block, and
  regenerate their committed outputs.
- Re-base the browser gates, replays, and support audit to one theme; retire the
  theme-menu and theme-repaint stories from the behavior ledgers under the
  operator's sanction; prove Dark's computed styles are unchanged between the
  ticket base and the revision.
- Record that ADR 37 (light ground) and ADR 230 (theme repaint preserves
  Diagnose context) describe retired behavior.

## Risk contract

- **Must prevent:** any change to advisory verdicts, staging, published chart
  data, or interactions; a frontend-derived staging verdict; weakening a browser
  gate or replay so it asserts less than it did (dropping the Light half of a
  paired assertion is re-basing; dropping the Dark half is weakening); a stale
  generated extract; real data in fixtures, captures, or logs; silent incorrect
  success.
- **Must recover:** nothing automatically.
- **Accepted failure:** a missing browser driver, vendored asset, or synthetic
  database fails closed and needs manual environment repair.
- **Unsupported:** any palette value change (that is the second lock); the mobile
  Day hero; the retired light theme in any form, including a vestigial control.
- **Evidence owed:** a computed-style identity diff of Dark between the ticket
  base and the revision across the gated states and viewports; the fast gate and
  all ten browser legs green; every `--check` generator current; the amended
  behavior ledgers replaying green with each retirement carrying its sanction.

Why: this re-skins every shipped surface of an advisory dosing instrument, and the
gates that guard it are the very artifacts being re-based.

Disposition: inline in this proposal and unchanged in the locked work order.

## Impact

- `frontend/index.html`, `frontend/theme.css`, `frontend/diagnose-workstation.css`,
  `frontend/verify-workstation.css`: token block and rule collapse;
  `frontend/shell.css` loses the Theme menu's styles.
- `frontend/diagnose-evidence-charts.js`, `frontend/verify-workstation.js`: the
  Dark arm of each theme-selected constant is inlined.
- `harness/`: the theme select and URL parameter retire.
- `mockups/diagnose-evidence-canvas.exploration/`,
  `mockups/finding-evidence-routing.exploration/`, `scripts/screenshots.local.*`:
  extraction and capture re-pointed and regenerated.
- Browser suites, replays, support audit, and the two behavior ledgers re-based.
- `DESIGN.md` and `mockups/INDEX.md` record the one-theme lock;
  `openspec/changes/dark-only-theme/evidence/` holds the identity diff.
