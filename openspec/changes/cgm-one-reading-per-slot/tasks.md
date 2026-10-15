## 1. Reader

- [x] 1.1 Collapse readings chained under two minutes into one slot in `Store.cgm_readings`
- [x] 1.2 Agreeing slot keeps its value; disagreeing slot carries none
- [x] 1.3 Ranged reads look across their edges and agree with the whole read

## 2. Tests and records

- [x] 2.1 Fail-first store tests on synthetic pair shapes (same reading twice, two disagreeing series, range edges, untouched cadence)
- [x] 2.2 ADR 519 in `design.md`; data-ingest spec delta; AGENTS.md data fact
