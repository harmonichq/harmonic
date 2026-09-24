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
