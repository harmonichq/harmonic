# Issue 93 — Graphs and alignment

Cold exploratory QA pass against the live Diagnose surface. Observations are
limited to interaction, chart comprehension, and visible UI state. No personal
health values, dates, times, counts, settings, recommendations, payloads, or
screenshots are recorded here.

## Interaction stories

1. **Pooled landing graph — clean path**

   Starting state: Diagnose opened on its default pooled landing view.

   Actions: Read the chart title, target-band label, visible legend, axis labels,
   alignment control, findings rail, and basal-status summary.

   Observation: The landing graph presents the glucose distribution, central
   trace, meal-bolus marks, target band, and basal-status context in one stable
   desktop layout. The visible labels make the chart's primary task legible
   without opening a finding.

   Expected user-facing behavior: A user should be able to identify what is
   pooled, how the chart is aligned, and what the marks represent from the
   landing view.

   Result: Pass. The primary reading path was understandable.

2. **Window alignment controls — clean path**

   Starting state: Pooled landing graph in its default window.

   Actions: Select the visible morning window, then select the afternoon,
   evening, overnight, and full-day controls one at a time.

   Observation: The selected control is visibly marked, the chart selection
   changes, and the findings rail refreshes with the selected window. No stale
   prior-window heading remained visible after the changes.

   Expected user-facing behavior: Changing the window should visibly change the
   graph and its findings context together.

   Result: Pass. The control and chart context stayed aligned.

3. **Basal case file — clean path**

   Starting state: Pooled landing graph with a visible basal finding.

   Actions: Open the basal finding, inspect the selected graph region, read the
   result summary labels, then return through the visible
   findings breadcrumb.

   Observation: The graph marks the selected basal region and the case file
   explains the evidence in a compact right rail. The case-file heading and
   selected graph region agree. The return path restores the findings view.

   Expected user-facing behavior: Opening a basal finding should preserve the
   relationship between the selected graph region and the case-file evidence.

   Result: Pass. Selection and case-file context agreed.

4. **Meal-event case file, By clock — clean path**

   Starting state: Findings list with a meal-related event finding available.

   Actions: Open the finding and leave the alignment control on By clock.

   Observation: The chart shows the pooled glucose context with an event
   landing strip, occurrence marks, a compact outcome summary, and a visible
   legend. The case-file rail explains the event's relationship to the basal
   and I:C views through labeled links.

   Expected user-facing behavior: By-clock mode should make the event's
   time-of-day landing pattern readable and keep the linked context explicit.

   Result: Pass. The chart supported the requested time-of-day reading.

5. **Meal-event case file, By event — clean path**

   Starting state: The same meal-related case file in By-clock mode.

   Actions: Select By event and read the event-centered chart, legend rows,
   cohort labels, and lower event key.

   Observation: The chart changes to an event-centered response comparison. The
   lower key names the same cohort concepts shown in the chart legend, and the
   event anchor is visible in the axis labeling.

   Expected user-facing behavior: By-event mode should make the response around
   an event readable without losing the meaning of the cohort lines.

   Result: Pass for mode switching and structural alignment.

6. **Event-chart hover readout — clean path**

   Starting state: The meal-related case file in By-event mode.

   Actions: Move the pointer over the visible event chart at several horizontal
   positions and read the transient chart readout.

   Observation: A readout appears with an event-relative position and cohort
   state text. The chart also states when episodes are shown individually,
   which helps distinguish the hover readout from the aggregate legend.

   Expected user-facing behavior: Hovering a plotted region should identify the
   event-relative position and the visible state without requiring inference
   from line color alone.

   Result: Pass. The readout appeared and included text labels.

7. **Second event chart comparison — clean path**

   Starting state: Findings list with a correction-related event finding.

   Actions: Open it, inspect By-clock mode, switch to By-event mode, and read
   every cohort row including rows with no usable episodes to draw.

   Observation: The event chart keeps the same cohort-item structure as the
   meal-related chart. Empty cohort rows explicitly say that there are no
   usable episodes to draw rather than presenting a blank unexplained region.

   Expected user-facing behavior: Comparable event charts should retain a
   stable cohort vocabulary and explain empty rows.

   Result: Pass. The cohort item set was stable across this comparison.

8. **Additional event chart comparison — clean path**

   Starting state: Findings list with a separate meal-related event finding.

   Actions: Open it, switch to By-event mode, and compare the chart legend,
   lower key, occurrence list, and findings summary with the prior event charts.

   Observation: The same cohort labels recur, while the evidence-state words
   vary with the case data. The occurrence list remains visibly tied to the
   selected finding and the event chart remains in the same structural place.

   Expected user-facing behavior: A user should be able to compare event charts
   without relearning where the cohort and occurrence explanations live.

   Result: Pass for structural consistency.

