# Design — retire the v1 app (#416)

## ADR 416 — The desk is the only shell, served at root, with no transition

**Status:** accepted, Connor Griffin, 2026-09-21.

**Context.** `harmonic-v2` design step 5 ("Cut over and retire separately") and
its tasks 3.5, 4.2 and 4.3 required, in order: Connor's acceptance of the desk, an
explicit root-route cutover approval with the prior frontend kept served and
recoverable during a transition, then v1's retirement once each of its jobs was
preserved or explicitly retired.

**Decision.** Connor, 2026-09-21: "V2's good." "No redirects, no nothing." "If V2
hasn't implemented it, I don't need it." "Kill all the V1 stuff." "just one front
end. There's no V2 anywhere."

1. That statement is the desk's acceptance, the cutover approval and the
   retirement approval at once. Cutover and retirement land in one change. There
   is no transition period and no retained v1 route. The old app is recoverable
   from Git history only. This supersedes `harmonic-v2` design step 5.
2. The desk is served at `/`, its pages at `/diagnose`, `/changes` and `/day`, its
   built assets under `/assets`. The non-API route set stays closed. Every
   `/v2/...` path and the old v1 pages `/verify`, `/plan`, `/settings` and
   `/guide` answer 404. There are no redirects.
3. Every v1 job the desk does not already do is explicitly retired, not ported:
   the fetch status panel and Fetch now button, audit-item dismissal, the topbar
   range indicator, the Day model view log, dose focus, settling and scenario
   chart, and the v1 Verify workstation renderer.
4. Every v1 gate is deleted: nine browser legs, namely the workstation ledger,
   the event-comparison replay, its support audit, the Verify ledger, and the
   workstation, canvas-composition, cockpit-shell, Day lifecycle and first-plan
   legs. The source check that pinned ADR 215's retired Explore-mode guard reads
   the deleted canvas-composition suite and retires with it, as does the
   v1-against-desk clinical-pairs comparison, which has only one app left to
   open. The desk ledger, the desk and follow-up suites, the shared
   browser-runner regression and the fail-closed regression are the browser
   contract. Coverage those v1 gates gave the embedded Diagnose workstation is
   knowingly dropped.
5. One `frontend/` source root. The v2 name leaves the living system. Historical
   records keep their names; the boundary is in "Naming boundary" below.
6. The chart harness is deleted, and so are the design explorations that read
   v1's source and that nothing surviving reads, with their drift checks. The
   one exploration the desk ledger's mock target reads
   (`mockups/harmonic-v2.exploration/`) stays, and its generator's three lifts
   re-point at the rehomed desk source. The no-fetch QA serve of the built desk
   is the safe chart-revision surface.

**Consequences.** A bookmark to any old address breaks. Manual fetch has no UI;
the hourly loop and the CLI remain. A defect in embedded Diagnose behavior that
only a deleted v1 story exercised will no longer fail a gate; the remedy is a new
desk story, filed when found.

## Risk contract

- **Must prevent:** secret exposure; any change to the store, analyzers, safety
  caps or advisory output; silent incorrect success, meaning a gate that passes
  while running zero assertions, or a page that answers 200 with a missing build
  or missing assets.
- **Must recover:** nothing automatically.
- **Accepted failure:** an old bookmark (`/v2/...`, `/plan`, `/verify`,
  `/settings`, `/guide`) answers 404. A missing build answers 503 naming the
  build command. v1-only features are gone with no replacement.
- **Unsupported:** any v1 page, any `/v2` path, restoring v1 other than from Git
  history.
- **Evidence owed:** the closed non-API route set through the HTTP interface,
  including the 404 list; the packaged-runtime proof at root, carried by CI's
  image job on the pull request because the operator's machine has no Docker;
  the complete desk
  ledger at both sizes against the built root-served app; the desk and follow-up
  browser suites; the fast gate; every surviving drift check; the fail-closed
  gate regression test.
- Why: delegated by Connor; defaults applied, priced for a one-operator
  self-hosted tool whose advisory engine this change never touches.
- Disposition: this block is the downstream authority; the scope ledger is the
  session record.

## What survives, and the rule that decides it

A file under today's `frontend/` survives only if the desk's build, the desk's
tests and replays, a surviving generator, or a surviving test reaches it, by
import or by filesystem path. The same rule applies inside a surviving shared
module: an export only v1 called goes with v1.

Triage executed this rule on a throwaway branch; `spike.md` is the record and
`spike/frontend-survivors.txt` (83 files) and `spike/deleted.txt` (51 paths) are
its result. Three things the spike proved that reading had not: three fixtures
are reached only by filesystem path, so an import search alone deletes them;
fifteen exports, not three, are imported from the two v1 replay files, one set of
them by a surviving unit test; and the full backend suite loses only nine tests
in four files. Group 1 copies those fifteen exports into the desk's replay source
and group 2 deletes the two replay files. A missed import cannot hide until the
browser run: the fail-closed regression spawns the desk suite in the fast gate,
and a dangling import exits with a module error instead of the preflight message
it asserts.

