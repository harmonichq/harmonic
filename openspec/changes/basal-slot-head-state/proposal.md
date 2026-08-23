# Proposal — basal slot case-file head state

## Why

A basal slot that cannot stage can be held, have too little evidence, or have no data. Its case-file head previously labelled all three as insufficient evidence, contradicting the lane and the slot's own explanation.

## What changes

- Read a non-asserting basal case-file head from the existing verdict vocabulary.
- Keep stageability, recommendation, and asserting-slot wording unchanged.

## Boundaries

This change does not alter basal analysis, safety predicates, lane construction, the findings queue, or asserting slot heads.
