## MODIFIED Requirements

### Requirement: Remaining consumers migrate before revise-E2E retires

Every executable consumer of a synthetic QA database SHALL use the committed QA
showcase or a named case store that `scripts/gen_qa_e2e_db.py --case` emits. The consumers are:

- the CI drift step (`scripts/gen_qa_e2e_db.py --check`), which SHALL remain
  fail-closed;
- the desk behavior-ledger replay, the one database-backed browser consumer. It
  SHALL give each story a fresh copy of its named case store: the committed
  showcase is copied, and any other case is emitted by the generator. It SHALL
  serve only that copy, with `harmonic serve --no-fetch --token '' --port 8765`,
  never the committed path;
- the Trial and Pattern Focus browser suite, which drives that same replay;
- the route-level test, which SHALL copy the committed showcase into a temporary
  path, select `finding:over_treated_low`, and pin summary `{"claimed": 1,
  "denominator": 5, "noun": "lows"}`, verdict-count sum `5` and occurrence
  count `5`;
- the public-link pin with its test, which allow the showcase's path only in the
  agent instructions, and the public binary-policy test, which keeps the
  `.sqlite` binary out of the public tree;
- the agent instructions and the `harmonic-nofetch` launch entry, whose
  documented local serve SHALL stay tokenless, isolated to a scratch copy, and
  `--no-fetch`.

The desk browser suite answers the API from generated payloads and is not a
database consumer. #416 deleted the Diagnose workstation behavior ledger and the
event-comparison, comparison-support and v1 Trial behavior replays. None of them
remains a consumer, and no CI job serves a showcase copy of its own.

The QA case tests SHALL keep the public production-composition proof: each case
runs through the production analysis, exposures, scenarios and findings
projection, and an I:C history case is among them.
`tests/test_gen_qa_e2e_db.py` SHALL assert that the generator's output leaves no
adjacent `-wal` or `-shm` sidecar, and that `store.get_credentials()` is `None` on
the committed showcase.

The retired revise-E2E store SHALL stay retired. `scripts/gen_revise_e2e_db.py`,
`tests/test_gen_revise_e2e_db.py` and `mockups/revise-e2e.synthetic/` stay absent.
`tests/test_revise_e2e_retired.py` SHALL fail closed on any retired spelling in
its executable surface: `AGENTS.md`, every file under `.claude`, `.github`,
`scripts`, `tests` and `frontend`, and the executable `.mjs` files under
`mockups/`. It SHALL separately require the old generator file and fixture
directory to be absent. `docs/`, `openspec/` and the rest of `mockups/` are
historical records outside that surface.

#### Scenario: Every direct consumer has one QA successor

- **WHEN** the executable consumers above are inspected
- **THEN** each names the committed QA showcase or a case store emitted by
  `scripts/gen_qa_e2e_db.py --case`
- **AND** no CI job serves a showcase copy of its own, and the desk browser suite
  reads no database

#### Scenario: The one database-backed browser consumer proves the migrated server

- **WHEN** a desk ledger story starts
- **THEN** its server reads a fresh scratch copy of the story's named case store
  with `--no-fetch` on port 8765, and never the committed showcase path

#### Scenario: Retirement is evidence-based

- **WHEN** `tests/test_revise_e2e_retired.py` runs against its executable surface
- **THEN** any retired spelling produces a failure
- **AND** the test separately requires the old generator and fixture directory to
  be absent

#### Scenario: The showcase and active record do not move

- **WHEN** `scripts/gen_qa_e2e_db.py --check` runs
- **THEN** the committed showcase matches what its generator produces
- **AND** the #319 migration's decision record stays in the archived
  `qa-e2e-coverage-eras` change, unedited
