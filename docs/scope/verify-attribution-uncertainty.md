# Scope ledger — Verify per-lever attribution and outcome uncertainty (#136)

Ticket #136 asks two things: how Verify attributes an outcome when one change
moved several settings at once, and what uncertainty an outcome delta carries.
Map #133. ADR 24 (`openspec/changes/ic-trial-acceptance/design.md`) settled the
per-block judging inputs and deliberately left the response shape here.

## Settled inputs (ADR 24, not reopened)

- Outcomes are judged per affected clock block; each block matures on its own.
- A multi-setting change runs the carb-ratio evidence bar for its ratio part.
- Ready to judge is not the same as recommending.
- Evidence counts only what arrived after the change.

## Grounding (2026-08-25, `origin/main` 0a2d115)

- `watched_change.review_trials` returns a flat roster; each entry carries one
  scalar `state` (`maturing` / `complete`) and one `maturing` day count.
- `_coalesce_profile_changes` collapses contemporaneous multi-parameter edits
  into a single `profile` candidate with `before`/`after` set to `None`, so a
  bundle has no per-lever identity at all today.
- Verify's before-vs-trial reads are median envelopes: `_bin_row` carries `med`
  and `n` per bin, no interval. The workstation renders `Δ` as a bare rounded
  difference (`frontend/verify-workstation.js:197`, `:237`).
- Diagnose already carries interval language: Wilson intervals on clean rates
  (`outcomes.CleanRate`) and bootstrap `Estimate` bands (`uncertainty.py`).
- #133 lists "whether Verify's uncertainty presentation needs its own visual
  idiom or inherits Diagnose's CI language" as not yet specified.

## Decisions

- **The switcher lists one entry per pump change, not per affected block.**
  Operator decision (Q1), 2026-08-25. A change that moved several settings keeps
  its single entry; per-block verdicts land inside the selected change's detail,
  never as extra roster rows. Why: the list picks which change you are looking
  at, and one change the user made is one entry. Disposition: -> ADR.
- **A multi-setting entry names the profile it moved to** ("Profile change ->
  P0007"). Operator decision (Q1), 2026-08-25. Why: the bare label says nothing
  about which change it is. The name is already stored (`profile_settings.name`)
  for an active-profile switch; an in-place multi-setting edit has no
  destination profile, and its label is Q1b. Disposition: -> ADR.

- **An in-place multi-setting edit is not called a profile change at all.**
  Operator decision (Q1b), 2026-08-25. Why: the user did not switch profiles,
  and saying so is untrue. Only an active-profile switch carries the "Profile
  change -> P0007" label. The in-place case names what moved instead ("Basal + carb ratio changed", operator decision Q1c, 2026-08-25), in the same vocabulary the single-setting entries use.
  Disposition: -> ADR.

- **Verify never names which setting moved the outcome.** Operator decision
  (Q2), 2026-08-25. A change that moved several settings presents one evidence
  view per changed setting (basal on clean nights, correction factor on rest
  windows, carb ratio on meal runs, per #134) and lets the reader judge. There
  is no attribution verdict, no co-changed caveat line, and no
  overlap rule to compute. Why: Verify presents evidence; naming a mover is a
  causal claim the data does not support. Disposition: -> ADR.

- **The range rides on the difference itself, not on each period's own number.**
  Operator decision (Q3), 2026-08-25. A post-meal peak that moved from 187 to
  171 reads "-16 (-38 to +6)", not two overlapping before/after ranges. Why: the
  difference is the number the reader acts on, and two overlapping ranges do not
  mean "no difference" - reading them that way is the error option B invites.
  Disposition: -> ADR.
- **Verify reuses Diagnose's interval language rather than inventing a second
  idiom, and this ticket rules on the wording as well as the computed number.**
  Operator decision (Q4), 2026-08-25. Why: it closes an open item on map #133
  and keeps one uncertainty vocabulary across the app. Disposition: -> ADR.

- **A range that includes zero says "this data cannot tell yet" and names no
  direction.** Operator decision (Q5), 2026-08-25. Why: it is the one case where
  naming a direction invents a result. Disposition: -> ADR.
- **Only the headline before-and-after numbers carry a range**, not every point
  on the before/after curves and not every number on the surface. Operator
  decision (Q6), 2026-08-25. Why: the curves show spread by shape, and a band on
  all 48 clock bins reads as noise. Disposition: -> ADR.
- **A stretch of the day too thin for a range shows no difference at all**, and
  names what it lacks ("3 meals since the change"). Operator decision (Q7),
  2026-08-25. Why: it matches how the app already withholds, and a bare
  difference is the false precision this ticket exists to remove.
  Disposition: -> ADR.

- **The range counts days, not individual meals.** Operator decision (Q9,
  delegated), 2026-08-25, grounded on a read-only snapshot of the operator's own
  history (190 days, 999 meals with post-meal coverage, 5.26 meals/day).
  Measured within-day correlation of post-meal peaks was 0.36, a design effect
  of 2.53, so the honest range is 1.59x wider than independent counting gives.
  On a half-history split the two treatments disagree in the direction that
  matters: independent counting returns -7.5 (-14.3 to -0.9), excluding zero and
  reading as a real improvement, where day counting returns -7.6 (-18.3 to
  +3.5), including zero and reading as cannot tell. Measurement is committed as
  `docs/scope/verify-attribution-uncertainty.spike.py` and reruns against any
  read-only snapshot.
  Caveat recorded: part of that 0.36 is time-of-day rather than a day effect, so
  it is an upper bound. Disposition: -> ADR.
- **Decisions lock here; the build is handed to its own issues.** Operator
  decision (Q8), 2026-08-25. Why: the ruling spans roster labels, per-setting
  evidence views and the interval treatment, which is more than one sitting;
  #24 set the precedent. Note: #19 is now closed, so #133's block on Verify
  build handoffs has lifted. Disposition: -> issue.

- **Evidence views are one per affected part of the day, not one per setting.**
  Operator decision (Q10), 2026-08-25. A ratio change touching morning and
  evening gives two charts and two verdicts. Why: ADR 24 judges each part on its
  own, and on real history one part reached its bar around day 15 while the
  other extrapolated to roughly two months; one chart mixing them hides the part
  that has an answer. Disposition: -> ADR.

### Risk contract

- **Must prevent:** naming a direction a range spanning zero cannot support; a
  range narrower than the evidence earns (independent-meal counting); any
  record-level real data reaching the tree.
- **Must recover:** nothing automatically.
- **Accepted failure:** a stretch of the day with too little data, or a range
  that cannot be computed, shows no difference and names what it lacks; recovery
  is waiting for data.
- **Unsupported:** attributing an outcome to one setting when several changed,
  and causal claims of any kind.
- **Evidence owed:** the interval is day-clustered; a range spanning zero yields
  the "cannot tell yet" wording and no direction; a thin stretch yields no
  difference and names what it lacks; the three roster labels (single setting,
  profile switch, in-place multi-setting edit) each render their own form.
- Why: advisory dosing guidance, one operator, every failure here is a wrong
  claim rather than data loss. Disposition: -> copied into the work order.

## Open questions




## Spawned tasks
