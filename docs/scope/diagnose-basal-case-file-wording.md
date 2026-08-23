# Scope ledger — Diagnose basal-slot case file wording (#102)

Ticket: https://github.com/harmonichq/harmonic/issues/102

## Decisions

- The locked term is "nights of steady data" (DESIGN.md, voice rule 3); the
  backend already prints it (`ciq_autotune/analyzers/basal.py::_annotation_for`),
  so the defect is confined to frontend strings in
  `frontend/diagnose-workstation.js`. Why: verified by repo grep. `inline`
- Scope is the Diagnose basal-slot case file as the ticket reproduces it: the
  support line, the thin-evidence footnote, the slot meta line, and the `nodata`
  verdict label "no clean data" (which feeds the slot tile title and aria-label
  on the same surface). Why: that is the reproduced surface; the surrounding
  occurrences below are separate surfaces with their own fixture chains.
  `inline`
- Out of this ticket, owed as follow-ups: the findings-queue support noun
  (`ciq_autotune/findings_projection.py` "clean nights", mirrored in
  `mockups/findings-projection.mirror.mjs`, frozen in
  `frontend/__fixtures__/findings-projection.json`, asserted in
  `frontend/diagnose-findings-queue.test.js:199`), and the Plan tab basal-tier
  `evidenceFoot` in `frontend/index.html` (`decorateBlock`). Why: each is a
  different surface and the queue noun is a lockstep generator/mirror/fixture
  chain. `→ issue`
- Engine comments and Python docstrings keep "clean nights" (DESIGN.md scopes the
  rule to app surfaces and accessible labels). `inline`

### Risk contract

- Must prevent: secret exposure; irreversible loss of authoritative data; silent
  incorrect success (a verdict label mapping to the wrong slot state).
- Must recover: none.
- Accepted failure: none beyond the defaults.
- Unsupported: wording on surfaces other than the Diagnose basal-slot case file.
- Evidence owed: the case file for an insufficient-evidence slot and for a
  no-data slot renders "nights of steady data" and never "clean"; the fast gate
  pins the module's user copy.
- Why: copy-only change on an advisory dosing surface; no dosing logic moves.
- Disposition: inline (copied into the work order).

## Open questions

- None blocking. The boundary decision above is a default the operator may widen.

## Spawned tasks

- Follow-up issues for the queue support noun and the Plan tab footer (not yet
  filed).

## Review rounds

(filled during /plan-review)
