# Dark-only graphite theme — triage and review ledger

Ticket: #304 (parent composition: #305, order step 3)

## Decisions

- Light retires entirely: palette, footer Theme menu, `theme` localStorage key,
  boot-time class gate; every `html.dark` rule collapses into the base. Why:
  operator decision 2026-09-01 recorded on the ticket. inline
- Direction is the graphite prototype (branch `theme-cohesion-prototype`,
  70726e5): one warm-neutral structure family, green confined to data marks,
  orange as action and signal. Adopt the direction, not the bytes. Why: ticket
  body. inline
- Surface lifecycle is `revise` (UI Craft router: shipped, runnable, declared
  no-fetch entrypoint, synthetic database). Contracts:
  `mockups/cockpit-shell.behavior.md` + `frontend/cockpit-shell.browser.test.mjs`,
  `mockups/finding-evidence-routing.behavior.md` +
  `frontend/diagnose-workstation-behavior.replay.mjs`. inline
- Verified live (PR #303, run 33523566253): the prototype bytes fail the
  evidence-canvas drift gate, canvas-composition test 13, workstation tests
  20/23/24, and replay S23 by one pixel. Gates pin ADR 255 literals and Light's
  fixed-point cascade; both must be re-settled, not deleted. inline
- Defaults assumed (no question asked): historical commit-sha capture
  directories under `docs/screenshots/` stay as history; only gated scenarios
  re-capture. `DESIGN.md` front matter and palette prose re-point to the shipped
  dark tokens. The harness theme select retires. Active changes
  `light-ground-bone` (ADR 37) and `preserve-diagnose-theme-context` (ADR 230)
  are recorded as superseded in this change's design record, not archived here.

## Open questions

- Q1 design settlement mode and the orange collision (pending).
- Q2 behavior-ledger retirement sanction for the Theme menu and theme-repaint
  stories (pending).

## Spawned tasks

None.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
