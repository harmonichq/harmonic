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

- Q1 (Connor, 2026-08-19): the window filters the by-event canvas for real. The lens
  takes the same clock bounds and the same outcome-anchored membership rule the
  findings queue uses, so the canvas and the inspector count one population. Why: it
  is the only shape where the inspector counting 10 while the canvas draws 1 cannot
  happen, and it returns membership to the server per ADR 31 part 6. `-> ADR`
- Q2 (Connor, 2026-08-19): #57 (selecting an occurrence draws nothing) and #58
  (duplicated canvas header) land in this ticket. Why: all three defects are in
  `paintAlign`, and the un-hidden clock header is what prints #62's own wrong window.
  `-> issue` (close #57 and #58 on this pull request)

## Open questions

- Q3. What the canvas says when a cohort holds too few episodes to draw. (round 2)
- Q4. Whether an episode's trace is clipped at the window edge or drawn whole.
  (round 2)

## Spawned tasks

- none yet
