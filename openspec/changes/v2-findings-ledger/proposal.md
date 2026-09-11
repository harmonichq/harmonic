# #404 v2 findings ledger

## Status

**DRAFT — triage only.** This is an ordinary ticket change, not an amendment
owned by `harmonic-v2`. No execution lock, source admission, behavior freeze,
review verdict, or implementation authorization is implied.

## Why

The shipped v2 desk can show a clock-filtered chart while withholding Pattern
rows, loses some selected Pattern evidence, and has gaps in the history and
reading surface required to understand a completed or expired follow-up. The
settled direction is to make the selected outcome window a coherent backend fact
for Pattern and new Focus follow-up, retain immutable Trial endings while
allowing a late conclusion, and repair served evidence and desk behavior without
moving policy into the browser.

## What changes

- Recalculate Pattern membership, counts and rate inputs for the named or drawn
  outcome clock window, preserving full contributing episodes and producer-owned
  classifier/safety decisions.
- Save that selected window on new Focus contexts and use it for admission and
  both comparison arms; old contexts keep no inferred window.
- Add a durable, separately dated late conclusion to an expired Trial record
  without replacing the original ending; load reassessment only when requested.
- Integrate served case-file detail and selection into the v2 desk, including
  race-safe selection/window changes and the settled compact, readable layout.
- Add generated synthetic evidence and public-interface proofs before final
  runtime admission. Programmed ratios remain only in Pump settings and
  historical Focus naming stays deferred.

## Active-contract amendments

This change modifies the scoped-Pattern promise in
`openspec/specs/behavioral-layer/spec.md`, adds retained-window and
late-conclusion behavior alongside `openspec/changes/harmonic-v2/contracts.md`,
and extends `openspec/changes/harmonic-v2/specs/surfaces/spec.md`. Historical
ADRs and the existing finding-case-files design retain their original text; ADR
404 supplies the supersession pointer. The existing exact record route is reused.

## Risks and prerequisite

This proposal spans one shared backend population, persisted follow-up context,
and a shipped surface, so full-depth review may be warranted. Q6 producer
grounding establishes the over-treated-low Low-identity/High-landing distinction;
implementation still needs coordinator admission and runtime proof before any
claim is made about the changed application.

## Out of scope

No medical classifier thresholds, frontend-derived policy, prewarming, pump
write, historical Focus-title migration, legacy-window backfill, or rewrite of
prior ADRs/ledgers is included.
