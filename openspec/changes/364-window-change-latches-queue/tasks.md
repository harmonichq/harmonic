# Tasks

- [ ] Add executable story `C58` to
      `frontend/diagnose-workstation-behavior.replay.mjs`, tag it
      `// STORY:finding-evidence-routing:C58`, and register it in the `STORIES`
      table: drill into a Finding at the 24-hour window, then press a window
      preset whose case-file answer for that Finding is `404
      finding_unavailable`. Assert the surface lands on that window's Findings
      queue — breadcrumb `Findings`, no `Findings unavailable for …` text in
      `#level`, `#level` settled (`data-loading` `false`) — and that the pressed
      preset stays selected.
- [ ] Run the story against the unfixed product code through the declared
      no-fetch server and record its failure; save the output as the change's
      `evidence/replay.pre.stdout.txt`.
- [ ] In `frontend/diagnose-workstation.js`, stop the window-change preparation
      handshake from recording a case-level failure as the window's findings
      failure. Handle the `404` / `finding_unavailable` answer **inside
      `ensurePreparation`'s own promise chain**, on the shadow case-file leg:
      adopt the preparation already resolved in that chain as the window's
      findings, pop the drilled `factor` frame back to the Findings queue, and
      clear that frame's retained `caseFile`, without setting `failedKey` and
      without issuing a second `loadPreparation` request.
- [ ] Do not reuse `refreshQueueAfterUnavailable()` for this leg. It is written
      for `requestCase`'s own failure path and is wrong here on three counts: its
      `isCurrentCaseRequest` guard compares against `caseGeneration` while this
      chain holds a `preparationGeneration` value, it re-fetches the preparation
      this chain already resolved, and it neither pops the frame nor clears
      `frame.caseFile`, which would leave the reader drilled on the previous
      window's case file behind an error strip.
- [ ] Leave the preparation-request failure path unchanged: a failed
      `finding-case-file-preparation` still latches the window and still renders
      `Findings unavailable for <scope>. Choose another window to try again.`
      verbatim, as story `C54` pins it.
- [ ] Amend `mockups/finding-evidence-routing.behavior.md`: add the revision
      amendment section for this issue describing `C58`; change the issued count
      from `164` to `165`; and carry `C58` in both inventory ranges, so the issued
      line reads `S01–S144, C41–C58, and D1–D3` and the active line reads
      `S01–S116, S118–S144, C41–C58, and D1–D3`.
- [ ] Update the compact guard in
      `frontend/diagnose-behavior-ledger-parity.test.js` in the same change: its
      `initialIssued` literal (line 88) pins the issued set as
      `'S01–S144, C41–C57, and D1–D3'` and must become
      `'S01–S144, C41–C58, and D1–D3'`, or `node --test 'frontend/**/*.test.js'`
      fails on both the declared-count assertion and the issued-set comparison.
- [ ] Run the full workstation replay against the declared no-fetch server and
      record the passing output as `evidence/replay.post.stdout.txt`.
- [ ] Serve only from the scratch copy the repo's offline-serve recipe makes
      (`AGENTS.md`, "The data boundary"), so no committed database is ever opened
      by the server, and stage by path so no serve artifact or WAL sidecar is
      committed.
- [ ] Run the dependency-free fast gate with zero failures.
