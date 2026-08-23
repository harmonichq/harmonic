# Scope ledger — Diagnose finding drill-in keyboard focus (#100)

Ticket: [harmonichq/harmonic#100](https://github.com/harmonichq/harmonic/issues/100)

Base: `9ae8172` (`origin/main`)

Classification: code. UI Craft lifecycle: revise. Review depth: Targeted.

> Re-verified 2026-08-23. Every claim below was reproduced against the worktree
> at this base; the lines marked **corrected** or **new** replace or extend
> claims from the first (aborted) triage pass.

## Decisions

- **Root cause is DOM replacement, not a missing handler.** A finding row is a
  `<button class="qrow">` built by `renderFindingsQueue`; drilling calls
  `push()` → `paint()` → `paintLevel()`, whose first statement is
  `host.innerHTML = ''`, destroying the focused button, so the browser drops
  focus to `<body>`. The crumb's ancestor buttons are rebuilt the same way by
  `drawTrail` (`trail.innerHTML = ''`), so popping has the same defect.
  **Why:** read from `frontend/diagnose-workstation.js:2186-2188` (`paintLevel`),
  `:2113-2114` (`drawTrail`), `:1598-1601` (`push`), and
  `frontend/diagnose-findings-queue.js:323-325` (the row element).
  **Disposition:** inline.
- **There are three navigation entry points, and Backspace is not one of the
  other two.** `push` (`:1598`) and `popTo` (`:1602`) are the named helpers, but
  the Backspace handler at `:2564-2574` pops inline with its own
  `stack.pop(); paint()` and never calls `popTo`. A fix hung only on `push` and
  `popTo` leaves Backspace defective. **Why:** read at those lines.
  **Disposition:** → work order. **(corrected — the first pass implied Backspace
  routed through `popTo`.)**
- **Move focus on navigation, never on repaint.** `paint()` also runs for band
  toggles, roster select-in-place, the collapsed-rows toggle, async case-file
  arrival and lane picks; only the three navigation entry points above are
  navigations. The focus move hangs off those three, not off `paint()`.
  **Why:** a focus jump on an async repaint steals focus from wherever the reader
  went next. **Disposition:** → work order.
- **Landing target on push is the level container, synchronously.** A `factor`
  frame paints exactly `<div class="empty">Opening case file…</div>` and nothing
  else until the case request resolves (`:2276-2280`), so "first meaningful
  control" does not exist at Enter time. `#level` already carries `tabindex="-1"`
  (`:145`) and nothing in the file ever focuses it — grep for a `.focus()` on the
  level returns no hit. Focusing it puts the reader at the top of the opened
  detail, one Tab from its first control, deterministically, for all five frame
  kinds (`factor`, `history`, `slot`, `block`, `isf`). **Why:** deterministic,
  synchronous, one mechanism for five frame kinds. **Disposition:** → work order;
  the literal ticket wording ("first meaningful control") is carried to the
  operator as an open decision with this as the recommendation.
- **Landing target on pop is the originating row, and only when the pop lands on
  the queue.** Queue rows carry `data-id` via `node.dataset.id = row.id`
  (`frontend/diagnose-findings-queue.js:329`). A pop to an intermediate level is
  not a return to the queue, so the row restore applies only when the resulting
  `top().k === 'factors'`; otherwise focus the container. **Why:** same defect,
  same mechanism, and the reader returns where they started.
  **Disposition:** → work order.
- **The frame's row id is `frame.rowId` for four frame kinds and `frame.id` for
  `history`.** `drillFinding` builds `{k:'history', id: row.id, row, …}` at
  `:1567` but `{k:'factor', rowId: row.id, …}` at `:1578`, and `pickCell`,
  `pickBlock` and the `isf` push all use `rowId`. A restore keyed on `rowId`
  alone silently misses every history finding. **Why:** read at those lines.
  **Disposition:** → work order. **(new — the first pass did not have this.)**
- **Row ids contain colons, so the restore selector must be the quoted-attribute
  form.** Frozen ids include `finding:carb_undercount`, `basal:0-30` and `ic:660`
  (`mockups/diagnose-workstation.synthetic/finding-case-files.json`). A quoted
  attribute selector `.qrow[data-id="finding:carb_undercount"]` accepts them; an
  id-selector form would not parse. **Why:** grepped from the frozen fixture.
  **Disposition:** → work order.
- **A focus ring for the level.** `.level` has four rules in
  `frontend/diagnose-workstation.css:461-466` and no `:focus-visible` among them,
  while `.dw button.qrow:focus-visible` at `:718` is `2px solid var(--ck-accent)`
  with `outline-offset: -2px`. Match it. DESIGN.md `:285` forbids leaving a
  state-carrying element without a `:focus-visible` pairing.
  **Disposition:** → work order.
- **Assert the ring, because programmatic focus plus `:focus-visible` is a
  browser heuristic.** Chromium matches `:focus-visible` on a scripted `.focus()`
  when the preceding interaction was a keyboard one, which is the case here (the
  reader pressed Enter) — but it is a heuristic, not a guarantee, so the gate
  asserts `#level.matches(':focus-visible')` rather than trusting it.
  **Disposition:** → work order. **(new.)**
- **The "band toggle does not move focus" assertion the first pass proposed is
  vacuous — replace it.** Every control a band toggle could sit on lives inside
  `#level`, so the repaint destroys it and focus is on `body` both before and
  after the change; the assertion would pass without guarding anything. The real
  regression to guard is a focus *steal*: park focus outside `#level` (on
  `#filter-trigger`), let an async case-file repaint land, and assert focus never
  moved. **Why:** `renderVerdictBand` and `renderCaseRoster` both paint into
  `host` = `#level` (`:2283`, `:2295`). **Disposition:** → work order.
  **(corrected — the first pass owed an assertion that cannot fail.)**
- **Keep adjacent work out.** KBD-93-04 (Align choices skipped by Tab) is filed
  as issue #96 and the Occurrences roster's arrow direction is issue #101;
  neither is touched here. The roster's own Enter-to-body loss (select-in-place
  repaints `#level` and destroys the focused roster row) is the same defect class
  but a *repaint*, not a navigation, so the rule adopted above deliberately does
  not fix it, and no open issue covers it yet. **Disposition:** → issue, **not
  filed this session** — carried to the operator as an open decision.
