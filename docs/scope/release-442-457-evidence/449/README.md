# #449 and #450 synthetic evidence

Everything here is synthetic. Every capture and replay log comes from committed manufactured
QA recipes (`scripts/qa_e2e_cases.py`) or the committed showcase, served by the offline
no-fetch app (`--no-fetch --token ''`); the desk browser suite answers from synthetic payloads
written in its own driver. No personal database, operator screenshot or real-data payload is
included. The release coordinator ran every port-bound leg serially; the ticket worker bound
no port. Absolute paths in the logs are replaced with `<base worktree>`, `<ticket worktree>`,
`<release worktree>`, `<scratch>` and `$TMPDIR`.

Change: `focus-served-words` (OpenSpec), archived with the release. #450 has no change of its
own: it is worked in this one. Ticket branch head at integration: `e6090d25`, the second
parent of trunk merge `f6e572a4`. Every branch leg ran on `b0ad8a6c`; `e6090d25` adds only the
ledger's recorded results and the tasks.md ticks on top of it, and changes no harness or
shipping file.

Stores: `c3-focus` serves S93, S173 and 449-A1/449-A2 (an active Pattern Focus titled Highs
after meals watching Late bolus, with both Pattern arms served ready). `c3-preempted` serves
S174, S176 and 449-B1 (a Focus ended by hand whose saved ending is unavailable
`unavailable_adherence`), and 449-C1/449-C2 (an `overnight_drift` record whose served behavior
name is null). `c4-history` serves S175 and 449-D1 (a preempted Focus record whose Before
behavior arm was measured 0 of 4, with a readiness arm still collecting). `c3-trial` serves
the amended S46, S91 (its c3 part) and S92, whose readiness arms are served collecting.
`c4-ic`, `c4-isf` and `c4-profile` serve S91's setting-arm variants. The follow-up browser
leg also replays the other C3 stories on `c3-history`, `c3-pin` and `c4-missing`, which this
change leaves as they were.

## Requirement map

