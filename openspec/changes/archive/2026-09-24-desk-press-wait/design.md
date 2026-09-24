# Design — desk browser helpers wait for the control they act on

## ADR 457 — Browser-suite helpers wait for the control they act on

### Context

- `frontend/desk.browser.test.mjs` `openDesk` returns once `.gf .pane` exists.
  Day's loading frame is a `.pane` (`frontend/day.js` `mount` paints
  `loadingFrame('Day')` until its status, held-month navigator and day reads —
  `/api/model-view`, `/api/timeline`, `/api/carbs` — have all landed), so a
  test at a Day address starts while Day may still be loading. Day paints its
  Return control (`[data-day="return"]`) in the same frame as `.gf-stage-day`,
  so once the stage is visible the Return control is too.
- The suite's `press(page, selector)` reads `locator.count()` once and
  `isVisible()` per match. Neither waits in Playwright, so a control that paints
  a moment later fails at once with `no control matched <selector>`, and a
  control whose only matches are still hidden fails at once with
  `<selector> matched N element(s), all hidden`. That is the recorded failure of
  test 25 in the first attempt of run 35959034199 (258 ms, line 962).
- `frontend/diagnose-replay.mjs` `railRowLocator(page, id)` counts the plain rail
  row once. When that count is zero it opens every closed Pattern fold it can
  count, then waits 30 s for the folded cause line. While `#level` still paints
  "Loading findings…" there is no row and no fold, so a claimed cause behind a
  closed fold, or a plain row that paints a moment later, is never found. The
  desk suite carries two copies of that logic (`openRailRow`, and an inline fold
  loop in the `empty` High-carb render test). Its callers reach them straight
  after a window click with no settle: tests 2 and 3, the five High-carb
  response tests through `assertHighCarbFailure`, and the four High-carb render
  tests. The shipped sequence fixtures rank `pattern:highs_after_meals` first,
  and a rank-one Pattern opens its fold on arrival, so the race is latent there
  today. The replay's own callers (`frontend/c2.replay.mjs` `openComparisonCase`)
  settle the rail first.
- `#level` writes `data-loading` before it paints each level and paints the
  whole rail in one pass (`frontend/diagnose-workstation.js` `paintLevel`), so
  a rail that reports `data-loading="false"` and has a `.qrow` is completely
  painted, folds included.
- Coordinator ruling R457 (Q3 delegation, Connor Griffin, 2026-09-23): `press`
  waits for its first visible match with a bounded timeout, and a genuinely
  absent control still fails naming the selector after that bound. Test 25
  needs no bespoke wait beyond that. Every browser-suite and replay helper with
  the same count-once-then-act race is in scope under the same rule.
- Coordinator rulings on triage's questions (same delegation, 2026-09-23):
  tests 19, 23, 26 and 29 wait for Day's stage before their first read of Day
  (decision 4). The post-press count checks that rely on `press`'s fixed
  settle stay as they are, recorded as unsupported in the proposal's risk
  contract. The PR ledger's blind spot for replay helper modules is fixed in
  this change (the second ADR 457 record below).

### Decision

1. **`press` waits, then acts.** Its signature becomes
   `press(page, selector, timeout = 30000)`, the same trailing-bound shape as
   `boundedWait` in `frontend/c2.replay.mjs`. It waits, within `timeout`, for the
   first visible match (`locator(selector).filter({ visible: true }).first()`,
   the form the c2, c3 and c4 replays already press through), clicks that
   match, and keeps its 180 ms settle. When the wait times out, it names the
   failure from one fresh `page.locator(selector).count()`, never from the
   visibility-filtered locator it waited on:
   `no control matched <selector> after <timeout> ms`, or
   `<selector> matched <N> element(s), all hidden after <timeout> ms`. Any other
   error propagates unchanged. It keeps using only `assert` and the page it is
   given, so the reproduction can read it from source.
2. **`railRowLocator` waits for a settled, painted rail first.** Before it
   reads which shape the row takes, it waits, within 30 s, through
   `page.waitForFunction` for `#level` to report `data-loading="false"` while
   holding at least one `.qrow`. If that wait times out, it fails naming the id
   it was resolving. Its fold opening and 30 s wait for the folded cause line
   stay as they are. `page.waitForFunction` is the one page method this adds,
   and the dependency-free fake page in `frontend/c4.replay.test.js` already
   provides it.
