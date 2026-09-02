## MODIFIED Requirements

### Requirement: The app ships one dark theme

The app SHALL render every surface in its one dark theme with no theme
selection: no boot-time class gate, no stored theme preference, no Theme control,
and no rule scoped to a theme class. Every rendered colour SHALL resolve from
the single `:root` token block, and a token value SHALL change only through a
ruling recorded with its dated operator sanction in the change's design record.

#### Scenario: A fresh visit renders dark with nothing stored

- **GIVEN** a browser with no stored preference for the app's origin
- **WHEN** the reader opens any surface
- **THEN** the surface renders in the dark theme
- **AND** the footer offers no Theme control
- **AND** no `theme` value is written to storage

#### Scenario: A palette revision moves only colour

- **GIVEN** the ticket base and the revision served from the same synthetic database
- **WHEN** every gated state's computed style is diffed between them
- **THEN** every difference is a colour-valued property or a moved token
- **AND** no element is added or removed and no layout or typographic property differs

## ADDED Requirements

### Requirement: Clinical attention and tappable affordance do not share a hue

High-glucose marks SHALL render in a hue that is not the action colour used by
controls, links, focus rings and the chrome bar's signal, and SHALL remain
tellable from low, in-range and the non-clinical ambers. Every consumer of the
high-glucose mark SHALL read the one `--high` token.

#### Scenario: A high reading beside a control on the Day surface

- **GIVEN** a Day surface whose hero chart, navigator and highs count show at least one high reading
- **WHEN** the reader views them beside the Log carbs control and the active workflow step
- **THEN** the high marks and the controls render in different hues
- **AND** the high marks share one hue across the hero chart, navigator, legend and count
