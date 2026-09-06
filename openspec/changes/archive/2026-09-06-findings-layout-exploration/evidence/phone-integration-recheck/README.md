# Integrated verification closure

The initial full run at `9294e58` is preserved unchanged in `../phone-merged-verification`: 34 of 36 commands passed. It found a keyboard-focus test setup race and a replay witness read after the queue was hidden. The two reviewed test-only corrections wait for served detail before focusing the crumb, and capture the live queue preview before opening All charts. They retain the original public behavior assertions and exact median-point comparison. Production code did not change.

This final rerun at `b7b8adecc3888e27bf2efc970a309f468549bbdd` passed both affected complete suites: workstation 60/60 and Diagnose replay 163/163. `commands.json` records the exact commands, environment, head and exit codes; the adjacent files preserve their complete output. The replay used the repository’s synthetic copy-then-serve recipe with `--no-fetch --token ''`, an owned temporary database and port; server output is included.

Together these runs satisfy all 36 local gate obligations, including all ten browser legs. This is not a claim that all 36 commands ran on the final head. Unaffected results remain Python 2227 passed/1 skipped, frontend 589 passed, OpenSpec 73/73, all drift and public-tree checks passed. The shell’s two existing skips remain disclosed.

Review closure is in `../reviews/integration-test-standards.md` and `../reviews/integration-test-spec.md`. Final six-viewport capture coverage is in `../final-projection/MANIFEST.md`.
