# Cockpit shell behavior ledger

★ FROZEN 2026-08-21 · base b075c715a497b55e684f966cf046dc9179f428ab · generator n/a · window n/a · fixtures diagnose-workstation payload: 80bc31c8b528, event-comparison capture: d72cabec05bf, explore fixture module: 2331cbe8efad, findings mirror: 4fee56325999, generated findings projection: 6cee39026000 · predecessor shipped app at base · retired 1

The exact transported bytes are `mockups/diagnose-workstation.synthetic/payload.json`, `mockups/diagnose-event-comparison.synthetic/capture.json`, `mockups/explore-investigation.fixture.js`, `mockups/findings-projection.mirror.mjs`, and `frontend/__fixtures__/findings-projection.json` at the pinned base SHA. They are manufactured/synthetic inputs served by the app-only opener in `frontend/cockpit-shell.browser.test.mjs`; no live server, fetch, personal database, credential, or network response participates. Source inventory covered the shell markup and Vue handlers in `frontend/index.html`, the interaction selectors in `frontend/shell.css` and `frontend/theme.css`, the imported tab-routing helper, and the fixture projections imported by the opener.

No QUESTION remains open. Every active story and permanent retirement below is exported, tagged, and registered in `COCKPIT_SHELL_STORIES`; the replay prints its nonzero applicable count and every retirement sanction, and the opener aborts unknown or missing requests.

## Stories

S1 · The viewport stays fixed while each populated pane scrolls internally, and the advisory sentence remains whole.
  handlers/invariants: tab content swaps; pane overflow; viewport and footer geometry across tabs, themes, and locked desktop sizes
  source: `frontend/index.html` shell stage/footer; `frontend/shell.css` frame and pane rules
  evidence: `STORY:cockpit-shell:S1` / exported `S1`; full matrix remains in the surrounding Cockpit browser gate
  status: replayed-pass on base

S2 · The numbered Diagnose → Plan → Verify workflow, Day link, utility destinations, and canonical `/app/<page>` route all route through their visible public affordances.
  amendment: Connor · 2026-08-21 · ADR 53, approved work order: paths identify pages and the URL adapter is the sole route-state authority.
  handlers/invariants: `@click="shellGo(...)"`; native Day link; `url-state.js`
  source: `frontend/index.html` cockpit top bar, footer utilities, and `shellGo`
  evidence: `STORY:cockpit-shell:S2` / exported `S2`
  status: replayed-pass on base

S3 · Theme opens a radio menu; choosing Dark updates the rendered theme, checked state, persisted choice, and closes the menu.
  handlers/invariants: Theme `@click`; menu-row `@click="setDark(...)"`; `toggleDark` and `setDark`
  source: `frontend/index.html`; `frontend/shell.css` menu states
  evidence: `STORY:cockpit-shell:S3` / exported `S3`
  status: replayed-pass on base

S4 · Log carbs opens the teleported quick-entry form and accepts a gram value without leaving the shell frame.
  handlers/invariants: Log carbs `@click="qlToggle()"`; quick-log form input/close handlers
  source: `frontend/index.html` quick Carb log entry; `frontend/shell.css` popover anchoring
  evidence: `STORY:cockpit-shell:S4` / exported `S4`
  status: replayed-pass on base

S5 · Glossary and Carb questions remain reachable from the footer and open their respective dialog/drawer through their buttons.
  handlers/invariants: glossary and question `@click` handlers; dialog close
  source: `frontend/index.html` footer utilities and drawers
  evidence: `STORY:cockpit-shell:S5` / exported `S5`
  status: replayed-pass on base

S6 · Desktop chrome keeps reachable pointer targets, three type ranks, and exactly the desk/bar/control material vocabulary.
  handlers/invariants: hover/focus target geometry; across-theme material and typography invariants
  source: `frontend/shell.css`; `frontend/theme.css`
  evidence: `STORY:cockpit-shell:S6` / exported `S6`; deliberate mutation block in the same gate
  status: replayed-pass on base

