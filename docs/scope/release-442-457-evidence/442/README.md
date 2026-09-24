# #442 synthetic evidence

Everything here is synthetic. Every capture and log comes from committed manufactured QA
recipes (`scripts/qa_e2e_cases.py`) or the committed showcase, served by the offline
no-fetch app (`--no-fetch --token ''`). No personal database, operator screenshot or
real-data payload is included. The release coordinator ran every port-bound leg serially;
the ticket worker bound no port. Absolute paths in the logs are replaced with
`<base worktree>`, `<ticket worktree>`, `<release worktree>`, `<scratch>` and `$TMPDIR`.

Change: `backfilled-record-endings` (OpenSpec), archived with the release. Ticket branch
head at integration: `663dd403`, merged to the release trunk as `ef3e037b`. The last branch
legs ran on `782cd552`. The two commits after it reword the Edit's role in the ADR 442
record and tighten one backend test's assertion (`0b8e22a4`), and record the coordinator's
legs in tasks.md and the behaviour ledger (`663dd403`).

Stores: `c4-ic` serves S157, both renders and one of S91's proved variants (its one
reconcile records carb-ratio changes on 06-01 and 06-10, and the 06-01 record is the one the
rule ends); `c4-isf` and `c4-profile` serve S91's amended readiness check, where the saved
expiry now reads data to 06-29; `c3-trial` serves S49, S91 and S105; `c4-missing` serves
S49's proved variant; `c3-history` serves S96; `edit-chain` serves S110, S111, S112 and
S143, whose four hand-saved records this change moves 14 days later so all four stay open;
`c4-history` serves the retired R18. The follow-up suite's replay journeys ran on
`c3-trial`, `c3-focus`, `c3-history`, `c3-pin`, `c3-preempted` and the four c4 variants.
The desk browser suite serves its own synthetic fixtures, including the hand-built expired
record the ledger names.

## Requirement map

| Requirement (capability spec, delta) | Stories | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| Every retained change record ends by one rule (outcomes, ADDED) | S157, S91; S110, S111, S112, S143 (regression) | `tests/test_watched_change.py` `EveryRecordEndsTest.test_a_changes_older_than_the_window_all_end_on_one_reconcile`, `EveryRecordEndsTest.test_c_a_later_change_of_another_setting_supersedes`, `EveryRecordEndsTest.test_d_a_reversal_comes_before_supersession`, `EveryRecordEndsTest.test_e_a_record_inside_its_window_stays_open_and_watched`, `EveryRecordEndsTest.test_f_a_second_reconcile_changes_no_saved_ending`, `EveryRecordEndsTest.test_j_a_plan_receipt_is_unchanged_by_the_ending`, `EveryRecordEndsTest.test_k_a_multi_slot_edit_ends_at_the_first_change_after_it`, `EveryRecordEndsTest.test_k_a_multi_slot_edit_without_a_later_change_expires`, `EveryRecordEndsTest.test_m_a_change_that_settles_later_leaves_the_ending_as_recorded`, `EveryRecordEndsTest.test_one_history_read_per_reconcile_saves_what_a_read_per_record_saves` | `logs/442b-branch-1280x720.log`, `logs/442b-branch-1440x900.log`; `logs/442-base-1280x720.log`, `logs/442-base-1440x900.log` | `renders/after/442-A1-1280x720.png`, `renders/after/442-A1-1440x900.png` |
| An ending's saved assessment reads evidence only up to its ending instant (outcomes, ADDED) | S91 (amended), S157 | `tests/test_watched_change.py` `EveryRecordEndsTest.test_b_pump_read_supersession_says_its_period_ends_at_that_change`, `EveryRecordEndsTest.test_g_an_expiry_recorded_after_the_fact_reads_data_to_its_own_instant`, `EveryRecordEndsTest.test_h_a_context_read_after_the_ending_leaves_the_assessment_unavailable`, `EveryRecordEndsTest.test_i_a_context_read_before_the_superseding_change_is_used`, `EveryRecordEndsTest.test_l_a_dose_detected_supersession_reads_data_through_that_change`; `tests/test_follow_up_comparison.py` `FollowUpComparisonTest.test_exported_envelope_is_the_early_unavailable_return`; `frontend/c4.replay.test.js` "S91 readiness compares an ended record’s lines with its saved ending, and returns the retained read"; "S91 readiness fails when an ended record’s lines print the retained read instead" | `logs/442b-branch-1280x720.log`, `logs/442b-branch-1440x900.log`; `logs/442-followup.log` | `renders/after/442-A2-1280x720.png`, `renders/after/442-A2-1440x900.png` |
| Changes reads an older detected change's ending (surfaces, ADDED) | S157 | `frontend/c4.replay.test.js` "S157 is a unique app-only C4 record story on the c4-ic case"; "S157 reads the older superseded record’s ending in the roster and on the record"; "S157 fails at its first feature assertion when the older record is served still open, as on base"; "S157 fails when the roster row still reads Still open or carries a still-open cell"; "S157 fails when the opened record shows no superseded ending, or prints its kind as a code"; "S157 fails when the periods note reads data past the saved ending" | `logs/442-base-1280x720.log`, `logs/442-base-1440x900.log`; `logs/442-branch-1280x720.log`, `logs/442-branch-1440x900.log` (superseded); `logs/442b-branch-1280x720.log`, `logs/442b-branch-1440x900.log` | `renders/after/442-A1-1280x720.png`, `renders/after/442-A1-1440x900.png`, `renders/after/442-A2-1280x720.png`, `renders/after/442-A2-1440x900.png` |
| A superseded ending's note names no setting (surfaces, ADDED) | S157 | `frontend/history.test.js` "a superseded ending names a later setting change inside the window, never the same setting"; `frontend/c4.replay.test.js` "S157 fails when the saved-ending note still claims the same setting" | `logs/442b-branch-1280x720.log`, `logs/442b-branch-1440x900.log` | `renders/after/442-A2-1280x720.png`, `renders/after/442-A2-1440x900.png` |

