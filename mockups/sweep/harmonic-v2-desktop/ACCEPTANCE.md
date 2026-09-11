# C4 execution handoff

C4 authors these commands; the coordinator runs the browser, budget, packaging
and archive legs. Nothing in this file claims those legs have run. The builder
index is [fidelity.md](fidelity.md). Keep all command output and captures in
fresh scratch directories. Never point a command at a live wearer database.

## Amendment dispositions and remaining acceptance

The ticket branch was merged before the amendment work, carrying #342's twelve
sequence recipes and the rail's 183 issued / 168 active / 15 retired inventory.
The v2 ledger remains 130 issued entries (112 active and 18 permanent retirements).
R18 is now registered and uses `c4-history`, whose actual API input includes a
historical I:C row beside current basal evidence and retained Trial/Focus records.
The registry inventory is complete; browser verdicts remain coordinator-owned.

The v1 Google Fonts link is a carried shipped fact under ADR 397 for a follow-up
issue; amendment 1 scopes no-CDN acceptance to v2 and the assets #389 packages.
The runtime probe records those v1 links without requesting them, verifies both
shells' local assets, and rejects external v2 references.

Amendment 2 supersedes amendment 1's publication ruling: the v2 replay depends
on six private exploration JSON files and stays private. Its c3/c4 importing
tests and the follow-up browser test that launches it are also excluded from
the public tree. Literal prototype paths and comments remain visible in source.
Amendment 3 removes scan-config pins for these excluded files, including c3's
calendar-label prose exemption, because the public-tree scan never sees them.
The generated dose/ratio baseline remains the only prose exemption; no scan
threshold or dose/ratio baseline changed.
CI steps naming private sweep tools follow the existing precedent documented in
CLAUDE.md: private exploration `--check` commands also live in ci.yml.

Obligation 6 previously lacked I:C, Correction factor and whole-profile retained
follow-up records, and a real missing-outcome rendering input. `c4-ic`, `c4-isf`,
`c4-profile` and `c4-missing` now supply those through existing producers. S91
retains c3's served-verdict negative proof and then opens all three setting cases
in fresh contexts. S49 retains its observed-zero proof and then renders the real
missing-outcome case. The basal and Pattern cases remain c3's; the Pattern's
opportunity gate supersedes the historical elapsed-days wording in obligation 6.

HV2-06/HV2-08 named judgments, clinical pairs, transient-state captures, the full
browser and Docker runs, final budgets, Fable polish and archive close remain
coordinator-owned. No rendered evidence or independent verdict is claimed here.

## Twelve scenario obligations

All named stores come from `scripts/qa_e2e_cases.py` via
`uv run python scripts/gen_qa_e2e_db.py --case <name> --out <scratch.sqlite>`.
The showcase is the committed stamped output; named case stores remain scratch.
This table inventories reachable sources and outstanding evidence, not passes.

| Obligation | Existing source and exercising stories | Outstanding proof |
| --- | --- | --- |
| 1 Geometry | showcase, basal-lower, basal-no-change, c3-trial/c3-focus; S4–S10b, S37, S59–S60 | Actual dense inner overflow and both-size eye judgments |
| 2 Changes guidance | basal-lower, basal-no-change, c3-trial, c3-pin; S14–S20b/S37/S88/S99 | Whole integrated run, failed-read live checkpoints and served unavailability |
| 3 Basal evidence | basal-lower, basal-insufficient-seven-night and recurring-low catalog cases; S31–S36/S99 | Dense lane, held/thin numbers and exact Day return renders |
| 4 Other setting families | isf-strengthen/isf-held, ic-lower/ic-held; S13/S43/S44 | Both-size evidence and distinct delivery paths |
| 5 Plan | basal-lower plus the replay's public Store pump capture; S38–S44/S89/S90 | Full run, two capacity schedules and transient failed writes |
| 6 Readiness | c3-trial/c3-focus plus c4-ic/c4-isf/c4-profile in S91 and c4-missing in S49 | Both-size rendered proof of each unit, past-14-day accumulation, criterion-met/unclear, unavailable with served reason, and c3 S92/S94 inconclusive ending |
| 7 Focus | c3-focus/c3-pin/c3-preempted; S56–S59/S93/S95 | Rendered zero-opportunity, absent measurement and observed-zero distinctions |
| 8 History | c3-history/c3-preempted; S54/S54b/S96 | Complete saved/retained/legacy/sequential inspection |
| 9 Replacement | basal-lower and ic-lower; S97/S98 | Live pending/error/sliced and current I:C refresh checkpoints |
| 10 Event comparison | showcase, existing event-comparison synthetic capture; S21–S28/S100 and inherited Event replay | Final cohorts, support, traversal and speech at both sizes |
| 11 Day | showcase and c3 follow-up cases; S60–S67/S76, c2 contextual entries | Exact setting/event/Focus/question return and recorded week/month |
| 12 Utilities | showcase; S68–S81 | Unsaved input, invalid entry, failed save, precise focus and Pump settings checkpoints |

