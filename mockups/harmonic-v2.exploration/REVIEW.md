# Concept round 1 — rendered review

2026-09-06. Unlocked synthetic concepts for #348. The direction choice is Q11;
no concept is approved yet. This record describes observed prototype behavior,
not a production or full-loop release pass.

## Comparison

| Concept | Design bet | Parent judgment |
| --- | --- | --- |
| Guided brief | A concise next step leads; evidence opens in the same context | Recommended for the stated prioritization problem. The next step is clearest on desktop. The selected design still needs a tighter narrow layout and a useful chart view after opening the evidence |
| Glucose first | A shipped trace and selectable moments anchor investigation | The evidence is immediately visible. Its long captured window and chart-first height defer the next-step guidance, especially at narrow width |
| Change journal | Current progress, original context, and an ending form one account | Strongest continuity for follow-up and history; its extra structure is heavier for a first decision |

Open `mockups/harmonic-v2-review.html` through the repository-root HTTP server
to compare the directions and states. The comparison wrapper and scenario bar
are design controls, not proposed app navigation.

## Observed checks

The existing Drive Local Webapp command interface rendered all three concepts
in investigation, active, ready, history, quiet, and error states. Desktop was
1280 × 720. Narrow checks used a same-origin iframe with an actual 390 × 624
viewport. Images were inspected, not merely written. Screenshots remain outside
the repository in session scratch, as the skill requires.

All final rendered states had no browser console errors, horizontal overflow,
or unresolved `undefined`/`NaN` copy. A journal live-region positioning defect
created blank root scrolling beyond the fixed shell; the worker bounded that
region, and the rerender verified root height equals viewport height. The
comparison wrapper was also sized to keep the narrow frame within the visible
browser area.

For each concept the browser performed episode and step selection, followed an
occurrence into Day and returned, recorded a set-aside reason, recorded a
conclusion and finished, left and reopened Changes with the conclusion retained,
and retried the illustrative failed read. These exercised actual prototype
controls. The glucose concept's first scripted native-select keystrokes left its
conclusion empty; an explicit selection with a change event then enabled Finish
and the ending survived navigation. This is not a completed keyboard audit.

The episode charts call the shipped renderer on the generated scenario window.
The first inferred step's existing treatment-timing advice is not promoted by
the prototype: explanatory copy retains the uncertainty and offers investigation.
The late-bolus case remains thin. Trial progress, comparison values, periods,
and denominators come from the separate generated Verify examples.

## Limits and next gate

This round compares hierarchy. It does not yet implement continuous supported
setting or habit choice, Plan/manual entry/reconciliation, all Focus states,
meaningful return of set-aside advice, a complete direct-Day trace, real durable
writes, or the entire utility surface. Synthetic original decisions are not
invented where the capture has none. New ending interactions are held in memory.

After Q11 selects the direction, develop the complete required journeys in that
concept, tighten narrow layouts and chart presentation, inventory predecessor
interactions, and obtain the finalist persona/craft review. Independent plan
review and Connor's final direction approval remain later gates. No visual lock,
execution admission, or v1 retirement is implied by this first comparison.
