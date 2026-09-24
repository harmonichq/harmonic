## ADDED Requirements

### Requirement: A refused change write serves a sentence beside its code

When a durable Plan, Trial, Focus or later-conclusion write is refused with 409,
the response detail SHALL carry `message` beside `code`, as every other coded
refusal the API serves already does. Every refusal code the lifecycle writes can
raise SHALL have a non-empty message with no underscore token; an unknown code's
message SHALL be the code itself. The detail's `code`, `input_revision` and
`admission` SHALL be unchanged, and a non-durable refusal SHALL keep its plain
string detail.

#### Scenario: A stale Focus resolve names its refusal

- **GIVEN** an active synthetic Focus and a durable resolve request carrying an
  input revision older than the store's
- **WHEN** the resolve is posted
- **THEN** the response is 409 with `detail.code` `stale_input_revision`
- **AND** `detail.message` is that code's sentence, with no underscore
- **AND** `detail.admission` and `detail.input_revision` are still served

#### Scenario: Every lifecycle refusal code has a sentence

- **GIVEN** every refusal code enumerated from the modules that raise lifecycle
  refusals, together with the handler's default
- **WHEN** its message is looked up
- **THEN** it is non-empty and contains no underscore
- **AND** every raise in those modules passes its code as a literal, so none
  escapes the enumeration
