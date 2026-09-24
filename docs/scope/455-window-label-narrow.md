# #455 scope ledger — chart text at the narrowest split

Triage ledger for GitHub issue #455. The change record is
`openspec/changes/window-label-narrow/`. `/scope` (delegated) found the
caption settled by coordinator ruling R455 and three genuine decisions outside
it, which the coordinator ruled on 2026-09-23. It also found one more, Q4,
drafted to its default. This ledger records the rulings, the defaults assumed,
and the mandatory plan-review rounds.

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
- **Q1, ruled (b)** (coordinator, 2026-09-23). Recorded as ruled: "The
  2026-08-19 owner ruling (header truncates, never wraps) is settled and not
  re-litigated, so no second header line. At the narrowest split only, the All
  charts control shows its icon only (keeping its accessible name and
  tooltip), and the freed space lets 'Glucose by time of day' draw, truncating
  with an ellipsis if it must. Acceptance: at 832x720 and 832x560 the title
  renders a non-empty visible string inside the header; at 1280x720 and
  1440x900 the header is unchanged." Triage bounds "the narrowest split" at
  832–1023 px, below the 1024 px tablet width of the 2026-08-19 ruling, and
  S185 pins 1024×768 as unchanged. → ADR (design.md, third ADR 455).
- **Q2, ruled "accept"** (coordinator, 2026-09-23). The Spotlight's verdict
  line breaks between facts, and the figure gives up the line, about 11 px of
  plot left at 832×560. → ADR (second ADR 455).
- **Q3, ruled "keep"** (coordinator, 2026-09-23). The spread tail that a
  window that is not thin sheds when it does not fit keeps shedding. → ADR
  (first ADR 455).
- **The two collisions are fixed here; R455 is amended** (coordinator,
  2026-09-23). Recorded as ruled: "both are fixed in this change (no
  follow-ups) … R455 is amended: desktop sizes may change for exactly these
  two collision fixes and nothing else. Each gets a failing-first check (node
  where the geometry is computable, otherwise a replay check)." Both are
  computable in node. The y-axis yield is also caught in the browser by
  S183's overlap check at every size. → ADR (fourth ADR 455).
- **Stories S183–S185 run on `basal-verdict-gallery`; the smoke slice is
  unchanged.** Why: S113 already carries that case in `SMOKE_STORIES`. S186
  is not used, because the rule's geometry is node-computable. → inline.
- **The base leg precedes implementation** (task 1.5). Why: several things are
  theory from the renders, and S183–S185 on base settle them before code
  moves:
  - the Spotlight mechanism;
  - every preset's thinness;
  - the header's widths;
  - 1024×768's header.

  → inline.
- **Q4 is drafted to its default: charts re-lay out on a size change.** Why:
  every width-dependent choice is made at build time and a resize only
  rescales, so narrowing the window to 832 keeps the wide layout's cut text
  until the next click, which is the state R455 forbids. → ADR (fifth ADR 455),
  pending the coordinator's ruling.

### Risk contract

The risk contract is copied verbatim in design.md's "Risk contract" section,
which is the admitted authority. Why: that design.md is the pinned source.
Disposition: admitted.

## Open questions

- ~~Q1: the header's title.~~ Ruled (b), 2026-09-23.
- ~~Q2: the figure's height at 832×560.~~ Ruled "accept", 2026-09-23.
- ~~Q3: the spread tail.~~ Ruled "keep", 2026-09-23.
- ~~The two collision findings.~~ Ruled into this change, 2026-09-23.
- **Q4: re-layout on resize** (sent to the coordinator). A window resize only
  rescales the overview and the evidence tiles. The caption's fit, the target
  caption, the y-label rule and the Spotlight's rank and verdict line are
  chosen at build time. So a reader who narrows the window from 1280 to 832
  keeps the 1280 layout, and its text is cut, until their next click. The
  options:
  - (a) Relayout on a size change for the overview and the descriptor tiles
    (drafted). Cost: `diagnose-workstation.js` joins the diff, and a resize
    re-renders once per frame.
  - (b) Accept it as a stale layout until the next paint. Cost: R455's 832
    acceptance fails in a state one resize reaches. S183 and S184 would then
    press a preset after each resize, a re-pin.

  Recommended: (a).

## Spawned tasks

None. This release files no follow-up issue.

## Review rounds

- **Round 0 (coordinator rulings, before `/plan-review`).** The draft pinned
  at a55b8f8e left Q1–Q3 and the two findings open. The coordinator ruled all
  five, and this revision absorbs them. There are no reviewer blockers yet.
  The mandatory `/plan-review` is the coordinator's to dispatch.
