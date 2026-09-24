# Tasks — desk browser helpers wait for the control they act on (#457)

Decisions and the helper audit are the two ADR 457 records in `design.md`. Test
numbers are run-order positions on b03431d2 (43 tests).

Commit order: section 1 (task 1.4), then section 3 (task 3.3), then section 2.
Task 4.5 compares against the task 3.3 commit, so the selection change must land
before the helper edit it measures.

Coordinator-authorized (plan-review round 2, note 2; Q3 delegation, Connor
Griffin, 2026-09-23): a later fix to a section 3 file (`acceptance.py`,
`acceptance.test.py` or `ACCEPTANCE.md`) made after section 2 is folded into
the task 3.3 commit by rebase, so the order 1.4, 3.3, section 2 still holds.
The task 3.3 OID is then re-recorded here and task 4.5 is re-run.

## 1. Prove first (one commit, before any helper or selection change)

- [x] 1.1 In `frontend/desk.browser.test.mjs`, directly after test 25, add the
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
- [x] 1.2 In `frontend/c4.replay.test.js`, beside the R8 fake-page test, add a
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
- [x] 1.3 In `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`
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
- [x] 1.4 Commit 1.1–1.3 alone, with the subject
      `Red proof #457: tests before any helper or selection change`, and
      record its full OID beside this task when ticking it. This commit is the
      base proof for task 5.1.
      OID: `ce03aacd831fbb24aea5e5eea09d71422fb7bb3f`.

## 2. Bounded helpers

- [x] 2.1 Rewrite the desk suite's `press` as the first ADR 457 record's
      decision 1 states: `press(page, selector, timeout = 30000)`, a bounded
      wait for the first visible match, the click, the 180 ms settle, and the
      two failure messages that name the selector and the bound. On timeout the
      message's count comes from one fresh `page.locator(selector).count()`,
      never from the visibility-filtered locator. Update its doc comment to
      match.
- [x] 2.2 In `frontend/diagnose-replay.mjs`, make `railRowLocator` wait for the
      settled, painted rail first (decision 2), failing with a message that
      names the id when the rail never settles. Update its comment to match.
- [x] 2.3 Delete the desk suite's `openRailRow`. Its four callers press
      `await railRowLocator(page, id)`, and the `empty` High-carb render test's
      inline fold loop becomes `const member = await railRowLocator(page, id)`,
      importing `railRowLocator` beside the suite's other
      `./diagnose-replay.mjs` imports (decision 3).
- [x] 2.4 In tests 19, 23, 26 and 29, wait for
      `page.locator('.gf-stage-day')` to be visible right after `openDesk`,
      before the first read of Day (decision 4; coordinator ruling Q1). Tests
      24 and 25 stay as they are, and so do the post-press count checks
      (ruling Q2).
- [x] 2.5 `frontend/desk.browser.test.mjs` and `frontend/diagnose-replay.mjs`
      ship in the public tree: their new or changed comments may cite ADR 457,
      but never a `docs/scope/` or `openspec/changes/` path.

## 3. The PR ledger's selection follows the replay's modules

- [x] 3.1 In `mockups/sweep/harmonic-v2-desktop/acceptance.py`, port the
      spike's two changes into `smoke_selection` (second ADR 457 record,
      decisions 1–3). Keep `replay_graph`'s signature and output,
      `SMOKE_STORIES` and its digest, the global files and symbols, and the
      recipe graph. `smoke.json` gains `replay_modules` and `path_loads`.
      Update `smoke_selection`'s docstring to match.
