# Tasks — Findings-queue rows keep their control role (#363)

## 1. Give the row back its control role

- [x] In `frontend/diagnose-findings-queue.js`, enclose each painted row button in
      an element that carries `role="listitem"` and a class the stylesheet can
      select, appended to the `role="list"` container in the row's place.
- [x] Remove the `role` attribute from the row element itself. It stays a
      `<button type="button">` with its `qrow` classes, its `data-id`,
      `data-state` and `data-tier`, its children and its click handler unchanged.
- [x] Give the wrapper of an unpriced tail row a marker the stylesheet can select,
      so the tail's own spacing rules can address it.
- [x] Leave `role="list"` on the `.q` container, the rank numeral's `aria-hidden`,
      the tier captions, the tail note and the `Watching · N reads` toggle exactly
      as they are.

## 2. Keep the queue's rendered rhythm on the new flex item

- [x] In `frontend/diagnose-workstation.css`, move the three adjacent-sibling
      rules that target tail rows onto the wrapper, which is now the flex item of
      `.dw .q`: `.dw .tailnote + .qrow.tail { margin-top: -4px }` (`:1578`),
      `.dw .qrow.tail + .qrow.tail { margin-top: calc(4px - var(--q-gap)) }`
      (`:1579`, and `--q-gap: 10px` at `:1375`, so `-6px`), and the `760px` block
      `.dw :is(.tailnote + .qrow.tail, .qrow.tail + .qrow.tail) { margin-top: 0 }`
      (`:1712`).
- [x] After the move the rules produce the same rendered result from a different
      element: the row itself reports no margin of its own, and the queue's
      painted pieces keep the vertical gaps measured in the acceptance criteria.
      Do not preserve the old computed value on `.qrow`; preserve the geometry.
- [x] Change no other queue rule. `.dw .qrow` and every descendant, attribute and
      state selector under it keep addressing the button.

## 3. Prove the exposed shape through the module's public interface (fast gate)

- [x] Extend the queue test's DOM stub so `document.createElement` records the tag
      name it was given and `setAttribute` records the attributes it was called
      with; today both are discarded
      (`frontend/diagnose-findings-queue.test.js:66,70,142,146,163,167`).
- [x] Add a test through `renderFindingsQueue` asserting that every painted row is
      a `button` element carrying no `role` attribute, that each is enclosed by an
      element whose `role` is `listitem`, and that the container's `role` is still
      `list`. Run it against the unfixed module first and record that it fails for
      that reason.
- [x] Update the existing `#341` structure tests, which walk the container's
      children by class name, so they reach rows through the wrapper without
      changing what they assert about a row's own structure.

## 4. Re-run the reproduction in a browser (browser gate)

- [x] Add one case to `frontend/diagnose-workstation.browser.test.mjs` that
      measures, against the built app, what triage measured: the number of
      elements inside `#level .q` exposed with the `button` role that are
      `.qrow` equals the number of `button.qrow` in the DOM, and
      `getByRole('button', { name })` scoped to the queue matches exactly one
      element for each row's own title.
- [x] That case belongs in this suite, not in the behaviour replay: this file's
      own header scopes it to browser coverage that is not already the replay's
      job, and computed ARIA exposure is exactly that. Run it against the unfixed
      app first and record that it fails.

## 5. Record the added behaviour in the frozen ledger

- [x] Add exactly one story, `C60`, to `mockups/finding-evidence-routing.behavior.md`
      and its replay function to the `STORIES` table of
      `frontend/diagnose-workstation-behavior.replay.mjs`: a reader navigating by
      control reaches a finding by its own title and activating it opens that
      finding's case file. Under the surface's `revise` lifecycle an added
      behaviour owes a story and a replay function in the same change.
- [x] `C60`'s ledger text must carry the words `pending operator sanction at the
      #350 sweep PR`. This sweep has no attended operator, and the sweep's single
      pull request is where the operator sanctions it.
- [x] Update the ledger's three inventory lines (`:14-16`) to match: the issued
      count goes from `164` to `165`, and `C60` joins both the issued and the
      active lists. `C58` and `C59` are reserved by siblings #364 and #354 and do
      not exist on this branch, so this branch reads `C41–C57, C60` in both.
      `S117` stays the only retired ID. Those three lines are the sweep's
      predictable merge conflict; the integrator resolves them.
- [x] The replay reports `app: 164 of 164 stories passed` once `C60` is
      registered; it reports `163 of 163` at the base commit.
- [x] Amend no existing story, retire nothing, and change no other ledger line.
      `frontend/diagnose-behavior-ledger-parity.test.js` fails unless the ledger's
      inventory and the replay's registered stories agree, so both files move in
      this change or neither does.

## 6. Prove nothing else moved

- [ ] Run every fast-gate leg and confirm each matches its recorded expectation.
- [ ] Run all five browser gate legs that locate `.qrow` — the Diagnose
      workstation suite, the canvas-composition suite, the cockpit shell suite,
      the Diagnose workstation behaviour replay and the event-comparison
      behaviour replay — and confirm each matches its recorded expectation.
- [ ] The workstation replay is the one that snapshots per-row geometry (`tagX`,
      `queueLeft`, and the term-44 `queueRules` border count) and the one that
      carries a keyboard story on a queue row: `S76` focuses
      `#level .qrow[data-id="finding:carb_undercount"]`, presses Enter, and
      asserts the Findings crumb restores focus to the element whose `data-id` is
      that row. `data-id` stays on the button, so `S76` must still pass unchanged.
