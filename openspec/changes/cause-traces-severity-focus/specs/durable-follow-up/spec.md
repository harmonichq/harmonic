## ADDED Requirements

### Requirement: A Pattern Focus watches the member it was started on

A Focus started from a Pattern with a `lever` SHALL watch that lever when it is
one of the Pattern's pinnable habit members, and the request SHALL be refused,
with nothing written, when it is not. A Focus started from a Pattern with no
`lever` SHALL watch the Pattern's first pinnable habit member, as before. Either
way the record SHALL keep the Pattern's subject and key, so every reader of the
Pattern's Focus is unchanged. A retried pin SHALL be refused when it names a
`lever` other than the one its Focus watches.

#### Scenario: A Focus started on the second cause watches it

- **GIVEN** the `pattern-meal-two-causes` QA case, where Carb undercount is the
  Pattern's first pinnable member and Late bolus its second
- **WHEN** a Focus is started with `pattern_key` `highs_after_meals` and `lever`
  `late_bolus`
- **THEN** the Focus watches Late bolus under the subject
  `pattern:highs_after_meals`

#### Scenario: A lever that is not the Pattern's member is refused

- **GIVEN** the same case
- **WHEN** a Focus is started with `pattern_key` `highs_after_meals` and `lever`
  `meal_over_delivery`
- **THEN** the request is refused with 400 and no Focus is written

#### Scenario: With no lever the first member is watched

- **GIVEN** the same case
- **WHEN** a Focus is started with `pattern_key` `highs_after_meals` and no
  `lever`
- **THEN** the Focus watches Carb undercount

#### Scenario: A retry naming another lever is refused

- **GIVEN** a durable pin of Late bolus on Highs after meals
- **WHEN** the same request id is sent again with `lever` `carb_undercount`
- **THEN** it is refused as a request identity mismatch and the Focus still
  watches Late bolus
