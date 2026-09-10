# C4 execution handoff

C4 authors these commands; the coordinator runs the browser, budget, packaging
and archive legs. Nothing in this file claims those legs have run. The builder
index is [fidelity.md](fidelity.md). Keep all command output and captures in
fresh scratch directories. Never point a command at a live wearer database.

## Current acceptance gaps

* The frozen ledger declares **130** entries; the executable registry has
  **129**. R18 has no function or registration. The `inventory` leg fails before
  Chromium. Return R18 to the historical-removal owner with its existing sanction;
  its input must actually contain a historical row. Do not delete the ledger row
  or merely lower the expected count.
* The built v1 `/` HTML still references Google Fonts. V2's HTML references only
  local packaged assets. The strict two-shell runtime probe rejects the v1
  reference. Return the packaging discrepancy to c1; c4 changes no shared frontend.
* The catalog supplies a basal Trial and Pattern Focus but does not yet provide
  all setting-family follow-up records required by fixture obligation 6. C3's
  receipt also explicitly disclaims rendered missing-outcome proof. Additional
  catalog recipes would require updating the closed `EXPECTED_CASE_NAMES` expectation
  in `tests/test_qa_e2e_cases.py`, outside c4's allowed paths. The coordinator must
  dispatch the missing manufactured-case coverage with that test path admitted.
* The materialized public-tree link check rejects `frontend-v2/c3.replay.test.js`
  importing the explicitly excluded `frontend/harmonic-v2-desktop-behavior.replay.mjs`.
  Return that publication boundary to the coordinator/c3 owner; do not remove the
  check or quietly widen c4 into `scripts/public_allowlist.txt`. The independent
  contamination scan also flags that test’s synthetic `May 15` string at line 65;
  the fixture/provenance correction belongs with the same c3 publication fix.
* Clinical same-byte pairs, intermediate-state captures, named HV2-06/HV2-08
  judgments and the Fable 5.1 / medium presentation pass are outstanding. Do not
  infer them from passing Node tests or from historical prototype screenshots.

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
| 6 Readiness | c3-trial (basal), c3-focus (Pattern); S45–S53/S91–S94 | I:C, Correction factor and whole-profile retained follow-up case coverage; past-14-day accumulation/unclear/unavailable matrix |
| 7 Focus | c3-focus/c3-pin/c3-preempted; S56–S59/S93/S95 | Rendered zero-opportunity, absent measurement and observed-zero distinctions |
| 8 History | c3-history/c3-preempted; S54/S54b/S96 | Complete saved/retained/legacy/sequential inspection |
| 9 Replacement | basal-lower and ic-lower; S97/S98 | Live pending/error/sliced and current I:C refresh checkpoints |
| 10 Event comparison | showcase, existing event-comparison synthetic capture; S21–S28/S100 and inherited Event replay | Final cohorts, support, traversal and speech at both sizes |
| 11 Day | showcase and c3 follow-up cases; S60–S67/S76, c2 contextual entries | Exact setting/event/Focus/question return and recorded week/month |
| 12 Utilities | showcase; S68–S81 | Unsaved input, invalid entry, failed save, precise focus and Pump settings checkpoints |

No c4 recipe or committed generated artifact was added. Extending the catalog
without its closed-name test update would knowingly fail the existing gate.

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
No new fixture was committed by c4, so there is no new generated fixture whose
`--check` perturbation can be claimed. Existing QA drift rejection is covered by
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

After the inventory gap is repaired, run both complete app replays serially.
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
content, a story body, a selector or a verdict. `CAPTURE_ONLY` limits **captures**,
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
ranges in fidelity.md. They are **not** same-byte clinical pairs. That requirement
remains outstanding. Do not relabel a historical Overview as a proved Diagnose.

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
app-only c2 stories at each size, Event 14/14, desk 13/13, inherited rail 160/160,
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
shells and every HTML-referenced built asset, rejects external asset references,
checks immutable asset/no-cache shell headers, requests eight forbidden routes,
and verifies absent/wrong/right token responses. It logs and removes only its
own container. The image remains local. CI supplies its already-built image via
`--image harmonic:pr-test`; no second image build is needed there. Surface-owned
authentication remains the separate S87 browser proof.

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
