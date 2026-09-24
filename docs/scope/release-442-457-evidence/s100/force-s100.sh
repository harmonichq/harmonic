#!/usr/bin/env bash
# force-s100.sh <tree> [runs-per-mode=10] [modes="case-file focus"]
#
# Scratch-only wrapper around force-s100.mjs. For one tree it:
#   1. builds nothing — the tree must already be built (npm ci && npm run build)
#      and synced (uv sync --frozen --extra api);
#   2. refuses to start if port 8765 already answers;
#   3. copies the showcase store into scratch through the tree's own replay copy
#      path (frontend/replay-cases.mjs createCaseServer().prepare: copy plus
#      the follow-up reconcile the replay runs on every generated case);
#   4. starts, from that tree, exactly the replay's serve command:
#        uv run harmonic serve --no-fetch --token '' --db <copy> --port 8765
#   5. runs the harness <runs> times per mode against that one server;
#   6. stops the server, even on failure or interrupt.
#
# Env: PLAYWRIGHT_MODULE (required), VIEWPORT (default 1280x720),
#      SCRATCH (default: a fresh mktemp directory; every log lands there).
# Exit: 0 all PASS · 1 any FAIL · 2 any VOID (a non-discriminating run) · 3 environment.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TREE_ARG="${1:?usage: force-s100.sh <tree> [runs-per-mode] [modes]}"
TREE="$(cd "$TREE_ARG" && pwd)"
RUNS="${2:-10}"
MODES="${3:-case-file focus}"
: "${PLAYWRIGHT_MODULE:?PLAYWRIGHT_MODULE is required — this wrapper never skips}"
export PLAYWRIGHT_MODULE
export VIEWPORT="${VIEWPORT:-1280x720}"
export BASE_URL="http://127.0.0.1:8765"
SCRATCH="${SCRATCH:-$(mktemp -d "${TMPDIR:-/tmp}/force-s100.XXXXXX")}"
mkdir -p "$SCRATCH"

if [ ! -f "$TREE/frontend/dist/index.html" ]; then
  echo "FATAL: $TREE has no built shell (frontend/dist/index.html); this wrapper builds nothing"
  exit 3
fi
if curl -fsS -m 1 "$BASE_URL/api/status" >/dev/null 2>&1; then
  echo "FATAL: port 8765 already answers; stop that server first (never two port-bound legs at once)"
  exit 3
fi
node "$HERE/force-s100.mjs" "$TREE" --imports-only

# 3. The replay's own case copy, not a re-implementation of it.
DB="$(cd "$TREE" && node --input-type=module -e "
import { createCaseServer } from './frontend/replay-cases.mjs';
const server = createCaseServer({ directory: process.argv[1], repo: process.cwd() });
const { db } = await server.prepare('S100', 'showcase');
process.stdout.write('DB=' + db + '\n');
process.exit(0);
" "$SCRATCH" | sed -n 's/^DB=//p')"
[ -n "$DB" ] && [ -f "$DB" ] || { echo "FATAL: the showcase copy did not land under $SCRATCH"; exit 3; }
echo "# showcase copy $DB"

# 4. Its own process group, so stopping it takes uv and the server child together.
set -m
( cd "$TREE" && exec uv run harmonic serve --no-fetch --token '' --db "$DB" --port 8765 ) \
  >"$SCRATCH/serve.log" 2>&1 &
SERVER=$!
set +m
stop() {
  if kill -0 "$SERVER" 2>/dev/null; then
    kill -TERM -- "-$SERVER" 2>/dev/null || kill -TERM "$SERVER" 2>/dev/null || true
    for _ in $(seq 1 40); do kill -0 "$SERVER" 2>/dev/null || break; sleep 0.25; done
    kill -KILL -- "-$SERVER" 2>/dev/null || true
  fi
}
trap stop EXIT INT TERM

ready=0
for _ in $(seq 1 120); do
  if curl -fsS -m 1 "$BASE_URL/api/status" >/dev/null 2>&1; then ready=1; break; fi
  kill -0 "$SERVER" 2>/dev/null || { echo "FATAL: the server exited; see $SCRATCH/serve.log"; exit 3; }
  sleep 0.25
done
[ "$ready" = 1 ] || { echo "FATAL: the server did not become ready; see $SCRATCH/serve.log"; exit 3; }
echo "# serving $TREE on 8765 (pid group $SERVER) · viewport $VIEWPORT · logs $SCRATCH"

any_fail=0
any_void=0
for mode in $MODES; do
  pass=0; fail=0; void=0
  for run in $(seq 1 "$RUNS"); do
    set +e
    node "$HERE/force-s100.mjs" "$TREE" --mode "$mode" 2>&1 | tee "$SCRATCH/$mode-$run.log"
    code=${PIPESTATUS[0]}
    set -e
    case "$code" in
      0) pass=$((pass + 1)) ;;
      1) fail=$((fail + 1)); any_fail=1 ;;
      2) void=$((void + 1)); any_void=1 ;;
      *) echo "FATAL: the harness exited $code on $mode run $run; see $SCRATCH/$mode-$run.log"; exit 3 ;;
    esac
  done
  echo "# mode=$mode tree=$TREE pass $pass fail $fail void $void of $RUNS"
done

if [ "$any_void" = 1 ]; then exit 2; fi
if [ "$any_fail" = 1 ]; then exit 1; fi
exit 0
