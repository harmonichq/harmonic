#!/bin/sh
# #347 generated facts — every `command → output` block the scope ledger cites,
# regenerated from the checked-out tree. Run from anywhere; prints to stdout.
#   sh docs/scope/347-generated-facts.sh
set -u
cd "$(dirname "$0")/../.." || exit 1
run() { printf '$ %s\n' "$1"; sh -c "$1" 2>&1; echo; }
echo "## HEAD"; run 'git log -1 --format="%h %s"'
echo "## Toolchain"
run 'node --version; npm --version'
run 'command -v docker; echo "exit=$?"'
run 'uv --version'
echo "## The shell today"
run 'wc -l < frontend/index.html'
run "grep -n '<script type=\"importmap\">\\|cdn.jsdelivr\\|<script type=\"module\">' frontend/index.html"
run "grep -o -E \"from ['\\\"]/assets/[a-z0-9-]+\\.js['\\\"]\" frontend/index.html | sort -u | wc -l"
run "grep -c 'window.echarts' frontend/*.js | grep -v ':0'"
run "grep -c '@app.get(\"/assets/' ciq_autotune/api.py"
run "grep -n 'SPA_PAGES =' ciq_autotune/api.py"
run "grep -n 'assets' frontend/index.test.js"
echo "## Browser legs today"
run "grep -n 'openApp\\|VENDOR_DIR' mockups/diagnose-event-comparison-support-audit.mjs frontend/diagnose-canvas-composition.browser.test.mjs | head -8"
run "grep -l 'index.html' frontend/*.browser.mjs frontend/*.browser.test.mjs frontend/*.replay.mjs mockups/diagnose-event-comparison-support-audit.mjs"
run "grep -c 'VENDOR_DIR' frontend/day-surface.browser.mjs frontend/plan-first-match.browser.mjs frontend/diagnose-workstation.browser.test.mjs frontend/diagnose-canvas-composition.browser.test.mjs frontend/cockpit-shell.browser.test.mjs frontend/browser-runner.browser.test.mjs frontend/diagnose-workstation-behavior.replay.mjs frontend/diagnose-event-comparison-behavior.replay.mjs frontend/verify-660-story-behavior.replay.mjs mockups/diagnose-event-comparison-support-audit.mjs"
run "grep -n 'createServer' frontend/day-surface.browser.mjs frontend/plan-first-match.browser.mjs"
run "grep -n 'stageProbe && path' frontend/diagnose-workstation-behavior.replay.mjs"
run "grep -n \"for (const path of \\['/assets/tab-routing.js'\" frontend/cockpit-shell.browser.test.mjs"
run "grep -n 'cdn.jsdelivr' frontend/diagnose-workstation.browser.test.mjs"
run "grep -n 'PLAYWRIGHT_MODULE\\|VENDOR_DIR' frontend/browser-gates-fail-closed.test.js"
echo "## CI facts"
run "grep -n -E 'run: (uv run python (scripts|mockups)/|python3 scripts/|node )' .github/workflows/ci.yml"
run "grep -n -E 'gate:|vendor:' .github/workflows/ci.yml"
run "grep -n \"if: github.event_name == 'push' && github.ref == 'refs/heads/main'\" .github/workflows/ci.yml"
run "grep -n 'ciq-vendor\\|matrix.vendor' .github/workflows/ci.yml"
echo "## Public tree"
run "grep -n -E '^frontend/|^harness/|^\\.dockerignore|^Dockerfile|^uv\\.lock|^package|^vite|^tsconfig' scripts/public_allowlist.txt"
run "grep -n -E '^dist/|^node_modules/' .gitignore"
run "cat .dockerignore"
echo "## Docker"
run "grep -n 'COPY\\|FROM' Dockerfile"
echo "## The authorised offline server"
run "grep -n 'harmonic serve --no-fetch' AGENTS.md .github/workflows/ci.yml"
