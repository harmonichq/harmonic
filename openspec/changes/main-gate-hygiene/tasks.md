## 1. The gate list

- [ ] 1.1 Add CI's five missing `--case` lines to the `AGENTS.md` gate block, in CI's order
- [ ] 1.2 Describe `pattern-correction-fold` (Day findings of five kinds) in the contract-test paragraph, in CI's order
- [ ] 1.3 Drop "a queued correction factor," from CI's comment over the named-case step; change nothing else in that comment

## 2. The archive preflight

- [ ] 2.1 Rewrap the four `eating-sequences` spec lines that begin with `<`, words unchanged
- [ ] 2.2 Add `.openspec.yaml` (`schema: spec-driven`, `retire_capabilities: true`) to `recommendations-redesign`
- [ ] 2.3 Archive `recommendations-redesign` on a scratch copy of `openspec/`, confirm it retires `eating-sequences`, and validate the result; never archive in the worktree

## 3. Verification

- [ ] 3.1 Commit, then `bash openspec/changes/main-gate-hygiene/verify.sh` prints `verify: pass` (it reads the committed tree)
