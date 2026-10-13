## ADDED Requirements

### Requirement: The app is five recommendation-first tabs composed from an approved component library

The app SHALL present exactly five tabs: Queue, Changes, Overview, Day and
Settings. Each tab owns only its own content: Queue owns the ranked
recommendations, Changes the active watched change and the last finished one,
Overview the standard metrics over 14, 30 and 90 days, Day one day together with
carb logging and prompts, and Settings the sync state, the pump profile and the
glossary. Screens SHALL be composed only from components of the approved
component library. No surface SHALL show explanatory prose, a prediction, or a
value the engine does not serve.

#### Scenario: Sync failure is shown only in Settings

- **WHEN** the last sync attempt failed
- **THEN** the Settings tab carries an alert badge, Settings shows the failure,
  and no other tab shows a banner, toast or strip about it
