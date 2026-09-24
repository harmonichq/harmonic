# #454 scope ledger — fixture Pattern mirror family filter and real-shaped manufactured rows

Triage worker ledger for #454 (change `fixture-meal-shapes`). Grounded on
`origin/main` b03431d2 against committed synthetic fixtures only; no case store was
served and no port was bound. Evidence scripts:
`docs/scope/454-mirror-family.repro.mjs` (node half of the reproduction),
`docs/scope/454-backend-family.repro.py` (Python half) and
`docs/scope/454-row-shapes.measure.py` (what a regenerated exposure feed moves).

## Decisions

- **R454 (coordinator ruling under the Q3 delegation, 2026-09-23): "As the issue's
  checklist", with the coordinator's triage instruction to mirror the backend's
  rate-family filter exactly and to put every manufactured generator row that
  carries a kind, verdict or cause text its real producer would never serve in
  scope.** Why: settled by the release coordinator. inline.
- **The mirror reads the backend's own lever-to-rate-family table, frozen by the
  projection fixture generator from the evidence-population policy, and published
  in the event-comparison capture as `pattern_families`.** Why: `generate.mjs`
  already publishes a hand-written `pattern_families` that nothing reads and that
  disagrees with the backend (Meal bolus fell short reads highs; Missed /
  unannounced meal, High-carb sequence and Repeat eating are missing); a generated
  table replaces one hand transcription instead of adding a second. → ADR.
- **The mirror is held to the Python case producer by frozen answers for two real
  out-of-family rosters (Correction stacking under Lows after correcting highs;
  High-carb sequence under Highs after meals), not by a hand-written expected
  list.** Why: "exactly as the backend does" is only checkable against the
  backend's own answer; the two cover a lever counted in another family and a lever
  with no rate family. → ADR.
- **Manufactured exposure rows take the real feed's shapes: kind and label per
  family, exactly the classifiers judged at that anchor kind, closed silence
  reasons, a claimed row's own verdict matched with its sentence as the row's text,
  unclaimed rows unjudgeable.** Why: R454; every current row carries `iob_stacking`
  (not a Lever) with `no_signal` (not a silence reason), and meal, high and
  correction rows carry low kinds, low verdicts and a low-treatment sentence. → ADR.
- **Default pending coordinator confirmation (Q1): the four Finding verdict bands
  that move on their own claimed rows are accepted and recorded.** Why: the real
  producer always carries a claimed row's own verdict matched, so no real shape
  keeps those cells; measured, nothing else moves. → ADR.
- **Default pending coordinator confirmation (Q2): the two correction-cluster rows
  keep their Correction on active insulin claim.** Why: re-attributing them to
  Correction stacking moves queue order in three windows and that Finding's
  episodes (5 → 3), chips, count sentences and headline — a count moving
  elsewhere, which the issue forbids; the ruling names kind, verdict and cause text,
  all of which are fixed. → ADR.
- **Default pending coordinator confirmation (Q3, fence widening): the High rows'
  anchor glucose is lifted to a value a High anchor can carry.** Why: same rows,
  same function; today 70–78 mg/dL on a High whose anchor is the peak of a run that
  reaches 250; measured, nothing moves. → ADR.
- **No ledger story; surface lifecycle none.** Why: the desk code is untouched and
  the frozen ledger replays QA case stores, which this change does not reach;
  story block S182 stays unused. inline.
- **Flat, Targeted.** Why: slicing traits "lockstep copies" and "split-path
  evidence" fire, but every chunk would fall under the 120k floor; no sensitivity
  floor applies to fixture generators and a fixture-only mirror. Reviewer-memory
  anchor: absent. inline.

### Risk contract

- **Must prevent:** a committed fixture that serves a kind, verdict, silence
  reason, cause text or anchor glucose the real producer cannot serve for its
  family; a mirror that passes its gate while diverging from the Python case
  producer (silent incorrect success); any count, claim, admission, queue order or
  sentence moving outside the enumerated band cells; real or copied patient data in
  any fixture; any change under `ciq_autotune/`.
- **Must recover:** none (build-time fixture generation, no runtime path).
- **Accepted failure:** a drift check that fails because the chain was regenerated
  out of order; clear stop, rerun in the documented order.
- **Unsupported:** an out-of-family member in the committed browser roster (none
  today; the frozen variants cover it); the event-comparison capture's
  exploration-only `views`.
- **Evidence owed:** a node test through `projectPatternCaseFile` that fails on the
  base mirror against the frozen Python answers; a Python test through the
  generator's committed output that fails on the base rows; every drift check
  green; the measurement's before/after recorded in `design.md`.
- **Why:** the browser gates certify the advisory desk against these fixtures; a
  fixture the producer cannot emit certifies a state no user can reach.
- **Disposition:** copied into `openspec/changes/fixture-meal-shapes/design.md`.

## Open questions

- Q1–Q3 above: returned to the release coordinator with the defaults shown.
- Finding (not in #454's fence): with real-shaped rows, a claimed Pattern row's
  cause line and its claimant's habit line print the same classifier sentence.
  Production serves this today: the cause text is the exposure Occurrence's first
  attributed step text, which is the claimant's matched verdict detail, and the
  claimant's habit entry serves that same recorded detail. Returned to the
  coordinator as a release finding.
- Finding (not in #454's fence): the event-comparison capture's exploration-only
  `views` rows judge Correction stacking at low anchors, which the attribution step
  never does; they feed only `projectSyntheticCapture`. Returned to the coordinator
  as a release finding.

## Spawned tasks

None.

## Review rounds

- Round 0 (triage draft): awaiting the coordinator's `/plan-review`.
