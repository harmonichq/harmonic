# Synthetic baseline — #342

Base: `a1bba577ff2970e9f9ae2e5c4c53fea6bb34bc4f`. No production source changes preceded this run.
Data: `mockups/diagnose-workstation.synthetic/payload.json`, SHA256 `1509b275e9b333041ea1fb11d782a865f0a762195b720161791514210f9fdf75`.
The replay also uses its committed synthetic supplemental captures, unchanged at
this base. The server used a scratch copy of the committed QA synthetic database
with `--no-fetch --token ''`, following the worktree's AGENTS.md declaration.

The full inherited replay passed; complete output is `replay.txt`.
The focused stage/drawer run passed; complete output is `focused-replay.txt`.
Its screenshots S128–S132 record the same 1440x900 viewport. The source/style
inventory below maps to the existing frozen stories; no new base behavior or
missing inherited behavior was identified in the affected chart contract.

| Source inventory | Existing observed contract |
| --- | --- |
| diagnose-workstation.js tile click/Enter/Space, dock toggle, explorer pick | S128–S132; full replay |
| tile fullscreen/dismiss and document Escape; transient seating | S108, S119; full replay |
| tile keep toggle and coordinate buttons | S120, S122–S126; full replay |
| field ResizeObserver, width/height floors and dock crossing | S114–S116, S127, S143; full replay |
| diagnose-findings-queue.js row click, mini render and collapsed tail | S139–S144; full replay |
| diagnose-workstation-chart.js resize, updateAxisPointer and globalout | S19, S102; full replay |
| diagnose-workstation.js window drag, handles, Escape and breadcrumbs | inherited window/navigation stories; full replay |
| diagnose-workstation.css tile rail hover/focus, drawer transitions and chart sizing | inherited tile/keyboard/containment stories; full replay |
| diagnose-evidence-charts.js and diagnose-canvas-layout/state.js | option/state transformations, no extra DOM handlers; consumed by above |

The chart harness was installed from its lock and started in manufactured mode.
Its response-comparison story initially opened an empty overnight window; selecting
24 h rendered and drilled the shipped comparison chart. `harness-24h.png` is the
inspected render. The browser reported no console errors. New sequence stories
must establish their supported window before declaring themselves ready.

This is baseline evidence, not a new-chart mock or revision acceptance. The new
chart remains execution work through the frontend harness.
