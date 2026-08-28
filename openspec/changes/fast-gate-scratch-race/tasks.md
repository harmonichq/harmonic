# Tasks — Keep fast-gate scratch outside the stylesheet inventory (#231)

## 1. Pin the filesystem boundary

- [x] Add an assertion that fails on the ticket base because the fail-closed
      suite creates its empty vendor directory below `frontend/`.
- [x] Keep the assertion on the generated directory used by the spawned suite,
      not on a hand-set flag or a duplicate path constant.

## 2. Remove the collision

- [x] Move only the fail-closed suite's empty vendor directories to the
      operating-system temporary root.
- [x] Preserve cleanup in `finally`, all existing browser-suite cases, every missing
      prerequisite assertion, and ADR 39's recursive stylesheet inventory.

## 3. Verify and review

- [x] Run the focused fail-closed and row-box tests together.
- [x] Run every command in the frontend CI job; require zero failures and
      current generated artifacts.
- [ ] Record red/green evidence here, run `/review` at Targeted depth, and resolve
      every blocking finding before opening one pull request. Do not merge.

### Red/green evidence

- **Red:** with the boundary assertion added and the scratch root unchanged,
  `node --test frontend/browser-gates-fail-closed.test.js frontend/diagnose-evidence-row-box.test.js`
  reported 9 tests, 6 passed, and 3 failed. Each failure was the new assertion:
  `<suite> must keep its empty VENDOR_DIR outside the frontend source tree`.
  Both ADR 39 stylesheet-inventory tests passed in the same run.
- **Green:** after rooting the same generated directories at the physically
  resolved `tmpdir()`, the focused command reported 9 tests passed and 0 failed.
- **Frontend job:** on Node 22.23.2, `node --test 'frontend/**/*.test.js'`
  reported 523 tests passed and 0 failed;
  `node --test scripts/screenshots.local.test.mjs`
  reported 1 test passed and 0 failed; the event-comparison check printed
  `event-comparison synthetic capture current`; and the exploration check printed
  `finding-evidence-routing artifacts current (data.json, evidence-table.extracted.js, app-base.extracted.css)`.

### Targeted review

- **Round 1:** the Standards axis found one blocking filesystem-alias case. With
  `TMPDIR` set to a symlink into `frontend/`, the lexical containment assertion
  passed while `mkdtempSync` physically recreated the original in-tree scratch.
  The focused pair reproduced the false green at 9/9.
- **Fix:** resolve both `frontend/` and the operating-system temporary root to
  physical paths, reject an unsafe root before directory creation, and check the
  generated directory against the same physical boundary. The adversarial alias
  run now stops on the root assertion before creating scratch; the normal focused
  pair remains 9/9 green.
