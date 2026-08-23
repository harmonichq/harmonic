# Scope — Align keyboard focus in finding detail (#96)

Ticket: [#96](https://github.com/harmonichq/harmonic/issues/96) — "By clock / By
event Align choices are skipped by keyboard traversal", from the #93 cold-QA
sweep, fingerprint `kbd-diagnose-detail-align-skipped`.

Every claim below was reproduced against the app in this worktree with a
throwaway Playwright probe driving the committed fixture opener
(`openApp(browser, { appSource: 'fixture', ... })`,
`PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json`). Nothing here is
carried over on trust from the ticket text or the behavior ledger.

## Decisions

- **Align has three live entry paths and two callback branches.** Sweeping every
  root row at each opener state under the DEFAULT filter, `state: 'typical'` shows
  `#align-group` hidden at root and in all four finding details — which is what an
  earlier revision of this ledger wrongly generalised to "Align never renders under
  `typical`". It does: the repo's own green test
  `frontend/diagnose-workstation.browser.test.mjs:493` opens `state: 'typical'`,
  presses Filter → Event charts, drills the first row, and waits on
  `#seg-align button[aria-pressed="true"]` reading "By event". The three entry paths
  are therefore the case-file branch (`state: 'drawn'`, root row "Over-treated low"),
  the #83 event-discovery entry (`state: 'typical'` + Filter → Event charts), and the
  I:C history branch (`state: 'typical', history: true`, root row "Carb ratio
  Morning. Past setting."). `paintAlign` branches on `isHistory`
  (`frontend/diagnose-workstation.js:1840-1841`), so the first two share one callback
  arm (`requestCase`) and only the history path is distinct. Two callback branches
  need covering, not three entry paths. inline

- **The reported symptom is not the defect.** Both Align choices are ordinary
  tab stops (`tabIndex 0`), are reachable by Tab, and under real keyboard focus
  do match `:focus-visible` and paint Chromium's UA ring
  (`outline: auto 1px rgb(153, 200, 255)`). Measured on both live paths: 32 Tab
  presses from the top of the document on the case-file path, 17 on the I:C
  history path. The QA reviewer's "never receives focus" is a traversal-distance
  artifact — Align sits at tabbable index 11, *before* the detail, while the 48
  `#lane` buttons occupy indexes 13-60 and the breadcrumb sits at 61, so a
  forward pass begun inside the detail never reaches Align and a reverse pass
  crosses the whole lane first. inline

- **The real defect: keyboard activation of an Align choice destroys the focused
  element.** `renderAlign` (`frontend/diagnose-workstation.js:356-367`) runs
  `seg.innerHTML = ''` and rebuilds both buttons on every paint, and it is
  called from `paintAlign` (line 1850) on every paint. After Enter or Space on a
  choice, `aria-pressed` moves correctly but `document.activeElement` is
  `<body>`; one further Tab lands back on "By clock", i.e. the reader is
  returned to the top of the document and must retraverse. Reproduced on both
  `paintAlign` branches. → issue (#96 work order)

- **The control that proves it is the WINDOW group, in the same module.**
  `#seg-window` buttons are also plain tab stops, but `renderInstruments`
  (line 329) runs exactly once (line 1052) and later presses are patched in
  place by `pressPreset` (line 401) and `markWindowSegment` (line 378). Measured:
  after Enter on "Morning", `document.activeElement` is still that button.
  Align is the only segmented group in this module rebuilt per paint. inline

- **Fix shape: reconcile the two Align buttons in place, mirroring
  `pressPreset`.** Build them once, then update `aria-pressed` per paint instead
  of wiping the group, and rebind the per-paint handler by assignment
  (`b.onclick = ...`) rather than stacking `addEventListener` calls — the same
  idiom `paintFilter` already uses for its trigger at line 2013. This removes
  the cause rather than compensating for it. The alternative already in the repo
  — the Filter menu's track-an-index-and-restore-focus-after-repaint dance
  (`filterFocus`, lines 2015-2017 and 2053-2055, via `requestAnimationFrame`) —
  is the fallback if in-place reconciliation fights the paint path; it is
  strictly more machinery for the same outcome. inline

- **Add `#seg-align button:focus-visible` to `frontend/diagnose-workstation.css`,
  labelled as consistency, not as the fix.** The stylesheet declares its own
  accent ring for every sibling control (`.dw button.qrow:focus-visible` line
  718, `.history-run:focus-visible` line 870, `.filter-menu button:focus-visible`
  line 432 — of which only the first is a safe model here, because `.seg` sets
  `overflow: hidden` at line 145-149 and clips the outward `outline-offset: 1px`
  the `.history-run` rule uses; pin the inward `outline-offset: -2px` form) but declares none for either segmented group, which is why the measured
  ring is the browser's and not the app's. The selector is scoped to `#seg-align`
  deliberately: `.seg` is also the class on `#seg-window`
  (`frontend/diagnose-workstation.js:76` and `:84`), and this ticket does not change
  the WINDOW group. A ring reached by programmatic `.focus()` does not match
  `:focus-visible` at all — measured `outline: none` after a mouse click versus
  `outline: auto 1px rgb(153, 200, 255)` when reached by real Tab — so any evidence
  for this rule must arrive at the button by Tab. The ticket's expectation names "shows a
  focused choice", so this lands here; it is not what was broken. inline

- **No roving Arrow/Home/End inside Align in this ticket.** Measured: ArrowRight
  on a focused Align choice does nothing today. The ticket's stated expectation
  — Tab reachability, a visible focused choice, keyboard activation — is fully
  met by the shipped `role="group"` + `aria-pressed` toggle-button pattern once
  focus survives activation. Converting to roving would take the group from two
  tab stops to one, a change to a frozen behavior contract that wants its own
  ruling. Default assumed; see open question 2. inline

- **Surface lifecycle is `revise`.** `mockups/INDEX.md` carries the surface
  "Finding → evidence routing (Diagnose + Verify)" as `shipped`. UI Craft's
  router returns `{"mode":"revise","reason":"safe synthetic data source
  declared"}` for embodiment `shipped` / runnability `runnable` / declaration
  `complete` / data-source `synthetic`; no refusal. Safe start is the sole
  offline entrypoint `AGENTS.md` declares,
  `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`,
  whose database is generated in full by `scripts/gen_revise_e2e_db.py` from
  fixed seed 620 (recorded in the 2026-08-19 revise safe-start amendment,
  `openspec/changes/finding-evidence-routing/design.md:248`). Frozen behavior
  ledger: `mockups/finding-evidence-routing.behavior.md`. App-only replay:
  `frontend/diagnose-workstation-behavior.replay.mjs`. inline

- **The frozen ledger's P27 describes behavior the app no longer has, and its
  retirement was never sanctioned.** P27
  (`mockups/finding-evidence-routing.behavior.md:583`) reads "Segmented
  instrument groups take roving Arrow/Home/End focus with wraparound
  (`installSegKeys`)", verdict `kept`, sourced to
  `frontend/diagnose-event-comparison.js:337-350`. `installSegKeys` does not
  exist anywhere in the repo: it was deleted by `1d06530` (#55, 2026-08-19), and
  the ledger was frozen earlier the same day by `482d347` (#44) — verified as an
  ancestor of it. No `role="group"` segmented control survives in
  `diagnose-event-comparison.js` at all. The 2026-08-21 re-freeze for #83
  carried P27 forward unchanged, because it looked for behavior with no story,
  not for a story with no behavior. Under UI Craft's revise rules this is an
  unsanctioned retirement, which only a named person can rule. An agent must not
  sanction it. → issue (open question 1)

- **The `#lane` group's 48 tab stops stay as shipped.** Ledger P27's own note
  records the mock's one-tab-stop lane as a mock addition the app does not have,
  operator-ruled kept on 2026-08-19. Changing it is a separate decision and
  would not fix this ticket. inline

- **Closed document inventory: no user-facing document describes Align's
  keyboard behavior.** Grepping the whole tree (excluding `.git`) for
  `seg-align` and `By clock` finds only shipping and test source
  (`frontend/diagnose-workstation.js`,
  `frontend/diagnose-workstation-behavior.replay.mjs`,
  `frontend/diagnose-workstation.browser.test.mjs`,
  `frontend/diagnose-event-comparison.js`,
  `frontend/diagnose-high-causes-have-no-alignment.test.js`), the frozen ledger,
  `mockups/INDEX.md`, the archived `mockups/finding-evidence-routing.exploration/`
  design record, and two prior scope/design notes. `README.md`, `docs/kb/` and
  `openspec/specs/` say nothing about it. The only contract document this change
  must amend is the frozen behavior ledger. inline

### Risk contract

- **Must prevent:** an Align activation changing anything it does not change
  today (the URL hash route, the breadcrumb level, the findings roster, the
  WINDOW group's pressed state or follow chip); a keyboard reader losing their
  place in the document after choosing an alignment; a regression in any frozen
  ledger replay story; a handler stacked once per paint so one keypress fires
  the callback more than once.
- **Must recover:** none. The change is presentational and read-only — it
  touches no analyzer, no `safety.py`, no write path and no cache-bumping
  endpoint.
- **Accepted failure:** the reverse keyboard path from the detail still crosses
  the 48 `#lane` buttons before reaching Align, and Align still sits ahead of
  the detail in DOM order. Neither is in this ticket.
- **Unsupported:** Arrow/Home/End movement inside Align; roving focus on the
  basal-slot lane; any change to `#seg-window`; the P27 ledger divergence, which
  is recorded for a named person rather than resolved here.
- **Evidence owed:** a browser-suite story that Tabs to Align, activates the
  other choice from the keyboard, and asserts both that the pressed choice
  changed and that focus is still on the activated button — proved to fail
  against the base for the right reason before it passes; the same assertion on
  the I:C history branch; an assertion that one keypress fires the alignment
  callback exactly once, counting `/diagnose/` requests with the idiom the replay
  already uses at `frontend/diagnose-workstation-behavior.replay.mjs:2151`, since
  "a handler stacked per paint" is a named must-prevent and construction alone is
  not evidence; the app's own focus ring proved with the button reached by real
  Tab, never by programmatic `.focus()`; every frozen ledger story green against
  the built revision, with its story count reported and unchanged.

Why: an advisory tool whose stated audience arrives tired or stressed, an
explicit accessibility label on the ticket, and a fix bounded to one control in
one module.
Disposition: inline

## Open questions

Both are for a named person. Neither blocks drafting the work order; question 1
blocks the revise sweep's completion, not the code change.

1. **P27 ruling.** The frozen ledger asserts roving Arrow/Home/End focus on
   segmented instrument groups via `installSegKeys`, which #55 deleted without a
   sanction. UI Craft's revise rules say a ledger story no longer present on the
   base is an unsanctioned retirement, and that no design conversation starts
   until a named person rules it with a date and quoted reason. Options: record
   a dated retirement sanction for P27; restore roving focus so P27 becomes true
   again; or amend P27 to describe only what still ships. Recommended: sanction
   the retirement now and, if roving is still wanted, file it as its own ticket
   — restoring it inside #96 would widen a focus-management bug fix into a
   keyboard-model change on a frozen surface.

2. **Roving focus inside Align.** Should the Align group become one tab stop
   with Arrow/Home/End between the two choices (the ARIA toggle-group
   convention), or stay two ordinary tab stops? Defaulted to staying two, since
   the ticket's expectation is met either way and the change would alter the
   surface's tab-stop count. Coupled to question 1.

## Spawned tasks

- None.
