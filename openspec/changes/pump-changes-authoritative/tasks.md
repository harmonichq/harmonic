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

## 3. Basal block measurement (#506)

- [x] 3.1 A targeted basal pump change carries its wrap-aware block; its id stays slotted
- [x] 3.2 Comparison outcomes, readiness, setting history and Trial evidence read the whole block
- [x] 3.3 A basal record saved without its block is read through its own two reads, never rewritten
- [x] 3.4 Fail-first tests through `/api/verify/trials`; ADR 506 and the outcomes delta

## 4. Delivery-only basal blocks (#510)

- [x] 4.1 Group a delivery-only basal change into one Trial per contiguous changed block, wrap-aware; a change to every slot is one whole-day Trial
- [x] 4.2 Serve each Trial's block on the Trial roster
- [x] 4.3 Serve saved per-slot records of one change as one Trial, never rewritten, keeping the person's decision and the admission
- [x] 4.4 Fail-first tests through `/api/verify/trials` on QA case stores; ADR 510 and the outcomes delta
