#!/bin/sh
# Probe for #304: prints every remaining two-theme reference in the named
# scope and exits 1 when any remain. Chunk 1 runs `app`; chunk 2 runs
# `contracts`. On the ticket base both modes print matches and exit 1, which is
# the fail-first proof that the probe sees what it is meant to see.
set -u
cd "$(git rev-parse --show-toplevel)"
case "${1:-}" in
  app)
    files="frontend/index.html frontend/theme.css frontend/diagnose-workstation.css frontend/verify-workstation.css frontend/diagnose-evidence-charts.js frontend/verify-workstation.js harness/index.html harness/main.js scripts/screenshots.local.mjs"
    pattern='html\.dark|html:not\(\.dark\)|localStorage[^\n]*theme|cockpit-theme|prefers-color-scheme|dataset\.theme|name="theme"|value="light"|classList\.contains\(.dark.\)|get\(.theme.\)' ;;
  contracts)
    files="frontend/cockpit-shell.browser.test.mjs frontend/diagnose-workstation.browser.test.mjs frontend/diagnose-canvas-composition.browser.test.mjs frontend/diagnose-workstation-behavior.replay.mjs frontend/diagnose-event-comparison-behavior.replay.mjs frontend/verify-660-story-behavior.replay.mjs mockups/diagnose-event-comparison-support-audit.mjs mockups/finding-evidence-routing.exploration/contrast-audit.mjs mockups/finding-evidence-routing.exploration/harness.mjs"
    pattern="'light'|\"light\"|html\.dark|html:not\(\.dark\)|cockpit-theme|theme:" ;;
  *) echo "usage: $0 app|contracts" >&2; exit 2 ;;
esac
grep -nE "$pattern" $files
test $? -eq 1
