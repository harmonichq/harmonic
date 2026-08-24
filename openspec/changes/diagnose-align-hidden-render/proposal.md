# Diagnose header hides inert ALIGN control (#95)

## Why

The initial Diagnose frame painted an ALIGN label and empty control despite its hidden state.

## What changes

- Keep hidden instrument groups out of rendered layout.
- Replay and record the initial-frame behavior with paired synthetic evidence.
