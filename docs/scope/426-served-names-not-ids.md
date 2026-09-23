# #426 — Day and Changes print internal ids where a served name exists

Scope ledger. Opened 2026-09-23 by delegated triage (release brief for #422–#434);
route: nothing genuinely uncertain. `/scope` returned without an interview: the
wording is covered by Connor's standing sanction (2026-09-23, Q2 A), and each open
point below had a grounded default.

## Decisions

- Classification: code. Why: five reproduced render defects plus two served
  fields. `inline`
- The model read serves the episode's name as `lever_title`, beside `lever`, null
  when the episode carries no Lever. Why: the episode already serves `lever`;
  CONTEXT.md lists "cause" as a synonym to avoid for Lever, and the behavioral
  spec calls Cause an internal attribution construct. #423 consumes this field.
  `→ ADR`
- Pattern member and action names are served by guidance's Pattern adapter, not
  by the outcome roster. Why: the roster is deep-copied into findings-projection
  rows and pinned literally in the QA expectations (70 cases carry a literal
  roster); guidance already
  holds the served name for every member's subject. Names never enter the
  set-aside comparison state. `→ ADR`
- The Day entry carries a display `title` beside its routing `subject`, as a new
  address key, and Day never prints the subject. Why: the address is the only
  route state that survives reload and Back; an address without a title names the
  return destination instead. `→ ADR`
- The Changes test builds its Pattern concern from a new generator-owned key in
  the findings-projection fixture (`browser_guidance_patterns`), so it reads the
  field names the server produced rather than hand-written prose. `inline`
- Two serial chunks: served names plus Changes, then Day plus the replay and
  ledger amendments. Why: two slicing traits fire (served contract + desk
  consumer + ledger; a replay against the offline server) and each chunk projects
  at or above the 120k floor. `inline`
- Setting members are named by CONTEXT.md's user-facing labels (Basal,
  Correction factor, Carb ratio) from a closed table beside guidance's units
  table, not by the tuning lever's title. Why: that title reads "ISF", banned in
  user copy, and no backend table served "Correction factor". Coordinator ruling,
  plan review round 1, 2026-09-23. `→ ADR`
- A basal slot's Day entry reads `Basal · 03:00–03:30`, composed in the Diagnose
  door from the desk's existing setting-name and clock formatters. Why:
  CONTEXT.md's user-copy form for a slot; the earlier no-import rule rested on a
  false premise. Coordinator ruling, round 1. `inline`
- S61/S62 amendments live in the ticket's own dated ledger section; no frozen
  block is edited. Why: release freeze-header rule, 2026-09-23. `inline`

### Risk contract

- **Must prevent:** a reader-facing line printing an internal identifier where a
  served name exists; a printed name that differs from the one the server serves
  for that subject (silent incorrect success); any change to which Lever an
  episode carries, to staging, caps, floors or ranking; a set-aside subject
  returning because a name was added; real data in any fixture, capture or log.
- **Must recover:** none.
- **Accepted failure:** an address written before this change carries no title,
  so its Day entry names only the destination it returns to.
- **Unsupported:** viewports other than the two supported desktop sizes.
- **Evidence owed:** a backend test that the model read names every attributed
  episode and nulls an unattributed one; a backend test that every served
  Pattern member and identified action carries a name and the set-aside baseline
  is unchanged; node tests for each of the five lines, each failing first on the
  base; the amended S61 replay at 1280x720.
- Why: these lines sit on an advisory dosing surface, so the harm is a misleading
  name, not downtime. Disposition: copied unchanged into
  `openspec/changes/served-names-not-ids/design.md`.

## Spikes

- `docs/scope/426-served-names.repro.mjs` (`node docs/scope/426-served-names.repro.mjs`):
  renders the five lines through the shipped modules on the base and prints
  `pattern:highs_after_meals` and `basal:180` under "Opened from", the raw
  `missed_meal`, `meal_bolus_short`, `high_carb_sequence` and `repeat_eating`
  row endings, `The intended behavior: late_bolus`, `unavailable: not_recorded`,
  and six `habit:`/`setting:` leaks in a Pattern concern built from the
  committed fixture's roster.
- `docs/scope/426-served-names.repro.py` (`uv run python docs/scope/426-served-names.repro.py`):
  an attributed model-read episode serves `lever` and no name while the lever
  name source covers all ten Levers; guidance's Pattern adapter serves members
  and action with ids only.

## Review rounds

- Round 1 (coordinator-dispatched `/plan-review`, lock 1 draft at 437f2524):
  BLOCKED, 4 blocking, all `authoring`, each verified by the coordinator or
  reproduced here. (1) guidance member names break
  `tests/test_pattern_replay.py:135`, which was in no expected diff → added to
  sub-order 1, the roster stays the oracle with names compared separately;
  (2) the amended S61 had no fail-first proof → a fake-page case in
  `frontend/replay-cases.test.js`; (4) setting members would print "ISF" →
  closed CONTEXT.md label table in guidance; (5) the ban on importing
  `frontend/plan-view.js` into the Diagnose door was false (it loads in node;
  the door's test already imports modules that pull routes.js) → removed, the
  door composes the slot words itself. Finding 3 (#423's row ending) needed no
  change; a Context line cites the coordinator's cross-ticket ruling. The
  ledger-amendment form was brought under the new freeze-header rule.

## Open questions

- none

## Spawned tasks

- Follow-up issue draft for the coordinator (not filed): the active Focus arm's
  `LEVER_NAME` table in `frontend/follow-up.js` has no entry for High-carb
  sequence or Repeat eating, and the record ending assessment prints its raw
  reason (`Unavailable · unavailable_adherence`). A setting concern's own
  nameplate in Changes still prints the tuning lever's title, which reads "ISF"
  for the correction factor. All three are outside #426's checklist and its
  sanction.
