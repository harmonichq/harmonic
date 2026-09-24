# #455 scope ledger — chart text at the narrowest split

Triage ledger for GitHub issue #455. The change record is
`openspec/changes/window-label-narrow/`. `/scope` (delegated) found the
caption and the Spotlight line settled by coordinator ruling R455 and the
coordinator's scoping, and one genuine decision outside them: the canvas
header's title. This ledger records the defaults assumed, the questions sent to
the release coordinator, and the mandatory plan-review rounds.

## Decisions

- **R455 binds the caption** (coordinator ruling under the Q3 delegation,
  Connor Griffin, 2026-09-23). Recorded verbatim: "At 832 px the window label
  wraps inside the chart bounds (words kept whole, nothing shortened); no
  change at 1280x720 or 1440x900. A replay check measures it." → ADR
  (design.md, first ADR 455).
- **Every Diagnose chart text overrunning at 832 px in the #433 renders is in
  scope** (the coordinator's triage instruction). Reading the renders found
  the Spotlight's middle-rank verdict line losing its programmed rate, which
  therefore joins this change. → ADR (design.md, second ADR 455).
- **The caption keeps every one-line placement and wraps only where one line
  fits nowhere.** Why: that is the least change that meets R455, and it leaves
  every caption that fits today exactly where it is, at every size. → ADR.
- **A thin caption stacks its name over its notice**, with the newline opening
  the notice's rich token. Why: the spike shows that ZRender drops a newline
  ending a plain segment under `overflow: 'break'`, and stacking keeps the
  safety notice together as one unit. → ADR.
- **A wrapped caption wears the knock-out pad, and the target caption takes
  its floor placement.** Why: a second line crosses the 180 rule and fills the
  target caption's row; both placements already ship. → ADR.
- **The Spotlight's verdict line breaks between facts, and the figure gives
  up the line.** Why: no type size fits the longest verdict at 832, and
  stepping the verdict below the tally inverts their rank. The cost at
  832×560, about 14 of about 25 px of plot, is sent to the coordinator as Q2.
  → ADR.
- **Stories S183 and S184 run on `basal-verdict-gallery`; the smoke slice is
  unchanged.** Why: S113 already carries that case in `SMOKE_STORIES`.
  → inline.
- **The base leg precedes implementation** (tasks 1.4). Why: the Spotlight
  mechanism (under the Keep control, or past the canvas) and every preset's
  thinness are theory from renders; S183 and S184 on base settle both before
  code moves. → inline.
- **The spread tail that a window that is not thin sheds when it does not fit
  keeps shedding.** Why: that is shipped behavior at every width. The spread
  also prints in the header readout and the inspector, and it is not the
  safety notice. Sent to the coordinator as Q3 to confirm R455's "nothing
  shortened" does not reach it. → inline.

### Risk contract

The risk contract is copied verbatim in design.md's "Risk contract" section,
which is the admitted authority. Why: that design.md is the pinned source.
Disposition: admitted.

## Open questions

Sent to the release coordinator. Each has a recommended default, and the
draft is written to that default.

- **Q1: the canvas header's title at 832 px.** "Glucose by time of day"
  paints nothing there, because the provenance chip and the All charts control
  fill the one-line header. The 2026-08-19 owner ruling says that header
  truncates, never wraps, and never hides its provenance. The options:
  - (a) At the narrowest split only, the header takes a second line when the
    title, the provenance and the control cannot share one. Everything reads
    whole. It amends the 2026-08-19 ruling at that width, and the Spotlight
    loses one header line of height.
  - (b) The All charts control shows its icon only at the narrowest split. The
    title then truncates to what the room left allows. It stays one line, and
    the title stays partly cut.
  - (c) Record it as accepted (Unsupported), as ADR 433 did for the hover
    readout.

  Recommended: (a). It is the only option that meets R455's own standard.
  Deciding it needs the coordinator's measurement of the header's parts, below.
  Not in the draft until ruled.
- **Q2: the Spotlight's figure height at 832×560.** Default: break between
  facts and accept about 11 px of plot at that short window. Alternative: the
  9 px step-down hybrid in design.md.
- **Q3: the spread tail.** Default: unchanged.
- **Findings, not in this change:** the y-axis minimum label half-hidden under
  the "70" target numeral, and the Spotlight's programmed-rate tick crossed by
  its rule, both at every size. R455 rules out change at 1280×720 and
  1440×900, so the coordinator decides where they go.

## Spawned tasks

None. This release files no follow-up issue.

## Review rounds

None yet. The coordinator dispatches the mandatory `/plan-review`.
