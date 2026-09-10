# Phone CI correction

PR #346 exposed two repeatable Linux workstation failures: a touch target detached while new window evidence repainted, and a long title squeezed its chart below the existing readability thresholds. [Failing run](https://github.com/harmonichq/harmonic/actions/runs/34018113058).

Correction `4030c510219ad09aa7a3d7a0d0e2487eca1dfbcc` lets the phone spotlight and its parent row grow with the title, preserving a 170px chart-host minimum. The touch test waits for the rendered preview hosts to have canvases before acquiring the All charts target. Actual touch gestures and all existing assertions remain.

A wider-font probe failed before the correction (153.55px host, 86px plot, 12.29px tick gap) and passed afterward (170px host, 102px plot, 14.57px tick gap). Full workstation: 60/60. Full app replay: 163/163. Affected logic: 54/54 and source-coupled extracts current. Independent coordinator regression check: 3/3. Initial unsuccessful probes remain in local scratch; they are not represented as passing runs.

Both independent Luna review axes converged, six criteria each. Standards covered public tests, locality, generated copies, scroll containment, consistency, and falsifiable readiness. Spec covered touch/window behavior, plot floors, header separation, queue charts, fullscreen/desktop preservation, and evidence. Remote CI remains the final check.

The retained `final-projection/final-390x844-root.png` was replaced with the coordinator’s post-correction render of the same synthetic projection at 390×844. All other retained images keep their earlier provenance. No new screenshot files were added.

## Fractional scroll follow-up

Linux CI passed the original touch and readability assertions after the correction, but exposed a later exact-border scroll assertion. A fractional-layout probe reproduced up to 0.421875 CSS pixels of border offset with all header content visible. Test-only correction `5dfce621d37a83dc97ca51ef0b84d1eda9fb98b6` allows one physical pixel of border rounding, requires strict content containment and nonzero scrolling, and includes measured geometry in failures. No production code changed.

Four focused tests and the complete 60-test workstation suite passed; the independent coordinator check passed. Both Luna review axes converged on all four criteria. The prior 163/163 replay remains applicable to identical production bytes. No images were added or changed in this follow-up.
