# V2 findings ledger design

This change is in triage. No execution lock or implementation admission exists yet.

## ADR 404 — Retain expiry and record a late conclusion separately

### Decision

Keep the existing 28-day Trial expiry. Changes makes the expired Trial prominent and keeps its record reachable. Allow the reader to record a separately dated late conclusion. Preserve the original ending kind, effective time and saved ending assessment; a late conclusion is an addition to the record, not a replacement ending or a resumed watch. Existing admission of another watch remains governed by the recorded expiry.

### Authority

Connor Griffin, 2026-09-10 local time, answered triage Q1: “Keep the expiry; surface the record and allow a late conclusion (Recommended).” The question explicitly proposed a separately dated late conclusion and contrasted it with retaining an active watch beyond 28 days.

### Consequences

The reader can understand why a watch ended and record their conclusion later. The implementation must keep the original ending distinguishable from the later statement. This decision does not reopen already expired records as active, change the maturity rule, rewrite prior assessments, or operate the pump. The late-conclusion operation and placement in Changes remain to be specified and reviewed within this change.
