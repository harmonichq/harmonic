# Scope ledger — #101 Occurrences roster keyboard traversal

Ticket: harmonichq/harmonic#101. Surface: Diagnose → finding case file → Occurrences
roster and selected-occurrence detail. Contract: `mockups/finding-evidence-routing.behavior.md`
(rows P24, P25) and `frontend/diagnose-workstation-behavior.replay.mjs` (S12).

## Decisions

- **Lifecycle is `revise`, not `resettle`.** No lock manifest exists for this surface;
  the `LOCK:diagnose-workstation:21` tags are legacy provenance. The binding contract is
  the frozen behavior ledger, amended under a dated `## Revision — …` section. `inline`
- **Default key model: add ArrowUp/ArrowDown as the roster's stepping keys, keep
  ArrowLeft/ArrowRight working.** Why: P24/P25 stay true in form (S12 keeps passing,
  `n of N` survives); the visible vertical order gains matching keys; the keyhint is
  rewritten to show the vertical pair so discovery matches the list. Operator ruling on
  the final key set is carried to the work-order approval as an open decision. `inline`
- **Focus stays on the roster after selection.** Why: the QA source (24H-93-02) records
  focus loss after Enter; the repaint replaces the buttons with no restore. Precedent is
  #86's filter menu (focus restore after repaint). Without it a keyboard reader cannot
  reach the keys at all, so the ticket's "traversal" is not fixed without it. `inline`
- **Out of scope:** the lens chart's ←/→ 5-minute cursor (P26), segmented groups (P27),
  the private exploration wireframes under `mockups/finding-evidence-routing.exploration/`.
  `inline`

### Risk contract

- **Must prevent:** secret exposure; irreversible loss of authoritative data; silent
  incorrect success (a replay that passes while the new keys do nothing).
- **Must recover:** none — pure frontend interaction.
- **Accepted failure:** a browser-gate leg fails to start (missing driver/vendor) → a
  clear nonzero stop, manual rerun.
- **Unsupported:** screen-reader announcement design beyond `aria-pressed` and focus;
  touch/mobile roster navigation.
- **Evidence owed:** replay stories for ↑/↓ stepping, end-stop, ←/→ retained, keyhint
  text, and focus remaining on the selected roster row after Enter and after a step.
- Why: advisory-dosing app, but this change touches no dose logic; regressions are
  visible in the browser gate. Disposition: inline, copied into the work order.

## Open questions

- Final key set for roster stepping (additive ↑/↓ recommended; alternatives: replace
  ←/→, or keep ←/→ only and fix discoverability). Owner: Connor, at work-order approval.

## Spawned tasks

- none

## Re-verification — 2026-08-23 (triage re-run)

The aborted run's claims were re-checked against the repo. Confirmed, corrected and
added:

- **Confirmed.** `frontend/diagnose-workstation.js:2561-2584` binds a document
  `keydown` that returns unless the key is ArrowLeft or ArrowRight; it steps
  `f.selectedId` through `f.caseFile.occurrences` filtered to `f.bandVerdict || 'fired'`
  and stops at both ends. ArrowUp/ArrowDown reach nothing. `inline`
- **Confirmed.** `renderCaseRoster` (line 559) emits a vertical stack of
  `button.ev-row.case-occurrence` with `data-occurrence-id` and `aria-pressed`, capped
  at `EVIDENCE_CAP = 5` (line 202) behind an "N more" button; `renderCaseSelection`
  (line 606) prints `n of N` with `<i class="keyhint">← →</i>`. `inline`
