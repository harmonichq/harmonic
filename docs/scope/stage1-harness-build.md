# Scope ledger — #241, build the stage-1 component harness

Opened during `/ticket triage 241`. Branch `241-stage-1-component-harness`.
Siblings #239 (ADR 239) and #240 (ADR 240) are merged and settle the toolchain and
the story set; this ledger records only what this build ticket settled on top of them.

## Decisions

- **The drill is a per-chart state, not a sixth story.** ADR 240 counted the inspector
  case-file drill as one of six stories. Operator ruled it is coupled to each chart:
  every chart that can take the spotlight must be drillable, and he expects to iterate
  on the inspector next. Confirmed in code — `showChartInspector`
  (`frontend/diagnose-workstation.js:2194`) is the single entry both families go
  through, routing the behavioural `event-comparison` kind to its finding case file and
  the three parameter kinds (basal, ISF, carb ratio) to their own evidence-detail frame.
  → ADR (241, in `openspec/changes/adopt-frontend-build-tooling/design.md`)

- **The harness mounts the real Diagnose workstation, unmodified.** No queue
  suppression, no harness-only rendering path. `createDiagnoseWorkstation({ root })`
  is a plain-DOM factory with no Vue, so the mount is the app's own.
  → ADR (241)

- **The four single-chart stories are kept.** They are one `option()` call each and let
  an agent render and screenshot one chart without driving the canvas. Operator
  confirmed after weighing dropping them in favour of reviewing every chart in situ.
  inline

- **Design tokens are read from the shipped app at runtime, never copied.** The palette
  lives in an inline `<style>` in `frontend/index.html` (`--in-range` at :74 light, :131
  dark under `html.dark`), not in a linkable stylesheet; `frontend/theme.css` does not
  define it. The harness fetches `index.html` and injects those blocks, so nothing
  drifts and no `--check` generator is owed.
  inline

- **`package.json` and the lockfile live in `harness/`, not the repo root.**
  `frontend/browser-runner.js` is CJS and is `require`d by the fast gate's `.test.js`
  files, so a root manifest carrying `"type": "module"` would break the gate.
  inline

- **This build is not, and does not begin, a migration of the shipped app.** Operator
  asked directly whether to port the app to a build instead. `frontend/index.html`
  (5,652 lines, inline Vue templates, importmap, ECharts as a CDN global) is untouched;
  that decomposition is a later stage of #238. The harness does establish the manifest,
  lockfile and pinned ECharts a later port would need anyway.
  inline

- **ADR 213's "safety property" wording is overstated, and is not reopened here.** The
  frontend renders; the dosing numbers come from the Python analyzers. The defensible
  claim is auditability and supply chain — with no build step the executed file is the
  repository file byte for byte. The ruling (stay buildless for now) holds under either
  justification, so nothing in this ticket depends on it. Any correction is its own
  record.
  inline

### Risk contract

- **Must prevent:** any change to the shipped app's bytes; any real glucose, insulin,
  dose, timestamp or credential value reaching a commit, a screenshot, a CI log or a
  pull request body; any harness dependency entering the shipped artifact or the
  dependency-free fast gate; a copy of shipped source, markup or tokens living in
  `harness/`.
- **Must recover:** nothing; the harness runs no unattended or long-running process.
- **Accepted failure:** the harness breaks because a pinned dependency no longer works
  with the host Node or browser, or because a committed payload's shape drifted from
  the app. Found the next time the harness is opened, repaired by hand then. The
  operator must start `harmonic serve` himself for the live switch; the harness does
  not launch it and shows a plain failure when it is absent.
- **Unsupported:** running the manufactured side against a live vendor pull; pointing
  the harness at the committed synthetic database by serving it; any use of the harness
  as a test or a gate; contributor setup on a mismatched Node.
- **Evidence owed:** proof that the shipped app is byte-identical (`git diff` over
  `frontend/` and `ciq_autotune/` empty), and that the fast gate still runs with no
  `npm install`.

Why: an advisory dosing tool with one operator, where the harness never ships and never
gates, so the exposure is committed real data and shipped-app drift, not harness uptime.
Disposition: copied into the #241 work order at admission.

## Open questions

None. Q1 (drill shape), Q2 (mount the real workstation unmodified) and Q3 (keep the
four chart stories) are all settled above.

## Spawned tasks

- ADR 241 is written by this ticket's own build, in
  `openspec/changes/adopt-frontend-build-tooling/design.md`. No separate issue.
