# Design — ic-dose-stamped-anchor

## ADR 20 — The I:C anchor is dose-stamped for measurement, currently-programmed for assertion

**Ruling.** Carb-ratio meal runs pool by the ratio their doses were actually given under
(dose-stamped regimes), each regime estimated against its own ratio. Assertion authority is
unchanged: only the currently-programmed regime's pool, passing the existing five-condition
`ic_asserts_move` predicate, can assert a move. Other numeric regimes are information-only
findings.

**Consequences.**
- Measurement survives reprogramming: a retired regime's evidence remains visible as
  information instead of being discarded (issue #10's starvation is resolved as an
  information-recovery problem, not by weakening the gate).
- The assert path is byte-identical to today's predicate; the change is additive and
  withhold-only by construction.
- Any sweep, gate, or surface reads the engine's `IcBlock.asserts_move` and eligibility
  dict; re-deriving eligibility conditions is a defect (first prototype pass produced 3
  false asserts that way).
- Regime identity is `(block schedule membership, dose-stamped ratio)` as of dose time;
  runs spanning a reprogramming are dropped.

Decision: harmonichq/harmonic#20 (map #19), 2026-08-18. Evidence: weekly 77-cell sweep on
real history — status quo 13 measurable / 0 asserts (reproduces #10); option C 20
measurable / 0 asserts / +7 information-only findings.
