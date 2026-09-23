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
- **The D6 reading is confirmed** (settled 2026-09-23). Recorded verbatim:
  "Coordinator ruling, 2026-09-23: the D6 key word goes on every served
  'lower (recurring lows)' slot, thin or thick. Rationale: every thin lower is
  one of these by the eight-night floor; the word is true for thick ones too;
  limiting it to thin ones would need a frontend night floor (forbidden by
  AGENTS.md) or a new served field." → inline (the design.md ADR cites it).
- **The lane key wraps between whole entries near the narrowest split**
  (settled in plan-review round 1). Why: the pane's width backstop computes to
  `hidden` once the pane scrolls vertically, and the archived #359 measurement
  has the key's count pair past the pane's edge at 832px. So the key must fit
  its width, and at 1280/1440 it still fits on one line. → ADR (design.md, the
  canvas-pane ADR).

### Risk contract

The risk contract is copied verbatim in design.md's "Risk contract" section,
which is the admitted authority. Why: that design.md is the pinned source.
Disposition: admitted.

## Open questions

- The coordinator-run base measurement. Task 1.1 records its numbers,
  including the key entries' horizontal edges.
- ~~Confirm the D6 reading.~~ Closed 2026-09-23 by the coordinator ruling
  recorded under Decisions.

## Spawned tasks

None.

## Review rounds

Recorded at each plan-review round: the blockers found, each tagged
`authoring` or `injected`.

- **Round 1 (coordinator-dispatched): BLOCKED, 3 blockers, all `authoring`.**
  1. Requirement 1 promised the key visible at 832×560, but the fix scrolled
     only vertically. The key's entries overrun the pane's edge there, and
     S151 checked only the key's own box. Fixed: the key wraps between whole
     entries, S151 and S113 check every entry horizontally, and the
     measurement records the entries' edges at 832 and 1200 wide.
  2. The spec's pointer clause named three sizes, but S152 ran only at
     1200×560. Fixed: S152 loops over all three sizes.
  3. The fence called the D6 reading settled while this ledger still listed
     it as open. Fixed: the coordinator ruling is recorded and the question
     closed.

  Also applied: the brief's freeze-header rule. No header re-freeze, and the
  count lines in ACCEPTANCE.md and INDEX.md are coordinator-owned.