## Recorded results

Coordinator-run, 2026-09-24:

- **Ticket start on `f4610aed`** (coordinator log): the whole backend pytest took 653 s,
  the new backend tests recorded "12/14 fail-first", and the ledger inventory on the branch
  was 172/153/19.
- **Branch replay on `f4610aed`, superseded:** `ONLY=S157,S49,S91,S96,S105,S110,S111,S112,S143,R18`
  at 1280x720 and at 1440x900. S49, S91, S96, S105, S110, S111, S112, S143 and R18 pass (R18
  is retired and prints its retirement line before passing). S157 fails at both sizes:
  "FAIL S157 — Timed out after 30000 ms: S157 the roster row reads its ending; saw [];
  observation has not returned", `# executed 9 · failed 1 · deferred 0 · selected 10 · chromium launches 1`
  (`logs/442-branch-1280x720.log`, `logs/442-branch-1440x900.log`). The coordinator log
  records it as "branch S157 FAIL (roster row not found, timeout) both sizes; 9 regression
  pass". The story's row locator was fixed in `e57c91bd`.
- **Desk browser suite on `f4610aed`:** `ℹ tests 43`, `ℹ pass 43`, `ℹ fail 0`
  (`logs/442-desk-whole.log`).
- **Follow-up suite on `f4610aed`:** `ℹ tests 2`, `ℹ pass 2`, `ℹ fail 0`, with
  "✔ Trial and Pattern Focus journeys at 1280x720" and "✔ Trial and Pattern Focus journeys
  at 1440x900". Each journey's replay printed
  `# executed 25 · failed 0 · deferred 0 · selected 25 · chromium launches 1`
  (`logs/442-followup.log`).
- **Full `acceptance.test.py` on `f4610aed`:** "Ran 41 tests in 3.084s", "OK"
  (`logs/442-acceptance-test.log`).