C4 added five recipes: c4-ic, c4-isf, c4-profile, c4-missing and c4-history,
with literal producer expectations and matching EXPECTED_CASE_NAMES entries.
Their generated stores stay in scratch; no generated store artifact was committed.

## Runnable legs

Run from the checkout root. `acceptance.py --help` describes its interface.
Use the warm isolated Playwright environment. On this Mac set a scratch cache
when sandboxed; the commands below use the required Python 3.14 binary.
The runner passes each logged command as an argument array without a shell.

```sh
export UV_CACHE_DIR="${TMPDIR:-/tmp}/harmonic-389-c4-uv"
export npm_config_cache="${TMPDIR:-/tmp}/harmonic-389-c4-npm"
eval "$(/opt/homebrew/bin/python3.14 scripts/ensure_browser_gate_env.py)"
evidence="$(mktemp -d "${TMPDIR:-/tmp}/harmonic-389-c4-evidence.XXXXXX")"
/opt/homebrew/bin/python3.14 mockups/sweep/harmonic-v2-desktop/acceptance.py checks --out "$evidence/checks"
/opt/homebrew/bin/python3.14 mockups/sweep/harmonic-v2-desktop/acceptance.test.py
/opt/homebrew/bin/python3.14 mockups/sweep/harmonic-v2-desktop/acceptance.py inventory --out "$evidence/inventory"
```

`checks` builds both shells, runs both Node roots plus a separate nonzero v2
count, validates OpenSpec, runs the three guards, all fourteen Python drift
commands and both Node drift commands. It does not run pytest or Chromium.
C4's five new recipes emit scratch stores; no generated store artifact was
committed, so there is no new committed generated fixture whose `--check`
perturbation can be claimed. Existing QA drift rejection is covered by
`tests/test_gen_qa_e2e_db.py::QaE2EDatabaseGeneratorTest`.

Run the budget leg alone on the machine, after both shells are built. It records
full pytest wall time, showcase bytes, showcase drift wall time, focused QA wall
time and the slowest generated case, with the unchanged 160 s baseline / 400 s
ceiling. The generated-case timing is the whole pytest case, including fixture
materialization and producer assertions, a conservative upper bound on generation.
No limit is raised. A breach exits nonzero and leaves the showcase unchanged.

```sh
/opt/homebrew/bin/python3.14 mockups/sweep/harmonic-v2-desktop/acceptance.py budget --out "$evidence/budget"
```

Run both complete app replays serially.
Port 8765 must be free: the existing per-story case server owns it. The wrapper
owns a separate synthetic copy with the disposable token on 8766 for S87.
Both servers use `--no-fetch`. `ONLY` and case overrides are removed by the
wrapper; each applicable ledger entry must execute, with zero deferred.

The full command remains unsharded by default. `--shard k/n` selects a
contiguous slice of registry order after the same complete inventory check.
Empty shards, malformed shard arguments, missing/duplicate/wrong PASS IDs,
deferred entries and incomplete summaries fail. The wrapper discards inherited
`ONLY` and `STORY_CASES` before applying its own selection.

CI's named shard inventories in [ci.yml](../../../.github/workflows/ci.yml) own the shard lists.
The `v2-ledger-plan` job selects the inventory before `v2-ledger` expands it.
Every artifact has a unique size/shard name and retains `selection.json`, `inputs.json`, command
records, raw logs and captures. Concatenating `complete-replay.log` files in
numeric shard order preserves the complete registry's story order. Keep all
shard headers and summaries; require every shard and the same input hashes
before citing their union as a complete run. The receipt must cite the whole
artifact set for each size. Local shards must run serially on this machine;
they own the same ports. Timeout measurements and ceilings are stated below.

```sh
/opt/homebrew/bin/python3.14 mockups/sweep/harmonic-v2-desktop/acceptance.py replay --viewport 1280x720 --out "$evidence/app-1280x720"
/opt/homebrew/bin/python3.14 mockups/sweep/harmonic-v2-desktop/acceptance.py replay --viewport 1440x900 --out "$evidence/app-1440x900"
```

Each run records raw logs, command durations/exit codes, input hashes and selected
story-endpoint screenshots with text, computed geometry/material and a labelled
HTML wrapper. Inter must actually be loaded. The capture hook never changes page
content, story bodies or selectors. Its Inter check fails closed: an unloaded
font throws into the runner's story catch and marks the story failed.
`CAPTURE_ONLY` limits **captures**,
not the executed story set. Treat screenshots as synthetic only while kept with
their labelled wrapper/transcript. Captures remain scratch artifacts, not new
committed fixtures. No screenshot is an independent eye verdict.

