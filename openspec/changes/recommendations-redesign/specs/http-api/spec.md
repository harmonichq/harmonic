## ADDED Requirements

### Requirement: The day timeline serves the day's insulin split

The timeline read SHALL serve `insulin_totals` for its window, in units, with
`basal` (delivered), `meal`, `correction`, `control_iq_bolus` and `total`, where
`basal + meal + correction + control_iq_bolus` equals `total` exactly as served.
Basal SHALL count each basal row's delivered rate over the part of its duration
inside the window. `control_iq_bolus` SHALL be the delivered insulin of the
boluses the pump tagged automatic. Every other bolus SHALL be split into meal and
correction in the proportion of its recorded food and correction sizes, or, with
no recorded split, be all meal when it carries carbs and all correction when it
does not. The read SHALL also serve `basal_programmed`, the programmed rate over
the same rows, outside `total`. A row reporting no programmed rate SHALL carry
the last one reported, and `basal_programmed` SHALL be `null` when no rate is
known. A window with no basal and no delivered bolus SHALL serve `null`.

#### Scenario: A day's parts add up to its total

- **WHEN** a day holds basal rows, a meal bolus, a correction bolus, a mixed bolus
  delivered short of its request, and Control-IQ automatic boluses
- **THEN** the day serves each part from those deliveries, the mixed bolus split
  in its recorded proportion, and the four parts add up to the total exactly

#### Scenario: A suspension keeps the programmed basal

- **WHEN** Control-IQ suspends delivery and delivers below the programmed rate
- **THEN** delivered basal is below `basal_programmed`, which counts the suspended
  rows at the last programmed rate reported, and `total` holds delivered basal

#### Scenario: An empty window serves no totals

- **WHEN** the window holds no basal row and no delivered bolus
- **THEN** `insulin_totals` is `null`

## MODIFIED Requirements

### Requirement: The heavy read endpoints answer from one per-process result cache

Recomputing the analysis from the store costs tens of seconds, so the expensive
reads — the analysis result, scenarios, outcomes, the outcomes trend, the per-day
model view, the day navigator, the pattern sweep, the time-of-day evidence feed,
and the lever catalog — answer through a cache keyed by endpoint name plus the parameters that change the
answer. Finding case-file preparation is cached once per data version and projects
each request's coordinates from that prepared source. Caching is opt-in per
endpoint: the cheap store reads (status, timeline, pump settings, carb entries,
prompts, the Plan draft and its history, Focus) read the store directly on every
request and are never cached.

The cache instance belongs to the app, not to the module, so two apps built in one
process (as tests do) never share state. It is bounded by a least-recently-used cap
so the date-, month-, and window-keyed entries cannot grow without limit. A miss
computes outside the lock, under a per-key single-flight lock so two concurrent
misses for the same key compute once. A compute whose data version advanced while
it ran still returns its own freshly computed value to its caller but MUST NOT be
stored — discard-on-store means "do not poison the cache," never "drop the
response."

#### Scenario: The heavy read endpoints answer from one per-process result cache

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
