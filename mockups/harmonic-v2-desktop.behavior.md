# Behavior ledger — harmonic-v2-desktop

```text
★ FROZEN 2026-09-24 · base b03431d2b937b46bdabbb2de1e6ba0ba6c6b57b1
  · generator b03431d2b937b46bdabbb2de1e6ba0ba6c6b57b1 · window n/a
  · fixtures mockups/qa-e2e.synthetic/harmonic.sqlite: e9b6f279dd3e
  · predecessor shipped single-shell desk (#422–#434 re-freeze) · retired 19
  · inventory 193 issued · 174 active · 19 retired
      (equal to acceptance.py inventory()'s pinned literal)
  · lifecycle revise · contract this ledger + frontend/desk-behavior.replay.mjs
```

This #442–#457 release re-freeze adds 22 stories and amends 6. Each is recorded
in its ticket's dated #<issue> amendment section below. The sanction is Connor
Griffin's (operator, repo owner) Q3 delegation of 2026-09-23, quoted with each
ticket's ruling: `Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R<issue>`.
It covers every shipped-surface revision and ledger amendment that these issues'
checklists and the coordinator's rulings call for, and nothing outside them. No
inherited story is weakened and none is retired; the ledger's retirements stay
at 19.

Added:
- S157 (#442), an older detected change superseded inside its watch window
  reading its saved ending;
- S162–S165 (#445), Day addresses that name a date, a change record or a carb
  entry, and the returns that land on them;
- S166–S168 (#446), Open Plan held for one visit, and a watched Trial's and a
  watched Focus's way to a saved draft;
- S169–S170 (#447), one served day count on the watch dock and in Changes, and
  a Guide article that names no Verify;
- S173–S176 (#449 and #450), a Focus's watched behavior by its served name, and
  served reasons printed in words;
- S177–S179 (#451), the correction factor in the wearer's words on Changes, on
  Diagnose and in "What was known";
- S180 (#452), an empty Later conclusion form on reopening after a failed save;
- S182 (#454), a claimed Occurrence's sentence printed once;
- S183–S185 (#455), the glucose overview's window caption, the Spotlight's
  verdict line and the canvas header kept whole at narrow sizes.

Amended: S46, S91, S92 and S93 (#449 and #450); S91 also by #442; S89 (#453);
S4 (#451's prose em-dash widening). S169, which #447 adds, also carries a #451
line: the Trial's values lead the dock's detail line. #443, #444, #448 and #457
change no story; #453 adds none. The fixed PR smoke slice is 25 stories, digest
9b92ee77d0e2e046753bdb5b80eb87d6451ce18ff1c35b7ca494d4de112b6523. S177 joined
it, as the only story on the `isf-strengthen` case store.

Safe start is unchanged from the #404 freeze below: AGENTS.md's QA
copy-then-serve command, with the showcase or a named `scripts/qa_e2e_cases.py`
case store.

Base preservation is main push CI run 35959034199 on b03431d2, which passed: the
complete ledger, 171 issued, at both sizes. The scheduled nightly on the same
commit (run 36011270820) failed S100 once at 1280x720. That is a product defect
this release fixes: a background repaint emptied the fullscreen chart's keyboard
readout and dropped its focus. S100 is unchanged; a desk-suite test and a
forcing harness prove the fix.

The new stories were proved with each ticket's harness laid over b03431d2, at
1280x720 and 1440x900. The coordinator ran every leg. Each story's status line
names its commits and how it failed:
- S162–S168 and S177–S180 fail there at their feature assertions at both sizes,
  and S169 and S170 at their content assertions at both sizes.
- S157, S173–S176 and S182 fail there at their feature assertions at both
  sizes.
- S183, S184 and S185 fail there at their feature assertions at both sizes on
  #455's final harness (575464e7): overlapping axis labels, a clipped verdict
  line and a zero-width header title.
- All 22 pass on their ticket branches at both sizes.
- On the release trunk at 25392ade, S157, S169, S170, S177–S180 and S182 pass at
  both sizes, in a 15-story run with S25, S46, S73, S139, S140, S149 and S150
  that passed 15 of 15. The complete ledger run below covers all 22 on the
  commit that is pushed.

Raw logs, captures and renders are retained in the release's evidence record.
The complete ledger, 193 issued, runs at both sizes once on the integration
commit before the push. Every story must pass on the commit that is pushed. No
failure is waived by this freeze.

The earlier freezes below remain historical provenance.

```text
★ FROZEN 2026-09-23 · base a4d374a72c8048d9d93ee4925805b91cf5674835
  · generator a4d374a72c8048d9d93ee4925805b91cf5674835 · window n/a
  · fixtures mockups/qa-e2e.synthetic/harmonic.sqlite: e9b6f279dd3e
  · predecessor shipped single-shell desk (#413 re-freeze) · retired 19
  · inventory 171 issued · 152 active · 19 retired
      (equal to acceptance.py inventory()'s pinned literal)
  · lifecycle revise · contract this ledger + frontend/desk-behavior.replay.mjs
```

This #422–#434 release re-freeze adds 24 stories and amends 10. Each is
recorded in its ticket's dated "#<issue> amendment — 2026-09-23" section below.
The sanction is Connor Griffin's (operator, repo owner), 2026-09-23: "Q1 A, Q2
A, defaults all fine, go". Q2 A approves every shipped-surface revision and
ledger amendment the release's checklists call for. No inherited story is
weakened and none is retired.

Added:
- S121–S122 (#423), the claimed low in Day's Episode Log and the Findings
  caption's Glossary control;
- S124–S126 (#424), a case file's cohort names and counts, and a Pattern fold's
  shares;
- S127 (#425), Day's served recorded-day count;
- S133 (#427), direct Day entry reopening the day last looked at;
- S136–S138 (#428), the Diagnose address after a Day return;
- S139–S140 (#429), the watch dock's "Open Changes ›";
- S142–S143 (#430), an open record's retained comparison and its unavailable
  figure;
- S145–S147 (#431), the server-confirmed Plan and the pending note in the watch
  panel;
- S148–S150 (#432), a meal Occurrence's own facts and served reason;
- S151–S153 (#433), the basal lane within reach on short windows;
- S154 (#434), the named excluded-night reasons.

Amended: S61 and S62 (#426), S49 and S112 (#430), S113 (#433), S42 and S105
(#431), S115 (#424), S25 and S107 (#432). #422 and #441 change no story. #441
fixes S24's intermittent 1280x720 failure in the app, and S24 is unchanged. The
fixed PR smoke slice is 24 stories, digest
03fb703acc99ed8092c1e3186fc5e0609141184715d4662ce7269409fd9af1bc.

Safe start is unchanged from the #404 freeze below: AGENTS.md's QA
copy-then-serve command, with the showcase or a named `scripts/qa_e2e_cases.py`
case store.

Base preservation is main push CI run 35826580306 on a4d374a7: the complete
ledger, 147 issued, at both sizes. The nightly on the same commit (run
35872827406) failed S24 once at 1280x720; that is the flake #441 fixes.

The new stories were proved with each ticket's harness laid over a4d374a7, at
1280x720 and 1440x900. The coordinator ran every leg, 2026-09-23. Each story's
status line names its commits and the message it failed with:
- 19 fail there at their feature assertions at both sizes: S122, S124–S127,
  S136–S140, S142, S143, S145 and S147–S152.
- S121 fails at its feature assertion at both sizes on e229bef3, the release
  trunk after #426, because its premise is #426's served title.
- S154 fails at its feature assertion at both sizes. Its first 1440x900 base
  run timed out loading under machine load; the low-load re-run at integration
  fails at the same panel-line assertion.
- S146 fails at its accepted premise: base serves no server-confirmed Plan. Its
  fail-first half is a node test in `frontend/plan-actions.test.js`.
- S133 and S153 pass on base by design. S133 records shipped behavior, and its
  held-day node test carries non-vacuity. S153 needs no application change.
- All 24 pass on their ticket branches at both sizes.

Raw logs, captures and renders land in
`docs/scope/release-422-434-evidence/<issue>/`. The complete ledger, 171
issued, runs at both sizes once on the integration commit before the push.
Every story must pass on the commit that is pushed. No failure is waived by
this freeze.

The earlier freezes below remain historical provenance.

```text
★ FROZEN 2026-09-22 · base eec4652a8f1109aa62d126ce3a0b4f24973194b0
  · generator eec4652a8f1109aa62d126ce3a0b4f24973194b0 · window n/a
  · fixtures mockups/qa-e2e.synthetic/harmonic.sqlite: e9b6f279dd3e
  · predecessor shipped single-shell desk (ADR 416) · retired 19
  · inventory 147 issued · 128 active · 19 retired
      (equal to acceptance.py inventory()'s pinned literal)
  · lifecycle revise · contract this ledger + frontend/desk-behavior.replay.mjs
```

This #413 re-freeze adds S113–S117, the fail-first obligations of the #413
design lock. They cover the lane key and verdict paint, the cold skeleton, the
rail fold and urgency, one mini instrument, and the 24 h arrival. It also
records Connor's three sanctioned changes to shipped behavior (see "#413
sanctioned changes" below). No inherited story is weakened and none is retired.

Safe start is unchanged from the #404 freeze below: AGENTS.md's QA
copy-then-serve command, with the showcase or a named `scripts/qa_e2e_cases.py`
case store.

Base preservation is main push CI run 35785233892 on eec4652a: the complete
ledger, 142 issued, at both sizes.

The new stories were proved on origin/main eec4652a with this harness laid over
it, at 1280x720 and 1440x900:
- All five (S113–S117) fail there at their feature assertions, run with the
  165b83fc harness (0 executed, 5 failed of 5 selected, at each size).
- All five pass on the branch at 165b83fc (5 executed, 0 failed, at each size).
- The coordinator ran both, 2026-09-22.

The raw logs and the requirement-by-requirement evidence are in
`docs/scope/413-desk-design-evidence/`. Every story must pass on the commit that
is pushed. No failure is waived by this freeze.

The earlier freezes below remain historical provenance.

```text
★ FROZEN 2026-09-10 · base cbcba39576c7d98c08be265a1255077c76b0f803
  · generator cbcba39576c7d98c08be265a1255077c76b0f803 · window n/a
  · fixtures mockups/qa-e2e.synthetic/harmonic.sqlite: 0856d0e09426
  · predecessor shipped v2 desk · retired 18
  · lifecycle revise · contract this ledger + frontend/harmonic-v2-desktop-behavior.replay.mjs
```

This #404 amendment freezes the inherited preservation obligations and the
operator-requested fail-first repairs. Connor instructed “keep logging these
things in the ticket ... then proceed with triaging” and, after the remaining
workflow choices were disclosed, “codex, do it.” Product rulings are retained in
docs/scope/404-v2-findings-ledger.md and the #404 change. No inherited behavior
is retired. This is a revision contract, not a claim that the defective base
passes the requested repairs, and creates no replacement visual mock or lock.

Safe-start authority is AGENTS.md's explicit QA copy-then-serve command using
`uv run harmonic serve --no-fetch --token '' --db <owned synthetic copy> --port 8765`.
The named source is the committed synthetic showcase above, or a named store
emitted by scripts/gen_qa_e2e_db.py from scripts/qa_e2e_cases.py and copied before
serving. Exact retained generated base stores and raw runs are under
/private/tmp/harmonic-404-triage-01a08ec1/cases/; retained new-report captures and
probe case bytes are under /private/tmp/harmonic-404-new-report-evidence/.
The fixture hashes are tripwires; these retained paths carry the executed bytes.
The sole token-bearing exception is the user-approved separate synthetic S87
server recorded in the scope ledger; its raw two-size passing logs are retained.

Base preservation: both full runs reported 129 passes and six failures;
S87 subsequently passed in isolation at both sizes. S101–S105 remain defect
obligations, with S103's wider setup failure explicitly retained. Corrected
S106/S107 both reached their feature assertions at both sizes: missing focal
trace/markers, mismatched rails, reversed All charts/Close, and five overlapping
meal rows. The runner reports `executed 0 · failed 2 · deferred 0 · selected 2`
for this all-failing slice and exits 1; it is expected fail-first evidence,
not a passing execution. Complete logs:
/private/tmp/harmonic-404-new-stories-corrected-1280x720.log and
/private/tmp/harmonic-404-new-stories-corrected-1440x900.log.
The unchanged focal top anchoring passed its measured check. Every applicable
story must pass after implementation; no failure is waived by this freeze.

The earlier greenfield freeze and dated amendments below remain historical
provenance. For #404 the shipped revise contract above governs.

**★ FROZEN 2026-09-08 · this ledger is the contract.** Under
`behavior-sweep` §7 the stories below, replayed against the surface, are what the
v2 desktop must keep doing. A revision that drops one amends this ledger through
the sanctioned path; it does not edit a story quietly.

**Amendment — 2026-09-08, issue #389.** Connor Griffin instructed: “We dont'
need historical reads in the app.” Historical past-setting tuning reads are
removed entirely; the earlier proposed Watching-only parity correction is
superseded. HV2-31 is re-settled in the lock manifest and mock header. S98 retains
its current-setting coherent replacement/failure/retry/stale obligations and uses
`ic-lower`; Trial/Focus records and endings remain. R18 adds the permanent absence
check. The original 129-story results below remain provenance of the earlier
contract, not a claim that this new obligation has passed.

**Amendment — 2026-09-10, ADR 397 / execution lock v2 389 2.**
Connor Griffin · 2026-09-08: “v2 ships three destinations: Diagnose, Changes
and Day. Overview and Explore collapse into Diagnose carrying the shipped v1
rail as-is”. Changes guidance placement follows the coordinator's explicit
#397 instruction. The dated original obligations and their recorded runs remain
historical evidence; they do not prove the amended obligations below. No ID or
functional job is retired. C2 ports; the independent verifier records verdicts.

The app defaults to Diagnose with exactly Diagnose, Changes and Day. Legacy
`overview` and `explore` addresses take the unknown-destination fallback;
there are no destination aliases, registrations or buttons for either old name.
S1/S3 and R15 prove these absences and the retained successors. S1/S2/S11/S12
prove chrome and within-Diagnose evidence geometry at both desktop sizes.
S14–S18, S37 and S38 belong to Changes; S19/S20/S20b, S21–S35 and S37b
belong to Diagnose. S36 retains Changes → the Trial's original Diagnose evidence;
c3 owns its complete proof. S54b ends in Changes and offers Back to Diagnose.
S56/S56b start canonical Pattern Focus and land in Changes; S57–S59 retain
separate served behavior/outcome tables and endings. Pattern comparison arms
render c2b's served opportunity count, gate, unit, verdict and reason, without
an elapsed-day floor or client criterion. C3 owns those story bodies.

All evidence-origin Day and utility returns say Diagnose and retain the precise
subject and focus; Changes-origin returns stay Changes. S61/S69/S81 and the
handler, opener, cleanup and QUESTION inventory carry those substitutions.
S13 still has four sources. R15 retains its ADR 215 sanction; its amended
premise is: Diagnose preserves Findings, Spotlight and All Charts under ADR 397;
the retired mode/layout/duplicate-tile mechanics remain absent. R18 and all
predecessor retirements remain. Historical captures prove unchanged material
and geometry only. S100 and coupled Event S8 speech repair/proof belong to c2.

The lock manifest (`mockups/harmonic-v2-desktop.lock.md`, 34 terms) says what the
surface looks like. This says what it **does**. Together they are the build
contract; neither alone is sufficient.

**Amendment — 2026-09-10, issue #404 review-ready revise preflight.** The
shipped surface was re-inventoried at base
`cbcba39576c7d98c08be265a1255077c76b0f803`, using only the declared synthetic
case stores and the existing app-only replay. The original retained fixture
paths and SHA-256 tripwires below remain unchanged. The base replay reported 129
pass and 6 fail at each locked desktop viewport; it is a mixed receipt, not a
new green freeze. S87's separately authorized protected synthetic-server receipt
passed at both locked sizes. S103's 1440px drawn-window
setup failure remains a failure. No retirement, permanent absence, or prior
story status is changed or waived.

The new synthetic probe observed a Pattern selected occurrence whose served
detail has glucose and markers while its focal event tile has neither a
`selected:trace` nor a marker-bearing series; a regular low comparison retains
`selected:trace`. It also measured rail disparity and long-row text overlap at
the locked sizes. The focal action was already top anchored, so no focal
placement change is contracted. These are pending acceptance changes, not
revised behavior: before source admission, add a C4 story plus focused chart
option assertion for Pattern selected trace/markers, and add geometry assertions
for the observed rail/row cases. Existing S101–S105 remain their named
fail-first stories and C4 functions.

**18 stories are app-opener-only and have never passed.** `S53` (HV2-25),
`S73b` and `S80b` (HV2-32) plus `S86`–`S100` name behavior the lock contracts and
this prototype cannot exercise — durable persistence, packaged delivery, and
three focus/failure paths whose mechanism is recorded on each entry. They are
obligations on the build, proved by the port's app-opener leg. The app opener was
exercised against the absent `/v2/` and exits nonzero having run zero stories
(`sweep/harmonic-v2-desktop/runs/app-target-absent.*`), so an unbuilt surface can
never satisfy them silently.

Two handler groups are inventoried but **not presented** at the locked desktop
viewports: the narrow sheet chrome (`S10b`) and the Focus seat segment (`S59`).
Their absence is the desktop fact this lock accepts; desktop acceptance is not
widened to a mobile design.

```
★ FROZEN 2026-09-08 · base 5950bd378e15dfa968125d23e1924bec30b54860
  · surface harmonic-v2-desktop · route: lock → build (greenfield /v2/)
  · lock mockups/harmonic-v2-desktop.lock.md (34 terms, HV2-01..HV2-34)
  · UI source pin d8217ef4e362ebba1fff2fe5532ad3cdeaf8cd63
  · replay frontend/harmonic-v2-desktop-behavior.replay.mjs
      sha256 d3ba01e328c32418a2f2e477320ddd95357e2a5fc7a7ec70b41323b1d7819116
      — the SHA of the file that PRODUCED every retained run under
        mockups/sweep/harmonic-v2-desktop/runs/. After those runs, this file
        received one metadata-only edit: its stale header comment and its CLI
        banner now say frozen instead of candidate. No story, selector,
        assertion, opener or registry entry changed, so the observed statuses
        below still describe the behavior these runs exercised.
  · generator mockups/harmonic-v2.exploration/generate.py
      @ 76bcc62ba17fee22af892c7ae8e5b48699888b42
  · window n/a — the retained synthetic set is a fixed capture, not a data range
  · viewports 1280x720 and 1440x900 · fonts real (Inter, exact cached URLs)
  · observed 111 passed · 0 failed · 18 app-opener-only deferred
      · 129 selected · at BOTH viewports, one Chromium launch each
  · negative proof 111 proved · 0 not proved · 111 selected
      · 18 owed by the build · exit 0
  · evidence mockups/sweep/harmonic-v2-desktop/
      runs/sweep-1280x720.* · runs/sweep-1440x900.* · runs/negative-proof.*
      runs/app-target-absent.* · captures/ (25 ids x 2 viewports)
  · retained fixture bytes (tripwire, not contract)
      mockups/harmonic-v2.exploration/journey.json
        sha256 b256323378d0c4a92165a061fb58165e0f5caaf10d7d59660e49bde44ac3ec32 · 7470297 bytes
      mockups/harmonic-v2.exploration/setting.json
        sha256 bb95f04a29674ed0fe4c4fb54b94078823844b68e827db31b4eaa380e451395e · 114129 bytes
      mockups/harmonic-v2.exploration/focus.json
        sha256 a97bc65aed6e7901d128f7eea0f490425668d033ce545b73cb50df3eeed3b43b · 2298745 bytes
      mockups/harmonic-v2.exploration/workstation.json
        sha256 ba7e17b6931fcb61c9f1d601d79a5410a0ed952638348a42270e26dc1d0ff5ba · 1168740 bytes
      mockups/harmonic-v2.exploration/utilities.json
        sha256 d3bc58b383fc11723ec1bda5d491cbbbc11e1cbd28bc43920d644c84c6960319 · 19265 bytes
      mockups/harmonic-v2.exploration/evidence.json
        sha256 7186afb6bfd94f56fcaad4043ee89389da1c599617ece8e10ec9bb985e6b4831 · 37639 bytes
      mockups/verify-660-story.synthetic/payload.json
        sha256 f5ce4063a6de202404f597d9537d8d6921fb82ddf0733d25174a3213eb677a15 · 62864 bytes
  · predecessor: shipped v1 Cockpit shell + Finding -> evidence routing
      (both stay served; neither retired by this lock)
  · retired 17, every sanction sourced outside this ledger
```

## What this ledger is, and what it is not

The lock manifest says what the surface looks like. It does not say what it
*does*. This ledger is the executable half, and
`frontend/harmonic-v2-desktop-behavior.replay.mjs` is its script.

Two things are already settled elsewhere and are **not reopened here**:

* **The predecessor inventory (§2) is complete in the lock**, in its
  *Predecessor preservation* section — the cockpit ledger, the finding/evidence
  ledger, the Diagnose registry (`S01–S116`, `S118–S144`, `C41–C62`, `D1–D3`)
  and the other executable lists each carry a disposition, and no row is
  `missed`. This ledger transfers that result; it does not re-derive it.
* **Every retirement's sanction originates outside this surface.** All 17 are
  reproduced verbatim below from the lock's *Sanctions* block and, for the one
  the lock cites rather than restates, from
  `mockups/finding-evidence-routing.behavior.md`. No sanction is authored here,
  none is re-asked, and none is added.

## Openers and the source of evidence

Two openers, per `behavior-sweep` §4's fallback route. The story functions are
shared between them.

* **Mock opener** — the ★ LOCKED prototype at
  `mockups/harmonic-v2-glucose.html`, served over HTTP from the **repository
  root** (the mock links `../frontend/theme.css`,
  `../frontend/diagnose-workstation.css` and
  `../frontend/diagnose-event-comparison.css` by relative path, so a server
  rooted at `mockups/` cannot resolve them).
* **App opener** — the built, Python-served `/v2/`. **It does not exist yet.**
  The opener therefore fails loudly, naming the missing surface and the lock
  term that owes it. It never skips, and a story routed to it never passes.

### Exact external-request policy

The opener routes only **exact URLs** and refuses everything else loudly. There
is no catch-all and no blanket `200 {}`. ECharts is always served from
`node_modules/echarts/dist/echarts.min.js` — the same 5.5.0 the app ships — in
place of `https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js`.

Fonts have **two modes**, and the run header prints which one ran.

**`fonts=real`** — `FONT_ASSETS` names a manifest of `{url: {path, type}}`. Each
listed URL is fulfilled from its cached file by exact match. Root's first-hour
probe produced exactly this shape by fetching the locked HTML's own Inter CSS
URL and its seven `woff2` files once
(`.agentflow/inputs/font-assets.json`, recorded with SHA-256 per file), and
loaded real Inter across all four sources with zero errors. This is the mode to
use whenever the manifest is available.

**`fonts=behaviour`** — no manifest. The Inter stylesheet is served **empty**, so
it declares no `@font-face`, `fonts.gstatic.com` is never requested, and the run
still needs no wildcard.

What the fallback costs, stated plainly: the Inter *binary* is absent, so glyph
rasterisation is the platform fallback. Every type term this ledger asserts —
`font-family` string, `font-size`, `font-weight`, `line-height`,
`letter-spacing`, `font-variant-numeric` (HV2-08) — is a **computed CSS** value
and is unaffected by which binary rendered it. Layout terms (HV2-03, HV2-04,
HV2-05) assert grid tracks and pane widths, equally font-independent at the
grain asserted.

**Neither mode is fidelity evidence.** Pixel-level paired renders at both
viewports belong to the build, and production font and asset packaging belongs to
the build brief — not to this opener, and not to any committed font vendoring
implied by the cache. A reader must not read a green replay as fidelity evidence.

Any other external request fails the run with its URL printed.

### What the opener admits, and what it asserts on arrival

Three rules the opener enforces, so no story can rest on a setup that only
looked right.

**`?state=` belongs to the meals source.** The Scenario and Input selects carry
`.gf-meals-control`, which `harmonic-v2-glucose.css:179,:186,:264` hides for
setting, focus and journey — those sources own their frame through their own
clock. The opener therefore **refuses** any non-meals source with a non-default
state, and stories establish source-owned checkpoints with the named clock
control instead. Without that rule a requested scenario can agree in the toolbar
while the desk shows an entirely different frame.

**Arrival is asserted from the served markup**, not the toolbar: the desk is off
its loading frame, at least one pane rendered, exactly one destination carries
`aria-current="page"`, and that destination is the one the source arrives on —
Overview, except the meals `history` scenario, which opens Changes
(`harmonic-v2-glucose.js:144`; the journey source's `arrive()` re-seats Overview).

**Every control is pressed as a reader sees it.** `visible()` takes the first
*visible* match and fails loudly when every match is hidden — the utility
launchers exist twice, and the in-surface `.gf-utility-strip` is `display:none`
above 700px (`harmonic-v2-glucose.css:471`), so the footer's is the desktop
affordance. Text assertions are case-insensitive: the stylesheet uppercases
heads and table columns, and `innerText` returns what is painted.

### Prototype harness controls — excluded by purpose, named

`behavior-sweep` §1 excludes mock-harness chrome by name. Excluded here, all of
it inside `.mockbar` (`mockups/_shell.js:20-27` and the selects
`harmonic-v2-glucose.js:85-99` injects):

`select[aria-label="Prototype scenario"]` · `select[aria-label="Evidence source"]` ·
`select[aria-label="Evidence input"]` · `[aria-label="Manufactured clock"]` ·
`[aria-label="Pump capture"]` · `[aria-label="Next save fails"]` ·
`[aria-label="Focus clock"]` · `[aria-label="Next Focus save fails"]` ·
`[aria-label="Journey clock"]` · `[aria-label="Next journey save fails"]` ·
`[aria-label="Next read fails"]` · `[aria-label="Next utility save fails"]` ·
`details.gf-review-notes`

**The exclusion is of the control, never of the state it reaches.** These
selects are the only route to the mock's failure, clock and capture states, so
the replay drives them **to install a fixture state**, then navigates with the
reader's own controls and asserts the visible checkpoint. The resulting state is
product behavior and is inventoried. In the built app the same states arrive
from a real failed request or real elapsed time, which is why several of them
also appear below as app-opener-only stories.

Every failure story installs its failure on the named control, asserts the
failure, and asserts the retry succeeds: `S20b` (read), `S40` and `S41` (draft
and decision), `S56b` (Focus pin) and `S71` (utility save). None of them lets a
successful branch stand in for the failure it exists to prove.

One failure has **no** control: a durable Trial finish cannot be made to fail on
this prototype, so `S53` is app-opener-only. Its mechanism is recorded on that
entry.

Product chrome stays covered: the topbar identity, the four destination
buttons, scope, `＋Log carbs`, the advisory line and the footer utilities are
rendered by `renderShell` (`mockups/_shell.js:13-18`) and are stories like any
other, not harness.

### Shared renderers — cite, do not duplicate

The mock imports seven shipped modules and draws through them
(`harmonic-v2-glucose.js:56-62`, `harmonic-v2-glucose-setting.js:11-14`):
`diagnose-event-comparison.js`, `diagnose-evidence-charts.js`,
`diagnose-workstation-chart.js`, `diagnose-findings-queue.js`,
`scenario-chart.js`, `day-hero-chart.js`, `verify-workstation-chart.js`, plus
`plan.js`.

Their own contracts are already exercised by frozen v1 stories, and this ledger
**cites those rather than restating them**: the comparison cohort, support,
keyboard-cursor and containment contracts are
`mockups/finding-evidence-routing.behavior.md` → Event `S1–S14` and
`C41–C62`, replayed by `frontend/diagnose-event-comparison-behavior.replay.mjs`;
the Verify hero's hover, readout and restoration are Verify `S5–S6`, replayed by
`frontend/verify-660-story-behavior.replay.mjs`; the Plan deliverable and
reconciliation contracts are Plan `S1–S4`, replayed by
`frontend/plan-first-match.browser.mjs`. What this ledger owns is the **v2
composition** of those renderers — that they are mounted, bound to the served
case file, and torn down — not a second universe of tests for their internals.

---

## Stories

Format per `behavior-sweep` §5. `status` is left unset on every entry: the
revision/build phase fills it, and nothing may fill it before the script has run.

### Shell, persistent chrome and destinations

```
S1 · Overview is the default destination on a cold load; the four destination
     buttons render in order and Overview alone carries aria-current="page".
  element:  nav.v2-nav button[data-destination] (overview|explore|changes|day)
  source:   mockups/_shell.js:15; harmonic-v2-glucose.js:144,280-282
  lock:     HV2-09, HV2-10
  data:     any source
  evidence: replay fn S1
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S1 · 2026-09-10 · ADR 397 / lock v2 389 2: Apply the retained job to Diagnose / Changes / Day with Diagnose default. Evidence and its returns belong to Diagnose; Changes-origin returns remain Changes. No Overview/Explore destination survives. Shipped Findings, Spotlight, All Charts and case selectors are carried as-is.
The preceding wording and results are the attributed pre-amendment record.


```
S2 · Pressing a destination button moves the desk to it and moves
     aria-current with it; the topbar and footer keep their own geometry across
     every destination change.
  element:  [data-destination]; header.cockpit-topbar; footer.cockpit-footer
  source:   harmonic-v2-glucose.js:249-253 (navigate), :280-282
  lock:     HV2-09, HV2-06
  data:     any source
  evidence: replay fn S2
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S3 · Pressing the destination already in hand is the way back up: on the shared
     journey, Explore pressed while on Explore returns to the findings index
     rather than sitting on the drilled subject.
  element:  [data-destination="explore"]
  source:   harmonic-v2-glucose.js:251 → journey.toIndex()
  lock:     HV2-09, HV2-11
  data:     source=journey
  evidence: replay fn S3
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S3 · 2026-09-10 · ADR 397 / lock v2 389 2: Apply the retained job to Diagnose / Changes / Day with Diagnose default. Evidence and its returns belong to Diagnose; Changes-origin returns remain Changes. No Overview/Explore destination survives. Shipped Findings, Spotlight, All Charts and case selectors are carried as-is.
The preceding wording and results are the attributed pre-amendment record.


```
S4 · Persistent chrome renders its locked strings and does not move across
     destinations: identity "Harmonic" with the "advisory" mark, Scope · 30 d,
     ＋Log carbs (U+FF0B), the advisory line, and the Utilities nav.
  element:  .cockpit-identity, .cockpit-scope, .cockpit-log-carbs,
            .cockpit-advisory, nav.cockpit-utilities
  source:   mockups/_shell.js:16
  lock:     HV2-09; lock "Verbatim strings"
  data:     any source
  evidence: replay fn S4
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S4 · 2026-09-10 · coordinator amendment 13: Connor Griffin instructed, "kill that scope thing unless we're going to include some kind of modal or something to go with it, it serves nothing." Remove Scope · 30 d from the persistent-chrome strings and elements; identity, destinations, Log carbs, advisory and utilities retain their existing assertions. This also amends the product-chrome overview above. S4 remains active; no story was solely about the chip.
The preceding wording and results are the attributed pre-amendment record.

```
S5 · Shell rows are 38px / minmax(0,1fr) / 24px below 860px viewport height,
     including 1280×720, and 42px / minmax(0,1fr) / 26px at 1440×900.
  element:  .cockpit-shell computed grid-template-rows
  source:   frontend/shell.css:26 and its @media (max-height:860px) rule at :327
  lock:     HV2-04
  data:     any source; both target viewports
  evidence: replay fn S5
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S6 · At both target viewports the document has no root scroll and no horizontal
     overflow; populated stage and reading content scroll only inside their own
     panes.
  element:  document.scrollingElement; .gf-stage; .gf-pane-body
  source:   frontend/shell.css; harmonic-v2-glucose.js:321-323 (desk)
  lock:     HV2-03
  data:     a populated source at both viewports
  evidence: replay fn S6
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S7 · A paired state is one flexible evidence stage beside a 300px reading pane
     with the shipped one-pixel hairline between them.
  element:  .gf-desk > .gf-stage, .gf-desk > .gf-reading
  source:   harmonic-v2-glucose.js:321-323 (desk)
  lock:     HV2-05, HV2-06
  data:     a paired state
  evidence: replay fn S7
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```
Amended S7 · 2026-09-10 · ADR 397 / coordinator amendment 12: Diagnose .inspector is the carried v1 Findings rail at its shipped 430px, with a wider evidence stage; the 300px reading pane belongs to the paired desk states (Changes, Day), measured on .gf-desk > .gf-reading. The app replay uses a Changes case with a Trial underway to prove that paired width.
The preceding wording and results are the attributed pre-amendment record.

Amended S7 · 2026-09-11 · #404 browser correction: the paired desk reading rail is the same shipped 430px column as Diagnose. Changes and Day preserve that width beside their flexible stages.


```
S7b · The selected full-width empty Changes state is preserved as observed: with
      no change underway it manufactures no reading pane. This is intent, not a
      missing pane, and HV2-05 says so in as many words.
  element:  .gf-stage-table .gf-empty; absence of .gf-desk > .gf-reading
  source:   harmonic-v2-glucose.js:295, :644-646 (emptyFrame)
  lock:     HV2-05, HV2-06
  data:     source=meals with no change underway
  evidence: replay fn S7b
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S8 · Material resolves from the shipped dark role ladder on the elements that
     consume it, and no theme control or theme storage exists anywhere on the
     surface.
  element:  computed background/color on .cockpit-topbar, .gf-stage, .gf-reading;
            absence of any theme control
  source:   frontend/index.html:69-71 role ladder, pinned by frontend/index.test.js:14-18
  lock:     HV2-07
  data:     any source
  evidence: replay fn S8
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S9 · Inter is the single UI family; a stage title computes to 1.14rem / 700 /
     1.3 / -.01em; no heading exceeds the 1.5rem ceiling; clinical numbers carry
     tabular figures.
  element:  .gf-title, .gf-figure, h2, h3
  source:   mockups/harmonic-v2-glucose.css
  lock:     HV2-08
  data:     any populated source
  evidence: replay fn S9
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S10 · Crossing the 700px media query closes the open sheet and re-renders,
      rather than leaving a sheet stranded over a desktop desk.
  element:  matchMedia('(max-width:700px)')
  source:   harmonic-v2-glucose.js:127-128, :254
  lock:     HV2-05
  data:     any source
  evidence: replay fn S10
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S10b · At the locked desktop viewports the narrow sheet's own chrome is not
       presented — no sheet toggle, no sheet Close, no narrow seat or view
       segment — because the desk shows both panes at once instead.
  element:  .gf-sheet-toggle, .gf-sheet-close, .gf-narrow-seat [data-seat],
            .gf-narrow-seat [data-mode]
  source:   harmonic-v2-glucose.js:340-342, :731, :734 (registered);
            harmonic-v2-glucose.css:48, :358 (presented only below 700px)
  lock:     HV2-05, HV2-03
  data:     any populated source, at both target viewports
  note:     these handlers are inventoried and their narrow behavior is
            inherited chrome this DESKTOP lock does not accept. Absence is the
            desktop fact, as in S59; desktop acceptance is not widened to a
            mobile design, and mobile acceptance stays a later gate.
  evidence: replay fn S10b
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

### Invariants — no handler owns these

`behavior-sweep` §1: the inventory finds what the surface *does*; it cannot find
what the surface must *keep true* while doing it. These own no listener and are
recorded with none named.

```
S11 · Across destinations, chrome the reader keeps seeing does not move.
      Overview is the designated reference view; Explore, Changes and Day are
      each measured against it, never against an average of the four.
  element:  header.cockpit-topbar, footer.cockpit-footer bounding boxes
  source:   invariant — no handler
  lock:     HV2-09, HV2-06
  data:     any source, all four destinations
  evidence: replay fn S11
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S11 · 2026-09-10 · ADR 397 / lock v2 389 2: Apply the retained job to Diagnose / Changes / Day with Diagnose default. Evidence and its returns belong to Diagnose; Changes-origin returns remain Changes. No Overview/Explore destination survives. Shipped Findings, Spotlight, All Charts and case selectors are carried as-is.
The preceding wording and results are the attributed pre-amendment record.


```
S12 · Across interaction, nothing reflows that the interaction did not name.
      The comparison's canvas head reserves its space at rest, so filling the
      hover readout does not move the content under the pointer.
  element:  #gf-fig1-head (data-hover 0 → 1)
  source:   harmonic-v2-glucose.js:369,371; renderEventSurface headline host
  lock:     HV2-06, HV2-34
  data:     source=meals, Explore — its Explore IS the investigation frame, so
            the comparison is present without drilling a roster. The journey
            source's Explore opens the basal branch instead, and carries no
            comparison canvas head.
  evidence: replay fn S12
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S12 · 2026-09-10 · ADR 397 / lock v2 389 2: Apply the retained job to Diagnose / Changes / Day with Diagnose default. Evidence and its returns belong to Diagnose; Changes-origin returns remain Changes. No Overview/Explore destination survives. Shipped Findings, Spotlight, All Charts and case selectors are carried as-is.
The preceding wording and results are the attributed pre-amendment record.


```
S13 · Across data shape, containers sized for live values do not resize per
      value. The reading pane holds its 300px across the four captured sources,
      whose counts, cohort names and timestamps all differ.
  element:  .gf-reading width across source=journey|setting|focus|meals
  source:   invariant — no handler
  lock:     HV2-05, HV2-06
  data:     all four sources
  evidence: replay fn S13
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```
Amended S13 · 2026-09-10 · ADR 397 / coordinator amendment 12: Diagnose .inspector keeps the carried v1 rail’s shipped 430px across all four sources. The 300px reading pane belongs to paired desk states (Changes, Day), not the carried Diagnose column; the existing 256px paired-desk adaptation remains unchanged.
The preceding wording and results are the attributed pre-amendment record.


### Overview, guidance, set aside

```
S14 · Overview owns the decision: the lead concern's action and one named route
      into its evidence. It does not duplicate Explore's full findings roster.
  element:  .gf-reading header h2 "Action"; [data-action="explore"]
  source:   harmonic-v2-glucose.js:332 (briefing), :413-416, :335 (inspectRoute)
  lock:     HV2-10
  data:     a source serving a lead action
  evidence: replay fn S14
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S14 · 2026-09-10 · ADR 397 / lock v2 389 2: The retained job runs in Changes, with evidence opening Diagnose on the same subject. Changes owns the backend-selected decision and next action without duplicating the Findings roster.
The preceding wording and results are the attributed pre-amendment record.


```
S15 · Set aside opens its own form in the reading pane, focuses the reason
      field, accepts an optional reason, and on submit lands on the
      acknowledgment carrying that reason with a visible Restore.
  element:  [data-action="aside"], form[data-form="aside"], #aside-reason,
            [data-action="restore"]
  source:   harmonic-v2-glucose.js:441-443, :743, :755, :760-763
  lock:     HV2-16
  data:     a source with a set-aside-able subject
  evidence: replay fn S15
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S15 · 2026-09-10 · ADR 397 / lock v2 389 2: The retained job runs in Changes, with evidence opening Diagnose on the same subject. Changes owns the backend-selected decision and next action without duplicating the Findings roster.
The preceding wording and results are the attributed pre-amendment record.


```
S16 · Restore returns the eligible subject and clears the set-aside state.
  element:  [data-action="restore"]; [data-restore] on the shared journey
  source:   harmonic-v2-glucose.js:745, :710-711; journey.js:336
  lock:     HV2-16
  data:     a set-aside subject
  evidence: replay fn S16
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S16 · 2026-09-10 · ADR 397 / lock v2 389 2: The retained job runs in Changes, with evidence opening Diagnose on the same subject. Changes owns the backend-selected decision and next action without duplicating the Findings roster.
The preceding wording and results are the attributed pre-amendment record.


```
S17 · Cancelling the set-aside form closes it without recording anything and
      returns focus to the control that opened it.
  element:  [data-action="cancel-aside"]
  source:   harmonic-v2-glucose.js:744
  lock:     HV2-16
  data:     any source
  evidence: replay fn S17
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S17 · 2026-09-10 · ADR 397 / lock v2 389 2: The retained job runs in Changes, with evidence opening Diagnose on the same subject. Changes owns the backend-selected decision and next action without duplicating the Findings roster.
The preceding wording and results are the attributed pre-amendment record.


```
S18 · The quiet disposition says no priority needs action and keeps Day
      reachable; it is a distinct claim from thin, failed or held.
  element:  .gf-empty "No priority needs action"; [data-action="day"]
  source:   harmonic-v2-glucose.js:297
  lock:     HV2-31
  data:     state=quiet
  evidence: replay fn S18
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S18 · 2026-09-10 · ADR 397 / lock v2 389 2: The retained job runs in Changes, with evidence opening Diagnose on the same subject. Changes owns the backend-selected decision and next action without duplicating the Findings roster.
The preceding wording and results are the attributed pre-amendment record.


```
S19 · A failed evidence read renders the error frame with Retry and cannot
      render as quiet: the two states make different claims.
  element:  .gf-empty "Evidence unavailable"; [data-action="retry"]
  source:   harmonic-v2-glucose.js:269, :647-649
  lock:     HV2-29, HV2-31
  data:     state=error
  evidence: replay fn S19
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S19 · 2026-09-10 · ADR 397 / lock v2 389 2: The retained failed-evidence and successful-retry job belongs to Diagnose, including with an active change; Current read failed offers Open Diagnose and no stale roster is presented as new.
The preceding wording and results are the attributed pre-amendment record.


```
S20 · Retry re-runs the load and, on success, returns the desk to its
      investigate scenario rather than leaving the error frame standing.
  element:  [data-action="retry"]
  source:   harmonic-v2-glucose.js:737 → load(true) → :267 syncScenario
  lock:     HV2-29
  data:     state=error then a good read
  evidence: replay fn S20
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S20 · 2026-09-10 · ADR 397 / lock v2 389 2: The retained failed-evidence and successful-retry job belongs to Diagnose, including with an active change; Current read failed offers Open Diagnose and no stale roster is presented as new.
The preceding wording and results are the attributed pre-amendment record.


### Explore — comparison, cohorts, occurrences

```
S20b · The shared journey's own failed read is its own control and its own
       state: retry-read re-requests the read, keeps focus on the Retry while it
       is still failing, and never renders the stale roster as a new result.
  element:  [data-journey="retry-read"]
  source:   harmonic-v2-glucose-journey.js:205, :292 (render it once a read has
            failed), :89-93 (refresh consumes the installed failure), :338
  lock:     HV2-29, HV2-31
  data:     source=journey with "Next read fails" checked, then the Journey clock
            moved (setClock calls refresh at :65), then **Explore**. overviewFrame
            checks settingB.active() and focusB.active() BEFORE memory.error
            (:176-179), so an engaged branch hides the failed frame; the note
            and its Retry live in the roster (:292), which Explore seats. Both
            halves asserted.
  evidence: replay fn S20b
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S20b · 2026-09-10 · ADR 397 / lock v2 389 2: The retained failed-evidence and successful-retry job belongs to Diagnose, including with an active change; Current read failed offers Open Diagnose and no stale roster is presented as new.
The preceding wording and results are the attributed pre-amendment record.


```
S21 · The reading pane lists every served cohort with its own support line, and
      the row's mark is the comparison key's own item so cohort and legend share
      one shape.
  element:  .gf-cohort-row[data-cohort][data-support]; .ec-key-item
  source:   harmonic-v2-glucose.js:417-427
  lock:     HV2-18
  data:     a case file with matched, nearly-matched and withheld cohorts
  evidence: replay fn S21
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S21 · 2026-09-10 · ADR 397 / coordinator amendment 1: Diagnose lists the shared owner’s served comparison cohorts, support text and legend marks. Arrival renders the served initial selection without choosing a member locally.
The preceding wording and results are the attributed pre-amendment record.


```
S22 · Pressing a cohort row holds it, and if the held member does not belong to
      it, selects that cohort's last member.
  element:  .gf-cohort-row[data-cohort]
  source:   harmonic-v2-glucose.js:720-725
  lock:     HV2-18
  data:     a multi-cohort case file
  evidence: replay fn S22
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S22 · 2026-09-10 · ADR 397 / coordinator amendment 1: The shipped comparison roster groups members by their served cohort. Selecting a member in another cohort holds that requested occurrence; no prototype-only cohort button or automatic last-member selection is added around the owner.
The preceding wording and results are the attributed pre-amendment record.


```
S23 · A member row selects its occurrence and the selection is always held —
      the stage never opens on an empty reading.
  element:  .gf-member-row[data-occ]
  source:   harmonic-v2-glucose.js:225-236 (ensureSelection, select), :719
  lock:     HV2-18
  data:     a populated cohort
  evidence: replay fn S23
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S23 · 2026-09-10 · ADR 397 / coordinator amendment 1: On arrival Diagnose renders the shipped case file’s own initial selection state: selection.state=none renders the cohort without a selected reading. A member row selects its occurrence and that selection is then held. No automatic selection is added around the carried owner.
The preceding wording and results are the attributed pre-amendment record.


```
S24 · The Occurrence ↑ / ↓ controls step through the held cohort's members and
      wrap at its ends, scrolling the pressed row into view.
  element:  [data-action="previous-meal"], [data-action="next-meal"]
  source:   harmonic-v2-glucose.js:237-244 (moveMeal), :363, :738-739
  lock:     HV2-18
  data:     a cohort with more than one member
  evidence: replay fn S24
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S24 · 2026-09-10 · ADR 397 / coordinator amendment 1: After an explicit member selection, the shared occurrence roster owns vertical keyboard traversal and focus/scroll retention, stopping at the first and last member as shipped. Arrival itself does not select a member.
The preceding wording and results are the attributed pre-amendment record.


```
S25 · Model step rows select a served step and put the figure on Episode; the
      step's evidence tier is rendered as the served word, not re-derived.
  element:  .gf-step-row[data-step]; .tier[data-tier]
  source:   harmonic-v2-glucose.js:430, :726; STEP_TIER :129
  lock:     HV2-11, HV2-19
  data:     a member with an episode
  evidence: replay fn S25
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S25 · 2026-09-10 · ADR 397 / coordinator amendment 1: Selected evidence is rendered through the shipped case file and chart owner, retaining its served facts and evidence tiers. The prototype’s separate model-step painter is not copied into the carried rail.
The preceding wording and results are the attributed pre-amendment record.


```
S26 · The Figure segment switches between Episode and Day, and Episode is
      disabled for a member the generator served no episode link for.
  element:  [data-figure="episode"], [data-figure="day"]
  source:   harmonic-v2-glucose.js:362, :730; episodeOf :161-164
  lock:     HV2-11
  data:     one member with an episode and one without
  evidence: replay fn S26
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S26 · 2026-09-10 · ADR 397 / coordinator amendment 1: The shared selected trace and contextual Open in Day control carry the occurrence’s served evidence. No Episode link is invented for an occurrence whose source does not publish one. The initial selection may be none.
The preceding wording and results are the attributed pre-amendment record.


```
S27 · The Window segment moves only the comparison's visible x extent; cohort
      membership, medians and the y range are the adapter's and do not change.
  element:  [data-window="near"], [data-window="full"]
  source:   harmonic-v2-glucose.js:170-174, :391-394, :733; :468
  lock:     HV2-18
  data:     a populated comparison
  evidence: replay fn S27
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S27 · 2026-09-10 · ADR 397 / coordinator amendment 1: The shared comparison renderer owns the visible comparison extent and its population, medians and y range. This is separate from the Diagnose clock window, which requests a new scoped population. An extent change does not automatically select a member.
The preceding wording and results are the attributed pre-amendment record.


```
S28 · The comparison mounts through the shipped renderer with its headline host
      and, on every re-render, runs that renderer's own cleanup and header
      restoration before mounting again.
  element:  .ec-surface[data-chart="comparison"]; #gf-fig1-head
  source:   harmonic-v2-glucose.js:452-482 (mountComparison), :176-182 (dispose)
  lock:     HV2-18, HV2-34
  data:     a populated comparison
  cites:    finding-evidence-routing.behavior.md → Event S1–S14, C41–C62 own the
            renderer's internal cohort/support/cursor contracts; this story owns
            the v2 composition and teardown only
  evidence: replay fn S28
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S29 · A roster row on the shared journey opens its subject and sends focus to
      the reading pane's head, so focus and the pane's scroll reset land in the
      same place; re-pressing the open row leaves focus where the hand is.
  element:  .gf-roster-row[data-row]
  source:   harmonic-v2-glucose-journey.js:335
  lock:     HV2-11
  data:     source=journey
  evidence: replay fn S29
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S29 · 2026-09-10 · ADR 397 / lock v2 389 2 carried-owner adaptation: The shipped Findings row opens its case and focuses #level; the Findings crumb restores the exact originating row and its scroll. Re-pressing Diagnose returns to the Findings index. No second roster or focus handler is added to the shared owner.
The preceding wording and results are the attributed pre-amendment record.


```
S30 · The Findings crumb is the persistent parent in the basal lane's head and
      returns to the findings index.
  element:  [data-journey="findings"]
  source:   harmonic-v2-glucose-basal.js:58 (the lane head's kicker);
            harmonic-v2-glucose-journey.js:340 (its handler)
  lock:     HV2-11; lock "Verbatim strings" (`Findings`)
  data:     source=journey, with the lane opened first through Explore's
            "All basal slots" row — the crumb is the lane head's own kicker and
            does not exist before the lane is in hand.
  evidence: replay fn S30
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S30 · 2026-09-10 · ADR 397 / lock v2 389 2: Apply the retained job to Diagnose / Changes / Day with Diagnose default. Evidence and its returns belong to Diagnose; Changes-origin returns remain Changes. No Overview/Explore destination survives. Shipped Findings, Spotlight, All Charts and case selectors are carried as-is.
The preceding wording and results are the attributed pre-amendment record.


### Explore — basal evidence

**How a reader reaches all 48 slots.** Two routes, neither of them an Overview
control:

* **Explore → the "All basal slots" roster row** (`journey.js:296`,
  `.gf-roster-row[data-row="basal"]`) — the ordinary route, taken by `S30`–`S35`
  and `R5`.
* **The concern's own row at the following read → "All basal slots"**
  (`[data-journey="lane"]`, `journey.js:191`/`:223`/`:261`) — the shortcut back
  into the read the nights came from, which `S37b` owns.

The lane opens with the slot's supporting nights listed but **none held**: no
`night N of M` ordinal exists, and the Night and Day figures stay disabled until
a night is selected (`basal.js:68`). `S33` and `S35` each establish that
selection before asserting anything downstream of it.

```
S31 · All 48 basal slots are independently discoverable as lane cells, and the
      cell the read asserts a move for leads without removing access to the rest.
  element:  .lane-cell[data-cell]
  source:   harmonic-v2-glucose-basal.js:164-165, :185-187
  lock:     HV2-17
  data:     the dense 48-slot capture
  evidence: replay fn S31
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S31 · 2026-09-10 · ADR 397 / lock v2 389 2 carried-owner adaptation: All 48 shipped #lane > button.lane-cell controls remain independently reachable in Diagnose. There is no duplicate All basal slots painter.
The preceding wording and results are the attributed pre-amendment record.


```
S32 · A lane cell is keyboard-operable: ArrowLeft and ArrowRight move the held
      slot and wrap, and the moved-to cell takes focus.
  element:  .lane-cell[data-cell] keydown
  source:   harmonic-v2-glucose-basal.js:166-171
  lock:     HV2-17, HV2-32
  data:     the dense 48-slot capture
  evidence: replay fn S32
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S32 · 2026-09-10 · ADR 397 / lock v2 389 2 carried-owner adaptation: The shipped lane owns left/right traversal, wrap and focus on the moved-to cell.
The preceding wording and results are the attributed pre-amendment record.


```
S33 · The slot's supporting nights traverse by keyboard on the occurrence list
      (ArrowUp / ArrowDown) and by its previous/next-night controls.
  element:  .case-occurrence keydown; [data-basal="previous-night"],
            [data-basal="next-night"]; the served "night N of M" ordinal
  source:   harmonic-v2-glucose-basal.js:155-162, :173-179
  lock:     HV2-17, HV2-32
  data:     a slot with more than one supporting night. The lane opens with the
            slot's nights listed but NONE held — no "night N of M" ordinal
            exists until one is selected — so the story establishes that
            selection first, exactly as S35 does. The ordinal is then read from
            the inspector rather than from an aria-pressed roster node: the
            roster folds to the first five plus a "25 more" summary, so a held
            night beyond the fifth has no mounted row.
  evidence: replay fn S33
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S33 · 2026-09-10 · ADR 397 / lock v2 389 2 carried-owner adaptation: The shipped supporting-night roster uses an explicit selection followed by vertical arrow traversal and focus retention. It stops at its ends; prototype-only previous/next-night buttons are not added.
The preceding wording and results are the attributed pre-amendment record.


```
S34 · Previous/next-slot controls move the held slot alongside the lane itself.
  element:  [data-basal="previous-slot"], [data-basal="next-slot"]
  source:   harmonic-v2-glucose-basal.js:175-176
  lock:     HV2-17
  data:     the dense 48-slot capture
  evidence: replay fn S34
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S34 · 2026-09-10 · ADR 397 / lock v2 389 2 carried-owner adaptation: Adjacent independently reachable shipped lane cells and their left/right keys perform the previous/next-slot job. No second set of prototype slot controls is installed around the rail.
The preceding wording and results are the attributed pre-amendment record.


```
S35 · Basal is available on any held slot; Night and Day stay disabled until a
      night is selected, and selecting one through its own affordance enables
      both. The segment then switches within the lane's owner scope, leaving
      another owner's figure alone.
  element:  [data-owner="basal"] [data-figure]; .case-occurrence
  source:   harmonic-v2-glucose-basal.js:68 (the gate), :152 (selecting a night
            moves the figure off basal), :180 (the handler)
  lock:     HV2-17
  data:     a held slot with a selectable night. The gate is asserted as a
            premise before any switch, so a disabled control is never clicked.
  evidence: replay fn S35
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S35 · 2026-09-10 · ADR 397 / lock v2 389 2 carried-owner adaptation: The basal evidence is present before a night is selected. Selection adds the shipped night trace and Open in Day affordance; no invented initial night or prototype-only Figure segment is added.
The preceding wording and results are the attributed pre-amendment record.


```
S36 · A Trial's Inspect nights opens the evidence that Trial was decided from —
      the slot lane held on the slot the change moved — never the current read's
      first-ranked concern.
  element:  [data-journey="trial-nights"]; .lane-cell[aria-pressed="true"]
  source:   harmonic-v2-glucose-journey.js:345-351
  lock:     HV2-14, HV2-28
  data:     source=journey with its Journey clock moved to "Trial, ready to
            judge" — Inspect nights is the Trial stage's own end control
            (setting.js:316,:333), absent before a Trial exists.
  evidence: replay fn S36
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S37 · Changes with no change underway names the concern and offers one route
      into its own evidence plus the staging action; taking that route lands on
      the concern's evidence.
  element:  .gf-empty [data-action="explore"] ("Inspect nights");
            [data-set="stage"] ("Stage change")
  source:   harmonic-v2-glucose-journey.js:189 (Changes delegates to the setting
            branch when it owns the leading row); harmonic-v2-glucose-setting.js:179
  lock:     HV2-12, HV2-11
  data:     source=journey, Changes
  note:     journey.js:189 hands this frame to the setting branch whenever it
            owns the leading row, so the state renders "Inspect nights" and
            "Stage change" and carries no [data-journey="lane"]. The shortcut
            belongs to the following read (S37b); the ordinary lane route is
            S31's.
  evidence: replay fn S37
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S37 · 2026-09-10 · ADR 397 / lock v2 389 2 carried-owner adaptation: Changes retains the backend-selected concern, Stage change and the named evidence route. Its canonical subject and served affected window are passed to Diagnose.
The preceding wording and results are the attributed pre-amendment record.


Amended S37 · 2026-09-10 · ADR 397 / lock v2 389 2: The retained job runs in Changes, with evidence opening Diagnose on the same subject. Changes owns the backend-selected decision and next action without duplicating the Findings roster.
The preceding wording and results are the attributed pre-amendment record.


### Changes — Plan and the setting journey

```
S38 · Staging a setting moves to Changes with that setting staged. The Undo
      belongs to the concern's own priority frame, not to Plan: stepping back to
      Overview offers "Staged · Undo" beside the route back into the draft, and
      unstaging returns focus to the control that staged it.
  element:  [data-set="stage"], [data-set="unstage"], [data-set="changes"]
  source:   harmonic-v2-glucose-setting.js:177 (renders Undo in priorityFrame),
            :398-401 (handlers)
  lock:     HV2-20
  data:     source=setting. Plan carries no Undo; the priority frame does.
  evidence: replay fn S38
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S38 · 2026-09-10 · ADR 397 / lock v2 389 2: The retained job runs in Changes, with evidence opening Diagnose on the same subject. Changes owns the backend-selected decision and next action without duplicating the Findings roster.
The preceding wording and results are the attributed pre-amendment record.


```
S39 · Plan renders the complete pump-entry schedule with its capacity copy,
      "<n> of <capacity> segments used", followed by "Nothing here is sent to
      your pump." The numerator is the deliverable's own collapsed row count.
  element:  .gf-sub / Plan head copy
  source:   harmonic-v2-glucose-setting.js:258-259; frontend/plan.js:437
            (deliverableSegmentCount), :291 (buildDeliverable)
  lock:     HV2-20, HV2-21; lock "Verbatim strings"
  data:     source=setting, staged into Changes first — the capacity copy lives
            on the Plan frame (setting.js:259), not on the empty "No change
            underway" Changes frame.
  note:     `deliverableSegmentCount` supplies the NUMERATOR only. The Plan owner
            exposes no capacity constant today, so nothing here claims it returns
            a full capacity contract; the mock's PROFILE_SEGMENTS literal
            (setting.js:27) is prototype page memory. HV2-21 forbids a memorized
            capacity, so the denominator needs a shared representation that stays
            with the existing Plan owner — never a private v2 capacity fork. This
            story asserts only the rendered shape and that the numerator does not
            exceed the denominator; where the denominator comes from is the
            build's to settle against that owner, and is recorded here so the
            port's diff-to-mock carries it rather than this ledger deciding it.
  evidence: replay fn S39
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S40 · Saving the draft records it; a failed save keeps the form in place, says
      "Saving the draft failed: no response from the store.", and offers
      "Retry saving the draft" with focus on it.
  element:  [data-set="save-draft"], [data-set="retry-save"]
  source:   harmonic-v2-glucose-setting.js:254 (renders them), :278 (the failed
            status and its Retry), :403, :405 (handlers)
  lock:     HV2-20
  data:     source=setting, staged into Changes, then "Next save fails" checked
            before pressing Save draft. BOTH halves are asserted: the failure
            with its locked wording and focused Retry, and the retry recording
            the draft. A successful save may not stand in for this story.
  evidence: replay fn S40
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S41 · Recording the decision records it; a failed record says "Recording the
      decision failed: no response from the store." and offers "Retry recording
      the decision". A failed save is never shown as saved.
  element:  [data-set="record"], [data-set="retry-save"]
  source:   harmonic-v2-glucose-setting.js:404-405
  lock:     HV2-20; risk contract "silent incorrect success"
  data:     source=setting, staged into Changes, then "Next save fails" checked
            before pressing Record decision. Both halves asserted, as S40.
  note:     the claim is read from the Decision section's FIELD VALUE, not from
            a regex over the desk: "Decision recorded" is a permanent field
            LABEL (setting.js:300) whose value reads "Not recorded" until a write
            lands, so a desk-wide match reads the label itself as a success. The
            story also asserts the
            "On pump" field appears only once a decision is genuinely recorded.
  evidence: replay fn S41
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S42 · Re-keying flags the values to re-enter on the pump and says the recheck
      happens on the next fetch — it does not claim Harmonic sent anything.
  element:  [data-set="rekey"]
  source:   harmonic-v2-glucose-setting.js:406
  lock:     HV2-20, HV2-25
  data:     source=setting: stage, record the decision, then set Pump capture to
            "Mis-keyed" and the clock to "pump captured". Re-key renders only in
            the mismatch state (setting.js:282-285), which needs all three.
  evidence: replay fn S42
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S43 · A slot row and a night row select within the setting journey's own stage,
      and the night list traverses with its previous/next controls.
  element:  [data-slot], [data-night], [data-set="previous-night"],
            [data-set="next-night"]
  source:   harmonic-v2-glucose-setting.js:392-393, :386-389, :407-408
  lock:     HV2-17, HV2-19
  data:     source=setting. The slot row and the night row are pressed, not
            counted, and the night stepper is proved in both directions.
  evidence: replay fn S43
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S43 · 2026-09-10 · ADR 397 / lock v2 389 2 carried-owner adaptation: The setting evidence uses the shared basal lane and supporting-night roster in Diagnose; slot and night changes retain their own selections and shared keyboard controls.
The preceding wording and results are the attributed pre-amendment record.


```
S44 · The setting journey's own figure and seat controls take its stage, and do
      not move another owner's figure on the shared desk.
  element:  [data-owner="setting"] [data-figure], [data-owner="setting"] [data-seat]
  source:   harmonic-v2-glucose-setting.js:396-397; harmonic-v2-glucose.js:729-732
  lock:     HV2-11
  data:     source=setting and source=journey
  evidence: replay fn S44
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S44 · 2026-09-10 · ADR 397 / lock v2 389 2 carried-owner adaptation: The shared setting evidence and selected-night trace lead to contextual Day through the carried owner. Prototype-only Figure segments are not copied.
The preceding wording and results are the attributed pre-amendment record.


### Changes — Trial evidence, readiness and the conclusion

```
S45 · The Trial stage names its detected change and its progress, and its
      evidence figure is the shipped Verify hero over the served envelopes.
  element:  .gf-stage-trial; [data-trial-chart]
  source:   harmonic-v2-glucose.js:538-556 (trialStage), :560-595
  lock:     HV2-12, HV2-23
  cites:    verify-660-story.behavior → Verify S5–S6 own the hero's hover,
            readout and restoration; this story owns the v2 composition
  data:     an active Trial
  evidence: replay fn S45
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S45b · While a change is watched, its own evidence carries the way back to it:
       "Return to Trial" replaces Set aside and lands on the Trial, so going to
       look at the evidence never loses the active-change seat.
  element:  [data-action="watch"]
  source:   harmonic-v2-glucose.js:387 (renders it in place of Set aside),
            :753 (handler); harmonic-v2-glucose-setting.js:175
  lock:     HV2-15, HV2-10
  data:     an active Trial
  evidence: replay fn S45b
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S46 · Evidence accrued renders both served figures and the bar is clamped to its
      maximum, never overfilled: still maturing reads "<elapsed> of <required>
      days"; criterion met reads "<elapsed> days" with "<required> required".
      "15 of 14 days" must not return.
  element:  .gf-figure; progress[aria-label="Trial progress"]
  source:   harmonic-v2-glucose.js:597-607 (progressSection)
  lock:     HV2-23, HV2-24; lock "Verbatim strings" (the B-08 repair)
  data:     one maturing Trial and one past its requirement
  evidence: replay fn S46
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S47 · The View segment switches the Trial's evidence between Before / Trial and
      Available days.
  element:  [data-mode="summary"], [data-mode="daily"]
  source:   harmonic-v2-glucose.js:541, :734
  lock:     HV2-23
  data:     an active Trial
  evidence: replay fn S47
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S48 · The Available-days period and day selects change which served day is read,
      and a day with readings is not claimed as a complete day of data.
  element:  [data-select="evidence-period"], [data-select="evidence-day"]
  source:   harmonic-v2-glucose.js:678-685 (dailyEvidence), :779-780
  lock:     HV2-23
  data:     a Trial with day rows in both periods
  evidence: replay fn S48
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S49 · The Before / Trial table reads each missing value against its own
      population: no meals in period, no readings, and unavailable are three
      distinct cells, never a null and never a silent zero.
  element:  .gf-stage-trial table.gf-table
  source:   harmonic-v2-glucose.js:656-677 (evidenceTable)
  lock:     HV2-22, HV2-26, HV2-31
  data:     the journey source at its "Trial, ready to judge" checkpoint, which
            serves "no meals" and "unavailable" populations. meals/active serves
            every population nonempty, so the wording this story exists for never
            appears there. Scoped to the stage's own table and matched
            case-insensitively: the columns paint as BEFORE / TRIAL.
  evidence: replay fn S49
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S50 · A Trial side with no readings pairs nothing and stays a Before-only
      figure, whose legend says so rather than drawing an empty Trial line.
  element:  [data-trial-chart] legend
  source:   harmonic-v2-glucose.js:582-590
  lock:     HV2-23
  data:     a Trial with no trial-period readings
  evidence: replay fn S50
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S51 · Conclusion is the one required, user-written field: the submit control
      stays disabled until it is non-blank, and the app puts no words in the
      wearer's mouth.
  element:  form[data-form="finish"], #conclusion, [type="submit"]
  source:   harmonic-v2-glucose.js:622-625 (reviewForm), :766-769
  lock:     HV2-25; lock "Verbatim strings" (`Conclusion`)
  data:     a Trial permitted to finish
  evidence: replay fn S51
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S52 · Finishing records the conclusion and opens the finished record on itself
      first, so the ending is acknowledged before any other concern is offered.
  element:  form[data-form="finish"] submit
  source:   harmonic-v2-glucose.js:770-778; :713 (meals.finish)
  lock:     HV2-25, HV2-28
  data:     a Trial permitted to finish
  evidence: replay fn S52
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S37b · At the following read the concern's own roster row offers "All basal
       slots", which opens the 48-slot lane of the read those nights came from
       and puts the hand on the held cell.
  element:  [data-journey="lane"]; .lane-cell[aria-pressed="true"]
  source:   harmonic-v2-glucose-journey.js:191, :223, :261 (render it),
            :339 (handler)
  lock:     HV2-17, HV2-14
  data:     source=journey with its Journey clock at the following read
            ("Jul 2 · follow-up, 30 days later"), then Explore, then the roster
            row [data-row="basal:180-240"]. The current read carries the basal
            summary but not its detailed nights, which is what this route into
            the originating read exists for.
  evidence: replay fn S37b
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S37b · 2026-09-10 · ADR 397 / lock v2 389 2 carried-owner adaptation: The concern’s own shipped Findings row drills its served basal span within the same independently reachable 48-slot lane. It never substitutes the current first-ranked concern for an addressed subject.
The preceding wording and results are the attributed pre-amendment record.


Amended S37b · 2026-09-10 · ADR 397 / lock v2 389 2: Apply the retained job to Diagnose / Changes / Day with Diagnose default. Evidence and its returns belong to Diagnose; Changes-origin returns remain Changes. No Overview/Explore destination survives. Shipped Findings, Spotlight, All Charts and case selectors are carried as-is.
The preceding wording and results are the attributed pre-amendment record.


```
S54 · The saved record distinguishes the original decision context, the observed
      change, the immutable ending and explicitly unavailable legacy facts —
      "Not recorded" is a served absence, not a blank.
  element:  .gf-reading dl (Decision, Evidence periods); detectedSettings table
  source:   harmonic-v2-glucose.js:626-640 (historyFrame), :686-688
  lock:     HV2-28, HV2-31
  data:     state=history with a finished record and a legacy record
  evidence: replay fn S54
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S54b · A finished change stays reachable from Overview through "View change
       record", which opens the saved record in Changes; the record's own "Back
       to Overview" returns without going through the topbar, so the record
       keeps its subject on the way out.
  element:  [data-action="history"], [data-action="overview"]
  source:   harmonic-v2-glucose.js:298 (the finished Overview),
            :630 (the record's way out), :752-753 (handlers)
  lock:     HV2-28, HV2-12
  data:     state=history with a finished record
  evidence: replay fn S54b
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S54b · 2026-09-10 · ADR 397 / lock v2 389 2: The finished summary belongs to Changes; View change record retains the saved subject; Back to Diagnose preserves it.
The preceding wording and results are the attributed pre-amendment record.


```
S55 · A profile change naming several settings titles itself by its count, and a
      single setting names itself with its slot and its before → after values.
  element:  .gf-title in the Trial nameplate
  source:   harmonic-v2-glucose.js:522-530 (trialTitle)
  lock:     HV2-12, HV2-19
  data:     one single-setting and one multi-setting change
  evidence: replay fn S55
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

### Changes — the habit journey

```
S56 · Starting a Focus pins it and lands on Overview, leaving no Retry standing.
  element:  [data-focus="pin"]
  source:   harmonic-v2-glucose-focus.js:339-343
  lock:     HV2-26; HV2-15
  data:     source=focus. Split from its failure half so neither branch can
            stand in for the other.
  evidence: replay fn S56
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S56 · 2026-09-10 · ADR 397 / lock v2 389 2: The retained job uses canonical pattern:<key> identity, backend permissions and served opportunity readiness. A successful pin lands on its active Focus in Changes. Separate tables, failures and endings remain; c3 implements.
The preceding wording and results are the attributed pre-amendment record.

Amended S56 · 2026-09-11 · #404 browser correction: Pattern Focus begins from a selected Diagnose outcome window; that exact served scope travels to the durable pin request and remains backend-admitted.


```
S56b · A failed pin keeps the form with its Retry focused and pins nothing; the
       retry then succeeds.
  element:  [data-focus="pin"], [data-focus="retry-pin"]
  source:   harmonic-v2-glucose-focus.js:143, :339-343
  lock:     HV2-26; risk contract "a failed save shown as saved"
  data:     source=focus with "Next Focus save fails" checked before pinning.
  evidence: replay fn S56b
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S56b · 2026-09-10 · ADR 397 / lock v2 389 2: The retained job uses canonical pattern:<key> identity, backend permissions and served opportunity readiness. A successful pin lands on its active Focus in Changes. Separate tables, failures and endings remain; c3 implements.
The preceding wording and results are the attributed pre-amendment record.

Amended S56b · 2026-09-11 · #404 browser correction: the failed and retried selected-window Pattern pin carry the same durable request identity and outcome scope; only a successful backend response opens Focus.


```
S57 · The Focus stage renders observed behavior separately from mapped glucose
      outcomes, as two distinct served tables. An empty population says so — no
      lows, no nights, unavailable — and never becomes a rate or a zero.
  element:  .gf-stage-focus table.gf-trend (two: "Observed behavior",
            "Glucose outcomes")
  source:   harmonic-v2-glucose-focus.js:165-172 (behaviorTable),
            :173-179 (glucoseTable), :161 (both mounted on the desktop stage)
  lock:     HV2-26
  data:     source=focus with its Focus clock at the follow-up station, so a
            pinned Focus with served windows exists.
  note:     the word "adherence" appears nowhere in this module. The separation
            HV2-26 contracts is these two served tables, and this story asserts
            their headings rather than a synonym for them.
  evidence: replay fn S57
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S57 · 2026-09-10 · ADR 397 / lock v2 389 2: The retained job uses canonical pattern:<key> identity, backend permissions and served opportunity readiness. A successful pin lands on its active Focus in Changes. Separate tables, failures and endings remain; c3 implements.
The preceding wording and results are the attributed pre-amendment record.


```
S58 · A dropped (preempted) Focus stays reachable in Changes as history, names
      preemption as its reason, and never silently resumes.
  element:  [data-focus="dropped"]
  source:   harmonic-v2-glucose-focus.js:249-255 (the preempted record),
            :344 (its handler)
  lock:     HV2-27
  data:     source=focus with its Focus clock moved to "correction factor
            changed on the pump" — the station where a Trial preempts the Focus.
  evidence: replay fn S58
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S58 · 2026-09-10 · ADR 397 / lock v2 389 2: The retained job uses canonical pattern:<key> identity, backend permissions and served opportunity readiness. A successful pin lands on its active Focus in Changes. Separate tables, failures and endings remain; c3 implements.
The preceding wording and results are the attributed pre-amendment record.


```
S59 · At the locked desktop viewports the Focus stage shows both trend tables at
      once and presents no seat control; the seat controls are narrow-only
      chrome and stay out of the reader's way here.
  element:  [data-focus^="seat-"] inside .gf-narrow-seat;
            .gf-stage-focus table.gf-trend
  source:   harmonic-v2-glucose-focus.js:156 (registers them, narrow branch only),
            :345 (handler); harmonic-v2-glucose.css:358 (.gf-narrow-seat is
            display:none), :364 (revealed only below 700px)
  lock:     HV2-26; HV2-05 for the inherited intermediate rule
  data:     source=focus at the follow-up station, at 1280×720 and 1440×900
  note:     the seat controls are rendered only in the narrow branch
            (focus.js:154-157), so at a desktop viewport they are absent from the
            markup entirely. **Absence is the desktop fact**; requiring a hidden
            node would invent implementation the prototype does not have. This
            story asserts the desktop fact only — both tables present, no seat
            control presented — and widens desktop acceptance to no mobile
            design. HV2-05 keeps the 701–1100 intermediate rule as inherited, and
            mobile acceptance remains a later gate (tasks 4.1–4.3).
  evidence: replay fn S59
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S59 · 2026-09-10 · ADR 397 / lock v2 389 2: The retained job uses canonical pattern:<key> identity, backend permissions and served opportunity readiness. A successful pin lands on its active Focus in Changes. Separate tables, failures and endings remain; c3 implements.
The preceding wording and results are the attributed pre-amendment record.


### Day

```
S60 · Direct Day entry — the topbar's Day — invents no prior subject and offers
      no return target.
  element:  [data-destination="day"]; absence of [data-day="return"]
  source:   harmonic-v2-glucose.js:187-196 (navigate without from), day.js:144
  lock:     HV2-13, HV2-14
  data:     any source
  evidence: replay fn S60
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S61 · A subject's Open Day is a contextual entry: it carries the date, the
      moment, the canonical subject and the way back, and its Opened-from
      section names the destination it will return to.
  element:  [data-action="day"][data-date][data-subject]; .gf-section "Opened from"
  source:   harmonic-v2-glucose.js:437, :749-751, :209-215 (fromHere); day.js:144
  lock:     HV2-14
  data:     a selected occurrence. The "Opened from" head paints uppercase, so
            the assertion is case-insensitive: it paints as OPENED FROM,
            beside Return to Explore.
  evidence: replay fn S61
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S61 · 2026-09-10 · ADR 397 / lock v2 389 2: Apply the retained job to Diagnose / Changes / Day with Diagnose default. Evidence and its returns belong to Diagnose; Changes-origin returns remain Changes. No Overview/Explore destination survives. Shipped Findings, Spotlight, All Charts and case selectors are carried as-is.
The preceding wording and results are the attributed pre-amendment record.


```
S62 · Returning restores the originating context rather than merely reopening a
      destination: focus lands on the precise target the caller named.
  element:  [data-day="return"]
  source:   harmonic-v2-glucose-day.js:217-223
  lock:     HV2-14
  data:     a contextual Day entry. "Precise" is asserted as identity, not shape:
            the exact occurrence held when Day opened is the one held AND
            focused on return, and while away the Day desk names that same
            subject verbatim. fromHere() defaults the return target to the held
            member row (glucose.js:214) and day.js:220 focuses it.
  evidence: replay fn S62
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S63 · The week ribbon picks a recorded day and disables the days with no data,
      each column carrying its own accessible label.
  element:  .gf-nav-col[data-pick]
  source:   harmonic-v2-glucose-day.js:120, :204
  lock:     HV2-13
  data:     a recorded week with at least one empty day
  evidence: replay fn S63
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S64 · The Month toggle opens the month grid and closes back to the week,
      keeping its aria-expanded honest and its focus on the toggle.
  element:  .gf-month-toggle[data-day="month"]
  source:   harmonic-v2-glucose-day.js:105, :211, :224
  lock:     HV2-13
  data:     a recorded month
  evidence: replay fn S64
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S65 · Month stepping moves a month at a time and disables its controls at the
      recorded bounds.
  element:  [data-day="prev-month"], [data-day="next-month"]
  source:   harmonic-v2-glucose-day.js:135, :212-216
  lock:     HV2-13
  data:     the journey source, whose recorded set spans May 1 – Jun 1 across 32
            days and therefore crosses a month bound. The meals capture spans May
            only, where both steppers are correctly disabled. Both facts are
            asserted with no conditional skip: a live stepper moves the month,
            and the range's own bound stays disabled.
  evidence: replay fn S65
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S66 · Previous / Next / Latest recorded-day controls move within the recorded
      set and disable at its ends; Latest disables when already there.
  element:  [data-day="prev"], [data-day="next"], [data-day="latest"]
  source:   harmonic-v2-glucose-day.js:102, :208-210
  lock:     HV2-13
  data:     a recorded set with more than one day
  evidence: replay fn S66
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S67 · Episode Log rows toggle a focused moment on and off, and each row renders
      its served state word and kind rather than a re-derived one.
  element:  .gf-log-row[data-day-row]; .tier[data-state]
  source:   harmonic-v2-glucose-day.js:150, :205
  lock:     HV2-13, HV2-19
  data:     a recorded day that carries a log. The day the desk lands on need
            not, so the story walks the week's recorded columns through the
            ribbon until one does and fails naming how many it checked.
  evidence: replay fn S67
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

### Utilities

**Which launcher a reader actually presses.** Every utility has two launchers:
the footer's `nav.cockpit-utilities` and the in-surface `.gf-utility-strip`
(`utilities.js:219`). The strip is **narrow-only** — `display:none` above 700px
(`harmonic-v2-glucose.css:471`, revealed at `:473`) — and it comes first in the
DOM, so a bare `[data-utility="…"]` matches a control no desktop reader can
press. Every utility story presses the first **visible** match and asserts the
visible launcher's own pressed state and focus-on-return.

```
S68 · Every utility opens into the reading pane's seat with the destination
      still standing underneath, and its launcher is marked pressed.
  element:  .gf-utility[data-utility]; .cockpit-utilities [data-utility];
            .gf-utility-strip [data-utility]; .cockpit-log-carbs
  source:   harmonic-v2-glucose-utilities.js:86, :219-221, :243-245, :254
  lock:     HV2-33, HV2-09
  data:     any source
  evidence: replay fn S68
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S69 · Close leaves the utility and returns focus to the control that opened it.
  element:  [data-utility-close]
  source:   harmonic-v2-glucose-utilities.js:86, :255
  lock:     HV2-33
  data:     any open utility
  evidence: replay fn S69
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S70 · Log carbs will not log an invalid amount: the log control stays disabled
      until the grams entry is loggable, and the when-controls choose the moment.
  element:  #ut-grams, [data-utility-when], [data-utility-log]
  source:   harmonic-v2-glucose-utilities.js:259-262
  lock:     HV2-33
  data:     the Log carbs utility. Every control is driven, not counted: the
            moment segment is pressed, "custom" opens and keeps its time field,
            leaving custom closes it, and a valid amount is actually logged and
            appears as an entry.
  evidence: replay fn S70
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S71 · A failed utility save stays explicit and offers its Retry; nothing is
      recorded.
  element:  [data-utility-retry]
  source:   harmonic-v2-glucose-utilities.js:256
  lock:     HV2-33; risk contract "a failed save shown as saved"
  data:     utility save-failure state driven by the named harness control
  evidence: replay fn S71
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S72 · A carb question is answered on its own identified card, which then
      offers that question its own Undo; both copies of the open count follow
      the answer and are restored by the Undo.
  element:  [data-utility-answer][data-question], [data-utility-undo],
            [data-question-card], nav.cockpit-utilities .cockpit-count,
            .gf-utility-strip .cockpit-count
  source:   harmonic-v2-glucose-utilities.js:161 (the answer controls),
            :159 (the answered card and its Undo), :219, :239 (both counts),
            :269-270 (handlers)
  lock:     HV2-33
  data:     a source serving open questions. The question is identified by its
            own key, so the Undo returns that question rather than any question.
  evidence: replay fn S72
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S72b · Answering a question with carbs opens its amount controls on that card;
       Cancel returns it to its answer controls having recorded nothing;
       logging an amount answers it and lists the entry in Log carbs, where
       Remove deletes it and returns the question to the open count.
  element:  [data-utility-answer-carbs], [data-utility-cancel-log],
            [data-utility-log][data-question], .gf-entry-row,
            [data-utility-remove]
  source:   harmonic-v2-glucose-utilities.js:160 (the logging state),
            :122-128 (amount controls), :139 (the entry row and its Remove),
            :262, :267-268, :271 (handlers)
  lock:     HV2-33
  data:     a source serving open questions. Every control this story names is
            pressed; the logged amount is synthetic and stays in page memory.
  evidence: replay fn S72b
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S73 · The Guide opens an article, brings its pane back to the head, and returns
      to the article list through its own "← All articles" control.
  element:  [data-utility-slug]; .gf-article .gf-title
  source:   harmonic-v2-glucose-utilities.js:172 (article markup), :258 (handler)
  lock:     HV2-33
  data:     the Guide utility
  note:     the focus half of this behavior is S73b. The handler already names
            the precise target `.gf-article .gf-title` and the markup renders it,
            but as an h2 with no tabindex, so focus falls to BODY — root's
            supplemental capture confirms it. What the unchanged mock does do is
            asserted here.
  evidence: replay fn S73
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S73c · A Guide article's inline cross-link opens the destination it names, and
       on a desktop desk the Guide stays seated behind it.
  element:  .gf-article [data-utility-go]
  source:   harmonic-v2-glucose-utilities.js:29 (the HANDOFF map: day → Day,
            diagnose → Explore, plan → Changes), :180 (renderMarkdown's anchor
            is rewritten into the button), :257 (handler; it clears the seated
            utility only when narrow)
  lock:     HV2-33, HV2-09
  data:     the Guide's `reading-day` article, whose served markdown carries
            [Day surface](app:day). The articles are MARKDOWN, so the button is
            generated at render time rather than present in the fixture source.
  evidence: replay fn S73c
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S73c · 2026-09-10 · ADR 397 / lock v2 389 2: Apply the retained job to Diagnose / Changes / Day with Diagnose default. Evidence and its returns belong to Diagnose; Changes-origin returns remain Changes. No Overview/Explore destination survives. Shipped Findings, Spotlight, All Charts and case selectors are carried as-is.
The preceding wording and results are the attributed pre-amendment record.


```
S74 · A password field's reveal control toggles the field type and its own
      pressed state and label together.
  element:  [data-utility-reveal]
  source:   harmonic-v2-glucose-utilities.js:272
  lock:     HV2-33
  data:     the Settings utility
  evidence: replay fn S74
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S75 · The token and credentials forms save in the page and say so; the password
      is cleared from the form after a credentials save.
  element:  [data-utility-form="token"] button[type="submit"] ("Save token")
  source:   harmonic-v2-glucose-utilities.js:101,:103 (the form's two buttons),
            :274-277 (handlers)
  lock:     HV2-33
  data:     the Settings utility. The submit is bound by type and its identity
            verified before pressing: the form also holds the reveal control,
            which is DOM-first, so a union selector presses "Show" and reveals
            the token instead of saving it.
  evidence: replay fn S75
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S75b · The credentials form saves in the page with its region, clears the
       password from the form once saved, and keeps the email. Developer mode
       takes its change and says it alters disclosure only, never the analysis.
  element:  #ut-email, #ut-password, #ut-region,
            [data-utility-form="credentials"] button[type="submit"],
            [data-utility-form="dev"] input
  source:   harmonic-v2-glucose-utilities.js:105-111 (the forms),
            :274 (field inputs), :276 (the credentials submit clears the
            password), :277 (Developer mode)
  lock:     HV2-33
  data:     the Settings utility, with obviously manufactured values
            (wearer@example.test / synthetic-password). These are page-memory
            handlers in the prototype, not credential storage, and nothing
            leaves the page.
  evidence: replay fn S75b
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S76 · A utility's own Open Day is the same contextual entry: the originating
      utility STAYS OPEN over the Day desk, which is the continuation itself.
      Closing it reveals the Day desk's own return, named for that utility, and
      following it reopens the utility over the destination it was opened on.
  element:  .gf-utility [data-action="day"][data-utility-from][data-utility-label];
            [data-utility-close]; [data-day="return"]
  source:   harmonic-v2-glucose-utilities.js:151 (the dated Open Day and its
            origin attributes); harmonic-v2-glucose.js:209-215 (fromHere),
            :301 (the utility re-seats over whichever frame rendered),
            :749-751; day.js:144, :217-223
  lock:     HV2-14, HV2-33; lock "Verbatim strings" (`Return to Carb questions`)
  data:     a question utility with a dated moment
  note:     the return is not missing when it cannot be seen — the seated
            utility covers the reading pane the "Opened from" section lives in.
            No return route is invented here: the continuity is asserted first,
            then the utility is closed to reach the return the lock names
            verbatim.
  evidence: replay fn S76
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S77 · Pump settings is reached from Changes, not from the footer utility strip,
      and is clearly distinct from the proposed schedule in Plan.
  element:  [data-utility="pump"]
  source:   harmonic-v2-glucose-utilities.js:216
  lock:     HV2-12
  data:     source=setting with a captured profile. The opener is pressed, not
            just located: the story reads the seated utility and asserts it
            names the schedule as detected and distinct from the proposed Plan.
  evidence: replay fn S77
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

### Escape, focus and scroll

```
S78 · Escape follows the settled hierarchy, one level per press: a seated
      utility first, then the narrow sheet, then the set-aside form, then Day's
      month, then a journey's own seat, then the desk's figure.
  element:  window keydown Escape
  source:   harmonic-v2-glucose.js:782-802; day.js:236; focus/setting escape()
  lock:     HV2-33
  data:     each layer, entered in turn
  evidence: replay fn S78
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S79 · A field owns Escape: pressing it inside a textarea, input or select does
      not drop the draft. The one exception is a seated utility, which steps back
      from inside its own fields and keeps what was typed.
  element:  #aside-reason, #conclusion, #ut-grams within a utility
  source:   harmonic-v2-glucose.js:788-790
  lock:     HV2-33
  data:     an open form with typed text
  evidence: replay fn S79
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S80 · Arriving at a destination that owns a reading pane focuses its head,
      unless the caller named a precise target — which always wins.
  element:  .gf-reading > header h2[tabindex="-1"]
  source:   harmonic-v2-glucose.js:197-202 (navigate sets the candidates),
            :317 (render focuses the first found)
  lock:     HV2-32
  data:     a paired destination. Narrowed to what the unchanged mock does; the
            full-width empty case is S80b.
  evidence: replay fn S80
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S81 · The reading pane keeps its scroll only while it stays on the same subject;
      a pane that changes subject arrives at its head.
  element:  .gf-pane-body scrollTop
  source:   harmonic-v2-glucose.js:274-278, :315
  lock:     HV2-32, HV2-33
  data:     the basal lane's supporting-night roster, reached through Explore's
            "All basal slots" row. The meals Explore pane does not overflow at
            1280×720; the lane's 30-night roster does.
  evidence: replay fn S81
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S81 · 2026-09-10 · ADR 397 / lock v2 389 2: Apply the retained job to Diagnose / Changes / Day with Diagnose default. Evidence and its returns belong to Diagnose; Changes-origin returns remain Changes. No Overview/Explore destination survives. Shipped Findings, Spotlight, All Charts and case selectors are carried as-is.
The preceding wording and results are the attributed pre-amendment record.
Amended S81 · 2026-09-14 · ADR 414 / lock v2 414 1: A Changes round trip is a return to the same subject (Diagnose stays seated, S109) and keeps the reading scroll, so the subject change that must arrive at its head is now the step back from the scrolled lane to the Findings roster through the crumb trail; the locked term is unchanged. App body: frontend-v2/c2.replay.mjs S81.


```
S82 · Colour semantics always carry a label, shape or positional redundancy —
      no state is conveyed by colour alone.
  element:  .gf-cohort-row[data-support], .tier[data-tier], .tier[data-state],
            .gf-nav-col .sev
  source:   harmonic-v2-glucose.js:417-427, :430; day.js:120,:150
  lock:     HV2-32
  data:     a case file with more than one support state
  evidence: replay fn S82
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

### Cleanup

```
S83 · Repeatedly entering and leaving destinations, figures and utilities leaves
      no duplicate ECharts instance, no duplicate ResizeObserver and no stale
      handler: every render disposes what the previous one built.
  element:  dispose(); charts / observers / cleanups
  source:   harmonic-v2-glucose.js:143, :176-182, :279; per-module dispose()
  lock:     HV2-34
  data:     any populated source
  evidence: replay fn S83
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

Amended S83 · 2026-09-14 · ADR 414 / lock v2 414 1: Diagnose stays seated off-screen, parked hidden in the document while Changes or Day holds the surface; leaving takes the Diagnose view off the surface, not out of the document. App body: frontend-v2/c2.replay.mjs cleanup (the [data-v2-diagnose] absence check reads visible views). Canvas and utility accounting are unchanged.
The preceding wording and results are the attributed pre-amendment record.

```
S84 · pagehide disposes every chart, observer and registered cleanup.
  element:  window pagehide
  source:   harmonic-v2-glucose.js:803
  lock:     HV2-34
  data:     any populated source
  evidence: replay fn S84
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

```
S85 · The prototype's own instrumentation is confined to the mock bar and is
      never part of the product frames: no mock source, scenario, input, clock,
      capture or failure control, and no Review notes disclosure, appears
      outside .mockbar.
  element:  .mockbar and its named selects; .gf-review-notes
  source:   mockups/_shell.js:20-27; harmonic-v2-glucose.js:70-99
  lock:     HV2-34
  data:     any source
  note:     under the app opener this becomes an absence assertion over the whole
            document — the build ports the product frames and drops all of it.
  evidence: replay fn S85
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved
```

---

## Deferred — app opener only

These are stories like any other, each naming the lock term that contracts the
build to implement it. Their `evidence:` line is **app opener only**: the
prototype holds its decisions in page memory and states so in its own ★ header
(`harmonic-v2-glucose.html:68-72`), so no mock run can close one. **A mock
page-memory assertion is not persistence evidence.** Until `/v2/` exists the app
opener fails loudly and these do not pass.

```
S86 · Python serves the desk at / and at the page paths /diagnose, /changes and
      /day, with its packaged assets beneath /assets/, no Node runtime and no
      CDN in production.
  lock:     HV2-01          evidence: app opener only
  amended:  2026-09-21, issue #416 — see "Added retirement" below
  status:   app opener only — owed by the build, never passed
```
```
S88 · Set aside and Restore are durable Store writes surviving reload, re-read
      through /api/guidance after either call because retry is not idempotent by
      receipt.
  lock:     HV2-16          evidence: app opener only
  status:   app opener only — owed by the build, never passed
```
```
S89 · Plan draft, decision, pending reconciliation, mismatch, match and
      withdrawal persist through the Plan lifecycle APIs.
  lock:     HV2-20          evidence: app opener only
  status:   app opener only — owed by the build, never passed
```
```
S90 · Capacity copy renders a value supplied by the existing Plan deliverable
      contract on two different synthetic schedules, never a memorized literal.
  lock:     HV2-21          evidence: app opener only
  status:   app opener only — owed by the build, never passed
```
```
S91 · Follow-up readiness renders the backend-owned facts of the selected
      record's comparison; setting arms and the Focus arm carry different shapes,
      and watch maturity copy supplies no evidence readiness.
  lock:     HV2-22          evidence: app opener only
  status:   app opener only — owed by the build, never passed
```
```
S92 · Readable live values, charts and accumulating progress remain visible
      before readiness and after an inconclusive finish, via the second
      assessment=retained request.
  lock:     HV2-23          evidence: app opener only
  status:   app opener only — owed by the build, never passed
```
```
S93 · Each record renders its own backend criterion; there is no universal
      fourteen-day minimum or cutoff, and watch maturity/expiry stay separate
      lifecycle metadata.
  lock:     HV2-24          evidence: app opener only
  status:   app opener only — owed by the build, never passed
```
```
S94 · Trial finish records a durable conclusion and backend ending assessment,
      survives reload, and implies no pump transmission.
  lock:     HV2-25          evidence: app opener only
  status:   app opener only — owed by the build, never passed
```
```
S95 · Manual Focus ending, trial_preempted and lever_unavailable remain distinct
      served endings; a preempted Focus stays history and never resumes.
  lock:     HV2-27          evidence: app opener only
  status:   app opener only — owed by the build, never passed
```
```
S96 · History distinguishes original, immutable saved ending and retained
      reassessment, with legacy facts explicitly unavailable, across a genuine
      sequential change.
  lock:     HV2-28          evidence: app opener only
  status:   app opener only — owed by the build, never passed
```
```
S97 · P19b: a new-window load or failed replacement shows only count-free
      loading/error content and withdraws former rows, recommendations, support
      and staging.
  lock:     HV2-29          evidence: app opener only
  status:   app opener only — owed by the build, never passed
```
```
S98 · The selected current-setting I:C coherent case/canvas pair survives a failed replacement
      with staging withheld, and a dated same-subject stale result is a separate
      state.
  lock:     HV2-30          evidence: app opener only
  data:     current ic-lower; historical past-setting reads were retired by Connor Griffin on 2026-09-08
  status:   app opener only — owed by the build, never passed
```
Amended S98 · 2026-09-10 · ADR 397 / coordinator amendment 11: After a failed replacement, the selected current-setting I:C case identity is retained: the same tile id and subject remain, and no other block is chosen. Staging is withheld. The tile shows the shipped named stale/failed state, including the served wording, in place of its canvas; the pre-failure series is not retained. A dated same-subject stale result remains a separate state.
The preceding wording and results are the attributed pre-amendment record.

Amended S98 · 2026-09-10 · ADR 397 / coordinator amendment 12: The selected current-setting I:C tile id and subject remain, with no other block chosen, and the tile's named stale/failed state replaces its canvas. Staging follows the backend's verdict on the served row and is not withheld by a failed tile replacement: any staging control is the served row's existing control, with no new control introduced. The backend's 409 on a stale write protects against acting on a stale generation (S89). A dated same-subject stale result remains a separate state. This supersedes amendment 11's staging-withheld clause; its other obligations remain.
The preceding wording and results are the attributed pre-amendment record.

```
S99 · Every limiting state exposes only backend-permitted actions, and an
      unavailable disposition carries its served reason.
  lock:     HV2-31          evidence: app opener only
  status:   app opener only — owed by the build, never passed
```
```
S100 · Fractional-hour chart speech is repaired in
       frontend/diagnose-event-comparison.js, not in a v2-only formatter, and
       the shared renderer's existing Event S8 expectation is amended to its
       actual changed presentation.
  lock:     HV2-32          evidence: app opener only
  status:   app opener only — owed by the build, never passed
```

Amended S100 · 2026-09-10 · ADR 397 / lock v2 389 2: C2 repairs fractional-hour speech in the shared renderer, amends Event S8, and proves the accessible readout. C4 verifies the integrated repair.
The preceding wording and results are the attributed pre-amendment record.


```
S80b · A full-width empty destination focuses its own heading rather than
       leaving focus on the pressed navigation button.
  lock:     HV2-32          evidence: app opener only
  status:   app opener only — owed by the build, never passed
  observed: root's S80 capture, .agentflow/inputs/sweep-debug-1/S80.json —
            after Changes opens the "No change underway" frame, the focused
            element is BUTTON "Changes" (data-destination="changes").
  why it cannot run in the unchanged mock: navigate() offers the candidates
            ['.gf-reading > header h2', '.gf-stage .gf-title']
            (harmonic-v2-glucose.js:201) and render() focuses only the first one
            it finds (:317). The empty frame has no reading pane, and its
            .gf-title is a DIV with no tabindex (:645), so neither candidate is
            focusable and focus stays where the press left it.
  disposition: not a defect in this candidate's setup. HV2-32 contracts heading
            focus on destination arrival, so the build owes it on this state. The
            locked term is NOT lowered, no sanction is invented, and the locked
            prototype is NOT edited — the obligation is recorded here and proved
            by the port's app-opener leg. S80 asserts and preserves the focus
            behavior the mock does have, on the paired states where it works.
```

```
S53 · A failed durable Trial finish keeps the form, the wearer's written
      conclusion and a Retry, records no ending, and the retry then records it.
  lock:     HV2-25; risk contract "a failed save shown as saved"
                    evidence: app opener only
  status:   app opener only — owed by the build, never passed
  observed: the prototype finishes the Trial instead. At the ready checkpoint
            the page reads TRIAL · FINISHED with the entered conclusion and an
            ending date.
  why it cannot run in the unchanged mock: setting.finish()
            (harmonic-v2-glucose-setting.js:445) writes memory.record directly —
            it never calls save() and never reads saveFails, which gates only
            save(kind) for draft and decision (:377). glucose.js:773 treats only
            an explicit `false` return from journey.finish as a failure, and this
            one returns undefined. No prototype control can induce it, and none
            was substituted. The Focus arm differs: its finish returns
            save('resolve', …), which is why the habit branch's failure path is
            exercisable and the setting Trial's is not.
  disposition: mandatory for the build and never a skip — HV2-25 contracts a
            durable conclusion, and the risk contract bars a failed save shown
            as saved. S52 keeps the successful finish. Term not lowered, no
            sanction invented, prototype not edited.
```

```
S73b · Opening a Guide article moves focus to the article heading the handler
       already targets, rather than dropping focus to the document body.
  lock:     HV2-32          evidence: app opener only
  status:   app opener only — owed by the build, never passed
  observed: root's supplemental capture,
            .agentflow/inputs/sweep-debug-2-focus/S73.json — after the article
            opens, document.activeElement is BODY.
  why it cannot run in the unchanged mock: the handler names a precise target,
            `.gf-article .gf-title` (utilities.js:258), and the markup renders
            exactly that node — but as `<h2 class="gf-title">` with no tabindex
            (:172), so .focus() is a no-op. The same class of gap as S80b, from
            the other direction: there the target was absent, here it exists and
            is not focusable.
  disposition: HV2-32 says destination arrival focuses the pane heading "unless
            the caller supplies a precise target" — the caller does supply one,
            so honouring it is contracted and the build owes it. Term not
            lowered, no sanction invented, prototype not edited. S73 asserts the
            article-open and return behavior the mock does have.
```

---

## Retired — 17 permanent entries

Every sanction below originates outside this manifest and outside this ledger,
exactly as `behavior-sweep` §2 requires: a lock may not sanction the omissions it
is itself freezing. They are transferred verbatim from the lock's *Sanctions*
block and from `mockups/finding-evidence-routing.behavior.md`. **Nothing here is
re-asked and no sanction is added.** Each has an absence assertion and the
premise its ruling reasoned from, so a dead premise asks for a fresh ruling
rather than passing silently.

The lock's *Sanctions* block carries 16 bullets. The seventeenth is the **P55
global Align Tab-stop** story, which the lock cites by ledger path plus story
title rather than restating, under the same 2026-08-23 ruling as P27; the two
are separate retired stories that share one ruling.

**A premise is checked at the successor, never on an undrilled frame.** Root's
run reported `R2` and `R10` as "premise failed … re-settle, not a fail" and `R5`
as unable to find its roster — all three from the initial Overview, where the
contracted successor had simply not been opened. **A wrong fixture or an
undrilled subject does not show that a retirement's premise has failed**, and
none of these is a re-settle trigger. `R2`, `R5`, `R10` and every other retired
story now reach the successor through the reader's own controls first, and only
then assert the absence and the premise. Nothing here asks the operator to rule
again.

```
R1 · The theme chooser and theme storage are gone. Dark material is not retired
     with them.
  predecessor: cockpit-shell.behavior.md S3, S10
  verdict:  retired
  sanction: Connor Griffin · 2026-09-01 · "light theme retired by operator decision."
  premise:  the surface is dark-only and the shipped dark role ladder is present
  replay:   fn R1 asserts no theme control or theme storage exists, asserts the
            dark ladder still resolves, and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R2 · The occurrence modal and its hash route are gone; the successor is in-place
     case/Day routing.
  predecessor: cockpit-shell.behavior.md R1
  verdict:  retired
  sanction: Connor Griffin · 2026-08-18 · "the dead occurrenceModal hash machinery goes with them."
  premise:  in-place case selection and the Day route are present
  replay:   fn R2 asserts absence of the modal and its hash route, asserts the
            in-place successor, and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R3 · A factor drill does not rewrite the clock window to its peak.
  predecessor: finding-evidence-routing.behavior.md P20 (:664)
  verdict:  retired
  sanction: Connor Griffin · 2026-08-25 · "it just keeps my selector. The selection is a slicing method that lets me then dig into findings. Those findings will show up as dots on the chart anyway that I can then trace into."
  premise:  the drilled findings remain reachable from the selection
  replay:   fn R3 asserts the window is unchanged by a drill, asserts the premise,
            and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

Amended R3 · 2026-09-10 · Coordinator amendment 4, transcribed by Codex for Connor Griffin under ADR 397 (Connor Griffin · 2026-09-08): The app's factor drill is a shipped Findings row opening its case file. Its served cohorts are member groups, not prototype cohort buttons. Selecting that Finding leaves the independently chosen Diagnose clock window unchanged and exposes its occurrence roster. The retirement and its original sanction remain permanent.
The preceding wording and results are the attributed pre-amendment record; integrated replay verification is pending.


```
R4 · Occurrence selection does not rewrite the clock window.
  predecessor: finding-evidence-routing.behavior.md P21 (:678)
  verdict:  retired
  sanction: Connor Griffin · 2026-08-19 · "Occurrence selection should not change the window. The window is a filter view in order to get to selectable occurrences. Having selectable occurrences then retrace the window would be tautological."
  premise:  the window remains an independently settable filter
  replay:   fn R4 asserts selecting a member leaves the window extent unchanged,
            asserts the premise, and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R5 · The old horizontal roster key model is gone; the roster steps vertically.
  predecessor: finding-evidence-routing.behavior.md P23–P25 (:2423)
  verdict:  retired
  sanction: Connor Griffin · 2026-08-23 · "the roster is drawn vertically; one key model per list."
  premise:  the roster is drawn vertically and steps with Up/Down
  replay:   fn R5 asserts Left/Right do not step the roster, asserts Up/Down do,
            and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R6 · The installed segmented Arrow/Home/End behavior is gone; ordinary Tab
     navigation remains.
  predecessor: finding-evidence-routing.behavior.md P27 (:766)
  verdict:  retired
  sanction: Connor Griffin · 2026-08-23 · "#55 removed installSegKeys; the shipped Align control is two ordinary Tab stops"
  premise:  the segmented controls remain reachable as ordinary Tab stops
  replay:   fn R6 asserts Home/End do not move a segment, asserts Tab reaches its
            controls, and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R7 · Occurrence dots are gone from the glucose chart.
  predecessor: finding-evidence-routing.behavior.md P29
  verdict:  retired
  sanction: Connor Griffin · 2026-08-27 · "these dots mean nothing, just take them off the glucose chart. User can get to them from the findings panel."
  premise:  the occurrences remain reachable from the findings panel
  replay:   fn R7 asserts no occurrence dot series is drawn, asserts the roster
            route, and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R8 · Meal glyphs are gone from the glucose chart.
  predecessor: finding-evidence-routing.behavior.md P29
  verdict:  retired
  sanction: Connor Griffin · 2026-08-27 · "Please also remove meal markers from the glucose chart."
  premise:  meal evidence remains available through the comparison and the log
  replay:   fn R8 asserts no meal marker series is drawn, asserts the premise,
            and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R9 · The separate occurrence level and the nested counter-example subgroup are
     gone; a current detail mutates the standing screen instead.
  predecessor: finding-evidence-routing.behavior.md P35, P49 (:858)
  verdict:  retired
  sanction: Connor Griffin · 2026-08-19 · "I don't find the content of the drill-down view particularly useful. So, I think we could just simply have the if there's a current specific detail that needs to show, I think it should just mutate the standing screen."
  premise:  in-place case selection shows the current detail on the standing screen
  replay:   fn R9 asserts no separate drill level and no nested subgroup exists,
            asserts in-place selection, and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R10 · The old standalone I:C lane is gone; its queue/case successor is preserved.
  predecessor: finding-evidence-routing.behavior.md P44 (:990)
  verdict:  retired
  sanction: Connor Griffin · 2026-08-19 · "Decided by Connor Griffin in a ruling session on 2026-08-19."
  premise:  the queue/case successor route to carb-ratio evidence is present
  replay:   fn R10 asserts the standalone lane is absent, asserts the successor,
            and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R11 · Redundant evidence-row chevrons are gone; row activation remains.
  predecessor: finding-evidence-routing.behavior.md P48 (:1038)
  verdict:  retired
  sanction: Connor Griffin · 2026-08-19 · "Decided by Connor Griffin in a ruling session on 2026-08-19."
  premise:  evidence rows are still activatable
  replay:   fn R11 asserts no chevron mark on evidence rows, asserts activation,
            and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R12 · The standalone lens inspector is gone; the shared case-file inspector, the
      selected trace and the Day route remain.
  predecessor: finding-evidence-routing.behavior.md P52 (:1089)
  verdict:  retired
  sanction: Connor Griffin · 2026-08-19 · "Decided by Connor Griffin in a ruling session on 2026-08-19."
  premise:  the shared inspector, the selected trace and the Day route are present
  replay:   fn R12 asserts the lens inspector is absent, asserts all three
            successors, and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R13 · The global "Event charts" root filter and the global "By event" control
      are gone.
  predecessor: finding-evidence-routing.behavior.md C46–C53 (:2646)
  verdict:  retired
  sanction: Connor Griffin · 2026-08-25 · "Rewrite or retire every replay story and browser-test contract that still drives the retired 'Event charts' root filter and the global 'By event' control."
  premise:  comparison evidence is reachable through the case-file-backed tile
  replay:   fn R13 asserts both global controls are absent, asserts the successor
            route, and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R14 · The old fixed dock seats are gone: a pin orders the dock rather than
      claiming a position.
  predecessor: finding-evidence-routing.behavior.md S92–S101 (:2674)
  verdict:  retired
  sanction: ADR 215 amendment · 2026-08-26 · "A pin orders the dock; it is not membership of a position."
  premise:  the dock remains an ordered set a pin can reorder
  replay:   fn R14 asserts no fixed seat mechanics exist, asserts ordering,
            and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R15 · The old mode/layout/duplicate-tile mechanics are gone; the dock is the
      whole ordered set, spotlight included. This retires no ADR 348 destination.
  predecessor: finding-evidence-routing.behavior.md S109, S112, S113 (:2692)
  verdict:  retired
  sanction: ADR 215 amendment · 2026-08-26 · "The dock is the whole ordered set, spotlight included."
  premise:  Spotlight and All Charts successors are present, and the Explore
            destination is unaffected
  replay:   fn R15 asserts the old mechanics are absent, asserts the successors
            and the Explore destination, and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

Amended R15 · 2026-09-10 · ADR 397 / lock v2 389 2: Diagnose preserves Findings, Spotlight and All Charts under ADR 397; no Overview/Explore destination buttons, registrations or selected destinations, and no retired mode/layout/duplicate-tile mechanics. ADR 215 sanction remains unchanged.
The preceding wording and results are the attributed pre-amendment record.


```
R16 · The duplicate provenance word chip is gone; the ring and the raised rail
      mark the drilled tile.
  predecessor: finding-evidence-routing.behavior.md S110 (:2755)
  verdict:  retired
  sanction: Connor Griffin · 2026-08-26 · "The ring and the raised rail mark the drilled tile. The chip was noise."
  premise:  the owning-chart mark is still present
  replay:   fn R16 asserts no provenance chip, asserts the owning mark,
            and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

```
R17 · The Trial's session-only Keep action is gone. Revert-to-Plan remains the
      manual-entry route, and ADR 348's durable finish replaces Keep.
  predecessor: Verify S8 session Keep; ADR 340
  verdict:  retired
  sanction: ADR 340 records Connor Griffin's 2026-09-04 · "Sure." after the proposal stated that Keep saved nothing and Revert-to-Plan should remain.
  premise:  Revert-to-Plan is present and the durable conclusion action exists
  replay:   fn R17 asserts no session Keep control, asserts Revert-to-Plan and the
            durable finish, and prints this sanction line
  status:   retired (permanent) · absence and premise replayed-pass · negative proof: proved
```

Amended R17 · 2026-09-10 · Coordinator amendment 4, transcribed by Codex for Connor Griffin under ADR 397 (Connor Griffin · 2026-09-08): The app's data premise is a manufactured active Trial whose served admission permits finishing, not the prototype's ready scenario selector. The session-only Keep remains absent; the served Revert-to-Plan entry remains, and submitting a conclusion creates a durable ending that survives reload. The retirement and ADR 340 sanction are unchanged.
The preceding wording and results are the attributed pre-amendment record; integrated replay verification is pending.


### The P55 pair, recorded so it is not re-ruled

`mockups/finding-evidence-routing.behavior.md` carries two different stories
under a reused `P55` identifier. The **boundary-crossing draw** is *kept* — it is
covered by this ledger's clock-window stories and by the shipped renderer's own
frozen coverage. The **global Align Tab-stop** is *retired*, and is R6's
companion under the same 2026-08-23 ruling (`:2297`, identical wording). No
historical ledger edit and no new sanction is made here. Cite them by ledger
path plus story title, never by the bare identifier.

### What no sanction retires

Per the lock: **no sanction retires dark material, clock boundary drawing, chart
retention, the adopted Explore destination, Revert-to-Plan, durable conclusions,
or precise Day return.** A build dropping one of those is violating this
contract, not honoring a ruling.

---

## Completeness check — handler to story

Mechanical, per `behavior-sweep` §3: every inventoried handler maps to ≥1 story,
every §2 predecessor row carries a verdict (in the lock), and every story is
observed live before the freeze. **A handler is listed against the story that
actually drives it**, not one that merely mentions it.

| Handler / registration | Source | Story |
|---|---|---|
| `[data-destination]` ×4 | glucose.js:249 | S1, S2, S3, S60 |
| `narrowQuery` change | glucose.js:254 | S10 |
| `[data-occ]` | glucose.js:719 | S23 |
| `[data-cohort]` | glucose.js:720 | S21, S22 |
| `[data-step]` | glucose.js:726 | S25 |
| `[data-figure]` | glucose.js:730 | S26 |
| `[data-seat]` | glucose.js:731 | S44 (setting-owned); S10b (narrow-only at desktop) |
| `[data-window]` | glucose.js:733, :480 | S27 |
| `[data-mode]` | glucose.js:734 | S47 (summary/daily); S10b (narrow `chart` seat, not presented) |
| `[data-action]` ×11 driven | glucose.js:735-754 | retry S20 · next/previous-meal S24 · aside S15 · cancel-aside S17 · restore S16 · explore S14, S37 · day S61 · history S54b · overview S54b · watch S45b |
| `[data-action]` open-sheet / close-sheet | glucose.js:741-742 | S10b (narrow-only chrome, not presented at desktop) |
| `#aside-reason` input | glucose.js:755 | S15 |
| `form[data-form="aside"]` | glucose.js:760 | S15 |
| `#conclusion` input | glucose.js:766 | S51 |
| `form[data-form="finish"]` | glucose.js:770 | S51, S52 (success); S53 (failure/retry, app opener only) |
| `[data-select="evidence-period"]` | glucose.js:779 | S48 |
| `[data-select="evidence-day"]` | glucose.js:780 | S48 |
| `window keydown` Escape | glucose.js:782 | S78, S79 |
| `window pagehide` | glucose.js:803 | S84 |
| ResizeObserver ×3 | glucose.js:474, :513, :593 | S83 |
| `[data-pick]` | day.js:204 | S63 |
| `[data-day-row]` | day.js:205 | S67 |
| `[data-day]` ×7 | day.js:206-226 | return S62 · month S64, S127 · prev/next-month S65, S127 · prev/next/latest S66 |
| ResizeObserver | day.js:183 | S83 |
| `[data-slot]` | setting.js:392 | S43 (pressed) |
| `[data-night]` | setting.js:393 | S43 (pressed) |
| `[data-owner="setting"] [data-figure]/[data-seat]` | setting.js:396-397 | S44 |
| `[data-set]` ×9 | setting.js:398-409 | S38, S40, S41, S42, S43 |
| ResizeObserver | setting.js:362 | S83 |
| `[data-focus]` ×4 | focus.js:339-347 | S56, S56b, S58, S59 |
| ResizeObserver | focus.js:319 | S83 |
| `[data-row]` | journey.js:335 | S29 |
| `[data-restore]` | journey.js:336 | S16 |
| `[data-journey]` ×4 | journey.js:337-352 | S20b (retry-read), S30 (findings), S36 (trial-nights), S37b (lane) |
| `.lane-cell[data-cell]` click + keydown | basal.js:164-171 | S31, S32 |
| `.case-occurrence` keydown | basal.js:155-162 | S33 |
| `[data-basal]` ×4 | basal.js:173-179 | previous/next-night S33 · previous/next-slot S34 |
| `[data-owner="basal"] [data-figure]` | basal.js:180 | S35 |
| ResizeObserver | basal.js:103 | S83 |
| footer utilities + `.cockpit-log-carbs` | utilities.js:243-245 | S68 |
| `[data-utility]` | utilities.js:254 | S68, S77 (pump opener pressed) |
| `[data-utility-close]` | utilities.js:255 | S69 |
| `[data-utility-retry]` | utilities.js:256 | S71 |
| `[data-utility-go]` | utilities.js:180, :257 | S73c |
| `[data-utility-slug]` | utilities.js:258 | S73 |
| `[data-utility-when]` | utilities.js:259 | S70 (pressed, incl. custom) |
| `#ut-grams`, `#ut-custom` input | utilities.js:260-261 | S70 (both filled) |
| `[data-utility-log]` | utilities.js:262 | S70 (plain log), S72b (against a question) |
| `[data-utility-answer-carbs]` | utilities.js:267 | S72b |
| `[data-utility-cancel-log]` | utilities.js:268 | S72b |
| `[data-utility-answer]` | utilities.js:269 | S72 |
| `[data-utility-undo]` | utilities.js:270 | S72 |
| `[data-utility-remove]` | utilities.js:271 | S72b |
| `[data-utility-reveal]` | utilities.js:272 | S74 |
| settings field inputs ×4 | utilities.js:274 | S75 (token), S75b (email/password/region) |
| `[data-utility-form="token"]` | utilities.js:275 | S75 |
| `[data-utility-form="credentials"]` | utilities.js:276 | S75b (incl. password clear) |
| `[data-utility-form="dev"] input` | utilities.js:277 | S75b |
| imported `renderEventSurface` handlers | diagnose-event-comparison.js:251-330 | S28, S12 (+ cited Event S1–S14) |
| imported hero / episode / evidence builders | day-hero-chart.js, verify-workstation-chart.js, scenario-chart.js, diagnose-evidence-charts.js | S45, S26, S25 (+ cited Verify S5–S6) |
| imported `TIER`, `GRID` | diagnose-findings-queue.js, diagnose-workstation-chart.js | S21, S27 |
| imported `plan.js` deliverable | plan.js:291,:407,:437,:727 | S39 (+ cited Plan S1–S4) |
| invariants (no handler) | — | S11, S12, S13 |
| destination heading focus on a full-width empty frame | glucose.js:201, :317, :645 | S80b (app opener only) |
| caller-supplied focus target on a Guide article | utilities.js:172, :258 | S73 (open/scroll/return) + S73b (focus, app opener only) |
| `[data-set="unstage"]`, `[data-set="changes"]` | setting.js:177 | S38 |

## QUESTION round

`behavior-sweep` §3: a handler found in code but not reproducible in-browser
becomes a QUESTION entry, never a silent skip. **None is open.**

One was, and it was closed by observation rather than by a ruling. The
`[data-journey="lane"]` shortcut is registered at
`harmonic-v2-glucose-journey.js:339` and was absent from every state the early
runs reached, because `journey.js:189` hands Changes to the setting branch
whenever it owns the leading row. Root then exercised a real route on the served
fixtures — the following read's roster row opens it — and that is now story
**S37b**. Lane access itself was never in doubt: S31 covers the reader's
ordinary route through Explore's "All basal slots" row.

No operator ruling was needed and none was sought, so no sanction was created
and no handler was dropped.

Nothing else is open. The behaviors this ledger covers are settled by the lock's
34 terms and its predecessor map; every retirement already carries an external
sanction, so none goes to a ruling round. The one policy this sweep chose for
itself — the external-request and font policy — is an opener mechanic, recorded
above with its exact limitation rather than referred to the operator.

## Evidence behind this freeze

Retained under `mockups/sweep/harmonic-v2-desktop/`, raw command output
unmodified. Every number in the header block above was read from these files.

| Evidence | Records |
|---|---|
| `runs/sweep-1280x720.*`, `runs/sweep-1440x900.*` | the complete replay at both locked viewports: 111 passed, 0 failed, 18 deferred, 129 selected, one Chromium launch each |
| `runs/negative-proof.*` | one feature-specific perturbation per mock-applicable story: 111 proved, 0 not proved, 18 owed, exit 0 |
| `runs/app-target-absent.*` | the app opener against the absent `/v2/`: 0 executed, 1 failed, exit 1 |
| `runs/retained-fixture-hashes.json` | the seven synthetic inputs by SHA-256 and byte length |
| `captures/` | 25 ids at both viewports with `manifest.json` naming each id's story or checkpoint, scope, coverage and receipt |

The negative proof never edited the locked prototype. Its perturbations are
transient and in-page; the one story whose feature lives in module JS is proved
by serving that module through a route with a single line replaced, in memory.

Fixture hashes are a **tripwire, not the contract** — they detect unintended
regeneration. The transported bytes are what the build is handed.

No QUESTION is open.

## Amending this ledger

A behavior that must change after this freeze does not get edited quietly. A
story citing a lock term goes through `resettle`, and the manifest row is the
record; a story with no lock term is dropped only by an operator ruling recorded
inline under a QUESTION entry with their exact sentence quoted. Either way the
drop becomes a permanent RETIRED entry carrying its sanction, its premise and an
absence assertion in the replay that prints that sanction on every run.

The 17 retirements below are permanent. They stay through every later sweep,
revision, port and lock of this surface: the ledger records what the surface does
**and** what it deliberately stopped doing.


## Added retirement — 2026-09-08, issue #389

```
R18 · Historical past-setting tuning reads are absent everywhere in the app.
  predecessor: finding-evidence-routing.behavior.md S41, S43–S48, S53–S56,
               S63–S64 and S68; only the historical clauses of S42 and S74
  lock:     HV2-31
  verdict:  retired
  sanction: Connor Griffin · 2026-09-08 · "We dont' need historical reads in the app."
  premise:  the input actually contains a register=history row; current-setting
            evidence remains browsable and Trial/Focus records are not removed
  replay:   fn R18 checks roster/counts, Watching, All Charts and stale selected
            historical identity, and prints the sanction
  status:   owed by the build — no passing result recorded
```

## QA amendment — 2026-09-10, issue #404 (q1; no application fixes)

Connor's #404 order adds these fail-first obligations. They retain the frozen
stories and add coverage where the old assertions did not exercise the reported
path. They are not passing browser evidence. Browser execution belongs to the
coordinator at 1280x720 and 1440x900; the worker order prohibits build, serve and
browser execution. The original freeze results above remain historical.

Current inventory: **142 issued = 124 active + 18 retired**. S101–S112 are
app-opener-only. No earlier ID or lock term is retired or re-settled by this QA
pass. The design and expiry decisions were unresolved at this QA amendment;
the final #404 triage disposition supersedes that historical status.

```
S101 · A drawn Window chip carries only the span; the enclosing Window label
       supplies the noun once.
  element:  #seg-window [data-follow], .cap
  source:   frontend/diagnose-workstation.js markWindowSegment / paintChart
  lock:     nearest HV2-11; no frozen story specifies this exact chip copy
  data:     showcase; resize Afternoon's measured brace to 15:30–21:30
  evidence: C4_STORIES.S101; registered app-only in the v2 replay
  status:   browser fail-first pending coordinator; current source prefixes Window
```

```
S102 · From a Pattern graph, clicking the thin 12:00 basal slot opens that
       slot's own graph on the stage, including its thin-evidence state.
  element:  #tile-row .evidence-tile, #lane > button, #tile-focal .evidence-tile
  source:   frontend/diagnose-workstation.js pickCell / seatDrill
  lock:     HV2-17, HV2-19; strengthens S43's stage-selection obligation
  data:     pattern-near-tie; chartable Pattern and thin 12:00 basal slot
  evidence: C4_STORIES.S102; checks stage identity after the slot selection
  status:   coordinator confirmed the retained-Pattern assertion at both locked sizes
```

```
S103 · Backing out of a basal slot restores the reader's preceding 24 h,
       named Morning, or drawn 15:30–21:30 window.
  element:  #lane > button, Findings breadcrumb, #seg-window, #chart
  source:   frontend/diagnose-workstation.js pickCell / releaseWindow / popTo
  lock:     nearest HV2-11, HV2-33; S43 covers selection, not this exact return
  data:     showcase; three independently entered window states
  evidence: C4_STORIES.S103; collects all three before/after window comparisons
  status:   coordinator confirmed return-window assertion at 1280x720;
            1440x900 drawn-window setup reproof pending
```

```
S104 · Picking another recorded day keeps the Day stage, reading pane and
       navigator mounted while the selected day's read is pending; completion
       changes the held date without replacing the stage and reading pane nodes.
  element:  .gf-nav-col[data-pick], .gf-stage-day, .gf-reading, #gf-nav
  source:   frontend-v2/day.js bind / mount; routes.js render
  lock:     nearest HV2-13, HV2-34; S63 covers picking, not node retention
  data:     showcase; Previous recorded day enters the populated preceding week;
            hold and then continue the real /api/model-view request on a ribbon pick
  evidence: C4_STORIES.S104; node identity and connectedness across the read
  status:   coordinator confirmed the teardown assertion at both locked sizes
```

```
S105 · A confirmed-on-pump Plan with no active watch offers View change record;
       the selected finished Trial opens its immutable ending and reloads from
       its exact record address.
  element:  .gf-status[data-state="confirmed"], View change record,
            [data-record], [data-record-part="ending"], record route occurrence
  source:   frontend-v2/plan-view.js planFrame; changes.js; history.js openRecord
  lock:     HV2-12, HV2-28; extends S54b to the on-pump Plan state
  data:     c3-trial; finish through S52, then record its already-programmed value at an eligible basal
            slot and capture the same schedule through the replay pump producer
  evidence: C4_STORIES.S105; asserts finished history, on-pump state and empty
            admission before checking the missing door, then record/reload
  status:   coordinator confirmed the missing-door assertion at 1280x720 and
            1440x900; no application fix or passing replay claimed
```

```
S106 · Selecting a served Pattern occurrence draws its exact served glucose
       trace and served event markers together in the focal ECharts option.
  element:  #tile-row .evidence-tile, #level .case-occurrence, #tile-focal .tile-chart
  source:   frontend-v2/diagnose.js selection; frontend/diagnose-event-comparison.js option
  lock:     HV2-17; S100/S26 retain the regular-comparison counterpart
  data:     pattern-near-tie; selected Pattern detail supplies glucose and markers
  evidence: C4_STORIES.S106; compares selected:trace plus visible supported
            scatter/markPoint/markLine marker positions and served kind labels to case-file detail
  status:   reached its feature assertion and failed at both locked sizes; corrected
            marker-form evidence awaits coordinator reproof, while regular low retains its trace
```

```
S107 · Diagnose, Changes and Day share one reading-rail width; All charts and
       Close place each label before its icon; the focal action stays top-right;
       grouped long-meal cohorts name themselves once while each event
       description stays readable; ordinary verdict rows retain non-overlapping
       varying tier text.
  element:  .v2-diagnose .inspector, .gf-desk .gf-reading, All charts,
            #chart-headacts, #tile-focal .tile-fullscreen, #level .case-occurrence
  source:   frontend-v2/diagnose.js; frontend-v2/day.js; frontend-v2/plan-view.js;
            frontend/diagnose-workstation.css
  lock:     HV2-11; existing density tokens remain authoritative (no pixel target)
  data:     showcase; All charts then finding:meal_bolus_short's long cohort roster
  evidence: C4_STORIES.S107; aggregates every label/rail/focal/row observation,
            including served grouped-cohort headings, full event-text ink, and
            ordinary mixed-tier column geometry
  status:   reached its feature assertion and failed at both locked sizes; corrected
            Close/row evidence awaits coordinator reproof; focal top anchoring held
```

Additional handler inventory for this amendment:

| Handler / registration | Source | Story |
|---|---|---|
| Clock drag and custom follow chip | frontend/diagnose-workstation.js | S101 |
| Pattern tile then thin basal lane click | frontend/diagnose-workstation.js | S102 |
| Basal lane click then Findings breadcrumb | frontend/diagnose-workstation.js | S103 |
| Recorded-day click during model read | frontend-v2/day.js | S104 |
| Plan history door and exact record address | frontend-v2/plan-view.js, history.js, changes.js | S105 |
| Pattern tile, occurrence selection and focal ECharts option | frontend-v2/diagnose.js, frontend/diagnose-event-comparison.js | S106 |
| Destination navigation, All charts/Close and long cohort rows | frontend-v2/diagnose.js, day.js, plan-view.js, frontend/diagnose-workstation.css | S107 |
| Destination round trip: held status read, retained drill and scroll | frontend-v2/diagnose.js | S108, S109 |
| Edit-grouped record roster and its member addresses | frontend-v2/history.js | S110 |
| Still open disposition word | frontend-v2/history.js | S111 |
| Named roster/reassessment loading frames | frontend-v2/history.js | S112 |

## #414 chunk 3 amendment — 2026-09-14, issue #414

S108–S112 are the fail-first obligations for ADR 414's Diagnose retention and
edit-chaining app work (chunks 1 and 2). They are app-opener-only, like
S101–S107. Browser execution belongs to the coordinator at 1280x720 and
1440x900; the worker order prohibits build, serve and browser execution.

```
S108 · Returning to Diagnose from Changes issues exactly one GET /api/status;
       the loading frame stands until it answers, and the selected window and
       the drilled reading-pane subject are both still current once it does.
  element:  nav.v2-nav [data-destination], .gf-loading, #seg-window
            [aria-pressed="true"], #crumb-trail .here
  source:   frontend-v2/diagnose.js mount / read (the ADR 414 status-check branch)
  lock:     HV2-34; extends S104's held-read pattern to the destination round trip
  data:     showcase; select 24 h, drill the first ranked row (which selects
            that row's own slot window, e.g. Slot 03:00, not 24 h), open
            Changes, return
  evidence: C4_STORIES.S108; holds /api/status, asserts no other request fires,
            then compares the pre- and post-return crumb and whichever window
            chip was left pressed
  status:   base app fails — "the return must issue GET /api/status; none
            arrived within 30 s" (the base tears the desk down and re-reads
            every guidance read on return; no status check exists); coordinator
            confirmed the branch passes at 1280x720 and 1440x900, coordinator-run 2026-09-14
```

```
S109 · The reading pane's scroll position survives the same Diagnose round trip.
  element:  #level
  source:   frontend-v2/diagnose.js detach / mount (root parked, not rebuilt)
  lock:     HV2-34
  data:     showcase; select 24 h with no row drilled (the undrilled factors
            roster overflows its pane; a drilled pane does not), scroll #level
            by a bounded offset that fits inside its own overflow, return
  evidence: C4_STORIES.S109; settles the network (the rail's own tile reads
            are the desk's last arrival traffic, and each repaints the roster
            to its remembered drill position) before scrolling, then compares
            #level.scrollTop before and after the round trip
  status:   base app fails the same way — no status read arrives on return,
            so the base re-reads and the pane re-seats at 0; coordinator
            confirmed the branch passes at 1280x720 and 1440x900, coordinator-run 2026-09-14
```

```
S110 · The record roster groups a served multi-member Edit into one titled entry
       ("<count> setting changes") with its member rows beneath, while the one
       lone-record Edit stays a flat row; opening a member addresses that exact
       record, and reloading the address reopens it.
  element:  tr.gf-edit-row, [data-edit-member], [data-record]
  source:   frontend-v2/history.js editEntryHtml / recordRoster
  lock:     HV2-28; ADR 414 (openspec/changes/archive/2026-09-24-v2-desk-retention/design.md) is the
            chaining rule itself
  data:     edit-chain; three records within a day of each other chain into one
            Edit, a fourth a week earlier stays its own
  evidence: C4_STORIES.S110; counts the titled entry and its members, then opens
            a member and reloads its address as S105 does
  status:   base app fails — "premise: edit-chain serves exactly one titled
            Edit entry": 0 !== 1 (no Edit grouping on the base roster);
            coordinator confirmed the branch passes at 1280x720 and 1440x900, coordinator-run 2026-09-14
```

```
S111 · Every Still open cell names the served watch disposition as a word,
       never the raw backend token — including a grouped Edit's shared cell.
  element:  [data-record-open="true"]
  source:   frontend-v2/history.js openCell / editEndingCell
  lock:     HV2-28
  data:     edit-chain; every retained record is unwatched (not_selected_for_watch)
  evidence: C4_STORIES.S111; reads every Still open cell's disposition word
  status:   base app fails — "a Still open cell must carry a word, never a
            raw disposition token: not_selected_for_watch"; coordinator
            confirmed the branch passes at 1280x720 and 1440x900, coordinator-run 2026-09-14
```

```
S112 · The roster read and a requested reassessment each show their own named
       loading frame while pending.
  element:  .gf-loading
  source:   frontend-v2/history.js mount (loadRoster / loadRecord)
  lock:     HV2-28
  data:     edit-chain; a retained record with no ending, so opening it and
            requesting a reassessment are both live reads
  evidence: C4_STORIES.S112; holds the roster read, the record read and the
            reassessment read in turn, and reads the loading frame's text at each
  status:   base app fails — locator.waitFor timeout waiting for .gf-loading
            with text "Reading change records" (the base loading frame
            carries no text); coordinator confirmed the branch passes at
            1280x720 and 1440x900, coordinator-run 2026-09-14
```

```
S113 · The basal lane's head row — the served verdict key — stands wholly
       above the 48 cells, inside the lane; every served verdict (raise,
       lower, hold, insufficient, no data) paints its cells and matches its
       key mark on that one shared paint, hold never reading as the bare
       ground; a staged cell and a different selected cell are both provable
       at once; every key count equals the served cells sharing that verdict.
  element:  #lane-wrap, #lane-key, #lane, .stagebtn
  source:   frontend/diagnose-workstation.js renderLaneKey; frontend/diagnose-workstation.css .lane-cell[data-verdict]/.lane-wrap/.lane-key
  lock:     HV2-17
  data:     basal-verdict-gallery (scripts/qa_e2e_cases.py QaCase, manufactured
            per AGENTS.md's QA-coverage-era process from real
            `execute_case` output): one basal lane serving a raise, a lower,
            a hold, an insufficient-evidence and every other slot no-data, in
            one 30-day source window
  evidence: C4_STORIES.assertBasalLaneGallery (called from S113 after
            `openBasalLane`); requires all five served verdicts present,
            stages the raise cell then selects the lower cell, reads the DOM
            order of `#lane-wrap`'s children and each element's bounding
            box, then for every verdict compares its cells' and its key
            mark's shared `--cell` paint token (plus the hatch/dot structure
            for insufficient/no-data and the directional glyph for
            raise/lower) and the key's printed count against the served
            lane count; then (after the #413 critique) requires every cell
            to stand wholly inside the lane's track, the selected cell's
            outline to resolve to `--primary`, and the staged mark to be a
            2px underline, so selection, stage and lower fill stay three
            distinct marks
  status:   base eec4652a fails at its feature assertion at both sizes ("the
            key must render as the lane's head row, above the cells");
            branch 165b83fc passes at both sizes; coordinator-run
            2026-09-22. Raw logs: docs/scope/413-desk-design-evidence/
            fail-first-base-{1280x720,1440x900}.log and
            pass-branch-{1280x720,1440x900}.log
```

```
S114 · A cold Diagnose arrival shows a text-free, shimmering skeleton in the
       loading frame in place of the empty block, keeping the loading status,
       its named text, and the reading pane at the Diagnose reference width;
       the skeleton holds still under reduced motion.
  element:  .gf-loading, .gf-skeleton
  source:   frontend/frame.js loadingFrame / loadingSkeleton; frontend/desk.css .gf-skeleton/.gf-skel
  lock:     HV2-29
  data:     the app's own showcase; the read held open with a synthetic
            route so the loading frame stands long enough to inspect
  evidence: C4_STORIES.S114; holds `/api/analyze`, reloads cold, reads one
            skeleton per pane (stage instruments inside the loading block,
            rail rows in the reading pane's body — the #413 critique moved
            the rows out of the stage), each one's marks and text content,
            that the loading card contains every stage mark (after the
            strip well overran it at 1280x720), the status label and the
            reading pane's width, then checks the
            animation is suppressed under
            `prefers-reduced-motion: reduce` before releasing the read
  status:   base eec4652a fails at its feature assertion at both sizes ("the
            cold loading frame must carry one stage skeleton block": 0);
            branch 165b83fc passes at both sizes; coordinator-run
            2026-09-22. Raw logs as S113's
```

## #413 task 3 sub-order amendment — 2026-09-22, issue #413

S115–S117 are the rail's fail-first obligations for the #413 design lock's
Pattern fold, urgency paint, one mini instrument, the served count sentence,
and the 24 h cold arrival — surfaces 1, 2, 3, 4 and 6 of the pinned change's
`specs/surfaces/spec.md`. They are app-opener-only, like S113/S114; browser
execution belongs to the coordinator at 1280x720 and 1440x900, unsandboxed
(a sandboxed worker cannot launch Chromium). The frontend Pattern word
constant (`PATTERN_COPY`) is deleted with this amendment; every reader named
in the #413 design record (the queue's member-family lookup and
`pattern-unknown` detail, the Pattern mini's cohort label, and the Pattern
case-file's `pattern_chart` key match) now reads a served fact instead.

```
S115 · A Pattern owning claimed causes folds them beneath its own row, one
       line per cause naming the cause and every one of its served count
       sentences' count, denominator and noun — never its outcome word, never
       merged, never as a sibling rail row — behind a toggle naming the
       served cause count, open on the first ranked row and closed on every
       later one on arrival; the Pattern's own row still prints its full
       served sentence, count and denominator emphasised; the first served
       tier's rows carry a rank stripe, later tiers stay quiet.
  element:  .qrow, .qfold, .qitem.member, .qmember
  source:   frontend/diagnose-findings-queue.js queueRows / renderFindingsQueue;
            frontend/diagnose-workstation.css .qfold/.qitem.member/.qmember/[data-urgent]
  lock:     #413 design lock (mockups/INDEX.md, Harmonic v2 desktop row)
  data:     the app's own showcase; a served Pattern already claims at least
            one Cause (the same fact S113's predecessor observed of the base)
  evidence: C4_STORIES.S115; reads the served preparation to name the owning
            Pattern and its claimed members, asserts none renders as a
            sibling `.qrow`, finds the fold toggle inside the Pattern's own
            list item and opens it, requires each member's line inside that
            item's nested causes list with its name and counts on one line
            (the #413 critique's nesting and one-line fixes), reads each
            member's line against every one of its served count sentences,
            reads the Pattern's own
            row against its served sentence with emphasis, and compares the
            served rank-one tier's rows against `data-urgent`
  status:   base eec4652a fails at its feature assertion at both sizes
            (finding:meal_bolus_short "must never be a sibling rail row");
            branch 165b83fc passes at both sizes; coordinator-run
            2026-09-22. Raw logs as S113's
```

```
S116 · Every ranked rail row's mini draws the same instrument: the matched
       cohort's served outcome word and count at the left, TYPICAL and the
       served denominator at the right, sourced from the row's own served
       count sentence rather than a frontend word table, in the rail's
       cohort palette.
  element:  .qrow .mini
  source:   frontend/diagnose-workstation-chart.js queuePreviewOption;
            frontend/diagnose-evidence-charts.js patternQueuePreview / the
            eating-sequence high-carb queuePreview
  lock:     #413 design lock (mockups/INDEX.md, Harmonic v2 desktop row)
  data:     the app's own showcase; a ranked Pattern and a ranked Cause both
            carry a mounted mini
  evidence: C4_STORIES.S116 → assertRankedMinis; for every row serving a
            chartable coordinate (a Pattern chart, or an unclaimed Cause's
            event chart), reads its mounted mini's ECharts option, requires
            the row to serve a count sentence, and compares the graphic text
            against that sentence's outcome word, count and denominator; at
            least one mini must be mounted. Candidates are chosen by the
            coordinate alone, so a desk serving no count sentence reaches
            this feature assertion rather than a premise failure
  status:   base eec4652a fails at its feature assertion at both sizes
            ("finding:over_treated_low's mini must draw from its served count
            sentence", its base mini drawing ['EVENT · RESPONSE']); branch
            165b83fc passes at both sizes; coordinator-run 2026-09-22. Raw
            logs as S113's. The earlier c7fdad07 runs failed on base and
            branch alike on a story-lookup defect (the ECharts instance
            sought on the canvas's parent rather than on `.mini`), which
            45e6aecc corrected
```

```
S117 · A cold Diagnose arrival with no contextual entry and no retained
       window opens on the 24 h window, and the findings read is unscoped.
  element:  #seg-window
  source:   frontend/diagnose.js restoreEntry
  lock:     #413 design lock (mockups/INDEX.md, Harmonic v2 desktop row)
  data:     the app's own showcase; the default opener's fresh root arrival
            (no subject, no window)
  evidence: C4_STORIES.S117; reads the pressed Window control and the served
            findings preparation's window scope on the cold seat, before any
            row is drilled or window pressed
  status:   base eec4652a fails at its feature assertion at both sizes (the
            pressed window is "Overnight", not "24 h"); branch 165b83fc
            passes at both sizes; coordinator-run 2026-09-22. Raw logs as
            S113's
```

### #413 sanctioned changes to shipped desk behavior — 2026-09-22

Connor's #413 design lock (2026-09-14, recorded in
`openspec/changes/desk-design-completion/design.md`) changes three shipped
facts:

- **Member minis leave the rail.** "No member minis in the rail; the parent's
  mini stands for the group."
- **Claimed causes stop being sibling rows.** "Pattern members fold under their
  parent on the parent's spine, one line each".
- **The cold arrival opens on 24 h.** "Default window on load is 24 h."

No story in this ledger asserted any of the three, so no story text is amended
or retired. The executable readers that did assert them were re-read for intent
by #413 sub-order 3 and moved to the new facts:

- the desk browser suite's fold opener (`openRailRow`) and its Overnight-default
  comments;
- the Diagnose replay's High-carb row locator (`railRowLocator`) and its
  retired `claimed` state field.

The coordinator's 2026-09-22 run of S19, S20, S20b, S31–S35, S36, S37b and
S102–S104, S106–S109 and S112 at 1280x720 (18 stories) executed all 18 with 0 failures,
and the full desk browser suite passed 40 of 40.
The #413 critique fixes change no story's subject. They tighten S113, S114 and
S115's assertions, as each entry's evidence line states.

### Coordinator amendment 1 — 2026-09-10

The coordinator's first isolated browser runs did not reach the feature assertions
for S101–S104: S101–S103 raised `diagnose is not defined`; S104 timed out reading
the other-day locator. S105 reached its missing-history-door assertion at both
locked viewports and is unchanged.

S101–S103 now use their siblings' existing `fullDayDiagnose` opener. S104 first
presses S66's Previous recorded day control: showcase arrives on Sunday June 30,
whose week has no other recorded day; Saturday June 29's ribbon offers June 23–28.
Only after that setup settles does the story retain nodes and hold the selected
day's read. Node regression tests call the four exported stories and distinguish
their feature assertion from setup errors; those tests are not browser evidence.
Corrected S101–S104 still require the coordinator's isolated two-viewport reproof.

### Coordinator amendment 5 — 2026-09-10

The separately authorized synthetic authenticated S87 receipt completed: each of
`/private/tmp/harmonic-404-auth-1280x720.log` and
`/private/tmp/harmonic-404-auth-1440x900.log` reports `1 executed · 0 failed ·
0 deferred · 1 selected`. Its dedicated no-fetch token server and copied store
were cleaned up. This records an executed S87 proof only; it changes neither
S87's function nor any other story's status.

The completed synthetic probes at
`/private/tmp/harmonic-404-new-report-evidence/probe.log` and
`geometry-probe.log` exposed the two previously unrepresented behaviors above.
S106 and S107 are now registered permanent fail-first stories with manufactured
case recipes. Their first browser receipts reached feature failures at both sizes; corrected receipts are recorded in the #404 freeze header.
The recorded defects are not waived and this amendment makes no revised-surface
pass claim.

### Coordinator amendment 6 — 2026-09-10

The first dedicated S106/S107 receipts at
`/private/tmp/harmonic-404-new-stories-1280x720.log` and
`/private/tmp/harmonic-404-new-stories-1440x900.log` reached their feature
assertions at both sizes and failed there. They reported `0 executed · 2 failed
· 0 deferred · 2 selected` followed by the runner's retained fatal zero-executed
summary; that accounting is not changed by this amendment. The receipts exposed
only evidence defects: S107 read the post-drill All charts action as Close and
clipped overflow-visible row ink, while S106 posed an invalid categorical marker
y-coordinate. The corrected contracts await coordinator reproof; no product or
application behavior is changed.

### Coordinator amendment 2 — 2026-09-10

The second run reached the intended S102 and S104 assertions at both locked sizes
and S103's return-window assertion at 1280x720. Those proofs and S105's original
proof remain accepted. S101 at both sizes and S103 at 1440x900 instead timed out
waiting for the drawn chip; those are still setup failures.

Their shared drawing setup now seeds Afternoon's interior brace, waits for fonts,
finite animations and stable plot/grip boxes, then measures its two known edges.
It resizes the end to 21:30 and the start to 15:30 through the public grips and
the app's snap path. Each snapped chip must appear before pointer release, which
otherwise cancels a queued drag repaint. Each chip wait is bounded to seven
seconds and reports the text seen or its absence. The feature assertions and
all other stories are unchanged. Node checks cover two manufactured chart widths
and failed-chip diagnostics; the coordinator still owns browser reproof.

### #404 revise amendment — 2026-09-11

The shipped surface proves compact Filter/Window parity including named Findings
loading, served selected Pattern trace/markers, exact record doors, readable v2
paths, and backend-withheld Focus parent context. The operator requested Filter
match the resized Window controls. This frozen historical prose remains baseline
evidence rather than a replacement lock.

## Added retirement — 2026-09-21, issue #416

The desk is the only shell, served at the root page, and v1 is retired outright
(ADR 416). Two stories asserted the old address and no others do, so exactly two
change here.

S86 is amended, not weakened: it asserted that Python served `/v2/` and
`/v2/assets/`; it now asserts the same delivery at `/`, the three page paths and
`/assets/`. Every other assertion it carries — no Node runtime, no CDN, the
shell's revalidating cache policy, the assets' immutable one, and the closed
non-API route set — is unchanged.

S87 asserted that v1 and `/v2/` coexisted. That premise is what ADR 416 removed,
so the story is retired rather than rewritten, and its retirement carries the
proof that the premise is gone.

```
R19 · No retired address is served, and none is redirected: every old v1 page
      path and every /v2/... path answers 404.
  predecessor: S87
  lock:     HV2-02
  verdict:  retired
  sanction: Connor Griffin · 2026-09-21 · "Kill all the V1 stuff."
  premise:  the desk itself still answers at / and at its three page paths, so
            the 404s below are a closed route set rather than a dead server
  replay:   fn R19 requests each retired address through the served app, asserts
            404 with no redirect for every one, asserts the desk's own pages
            still answer 200, and prints the sanction
  status:   owed by the build — no passing result recorded
```

## #425 amendment — 2026-09-23, issue #425

Sanction: Connor Griffin (operator, repo owner), 2026-09-23, answered "Q1 A,
Q2 A, defaults all fine, go"; Q2 A is the operator's dated sanction for every
shipped-surface revision and behavior-ledger amendment the #422–#434
checklists call for.

Day's rail printed "N recorded days · <first day> to <last day>" with N counted
from whichever month reads the desk had loaded, so paging the Month calendar
grew it over an unchanged span. Each month read carries a week of its
neighbours, and a month's head counted the neighbour's overlapping week again
once that neighbour was read. The status read now serves the history's
recorded-day count (`data_day_count`), the rail prints it, and the desk merges
its loaded month reads to one row per day before the ribbon, the month grid,
its head or recorded-day stepping reads them (ADR 425 in
`openspec/changes/day-recorded-days-count/design.md`).

S127 is added. No inherited story is amended, weakened or retired: S64 and S65
still drive the month toggle and stepping, and none of S62–S67 asserted a
count. S127 is app-opener-only, like S104; browser execution belongs to the
coordinator at 1280x720 and 1440x900.

```
S127 · Day's rail count is the served number of recorded days in the whole
       history, unchanged by paging the Month calendar; each month's head
       counts its own recorded days once, never a loaded neighbour's
       overlapping week, and reads the same before and after that neighbour
       is loaded.
  element:  .gf-stage-day .instrument .meta; .gf-month-toggle;
            [data-day="prev-month"], [data-day="next-month"];
            .gf-nav-month-head .meta; .gf-nav-cell[data-pick]
  source:   frontend/day.js loadBounds / joinDays / dayFrame / monthGrid;
            ciq_autotune/api.py status_endpoint (data_day_count)
  lock:     nearest HV2-13; S64/S65 cover toggling and stepping, not the count
  data:     showcase; arrives on its latest recorded day, opens the Month
            calendar, pages to the earlier recorded month and back
  evidence: C4_STORIES.S127; reads the rail's count on arrival, then after
            each paged month's own cells land requires the rail's count
            unchanged and the shown month's head equal to its recorded
            (enabled) cells, and the arrival month's head equal to its first
            reading; only then compares the rail's count with the served
            /api/status data_day_count, so an app counting loaded rows fails on
            the count moving, not only on the field it lacks
  status:   base a4d374a7 with the #425 harness laid over fails at its
            feature assertion at both sizes ("S127 loading May 2024 must not
            move the rail's recorded-day count", 42 !== 30; 0 executed,
            1 failed of 1 selected); branch 62c8aa84 passes at both sizes
            (1 executed, 0 failed); coordinator-run 2026-09-23
```

## #427 amendment — 2026-09-23, issue #427

S133 records the shipped rule that the topbar's Day reopens the day last looked
at (ADR 427, in `openspec/changes/day-held-day-viewed-stamp/design.md`). It is
app-opener-only, like S113–S117. Browser execution belongs to whoever can launch
a browser, at 1280x720 and 1440x900; a sandboxed worker never runs it. No
inherited story is weakened, amended or retired.

Sanction: Connor Griffin, 2026-09-23, answered "Q2 A" to: "Can your reply here
count as sign-off for the UI copy and tone changes? … Yes. I record your answer
as the approval for every change these 13 checklists call for, and write the
wording in CONTEXT.md terms."

```
S133 · Direct Day entry reopens the day last looked at. After a selected
       occurrence's "Open <date> in Day" opens a recorded day earlier than the
       latest, a visit to Diagnose, then Changes, then the topbar's Day shows
       that same day, with no Opened from and no return, at the plain /day
       address; a reload opens the latest recorded day.
  element:  nav.v2-nav [data-destination]; #level .case-occurrence;
            .occ-foot button:last-child;
            .gf-nav-col[aria-pressed="true"][data-pick]; [data-day="latest"];
            absence of [data-day="return"]
  source:   frontend/day.js adopt / settle
  lock:     HV2-13; ADR 427
  data:     showcase (35 recorded days, 2024-05-20 to 2024-06-30)
  evidence: C2_STORIES.S133
  status:   replays done; renders owed at integration. It records shipped
            behavior, so it is not a fail-first obligation. The held-day Node
            test in frontend/day.test.js, failed against a deliberately broken
            direct entry, carries non-vacuity. Coordinator-run 2026-09-23 on
            330027ac: branch ONLY=S60,S133 passed at 1280x720 and 1440x900
            (executed 2 · failed 0 at each size); base a4d374a7 with this
            branch's harness passed ONLY=S133 at 1280x720, as expected.
```

## #429 amendment — 2026-09-23, issue #429

The watch dock at the foot of the Diagnose inspector named Verify, the v1
surface #416 retired, for a watched Trial and a watched Focus. S139 and S140 pin
its words and where its link lands (ADR 429 in
`openspec/changes/watch-dock-changes-destination/design.md`). No existing story
is amended or retired. Both are app-opener-only, like S113–S117; browser
execution belongs to the release coordinator at 1280x720 and 1440x900.

Sanction:
- The label and destination fall within ADR 397's sanctioned destination-copy
  amendments (the operator's D3, 2026-09-23).
- Connor Griffin's standing sanction for this release, 2026-09-23, answering
  "Can your reply here count as sign-off for the UI copy and tone changes?":
  "Q1 A, Q2 A, defaults all fine, go".

The pinned inventory in `acceptance.py` `inventory()` moves to 149 issued · 130
active · 19 retired. The frozen header above and ACCEPTANCE.md's count sentence
are reconciled once, by the release coordinator, on the integration branch.

```
S139 · A watched Trial's dock offers "Open Changes ›" and names Verify
       nowhere; activating it lands on Changes at /changes?subject=watch,
       showing the served Trial's own view, titled for its slot.
  element:  .inspector > .watch, .inspector > .watch .go; .gf-stage-trial .gf-title
  source:   frontend/watched-change-dock.js watchDockView / paintWatchDock;
            frontend/diagnose.js go; frontend/changes.js mount (the watch arrival)
  lock:     HV2-12
  data:     c3-trial; the server serves an active Trial
  evidence: C4_STORIES.S139 → watchDock429; reads /api/verify/trials and
            requires the active Trial and its one served change's slot as
            premises, opens Diagnose, requires the dock's watched state, its
            link text exactly "Open Changes ›" and no "Verify" in its text,
            activates the link, requires the address to parse (parseRoute) to
            Changes with subject watch, and requires .gf-stage-trial visible
            with its title carrying the admitted slot
  status:   replays done; dock renders owed at integration. Base a4d374a7
            with this harness laid over it fails at its label assertion at
            both sizes ("saw [ 'Open Verify ›' ]; S139 the dock's link must
            read "Open Changes ›""); branch f57cf730 passes at both sizes
            (1280x720 and 1440x900); coordinator-run 2026-09-23. Raw logs land
            in docs/scope/release-422-434-evidence/429/ on the integration branch
```

```
S140 · A watched Focus's dock reads "Pinned ‹MM-DD› · adherence and outcome
       are read in Changes" for its served pin date, offers "Open Changes ›"
       and names Verify nowhere; activating it lands on Changes at
       /changes?subject=watch, showing the served Focus's own view.
  element:  .inspector > .watch, .inspector > .watch .how, .inspector > .watch .go;
            .gf-stage-focus
  source:   frontend/watched-change-dock.js watchDockView / paintWatchDock;
            frontend/diagnose.js go; frontend/changes.js mount (the watch arrival)
  lock:     HV2-12
  data:     c3-focus; the server serves an active Focus
  evidence: C4_STORIES.S140 → watchDock429; reads /api/verify/trials and
            requires the active Focus and its served pin date as premises,
            opens Diagnose, requires the dock's watched state, its link text
            exactly "Open Changes ›", its detail line for that date and no
            "Verify" in its text, activates the link, requires the address to
            parse (parseRoute) to Changes with subject watch, and requires
            .gf-stage-focus visible
  status:   replays done; dock renders owed at integration. Base a4d374a7
            with this harness laid over it fails at its label assertion at
            both sizes ("saw [ 'Open Verify ›' ]; S140 the dock's link must
            read "Open Changes ›""); branch f57cf730 passes at both sizes
            (1280x720 and 1440x900); coordinator-run 2026-09-23. Raw logs land
            in docs/scope/release-422-434-evidence/429/ on the integration branch
```

## #430 amendment — 2026-09-23, issue #430

Sanction: Connor Griffin, 2026-09-23, "Q1 A, Q2 A, defaults all fine, go" —
the standing approval for every change the release's 13 checklists call for
("I record your answer as the approval for every change these 13 checklists
call for"). This section changes shipped desk behavior on that sanction only.
The decision is ADR 430 in `openspec/changes/open-record-comparison/design.md`.

Base a4d374a72c8048d9d93ee4925805b91cf5674835. Safe start is unchanged:
AGENTS.md's QA copy-then-serve command
(`uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`)
over a committed synthetic `scripts/qa_e2e_cases.py` case store — c3-trial,
edit-chain and c4-missing here, each through `CASE_STORE_DIR`. No real data is
read. The worker ran no server and no browser; every replay below is the
coordinator's.

Changed shipped behavior:

- **An open record opens on its comparison.** A change record with no saved
  ending makes its record read, then its retained-context reassessment read,
  with no assessment control pressed, and renders with Retained context
  selected. An ended record still opens on its saved ending and requests
  nothing more. The loading frame reads "Reading change records", then
  "Computing reassessment". A reader's press holds until another record opens.
- **The record figure says why it is empty.** It classifies from its clock
  bins first and draws a paired or Before-only curve whenever one is served,
  even under a served unavailable state. With no curve it names one of four
  states — no comparison read, a saved ending that kept no curve, unavailable
  with the reason in words, or no Before readings — mounts no chart and prints
  no half-hours count.
- **One vocabulary for comparison reasons.** The figure, the readiness
  availability lines and the reassessment result line print a served reason in
  the same words, never its code.
- **"First seen" reads "Recorded by Harmonic"**, apart from the stage's
  Detected time.
- **A failed reassessment read stays on its record** (coordinator ruling, #430
  review round 1). The base replaced the whole record with "Evidence
  unavailable · The change records could not load" when a reassessment read
  failed. Now the record and the read it already showed stay on screen, and the
  stage names the failed read ("The retained-context reassessment could not
  load: …") with a "Retry reassessment" control that re-sends that read alone.
  A failed record or roster read keeps the destination's failure frame. Proved
  through `mount` in `frontend/follow-up-lifecycle.test.js`; no replay story
  asserts it.

S142 and S143 are new app-opener-only stories under HV2-28. Two stories are
amended in prose below; no story is retired.

```
S142 · Opening a still-open record from the Changes roster reads its
       retained-context comparison with no assessment control pressed: the
       record shows both evidence periods and a paired Before/Trial figure
       with its chart mounted, Retained context reads as selected, and the
       saved-ending part still says the change is still open.
  element:  table.gf-table [data-record], [data-period], [data-figure-state],
            [data-assessment="retained"], [data-unavailable="ending"]
  source:   frontend/history.js mount / loadRecord / loadReassessment;
            frontend/follow-up.js evidenceFigure
  lock:     HV2-28; ADR 430 (openspec/changes/open-record-comparison/design.md)
  data:     c3-trial; its one retained Trial is still open, and its retained
            comparison is available with a clock bin both periods serve
  evidence: C4_STORIES.S142; records every assessment read the roster press
            makes, then reads both periods, the paired figure and its canvas,
            the pressed assessment and the ending part
  status:   base a4d374a7 (with the branch harness) fails at its feature
            assertion at both sizes ("S142 opening a still-open record must
            request its retained comparison once, with no control pressed");
            branch f1484547 and fix head 5002272e pass at 1280x720 and
            1440x900; coordinator-run 2026-09-23. Raw logs 430-base-4-*.log,
            430-branch-4-*.log and 430b-branch-4-*.log, kept with the release
            evidence (docs/scope/release-422-434-evidence/430/)
```

```
S143 · Opening a still-open record whose retained comparison is served
       unavailable with no clock envelope shows an unavailable figure that
       names the reason in words — never the served code, and the same words
       the reassessment result line prints — with no chart and none of "no
       clock envelope is retained", "no readings yet" or "0 → 0 half-hours
       read" on the stage.
  element:  [data-figure-state="unavailable"], [data-figure-reason],
            [data-reassessment-state], .gf-stage
  source:   frontend/follow-up.js evidenceFigure / comparisonReasonWords;
            frontend/history.js reassessmentSection
  lock:     HV2-28; ADR 430
  data:     edit-chain; every retained record is still open and its retained
            comparison is served unavailable (missing_comparison_context)
  evidence: C4_STORIES.S143; reads the served reason code from the API, opens
            the record by its roster press, and compares the figure's reason
            with the code and with the result line's words
  status:   base a4d374a7 (with the branch harness) fails at its feature
            assertion at both sizes ("S143 the figure must read as an
            unavailable comparison"; no figure state on base); branch
            f1484547 and fix head 5002272e pass at 1280x720 and 1440x900;
            coordinator-run 2026-09-23. Raw logs as S142's
```

Amended S112 · 2026-09-23 · ADR 430, on the sanction above: The roster read, the record read and the retained reassessment read the open record then makes on its own, with no control pressed, each show their own named loading frame while pending — "Reading change records" for the first two and "Computing reassessment" for the third. `C4_STORIES.S112` holds the record read, installs the reassessment hold before releasing it, reads "Computing reassessment" with no press, then releases it and waits for the retained reassessment part. Its data stays edit-chain, whose open records serve an unavailable retained comparison. Recorded 2026-09-23 (coordinator-run, both sizes): base a4d374a7 with the branch harness fails at "S112 held reassessment read, requested with no control pressed"; f1484547 and 5002272e pass.
The preceding wording and results are the attributed pre-amendment record.

Amended S49 · 2026-09-23 · ADR 430, on the sanction above: The story's text is unchanged. Its c4 part still opens c4-missing's open Trial through the `retained()` helper, but no longer finds the served unavailable code in the reading pane: the code (read from the API, as before) must be absent from `.gf-reading`, and the reason after "Unavailable · " on the reassessment result line must be non-empty and appear in the readiness availability line too. The replay checks the words through the rendered page and imports nothing new. Recorded 2026-09-23 (coordinator-run, both sizes): base a4d374a7 with the branch harness fails at "S49 the reading pane must name the unavailable reason in words, never its served code" (it printed `Unavailable · no_readable_period_evidence`); f1484547 and 5002272e pass.
The preceding wording and results are the attributed pre-amendment record.

Every other desk replay and test that opens a record or reads the figure was
re-read for intent, and each keeps its subject:

- **S96 and S105** open ended records, so they make the Original read alone;
  S96's Retained context and Current policy presses still each read their
  reassessment.
- **S110** opens an open edit-chain record and waits for the original part,
  which now renders after the retained read as well; its address and reload
  assertions are unchanged.
- **The c4 `retained()` helper** (S91's c4 cases and the readiness stories)
  presses a Retained context that is already selected. The press keeps the
  shown reassessment and requests nothing, and the helper's wait is unchanged.
- **S50**, both the c3 body and the desk replay's own, pins the active Trial
  legend; `paired` and `before-only` keep "Trial above Before" and "no Trial
  readings to compare yet".
- **R18** opens c4-history's first Trial and first Focus by address and waits
  up to 30 s for the original part. The Trial is open, so it now also makes
  the retained read (served unavailable with clock views and no bins, so the
  figure reads no-readings); the in-process read took under a second. The
  Focus is ended.
- **The c3 record openers** (S54, S54b, S92's finished record, S95 and the
  preempted Focus) all open ended records. S92 counts the figure container,
  which still renders on a saved ending.
- **The desk browser suite's expired-record test** opens an ended record
  whose saved ending is a bare unavailable assessment, so its figure reads
  unavailable ("not recorded"); its Later conclusion assertions are unchanged.

Additional handler inventory for this amendment:

| Handler / registration | Source | Story |
|---|---|---|
| Record press: record read, then retained read with no control pressed | frontend/history.js | S142, S112 |
| Record figure state, reason words and result line | frontend/follow-up.js, history.js | S143, S49 |
| Retry reassessment after a failed reassessment read | frontend/history.js | none — node test only (see above) |

The ledger header's inventory line, `ACCEPTANCE.md`'s count sentence,
`mockups/INDEX.md`'s row and the release freeze block are the coordinator's,
written once on the integration branch. `acceptance.py`'s pinned inventory
moves to 149 issued · 130 active · 19 retired on this branch.

## #433 amendment — 2026-09-23, issue #433

S151–S153 are the fail-first obligations of ADR 433 (the pinned change
`openspec/changes/basal-strip-short-window/`): the basal lane stays within reach
on short and narrow desktop windows, every raise and lower slot can be pointed
at and staged there, and every key verdict agrees with its slot's panel. S113 is
amended for the recurring-lows key word (operator decision D6) and for the
canvas pane's at-rest checks. All four are app-opener-only, like S101–S117.
Browser execution belongs to the coordinator at 1280x720 and 1440x900; the
ticket worker binds no port.

### #433 sanctioned changes to shipped desk behavior — 2026-09-23

Sanction: Connor Griffin · 2026-09-23 · "Q1 A, Q2 A, defaults all fine, go" —
the release's standing Q2 sanction for every shipped-surface revision and
behavior-ledger amendment the 13 issue checklists call for. It covers three
changes:

- On a desktop split window too short for the canvas pane's row floors, the
  pane scrolls vertically, where it used to clip the basal lane out of reach.
- Near the narrowest split, the lane key wraps between whole entries, where it
  used to cut its last entries off at the pane's edge. The lane's cells and the
  glucose chart above them come back inside the pane with it.
- The key moves a recurring-lows lower out of "lower" into
  "lower · recurring lows" (D6, same date).

No shipped behavior is retired. At 1280x720 and 1440x900 nothing moves: the
pane has no scroll range there and the key stays on one line, which S113's
amendment asserts.

```
S151 · At three desktop split windows — 1200×736, 1200×560 and 832×560 —
       the basal lane stays within reach: every key entry, every
       cell and the glucose chart lie horizontally inside the canvas pane at
       rest; the lane, its key, every entry and every cell lie inside the
       pane's visible box vertically, at rest or once the reader wheels the
       pane; no key entry splits over lines; the document never scrolls, the
       pane never scrolls sideways, and no other container moves.
  element:  .canvas-pane, #canvas-head, #lane-wrap, #lane-key > span,
            #lane > .lane-cell, #chart
  source:   frontend/diagnose-workstation.css .canvas-pane / .lane-key (the
            ADR 433 `min-width: 832px` block)
  lock:     HV2-17
  data:     basal-verdict-gallery (the case S113 uses)
  evidence: C4_STORIES.S151 → assertBasalLaneReachable; after `openBasalLane`,
            sets each size with page.setViewportSize, reads the pane and lane
            geometry at rest, wheels the mouse over the pane's header rail
            until the lane is in reach or the pane stops moving (it never sets
            a scroll offset and never scrolls anything into view by script),
            wheels back, and restores the run's size even when checks failed.
            It records every failure by size and axis with the measured
            overrun, then fails once, listing them all
  status:   base a4d374a7, with the 7ffa57b9 harness laid over it, fails at
            its feature assertion at both sizes with one message listing 13
            failures: the 44px vertical clip at 1200×560 and at 832×560 (the
            pane cannot scroll; after wheeling, the key is still 17px and the
            cells up to 36px out of reach) and, at 832×560, the "no data 44"
            key entry and 7 cells 58.75px and #chart 110.75px past the pane's
            right edge. Branch 7ffa57b9 passes at both sizes. Coordinator-run
            2026-09-23; raw logs for docs/scope/release-422-434-evidence/433/
```

```
S152 · On the same three split windows, every cell the key counts as raise or
       lower is reached the way S151 reaches the lane, pointed at with the
       mouse in the centre of the part the reader sees, and selected; it opens
       its panel with a Recommended value and the Stage change button, and
       still lies inside the canvas pane's visible box once picked.
  element:  #lane > .lane-cell[data-verdict="up"], [data-verdict="down"],
            #level .slot-head, #level .numrow, #level .stagebtn
  source:   frontend/diagnose-workstation.js renderLane / renderSlotLevel;
            frontend/diagnose-workstation.css (the ADR 433 block)
  lock:     HV2-17
  data:     basal-verdict-gallery
  evidence: C4_STORIES.S152; per size and per raise or lower cell, wheels the
            pane over its header rail until the cell lies inside the pane's
            visible box and the viewport, clicks with page.mouse.click at the
            centre of the cell's visible part (never a locator click, which
            would scroll it into view), then reads the cell's aria-pressed,
            the opened panel's slot time, Recommended value and Stage change
            button, and the cell's box again; restores the run's size
  status:   base a4d374a7, with the 7ffa57b9 harness laid over it, passes
            1200×736 and fails at 1200×560 at both sizes ("00:00 basal slot,
            suggests a raise" still overruns the canvas pane's visible box by
            36px after wheeling the pane). Branch 7ffa57b9 passes at both
            sizes. Coordinator-run 2026-09-23; raw logs as S151's
```

```
S153 · Every slot the key counts as raise or lower opens a panel with a
       Recommended value and the Stage change button; every slot it counts as
       hold, insufficient or no data opens a panel that says no direction is
       asserted and offers no Stage change button.
  element:  #lane > .lane-cell, #level .slot-head, #level .numrow,
            #level .stagebtn
  source:   frontend/diagnose-workstation.js renderLane / renderSlotLevel
  lock:     HV2-17
  data:     basal-verdict-gallery
  evidence: C4_STORIES.S153; at the run's size, opens each of the 48 cells
            once, waits for the panel's slot time to name that cell's half
            hour, then reads its Recommended value, its Stage change buttons
            and its text against the cell's served verdict
  status:   passes on base a4d374a7 with the 7ffa57b9 harness laid over it
            and on branch 7ffa57b9, at both sizes, as expected: it needs no
            application change. Coordinator-run 2026-09-23; raw logs as S151's
```

Amended S113 · 2026-09-23 · #433 / Q2 sanction (Connor Griffin · 2026-09-23 · "Q1 A, Q2 A, defaults all fine, go"): At the run's own size (1280x720 or 1440x900), `#lane-wrap` and every `#lane-key > span` entry stand wholly inside `.canvas-pane`'s visible box at rest, the key stands on one line (every entry shares the lead entry's top), and the pane has no scroll range. Each key count and paint check is scoped to one key entry, its verdict plus its served reason, so every count stays exact on any lane. A variant on `basal-recurring-low-no-clean-median` (scripts/qa_e2e_cases.py: a 05:00 recurring-lows lower with no steady nights) requires the key to read "lower · recurring lows 1" with no "lower" entry, the 05:00 cell to keep the lower paint token and glyph its key mark shares, its accessible name to say the lower comes from recurring lows, and its panel to read "lower (recurring lows)" with a Recommended value and the Stage change button. S113 stays the one story on that store, so the fixed PR slice and its pinned digest are unchanged. Evidence: C4_STORIES.S113 → assertBasalLaneGallery, then, through ctx.withCase, assertRecurringLowsVariant, which opens the 24 h rail and waits for the 48 slots rather than reusing `openBasalLane` (that store's 05:00 slot serves no steady night for it to wait on), then assertRecurringLowsLower; frontend/c4.replay.test.js drives these helpers on fake pages. Old fails / new passes (coordinator-run 2026-09-23; raw logs as S151's): on base a4d374a7 with the 8578895b harness laid over it, S113 passes its gallery part, the new pane checks included, then fails at both sizes at the variant's key word (it reads ["Basal slots","lower 1","no data 47"]); branch 8578895b passes at both sizes ("S113 proved synthetic variant=basal-recurring-low-no-clean-median"). The earlier 7ffa57b9 runs failed on base and branch alike before the key word, at `openBasalLane`'s wait for a steady-night row that store never renders; 8578895b gave the variant its own 24 h rail route.

### #433 handler inventory

| Handler / registration | Source | Story |
|---|---|---|
| `.canvas-pane` vertical scroll (the user agent's; no script handler), wheeled over `#canvas-head` | diagnose-workstation.css, the ADR 433 block | S151, S152 |
| `#lane > button.lane-cell` click, pointed at its visible part on a short window | diagnose-workstation.js renderLane | S152 |
| `#lane > button.lane-cell` click, each of the 48 slots once | diagnose-workstation.js renderLane | S153 |
| `#lane > button.lane-cell[data-reason="recurring-lows"]` click (D6) | diagnose-workstation.js renderLane | S113 |

## #426 amendment — 2026-09-23, issue #426

Day stops printing internal identifiers where a served name exists (ADR 426).
S61 and S62 are amended under Connor Griffin's sanction of 2026-09-23, release
question Q2, answered "A": "I record your answer as the approval for every
change these 13 checklists call for, and write the wording in CONTEXT.md
terms." No story is added or retired, and no ★ FROZEN block, header inventory
line or story body above this section is edited. Browser execution belongs to
the coordinator at 1280x720 and 1440x900; the worker order prohibits serve and
browser execution. On the base app the amended S61 fails: Opened from prints
the routing subject `finding:over_treated_low`, and the over-treated-low row
ends with the desk's own word, not the served Lever name.

Amended S61 · 2026-09-23 · #426 / Q2 sanction: The contextual entry also carries a display title beside its canonical subject, in the address, and its Opened-from section names the subject by that served title (for a selected occurrence, the case file's served finding title), never by the routing subject; no `finding:`, `pattern:` or `basal:` text appears there. Given the Day's served model read carries at least one attributed episode and the Episode Log renders a row of one (a premise that fails loudly), each row of an attributed episode ends with that episode's served Lever name, and no row prints an underscore token. App body: frontend/c2.replay.mjs S61; fail-first proof: frontend/replay-cases.test.js, "S61 requires Day to name its origin and each attributed row by the served names". Status: replayed-pass on branch 460ab0a2 at 1280x720 and 1440x900 (`ONLY=S61,S62`: executed 2 · failed 0 · deferred 0 · selected 2), coordinator-run 2026-09-23; base a4d374a7 with the branch harness at 1280x720 fails it at the origin assertion (saw Opened from `finding:over_treated_low` and the 13:55 row ending `over-treated low`; executed 1 · failed 1 · selected 2). Before/after renders are owed to the coordinator's integration batch.

Amended S62 · 2026-09-23 · #426 / Q2 sanction: While away, the Day desk names that subject by its served title, no longer verbatim; the return still holds and focuses the exact occurrence held when Day opened. App body: frontend/c2.replay.mjs S62, unchanged. Status: replayed-pass on branch 460ab0a2 at 1280x720 and 1440x900, and on base a4d374a7 with the branch harness at 1280x720, coordinator-run 2026-09-23.

## #434 amendment — 2026-09-23

S154 is the fail-first obligation for the desk's excluded-night reasons, the
served-desk scenario of the pinned change's surfaces requirement ("The basal
evidence names why its nights were excluded", in
`openspec/changes/basal-excluded-night-reasons/specs/surfaces/spec.md`). The
basal analyzer now stamps one reason on every excluded night, and the basal tile
and the basal slot panel name each nonzero reason beside the served total, in
the reader words the second ADR 434 in that change's `design.md` fixes. The full
rail's retired label "excluded — not steady" was asserted by no story in this
ledger, and no story asserted the panel's or the description's exclusion
wording, so no story is amended or retired.

The sanction is Connor Griffin's, 2026-09-23: he answered "Q1 A, Q2 A, defaults
all fine, go" to the question "Can your reply here count as sign-off for the UI
copy and tone changes? … Yes. I record your answer as the approval for every
change these 13 checklists call for, and write the wording in CONTEXT.md
terms." #434's checklist calls for these words and this story.

S154 is app-opener-only, like S113–S117; browser execution belongs to the
coordinator at 1280x720 and 1440x900. The crowded rail and the crowded
middle-rank tally have node-level evidence only (`frontend/diagnose-evidence-charts.test.js`):
no showcase slot serves more than two reasons, so no served desk state can
show them. This section leaves the header's inventory line, every existing
frozen block and `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md` to the
release coordinator.

```
S154 · Opening a basal slot with excluded nights in Diagnose names why they
       were left out: the slot panel's one excluded-night line and the basal
       tile's accessible description each carry the served total and every
       nonzero served reason with its served count, in rank order, in the
       reader words "before the current rate", "low or suspended", "high",
       "insulin on board", "logged carbs" and "other reasons".
  element:  #level .empty; #tile-focal .evidence-tile .tile-chart (aria-label)
  source:   frontend/diagnose-evidence-charts.js excludedNightReasons /
            basalEditorialOption; frontend/diagnose-workstation.js
            renderSlotLevel
  lock:     ADR 434 — the desk names excluded-night reasons in fixed reader
            words (openspec/changes/basal-excluded-night-reasons/design.md)
  data:     the app's own showcase; its 12:30 slot serves three excluded
            nights, 1 insulin_acting and 2 other (the served 30-day payload,
            read in-process through the API test client over a scratch copy
            of the showcase, 2026-09-23)
  evidence: C4_STORIES.S154; opens the 24 h rail, reads the 12:30 night
            evidence and requires its served total of 3 (the premise),
            selects the 12:30 lane cell, requires the panel line "3 excluded
            nights: 1 insulin on board, 2 other reasons" (the feature
            assertion, made before anything reads the served breakdown),
            holds the served breakdown to those pinned counts, then requires
            the focal basal:750 tile's aria-label to carry "3 nights
            excluded: 1 insulin on board, 2 other reasons"
  status:   base a4d374a7 with the 4895f80b harness fails at its feature
            assertion at 1280x720 ("S154 the panel's excluded-night line must
            name each served reason", saw ["3 excluded nights"]); the base run
            at 1440x900 first timed out loading the page under machine load,
            and its low-load re-run at integration fails at the same panel-line
            assertion;
            branch 4895f80b passes at 1280x720 and 1440x900; the desk browser
            suite passed 40 of 40 and the full acceptance.test.py passed;
            coordinator-run 2026-09-23. Raw logs and the before-and-after
            renders are owed to docs/scope/release-422-434-evidence/434/ at
            integration
```

## #428 amendment — 2026-09-23, issue #428

S136–S138 are the fail-first obligations of ADR 428
(`openspec/changes/diagnose-address-after-day-return/design.md`): Diagnose's
address names the case the reader is on. They are app-opener-only, like
S108–S117, and run on the showcase. Browser execution belongs to the
coordinator at 1280x720 and 1440x900; the worker order prohibits serve and
browser execution.

Sanction: Connor Griffin, 2026-09-23, decision D2 — "once the reader acts
inside Diagnose, the address names the case the reader is on. The CSS-selector
`focus` in the address becomes an occurrence id." — under his standing Q2
sanction for this release's checklists: "Yes. I record your answer as the
approval for every change these 13 checklists call for, and write the wording
in CONTEXT.md terms."

Shipped desk behavior that changes, and no story that asserted the old fact:

- **An in-place drill now writes the address.** Whenever the case on screen
  changes inside Diagnose — a rail row, an Occurrence held or stepped, a window
  chosen, a basal slot, a step back — the address is replaced in place with its
  subject, held Occurrence and window, and names no case at Findings. It was
  written only by a destination handoff; the C2 comment on S37b that said so is
  superseded, and no story asserted it.
- **A reload after a drill reopens that case**, in its window when that window
  is a Window preset, instead of #413's cold 24 h Findings arrival. A bare
  `/diagnose` still arrives on 24 h (S117 unchanged). No story reloaded after a
  drill.
- **The Diagnose-origin Day address carries no selector.** It names its return
  target by the held Occurrence's id, and the return lands on that Occurrence's
  Open in Day control, as S62 already asserts. Changes' entry into Diagnose
  drops its `#crumb-trail` focus key, which only named the default.
- **A Day return to the held case, and a plain Diagnose press after a Day
  return, are ADR 414 retained returns**: one status read, the drill kept. S26
  and S62 still hold on the retained path; S108 and S109 are unchanged. By the
  coordinator's review rulings a parked Diagnose is inert — its workstation's
  page-level keys (Backspace, ↑/↓, Escape) act only while Diagnose is on screen
  — so input cannot move the case while another destination holds the surface
  and a return compares its entry with the held entry, as ADR 414 does, while a
  restoration unfinished when Diagnose parks, or a case-file answer already in
  flight, can still leave the held entry disagreeing with the screen and is
  reconciled when the root re-seats: a Day return then re-reads and restores
  its entry, and a plain return names the case on screen.

```
S136 · After a Day return on a Finding case with an Occurrence held, ↓ steps to
       the next Occurrence and the address names it with no focus; choosing a
       window that keeps the case file open re-addresses to the Finding and that
       window with no Day-entry key and no added history entry; Backspace back
       to Findings leaves /diagnose; and a reload lands on Findings.
  element:  #level .case-occurrence[aria-pressed="true"], .occ-foot button,
            [data-day="return"], #seg-window, location
  source:   frontend/diagnose-workstation.js publishCase (paint);
            frontend/diagnose.js caseChanged / mount; frontend/routes.js
            replaceAddress
  lock:     HV2-14 (the contextual Day return); ADR 428
  data:     showcase; finding:over_treated_low at 24 h, the first of a served
            cohort's Occurrences held, opened in Day and returned. The showcase
            serves no Finding at Overnight (its case files answer
            finding_unavailable there), so the window chosen is Afternoon,
            where this Finding stays open re-scoped
  evidence: C4_STORIES.S136; reads the page's own address after ↓, after the
            Afternoon choice (against the Occurrence on screen and
            history.length), after Backspace, and after a reload
  status:   base a4d374a7 with this harness laid over it fails at its feature
            assertion, "S136 ↓ must re-address to the stepped Occurrence" (the
            base address keeps the Day entry's date, moment, lever, from, focus
            and first Occurrence), at 1280x720 and 1440x900; branch 136b9981
            passes at both sizes; coordinator-run 2026-09-23
```

```
S137 · Day return, then Changes, then Diagnose issues exactly one GET
       /api/status and nothing else, keeps the pressed window and the drilled
       case, and the address names that case with no Day-entry key and no from.
  element:  nav.v2-nav [data-destination], .gf-loading, #seg-window
            [aria-pressed="true"], #crumb-trail .here, location
  source:   frontend/diagnose.js mount (ADR 428 point 7, a return naming no case)
  lock:     HV2-34; ADR 414 retention, extended by ADR 428
  data:     showcase; as S136 up to the Day return, then S108's held Changes
            round trip
  evidence: C4_STORIES.S137; heldReturnToDiagnose414 holds /api/status and
            records every request, then compares the crumb, the pressed window
            and the address
  status:   base a4d374a7 with this harness laid over it fails at its feature
            assertion, "S137 the return to Diagnose after a Day return must
            issue no request besides the held status check" (the base compares
            the held Day context with the empty topbar entry and re-reads every
            guidance read), at 1280x720 and 1440x900; branch 136b9981 passes at
            both sizes; coordinator-run 2026-09-23
```

```
S138 · A Finding case with an Occurrence held in a preset window other than
       Overnight: the address names subject, Occurrence and window with no
       focus; a reload reopens it in that window with that Occurrence held;
       Open in Day writes a Day address with no CSS selector; and the return
       makes one status read and focuses that Occurrence's Open in Day control.
  element:  #seg-window, #level .qrow, #level .case-occurrence, .occ-foot
            button:last-child, [data-day="return"], location
  source:   frontend/diagnose.js restoreEntry (preset press, return focus) /
            mount (a Day return to the held case); frontend/diagnose-context.js
            evidenceDayContext
  lock:     HV2-14; ADR 428 points 5, 6 and 8
  data:     showcase; finding:over_treated_low in the Afternoon preset, its
            first roster Occurrence held
  evidence: C4_STORIES.S138; reads the address, reloads and waits for the same
            Occurrence held under a pressed Afternoon, reads the Day address,
            then heldStatusReturn holds /api/status across Return to Diagnose
            and checks document.activeElement
  status:   base a4d374a7 with this harness laid over it fails at its feature
            assertion, "S138 the address must name the Finding, its held
            Occurrence and the Afternoon window" (base drills never write the
            address, which stays /diagnose), at 1280x720 and 1440x900; branch
            136b9981 passes at both sizes; coordinator-run 2026-09-23
```

## #431 amendment — 2026-09-23

Changes now reads the server's one verdict on each recorded Plan (ADR 431,
`openspec/changes/plan-state-one-verdict`). The server confirms a pending Plan
once the latest pump read after its decision holds its schedule. Changes names
the phase, status, actions and Decision block from that verdict, and makes no
pump comparison of its own except to draw a served mismatch's rows. S145 and
S146 are the fail-first obligations for sub-order 2 of that change, and S42 and
S105 are amended under the same sanction. Every one of them runs on the app
opener only. Browser execution belongs to the release coordinator at 1280x720
and 1440x900; the worker order forbids serve and browser runs.

Sanction: Connor Griffin (Q2), 2026-09-23: "Yes. I record your answer as the
approval for every change these 13 checklists call for, and write the wording in
CONTEXT.md terms."

Amended S42 · 2026-09-23 · #431 / Q2 sanction: after the matched capture, the story reads "On pump since" — the server's confirming read — in place of "On pump as of" the latest fetch. It reads the Store's observation from the newest history record, which the served history lists first, not from the last one listed.
The preceding S42 wording and results are the attributed pre-amendment record.

Amended S105 · 2026-09-23 · #431 / Q2 sanction: the premise also asserts that the server confirms the recorded no-op Plan (the newest history row's verdict reads confirmed). Its View change record door now comes from the confirmed frame, not the pending one. Before #431 the base left that Plan unconfirmed, and its door came from the pending branch.
The preceding S105 wording and results are the attributed pre-amendment record.

```
S145 · A pump read that holds a recorded Plan on the unchanged active profile
       confirms it on the server, and Changes reads "✓ On pump since <that
       read>"; a later read that still holds it leaves the named time unchanged.
  element:  .gf-status[data-state="confirmed"], [data-set="record"]
  source:   frontend/plan-view.js planStatus / phase; ciq_autotune/watched_change.py
            reconcile_follow_up (the pump-read confirmation) and with_plan_verdicts
  lock:     HV2-20; ADR 431 (plan-state-one-verdict)
  data:     basal-lower; stage and record the served basal action, then the
            replay pump producer's `in-place` capture (the recorded Plan's
            deliverable on the unchanged active profile, no profile switch, so
            no Trial), then a second `in-place` capture one minute later
  evidence: C4_STORIES.S145; its first confirmation check reads the newest
            history row's `verdict?.state` together with the Changes status in
            one assertion, so a base row serving no verdict fails it rather
            than throwing; then the status must name the served `confirmed_at`,
            and after the second capture the served `confirmed_at` and the
            status are unchanged while the pump read has moved
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved.
            The branch passes on 8a194779 and on 24dff6ca at both sizes. On
            base a4d374a7, with this harness laid over it, it fails at its
            served-verdict and Changes agreement assertion: the base serves no
            verdict and leaves the in-place Plan unconfirmed. Coordinator-run
            2026-09-23
```

```
S146 · A draft saved after a confirmed Plan that differs from the pump reads
       Draft saved, offers Save draft and Record decision, and names the
       confirmed Plan on its own line — never a keying error.
  element:  .gf-stage .gf-kicker, [data-set="save-draft"], [data-set="record"],
            the Decision section's "Previous Plan:" line
  source:   frontend/plan-view.js framePlan / phase / decisionSection / planFrame
  lock:     HV2-20; ADR 431 (plan-state-one-verdict)
  data:     basal-lower; stage and record the served basal action, `in-place`
            capture, then save a draft restoring the source profile's value at
            each recorded slot (a value the store already held, which differs
            from the pump that now holds the Plan)
  evidence: C4_STORIES.S146; premise asserts the newest history row's verdict
            reads confirmed; then the kicker reads Draft saved, no keying-error
            copy shows, both writes are offered, and the line reads "Previous
            Plan: recorded <time>, confirmed on the pump <confirmed_at>."
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: accepted
            premise failure.
            The branch passes on 24dff6ca at both sizes, after f7a90914 moved
            the kicker read from innerText to the <b>'s own text. On base
            a4d374a7, with this harness laid over it, it fails at its accepted
            premise (no server-confirmed Plan). Its fail-first half is
            frontend/plan-actions.test.js "a differing draft after a confirmed
            Plan reads Draft saved and can be recorded". Coordinator-run
            2026-09-23
```

Sub-order 3 of the same change moves the pending-Plan note under the same
sanction. The Diagnose case-file header no longer carries a pending-Plan note
or a Plan route, for any case. Before #431 the note appeared only on
Pattern-linked cases, through the Focus admission's `pending_plan` reason.
The watch panel now carries a recorded Plan awaiting the pump whenever no Trial
or Focus is watched, in every window and case:
- its kind reads "Plan · awaiting pump";
- its title names the setting in the wearer's words and the recorded month and
  day;
- its detail says what the served verdict says;
- its route reads "Open Changes ›" and opens Changes at `subject=plan`, never the
  watched-change address.

Precedence is Trial, Focus, the pending Plan, the staged draft, idle. The
staged draft's route also reads "Open Changes ›", to the same address. A
confirmed Plan holds no panel state. The panel's one-object rule (lock term 47)
is unchanged; the panel gains one state, which is still the only object it
reports.

Every reader of the moved note is updated in the same change: the desk
browser test (its "pending Plan" test at both desktop sizes),
`frontend/focus-entry.test.js`, and S147.

```
S147 · With a Plan pending, a Pattern case's header carries no pending-Plan
       note in either of two windows, and the watch panel reads the same
       "Plan · awaiting pump" state in both; "Open Changes ›" lands on Changes
       at subject=plan.
  element:  header.crumb [data-focus-context], [data-focus-reason],
            [data-start-focus]; .inspector > .watch (.kind, .what, .how, .go)
  source:   frontend/focus-entry.js contextForCase; frontend/watched-change-dock.js
            watchDockView; frontend/diagnose-workstation.js paintWatch;
            frontend/diagnose.js read (one repaint after the Focus/guidance read)
  lock:     HV2-20; ADR 431 (plan-state-one-verdict); lock term 47
  data:     pattern-near-tie; record a Plan from the served basal action through
            the routes (as S105 does), then a fresh Diagnose arrival;
            pattern:highs_after_meals is served, loads with occurrences and is
            its own Pattern parent in both the 24 h and Evening windows. The
            order named basal-lower, but every basal-lower Pattern case file
            answers 404 ("Finding has no inspectable member"), so no case there
            ever reaches a header note and its base proof could not fail at the
            header.
  evidence: C4_STORIES.S147; waits for the Focus and guidance reads, then in
            each window drills the Pattern from the rail, waits for its
            occurrences (the case read settles the header first), reads the
            header, and returns to the rail by the Findings crumb (a Window
            press on a drilled case re-scopes it rather than listing the rail);
            only then reads the watch panel in each window and presses Open
            Changes
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved.
            The branch passes on 24dff6ca at both sizes. On base a4d374a7, with
            this harness laid over it, it fails at the header check, "S147 no
            case-file header may carry a pending-Plan note
            (pattern:highs_after_meals in 24 h and Evening)", with note: 2 in
            24 h. Coordinator-run 2026-09-23
```

## #424 amendment — 2026-09-23, issue #424

S124–S126 are the fail-first obligations of the #424 case-file counts revision:
the Response comparison caption on a same-population and on a cross-population
case file, and a folded cause's share of its Pattern. They are the added surfaces
requirements of the pinned change `openspec/changes/highs-after-meals-counts`.
Like S113–S117 they are app-opener-only, and each runs on a named manufactured
case store. Browser execution belongs to the release coordinator at 1280x720 and
1440x900. S115's fold lines are amended below; no story is retired, and no story
asserts the claimed-state words, which #423 owns.

Sanction: Connor Griffin, 2026-09-23, in the release coordinator session, answered
"Q1 A, Q2 A, defaults all fine, go" to "Can your reply here count as sign-off for
the UI copy and tone changes?", recorded in the pinned `proposal.md` as the
approval for every change the #424 checklist calls for.

Safe start is unchanged: AGENTS.md's QA copy-then-serve command, with the named
case store.

Amended S115 · 2026-09-23 · #424 / Q2 sanction: Connor Griffin, 2026-09-23, "Q1 A, Q2 A, defaults all fine, go" (quoted in openspec/changes/highs-after-meals-counts/proposal.md). A folded member line is read from its served `fold_sentences`, not its `count_sentences`: its share of the Pattern's count (scope `pattern`) beside its name on one line, and every sentence served as outside the Pattern's count set apart behind "outside the count"; under a Pattern that serves no count the line leads with those words. Still no outcome word, never merged, never a sibling row; the toggle, its arrival states, the tier urgency and the Pattern's own row are unchanged. The replay checks every folded member's served `fold_sentences` before reading a line (C4_STORIES.S115 → assertServedFold424, assertFoldLine424). S115's original text above stays as frozen. Coordinator-run 2026-09-23: branch 5b7a4bc6 passes at 1280x720 and 1440x900; base a4d374a7, with the 5b7a4bc6 replay harness laid over it, fails at its served-fold check ("S115 every folded cause must serve its fold sentences") at both sizes, which is informational.

```
S124 · On a same-population event case file the Response comparison caption
       names every served cohort by its served name and served count, in served
       order, each matching its section heading; it follows Matched with the
       band's words for Meets criteria and Nearly matched with Borderline, once
       each; its counts add up to the header denominator; it prints nothing
       outside the comparison; and no visible count but the band's no-data count
       reads "not comparable".
  element:  #level .lvl-cap .meta, #level .ev-group, #level .vband .key,
            #level .vband-foot, #level .statline
  source:   frontend/diagnose-workstation.js renderEventComparisonRoster /
            renderVerdictBand
  lock:     HV2-18 (the cohort names, unchanged); #424 Q2 sanction for the caption
  data:     behavioral-carb-undercount (scripts/qa_e2e_cases.py QaCase): Highs
            after meals over 6 meals, with Matched, Nearly matched and Other meal
            opportunities cohorts and one no-data meal; every number is read from
            the served case file at run time
  evidence: C4_STORIES.S124; opens pattern:highs_after_meals from the rail
            (`openComparisonCase`), first requires the served case file to carry
            `outside_comparison` and every cohort's `band_verdict`
            (assertServedComparison424), then reads the rendered caption, cohort
            headings, band keys, band foot and header (comparisonView424),
            compares them with the served cohorts, counts and verdict counts
            (assertComparisonCaption424), and sums the caption's counts against
            the header denominator
  status:   base a4d374a7, with the 5b7a4bc6 replay harness laid over it,
            fails at its served-data check at both sizes ("S124 the case file
            must serve its count outside the comparison and each cohort's band
            state"); branch 5b7a4bc6 passes at both sizes (S115 and S124–S126
            selected: 4 executed, 0 failed at each size); coordinator-run
            2026-09-23. Captures: docs/scope/release-422-434-evidence/424/
```

```
S125 · On the cross-population Missed / unannounced meal case file the caption
       names every served cohort as its section heading does, prints the served
       Highs outside the comparison in those words, links no band word to the
       attributed Matched cohort, and labels no count "not comparable"; the
       band's no-data count keeps "not comparable".
  element:  #level .lvl-cap .meta, #level .ev-group, #level .vband .key,
            #level .vband-foot
  source:   frontend/diagnose-workstation.js renderEventComparisonRoster /
            renderVerdictBand
  lock:     HV2-18 (the cohort names, unchanged); ADR 180's cross-population
            comparison; #424 Q2 sanction for the caption
  data:     behavioral-missed-meal (scripts/qa_e2e_cases.py QaCase): Missed /
            unannounced meal over 6 Highs compared against announced meals, with
            Highs outside the comparison and one no-data High
  evidence: C4_STORIES.S125; opens finding:missed_meal from the rail
            (`openComparisonCase`), first requires the served case file's new
            fields (assertServedComparison424), then requires the served
            comparison to be cross-population, with a non-zero count outside it and
            a no-data High, and compares the rendered caption, headings, band keys
            and band foot with them (assertComparisonCaption424)
  status:   base a4d374a7, with the 5b7a4bc6 replay harness laid over it,
            fails at its served-data check at both sizes ("S125 the case file
            must serve its count outside the comparison and each cohort's band
            state"); branch 5b7a4bc6 passes at both sizes (S115 and S124–S126
            selected: 4 executed, 0 failed at each size); coordinator-run
            2026-09-23. Captures: docs/scope/release-422-434-evidence/424/
```

```
S126 · Under a Pattern that serves a count, the open fold prints each folded
       cause's share of that count, on the Pattern's own denominator and noun,
       beside its name, and its counts on any other family behind "outside the
       count"; Correction stacking reads its share of Lows after correcting highs
       first and its correction-cluster count outside; the cause lines' shares
       add up to the Pattern's served count; no outcome word prints.
  element:  .qitem.member .qmember .den, .qmember .out
  source:   frontend/diagnose-findings-queue.js queueRows / paintMember;
            frontend/diagnose-workstation.css .qmember .out
  lock:     #413 design lock (the fold's structure, unchanged); #424 Q2 sanction
            for the share-first line
  data:     behavioral-correction-stacking (scripts/qa_e2e_cases.py QaCase): Lows
            after correcting highs counts its lows and folds Correction stacking,
            whose own count is on correction clusters
  evidence: C4_STORIES.S126; reads the served preparation, requires every
            folded cause to serve `fold_sentences` (assertServedFold424) and
            Correction stacking to lead with its share, opens the fold, reads each
            line's share and outside rows (foldLines424) against its served fold
            sentences (assertFoldLine424), and sums the rendered shares against
            the Pattern's served count sentence
  status:   base a4d374a7, with the 5b7a4bc6 replay harness laid over it,
            fails at its served-data check at both sizes ("S126 every folded
            cause must serve its fold sentences"); branch 5b7a4bc6 passes at
            both sizes (S115 and S124–S126 selected: 4 executed, 0 failed at
            each size); coordinator-run 2026-09-23. Captures:
            docs/scope/release-422-434-evidence/424/
```

S125 and S126 run on case stores no other story covers, so they join the fixed PR
smoke slice (`SMOKE_STORIES` in `mockups/sweep/harmonic-v2-desktop/acceptance.py`);
S124's `behavioral-carb-undercount` is already covered by R8. The replay driver's
pinned inventory literals move to 150 issued · 131 active · 19 retired on this
branch. This ledger's header inventory line, `ACCEPTANCE.md`'s count sentence and
`mockups/INDEX.md`'s counts are the release coordinator's, written once across the
release.

## #423 amendment — 2026-09-23, issue #423

Sanction: Connor Griffin, 2026-09-23, in the release coordinator session,
answered "Q1 A, Q2 A, defaults all fine, go". Q2 asked: "Can your reply here
count as sign-off for the UI copy and tone changes? … Yes. I record your answer
as the approval for every change these 13 checklists call for, and write the
wording in CONTEXT.md terms." That answer is the dated sanction for this
shipped-surface revision and for the desk behavior-ledger amendment #423's
checklist calls for. It does not sanction anything outside #423's checklist.

The Day Episode Log showed an outranked anchor four wrong ways: its tier word was
the raw engine state, its row named only the episode's Lever, it painted in the
warning hue whatever its severity, and the Findings caption counted rows. The
bands themselves were explained nowhere (ADR 423 in
`openspec/changes/episode-log-claimed-moments/design.md`).

S121 and S122 are added. No inherited story is amended, weakened or retired. S67
still reads each row's `.tier[data-state]`, which keeps the served engine state
(`outranked`) beneath the new word. S82's label redundancy still holds: a claimed
anchor shares the fired anchor's hue, and the word `claimed` is the non-colour
signal that tells it from the driver. Both stories are app-opener-only, like
S101–S117. Browser execution belongs to the coordinator at 1280x720 and
1440x900; the ticket worker binds no port.

### #423 sanctioned changes to shipped desk behavior — 2026-09-23

- An anchor whose served state is outranked reads `claimed`, and Diagnose's
  case-file label for an outranked occurrence reads `claimed by another finding`
  (was `claimed by another factor`). Both read one exported word.
- A claimed row names what its anchor matched on its own, by the verdict title
  the model view now serves, then ends with the episode's served Lever name.
- A claimed anchor's tier word, rings and focus hairline take the fired anchor's
  hue, and its resting marker the fired anchor's size. The warning hue leaves
  the Episode Log.
- The Findings caption counts distinct Findings (served Levers), with claimed
  anchors counted beside it: `Findings · <n>` plus ` · <k> claimed`.
- Each band caption carries a Glossary control that opens the Glossary at a new
  Episode Log group; Close returns focus to the control.

No shipped behavior is retired.

```
S121 · On a Day whose Episode Log holds a claimed low, the low's row reads
       "claimed", names what the low matched on its own and ends with the
       Finding that claimed it, and paints its tier word in the fired row's
       colour; its resting marker is ringed and sized as the fired marker;
       the Findings caption counts one Finding and names one claimed anchor.
  element:  .gf-log-row[data-day-row] .tier[data-state], .text;
            .gf-reading .gf-log-cap .gf-log-title; the day chart's
            day-anchor-markers series option (by series id); .gf-month-toggle,
            [data-day="prev-month"], .gf-nav-cell[data-pick]
  source:   frontend/day.js reading / bind; frontend/day-chart.js buildRows,
            buildEpisodeLedger, anchorStateColor, ANCHOR_STATE_WORD,
            buildAnchorOverlay; frontend/desk.css tier rules;
            ciq_autotune/analyzers/scenario/model_view.py verdict `title`
  lock:     HV2-13, HV2-19, HV2-32
  data:     pattern-near-tie Day 2024-05-25, reached through the Month
            calendar from the 2024-06-08 arrival. Its Episode Log shows episode
            2024-05-25-ep13 (carb undercount): the fired 19:00 meal, a clean
            correction, and the 22:00 low at 54.25 mg/dL, outranked with
            correction_on_iob matched. Every one of that episode's anchors is
            stamped 2024-05-24, so the Day axis clips both rings and a pressed
            row's hairline lands in the left gutter; the story asserts nothing
            about a visible ring or hairline.
  evidence: C4_STORIES.S121 → assertClaimedEpisodeLog. It reads the day's
            served /api/model-view first; the premises (a claimed low matched
            to correction_on_iob in a carb undercount episode with its fired
            anchor, one Finding and one claimed anchor on the day) fail as
            "S121 premise: …". Before any row is pressed it reads
            the claimed and fired rows and each unfocused marker's
            itemStyle.borderColor, itemStyle.color and symbolSize back from
            the day-anchor-markers series option, then collects every feature
            check into one assertion: the word, the kept data-state, the
            served matched title and the served lever_title (a missing one is
            a feature failure, not a premise) with the title before the
            lever_title at the row's end, no underscore token, the tier's computed colour equal to the
            fired tier's, the caption "Findings · 1 · 1 claimed", the claimed
            marker's size and ring equal to the fired marker's and its fill
            the surface. Pressing the claimed row must then ring its marker
            in the accent at size 15. frontend/c4.replay.test.js drives it on
            fake pages: it fails on a warning-hued tier, the bare state word,
            a missing served title, a row not naming what the low matched, a
            row not ending with the lever_title, a caption counting rows, and
            a claimed marker smaller than or hued unlike the fired one, and it
            fails as a premise on a missing claimed low or row.
  status:   replayed-pass on branch 0cd74cd5 at 1280x720 and 1440x900. The
            ticket's base e229bef3 (the release trunk after #426) with the
            branch harness laid over fails at its feature assertion at both
            sizes, naming six items: its tier reads "outranked", not
            "claimed"; the model read serves no title on the low's matched
            correction_on_iob verdict; its tier word paints rgb(201, 138, 78),
            not the fired tier's rgb(134, 173, 120) (the warning ink); the
            Findings caption reads "Findings · 2", not "Findings · 1 · 1
            claimed"; its resting marker is 8, not the fired marker's 10; its
            resting ring is #c98a4e, not the fired ring's #e07f3f.
            Coordinator-run 2026-09-23.

S122 · On the same Day, the Findings caption's Glossary control, operated from
       the keyboard, opens the Glossary with its Episode Log group in view,
       and Close returns focus to that control.
  element:  .gf-log-cap [data-log-glossary="findings"];
            .gf-utility[data-utility="glossary"] [data-glossary-group="Episode Log"] h3;
            [data-utility-close]
  source:   frontend/day.js reading / bind; frontend/utilities.js openUtility
            (in-view target), glossaryBody, close; frontend/glossary.js
            Episode Log group
  lock:     HV2-13, HV2-32, HV2-33
  data:     pattern-near-tie Day 2024-05-25, reached as S121 reaches it
  evidence: C4_STORIES.S122 → assertBandGlossary. The premise is a Findings
            caption on the held day ("S122 premise: …"). The control must be
            a button carrying data-log-glossary="findings" and the accessible
            name "Explain Findings in the Glossary"; focused and activated with
            Enter, the Glossary must take the reading seat with the Episode
            Log group's heading inside the pane body's visible box; Close must
            put focus back on the same control. frontend/c4.replay.test.js
            drives it on fake pages: it fails on a missing or misnamed control,
            a group out of view and focus not returned, and as a premise on a
            missing caption.
  status:   replayed-pass on branch 0cd74cd5 at 1280x720 and 1440x900. Base
            a4d374a7 with the branch harness laid over fails at both sizes at
            its feature assertion, "the Findings caption must carry a
            Glossary button named for its band" (actual null). No such button
            exists before #423, so the base commit does not change this
            check. Coordinator-run 2026-09-23.
```

### #423 handler inventory

| Handler / registration | Source | Story |
|---|---|---|
| `.gf-month-toggle`, `[data-day="prev-month"]` and `.gf-nav-cell[data-pick]` click (existing) | frontend/day.js bind | S121, S122 |
| `.gf-log-row[data-day-row]` click (existing), pressed at the claimed row | frontend/day.js bind | S121 |
| `[data-log-glossary]` click, from the keyboard (new) | frontend/day.js bind → frontend/utilities.js openUtility(kind, launcher, inView) | S122 |
| `[data-utility-close]` click (existing) | frontend/utilities.js bindPane → close | S122 |

#423 narrow close · 2026-09-23 · Q2 sanction (Connor Griffin · 2026-09-23 · "Q1 A, Q2 A, defaults all fine, go"): below 700px the Episode Log is a sheet, and a band caption's Glossary control opens the Glossary in that sheet. Closing it, by Close or by Escape, now returns to the open Episode Log sheet with focus on the same caption control. Before this, closing shut the sheet and dropped focus to the page, because the control it tried to focus was hidden. A utility opened while the sheet is closed, from the narrow utility strip, still closes onto the stage, and at desktop widths nothing changes: S69 and S122 read as written. Under S78 the next Escape then closes the sheet, one level per press. Source: frontend/utilities.js openUtility / close. Evidence: frontend/utilities.test.js "#423 · on a narrow desk, closing a utility opened from the open sheet keeps the sheet and returns focus there" (node; failed first, with "closing the Glossary shut the sheet its launcher lives in") and "#423 · on a narrow desk, a utility opened with the sheet closed still closes onto the stage". No replay story is added, because this desktop lock does not accept narrow chrome (S10b).

## #432 amendment — 2026-09-23, issue #432

S148–S150 are the fail-first obligations of ADR 432
(`openspec/changes/meal-occurrence-facts/design.md`): a case-file Occurrence row
names what the Occurrence is from its served anchor facts, and a selected
Occurrence reads as those facts and its served reason. They are app-opener-only,
like S101–S117. Browser execution belongs to the release coordinator at 1280x720
and 1440x900, each story on a fresh case store (`CASE_STORE_DIR`). S25 and S107 are
amended to read the same served facts. No story is retired. No `★ FROZEN` block
and no header inventory line is edited here; the release coordinator writes the
one release freeze block and reconciles the count line.

Sanction: Connor Griffin, 2026-09-23, answering the release's Q2 ("Can your reply
here count as sign-off for the UI copy and tone changes? … I record your answer as
the approval for every change these 13 checklists call for, and write the wording
in CONTEXT.md terms"): "Q1 A, Q2 A, defaults all fine, go." It covers S148–S150 and
the S25 and S107 amendments below, and nothing outside #432's checklist.

Safe start is unchanged: AGENTS.md's QA copy-then-serve command over the showcase
or a named `scripts/qa_e2e_cases.py` case store.

```
S148 · Every row of the Meal bolus short response comparison names its own
       meal: its served carbs, its dose and, when served, its peak, with the word
       peak or nadir, and without the constant anchor label its cohort heading
       already names; no meal row leads with a dash.
  element:  #level .case-occurrence .only
  source:   frontend/diagnose-workstation.js occurrenceDescription,
            renderEventComparisonRoster, renderCaseRoster
  lock:     none (revise; ADR 432 in openspec/changes/meal-occurrence-facts/design.md)
  data:     showcase; All charts, then finding:meal_bolus_short's event case
            (32 meals, each serving its dose, carbs and Arc peak)
  evidence: C4_STORIES.S148 → assertServedRowDescriptions432; expands the
            roster once, then reads every rendered row against its own served
            Occurrence: the served anchor must carry dose and carbs, the row may
            not lead with a dash, and its text must equal the served
            description. A rendered row that is not a served Occurrence, or no
            rendered row at all, is a premise failure. The verdict-band roster
            renders only for a clock-aligned case file, which no chartable
            finding's drill reaches; it prints through the same description
            function, pinned by frontend/diagnose-workstation.test.js
  status:   base a4d374a7 with this harness laid over it fails at its feature
            assertion at both sizes ("every Meal bolus short row names its own
            meal"), not at setup; branch 03ff4579 passes at both sizes. The first
            branch run timed out under load (load average about 18); low-load
            re-runs passed at 1280x720 and 1440x900. Coordinator-run 2026-09-23
```

```
S149 · Selecting the matched meal of the Meal bolus short case shows that meal:
       the figure line reads its served carbs and dose at the anchor label; the
       facts list prints a Peak line whose value and minutes equal the served
       Arc peak, the served cause (its title, then its text), and each served
       habit with its verdict's band label and, when served, the classifier's
       sentence; no line only counts readings or markers and no sentence
       describes the canvas.
  element:  #level .occ-detail .occ-nums; #level .case-facts .vd.outcome,
            .vd.cause, .vd.habit
  source:   frontend/diagnose-workstation.js occurrenceFacts, renderCaseSelection
  lock:     none (revise; ADR 432)
  data:     showcase; the matched cohort's first member of finding:meal_bolus_short
            (it serves an Arc peak and a Meal bolus fell short cause with text)
  evidence: C4_STORIES.S149 → assertSelectedFacts432; reads the served detail
            for the selected Occurrence and the rendered block, and compares the
            figure, the outcome, cause and habit lines, and the absence of
            count-only lines and the canvas sentence
  status:   base a4d374a7 with this harness laid over it fails at its feature
            assertion at both sizes ("the selected matched meal reads as its
            facts and served reason"), not at setup; branch 03ff4579 passes at
            both sizes, first time. Coordinator-run 2026-09-23
```

```
S150 · A Highs after meals Pattern case file carries the same facts: every row
       reads its served carbs, dose and peak, and a selected Occurrence lists
       each served habit with its band label and sentence.
  element:  #level .case-occurrence .only; #level .case-facts .vd.habit
  source:   frontend/diagnose-workstation.js occurrenceDescription, occurrenceFacts
  lock:     none (revise; ADR 432)
  data:     pattern-near-tie; All charts, then pattern:highs_after_meals
            (three meals, each serving its dose, carbs and Arc peak)
  evidence: C4_STORIES.S150; assertServedRowDescriptions432 over every rendered
            row, then assertSelectedFacts432 over the first row's selection
  status:   base a4d374a7 with this harness laid over it fails at its feature
            assertion at both sizes ("every Highs after meals row names its own
            meal"), not at setup; branch 03ff4579 passes at both sizes, first
            time. Coordinator-run 2026-09-23
```

Amended S25 · 2026-09-23 · #432 / Q2 sanction: A selected Occurrence's evidence facts are its served facts — each served habit, and the served cause when the case file claims it — and never a count of glucose readings or event markers; the fixed sentence about what the canvas shows is retired. The replay reads the served detail and requires no count-only line. As frozen, S25 fails on this branch's build at its count-line assertion. Evidence, coordinator-run 2026-09-23: the a4d374a7 harness over the branch app fails S25 at its count-line assertion; as amended, S25 passes on branch 03ff4579 at both sizes (1280x720 on a low-load re-run after a load timeout; 1440x900 first time).

Amended S107 · 2026-09-23 · #432 / Q2 sanction: Row readability keys on each row's served description — for a meal, its carbs, dose and outcome — instead of the constant anchor label, which a meal row no longer prints. Every other S107 observation is unchanged. As frozen, S107 fails on this branch's build at its "Completed carb bolus" assertion. Evidence, coordinator-run 2026-09-23: the a4d374a7 harness over the branch app fails S107 at the old "Completed carb bolus" readability check at both sizes (the 1280x720 run was re-run at low load after a load timeout); as amended, S107 passes on branch 03ff4579 at both sizes on low-load re-runs after load timeouts.

The coordinator also ran the whole desk browser suite on 03ff4579 (40 of 40) and
the full `mockups/sweep/harmonic-v2-desktop/acceptance.test.py` (OK), 2026-09-23. The
render matrix and the complete-ledger replay belong to the release integration.

Additional handler inventory for this amendment:

| Handler / registration | Source | Story |
|---|---|---|
| Case-file roster row description, both rosters | frontend/diagnose-workstation.js occurrenceDescription | S148, S150 |
| Selected Occurrence figure and evidence facts | frontend/diagnose-workstation.js occurrenceFacts, renderCaseSelection | S149, S150, S25 |

## #446 amendment — 2026-09-23, issue #446

Changes remembered that the reader pressed Open Plan, and nothing cleared it, so
the topbar's Changes, Diagnose's return and the landing after a Focus pin opened
a Plan in the watched change's seat. S166–S168 pin the rule that replaces it
(ADR 446 in `openspec/changes/archive/2026-09-24-changes-arrival-leads-active/design.md`): the
served active change leads every plain arrival to Changes, Open Plan holds for
the visit it was pressed in, a Plan draft stays reachable from the watched
Trial's and Focus's own view, and Diagnose's return names the watched change.
No existing story is amended or retired. All three are app-opener-only, each on
a fresh case store (`CASE_STORE_DIR`); browser execution belongs to the release
coordinator at 1280x720 and 1440x900. No `★ FROZEN` block and no header
inventory line is edited here; the release coordinator writes the one release
freeze block and reconciles the count line.

Sanction: `Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R446`.
It covers S166–S168 and nothing outside #446's rulings.

Safe start is unchanged: AGENTS.md's QA copy-then-serve command over a named
`scripts/qa_e2e_cases.py` case store. Pump reads advance only through
`frontend/replay-pump.py`.

```
S166 · Open Plan holds for one visit, before and after a Trial begins. In one
       page, never reloaded after it opens at the Plan's address: Stage in the
       Plan's own frame keeps the address and shows the Plan with Save draft
       focused; the topbar's Changes then shows the staged concern with
       "Staged", Undo and Open Plan; after Open Plan, a visit to Day and a
       return by the topbar, Changes again shows that concern, not the Plan;
       Open Plan reopens the Plan with the staged change and the reader records
       the decision. A synthetic `match` pump read starts a Trial and a Plan
       draft is saved while it runs. After a visit to Diagnose, the topbar's
       Changes lands on the Trial, not the Plan, and the Trial's nameplate
       offers Open Plan; inspecting the Trial's nights, "Return to Trial" lands
       on the Trial.
  element:  [data-set="stage"], [data-set="save-draft"], [data-set="unstage"],
            [data-set="open-plan"], [data-set="record"], .gf-plan,
            .gf-stage-trial .gf-end [data-action="open-plan"],
            [data-follow-up-inspect], [data-action="watch"]
  source:   frontend/changes.js mount (the arrival rule); frontend/plan-view.js
            bind (the Plan's own Stage); frontend/follow-up.js openPlanControl;
            frontend/diagnose.js showFocusAction
  lock:     HV2-15
  data:     basal-lower; premises: /api/guidance serves the selected concern's
            basal action and /api/verify/trials admits no watched change; after
            the `match` capture it admits an active Trial, and the draft saved
            while it runs is served beside `active_change`
  evidence: C4_STORIES.S166; reads the address with parseRoute after the Plan's
            own Stage, the Plan count and the focused control; counts .gf-plan
            and the staged concern's controls after each plain arrival; reads the
            kicker's served phase after Open Plan; waits for Diagnose's guidance
            read before the watched topbar arrival; reads the Trial's nameplate
            controls and Diagnose's return label as text
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved.
            Base b03431d2 with this harness laid over it fails at its first
            feature assertion at both sizes ("S166 Stage in the Plan's own frame
            must keep the Plan's address"; it saw /changes). Branch 08d3b78e
            passes at both sizes. Coordinator-run 2026-09-24. Renders owed at the
            integration render batch
```

```
S167 · A watched Trial reaches its saved draft. With no Plan draft, the Trial's
       nameplate offers no Open Plan. With a draft saved while the Trial runs, it
       offers Open Plan beside "View change record", and the Revert to Plan
       section still offers its own control. The nameplate's Open Plan lands at
       /changes?subject=plan showing the saved draft unchanged; Record decision
       there fails visibly and adds no Plan history record; the next topbar
       Changes lands on the Trial.
  element:  .gf-stage-trial .gf-end button, [data-part="plan-route"]
            [data-action="plan-route"], .gf-plan, .gf-stage .gf-kicker b,
            [data-set="record"], [data-set="retry-save"]
  source:   frontend/follow-up.js openPlanControl / bind; frontend/plan-view.js
            recordDecision / saveFailure; frontend/changes.js mount
  lock:     HV2-15
  data:     basal-lower; the served basal action is saved and recorded as a Plan
            through PUT /api/plan and POST /api/plan/apply, then a synthetic
            `match` pump read starts the Trial; premises: /api/verify/trials
            admits the active Trial, and guidance serves no draft until the story
            saves one, then serves it beside `active_change`
  evidence: C4_STORIES.S167; reloads at /?to=changes after the capture and
            after its own draft write; reads the nameplate's controls in order;
            parses the address after Open Plan and compares /api/plan before
            and after it; counts the failed-record Retry and the served Plan
            history before and after Record decision
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved.
            Base b03431d2 with this harness laid over it fails at its feature
            assertion at both sizes ("S167 the Trial's nameplate must offer Open
            Plan beside View change record"). Branch 08d3b78e passes at both
            sizes. Coordinator-run 2026-09-24. Renders owed at the integration
            render batch
```

```
S168 · A watched Focus names its return and reaches its draft. With a Plan draft
       saved while the Focus runs, Changes shows the Focus's own view. Diagnose,
       opened from the Focus's Inspect evidence, offers "Return to Focus" and no
       "Return to Trial"; pressing it lands on the Focus. The Focus's nameplate
       Open Plan lands at /changes?subject=plan, showing the draft.
  element:  [data-action="watch"], .gf-stage-focus,
            .gf-stage-focus .gf-end [data-action="open-plan"], .gf-plan
  source:   frontend/diagnose.js showFocusAction; frontend/follow-up.js
            openPlanControl / bind; frontend/changes.js mount
  lock:     HV2-15
  data:     c3-focus; premises: /api/verify/trials admits an active Focus, and a
            draft saved from the served pump profile is served beside
            `active_change`
  evidence: C4_STORIES.S168; reads Diagnose's return label before the Focus's
            nameplate, so a base run records the crumb before it fails. Its base
            failure at the label, not at a premise, is pinned at node level by
            frontend/c4.replay.test.js against a page shaped like the base
  status:   replayed-pass (1280x720 and 1440x900) · negative proof: proved.
            Base b03431d2 with this harness laid over it fails at its feature
            assertion at both sizes ("S168 Diagnose opened from the watched Focus
            must offer "Return to Focus" and no "Return to Trial""; it saw
            "Return to Trial"). Branch 08d3b78e passes at both sizes.
            Coordinator-run 2026-09-24. Renders owed at the integration render
            batch
```

Additional handler inventory for this amendment:

| Handler / registration | Source | Story |
|---|---|---|
| The arrival rule: Open Plan cleared on each arrival | frontend/changes.js mount | S166, S167, S168 |
| Stage in the Plan's own frame stays on the Plan | frontend/plan-view.js bind | S166 |
| The watched change's nameplate Open Plan | frontend/follow-up.js openPlanControl, bind | S166, S167, S168 |
| Diagnose's return names the watched change | frontend/diagnose.js showFocusAction | S166, S168 |

## #453 amendment — 2026-09-23

Replay S89 now certifies the Plan decision it records (ADR 453,
`openspec/changes/archive/2026-09-24-plan-cleanup-s89`). Its story text and lock term are
unchanged. No story is added or retired, and no ★ FROZEN block or inventory
line is edited.

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R453.

Amended S89 · 2026-09-23 · #453 / Q3 delegation: the story reads the decision it records as the newest Plan history record, which the served history lists first, not the last one listed. The same check proves that record is the decision just recorded: the history holds exactly one more record than before recording, and the newest record's `applied_at` names none of the records served before it. The failed-Withdraw check reads that same newest record. S89's store holds no earlier Plan, so its passes before #453 read the same row but did not show which record they certified.
The preceding S89 wording and results are the attributed pre-amendment record.

## #452 amendment — 2026-09-23, issue #452

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
from here"); coordinator ruling R452, with its triage rulings Q1 (add S180) and
Q2 (reopening the same record from the roster starts empty). This section
changes shipped desk behavior on that sanction only. The decision is ADR 452 in
`openspec/changes/archive/2026-09-24-late-conclusion-record-reset/design.md`.

Base b03431d2b937b46bdabbb2de1e6ba0ba6c6b57b1. Safe start is unchanged:
AGENTS.md's QA copy-then-serve command
(`uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`)
over the committed synthetic `scripts/qa_e2e_cases.py` case store c4-isf,
through `CASE_STORE_DIR`. No real data is read. The worker ran no server and no
browser; every replay below is the coordinator's.

Changed shipped behavior:

- **A later conclusion belongs to its record.** An expired Trial's Later
  conclusion text, a failed save of it and that save's request id are held for
  the one record that is open. Opening another record, or leaving for the
  roster with Back to records, starts the next record with an empty form, no
  failure and a request id of its own; its first save is a first save, not a
  retry. That includes reopening the same record from the roster, as opening it
  by its address already did. Base carried all three into the next record a
  roster press opened.
- **A re-render of the same record keeps them.** A failed save followed by a
  re-render, including a return from Day to the same record, keeps the words,
  the failure and the request id, so Retry resends the same request id.
- **A save in flight stays with its record** (coordinator-authorized widening,
  2026-09-23, ADR 452 decision 7). A later-conclusion save or Retry still in
  flight when the reader leaves writes nothing into the next record: no failure,
  no request id, and no clear of the next record's draft. A Retry whose re-read
  returns after the record was left is abandoned unsent. Proved at node level in
  `frontend/follow-up-lifecycle.test.js`; no replay story times a save against a
  roster press.
- The conclude endpoint, the request-identity rules, which Trials offer a later
  conclusion, and every saved ending are unchanged.

S180 is a new app-opener-only story under HV2-28. No story is amended or
retired, and S181, reserved for this issue, is unused.

```
S180 · Reopening an expired Trial from the Changes roster, after its later
       conclusion was typed and its save failed, starts with an empty Later
       conclusion form and no failure, and the next save sends a request id of
       its own.
  element:  table.gf-table [data-record], #late-conclusion-conclusion,
            [data-form="late-conclusion"], [data-save-error="conclude"],
            [data-record-close], [data-late-conclusion="available"]
  source:   frontend/history.js
  lock:     HV2-28; ADR 452 (openspec/changes/archive/2026-09-24-late-conclusion-record-reset/design.md)
  data:     c4-isf; its one retained Trial ended expired_unreviewed with no
            later conclusion saved
  evidence: C4_STORIES.S180; opens the expired Trial by its roster press, has
            its first save refused by a routed synthetic answer (nothing
            reaches the store) and records that request id, presses Back to
            records, reopens the record by its roster press, reads an empty
            form and no failure, then records and compares the request id the
            save sends. The carry into a different record is proved at node
            level in frontend/follow-up-lifecycle.test.js, because no committed
            case store serves two expired Trials
  status:   base b03431d2 (with the branch harness) fails at its feature
            assertion at both sizes ("S180 reopening the record from the
            roster must start its later conclusion empty"), with the 12
            regression stories passing beside it; branch 560098de and review
            fix head cd392553 pass at 1280x720 and 1440x900 (13 stories:
            executed 13 · failed 0). Coordinator-run, reported 2026-09-24
```

Regression, replayed unchanged by the coordinator: every story that opens a
record through `openRecord` or leaves one — the finished-change handoff (S52,
R17, S92 and S94), the retry landings after a refused save (S53 and S57), and
the roster presses (S54b, S105, S110, S112, S142 and S143). The desk browser
suite's expired-Trial Later conclusion test opens its record by address and is
unchanged.

Additional handler inventory for this amendment. The Later conclusion form
arrived in #411 with no ledger row; these rows record it.

| Handler / registration | Source | Story |
|---|---|---|
| Later conclusion text input | frontend/history.js | S180 |
| Record later conclusion, and its Retry after a failed save | frontend/history.js | S180 |
| Later-conclusion clear on opening or leaving a record | frontend/history.js | S180 (same record); the two-record path is node test only (frontend/follow-up-lifecycle.test.js) |
| A later-conclusion save or Retry returning after its record was left | frontend/history.js | none — node test only (frontend/follow-up-lifecycle.test.js) |

The ledger header's inventory line, `ACCEPTANCE.md`'s count sentence,
`mockups/INDEX.md`'s row and the release freeze block are the coordinator's,
written once on the integration branch. `acceptance.py`'s pinned inventory
moves to 172 issued · 153 active · 19 retired on this branch.

## #449 amendment — 2026-09-23, issue #449 (with #450)

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
from here"); coordinator rulings R449 and R450. It covers the shipped-desk
changes and the ledger additions and amendments below, and nothing else. The
decisions are ADR 449 and ADR 450 in
`openspec/changes/archive/2026-09-24-focus-served-words/design.md`.

Base b03431d2b937b46bdabbb2de1e6ba0ba6c6b57b1. Safe start is unchanged:
AGENTS.md's QA copy-then-serve command
(`uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`)
over a committed synthetic `scripts/qa_e2e_cases.py` case store — c3-focus,
c3-preempted and c4-history for the new stories, and c3-trial, c4-ic, c4-isf and
c4-profile for the amended ones — each through `CASE_STORE_DIR`. No real data is
read. The worker ran no server and no browser; every replay below is the
coordinator's.

Changed shipped behavior:

- **The watched behavior has one served name.** The selected Focus read serves
  `lever_title`, the watched Lever's title (or the override's), or null for a
  stored lever that is no longer offered. The Observed behavior row of the
  active Focus and of a Focus record, the "What this Focus watches" fallback and
  a Focus record's "What changed" print it. A Focus on High-carb sequence or
  Repeat eating no longer prints its key, and Correction stacking, Missed /
  unannounced meal and Doses above pump calculation read as their nameplates do.
  A null name reads "Watched behavior" in the row, omits the fallback paragraph
  and reads "The behavior this Focus watched is no longer an offered lever." in
  "What changed". The desk keeps no lever name table.
- **Every served reason reads as words.** The saved ending's assessment, the
  behavior and harm cells, every readiness arm's "Not met" line, a setting arm's
  unavailable-evidence line, the Pattern opportunity line and the unreconciled
  admission line print through the desk's one reason vocabulary; an unknown
  code still prints as served. Codes stay in payloads and data attributes.
- **States, verdicts, modes and a denominator read as words.** "Recorded ·
  Concerning", a reassessment result "Context only" under a "Current policy"
  heading, a Pattern verdict "Ready" or "Withheld", and "correction clusters".
- **The Focus entry says why a Focus is not offered**, a pending Plan included,
  through the Diagnose Focus context's own admission words.
- **A refused change write reads as a sentence.** The durable 409 serves a
  `message` beside its `code`; the Trial finish, Focus resolve, later-conclusion,
  Plan and Focus pin failure lines print it, never `<code> (409)` or
  "[object Object]", and the pin line prints one full stop.

S173–S176 are new app-opener-only stories. Four stories are amended in replay
only, below; no story is retired. Every new story reads the served name or code
from the API and checks the rendered page, and no replay module imports a
follow-up renderer, so this harness laid over the base fails at its feature
assertions rather than at module link.

```
S173 · The active Focus names the behavior it watches by its served name — in
       its Observed behavior row and, with no retained explanation, in "What
       this Focus watches" — never by its lever key or its Pattern's title, and
       each Pattern opportunity line prints its verdict as a word, never the
       served value.
  element:  .gf-stage-focus [data-table="adherence"] tr.gf-target td,
            [data-part="intent"], [data-opportunity-verdict]
  source:   frontend/follow-up.js focusFrame / adherenceTable / readinessArm;
            ciq_autotune/watched_change.py review_trials (lever_title)
  lock:     HV2-26; ADR 449, ADR 450
  data:     c3-focus; an active Pattern Focus on Late bolus titled Highs after
            meals, no retained explanation, both Pattern arms served ready
  evidence: C4_STORIES.S173; reads the admitted Focus's served lever_title and
            the retained comparison's verdicts, then the behavior row, the
            intent section and every opportunity line
  status:   base b03431d2 with this harness laid over it fails at its feature
            assertion at both sizes (it saw the behavior row "Late bolus\nthe
            intended behavior · meals" with no served lever_title); branch
            b0ad8a6c passes at 1280x720 and 1440x900; coordinator-run
            2026-09-24. Raw logs are kept in a private design-evidence record,
            not part of the public tree
```

```
S174 · A Focus ended by hand whose saved ending is served unavailable names that
       reason in words after "Unavailable · ", never its served code; no harm
       cell, "Not met" line or opportunity line of the record prints a served
       code, and no opportunity line prints the bare served verdict.
  element:  [data-ending-assessment], [data-harm], [data-criterion],
            [data-opportunity-verdict]
  source:   frontend/history.js endingSection; frontend/follow-up.js
            adherenceTable / readinessArm / comparisonReasonWords
  lock:     HV2-28; ADR 450 (R450: closes the saved-Focus-ending gap S49 leaves)
  data:     c3-preempted; its manual Focus ending saved unavailable_adherence,
            both behavior and harm arms and both readiness arms
            zero_opportunities, both Pattern arms withheld
  evidence: C4_STORIES.S174; reads the saved assessment's reason and every code
            its adherence and readiness serve, opens the record by address and
            reads the ending line and every harm, criterion and opportunity line
  status:   base b03431d2 with this harness fails at its feature assertion at
            both sizes (it saw "Unavailable · unavailable_adherence"); branch
            b0ad8a6c passes at 1280x720 and 1440x900; coordinator-run
            2026-09-24. Raw logs as S173's
```

```
S175 · A preempted Focus record whose saved behavior arm could not be measured
       names that reason in words in its Observed behavior cell and keeps its
       "x of y measured" count; its still-collecting readiness arm's "Not met"
       line is words, never "Not met — collecting.".
  element:  [data-adherence="<side>"], [data-readiness="<side>"] [data-criterion]
  source:   frontend/follow-up.js adherenceTable / readinessArm
  lock:     HV2-28; ADR 450
  data:     c4-history; its preempted Focus's saved Before arm serves
            insufficient_measurement at 0 of 4 measured, and its Before
            readiness arm serves withheld/collecting
  evidence: C4_STORIES.S175; reads the saved adherence and readiness arms, opens
            the record by address and reads the unmeasured cell and the
            collecting arm's criterion line
  status:   base b03431d2 with this harness fails at its feature assertion at
            both sizes (it saw "insufficient_measurement · 0 of 4 measured");
            branch b0ad8a6c passes at 1280x720 and 1440x900; coordinator-run
            2026-09-24. Raw logs as S173's
```

```
S176 · Each Focus record's "What changed" names the behavior it watched by its
       served name — never its lever key, and never its Pattern's title, which
       stays the record's nameplate — and a record whose lever is no longer
       offered says so, naming neither its key nor "Focus" as the behavior.
  element:  .gf-stage .gf-title, [data-record-part="change"]
  source:   frontend/history.js changeSection / recordTitle;
            ciq_autotune/watched_change.py review_trials (lever_title)
  lock:     HV2-28; ADR 449 (Q1: "What changed" names the served behavior)
  data:     c3-preempted; two Pattern Focus records on Late bolus titled Highs
            after meals, and one overnight_drift record titled Focus whose
            served lever_title is null
  evidence: C4_STORIES.S176; for each record, Pattern records first, reads the
            served title and lever_title, opens the record by address and reads
            the nameplate and "What changed"
  status:   base b03431d2 with this harness fails at its feature assertion at
            both sizes (its "What changed" check); branch b0ad8a6c passes at
            1280x720 and 1440x900; coordinator-run 2026-09-24. Raw logs as
            S173's
```

Amended S46 · 2026-09-23 · #449 / Q3 delegation, coordinator rulings R449 and R450: The story's text is unchanged. The c3 `readiness()` helper it runs no longer requires the served `arm.reason` to appear in the arm, because that reason now prints in words: each arm's `[data-criterion]` line must be non-empty and must not read `Not met — <served reason>.`, and a Pattern arm's `[data-opportunity-verdict]` text must not be the bare served verdict (its data attribute still equals it). The replay reads the served arms from the API and imports nothing new. Recorded 2026-09-24 (coordinator-run, both sizes): base b03431d2 with this harness fails at its readiness check; branch b0ad8a6c passes at 1280x720 and 1440x900.
The preceding wording and results are the attributed pre-amendment record.

Amended S91 · 2026-09-23 · #449 / Q3 delegation, coordinator rulings R449 and R450: The story's text is unchanged. Its c3 part runs the amended c3 `readiness()` helper above, and its c4 cases (c4-ic, c4-isf, c4-profile) run the c4 `readiness()` helper, amended the same way for setting arms. The injected prose reason "Synthetic served hold" is not a code the vocabulary knows, so it still prints as served and its assertion is unchanged. Recorded 2026-09-24 (coordinator-run, both sizes): base b03431d2 with this harness fails at its readiness check; branch b0ad8a6c passes at 1280x720 and 1440x900.
The preceding wording and results are the attributed pre-amendment record.

Amended S92 · 2026-09-23 · #449 / Q3 delegation, coordinator rulings R449 and R450: The story's text is unchanged. It runs the amended c3 `readiness()` helper; its ending assertion (`/unclear|no clear answer/i`) still holds, since a recorded state now prints as its word ("Unclear"). Recorded 2026-09-24 (coordinator-run, both sizes): base b03431d2 with this harness fails at its readiness check; branch b0ad8a6c passes at 1280x720 and 1440x900.
The preceding wording and results are the attributed pre-amendment record.

Amended S93 · 2026-09-23 · #449 / Q3 delegation, coordinator rulings R449 and R450: The story's text is unchanged. It runs the amended c3 `readiness()` helper on c3-focus's two Pattern arms, both served ready, so each opportunity line must read the word ("Ready"), not the served value. Recorded 2026-09-24 (coordinator-run, both sizes): base b03431d2 with this harness fails at its readiness check; branch b0ad8a6c passes at 1280x720 and 1440x900.
The preceding wording and results are the attributed pre-amendment record.

The coordinator also ran the follow-up browser suite (✔ "Trial and Pattern Focus
journeys" at 1280x720 and 1440x900) and the whole desk browser suite (43 of 43)
on b0ad8a6c, 2026-09-24. The complete ledger, the full
`mockups/sweep/harmonic-v2-desktop/acceptance.test.py` and the renders belong to
the release integration.

Every other desk replay and browser test that reads these lines was re-read for
intent, and each keeps its subject:

- **S57, S58, S59 and S95** open the c3-focus and c3-preempted Focus frames and
  records and read their tables, conclusion and ending kinds, none of which
  changes text.
- **S143 and S49** already read a comparison reason in words (ADR 430); their
  codes are unchanged in the vocabulary.
- **The follow-up browser leg** replays every `C3_STORIES` entry, so it runs the
  amended helper through S46, S91, S92 and S93; no story joins C3.
- **The desk browser suite's expired-Trial test** opens an ended record whose
  bare saved assessment is unavailable `not_recorded`; its ending line now
  reads "Unavailable · not recorded" instead of the code, and none of its
  assertions reads that line.

The new stories run on c3-focus, c3-preempted and c4-history, which the fixed PR
smoke slice already covers (S57, S58, R18), so `SMOKE_STORIES` and its digest are
unchanged.

Additional handler inventory for this amendment:

| Handler / registration | Source | Story |
|---|---|---|
| Observed behavior row and "What this Focus watches" name | frontend/follow-up.js focusFrame, adherenceTable | S173 |
| Pattern opportunity verdict and every readiness reason, in words | frontend/follow-up.js readinessArm | S173, S174, S175, S46, S91, S92, S93 |
| Saved ending assessment reason and recorded state | frontend/history.js endingSection | S174 |
| Behavior and harm cell reasons | frontend/follow-up.js adherenceTable | S174, S175 |
| A Focus record's "What changed" | frontend/history.js changeSection | S176 |
| Unreconciled admission line | frontend/follow-up.js mount | none — node test only |
| Focus entry withheld copy and pin failure line | frontend/focus-entry.js mount | none — node test only |
| Trial finish, Focus resolve and later-conclusion failure lines | frontend/follow-up.js, history.js failureMessage | none — node test only |

The ledger header's inventory line, `ACCEPTANCE.md`'s count sentence,
`mockups/INDEX.md`'s row and the release freeze block are the coordinator's,
written once on the integration branch. `acceptance.py`'s pinned inventory
moves to 175 issued · 156 active · 19 retired on this branch.

## #455 amendment — 2026-09-23

S183–S185 are the fail-first obligations of #455 (the pinned change
`openspec/changes/archive/2026-09-24-window-label-narrow/`, ADR 455): at the narrowest split the
glucose overview's window caption, the Spotlight's verdict line and the canvas
header's title stay whole, and at every size no glucose-overview text
overprints another. All three are app-opener-only, like S101–S117. Browser
execution belongs to the release coordinator at 1280x720 and 1440x900, each
story on a fresh `basal-verdict-gallery` case store; the ticket worker binds no
port. No story is amended or retired. No `★ FROZEN` block and no header
inventory line is edited here; the release coordinator writes the one release
freeze block and reconciles the count line.

### #455 sanctioned changes to shipped desk behavior — 2026-09-23

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
from here"); coordinator ruling R455, as amended for the two collision fixes
("desktop sizes may change for exactly these two collision fixes and nothing
else"). It covers six changes:

- A window caption that fits on one line nowhere, neither inside its window nor
  beside it, stacks and wraps inside the wider of the two: the window's name on
  its own line and, on a thin window, the insufficient-sample notice under it,
  breaking only between whole words, each line on the knock-out pad. The target
  caption takes its existing floor placement then.
- The Spotlight's middle-rank verdict line breaks between its facts where it
  does not fit, and its tally line and figure move down with it.
- Between 832 and 1023 px wide, the All charts control shows its icon only,
  keeping its name and tooltip, so the title draws.
- A glucose y-axis label that would sit under a target numeral is not printed,
  at every size.
- The Spotlight's programmed-rate rule ends at its axis tick, above the tick
  labels, at every size.
- The glucose overview and the evidence charts re-lay out when their size
  changes, not only rescale.

No shipped behavior is retired. At 1280x720 and 1440x900 only the two collision
fixes are visible.

```
S183 · The glucose overview's window caption stays whole inside the chart, and
       no text the chart paints overprints another. At the run's own size each
       Window preset's caption stands on one line; at 832×720 and 832×560 each
       preset's caption, and the Evening caption after the window is narrowed
       with nothing pressed, lies inside #chart with every word whole (the
       window's name, then on a thin window the whole insufficient-sample
       notice), and neither its text nor its pad boxes reach into the y-axis
       label column, past the chart's right edge, or across a window gate.
  element:  #chart (its painted text spans and their pad boxes),
            #seg-window buttons
  source:   frontend/diagnose-workstation-chart.js renderCanvas (the window
            caption, the target caption, the y-axis labels) and observeResize;
            frontend/diagnose-workstation.js (the overview's relayout)
  lock:     HV2-11
  data:     basal-verdict-gallery (the case S113 uses; its 24 h window is thin)
  evidence: C4_STORIES.S183 → assertOverviewText; presses each preset at the
            run's size, then Evening, narrows to 832×720 with nothing pressed,
            then presses each preset at 832×720 and at 832×560, each press
            differing from the one before it and settled by laidOutBrace404, a
            resize settled when the chart has taken its host's box and held
            still; reads every painted text span and pad box from the chart's
            ZRender display list, each caption's spans in reading order (line
            by line, left to right: a caption parked left paints its tail
            first). The narrowed reading waits, bounded at 10 s, until its
            check holds (readSettled), since the relayout lands a frame after
            the resize. It restores the run's size and presses 24 h, records
            every failure by size, state and check with the measured amount,
            then fails once, listing them all
  status:   base b03431d2 with the d3e276ed harness laid over it fails at both
            sizes with 65 failures: the 24 h caption past #chart's right edge at
            832×720 and 832×560, the Evening caption past its left edge after
            the live narrowing, and the "60"/"70" and "180"/"180" overlaps.
            Branch d3e276ed passed every 832 check and cleared the overlaps. It
            failed only on the run size's Afternoon and Evening captions, which
            it read tail first; that is a story defect, corrected by reading
            order (coordinator-authorized, 2026-09-23). Branch a9a2b56a passed
            every run-size check but read the 1010 px or 850 px chart's one-line
            Evening caption after the narrowing. That is the resize-to-the-
            first-report race, now fixed in observeResize, with the bounded wait
            above. On base b03431d2 with the c13c6f7a harness laid over it,
            S183 fails at both sizes with 72 failures, for the reasons above,
            each measured after readSettled's bounded wait. Branch c13c6f7a
            passes at 1280x720 and 1440x900 in each of three runs. Coordinator-
            run 2026-09-23
```

```
S184 · With Diagnose at rest, the Spotlight's middle-rank verdict line keeps
       every fact — SUPPORTED, 0.70 U/h, (0.70–0.70), programmed now 0.60 —
       whole inside its chart and clear of the Keep control, breaking only
       between facts, with the tally line wholly below it; at 1200×736 it
       stands on one line. Each size is reached by resizing, nothing pressed.
  element:  #tile-focal .tile-chart (its painted text spans), #tile-focal
            .tile-pin
  source:   frontend/diagnose-evidence-charts.js basalEditorialOption (the
            middle rank); frontend/diagnose-workstation.js mountDescriptorChart
            (the tile's relayout)
  lock:     HV2-11
  data:     basal-verdict-gallery (at rest the Spotlight opens the next-in-line
            basal slot, 00:00)
  evidence: C4_STORIES.S184 → assertSpotlightVerdict; sets 1200×736, 832×720
            and 832×560 in turn, settles each resize, then reads the Spotlight
            chart's painted text and the Keep control's box in the chart's
            coordinates. Each reading waits, bounded at 10 s, until its check
            holds (readSettled). It restores the run's size, then fails once,
            listing every failure by size
  status:   base b03431d2 with the d3e276ed harness laid over it fails at
            832×720 and 832×560, and at 1200×736 on the 1280x720 run: the
            verdict reads ["SUPPORTED"] from the full rank the run's size drew,
            and no tally line is painted. Branch d3e276ed passes at 1280x720 and
            1440x900. Branch a9a2b56a read the 1200×736 one-line verdict at
            832×720 (26.86px past the chart, 20px under Keep): the same race as
            S183's, now fixed. On base b03431d2 with the c13c6f7a harness laid
            over it, S184 fails at both sizes with 6 failures, each measured
            after readSettled's bounded wait. Branch c13c6f7a passes at 1280x720
            and 1440x900 in each of three runs. Coordinator-run 2026-09-23
```

```
S185 · With Diagnose at rest, the canvas header keeps its title, its whole
       provenance and the All charts control (named and titled "All charts")
       inside its box on one line at 832×720, 832×560, 1024×768 and the run's
       own size. At the narrowest split the title shows at least a letter and
       an ellipsis; at 1024×768 and the run's size the control shows its word
       and the title prints whole.
  element:  #canvas-head, #canvas-head .head-rest h2, #canvas-pool,
            #explorer-trigger, #explorer-trigger > span
  source:   frontend/diagnose-workstation.css (the ADR 455 832–1023px block);
            frontend/diagnose-workstation.js chartActionButton
  lock:     HV2-11
  data:     basal-verdict-gallery
  evidence: C4_STORIES.S185 → assertCanvasHead; sets each size in turn, waits
            until the header's box has held still for two animation frames,
            reads each part's box, clientWidth and scrollWidth, the box of the
            control's rendered icon and word, and the control's name and
            tooltip; restores the run's size, prints every size's widths on a
            `# S185` line, then fails once, each failure printing every part's
            widths. The control is placed by its icon and word: its own box is
            36px tall under the shell's button floor and overhangs the 30px
            rail by 3.5px, with nothing visible outside it
  status:   base b03431d2 with the d3e276ed harness laid over it fails at
            832×720 and 832×560 on the title's 0px box (scrollWidth 144).
            Branch d3e276ed draws a 41.86px title there, beside a 21px icon-only
            control. Both base and branch also failed at every size on the
            control's 3.5px box overhang; that is a story defect, corrected by
            placing the control by its icon and word (coordinator-authorized,
            2026-09-23). Branch a9a2b56a, and branch c13c6f7a in each of three
            runs, pass at 1280x720 and 1440x900 with the widths above.
            Coordinator-run 2026-09-23. Base b03431d2 with #455's final harness
            575464e7 laid over it fails at its feature assertion at both sizes:
            the title's box is 0px wide at 832×720 and 832×560 (scrollWidth
            144). Coordinator-run 2026-09-24
```

### #455 handler inventory

| Handler / registration | Source | Story |
|---|---|---|
| `#seg-window` preset button click, at the run's size and the narrowest split | diagnose-workstation.js (the Window presets) | S183 |
| `observeResize` relayout on `#chart` (a window resize, nothing pressed) | diagnose-workstation-chart.js observeResize; diagnose-workstation.js | S183 |
| `observeResize` relayout on a descriptor tile (the Spotlight, nothing pressed) | diagnose-workstation-chart.js observeResize; diagnose-workstation.js installTileMount | S184 |
| `@media (min-width: 832px) and (max-width: 1023px)` on `#explorer-trigger > span` (the user agent's; no script handler) | diagnose-workstation.css, the ADR 455 block | S185 |

## #445 amendment — 2026-09-23, issue #445

S162–S165 are the fail-first obligations of ADR 445: a Day link from Changes
or a carb utility names its return target by an identity its origin owns — a
supporting date, a Carb log entry's id, a Carb-log prompt's detector and anchor
time — never a page selector, and the origin puts the reader back on the
control they pressed. #444's Log carbs header rides the same change as ADR 444.
Both decisions are recorded in the day-link-identities change's design record.
The four stories are app-opener-only, like S136–S138: S162 and S163 run on
c3-trial, whose active Trial and its change record list contributing dates, and
S164 and S165 run on the showcase.

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
from here"); coordinator ruling R445, and R444 for the Log carbs header. The
coordinator's plan-review round-1 rulings of the same date — Q1, Q2 and r1-1 to
r1-2, recorded with ADR 445 — settle the Return to Trial, the Log carbs return
control, and the moved-store return.

Safe start is unchanged: AGENTS.md's QA copy-then-serve command
(`uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`)
over the committed synthetic showcase or a generated `scripts/qa_e2e_cases.py`
case store through `CASE_STORE_DIR`. No real data is read. The worker ran no
server and no browser; every replay below is the coordinator's, at 1280x720 and
1440x900.

Shipped desk behavior that changes, and no story that asserted the old fact:

- **The Changes and carb-utility Day addresses carry no selector.** A
  supporting date's Day address names the date (and, from a change record,
  that record); a Log carbs or Carb questions Day address names its item by
  identity as the routing subject, beside the printed "Log carbs · …" or "Carb
  questions · …" title. No Day address carries the return-focus key, and an
  older link that still carries one is read without it.
- **A Changes return lands on the date's control.** Once the change's evidence
  has rendered, focus is on the supporting-date control the reader pressed, on
  the desktop and once per arrival. The base landed on the reading heading for
  the active change. The narrow desk keeps its sheet-toggle focus.
- **A carb-utility return over Diagnose is a plain return.** The utility is
  reopened over Diagnose, which makes its one status read and keeps the drill,
  the window and the scroll while the store has not moved since it last read;
  the address names the retained case with no utility title, origin or
  selector. After a carb is logged or a question answered the store has moved,
  and Diagnose re-reads and restores the case it held (ADR 414). The base handed
  Diagnose the utility's entry, which re-read on every return, discarded the
  drill and left the utility's title and selector in the address.
- **A utility opened over Day returns into Day as a direct entry.** It stays on
  the day shown and offers no second return. The base re-adopted the utility's
  entry and offered the same return again.
- **Log carbs returns to the entry's Open Day control** (ruling Q2), not its
  Remove button. Either utility's return lands on the pressed item's Open Day
  control, or on the utility's heading when that item is no longer served.
- **A plain utility return drops a held Return to Trial** (ruling Q1), as every
  plain return does under ADR 428.
- **A Diagnose rebuild under a seated utility sets no crumb focus.** The
  inspector that holds the crumb is inert under the utility, so the default
  landed nowhere and displaced the utility's focus.
- **A Day address naming a utility the desk does not have returns plainly**
  (coordinator-authorized widening, 2026-09-23, ADR 445 point 8). It offers the
  return named for its destination and reopens nothing. The base offered
  "Return to" that name, and pressing it stopped the desk drawing. A Node test
  pins it (`frontend/day.test.js`).
- **A Day address naming no destination returns plainly to Diagnose**
  (coordinator-authorized, 2026-09-23, code review round 1 finding F1, ADR 445
  point 8). A `from` such as `constructor` or `__proto__` offers "Return to
  Diagnose". The base printed "Opened from function Object() { [native code] }"
  and a return named the same. A Node test pins it (`frontend/day.test.js`).

The Log carbs header (ADR 444) has no story: no replay or browser context sets
a `timezoneId`, so the replay browser runs in the runner's zone, UTC on CI,
where the header's date and time cannot disagree. A Node test pins its own zone
and clock instead (`frontend/utility-day-links.test.js`).

S76 is unchanged: a utility's Open Day still keeps the utility open over Day,
and its return still reopens it.

```
S162 · On the active Trial, a contributing date opens Day with an address that
       names the date, returns to Changes and carries no return-focus key or
       CSS selector; Return to Changes lands focus on that date's control once
       the Trial's evidence has rendered.
  element:  .gf-reading [data-day-date], [data-day="return"], location,
            document.activeElement
  source:   frontend/follow-up.js bind ([data-day-date]) / supportingDateFocus
            / mount; frontend/day.js bind (return); frontend/tab-routing.js
            CONTEXT_KEYS
  lock:     HV2-14; ADR 445 points 1, 2 and 4
  data:     c3-trial; its active Trial's retained comparison lists
            contributing dates, eight of a period rendered as controls
  evidence: C4_STORIES.S162; reads the Day address, presses Return to Changes
            and checks document.activeElement
  status:   branch e68bf5b3 passes at 1280x720 and 1440x900 (the 17-story
            selection: executed 17 · failed 0); base b03431d2 with the
            e68bf5b3 harness laid over it fails at its feature assertion at
            both sizes, "S162 the Day address must carry no return-focus key";
            coordinator-run. The complete ledger runs at integration
```

```
S163 · From the active Trial's change record, opened from the Changes roster
       as S142 opens it, a contributing date opens Day with an address that
       names the date and the record and carries no return-focus key or CSS
       selector; the return reopens that record and lands focus on the date's
       control.
  element:  table.gf-table [data-record], [data-record-part="reassessment"],
            .gf-reading [data-day-date], [data-day="return"], location
  source:   frontend/history.js bind ([data-day-date]) / mount;
            frontend/follow-up.js supportingDateFocus
  lock:     HV2-14; ADR 445 points 1, 2 and 4
  data:     c3-trial; the roster's first still-open record is the active
            Trial's, and its retained comparison lists contributing dates
  evidence: C4_STORIES.S163 (openStillOpenRecord430); reads the Day address,
            presses the return, then checks the record address, its evidence
            and document.activeElement
  status:   branch e68bf5b3 passes at 1280x720 and 1440x900 (the 17-story
            selection: executed 17 · failed 0); base b03431d2 with the
            e68bf5b3 harness laid over it fails at its feature assertion at
            both sizes, "S163 the Day address must carry no return-focus key";
            coordinator-run. The complete ledger runs at integration
```

```
S164 · Log carbs over a drilled Finding case with an Occurrence held: an entry
       logged on a recorded day opens Day with an address that names it by id
       (carb:<id>), carries its printed "Log carbs · …" title and no
       return-focus key or CSS selector. Close, then Return to Log carbs: the
       store moved when the entry was logged, so Diagnose re-reads (at least
       one guidance read) and restores the same Finding with the same
       Occurrence held, Log carbs is open over it, and once the restoration
       settles focus is on that entry's Open Day control. After a reload of the
       case address, the same round trip issues exactly one GET /api/status and
       nothing else, keeps the case, puts focus on that entry's Open Day
       control, and the address names the case with no title, from or focus.
  element:  .cockpit-log-carbs, [data-utility-when="custom"], #ut-custom,
            .gf-utility [data-action="day"], [data-utility-close],
            [data-day="return"], #level .case-occurrence, #crumb-trail .here,
            location
  source:   frontend/utilities.js bindPane / reopenUtility / seatUtility;
            frontend/day.js bind (return); frontend/diagnose.js mount /
            restoreEntry
  lock:     HV2-14; ADR 445 points 3, 4 and 7; ADR 414 retention; rulings Q2
            and r1-1(a) to r1-1(c)
  data:     showcase; finding:over_treated_low in the Afternoon preset with its
            first roster Occurrence held (S138's drill), and an entry the story
            logs at 12:07 on the latest recorded day, into its own fresh copy
  evidence: C4_STORIES.S164; reads the served entry and the Day address. On
            the first return it watches from the press for the re-read's GET
            /api/analyze, which the app issues after its own second status
            read, a round trip after the return's status answer. On the second,
            heldStatusReturn holds /api/status while every request is counted
            from the press until the desk settles, so a re-read decided after
            the status answer counts too. Then the held Occurrence, the crumb,
            the address and document.activeElement. The story's control flow is
            pinned on a fake page in frontend/c4.replay.test.js
  status:   branch e68bf5b3 passes at 1280x720 and 1440x900 (the 17-story
            selection: executed 17 · failed 0); base b03431d2 with the
            e68bf5b3 harness laid over it fails at its feature assertion at
            both sizes, "S164 the Day address must name the entry by its id";
            coordinator-run. The complete ledger runs at integration. A first
            branch run, on 0a43c77b, failed at the story's own re-read check:
            heldStatusReturn stops recording at the status answer, before the
            re-read's guidance read. The server log showed that read, and the
            story now watches from the press
```

```
S165 · Carb questions over a drilled Finding case with a window pressed: a
       prompt's Open Day, Close, then Return to Carb questions issues exactly
       one GET /api/status and nothing else; the case and the pressed window
       are unchanged, Carb questions is open with focus on that prompt's Open
       Day control, and the address names the retained case with no title,
       from or focus.
  element:  [data-utility="questions"], .gf-utility [data-action="day"],
            [data-utility-close], [data-day="return"], #seg-window
            [aria-pressed="true"], #crumb-trail .here, location
  source:   frontend/utilities.js reopenUtility / seatUtility; frontend/day.js
            bind (return); frontend/diagnose.js mount (a return naming no case)
  lock:     HV2-34; ADR 414 retention; ADR 445 points 3 and 4
  data:     showcase; as S137 up to its Day return, then the first served
            prompt's Open Day
  evidence: C4_STORIES.S165; heldStatusReturn holds /api/status across Return
            to Carb questions while every request is counted from the press
            until the desk settles, so a re-read decided after the status answer
            counts too. Then it compares the crumb, the pressed window and
            document.activeElement, and the
            address with the retained case as S137 names it (subject and
            Occurrence). The story's control flow is pinned on a fake page in
            frontend/c4.replay.test.js
  status:   branch e68bf5b3 passes at 1280x720 and 1440x900 (the 17-story
            selection: executed 17 · failed 0); base b03431d2 with the
            e68bf5b3 harness laid over it fails at its feature assertion at
            both sizes, "S165 the Carb questions return must issue no request
            besides the held status check"; coordinator-run. The complete
            ledger runs at integration. A first branch run, on 0a43c77b,
            failed at the address: the story compared against the address
            read right after the Diagnose Day return, which still carried that
            entry's date, moment, title and from (ADR 428), not the case the
            plain return names
```

## #442 amendment — 2026-09-23, issue #442

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
from here"); coordinator ruling R442. It covers S157, the S91 amendment below
and the superseded-note wording, and nothing outside #442's checklist. The
decision is ADR 442 in `openspec/changes/archive/2026-09-24-backfilled-record-endings/design.md`.

Base b03431d2b937b46bdabbb2de1e6ba0ba6c6b57b1. Safe start is unchanged:
AGENTS.md's QA copy-then-serve command
(`uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`)
over a committed synthetic `scripts/qa_e2e_cases.py` case store — c4-ic, c4-isf
and c4-profile here, each through `CASE_STORE_DIR`. No real data is read. The
worker ran no server and no browser; every replay below is the coordinator's.

Changed shipped behavior:

- **Every change record ends by one rule.** Each reconcile ends every retained
  change record that has no ending, oldest first: reverted, else superseded by
  the first later detected change outside its own Edit and inside its 28-day
  watch window, else expired unreviewed once that window has passed. An older
  detected change therefore reads its ending in the Changes roster and on its
  record instead of "Still open · Not watched". A saved ending is never
  rewritten.
- **A saved ending reads evidence only up to its ending instant**, the live
  watch's included. A saved assessment whose retained context came from a later
  pump read is served unavailable (`context_after_ending`; its words belong to
  #450).
- **The superseded note names no setting.** It reads "A later setting change
  was detected inside the watch window. This record keeps the period it
  actually observed." instead of claiming the later change was to the same
  setting, which a later change of any setting already contradicted.

S157 is a new app-opener-only story under HV2-28. S91 is amended in prose
below; no story is retired.

```
S157 · An older detected change that a later detected change superseded inside
       its watch window reads its saved ending, never Still open: its Changes
       roster row reads "Superseded by a later change" with its effective time
       and carries no still-open cell; opening it shows the saved ending of kind
       superseded in words with no underscore-token code on that line, a
       saved-ending note that does not claim the same setting, and a periods
       note whose data read-through time is the ending's Finished time.
  element:  table.gf-table [data-record], td.v, [data-record-open="true"],
            [data-record-part="ending"] [data-ending-kind], [data-part="periods"]
  source:   ciq_autotune/watched_change.py reconcile_follow_up /
            _end_open_records / capture_ending; frontend/history.js
            recordRowHtml / endingSection; frontend/follow-up.js periodsSection
  lock:     HV2-28; ADR 442 (openspec/changes/archive/2026-09-24-backfilled-record-endings/design.md)
  data:     c4-ic; its one reconcile records carb-ratio changes on 06-01 and
            06-10. The 06-10 record is the watched, open Trial; the 06-01
            record ends superseded at 06-10 09:00, its saved assessment read to
            that instant
  evidence: C4_STORIES.S157; reads the served roster, picks the Trial row that
            is not the admission's active id and requires its served
            superseded kind, then reads its roster row, opens it by its roster
            press and reads the kind line, the ending part and the periods
            note. It asserts no reason line's words; the complete ledger covers
            the Ending assessment line with #450's words
  status:   base b03431d2 (with the branch harness) fails at its first feature
            assertion at both sizes ("S157 the older Trial row must carry its
            served superseded ending"); branch 782cd552 (application code
            identical to the reviewed head 0b8e22a4) passes at 1280x720 and
            1440x900. The first branch run failed on a story defect, a `has`
            row locator that repeated the table prefix; it was fixed in
            e57c91bd. Coordinator-run 2026-09-24
```

Amended S91 · 2026-09-23 · #442 / Q3 delegation: The story's text is unchanged. Its c4 part's readiness helper compared the page's `[data-readiness]` lines with the retained read, but for an ended record the page prints the saved ending's own assessment, and the two agreed only while an ending's data cutoff was the reconcile instant. The helper now compares the page's lines with the comparison the page shows: the served saved-ending assessment when the selected record's `original.ending.kind` is set, else the retained reassessment. S91's own assertions stay on the retained read: the unit, the required count, more than fourteen elapsed days, criterion met and `unclear`. `retained()` returns what it returned, so S49 is unchanged. c4-isf and c4-profile now save their expiry read to 06-29, where the saved Trial arm counts 27 and 28 and is not met while the retained read counts 30 and 31 and is met, so the frozen helper fails on c4-isf on this branch. The replay reads through the rendered page and imports nothing new. The amended helper is pinned by node tests in `frontend/c4.replay.test.js`; the replay run (`ONLY=S49,S91,S96,S105,S110,S111,S112,S143,R18` at one size) is the coordinator's. Recorded 2026-09-24 (coordinator-run, both sizes): on branch 782cd552, S91 passes as amended, with S157 and the stories above (`ONLY=S157,S49,S91,S96,S105,S110,S111,S112,S143,R18`, `# executed 10 · failed 0` at 1280x720 and 1440x900). The frozen helper's failure on c4-isf is shown in process: the saved Trial arm counts 27 and is not met, while the retained read counts 30 and is met. No replay run of the frozen helper was made.
The preceding wording and results are the attributed pre-amendment record.

Every other desk replay and test that reads these cases keeps its subject:

- **S110, S111, S112 and S143** on edit-chain. Its four hand-saved records move
  14 days later (05-15, 05-22, 05-23, 05-24) with their spacing kept, so every
  watch window ends after the case's 06-01 23:59 data tail and the ending rule
  leaves all four open: one titled three-member Edit, one flat row, four
  still-open cells reading "Not watched", and an unavailable retained
  comparison.
- **S96 and S105** on c3-history and c3-trial, **S49** on c4-missing and **R18**
  on c4-history. None of these records gains or changes an ending (this
  change's premises): c3-history's finished record keeps its saved ending, and
  every other record is its case's open frontier.
- **The desk browser suite's hand-built expired record** is a served fixture
  that no reconcile touches; its saved ending and Later conclusion assertions
  are unchanged.

Additional handler inventory for this amendment:

| Handler / registration | Source | Story |
|---|---|---|
| Reconcile ending rule for every open change record | ciq_autotune/watched_change.py | S157, S91 |
| Superseded saved-ending note | frontend/history.js | S157 |

The ledger header's inventory line, `ACCEPTANCE.md`'s count sentence,
`AGENTS.md`'s registry count sentence, `mockups/INDEX.md`'s row and the release
freeze block are the coordinator's, written once on the integration branch.
`acceptance.py`'s pinned inventory moves to 172 issued · 153 active · 19 retired
on this branch.

## #447 amendment — 2026-09-23, issue #447

S169 and S170 are the fail-first obligations of ADR 447
(`openspec/changes/archive/2026-09-24-retire-verify-language/design.md`). A watched Trial's dock and
Changes' Watch maturity print one day count, the served `days_elapsed`, in the
words Changes already prints. The Guide's "Reading the Diagnose surface" article
names no Verify. Both are app-opener-only, like S139 and S140. Browser execution
belongs to the release coordinator at 1280x720 and 1440x900, each story on a fresh
case store (`CASE_STORE_DIR`). No existing story is amended or retired. No
`★ FROZEN` block and no header inventory line is edited here; the release
coordinator writes the one release freeze block and reconciles the count line and
ACCEPTANCE.md's count sentence.

Sanction: `Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R447`.
It covers the dock's ready-state copy (S169), the Guide article's Cause-lever
line (S170) and this amendment, and nothing outside #447. Changes' locked Watch
maturity strings and its progress-bar clamp are unchanged.

S170's claim is the article's statement that a Focus is followed in Changes,
which is HV2-12's ownership rule ("Changes owns current Plan or Focus, Trial/Focus
progress …"), so HV2-12 is its term. HV2-33 stays second because the lock's
utilities scenario files the Guide under it, as S73 and S73c do. No lock term is
written for Guide article content itself (coordinator ruling F-d).

The pinned inventory in `acceptance.py` `inventory()` moves to 173 issued · 154
active · 19 retired on this branch.

Safe start is unchanged: AGENTS.md's QA copy-then-serve command over the showcase
or a named `scripts/qa_e2e_cases.py` case store.

```
S169 · A watched Trial's dock and Changes print one day count, the served
       days_elapsed. On a complete Trial past its requirement the dock reads
       "Ready to judge — ‹N› days since ‹MM-DD› · ‹R› required" (after the
       Trial's values, which lead the detail line since #451), and Changes'
       Watch maturity figure reads "‹N› days" with "‹R› required". Neither the
       dock's detail nor the Watch maturity figure prints "‹N› of ‹R›" past its
       requirement; only Changes' progress bar clamps. Changes' outcome table
       leads with the Trial's served target metric, marked as its target.
  element:  .inspector > .watch .how, .inspector > .watch .go;
            [data-part="maturity"] .gf-figure, progress[aria-label="Trial progress"];
            .gf-stage-trial [data-table="outcomes"] tbody tr
  source:   frontend/follow-up.js trialDayCount, maturitySection, outcomesTable;
            frontend/watched-change-dock.js watchDockView
  lock:     HV2-24, HV2-12
  data:     c3-trial; the server serves a complete Trial at 15 of 14 days,
            target metric tbr
  evidence: C4_STORIES.S169 → trialDayCount447; reads /api/verify/trials and the
            selected Trial, requiring an active Trial served complete with
            days_elapsed past days_required and one row-keyed target metric as
            premises; opens Diagnose and
            requires the dock's detail to read exactly the ready sentence built
            from the served values; activates the dock's link, requires
            .gf-stage-trial visible, the Watch maturity figure to start with
            "‹N› days" and carry "‹R› required", the progress bar at value ‹R›
            of max ‹R›, and the outcome table's first row to be the served
            target's, marked gf-target
  status:   replays done; renders taken at integration (447-A1 the dock,
            447-B1 Watch maturity, 447-B2 the outcome table, before on
            b03431d2 and after on the release trunk, kept in a private
            design-evidence record). Base b03431d2 with
            this harness laid over it fails at its dock-count assertion ("S169
            the dock must print the served day count in Changes' words"), its
            first content assertion, at both sizes (ed1c29bd harness); branch
            e662c080, code-identical to 2de52828, passes at both sizes
            (1280x720 and 1440x900), as do S46, S73, S139 and S140;
            coordinator-run 2026-09-24. Fake-page controls in frontend/c4.replay.test.js pass on the
            branch's text, reject the base's "14 of 14" at that assertion, and
            reject a TIR-first outcome table at "S169 Changes' outcomes must
            lead with the served target metric tbr" (review ruling RR1)
```

```
S170 · The Guide's "Reading the Diagnose surface" article names no Verify; its
       Cause-lever line says those levers flow to a Focus, followed in Changes.
  element:  [data-utility="guide"], [data-utility-slug="reading-diagnose"], .gf-article
  source:   docs/kb/reading-diagnose.md, served by /api/kb/reading-diagnose;
            frontend/utilities.js guideBody
  lock:     HV2-12, HV2-33
  data:     showcase; the served article carries its ◈ Cause line
  evidence: C4_STORIES.S170 → guideArticle447; reads /api/kb/reading-diagnose and
            requires its ◈ Cause line as a premise, opens the Guide and the
            article, and requires the whitespace-normalised .gf-article text to
            carry no "Verify" and to carry "flow to a Focus, followed in Changes"
  status:   replays done; renders taken at integration (447-C1 the article's
            top, 447-C2 its Cause line, before on b03431d2 and after on the
            release trunk, kept in a private design-evidence record). Base
            b03431d2 with
            this harness laid over it fails at its no-Verify assertion ("S170
            the article must name no Verify") at both sizes (ed1c29bd harness);
            branch e662c080, code-identical to 2de52828, passes at both sizes
            (1280x720 and 1440x900); coordinator-run 2026-09-24. Fake-page
            controls in
            frontend/c4.replay.test.js pass on the branch's article and reject
            the base's "Focus / Verify" line at that assertion
```

Additional handler inventory for this amendment:

| Handler / registration | Source | Story |
|---|---|---|
| Trial day count, both printers | frontend/follow-up.js trialDayCount | S169 |
| Trial outcome table led by the served target | frontend/follow-up.js outcomesTable, comparisonTables; frontend/history.js record view | S169 |
| Watch dock ready line | frontend/watched-change-dock.js watchDockView | S169 |
| Guide authored article | frontend/utilities.js guideBody, docs/kb/reading-diagnose.md | S170 |

## #454 amendment — 2026-09-23, issue #454

S182 is the fail-first obligation of ADR 454 ("A claimed Occurrence's sentence is
served once"): a claimed Occurrence's claimant sentence is served once, as its
cause's text, so the selected block prints it once, on the cause line. The desk is
unchanged; it prints what is served. S182 is app-opener-only, like S148–S150.
Browser execution belongs to the release coordinator at 1280x720 and 1440x900, each
story on a fresh case store (`CASE_STORE_DIR`). No story is amended or retired. No
`★ FROZEN` block and no header inventory line is edited here; the release
coordinator writes the one release freeze block and reconciles the count line.

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from
here"); coordinator ruling R454. It covers S182 and nothing outside #454.

Safe start is unchanged: AGENTS.md's QA copy-then-serve command over a named
`scripts/qa_e2e_cases.py` case store.

```
S182 · Selecting a claimed Occurrence in the Highs after meals Pattern case file
       prints its claimant's sentence once: the served cause carries it as its
       text, the cause line prints it, no other line of the facts list repeats
       it, and the claimant's habit line reads its title and band label only.
  element:  #level .case-facts .vd.cause, .vd.habit
  source:   the served reason (ADR 454); frontend/diagnose-workstation.js
            occurrenceFacts prints what is served
  lock:     none (revise; ADR 454)
  data:     pattern-near-tie; All charts, then pattern:highs_after_meals's event
            case, the matched cohort's first member (three meals, each claimed
            by Carb undercount, which drove each one's episode)
  evidence: C4_STORIES.S182 → assertSentenceOnce454; reads the served detail for
            the selected Occurrence and the rendered facts list. No selection,
            an unclaimed Occurrence or a claimant outside the served habits is a
            premise failure; a line other than the cause line that contains the
            served sentence, or a claimant line that reads more than its title
            and band label, is the feature failure
  status:   base b03431d2 with this harness laid over it fails at its feature
            assertion at both sizes ("S182 the cause's sentence must print once;
            it repeats on: Carb undercount · Meets criteria · …"), not at setup;
            branch b847be7e passes at both sizes (ONLY=S25,S149,S150,S182:
            executed 4 · failed 0). Coordinator-run 2026-09-24
```

Additional handler inventory for this amendment:

| Handler / registration | Source | Story |
|---|---|---|
| Selected Occurrence cause and claimant habit lines, each sentence once | frontend/diagnose-workstation.js occurrenceFacts, over the served reason | S182 |

## #451 amendment — 2026-09-23

S177–S179 are the fail-first obligations of ADR 451
(`openspec/changes/archive/2026-09-24-setting-concern-labels/design.md`): the desk names the
correction factor and the carb ratio in the wearer's words, prints a correction
factor insulin first, says why its concern leads in words, names a recorded
concern by its served name, and lets the watch dock's title name the change
while its values wrap below. They are app-opener-only, like S101–S117, and run on
the manufactured `isf-strengthen` case store, each story on a fresh copy
(`CASE_STORE_DIR`). S177 joins the PR smoke slice, as the only story on that
store. Browser execution belongs to the release coordinator at 1280x720 and
1440x900. No story is amended or retired. No `★ FROZEN` block and no header
inventory line is edited here; the release coordinator writes the one release
freeze block and reconciles the count line.

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R451.
It covers S177–S179, under R451 as corrected, the coordinator's widening of #451
and its plan-review and chunk-review rulings, and nothing outside #451.

Safe start is unchanged: AGENTS.md's QA copy-then-serve command over the case
store `scripts/gen_qa_e2e_db.py --case isf-strengthen` emits.

```
S177 · On a plain arrival at Changes, the Action figure reads the served
       selection's first instruction as "<direction> to 1 U : <recommended>
       mg/dL"; the nameplate and the Action heading say "Ready to stage", then
       "Staged" once the change is staged and "Ready to stage" again after Undo;
       a concern set aside and still on screen reads "Set aside" with no status
       words; the Changes desk prints no mg/dL/U, no ISF and no disposition code.
  element:  .gf-reading .gf-figure; .gf-stage .gf-head .gf-sub;
            .gf-reading .gf-section h3 .meta; .gf-desk
  source:   frontend/changes.js actionLead, concernFrame, leadWords;
            frontend/guidance.js statusWords; frontend/plan.js settingValue
  lock:     none (revise; ADR 451 in openspec/changes/archive/2026-09-24-setting-concern-labels/design.md)
  data:     isf-strengthen; guidance selects pattern:lows_after_correcting_highs,
            eligible_action, carrying the correction factor's served
            "strengthen" instruction
  evidence: C4_STORIES.S177; reads /api/guidance for the served disposition and
            first instruction, compares the figure's text and the two word
            slots, stages and undoes through [data-set="stage"] and
            [data-set="unstage"], then sets the concern aside through the form
            and reads the held seat against the re-read's served set-aside row
  status:   base b03431d2 with this harness laid over it fails at its feature
            assertion at both sizes (the figure reads "strengthen to 32 " with no
            unit), not at setup; branch 995126ad passes at both sizes.
            Coordinator-run 2026-09-24
```

```
S178 · On Diagnose, the correction-factor queue row is titled "Correction factor
       · <served direction>" and its numbers line reads "now 1 U : <current> mg/dL
       → 1 U : <recommended> mg/dL" followed by the row's served scope suffix
       (" · Whole day" for a whole-day row); its panel's heading says
       "Correction factor" and its values read "1 U : <value> mg/dL"; staging
       the value seats the dock's staged title "Correction factor · <served
       direction>" with no
       truncation, and its detail line leads with "1 U : <current> mg/dL → 1 U :
       <recommended> mg/dL", fully visible; the Diagnose desk prints neither
       mg/dL/U nor ISF.
  element:  #level .qrow[data-id="isf"] .lab, .den.nums; #level .slot-head .time;
            #level .numrow b; .inspector > .watch .what, .how; .dw[data-state]
  source:   ciq_autotune/findings_projection.py (title);
            frontend/diagnose-findings-queue.js assertDetail, scopeNote;
            frontend/diagnose-workstation.js renderIsfLevel, renderParamLevel,
            stagedDescriptor; frontend/watched-change-dock.js watchDockView
  lock:     none (revise; ADR 451)
  data:     isf-strengthen; the whole-day correction-factor row asserts
            "strengthen" and stages
  evidence: C4_STORIES.S178; reads the served row from
            /api/diagnose/finding-case-file-preparation, compares the row's
            title, and its numbers line at the queue's rounding followed by the
            served scope suffix from the row's window_scope (" · Whole day"
            here, as the served row is whole-day), with no mg/dL/U; compares the
            panel's heading and values at the panel's rounding, stages through
            the panel, and measures the dock: the title's scrollWidth <=
            clientWidth, and the detail line's box within the dock and the dock
            within the viewport
  status:   base b03431d2 with this harness laid over it fails at its feature
            assertion at both sizes (the row is titled "ISF · strengthen"), not
            at setup; branch 995126ad passes at both sizes, its dock geometry
            included. Coordinator-run 2026-09-24
```

```
S179 · After staging the correction factor and recording the Plan, Changes' "What
       was known" names the recorded concern "Correction factor" with no
       setting: identifier, prints the recorded change as "1 U : <value> mg/dL",
       and prints the recorded explanation, "Correction factor", as recorded.
  element:  .gf-reading .gf-section (What was known) dd, p
  source:   frontend/plan-view.js knownSection; ciq_autotune/api.py
            /api/plan/history subject_titles; ciq_autotune/guidance.py
            subject_title and the setting concern's title
  lock:     none (revise; ADR 451)
  data:     isf-strengthen; Changes stages the served correction-factor
            instruction and records it
  evidence: C4_STORIES.S179; stages and records through the Plan, reads the
            newest record's decision_context from /api/plan/history, and
            compares the section's concern name, change value and explanation
  status:   base b03431d2 with this harness laid over it fails at its feature
            assertion at both sizes (the section prints "setting:isf"), not at
            setup; branch 995126ad passes at both sizes. Coordinator-run
            2026-09-24
```

Additional handler inventory for this amendment:

| Handler / registration | Source | Story |
|---|---|---|
| Changes Action figure, nameplate and Action heading words | frontend/changes.js actionLead, concernFrame; frontend/guidance.js statusWords | S177 |
| Stage and Undo on Changes | frontend/changes.js bind ([data-set="stage"], [data-set="unstage"]) | S177 |
| Set aside on Changes | frontend/changes.js bind (form[data-form="aside"]) | S177 |
| Correction-factor queue row and its panel | frontend/diagnose-findings-queue.js assertDetail; frontend/diagnose-workstation.js renderIsfLevel | S178 |
| Staged dock title and values | frontend/diagnose-workstation.js stagedDescriptor; frontend/watched-change-dock.js watchDockView, paintWatchDock | S178 |
| Plan "What was known" | frontend/plan-view.js knownSection | S179 |

Amended S4 · 2026-09-24 · #451 / Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R451, as widened at #451's whole-diff review (2026-09-24): user copy that reaches the desk joins no clauses with an em dash (ADR 451, "Desk copy carries no prose em dash", `openspec/changes/archive/2026-09-24-setting-concern-labels/design.md`). The persistent advisory line S4 asserts now reads "Advisory only. Review with your clinician before changing pump settings." It replaces the lock's verbatim "Advisory only — review with your clinician before changing pump settings.", which ADR 451 supersedes; the lock carries a dated amendment line under that string. Replay fn S4 compares the new line exactly. Identity, destinations, Log carbs and utilities keep their assertions. This amends one story under the widening; the section's opening "No story is amended or retired" held for S177–S179. Base b03431d2 with this branch's harness laid over it fails S4 at "the advisory line drifted" at both sizes, and branch 678fb544 passes it at 1280x720 and 1440x900; coordinator-run 2026-09-24. S4 runs again on the trunk in the complete ledger, on the commit that is pushed.

No other story's asserted text moved under this widening. S42 reads "Re-key the flagged values on your pump" and "rechecks on the next fetch", and both remain. S142 counts the open ending's `[data-unavailable="ending"]` element, not its words. S153 reads "no direction asserted" in the basal panel, which remains. The findings queue's held-row prefix now reads "no direction asserted: <served reason>"; no story, replay or browser suite reads a held row's reason line. S178 reads only the values that lead the dock's detail line; the staged sentence after them now reads "Staged, not applied: nothing has changed on the pump", one character shorter.

## #460 amendment — 2026-09-24, issue #460

S186 is the fail-first obligation of ADR 460 (`openspec/changes/qa-round-2/design.md`):
the Diagnose watch dock reads the guidance read's served Plan draft when the
surface marks nothing as staged, and the surface's staged marks follow the Plan
draft after a return, a reload and a draft replaced elsewhere. It is
app-opener-only, like S177–S179, and runs on the manufactured `basal-lower` case
store (`CASE_STORE_DIR`). Browser execution belongs to the coordinator at
1280x720 and 1440x900. No existing story is amended or retired. No `★ FROZEN`
block and no header inventory line is edited here; the release coordinator
writes the one release freeze block and reconciles the count line.

Sanction: the AFK run's delegation (2026-09-24), recorded in ADR 460 ("decided
autonomously during AFK run") rather than a quoted operator sentence. It covers
S186 and nothing outside #460. The dock's precedence, its five kind labels, its
"Open Changes ›" route and the staged title, direction and values S178 reads are
unchanged.

The pinned inventory in `acceptance.py` `inventory()` moves to 194 issued · 175
active · 19 retired on this branch.

Safe start is unchanged: AGENTS.md's QA copy-then-serve command over the case
store `scripts/gen_qa_e2e_db.py --case basal-lower` emits.

```
S186 · The watch dock and Diagnose's staged marks follow the Plan draft. Leg 1:
       after Diagnose is opened, the leading concern's action is staged and
       saved in Changes, the change records are opened, and Diagnose is pressed
       in the top nav; the dock reads "Plan · staged" and "Open Changes ›" lands
       on the Plan. Leg 2: the basal run staged from Diagnose still reads
       "Plan · staged" after the same round trip. Leg 3: as leg 2 with a reload
       on the change records and the Plan read held until the Diagnose payload
       has settled; the dock reads "Plan · staged". Leg 4: the staged run's
       draft is replaced through the Plan route by one basal row at a slot the
       analysis does not let stage; on return the run's lane cells carry
       data-staged="false", its control reads "Stage change", and the dock
       reads "Plan · staged" named "Basal ‹that slot›".
  element:  .inspector > .watch .kind, .what, .go; #lane > .lane-cell[data-staged];
            #level .stagebtn
  source:   frontend/watched-change-dock.js watchDockView, draftName;
            frontend/diagnose-workstation.js seedMarks, stageAndSettle, refresh;
            frontend/diagnose.js readPlan, the retained return;
            frontend/guidance.js planDraft
  lock:     none (revise; ADR 460 in openspec/changes/qa-round-2/design.md)
  data:     basal-lower; guidance leads with the lower basal run, which the
            analysis lets stage, beside basal slots it does not
  evidence: C4_STORIES.S186 → LEGS460; each leg clears the draft through
            PUT /api/plan and reloads before it starts. Leg 1 stages through
            [data-set="stage"], [data-set="open-plan"] and [data-set="save-draft"];
            legs 2–4 stage through the lane's lower cell and its .stagebtn,
            waiting for the save and its guidance read; the change records open
            in place as a history step (a saved draft seats Changes on the Plan,
            whose draft has no record door), and on basal-lower, which holds no
            record, they draw their empty frame. Leg 3 holds GET /api/plan from the
            Diagnose press until the desk has settled. Leg 4 reads /api/analyze
            for a basal slot that does not assert. The story runs every leg and
            fails once, naming each failed leg
  status:   base e4862000 with this harness (be5f6abc) laid over it fails
            legs 1, 3 and 4 at their dock or mark assertion ("S186 leg 1: the
            staged dock", "S186 leg 3: the staged dock", "S186 leg 4: the
            replaced run's lane cells must drop their staged mark") and passes
            leg 2, at both sizes; branch be5f6abc passes all four legs at
            1280x720 and 1440x900, as do S97, S98, S99, S113, S139, S140, S147,
            S152, S153, S169 and S178. Renders of leg 3's endpoint, before on
            e4862000 and after on be5f6abc, handed to the coordinator
            uncommitted. Coordinator-run 2026-09-24
```

Additional handler inventory for this amendment:

| Handler / registration | Source | Story |
|---|---|---|
| Watch dock staged line from the served draft | frontend/watched-change-dock.js watchDockView, draftName | S186 |
| Staged marks asked again on refresh and after a settled save | frontend/diagnose-workstation.js seedMarks, stageAndSettle, refresh | S186 |
| Retained return re-reads Plan state and guidance | frontend/diagnose.js readPlan, mount | S186 |

## #459 amendment — 2026-09-24, issue #459

S187 is the fail-first obligation of ADR 459 (`openspec/changes/qa-round-2/design.md`):
before a stage press on Diagnose replaces the change staged for a different
setting, the stage control says so and names the change it will replace. It is
app-opener-only and runs on the manufactured `basal-and-carb-ratio-lower` case
store (`CASE_STORE_DIR`), where a basal slot and the carb ratio both assert a
move. S187 joins the PR smoke slice, as the only story on that store. Browser execution belongs to the coordinator at 1280x720 and 1440x900. No
existing story is amended or retired. No `★ FROZEN` block and no header
inventory line is edited here; the release coordinator reconciles them.

Sanction: Connor Griffin, 2026-09-24: one setting per Plan stays; warn before
the press, naming the change it will replace (the issue's option 1). The words
and the button geometry are ADR 459's autonomous decisions. It covers S187 and
nothing outside #459.

The pinned inventory in `acceptance.py` `inventory()` moves to 195 issued · 176
active · 19 retired on this branch.

Safe start is unchanged: AGENTS.md's QA copy-then-serve command over the case
store `scripts/gen_qa_e2e_db.py --case basal-and-carb-ratio-lower` emits.

```
S187 · With the carb ratio's change staged from Diagnose, the basal slot's stage
       control reads "Replace staged change" with the sub-line "replaces
       ‹the dock's name for the carb-ratio change›" before any press. Pressing
       it leaves the served Plan draft holding only basal rows and the dock
       reading "Plan · staged" named for the basal change. Opened again in the
       same visit, the carb ratio's control carries data-staged="false" and
       reads "Replace staged change" naming the basal change, never
       "Staged · Undo".
  element:  #level .stagebtn, #level .stagebtn .sub; .inspector > .watch .kind, .what
  source:   frontend/diagnose-workstation.js renderParamLevel, replacing;
            frontend/diagnose.js replacing; frontend/plan-view.js replacesDraft,
            replacedDraftItems, stageEvidence; frontend/watched-change-dock.js draftName
  lock:     none (revise; ADR 459 in openspec/changes/qa-round-2/design.md)
  data:     basal-and-carb-ratio-lower; basal 03:00 and the all-day carb ratio
            both assert a lower move
  evidence: C4_STORIES.S187; at 24 h opens the carb-ratio queue row and stages
            it through its .stagebtn, waiting for the save and its guidance
            read, and reads the dock's name for it; opens the lane's lower cell
            and compares its control's words and sub-line; presses it, reads
            /api/plan and the dock; reopens the carb-ratio row and compares its
            control. The checks are gathered and the story fails once
  status:   task 11's commit 6c47967f with this harness (f0e807b1) laid over
            it fails at its feature assertions at both sizes, first "S187
            before the press, the basal control must read "Replace staged
            change"" (it read "Stage change"), then "S187 the carb-ratio
            control must read "Replace staged change""; branch f0e807b1 passes
            at 1280x720 and 1440x900, as do S186, S97, S98, S99, S113, S139,
            S140, S147, S152, S153, S169 and S178. Renders of the basal control
            before the press and of the dock after the replacement, before on
            6c47967f and after on f0e807b1, handed to the coordinator
            uncommitted. Coordinator-run 2026-09-24
```

Additional handler inventory for this amendment:

| Handler / registration | Source | Story |
|---|---|---|
| Stage control replace state | frontend/diagnose-workstation.js renderParamLevel, replacing | S187 |
| Replaced-draft verdict | frontend/plan-view.js replacesDraft, replacedDraftItems; frontend/diagnose.js replacing | S187 |
