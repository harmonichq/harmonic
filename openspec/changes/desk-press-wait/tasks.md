# Tasks — desk browser helpers wait for the control they act on (#457)

Decisions and the helper audit are the two ADR 457 records in `design.md`. Test
numbers are run-order positions on b03431d2 (43 tests).

Commit order: section 1 (task 1.4), then section 3 (task 3.3), then section 2.
Task 4.5 compares against the task 3.3 commit, so the selection change must land
before the helper edit it measures.

## 1. Prove first (one commit, before any helper or selection change)

- [ ] 1.1 In `frontend/desk.browser.test.mjs`, directly after test 25, add the
      browser test named
      `press waits for a Day return control that renders late, and names an absent or hidden control`
      (first ADR 457 record, decision 5). It opens
      `/day?date=${DAY}&subject=pattern%3Aserved-pattern&window=1320-120&from=diagnose`
      with a `beforeNavigate` route on `**/api/model-view*` that holds each
      request until released and then calls `route.fallback()`. While the read
      is held it asserts `countOf(page, '[data-day="return"]')` is 0. It awaits
      `press(page, '[data-day="return"]')` together with a release that fires
      after the press has started, then asserts Diagnose is current. It then
      requires `press(page, '[data-no-such-control]', 500)` to reject with
      exactly `no control matched [data-no-such-control] after 500 ms`, and
      `press(page, '.gf-utility-strip [data-utility="guide"]', 500)` to reject
      with a message that starts with that selector and ends
      `all hidden after 500 ms`. It releases the hold in its `finally` before
      closing the desk.
- [ ] 1.2 In `frontend/c4.replay.test.js`, beside the R8 fake-page test, add a
      dependency-free test named
      `railRowLocator waits for a settled Findings rail before it reads the row shape`.
      It imports `railRowLocator` from `./diagnose-replay.mjs` and drives it
      over a fake page whose rail shows no row and no fold until its
      `waitForFunction` is awaited, then paints a claimed cause behind one
      closed fold. It requires the resolved locator to be the folded cause's
      `.qmember` and the closed fold to have been clicked first. Run
      `node --test frontend/c4.replay.test.js` against the unchanged helper and
      confirm the new test fails because the helper counted before the rail
      painted, then waited for a cause line that never rendered.
- [ ] 1.3 In `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`
      `SmokeSelectionTest`, add tests that drive `acceptance.smoke_selection`
      through the class's fake Git over two in-memory trees, as the pinned
      spike `docs/scope/457-replay-selection.spike.py` does (second ADR 457
      record). The cases:
      (a) a replay entry imports `./diagnose-replay.mjs`, and a helper there
      feeds S2 only. An edit to that helper selects the fixed slice plus S2.
      (b) An edit to `frontend/replay-pump.py`, which a replay entry names by
      path, selects every id, and so does an edit to a module a replay entry
      loads with a destructured `require('./…')`, named other than the
      already-global `frontend/browser-runner.js`.
      (c) An edit to a data fixture a replay entry names by path selects only
      the fixed slice.
      (d) Each of these stops the selection with a `RuntimeError` naming the
      file: a relative import of an untracked file; a dynamic `import()` in an
      imported module; a relative side-effect import; a default import; a
      `{ default as … }` import; an `export … from`; an `export * from`; and
      an imported name that the target module declares only through a local
      `export { … as … }` list, which leaves a dependency key with no node.
      Run `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py SmokeSelectionTest`
      against the unchanged `acceptance.py`, and confirm that (a), (b) and (d)
      fail because the selection neither follows the import nor sees the
      path-named files.
- [ ] 1.4 Commit 1.1–1.3 alone, with the subject
      `Red proof #457: tests before any helper or selection change`, and
      record its full OID beside this task when ticking it. This commit is the
      base proof for task 5.1.

## 2. Bounded helpers

- [ ] 2.1 Rewrite the desk suite's `press` as the first ADR 457 record's
      decision 1 states: `press(page, selector, timeout = 30000)`, a bounded
      wait for the first visible match, the click, the 180 ms settle, and the
      two failure messages that name the selector and the bound. On timeout the
      message's count comes from one fresh `page.locator(selector).count()`,
      never from the visibility-filtered locator. Update its doc comment to
      match.
- [ ] 2.2 In `frontend/diagnose-replay.mjs`, make `railRowLocator` wait for the
      settled, painted rail first (decision 2), failing with a message that
      names the id when the rail never settles. Update its comment to match.
- [ ] 2.3 Delete the desk suite's `openRailRow`. Its four callers press
      `await railRowLocator(page, id)`, and the `empty` High-carb render test's
      inline fold loop becomes `const member = await railRowLocator(page, id)`,
      importing `railRowLocator` beside the suite's other
      `./diagnose-replay.mjs` imports (decision 3).
- [ ] 2.4 In tests 19, 23, 26 and 29, wait for
      `page.locator('.gf-stage-day')` to be visible right after `openDesk`,
      before the first read of Day (decision 4; coordinator ruling Q1). Tests
      24 and 25 stay as they are, and so do the post-press count checks
      (ruling Q2).
- [ ] 2.5 `frontend/desk.browser.test.mjs` and `frontend/diagnose-replay.mjs`
      ship in the public tree: their new or changed comments may cite ADR 457,
      but never a `docs/scope/` or `openspec/changes/` path.

## 3. The PR ledger's selection follows the replay's modules

- [ ] 3.1 In `mockups/sweep/harmonic-v2-desktop/acceptance.py`, port the
      spike's two changes into `smoke_selection` (second ADR 457 record,
      decisions 1–3). Keep `replay_graph`'s signature and output,
      `SMOKE_STORIES` and its digest, the global files and symbols, and the
      recipe graph. `smoke.json` gains `replay_modules` and `path_loads`.
      Update `smoke_selection`'s docstring to match.
