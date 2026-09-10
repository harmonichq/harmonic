# Plan

## ADDED Requirements

### Requirement: A staged I:C block's captured bounds carry an inclusive start and an exclusive end

The system SHALL satisfy the following:

An I:C plan row may carry an `ic_block_provenance` claim naming the programmed block it belongs to: `block_start_min`, `block_end_min` and `block_member_start_mins`. Those bounds describe the wrap-aware arc `[block_start_min, block_end_min)`. The start is inclusive and SHALL be an integer minute of day in `[0, 1440)`, as SHALL every listed member start. The end is exclusive and SHALL be an integer in `(0, 1440]`, so a block whose arc closes at midnight is expressed as `1440` and is valid on both draft save and apply. The arc SHALL NOT be empty: an end equal to the start is rejected. A block whose end is below its start wraps past midnight, which remains valid.

These bounds are the same domain the I:C history identity enforces, and the I:C analyzer publishes blocks inside it: a profile carrying one carb ratio all day is published as the single block `start_min` 0, `end_min` 1440, and it is stageable on those bounds like any other block.

#### Scenario: An all-day I:C block is staged on its exclusive end

- **GIVEN** an I:C block the analyzer publishes with `start_min` 0 and `end_min` 1440, whose members are every programmed segment start
- **WHEN** one row per member is saved to the plan draft, each carrying that block's provenance and one shared proposed value
- **THEN** the draft is accepted, applies, and reads back from apply history with its provenance unchanged

#### Scenario: A block bound outside its own domain is rejected

- **GIVEN** an I:C row carrying an `ic_block_provenance` claim
- **WHEN** its `block_end_min` is not an integer in `(0, 1440]`, or its `block_start_min` or any member start is not an integer in `[0, 1440)`
- **THEN** the save is rejected and no draft is recorded
