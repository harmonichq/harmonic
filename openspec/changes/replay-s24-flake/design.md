# #441 design record

## ADR 441 — A render keeps an already-seated Diagnose case file attached

### Context

The desk re-renders whenever a background read lands. Pressing Diagnose
starts several reads that nothing on screen waits for: the Focus options
read, the guidance read it forces, and the Plan state read. Every desk render
calls the Diagnose destination's mount. On its in-place path, where the case
file is already seated and not parked, mount re-seats the root with
`host.replaceChildren(root)`. That removes and re-inserts the subtree that
holds focus, and the browser drops focus to the page body.

Neither existing restoration reaches this case:

- The desk re-applies only a focus target it placed itself (the carried-focus
  rule in `routes.js`, "a render must not take the reader's hand off what it
  is on").
- The case file's passive restore (ADR 101) runs only inside its own repaint,
  and only while focus is still on an Occurrence row.

Triage evidence, all against synthetic case stores (showcase), 1280×720:

- Unchanged S24 passed 16 of 16 solo runs and 6 of 6 S23–S25 runs on the
  triage machine. The nightly failure (run 35872827406, main at a4d374a7) needs
  a slow runner, so plain repetition is not a discriminating proof here.
- A scratch harness ran the shipped app arm of S24 unchanged. It held the
  Diagnose press's `/api/focus` and `/api/guidance` responses and released them
  right after S24's third Occurrence response. The failure reproduced 3 of 3
  with the nightly's exact message. The timeline showed the ↑ repaint focusing
  the first member, the guidance response landing about a millisecond later,
  and a focus-out from that row with no related target. Its stack was
  `mount < render < readGuidance`, and focus ended on the page body.
- Changing only the in-place re-seat in the built bundle turned the same
  provocation 3 of 3 green. The patch removed any host child other than the
  root and attached the root only when it was not already the host's child.
  The bundle was rebuilt afterwards; nothing from the harness is committed.

### Decision

When a render finds the root already seated in its host, mount keeps the root
attached. Any other content in the host is removed around it, and the root is
attached only when it is not already a child of the host. This applies to the
cold seat and the parked-return re-seat too, where the root is not yet in the
host, so those paths append it exactly as today.

Everything else in mount stays as it is: the loading frame during Diagnose's
own read, both failed-read frames, the return's status check, and ADR 414's
park and re-seat.

The fix lives in the app, not in the replay. The issue's own checklist routes
an app cause to an app fix. A replay that waited out a focus drop would be
certifying a real reader-facing defect.

### Consequences

- S24's claim, tolerance and actions stay unchanged, and so does every other
  story. The frozen ledger already requires the occurrence roster to retain
  focus (Amended S24), so no ledger amendment and no sanction are owed.
- Other destinations still rebuild their markup on every render and rely on the
  desk's carried-focus rule. They are out of scope.
- A test through `createDiagnoseDestination().mount` pins that the seated root is
  never detached by an in-place render. The replay remains the browser evidence.
