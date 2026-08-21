# Tasks — Retire the legacy occurrences popup (#52)

## 1. Freeze the current shell and retirement

- [x] Replay and inventory the Cockpit shell at exact ticket base
      `b075c715a497b55e684f966cf046dc9179f428ab` before changing production
      source.
- [x] Re-freeze `mockups/cockpit-shell.behavior.md` with hashes computed from
      every exact synthetic source its opener transports.
- [x] Add permanent retired entry R1 with owner Connor, settlement date
      2026-08-18, and the exact sanction: “the dead `occurrenceModal` hash
      machinery goes with them.” Update the frozen retired count.

## 2. Pin the two distinct regressions

- [x] Add a closed source-inventory assertion over `frontend/index.html` for
      `occurrenceModal`, `openOccurrences`, `closeOccurrences`,
      `formatOccurrenceTime`, `goToOccurrence`, and `modal=occurrences`. Record
      its expected failure on the ticket base.
- [x] Extend only the Cockpit test adapter with optional initial-hash, findings-
      input, and exposures-input seams. R1 alone uses the matching generated
      inputs from `frontend/__fixtures__/findings-projection.json`; existing
      stories retain their stubs.
- [x] Export and register R1 in `COCKPIT_SHELL_STORIES` beside the adjacent
      `RETIRED:Connor:2026-08-18` tag. Load its ledger row, validate the exact
      owner/date/sanction and source tag, print the ledger-validated sanction,
      and preserve the nonzero-registry failure.
- [x] Cold-open a stale URL whose identifier comes from the generated fixture's
      first scenario lever. Assert exact canonical `#diagnose`, no accessible
      occurrences dialog or duplicate roster, then click a public finding row
      and require its episode count and at least one Inspector occurrence row.
- [x] Use the existing `proveRedOnce` seam to make the canonical-hash and no-
      duplicate-route assertions fail independently, then restore them. Record
      that the public replay already passes on base and is a prevention lock,
      not the proof of source deletion.

## 3. Remove the retired production source

- [x] Delete the legacy ref, helpers, hash serialization/restoration, analysis
      retry, watcher, Escape branch, setup exposure, and obsolete comments from
      `frontend/index.html`.
- [x] Keep the shared hash mechanism, `goToMoment` Day handoff, and all non-
      occurrence branches—including Data quality—unchanged. Do not repair the
      separate direct-link parsing gap tracked by #53.
- [x] Rerun the source-inventory assertion and retain its green result.

## 4. Verify and review

- [x] Capture base and revision stale-link/visible-Inspector evidence at
      1440×900 and 1280×800 in Light and Dark from separate worktrees using the
      same current synthetic bytes. Store the eight clearly named renders and
      `evidence/review.md` under this change.
- [x] Record the source test's red/green evidence, both restored browser
      mutations, the nonzero Cockpit story count, and the full R1 sanction in
      `evidence/review.md`.
- [x] Run the complete fast gate and current drift checks, then the Diagnose
      workstation and Cockpit shell browser legs exactly as `AGENTS.md`
      documents. Record every final result in `evidence/review.md`.
- [x] Run `/review` at Full depth over the whole diff and resolve every blocking
      finding before opening the pull request.
