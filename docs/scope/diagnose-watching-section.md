# Diagnose Findings queue: an un-sifted Watching section

Ticket: harmonichq/harmonic#97.

## Owner override — 2026-08-23

**ConnorGriffin, 2026-08-23T19:00:53Z**, in a comment on harmonichq/harmonic#97,
overrode this ledger's original headline decision (a visible `Watching` section
head) and widened scope. The risk contract, the placement grounding and the
verification list below are KEPT; the headline decision is replaced by the three
decisions that follow. The superseded decision is not re-argued.

## Decisions

- **`held`, `blind` and `history` rows collapse behind the existing
  `Watching · N reads` toggle ALWAYS, not only during a sift.** `inline`
  `frontend/diagnose-findings-queue.js:176` is
  `const collapsed = !eventChartsOnly && watching && sifting;` — drop `&& sifting`.
  The `eventChartsOnly` exception stays. Toggle markup, copy and expand state
  (`view.collapsedExpanded`, wired at `diagnose-workstation.js:2233-2234`, state at
  `:1012`) are unchanged. There is NO visible section head.

- **The `uncaused_highs` footer is removed from the frontend only.** `inline`
  `uncausedNote` (`diagnose-findings-queue.js:45-47`), the `appendNote` painter
  (`:286-292`), `.uncaused-note` CSS (`diagnose-workstation.css:805`) and the tests
  at `diagnose-findings-queue.test.js:311-331` (plus the import at `:10`) go. The
  backend `uncaused_highs` field stays: fixtures freeze it and churning generators
  is out of scope. No replay story or ledger entry asserts the footer — verified by
  grep over `diagnose-workstation-behavior.replay.mjs`,
  `finding-evidence-routing.behavior.md` and `diagnose-workstation.browser.test.mjs`.

- **`openspec/specs/surfaces/spec.md:20` is amended**; the retired-I:C Requirement at
  `:22-25` is re-read and adjusted only if it asserts visibility.

### Measured consequences the override implies but did not name

- **Every window's queue meta changes.** `queueMeta` counts rows that are
  `!hidden && !collapsed` (`diagnose-findings-queue.js:100-101`), so collapsing
  Watching always removes them from the count. Executed against the committed
  fixture: afternoon `5 in this window`→`3`, global `8 findings · 30 days`→`7`,
  low_block `3`→`1`, morning `4`→`1`, overnight `5`→`3`, rebound `4`→`3`, and
  **quiet `2 in this window`→`30 days`** — the term-41 EMPTY form, because every
  row in that window is a Watching read. The existing assertions at
  `diagnose-findings-queue.test.js:18-20` pin the old values and will fail.
  Decision: let the meta follow its existing rule unchanged (it counts what the
  reader can see) and restate the test expectations. Flagged to the human.

- **The change breaks frozen stories that read Watching rows un-sifted.** The
  shared helper `openHistoryCase` (`replay.mjs:741`) does
  `row.waitFor({ state: 'visible' })` on `#level .qrow[data-state="history"]`
  before clicking, and is called 25 times, so every history story routed through it
  fails once rows collapse. Direct readers at `:1919` (S43), `:1929` (S44), `:2043`
  and `:2357` fail the same way, as does
  `diagnose-workstation.browser.test.mjs:162-166`. `:1914` (S42) survives — it
  already expands first. Decision: amend the shared helper to expand the toggle,
  amend the four direct readers and the browser test, and record the amendment
  under the ledger's frozen header per `ui-craft/reference/revise.md` §"Behavior
  changes · Changed".

- **Standing replay count measured, not assumed: 89 entries** (S01-S71, C41-C55,
  D1-D3); highest S id is S71, so the new story is **S72**.

- **Branch state measured:** `git rev-list --left-right --count origin/main...HEAD`
  reports `0	6` — zero behind `origin/main`, six ahead (all scope-ledger commits).
  No rebase needed.

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
- **Evidence owed:** ~~a browser-level assertion that an un-sifted projection paints
  exactly one Watching head~~ — SUPERSEDED by the 2026-08-23 owner override, which
  deleted the section head. Replaced by: a replay story (S72) asserting that the
  un-sifted queue paints the `Watching · N reads` toggle, zero watching rows before
  it is clicked and at least one after, and no `.uncaused-note` anywhere; a node case
  pinning `collapsed: true` for held/blind/history at `selected = null`; the full
  frozen replay green; fast gate green. The "Open questions" item on head visual
  weight is moot and withdrawn; the spiked placement-predicate table below is retained
  as the record of a superseded design, not as an obligation.

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

- Round 4 (cold delta panel, post-override rewrite): **5 blocking**, 2 notes, all
  `authoring`. All five reproduced before any fix; one reviewer claim REFUTED.
  (1) "No browser test asserts the footer" was FALSE —
  `diagnose-workstation.browser.test.mjs:1032-1060` reads `#level .uncaused-note` at
  `:1043` and `:1049`. Removing the footer is therefore a RETIREMENT under
  `ui-craft/reference/revise.md`; order now carries step 3a (absence assertion +
  sanction) and a permanent RETIRED ledger entry.
  (2) Step 10's "no sanction line is owed" contradicted step 1d's halt rule. Resolved
  by a single pre-ruled carve-out naming the footer.
  (3) The broken-story census was INCOMPLETE. It audited only `data-state=` locators
  and missed the `state()` helper (`replay.mjs:186`) which hands stories a `queue`
  array off `#level .qrow`. Newly named: S18 (`:1141-1148`), S24 (`:1484-1487`),
  S41 (`:1880-1889`), `issue81SlicedProjection` (`:2817`, run from the browser test
  at `:221`). All four verified to read Watching rows un-sifted.
  (4) S72 had no `captureEvidence` call, so step 9's AFTER renders would have written
  zero files — `captureEvidence` fires only where a story calls it. One line added.
  (5) The all-Watching window is a NEW undesigned state: neither empty guard fires
  (`:294` needs `!rows.length`, `:281` needs `filtering`), so `windows.quiet` would
  paint an empty list under a bare toggle while the meta reads `30 days`. Step 6a now
  rules on it.
  Note (6): four citations were off, one destructively — `:311-331` cuts through two
  test bodies and leaves the file unparseable. Corrected to the three `#63` tests at
  `:310-334`, with the fourth at `:336-344` explicitly preserved. Also corrected
  `openHistoryCase` to `:740`, and the call count to 18 direct + 7 via
  `openHistoryEvents`.
  Note (7): the risk contract's "Evidence owed" still demanded the deleted head —
  superseded above.
  REFUTED: the reviewer placed `ONLY` at `replay.mjs:3569`; `grep -n process.env.ONLY`
  returns `3568`. The order's original citation stands and was not changed.
  Also verified independently of the panel: the node tests at
  `diagnose-findings-queue.test.js:146` and `:158` SURVIVE (`:146` never inspects
  `collapsed`; `:158` sifts first).
  Injected: 0.
