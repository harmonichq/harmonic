## 1. Engine

- [x] 1.1 Read every active-profile switch and in-place edit of the active profile from consecutive settings reads
- [x] 1.2 One targeted Trial per changed block for a one-setting change; one whole-profile Trial otherwise; no Plan required
- [x] 1.3 Corroborate dose and delivery observations from the earlier read, inside the changed block only
- [x] 1.4 Never record a change twice when a retained record holds it under the delivery dating
- [x] 1.5 Walk-back closes both sides for edits as well as switches

## 2. Tests and records

- [x] 2.1 Fail-first tests through `/api/verify/trials` on stores built from settings reads
- [x] 2.2 Revise the #581 and Plan-confirmation tests whose premises the decision reverses
- [x] 2.3 ADR 500 in `design.md`; spec deltas for outcomes and plan
