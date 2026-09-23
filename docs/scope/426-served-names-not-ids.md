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

- none yet (the coordinator dispatches `/plan-review`)

## Open questions

- none

## Spawned tasks

- Follow-up issue draft for the coordinator (not filed): the active Focus arm's
  `LEVER_NAME` table in `frontend/follow-up.js` has no entry for High-carb
  sequence or Repeat eating, and the record ending assessment prints its raw
  reason (`Unavailable · unavailable_adherence`). Both are outside #426's checklist
  and its sanction.