| Requirement (spec, ADDED/MODIFIED/REMOVED) | Stories | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| A refused change write serves a sentence beside its code (http-api, ADDED) | — | `tests/test_durable_follow_up.py` `DurableApiTest.test_durable_lifecycle_refusal_names_its_reason_in_a_sentence`, `DurableApiTest.test_every_lifecycle_refusal_code_has_a_sentence` | — (backend pytest; see Recorded results) | — |
| The Focus read names the watched behavior (surfaces, ADDED) | S173, S176 (each reads the served `lever_title`) | `tests/test_durable_follow_up.py` `DurableApiTest.test_selected_focus_read_names_its_watched_behavior` | `logs/449-branch-*.log`, `logs/449-base-*.log` | — (a read; its name shows in the rows below) |
| A Focus names its watched behavior by its served name (surfaces, ADDED) | S173 | `frontend/follow-up.test.js` "the behavior row names a sequence habit by its served name, never its key", "the behavior row names a Focus the way its own served name does", "with no served name the behavior row says so and prints no key"; `frontend/follow-up-lifecycle.test.js` "an active Focus names its served behavior in its intent and its behavior row, never its key", "an active Focus with no served behavior name omits the watches paragraph rather than print its key"; `frontend/c4.replay.test.js` "S173 passes when the active Focus names its served behavior and its verdicts in words", "S173 fails at its feature assertion on the base server shape, never a premise", "S173 fails when the row prints the lever key or the Pattern title…", "S173–S176 are unique app-only #449 stories with their required manufactured cases" | `logs/449-branch-*.log`, `logs/449-base-*.log` | `renders/after/449-A1-*.png`, `renders/after/449-A2-*.png` |
| Every served reason on a watched-change line prints in words (surfaces, ADDED) | S174, S175; amended S46, S91, S92 | `frontend/follow-up.test.js` "every comparison reason has plain words, and an unknown code prints as served", "every measurement reason on a behavior cell prints in words and keeps its measured count", "an unavailable harm cell names its reason in words", "every arm’s Not met line names its served reason in words", "a Pattern opportunity line names its verdict and its reason in words"; `frontend/history.test.js` "a saved ending keeps its kind, its times and the wearer’s own words", "a backfilled ending whose context postdates it names that reason in words", "an unavailable original context states its served reason in words"; `frontend/follow-up-lifecycle.test.js` "an unreconciled store says what Changes is waiting for in words"; `frontend/c3.replay.test.js` "S46 reads a served readiness reason in words…"; `frontend/c4.replay.test.js` "S174 passes when a saved Focus ending and its record lines print every served reason in words", "S174 fails at its feature assertion when the saved ending prints its served code", "S174 fails when a harm cell, a Not met line or an opportunity line prints a served code", "S175 passes when an unmeasured behavior cell names its reason in words and keeps its count", "S175 fails at its feature assertion when the behavior cell prints its served code", "S175 fails when the measured count is dropped or the collecting arm prints its code" | `logs/449-branch-*.log`, `logs/449-base-*.log`, `logs/449-followup.log` | `renders/after/449-B1-*.png`, `renders/after/449-C1-*.png`, `renders/after/449-D1-*.png` |
| Served states, verdicts, modes and denominators on watched-change lines print as words (surfaces, ADDED) | S173, S174; amended S93 | `frontend/history.test.js` "a saved ending that was assessed reads its recorded state as a word", "an available current-policy result names its mode and its state in words"; `frontend/follow-up.test.js` "a Pattern opportunity line names its verdict and its reason in words", "a correction-stacking Focus names its denominator in words"; `frontend/c3.replay.test.js` "S93 reads a Pattern arm’s opportunity verdict as a word…" | `logs/449-branch-*.log`, `logs/449-base-*.log`, `logs/449-followup.log` | `renders/after/449-A2-*.png`, `renders/after/449-B1-*.png`, `renders/after/449-D1-*.png` |
| The Focus entry words why a Focus is not offered (surfaces, ADDED) | — | `frontend/focus-entry.test.js` "the entry page says in words why a Focus is not offered, never the served code"; `frontend/guidance.test.js` "Focus admission copy translates known backend tokens without inventing admission" | — | none (the optional withheld-copy shot is unreachable on either tree; see Renders) |
| A refused change write reads as a sentence on the desk (surfaces, ADDED) | — | `frontend/follow-up.test.js` "a failed write keeps the wearer’s words and offers a Retry, recording nothing"; `frontend/follow-up-lifecycle.test.js` "a refused finish prints the served sentence, never its code and status", "an exact expired Trial records a later conclusion through the public client, retries, and reloads its immutable record", "a coded refusal of a reassessment read prints its sentence with exactly one full stop"; `frontend/focus-entry.test.js` "a refused pin prints the served sentence once, with one full stop before the confirmation line"; `frontend/data.test.js` "structured non-2xx detail preserves status and code on a typed error" (the Plan and pin lines print the client's `error.message`) | — | — |
| Change records word their served facts (surfaces, MODIFIED) | S176 | `frontend/history.test.js` "a Focus changed no setting, and its record says that rather than showing a blank table", "a Focus whose behavior is no longer a lever says so…", "an unavailable original context states its served reason in words"; `frontend/c4.replay.test.js` "S176 passes when each Focus record names its served behavior and the nameplate keeps its title", "S176 fails at its feature assertion on the base server shape, never a premise", "S176 fails when What changed names the Pattern title…" | `logs/449-branch-*.log`, `logs/449-base-*.log` | `renders/after/449-B1-*.png`, `renders/after/449-C2-*.png`, `renders/after/449-D1-*.png` |

No requirement is removed. The Plan record and withdraw failure lines have no desk-level test
of their own: the change leaves those modules alone, and the refusal sentence reaches them
through the served `message` (the backend tests above) and the client's typed error (the
`frontend/data.test.js` case).

## Recorded results

Coordinator-run, 2026-09-24:

- **Worker gate on `b54d4752`, as the coordinator log records it:** whole backend pytest
  977 s, fast gate 1047, inventory 175 issued · 156 active · 19 retired. The coordinator then
  had the record's reassessment-failure line fixed to print one full stop, as `b0ad8a6c`.
- **S46, S91, S92, S93, S173, S174, S175 and S176 on branch `b0ad8a6c`:** each `PASS` at
  1280x720 and 1440x900, `# executed 8 · failed 0 · deferred 0 · selected 8 · chromium
  launches 1` at each size. S91 also proved its `c4-ic`, `c4-isf` and `c4-profile` variants
  (`logs/449-branch-1280x720.log`, `logs/449-branch-1440x900.log`).
