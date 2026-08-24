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

## Plan-review rounds

Two cold reviewers, no stake in the draft, one panel. Every objection was
reproduced against the repo before it was acted on; none was refuted.

**Round 1 — 6 blocking, 3 notes, all tagged `authoring` (present since the
draft), 0 `injected`.**

Blocking:

1. The no-steal assertion parked focus on `#filter-trigger`, which
   `paintFilter` sets `hidden` whenever `top().k !== 'factors'` (`:1995-2003`,
   markup `:138`) with no CSS override of `[hidden]` for `.filter-wrap` — so it
   is `display: none` in exactly the state the assertion needs and can never
   hold focus. Park target moved to a `#seg-window` preset button, and the test
   must now assert the park itself succeeded first.
2. The Expectation demanded all four new assertions be red on the base, but
   nothing in the file moves focus today, so the no-steal guard is green on the
   base. Demanding red on it could only ever produce a spurious red. Split into
   red-first (6a–6c) and green-before-green-after (6d).
3. "for all five frame kinds" was not observable through the gate the order
   builds: the synthetic payload's `rendered_rows` is 8 rows, all
   `register: "finding"`. Cut from Done-when, moved to the ADR as rationale.
4. The behaviour ledger counts itself — header `:12` "74 executable entries",
   §3 `:955-960` "P01–P54" and "54 rows" — and adding P55/S72 without updating
   those leaves an operator-approved contract arithmetically false.
5. The S72 marker was pinned to S13's form, which sits in a legacy bulk block at
   replay `:3261`; the live convention is S71's at `:2348-2349`, immediately
   above the export.
6. Step 8 said "an OpenSpec change folder … following the existing folders'
   shape", but `scripts/check_adr_numbers.py` reads only the
   `## ADR <issue> — <title>` heading under `openspec/changes/**/design.md`, and
   `openspec/changes/finding-evidence-routing/` already exists for this exact
   surface (design.md only, ADRs 31/42/41). Now names that exact path and
   forbids proposal.md/tasks.md as unenforced busywork.

Notes, all adopted:

7. The `?? frame.id` history branch the order calls load-bearing was asserted by
   nothing — both pop assertions drove `finding` rows. 6c now drives the history
   row `ich1_WzAsNzIwLCI2Il0`.
8. A multi-level pop read `top()`, but a slot reached from the case head carries
   no row id (`onViewSlot(cell)` at `:548`, `pickCell` rowId default null at
   `:1628`). Now reads `stack[1]` captured before truncation.
9. Three cites were off by a few lines: `popTo` is `:1603`, the history `id:` is
   `:1565`, the factor `rowId:` is `:1574`. Renumbered.

**Round 2 — 3 blocking, 4 notes. 4 `authoring`, 3 `injected`.** One fresh cold
reviewer plus both round-1 reviewers re-checking their deltas. Injected blockers
appearing at all is why the order was rewritten clean again rather than patched.

Blocking:

1. `injected` + `authoring`. Step 7 filed a new `P55` row into §D and edited §3's
   counts. Both are wrong: the P rows are a section-contiguous predecessor
   inventory (§D is P23–P27 ending at `:593`; §E opens P28 at `:598`), so a P55
   appended to §D lands mid-document and out of order, and §3's range would then
   describe a non-contiguous document. Every post-freeze change to this ledger
   has instead added S stories under a dated revision section (five precedents,
   `:1268`, `:1388`, `:1699`, `:1756`, `:1816`) and left the P inventory alone —
   and this change adds no event-listener site, so it owes no P row. The §3 edit
   was itself introduced by round 1's fix. Now: dated revision section, S72, the
   `:12` header count only, §2 and §3 untouched.
2. `authoring`. The pending-focus value had no stated encoding, and two distinct
   states are both falsy-row-id. A slot pushed from the basal lane at level 1
   carries `rowId: null` (`renderLane(…, pickCell)` at `:2532` → `pickCell(cell,
   rowId = null)` at `:1622`) and no `id`, so `stack[1].rowId ?? stack[1].id` is
   nullish; an agent implementing "one value, falsy means nothing pending" leaves
   that reader on `<body>` — the exact defect being fixed. Now three named
   states, with nullish explicitly meaning the level state.
