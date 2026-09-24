# #445 (+#444) — Changes and carb-utility Day links carry page selectors; a utility Day return rebuilds Diagnose; Log carbs prints the UTC date

Scope ledger. Opened 2026-09-23 by delegated triage for the #442–#457 release;
route: nothing to scope beyond the coordinator's settled rulings R444 and R445,
defaults assumed and listed below. Decisions come from the release coordinator
under the operator's Q3 delegation, never from a direct operator interview in
this session. The OpenSpec change is `openspec/changes/day-link-identities/`.

## Decisions

- R445 (settled, do not re-litigate): Day links from Changes and the carb
  utilities carry an identity (a date, a carb entry id, a question key), never a
  page selector; the origin resolves it on return (ADR 428 pattern); a
  carb-utility Day return into Diagnose is retained. `→ ADR` (ADR 445)
- R444 (settled): #444's checklist as written. `→ ADR` (ADR 444)
- A utility's identity rides the routing `subject` (`carb:<id>`,
  `question:<detector>|<anchor_t>`); `title` stays the printed label. Why: ADR 426
  split title from routing subject, and the utility subject was its display text.
  Spiked in `docs/scope/445-day-link-identities.spike.mjs`. `→ ADR`
- A Changes return is named by the entry's existing `date`; nothing is added.
  Why: the date is the identity, already carried. `→ ADR`
- `focus` leaves the address contract. Why: no writer remains after ADR 428 and
  this change, and keeping it passes a selector read from the URL to the page.
  `→ ADR`
- A utility return navigates with no context (plain). Why: the entry names the
  utility's item, not the destination's case; ADR 428 point 7 then retains
  Diagnose. `→ ADR`
- Changes places its return focus on the first content render of a Day-return
  arrival, once, desktop only. Why: reproduced — the loading frame's heading takes
  Day's request, so the base never reached the date control. `→ ADR`
- Identities from the address become selector text only as an ISO date or a
  served item's own identity. Why: the address is external input. `→ ADR`
- #444 has a zoned Node test and no replay story. Why: the replay browser runs in
  the runner's zone (UTC on CI), as #427 recorded. `inline`
- Coordinator ruling Q1 (2026-09-23, Q3 delegation): a plain utility return
  drops a held "Return to Trial". `→ ADR` (ADR 445 point 6, Rulings)
- Coordinator ruling Q2: Log carbs returns to the entry's Open Day control.
  `→ ADR` (ADR 445 point 4, Rulings)
- Coordinator ruling r1-1(a): one status read and the drill kept hold while the
  store has not moved; a moved-store return re-reads (ADR 414), recorded as a
  consequence. `→ ADR` (ADR 445 point 3)
- Coordinator ruling r1-1(b): focus lands on the pressed Open Day control on both
  paths. Diagnose's rebuild sets no `#crumb-trail` default while a utility is
  seated. Why: its other focus targets sit in the inspector the utility makes
  inert, so the default is the only move that displaces the router's carried
  focus. `→ ADR` (ADR 445 point 7)
- Coordinator ruling r1-1(c): S164 carries both the moved and the unmoved Log
  carbs return. `inline` (task 4.2)
- Coordinator ruling r1-2: a Node test pins the utility-over-Day return. `inline`
  (task 1.3)

### Risk contract

Copied unchanged into `openspec/changes/day-link-identities/design.md` ("Risk
contract"), which is the admitted authority.

Why: a Day link and its return are one round trip whose failure mode is a leaked
or crafted selector, or a return that silently rebuilds or loses the reader's
place.
Disposition: copied into the #445 execution lock.

## Open questions

None. Q1 and Q2 were ruled at plan review round 1.

## Spawned tasks

None. The release allows no follow-up issues.

## Review rounds

Plan-review rounds are dispatched by the coordinator; each round's blockers are
recorded here as `authoring` or `injected`.

- Round 1 (draft pinned at 669327af): 3 blockers, all `authoring`, 0 `injected`.
  1. A return after the store moved re-reads, and the rebuild's `#crumb-trail`
     default displaced the utility's focus.
  2. There was no Node test for the utility-over-Day return.
  3. The open questions were still open. The coordinator ruled on all three
     (r1-1, r1-2, Q1/Q2).