- **Corrected — the order must ADD two guards, not "preserve" them.** The keydown has
  no `filterOpen` guard and no `#ec-chart` guard today, and neither neighbouring
  handler stops propagation, so both collisions are real the moment Up/Down is bound:
  - the Sift/filter menu's own roving handler (`menu.onkeydown`, lines 2077-2095) claims
    ArrowUp/ArrowDown and calls `preventDefault()` only — the event still bubbles to the
    document listener;
  - `#ec-chart`'s keydown (`frontend/diagnose-event-comparison.js:661-676`) handles only
    Arrow**Left**/**Right**/Home/End/Escape and likewise never stops propagation, and the
    chart is mounted inside this same page (`diagnose-workstation.js:49,1094`). Binding
    Up/Down at the document would newly steal them from a reader operating the chart.
  Why: both states are reachable in the shipped app, so these are earned guards, not
  speculative ones. `inline`
- **Added — the closed inventory was incomplete.** Beyond the three files the aborted
  draft listed, a revision of this surface also touches `mockups/INDEX.md` (its
  finding-evidence-routing row records every prior revision, #62/#10/#83) and the
  ledger header's maintained **"74 executable entries"** count. `inline`
- **Confirmed.** Highest existing story is S71, so S72-S74 are the next free ids, and
  `ui-craft` `revise` §4 requires the *changed* S11 hint assertion to be proven failing
  before the new one passes — not only the added stories. `inline`
- **Confirmed.** Amendment convention is a dated `## Revision — <date>, base <sha>
  (issue #N: …)` section; twelve precedents exist (ledger lines 1268, 1699, 1756, …).
  `inline`
- **Confirmed.** The safe-start declaration `ui-craft` `revise` §0 demands exists:
  AGENTS.md "The data boundary" names `uv run harmonic serve --no-fetch --db
  mockups/revise-e2e.synthetic/harmonic.sqlite`, whose database is generated in full by
  `scripts/gen_revise_e2e_db.py` (seed 620). `inline`
- **Confirmed.** The ticket's source record reads verbatim as quoted, including the
  focus loss, at `docs/qa/issue-93/24h-reaudit.md` entry 24H-93-02 on branch
  `codex/93-diagnose-cold-qa`. `inline`
- **Shape: flat, one agent.** Slicing traits: only *live run inside the ticket* clearly
  fires (the browser replay must be stood up), and the harness is already committed. Any
  split would leave both halves far under the 120k fold-in floor. Anchor row A. `inline`
- **Review depth: targeted.** No sensitivity-floor trigger — no auth, secrets,
  destructive operations, or org-shared behavior; the change touches no dose logic.
  `inline`

## Open questions (carried to the work-order approval, unresolved)

- Final key set for roster stepping. P24/P25 are operator-ruled `kept, re-homed`
  (Connor, 2026-08-19), so changing which keys step is a ruling, not an agent call.
  Recommended: additive — ArrowUp/ArrowDown step, ArrowLeft/ArrowRight keep working,
  keyhint becomes `↑ ↓`. Owner: Connor.

## Plan-review instrumentation

**Round 1** (one cold Opus reviewer, ordinary-stakes tier → one panel). Blockers: 3,
all tagged `authoring` — present since the aborted run's draft, none `injected` by a
fix round. Notes: 3. No rewrite-clean signal.

- B1 `authoring` — the draft demanded a `filterOpen` guard for a state that cannot
  occur. Enforced by `push()` 1598-1601, `popTo()` 1603-1609 and `paintFilter`
  1995-2005, all clearing `filterOpen`, against a roster handler requiring
  `k === 'factor'`. Reached independently by triage before the reviewer reported;
  both agreed. Fixed: guard forbidden, invariant named in the order.
- B2 `authoring` — the focus-retention recipe could not be implemented as written.
  `requestCase` paints twice (sync at 1453-1456, async at 1462-1469), so a one-shot
  `requestAnimationFrame` focuses a button the second paint discards; and
  `selectOcc(occ)` at 1650-1654 takes an occurrence, not an event, so the
  `ev.detail` origin test would have forced an unauthorized signature change on
  `renderCaseRoster`'s `onSelect`. Fixed: render-path intent flag consumed after
  2295-2298, device-origin discrimination dropped entirely.
- B3 `authoring` — a "Done when" clause asserted filter-menu behaviour that passes
  identically whether the guard exists, is absent, or is inverted. Fixed: deleted.
- N1 — the `#ec-chart` citation pointed at a declaration (line 1094) rather than the
  mount. Fixed: `ownsAlign` 2525-2527 plus the mount at 1908-1921, with the
  alignment reachability condition and the `withFiredMeal` replay route.
- N2 — ledger row P27 cites `installSegKeys` at
  `frontend/diagnose-event-comparison.js:337-350`; `git grep installSegKeys` returns
  only that ledger line. Recorded in the order as observed and out of scope for #101.
- N3 — base renders had no capture point and would be unobtainable after the keyhint
  changes. Fixed: new step 0 captures them first, and orders the ui-craft revise §2
  source-and-live re-inventory the triage base capture did not cover.

**Verified corrections to the aborted run's draft, beyond the review:**
`STORIES.length` is 89 (executed) while the ledger header claims 74 — the header's
enumeration is stale, not merely its total. Port 8765 is held on this machine by an
unrelated stale server (PID 37842, a different database), so the order names an
explicit free port and a PID check. The Playwright install named in the first brief
is 1.55.0 with a partial Chromium and fails to launch; 1.61.1 is the pinned version.
`uv sync --frozen --extra api --extra sync` is required before the server will start.

**Base capture:** `app: 89 of 89 stories passed`, 0 failures, at base `38a5a5d`,
through the declared no-fetch server on an explicit free port against the seed-620
synthetic database.

**Round 2** (same cold reviewer, delta re-check). Blockers claimed: 3. Two of them
were `injected`-shaped in appearance but resolved without a code change:

- R2-B1 REFUTED, not forwarded. The reviewer statically parsed the replay's story
  table as 74 entries and called the base capture unreproducible. Executed instead:
  `node -e "import('./frontend/diagnose-workstation-behavior.replay.mjs')
  .then(m=>console.log(m.STORIES.length))"` prints **89**, the last entry is `D3`,
  and the live replay printed `app: 89 of 89 stories passed`. Two independent live
  measurements against one static parse; the order's numbers stand. Per the triage
  rule that an objection failing reproduction is recorded as refuted and never
  forwarded, no change was made on this point.
- R2-B2 ACCEPTED, `authoring` — steps 5 and 7 still said "the two guards" after the
  guard demand had been cut from step 2, so the ledger row and the ADR were the two
  places still told to describe a guard the order forbids. Fixed in both.
- R2-B3 ACCEPTED, `authoring` and the round's best catch — the chart guard as drafted
  bailed out on ALL keys at `#ec-chart`. Because that handler `preventDefault`s
  without `stopPropagation`, ArrowLeft/ArrowRight there today move the chart cursor
  AND step the roster; an all-keys guard would have silently deleted that shipped
  behaviour with no ledger row recording it. Fixed: the guard is scoped to
  ArrowUp/ArrowDown, keeping the change strictly additive, and the acceptance
  criterion now pins Left/Right in the chart to its base behaviour.
- Notes accepted: the `:focus-visible` citation pointed at `.dw button.qrow`
  (line 718), not `.ev-row`, which has no author rule at all; and Safe start now
  names `--port` as the single permitted addition, since `revise` §0 makes an
  ambiguous declaration a stop.
- Reviewer items 4, 5-partial and 8 were stale reads of a superseded copy — step 0,
  the rAF prohibition and the P27 line were already present. Verified by grep, not
  argued.

**Termination.** Ordinary-stakes plan: one panel plus a same-reviewer delta re-check,
which is what ran. Stopping at two panels. Remaining round-2 findings were wording
and scope precision, not defects, and the one genuinely open item is a human ruling
(the key set), which the hard-cap rule routes to the operator rather than to another
panel. No `injected` blockers across either round, so the rewrite-clean signal never
fired.

## Owner ruling — 2026-08-23, and the rewrite it forced

**Connor Griffin, 2026-08-23: option 2.** ArrowUp/ArrowDown step the Occurrences
roster; ArrowLeft/ArrowRight STOP stepping it. Reason, quoted verbatim into the
ledger sanction: "the roster is drawn vertically; one key model per list."
This supersedes the additive recommendation carried in `Open questions` above; that
question is now closed and is not to be reopened. `inline`

The order was rewritten clean rather than patched, per the triage rule that
accumulated rounds are rewritten rather than amended. What the flip changed:

- **This is now a RETIREMENT, not an addition.** Withdrawing left/right stepping
  pulls in ui-craft revise §4's retirement obligations: a named, dated, quoted
  sanction; a permanent RETIRED entry; and an absence assertion that prints the
  sanction on every run. The repo already has the idiom — `projectAuthor()`
  (replay 372-380) reads the sanctioner from `pyproject.toml` so the owner's name is
  not added a second time to a shipping source file, and S17 (1120-1128) is the
  worked example. The order names both rather than letting the agent invent one.
- **S12 is retired in place, not deleted.** It keeps its id and table entry and
  becomes the absence assertion. Because left/right still step on base, a correctly
  written absence assertion must FAIL on base — that is the red-first proof, and the
  order says so explicitly, since an S12 that still passes on base is the signature
  of a fake assertion.
- **Story set shrank.** The additive draft's S73 ("horizontal model retained") is
  dropped as meaningless under the new model. Renumbered: S72 vertical stepping,
  S73 focus. Two new stories, not three, so the expectation is the measured base 89
  + 2 = 91. `inline`
- **The chart's pre-existing double-fire ends, intentionally.** Left/right inside
  `#ec-chart` today move the chart cursor AND step the roster, because that handler
  `preventDefault`s without `stopPropagation`. Once the roster handler stops
  accepting those keys, they move only the chart cursor. This needs no edit to
  `frontend/diagnose-event-comparison.js` and is covered by the P24 retirement
  sanction rather than a separate ruling. Under the additive model this had been a
  hazard to guard against; under the replacement model it is the intended outcome.
  `inline`
- **Blast radius confirmed closed.** `grep -n "ArrowLeft\|ArrowRight\|ArrowUp\|ArrowDown"`
  over the replay returns exactly four hits: 1006, 1009, 1015 (all inside S12) and
  2861. So S12 is the only story exercising the withdrawn keys. `inline`
- **A regression canary was identified.** Line 2861 is an `#86` probe that opens the
  Filter menu at the queue root and presses ArrowUp expecting roving focus to wrap.
  It sits at `k === 'factors'`, so the roster handler cannot fire — which is live
  corroboration of the no-filter-guard argument. If it ever goes red, the frame-kind
  separation has broken and the guard becomes earned. It is now an acceptance
  criterion. `inline`
- **Verification gained the public-tree leg**, as CI runs it
  (`build_public_tree.py` → `check_public_links.py` → `scan_public_tree.py`, plus the
  exploration `build.mjs --check`), because this change edits a shipping source
  comment. With it, a new boundary: never name a non-shipping path
  (`docs/scope/*`, `mockups/*.behavior.md`) in a comment inside a shipping
  `frontend/` file. The mechanism is verified, not stylistic — `check_public_links.py`
  reads path-shaped tokens in the COMMENTS of shipping source files and fails when
  one names a tracked file the public tree excludes. Step 2 rewrites the KEYBOARD
  comment, which is exactly where that slip would happen. `inline`
- **Routing:** `Open as: terra / high` — implementation routes to Terra first.

### Risk contract — amendment

`Evidence owed` is restated for the replacement model: replay stories for ↑/↓
stepping, end-stop, focus retention after Enter and after a step, the keyhint text,
and — new — an absence assertion proving ←/→ no longer step, printing the retirement
sanction on every run. The `Must prevent` entry "silent incorrect success" now has a
sharper instance: an absence assertion that passes on base, which would mean the
withdrawn behaviour was never actually tested.
