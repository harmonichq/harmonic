# Scope ledger — By-event window membership (#62)

Routed from `/ticket triage 62` to interview mode: the facts are grounded, the open
point is a product decision about what the WINDOW control means under `By event`.

## Decisions

- Grounded, not a decision: the by-event canvas and the inspector answer from two
  different membership rules over the same `/explore/exposures` population. The lens
  (`/diagnose/event-comparison`) accepts only a fixed six-hour anchor-time block on the
  raw anchor hour; the queue (`/diagnose/findings`) accepts arbitrary clock bounds and
  re-anchors each occurrence to where its consequence landed. `inline`
- Grounded, not a decision: the empty canvas is a starved cohort, not a broken
  renderer. Reproduced on the committed synthetic capture — same factor, `block=all`
  routes 7 matched occurrences and draws a supported aggregate, `block=evening` routes
  1 and withholds it under the `count <= 1` rule. `inline`
- Grounded, not a decision: `paintAlign` drops a drawn brace and requests the standing
  preset instead, which is frontend-composed scope membership and sits against ADR 31
  part 6. `inline`

## Open questions

- Q1. What the WINDOW control means under `By event`. (round 1, asked)
- Q2. Whether #57 and #58 fold into this ticket or stay separate. (round 1, asked)
- Q3. What the canvas should say when a cohort holds too few episodes to draw.
  (blocked on Q1)

## Spawned tasks

- none yet
