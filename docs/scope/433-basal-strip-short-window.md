# #433 scope ledger — basal strip on short windows

Triage ledger for GitHub issue #433. The change record is
`openspec/changes/basal-strip-short-window/`. `/scope` (delegated) found
nothing genuinely uncertain. This ledger exists to record the defaults that
were assumed and to instrument the mandatory plan-review rounds.

## Decisions

- **The fix is a vertical scroll on the desktop canvas pane.** Why: only a
  scroll meets "fully visible or reachable by scrolling at every desktop
  window". Shrinking the chart body or the Spotlight floor only moves the
  threshold, and the ≤831px layout already ships this scroll on the same
  element. → ADR (design.md, "The desktop canvas pane scrolls instead of
  clipping the basal lane").
- **The D6 word goes on every served "lower (recurring lows)" slot.** Why:
  every thin lower is one of these by the enforced eight-night floor, and
  naming only the thin ones would need a frontend night floor or a new served
  field. The word is "lower · recurring lows", the issue's own example. → ADR
  (design.md, "A recurring-lows lower takes its own key word, read from the
  served status").
- **The D6 proof runs as a variant inside S113, not as a new story.** Why:
  S113 already owns the key and sits in the fixed smoke slice, so the new case
  store adds no slice change. → inline.
- **The cause stays theory until the coordinator measures base.** Why: a
  worker may not bind a port in this release. The theory and its contingency
  are in design.md. → inline.

### Risk contract

The risk contract is copied verbatim in design.md's "Risk contract" section,
which is the admitted authority. Why: that design.md is the pinned source.
Disposition: admitted.

## Open questions

- The coordinator-run base measurement. Its numbers are recorded by task 1.1.
- For the coordinator: confirm the D6 reading, that the word goes on every
  recurring-lows lower rather than only on the thin ones (see the result).

## Spawned tasks

None.

## Review rounds

Recorded at each plan-review round: the blockers found, each tagged
`authoring` or `injected`.
