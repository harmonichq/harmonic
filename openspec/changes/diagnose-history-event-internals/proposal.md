# Proposal — Diagnose history event labels

## Why

The past carb-ratio event view exposes an internal analysis token and prints
meal offsets at raw precision, collapsing the run date and making the evidence
roster hard to read.

## What changes

- Remove the rendered analysis token from this history mode.
- Round meal offsets to whole minutes and print their unit once per run.
- Stack each run's date above its complete offsets line at every viewport.
- Freeze the fractional-offset behavior in the shipped-surface replay.

## Boundaries

The event projection, its full-precision offsets, history identity, staging
verdicts, and the eventual home of past settings do not change.
