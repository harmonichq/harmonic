# V2 findings ledger design

This change is in triage. No execution lock or implementation admission exists yet.

## ADR 404 — Retain expiry and record a late conclusion separately

### Decision

Keep the existing 28-day Trial expiry. Changes makes the expired Trial prominent and keeps its record reachable. Allow the reader to record a separately dated late conclusion. Preserve the original ending kind, effective time and saved ending assessment; a late conclusion is an addition to the record, not a replacement ending or a resumed watch. Existing admission of another watch remains governed by the recorded expiry.

### Authority

Connor Griffin, 2026-09-10 local time, answered triage Q1: “Keep the expiry; surface the record and allow a late conclusion (Recommended).” The question explicitly proposed a separately dated late conclusion and contrasted it with retaining an active watch beyond 28 days.

### Consequences

The reader can understand why a watch ended and record their conclusion later. The implementation must keep the original ending distinguishable from the later statement. This decision does not reopen already expired records as active, change the maturity rule, rewrite prior assessments, or operate the pump. The late-conclusion operation and placement in Changes remain to be specified and reviewed within this change.

## ADR 404 — Recalculate Patterns for the selected clock window

### Decision

Recalculate Pattern counts and membership in the backend for the selected named or custom clock window. Pattern rows must describe that selected scope. Keeping whole-day counts with a cropped chart is insufficient.

### Authority

Connor Griffin, 2026-09-10 local time, answered Q2: “Recalculate Pattern counts and membership for the selected window; this needs broader backend changes.”

### Consequences

The active Pattern roster, served counts, membership and chart evidence need one coherent selected-window contract. Keep existing producer ownership and explicit denominators; do not make the frontend recompute attribution or clinical policy. The remaining consequences for Pattern admission, ranking and Focus entry require grounding before the execution lock. This decision does not authorize rewriting saved historical contexts.

## Reassessment loading

Connor Griffin answered Q3: “Show named loading; compute reassessments when opened (Recommended).” Historical reassessments remain on demand. The surface immediately names the work being loaded and keeps retained/current identity clear. #404 adds no reassessment prewarming to the hourly fetch path.

## Footer and historical naming scope

Connor answered Q4: “Keep those values only in Pump settings.” Do not restore current programmed correction factor or carb ratio in the footer.

For Q5 Connor said to deal with historical Pattern naming when/if it happens. Defer Focus-title persistence and legacy title migration from this change; the report remains recorded on #404. The coordinator clarified that the current fallback can also result from a Pattern leaving current results.
