# #413 implementation checklist

## 1. Served count sentence (backend)

- [ ] 1.1 Serve the count sentence on every count-bearing Pattern and Cause row
  of the findings projection, beside `headline`, from one closed
  family-to-outcome table in `ciq_autotune/findings_projection.py`: the whole
  sentence plus its count, denominator, noun and outcome as separate values.
  Rows with counts under review or no denominator serve none. Tests through the
  projection's public read: a Cause row's sentence agrees with its served
  support; every family in the closed set has exactly one entry; tier, rank,
  priority and register are byte-identical to the base for the fixture windows.
- [ ] 1.2 Regenerate the three generators that drift and nothing else
  (`scripts/gen_findings_projection_fixtures.py`,
  `scripts/gen_eating_sequence_fixtures.py`,
  `mockups/harmonic-v2.exploration/generate.py`), extend the fixture-only
  browser mirror to answer the new field, and leave every `--check` and
  `frontend/findings-projection-mirror.test.js` green.

## 2. Desk composition, basal lane and cold loading

- [ ] 2.1 State the desk's composition once where the desk mounts the
  workstation and thread it through `createDiagnoseEventComparison` to
  `createDiagnoseWorkstation`; with it absent every shared module renders as on
  the base. Node test: the v1 mount's rail, lane and key markup is unchanged.
- [ ] 2.2 Implement surfaces **The desk basal lane names and paints every
  verdict**: head row with the lane's name and the key above the cells, every
  served verdict painted with matching key marks, selected outline and staged
  underline kept, compact height, slot selection and keyboard traversal
  untouched.
- [ ] 2.3 Implement surfaces **A cold destination shows a count-free skeleton**
  in the desk's one loading frame, keeping the status role, the named loading
  text of #414 and the retained-Day reload.
- [ ] 2.4 Add the lane and loading stories to the desk behavior ledger with their
  replay functions and node regression tests that tell a feature assertion from
  a setup error: the key lies inside the visible lane above the cells and its
  marks match the cells' computed paint for every verdict, selected and staged
  included; the cold frame shows text-free skeleton rows and instruments and is
  still under reduced motion. Register both in the ledger's handler inventory.
  Manufacture any lane state the showcase lacks as a `QaCase` recipe per
  `AGENTS.md`, never by hand-setting `asserts_move`.

## 3. Desk rail

- [ ] 3.1 Implement surfaces **A Pattern owns its causes in the desk rail**.
- [ ] 3.2 Implement surfaces **The desk rail shows served urgency**.
- [ ] 3.3 Implement surfaces **Desk rail rows print the served count sentence**;
  the desk path reads no frontend word list.
- [ ] 3.4 Implement surfaces **Every ranked desk rail row draws one mini
  instrument**, settling mini width and placement with the fold at both desktop
  sizes.
- [ ] 3.5 Implement surfaces **The desk opens Diagnose on the 24 h window**,
  leaving contextual-entry and retained windows to win as they do today.
- [ ] 3.6 Add the rail and default-window stories to the desk behavior ledger
  with replay functions and node regression tests, amend under the frozen header
  the stories whose facts Connor ruled changed (member minis, sibling cause rows,
  the Overnight arrival) with his dated quotes from `design.md`, and re-read for
  intent every existing desk replay and test that names a claimed row, the
  Overnight default or a rail mini.

## 4. Rendered evidence, critique and records

- [ ] 4.1 Prove every new story fails on the base for its feature reason at
  1280x720 and 1440x900, serving origin/main 6821bbf6 from a second worktree
  through the safe start, then prove each passes on the branch. Keep the raw
  logs with the evidence.
- [ ] 4.2 Capture synthetic before and after renders at both sizes of the rail
  (open and closed Patterns, one-tier urgency, each mini family), the lane
  (supported raise and lower, hold, insufficient, no data, selected, staged) and
  the cold loading frame, into `docs/scope/413-v2-desk-design-evidence/` with a
  README that maps each #413 requirement to its story, log and captures one by
  one.
- [ ] 4.3 Obtain an Opus 5 high-effort critique of those after-captures against
  Connor's locked mockup, implement each supported finding or record the
  concrete objection beside it, and re-capture what changed.
- [ ] 4.4 Update `DESIGN.md`'s v2 desk section and `mockups/INDEX.md`'s desk row
  for the rail fold, urgency, one mini, lane key and paint, 24 h arrival and
  skeleton; re-freeze the desk ledger's header with this base and the story
  counts.
- [ ] 4.5 Run the complete desk ledger at both sizes and v1's three ledgers once
  each, serially, on the commit that will be pushed, with the fast gate, pytest
  over the built shells, the OpenSpec strict validation and every drift check.
