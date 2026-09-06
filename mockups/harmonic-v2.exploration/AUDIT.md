# Saved workstation audit

2026-09-06. UI Craft technical audit and persona walkthrough of Fable's saved
Glucose-first concept. Dark is the only shipped theme (DESIGN.md, ADR 304).
Desktop was 1280 × 720; narrow was an actual 390 × 624 iframe. This covers the
investigation and setting prototype, not a complete v2 release or visual lock.

## Anti-pattern verdict

Pass for the inspected states: one fixed stage and reading pane, source-derived
workstation materials, and actual evidence renderers. There is no hero-metric
row, repeated card grid, decorative gradient or promotional filler. This is an
audit observation, not Connor's design approval.

## Technical result

| Dimension | Score | Observed result and limit |
| --- | --- | --- |
| Accessibility | 3/4 | The setting view's 60 measured visible text samples had no contrast ratio below 4.5:1. Focus enters the narrow reading pane at Close and returns on Escape. Covered stage controls are now inert. The comparison accepts arrow keys and updates its accessible description. Full assistive-technology certification was not performed |
| Performance | 3/4 | The inspected transitions remained responsive and chart instances are disposed when the view changes. This is a static prototype loading manufactured inputs, not production-bundle or slow-device evidence |
| Responsive design | 3/4 | Both roots fit their viewports. The complete Plan table fits the narrow frame and the reading pane has its own scroll. Some compact controls remain below the 44-pixel touch recommendation |
| Theming | 4/4 | The inspected views use the shipped dark material. Fable corrected the basal support label's ink; the new caption spacing removes the narrow overlap |
| Anti-patterns | 4/4 | A cohesive evidence workstation with restrained chrome and retained comparison semantics in the inspected views |
| Total | 17/20 | Good within this bounded audit; unfinished product journeys still prevent a final visual lock |

## Verified corrections

Fable's last pass corrected the Plan's user-facing terms and insulin-first
correction-factor values, separated the two basal evidence rows, used the actual
review clock for a conclusion, cleared the stale re-key instruction on a match,
and removed the repeated prototype-persistence disclaimer from the product pane.

Its new half-hour control was left without a handler when the provider stopped.
The parent connected that existing control. A before probe left 03:00–03:30
selected; the repeated probe selected 03:30–04:00, showed the corresponding
roster, retained focus and kept the selection through Day and back. No layout
was redesigned.

The keyboard probe also reproduced focus moving behind the narrow reading pane.
The parent made only the covered stage inert while that pane is open. Shift-Tab
now reaches the visible Day navigation, and Escape restores the stage and its
opener. This remains a nonmodal reading pane; no new modal interaction was
invented.

## Remaining technical findings

1. **P2: compact touch controls.** The half-hour, figure and stepping controls in
   `harmonic-v2-glucose-setting.js` use the shared compact control geometry.
   Desktop measurements included 21-pixel control heights. Narrow figure and
   close controls are also below the 44-pixel touch recommendation. The final
   Fable polish pass should settle touch geometry without changing the desktop
   workstation's density. This measurement alone is not a claimed WCAG failure;
   target-spacing exceptions were not fully audited.
2. **P2: fractional-hour speech.** After ArrowRight, the shipped comparison's
   accessible description begins `+0.08333333333333333 h` before the cohort
   values. The values are available, but the time label is cumbersome to hear.
   The final pass should use a readable minute/time format through that
   renderer's supported formatting boundary. Production code was not changed.

No other technical defect is asserted from an untested state. Text zoom and a
full screen-reader walkthrough remain unverified.

## Persona walkthrough

| Perspective | Actual walk | First remaining stall |
| --- | --- | --- |
| Wearer examining a recurring meal problem | Select Other meal opportunities, inspect the selected May 28 member, enter Day, return with that member retained, set the concern aside with a reason, and reopen its evidence | The example has one investigation subject and no next supported priority. It does not establish global prioritization or meaningful return of a set-aside action |
| Wearer checking a setting change | Stage the supported action; encounter and retry a failed save; record intent; inspect mismatch and match; review the actual Trial; submit a conclusion; revisit it through Explore, Day and Changes | After finishing, the prototype retains the ending but does not choose the next supported priority. Persistence remains in page memory |
| Wearer on a narrow screen | Inspect each half-hour, open and close the reading pane by keyboard, and read the full Plan schedule | Complete direct-Day navigation and the carb/settings utilities are absent from this prototype. The Focus journey also has no rendered surface yet |

These are relevant task perspectives because no repository persona definitions
were present at the configured location. They are not an independent visual
critique panel.

## Next design gate

Resume the same Fable design lead for the Focus journey, full Day/utility access,
remaining touch and language polish, and another UI Craft audit. Then obtain
Connor's approval of exact artifacts before any visual lock. The implementation
and retirement gates in the planning proposal remain in force.

Recommended sequence: a targeted UI Craft fix for the two measured P2 findings
after the unfinished journeys are authored; `/ui-craft audit` to recheck the
finalist; `/ui-craft polish` before requesting the final visual approval.
