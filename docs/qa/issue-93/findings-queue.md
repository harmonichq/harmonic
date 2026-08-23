# Issue #93 cold QA — Findings queue and membership

## Scope and boundary

Cold live pass against `http://127.0.0.1:8766/#diagnose` using the bundled persistent Chromium driver. The pass stayed value-free: no personal health values, dates, times, counts, recommendations, API payloads, database paths, credentials, or screenshots are recorded.

The queue was reached after entering a non-secret test token through the visible Settings control. The token itself is not recorded.

## Interaction stories

1. **Direct hash entry and initial queue load**

   - Observation: The direct Diagnose hash opened the shell. After the visible token gate was completed, the Findings queue populated with setting and habit rows. The queue, Filter control, Sift controls, and trial/watch area were visible.
   - Interpretation: No bug observed.

2. **Open Filter and apply a Sift category**

   - Observation: Filter opened a popover containing Highs, Lows, Meals, Corrections, All findings, and Event charts. Selecting a Sift category closed the popover state only after the resulting queue was loaded, showed an active-filter indicator, and reduced the displayed membership to the selected category.
   - Interpretation: No bug observed. The displayed findings respected the active filter.

3. **Change from one Sift category to another**

   - Observation: With a category active, opening Filter and selecting a different category replaced the active category. The queue refreshed and displayed the corresponding subset rather than retaining the prior subset.
   - Interpretation: No bug observed.

4. **Change the clock window with an active filter**

   - Observation: A clock-window control was selected while a Sift category was active. The queue briefly showed its loading state, then refreshed for the selected window. The active-filter indicator remained present and the resulting rows respected both the selected window and filter.
   - Interpretation: No bug observed.

5. **All findings and Event charts views**

   - Observation: Filter’s All findings view restored the full queue for the current window. Event charts opened a rendered chart surface and displayed the event-oriented queue view. Returning to All findings restored the ordinary queue view.
   - Interpretation: No bug observed. The view switch did not leave an empty or stale queue.

6. **Queue-to-case-file selection**

   - Observation: Selecting a visible habit finding opened its case file. The case file showed the selected finding, its current clock-window context, evidence sections, and links to related setting or segment context where present.
   - Interpretation: No bug observed. Queue membership led to the matching case file.

7. **Back restoration from a case file**

   - Observation: Selecting the case file’s Findings control returned to the queue. The previously selected clock window and active filter context were retained, and the queue remained populated.
   - Interpretation: No bug observed.

8. **Watching/history rows**

   - Observation: Expanding the Watching row revealed watched setting and habit history rows, including a past-setting entry. The queue remained usable and the trial/watch area stayed visible.
   - Interpretation: No bug observed.

9. **Direct hash re-entry and reload**

   - Observation: Re-entering the direct Diagnose hash restored the default queue state. Reloading that hash restored the same populated queue without a console error. The Findings queue and its controls were available after reload.
   - Interpretation: No bug observed.

## Product findings

No suspected product bug met the reporting threshold. No product behavior was reported as a bug without two live reproductions.

## Discarded non-product observation

### Rejected harness artifact — evidence loading state

During the earlier pass, the evidence request remained in a loading state after a server error. Verification established that the QA harness had generated the wrong Fernet companion key. After the snapshot’s matching key was installed, the same live lane reached the populated queue. This observation is discarded from the product bug count and is not a Harmonic finding.

## Operator hypothesis checks

### 1. Initial Diagnose Align control

- **Story:** Open the direct `#/diagnose` route from a fresh browser session, wait for the initial Diagnose surface, and pointer-select the visible Align affordance. Repeat from a second fresh direct open.
- **Observation:** Align is visibly presented in the initial header as an interactive-looking control, but it has no selectable option. Pointer selection produces no visible state change and does not expose an alignment choice. The same result occurred on the independent repeat.
- **Expected user-facing behavior:** A visible interactive-looking Align control should accept selection and show the selected alignment state. If no alignment choice is available, the surface should not present the control as interactive.
- **Result:** Reproduced bug.
- **Reproducibility:** Reproduced on two independent direct Diagnose opens.
- **UI section:** Diagnose header → Align.
- **Provisional severity:** P2 — a secondary chart-orientation control is visibly inert while the primary Findings queue remains usable.
- **Stable fingerprint:** `initial-diagnose-align-affordance-inert`

### 2. “Meal bolus fell short” and active event/clock-window filtering

- **Story:** From the populated queue, move between clock-window selections, observe the finding named “Meal bolus fell short,” then open Event charts and change the clock window again. Repeat the window transitions from a fresh direct Diagnose open.
- **Observation:** The finding appears in eligible populated windows, disappears from an ineligible overnight window, and returns when moving back to an eligible window. Event charts did not leave a stale copy behind when the selected window changed.
- **Expected user-facing behavior:** A finding should appear only when it belongs to the active event or clock-window context.
- **Result:** Not observed. The finding respected the tested active window context; no product bug was reproduced.
- **Reproducibility:** The same inclusion and exclusion pattern was observed across two transition sequences.
- **UI section:** Diagnose → Findings queue → Sift/Event charts and clock-window controls.

### 3. Past Carb ratio recommendations in the current Findings viewer

- **Story:** Open the current Findings viewer, expand the Watching/history rows, and open the visible past Carb ratio entry.
- **Observation:** Past Carb ratio entries are visible from the current viewer, but they are placed under Watching/history and carry explicit past-setting status labeling. The opened detail also preserves the past-status treatment rather than presenting the entry as a current recommendation.
- **Expected user-facing behavior:** Historical Carb ratio entries may remain discoverable, but they should be unmistakably historical and not look like current Findings recommendations.
- **Result:** Not observed. No misleading current presentation was reproduced.
- **Reproducibility:** Observed in the queue and again in the opened detail.
- **UI section:** Diagnose → Findings queue → Watching/history and finding detail.

## YOLO feature vote

### Compare two Diagnose windows side by side

I would love a Diagnose capability that lets a user pin the current Findings queue, switch to another clock window, and compare membership and evidence side by side. This matters when a pump wearer is trying to tell whether a recurring pattern is specific to one part of the day before discussing it with a clinician. User-visible story: select “Compare window,” choose another clock window, and read the two queues with the same Sift selection and matching case-file links visible together.
