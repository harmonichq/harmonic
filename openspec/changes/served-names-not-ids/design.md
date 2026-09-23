# #426 design

## ADR 426 — Names are served beside identifiers by the owner that already names them

**Decision.** The server serves each name the desk prints, beside the identifier
it names, from the module that already owns that name:

- the per-day model read (`_build_episode_view`) serves `lever_title` on every
  episode, equal to `levers.title(lever)` for an attributed episode and null
  for an unattributed one;
- guidance's Pattern adapter (`_pattern_candidate`) serves, on every Pattern
  candidate, `title` on each member and `action_title` on each member whose
  served `action` is non-null, and `title` on the Pattern's `action` when it is
  an identified action (`{"action_id": …}`) rather than span rows. A habit
  member's names are its Lever's served title, which guidance already holds on
  that habit's source candidate; a setting member's names are the tuning lever's
  served title for that parameter, which guidance already reads for setting
  candidates. The Pattern action's title is the title of the member it came
  from.

The desk prints these fields and keeps no name table for them.

**Why this owner.** The outcome roster (`build_outcome_patterns`) is deep-copied
into every findings-projection Pattern row and pinned literally across the QA
expectations (70 cases carry a literal roster), so naming members there would
move frozen projection payloads and rewrite those literals for a presentational
field. Guidance is the read Changes renders and already holds the served name
for every member subject. The one lever name source is `levers.title`; the
episode name reuses it rather than adding a second table.

**Field name.** `lever_title`, beside the episode's existing `lever`. CONTEXT.md
lists "cause" as a synonym to avoid for **Lever**, and the behavioral spec calls
Cause an internal attribution construct. #423 consumes this field.

**Invariant.** Names never enter guidance's set-aside comparison state
(`_state` keeps kind, the chosen member's action string, seriousness and the
member fingerprint), so adding or rewording a name cannot return a set-aside
subject. The existing baseline key test stays as written and a new assertion
pins the baseline value.

## ADR 426 — The Day entry carries its display name in the address

**Decision.** A contextual Day entry carries a display `title` beside its routing
`subject`. `title` joins the address keys (`CONTEXT_KEYS` in
`frontend/tab-routing.js`), so a reload or Back restores it with the rest of the
entry. Day's "Opened from" prints the title and never the subject. An address
without a title (one written before this change, or edited by hand) names the
destination the entry returns to instead.

Each door supplies the name the reader was just looking at:

- a Diagnose occurrence: the served finding title the case context holds
  (`selected.finding.title`);
- a basal slot with no case: the slot's setting name and start clock time,
  composed from the desk's existing setting-name and clock formatters;
- a Changes record or the active change: the title that record's own nameplate
  shows, through the same function;
- a utility moment: the label the utility already passes.

The subject, occurrence, window, lever, focus and return behave exactly as
before; the subject stays the routing key the return trip uses.

**Why.** Return context is frontend-owned route state carried in the address
(ADR 416 desk routing). A name held only in memory would vanish on reload while
the address still named the entry, so the Day entry would read differently from
the same address.

## Revise preparation

- **Lifecycle:** `revise`, routed by UI Craft on 2026-09-23 (`shipped`,
  `runnable`, declaration `complete`, data source `manufactured`). Convergent
  work: the wording is settled, so no wireframe phase opens.
- **Safe start:** `AGENTS.md`, "The data boundary", the QA copy-then-serve
  command over a copy of `mockups/qa-e2e.synthetic/harmonic.sqlite`, or a named
  case store emitted by `scripts/gen_qa_e2e_db.py --case <name>`. Both are
  generated entirely by `scripts/gen_qa_e2e_db.py`.
- **Base:** origin/main `a4d374a72c8048d9d93ee4925805b91cf5674835` (#420).
- **Base replay:** the main push CI run on that exact commit, 35826580306,
  replayed the complete desk ledger (147 selected) green at 1280x720 and
  1440x900. The scheduled run 35872827406 on the same commit failed one
  1280x720 shard (1/4); its failing story is recorded only in the uploaded
  replay log. No local base replay was run (the release brief forbids
  port-bound legs in triage).
- **Inventory diff:** no story asserts the Episode Log's cause wording, the
  record's "What changed" or unavailable-context line, or the Pattern concern's
  member table. S61 asserts only that "Opened from" is present; S62's ledger
  text says the Day desk names the subject "verbatim". C3 S54 needs the literal
  "Not recorded", which the record's "Earlier decision" row still supplies.
- **Sanctioned changes to shipped desk behavior** (Connor Griffin, 2026-09-23,
  release question Q2, answered "A"): "I record your answer as the approval for
  every change these 13 checklists call for, and write the wording in
  CONTEXT.md terms." Under it, S61 and S62 are amended; no story is retired.

## Risk contract

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
  name, not downtime. Disposition: admitted here from
  `docs/scope/426-served-names-not-ids.md`.

## Traps for the implementer

- `frontend/day-chart.js` `buildRows` keeps episode-only display context out of
  anchor rows; the row already carries `lever`, and the name may travel beside it
  or through the ledger entry, but Day derives nothing from the key.
- `frontend/diagnose-context.test.js` deep-equals the Diagnose door's context and
  round-trips the return context through the router; both gain `title`.
- The locked prototype `mockups/harmonic-v2-glucose-day.js` carries its own copy
  of the Day name table and imports from `frontend/day-chart.js`; it is frozen
  history and does not change. It imports none of the deleted exports.
- `frontend/desk.browser.test.mjs` stubs `/api/model-view`; its stub gains
  `lever_title` so it stays the served shape.
- The parallel tickets #423 (Episode Log row), #428 (Day entry `focus`) and #430
  (`originalSection`) edit neighbouring lines; the coordinator merges.
