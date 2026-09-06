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

Reproduced against both synthetic servers. On the revise-e2e database,
`finding:late_bolus`, event alignment, occurrence
`o_59234525571617dfc6dd14133682b765`: the endpoint answers 200,
`selection.detail` holds exactly
`id, date, anchor, verdict, glucose, markers, source_corrections, day_target`,
and the selected id appears in `projection.cohorts[0].occurrence_ids` (`matched`,
2 routed). The same absence reproduces on the qa-e2e database for
`finding:over_treated_low`, `finding:carb_undercount` and
`finding:correction_on_iob`, each of whose selected Occurrence is likewise a
`matched` member.

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
  and the Node suites pin the served pointer against cohort membership.

Not in scope: the response comparison's visual semantics, the cohort roster, the
clock alignment (which has no cohorts and keeps no pointer), and every Diagnose
surface other than the Finding case file.