3. **One resolver.** The desk suite's `openRailRow` is deleted. Its four callers
   press `await railRowLocator(page, id)`, the form `assertHighCarbFailure`
   already uses, and the `empty` render test's inline fold loop becomes
   `const member = await railRowLocator(page, id)`. The #413 amendment in
   `mockups/harmonic-v2-desktop.behavior.md` still names `openRailRow`. That
   is a dated record of what #413 changed and stays as history; this change
   edits no ledger text.
4. **Day arrival reads wait for Day.** Tests 19, 23, 26 and 29 open the desk at
   a Day address and then count Day's controls, or its charts, before pressing
   anything. Each first waits for `.gf-stage-day` to be visible, in the form the
   month-paging test already uses:
   `await page.locator('.gf-stage-day').waitFor({ state: 'visible' })`. Test 25
   and test 24 get no bespoke wait: their first action is a `press`.
5. **Proof holds the read instead of repeating the race.** A new browser test,
   placed directly after test 25 and named
   `press waits for a Day return control that renders late, and names an absent or hidden control`,
   holds Day's `/api/model-view` read through `openDesk`'s `beforeNavigate` hook,
   using `route.fallback()` to hand the released request to the stub. It opens
   the canonical Day address test 23 uses. While the read is held it proves the
   Return control is absent, and it releases the read only after the press has
   started. The press and the release are awaited together, so an early
   rejection is never unhandled. The press must land, leaving Diagnose current.
   The same test then presses `[data-no-such-control]` and the desktop-hidden
   `.gf-utility-strip [data-utility="guide"]` with a 500 ms bound, and requires
   each to reject naming its selector and the bound. This test lands in its own
   commit before any helper changes, so that commit is the red proof. A new
   dependency-free test beside R8 in `frontend/c4.replay.test.js` drives
   `railRowLocator` over a fake page whose rail paints only once its
   `waitForFunction` is awaited. It fails on the base, which counts first, and
   passes afterwards.

### Audit

Every helper in `frontend/*.browser.test.mjs`, `frontend/*.replay.mjs`,
`frontend/diagnose-replay.mjs` and `frontend/replay-assertions.mjs` was read for
a single snapshot that decides an action.

| Helper | Snapshot, then act? | Disposition |
|---|---|---|
| desk `press` | yes; reached before paint (tests 24, 25) | Decision 1 |
| `railRowLocator` (diagnose-replay) | yes; reached before a settled rail by the desk suite | Decision 2 |
| desk `openRailRow`, `empty` render test fold loop | copies of the above | Decision 3 |
| desk `openDesk`, `box`, `activeElement`, `countOf`, `currentDestination` | reads only; no action | unchanged; four arrival reads get Decision 4 |
| c2 / c3 / c4 `press`, desk-behavior `visible` / `activate` / `goto` | no; each waits up to 30 s for the first visible match | unchanged |
| c2 `go`, `choose`, `clickAndObserveFocus`, `openComparisonCase`, `openBasalLane` | no; auto-waiting clicks after a settle | unchanged |
| c2 `comparisonFigure` | `isVisible` picks between two paths that both reach the focal fullscreen | unchanged |
| c2 / c4 "more" and "Watching" expanders, c4 `expandRoster432` | reached only after a settled roster | unchanged |
| c4 `openPatternFold` | reached only after its fold toggle is asserted (S115) or the rail settles (S126) | unchanged |
| c4 `foldLines424`, c3 progress-bar branch | inside a retrying `waitForReplayAssertion` | unchanged |
| diagnose-replay `openAllCharts` | reads a mode the reader alone toggles | unchanged |
| `replay-assertions` `waitForReplayAssertion` | the retry primitive itself | unchanged |
| browser-runner and follow-up suites | no page helpers of this shape | unchanged |

Test numbers here are run-order positions on b03431d2, which runs 43 tests. The
new test becomes 26, and every later test moves down one place.

