# Cockpit shell revision evidence

## Ground and direction

- Job: keep the current workflow position and transient theme hover unambiguous in Harmonic's fixed clinical-instrument frame.
- Audience and setting: one pump wearer reviewing advisory evidence under real stakes, on desktop or the existing narrow drawer.
- Direction: preserve the dark evergreen/graphite chrome and spend orange only on persistent signal.
- Signature move: the current step is an outline plus numbered disc; hover is a quiet neutral lift.
- Density: unchanged and dense, because this is navigation chrome around a diagnostic workstation.
- Constraints: ADR 49, the shipped theme tokens, WCAG AA, unchanged geometry, the 390×844 drawer, synthetic data only, and no identity/tuning/API changes.
- Anti-references: filled selection pills, orange transient hover, new one-caller tokens, rebranding, and a broader chrome redesign.

The safe-start declaration is `AGENTS.md`'s exact `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite` command and generated synthetic database. This evidence used the still narrower fixture-only app opener in `frontend/cockpit-shell.browser.test.mjs`; it served the exact bytes pinned in `mockups/cockpit-shell.behavior.md` and started no server or fetch.

## Paired render review

The eight PNGs in this directory use the same app opener, exact synthetic input bytes, populated Diagnose state, current step, open Theme menu, hovered unchecked theme, viewports, themes, and screenshot framing. Base and revision are paired by suffix:

- `1280x800-light`
- `1280x800-dark`
- `1440x900-light`
- `1440x900-dark`

Accepted review:

- Geometry and reflow: unchanged. The workflow spine, chart/inspector seam, menu bounds, footer, and viewport framing stay fixed.
- Current position: the filled plate is gone; the one-pixel outline, bright label, and filled number disc remain immediately legible in both themes.
- Hover versus checked: the hovered unchecked row is a quiet neutral lift; the checked theme remains orange and retains `aria-checked="true"`.
- Focus: current-step and menu-row focus outlines remain separate from hover and clear their measured floor.
- Responsive stability: the existing 390×844 drawer story passes with its six destinations, 44px targets, keyboard path, and on-screen focus.

## Computed painted relationships

The browser helper parses both `rgb(...)` and Chromium's `color(srgb ...)` results and composites alpha over the painted ground before computing WCAG ratios.

| Theme | Current outline / bar | Disc / bar | Label / bar | Current focus / bar | Unchecked ink / hover | Checked ink / row | Menu focus / hover |
|---|---:|---:|---:|---:|---:|---:|---:|
| Light | 7.55 | 6.46 | 12.95 | 6.46 | 7.06 | 9.95 | 7.06 |
| Dark | 7.85 | 6.08 | 17.44 | 6.08 | 8.52 | 6.95 | 8.52 |

All boundary/disc/focus relationships exceed 3:1, and all label/row-ink relationships exceed 4.5:1. The hover is non-transparent and differs from both its panel and `--ck-accent-soft` in each theme.

## Behavior evidence

- The base replay passed before styling; its existing deliberate mutation block proved a representative frozen story could fail.
- The amended S9 assertion then failed against the base with light current-step fill `rgb(135, 73, 40)` instead of transparent.
- After the CSS revision, all ten registered stories passed and printed `cockpit-shell applicable stories: 10`.
- S9 and S10 each restore the retired fill temporarily in both themes, observe their own amended assertions fail, remove the mutation, and pass again.
- Unknown or missing requests abort; the opener no longer turns them into `200 {}`.

## ui-craft audit

Anti-pattern verdict: pass. The revision removes a heavy inactive-looking plate, introduces no new component/token/dependency, and retains Harmonic's distinctive instrument chrome.

| Dimension | Score | Evidence |
|---|---:|---|
| Accessibility | 4/4 | Computed contrast, semantic checked state, keyboard focus, public-affordance replay, and responsive drawer all pass. |
| Performance | 4/4 | Two declarations removed and one local computed color added; no script, layout, animation, asset, or dependency cost. |
| Responsive design | 4/4 | Both desktop locks and the 390×844 drawer pass without overflow or reflow. |
| Theming | 4/4 | Both themes use existing role tokens; no hard-coded color or new token was introduced. |
| Anti-patterns | 4/4 | No banned motif or generic dashboard treatment was added. |
| Total | 20/20 | Excellent for the bounded ADR 49 surface revision. |

Findings: P0 0 · P1 0 · P2 0 · P3 0. Positive findings: the current boundary remains redundant across outline, ink, and disc; hover and checked now use distinct visual vocabularies; the identity object and bar tokens remain untouched.

## ui-craft polish

Pass. Design-system alignment is direct: this is the existing shell component, existing spacing/type/geometry, existing theme roles, and the settled ADR 49 mix. Visual inspection covered both themes and locked desktop sizes; browser interaction covered current, hover, checked, unchecked, focus, navigation, dialogs/drawers, quick Carb log entry, counts, and the narrow drawer. No copy, icon, motion, form, loading, error, or empty-state behavior changed. No console-visible dependency or missing-route failure was tolerated by the opener.

Known limitation: verification is headless Chromium at the repository's declared viewports rather than physical-device hardware; the ticket's required 390×844 responsive regression is included and green.

## Final verification

- Backend: 1,857 passed, 1 skipped.
- Frontend dependency-free gate: 365 passed.
- ADR, owned-identifier, public-allowlist, six Python fixture/drift checks, event-comparison capture, exploration extract drift, and local screenshot-wrapper checks: all exited zero.
- Cockpit browser leg with `COCKPIT_SHOTS` enabled: 12 passed, 0 failed, 0 skipped; all ten registered stories executed; four populated 1440×900/1280×800 light/dark captures were written.
