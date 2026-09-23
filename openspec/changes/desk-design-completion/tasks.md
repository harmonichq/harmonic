# #413 implementation checklist

## 1. Served count sentence (backend)

- [x] 1.1 Serve count sentences from one closed outcome table in
  `ciq_autotune/findings_projection.py`: one on every count-bearing Pattern row,
  keyed by the Pattern's served key, and one on each served family appearance of
  every Cause row, keyed by the lever and that appearance's family; each is the
  whole sentence plus its count, denominator, noun and outcome as separate
  values. Rows with counts under review or no denominator serve none. Tests
  through the projection's public read: a two-family Cause serves two sentences
  that agree with its served appearances; every Pattern key and every emittable
  lever-and-family pair has exactly one entry; the two meals Patterns serve
  different outcomes; tier, rank, priority, register and `headline` are
  byte-identical to the base for the fixture windows. The count sentences are a
  new field beside `headline`; `headline` is not rebuilt from them.
- [x] 1.2 Regenerate the three generators that drift and nothing else
  (`scripts/gen_findings_projection_fixtures.py`,
  `scripts/gen_eating_sequence_fixtures.py`,
  `mockups/harmonic-v2.exploration/generate.py`), extend the fixture-only
  browser mirror to answer the new field, and leave every `--check` and
  `frontend/findings-projection-mirror.test.js` green.

## 2. Basal lane and cold loading

- [x] 2.1 Implement surfaces **The basal lane names and paints every verdict**:
  head row with the lane's name and the key above the cells, every served
  verdict painted with matching key marks, selected outline and staged underline
  kept, compact height, slot selection and keyboard traversal untouched.
- [x] 2.2 Implement surfaces **A cold destination shows a count-free skeleton**
  in the desk's one loading frame, keeping the status role, the named loading
  text of #414 and the retained-Day reload.
- [x] 2.3 Add the lane and loading stories to the desk behavior ledger with their
  replay functions and node regression tests that tell a feature assertion from
  a setup error: the key lies inside the visible lane above the cells and its
  marks match the cells' computed paint for every verdict, selected and staged
  included; the cold frame shows text-free skeleton rows and instruments and is
  still under reduced motion. Register both in the ledger's handler inventory,
  and move the ledger inventory's pinned story counts in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` with its test to match.
  Manufacture any lane state the showcase lacks as a `QaCase` recipe per
  `AGENTS.md`, never by hand-setting `asserts_move`.

## 3. Rail

- [x] 3.1 Implement surfaces **A Pattern owns its causes in the rail**.
- [x] 3.2 Implement surfaces **The rail shows served urgency**.
- [x] 3.3 Implement surfaces **Rail rows print the served count sentence**, and
  delete the frontend Pattern word constant (`PATTERN_COPY`). Each of its readers
  moves to a served fact: the Pattern chart's row match reads `row.pattern_chart`
  alone (the projection already serves it only for a chartable Pattern); a member
  line prints every served count sentence, so the parent-family lookup goes; the
  Pattern mini's cohort label takes its outcome from the row's served count
  sentence, and the Pattern case-file check stops testing the lever against a
  word table (the case file's lever is the `pattern_chart.key` coordinate, whose
  key space is the server's Pattern roster); the `pattern-unknown` detail goes, because 1.1's test makes every
  Pattern key carry an entry, and a Pattern row with no count sentence prints its
  served status words as today.
- [x] 3.4 Implement surfaces **Every ranked rail row draws one mini
  instrument**, settling mini width and placement with the fold at both desktop
  sizes.
- [x] 3.5 Implement surfaces **Diagnose opens on the 24 h window**, leaving
  contextual-entry and retained windows to win as they do today. Only the cold
  arrival's window changes: the workstation's `isf`, `drill`, `occurrence` and
  `drawn` presets keep `overnight`, because ISF is measured in the overnight
  fasting window.
- [x] 3.6 Add the rail and default-window stories to the desk behavior ledger
  with replay functions and node regression tests, move the ledger inventory's
  pinned story counts in `mockups/sweep/harmonic-v2-desktop/acceptance.py` with
  its test to match, amend under the frozen header the stories whose facts
  Connor ruled changed (member minis, sibling cause rows, the Overnight arrival)
  with his dated quotes from `design.md`, and re-read for intent every existing
  desk replay and test that names a claimed row, the Overnight default or a rail
  mini.

## 4. Rendered evidence, critique and records

- [x] 4.1 Prove every new story fails on the base for its feature reason at
  1280x720 and 1440x900, serving origin/main eec4652a from a second worktree
  through the safe start, then prove each passes on the branch. Keep the raw
  logs with the evidence.
- [x] 4.2 Capture synthetic before and after renders at both sizes of the rail
  (open and closed Patterns, one-tier urgency, each mini family), the lane
  (supported raise and lower, hold, insufficient, no data, selected, staged) and
  the cold loading frame, into `docs/scope/413-desk-design-evidence/` with a
  README that maps each #413 requirement to its story, log and captures one by
  one.
- [x] 4.3 Obtain an Opus 5 high-effort critique of those after-captures against
  Connor's locked mockup, implement each supported finding or record the
  concrete objection beside it, and re-capture what changed.
- [x] 4.4 Update `DESIGN.md`'s desk revise section, `mockups/INDEX.md`'s
  Harmonic v2 desktop row and the ledger inventory stated in
  `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md` for the rail fold, urgency, one mini, lane key and
  paint, 24 h arrival and skeleton; re-freeze the desk ledger's header with this
  base and the story counts, which must equal the inventory's pinned counts in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py`.
- [ ] 4.5 Run the complete desk ledger at both sizes through
  `mockups/sweep/harmonic-v2-desktop/acceptance.py replay`, which checks the
  ledger inventory before any story, and the desk, follow-up and browser-runner
  browser suites, once each, serially, on the commit that will be pushed, with the fast
  gate, pytest over the built shell, the OpenSpec strict validation and every
  drift check.
