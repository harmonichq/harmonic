# Tasks — The owner's name is not contamination (#261)

## 1. Prove the new behavior first

- [x] Add a test that the owner's name, and a line crediting a ruling to him,
      scan clean with no exemption in the config.
- [x] Add a test pinning the surviving prose exemptions to exactly the
      generated dose-ratio baseline.
- [x] Run both against the pre-change scan and record the failures.

## 2. Retire the sub-check

- [x] Drop `owner-name` from the prose check set, delete its pattern and its
      dispatch entry, and correct every prose statement that describes it or
      miscounts the surviving checks.
- [x] Delete the six `owner-name` exemptions and the comment prose that exists
      only to explain them, keeping the dose-ratio exemption and its rationale.
- [x] Delete the three tests whose only subject is the retired rule, and rewrite
      the exemption-scoping test against a surviving check.
- [x] Collapse the workstation replay driver's run-time author lookup, keeping
      every printed sanction string byte-identical.

## 3. Verify and review

- [x] Run the fast gate, the publishable-tree scan over a materialised tree, and
      the workstation replay browser gate.
- [ ] Record red/green evidence here, run `/review` at Full depth, and resolve
      every blocking finding before opening one pull request. Do not merge.

### Red/green evidence

- **Red:** with both new tests added and the scan unchanged,
  `uv run python -m pytest tests/test_scan_public_tree.py -k "owners_name_and_a_credited_ruling or only_prose_exemption"`
  reported 4 failed, 1 passed. All three owner-name subcases failed with
  `'rule5-owner-name' not found`, and the exemption test named the six
  `owner-name` waivers still in the config.
- **Green:** after retiring the sub-check and its waivers,
  `uv run python -m pytest tests/test_scan_public_tree.py` reported 78 passed.
- **Fast gate:** `uv run python -m pytest` reported 2103 passed, 1 skipped;
  `node --test 'frontend/**/*.test.js'` reported 531 passed, 0 failed; OpenSpec
  strict validation reported 71 passed, 0 failed; the decision-record, owned-identifier
  and allowlist guards each exited 0.
- **Publish gate:** over a freshly materialised tree,
  `scan_public_tree.py` printed
  `381 file(s) scanned, 21 stamped, 6 pinned, 171 acknowledged dose-ratio, 0 finding(s).`
  and listed exactly one prose exemption in force,
  `scripts/public_scan_config.txt dose-ratio`.
- **Browser gate:** the workstation replay driver reported
  `app: 141 of 141 stories passed`, with S12, S17 and S26 printing their named
  sanction lines unchanged, e.g.
  `ok S12 — RETIRED — Connor Griffin · 2026-08-23 · "the roster is drawn vertically; one key model per list."`.
  It ran against the declared no-fetch server on port 8766; port 8765 was held by
  an unrelated local server.

### Full review

- Pending.
