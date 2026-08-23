# Scope ledger — Diagnose basal-slot case file wording (#102)

Ticket: https://github.com/harmonichq/harmonic/issues/102

## Decisions

- The locked term is "nights of steady data" (DESIGN.md, "Voice and user-copy
  register", rule 3). The engine already prints it — `_annotation_for` in
  `ciq_autotune/analyzers/basal.py` maps `NO_DATA` to "no nights of steady data
  at this time yet" and `INSUFFICIENT` to "not enough nights of steady data yet
  to point one way" — so no analyzer copy moves. Why: read at
  `ciq_autotune/analyzers/basal.py:106-119`. `inline`
- The authored defect is four strings in `frontend/diagnose-workstation.js`:
  the `VERDICT_KEY.nodata` label `'no clean data'` (line 224), the case file's
  support line (715), its thin-evidence footnote (722), and the slot
  breadcrumb meta line (2178). `VERDICT_KEY.nodata` also feeds the slot tile
  `title` and `aria-label` (486-487), the lane key tooltip (499) and two crumb
  chips (545, 550) — all the same shipped surface. Why: read in the module.
  `inline`
- The committed demo payload is a second source of the retired phrase on the
  same surface. `.claude/qa/gen_synthetic_fixtures.py:235` stamps the
  insufficient-evidence basal slots with `"too few clean nights to assert a
  direction here"`, which the case file prints verbatim as its own sentence
  (`sentence: s.annotation` when the slot cannot stage). The engine never emits
  that string. It is in scope: the ticket's stable fingerprint is "a Diagnose
  basal-slot case file contains the literal phrase 'clean nights'", and the
  payload is the deterministic API source the frozen behaviour ledger names.
  Why: verified against the generator, the committed payload and
  `frontend/diagnose-workstation.js:716-718`. `inline`
- Correcting the generator obliges two regenerations, both gated in the fast
  gate: `mockups/diagnose-workstation.synthetic/payload.json`
  (`scripts/check_demo_fixtures.py`, byte-exact) and
  `mockups/finding-evidence-routing.exploration/data.json`, which `build.mjs`
  derives from that payload (`node
  mockups/finding-evidence-routing.exploration/build.mjs --check`, ci.yml).
  Why: `check_demo_fixtures.py` docstring; `build.mjs:632` reads `PAYLOAD`.
  `inline`
- The exploration's two hand transcriptions of `VERDICT_KEY`
  (`mockups/finding-evidence-routing.exploration/build.mjs:230` and
  `pooled.js:97`, both labelled VERBATIM) are updated in the same change so the
  VERBATIM claim stays true. They are the stale-extract failure class AGENTS.md
  records for decision record 37. Why: read at both sites. `inline`
- The exploration's regex-anchored extractions are NOT affected: `build.mjs`
  lifts only `EVIDENCE_CAP`, `fmtDate`, `VERDICT_BAND_KEY`,
  `VERDICT_RESIDUE_KEY` and `renderCaseRoster` out of
  `frontend/diagnose-workstation.js`, none of which contain the retired phrase.
  Why: read `shippedEvidenceTable` at `build.mjs:174-194`. `inline`
- Engine comments, Python docstrings and backend test comments keep "clean
  nights" — DESIGN.md scopes the rule to app surfaces and accessible labels.
  This includes `frontend/diagnose-workstation.js:774` and
  `frontend/diagnose-workstation-chart.js:273`, which are comments. `inline`
- Out of this ticket, owed as follow-ups: (a) the findings-queue support noun
  "clean nights" (`ciq_autotune/findings_projection.py`, mirrored in
  `mockups/findings-projection.mirror.mjs`, frozen in
  `frontend/__fixtures__/findings-projection.json`, asserted at
  `frontend/diagnose-findings-queue.test.js:199`, and respelled by the
  exploration's `STEADY_NOUN` map, which fails its build when the violation
  disappears); (b) the Plan-tab basal copy — `frontend/index.html:4522`
  (`'No clean data'`), `:4610` (`evidenceFoot` "clean nights"), `:4619` ("clean
  data"), and `frontend/chart-builders.js:620` (`'no clean data'` in
  `buildRibbonOption`'s tooltip, imported by `index.html`, not by the Diagnose
  workstation). Why: each is a separate surface with its own fixture chain.
  `→ issue`

### Risk contract

- Must prevent: secret exposure; irreversible loss of authoritative data; silent
  incorrect success — a verdict label that maps to the wrong slot state, or a
  regenerated fixture that changes any number, population or denominator.
- Must recover: none.
- Accepted failure: none beyond the defaults.
- Unsupported: retired wording on surfaces other than the Diagnose basal-slot
  case file and its slot rail (the Plan tab and the findings queue are
  follow-ups).
- Evidence owed: the case file for an insufficient-evidence slot and for a
  no-data slot renders "nights of steady data" and never the word "clean"; the
  slot tile's accessible name for a no-data slot names steady data; all frozen
  behaviour-ledger stories replay green against the built revision; the
  regenerated payload differs from its predecessor only in the annotation
  string.
- Why: copy-only change on an advisory dosing surface; no dosing logic and no
  analyzer output moves.
- Disposition: inline (copied into the work order).

### Spike — the regeneration chain, executed in this worktree and reverted

Run against `codex/102-steady-data-wording` at `d8b72d1`, then reverted; only
this ledger remains committed.

1. Baseline: `node mockups/finding-evidence-routing.exploration/build.mjs
   --check` and `uv run python scripts/check_demo_fixtures.py` both pass on the
   untouched tree, so any staleness after the change belongs to the change.
2. Editing the generator's annotation string alone makes
   `check_demo_fixtures.py` fail and name **two** committed files, not one:
   `mockups/diagnose-workstation.synthetic/payload.json` and
   `mockups/diagnose-workstation.synthetic/settings-audit.capture.json`. The
   capture file was not in the pre-spike inventory.
3. `uv run python .claude/qa/gen_synthetic_fixtures.py
   mockups/diagnose-workstation.synthetic` rewrites seven files in that
   directory; `git diff` shows changed lines in exactly two of them, and every
   changed line is an `annotation` line (12 in `payload.json`, 48 in
   `settings-audit.capture.json`). No number, population or denominator moves.
   The generator must run under `uv run` — bare `python3` cannot import
   `ciq_autotune`.
4. With the payload regenerated, `build.mjs --check` reports `data.json` stale.
   Re-running `build.mjs` clears it; `evidence-table.extracted.js` and
   `app-base.extracted.css` come out byte-identical, confirming the
   regex-anchored extractions are untouched by this change.
5. With all four module strings and both transcriptions edited: `node --test
   'frontend/**/*.test.js'` → 433 pass / 0 fail; `check_demo_fixtures.py`,
   `build.mjs --check`, `check_adr_numbers.py`, `check_owned_identifiers.py`
   and `check_public_allowlist.py` all pass.
6. Total change surface: seven files — one module, one generator, two
   regenerated fixtures, two exploration transcriptions, one regenerated
   exploration artifact.

## Open questions

- None blocking. The fixture-annotation boundary above is a default the operator
  may narrow to code-only; narrowing it leaves the phrase reproducible under the
  committed demo payload.

## Spawned tasks

- Follow-up issues for the findings-queue support noun and the Plan-tab basal
  copy (not yet filed — this triage session posts nothing to the tracker).

## Review rounds

### Panel 1 — two cold reviewers, no context from the drafting session

Blockers found: 6 (all `authoring` — present since the draft; 0 `injected`).

1. The scratch-payload recipe for the no-data render named one field, so the
   "empty state" screenshot would have shown three nights of steady data, a CI
   band and the spans-current hedge — a state the engine cannot produce.
   Reproduced against `renderParamLevel` and `ciq_autotune/analyzers/basal.py:487`.
   Fixed: the order now names the whole field set.
2. The ticket's second reproduction — the no-data case file — had no acceptance
   criterion. Fixed: a `Done when` bullet quotes the exact strings, and the
   pre-existing "insufficient evidence" head (line 705) is declared out of scope.
3. No step replayed the frozen ledger against the built revision, though the
   ledger entry and `Done when` both cited its result. Fixed: new step 9.
4. The revise contract's re-inventory-and-diff pass was dropped from both the
   freeze step and the ledger entry. Fixed: step 3b, carried into step 10.
5. `mockups/INDEX.md` was never amended, though every prior revision of this
   surface appended its own clause to the row. Fixed: step 12.
6. The frontend-test expectation was self-contradictory (it credited the browser
   suite with adding tests to a glob that cannot discover it). Fixed, and 433
   pass / 0 fail re-measured on the untouched tree.

Refuted, not forwarded: the claim that the browser suite has no basal-slot
navigation (story S16 reads `#level .slot-say` at
`frontend/diagnose-workstation.browser.test.mjs:688`); and the claim that
`renderRibbonChart` is never called (it is, at `frontend/index.html:4119` and
`:4724` — what makes the block inert is that nothing binds `ribbonEl` in the
template). Both were corrected in the order rather than adopted.

### Panel 1, delta re-check

Blockers found: 3 (all `injected` — introduced by the fixes to round 1, in the
one step round 1 rewrote). The grounding reviewer returned no new blockers.

1. The corrected scratch-payload field set still omitted `annotation`, and the
   case file prints the slot's own annotation as its sentence
   (`frontend/diagnose-workstation.js:716-718`), so the no-data render would
   have carried whatever annotation the copied slot had. Fixed.
2. The replacement citation for the browser-suite idiom was wrong: S16 is a
   replay story (`frontend/diagnose-workstation-behavior.replay.mjs:1089`), and
   the browser suite's `.slot-say` read at line 688 belongs to its ISF test. The
   suite has no basal-lane story at all — `#lane` and `dataset.verdict` appear in
   it only in comments at lines 10 and 640. Fixed.
3. Navigating by the replay's `View slot` link-button does not constrain the
   slot's verdict, and only 6 of the payload's 48 slots are insufficient, so the
   new assertion would usually have landed on a `no change` slot where the
   strings under test never render. Fixed: the verdict-keyed lane selector from
   `replay.mjs:1090`, keyed to `insufficient`.

Also applied from that round: the three materialised-public-tree legs added to
the verification command (run on the clean tree here: 334 copied / 507 excluded,
every link resolves, 0 findings); a boundary against naming `docs/scope/*` or
`mockups/*.behavior.md` from a shipping `frontend/` comment, which
`check_public_links.py` would fail; step 3b bounded to the basal lane and case
file rather than the whole 74-entry surface; and a note that
`frontend/prompt-queue.js:81` exports a different, live `buildRibbonOption`.

### Panel 1, second delta re-check — closed

Blockers found: 2, both `injected` and both inside the verification leg the
previous round added.

1. `build_public_tree.py "$PUB" | tail -n 1` takes its exit status from `tail`,
   so a failed tree build would have read as success and the link and scan legs
   would have run against a partial tree. Fixed to CI's own form — redirect to a
   manifest file, then `tail` it.
2. The expectation said the copied count would rise. It cannot:
   `scripts/public_allowlist.txt` clears only `openspec/specs/** {.md}` and exact
   paths under `mockups/` (verified by grep), so the change folder, its evidence
   renders, the behaviour ledger and `mockups/INDEX.md` all land on the excluded
   side, and the files this change edits are already among the 334. Fixed to
   "334 copied / 507 excluded, unchanged".

Both fixes were then executed here in the corrected form: 334 copied / 507
excluded, every link resolves, 0 findings, exit 0. One non-blocking polish
applied with them (the lane selector now uses the replay's interpolated
template-literal form, `replay.mjs:1092`).

Review closed after one panel and two delta re-checks. The last two fixes were
reproduced against the repo and executed rather than sent for a third cold pass;
the round produced no finding outside the leg it had just added, which is the
stop signal.

Injected blockers did not climb across rounds in a way that signals a rewrite:
round 1's six were all authoring defects, round 2's three were all confined to
the single step round 1 rewrote, and the second reviewer's independent pass on
the same deltas returned none.

Notes taken but not blocking: the retired phrasing also sits at
`frontend/index.html:4467`, `:4578`, `:4646` and `:4647` in that same
unreferenced block; the Boundaries list now names them so the follow-up is a
deletion question rather than a copy question.
