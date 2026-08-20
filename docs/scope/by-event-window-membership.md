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

- Q3 (Connor, 2026-08-19): a cohort too thin for an aggregate draws its own episodes,
  faint, named as episodes rather than as a typical response. Why: it answers what
  actually happened without calling one meal typical, and an empty canvas was the
  complaint that opened the ticket. `-> ADR`
- Q4 (Connor, 2026-08-19): the canvas header states both the window it counted in and
  that an episode joins by where its consequence landed. Why: a pooled meal's bolus
  can sit outside the drawn window, and a reader who cannot tell that cannot judge the
  number. `-> ADR`
- Mine, recorded not asked: the block coordinate retires rather than living beside the
  bounds, the shared membership rule is lifted into one home both projections import,
  and the outcome minute is stamped at catalog-build time so the replay mirror
  transcribes a filter instead of re-deriving anchoring. Why: charter reuse and
  no-second-implementation rules. `-> ADR`

### Risk contract

Why: the lens is evidence-only and never enters Priority, Plan or a settings action,
so the exposure is a reader misjudging evidence, not a mis-issued dose.
Disposition: copied into the work order.

- **Must prevent:** a caption asserting a population the canvas did not draw; the two
  panes disagreeing without saying so; one occurrence becoming a median; any path from
  this lens into a recommendation, Plan or settings action.
- **Must recover:** nothing automatically.
- **Accepted failure:** a failed projection fetch under `By event` leaves the reader on
  the canvas already drawn, and they flip back by hand. This is today's behavior.
- **Unsupported:** verification against real pump data; zero-span windows, which the
  queue's own window rule already rejects.
- **Evidence owed:** the two projections agreeing on membership for one window,
  through their public interfaces; a window wrapping midnight; a thin cohort drawing
  episodes rather than an aggregate; the replay mirror held identical to the Python
  projection; the three browser-gate legs that drive this surface.

## Open questions

- none; the frontier is empty.

## Spawned tasks

- none yet
