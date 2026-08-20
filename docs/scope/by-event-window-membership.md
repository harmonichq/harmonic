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
- **Accepted failure:** a failed projection fetch under `By event` restores the clock
  canvas and leaves the reader there. CORRECTED 2026-08-19, cold review round 1: the
  original line claimed this was today's behavior and it is not. `paintAlign` hides the
  clock canvas before fetching and the catch arm hides the event host, so a first-fetch
  failure today leaves neither canvas on screen. A failed re-projection must not
  navigate, so restoring the clock canvas becomes work in the order rather than an
  accepted outcome.
- **Unsupported:** verification against real pump data; zero-span windows, which the
  queue's own window rule already rejects.
- **Evidence owed:** the two projections agreeing on membership for one window,
  through their public interfaces; a window wrapping midnight; a thin cohort drawing
  episodes rather than an aggregate; the replay mirror held identical to the Python
  projection; the three browser-gate legs that drive this surface.

## Open questions

- none; the frontier is empty.
- Round 3 cold review pending before the order is posted.

### Cold review, round 1 (two Codex reviewers, 2026-08-19)

10 blocking objections, all `authoring`, none `injected`, none refuted on reproduction.
Four were structural: no per-episode glucose on the wire for the thin-cohort draw, no
occurrence key shared by the two projections, the 24 h preset rejected as a zero-span
window, and the mirror's support stamp keyed on the retiring block coordinate. The
order was rewritten clean rather than patched, and the work sliced into three serial
sub-orders on the slicing rubric's multiple-artifacts and live-run traits.

Decisions taken while rewriting, recorded not asked:
- The occurrence identity both projections publish is `ep_id` plus the anchor's own
  timestamp, the pair the inspector already joins on. `ep_id` alone collides.
- A withheld cohort publishes its episodes' own traces as a bounded server-owned field,
  because the reader-facing decision (Q3) cannot be met from the aggregate payload.
- The response and capture schemas bump rather than mutating in place, since the
  coordinate change is not backward compatible.
- The surface change goes through `/ui-craft`'s revise lane with fidelity evidence, per
  the charter's lock-then-build rule for user-facing surfaces.

### Cold review, round 2 (fresh Codex reviewer, 2026-08-19)

5 blocking objections, all `authoring`, none `injected`, none refuted. The two that
changed the ticket's shape went back to the operator:

- Q6 (Connor, 2026-08-19): the roster, canvas and factor header stop re-deriving window
  membership in the browser and read the server's. Why: `inWindow`
  (`frontend/diagnose-workstation.js:420`) filters exposures on the occurrence's own clock
  minute, a THIRD membership rule; a low anchored at 13:00 whose consequence landed at
  14:35 is in-window for the server and out for the browser, so the reported symptom
  survives a fix that stops at the canvas. `-> ADR`
- Q7 (Connor, 2026-08-19): the event capture's meals occurrences are re-keyed onto the
  workstation fixture's meals episodes, so a roster row click can be proven end to end in
  the browser; lows stay disjoint and the order says so. Full fixture unification is a
  separate concern. Why: the two browser fixtures today share zero episodes (meals 5 vs 20,
  lows 15 vs 20, overlap 0 on both), which makes #57 unprovable at the gate. `-> issue`
  (file the fixture-unification ticket)

Taken while revising, recorded not asked:
- `mockups/diagnose-event-comparison.synthetic/generate.mjs` gains a byte-comparing
  `--check` and a CI step. It has none today: any argument that is not `--write` prints the
  fixture and exits 0, so that committed fixture has a generator and no drift gate, against
  AGENTS.md's own rule.
- Selection crosses the wire as an `ep_id` plus anchor-timestamp pair, not the catalog's
  opaque id, because the roster row that selects has no catalog id to send.
- The `/ui-craft` revise lane's output is REVISION EVIDENCE, produced by the chunk and
  attached by the coordinator, which is the only agent that opens the pull request.

## Spawned tasks

- File a ticket for unifying the browser fixture populations (one synthetic exposure
  population behind both the workstation payload and the event-comparison capture).

- none yet
