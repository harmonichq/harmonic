# Design — The case file names the selected Occurrence's comparison cohort (#376)

## ADR 376 — The projection's cohort membership is the only source of a selection's cohort

**Context.** `Preparation.case` builds the event projection first, then admits a
selection only when the requested Occurrence appears in some cohort's
`occurrence_ids` — `active_ids` is literally the union of those lists. So at the
moment the detail is built, the server already holds the answer to "which cohort
is this Occurrence in", and it is the same answer the roster and the chart are
drawn from. Two lever-specific builders nevertheless re-derived it: the shared
`_detail` did not derive it at all.

Diagnose is forbidden from filling that gap itself. `openspec/specs/surfaces`
requires the Inspector to render the returned selection "without mapping titles
to Exposure families, joining a second population, recounting cohorts", and
`frontend/diagnose-event-comparison.js` opens by stating that cohort identity,
membership and selection "all arrive from the case-file endpoint; this module
never reconstructs them". Both held. The endpoint was the side that did not.

**Decision.** One producer, in `Preparation.case`, derived from
`projection["cohorts"]`: the same structure that decides admission decides the
pointer. The per-lever derivations in `_missed_detail` and `_announced_detail`
are deleted rather than left beside it — a fact with two implementations
diverges, and the Missed / unannounced meal path is where the correct behaviour
happened to survive, not a second authority for it.

The pointer is stamped for event alignment only. Clock alignment publishes
twelve time buckets and no cohorts, so there is nothing for it to point at, and
the browser's clock branch reads verdict bands instead.

**Alternatives rejected.**

- *Let the browser look the Occurrence up in `cohorts[].occurrence_ids`.* It is
  the same lookup, so it works — and it is exactly the re-derivation the surface
  contract and the module header forbid. The reason for the rule is that the
  browser's copy of a server judgment drifts silently; this defect is the mirror
  image of that risk, and fixing it by adding browser-owned policy would trade a
  visible bug for an invisible one.
- *Give `renderCaseSelection` a fallback so an absent pointer prints nothing
  instead of `undefined`.* That leaves the payload wrong, hides the next
  occurrence of the same defect, and adds a guard for a state the trust boundary
  can reject outright.

**Consequence.** `validFindingCaseFile` gains the matching requirement, so a case
file without the pointer raises the surface's existing structured
inconsistent-projection error rather than rendering a cohort name it was never
given. With that boundary enforced, the four readers in
`frontend/diagnose-workstation.js` and `frontend/diagnose-event-comparison.js`
need no change and get none: their optional chaining stays as the ordinary
handling of a clock-aligned detail, and the absent-cohort branch becomes
unreachable rather than guarded twice.

## Why the committed capture moves with the change

`.claude/qa/gen_synthetic_fixtures.py` builds
`mockups/diagnose-workstation.synthetic/finding-case-files.json` by calling the
real `prepared.case(...)`, and `scripts/check_demo_fixtures.py` byte-compares the
committed set against a fresh run. The capture therefore carries the defect
today, which is why every Node suite and browser gate that replays it is green:
they replay a payload in which the feature is inert. Regenerating it is not
housekeeping — it is what gives the frontend tests something real to bite on, and
what puts the corrected payload in front of the frozen behaviour replays.

The rendered surface changes as a consequence: the selected detail's tag prints a
cohort name instead of `undefined`, a `N of M ↑ ↓` position indicator appears
where a cohort holds more than one Occurrence, arrow stepping moves through the
cohort, and the chart dims the cohorts the selection is not in. No component,
layout, or token changes; the shipped components already implement all of it. The
contract for that behaviour stays the existing frozen ledger and replays for this
surface, and the `selected-withheld-light` case in
`mockups/diagnose-event-comparison-support-audit.mjs` remains its rendered proof —
it simply stops being the only lever that can reach it.
