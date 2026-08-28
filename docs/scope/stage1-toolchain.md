# Scope — stage-1 toolchain and pinning policy (#239)

Child of #238. Deliverable is a ruling recorded as an ADR in
`openspec/changes/adopt-frontend-build-tooling/design.md`; no harness code.

## Decisions

_(appended as each settles)_

## Open questions

- Q1 harness tool
- Q2 lockfile and version pinning policy
- Q3 CI coverage for the harness in stage 1
- Q4 Node version enforcement

### Assumed defaults (not questions)

- Package manager is npm: CI already installs Playwright with npm and pins Node 22.
- The harness proxies `/api` and `/assets` to a running `harmonic serve`, per #238.
- The harness imports shipped registry modules live, never copies (ADR 213).

## Spawned tasks

_(none yet)_
