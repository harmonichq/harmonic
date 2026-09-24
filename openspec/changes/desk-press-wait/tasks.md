# Tasks — desk browser helpers wait for the control they act on (#457)

Decisions and the helper audit are ADR 457 in `design.md`. Test numbers are
run-order positions on b03431d2 (43 tests).

## 1. Prove the races first (one commit, before any helper changes)

- [ ] 1.1 In `frontend/desk.browser.test.mjs`, directly after test 25, add the
      browser test named
      `press waits for a Day return control that renders late, and names an absent or hidden control`
      (ADR 457 decision 5). It opens
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
- [ ] 1.3 Commit 1.1 and 1.2 alone, with no other change: this commit is the red
      proof (task 4.1).

## 2. Bounded helpers

- [ ] 2.1 Rewrite the desk suite's `press` as ADR 457 decision 1 states:
      `press(page, selector, timeout = 30000)`, a bounded wait for the first
      visible match, the click, the 180 ms settle, and the two failure messages
      that name the selector and the bound. Update its doc comment to match.
- [ ] 2.2 In `frontend/diagnose-replay.mjs`, make `railRowLocator` wait for the
      settled, painted rail first, as ADR 457 decision 2 states, failing with a
      message that names the id when the rail never settles. Update its comment
      to match.
- [ ] 2.3 Delete the desk suite's `openRailRow`. Its four callers press
      `await railRowLocator(page, id)`, and the `empty` High-carb render test's
      inline fold loop becomes `const member = await railRowLocator(page, id)`,
      importing `railRowLocator` beside the suite's other
      `./diagnose-replay.mjs` imports (ADR 457 decision 3).
- [ ] 2.4 In tests 19, 23, 26 and 29, wait for
      `page.locator('.gf-stage-day')` to be visible right after `openDesk`,
      before the first read of Day (ADR 457 decision 4). Tests 24 and 25 stay as
      they are.

## 3. Verify without a port (worker)

- [ ] 3.1 `node docs/scope/457-press-wait.repro.mjs` prints the after-fix rows
      its header states: the late Return press and both `railRowLocator` rows
      `resolved`, and the absent and hidden presses `rejected` after about
      100 ms with the two bounded messages.
- [ ] 3.2 `node --test 'frontend/**/*.test.js'` passes, including the new
      `railRowLocator` test and R8.
- [ ] 3.3 `npx --yes @fission-ai/openspec@1 validate --all --strict`,
      `python3 scripts/check_adr_numbers.py`,
      `python3 scripts/check_owned_identifiers.py` and
      `python3 scripts/check_public_allowlist.py` pass.

## 4. Verify in a browser (coordinator; serial, after `npm ci && npm run build`)

- [ ] 4.1 Red proof: on the task 1.3 commit,
      `node --test --test-name-pattern 'press waits for a Day return control' frontend/desk.browser.test.mjs`
      reports tests 1, fail 1, failing at the late Return press with
      `no control matched [data-day="return"]`. On the final commit it reports
      tests 1, pass 1.
- [ ] 4.2 Repetition, on the final commit: ten consecutive runs of
      `--test-name-pattern 'a key pressed on Day leaves the parked Diagnose'`
      each report tests 1, pass 1. Ten consecutive runs of
      `--test-name-pattern 'Day owns its chronology|canonical Day address reloads|after a Day return, acting inside Diagnose|a key pressed on Day leaves|press waits for a Day return control|a utility takes the reading pane|repeated entry and exit leaves'`
      each report tests 7, pass 7.
- [ ] 4.3 The whole desk suite, once, on the final commit: tests 44, pass 44.
- [ ] 4.4 The replay stories that resolve rail rows, at 1280x720, on the final
      commit, with a fresh `CASE_STORE_DIR` and port 8765 free:
      `TARGET=app VIEWPORT=1280x720 BASE_URL=http://127.0.0.1:8765 ONLY=R8,S22,S23,S24,S124,S125 node frontend/desk-behavior.replay.mjs`
      reports `# executed 6 · failed 0 · deferred 0 · selected 6`.