9. **Return and selection persistence — clean path**

   Starting state: Findings list after selecting a non-default window.

   Actions: Open an event finding, switch to By-event mode, activate the
   visible Findings breadcrumb, and inspect the selected-window and alignment
   states after returning.

   Observation: The selected window remains marked and the By-event control
   remains marked after returning to the findings list. The refreshed graph and
   findings context use the selected window.

   Expected user-facing behavior: Returning from a case file should preserve
   the user's graph context so the next finding is interpreted in the same
   frame.

   Result: Pass. Window and alignment selection persisted together.

10. **Loading and empty-gate path — clean path**

    Starting state: Fresh browser session before the synthetic token was
    entered.

    Actions: Open Diagnose, observe the gated state, enter the authorized
    synthetic session token through Settings, save it, return to Diagnose, and
    wait for the graph.

    Observation: The gated state names the missing prerequisite and provides a
    visible Settings path. After the token entry, the pooled graph and findings
    surface render without console errors.

    Expected user-facing behavior: A blocked data surface should state its
    prerequisite, provide a path to resolve it, and then show the graph after
    the prerequisite is satisfied.

    Result: Pass. The transition from gated to loaded was understandable.

11. **Narrow viewport pooled and By-event charts**

    Starting state: Fresh authenticated browser session at a 390px-wide by
    844px-high viewport.

    Actions: Open Diagnose with the synthetic session token; inspect the pooled
    landing graph and its window controls; open a meal-related event finding;
    select By event; repeat the By-event inspection in a separate event case
    file.

    Observation: **Pooled graph — No bug observed.** The chart rendered, the
    window controls remained available, the findings rail followed the chart,
    and the page did not acquire horizontal overflow. **By-event graph — bug
    observed.** The chart rendered without horizontal page overflow, but the
    cohort labels and plotted lines occupy the same compressed area. Several
    cohort names and evidence-state labels overlap or are clipped, making the
    response comparison difficult to read at this viewport.

    Expected user-facing behavior: A narrow viewport should preserve a readable
    pooled graph and a readable By-event cohort comparison, with labels and
    plotted evidence remaining distinguishable.

    Reproducibility: Reproduced independently in separate event case files at
    the same narrow viewport. The overlap and clipping recurred in both
    By-event charts.

    UI section: Diagnose → event case file → By-event response comparison at a
    narrow viewport.

    Severity: P2 — the event chart remains present, but the primary comparison
    task is materially impaired on a narrow screen.

    Stable fingerprint: `diagnose.event-comparison.narrow-cohort-overlap`

    Interpretation: The pooled surface remains usable at this width, and the
    defect is specific to the denser By-event chart composition. The task impact
    is loss of readable cohort identity and evidence state, not loss of the
    chart container or navigation.

## Finding

### F1 — Event cohort evidence states are not self-explanatory

- **Starting state:** An event case file is open in By-event mode, with the
  response-comparison chart and its legend visible.
- **Exact actions:** Open the meal-related event finding; select By event; read
  the legend and lower key; repeat the same sequence for separate correction-
  and meal-related event findings.
- **Observation:** The chart consistently presents rows such as “claimed by
  another factor” and “not comparable,” but the adjacent states “limited,”
  “withheld,” and “withheld points” do not say what the user can conclude from
  them. The hover readout adds “episodes shown individually,” yet the aggregate
  state and point-level state remain visually adjacent without a plain-language
  relationship. In the comparison charts, an empty cohort is explained, but a
  non-empty limited/withheld cohort still requires interpretation.
- **Expected user-facing behavior:** A user should be able to tell whether a
  cohort line is usable for the current event comparison and what the visible
  evidence state means for reading that line, using the chart's own labels.
- **Reproducibility:** Reproduced independently across separate event case
  files. The same comprehension gap recurs across the By-event chart
  interactions and the corresponding lower keys.
- **UI section:** Diagnose → event case file → By-event response comparison;
  chart legend, hover readout, and lower cohort key.
- **Severity:** P2 — the chart remains operable, but the evidence comparison is
  difficult to interpret reliably.
- **Stable fingerprint:** `diagnose.event-comparison.cohort-state-opaque`
- **Interpretation:** The cohort-line structure is consistent across the tested
  event charts, so the issue is not missing or drifting cohort items. The task
  impact comes from the status vocabulary and the relationship between
  aggregate withheld state and limited/withheld points remaining implicit.

## YOLO feature vote

**Vote:** A chart-side “read this comparison” interaction that turns the
currently selected cohort and hover position into one short, plain-language
sentence.

**Why:** The charts already expose the event-relative position, cohort name,
and evidence state. A user-visible interpretation sentence would make the
comparison legible at the moment of reading without leaving the chart.

**Interaction story:** Open an event case file, select By event, focus one
cohort line, and read a nearby sentence that identifies the event-relative
position, cohort, and whether that plotted evidence is usable or limited for
this comparison.