- [ ] 3.2 In `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md`, section "PR
      smoke, full main/nightly runs, and backend shards (#406 chunk 2)", revise
      the paragraph that begins "`--base <ref>` compares the merge-base". It
      must state that the selection follows every module the replay reaches by
      a static import, wherever it lives, and that an executable the replay
      names by path selects the complete ledger. It must state that an import
      the selection cannot follow stops the plan, and that product modules a
      story imports now select that story. The paragraph that begins
      "`smoke.json` records" names the two new records. No other text in
      ACCEPTANCE.md changes; its count sentence is the coordinator's.
- [ ] 3.3 Commit 3.1 and 3.2 alone, after task 1.4 and before any section 2
      change, with the subject
      `Selection #457: the PR ledger follows every module the replay loads`,
      and record its full OID beside this task when ticking it.

## 4. Verify without a port (worker)

- [ ] 4.1 `node docs/scope/457-press-wait.repro.mjs` prints the after-fix rows
      its header states: the late Return press and both `railRowLocator` rows
      `resolved`, and the absent and hidden presses `rejected` after about
      100 ms with the two bounded messages.
- [ ] 4.2 `node --test 'frontend/**/*.test.js'` passes, including the new
      `railRowLocator` test and R8.
- [ ] 4.3 `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py ReplayPlanTest InventoryProofTest SmokeSelectionTest`
      passes, including the new selection tests and
      `test_fixed_slice_is_pinned_and_covers_every_real_replay_case` with its
      digest unmoved.
- [ ] 4.4 `npx --yes @fission-ai/openspec@1 validate --all --strict`,
      `python3 scripts/check_adr_numbers.py`,
      `python3 scripts/check_owned_identifiers.py`,
      `python3 scripts/check_public_allowlist.py` and AGENTS.md's public-tree
      scan (`build_public_tree.py`, then `check_public_links.py` and
      `scan_public_tree.py` over a fresh directory) pass.

- [ ] 4.5 On the final commit, run
      `REPLAY_SHARDS='{"smoke":["1/1"],"full":["1/4","2/4","3/4","4/4"]}' uv run python mockups/sweep/harmonic-v2-desktop/acceptance.py replay-plan --base <task 3.3 OID> --out <fresh directory outside the checkout>`.
      Its `plan.json` must report mode `smoke`. Its `selected` ids that are not
      in `SMOKE_STORIES` must be exactly the 32 the pinned spike prints for a
      `railRowLocator` edit:
      S12, S21, S22, S23, S24, S25, S26, S27, S29, S61, S62, S82, S133, S136,
      S137, S124, R1, R2, R3, R4, R5, R6, R7, R9, R10, R11, R12, R13, R14, R15,
      R16, R17. Record that comma-separated list beside this task when ticking
      it; task 5.4 replays it.

## 5. Verify in a browser and on a port (coordinator; serial, after `npm ci && npm run build`)

- [ ] 5.1 Red proof: on the task 1.4 commit,
      `node --test --test-name-pattern 'press waits for a Day return control' frontend/desk.browser.test.mjs`
      reports tests 1, fail 1 with the line `✖ press waits for a Day return control that renders late, and names an absent or hidden control`, failing at the late
      Return press with `no control matched [data-day="return"]`. On the final
      commit it reports tests 1, pass 1 with the line `✔ press waits for a Day return control that renders late, and names an absent or hidden control`. A pattern
      that matches nothing also reports tests 1, pass 1 (the file itself), so
      the named line is the evidence, not the count.
- [ ] 5.2 Repetition, on the final commit: ten consecutive runs of
      `--test-name-pattern 'a key pressed on Day leaves the parked Diagnose'`
      each report tests 1, pass 1 with the line `✔ a key pressed on Day leaves the parked Diagnose as it was, and the Day return keeps it with no guidance re-read`. Ten consecutive runs
      of
      `--test-name-pattern 'Day owns its chronology|canonical Day address reloads|after a Day return, acting inside Diagnose|a key pressed on Day leaves|press waits for a Day return control|a utility takes the reading pane|repeated entry and exit leaves'`
      each report tests 7, pass 7 with one `✔` line for each of:
      `Day owns its chronology, its week ribbon, its month and the Episode Log`;
      `a canonical Day address reloads through the built shell and returns through its canonical Diagnose door`;
      `after a Day return, acting inside Diagnose re-addresses it in place, and its Findings address reloads with no case open`;
      `a key pressed on Day leaves the parked Diagnose as it was, and the Day return keeps it with no guidance re-read`;
      `press waits for a Day return control that renders late, and names an absent or hidden control`;
      `a utility takes the reading pane's seat, marks its launcher, and gives focus back on Close`;
      `repeated entry and exit leaves no duplicate chart, pane or utility behind`.
- [ ] 5.3 The whole desk suite, once, on the final commit: tests 44, pass 44.
- [ ] 5.4 The stories the new selection adds for the `railRowLocator` edit, at
      1280x720, on the final commit, with a fresh `CASE_STORE_DIR` and port
      8765 free:
      `TARGET=app VIEWPORT=1280x720 BASE_URL=http://127.0.0.1:8765 ONLY=<task 4.5's recorded list> node frontend/desk-behavior.replay.mjs`
      reports `# executed 32 · failed 0 · deferred 0 · selected 32`, with a
      `PASS` line for each of the 32 ids.
- [ ] 5.5 The complete `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py`,
      which binds a port in `ServerLifecycleTest`, passes on the final commit.
