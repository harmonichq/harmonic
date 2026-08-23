# Scope ledger — Diagnose finding drill-in keyboard focus (#100)

Ticket: [harmonichq/harmonic#100](https://github.com/harmonichq/harmonic/issues/100)

Base: `9ae8172` (`origin/main`)

Classification: code. UI Craft lifecycle: revise. Review depth: Targeted.

## Decisions

- **Root cause is DOM replacement, not a missing handler.** A finding row is a
  `<button class="qrow">`; `drillFinding` pushes a frame and `paint()` →
  `paintLevel()` sets `#level.innerHTML = ''`, destroying the focused button, so
  the browser drops focus to `<body>`. The crumb's ancestor buttons are rebuilt
  the same way by `drawTrail`, so popping (crumb click, Backspace) has the same
  defect. **Why:** read from `frontend/diagnose-workstation.js` (`push`, `popTo`,
  the Backspace handler, `paintLevel`, `drawTrail`). **Disposition:** inline.
- **Move focus on navigation, never on repaint.** `paint()` also runs for band
  toggles, alignment changes, async case-file arrival and `repaintDay`; only
  `push`, `popTo` and the Backspace pop are navigations. The focus move hangs off
  those three, not off `paint()`. **Why:** a focus jump on an async repaint steals
  focus from wherever the user went next. **Disposition:** → work order.
- **Landing target on push is the level container, synchronously.** A `factor`
  frame paints an `Opening case file…` placeholder first and its controls only
  when the case request resolves, so "first meaningful control" does not exist at
  Enter time. `#level` already carries `tabindex="-1"` (present since the first
  commit, never used); focusing it puts the reader at the top of the opened
  detail and one Tab from its first control, deterministically, for every frame
  kind (`factor`, `history`, `slot`, `block`, `isf`). **Why:** deterministic,
  synchronous, one mechanism for five frame kinds. **Disposition:** → work order;
  the literal ticket wording ("first meaningful control") is carried to the
  operator as an open decision with this as the recommendation.
- **Landing target on pop is the originating row.** Queue rows carry
  `data-id=<row.id>`; after a pop that lands on the queue, focus the `.qrow`
  whose id matches the frame just left, else `#level`. **Why:** same defect, same
  mechanism, and the reader returns where they started. **Disposition:** → work
  order.
- **A focus ring for the level.** `.level` has no `:focus-visible` rule; add one
  matching the queue row's (`2px solid var(--ck-accent)`, inset) so keyboard
  users see where they are and pointer users see nothing new. **Why:** DESIGN.md
  forbids colour-only and invisible focus states. **Disposition:** → work order.
- **Keep adjacent work out.** KBD-93-04 (Align choices skipped by Tab) and the
  Occurrences-row Enter landing on body (ledger story 7) are separate defects
  in separate code and are not fixed here. **Disposition:** → issue (93-04 is
  already tracked from the #93 sweep; story 7 is noted for the operator).
- **UI Craft route is revise.** Shipped surface, runnable locally, AGENTS.md
  declares the exact safe entrypoint
  `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`
  with a generated synthetic database; the frozen behaviour ledger is
  `mockups/finding-evidence-routing.behavior.md` (§D Keyboard, §G Crumb) and the
  app-only replay is `frontend/diagnose-workstation-behavior.replay.mjs`.
  `route.mjs --embodiment shipped --runnability runnable --declaration complete
  --data-source synthetic` → `revise`. **Disposition:** → work order.
- **Slicing stays flat.** No rubric trait fires: one artifact, one target, the
  browser harness already exists, no live resource, no trust boundary. Anchor A.
  **Disposition:** one work order, one pull request.

### Risk contract

- **Must prevent:** secret exposure; irreversible loss of authoritative data;
  silent incorrect success (a green gate that never presses Enter on a row).
  Focus must never move on a non-navigation repaint.
- **Must recover:** none (pure UI; no state is written).
- **Accepted failure:** a frame whose level renders no focusable control leaves
  focus on `#level` itself; Tab then proceeds in document order.
- **Unsupported:** assistive-technology announcement order; narrow-viewport
  focus behaviour (the #93 sweep could not exercise it).
- **Evidence owed:** a browser-gate test that fails on the ticket base (Enter on
  the first queue row → `activeElement` is `body`) and passes after; a pop
  assertion (crumb Enter → focus on the originating row); an assertion that a
  band toggle on the open case file does not move focus; a new frozen ledger
  story in §D with its replay.
- **Why:** advisory tool, one user at a time, no data written by this change.
- **Disposition:** copied into the work order.

## Open questions

- Operator: container-first (recommended) or first-control-after-settle as the
  push landing target. The order is drafted on the recommendation.

## Spawned tasks

- none
