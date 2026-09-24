# Tasks — Retire the legacy basal ribbon and revise its queue noun (#104)

## 1. Pin the closed retirement inventory

- [x] Add a source-inventory test covering the complete retired setup names,
      rendering helpers, chart-builder exports, and 47-class selector set.
- [x] Record the expected base failure before deleting production source.
- [x] Keep the live prompt-queue `buildRibbonOption` alias explicitly guarded so
      the unrelated review-queue ribbon cannot be mistaken for the retired one.

## 2. Remove only the unreachable surface

- [x] Delete the legacy basal tier, block-diff, coverage-ribbon, and evidence-strip
      state and rendering cluster from the shell.
- [x] Delete only its transitive chart-builder exports, tests, and 59 closed-set
      stylesheet rules; preserve every live chart-builder consumer and unrelated
      shell selector.
- [x] Regenerate only the design study's extracted stylesheet and prove its other
      generated artifacts remain byte-identical.

## 3. Revise the findings-queue support noun

- [x] Replace the basal support noun in the Python projection, JavaScript mirror,
      and queue unit-test expectation.
- [x] Regenerate the frozen findings projection and confirm that exactly 16 noun
      lines—and no other fixture lines—change.
- [x] Remove the design study's dead support-noun respelling map while retaining
      its title transformation and support-object shape.
- [x] Amend the frozen behavior record without adding, changing, or retiring a
      story, and capture paired 1440×900 Light/Dark renders before and after.

## 4. Verify and review

- [x] Run the declared no-fetch app and replay the finding-to-evidence contract
      before and after; both runs report 99 of 99 stories passed.
- [x] Run the complete ordered ticket verification: 1965 backend tests pass with
      one skip, 433 frontend tests pass with zero failures, all generator checks
      report current, and every repository/public-tree guard is green.
- [x] Resolve targeted review findings: preserve the ordered selector list and
      comment-line rewrites in the deletion, and make the design study describe
      its rule-8 title-only pass accurately.
- [x] Record the change without adding an ADR, update the existing shipped-surface
      index row once, and leave merge and pull-request review to a human.

## Implementation evidence

- **Closed inventory:** the focused source test failed on the ticket base because
  it found the retired identifiers and selector family. It passes after deletion,
  inventories 47 retired classes, and separately pins the live prompt-queue alias.
- **Deletion:** five owned files changed; the shell and chart-builder dead cluster
  was removed, and the extracted stylesheet lost exactly the corresponding 59
  rules.
- **Projection lockstep:** the generated fixture diff is exactly 16 noun-line
  replacements. The backend fixture check, mirror comparison, and design-study
  check all report current; the study's `data.json` remains byte-identical.
- **Revise evidence:** the exact sub-order-2 base
  `0eb96af553e3be9955d7c72bc55b731361961262` and the built revision both report
  `app: 99 of 99 stories passed`. Four committed 1440×900 renders show the same
  queue in Light and Dark, with only the basal support noun revised.
- **Final gates:** `uv run python -m pytest` reports 1965 passed and 1 skipped;
  `node --test 'frontend/**/*.test.js'` reports 433 passed and 0 failed; the ADR,
  owned-identifier, allowlist, public-link, and contamination guards are green.
