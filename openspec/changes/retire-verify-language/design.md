# Design — #447

## ADR 447 — The watch dock and Changes print one Trial day count

### Context

Base: `origin/main` b03431d2. Everything below was read or run on it.

- **One served count.** The dock reads `/api/outcomes/trend?window=30` →
  `watched_change` (`frontend/diagnose.js:175–183`). Changes' follow-up reads
  `/api/verify/trials?kind=trial&selected=<id>` → `selected`. Both are built by
  `watched_change._retained_trial` (`active_watched_change`, `review_trials`,
  `follow_up_admission`). That builder calls `_maturing(start, min(now, start +
  14 d), 14, data_times)`, which counts distinct data dates in `(start, end]` and
  sets `is_maturing = days_elapsed < days_required`. The dock's payload serves
  `maturing.{is_maturing, days_elapsed, days_required}`. Changes' payload serves
  `state` (`maturing` | `complete`, from the same `is_maturing`),
  `maturing.{days_elapsed, days_required, gap_count}` and `readiness.label`
  ("Maturing" / "Ready to judge"). So the served readiness rule reads exactly one
  count, `days_elapsed`.
- **Why 15.** A change at 00:00 or mid-day makes `(start, start + 14 d]` touch
  15 calendar dates, so a completed Trial serves `days_elapsed` 15 against a
  requirement of 14. `tests/test_outcomes_trend.py`
  `TrialWindowInvarianceTest.test_trend_and_roster_count_the_same_bounded_days`
  already pins 15 on both reads, and passes on the base.
- **Two printers.** `frontend/watched-change-dock.js:78` prints
  `Math.min(days_elapsed, days_required)` as "‹n› of ‹R›". Its comment justifies
  that by pointing at Changes' progress bar. `frontend/follow-up.js`
  `maturitySection` prints the served count. It picks its form with a browser
  comparison, `days_elapsed >= days_required`, although its own module header
  says no browser count comparison supplies readiness. Only its `<progress>`
  clamps.
