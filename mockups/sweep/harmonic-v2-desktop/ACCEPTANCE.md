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
S61, S64, S65, S66, S68, S69, S74, S75, S77, S93, S99 and S100. Their
names remain their frozen story IDs; the transcript says exactly which
post-story state was captured. Live inspection must additionally pause inside
P19b pending/failure, I:C replacement/failure, save/finish/pin failures, selected
cursor/clock gestures and unsaved utility drafts before their retries/cleanup.

S100 is included in both full runs. To isolate its integrated shared repair,
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

```sh
VIEWPORT=1280x720 CAPTURE_DIR="$evidence/clinical-pairs-1280" node mockups/sweep/harmonic-v2-desktop/clinical-pairs.mjs
VIEWPORT=1440x900 CAPTURE_DIR="$evidence/clinical-pairs-1440" node mockups/sweep/harmonic-v2-desktop/clinical-pairs.mjs
```

These commands are prepared, not run. Same-byte transport is only one part of
clinical fidelity; the coordinator must inspect each Basal, Correction factor
and I:C pair and record whether the plotted data, axes and reading are faithful.

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
