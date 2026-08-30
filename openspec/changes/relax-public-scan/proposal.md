# The owner's name is not contamination (#261)

## Why

The publishable-tree scan runs five prose sub-checks over everything that gets
published. One of them treats the repository owner's own first name as a leak,
and the prose idioms crediting a decision to him as a citation of a private
authority. Six standing per-file waivers exist only to hold that sub-check back
on files that must name him — the licence, the package authorship, and four
browser drivers printing dated acceptance sanctions — and a seventh was needed
the moment another file recorded a ruling. One replay driver went further and
read the name out of `pyproject.toml` at run time purely so a shipping source
file would not carry it twice.

It is his repository and his name belongs in it. The operator ruled on
2026-08-30 that the whole sub-check goes, idioms included: he does not want this
level of authoritative decision tracking in his own personal project.

## What changes

- Retire rule 5's `owner-name` sub-check: the owner's first name and the
  sanction idioms are no longer findings anywhere in the published tree.
- Remove the six per-file prose exemptions that existed only to hold it back,
  leaving exactly one exemption in force — the config holding the dose-ratio
  check back on its own generated baseline.
- Collapse the workstation replay driver's run-time author lookup, writing the
  sanctioner's name plainly at each of the three stories that print it.
- Leave every rule that keeps real glucose, insulin and dosing history out of
  the published tree exactly as it stands.

## Risk contract

- **Must prevent:** weakening any rule that keeps real glucose, insulin or
  dosing history out of the public tree (the structural field rule, the
  date-count rule, the timestamp-series rule, the fixture-provenance stamp and
  its enumerated `authorized-synthetic` clearances); weakening the credential or
  absolute-user-path prose checks; disabling the `prose-exempt` mechanism the
  surviving `dose-ratio` exemption depends on; secret exposure; irreversible
  loss of authoritative data; silent incorrect success.
- **Must recover:** nothing automatically.
- **Accepted failure:** if a future shipping file cites a private ruling in
  prose, nothing mechanical catches it; a human reading the pull request does.
  The operator accepts that.
- **Unsupported:** any change to the fixture-provenance half, to the dose-ratio
  acknowledged baseline, or to the allowlist that decides which files ship.
- **Evidence owed:** the scan's own test suite passes with the check and its six
  exemptions gone; the config still parses and still rejects an unknown check
  name; the materialised public tree scans to zero findings; the workstation
  replay browser gate passes after the name indirection is collapsed.

## Impact

The publish gate and its config, the gate's own test suite, and one browser
replay driver's printed sanction strings. No rendered surface, API, model,
fixture, stored data, or advisory guidance changes.
