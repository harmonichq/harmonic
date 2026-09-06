# Tasks

- [ ] Add executable story `C58` to
      `frontend/diagnose-workstation-behavior.replay.mjs` and register it: drill
      into a Finding at the 24-hour window, then press a window preset whose
      case-file answer for that Finding is `404 finding_unavailable`. Assert the
      surface lands on that window's Findings queue — breadcrumb `Findings`, no
      `Findings unavailable for …` text in `#level`, `#level` settled
      (`data-loading` `false`) — and that the pressed preset stays selected.
- [ ] Run the story against the unfixed product code through the declared
      no-fetch server and record its failure; save the output as the change's
      `evidence/replay.pre.stdout.txt`.
- [ ] In `frontend/diagnose-workstation.js`, stop the window-change preparation
      handshake from recording a case-level failure as the window's findings
      failure. A `finding_unavailable` answer for the drilled Finding adopts the
      new window's findings and returns to that window's Findings queue.
- [ ] Leave the preparation-request failure path unchanged: a failed
      `finding-case-file-preparation` still latches the window and still renders
      `Findings unavailable for <scope>. Choose another window to try again.`
      verbatim, as story `C54` pins it.
- [ ] Amend `mockups/finding-evidence-routing.behavior.md`: add the revision
      amendment section for this issue describing `C58`, and update the issued and
      active executable-ID inventory lines to carry `C58`.
- [ ] Run the full workstation replay against the declared no-fetch server and
      record the passing output as `evidence/replay.post.stdout.txt`.
- [ ] Restore `mockups/revise-e2e.synthetic/harmonic.sqlite` through
      `scripts/gen_revise_e2e_db.py` after the replay serve, and stage by path so
      no serve artifact or WAL sidecar is committed.
- [ ] Run the dependency-free fast gate with zero failures.
