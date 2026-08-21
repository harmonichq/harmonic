# Chrome bar surface fills

## Decisions

- Classify issue #49 as a bounded UI code change. The shipped shell already owns both surfaces; the remaining uncertainty is their visual treatment, not behavior or data flow. `inline`
- Keep the Harmonic identity mark and favicon unchanged. Lock #736 and ADR 47 define them as one constant identity object, and `frontend/index.test.js` pins that contract. `inline`
- Route the unsettled active-step boundary and theme-menu hover vocabulary through the `ui-craft` lock phase before drafting the work order. The issue explicitly withholds implementation until those visual terms are settled. `inline`
- Settle the current step as an outline-and-disc component with no plate fill. Its existing outline, bright label, and filled number disc carry current position without asking one fill to satisfy the empty contrast band. `→ ADR`
- Settle theme-menu hover as a neutral lift: 95% `--ck-panel` mixed with 5% `--ck-meta`. Hover remains visibly transient and distinct from the orange checked-state ink while row text keeps at least 4.5:1 in both themes. `→ ADR`
- Freeze the shipped cockpit shell's base behavior ledger before implementation, then amend exactly the current-step and theme-menu-hover stories under ADR 49 with old-fail/new-pass evidence. The existing browser suite must first be deepened into a fail-closed replay seam. `inline`

### Risk contract

- **Must prevent:** weakening the visible current-step boundary; making keyboard focus, checked theme state, text, or the step-number disc less legible; changing the locked identity mark or favicon; silently treating a visual preference as a WCAG repair.
- **Must recover:** none; this is a static shell change with no durable user data or runtime migration.
- **Accepted failure:** a candidate treatment may fail visual or contrast verification; the build must stop and the candidate must be revised before the pull request.
- **Unsupported:** rebranding the identity mark, changing workflow behavior, or redesigning the full chrome bar.
- **Evidence owed:** populated light and dark renders at the shell's locked 1440×900 and 1280×800 sizes, plus the existing 390×844 drawer regression where applicable; computed contrast for every changed boundary, fill, text, disc, and focus pairing; tests through the shipped shell that pin the accepted structure and leave the identity mark unchanged.

Why: The component is advisory-app chrome, but this change cannot affect insulin guidance or stored data; its credible harms are accessibility regression, lock drift, and a visually ambiguous workflow state.

Disposition: `inline`

## Open questions

- None.

## Spawned tasks

- None.

## Remaining dispositions

- None; ADR 49 is recorded in `openspec/changes/chrome-bar-surface-states/design.md`.
