# Design — Retire the legacy occurrences popup (#52)

## Existing decision and sanction

This change makes no new product or visual decision. ADR 31 in
`openspec/changes/finding-evidence-routing/design.md` already settles the
Inspector as the only occurrence-evidence route and says the dead
`occurrenceModal` hash machinery retires app-wide.

Connor's ruling on issue #31 supplies the exact retirement sanction:

> the dead `occurrenceModal` hash machinery goes with them.

The ruling was settled on 2026-08-18 and recorded at
https://github.com/harmonichq/harmonic/issues/31#issuecomment-5337669525.
R1 transcribes that sanction; it does not create or reinterpret it. No new ADR
is warranted.

## Revision provenance

- **Base:** `b075c715a497b55e684f966cf046dc9179f428ab`, the fetched
  `origin/main` tip from which `codex/52-retire-legacy-occurrences-popup` was
  cut.
- **UI Craft route:** revise, because this is a shipped runnable surface with a
  declared synthetic source.
- **Safe-start authority:** `AGENTS.md`, “The data boundary”.
- **Only allowed served command:**

  ```sh
  uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite
  ```

- **Data provenance:** the named database is generated entirely by committed
  `scripts/gen_revise_e2e_db.py`. Browser R1 uses only committed generated
  `frontend/__fixtures__/findings-projection.json`, produced by
  `scripts/gen_findings_projection_fixtures.py`, through the fixture-only
  projection mirror tested against backend-frozen answers. No normal server,
  live fetch, credentials, or real pump data may be used.

## Current behavior

`frontend/index.html` still contains the occurrence modal ref, open/close/
format/select helpers, URL serialization and restoration, an analysis-load
retry, a watcher dependency, Escape handling, and setup exposure. No rendered
template consumes the ref.

The current `parseHash()` reads the `modal` query parameter but does not assign
it to its result. A cold open of `#diagnose?modal=occurrences&detector=…`
therefore already lands on Diagnose and the normal hash writer discards the
parameter. That existing behavior is the desired stale-bookmark outcome, but
it cannot establish that the inert production source was deleted.

## Verification design

Two proofs stay separate:

1. A static assertion reads only `frontend/index.html` and rejects the closed
   token inventory. It fails naturally at the ticket base and becomes green
   only after the dead source is removed. Historical ADR, exploration, and R1
   sanction references remain outside its scope.
2. Public browser replay R1 supplies the stale hash through `page.goto`,
   observes exact canonical `#diagnose`, and checks that no accessible legacy
   dialog or duplicate roster exists. It then clicks a fixture-backed finding
   row and observes its episode count and occurrence rows in the Inspector.
   This passes on base and revision; mutations prove its two retirement
   assertions are live.

R1 loads its ledger record at module startup, validates owner Connor, date
2026-08-18, and the exact sanction, reads its own source to require the adjacent
retirement tag, and prints the ledger-validated sanction. It is exported in the
explicit `COCKPIT_SHELL_STORIES` registry; the existing zero-story failure
remains.

The generated findings fixture is an R1-only adapter input. Existing Cockpit
stories keep their current route stubs, so the retirement proof does not
silently replace their populations.

## Evidence and boundaries

Base and revision use separate worktrees and identical current synthetic
bytes. Each is captured at 1440×900 and 1280×800 in Light and Dark. The expected
visual result is no new surface and no loss from the supported Inspector.
`evidence/review.md` retains the renders' identities, source-test red/green,
browser mutation reds, nonzero story count, full sanction output, and gate
results.

The complete fast gate and drift checks plus the Diagnose workstation and
Cockpit shell browser legs are required. The Diagnose gate owns the existing
Inspector and Day-handoff contract; R1 owns retirement normalization. No URL-
state redesign, Data quality/Day direct-link repair, finding or comparison
semantic change, backend/API/model/safety/Plan change, fixture regeneration,
or stored-data change is part of this revision.
