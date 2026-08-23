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
