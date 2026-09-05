# Behaviour ledger — Plan

**★ FROZEN 2026-09-05 · Connor Griffin ("yes and yes", 2026-09-05) · operator-approved shipped-surface behavior contract.**

★ FROZEN 2026-09-05 · base `aeb37c6a` (origin/main, 2026-09-05) ·
generator n/a · window n/a · fixtures inline in the replay (synthetic, the
first-plan-reconcile profile and the noon carb-ratio pick) · predecessor none —
first sweep of a shipped surface · retired 0

Shipped surface: the Plan tab, `frontend/index.html` (markup 1649–1810; Vue
state and handlers 5023–5210) over the pure module `frontend/plan.js`. The
app-only replay is `frontend/plan-behavior.replay.mjs`; every story is tagged
`STORY:plan:<id>`. `TARGET=app` is mandatory; no mock exists for this surface.

**16 issued executable IDs:** S1–S16
**Active executable IDs:** S1–S16
**Retired executable IDs:** none

Data provenance. The replay's opener serves the checkout's own static files
and answers every API read from inline synthetic fixtures (`pumpSettings()`,
`NOON_IC`, `HISTORY_ROW`, `REVERT_ROUTE` in the replay). The declared safe
no-fetch server reads a scratch copy of `mockups/qa-e2e.synthetic/harmonic.sqlite`
(generated in full by `scripts/gen_qa_e2e_db.py`); that showcase holds an active
profile but no draft and no apply history, so the live server evidences the
composition and the nothing-staged state only. Pending, on-pump, mismatch,
history and the Verify handoff exist only through the stubbed opener (issue
#344 scope ledger, Q6). No real patient data is involved anywhere.

Sibling contracts cited rather than restated: the cockpit-shell ledger
(`mockups/cockpit-shell.behavior.md`) S2 routes to Plan through the numbered
workflow and S8 asserts the Plan badge count; the CI gate
`frontend/plan-first-match.browser.mjs` (#462, #393) covers the FIRST plan's
three reconcile outcomes and the edit-then-revert case with an empty history.
S9 and S10 here cover the committed-plan outcomes that gate does not.

## Base sweep — 2026-09-05, issue #344

Before any product code changed, all **16 of 16** stories passed against exact
base `aeb37c6a` through the stubbed app opener at 1440×900; S3, S4, S10 and S11
also passed at 1024×768 and 390×844. Red proof: with the chip-remove handler
knocked out of `frontend/index.html`, S7 failed on its wait for the emptied
draft and S3 still passed; the file was restored byte-identical. Base renders
are under `openspec/changes/plan-workstation/evidence/base/`.

Data pass, recorded as a base fact rather than a story: at 390×844 the base
deliverable table overflows its card to the right (the I:C and Target columns
are clipped, `evidence/base/S4-390x844.png`); the surface offers no horizontal
scroll of its own. Any revision owes the narrow table a scrollport.

Containers are located by their shipped headings ("Accepted changes",
"Deliverable — pump-ready schedule", "Apply history"), never by chrome class,
so a recomposition that keeps the headings and controls keeps the contract.

The source inventory (every `@click`, `@change`, `v-if`/`v-else-if` state, the
tab-open and startup loaders, the toast, and the Verify → Plan handoff) is
represented below. No observed behavior is without a story; no handler was
irreproducible; no QUESTION is open.

## Stories

S1 · Opening Plan with a configured profile shows the active-profile reference
    collapsed: the summary names the profile (name or IDP), DIA, max bolus,
    carb entry, and pills the count of other profiles not analyzed. Opening it
    reveals the segment table (start, basal, ISF, I:C, target).
  element:  `.active-profile-ref` / `summary` / `tbody tr`
  source:   `frontend/index.html` LAYER 1 markup; `loadPumpSettings` on tab open
  data:     four-segment profile, one other profile
  evidence: replay S1; `evidence/base/S1-1440x900.png`
  status:   replayed-pass on base

S2 · Without pump settings the surface says so: the not-configured copy when
    nothing has been fetched, the error message when the read fails, and
    "Loading pump settings…" while the read is in flight. None renders the
    reference or the deliverable.
  element:  the three leading state blocks before the reference
  source:   `pumpSettingsError` / `!pumpSettings` / `!pumpSettings.configured`
  data:     unconfigured; HTTP 500; a delayed answer
  evidence: replay S2
  status:   replayed-pass on base

S3 · With nothing staged, Accepted changes reads 0 and "Nothing accepted yet"
    with a Diagnose link that opens Diagnose; the deliverable shows the profile
    rows with every cell current and no `current →` hint, the count pill reads
    "4 / 16 segments", and the reconcile copy says the schedule matches the
    pump. Arrival persists nothing.
  element:  `.plan-diagnose-link`; `td.deliverable-cell.prov-current`; `h2 .pill`
  source:   LAYER 2 empty branch; LAYER 3 matches-pump branch
  data:     empty draft
  evidence: replay S3; `evidence/base/S3-{1440x900,1024x768,390x844}.png`
  status:   replayed-pass on base

S4 · A staged pick renders as one chip (family label, time, current → value)
    and its deliverable cell carries the accepted provenance with the
    `current →` hint; a first plan reads Pending, with no on-pump line and no
    mismatch table. Loading a draft persists nothing.
  element:  `.accepted-chip`; `td.deliverable-cell.prov-accepted .plan-cell`
  source:   `planChips`; `deliverableRows`; `reconcileStatus` (no committed plan)
  data:     noon I:C 5.4 → 5.7
  evidence: replay S4; `evidence/base/S4-{1440x900,1024x768,390x844}.png`
  status:   replayed-pass on base

S5 · A hand-edit flags its cell edited (tint plus "✎ edited") and shows the
    `current →` hint; editing the accepted cell flips it to edited without
    flagging the chip; returning a cell to its baseline clears the edit
    entirely. Hand-edits never persist. A chip is flagged "✎ edited" only when
    its staged value diverges from the recommendation it was staged from.
  element:  `input.plan-value` `@change`; `.prov-edited`; `.accepted-chip.edited`
  source:   `editDeliverable`; `isDeliverableEditRevert`; `acceptedChips`
  data:     noon I:C staged; a second I:C cell edited and reverted
  evidence: replay S5; `evidence/base/S5-1440x900.png`
  status:   replayed-pass on base

S6 · Editing a cell of a different family from the staged one is refused: the
    input snaps back and a toast reads "Plan can only change one tuning family
    at a time. Clear I:C before editing Basal." The staged pick survives.
  element:  `.toast.err`
  source:   `editDeliverable` family guard (frontend copy of the backend's
            one-variable rule; the frontend derives no staging verdict)
  data:     I:C staged, a basal cell edited
  evidence: replay S6; `evidence/base/S6-1440x900.png`
  status:   replayed-pass on base

S7 · Removing a chip drops the pick and any edit riding on it, returns its
    cell to current, and persists the emptied draft (PUT `/api/plan`).
  element:  `.accepted-chip .chip-remove`
  source:   `removeChip`; `savePlanDraft`
  data:     noon I:C staged
  evidence: replay S7 (red proof story)
  status:   replayed-pass on base

S8 · A chip's ↩ opens Diagnose.
  element:  `.accepted-chip .chip-jump`
  source:   `jumpToReview` → `setTab('diagnose')`
  data:     noon I:C staged
  evidence: replay S8
  status:   replayed-pass on base

S9 · With a committed plan (apply history non-empty) and a pump snapshot that
    matches the deliverable cell for cell, the on-pump line reads "✓ On pump as
    of <fetched_at> — the pump matches your plan." with "Confirm & re-baseline";
    confirming persists the effective plan (accepted picks merged with edits),
    posts one apply, clears the draft, and reloads history with the new entry.
  element:  `.data-quality-banner` + its `.dqb-link`
  source:   `reconcileStatus` confirmed; `confirmOnPump`
  data:     history one row; pump noon I:C 5.7
  evidence: replay S9; `evidence/base/S9-1440x900.png`
  status:   replayed-pass on base

S10 · With a committed plan and a divergent snapshot, the mismatch block reads
    "⚠ The pump doesn't match your plan. Check these values — likely a keying
    error." over a table of the divergent cells (start, parameter, planned, on
    pump) and offers "Re-key & recheck" and "Accept pump values". Re-key drops
    to Pending for this snapshot without applying; Accept posts one apply and
    clears the draft.
  element:  `.reconcile-mismatch`; `.reconcile-diff`; `.reconcile-actions`
  source:   `reconcileStatus` mismatch; `rekeyRecheck`; `confirmOnPump`
  data:     history one row; pump noon I:C 5.1
  evidence: replay S10; `evidence/base/S10-{1440x900,1024x768,390x844}.png`
  status:   replayed-pass on base

S11 · Apply history renders as a section with a table (applied at, items)
    when non-empty, and is absent when empty.
  element:  the block headed "Apply history"
  source:   `planHistory`; `loadPlanHistory`
  data:     one history row; none
  evidence: replay S11; `evidence/base/S11-{1440x900,1024x768,390x844}.png`
  status:   replayed-pass on base

S12 · Verify's Revert lands on Plan: the guidance banner carries the route's
    label and message, the prior setting is staged as a chip, and the revert
    draft is persisted.
  element:  `.plan-review-guidance`; `.accepted-chip`
  source:   `verifyRevert` → `planRevertIntent` → `loadPlanDraft`; `setTab('plan')`
  data:     one complete Trial with a `stage-prior` plan route
  evidence: replay S12; `evidence/base/S12-1440x900.png`
  status:   replayed-pass on base

S13 · A persisted draft holding two families is normalized on load to the
    first family, the normalized draft is persisted, and a warning toast names
    what was kept.
  element:  `.toast.warn`
  source:   `loadPlanDraft` → `normalizePlanItemsToSingleFamily`
  data:     noon I:C plus a midnight ISF
  evidence: replay S13
  status:   replayed-pass on base

S14 · A basal pick opens its 30-minute slot: both new boundaries appear as rows
    flagged "new break", the slot start carries the accepted rate with its
    `current →` hint, the slot end returns to the profile rate, and the count
    pill grows by two.
  element:  `.pill.warn` "new break"; `h2 .pill`
  source:   `buildDeliverable` (`isNewBreak`); `deliverableSegmentCount`
  data:     basal 03:00 0.6 → 0.65
  evidence: replay S14; `evidence/base/S14-1440x900.png`
  status:   replayed-pass on base

S15 · Past sixteen segments the count pill turns warn ("28 / 16 segments" for
    thirteen half-hour basal picks).
  element:  `h2 .pill.warn`
  source:   `deliverableCount > 16`
  data:     thirteen basal picks at :30 boundaries
  evidence: replay S15
  status:   replayed-pass on base

S16 · Invariant (no handler): the shell chrome above Plan does not move with
    Plan's state — nothing staged, a mismatch, or the reference opened all
    leave the top bar's geometry identical.
  element:  `.cockpit-topbar`
  source:   `frontend/shell.css` (cited: cockpit-shell ledger owns the chrome)
  data:     any
  evidence: replay S16
  status:   replayed-pass on base
