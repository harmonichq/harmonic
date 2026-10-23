#!/usr/bin/env bash
# The evidence #620's risk contract owes. Run from the repository root.
set -euo pipefail
openspec() { npx --yes @fission-ai/openspec@1.14.0 "$@"; }
spec=openspec/specs/eating-sequences/spec.md

echo '== the rewrapped spec keeps every word of main'
diff <(git show origin/main:"$spec" | tr -s ' \n' '\n\n') <(tr -s ' \n' '\n\n' < "$spec")
! grep -n '^<' "$spec"

echo '== the gate block runs every named case CI runs, in CI order'
cases() { grep -oE -- '^ *uv run python scripts/smoke_app.py --case [a-z0-9-]+' "$1" | sed 's/^ *//'; }
diff <(cases AGENTS.md) <(cases .github/workflows/ci.yml)
! grep -n 'correction factor' .github/workflows/ci.yml

echo '== the branch validates'
openspec validate --all --strict
python3 scripts/check_adr_numbers.py

echo '== recommendations-redesign archives on a scratch copy'
scratch=$(mktemp -d)
git archive HEAD openspec | tar -x -C "$scratch"
(cd "$scratch" && openspec archive recommendations-redesign --yes && test ! -e "$spec" && openspec validate --all --strict)
echo 'verify: pass'