The selected endpoints are S1, S3, S7b, S9, S14, S15, S18, S19, S21, S23,
S31, S33, S36, S37, S39, S45, S49, S51, S54, S56, S57, S58, S59, S60,
S61, S64, S65, S66, S68, S69, S74, S75, S77, S93 and S99. Their
names remain their frozen story IDs; the transcript says exactly which
post-story state was captured. Live inspection must additionally pause inside
P19b pending/failure, I:C replacement/failure, save/finish/pin failures, selected
cursor/clock gestures and unsaved utility drafts before their retries/cleanup.

S100 is included in both full runs. Its inherited Event S8 helper closes the
page in `finally`, so S100 has no post-story capture endpoint. The wrapper
excludes only that capture; it neither skips S100 nor suppresses capture errors
for other stories. Its speech assertions remain the evidence of the integrated
repair. To isolate those assertions,
with port 8765 free:

```sh
TARGET=app BASE_URL=http://127.0.0.1:8765 VIEWPORT=1280x720 ONLY=S100 CASE_STORE_DIR="$evidence/s100-1280" node frontend/harmonic-v2-desktop-behavior.replay.mjs
TARGET=app BASE_URL=http://127.0.0.1:8765 VIEWPORT=1440x900 ONLY=S100 CASE_STORE_DIR="$evidence/s100-1440" node frontend/harmonic-v2-desktop-behavior.replay.mjs
```

## Amendment render commands: R18, units, missing outcomes and named eyes

With port 8765 free and the isolated Playwright environment exported, these
focused runs need no auth server because they do not select S87. Each S91 run
also executes its three c4 setting variants; S49 also executes c4-missing.
Their `S91-c4-*` and `S49-c4-missing` captures name the exact source case.

```sh
TARGET=app VIEWPORT=1280x720 ONLY=R18,S49,S91 CASE_STORE_DIR="$evidence/amendment-cases-1280" CAPTURE_DIR="$evidence/amendment-1280" node frontend/harmonic-v2-desktop-behavior.replay.mjs
TARGET=app VIEWPORT=1440x900 ONLY=R18,S49,S91 CASE_STORE_DIR="$evidence/amendment-cases-1440" CAPTURE_DIR="$evidence/amendment-1440" node frontend/harmonic-v2-desktop-behavior.replay.mjs
TARGET=app VIEWPORT=1280x720 ONLY=S9,S18,S37,S45,S57,S59,S60 CASE_STORE_DIR="$evidence/eye-cases-1280" CAPTURE_DIR="$evidence/eyes-1280" node frontend/harmonic-v2-desktop-behavior.replay.mjs
TARGET=app VIEWPORT=1440x900 ONLY=S9,S18,S37,S45,S57,S59,S60 CASE_STORE_DIR="$evidence/eye-cases-1440" CAPTURE_DIR="$evidence/eyes-1440" node frontend/harmonic-v2-desktop-behavior.replay.mjs
```

For HV2-06 the coordinator names their judgment of dense Diagnose, paired Trial
and Focus, and the full-width empty Changes state. For HV2-08 they inspect Inter,
font weights, numerals, contrast and flat surfaces at both sizes using each
capture's computed styles, font inventory and screenshot. Record the judge and
verdict separately for each term and size. The commands do not assign verdicts.

The clinical-pair driver opens both shipped compositions against one fresh
manufactured store per setting family. Its shared response cache serves the
identical clinical response body to both consumers, records SHA-256 and the raw
response, and fails if the expected endpoint is not consumed by both. It uses
v1's shared clinical renderer as the source reference; the historical prototype
captures below remain a separate material/geometry reference under ADR 397.

`CAPTURE_DIR` must be a fresh, nonexistent directory outside the worktree with
an existing parent. The driver creates it and refuses any existing path, even
an empty directory. For a rerun, choose new directory names for both viewports;
do not pre-create those two directories.

```sh
VIEWPORT=1280x720 CAPTURE_DIR="$evidence/clinical-pairs-1280" node mockups/sweep/harmonic-v2-desktop/clinical-pairs.mjs
VIEWPORT=1440x900 CAPTURE_DIR="$evidence/clinical-pairs-1440" node mockups/sweep/harmonic-v2-desktop/clinical-pairs.mjs
```

These commands are prepared, not run. Same-byte transport is only one part of
clinical fidelity; the coordinator must inspect each Basal, Correction factor
and I:C pair and record whether the plotted data, axes and reading are faithful.

## Fast-gates measurements and ceilings (#406)