- **S157 on base `b03431d2` with the branch harness laid over it:** the overlay was the
  branch's harness as of `f4610aed` (`frontend/c4.replay.mjs`, `frontend/c4.replay.test.js`,
  `frontend/desk-behavior.replay.mjs`, `frontend/replay-cases.mjs`, and the acceptance driver
  and its tests). S157 fails at its first feature assertion at both sizes, "FAIL S157 — S157
  the older Trial row must carry its served superseded ending" (actual `undefined`, expected
  `'superseded'`), `# executed 0 · failed 1 · deferred 0 · selected 1 · chromium launches 1`,
  and the runner then prints its zero-executed fatal line (`logs/442-base-1280x720.log`,
  `logs/442-base-1440x900.log`). The coordinator log records this as the right reason. This
  base run used the harness from before the locator fix; no base run was made with the fixed
  harness.
- **Review and reconcile cost** (coordinator log): the Full code review found one
  non-blocking finding (the Edit definition in `CONTEXT.md`). `e57c91bd` fixed the S157
  locator, the Edit definition and a docstring, and measured the reconcile cost on a
  synthetic year of basal rows ("77s/7.1s per reconcile"). On the coordinator's ruling,
  `782cd552` reads the detector's history once per reconcile ("endings identical"; "year
  1.1s vs 54/6.6s"). The second review round found one non-blocking wording finding in the
  ADR 442 record, fixed with a tighter assertion in `0b8e22a4`, and the third round was
  clean on `0b8e22a4`.
- **Branch replay on `782cd552`:** the same ten stories all pass at 1280x720 and at
  1440x900, `# executed 10 · failed 0 · deferred 0 · selected 10 · chromium launches 1`
  (`logs/442b-branch-1280x720.log`, `logs/442b-branch-1440x900.log`). The coordinator log
  agrees: "S157 + 9 regression 10/10 both sizes".
- **Close-out on `663dd403`** (coordinator log): the OpenSpec preflight exited 2 because the
  branch changes two active changes (a pointer line in `harmonic-v2`). The coordinator
  recorded it as an exception: the manual apply check stands ("archives cleanly, 77
  validate"), and `harmonic-v2` is not archived at finalize.
- **Release trunk:** `TRUNK ef3e037b #442 merged (187/168/19; readiness helper semantic merge: #442 printed-comparison + #449 words rule, dropped #442 raw-reason assert; #442 fake gained criterion locator (merge glue — include in glue review); pytest targeted 263; fast 1116; drift ok)`.
  S91's readiness helper keeps #442's comparison with the assessment the page prints and
  takes #449's rule that reasons print in words; #442's assertion on the raw reason code was
  dropped. The glue commit `3e684400` that followed gave the c4 fake page its words and a
  failing-path test for the words rule ("fast 1117; port-free OK"), and the glue review on
  `3e684400` was clean. The #447 merge `c6697ef5` restored the `_seg` and `_profile` helpers
  that #442's backend tests use, which #447 had deleted, and trimmed the imports ("fast 1128;
  targeted pytest 330; port-free OK; drift 0"). The trunk legs on `25392ade` re-ran S157
  among 15 stories, "15/15 both sizes". The coordinator's base facts record S157 (from
  `442-base`) failing at its feature assertions at both sizes.
- The complete ledger at both sizes, the whole backend pytest and the full
  `acceptance.test.py` run once on the commit that is pushed; the pull request records the
  result.

## Renders

- **Before**: base `b03431d2` (origin/main before the release).
- **After**: the release trunk `dd5a93bb`, served with a desk shell built fresh from that
  commit (`npm ci && npm run build`) before the after batch.