S7 · At 390×844 the labeled destination drawer starts off-canvas and opens to six reachable destinations without changing the desktop shell.
  handlers/invariants: menu-button `@click`; drawer open watcher; drawer destination handlers and focus states
  source: `frontend/index.html`; `frontend/shell.css` responsive drawer rules
  evidence: `STORY:cockpit-shell:S7` / exported `S7`; full keyboard regression remains in the surrounding gate
  status: replayed-pass on base

S8 · Plan and Carb-question counts reflect the opener's synthetic state and retain their reserved shell geometry.
  handlers/invariants: computed workflow badges; prompt and draft loaders
  source: `frontend/index.html`; fixture routes in `frontend/cockpit-shell.browser.test.mjs`
  evidence: `STORY:cockpit-shell:S8` / exported `S8`
  status: replayed-pass on base

S9 · The current workflow step keeps its geometry, signal outline, bright label, filled number disc, and focus treatment with no plate fill.
  amendment: Connor · 2026-08-21 · ADR 49, approved work order: remove the plate fill while retaining the existing boundary, disc, label, focus, and geometry
  handlers/invariants: `[aria-current="step"]`; `:focus-visible`; route changes move current state without reflow
  source: `frontend/shell.css`; `frontend/theme.css`; `frontend/index.html`
  evidence: `STORY:cockpit-shell:S9` / exported `S9`; base renders under `openspec/changes/chrome-bar-surface-states/evidence/`
  old-fail/new-pass: amended assertion failed on the base light fill `rgb(135, 73, 40)`; passed after the ADR 49 CSS revision; deliberate fill-restoration mutations fail in both themes
  status: amended 2026-08-21 · replayed-pass on revision

S10 · Opening Theme and hovering the unchecked row paints a neutral 95% panel / 5% meta lift while checked state remains orange and keyboard focus remains separate.
  amendment: Connor · 2026-08-21 · ADR 49, approved work order: reserve orange for checked/persistent signal and make transient hover a neutral lift
  handlers/invariants: `.cockpit-utility-menu button:hover`; `:focus-visible`; `[aria-checked="true"]`
  source: `frontend/shell.css`; `frontend/index.html`
  evidence: `STORY:cockpit-shell:S10` / exported `S10`; base renders under `openspec/changes/chrome-bar-surface-states/evidence/`
  old-fail/new-pass: the amended hover relationship would fail on the base because hover equaled `--ck-accent-soft`; it passes after the ADR 49 CSS revision; deliberate signal-well-restoration mutations fail in both themes
  status: amended 2026-08-21 · replayed-pass on revision

## Retired behavior

R1 · The obsolete occurrence-list route stays retired while the Diagnose Inspector remains the sole populated occurrence-evidence path; invalid canonical links stop in the shell without applying a selection.
  sanction: Connor · 2026-08-18 · "the dead `occurrenceModal` hash machinery goes with them."
  handlers/invariants: a fixture-derived stale `modal=occurrences` URL canonicalizes to `#diagnose`; no accessible occurrences dialog or second roster appears; a public finding-row click populates the Inspector
  source: `frontend/index.html`; generated findings/exposures inputs in `frontend/__fixtures__/findings-projection.json`
  evidence: `STORY:cockpit-shell:R1` / exported `R1`; source-adjacent `RETIRED:Connor:2026-08-18`; independent canonical-hash and duplicate-route mutations
  status: retired 2026-08-21 · replayed-pass on revision

## Inventory completeness

All shell navigation, Theme, quick Carb log entry, Carb questions, Glossary, drawer, hover, focus, checked/current state, viewport, cross-tab, cross-theme, count, material, type-rank, and responsive invariants map to S1–S10. The retired occurrence-list route maps permanently to R1. The browser gate's Diagnose/Verify seam and event-comparison assertions remain independent carried regressions; they do not register cockpit-shell handlers and are not relabeled as shell stories.
