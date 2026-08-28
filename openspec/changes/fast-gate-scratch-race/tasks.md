# Tasks — Keep fast-gate scratch outside the stylesheet inventory (#231)

## 1. Pin the filesystem boundary

- [ ] Add an assertion that fails on the ticket base because the fail-closed
      suite creates its empty vendor directory below `frontend/`.
- [ ] Keep the assertion on the generated directory used by the spawned suite,
      not on a hand-set flag or a duplicate path constant.

## 2. Remove the collision

- [ ] Move only the fail-closed suite's empty vendor directories to the
      operating-system temporary root.
- [ ] Preserve cleanup in `finally`, all existing browser-suite cases, every missing
      prerequisite assertion, and ADR 39's recursive stylesheet inventory.

## 3. Verify and review

- [ ] Run the focused fail-closed and row-box tests together.
- [ ] Run every command in the frontend CI job; require zero failures and
      current generated artifacts.
- [ ] Record red/green evidence here, run `/review` at Targeted depth, and resolve
      every blocking finding before opening one pull request. Do not merge.
