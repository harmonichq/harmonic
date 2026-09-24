# Proposal — chrome bar surface states

## Why

ADR 47 repaired the cockpit bar's orange signal but intentionally left two surface fills for a design decision. The current-step plate cannot contrast at 3:1 with both its number disc and the bar, and the theme-menu hover wash reuses the orange checked-state vocabulary for a transient state.

## What changes

- The current workflow step becomes an outline-and-disc component with no plate fill.
- Theme-menu hover becomes a small neutral lift from the menu panel instead of the bar's orange signal well.
- The Harmonic mark and favicon remain the one constant identity object locked by #736.
- The cockpit shell receives a frozen behavior ledger before the visual revision is implemented.

## What does not change

- Workflow, theme-selection, keyboard, responsive-drawer, and utility behavior.
- The bar signal, its well, its on-signal ink, or any sheet token.
- The identity mark or favicon.
- Any advisory analysis, safety rule, stored data, or API behavior.
