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
