# Evidence — only sanctioned colour moved (#317)

#317 finishes the graphite palette on the running app. Three operator rulings
landed (ADR 317 in `../design.md`): high-glucose marks take gold
(`--high` `#e07f3f` → `#e2be4c`), the Verify trial ribbon holds at 20%/20%,
and the chrome bar moves one step up the ladder, from the desk to the well
(`--ck-ground` on the top bar and footer, `#0f0d0b` → `#14120f`). The claim
this evidence carries is that nothing else moved: between the ticket base and
the revision, every computed-style difference on every gated state is a colour
that a moved token explains, and no element, layout or typographic property
differs.

`palette-diff.mjs` proves that by opening both builds side by side and diffing
the complete `getComputedStyle` of every element, in every gated state, at
every viewport. Its one sanction rule is `admits` from `palette-rule.mjs`
(`node palette-rule.mjs --self-check`: 13 of 13 cases), fed the **Moved
tokens** list and the **Derived colour pairs** table read from `../design.md`
at run time — the record is the only authority for what may differ. Before
diffing, every moved token is read off the element the record names on both
sides and must resolve to the recorded before-value on the base and after-value
on the revision; otherwise the run fails as "not the ticket base". A state that
compares zero elements fails the run.

All renders use the generated synthetic database
(`mockups/revise-e2e.synthetic/harmonic.sqlite`, built by
`scripts/gen_revise_e2e_db.py`) served through the mandatory `--no-fetch`
flag. No personal or production health data appears here, and no live pull
runs. The Verify ribbon renders answer the app from the Verify gate's synthetic
fixture payload instead, because neither committed database holds a Trial.

## Provenance

- **Base** — `34264622`, the merge-base of the ticket branch with
  `origin/main`, checked out at `/Users/connor/worktrees/harmonic/317-base`,
  served on port **8318**.
- **Revision** — the ticket branch with chunks 1 and 2 merged, `3dc2bf6`,
  checked out at `/Users/connor/worktrees/harmonic/317-c3` (the chunk-3 branch
  at that commit; this chunk adds only this directory and `mockups/INDEX.md`),
  served on port **8317**.
- Both servers answer from the same committed synthetic database, so every API
  read is identical on the two sides and any difference the diff reports is a
  styling difference. The database is restored to its committed bytes after
  the run.
- Driver: the repository's browser-gate Playwright and vendored Vue and ECharts
  (`scripts/ensure_browser_gate_env.py`), 2026-09-02.
- The two serves, each started from its own worktree root, exactly as
  `AGENTS.md` "The data boundary" permits (the `--no-fetch` flag is mandatory;
  the QA copy-then-serve entrypoint serves a different database, on which
  `/plan` never reaches `.active-profile-ref`, so it is not a substitute):

  ```
  cd /Users/connor/worktrees/harmonic/317-base && uv run --frozen --extra api harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite --port 8318
  cd /Users/connor/worktrees/harmonic/317-c3  && uv run --frozen --extra api harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite --port 8317
  ```

## Moved tokens (from `../design.md`, read by the run)

| Token | Read on | Before | After | Ruling |
|---|---|---|---|---|
| `--high` | document element | `#e07f3f` | `#e2be4c` | high-glucose hue |
| `--ck-ground` | `.cockpit-topbar` (and the footer) | `#0f0d0b` | `#14120f` | chrome bar |
| `--ck-bar-on-signal` | the same elements, follows `--ck-ground` | `#0f0d0b` | `#14120f` | chrome bar |

