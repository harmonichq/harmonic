# The basal slot panel drills into its nights (#291)

## Why

#305 settled one cohesive Diagnose composition; this ticket is its sixth and
last ordered step, the drill rail's night selection. Three facts on the shipped
app make it possible now and leave it undone:

- The basal analyzer stamps every roster night with its in-slot glucose mean,
  its entering and leaving glucose, and a CGM trace spanning the preceding hour
  and the slot (#299), and the roster carries its own mean glucose. The basal
  evidence tile already receives that payload and draws the nights, but the
  basal slot panel in the drill rail never sees it: the panel prints Current /
  Estimate / Recommended, the interval, the hedges, the support count and the
  staging control, and stops.
- The Finding case file's two occurrence lists share one roster mechanism
  (#298) — grouped headers with served counts, one button row per item carrying
  pressed state, single selection, a show-more cap — and its selected occurrence
  paints a server-owned glucose trace over the pooled envelope on Glucose by time
  of day, with a detail block, arrow-key stepping, "Clear trace" and "Open … in
  Day". The settings family has none of that, and ADR 298 recorded that #291
  would be the roster mechanism's third caller.
- The basal tile's headline now lives in the stage card's title as its only home
  (#306), and its verdict rail keeps the direction counts. The drill rail is
  therefore free to carry the nights themselves without repeating either.

The operator's worked example (scope ledger, 2026-08-31): a slot whose nights
typically run at 115 against a 110 target, with three nights at 130, is a
big-meal carry-over on those three nights rather than a basal problem — and
telling those apart needs each night's own in-slot mean read against the
roster's mean, and the night's trace on the chart.

## What changes

- **The basal slot panel gains a night roster under its numbers-and-staging
  block.** The roster renders through the shared occurrence-roster mechanism in
  three groups — nights the pump ran above the programmed rate, below it, and
  as set — each header carrying its served count, one button row per steady
  night printing the night's date, delivered against programmed rate, and
  in-slot glucose mean. Excluded nights are one count line beneath the groups,
  never rows: the payload carries no per-night facts for them, and per-night
  exclusion reasons stay deferred (#290). Group membership is the served
  per-night `sign`; the panel derives no direction, floor, threshold or
  verdict of its own.
- **Selecting a night draws that night's trace** on Glucose by time of day,
  over the always-present pooled envelope, through the same select-in-place
  path the Finding roster uses: the pressed row changes, the breadcrumb and the
  clock window do not move, Up/Down step through the night's group, and
  "Clear trace" releases it.
- **A selected night shows a detail block** beside the roster, in the Finding
  selection block's own shape: the date and slot span, delivered against
  programmed rate, that night's in-slot mean against the roster mean, entering
  to leaving glucose, `n of N` within its group, "Clear trace" and
  "Open <date> in Day".
- **Nothing else on the panel moves.** Current / Estimate / Recommended, the
  interval and its hedges, the support count, the analyzer sentence and the
  staging control render exactly as shipped, gated on the served `asserts_move`
  as today. The basal tile and its verdict rail are untouched. The correction
  factor and carb ratio panels are untouched: their evidence shapes carry no
  per-item glucose facts today, and giving them a roster is not this ticket.
- **The frozen behaviour ledger is amended** for the added behaviour: new
  executable stories for the roster's groups and counts, night selection and
  its trace, the detail block, stepping, and the clear, replayed against the
  built app on the declared no-fetch server, with before/after renders of the
  basal drill at every affected viewport.

## Boundaries

Frontend only. No analyzer, projection, endpoint or payload change: the roster
reads the night-evidence payload the tile already requests, and requests it no
second way. The frontend re-derives no floor, threshold, direction or safety
verdict (`AGENTS.md`, "Safety invariants"). No new chart and no new module. The
drill pane does not repeat the served headline (#306). Light theme is retired
(#304). Per-night exclusion reasons stay deferred (#290). #302's tapered queue
is a sibling, not a dependency.