- [x] 3.2 In `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md`, section "PR
      smoke, full main/nightly runs, and backend shards (#406 chunk 2)", revise
      the paragraph that begins "`--base <ref>` compares the merge-base". It
      must state that the selection follows every module the replay reaches by
      a static import, wherever it lives, and that an executable the replay
      names by path selects the complete ledger. It must state that an import
      the selection cannot follow stops the plan, and that product modules a
      story imports now select that story. The paragraph that begins
      "`smoke.json` records" names the two new records. No other text in
      ACCEPTANCE.md changes; its count sentence is the coordinator's.
- [x] 3.3 Commit 3.1 and 3.2 alone, after task 1.4 and before any section 2
      change, with the subject
      `Selection #457: the PR ledger follows every module the replay loads`,
      and record its full OID beside this task when ticking it.
      OID: `509ee1a4f89e2a0cf8078405e7d21bb7b919764c`. Earlier OIDs:
      - `41f2f97d35c663a1816534b4a0c8dcee1e6d8d8c`, first committed;
      - `1e78234a7f94187fd38905088c2a6b684610b67d`, with task 3.4;
      - `87164096ce8c9b9b964265d7045de4cbecdaedd7`, with task 3.5 before its
        replay-side narrowing;
      - `801681174dc5856d22462648d5248bcb8a2d76f5`, after that narrowing;
      - `2344bbd50e8f6df683ab1320048d4092dc1e98e5`, with task 3.6;
      - `64bc3aa2c577947b1630324fbaa8ef1ad1000962`, with task 3.7 before its
        impurity follow-up;
      - `7616e11a6bb90513f69e8974953c34fedf59c5ef`, with the first follow-up;
      - `d5dd948031fd5eda68ed6b40d87fff590136050a`, with the second follow-up;
      - `1cc876596e1620216a88312b11be39f18e601c9c`, with the allow-list;
      - `ef3927e6fbedaa4e17f631528890e91f8f116e2c`, with the read-result split;
      - `cc6760b9de0a69da82557ece2fc846c1ff9207cb`, with free globals and the
        timer delay;
      - `fd7210473bc8b274f62d1b03a303356ec116ac2b`, with the closing list
        additions;
      - `f5dac6df33ff910660ef4d3c7ba96dccdcaf87a2`, with the definitional
        ruling.
      Task 3.7 is folded into the current commit with every follow-up, the
      final pass's import-line fix included.
- [x] 3.4 Coordinator-authorized (code review round 1; Q3 delegation, Connor
      Griffin, 2026-09-23): fold the review's selection findings F1–F4 into
      the task 3.3 commit, as the design's amendment decisions 5–8 state.
      Their failing-first `SmokeSelectionTest` cases land with them:
      - F1: a `boundedWait`-shaped module-level wrapper, and a
        `const { locate } = make()` destructure.
      - F2: a namespace import stops the plan.
      - F3: an extensionless `require()`, a template literal and a
        `new URL(…, import.meta.url)`, each selecting every story, plus six
        forms that stop the plan.
      - F4: a deleted helper module recorded in `replay_modules`.
      Against the selection as first committed, 18 cases fail for those
      reasons: F1's wrapped and destructured callers go unselected, F2's
      namespace import passes, F3's path forms are unseen or unresolved
      silently, and F4's `replay_modules` omits the deleted module. All pass
      after the fix. Task 4.5 re-runs against the new task 3.3 OID.
- [x] 3.5 Coordinator-authorized (code review round 2; Q3 delegation, Connor
      Griffin, 2026-09-23): fold the review's finding N1 into the task 3.3
      commit as one general rule (the design's amendment decision 9). A changed
      key that no story's closure carries selects the complete ledger, naming
      the key. The rule keeps table-entry precision and the pinned 32 and 35
      `railRowLocator` lists. Its `SmokeSelectionTest` cases:
      - edits to the real `J` and `VIEWPORTS` each select the full ledger;
      - a `C2_STORIES.S82` edit selects S82 alone;
      - a `railRowLocator` edit selects the pinned 32, and 35 ids name it;
      - an import-line edit is carried by the names it binds;
      - a story-table change beyond its entries selects the full ledger.
      Against the selection with task 3.4, the `J`, `VIEWPORTS` and
      table-spread cases fail: each selects only the fixed slice. The three
      guards pass. All pass after the fix. Task 4.5 re-runs against the new
      task 3.3 OID.
      The coordinator's follow-up ruling narrows the rule to replay-side
      modules. A module the app's entry (`frontend/main.js`) reaches keeps the
      #406 policy, and an unreadable entry stops the plan. Its cases:
      - an unreached `plan.js` function edit leaves the fixed slice;
      - an edit to `segmentCapacity`, which S90 calls, selects S90;
      - an absent or unparseable app entry stops the plan.
      Against the un-narrowed rule, the first case and both entry cases fail
      (full ledger; no stop); the S90 case passes.
- [x] 3.6 Coordinator-authorized (code review round 3; Q3 delegation, Connor
      Griffin, 2026-09-23): fold the review's finding R3-1 into the task 3.3
      commit, as the design's amendment decision 10 states. The per-story
      runner (`main` and `openApp`) becomes a root of every story. Its walk
      stops at the registry and the story tables, `C4_RETIREMENTS` included.
      Its `SmokeSelectionTest` cases: an `APP_BASE_URL` default edit and an
      `ok` no-op each select every story, naming the key. The `J` and
      `VIEWPORTS` case now accepts either reason, since `VIEWPORTS` is
      runner-reached. Against the selection with task 3.5, both runner cases
      fail: they select a subset of the stories. Every earlier case still
      passes after the fix.
- [x] 3.7 Coordinator-authorized (code review round 4; Q3 delegation, Connor
      Griffin, 2026-09-23). Invert the default for replay code, as the
      design's amendment decision 11 states, and fold it into the task 3.3
      commit.
      - A replay-side change plans the complete ledger, naming the key, unless
        every changed key is a story-table entry that writes no module state.
      - A registry row whose id is not its function also plans the complete
        ledger.
      - Product-side modules keep the #406 policy.

      Its `SmokeSelectionTest` cases:
      - The A7c–A7f shapes and the A8, A9 and A10 shapes each plan the
        complete ledger: process handler, environment default, entry alias,
        wrapping loop, `this`, getter, module state and its member, and a
        registry row naming another story's function.
      - So do a story function, helper, deleted helper, tag, import line or
        `railRowLocator` edit.
      - Clean entry edits stay precise: C2 (also while reading module state),
        C3 and retired entries, plus the real S82, S45b and S101.
      - `J`, `VIEWPORTS`, `APP_BASE_URL` and `ok` plan full.
      - An unreached `plan.js` function stays in the slice.
      - `segmentCapacity` selects S90.
      - A product function the runner calls selects every story.
      - The app entry still stops the plan when it cannot be read.

      Against the selection with task 3.6, 19 cases fail: each selects fewer
      than every story. All pass after the fix.
      The coordinator's follow-up ruling closes the method-call gap, fail-safe.
      A changed entry is precise only if its closure, the entry included,
      reaches no impure replay-side node. A node is impure when it writes
      module state, reads `this`, is an accessor, or calls a method on module
      state, or when it calls an impure node. Its cases:
      - `STATE.list.push(x)` in an entry plans full;
      - an entry newly calling an existing writing helper plans full, and so
        does one calling a helper that uses a method on module state;
      - a clean entry calling a pure helper or a sibling entry stays precise;
      - the real S45b and S101 stay precise;
      - the real S82 now plans full, and its reason names
        `waitForReplayAssertion`.
      Against the decision-11 selection, 4 cases fail. All pass after the
      fix. On the real tree, 13 of the 132 story entries stay precise and 119
      reach an impure node; decision 11 lists them.
      The coordinator's second follow-up ruling adds a closed list of
      read-only method names, so a method on that list counts as a read.
      Module state passed to a call or constructor is impure unless the callee
      is one of two kinds: a graph function that leaves that parameter alone,
      with parameter mutations forwarded through the graph, or a closed list
      of read-only built-ins. Its cases:
      - these plan full: `Object.assign(STATE, …)`; a helper that mutates its
        parameter, called directly or through a relay; an iteration callback
        that mutates its element; a write through a local alias; module state
        passed to a constructor or an unknown callee;
      - these stay precise: reads through `get` and `includes`, module state
        passed to `JSON.stringify` or `Object.keys`, and a helper that only
        reads its parameter;
      - the real S82 is precise again, with no impure node in its reason;
      - the real S152 plans full, and its reason names itself.
      Against the first follow-up's selection, 8 cases fail. All pass after
      the fix. On the real tree, 129 of the 132 story entries stay precise.
      S113, S152 and S153 pass `RECOMMENDED_VALUE` to `assert.match`.
      The fresh verification's final ruling flips the proof to an allow-list:
      an entry is precise only when every reference to shared state in its
      closure sits in a recognized read position. Shared state also covers
      non-function bindings imported from another replay-side module, and
      every local alias. `ctx`'s functions are accepted as clean. Its cases:
      - these plan full: `Object.assign`, `Reflect.set` and a local-alias
        write on an imported C2 table; G2, a write through a `for…of`
        variable; G3, a parameter defaulted to module state; and G4, a
        computed method on module state;
      - these stay precise: a plain read of the imported table and a call to
        one of its entries;
      - S82, S45b and S101 stay precise, and every earlier case holds.
      Against the previous selection, 6 cases fail. All pass after the fix.
      On the real tree, 126 of the 132 story entries stay precise. S113,
      S152 and S153 stay full for the reasons above; S149 and S150 reach a
      computed read of `BAND432`; S151 passes a `LANE_REACH_SIZES` loop alias
      to `page.setViewportSize`.
      The coordinator's last ruling splits the read list by result type. A
      read that always returns a primitive ends the chain. Any other read's
      result is shared: its position must be a read position, and a local
      bound to it is an alias. The worker applies the same rule to a graph
      function that may return a parameter holding shared state, and leaves
      `test` off the list. Its cases:
      - these plan full: a written `get` result held in a local; a `get`
        result passed to an unknown callee; a written `find` result; a write
        to state a helper hands back; and the real S82, whose reason names
        the retry primitive;
      - these stay precise: `has`/`includes` reads, branching on `has`, a
        mapped length compared, and `String(peek(STATE))`.
      Against the allow-list selection, 4 cases fail: S82, the two `get`
      cases and the mapped length. The `find` and hand-back writes were
      already caught by the write-root rule. All pass after the fix.
      On the real tree, 13 of the 132 story entries stay precise. The 113
      newly full all reach `waitForReplayAssertion`, whose `getStore` result
      goes to `setTimeout`.
      The coordinator's final rulings accept the worker's three additions.
      They make `setTimeout`/`setInterval`'s delay argument a read position,
      and every free global name other than the known built-ins shared
      state. The worker adds two readings, reported to the coordinator: the
      primitive globals `undefined`, `NaN` and `Infinity` are not state, and
      a function Playwright sends to the story's page has page names, not
      shared ones. Its cases:
      - these stay precise: module state as a timer delay, a `process.env`
        read, a `document` read inside `page.evaluate`, and the real S82
        again;
      - these plan full: `Object.assign(process.env, …)`, a `globalThis`
        write, and module state passed as a timer callback.
      Against the read-split selection, 3 cases fail: S82, the
      `process.env` call and the timer delay. All pass after the fix. On the
      real tree, 113 of the 132 story entries stay precise; decision 11
      lists the 19 full ones.
      The coordinator accepts both readings and closes the design with three
      list additions:
      - `encodeURIComponent`, `decodeURIComponent`, `encodeURI`, `decodeURI`
        and `URLSearchParams` join the known and read-only built-ins;
      - `process.stdout.write` and `process.stderr.write` are output calls,
        recognized like `console`;
      - a non-computed `process.env.<name>` read yields a primitive.
      Its cases:
      - these stay precise: module state encoded or turned into a query, both
        output calls, and an environment value placed in a literal;
      - these plan full: another `process` method, a computed
        `process.env[…]` read, and an environment write.
      Against the free-global selection, the 4 new precise cases fail. All
      pass after the fix. On the real tree, 126 of the 132 story entries stay
      precise: every C2, C3 and retired entry, and every C4 entry but S113,
      S149, S150, S151, S152 and S153.
      The final verification's definitional ruling brings every mutable
      binding inside shared state: known globals, built-ins and Node imports
      (calling one of their functions stays a read); a literal that spreads
      or contains shared state; the parameters of any callback handed to a
      call that receives it; and the members of class and function bindings.
      `eval`, the `Function` constructor and a dynamic `import()` stop the
      plan. The worker adds two readings, reported to the coordinator: a
      built-in handed as an iterating read's callback (`.filter(Boolean)`)
      and a built-in in an `extends` clause are reads. Its cases:
      - these plan full: `Object.assign(JSON, …)`,
        `Object.defineProperty(Array.prototype, …)`, `Array.prototype` passed
        on, a write through `{ ...process }`, a write through a `for…of` over
        `[...STATE.list]`, a write through a literal holding module state, a
        write in `Array.from`'s mapper, `Registry.items.push(…)` on a static
        field, and `memo.list.push(…)` on a function-object property;
      - `eval`, an indirect `eval` and `new Function` stop the plan;
      - these stay precise: `JSON.stringify(STATE)`, `Math.max(…)`,
        `assert.equal(…)`, and calling or constructing a function or class
        binding.
      Against the closing-list selection, 11 cases fail: the three stop
      forms and every full shape but the literal, which that selection
      already refused. All pass after the fix. A first real-tree measure
      found 79 precise: a read method called on a built-in namespace
      (`Object.entries(params)`) carried the namespace itself into its
      result. A built-in's call now carries only what its arguments carry.
      On the real tree, 126 of the 132 story entries stay precise, the same
      six full for the same reasons.
      The final pass found one gap: an edit to a `node:` or package import
      line binds no graph key, so it left the fixed slice. The coordinator
      rules that a replay-side module's import declarations are compared
      whole (source, specifiers, bindings, attributes, in order), and any
      difference plans the complete ledger with the reason
      `replay-side import change: <file>`. The reflection-only notes are
      listed in decision 11 as accepted under the nightly backstop. Its
      cases: a changed `node:` binding (`setTimeout as delay` to
      `setImmediate as delay`), `node:assert/strict` switched to
      `node:assert`, a new `node:` import and a new package import each plan
      full; an entry edit beside an unchanged import block stays precise.
      Against the definitional selection, the 4 full cases fail. All pass
      after the fix.

## 4. Verify without a port (worker)

- [x] 4.1 `node docs/scope/457-press-wait.repro.mjs` prints the after-fix rows
      its header states: the late Return press and both `railRowLocator` rows
      `resolved`, and the absent and hidden presses `rejected` after about
      100 ms with the two bounded messages.
- [x] 4.2 `node --test 'frontend/**/*.test.js'` passes, including the new
      `railRowLocator` test and R8.
- [x] 4.3 `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py ReplayPlanTest InventoryProofTest SmokeSelectionTest`
      passes, including the new selection tests and
      `test_fixed_slice_is_pinned_and_covers_every_real_replay_case` with its
      digest unmoved.
- [x] 4.4 `npx --yes @fission-ai/openspec@1 validate --all --strict`,
      `python3 scripts/check_adr_numbers.py`,
      `python3 scripts/check_owned_identifiers.py`,
      `python3 scripts/check_public_allowlist.py` and AGENTS.md's public-tree
      scan (`build_public_tree.py`, then `check_public_links.py` and
      `scan_public_tree.py` over a fresh directory) pass.

- [x] 4.5 On the final commit, run
      `REPLAY_SHARDS='{"smoke":["1/1"],"full":["1/4","2/4","3/4","4/4"]}' uv run python mockups/sweep/harmonic-v2-desktop/acceptance.py replay-plan --base <task 3.3 OID> --out <fresh directory outside the checkout>`.
      Its `plan.json` must report mode `smoke`. Its `selected` ids that are not
      in `SMOKE_STORIES` must be exactly the 32 the pinned spike prints for a
      `railRowLocator` edit:
      S12, S21, S22, S23, S24, S25, S26, S27, S29, S61, S62, S82, S133, S136,
      S137, S124, R1, R2, R3, R4, R5, R6, R7, R9, R10, R11, R12, R13, R14, R15,
      R16, R17. Record that comma-separated list beside this task when ticking
      it; task 5.4 replays it.
      Superseded by task 3.7 (decision 11): a `railRowLocator` edit is replay
      code, not a story entry, so the plan now reports mode `full`. Run with
      `--base 509ee1a4f89e2a0cf8078405e7d21bb7b919764c`, it reports mode `full` and 171 selected, and each
      reason names `frontend/diagnose-replay.mjs::railRowLocator`. The 32-id
      expectation no longer applies.
      Before task 3.7, with the selection of tasks 3.4–3.6, the plan reported
      mode `smoke` and 56 selected, and the 32 ids above in that order.
      Coordinator-authorized (plan-review round 2, note 1; Q3 delegation,
      Connor Griffin, 2026-09-23): the recorded list is the 35 ids whose
      `smoke.json` reasons named `frontend/diagnose-replay.mjs::railRowLocator`
      then. Those are the 32 above plus S125, R8 and R19 from the fixed slice.
      It stays as task 5.4's press and rail regression replay:
      `S12,S21,S22,S23,S24,S25,S26,S27,S29,S61,S62,S82,S133,S136,S137,S124,S125,R1,R2,R3,R4,R5,R6,R7,R8,R9,R10,R11,R12,R13,R14,R15,R16,R17,R19`.

## 5. Verify in a browser and on a port (coordinator; serial, after `npm ci && npm run build`)

- [x] 5.1 Red proof: on the task 1.4 commit,
      `node --test --test-name-pattern 'press waits for a Day return control' frontend/desk.browser.test.mjs`
      reports tests 1, fail 1 with the line `✖ press waits for a Day return control that renders late, and names an absent or hidden control`, failing at the late
      Return press with `no control matched [data-day="return"]`. On the final
      commit it reports tests 1, pass 1 with the line `✔ press waits for a Day return control that renders late, and names an absent or hidden control`. A pattern
      that matches nothing also reports tests 1, pass 1 (the file itself), so
      the named line is the evidence, not the count.
      Result (coordinator's run): on `ce03aacd` the named test fails with
      `no control matched [data-day="return"]`; on the section 2 helpers it
      passes with its `✔` line. Those helpers' content is identical from
      `411dcb3e` through `a902a70a`; the coordinator's diff shows only the
      acceptance driver and its documents changed between them.
- [x] 5.2 Repetition, on the final commit: ten consecutive runs of
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
      Result (coordinator's runs, on the identical section 2 helpers): the
      single named test passed 10 of 10 repeats, and the seven-test group
      passed 7 of 7 with each named `✔` line on all ten runs (the `3a338d51`
      run).
- [x] 5.3 The whole desk suite, once, on the final commit: tests 44, pass 44.
      Result (coordinator's run, on the identical section 2 helpers): 44 of
      44 pass.
- [x] 5.4 The stories the new selection adds for the `railRowLocator` edit, at
      1280x720, on the final commit, with a fresh `CASE_STORE_DIR` and port
      8765 free:
      `TARGET=app VIEWPORT=1280x720 BASE_URL=http://127.0.0.1:8765 ONLY=<task 4.5's recorded list> node frontend/desk-behavior.replay.mjs`
      reports `# executed 32 · failed 0 · deferred 0 · selected 32`, with a
      `PASS` line for each of the 32 ids.
      Coordinator-authorized (code review round 4): the selection no longer
      derives this list. It stays as the press and rail regression replay.
      Coordinator-authorized (plan-review round 2, note 1): `ONLY` is task
      4.5's 35-id list, so the replay reports
      `# executed 35 · failed 0 · deferred 0 · selected 35`, with a `PASS` line
      for each of the 35 ids.
      Result (coordinator's run, at 1280x720): 35 of 35 pass,
      `# executed 35 · failed 0 · deferred 0 · selected 35`.
- [x] 5.5 The complete `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py`,
      which binds a port in `ServerLifecycleTest`, passes on the final commit.
      Result (coordinator's run): OK on `a902a70a`.
