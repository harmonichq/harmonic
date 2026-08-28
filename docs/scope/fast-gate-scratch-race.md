# Scope — Fast-gate scratch race (#231)

## Decisions

- Move the fail-closed suite's empty vendor directory to the operating-system
  temporary root. The directory has no source-locality requirement, while ADR 39
  makes the recursive frontend stylesheet inventory a closed regression contract.
  `inline`
- Add a fail-first assertion that the generated directory is outside the
  frontend source tree. This turns the race's filesystem boundary into
  deterministic evidence instead of relying on an intermittent stress run.
  `inline`
- Keep the order flat. None of the slicing rubric's traits fires; this is
  one internal test-harness behavior in one repository and one CI job. `inline`
- Use Targeted review. The change is bounded and non-sensitive, but review must
  follow the affected fast-gate behavior end to end and enforce the existing
  ADR 39 inventory contract. `inline`

### Risk contract

- **Must prevent:** creating fail-closed scratch directories under frontend;
  weakening the fail-closed prerequisite assertions or ADR 39's complete
  stylesheet inventory; silent incorrect success; secret exposure; irreversible
  loss of authoritative data.
- **Must recover:** nothing automatically.
- **Accepted failure:** if the operating-system temporary root is unavailable or
  unwritable, the test may stop clearly and leave manual environment repair.
- **Unsupported:** Node versions outside the repository's Node 22 CI contract;
  arbitrary concurrent mutation of other source-tree paths.
- **Evidence owed:** the boundary assertion fails on the ticket base before the
  scratch-root change; the focused fail-closed and stylesheet-inventory tests
  pass together afterwards; the complete frontend CI job passes.

Why: a misleading intermittent red trains contributors to ignore the fast gate,
while a careless fix could weaken a deliberately closed source inventory.

Disposition: inline in the proposal and locked work order.

## Open questions

None.

## Spawned tasks

- Mandatory cold plan review of the locked work-order draft.

## Generated facts appendix

### G1 — The colliding files and their governing records exist

Command:

```sh
git ls-files --error-unmatch frontend/browser-gates-fail-closed.test.js frontend/diagnose-evidence-row-box.test.js .github/workflows/ci.yml openspec/changes/retire-staging-entry-rule/design.md openspec/changes/retire-staging-entry-rule/tasks.md
```

Output:

```text
.github/workflows/ci.yml
frontend/browser-gates-fail-closed.test.js
frontend/diagnose-evidence-row-box.test.js
openspec/changes/retire-staging-entry-rule/design.md
openspec/changes/retire-staging-entry-rule/tasks.md
```

### G2 — Current collision wiring

Command:

```sh
sed -n '25,30p' frontend/diagnose-evidence-row-box.test.js
sed -n '57,65p' frontend/browser-gates-fail-closed.test.js
```

Output:

```text
const appHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const stylesheets = [
  ...readdirSync(new URL('.', import.meta.url), { recursive: true })
    .filter((name) => typeof name === 'string' && name.endsWith('.css'))
    .sort()
    .map((name) => ({
  test(`${suite} fails closed and names the missing vendored assets when VENDOR_DIR is empty`, () => {
    const dir = mkdtempSync(join(FRONTEND, '.browser-gates-fail-closed-'));
    try {
      const { status, output } = spawnSuite(suite, { VENDOR_DIR: dir });
      assert.notEqual(status, 0, `${suite} must exit nonzero when the vendored assets are absent`);
      assert.match(output, /vue\.esm-browser\.js/, `${suite} must name the missing vue.esm-browser.js`);
      assert.match(output, /echarts\.min\.js/, `${suite} must name the missing echarts.min.js`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
```

### G3 — Frontend CI commands and Node version

Command:

```sh
sed -n '112,146p' .github/workflows/ci.yml
```

Output:

