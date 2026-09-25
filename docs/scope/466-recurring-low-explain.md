# A recurring-lows slot says what owns its move and shows its lows — triage and review ledger

Ticket: #466. Change: `openspec/changes/qa-round-2` (ADR 466; tasks 47–57;
safety requirement 1, surfaces requirement 10). Triage ran unattended (AFK run,
2026-09-24).

## Reproduction

`uv run python docs/scope/466-recurring-low-explain.repro.py`, at this change's
base:

```text
1. 30 steady nights either side of a programmed 0.60 at 03:00, lows at 03:00 on two nights
   status 'lower (recurring lows)', asserts_move True, recommended 0.54
   estimate 0.54 interval 0.45-0.66; interval contains current: True
   evidence.harm keys: ['arm', 'arm_days', 'band_nights', 'gated', 'harm_band_source_nights', 'lows', 'nudged', 'row_days', 'slot_nights']
   served lows: [('2022-07-11T03:00:00', 50.0), ('2022-07-12T03:00:00', 50.0)]
   excluded_night_count 0, roster nights 30
2. One low at 03:00 on one night, one at 04:00 on another
   03:00: status 'lower (recurring lows)', nudged True, slot_nights 1, band_nights 2, lows 1
   04:00: status 'lower (recurring lows)', nudged True, slot_nights 1, band_nights 2, lows 1
3. 03:00 edited mid-window, band lows on two nights before the edit and one after
   03:00: status 'no data', nudged False, band_nights 3 (bar 2), no served count of the nights the nudge counted
```

`uv run python docs/scope/466-recurring-low-explain.repro.py --case` (the
proposed `basal-recurring-low-spread` case, through the store and
`analyze()`):

```text
4. The spread case through the store and analyze()
   status 'lower (recurring lows)', asserts_move True, recommended 0.54, estimate 0.54 interval 0.45-0.66, current 0.6
   nudged True, band_nights 2, lows 2
```

`node docs/scope/466-slot-panel.repro.mjs` (item 1's served row through
`buildSlotLane` and `renderSlotLevel`):

```text
served status "lower (recurring lows)", asserts_move true
stage button: true
"not established by it": true
"something outside the estimate set it": false
served lows 2; a low's date in the panel: false
```

The spread case's 0.06 U/h step sits above #465's threshold, so it stays a
recurring-lows lower after #465.

## Grounding notes

- The hedge lives in `renderParamLevel`, which the carb-ratio and
  correction-factor panels share, so the new sentence is a spec input only the
  basal slot panel sets, chosen from the served status string as the lane key
  does.
- `basal_harm` counts a slot's nudge recurrence in `_slot_recurs` and throws
  the count away; `band_nights` is the uncut band count. The served count comes
  from the same computation the nudge reads.
- The "at this hour" claim appears in the `HARM_LOWER` sentence, the lane
  cell's name (`VERDICT_KEY`), S113's replay and its fake page, two frontend
  tests, two QA headline literals and two DESIGN.md passages; no committed
  fixture carries it (closed inventory by `git grep -i "lows keep happening"`).
- No committed fixture freezes a basal slot's `evidence.harm`, so the two new
  keys move no drift check.
- The slot panel's Node tests use hand-built rows today. The recurring-lows
  rows come from a generated fixture instead: the basal-night-evidence
  generator gains a served `/api/analyze` scenario, whose existing `expected`
  key and consumers are unchanged.
- The roster rows are buttons in a flat list; ARIA column headers need a table
  or grid, which the shared roster mechanism is not.
- Stories count `#level .case-occurrence` rows (R5, S113's variant, R11), so
  the low rows must not reuse that class.
- `basal-night-drill` is archived; its requirement now lives in
  `openspec/specs/surfaces/spec.md` and is amended as a MODIFIED requirement.

## Decisions

- When recurrence is counted across the overnight band, say so and show the
  count the nudge used; the copy says "overnight" (Connor, 2026-09-24).
- The interval sentence's words, the count line's words, held slots listing
  their lows, the roster headers' accessibility shape. ADR 466, decided
  autonomously during the AFK run.
- Surface lifecycle `revise`, as for #465; sweep deferred to start (sandbox).
- Flat order, for the same reason as #465; the nearby reviewer-memory anchors
  disagree.
- Review depth Full: the change moves the harm layer's served evidence and the
  staging panel of an advisory dose change.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
| 1 | — | Initial flat draft pinned 2988a569 | Blocker (`authoring`): Verification omitted `acceptance.test.py` and `case-cache --check`, which CI gates and which task 55's inventory and case map edit. Note (`authoring`): task 52 did not name the roster test at `:799` or its `:808` cell regex, which the hidden labels break. Coordinator ruling: ONLY= replay and a filtered desk suite per push rule. Fixed: both checks join Verification and Expectation; the replay is ONLY= on the new story, S113 and the touched stories, the desk suite filtered to `basal|#460`; task 52 names both lines. | BLOCKED (1 block, 1 note); fixed, no further panel by operator instruction |
