## UI-craft rendered audit — ticket 341

No lock manifest was present, so this is a shipped-surface rendered audit against `DESIGN.md`, `CONTEXT.md`, and the attached frozen screenshots. I inspected all 23 images across desktop, tablet, phone, wide, short, catalog, drill, return, and fullscreen states.

### Anti-pattern verdict

Pass. The surface reads as a deliberate clinical instrument: restrained palette, no gradients, no wellness/gamification treatment, no hero-KPI dashboard, and consistent evidence-first hierarchy.

### Health score

| Dimension | Score | Finding |
|---|---:|---|
| Accessibility | 2/4 | Good labeling structure, but mobile readability and 20px chart controls remain problematic |
| Performance | 3/4 | No visible performance defect in captures |
| Theming | 3/4 | Mostly token-derived; several direct shadow/color mixes remain |
| Responsive design | 1/4 | Phone and 760px captures contain clipped or missing chart content |
| Anti-patterns | 4/4 | Intentional, product-specific visual language |
| **Total** | **13/20** | **Acceptable — significant responsive work remains** |

### Findings

#### [P1] Narrow All charts catalog is clipped and effectively unusable

- **Screenshots:** `revision-projection-390x844-all-charts.png`, `revision-projection-390x844-selected-fullscreen.png`
- **Location:** `frontend/diagnose-workstation.css:599-606`, mobile rules at `:1676-1720`
- **Category:** Responsive / Accessibility
- **Impact:** At 390px, the first catalog card extends beyond the viewport, the next card is only partially visible, and the chart surface cannot be compared or reliably operated. Zero page overflow is not sufficient here; the chart itself is unreadable.
- **Source evidence:** The catalog retains `minmax(420px, 1fr)` and the mobile rules target direct `.tile-field > .evidence-tile` children, while the rendered tiles are nested under `.tile-focal` / `.tile-row` (`diagnose-workstation.js:138-142`).
- **Recommendation:** Resume the worker with an explicit mobile catalog layout: one readable card per viewport, correct nested selectors, vertical scrolling, and no horizontal clipping.

#### [P1] Phone fullscreen state displays no usable chart

- **Screenshots:** `revision-projection-390x844-selected-fullscreen.png`; related phone returns `revision-projection-390x844-fullscreen-return.png`, `revision-projection-390x844-drill-return.png`
- **Location:** `frontend/diagnose-workstation.css:581-587`, `:1713-1720`
- **Category:** Responsive / Task completion
- **Impact:** The fullscreen header and `Close` control are visible, but the selected chart content is absent. A user can enter the state and return, but cannot inspect the evidence.
- **Caveat:** The screenshot proves the missing visible content, not the underlying rendering cause. Current source contains uncommitted worker edits, so this must be re-rendered before claiming resolution.

#### [P1] The 760px tablet root loses the primary evidence chart

- **Screenshot:** `revision-projection-760x900-root.png`
- **Location:** `frontend/diagnose-workstation.css:305-329`, `:1676-1720`
- **Category:** Responsive
- **Impact:** Only the spotlight nameplate/state strip is visible; the evidence plot is missing or clipped before the overview and Findings pane. The primary Diagnose evidence is therefore unavailable at a common tablet width.
- **Recommendation:** Establish an explicit tablet height budget for the nested focal tile and verify the chart canvas after the inspector stacks below it.

#### [P2] Findings tier/readout wrapping destroys the row grammar on phone

- **Screenshots:** `revision-projection-390x844-root.png`, `revision-projection-390x844-drill-return.png`, `revision-projection-390x844-all-charts-dismissed.png`
- **Location:** Findings queue layout in `frontend/diagnose-workstation.css`, especially the narrow `.qrow` rules around the mobile block.
- **Category:** Responsive / Typography
- **Impact:** “Next in line” and the finding description collapse into an ambiguous vertical sequence, including isolated words such as “in” and “line.” The rank, finding, and explanation no longer scan as separate fields.
- **Recommendation:** Give the tier label its own non-wrapping or bounded column and let only the description wrap beneath the finding title.

#### [P2] Findings previews are too small to carry evidence meaningfully

- **Screenshots:** `revision-projection-1440x900-root.png`, `revision-projection-1440x900-drill-return.png`, `revision-projection-1440x900-all-charts-dismissed.png`, `revision-projection-2084x742-root.png`
- **Category:** Responsive / Information hierarchy
- **Impact:** The queue previews are narrow miniatures with little readable axis or shape detail. They function as decoration/location markers rather than useful evidence previews, especially beside wrapped text.
- **Recommendation:** Either increase the preview floor or simplify it into a clearly labeled thumbnail treatment. Preserve enough width to distinguish chart type and state.

#### [P2] Chart rail controls do not meet the touch-target floor

- **Location:** `frontend/diagnose-workstation.css:860-869`
- **Category:** Accessibility
- **Impact:** Tile rail buttons are defined at 20×20px. The screenshots do not prove tap failure, but this is below the project’s 44px mobile touch-target requirement and is especially risky in All charts.
- **Recommendation:** Keep the visible glyph small while expanding the interactive hit area to at least 44px on touch/narrow layouts.

#### [P3] Short desktop height compresses the overview plot

- **Screenshots:** `revision-projection-1024x768-root.png`, `revision-projection-1024x768-drill-return.png`
- **Category:** Responsive / Polish
- **Impact:** The 1024×768 composition remains usable, but the glucose overview is compressed enough that its plot and legend become secondary to the large evidence chart.
- **Recommendation:** Recheck the height allocation after fixing tablet/mobile behavior; preserve a minimum readable overview plot without moving the global window controls.

### What is working

- Desktop root, drill, return, All charts, and fullscreen states are coherent at 1440×900 and 2084×742.
- Global window selection remains in the page-level instrument rail.
- Overview-specific title/readout/legend stays with the overview below the spotlight.
- Fullscreen retains its own header and visible `Close` action in desktop and phone captures.
- All charts correctly exposes a selected/current chart mark in the desktop captures.
- The visual system follows Harmonic’s restrained dark clinical language and avoids the prohibited dashboard patterns.

### Capture versus current source

The worktree has active uncommitted changes, including `diagnose-workstation.css`, `diagnose-workstation.js`, and browser replay files. I treated the screenshots as frozen evidence and did not assume those edits were present when the images were captured. The current source still contains the responsive selector/layout seams cited above, so none of these findings should be considered resolved until re-rendered.

### Resume actions

1. `/ui-craft revise`: fix the 390px and 760px canvas/catalog/fullscreen layouts and rerender every affected state.
2. `/ui-craft revise`: restore a stable Findings row grammar and improve preview sizing.
3. `/ui-craft polish`: verify touch targets, focus visibility, Close/return discoverability, and global window-control placement through actual interaction.
4. Re-run `/ui-craft audit`.

Verdict: desktop composition is close, but the revision is not ready to pass. The phone and tablet evidence surfaces contain P1 task-blocking defects.
