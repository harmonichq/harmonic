# Design — decision-record-home

## ADR 29 — A decision record's home is the OpenSpec change that carries the work

**Ruling.** A decision record is a `## ADR <issue> — Title` section in
`openspec/changes/<change>/design.md`. There is no `docs/adr/` tree in this
repository, and `scripts/check_adr_numbers.py` fails on a record reappearing
under one. `<issue>` is the GitHub issue, ticket or pull request the decision
came from; two records from one issue take distinct titles.

**Context.** ADR 20 was recorded in its change's design notes. ADR 25 was
recorded in a new `docs/adr/` tree, because `AGENTS.md` and the naming guard both
still described that scheme — a scheme with no records in it. Both readings were
defensible from the repository's own instructions, which is the defect: an agent
or contributor picking either one forks the history, and a history split across
two homes is discoverable in neither.

**Consequences.**
- The record sits next to the spec deltas it constrains, which is why OpenSpec
  wins over a parallel tree here: the change already names the work.
- Identity stays keyed on an issue number rather than a counter, so two branches
  cannot collide by both picking "the next free number" off a stale base. The
  guard now enforces that identity on headings instead of filenames.
- Work with no change directory yet creates one to hold its record. A record is
  not a reason to invent spec deltas — a change carrying only `design.md` is
  legal, and ADR 20's own change is the precedent.
- The public tree is unchanged: `openspec/specs/**` ships, the change tree does
  not, and the guard ships so the rule stays enforceable in the public
  repository.

Decision: harmonichq/harmonic#29, 2026-08-18.
