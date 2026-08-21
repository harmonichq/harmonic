# Tasks — chrome bar surface states

## 1. Freeze the cockpit-shell behavior contract

- [x] Inventory the shipped shell's navigation, theme-menu, utility, focus, hover, and responsive-drawer behaviors against the safe offline app.
- [x] Record `mockups/cockpit-shell.behavior.md` with the base SHA and synthetic database provenance.
- [x] Deepen `frontend/cockpit-shell.browser.test.mjs` into the app-only replay seam: one exported, tagged function per story; an explicit registry and nonzero count; and failure on unknown or missing requests instead of a catch-all `200 {}`.
- [x] Capture the populated base current-step and open-menu-hover state in light and dark at 1440×900 and 1280×800 using that seam.
- [x] Register the shipped cockpit shell in `mockups/INDEX.md`.
- [x] Prove the relevant replay assertions fail under a deliberate temporary mutation and restore the source.

## 2. Implement and verify the settled states

- [x] Remove the current-step plate fill while retaining its existing outline, number disc, label ink, geometry, and focus treatment.
- [x] Replace the theme-menu orange hover wash with the neutral lift specified by ADR 49.
- [x] Amend exactly those two frozen behavior stories with the dated ADR 49 decision; prove the old expectations fail and the amended stories pass.
- [x] Add browser assertions in both themes for the rendered hover/current states and their computed contrast.
- [x] Capture before/after evidence at the cockpit shell's locked 1440×900 and 1280×800 sizes in light and dark; keep the existing 390×844 drawer regression green.
- [x] Run ui-craft audit and polish against the merged revision before opening the pull request.
- [x] Run the repository's complete fast gate and the cockpit-shell browser gate.