Every browser matrix leg has an explicit job timeout. These are whole-job
ceilings, including setup and artifact retention. The table is the single
written timeout rationale; ci.yml holds the executable values. Measurements
are from ubuntu-latest jobs on 2026-09-10 in runs
[34528197575](https://github.com/harmonichq/harmonic/actions/runs/34528197575),
[34534519065](https://github.com/harmonichq/harmonic/actions/runs/34534519065),
completed legs of
[34537427194](https://github.com/harmonichq/harmonic/actions/runs/34537427194),
and the sharded run
[34545568885](https://github.com/harmonichq/harmonic/actions/runs/34545568885).
Use the largest observed whole-job duration across those samples. A cancelled
or failed run is identified explicitly; it is not a successful timing proof.

| Browser leg | Measured runner wall time | Job ceiling | Headroom above sample |
| --- | --- | --- | --- |
| Day lifecycle | 0m57s | 5 min | 4m03s |
| Diagnose workstation | 4m37s | 10 min | 5m23s |
| Diagnose canvas composition | 2m32s | 6 min | 3m28s |
| Cockpit shell | 1m10s | 6 min | 4m50s |
| Browser runner lifecycle | 0m26s | 5 min | 4m34s |
| V2 desk | 0m47s | 5 min | 4m13s |
| V2 Trial and Pattern Focus | 11m44s successful; an earlier run cancelled at 15m14s | 30 min | 14m46s above the interrupted lower bound |
| V2 full ledger, each shard at either size | Measured shards: 276–569 s (eight jobs; two story failures) | 21 min | 691 s above the slowest measured shard |
| V2 PR smoke, each size | Historical expanded smoke jobs: 1917 s / 1905 s, with story failures; complete selections now use full shards | 60 min | 1683 s above the longer measured job; a partial selection can still approach the full count |
| First-plan reconcile | 0m38s | 5 min | 4m22s |
| Diagnose workstation behaviour ledger | 10m32s successful | 21 min | 10m28s |
| Diagnose event comparisons | 1m29s | 6 min | 4m31s |
| Diagnose comparison support audit | 0m48s | 5 min | 4m12s |
| Verify behaviour ledger | 0m36s | 5 min | 4m24s |

The full-ledger replay process ceiling is 960 seconds for a shard, leaving five
minutes inside its CI job for setup, server teardown and retention. Unsharded
local runs and partial PR smoke runs use 3000 seconds; their jobs reserve ten
minutes outside the process ceiling. A PR selecting every story uses the full
shard inventory and its shorter process/job ceilings.

Run 34545568885 supplies actual sharded runner measurements, replacing the
unsharded-run division used before. Whole-job seconds in numeric shard order:

| Size | Shard 1 | Shard 2 | Shard 3 | Shard 4 |
| --- | ---: | ---: | ---: | ---: |
| 1280×720 | 532 | 276 | 569 | 516 (R6 failed) |
| 1440×900 | 534 | 361 (S32 failed) | 554 | 543 |

The slowest shard completed successfully in 569 s. Preserve the prior 372.55 s
process headroom allowance, using that whole-job measurement conservatively:
`569 + 372.55 = 941.55 s`, rounded up to a whole minute gives 960 s. Adding the
same five-minute setup/teardown/retention allowance gives a 21-minute job.
The process has 391 s above the measured whole-job duration. The previous
unsharded measurements (1430/1575 s in run 34539350410) and local shard
measurement (195.91 s on 9652979a, build excluded) are historical comparisons,
not the current ceiling basis. The two failed shards remain failures; their
wall times are not green acceptance evidence.

Every ceiling was checked against the new job list. Preserve each previously
stated headroom allowance and round up to a whole minute when the current
ceiling no longer fits it. Cockpit shell now needs `70 + 236 = 306 s`, rounded
to six minutes; event comparisons need `89 + 212 = 301 s`, also six minutes;
the v1 ledger needs `632 + 584 = 1216 s`, rounded to 21 minutes. All other
browser matrix ceilings retain at least their stated allowance. Browser setup
measured 23 s against 15 minutes; the browser aggregate measured 4 s against
five minutes. Partial smoke was not exercised by this run and retains its
prior full-count comparison and ceiling. Contiguous partitions have equal
counts, not equal cost. The full local coordinator run remains required for
its separate browser proof.


The first PR run on this branch,
[34542522691](https://github.com/harmonichq/harmonic/actions/runs/34542522691),
measured the v1 Diagnose workstation ledger at 565 s (failed at S140), and the
expanded PR smoke legs at 1917 s for 1280×720 and 1905 s for 1440×900 (failed).
These are whole-job wall times from the job list. The PR legs selected all 130
stories but ran one partition per size. Selection now happens before matrix
expansion: that same escalation uses main's full shard inventory. These numbers
are historical full-selection timings, not measurements of the new shards.


The same sharded run measured backend jobs at 222 / 568 / 220 s (the order's
rounded summary calls the first approximately 220 s), generator checks at
337 s, and selection at 16 s. All passed. The corresponding pytest processes
took 204.76 / 545.18 / 196.60 s. These complete measurements replace the old
959-second suite division and interrupted generator lower bound.

| Job | Measured whole-job seconds | Job ceiling | Headroom above sample |
| --- | ---: | --- | --- |
| Backend shard 1/3 | 222 | 20 min | 978 s |
| Backend shard 2/3 | 568 | 20 min | 632 s |
| Backend shard 3/3 | 220 | 20 min | 980 s |
| Generator drift checks | 337 | 12 min | 383 s |
| Backend aggregate | 4 | 3 min | 176 s |
| Latest nightly bootstrap | 9 | 3 min | 171 s; aggregate lookup still unmeasured |
| V2 ledger selection | 16 | 5 min | 284 s |
| ADR/public-tree guards | 37 | 10 min | 563 s |
| Frontend Node checks | 19 | 10 min | 581 s |
| Packaged-runtime check | 32 | 10 min | 568 s |

The backend allowance stays approximately 580 s: `568 + 580 = 1148 s`, rounded
up to 20 minutes. The wrapper process ceiling becomes 1140 s, retaining the
one-minute outer allowance. The generator allowance stays 367 s:
`337 + 367 = 704 s`, rounded up to 12 minutes. The QA drift step recorded 0 s
at job-list timestamp resolution inside its three-minute ceiling. Selection and aggregate jobs retain their
ceilings; their previous allowances were operational budgets, not ratios.
Scheduled nightly aggregation (three minutes), status publication (five
minutes), and main image publication (ten minutes) were skipped in this PR
run and retain their previous operational budgets without a new measurement.

Round-robin backend partitioning stays. The retained pytest logs and command
records contain only shard totals, without per-test/per-file durations or
JUnit timing data; the job list cannot assign the 568 s to individual files.
The wrapper can pass a weighted partition, but this evidence cannot produce a
measured weight table. Guessing from test counts would replace deterministic
round-robin with unmeasured weights. A future measured table must be the sole
partition weight authority; none is invented here.

The case transport already generated each raw case once per run. It now also
reconciles that template once, then copies it for every story. Each copy clears
its old WAL, SHM and derived-store files. Stories never serve or mutate the
template. Nested case changes and Trial/Focus use this same transport. No cache
is shared across commands, shards or commits.

`case-cache --check` delegates showcase validation to `gen_qa_e2e_db.check()`.
For each non-showcase registry case it generates two stores and compares
logical SQLite dumps using the existing generator's dump rule. `c3-history`
generation stamps observation metadata with the wall clock; the comparison
freezes `watched_change.datetime` for both generations instead of dropping
fields. Normal replay generation uses its existing clock. The check also
mutates each story copy and its derived file, then requires the next copy to
match the prepared template byte-for-byte with no derived file. CI runs this
browser-free check without running the removed copy-then-reconcile benchmark.
An empty registry or explicit case selection fails before preparation. `--case`
selects a specific case (repeatable), including a nested variant; it does not
change the replay's case mapping.

```sh
uv run python mockups/sweep/harmonic-v2-desktop/acceptance.py case-cache --check --out "$evidence/case-cache"
uv run python mockups/sweep/harmonic-v2-desktop/acceptance.py replay --viewport 1280x720 --shard 1/4 --out "$evidence/shard-1"
```

Opt into a one-off preparation benchmark separately:

```sh
uv run python mockups/sweep/harmonic-v2-desktop/acceptance.py case-cache --benchmark --out "$evidence/case-benchmark"
```

Only `--benchmark` writes `case-times.json`: three warm measurements per case
comparing the previous raw-copy-plus-reconcile path with prepared copying,
and the first cold preparation cost. Keep measured numbers with that run's
receipt. This isolates store preparation; it is not an end-to-end story or CI
speedup. Full replay logs include `# story-time <id> milliseconds=...` through
story teardown and `# case-copy ... milliseconds=...` for each prepared copy.
Retain both when measuring runner cost and nested case switches.

## PR smoke, full main/nightly runs, and backend shards (#406 chunk 2)

Every event runs the complete backend suite as deterministic, sorted-file
round-robin partitions. Each partition receives explicit test-file arguments;
pytest's zero-collection exit is a failure. The wrapper test enumerates `tests/`
independently and requires the CI partitions' union to equal that inventory
without overlap. `test-files.json` and raw output are retained per shard.
The generator job runs the existing twelve fixture drift commands, both Python
exploration checks and guidance/Plan parity in parallel with pytest. It also
owns the wrapper and cache checks. The `pytest (backend)` aggregate requires
all test shards and the generator job, preserving the existing required name.

On pull requests, `v2-ledger` runs the fixed `SMOKE_STORIES` slice from
acceptance.py plus touched stories. A browser-free `replay-plan` CI leg resolves
that selection first. A complete selection uses the named `full` inventory,
exactly as main does; a partial selection uses the named `smoke` inventory with
one partition per size. Job names show mode, shard and total selected count.
The plan and its selection reasons are retained in the `v2-plan` artifact.
The fixed slice is pinned by a digest and checked against the actual dependency
closures for every generated case, including nested variants, and all three
destinations. It includes the utility entry points. It is not a second registry.

`--base <ref>` compares the merge-base with committed HEAD. The selector uses
Babel's parser declared as a direct devDependency and pinned in the frontend
lockfile (run `npm ci` first).
It compares exported story functions, object-method stories and the transitive
helpers and constants they reference. Imported replay helpers are followed too;
the inherited `STORY:` comments retain their namespaced identities. The v2
files themselves have no `STORY:` comments, so their exported registry names
supply that identity. Both old and new graphs participate, retaining deleted
helpers and renamed bindings in the affected set. Python's AST supplies case
recipe and materializer dependencies without executing recipes. Shared runner,
registry, transport, generator or acceptance-driver changes select the full
ledger. Unrelated production changes receive the fixed smoke coverage. Selection
errors fail; they never return a silently empty subset.

`smoke.json` records the comparison commits, changed files, affected symbols,
case/destination coverage and selected IDs. `selection.json` distinguishes
`smoke` and `full` receipts. A PR smoke receipt cannot be cited as full coverage.
The other explicit browser suites and inherited ledgers retain their existing
commands on every event.

Main pushes and the scheduled event run every full v2 partition. ci.yml owns
the nightly cron and both matrix inventories. Nightly runs do not publish an
image. The `nightly result` job computes the backend, docs, frontend and browser
aggregate once. The PR `latest nightly` check and the scheduled publisher both
read that same job's conclusion through the shared `nightly_result()` lookup.
The PR reads it from the latest completed scheduled CI run on main; publication
reads it from its own scheduled run after the aggregate finishes. Neither
reader substitutes the overall workflow conclusion or recomputes the job results.
The [workflow-jobs API](https://docs.github.com/en/rest/actions/workflow-jobs)
lookup uses the latest attempt and follows pagination.

A result older than 36 hours, measured from the scheduled run's `run_started_at`,
does not satisfy either reader, even when its aggregate is green. Exactly 36
hours is allowed. An existing run with a missing/incomplete aggregate fails.
API errors and failed, cancelled or skipped aggregates fail. An in-progress
nightly does not erase the last completed result used by a PR. Both readers
retain `nightly.json` with the run, aggregate, age and resulting state.

After the first scheduled CI run with the aggregate exists on main, configure
branch protection to require `latest nightly` as well as the existing
backend/browser checks. This workflow exposes the check; it does not edit
repository protection. Bootstrap is the sole exception: if no scheduled run
has completed, the PR check passes with a warning in the job summary and a
`bootstrap: true` receipt. Once a completed scheduled run exists, the green
aggregate and 36-hour rules apply unchanged. A missing aggregate in an existing
run is a failure, not bootstrap. API errors remain failures even during bootstrap.
At the end of every scheduled run, `nightly-status` publishes the shared result
to each open PR's head and test-merge commit under the same `latest nightly`
context. This blocks an existing PR whose earlier check read a green nightly
before the new failure. Both a check and commit status with the same required
name must pass, per
[GitHub's required-check rules](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).
Only the scheduled publisher has status-write permission; it checks out main
and never executes a PR's code with that token. A prior failed PR check still
needs a rerun after a healthy nightly. Freshness is evaluated when a check or
publication runs; GitHub statuses do not expire by themselves. Retain the
publication receipt and investigate a failed publisher before relying on the
refreshed statuses. A publisher failure does not change the shared test aggregate.

The full local v2 ledger remains one shell command, run serially at both sizes
once on the commit that will be pushed. Omit `--base` to run the full inventory.
Build both shells and set PLAYWRIGHT_MODULE as documented above first. This
cost was approximately thirteen minutes per size before the cache change.

```sh
(
  for viewport in 1280x720 1440x900; do
    uv run python mockups/sweep/harmonic-v2-desktop/acceptance.py replay --viewport "$viewport" --out "$evidence/full-$viewport" || exit
  done
)
```

To execute a backend partition, use the desired shard argument from ci.yml
with `acceptance.py pytest --shard <k/n> --out <fresh scratch>`. Run the full
backend locally with the existing `uv run python -m pytest` command after
building both shells. PR smoke execution is `replay --base <ref>`. The CI-called
`replay-plan` leg owns matrix planning and requires the workflow's `REPLAY_SHARDS`
environment value; it does not launch a browser.

## Historical comparison renders

The existing prototype captures remain untouched. For fresh prototype endpoint
renders before archival, serve the repository root on 8080. Feed the mock opener
the **same vendored Inter CSS** the app uses through its existing exact-URL font
manifest seam. This avoids fallback glyphs without altering prototype bytes.

```sh
/opt/homebrew/bin/python3.14 -m http.server 8080 --bind 127.0.0.1
```

In the command terminal, with `evidence` still set:

```sh
/opt/homebrew/bin/python3.14 - "$evidence/fonts.json" <<'PY'
import json, pathlib, sys
url = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
pathlib.Path(sys.argv[1]).write_text(json.dumps({url: {'path': str(pathlib.Path('frontend-v2/fonts/inter.css').resolve()), 'type': 'text/css'}}))
PY
TARGET=mock MOCK_BASE_URL=http://127.0.0.1:8080 FONT_ASSETS="$evidence/fonts.json" VIEWPORT=1280x720 ONLY=S7b,S9,S14,S15,S18,S19,S21,S23,S31,S33,S37,S39,S45,S49,S51,S54,S56,S57,S58,S59,S60,S61,S64,S65,S66,S68,S69,S74,S75,S77 CAPTURE_DIR="$evidence/mock-1280x720" node frontend/harmonic-v2-desktop-behavior.replay.mjs
TARGET=mock MOCK_BASE_URL=http://127.0.0.1:8080 FONT_ASSETS="$evidence/fonts.json" VIEWPORT=1440x900 ONLY=S7b,S9,S14,S15,S18,S19,S21,S23,S31,S33,S37,S39,S45,S49,S51,S54,S56,S57,S58,S59,S60,S61,S64,S65,S66,S68,S69,S74,S75,S77 CAPTURE_DIR="$evidence/mock-1440x900" node frontend/harmonic-v2-desktop-behavior.replay.mjs
```

These use different clinical source populations from the generated app cases.
They permit inspection of unchanged material, geometry and the ADR 397 adaptation
ranges in fidelity.md. They are **not** same-byte clinical pairs. Use the separate shared-renderer clinical-pair commands above for that proof. Do not relabel a historical Overview as a proved Diagnose.

## Complete inherited browser inventory

Run these sequentially outside the seatbelt sandbox. No historical count is
hard-coded; retain each actual executed count. The full inherited Diagnose
registry runs on v1's `/` and `/diagnose`. It does not establish v2 composition.

```sh
node frontend/day-surface.browser.mjs
PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node --test frontend/diagnose-workstation.browser.test.mjs
PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node --test frontend/diagnose-canvas-composition.browser.test.mjs
node --test frontend/cockpit-shell.browser.test.mjs
node --test frontend/browser-runner.browser.test.mjs
node --test frontend-v2/desk.browser.test.mjs
node --test frontend-v2/follow-up.browser.test.mjs
node frontend/plan-first-match.browser.mjs
TARGET=app node frontend/diagnose-event-comparison-behavior.replay.mjs
TARGET=app node mockups/diagnose-event-comparison-support-audit.mjs
TARGET=app PAYLOAD=mockups/verify-660-story.synthetic/payload.json node frontend/verify-660-story-behavior.replay.mjs
```

For the remaining inherited Diagnose leg, start the declared empty-token server
on 8765 in a second terminal, then run the complete unfiltered registry:

```sh
qa_probe="$(mktemp -d "${TMPDIR:-/tmp}/harmonic-389-inherited.XXXXXX")"
cp mockups/qa-e2e.synthetic/harmonic.sqlite "$qa_probe/harmonic.sqlite"
uv run harmonic serve --no-fetch --token '' --db "$qa_probe/harmonic.sqlite" --port 8765
```

```sh
env -u ONLY BASE_URL=http://127.0.0.1:8765 TARGET=app PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node frontend/diagnose-workstation-behavior.replay.mjs
```

Stop only that server before returning to case-store or packaged-runtime runs.
The coordinator's already-reported evidence is c2 57/57 at each size, seven
app-only c2 stories at each size, Event 14/14, desk 13/13, inherited rail 160/160 before #342 (the current registry has 168 active entries),
c3 25/25 at each size and follow-up suite 52/52. These are attributed prior runs;
they do not replace the final whole-contract runs above.

## Public tree and packaged runtime

```sh
/opt/homebrew/bin/python3.14 mockups/sweep/harmonic-v2-desktop/acceptance.py public-tree --out "$evidence/public"
/opt/homebrew/bin/python3.14 mockups/sweep/harmonic-v2-desktop/acceptance.py package --out "$evidence/package"
```

The first command checks actual v2 sources/config and private-design exclusion,
then runs link and contamination checks. The public policy intentionally includes
several exact synthetic mockup fixture paths; a literally absent `mockups/` tree
is not the current public policy. Do not delete publishable fixtures to satisfy
that obsolete wording.

The second builds a local image, runs the exact Node-absence shell command, starts
one disposable authenticated synthetic container with `--no-fetch`, requests both
shells and every local HTML-referenced built asset, rejects external v2 asset references,
checks immutable asset/no-cache shell headers, requests eight forbidden routes,
and verifies absent/wrong/right token responses. It logs and removes only its
own container. The image remains local. CI supplies its already-built image via
`--image harmonic:pr-test`; no second image build is needed there. Surface-owned
authentication remains the separate S87 browser proof.

To reuse an image already built by CI, use this instead of the build-and-probe
command above. The wrapper executes the same Node-absence and runtime legs.

```sh
/opt/homebrew/bin/python3.14 mockups/sweep/harmonic-v2-desktop/acceptance.py package --image harmonic:pr-test --out "$evidence/package-existing-image"
```

## Presentation pass and atomic close

After behavior is green, the coordinator dispatches Fable 5.1 / medium against
the built surfaces and these captures. Allowed edits are only frontend-v2 CSS and
class/copy attributes, preserving replay selectors and served values. Behavioral
defects return to c1/c2/c2b/c3. Rerun both complete replays and affected captures
after any polish. No Fable worker or independent reviewer ran in this c4 session.

Only after complete green app replay, the five budgets, runtime proof, scenario
coverage and independently recorded fidelity are present may the coordinator run
the receipt's exact nine-file archive commands. Preserve every byte and locked
header, change INDEX to shipped with the archive path, and remove a v2
prototype-only CI leg if one exists. At this input there is **no** such leg;
existing event/rail/drift gates are independent and must stay. C4 makes the app
asset preflight independent of the prototype HTML so its archive cannot break
app acceptance. Historical TARGET=mock is a pre-archive evidence path.

Keep archive, INDEX and any prototype-CI removal in one commit. No v1 retirement,
root cutover, human release acceptance, PR or merge is performed by this worker.


## Coordinator amendment 4 — acceptance still open

On 2026-09-10 the coordinator reported the complete 1280×720 replay against
94761f41's built sources: 100 passed, 30 failed, zero deferred, 130 selected.
The 1440×900 leg did not execute: the preceding wrapper's authenticated server
still held port 8766. The wrapper now checks that port before launch and after
tearing down its entire owned process group, including a server outliving `uv`.
It refuses an occupied port and never kills a process discovered by port.
Any prior orphan must be stopped by its owning coordinator before rerunning;
the wrapper will not adopt it.

The replay corrections await rendered verification. Day and utility reads now
wait for their public loading state to finish; canvas counts wait for all
mounted evidence tiles; exact focus assertions remain bounded, with no fallback
target. Retirement checks use the carried rail's controls and real generated
cases. R3 and R17 carry dated, attributed premise amendments in the ledger;
all eighteen retirements and their original sanctions remain. S100's body is
unchanged after the reported browser-closed cascade. No app source or built
shell changed in this amendment.

Docker is absent on this Mac (coordinator report, 2026-09-10). The packaged
runtime proof therefore rests on CI's `build + smoke-test image` job, which
builds the image and runs the two-shell/assets/authentication/closed-route
probe. No local Docker pass or CI result is claimed. Budget acceptance also
remains the coordinator's isolated rerun after amendment 3's pytest fixes.

Rerun the two complete replay commands above serially, with fresh output
folders and no ONLY/STORY_CASES restriction. Reuse the current built shells.
The focused 30-story diagnostic selection is
`S28,S29,S60,S63,S64,S65,S66,S67,S68,S72,S72b,S74,S75,S75b,S76,S83,S100,R2,R3,R4,R5,R7,R8,R9,R10,R11,R12,R13,R15,R17`;
it cannot substitute for either complete 130-entry acceptance run.


## Coordinator amendment 5 — residual execution corrections

On 2026-09-10 the coordinator reported 128 passed / 2 failed (S29, S100)
at 1280×720 and 129 passed / 1 failed (S100) at 1440×900 on 82ab9e7f.
Isolated S100 passed at both sizes. The failure is after its assertions:
Event S8 closes the borrowed page and the wrapper then tried to capture it.
S100's body remains unchanged; its post-story capture selection is corrected.

S29 now observes the exact reading-pane and originating-row `focusin` outcomes
before pressing their launchers. It waits for the case response and rendered
roster, then checks the recorded focus outcome; a repaint cannot erase the event
before the assertion reads it. Both exact-target assertions remain, and a
missing or wrong focus event still fails within thirty seconds.

The clinical pair driver now sets the same manufactured browser token used by
other v1 offline replays before opening either shell. V1's `hasToken` gate
otherwise prevents Diagnose from mounting, leaving no clock control to press.
Both consumers use the shared owner's `#seg-window` 24 h button after `#level`
mounts. Basal exposes supporting nights; Correction factor and Carb ratio expose
numeric evidence. Every capture requires its exact focal clinical canvas and
an observed request to its expected endpoint; paired proof still requires a
shared response key with identical bytes. No clinical endpoint check was removed.

The coordinator also reported R18/S49/S91 3 of 3 and eye legs 7 of 7 at both
sizes with captures. Clinical pairing remains unaccepted: the previous driver
stopped after its v2 basal capture. Fresh full-ledger and pair runs are required;
no new browser pass, fidelity verdict or packaged-runtime result is claimed here.
No app source or built shell changed in this amendment.
