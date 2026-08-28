# Scope — stage-1 toolchain and pinning policy (#239)

Child of #238. Deliverable is a ruling recorded as an ADR in
`openspec/changes/adopt-frontend-build-tooling/design.md`; no harness code.

## Decisions

Framing settled first: sole developer, no outside contributions accepted,
development expected to slow, minimum ongoing maintenance preferred. Every
ruling below is priced against that, not against a contributor-facing project.

- **Harness tool is Vite alone, no framework plugin and no story runner.**
  There are no single-file components to isolate; the evidence charts are
  option-producing modules drawn onto a plain div by `window.echarts.init`,
  and #213 already named the pickers. Storybook would ship several hundred
  packages to provide a stories UI that is not the thing being used. → ADR
- **Dependencies are pinned exactly, with the lockfile committed.** Pinning is
  the low-maintenance answer for a project with no CI watching the harness:
  nothing moves until it is moved deliberately, so the harness opens in eight
  months as it was left. → ADR
- **No CI leg for the harness in stage 1.** It is one operator's local
  iteration tool; a job buys cache, time and a second npm surface for a break
  that is visible on next use. → ADR
- **Node version is documented, not enforced.** Version enforcement protects
  contributors from a mismatch and there are none. → ADR
- **The harness lives in a new top-level directory, not under `frontend/`.**
  It stays outside the materialised public tree, so no publish gate inspects
  it. → ADR
- **The required Node version is 22, and it is documented, not enforced.** It
  matches the `node-version` already pinned in three CI jobs, so the harness and
  CI never disagree about the runtime. → ADR
- **The harness directory is named `harness/`.** Settled during review, after a
  cold reader found that "a new top-level directory" left the build child free to
  choose. → ADR
- **Corrected premise, verified live this session:** `harmonichq/harmonic` is
  itself a public repository, and no workflow publishes the materialised
  public tree. CI builds it into `$RUNNER_TEMP`, runs the link and
  contamination checks over it, and discards it. The tree is a gate against a
  future repo split, not a live publishing pipeline, so harness placement is a
  question of which gates must be kept green, not of whether the code is
  visible. → inline

### Risk contract

- **Must prevent:** any change to the shipped app's bytes; any real
  glucose, insulin or credential data reaching a commit; a harness dependency
  entering the shipped artifact or the dependency-free fast gate.
- **Must recover:** nothing. No unattended or long-running process exists here.
- **Accepted failure:** the harness breaks because a pinned dependency no
  longer works with the host Node or browser. It is found the next time the
  harness is opened, and repaired by hand then. Pinned harness dependencies go
  stale, including with known vulnerabilities; accepted, because they never
  enter the shipped app and never run in CI.
- **Unsupported:** contributor setup on an unpinned or mismatched Node; any
  use of the harness as a test or gate; running it without a local
  `harmonic serve`.
- **Evidence owed:** none from this ticket, which changes no behavior. The
  stage-1 build child owes proof that the shipped app is byte-identical and
  that the fast gate still runs with no npm install.

Why: dev-only tooling for one operator, with the shipped advisory-dosing
artifact deliberately kept out of its blast radius.
Disposition: → ADR, copied into the work order.

## Open questions

None. The frontier is empty.

### Assumed defaults (not questions)

- Package manager is npm: CI already installs Playwright with npm and pins Node 22.
- The harness proxies `/api` and `/assets` to a running `harmonic serve`, per #238.
- The harness imports shipped registry modules live, never copies (ADR 213).

## Plan review

One panel, reviewer gpt-5.6-terra (Codex headroom 80%, known; routine stakes route
per the reviewer matrix). Round 1 returned two blocking objections, both tagged
`authoring` and none `injected`: the ruling named neither the Node version nor the
directory, and the diff clause contradicted itself about whether the scope ledger is
in the pull request. Both were fixed and the same reviewer re-checked the deltas
clean, which ends an ordinary-stakes review. The round ledger is session scratch, not
a repository artifact.

## Spawned tasks

_(none)_