- **Owed by**: the lock. Task 5.4 of the change's tasks.md names the synthetic before and
  after renders of the `c4-ic` records roster and its 06-01 record, at both sizes.
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`) over a
  named case store emitted by that tree's own `scripts/gen_qa_e2e_db.py --case c4-ic`,
  followed by the replay case server's `reconcile_ingested_follow_up` step. Chromium used the
  dark scheme, the desk's only theme. The same interaction path produced each before and
  after.
- **Files**: each `.png` is the render; each `.txt` beside it holds the page's visible text,
  the address, the focused element and the capture note.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 442-A1 | 1280x720 | Change records roster, the 06-01 row | `c4-ic` | `/?to=changes&subject=history`, scrolled to the 06-01 record's row | [png](renders/before/442-A1-1280x720.png) · [txt](renders/before/442-A1-1280x720.txt) | [png](renders/after/442-A1-1280x720.png) · [txt](renders/after/442-A1-1280x720.txt) |
| 442-A1 | 1440x900 | Change records roster, the 06-01 row | `c4-ic` | `/?to=changes&subject=history`, scrolled to the 06-01 record's row | [png](renders/before/442-A1-1440x900.png) · [txt](renders/before/442-A1-1440x900.txt) | [png](renders/after/442-A1-1440x900.png) · [txt](renders/after/442-A1-1440x900.txt) |
| 442-A2 | 1280x720 | the 06-01 record opened from the roster | `c4-ic` | as 442-A1, then press the row | [png](renders/before/442-A2-1280x720.png) · [txt](renders/before/442-A2-1280x720.txt) | [png](renders/after/442-A2-1280x720.png) · [txt](renders/after/442-A2-1280x720.txt) |
| 442-A2 | 1440x900 | the 06-01 record opened from the roster | `c4-ic` | as 442-A1, then press the row | [png](renders/before/442-A2-1440x900.png) · [txt](renders/before/442-A2-1440x900.txt) | [png](renders/after/442-A2-1440x900.png) · [txt](renders/after/442-A2-1440x900.txt) |

### What the pair shows

Before, the roster lists two carb-ratio records and both read "Still open": the
5 g/U → 6 g/U record reads "Active" and the 06-01 record (10 g/U → 6 g/U) reads "Not
watched". After, the 06-01 row reads "Superseded by a later change" with "Jun 10, 2024 ·
09:00", and the other record still reads "Still open" and "Active". Opened, the before record
is headed "SETTING CHANGE · STILL OPEN", its ending part says the change is still open, and
its periods note reads data to Jul 1, 2024 · 23:55. The after record is headed "SETTING
CHANGE · SUPERSEDED BY A LATER CHANGE" and shows a saved ending ("How it ended" "Superseded
by a later change", "Finished" "Jun 10, 2024 · 09:00") with the note "A later setting change
was detected inside the watch window. This record keeps the period it actually observed.";
its Trial period and its periods note both stop at Jun 10, 2024 · 09:00. The after
observation table is the ending snapshot "as saved at the ending" and its ending assessment
reads "Unavailable · a period has no readable glucose readings yet", where the before page
showed a comparison "recomputed now". At 1440x900 each `.txt` matches its 1280x720 pair apart
from the header line and, in the before 442-A2, the reassessment's computed minute.

## Logs

Each leg's commit is the one its coordinator run transcript printed first (`prep <tree>
<oid>`, and `prep base-b03431d2 b03431d2` after the `overlay:` lines for a base leg); those
transcripts are not kept in this folder.

| File | Leg | Commit |
| --- | --- | --- |
| `logs/442-branch-1280x720.log` | branch replay `ONLY=S157,S49,S91,S96,S105,S110,S111,S112,S143,R18` at 1280x720 (superseded: S157 failed on a story locator) | `f4610aed` |
| `logs/442-branch-1440x900.log` | branch replay, same selection, at 1440x900 (superseded: S157 failed on a story locator) | `f4610aed` |
| `logs/442-desk-whole.log` | desk browser suite, whole | `f4610aed` |
| `logs/442-followup.log` | Trial and Pattern Focus follow-up suite, both sizes | `f4610aed` |
| `logs/442-acceptance-test.log` | full `acceptance.test.py` | `f4610aed` |
| `logs/442-base-1280x720.log` | base replay `ONLY=S157` at 1280x720, with the branch harness from `f4610aed` laid over | `b03431d2` |
| `logs/442-base-1440x900.log` | base replay `ONLY=S157` at 1440x900, with the branch harness from `f4610aed` laid over | `b03431d2` |
| `logs/442b-branch-1280x720.log` | branch replay `ONLY=S157,S49,S91,S96,S105,S110,S111,S112,S143,R18` at 1280x720 | `782cd552` |
| `logs/442b-branch-1440x900.log` | branch replay, same selection, at 1440x900 | `782cd552` |
