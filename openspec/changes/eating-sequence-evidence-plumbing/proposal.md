# Proposal — eating-sequence evidence plumbing

## Why

The fixed-window eating-sequence report is already served aggregate evidence, but
Diagnose has no tested frontend data contract for it. #277 projects the report into
chart-ready data without making advice, ranking it in Audit, or rendering a surface.
#278 will settle and build the distinct Diagnose aggregate-evidence section.

## What changes

- Add `fetchEatingSequences()` to the frontend data-access namespace for
  `GET /api/diagnose/eating-sequences`, with no browser-owned window parameter.
- Pin fresh-response age handling: no `input_data_age` returns the payload unchanged
  and clears only that shape's recorded age.
- Add the Vue-free `frontend/diagnose-eating-sequences.js` adapter and Node tests.
  It field-for-field reshapes the per-scope quintile trajectory, evening-versus-
  pooled high-carb comparison, and matched-carb repeat-eating matrix.
- Add frozen route answers in browser suites that load Diagnose inputs.
- Add the non-advisory aggregate-evidence boundary to the surfaces specification.

## Risk contract

Must prevent frontend re-derivation of a served verdict, median, difference, or
status; an insufficient cell becoming a value; secret exposure; and real data.
The adapter only renames, groups, and selects served fields. It keeps insufficient
cells as `null` plus served status, and passes detector `status`, `finding`, and
`exclusions` through verbatim.

Recovery: none automatic. Accepted failure: none new. Unsupported: rendering (#278).
Evidence owed: adapter tests on the frozen fixture and all-insufficient skeleton; a
fetch-helper route-name test; and CI browser legs proving route answers load.

## Boundaries

No analyzer, API route, findings projection, safety, Plan, Priority, fixture, or
generator change. No rendered component, chart registration, harness story, or UI
lock. Browser suites are `*.browser.test.mjs`, outside this lock's fast-gate
verification; CI runs their Chromium legs on the pull request.
