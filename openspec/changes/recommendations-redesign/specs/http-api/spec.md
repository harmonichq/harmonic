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
