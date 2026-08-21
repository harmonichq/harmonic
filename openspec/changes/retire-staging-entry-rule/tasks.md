# Tasks — Retire the dead staging-entry style (#39)

## 1. Pin the closed inventory

- [ ] Extend `frontend/diagnose-evidence-row-box.test.js` to read both shipped
      stylesheets and fail while the `button.entry` selector family or the theme's
      `.entry .sub` selector remains.
- [ ] Preserve the existing assertion that the shipped evidence painter emits an
      inline `.entry` glucose cell and that no box-producing selector reaches it.
- [ ] Record the expected pre-deletion failure and restore the test before editing
      production CSS.

## 2. Remove only the retired rules

- [ ] Delete the complete `button.entry` block and its descendant rules from
      `frontend/diagnose-workstation.css`.
- [ ] Remove only the dead `.entry .sub` arm from the shared typography selector
      in `frontend/theme.css`; keep every live selector in that list unchanged.
- [ ] Keep `.ev-row .entry`, `.stagebtn`, the unified findings queue, parameter
      detail levels, basal-lane navigation, and Plan staging behavior unchanged.

## 3. Verify and review

- [ ] Run the complete frontend fast gate and the exploration drift check from
      `AGENTS.md`; all checks exit zero.
- [ ] Confirm the existing S24 app replay remains untouched and CI still owns its
      public assertion that level one renders zero per-parameter tier rows.
- [ ] Update this record with red/green evidence, run `/review` at Targeted depth,
      and resolve every blocking finding before opening one pull request. Do not
      merge.