3. `authoring`. Assertion 6b named `finding:carb_undercount` without pinning the
   fixture that contains it. A row absent from the queue yields a selector
   timeout, not the `BODY` red the order asks to be recorded, and the two look
   nothing alike in a log. Now both pop assertions run against
   `openApp(browser, { history: true, appSource: 'fixture' })`, and the order
   requires asserting the row is present before pressing a key.

Notes, all adopted:

4. `authoring`. `historyRetired()` at `:1165-1175` does
   `stack.length = 1; dir = 'pop'; paint()` — a fourth stack transition,
   system-driven rather than reader-driven. Unnamed, it made the order's
   "exactly three entry points" claim checkably false and left an auditing agent
   free to hang focus off an async retirement. Now named as a must-not.
5. `authoring`. A Done-when clause about pops landing on an intermediate level
   had no assertion behind it and could not signal done. The behaviour stays
   specified in Do step 4 and in the accepted-failure list; the clause is out of
   Done-when.
6. `injected`. Round 1's `#seg-window` park target had no lever to make the async
   repaint land after the park. `findingsDelayMs` is the existing one, already
   used at `:212` and `:243` of the same test file.
7. `injected`. Four CI commands the change can trip were missing from
   Verification (the public-tree trio and the exploration `--check`), plus a
   boundary against naming `docs/scope/*` or `mockups/*.behavior.md` in a
   shipping `frontend/` comment. Cites corrected: `pickCell` is `:1622`, the
   ledger counts are `:12`, `:954`, `:958`.

Both round-1 reviewers confirmed on re-check that `stack[1]` is correct on every
pop path including a depth-3 Backspace, and that `#seg-window` is a sound park
target.

**Round 3 (the three-panel cap) — 1 blocking, 2 notes, all 3 `injected`.** A
fresh cold reviewer with no prior context.

Blocking:

1. Round 2's own fix landed broken. It pinned 6b and 6c to
   `openApp(browser, { history: true, appSource: 'fixture' })`, but `openApp`
   defaults `state: 'typical'` (replay `:390`), and `typical` pins
   `win: 'overnight'` (`:246`) whose range is `[0, 360]` (`:233`), so
   `findingsWindow()` (`:1135-1138`) window-scopes the queue and no
   `finding:`-register row survives — 6b had no subject. `history: true` swaps
   only the findings inputs, not the window. Reproduced directly. Fixed by
   pinning `state: 'dense'`, the one state with `win: 'all'` (`:253`), whose
   `[0, 1440]` makes `findingsWindow()` return `null` — the global projection,
   which carries both `finding:carb_undercount` and `ich1_WzAsNzIwLCI2Il0` — and
   which opens at `level: 1`.

Notes, both adopted:

2. The `:12` header edit read literally would widen ticket 10's range to
   `S41-S72`, folding a #100 story into ticket 10's authorship and falsifying its
   "31", in a ledger the order elsewhere forbids rewriting. Now gives the literal
   replacement clause.
3. The public-tree trio added in round 2 took an undefined `<dir>`, and
   `build_public_tree.py` copies into its target without clearing it — aiming it
   at a worktree path pollutes rather than errors. Now `D=$(mktemp -d)`.

**Injected-blocker trend: 0 → 3 → 3.** That is the rewrite-clean signal firing,
and it is why rounds 1 and 2 were each answered by rewriting the order rather
than patching it. At the cap the three remaining items were plain fact errors
with exact fixes, each reproduced against the repo before it was applied, so they
were applied surgically rather than by a fourth round. No unsettled *decision*
was blocking at the cap — the two genuinely open decisions are below, and go to
the operator.

Both reviewers independently
confirmed the mechanism itself — a single read-and-clear consumer at the end of
`paint()` — is correct: `push` has five call sites and `popTo` one, all
navigations; boot appends to `stack` directly (`:1658-1679`) and bypasses
`push()`, so a page load cannot grab focus.

## Open questions

- Operator: container-first (recommended) or first-control-after-settle as the
  push landing target.
- Operator: whether to file the roster select-in-place focus-loss follow-up now
  or fold it into a later keyboard sweep.

## Spawned tasks

- none
