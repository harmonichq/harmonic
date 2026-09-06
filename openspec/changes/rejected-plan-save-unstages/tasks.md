# Tasks — a rejected Plan save leaves nothing staged (#358)

- [ ] Make the shell's draft save report its outcome. `savePlanDraft()` in
  `frontend/index.html` reports whether the draft reached the server —
  successfully saved, or refused — instead of returning nothing on both paths.
  Its failure toast is unchanged: `flash('Plan save failed: ' + e.message,
  'err')`, where `e.message` is the server's own `detail`, unwrapped by
  `ApiTransportError` in `frontend/data.js`. Do not reformat, truncate,
  pattern-match or otherwise sanitize that string — the frontend prints what the
  server said, and the dict repr inside today's message is the backend's to fix
  (#357). Every existing caller that ignores the result (`togglePlan`,
  `toggleIsfPlan`, the chip removal path, the accepted-picks writers) keeps
  today's behaviour byte for byte.

- [ ] Undo a refused stage in the shell's Plan draft. `diagnoseStage(item,
  desired)` in `frontend/index.html` captures the reactive `planItems` state
  before it mutates it, awaits the draft save, and on a refusal restores exactly
  the captured state — including any entries `keepOnlyPlanFamily` cleared, and
  on every branch: the ISF branch (which stages through `toggleIsfPlan`, whose
  own save must therefore be awaitable by this caller), the unstage branch, and
  the stage branch. It reports the refusal to its caller. After a refusal the
  Plan step badge and the Plan screen show what the server holds, which for a
  first refused stage is nothing.

- [ ] Undo a refused stage on the Diagnose surface. Each of the three stage
  handlers in `frontend/diagnose-workstation.js` — the basal slot handler passed
  to `renderSlotLevel`, the I:C block handler passed to `renderIcBlockLevel`,
  and the ISF handler passed to `renderIsfLevel` — keeps today's order of
  operations exactly: toggle the local staged state, call `callbacks.stage(...)`,
  and paint immediately, without waiting on the call. Only then is the call's
  result awaited, and only when it explicitly reports a refusal does the handler
  restore the local staged state it had just changed (`staged`, `icStaged`,
  `isfStaged`) and paint a second time, so the stage button's label and
  `data-staged`, the watch dock's Plan branch and the Plan badge agree. Awaiting
  before the first paint is a regression: the frozen stories read the button
  straight after the click, and the success path must reach its staged rendering
  without waiting on a round trip. The success path gains nothing else — no
  toast, no dialog and no modal, which frozen story S16 asserts explicitly. An
  absent `callbacks.stage` and a callback that reports no refusal both count as
  success and revert nothing. Three mounts depend on that: the app shell passes
  `diagnoseStage`, `harness/stories.js` passes `stage: () => {}`, and
  `frontend/diagnose-workstation.browser.test.mjs` mounts the workstation with
  `callbacks: {}` and clicks the stage control — the latter two must keep
  staging. The frozen replay's S71 probe wraps the real callback and forwards
  whatever it returns, so it inherits the shell's answer.
  One shared treatment for all three handlers; no second
  implementation of the undo rule, and no re-derivation of any staging
  eligibility the backend already decided.

- [ ] Cover the whole path with a browser regression test in
  `frontend/cockpit-shell.browser.test.mjs`, whose `routeApp` already serves the
  real `frontend/index.html` with the whole API stubbed and whose `analyze`
  fixture already carries one asserting basal slot (`slot: 2`) and one asserting
  I:C block (`block_id: 'day'`). Give `openApp`/`routeApp` an option that
  answers `PUT /api/plan` with a 400 and a JSON `detail`, in the same shape as
  the existing `promptCount` / `planDraftItems` options. Opening Diagnose,
  drilling to an asserting finding and clicking the stage control must then
  leave: `.stagebtn` reading the unstaged label with `data-staged="false"`;
  `#watch-dock` without its `Plan · staged` branch; `[data-shell-tab="plan"]
  .cockpit-badge` at `0`; and a `.toast.err` whose text is `Plan save failed: `
  followed by the stubbed detail, unchanged. Cover both the basal and the I:C
  families, since the ticket names both handlers. Run it against the unfixed
  code first and record that it fails for the right reason — the button still
  reads staged — not because the fixture or the option is wrong.