Two generators lose their last reader and retire with v1, fixture and CI step
together (`gen_ic_block_fixtures.py`, `gen_annotation_fixtures.py`). The
event-comparison capture keeps its generator and its `--check`: a surviving
generator and a surviving module read it. A synthetic set or fixture is deleted
only when no surviving generator, drift check, test or module reads it, and one
that survives keeps its generator and its `--check`.

The spike's lists are grounding, not the authority. The authority is the rule, proved by the build, the fast gate, the drift checks and pytest
all passing with the file gone. `frontend/index.html` is imported by no node
test, so an extension-filtered search can certify live code dead; the deletion
task uses the desk build and gates as its proof, never a search alone.

## Rehoming what the desk's build lifted

`app-source.mjs` lifts three things from v1's page: the material stylesheet
(role ladder, page reset, body ground), every `.ds-chart-legend` rule, and the
glossary groups. They become committed desk source: one stylesheet and one
glossary module, byte-equivalent in effect to what the lift produced on
origin/main. `app-source.mjs`, its test, the two virtual modules and the config
plugin that fed them are deleted. The proof of equivalence is the desk ledger
and the desk suite passing unchanged, plus a one-time comparison of the built
CSS and glossary before and after, recorded under this change's `evidence/`.

`scripts/check_owned_identifiers.py` guards the browser title, the favicon label
and the page wordmark in v1's page. Those three rules re-point at the desk's page
and the surviving favicon; none is dropped.

## Naming boundary

The v2 name leaves everything a contributor or the running system touches:

- `frontend-v2/` merges into `frontend/`. `frontend-v2/index.html` and
  `frontend-v2/main.js` take the freed names. The desk's chrome stylesheet
  `frontend-v2/shell.css` becomes `frontend/chrome.css`, because the shared
  `frontend/shell.css` keeps its name.
- `vite.config.v2.mjs` becomes the one `vite.config.mjs` with `base: '/'`; the
  `dev:v2` script becomes `dev`; `npm run build` runs one build.
- `frontend/harmonic-v2-desktop-behavior.replay.mjs` becomes
  `frontend/desk-behavior.replay.mjs`. The acceptance driver and its test move
  from `mockups/sweep/harmonic-v2-desktop/` to `scripts/desk_acceptance.py` and
  `scripts/desk_acceptance.test.py`; CI job ids and step names drop the name.
- Router and server identifiers (`V2_PAGE`, `parseV2Route`, `index_v2`,
  `_FRONTEND_V2_DIST`, the `frontend-v2-assets` mount name) lose the prefix.
- Living documents and baseline specifications say "the desk" or "the app".

The boundary is checked by an executed script, `name-boundary.sh` beside this
file, not by judgment. It fails when the v2 name survives in a tracked path, in
one of the enumerated code identifiers, or as a served address outside the four
files that assert `/v2/...` answers 404: the route test, the acceptance driver
and its test, and the desk ledger replay, where `R19` lives. It excludes `openspec/changes/**`,
`docs/scope/**`, `.impeccable/**` and `mockups/**`. It was run at triage: it
exits 1 on origin/main 6821bbf6 with 281 offending lines, 0 on a tree holding
only kept kinds, and 1 on a tree with one stray `/v2/day`.

Everything the script does not search for is out of this change's scope and
stays as it is: the `HV2-NN` lock requirement ids, which cite the frozen
prototype lock; the desk's DOM class names (`.v2-content`, `.v2-nav` and their
family), which the locked prototype shares and the frozen ledger cites by
selector; wire schema versions (`diagnose-findings-v2`, `guidance-v2`,
`evidence-v2`), which number a contract; and comments or test titles that
mention v1 or v2 in passing. Living documents are reworded by task 3.3, where
`mockups/INDEX.md` and `mockups/SCAFFOLD.md` still name historical records by
their names. `mockups/harmonic-v2.exploration/` stays where it is even though
its generator is live: the frozen ledger and lock cite its fixtures by path.

Historical records keep their names and bytes, because renaming a frozen record
rewrites history: `openspec/changes/**` other than this change and the
`harmonic-v2` amendments named in tasks.md, `docs/scope/**`, `.impeccable/**`,
the locked prototype and its records (`mockups/harmonic-v2-*`,
`mockups/harmonic-v2-desktop.lock.md`, `mockups/harmonic-v2-desktop.behavior.md`
apart from the sanctioned story amendments, `mockups/sweep/harmonic-v2-desktop/`
captures and runs), and schema strings such as `eating-sequence-report-v1`.

## Ledger amendment