- **Changes' words are locked.** The desk lock manifest
  (`mockups/harmonic-v2-desktop.lock.md` "Verbatim strings") fixes Changes'
  figure: still maturing `<elapsed> of <required> days`; criterion met
  `<elapsed> days` with `<required> required · <gap_count> data gaps`; "`15 of
  14 days` must not return" (the B-08 repair, ledger S46). The dock's Trial
  detail line is not a locked string. Its lock terms 46–49 fix the kind labels,
  the reserve and the wrap, and it is pinned only by
  `frontend/watched-change-dock.test.js`.
- **Reproduced three ways on the base.** (1) Node:
  `docs/scope/447-day-count.repro.mjs` renders both shipped printers over the
  served pair and exits 1: dock "Ready to judge — 14 of 14 days since 05-15",
  Changes "15 days · 14 required · 0 data gaps". (2) Backend: the test named
  above serves 15 on both reads. (3) The manufactured `c3-trial` case store,
  which ledger story S139 already runs on, read in-process through the public
  routes (`docs/scope/447-day-count.repro.py`): the dock read serves
  `{is_maturing: false, days_elapsed: 15, days_required: 14}` for a basal 03:00
  change at `2024-05-15 00:00:00`. The Changes read serves `state: complete`,
  `{days_elapsed: 15, days_required: 14, gap_count: 0}`, "Ready to judge".

### Decision

1. **The printed count is the served `days_elapsed`.** It is the one count the
   served readiness rule compares with `days_required`. Neither surface clamps,
   rounds or re-derives it. A clamp may shape Changes' progress bar, never a
   printed number (R447).
2. **The form follows the served verdict, in the words Changes already
   prints.** While maturing: "‹n› of ‹R› days". Once ready: "‹N› days" with
   "‹R› required". The dock reads the served `maturing.is_maturing`. Changes reads
   the served `state` and stops comparing counts. The two verdicts are one
   backend fact (`view.maturing.is_maturing`), so the surfaces cannot pick
   different forms.
3. **Dock copy.** Maturing is unchanged: "Maturing — ‹n› of ‹R› days since
   ‹MM-DD›", with the emphasised part "‹n› of ‹R›". Ready becomes "Ready to judge
   — ‹N› days since ‹MM-DD› · ‹R› required", with the emphasised part "‹N›". The
   dock takes Changes' ready-state words ("‹N› days", "‹R› required") and keeps
   its own lead and its "since ‹MM-DD›" anchor. No kind label, Trial title, route
   or other dock state changes.
4. **One printer.** `frontend/follow-up.js` exports one function that returns
   the count words from a served `maturing` object and a served "ready" verdict.
   `maturitySection` and `watchDockView` both print through it. A second
   implementation of this fact is exactly how the two surfaces diverged. The
   dock importing from the follow-up module adds no import cycle: only
   `diagnose-workstation.js` imports the dock, and nothing reachable from
   `follow-up.js` (`client.js`, `frame.js`, `plan-view.js`, `routes.js`,
   `verify-workstation-chart.js`) imports either of them.

### Alternatives considered

- **Clamp both surfaces to 14.** Rejected. R447 names the served count, and
  Changes' "15 days" is a locked string.
- **Print "15 of 14 days" on the dock.** Rejected. It is the B-08 form the lock
  and S46 forbid.
- **Cap the served count at 14 dates in `_maturing`.** Rejected. It moves the
  served readiness rule and every consumer of `days_elapsed`, and R447 names the
  count the rule reads, not a new count.
- **Drop the dock's "since ‹MM-DD›".** Not taken. It is an unchanged anchor, and
  R447 rules only on the count.

### What this does not reach

Changes' Trial view also prints each comparison period's own elapsed days under
"Evidence accrued" (`readinessArm`, served
`comparison.readiness.{before,after}.elapsed_days`). On `c3-trial` the Trial
period reads about 18 days, because its bound runs to the data tail. That is the
evidence-readiness fact HV2-24 keeps separate from watch maturity, under its own
label. R447's "day count for a Trial" is read as the watch-maturity count behind
"Maturing" / "Ready to judge", so it stays as it is. The release coordinator is
asked to confirm this reading.

### Sanction

`Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R447`.
It covers the dock's copy change and the ledger amendment adding S169.

### Risk contract

- **Must prevent:** the dock and Changes printing different day counts for one
  served Trial. Any printed "‹N› of ‹R›" with ‹N› > ‹R›. A frontend rule that
  re-derives readiness, maturity or the count instead of reading the served
  facts. Any change to a served payload, `_maturing`, the readiness rule, a
  staging predicate, cap or floor. Real glucose, insulin or schedule values in
  any committed test, fixture, capture or comment. Plus the defaults: secret
  exposure, irreversible loss of authoritative data, and silent incorrect
  success.
- **Must recover:** nothing automatic; both printers are stateless renders of
  served payloads.
- **Accepted failure:** none new.
- **Unsupported:** viewports other than 1280×720 and 1440×900; real-data stores.
- **Evidence owed:** node tests over one served Trial showing both printers print
  the same count and requirement in the maturing, just-ready (14 of 14) and
  15-date states. The backend test gains the served `state` assertion. S169 at
  both sizes fails at its dock-count assertion on the base with the branch's
  harness laid over it, and passes on the branch. S46, S139 and S140 still pass
  on the branch at both sizes. Base and branch renders of the dock on `c3-trial`
  at both sizes show the ready line wrapped inside the dock's reserve and never
  ellipsized (term 49).
- Why: watch maturity is lifecycle metadata, not dosing guidance. The harm is a
  reader told two different things about one change. Disposition: admitted into
  this design.md unchanged.

### Consequences

- The desk ledger gains S169. The pinned inventory literals move with S170 to
  173 issued · 154 active · 19 retired.
- `frontend/watched-change-dock.test.js`'s two tests that pinned "14 of 14" for
  a ready Trial are rewritten to the served count.

## ADR 447 — Verify leaves the live language

### Context

#416 retired v1's Verify surface, and ADR 397 gives Trial and Focus progress to
Changes. #429 already re-pointed the watch dock. Its proposal left "the Verify
residue outside the dock, in CONTEXT.md, the surfaces specification and a backend
test comment" to a separate issue, which is #447. R447 retires Verify from those
three places, and the coordinator widened the sweep to every live-surface mention
outside archived changes, frozen ledger blocks and `docs/scope/` history.

### Decision

1. **What counts as live.** Live means text that describes Verify as a surface,
   tab, workstation, hero, digest, footnote, roster or destination the reader has
   now, or as the present consumer of a fact. It covers the domain and product
   documents, the served Guide articles, the living specifications, and code,
   test, script, generator and CI comments and docstrings. Every such line is
   re-pointed at what the shipped desk does: Changes' Trial and Focus views, the
   watch dock, or the named endpoint.
2. **What stays, by class.** Seven classes stay:
   - negative assertions (text asserting the desk names no Verify);
   - retirement pointers (past tense, naming #416 or v1);
   - identifiers (`/api/verify/*`, `fetchVerifyTrials`,
     `verify-workstation-chart.js`, `verify-660-story.synthetic`,
     `gen_verify_payload.py`, `test_verify_*.py`, `/verify` in retired-path
     lists);
   - dated or frozen records (archived and unarchived OpenSpec changes,
     `docs/scope/`, the ledger's frozen blocks and dated amendments, the lock
     manifest, `mockups/INDEX.md` rows, exploration review documents, measurement
     tables, a dated payload-version log entry);
   - locked prototype source and runtime strings (ADR 397: executable mock bytes
     and runtime strings stay unchanged);
   - generated copies, which follow their source;
   - generic uses of the verb.

   Unarchived OpenSpec changes count as records. Their designs are dated
   decision records, their tasks are completed checklists, and editing them from
   this ticket would rewrite other tickets' history.
3. **Concepts whose only renderer was Verify.** Digest, Localized outcome and
   Tracked candidate have no Changes counterpart, so they are not re-pointed at
   Changes. Each keeps its definition. The Verify placement is replaced with a
   statement that no desk surface renders it since #416, following CONTEXT.md's
   own precedent for the retired exposures browse (#500: "Until that work ships,
   nothing renders the full population"). Their backend producers still serve
   (`/api/outcomes/trend` `overnight_lows.cleared`, `/api/pattern-sweep`); this
   change leaves them alone.
4. **Specifications.** In surfaces, the Verify requirement is REMOVED and
   replaced by an ADDED Changes requirement that describes only what Changes
   renders; outcome trends and behavior-trend tiles are not claimed. The
   behavioral-layer requirement is MODIFIED, and only its two Verify phrases
   change. The http-api Purpose paragraph is edited in place, because a delta
   cannot carry Purpose prose and archive commits here fold requirement deltas
   only.
5. **The Guide.** The served `docs/kb/reading-diagnose.md` Cause-lever line is
   edited. The Guide's preface for authored articles ("Written for the v1 tabs:
   Diagnose keeps its name here, Plan reads as Changes.") is a locked verbatim
   string (lock manifest, re-settled under ADR 397), so it stays. Mapping
   Verify there would re-settle a locked term for one line of article text.
6. **Adjacent v1 text inside a re-pointed sentence.** README's "Web UI"
   paragraph and DESIGN.md's Navigation bullet describe the v1 shell around their
   Verify word: four surfaces, eight tabs and a Guide tab. Removing Verify alone
   would leave a false count. Each is re-grounded on the shipped desk: three
   destinations (Diagnose, Changes, Day, ADR 397) and the utility strip. The
   DESIGN.md left-tab bullet's "in-flight Verify redesign" clause is re-grounded
   too, because the `.card h2::before` accent no longer ships in `frontend/`.
7. **Not touched, and reported.** `openspec/specs/qa-e2e-database/spec.md`
   "Remaining consumers migrate before revise-E2E retires" names a "Verify
   behavior replay". That is a test harness #416 deleted, beside two others
   #416 also deleted, inside a completed #319 migration contract whose CI server
   step #416 removed too. Rewriting it is QA-database contract work, not Verify
   wording, so it stays a record and is reported to the release coordinator as
   a finding.

### Closed inventory at the base

The residue command is:

```sh
git grep -n -I -w Verify -- . ':!openspec/changes' ':!docs/scope' ':!mockups/sweep/harmonic-v2-desktop/captures'
```

On b03431d2 it prints 105 lines. The captures directory has none. Each line is
listed below by `path:line` and class, with the disposition for re-pointed lines.

**Re-point (53 lines).** A re-pointed line names no Verify afterwards. The one
exception is the two `verify-workstation-chart.js` header lines, which may keep
it as a retirement pointer.

| Line | Now | Becomes |
| --- | --- | --- |
| `CONTEXT.md:588` | "A Verify outcome card that carries a *where*" | "An outcome that carries a *where*". A closing sentence before `_Avoid_` says no desk surface renders one since #416 retired the v1 card |
| `CONTEXT.md:609` | "The lead story at the top of Verify" | "A lead story". A closing sentence says no desk surface renders a Digest since #416 retired the surface it led |
| `CONTEXT.md:621` | "the Verify footnote reports the sweep's result…" | Nothing in the desk reports the sweep since #416 retired that footnote; the sweep is served at `/api/pattern-sweep` |
| `CONTEXT.md:671` | "Verify surface shows a clean before/after…" | "Changes shows a clean before-and-Trial comparison anchored to the change date" |
| `CONTEXT.md:675` | "the before/after Verify foregrounds" | "the before-and-Trial read Changes puts first". Overall TIR stays: the served comparison carries `tir` beside the mapped outcome |
| `CONTEXT.md:689` | "Verify tracks it in **two dimensions**" | "Changes follows it in **two dimensions**" |
| `CONTEXT.md:701` | "(foregrounded in Verify)" | "(led by Changes and reported in the watch dock)" |
| `CONTEXT.md:709` | "from Diagnose through Verify" | "from Diagnose through Changes" |
| `CONTEXT.md:723` | "verified (Verify is a tab, not a Plan state)" | "verified" joins the confirmed synonyms: "applied, entered or verified (for confirmed)" |
| `CONTEXT.md:733` | "the dock and Verify count the same days" | The dock and Changes print the same served count, the one the readiness rule compares with the 14 required, and a clamp may shape Changes' progress bar, never a printed number |
| `CONTEXT.md:739` | "(Maturing on Verify / the outcomes trend…" | "(Maturing in Changes, the watch dock and the outcomes trend; Settling on the analyze family)" |
| `README.md:119` | "Verify trials" in the route sample | "the Trial roster (`/api/verify/trials`)" |
| `README.md:234` | the Verify bullet in "Four working surfaces" | The paragraph is re-grounded on the desk: three destinations (Diagnose, Changes with its Plan, Day) and the utility strip (Log carbs, Questions, Guide, Settings, Glossary, and Pump settings from Changes) |
| `PRODUCT.md:13` | "**Verify** ("I changed settings last week, did it help?" → outcome trends)" | "**Changes** ("I changed settings last week, did it help?" → the watched Trial's or Focus's before-and-after)" |
| `PRODUCT.md:62` | "Diagnose / Verify / Day" | "Diagnose / Changes / Day" (ADR 397) |
| `DESIGN.md:280` | Navigation bullet: 8 flat tabs collapsing to Diagnose/Verify/Day | The shipped `.v2-nav`: three destination buttons (Diagnose, Changes, Day), the current one marked by `--ck-text` with a `--ck-accent` border (`frontend/chrome.css:27–29`) |
| `DESIGN.md:302` | "the in-flight Verify redesign has already dropped it" | The `.card h2::before` left-tab no longer ships in `frontend/`; the rule against reintroducing the stripe stays |
| `docs/kb/reading-diagnose.md:20` | "flow to Focus / Verify, because" | "flow to a Focus, followed in" / "Changes, because no pump setting fixes them." (two lines, as now) |
| `openspec/specs/surfaces/spec.md:117, 121, 123` | Verify requirement | REMOVED by this change's delta. The lines stay on the branch until archive |
| `openspec/specs/behavioral-layer/spec.md:265, 287` | "Verify behavior-trend roster" | MODIFIED by this change's delta. The lines stay on the branch until archive |
| `openspec/specs/http-api/spec.md:10` | "the Plan, Diagnose, Verify, and the store" | "the Plan, Diagnose, Changes, and the store" (Purpose, edited in place) |
| `ciq_autotune/outcomes_trend.py:96, 521` | "the only outcome the Verify digest can gate on / headline" | "the only outcome a day-level headline could gate on (adr-365 §2); no desk surface reads `cleared` since #416" |
| `ciq_autotune/trial_evidence.py:1, 5` | "the Verify workstation renders", "the ★ LOCKED Verify surface's data-bindings contract" | "served with a selected Trial's detail, which Changes' Trial view renders"; "the locked v1 mock's data-bindings contract (#660)" |
| `ciq_autotune/watched_change.py:57, 507` | "the dock and the Verify roster" | "the dock and the Trial roster (`/api/verify/trials`) that Changes reads" |
| `ciq_autotune/watched_change.py:801, 817` | "private Verify candidate", "Verify instead keeps" | "retained Trial candidate on the roster", "The Trial roster instead keeps" |
| `ciq_autotune/watched_change.py:1226` | "The Verify workstation's paired reads (#660)" | "The selected Trial's paired reads (#660), which Changes' Trial view renders" |
| `frontend/data.js:190` | "Verify Trial roster (#587)" | "Trial roster (#587)" |
| `frontend/data.js:400` | "Verify uses this to resolve the active Focus's id…" | Names its current callers (`focus-entry.js` and `follow-up.js`, reached through `client.js`) and what they read it for |
| `frontend/data.js:419` | "#246 Diagnose's "Pin as Focus → Verify" disposition" | "#246's Pin as Focus disposition" |
| `frontend/desk-behavior.replay.mjs:1404` | "the shipped Verify hero drew no canvas" | "the Trial hero drew no canvas". The assertion message only; the assertion is unchanged |
| `frontend/diagnose-workspaces.js:43` | "(or Verify trial)" | "(or the Trial it opens)" |
| `frontend/follow-up.js:119, 368` | "the shipped Verify hero" | "the shipped Trial hero (`verify-workstation-chart.js`)" |
| `frontend/verify-workstation-chart.js:1, 13` | "Verify workstation hero", "Verify story hero" | "Trial comparison hero, ported verbatim from the retired v1 Verify workstation's locked mock; Changes' Trial stage draws it" |
| `scripts/check_demo_fixtures.py:5` | "the Verify workstation's `verify-660-story.synthetic/`" | "the Trial roster capture `verify-660-story.synthetic/`, which the desk replay and browser suite read" |
| `.claude/qa/gen_verify_payload.py:1` | "the Verify workstation's replay fixtures" | "the Trial roster replay fixtures" |
| `.github/workflows/ci.yml:85` | "(Verify, Diagnose)" | "(`verify-660-story.synthetic`, `diagnose-workstation.synthetic`)". Comment only |
| `tests/test_outcomes_trend.py:1292` | "The Verify digest headlines…" | A comparison's day-rate outcome reads favorable or concerning only when… (`follow_up_comparison.py` `nights_with_low`) |
| `tests/test_outcomes_trend.py:1349, 1375` | "ahead of Verify's bounded one", "the dock and Verify report the same count" | "ahead of the roster's bounded one", "the dock and Changes read the same served count" |
| `tests/test_scenario_engine.py:1151` | "Reporting the low in Verify does not suppress" | "Reporting the low as an outcome does not suppress". Same line count, because scan acknowledgements are pinned below it |
| `tests/test_trial_evidence.py:1`, `tests/test_verify_trials.py:1`, `tests/test_verify_block_ic.py:3`, `tests/test_gen_verify_payload_block_ic.py:1` | "Verify workstation's", "Verify Trial roster", "Verify roster", "Verify-fixture generator" | "the selected Trial's", "Trial roster", "Trial roster", "Trial-roster fixture generator" |

**Generated (1 line).** `mockups/harmonic-v2.exploration/utilities.json:16`
embeds `docs/kb/reading-diagnose.md`. Regenerating the exploration removes it.

**Keep (51 lines).**

| Class | Lines |
| --- | --- |
| Negative assertion | `frontend/c4.replay.mjs:82`; `frontend/c4.replay.test.js:1398, 1402`; `frontend/watched-change-dock.test.js:140, 151`; `openspec/specs/surfaces/spec.md:1493, 1502, 1511` |
| Retirement pointer | `frontend/diagnose-workstation.css:1979`; `frontend/follow-up.js:425`; `frontend/theme.css:201`; `mockups/_theme-app.css:696` |
| Frozen or dated record | `DESIGN.md:117` (a past-tense lesson); `ciq_autotune/outcomes_trend.py:92` (the v6 payload-version log); `mockups/harmonic-v2-desktop.behavior.md:428, 1223, 1227, 2335, 2435` (the 2026-09-08 frozen contract), `:3101, 3120, 3131, 3137, 3146, 3158, 3163` (#429's dated amendment and its negative assertions); `mockups/harmonic-v2-desktop.lock.md:20, 660, 753, 754, 755, 756, 757` (the lock manifest's predecessor rows and evidence); `mockups/INDEX.md:33, 34, 127, 140, 148`; `mockups/harmonic-v2.exploration/BRIEF.md:58`, `FABLE-LEAD.md:693`, `REVIEW.md:47, 189`; `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md:237` (measurement table); `openspec/specs/qa-e2e-database/spec.md:378` (the completed #319 migration contract; reported) |
| Locked prototype | `mockups/_shell.js:37`; `mockups/harmonic-v2-glucose.js:154, 577, 599`; `mockups/harmonic-v2-guided.js:71`; `mockups/SCAFFOLD.md:25` |
| Generic verb | `tests/test_classifier_suspend.py:248` |

After the change, the command prints the 51 keep lines, the five delta-superseded
spec lines, at most the two `verify-workstation-chart.js` pointer lines, and the
new negative-assertion lines this change adds. Those are in the #447 ledger
amendment, `frontend/c4.replay.mjs`, `frontend/c4.replay.test.js`,
`frontend/watched-change-dock.test.js` and `tests/test_api.py`. The executor's
receipt classifies every printed line into one of these classes. CONTEXT.md is
strict: `git grep -n -w Verify -- CONTEXT.md` prints nothing.

### Traps

- `scripts/public_scan_config.txt` acknowledges dose-ratio findings by
  `path:line`. The pins at `CONTEXT.md:77, 99, 501` and `DESIGN.md:163, 181, 183`
  all sit above this change's edits, so leave `DESIGN.md:117` alone. In
  `tests/test_scenario_engine.py` the pins at 1245 and below sit under the edit
  at 1151, so that comment is reworded without adding or removing a line.
- `follow_up_comparison._execution()` stamps a `code_version` hashed over every
  `ciq_autotune/*.py`. The exploration's `focus.json` and `journey.json` carry
  it, so any backend comment edit moves them. The QA showcase carries none.
- The public tree ships CONTEXT.md, README, PRODUCT.md, DESIGN.md, `docs/kb/`
  and `openspec/specs/`. None of their new text may point into `docs/scope/` or
  another excluded path (`scripts/check_public_links.py`).
- `frontend/routes.js` keeps `destination` as module state. A node test that
  navigates resets it with `navigate('diagnose')` in its `finally`.

### Safe start (UI Craft revise §0)

- Declaration: `AGENTS.md`, "The data boundary". The one permitted offline serve
  copies `mockups/qa-e2e.synthetic/harmonic.sqlite` to a scratch path, runs
  `npm ci && npm run build`, and runs `uv run harmonic serve --no-fetch --token ''
  --db "$scratch" --port 8765`. A named case store emitted by
  `uv run python scripts/gen_qa_e2e_db.py --case <name> --out <scratch path>`
  replaces the copy source.
- Data: manufactured only. The replay serves `c3-trial` for S169 and the
  `showcase` for S170, through `frontend/replay-cases.mjs`, each generated by
  `scripts/gen_qa_e2e_db.py` from `scripts/qa_e2e_cases.py`.
- Route: `ui-craft` `route.mjs --embodiment shipped --runnability runnable
  --declaration complete --data-source manufactured` → `revise`. Per the release
  brief, the frozen ledger and replay are the existing contract and no sweep is
  re-run. The release coordinator runs every port-bound leg.

### Sanction

`Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R447`.
It covers the Guide article's copy change and the ledger amendment adding S170.
