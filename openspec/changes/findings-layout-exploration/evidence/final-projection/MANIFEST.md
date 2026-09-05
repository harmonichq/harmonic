# Final rendered projection

Captured from ticket head `b7b8adecc3888e27bf2efc970a309f468549bbdd`; production bytes are unchanged since the reviewed phone correction `a3b46ca`.

These 58 captures supersede earlier revision screenshots containing Adjust window. The original baseline captures remain in the earlier evidence folders. All data are committed synthetic inputs: `mockups/diagnose-workstation.synthetic/payload.json` plus the replay’s existing `twoFamilyInputs`, through `openApp`. These are projection captures, separate from the QA database smoke test.

Viewports: 360×800, 390×844, 760×900, 1024×768, 1440×900, 2084×742. Each includes root, scrolled queue, selected finding, drill return, All charts, catalog dismissal, selected fullscreen, fullscreen return, and Watching. Both phones also include Filter at root and after scrolling.

The coordinator spot-checked final phone root, tablet root/catalog, 1024 selected finding, and wide root/fullscreen. The prior rendered audit inspected the 17 final phone-flow captures and two baseline captures; its report is in `../reviews/phone-audit-r1.md`. Capturing all states is not a claim that every one received a new independent audit.

Reproduce from the repository root with the configured browser-gate environment:

```sh
PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json CAPTURE_OUTPUT=/tmp/harmonic-341-final-capture CAPTURE_VARIANT=final node openspec/changes/findings-layout-exploration/evidence/final-projection/capture.mjs
```

`PLAYWRIGHT_MODULE` and `VENDOR_DIR` must point to the existing browser-gate dependencies. Chromium requires an execution environment that permits its launch.
