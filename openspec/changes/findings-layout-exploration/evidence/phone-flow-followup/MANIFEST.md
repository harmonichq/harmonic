# Phone-flow follow-up evidence

This directory records the bounded phone correction based on integrated ticket
commit `bc58840`. Every app capture uses the committed synthetic payload
`mockups/diagnose-workstation.synthetic/payload.json` with the replay opener's
`twoFamilyInputs`; no patient data or live fetch is involved.

## Authoritative preview-ready renders

`preview-ready-*` is the final inspected set for this follow-up:

- `preview-ready-{390x844,360x800}-root.png`
- `preview-ready-{390x844,360x800}-scrolled-queue.png`
- `preview-ready-{390x844,360x800}-filter-{root,scrolled}.png`
- `preview-ready-{390x844,360x800}-selected-finding.png`
- `preview-ready-{390x844,360x800}-all-charts.png`
- `preview-ready-{390x844,360x800}-selected-fullscreen.png`
- `preview-ready-{390x844,360x800}-watching.png`
- `preview-ready-1440x900-root.png`

The frozen images were inspected at actual size. The phone roots show one
shell-owned reading flow; queue captures show complete full-width rows and
their served miniatures; Filter is adjacent to its trigger both above the low
root trigger and below the scrolled-high trigger; chart action targets remain
inside the tile; the full x-axis name remains inside the plot; and the desktop
composition is unchanged.

`before-bc58840-*` is the rejected integrated arrangement captured before the
follow-up from the same source bytes. `after-phone-flow-*` and
`after-phone-flow-v2-*` are historical intermediate captures and are not the
authoritative visual result.

## Fail-first evidence

- `bc58840-phone-flow-fail-first.txt`: the old layout had no shell reading
  overflow and retained independent canvas and queue scrollports.
- `filter-placement-fail-first.txt`: the fixed-position menu was 377px from its
  trigger.
- `chart-controls-fail-first.txt`: a 44px rail action ended 20px beyond its
  tile.
- `window-rail-fail-first.txt`: adjacent preset words at 360px had less than
  the required visible separation.

## Verification covering the preview-ready delta

- `preview-ready-browser.txt`: 8 focused Chromium cases passed, covering the
  360/390 reading flow, real touch drag and navigation, root/catalog/fullscreen
  containment, useful previews, nonzero catalog return, drill return, and
  Filter placement/targets.
- `focused-node-tests.txt`: 40 Node cases passed.
- `generated-artifacts-check.txt`: source-coupled finding-routing artifacts are
  current.
- `drive-local-webapp-final.txt` and `drive-local-server-final.txt`: the shipped
  app mounted from a copied synthetic QA database under `--no-fetch --token ''`;
  `Adjust window` was absent and the browser console had no errors. The driver
  screenshot is intentionally outside the repository at
  `/private/tmp/ticket-341-phone-driver-smoke-final.png`.

## Historical aggregate results and deferred work

`diagnose-workstation-browser-final.txt` records 60/60 and
`diagnose-canvas-composition.txt` records 14/14 before the coordinator's final
Filter/control/axis findings. They are retained as historical evidence and are
not claimed to cover the final visual delta. `diagnose-workstation-browser.txt`
records the earlier 59/60 Filter failure. `cockpit-shell.txt` is an intentionally
interrupted partial run (four passing cases, no aggregate result) from the
coordinator's scoped stop and is not a gate result.

Per the coordinator's latest instruction, the full 163-story replay and broad
browser gates are deferred until this preview-ready set receives visual
acceptance.
