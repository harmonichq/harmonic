# The case file names the selected Occurrence's comparison cohort (#376)

## Why

A Finding case file's event projection publishes three server-named cohorts and,
for each, the exact `occurrence_ids` routed into it. Its `selection.detail`
carries no pointer back to the cohort the selected Occurrence belongs to, except
on Missed / unannounced meal — the one lever whose two detail builders,
`_missed_detail` and `_announced_detail`, each stamp `comparison_cohort`
themselves. Every other lever's event-aligned detail comes from the shared
`_detail`, which omits the field.

Diagnose reads that pointer in four places and fails soft on all four, so the
By-event response comparison is inert for every lever but one:

- the selected detail's cohort tag renders the literal string `undefined`;
- the `N of M ↑ ↓` position indicator never appears, because the cohort's
  occurrence list resolves empty and the reader's index is `-1`;
- `ArrowUp` / `ArrowDown` occurrence stepping returns before `preventDefault`,
  so there is no keyboard route through a cohort;
- the chart's selected-cohort emphasis never engages: no cohort dims back and no
  legend entry is marked as the selected cohort.

Reproduced against the qa-e2e database, served through the one offline serve
`AGENTS.md` permits — copy `mockups/qa-e2e.synthetic/harmonic.sqlite` to scratch,
then `harmonic serve --no-fetch --token ''`. Its findings queue holds three
behavioural Findings, and every one reproduces the absence. Taking the first id
out of the `matched` cohort of each case file — `finding:over_treated_low` /
`o_28b23a9c1b6fa5ab54f21c4b88b26ea4`, `finding:correction_on_iob` /
`o_308e26c4ae671d33ece109c95f1065c5`, and `finding:meal_bolus_short` /
`m_539d54f23ea857ac0654b1de71b110be` — the endpoint answers 200 with
`selection.state` `selected` and `selection.detail` holding exactly
`anchor, date, day_target, glucose, id, markers, source_corrections, verdict`,
while the same response's `projection.cohorts` names the cohort each of those ids
was routed into.

The committed Diagnose capture reproduces the defect too — every non-missed-meal
`selected_event` case in
`mockups/diagnose-workstation.synthetic/finding-case-files.json` lacks the field,
because the generator runs the real projection — so every browser gate and Node
suite replays a payload that encodes the bug. The one rendered audit that proves
the emphasis works, `selected-withheld-light` in
`mockups/diagnose-event-comparison-support-audit.mjs`, runs on
`finding:missed_meal`, the single lever that already carries the pointer. The
feature is built, proven once, and unreachable everywhere else.

## What changes

- The server stamps `comparison_cohort` on every event-aligned selection detail,
  derived from the projection's own cohort membership rather than re-derived per
  lever, so one fact has one implementation.
- The browser's case-file trust boundary requires that pointer and rejects a
  payload without it, so the surface can never again render a cohort name it was
  never given.
- The committed Diagnose capture is regenerated from the corrected projection,
  the Node suites pin the served pointer against cohort membership, and one
  assertion on `GET /api/diagnose/finding-case-file` pins it through the public
  interface for a lever that is actually affected.

Not in scope: the response comparison's visual semantics, the cohort roster, the
clock alignment (which has no cohorts and keeps no pointer), and every Diagnose
surface other than the Finding case file.