The desk's frozen ledger asserts the old address in two stories: S86 (Python
serves `/v2/` and `/v2/assets/`) and S87 (v1 and `/v2/` coexist). Under Connor's
2026-09-21 sanction, S86 is amended to assert `/`, the three page paths and
`/assets/`. S87 is retired the way the ledger retires every story: it becomes
`R19`, a ledger entry in the form `R18` has (predecessor S87, verdict retired,
sanction `Connor Griffin · 2026-09-21 · "Kill all the V1 stuff."`, premise) and
a registry entry in the replay with an executable body, because the acceptance
driver requires the ledger's id set to equal the registry's and every selected
story to execute and pass. `R19` asserts the retirement's premise against the
served app: each old v1 page path and each `/v2/...` path answers 404 with no
redirect. It also takes a case mapping wherever the replay maps an id to a
case. Every other
story changes only the address its opener navigates to. No story is weakened, and
no other story is added or retired. The acceptance driver pins the ledger's
inventory as literals (142 issued, 124 active, 18 retired) and its test pins the
issued count; retiring S87 moves them to 142, 123 and 19, which is this
amendment and not a broken record. The rendered surface is unchanged, so this
change carries no visual lock and no new fidelity evidence.

## Verification design

The route change has three owners that must move together: the Python route
policy, the Vite base, and the browser router with its disk-serving mirror.
`tests/test_frontend_asset_routes.py` already asserts the server's page mirror
equals the router's pages and names the complete non-API route set; it is
rewritten first, fails against the unchanged server, then passes. The package
proof in the acceptance driver asserts the same set against the built image.

The packaged-runtime proof (`package` in the acceptance driver) builds and runs
a Docker image. The operator's machine has no Docker, so that proof is CI's image
job on the pull request; locally, the driver's own test covers its expectations.

`frontend/browser-gates-fail-closed.test.js` is the regression for the
must-prevent "a gate that passes while running zero assertions". Its suite list
is all v1 today. It ends naming the one surviving shell-serving leg, the desk
suite, and asserts the list is not empty. The follow-up suite and the
browser-runner regression serve no built shell and were never in that list. The
regression drives each suite through `HARMONIC_DIST` and expects the
build-command message, which today comes from the mirror's v1 arm; so the
mirror's surviving arm takes that variable and that message, and the
regression's rewrite lands in the same group as the mirror's.

Workers under a seatbelt sandbox cannot launch Chromium. The browser legs are
therefore their own last task group, run by whoever can launch a browser, on the
commit that will be pushed, once: the desk suite, the follow-up suite, the
browser-runner regression, and the complete desk ledger at both sizes.

## Sequencing against #413

#413 (desk design completion) is triaged and unstarted on 2026-09-21, with no
branch pushed and no pull request. Its lock orders a desk-only path through the
shared rail and lane code so that v1 renders unchanged, and its verification runs
v1's three ledger replays. Both exist only because v1 is still served. This
change lands first. #413's lock then names paths and gates that no longer exist,
so #413 is re-triaged against the single root before it starts, and it no longer
needs the desk-only path. This change does not touch #413's lock or its change
record `openspec/changes/v2-desk-design-completion` if one is on main.

## Triage review rounds

Three cold Opus panels, each fresh, each BLOCKED; the three-panel cap was
reached with no lock posted. Connor, 2026-09-21, chose to spike the deletion
before a further review ("A, spike it"); `spike.md` is the result, the tasks
were rewritten clean from it, and one further cold review follows.

| Panel | Commit | Blockers | Authoring | Injected | State |
|---|---|---|---|---|---|
| 1 | 55e28f37 | 5 (+3 notes) | 5 | 0 | all reproduced, folded in |
| 2 | f4b9a906 | 5 (+4 notes) | 3 | 2 | all reproduced, folded in |
| 3 | ac03c160 | 5 (+1 note) | 5 | 0 | all reproduced, folded in with the spike |

Panel 3's blockers, now resolved in tasks.md: the disk-serving mirror fails closed through v1's arm
and its own environment variable, so task 1.6 breaks the fail-closed regression
inside group 1; `R19` must name `/v2/...` addresses inside a file
`name-boundary.sh` searches; `frontend/diagnose-workstation.test.js` imports
three more exports from, and reads the source text of, the v1 workstation replay;
`frontend/tab-routing.js` carries v1's router half, which no task deletes and
whose names collide with task 3.2's renames; task 1.4's rewrite drops the
router, server and mirror agreement check that the surfaces requirement owes.
Note: CI's no-fetch server step loses its only selecting matrix entry.

None of the fifteen blockers was a product decision. Each was a coupling between
the shared tree and v1 that reading did not find. That is the signal to discover
the closure by executing the deletion against the build and the gates before
writing the lock, not to patch the prose a fourth time.