- **UI Craft route is revise.** Shipped surface, runnable locally; AGENTS.md
  `:156-161` declares the exact safe entrypoint
  `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`
  against a generated synthetic database; the frozen behaviour ledger is
  `mockups/finding-evidence-routing.behavior.md` (§D Keyboard at line 522, §G
  Crumb at line 822) and the app-only replay is
  `frontend/diagnose-workstation-behavior.replay.mjs`. Executing
  `routeSurface({embodiment:'shipped', runnability:'runnable',
  declaration:'complete', dataSource:'synthetic'})` returns
  `{"mode":"revise","reason":"safe synthetic data source declared"}`.
  **Disposition:** → work order.
- **Slicing stays flat.** No rubric trait fires: one artifact, one target, the
  browser harness already exists and is not built by this ticket, the mock leg is
  archived so there is no split-path evidence, no live resource, no trust
  boundary. Anchor row A. **Disposition:** one work order, one pull request.

### Risk contract

- **Must prevent:** secret exposure; irreversible loss of authoritative data;
  silent incorrect success (a green gate that never presses Enter on a row).
  Focus must never be moved *to* `#level` by a non-navigation repaint.
- **Must recover:** none (pure UI; no state is written).
- **Accepted failure:** a pop whose originating row is absent from the rebuilt
  queue (filtered out by a chip, or a frame reached from the lane with no row id)
  lands on `#level` instead; Tab then proceeds in document order.
- **Unsupported:** assistive-technology announcement order; narrow-viewport focus
  behaviour (the #93 sweep could not exercise it); the roster's own
  select-in-place focus loss.
- **Evidence owed:** a browser-gate assertion that fails on this base (Enter on
  the first queue row → `activeElement` is `body`) and passes after
  (`activeElement` is `#level`, and `#level.matches(':focus-visible')`); a pop
  assertion (Enter on the Findings crumb → focus on the originating `.qrow`,
  matched by its colon-bearing `data-id`); a Backspace assertion covering the
  third entry point; a no-steal assertion (focus parked on `#filter-trigger`
  survives an async case-file repaint); a new frozen ledger story in §D with its
  replay leg.
- **Why:** advisory tool, one user at a time, no data written by this change.
- **Disposition:** copied into the work order.

## Open questions

- Operator: container-first (recommended) or first-control-after-settle as the
  push landing target.
- Operator: whether to file the roster select-in-place focus-loss follow-up now
  or fold it into a later keyboard sweep.

## Spawned tasks

- none
