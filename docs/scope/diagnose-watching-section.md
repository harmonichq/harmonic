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
