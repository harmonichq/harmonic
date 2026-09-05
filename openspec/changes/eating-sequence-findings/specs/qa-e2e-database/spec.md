## ADDED Requirements

### Requirement: Sequence finding evidence is synthetic and reproducible

Every committed new sequence fixture SHALL be generated from manufactured events
by a committed generator with provenance and a passing CI drift check. Projection
mirrors SHALL remain parity-checked against real Python producer output. QA recipes
SHALL exercise supported, below-floor, competing and losing states without copying
research rows or changing the existing QA resource budgets. The final revision SHALL
carry harness renders, before/after shipped-tile evidence and passing full fast,
drift and browser gates.

#### Scenario: Generated evidence proves the public producer
- **WHEN** synthetic generators and their drift/parity checks run
- **THEN** committed outputs match their producers and both new findings are exercised through analyzer output
- **AND** no evidence uses a hand-set verdict in place of the analyzer's floor decision

#### Scenario: Rendered verification closes the revision
- **WHEN** the final chart is reviewed at 1440x900, 1280x800 and 390x844 through the harness and shipped composition
- **THEN** the new states are inspected, inherited replay stories pass and no existing interaction is silently retired
