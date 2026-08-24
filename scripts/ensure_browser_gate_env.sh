#!/bin/sh
# Provision (once) and reuse the local browser-gate toolchain, instead of the
# throwaway mktemp recipe in AGENTS.md. Everything lands under one cache root:
#
#   ~/.cache/harmonic-browser-gate/pw      an isolated playwright@1.61.1
#   ~/.cache/harmonic-browser-gate/vendor  the two CDN modules the suites route through
#
# Chromium itself goes to Playwright's own per-user browser cache, which the
# pinned playwright version manages and reuses across checkouts.
#
# Idempotent: every piece is checked before it is fetched, so reruns cost one
# stat each. Prints the exports the gate legs need; use with:
#
#   eval "$(scripts/ensure_browser_gate_env.sh)"
#   PAYLOAD=... node --test frontend/diagnose-workstation.browser.test.mjs
#
# Output goes to stderr while provisioning; only the exports print to stdout.
set -eu

ROOT="${HARMONIC_BROWSER_GATE_CACHE:-$HOME/.cache/harmonic-browser-gate}"
PW="$ROOT/pw"
VENDOR="$ROOT/vendor"
mkdir -p "$PW" "$VENDOR"

[ -f "$VENDOR/vue.esm-browser.js" ] || \
  curl -fsSL https://unpkg.com/vue@3/dist/vue.esm-browser.js -o "$VENDOR/vue.esm-browser.js" 1>&2
[ -f "$VENDOR/echarts.min.js" ] || \
  curl -fsSL https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js -o "$VENDOR/echarts.min.js" 1>&2
[ -d "$PW/node_modules/playwright" ] || \
  npm install --prefix "$PW" playwright@1.61.1 --silent 1>&2
# No --with-deps: it can stall on a sudo prompt for system packages; the CI
# recipe keeps it, and a local macOS/Linux dev box already has what it needs.
npx --prefix "$PW" playwright install chromium 1>&2

echo "export PLAYWRIGHT_MODULE=\"$PW/node_modules/playwright\""
echo "export VENDOR_DIR=\"$VENDOR\""
