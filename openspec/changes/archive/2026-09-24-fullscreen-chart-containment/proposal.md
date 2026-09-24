# Centralize Diagnose fullscreen chart containment (#232)

## Why

Diagnose fullscreen charts do not share one complete containment contract.
Ordinary evidence charts mount through the workstation's ECharts path, while the
behavioral response comparison adds a nested surface with independent minimum
heights and resize observation. In a wide, short viewport those minimums can make
the plot escape the fullscreen frame or overlap its cohort key.

The comparison is advisory evidence. Clipping or overlapping its axes, traces, or
key can obscure how the wearer should interpret a recommendation.

## What changes

- Give all four registered evidence-chart families one workstation-owned
  fullscreen geometry, overflow, resize, and disposal contract.
- Make the event-comparison renderer return an observer-free mount record and
  remove its fullscreen-specific sizing authority.
- Add browser coverage for basal, ISF, carb-ratio, and behavioral comparison at a
  synthetic wide/short red viewport and a normal desktop control viewport.
- Preserve the event comparison's cohort key, selected occurrence, selected trace,
  accessible label, and keyboard cursor, plus exact Spotlight/dock restoration.
- Amend the frozen behavior ledger and surface ledger, and capture synthetic
  Light/Dark before-and-after evidence.

## Risk contract

- **Must prevent:** escaped or overlapping chart furniture; duplicate fullscreen
  geometry or resize owners; scroll added only to reveal chart furniture; state
  loss on dismissal; silent browser skips; any use of patient data.
- **Must recover:** resize, theme, dismissal, and remount dispose prior resources
  once and restore the prior canvas arrangement.
- **Accepted failure:** absent browser dependencies, fixtures, vendored assets, or
  safe app source fail loudly.
- **Unsupported:** mobile redesign, comparison-semantic changes, findings seating,
  dock changes, analyzer/server work, or restoration of the retired standalone
  route.
- **Evidence owed:** fail-first containment, a four-family/two-viewport matrix,
  all-edge and non-overlap assertions, exact restoration, preserved comparison
  interaction, synthetic Light/Dark renders, and the complete declared gates.

Disposition: inline, unchanged from the reviewed work order.

## Impact

The change is confined to the Diagnose frontend, its browser contracts, frozen
behavior record, surface ledger, and this OpenSpec record. It changes no API,
stored data, analyzer, recommendation, safety predicate, staging verdict, or pump
setting.

