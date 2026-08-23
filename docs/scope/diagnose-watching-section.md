# Diagnose Findings queue: an un-sifted Watching section

Ticket: harmonichq/harmonic#97.

## Decisions

- **The queue renders one visible `Watching` section head before the first SHOWN
  held, blind, or history row, with those rows following beneath it — absent
  exactly when no watching row is shown. The sift-time collapse toggle is
  unchanged.** `inline`

  Why: `CONTEXT.md` (**Audit**, **Watching**) and
  `openspec/specs/surfaces/spec.md` ("Findings in the held or still-collecting
  registers stay visible in a separate 'Watching' section below") already require
  held, still-collecting, and historical reads to sit in a separate Watching
  section beneath the action-ready queue. Verified in
  `frontend/diagnose-findings-queue.js:176` — `collapsed = !eventChartsOnly &&
  watching && sifting` — the grouping exists ONLY during a sift; un-sifted, those
  rows paint as ordinary `.qrow` peers. A collapsed-by-default section would hide
  what the spec says stays visible, so it is rejected. The section covers all
  three Watching registers, not history alone, because `CONTEXT.md` defines the
  term over all three.

- **The head reuses the surface's own existing Watching copy: `Watching · N
  reads` (`read` when N is 1).** `inline` Not invented — it is byte-for-byte the
  string the shipped `.qcollapse` toggle already prints
  (`diagnose-findings-queue.js:352-355`). The head is static text, not a control:
  the un-sifted section does not collapse.

- **Frontend-only.** `inline` The server already orders registers
  `assert/finding < held < blind < history`
  (`ciq_autotune/findings_projection.py:110` `_REGISTER_RANK`) and publishes
  `counts.history` (`:159`). No projection, mirror, or fixture change is required.

- **Under `Event charts` only (`eventChartsOnly`), a watching row with a chart
  coordinate is SHOWN while `collapsed` is forced false
  (`diagnose-findings-queue.js:176`). The head therefore fires there too.**
  `inline` The rule is "before the first SHOWN watching row", not "when not
  sifting" — that distinction is what makes it correct under sift + Event charts.

- **Ledger stories S41, S42, S29 stay true and are not amended; one new story
  freezes the un-sifted section.** `inline` Those stories read `#level .qrow`
  order, tag text, `data-state`, and tag right-edge alignment, none of which a
  head element between rows changes.

### Risk contract

- **Must prevent:** secret or real-data exposure; any change to which rows the
  server publishes, their order, register, tier, or action fields; a history or
  held row becoming stageable or reachable to Plan; frontend re-derivation of
  register from ratios, nulls, or id syntax; silent incorrect success (a green
  gate that never rendered a Watching row).
- **Must recover:** none beyond existing queue behavior; the change is a pure
  render of already-published rows.
- **Accepted failure:** a window with no shown Watching row renders no head at
  all (nothing to separate).
- **Unsupported:** changing the sift-collapse behavior, the case file, the canvas,
  or the server projection.
- **Evidence owed:** a browser-level assertion (replay story) that an un-sifted
  projection containing held/blind/history rows paints exactly one Watching head
  immediately before the first watching row and none when no watching row is
  shown; the full frozen replay green; fast gate green.

Why: Diagnose influences advisory insulin-dosing decisions; retired evidence
mistaken for a current finding is a misread with dosing consequences.
Disposition: `inline` — applies the surfaces spec and `CONTEXT.md`; no new
decision.

## Open questions

- Visual weight of the head (quiet label vs. label plus hairline rule) is a
  shipped-surface design call. Default taken: the `.qcollapse` quiet register
  (`--mk-secondary`, `var(--ck-data)`, `padding: 8px var(--ck-pad)`), no rule, so
  the head reads as the same kind of thing the sift already prints. Flagged to
  the human; not blocking.

## Spawned tasks

- None.

## Plan-review rounds

- Round 1 (cold panel, aborted run, re-verified this session): 2 blocking + 2
  notes, all `authoring`. (1) "no head during a sift" was false under sift +
  Event charts (`diagnose-findings-queue.js:176`,
  `diagnose-workstation.js:2230`) — CONFIRMED; rule restated as "before the first
  SHOWN watching row". (2) `renderFindingsQueue` is never node-tested (grep over
  `frontend/*.test.js` returns no importer) so the fast gate has no DOM —
  CONFIRMED; DOM assertions belong in the replay. Note: #83's record lives in
  `openspec/changes/event-chart-discovery/design.md` — CONFIRMED via
  `mockups/INDEX.md`. Note: "STORIES needs S72 appended (72 of 72)" — **REFUTED**:
  the array holds 89 entries (S01–S71, C41–C55, D1–D3), the ledger's "74
  executable entries" prose is itself stale, and no gate asserts a count. The new
  story is S72; no "N of N" total is authored anywhere that must be updated.
  Injected: 0.