```text
  frontend:
    name: node --test (frontend)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5
      - name: Set up Node
        uses: actions/setup-node@v5
        with:
          node-version: "22"
      # Pure-logic frontend modules are tested with Node's built-in runner —
      # no npm/package.json (see CLAUDE.md conventions).
      - name: Run tests
        run: node --test 'frontend/**/*.test.js'
      # The browser capture is generated too; a passing test must not run
      # against bytes that have drifted from its support-stamp producer.
      - name: Check the event-comparison synthetic capture is current
        run: node mockups/diagnose-event-comparison.synthetic/generate.mjs --check
      - name: Exercise the local screenshot wrapper
        run: node --test scripts/screenshots.local.test.mjs
      # The same drift class the backend job guards for its five generators, in
      # the one place it was never applied. The finding->evidence exploration
      # commits three GENERATED artifacts: app-base.extracted.css and
      # evidence-table.extracted.js are lifted verbatim out of
      # frontend/index.html and frontend/diagnose-workstation.js, and data.json
      # is fixture data run through the shipped queue/chart/dock producers. All
      # three move when the app moves, and until now nothing noticed. The light
      # relight (63d9053) left the extracted stylesheet on the retired parchment
      # tokens, so the exploration's own contrast guard spent an entire round
      # measuring a theme the app had already left and reporting zero failures.
      # Node-only and dependency-free — it regenerates in memory and byte-
      # compares, so it belongs in the fast gate rather than behind Chromium.
      - name: Check the exploration's generated artifacts are current
        run: node mockups/finding-evidence-routing.exploration/build.mjs --check
```

### G4 — The ticket branch is current

Command:

```sh
git rev-list --count HEAD..origin/main
```

Output:

```text
0
```

### G5 — Concurrent base run reproduces the collision

Command:

```sh
for round in 1 2 3 4 5 6 7 8 9 10; do
  node --test 'frontend/**/*.test.js' >/dev/null 2>&1 &
  peer_pid=$!
  node --test 'frontend/**/*.test.js' 2>&1 | sed -n '/ENOENT/,+7p;/ℹ fail/p' | sed "s|$PWD|<worktree>|g"
  wait "$peer_pid" || true
done
```

Output:

```text
ℹ fail 0
ℹ fail 0
Error: ENOENT: no such file or directory, scandir '<worktree>/frontend/.browser-gates-fail-closed-IpHsJi'
    at read (node:fs:1776:35)
    at readdirSyncRecursive (node:fs:1794:5)
    at readdirSync (node:fs:1881:12)
    at file://<worktree>/frontend/diagnose-evidence-row-box.test.js:27:6
    at ModuleJob.run (node:internal/modules/esm/module_job:569:25)
    at async node:internal/modules/esm/loader:650:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5) {
  code: 'ENOENT',
  syscall: 'scandir',
  path: '<worktree>/frontend/.browser-gates-fail-closed-IpHsJi'
}

Node.js v26.7.0
✖ frontend/diagnose-evidence-row-box.test.js (83.825208ms)
✔ the root filter has no retired Event charts view or state (0.947375ms)
ℹ fail 1
ℹ fail 0
ℹ fail 0
ℹ fail 0
ℹ fail 0
ℹ fail 0
ℹ fail 0
ℹ fail 0
```

### First-hour spike

The G5 paired invocations of the dependency-free frontend suite reproduced the
reported race on the ticket base. The failing import named
`frontend/diagnose-evidence-row-box.test.js:27` and a vanished directory with
the `.browser-gates-fail-closed-` prefix. A separate base run of all four G3
commands passed: the frontend suite and screenshot-wrapper test were green,
and both generators reported their artifacts current.

## Triage review rounds

- **Cold panel 1:** one authoring blocker, zero injected blockers. The work order
  cited the race reproduction as command-produced evidence, but the appendix
  carried only prose for the spike. G5 now records the executed command and its
  complete normalized output for same-reviewer re-check.
- **Delta re-check:** the same reviewer spot-checked G5, found its filtered
  command and output internally consistent, raised no new blockers, and
  countersigned the order. The Node 26 capture is historical reproduction
  evidence; Node 22 remains the supported CI verification contract.
