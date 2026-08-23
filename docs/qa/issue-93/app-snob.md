# Issue 93 — App-snob cold QA

## Scope and boundary

Diagnose only. The authorized synthetic browser token was used solely to establish
client state. No dosing, plan, credential, fetch, carb-log, verification, or other
product-data action was activated. No personal data, recommendations, payloads,
database details, or captures are recorded here.

## Read-only stories exercised

1. Opened the app and reached Diagnose through the visible Diagnose control.
2. Established the authorized synthetic browser state through Settings and returned
   to Diagnose without touching any vendor or product-data control.
3. Loaded the supplied direct Diagnose link after that setup and checked for the
   populated Diagnose workstation.
4. Repeated the same direct-link path in a fresh browser context after the same
   synthetic setup.
5. Used the Overnight clock-window control.
6. Used the Morning clock-window control.
7. Used the Afternoon clock-window control.
8. Used the Evening clock-window control.
9. Used the all-day clock-window control.
10. Opened a populated basal-slot case file through its accessible verdict control.
11. Dismissed that read-only case-file path with Escape and continued keyboard
    navigation; focus remained visible.
12. Checked the desktop narrow-zoom path for horizontal overflow. The bundled
    driver could not change its layout viewport, so this is not a substitute for a
    true narrow-viewport verdict.

The light/dark switch was not exposed from the populated Diagnose workstation in
this driver pass. No theme finding is asserted from that absence alone.

## Reproduced Diagnose defects

None.

## Discarded route candidate

`diagnose-direct-link-does-not-initialize-workstation` is discarded as a
harness/cold-load artifact, not a product defect. A fresh context with the
authorized synthetic client state loaded the exact supplied direct link and,
after the populated state settled, visibly exposed the Diagnose clock-window and
basal-verdict controls at `#diagnose`, with no loading message. The in-app
Diagnose control reached the same populated controls at `#/diagnose`.

The earlier short fixed-wait observation therefore did not establish a stable
failure. This recheck agrees with the independent lanes: both route forms reach
the populated Diagnose workstation once its load has settled.

## Taste versus defects

No additional presentation critique is promoted as a defect. The instrument-like
hierarchy, density, case-file affordances, trace anatomy, and chart composition
need captured visual comparison to support an app-snob judgment, and captures are
outside this pass's privacy boundary. Preference alone is not being represented as
a product defect.

## Diagnose-only YOLO feature vote

**Desired capability:** A read-only review trail for the case files opened during
the current Diagnose session.

**Why:** Diagnose is an evidence review. A temporary trail would let a user return
to inspected evidence without confusing review progress with a pump change.

**User-visible interaction story:** The user opens one case file, reads its
evidence, returns to Diagnose, and opens another. A compact local trail marks the
opened case files and returns to either one while preserving the active clock
window. Clearing the trail ends that review session.
