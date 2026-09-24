# Proposal — event-chart discovery

## Why

Diagnose already has event-aligned evidence for six behavioral Findings, but the
only way to discover it is to open Findings one at a time and notice that the
`By event` alignment appears. Readers cannot ask the queue which Findings have
an event chart, and the separate Sift and Align instruments consume scarce
horizontal space without reflecting whether the reader is browsing or inside a
case file.

## What changes

- Replace the rendered `Inspector` title and separate breadcrumb row with a pane
  header that carries the Findings breadcrumb, its existing metadata, and the
  root-only Filter control.
- Move the existing Highs, Lows, Meals, and Corrections Sift choices into one
  Filter menu beside a new `All findings` / `Event charts` view choice.
- Publish event-chart coordinates on compatible Finding rows only when their
  canonical event family is present in the current server projection. The
  browser filters only on that published value and no longer infers eligibility
  from a title.
- Open a row selected from `Event charts` directly in `By event`, while keeping
  the existing case-file-only `By clock` / `By event` Align control.
- Return from the case file to the pooled clock chart and the unchanged queue
  browsing state.

## Boundaries

This change does not design or build the broader Explore mode, add event charts
to setting details, create new chart types, change event-comparison cohorts or
membership, change Finding ranking, alter analyzer or staging verdicts, or make
Align available at the queue root. Existing Finding rows keep their content and
whole-row drill behavior.

## Evidence

This is a `/ui-craft` revision of the shipped Diagnose workstation. Its frozen
contract is `mockups/finding-evidence-routing.behavior.md`, replayed against the
built app by `frontend/diagnose-workstation-behavior.replay.mjs`. The accepted
wireframe was made against the real synthetic app and settles layout and
interaction intent only; production styling comes from the application's token
and component system.
