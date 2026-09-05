# Design — Plan shares the Diagnose workstation composition (#344)

## ADR 344 — Plan is the third workstation host

**Decision.** Plan renders inside the workstation composition as a third host
class, `.pw`, declared in `frontend/plan-workstation.css` the way `.vw` is
declared in `frontend/verify-workstation.css`: the same `--ck-*` token block
value-for-value, the same strip-over-panes grid, the same pane header anatomy.
`frontend/theme.css` extends its role selectors to `:is(.dw, .vw, .pw)` so the
theme's five roles apply to Plan by role, never by a Plan-only rule. The rename
of `.dw`/`.vw` into role-named classes, which the theme lock deferred to its
own pass, stays deferred; a third short host class is the precedent, not a new
convention.

**Arrangement (Connor, 2026-09-05, from three rendered wireframes).** Q1 = A:
the schedule to key in is the left pane; the right 430px pane is the case
file (accepted changes, reconcile verdict and actions, the active-profile
reference, apply history). The strip names the active profile and carries the
reconcile summary as its note. Alternatives rendered and rejected: B (accepted
changes left, schedule right) squeezes the four-parameter table into 430px and
leaves the left pane nearly empty because Plan holds one family; C (one
full-width dock) has no canvas | inspector echo of Diagnose and stretches every
cell across dead width.

**Behavior anchor (Connor, 2026-09-05).** "Don't change too much behaviorally,
anchor in the current behavior, just change the page theming." Under that
anchor the delegated calls are: the collapsible reference stays exactly as
shipped inside the case file (the strip adds the identity line, it does not
replace the table); apply history stays an always-visible block when
non-empty, not collapsed; below 760px the case file stacks under the schedule;
the QA showcase's nothing-staged state is the live proof of composition and
the stubbed replay is the proof of every other state. No behavior is retired.

**Contract.** The frozen ledger `mockups/plan.behavior.md` and its replay
`frontend/plan-behavior.replay.mjs` (sixteen stories, all passing on base
`aeb37c6a` through the stubbed app opener; red proof recorded in the ledger)
are the revision's contract. The replay locates every container by its shipped
heading, never by chrome class, so the recomposition is judged on what the
surface does, not on what it was wrapped in. Sibling contracts are cited, not
restated: the cockpit-shell ledger (S2, S8) and the first-plan-reconcile CI
gate.

**Why now.** `frontend/theme.css`'s header records that the dearest defect of
the theme lock was a role rule wearing one surface's class, found only when a
second populated surface rendered wrong. Plan is the third populated surface;
leaving it on the generic card chrome keeps that class of defect latent.

## Safe start (revise lane record)

Declaration: `CLAUDE.md` "The data boundary". Command, quoted:

```sh
scratch="${TMPDIR:-/tmp}/harmonic-qa-e2e.sqlite"
rm -f "$scratch" "$scratch-wal" "$scratch-shm" "$scratch.derived.sqlite"
cp mockups/qa-e2e.synthetic/harmonic.sqlite "$scratch"
uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765
```

Data source: `mockups/qa-e2e.synthetic/harmonic.sqlite`, generated in full by
`scripts/gen_qa_e2e_db.py` (synthetic, provenance-stamped). It holds a
one-segment active profile and no draft or apply history, so the live server
renders only Plan's nothing-staged state; the replay's inline synthetic
fixtures supply every other state. The UI Craft router returned `revise` on
(`shipped`, `runnable`, `complete`, `synthetic`).

## Generated facts (2026-09-05, worktree commit after 51eff3b)

Every figure the order cites, regenerated from the checked-out tree.

```
$ grep -c '^          - gate:' .github/workflows/ci.yml
10
$ grep -n "ten gate legs\|All ten" AGENTS.md
135:# The ten gate legs, as CI runs them.
149:All ten **fail closed**: a missing driver, vendored asset or fixture exits
$ sed -n 71p frontend/index.test.js
  const verify = page.match(/<div v-show="tab === 'verify'">[\s\S]*?<\/div>\n\n    <!-- ============================ PLAN/)[0];
$ grep -n "==== PLAN ====" frontend/index.html
1649:    <!-- ============================ PLAN ============================ -->
$ grep -c ':is(\.dw, \.vw)' frontend/theme.css
13
$ sqlite3 mockups/qa-e2e.synthetic/harmonic.sqlite "select count(*) from profile_settings; select count(*) from plan_draft; select count(*) from plan_history"
3
0
0
$ TARGET=app node frontend/plan-behavior.replay.mjs | tail -1        # full output: evidence/base/replay-1440x900.txt
app: 16 of 16 stories passed
$ VIEWPORT=1024x768 TARGET=app ONLY=S3,S4,S10,S11 node frontend/plan-behavior.replay.mjs | tail -1   # evidence/base/replay-1024x768.txt
app: 4 of 4 stories passed
$ VIEWPORT=390x844 TARGET=app ONLY=S3,S4,S10,S11 node frontend/plan-behavior.replay.mjs | tail -1    # evidence/base/replay-390x844.txt
app: 4 of 4 stories passed
$ node --test 'frontend/**/*.test.js' 2>&1 | grep -E "^ℹ (tests|pass|fail)"
ℹ tests 595
ℹ pass 595
ℹ fail 0
$ npx --yes @fission-ai/openspec@1 validate --all --strict | tail -1
Totals: 73 passed, 0 failed (73 items)
```

## Base story counts

Plan ledger on base `aeb37c6a`: 16 of 16 at 1440×900; S3, S4, S10, S11 also
at 1024×768 and 390×844. Cockpit-shell and first-plan-reconcile gates: not
re-run at triage (their assertions are unchanged by triage's commit; task 1
runs them).

## Risk contract

- **Must prevent:** a deliverable cell rendering a value other than the draft
  or hand-edit the surface holds; any new frontend gate, threshold or
  direction on staging or reconcile (the backend predicate stays the only
  hold); real health data in any committed render, fixture or log; secret
  exposure; silent incorrect success (a green gate that ran zero stories).
- **Must recover:** nothing automatically. A failed replay or gate stops the
  pull request.
- **Accepted failure:** below 760px the case file stacks and the schedule
  table scrolls horizontally; a viewport narrower than 390px is not evidenced.
- **Unsupported:** Plan states the QA showcase cannot produce are not live-
  rendered; they are proven through the stubbed opener only.
- **Evidence owed:** the sixteen ledger stories replayed on the revision; the
  first-plan-reconcile and cockpit-shell gates green; paired base/revision
  renders at three viewports; the live nothing-staged render on both.

Why: a single-operator advisory surface whose worst failure is a mis-keyed
pump value read off a wrong cell; the surface's numbers must stay exactly the
draft's. Disposition: copied into the #344 work order.
