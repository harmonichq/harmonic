# Tasks — Setting panel label column (#362)

- [x] Give the label/value rows one shared, content-sized column in
      `frontend/diagnose-workstation.css`: a `.numrows` group declaring
      `grid-template-columns: minmax(88px, max-content) auto 1fr`, with `.numrow`
      taking `grid-template-columns: subgrid; grid-column: 1 / -1` and keeping its
      existing 8px gutter, baseline alignment and 4px row rhythm. Retire the fixed
      `88px auto 1fr` track list. Every `.numrow` must sit inside a `.numrows`
      group: a row left outside one has no grid to subgrid onto and loses its
      columns entirely.
- [x] Wrap the three rows of the setting detail panel (`renderParamLevel`,
      `frontend/diagnose-workstation.js`) and the two rows of the past-setting read
      (`renderHistoryLevel`, same file) in `.numrows`, changing no label, number,
      qualifier or order.
- [x] Assert the geometry in `frontend/diagnose-workstation.browser.test.mjs`,
      through the panels it already opens — the rounded-false correction-factor
      detail across its viewports, and the dense past-setting read at 390x844. For
      every label/value row on screen: the label fits its column
      (`k.scrollWidth <= Math.ceil(k.getBoundingClientRect().width)`), the label
      occupies one line box (a `Range` over its contents returns one client rect),
      and every value in one panel shares one left edge. Confirm the assertion
      fails on the pre-change stylesheet before keeping it.
- [x] Run the repository's full fast gate (pytest, the frontend tests, `openspec
      validate --all --strict`, and the three guard scripts) and both browser legs
      this surface owns, with zero failures: the Diagnose workstation browser gate,
      and the frozen behaviour replay
      (`frontend/diagnose-workstation-behavior.replay.mjs`, `TARGET=app`) against
      the safe-start server `AGENTS.md` declares. The replay must report its full
      story count — 163 of 163 at this change's base — and exit 0. This surface has
      shipped, so its ledger is frozen: a failing story means the change is wrong,
      never that the story should move.