Derived colour pairs: none needed. The run of record reports zero refusals,
so no runtime-only token (an inline custom property such as the navigator
tiles' `--sev`, or an alpha wash of a moved token) surfaced as an unlisted
pair; `palette-diff.json` lists no `--sev` entry on either side.

## States and viewports

| State | Address | Ready signal | Gate it follows |
|---|---|---|---|
| `shell` | `/` | `.cockpit-shell` | `frontend/cockpit-shell.browser.test.mjs` |
| `shell-drawer` | `/`, drawer opened | `.cockpit-shell` | as above |
| `diagnose` | `/diagnose` | `.dw` | `frontend/diagnose-workstation.browser.test.mjs` |
| `verify` | `/verify` | `.vw` | `frontend/verify-660-story-behavior.replay.mjs` |
| `day` | `/day` | `.ds-root` | `frontend/day-surface.browser.mjs` |
| `plan` | `/plan` | `.active-profile-ref` | `frontend/cockpit-shell.browser.test.mjs` (its readiness map) |

Viewports: 1440×900, 1280×800, 390×844 — eighteen state/viewport pairs. Above
the cockpit breakpoint the drawer trigger is `display: none`; `shell-drawer`
records that on both sides and leaves the drawer closed, so the pair stays
comparable rather than failing. The router canonicalises `/` to Diagnose, so
`shell` is the Diagnose page reached by the shell gate's own address, and at
all three viewports its renders are byte-identical to `diagnose`'s; the
states are kept separate because each is reached the way its own gate reaches
it.

## The run of record

```
BASE_URL_BASE=http://127.0.0.1:8318 BASE_URL_REVISION=http://127.0.0.1:8317 \
OUT_DIR=openspec/changes/graphite-palette/evidence \
PLAYWRIGHT_MODULE=$PW/node_modules/playwright VENDOR_DIR=$VENDOR \
node openspec/changes/graphite-palette/evidence/palette-diff.mjs
```

Complete stdout: `palette-diff.stdout.txt` (ends with the exit code). Machine
report: `palette-diff.json`. Text report: `palette-diff.report.txt`.

```
## summary
states × viewports          18
elements compared           8237
computed properties read    4737084
admitted colour differences 10450
unexplained differences     0
base-check mismatches       0
states comparing nothing    0

PASS: only sanctioned colour differs between base and revision.

wrote /Users/connor/worktrees/harmonic/317-c3/openspec/changes/graphite-palette/evidence/palette-diff.json
wrote /Users/connor/worktrees/harmonic/317-c3/openspec/changes/graphite-palette/evidence/palette-diff.report.txt
exit=0
```

The first run against a just-started revision server reported 25 unexplained
differences, all in the first pair captured (`shell @ 1440×900`): the
server's warm-up fetch status rendered a "pending / Last attempt / Last
success" card and a wider scope chip on the revision side only. That is a
serve-lifecycle transient, not a palette difference; the run of record above
was taken once both servers were warm, and every later run compared the same
8,237 elements on both sides.

## Fails closed — three deliberate mutations on the revision side

Each mutation edits the revision worktree, re-runs the diff, and is reverted.
Command and complete summary output for each are in `mutations/`:

| # | Mutation | Unexplained differences | Exit | Transcript |
|---|---|---|---|---|
| 1 | one layout property: `.cockpit-topbar` padding 16px → 17px in `frontend/shell.css` | 48 | 1 | `mutations/mutation-1.txt` |
| 2 | one colour on a token outside the moved-token list: `--low` `#ec6f55` → `#ec6f56` in `frontend/index.html` | 8830 | 1 | `mutations/mutation-2.txt` |
| 3 | one hardcoded colour literal no token owns: the dock-floor `#36312e` → `#36312f` in `frontend/theme.css` | 9 | 1 | `mutations/mutation-3.txt` |

## Before/after renders

`render-states.mjs` captures the same six states at the same three viewports
from both servers into `renders/` as `<state>-<w>x<h>-<base|revision>.png`
(36 frames). The Verify ribbon is canvas, which the computed-style diff cannot
see, so its evidence is the six frames `verify-trial-opener.mjs` renders on
the fixture's profile Trial: on the base `20/20` and `32/18`, each as-is and
mirrored (`SWAP=1`, Before and Trial exchanged so the Trial band has area);
on the revision `20/20` as-is and mirrored. The ruling held the ribbon at
20/20, so base and revision render the same setting; the 32/18 frames record
the candidate the operator saw and retired. The six invocations, run from the
chunk-3 worktree with `PLAYWRIGHT_MODULE` and `VENDOR_DIR` set as above:

```
FRONTEND_ROOT=/Users/connor/worktrees/harmonic/317-base RIBBON=20/20 TRIAL=Profile        OUT=renders/verify-ribbon-20-20-1440x900-base.png              node verify-trial-opener.mjs
FRONTEND_ROOT=/Users/connor/worktrees/harmonic/317-base RIBBON=32/18 TRIAL=Profile        OUT=renders/verify-ribbon-32-18-1440x900-base.png              node verify-trial-opener.mjs
FRONTEND_ROOT=/Users/connor/worktrees/harmonic/317-base RIBBON=20/20 TRIAL=Profile SWAP=1 OUT=renders/verify-ribbon-20-20-mirrored-1440x900-base.png     node verify-trial-opener.mjs
FRONTEND_ROOT=/Users/connor/worktrees/harmonic/317-base RIBBON=32/18 TRIAL=Profile SWAP=1 OUT=renders/verify-ribbon-32-18-mirrored-1440x900-base.png     node verify-trial-opener.mjs
FRONTEND_ROOT=/Users/connor/worktrees/harmonic/317-c3   RIBBON=20/20 TRIAL=Profile        OUT=renders/verify-ribbon-20-20-1440x900-revision.png          node verify-trial-opener.mjs
FRONTEND_ROOT=/Users/connor/worktrees/harmonic/317-c3   RIBBON=20/20 TRIAL=Profile SWAP=1 OUT=renders/verify-ribbon-20-20-mirrored-1440x900-revision.png node verify-trial-opener.mjs
```

The 36 state renders:

```
BASE_URL_BASE=http://127.0.0.1:8318 BASE_URL_REVISION=http://127.0.0.1:8317 OUT_DIR=renders node render-states.mjs
```
