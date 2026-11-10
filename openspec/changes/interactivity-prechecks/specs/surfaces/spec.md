## ADDED Requirements

### Requirement: Every story meets the keyboard and accessibility prechecks

The Storybook gate SHALL walk every component and screen story with the keyboard,
at the width its frame draws it, and SHALL fail a story that breaks any of these:
everything that responds to a tap has a role and is reached by Tab, and every
Tab stop is a visible control; each element Tab reaches looks different focused;
every control and every exposed graphic has an accessible name that reads as
words, and a tab or a button of a toggle group exposes its state; Tab has no
positive tabindex and never runs back against reading order within a region; a
sheet or popover is opened from a control that declares it, takes focus when it
opens, closes on Escape and returns focus to its trigger, and is modal, keeping
Tab inside, exactly when nothing beside it takes a tap; on a phone-width frame
every control takes a tap 44 px across through its centre, and at any width a
control pinned over a scrolling page takes its own taps; a status the app raises
on its own is in a live region. Once per run, every text ink SHALL hold 4.5:1 on every ground
the components draw on, and the focus ring and the glucose band fills 3:1. A
story may skip a criterion only through the precheck's own allowlist, which
states the reason.

#### Scenario: A control that responds to a tap but cannot be reached fails

- **GIVEN** a story with an element that responds to a tap and has no role
- **WHEN** the Storybook gate walks it
- **THEN** the story fails, naming that element

#### Scenario: A sheet is walked from its trigger

- **GIVEN** a screen story with a control that declares it opens a dialog
- **WHEN** the gate presses it with Enter
- **THEN** the dialog holds focus through Tab and Shift+Tab, closes on Escape, and
  focus is back on the control

#### Scenario: A phone control smaller than the target keeps its drawn size

- **GIVEN** a 32 px secondary button on a phone-width story
- **WHEN** the gate taps 22 px above and below its centre
- **THEN** both taps land on the button, and the button still draws 32 px tall

#### Scenario: A rule that cannot fail fails its probe

- **GIVEN** a gate probe story that draws one defect and names what the walk must find
- **WHEN** the Storybook gate walks it and finds nothing
- **THEN** the probe's test fails
