# Scope ledger — #232 Fullscreen chart containment

Issue #232 is a bounded revision of the shipped Diagnose evidence canvas. The
reported wide/short failure is reproducible with committed synthetic data, and no
product decision remains open.

## Decisions

- **Classification: `code`; lifecycle: `revise`; review depth: `targeted`.** The
  work changes rendered behavior in the shipped Diagnose workstation. Its frozen
  contract is `mockups/finding-evidence-routing.behavior.md`, exercised by the
  workstation and event-comparison replays. `inline`
- **One session, one work order.** The change has one lifecycle-gated surface
  revision and no second slicing trait. Basal, ISF, carb-ratio, and behavioral
  comparison are one acceptance matrix rather than independently shippable work.
  `inline`
- **The fullscreen frame owns fullscreen geometry and resize lifecycle.** Chart
  adapters contribute content and chart-specific controls. `renderEventSurface`
  returns an observer-free mount record; the workstation installs and disposes
  the fullscreen observer. A still-real compatibility caller may own only its
  own outer-frame observer. `inline`
- **Keep the implementation in the existing modules.** A new fullscreen module
  is speculative for one frame owner and would not pass the deletion test. The
  expected implementation removes the event-comparison-specific sizing authority
  without adding a parallel composition. `inline`
- **The reported 2084×742 viewport is a control, not the current synthetic red
  case.** At 2084×742 the committed Carb undercount fixture fits. At 2084×450 its
  plot extends 24 px below the frame and overlaps the key by 46 px; at 2084×500
  plot/key overlap is 20 px. The regression must retain the failing wide/short
  viewport and the reported non-red viewport. `inline`
- **No real patient data is required.** Reproduction used the committed synthetic
  case file through the replay's app opener. Any served verification uses only the
  exact `--no-fetch` synthetic command declared in `AGENTS.md`. `inline`

## Risk contract

- **Must prevent:** chart furniture escaping or overlapping the shared frame;
  page or pane scrolling added only to reveal it; duplicate fullscreen sizing or
  resize authorities; loss of cohort key, selected occurrence, keyboard cursor,
  or the prior Spotlight/dock arrangement; real-data exposure; a browser run that
  silently executes zero stories.
- **Must recover:** resize, theme change, dismissal, and remount dispose the prior
  chart and observer once and leave the shared host and prior canvas arrangement
  coherent.
- **Accepted failure:** missing browser dependencies, vendored assets, fixtures,
  or the safe source stop the gate loudly; no live-data fallback is allowed.
- **Unsupported:** redesigning the narrow/mobile composition, changing comparison
  semantics, changing findings seating or dock behavior, touching analyzer/server
  logic, or reviving the retired standalone comparison route.
- **Evidence owed:** a fail-first synthetic containment assertion; one live
  descriptor from all four registered chart families at 2084×450 and 2084×742;
  all-edge containment and plot/key non-overlap; exact dismissal restoration;
  preserved event selection/key/cursor behavior; Light/Dark before-and-after
  renders; complete declared fast and affected browser gates.

Why: clipped evidence can hide the meaning of advisory dosing information even
though this UI cannot write to a pump.

Disposition: `inline`

## Open questions

None. The work order is decision-complete.

## Spawned tasks

None. The work fits one implementation session.

## Review instrumentation

- **Preflight (authoring):** verified the branch base and chart registry, traced
  the ordinary and event-comparison fullscreen mount paths, inventoried frozen
  behavior and CI owners, and reproduced geometry with committed synthetic data.
- **Plan review round 1 (authoring):** blocked because the red measurements lacked
  a rerunnable generated-fact block and resize-observer ownership was ambiguous.
  Added a session-scratch Playwright probe with byte-complete output and made the
  event renderer observer-free with caller-owned outer frames.
- **Plan review re-check:** the same GPT-5.6-Terra reviewer countersigned both
  corrections. It confirmed the probe output and the singular fullscreen
  observer/disposal contract; no files were changed by the reviewer.