## Spiked placement predicate — executed output

The head is a per-row boolean computed inside `queueRows`, exactly as the
existing `seam` field is, so it is node-testable with no DOM:

```js
const WATCH = new Set(['held', 'blind', 'history']);
// after the existing hidden/collapsed pass, before the return map:
//   shown && WATCH.has(row.register) && !watchingOpened  →  watchingHead: true
```

Run against the committed `frontend/__fixtures__/findings-projection.json`
(2026-08-23), `queueRows(projection, selected, eventChartsOnly)`:

| window | plain | sift(`highs`) | Event charts |
|---|---|---|---|
| afternoon | 1 head, before `held` | 0 (toggle owns it) | 0 |
| global | 1 head, before `history` | 0 (toggle) | 0 |
| low_block | 1 head, before `held` | 0 (toggle) | 0 |
| morning | 1 head, before `held` | 0 (toggle) | 0 |
| overnight | 1 head, before `held` | 0 (toggle) | 0 |
| quiet | 1 head, before `held` (first element — every row is Watching) | 0 (toggle) | 0 |
| rebound | 1 head, before `held` | 0 (toggle) | 0 |

Note: every `Event charts` column is 0 because no watching row in this fixture
carries an `event_chart` coordinate — not because the predicate excludes that
mode. The predicate keys on "first SHOWN watching row", so a watching row with a
coordinate WOULD take a head under `eventChartsOnly`. That path is asserted by
the predicate's unit test with a hand-built row, not by this fixture.

- Round 2 (cold panel A, this session, axes 1-2 — grounding and acceptance):
  **0 blocking**, 3 notes, all `authoring`. All reproduced before applying.
  (1) "S72 demonstrably fails against the base tip" was unsatisfiable — S72 does
  not exist on base. Replaced with the `ONLY=S72` procedure (runner reads it at
  `frontend/diagnose-workstation-behavior.replay.mjs:3568`, verified), reverting
  only the two product files and expecting `app: 0 of 1 stories passed`.
  (2) The head's count re-filtered `rows` when `renderFindingsQueue` already
  computes `shown` at `frontend/diagnose-findings-queue.js:302` (verified);
  order now derives from `shown`, so the render has one definition of "shown".
  (3) "all four guards" named no real set — `AGENTS.md:49-51` declares three
  guard scripts (verified); Expectation and Done-when now say three and name
  them. Also self-corrected two of my own citations (the `.qcollapse` block is
  lines 350-358, its `readWord` string 354-355). Injected: 0.

- Round 3 (cold panel B, this session, axes 3-5 — interface shape, scope, cost):
  **6 blocking**, 1 note, all `authoring`. All six reproduced against the repo
  before any fix. The order was REWRITTEN CLEAN rather than patched.
  (1) The head carried no ARIA role inside a `role="list"`, so it would be
  dropped from the reading order — and `diagnose-findings-queue.js`'s `flavor`
  ternary tags a HELD row **Setting**, so a non-visual reader got no separation
  at all. Head now takes `role="listitem"`; S72 and Done-when assert it.
  (2) Base evidence was owed but no base server existed. Now a second worktree
  at the base SHA on port 8766, per `ui-craft/reference/revise.md` §1.
  (3) Evidence named only 1440×900; `diagnose-workstation.css:884` opens
  `@media (max-width: 760px)` and `:907` gives `.qcollapse` a 44px min-height.
  Added the 760 viewport and the sift + `Event charts` state.
  (4) `watchingHead` was a shallow seam — placement in the pure function, the
  reader-visible COUNT in the DOM-only painter, unreachable by the fast gate.
  `queueRows` now emits `watchingCount` too, and `WATCH` is hoisted to module
  scope so the membership fact has one implementation. This supersedes round
  2's note (2), which moved the count within the painter instead.
  (5) Verification omitted `mockups/finding-evidence-routing.exploration/build.mjs
  --check` (`.github/workflows/ci.yml:139-140`), which imports `queueRows`
  (`build.mjs:66`), `renderFindingsQueue` (`surface.js:72`) and links
  `diagnose-workstation.css` (`index.html:229`) — both edited files. Added to
  Verification with a Boundaries ruling.
  (6) Step 7's ledger delta was owed an inventory no step commissioned;
  `revise.md` §2 requires four obligations and the order discharged only the
  replay. Step 1d now commissions the source-and-live re-inventory.
  Note (7): the `Signed-off-by:` Boundaries line was imported from another
  repo — `grep -rni signed-off-by .github scripts githooks AGENTS.md README.md`
  returns nothing. Dropped.
  Reconciliation: round 2's note (1) and round 3's objection (2) collided on how
  to prove S72 red. Resolved better than either — `replay.mjs:405-409` shows the
  replay is a pure client keyed on `BASE_URL`, so the BRANCH's replay file runs
  against the BASE server and S72 goes red with no revert of anything.
  Injected: 0.
