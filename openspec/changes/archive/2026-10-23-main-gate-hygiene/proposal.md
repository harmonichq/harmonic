# The gate list matches CI, and the redesign change archives (#620)

## Why

The pull-request gate block in `AGENTS.md` lists two of the seven named-case
contract runs CI's `app` job makes. #606 removed the retired correction-factor
case from both, but the block never carried the other five, so a contributor who
runs the block runs less than CI does. The contract-test paragraph beneath it omits
`pattern-correction-fold`, and CI's comment over the named-case step still names "a
queued correction factor", which no case serves since #606.

`openspec archive recommendations-redesign` refuses on main. The change removes
every requirement of `eating-sequences`, so archiving retires that capability
and deletes its spec. OpenSpec refuses a retirement while the spec holds lines
its merge cannot account for, and four wrapped lines of that spec begin with
`<`, which its parser does not count as requirement text. Once those lines are
rewrapped, OpenSpec still requires the change to opt in to retiring a
capability.

## What changes

- The gate block in `AGENTS.md` lists every `--case` line CI's `app` job runs,
  in CI's order, and the paragraph beneath it describes each one.
- CI's comment over the named-case step stops naming a correction-factor case.
- Four lines of `openspec/specs/eating-sequences/spec.md` are rewrapped so none
  begins with `<`. Every word stays, in order; only line breaks move.
- `openspec/changes/recommendations-redesign/.openspec.yaml` declares its schema
  and `retire_capabilities: true`.

No requirement changes. No product behaviour changes. This change archives
without touching a spec.

## Risk contract

- **Must prevent:** a requirement's wording changing while it is rewrapped; a
  gate line naming a case the generator does not emit; the archive run here
  (it belongs to the redesign's own finalize).
- **Must recover:** nothing; every edit is text.
- **Accepted failure:** none.
- **Unsupported:** other specs' lines that begin with `<`. They matter only when
  their capability is retired, and none is.
- **Evidence owed:** an archive of `recommendations-redesign` on a scratch copy
  of this branch's `openspec/` tree retires `eating-sequences`, and
  `openspec validate --all --strict` passes on that result and on the branch;
  the rewrapped spec's words equal main's; the gate block's `--case` lines equal
  CI's.
