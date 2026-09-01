# Tasks — one occurrence roster for both Finding lists

- [x] Extract one occurrence-roster mechanism serving both Finding lists — the
  verdict-band roster and the response-comparison roster — owning the grouped
  headers with counts, the occurrence row buttons and their pressed state, single
  selection, and the over-cap show-more control, while each list keeps its own
  grouping and row text.
- [x] Put the mechanism in a vue-free module node tests can import, and cover its
  selection and show-more behavior through its public interface, each test failing
  first against a deliberately broken variant — including the preserved facts that
  gating counts are the caller's served figures, never a recount of rendered rows,
  and that the response-comparison caller keeps one expansion state across its
  cohorts.
- [x] Register the new module's static asset route in the API's per-file
  whitelist, mirroring its neighbouring module routes, so the existing route
  guard (which walks the page's import graph and requires served == reachable)
  passes and the built app serves the module instead of 404ing it. No new test:
  that guard is the test, and it fails today without the route.
- [x] Move the ADR 79 guard with the code, asserting both halves it protects:
  the extracted mechanism performs no recount of rendered rows, and each call
  site in the workstation module hands it the served figure — the published
  verdict count for the verdict list, each cohort's routed count for the
  comparison list — since after extraction the count is a parameter and only a
  call site can commit the recount.
- [x] Re-point the finding-evidence-routing exploration's verbatim extraction at
  the mechanism's new home, regenerate its extracted renderer with its export
  surface unchanged (`renderEvidence`, `EVIDENCE_CAP`, `tierOf` — the
  exploration's hand-written surface and contrast audit import them), and leave
  its `--check` drift gate green in the same change.
- [x] Replay the frozen finding-evidence-routing ledger against the built app:
  146 of 146 stories green with zero story amendments. An amendment is a moved
  behavior and blocks.
- [x] Fast gate, drift checks and the workstation browser gates green.
