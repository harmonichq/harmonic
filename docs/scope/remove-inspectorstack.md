# Scope — remove `inspectorStack` (#295)

Routed from `/ticket triage 295` to interview mode: the deletion itself is
settled, two execution-shape decisions are not.

## Decisions

- **The helper is genuinely unreachable in the post-#294 tree.** Grepped the
  whole worktree at `origin/main` 6345a773: `inspectorStack` appears as its
  definition (`frontend/diagnose-canvas-state.js:158`) and as an import name
  (`frontend/diagnose-workstation.js:43`), and nowhere else — no call site, no
  test, no mockup, no mirror. The ticket's cited line 105 is stale; #294 moved
  it. `inline`
- **No decision record is owed for the comment the deletion removes.** The
  helper carries an ADR-215 "one root is `factors`" note; that fact is
  separately recorded in live code at `frontend/diagnose-workstation.js:2077`,
  which still builds the stack root. `inline`
- **The order stays flat.** Zero slicing traits fire on a two-line deletion in
  one target. `inline`

- **No OpenSpec change folder; the order pins `Source: inline`.** OpenSpec
  strict validation rejects a delta-free change unless it carries
  `.openspec.yaml` with `skip_specs: true` (probed live), and a behavior-neutral
  deletion has no requirement to delta. The two most recent tickets of exactly
  this class — #266 (PR #282) and #264 (PR #281), both merged *after* the
  strict-validation port ed404e6 — shipped code-only with no change folder. The
  operator deferred the call; precedent is the stated default, and it avoids a
  second human-merged archive pull request for a two-line deletion. `inline`
- **Verification is the fast gate's frontend suite alone.** The first draft of
  this order required a local browser leg on the claim that no node test loads
  `frontend/diagnose-workstation.js`. Cold review refuted that claim:
  `frontend/diagnose-workstation.test.js:5` imports the module directly and runs
  under the fast gate's glob, so a stale import name left after the export is
  deleted — the change's only failure mode — fails at module link under
  `node --test`. Measured baseline on the untouched branch:
  `node --test 'frontend/**/*.test.js'` → 559 pass / 0 fail. The browser gates
  remain CI's check of record and are not owed locally for a two-line deletion.
  `inline`

### Risk contract

- **Must prevent:** removing or altering any reachable behavior — in particular
  `popInspector`, the live function immediately above the deletion, and the
  rest of the `diagnose-canvas-state.js` export list.
- **Must recover:** nothing; the change has no runtime failure mode of its own.
- **Accepted failure:** a mistake here fails the gate loudly (a missing export
  breaks module load) rather than misadvising a dose; manual recovery is
  reverting the branch.
- **Unsupported:** no analyzer, projection, endpoint, payload or rendered
  surface change is in scope.
- **Evidence owed:** the existing suites pass unchanged, and the module that
  holds the edited import list is proved to still load.

Why: a behavior-neutral deletion in a repo whose output is advisory dosing —
the whole risk is deleting one symbol too many, which is a gate-visible failure.
Disposition: `inline`.

## Open questions

None. Both were put to the operator, who deferred; each was settled on its
stated default and recorded above.

## Spawned tasks

None.
