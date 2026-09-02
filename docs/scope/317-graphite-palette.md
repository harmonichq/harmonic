# Graphite palette, second lock — triage and review ledger

Ticket: #317 (second half of #304; ordinary ticket, no epic parent)

## Grounding (verified live in this triage, 2026-09-02)

- Base: `origin/main` at 34264622 (archive of `dark-only-theme`, #316). #314
  landed lock 1: one dark theme, Dark computed values byte-identical to the
  pre-#304 surface (identity diff: 0 unexplained over 4.19M properties).
- The prototype ladder (70726e5) is already the shipped ladder: desk `#0f0d0b`,
  well `#14120f`, field `#1e1a17`, sheet `#221e1b`, rail `#2b2622`, rule
  `#3f3833`, edge `#453d35` (ADR 255). What remains is not a re-ladder but the
  named collisions.
- Orange today: `--primary` = `--high` = `--mk-accent` = `#e07f3f`;
  `--accent` `#d08150`; `--wk-signal` = `--manual-carb` `#d2743e`;
  `--ck-bar-signal` `#dc7b42`. Day/Nav/Scenario/Diagnose high marks read
  `--high`; 85 `var(--primary)` control sites across the shell and workstations.
- Chrome bar: `--ck-ground: var(--wk-canvas)` in `frontend/theme.css`; cockpit
  S6 (amended under ADR 304) pins bar ground == desk ground, no hairline.
- Verify ribbon: `accentSoft` / `mutedSoft` mix at 20/20 in
  `frontend/verify-workstation.js`; the 32/18 dark arm keyed on
  `dataset.theme`, which nothing ever set, so 20/20 is the only arm that ever
  rendered. #314 inlined 20/20.
- UI Craft router: `{"mode":"revise","reason":"safe synthetic data source declared"}`.
  Safe start: `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`
  (AGENTS.md "The data boundary"); database from `scripts/gen_revise_e2e_db.py`.
- Contracts: `mockups/cockpit-shell.behavior.md` + `frontend/cockpit-shell.browser.test.mjs`;
  `mockups/finding-evidence-routing.behavior.md` + `frontend/diagnose-workstation-behavior.replay.mjs`.
- Drift gates that move with any token: `mockups/diagnose-evidence-canvas.exploration/generate.py --check`,
  `mockups/finding-evidence-routing.exploration/build.mjs --check` (both current on base).
- Colour literals pinned in fast-gate and browser-gate files (counts of hex/rgb
  matches): cockpit-shell 5, diagnose-workstation 10, canvas-composition 1,
  index.test.js 5, diagnose-evidence-charts.test.js 25. #304's ledger records
  the prototype bytes failing canvas-composition test 13, workstation tests
  20/23/24 and replay S23 by one pixel.
- Closed document inventory carrying the moving values (non-archive):
  DESIGN.md; frontend/{index.html,theme.css,shell.css,diagnose-workstation.css};
  frontend/{cockpit-shell.browser.test.mjs,index.test.js,diagnose-evidence-charts.test.js};
  mockups/cockpit-shell.behavior.md; mockups/diagnose-evidence-canvas.exploration/{canvas.tpl.html,generate.py,index.html};
  mockups/finding-evidence-routing.exploration/{app-base.extracted.css,build.mjs,contrast-report.json};
  openspec/changes/{canvas-anchor-depth,chrome-bar-signal}/design.md (history, not re-pointed);
  PRODUCT.md:34 still says "teal/muted-terracotta" (stale since #736).
- Precedent: #255 treated an operator-approved live prototype as the settled
  spec and ran three serial chunks. #317 has no approved values yet; the ticket
  body names the attended round as the work.
- Reviewer memory: store present; nearest slicing anchors are a lifecycle-gated
  chart revision and a browser-matrix surface revision, both recorded as
  under-sliced at two chunks.
- No standing-decisions source configured. No `Harden:` line → Profile none.

## Decisions

- Classification `code`; surface lifecycle `revise`; route verified above. inline
- Q1 → A: attended start. The lock pins the decisions below and the gates; the
  executing session iterates the no-fetch app with the operator in UI Craft
  revise rounds, then lands and re-bases the gates in the same ticket. Why: the
  ticket names the attended round as the work; a headless worker cannot make
  the palette calls. → ADR
- Q2 → A: high-glucose marks leave orange for a new hue (amber family, kept
  apart from the "incomplete" status amber); orange stays the action and
  signal colour. Exact value settled at the app. Why: DESIGN.md and the
  prototype make orange the brand action colour. → ADR
- Q3 → A: the bar stays as shipped; the round looks at Plan and Day, where the
  bar and the page behind the cards are one shade (seen live 2026-09-02), and
  moves the bar one step only if they read flush there. On Diagnose and Verify
  the workstation panes cover the page, so the frame already reads as its own
  material. Why: the ticket's claim was narrower than stated; one look settles
  it. inline
- Q4 → A/B at the app: the round renders 32/18 and 20/20 side by side under
  the Verify gate's fixture payload (the synthetic database has no Trial), with
  32/18 shown first as the default. Why: the documented dark arm never
  rendered; the operator wants to see both. inline
- Q5 → B: the operator's eye wins. A pinned contrast floor may re-settle only
  with a dated operator sanction recorded in the change design record; pinned
  literals re-base freely. Why: operator answer "my eyeballs win"; UI Craft
  revise lets the eye outrank a metric that measures the wrong thing. → ADR
- Operator ruling 2026-09-02: the executing session serves and inspects the
  app itself before asking the operator anything (task 1.1, ADR 317). inline
- Live look, 2026-09-02, no-fetch server at :8317 from this worktree: Day shows
  high-glucose dots, the highs count, the active-step pill, the month picker and
  the Log carbs plus in one orange (Q2 collision in one screen).

## Open questions

Round 1 (Q1–Q5) answered 2026-09-02. Frontier empty.

## Spawned tasks

None.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
