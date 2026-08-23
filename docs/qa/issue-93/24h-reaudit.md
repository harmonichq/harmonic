# Issue #93 — 24-hour re-audit of history and occurrence navigation

## Scope and boundary

Focused read-only re-audit of the live Diagnose surface. I explicitly selected the `24 h` window before each inspection. A client-only non-secret test token enabled the already-running isolated server. No product-data write, staging, Plan, Verify, carb logging, credential edit, fetch, payload capture, screenshot, or API mutation was performed.

The stories below deliberately omit personal health values, calendar dates, times, counts, setting values, recommendation values, opaque identifiers, and database details.

## Result summary

Both disputed behaviors are **confirmed**. Each was reproduced twice, using different populated case files after explicitly selecting the all-day window.

## Confirmed product findings

### 24H-93-01 — Historical Carb-ratio rows are peers in the current Findings queue

- **Interaction path:** Open `#/diagnose`; explicitly choose `24 h`; use the ordinary Findings queue without selecting a history mode; inspect the Watching rows at the end of the queue; open one historical Carb-ratio row; return to Findings; open the separately rendered historical Carb-ratio row.
- **Observed behavior:** The current all-day Findings queue presents historical Carb-ratio entries as ordinary selectable queue rows beside current setting and habit findings. Both historical rows carry a Watching/Past-setting label, but the queue has no separate historical-results boundary before they appear. Their case files identify the evidence as a past setting and show no active change assertion.
- **Expected user-facing behavior:** A current Findings viewer should make retired Carb-ratio evidence unmistakably separate from the active findings a user is reviewing for the current setting context.
- **Reproduction:** Confirmed from two separately rendered historical Carb-ratio case files in the explicitly selected `24 h` queue.
- **UI section:** Diagnose → Findings queue → Watching/history rows and historical Carb-ratio case file.
- **Severity:** P2 — the primary decision-review queue mixes retired setting evidence with active findings, creating a material interpretation risk even though individual rows disclose that they are historical.
- **Stable fingerprint:** `diagnose-findings-current-queue-mixes-past-carb-ratio-history`

### 24H-93-02 — Selected occurrence navigation uses Left/Right despite a vertical occurrence roster

- **Interaction path:** Open `#/diagnose`; explicitly choose `24 h`; open a populated high-pattern habit case file with a multi-row Occurrences roster; focus the first vertically displayed occurrence using the keyboard and press Enter; press ArrowDown; then press ArrowRight. Repeat from a separate populated meal-pattern habit case file with a multi-row roster.
- **Observed behavior:** Enter selects the first occurrence and opens its trace detail. ArrowDown leaves the selected occurrence unchanged. ArrowRight advances to the next vertically displayed occurrence. The selected-detail readout exposes Left/Right key glyphs, while keyboard focus has reset away from the roster after selection. The same direction model occurred in both case-file varieties.
- **Expected user-facing behavior:** A vertically arranged occurrence list should support vertical keyboard traversal, or its non-spatial navigation model should not force a reader to discover and use Left/Right to move through the displayed list.
- **Reproduction:** Confirmed in two populated multi-row case files after explicitly selecting `24 h`: one high-pattern habit case file and one meal-pattern habit case file.
- **UI section:** Diagnose → finding case file → Occurrences roster and selected trace detail.
- **Severity:** P2 — keyboard readers can open the evidence list but cannot traverse its visible vertical order with the expected directional keys; the actual navigation is discoverable only after selection and focus loss.
- **Stable fingerprint:** `diagnose-occurrence-roster-left-right-overrides-vertical-traversal`

## Additional check

The all-day selection itself remained active throughout each story, and the resulting queue and case files were populated. Neither finding is blocked by an empty roster or one-row-only case.

## No fixes proposed

This ledger records user stories and observed behavior only. It does not propose implementation, design, or copy changes.