`press` has 35 call sites, all expecting a present, visible control:
tests 2 and 3 (clear the trace), 16 (each destination), 19 (week column, month
toggle, log row), 20 (month toggle and pagers), 23 and 24 (Day's Return), 25
(Return, Open in Day, Return), 26 to 29 (utility launchers, Close, Guide row,
Log carbs, a utility's Day entry, Return, destinations), 30 and 31
(destinations) and 33 and 34 (Changes). None expects `press` to throw. Where a
test proves something is absent, it does so with a count or a `:visible` query
after the press, and those assertions are unchanged. A regression that removes
a pressed control still fails that test, now after the bound and naming the
control.

### Alternatives rejected

- **Make `openDesk` wait for its destination's first paint.** The teardown
  tests hold a Diagnose evidence read in `beforeNavigate` and assert what
  happens while it is held, and other tests replace arrival reads with failures.
  A suite-wide arrival wait would block on the held read, or would have to know
  each destination's finished state. Only the four arrival reads need it.
- **Import the c2 replay's `press`.** It is module-private and keeps no settle.
  On failure it reports Playwright's generic timeout, not the suite's
  absent-versus-hidden message. Exporting it would change a replay module every
  ledger story imports, to serve one test file.
- **Prove by repetition alone.** The #131 change settled that a timing race is
  proved by holding the response boundary. Repetition stays as the issue's
  confirmation leg, not the proof.
- **Lower the bound to keep absent-control failures quick.** Day's first paint
  needs several reads, and the suite's explicit waits allow 15–30 s. A shorter
  bound would bring the flake back on a loaded runner.

### Consequences

- A missing control fails up to 30 s later than before, still naming it.
- The post-press count checks that rely on `press`'s 180 ms settle are
  unchanged. None has been observed failing, and they read state that the
  press's own click produces.
- The post-press count checks are recorded as unsupported in the proposal's
  risk contract, by the coordinator's ruling.
- On b03431d2 the PR ledger could not see a change to
  `frontend/diagnose-replay.mjs`. The second record below fixes that, and this
  change's own edit to `acceptance.py` selects the complete ledger in any case.

## ADR 457 — The PR ledger's story selection follows every module the replay loads

### Context

- `mockups/sweep/harmonic-v2-desktop/acceptance.py` `smoke_selection` builds
  its function-level graph from `frontend/*.replay.mjs` and
  `frontend/replay-cases.mjs` only. The graph resolves an import only when the
  target is one of those files. At b03431d2 the replay also imports
  `frontend/diagnose-replay.mjs`, `frontend/replay-assertions.mjs`,
  `frontend/capture.mjs`, `frontend/plan.js`, `frontend/frame.js`,
  `frontend/tab-routing.js`, `frontend/diagnose-workstation-chart.js` and
  `mockups/diagnose-event-comparison.synthetic/project.mjs`. It also runs
  `frontend/replay-pump.py` and `scripts/gen_qa_e2e_db.py` by path, and
  requires `frontend/browser-runner.js`. Only `capture.mjs`,
  `browser-runner.js` and `gen_qa_e2e_db.py` are in its global-file list. An
  edit to any other one of these selects the fixed smoke slice and nothing
  more.
- `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md` (#406 chunk 2) already
  says imported replay helpers are followed.
- `.github/workflows/ci.yml` has no path filters. Every job runs on every pull
  request, and the ledger's only story selection is `acceptance.py
  replay-plan` and `replay --base`.
- The pinned spike `docs/scope/457-replay-selection.spike.py` shows, on
  b03431d2, that an edit to `railRowLocator` selects no extra story today, and
  32 once the selection follows imports. The unchanged tree still selects
  exactly the fixed slice.
- Coordinator ruling (Q3 delegation, Connor Griffin, 2026-09-23): the
  selection sees every replay helper module the stories import, and any other
  shared module the replay driver loads. An edit to a helper selects the
  stories that use it when that mapping is derivable, and otherwise selects the
  complete ledger: fail safe, never silently zero.

### Decision

1. **The graph follows the replay's static imports, and stops on any form it
   cannot map.** At each compared ref, the selection starts from the entries
   it reads today. It then adds every file they reach, transitively, through a
   relative named import (`import { … } from`) or namespace import
   (`import * as … from`), the two forms `replay_graph` maps to nodes. It reads
   those declarations with the Babel parser the lockfile pins. Every such
   module joins the function-level graph, so an edit maps to the stories whose
   dependency closure reaches it. The plan stops with an error naming the
   file in these cases:
   - a relative import resolves to no tracked file at that ref;
   - a module in the closure has a relative side-effect import, a default
     import, a `{ default as … }` import, an `export … from` or an
     `export * from`;
   - a module in the closure uses a dynamic `import()`;
   - a dependency key in either graph names a closure module but has no node
     there.
   Bare package imports (`node:*`, packages) are outside the closure;
   `package-lock.json` is a global file. The spike shows that the tree at
   b03431d2 has none of these forms and no such dangling key.
2. **Executables named by path select the complete ledger.** A tracked `.py`,
   `.js`, `.mjs` or `.cjs` file that a module in the closure names by a string
   literal, but does not import, is a load the graph cannot map to stories.
   The literal may be repo-relative or relative to the naming module, and may
   sit in a declaration or a module-level statement. A change to such a file
   selects the complete ledger. At b03431d2 those files are
   `frontend/browser-runner.js`, `frontend/replay-pump.py` and
   `scripts/gen_qa_e2e_db.py`. Data files named by path are excluded: the
   replay only checks that its exploration fixtures and Focus payload exist,
   and the committed showcase follows its generator and recipes. The
   exploration outputs regenerate on every Python edit, so counting them would
   send every backend pull request to the complete ledger.
3. **Everything else stays.** The global files and symbols, the recipe graph,
   the fixed slice and its digest, and full-ledger escalation are unchanged.
   `smoke.json` additionally records the replay modules and path-named
   executables the selection used.
4. **The spike is the reference.** `docs/scope/457-replay-selection.spike.py`
   holds a marked copy of `smoke_selection` with decisions 1 and 2 applied.
   `acceptance.py` ports those two changes into `smoke_selection` itself,
   keeping `replay_graph`'s signature and output.

### Consequences

- An edit to a product module that a story imports now selects that story on
  pull requests, where before it received only the fixed slice.
- The selection runs one Babel pass per import depth at each ref. The spike's
  real-tree runs complete in seconds.
- A file loaded through a computed path, rather than a literal one, is not
  seen; none exists at b03431d2.

### Amendment — code review round 1 (2026-09-23)

Coordinator ruling on review round 1's selection findings F1–F4, under the Q3
delegation (Connor Griffin, 2026-09-23; no follow-ups). The fixes fold into the
task 3.3 commit (task 3.4).

5. **Top-level statements depend on the names they mention (F1).** Every node
   depends on its module's `@module` node, and `replay_graph` gives that node
   no dependencies. So a helper that only top-level text names reached no story.
   Two shapes do this: `c2.replay.mjs`'s `boundedWait`, which a module-level
   loop wraps around every C2 story, and a helper behind
   `const { locate } = make()`. `smoke_selection` now gives each `@module` node
   a dependency on every top-level node its text names. It resolves a dotted
   name to its longest existing node. `replay_graph`'s own output is unchanged.
   Two names are left out:
   - the global symbols, whose own change already selects every story;
   - the story tables (`C2_STORIES`, `C3_STORIES`, `C4_STORIES`), which are the
     roots. Each story already depends on its own entry.

   Without those exclusions, `desk-behavior.replay.mjs`'s top-level `main()`
   call and c2's loop over its table would put every story into every closure.
   On the real tree a `railRowLocator` edit then selected 143 of 171 stories;
   with the exclusions it selects 56. A `boundedWait` edit now selects 136 of
   171, every story whose closure reaches c2.
6. **A namespace import stops the plan (F2).** The graph maps named imports
   only. A namespace import stops with `namespace import not followed`, as the
   other unfollowable forms do.
7. **Every literal path form is read (F3).** The path scan walks each module's
   parsed tree and reads three kinds of literal:
   - string literals and templates without expressions;
   - a `require()` argument, with Node's extension and index probing;
   - a `new URL(…, import.meta.url)` argument, resolved against its module.

   A literal path it cannot resolve stops the plan. That covers an unresolved
   `require()` or URL literal, and a module-relative or repository-shaped
   executable literal with no tracked file. It also covers a template with
   expressions that reads as a path, and a `require()` or URL argument built
   from an expression. A `require()` of a variable stays the computed load the
   risk contract accepts: `desk-behavior.replay.mjs` requires the
   environment-named Playwright package that way.
8. **`smoke.json` records both commits' modules (F4).** `replay_modules` is the
   union of the modules read at the base and at HEAD. So a pull request that
   deletes a helper module still records it.

### Amendment — code review round 2 (2026-09-23)

Coordinator ruling on review round 2's finding N1, under the Q3 delegation
(Connor Griffin, 2026-09-23; no follow-ups): stop patching shapes and add one
general rule. It folds into the task 3.3 commit (task 3.5).

9. **A changed key that no story carries selects the complete ledger (N1).**
   Keys that only `main`, the registry or `openApp` reach lie in no story's
   closure. On the real tree these include the journey builders `J`, `M`,
   `SET` and `FOC`, `VIEWPORTS`, `C3_CASES` and `C4_RETIREMENTS`. An edit to
   one of them selected only the fixed slice.

   Now, when a changed key in a replay-side module is not carried by a story's
   closure, the plan selects every story (mode `full`). Each reason
   names the key: `changed outside every story's closure: <key>`. A key counts
   as carried in three cases:
   - A story's closure holds the key, or a dotted prefix of it whose text
     holds it.
   - The key is an import binding. It carries nothing of its own, because each
     dependent's dependency list records the mapping it creates.
   - The key is an object table whose entries alone changed: its text, with
     every entry and separator removed, is unchanged. Each entry is then
     judged by itself.

   The last case keeps table-entry precision: an edit to `C2_STORIES.S82`
   selects S82 alone. The pinned `railRowLocator` lists (32 added, 35 naming
   it) are unchanged.

   **Replay-side, not product-side (coordinator ruling on the worker's
   question, same delegation).** A module is product-side when the app's entry
   reaches it by static import. The entry is `frontend/main.js`:
   `frontend/index.html` loads `./main.js`, and `vite.config.mjs` roots the
   build at `frontend/`. The walk uses the same scanner and follows each
   relative `.js` or `.mjs` import. A module counts as product-side only if the
   app reaches it at every commit that has it as a replay module. Everything
   else in the replay's closure is replay-side.

   Product code reaches the stories through the browser, so it keeps the #406
   policy. A changed function a story's closure reaches selects those stories,
   and an unreached one adds nothing to the fixed slice. The rule above applies
   to replay-side modules only.

   It stays fail-safe in two ways. An app entry that is untracked or cannot be
   parsed stops the plan, naming why. An app import that resolves to nothing
   only shrinks the product side, which only widens the selection.
   `smoke.json` records the product modules as `product_modules`.

   On the real tree the product-side modules are `plan.js`, `frame.js`,
   `tab-routing.js` and `diagnose-workstation-chart.js`. An edit to the
   unreached `isStageableIsf` in `plan.js` leaves the fixed slice. An
   edit to `segmentCapacity`, which S90 calls, selects S90.

   These replay-side modules have the most keys that plan the full ledger:

   | Module | Keys that plan full |
   |---|---|
   | `desk-behavior.replay.mjs` | 140 of 270 |
   | `diagnose-event-comparison.synthetic/project.mjs` | 55 of 59 |
   | `diagnose-replay.mjs` | 25 of 36, helpers only the desk browser suite uses |

### Amendment — code review round 3 (2026-09-23)

Coordinator ruling on review round 3's finding R3-1, under the Q3 delegation
(Connor Griffin, 2026-09-23; no follow-ups). The reviewer's design is adopted,
and the change folds into the task 3.3 commit as task 3.6. Decision 9's table
counted keys before this decision.

10. **The per-story runner is a root of every story (R3-1).** Every story runs
    through `main`'s loop and `openApp`. Those in turn use `APP_BASE_URL`,
    `ok`, `fail`, `waitForReplayAssertion` and the viewport table. Yet no story
    root reached them, so an edit selected only the stories that also named the
    key: an `APP_BASE_URL` default edit selected 27 of 171 stories, and making
    `ok` a no-op selected 70.

    `main` and `openApp` are now roots of every story's closure, so any change
    they reach selects every story, and each reason names the key. The walk
    stops at the registry and at the story tables the runner looks stories up
    in: `C2_STORIES`, `C3_STORIES`, `C4_STORIES` and `C4_RETIREMENTS`. Those
    tables hold the stories themselves, each its own root, so a table entry
    stays precise.

    The ruling named main's edges; the stops cover `C4_RETIREMENTS` as well.
    The reason is that `openApp` checks story membership with
    `!C4_RETIREMENTS[storyId]`, and through that table the walk reached
    `C2_STORIES.openComparisonCase` and `railRowLocator`. Without that stop, a
    `railRowLocator` edit would select every story.

    This edge replaces decision 9's escalation for runner code. Decision 9
    still covers other keys that no story carries, such as the journey
    builders, which only the registry reaches. The product-side #406 policy is
    unchanged.

    On the real tree the runner closure holds 32 nodes. S82 precision holds,
    the pinned `railRowLocator` lists hold (32 added, 35 naming it), and so do
    the `plan.js` cases and the entry stop.

### Amendment — code review round 4 (2026-09-23)

Coordinator ruling on round 4's findings, under the Q3 delegation (Connor
Griffin, 2026-09-23; no follow-ups). Round 4 found four more silent
under-selections, A7c–A7f: top-level statements in `diagnose-replay` and `c4`,
namely a `process.on` handler, an environment default read before
`DEFAULT_VIEWPORT`, `C2_STORIES.S30 = C2_STORIES.S31`, and a top-level loop
wrapping C3 stories. It also found three shapes that land across two pull
requests: A8, a getter or `this`; A9, module state written in one story's
helper and read in another's; and A10, a registry row whose id is not its
function.

Four rounds had each patched one shape, so the method was wrong. Decision 11
inverts the default for replay code. Where decisions 5–10 conflict with it,
decision 11 supersedes them. The change folds into the task 3.3 commit as
task 3.7.

11. **A replay-side change plans the complete ledger unless it is confined to
    clean story entries.**

    A change to a replay-side module selects every story (mode `full`), and
    each reason reads `replay-side change: <key>`. The one exception is when
    every changed key is a story entry (id `S…` or `R…`) of `C2_STORIES`,
    `C3_STORIES`, `C4_STORIES` or `C4_RETIREMENTS`, and its closure is proven
    read-only toward shared state. The entry itself counts, since its closure
    starts at it. The coordinator's three follow-up rulings on the worker's
    notes and the fresh verification set this; the last of them flips the
    proof from forbidden forms to an allow-list, which closes the class. The
    final verification's definitional ruling (same delegation) then widens
    shared state to built-ins, Node imports, literals, callbacks and the
    members of class and function bindings.

    **Shared state** comes in five kinds:
    - A module's own state: a top-level binding that is not an import, a
      function or a `const` primitive. A primitive can't be mutated; excluding
      it is the worker's reading, reported to the coordinator.
    - Any non-function binding imported from another replay-side module, and
      any binding imported from a Node module or package (`node:assert/strict`
      and the like). An import from a product module stays exempt.
    - The members of a class or function binding, top-level or imported from
      another replay-side module: static fields, function-object properties
      and `prototype`.
    - Every free global name: `process` and `globalThis` as much as the
      built-ins `Object`, `Array`, `JSON`, `Math`, `Number`, `String`,
      `Boolean`, `Promise`, `Map`, `Set`, `URL`, `Date`, `RegExp`, `Error`,
      `setTimeout`, `setInterval`, `clearTimeout`, `structuredClone`,
      `console`, `encodeURIComponent`, `decodeURIComponent`, `encodeURI`,
      `decodeURI` and `URLSearchParams`. The primitive globals `undefined`,
      `NaN` and `Infinity` are excepted. They can't be mutated. The worker
      proposed this, the coordinator accepted it, and it matches the `const`
      primitive exclusion.

      A name counts as free when no enclosing function in the node, nor the
      module's top level, declares it.
    - Every local alias of any of these:
      - a variable bound to it;
      - a `for … of` or `for … in` variable over it;
      - the parameters of any callback handed to a call that receives it, an
        iterating read's callback as much as `Array.from`'s mapper; a named
        graph function handed there is judged on every parameter;
      - a parameter defaulted to it;
      - an array or object literal that spreads or contains it. The literal
        is shared, so its binding and its elements are aliases too.

    **The proof is an allow-list.** A node is safe only when every reference it
    makes to shared state sits in a recognized read position:
    - a non-computed member read used as a value;
    - the receiver of a read-only method, where an iterating read's callback
      is judged too: an inline one through its aliased parameters, a named one
      as that function, and an allow-listed built-in such as `Boolean` counts
      as a read;
    - an argument to a read-only built-in;
    - the delay (second) argument of `setTimeout` or `setInterval`, which is
      only coerced to a number (the coordinator's last ruling);
    - the callee of `process.stdout.write` or `process.stderr.write`. These
      output calls are recognized like `console`, since they change no state
      a story reads. Their arguments are judged like any call's.
    - a non-computed `process.env.<name>` read. Environment values are strings
      or `undefined`, so its result ends the chain. A write to one is still a
      write outside the node's locals.
    - an argument to a graph function that the same test, run on its
      parameters, proves does not mutate that parameter;
    - a `typeof`, comparison, arithmetic, condition, `switch` or template read;
    - a spread or element in a new array or object literal, which continues
      the chain with the literal;
    - a call to a known function. That includes a table entry naming a
      top-level function (`openBasalLane,`), which resolves to that function.
    - a call to a built-in or a Node import, or to one of its functions or
      methods (`JSON.stringify`, `Math.max`, `Object.keys`, `Number(…)`,
      `new Map()`, `assert.equal`). Its arguments stay judged by the argument
      rule, so the target of `Object.assign`, `Object.defineProperty` or a
      `Reflect` method is never a read position. Such a call's result carries
      only what its arguments carry.
    - a call to a class or function binding, or `new` of it;
    - two worker readings, reported to the coordinator: a built-in function
      handed as an iterating read's callback (`.filter(Boolean)`), which is
      only called, and a built-in in a class's `extends` clause;
    - binding to a plain local, which makes that local an alias whose own uses
      are judged.

    **Read results split by type** (the coordinator's last ruling, same
    delegation).
    - Some reads always return a primitive, and their result ends the chain:
      `has`, `includes`, `indexOf`, `lastIndexOf`, `findIndex`, `some`,
      `every`, `join`, `toString`, `forEach`, `startsWith`, `endsWith`,
      `JSON.stringify`, `Array.isArray`, `String`, `Number`, `Boolean`,
      `encodeURIComponent`, `decodeURIComponent`, `encodeURI` and
      `decodeURI`.
    - Every other read returns shared state: `getStore`, `get`, `at`, `slice`,
      `keys`, `values`, `entries`, `map`, `filter`, `find`, `reduce`, `concat`,
      `flat`, `flatMap`, `Object.keys`, `Object.values`, `Object.entries`,
      `Array.from`, `structuredClone` and `URLSearchParams`. The call's own
      position must then be a read position, and a local bound to it is an
      alias.
    - The same holds for a graph function that may return a parameter, when
      shared state goes into it. This is a syntactic test: a return anywhere
      inside it mentions a parameter or a local bound from one.
    - An inline callback of an iterating read on shared state may return into
      that shared result.
    - `test` is not a read. On a global or sticky pattern it moves
      `lastIndex`, the worker's exclusion from the ruling's examples.

    Any other position makes the node unsafe. That includes:
    - a computed member access;
    - a call whose callee is read from shared state and is not a graph
      function;
    - the target of an assignment, update or `delete`;
    - being passed anywhere else, a built-in or one of its members (such as
      `Array.prototype`) included, returned or bound by destructuring.

    So do a `this`, a getter or setter, and a write rooted outside the node's
    own locals, such as a global. Parameter mutations are forwarded through the
    graph calls that pass a parameter on. A node that carries shared state into
    a parameter its callee may mutate is unsafe, and so is a node that calls an
    unsafe node, transitively through the graph's closure. A callee the scan
    never read counts as mutating. A module's top-level statements (`@module`)
    run once at load rather than per story, so they are not judged; a change
    to them plans the complete ledger anyway. The proof errs to the complete
    ledger for any use it does not recognize.

    **Code that runs in the page.** Playwright serializes a function passed
    to a page-evaluation method into the story's own page, and each story
    opens a fresh browser context in `openApp`. The methods are `evaluate`,
    `evaluateHandle`, `evaluateAll`, `$eval`, `$$eval`, `waitForFunction` and
    `addInitScript`. So the free names of such a function (`document`,
    `window`, `getComputedStyle`, `location`) are the page's, not shared state.
    The same holds for a module function that is not exported and is only
    ever handed to one of those methods.

    Module state and parameters inside such a function are still judged. A
    write to a page name there is not a write outside the node's locals. The
    worker proposed this reading and the coordinator accepted it. Without it,
    29 of the 132 entries would stay precise.

    **The per-story context.** `ctx.open`, `ctx.capturePump` and
    `ctx.withCase` are accepted as clean (coordinator ruling, same
    delegation). `ctx` is a per-story parameter, and its functions live in
    `main` and the case server, outside every story-table entry. Any change to
    them is therefore not a clean story-table key, and already plans the
    complete ledger under the inverted default.

    Each qualifying entry selects the stories whose closure reaches it. The
    reason for a tainted entry names the impure nodes it reaches. A table
    whose entries alone changed (its text, with every entry and separator
    removed, is unchanged) is judged by those entries. Everything else plans
    the complete ledger: a module's top-level statements, a helper, a constant,
    an import line, a row builder (`J`, `M`, `SET`, `FOC`), and a story
    function outside those tables.

    An import from a Node module or a package binds no graph key, so the import
    declarations of every replay-side module are compared whole between the
    two commits: relative, `node:` and package imports alike, with their
    source, specifiers, bindings and attributes, in order. Any difference plans
    the complete ledger, with the reason `replay-side import change: <file>`
    (the final pass's ruling, same delegation).

    A registry row whose id is not the name of its function plans the complete
    ledger at either commit, as does a registry that is not an array of
    `[id, function]` rows. The roots are found by id.

    The proof runs in `replay_purity`, once per commit over every module the
    replay reads, with that commit's product modules exempt. For each node it
    records:
    - whether the node is unsafe;
    - the parameters it may mutate;
    - the graph calls that carry shared state or its parameters.

    `smoke_selection` forwards the parameter mutations to a fixpoint. The
    registry rows come from `replay_imports`, and all 171 real rows name their
    own function.

    Product-side modules keep the #406 policy unchanged. A changed function
    that a story's closure reaches selects that story; an unreached one leaves
    the fixed slice. An unparseable app entry still stops the plan.

    **What stands from decisions 5–10.**
    - Decision 5's `@module` edges, which keep a product module's reach
      complete.
    - Decisions 6, 7 and 8.
    - Decision 9's product-side definition.
    - Decision 10's runner root. The runner runs for every story, so a product
      function it reaches selects every story, and its stops keep table entries
      precise.

    **What is superseded.** Decision 9's "outside every closure" rule and its
    carried cases, and decision 10's role for replay code, which the default
    now covers. So are the pinned `railRowLocator` expectations: task 4.5's own
    helper edit now plans the complete ledger. Task 5.4's 35-story replay stays
    as the press and rail regression leg.

    **Precision that remains.** Of the 132 story entries of the four tables,
    126 stay precise on the real tree. That is the design's final measure,
    re-taken under the definitional ruling; the widened shared state moves no
    real entry. Six plan the complete ledger when edited, all in C4:
    - S113 reaches `assertRecurringLowsLower`, which passes the module-level
      pattern `RECOMMENDED_VALUE` to `assert.match`, an import outside the
      read-only built-ins.
    - S152 passes `RECOMMENDED_VALUE` to `assert.match`, and passes `size`, a
      loop alias over the module-level `LANE_REACH_SIZES`, to
      `page.setViewportSize`.
    - S153 passes `RECOMMENDED_VALUE` to `assert.match`.
    - S149 and S150 reach `assertSelectedFacts432`, which reads
      `BAND432[habit.verdict]`, a computed member access on module state.
    - S151 reaches `assertBasalLaneReachable`, which passes `size` to
      `page.setViewportSize`.

    The coordinator accepted that the 41 stories that live only as
    desk-behavior story functions plan the complete ledger on any edit.

    **Not followed.** The proof covers honest edits under this definition,
    and errs to the complete ledger for any use it does not recognize. Code
    it cannot read stops the plan: `eval`, the `Function` constructor
    (any reference to either name) and a dynamic `import()` in a replay
    module. The nightly complete ledger, which the pull request's
    latest-nightly check reads, is the backstop for anything outside the
    model. The final pass's reflection-only notes are accepted under that
    backstop, not modelled:
    - a write through `__proto__`;
    - a write to what `Object.getPrototypeOf(…)` returns;
    - `constructor.constructor`, which reaches the `Function` constructor
      without naming it;
    - `Array.prototype.push(…)` called directly, since a call rooted at a
      built-in is a read;
    - `Object.assign` on a function imported from a product module, since
      product imports stay exempt.

    The proof relies on one reading it cannot prove: that a method
    named like a page-evaluation method sends its function to the page. A
    Node helper with such a method name, whose callback touches a global,
    would have that global judged as a page name.
