# Scope — Relax the publishable-tree scan (#261)

Route: interview mode. The ruling exists (#219 Q6/Q7); two bounded decisions
remain that the ruling did not reach.

## Decisions

- Route (2026-08-30): interview mode. A concrete plan exists and the operator has
  already ruled the direction; what is open is two bounded questions inside it,
  not the direction. `inline`

### Grounded facts (verified live, 2026-08-30)

- The check lives in `scripts/scan_public_tree.py` rule 5, not in
  `scripts/check_public_allowlist.py` as the issue says. The config path in the
  issue is correct.
- Baseline green: build + scan = 381 files scanned, 0 findings, exit 0. Runs in
  the "Check and scan the materialised public tree" CI job, not the fast gate.
- `_OWNER_NAME_RE` matches two unrelated things: the owner's first name, and the
  sanction idioms ("sanctioned by", "the operator's ruling").
- Six `prose-exempt ... owner-name` entries exist, not the four the issue claims.
  Every one is a name hit; zero are idiom hits.
- `frontend/diagnose-event-comparison-behavior.replay.mjs`'s exemption is already
  stale (zero hits of either kind). The scan reports unused pins but not unused
  prose exemptions, which is why it sat silently.
- The idiom half matches zero lines anywhere in the materialised public tree. All
  ten idiom hits in the repo are in paths the allowlist excludes.
- The `prose-exempt` mechanism must survive: the `public_scan_config.txt`
  `dose-ratio` exemption is load-bearing.
- The check induced a workaround: the replay drivers read the sanctioner's name
  out of `pyproject.toml` at run time to avoid writing it in a shipping file.

- Q1 (2026-08-30): the whole rule-5 owner-name check goes, sanction idioms
  included, not just the name half. Why: the operator does not want this level of
  authoritative decision tracking in his own personal project repo, and the idiom
  half exists only to police that tracking. `inline`
- Q2 (2026-08-30): collapse the runtime name indirection. The replay driver reads
  the sanctioner out of `pyproject.toml` at run time solely to dodge the check
  being removed; with the check gone the workaround is dead code. Write the name
  plainly and delete the fetch. `inline`

### Risk contract

- **Must prevent:** weakening any rule that keeps real glucose, insulin or dosing
  history out of the public tree (structural field rule, the date-count rule, the
  timestamp-series rule, the fixture-provenance stamp and its enumerated
  `authorized-synthetic` clearances); weakening the credential or absolute-user-path
  prose checks; disabling the `prose-exempt` mechanism the surviving `dose-ratio`
  exemption depends on; secret exposure; irreversible loss of authoritative data;
  silent incorrect success.
- **Must recover:** nothing automatically.
- **Accepted failure:** if a future shipping file cites a private ruling in prose,
  nothing mechanical catches it; a human reading the pull request does. The
  operator accepts that.
- **Unsupported:** any change to the fixture-provenance half, to the dose-ratio
  acknowledged baseline, or to the allowlist that decides which files ship.
- **Evidence owed:** the scan's own test suite passes with the check and its six
  exemptions gone; the config still parses and still rejects an unknown check
  name; the materialised public tree scans to zero findings; the workstation
  replay browser gate passes after the name indirection is collapsed.

Why: the scan is the one mechanical check between a private health record and a
public repository, so removing any part of it is priced by what the remaining
rules still catch, not by how small the diff looks.

Disposition: copied unchanged into the work order.

### Spike (executed 2026-08-30)

Patched copies of `scripts/scan_public_tree.py` (check removed from
`PROSE_CHECKS`, `_OWNER_NAME_RE` and its dispatch line deleted) and
`scripts/public_scan_config.txt` (all six `owner-name` exemptions removed) were
run against the materialised tree built from this branch's base. Result: 381
files scanned, 21 stamped, 6 pinned, 171 acknowledged dose-ratio, **0 findings**,
with `scripts/public_scan_config.txt dose-ratio` the only surviving prose
exemption. The end state is green with no compensating edits anywhere else.

`readFile` and `join` stay in use in the replay driver after the indirection is
collapsed, so no import goes dead.

## Review rounds

- Round 1 (cold Opus, read-only, plan-review): BLOCKED, 3 blocking + 1 note, all
  tagged `authoring`. Every objection was an incomplete or wrong enumeration in an
  edit step: contradictory config line ranges that would have decapitated the
  surviving exemption's rationale, a stale count in `parse_config`'s grammar
  docstring, a test whose whole subject is the removed rule, and a delete range one
  line short of a closing paren. All four reproduced by the coordinator against the
  tree before any edit; none refuted. A fifth of the same class was found while
  reproducing the second, at `scan_public_tree.py:558`.
- All five corrected as mechanical fixes and re-checked by the same reviewer in the
  same round: COUNTERSIGNED, no new blocking finding, and the reviewer confirmed the
  count-statement enumeration is now exhaustive across both files.
- The reviewer's sandbox blocked command execution, so it reviewed the recorded spike
  figures rather than reproducing them. Its objections were all file-read grounded.

## Open questions

(none)

## Spawned tasks

(none)
