# #454 fixture meal shapes

## Status

**Triage source for #454.** An ordinary ticket change. It touches fixture
generators, the fixture-only Pattern case-file mirror, their committed outputs and
the tests that read them; no shipped desk code, analyzer, staging predicate, cap or
floor. The desk's frozen behavior ledger (`mockups/harmonic-v2-desktop.behavior.md`)
is not amended: its replay runs on QA case stores, which this change does not reach.

## Why

Two fixture-side gaps survived #432. Each lets a synthetic capture say something the
real producer never would, and the browser gates certify the advisory desk against
these captures.

- **The Pattern fixture mirror keeps habits outside the Pattern's rate family.** The
  Python case producer judges a Pattern row, and its selected reason, only by the
  habit members whose rate family is the Pattern's own. The fixture-only mirror the
  browser gates read judges every habit member. The real roster admits
  out-of-family members whenever a scenario row exists for the lever: Correction
  stacking is a member of Lows after correcting highs but is counted over
  correction clusters, and High-carb sequence and Repeat eating are members of
  Highs after meals with no rate family at all. Reproduced 2026-09-23 on
  `origin/main` b03431d2: with either member added, the mirror serves an extra
  habit entry that the Python producer, over the same roster, drops
  (`docs/scope/454-mirror-family.repro.mjs` fails 2 of 2;
  `docs/scope/454-backend-family.repro.py` prints the Python answer). No committed
  roster carries such a member, so nothing diverges yet.
- **The manufactured exposure rows are low-shaped whatever their family.** The
  Diagnose workstation fixture generator stamps all 46 of its manufactured exposure
  Occurrences — 20 lows, 20 meals, 4 highs, 2 correction clusters — with kind
  `low` and label `Low`; an `iob_stacking` verdict, which is not a classifier the
  app has, with silence reason `no_signal`, which is outside the closed set; an
  Over-treated low verdict on meal, high and correction rows; and, on every claimed
  row, a low-treatment sentence as its cause text, so the claimed meal the Highs
  after meals case file selects reads "Treated a low at 07:35 …" as its Late bolus
  cause. #432 froze the kinds and verdicts, not the text.

## What changes

- The fixture-only mirror judges exactly the Pattern's in-family habit members, for
  the row verdict and the selected reason alike, reading each lever's rate family
  from a table the projection fixture generator freezes from the backend's
  evidence-population policy. The hand-written, unread and partly wrong table the
  capture publishes today is replaced by it. Two frozen Python answers, one per kind
  of out-of-family member, hold the mirror to the producer.
- Every manufactured exposure row carries the kind, label, judged classifiers,
  silence reasons and cause text the real exposure feed serves for its family; a
  claimed row carries its own lever's verdict matched, with that verdict's sentence
  as its text; and a High row's anchor glucose is one a High anchor can carry.
- The generators regenerate every committed artifact the change moves, in one
  ordered pass, with each drift check green.

## Not in this change

No analyzer, classifier, staging, cap, floor, admission, claim, family tally,
Pattern count, queue order or sentence change; no shipped desk code. The
correction-cluster rows keep their claim. The event-comparison capture's
exploration-only `views` (reported to the release coordinator as a finding). The
duplicated classifier sentence on a claimed Pattern row's cause and claimant lines,
which production serves today (reported to the release coordinator as a finding).
No pump write, real-data read or vendor fetch.

## Impact

- Generators: `.claude/qa/gen_synthetic_fixtures.py`,
  `scripts/gen_findings_projection_fixtures.py`,
  `mockups/diagnose-event-comparison.synthetic/generate.mjs`.
- Fixture-only mirror: `mockups/diagnose-event-comparison.synthetic/project.mjs`.
- Regenerated: `mockups/diagnose-workstation.synthetic/explore-exposures.capture.json`
  and `payload.json` (checked by `scripts/check_demo_fixtures.py`),
  `frontend/__fixtures__/findings-projection.json`
  (`scripts/gen_findings_projection_fixtures.py --check`),
  `mockups/diagnose-event-comparison.synthetic/capture.json`
  (`generate.mjs --check`).
- Tests: `frontend/browser-fixture-population.test.js`,
  `frontend/diagnose-workstation.test.js`, `tests/test_synthetic_fixture_shapes.py`.
