# Tasks — a rejected Plan save leaves nothing staged (#358)

- [x] Make the shell's draft save report its outcome. `savePlanDraft()` in
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

- [x] Undo a refused stage in the shell's Plan draft. `diagnoseStage(item,
  desired)` in `frontend/index.html` captures the reactive draft state before it
  mutates it, awaits the draft save, and on a refusal restores exactly the
  captured state, on every branch: the ISF branch (which stages through
  `toggleIsfPlan`, whose own save must therefore be awaitable by this caller),
  the unstage branch, and the stage branch. It reports the refusal to its
  caller. After a refusal the Plan step badge and the Plan screen show what the
  server holds, which for a first refused stage is nothing.

  **The captured state is all three of `planItems`, `deliverableEdits` and
  `deliverableEditsVersion`, not `planItems` alone.** `keepOnlyPlanFamily` in the
  same file clears both maps: it deletes non-family entries from `planItems`
  *and* deletes non-family keys from `deliverableEdits`, then bumps
  `deliverableEditsVersion`. `deliverableEdits` is client-only state feeding
  `deliverableRowsRaw`, never re-read from the server, so a restore naming only
  `planItems` hands the reader back their draft while permanently discarding the
  hand-edits the refused stage cleared — which the spec delta's own criterion,
  that the Plan draft holds exactly what it held before, forbids. Bump the
  version counter on restore too, so the deliverable rows repaint from the
  restored map instead of keeping the cleared render.

- [x] Undo a refused stage on the Diagnose surface. Each of the three stage
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

- [x] Cover the whole path with a browser regression test in
  `frontend/cockpit-shell.browser.test.mjs`, whose `routeApp` already serves the
  real `frontend/index.html` with the whole API stubbed and whose `analyze`
  fixture already carries one asserting basal slot (`slot: 2`) and one asserting
  I:C block (`block_id: 'day'`). Give `openApp`/`routeApp` an option that
  answers `PUT /api/plan` with a 400 and a JSON `detail`, in the same shape as
  the existing `promptCount` / `planDraftItems` options. Opening Diagnose,
  drilling to an asserting finding and clicking the stage control must then
  leave: `.stagebtn` reading the unstaged label with `data-staged="false"`;
  `#watch-dock` without its `Plan · staged` branch; the Plan step badge
  (`[data-shell-tab="plan"] .cockpit-badge`) reporting zero; and a `.toast.err`
  whose text is `Plan save failed: ` followed by the stubbed detail, unchanged.

  **Read the Plan badge's zero from `data-count` or `textContent`, never
  `innerText`.** `frontend/shell.css` carries
  `.cockpit-badge[data-count="0"] { visibility: hidden; }`, and Playwright's
  `innerText()` on a `visibility: hidden` node returns `''`, not `'0'`. The
  suite's three existing uses of that selector all assert a visible `'2'`, so the
  surrounding idiom does not cover the hidden zero this test needs and copying it
  produces a wrongly-red gate. The committed reproduction already reads
  `data-count`.

  **The dock assertion is reachable in this suite specifically.** `routeApp`
  stubs `/api/outcomes/trend` as `{}`, so `diagnoseWatched` is null and
  `watchDockView` falls through to its `plan` branch. Against a served database
  with a watched Trial it does not, which is why the committed reproduction
  asserts the button, badge and draft but not the dock.

  **Cover all three families — basal, I:C and ISF.** The change touches all three
  stage handlers, and this repo's convention is that new behaviour ships with a
  test through the public interface, so the ISF handler must not ship untested.
  The `analyze` fixture already carries an asserting basal slot (`slot: 2`) and
  an asserting I:C block (`block_id: 'day'`), but its single ISF row has
  `recommended: null` and no `asserts_move`, and `isStageableIsf`
  (`frontend/plan.js`) is exactly `item.asserts_move === true` — so that row
  makes the ISF branch a no-op. No generator authors this fixture; it is
  test-local. Cover ISF by passing `routeApp`'s existing `findingsInput` option
  (already used elsewhere in this suite) an `analysis` whose one ISF row asserts:
  keep the backend's own field name and shape from `analyzers/isf.py` — one
  `start_min: 0` "Fasting" row — and give it `asserts_move: true` plus a
  `recommended` that differs from `current`. Do not hand-set the flag on a row
  whose other fields contradict it, and do not add a second ISF row: the backend
  emits exactly one. `/api/pump-settings` is already stubbed with two segments,
  which `toggleIsfPlan` fans the pick across.

  **Add one refused-stage case that starts from an existing cross-family
  hand-edit**, since that is the state task 2's widened capture exists for: on
  the Plan screen, change a deliverable input in one family (the `@change` on the
  deliverable cell calls `editDeliverable`, which writes `deliverableEdits` while
  no plan item is staged), then stage a finding from a different family in
  Diagnose and refuse the save. The hand-edit must be back afterwards, not
  silently dropped.

  Run every case against the unfixed code first and record that it fails for the
  right reason — the button still reads staged — not because the fixture or the
  option is wrong.