- **Follow-up browser suite on `b0ad8a6c`:** passing lines "Trial and Pattern Focus journeys
  at 1280x720" and "Trial and Pattern Focus journeys at 1440x900", the runner totals tests 2, pass 2, fail 0. Each journey replayed 25 C3 stories, the amended S46, S91, S92 and S93 among
  them, with `# executed 25 · failed 0 · deferred 0 · selected 25 · chromium launches 1`
  (`logs/449-followup.log`).
- **Whole desk browser suite on `b0ad8a6c`:** the runner totals tests 43, pass 43, fail 0
  (`logs/449-desk-whole.log`).
- **The same eight stories on base `b03431d2` with the branch harness laid over it**
  (`frontend/c3.replay.mjs`, `frontend/c3.replay.test.js`, `frontend/c4.replay.mjs`,
  `frontend/c4.replay.test.js`, `frontend/desk-behavior.replay.mjs`,
  `frontend/replay-cases.mjs`, `mockups/sweep/harmonic-v2-desktop/acceptance.py`,
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`): all eight fail at both sizes,
  `# executed 0 · failed 8 · deferred 0 · selected 8 · chromium launches 1`, followed by
  `FATAL: zero stories executed — a run that asserts nothing is a failure, not a pass`
  (`logs/449-base-1280x720.log`, `logs/449-base-1440x900.log`). The failure lines:
  - S46, S91 and S92 (`c3-trial`): `FAIL S46 — Timed out after 30000 ms: readiness; saw [`,
    then an array holding the arm's `'Not met — collecting.'` line, then `]; a served reason
    prints in words, never its code`. S91 and S92 print the same.
  - S93 (`c3-focus`): `FAIL S93 — Timed out after 30000 ms: readiness; saw [`, then an array
    holding `'ready'` for each Pattern arm, then `]; a Pattern arm names its opportunity
    verdict in words, never its served value`.
  - S173: `FAIL S173 — Timed out after 30000 ms: S173 the active Focus names its behavior and
    verdicts in words; saw [ 'Late bolus\nthe intended behavior · meals' ]; S173 the Observed
    behavior row must name the served behavior: Late bolus`
  - S174: `FAIL S174 — Timed out after 30000 ms: S174 a saved Focus ending names its reason
    in words; saw [ 'Unavailable · unavailable_adherence' ]; S174 the saved ending must name
    its reason in words, never its served code: Unavailable · unavailable_adherence`
  - S175: `FAIL S175 — Timed out after 30000 ms: S175 an unmeasured behavior names its reason
    in words; saw [ 'unavailable\ninsufficient_measurement · 0 of 4 measured' ]; S175 the
    Observed behavior cell must name its reason in words, never its served code: unavailable`
  - S176: `FAIL S176 — Timed out after 30000 ms: S176 Focus record 3 names its behavior; saw [
    'Highs after meals' ]; S176 What changed must name the served behavior: WHAT CHANGED`,
    followed by "The intended behavior: Highs after meals. No pump setting changed." At
    1440x900 the `saw` array also holds that "What changed" text; the assertion is the same.
- **Code review:** the review of `b0ad8a6c` converged clean.
- **Release trunk:** `TRUNK f6e572a4 #449/#450 merged (179/160/19; exploration regenerated;
  fast 1042/1042; port-free acceptance OK)`. The readiness replay helper that carries this
  change's words rule was merged with #442's at `TRUNK ef3e037b #442 merged (…readiness helper
  semantic merge: #442 printed-comparison + #449 words rule, dropped #442 raw-reason assert…)`,
  and the glue after it, `TRUNK 3e684400 glue fix: …c4 fake words + words-rule failing-path
  test (fails w/o rule)…`, gave the c4 helper's words rule a failing-path test.
- **Trunk re-run:** `TRUNK LEGS 25392ade` re-ran S46 with 14 other stories, 15/15 at both
  sizes.
- **Base facts:** `BASE FACTS (raw logs): … S173-S176 (449-base) FAIL at feature assertions at
  BOTH sizes.`, recorded in the release freeze (`d8e9c9d1`).
- The complete ledger at both sizes, the whole backend pytest and the full
  `acceptance.test.py` run once on the commit that is pushed; the pull request records the
  result.

## Renders

