# Tasks — one occurrence roster for both Finding lists

- [ ] Extract one occurrence-roster mechanism serving both Finding lists — the
  verdict-band roster and the response-comparison roster — owning the grouped
  headers with counts, the occurrence row buttons and their pressed state, single
  selection, and the over-cap show-more control, while each list keeps its own
  grouping and row text.
- [ ] Put the mechanism in a vue-free module node tests can import, and cover its
  selection and show-more behavior through its public interface, each test failing
  first against a deliberately broken variant.
- [ ] Replay the frozen finding-evidence-routing ledger against the built app:
  146 of 146 stories green with zero story amendments. An amendment is a moved
  behavior and blocks.
- [ ] Fast gate, drift checks and the workstation browser gates green.