- **Before**: base `b03431d2` (origin/main before the release).
- **After**: release trunk `9882bcfe`'s server, serving the desk shell last built at trunk
  `25392ade`. Every ticket's desk change had merged by then; the evidence record's root
  [README](../README.md) records what that shell lacks (the #451 prose em-dash sweep's
  desk strings).
- **Owed by**: the lock (tasks.md 5.3): c3-focus's active Focus, c3-preempted's manual-ended
  and `overnight_drift` Focus records, and c4-history's Focus record, at both sizes. The
  optional shot of the Focus entry's withheld copy while a Plan is pending was not produced:
  it is unreachable in the served desk on either tree, because Changes seats the pending Plan
  (for a `draft` or `pending_plan` disposition) and the follow-up (for `active_change`) before
  it reaches the Focus entry. A base attempt with a recorded Plan showed the pending Plan. The
  withheld words are covered by `frontend/focus-entry.test.js`.
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`) over a named
  case store emitted by that tree's own `scripts/gen_qa_e2e_db.py --case <name>`, followed by
  the replay case server's `reconcile_ingested_follow_up` step. Chromium used the dark scheme,
  the desk's only theme. The same interaction path produced each before and after.
- **Files**: each `.png` is the render; each `.txt` beside it holds the page's visible text,
  the address, the focused element and the capture note.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 449-A1 | 1280x720 | active Focus at rest: nameplate and "What this Focus watches" | `c3-focus` | `/?to=changes` | [png](renders/before/449-A1-1280x720.png) · [txt](renders/before/449-A1-1280x720.txt) | [png](renders/after/449-A1-1280x720.png) · [txt](renders/after/449-A1-1280x720.txt) |
| 449-A1 | 1440x900 | active Focus at rest: nameplate and "What this Focus watches" | `c3-focus` | `/?to=changes` | [png](renders/before/449-A1-1440x900.png) · [txt](renders/before/449-A1-1440x900.txt) | [png](renders/after/449-A1-1440x900.png) · [txt](renders/after/449-A1-1440x900.txt) |
| 449-A2 | 1280x720 | the same at Observed behavior and its opportunity verdicts | `c3-focus` | as 449-A1; scroll `[data-table="adherence"]` | [png](renders/before/449-A2-1280x720.png) · [txt](renders/before/449-A2-1280x720.txt) | [png](renders/after/449-A2-1280x720.png) · [txt](renders/after/449-A2-1280x720.txt) |
| 449-A2 | 1440x900 | the same at Observed behavior and its opportunity verdicts | `c3-focus` | as 449-A1; scroll `[data-table="adherence"]` | [png](renders/before/449-A2-1440x900.png) · [txt](renders/before/449-A2-1440x900.txt) | [png](renders/after/449-A2-1440x900.png) · [txt](renders/after/449-A2-1440x900.txt) |
| 449-B1 | 1280x720 | Focus record ended by hand, at its saved ending assessment | `c3-preempted` | `/?to=changes&subject=history&occurrence=record:focus:1` (the Focus whose ending kind is manual); scroll `[data-ending-assessment]` | [png](renders/before/449-B1-1280x720.png) · [txt](renders/before/449-B1-1280x720.txt) | [png](renders/after/449-B1-1280x720.png) · [txt](renders/after/449-B1-1280x720.txt) |
| 449-B1 | 1440x900 | Focus record ended by hand, at its saved ending assessment | `c3-preempted` | as above | [png](renders/before/449-B1-1440x900.png) · [txt](renders/before/449-B1-1440x900.txt) | [png](renders/after/449-B1-1440x900.png) · [txt](renders/after/449-B1-1440x900.txt) |
| 449-C1 | 1280x720 | `overnight_drift` Focus record at rest: nameplate "Focus" | `c3-preempted` | same route, `record:focus:2` | [png](renders/before/449-C1-1280x720.png) · [txt](renders/before/449-C1-1280x720.txt) | [png](renders/after/449-C1-1280x720.png) · [txt](renders/after/449-C1-1280x720.txt) |
| 449-C1 | 1440x900 | `overnight_drift` Focus record at rest: nameplate "Focus" | `c3-preempted` | same route, `record:focus:2` | [png](renders/before/449-C1-1440x900.png) · [txt](renders/before/449-C1-1440x900.txt) | [png](renders/after/449-C1-1440x900.png) · [txt](renders/after/449-C1-1440x900.txt) |
| 449-C2 | 1280x720 | the same record at What changed | `c3-preempted` | as 449-C1; scroll `[data-record-part="change"]` | [png](renders/before/449-C2-1280x720.png) · [txt](renders/before/449-C2-1280x720.txt) | [png](renders/after/449-C2-1280x720.png) · [txt](renders/after/449-C2-1280x720.txt) |
| 449-C2 | 1440x900 | the same record at What changed | `c3-preempted` | as 449-C1; scroll `[data-record-part="change"]` | [png](renders/before/449-C2-1440x900.png) · [txt](renders/before/449-C2-1440x900.txt) | [png](renders/after/449-C2-1440x900.png) · [txt](renders/after/449-C2-1440x900.txt) |
| 449-D1 | 1280x720 | preempted Focus record at its behavior cells and readiness lines | `c4-history` | same route, `record:focus:1`; scroll `[data-adherence]` | [png](renders/before/449-D1-1280x720.png) · [txt](renders/before/449-D1-1280x720.txt) | [png](renders/after/449-D1-1280x720.png) · [txt](renders/after/449-D1-1280x720.txt) |
| 449-D1 | 1440x900 | preempted Focus record at its behavior cells and readiness lines | `c4-history` | same route, `record:focus:1`; scroll `[data-adherence]` | [png](renders/before/449-D1-1440x900.png) · [txt](renders/before/449-D1-1440x900.txt) | [png](renders/after/449-D1-1440x900.png) · [txt](renders/after/449-D1-1440x900.txt) |

### What the pair shows

On `c3-focus` (449-A1, 449-A2) both trees print the Observed behavior row and "What this
Focus watches" as "Late bolus"; the only change is the two Pattern opportunity verdicts,
"ready" before and "Ready" after. On the record ended by hand (449-B1) the ending assessment
moves from "Unavailable · unavailable_adherence" to "Unavailable · the watched behavior could
not be measured in both periods", the harm cells from "zero_opportunities" to "no
opportunities in this period", the readiness lines from "withheld · zero_opportunities" and
"Not met — zero_opportunities." to "Withheld · no opportunities in this period" and "Not met —
no opportunities in this period.", and "What changed" from "The intended behavior: Highs after
meals." to "The intended behavior: Late bolus." under the unchanged nameplate "Highs after
meals". On the `overnight_drift` record (449-C1, 449-C2), nameplate "Focus", the ending
assessment moves from "Unavailable · lever_unavailable" to "Unavailable · the behavior this
Focus watched is no longer an offered lever", and "What changed" from "The intended behavior:
Focus. No pump setting changed." to "The behavior this Focus watched is no longer an offered
lever. No pump setting changed." On `c4-history` (449-D1) the Before behavior cell moves from
"insufficient_measurement · 0 of 4 measured" to "too little glucose data to judge every
opportunity · 0 of 4 measured", the collecting arm from "withheld · collecting" and "Not met —
collecting." to "Withheld · still collecting" and "Not met — still collecting.", and "What
changed" names "Late bolus" in place of "Highs after meals". Each tree's text is the same at
both sizes apart from the header line; the only other line that differs between the trees is
449-D1's Recorded stamp (Sep 24, 2026 · 04:37 before, 07:41 after).

## Logs

Each leg's commit is the one its coordinator run transcript printed first (`prep <tree>
<oid>`, and `prep base-b03431d2 b03431d2` after the `overlay:` lines for a base leg); those
transcripts are not kept in this folder.

| File | Leg | Commit |
| --- | --- | --- |
| `logs/449-branch-1280x720.log` | branch replay of S46, S91, S92, S93, S173, S174, S175 and S176 at 1280x720 | `b0ad8a6c` |
| `logs/449-branch-1440x900.log` | the same at 1440x900 | `b0ad8a6c` |
| `logs/449-followup.log` | follow-up browser suite, Trial and Pattern Focus journeys at 1280x720 and 1440x900 | `b0ad8a6c` |
| `logs/449-desk-whole.log` | whole desk browser suite, both sizes | `b0ad8a6c` |
| `logs/449-base-1280x720.log` | the same eight stories on base with the branch harness laid over it, 1280x720 | `b03431d2` |
| `logs/449-base-1440x900.log` | the same at 1440x900 | `b03431d2` |
