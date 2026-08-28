# Adopt frontend build tooling, staged (epic)

## Why

The frontend is deliberately buildless: Vue and ECharts load from CDNs at
runtime, components live as inline templates in a ~5,500-line
`frontend/index.html`, and iteration means edit → full reload → re-navigate to
the state under inspection. That trade bought a dependency-free fast gate and
an auditable shipped artifact, and it still pays there — but the evidence-canvas
chart workstream (#203: nine chart reviews, then a wire-in round) makes the
iteration cost dominant, and #213 was about to hand-build a one-off harness
(module proxy, theme plumbing, range toggles) that standard tooling provides
off the shelf. The browser gates already hand-vendor the CDN modules to run
offline, so the repository carries vendoring cost without pinning benefit.

## What changes

Build tooling enters the repository in stages, each independently shippable:

- **Stage 1 — dev harness only.** An npm toolchain plus a Storybook-style
  component harness over the existing plain ES modules, proxying `/api` and
  `/assets` to a running `harmonic serve`. The shipped app stays byte-identical:
  no bundle step, no change to `frontend/index.html`, no change to the fast
  gate. This supersedes #213's stdlib chart-workbench deliverable; the nine
  chart reviews (#204–#212) iterate in this harness.
- **Later stages — each its own decision, filed as children when precise:**
  decomposition of the `index.html` monolith into component files, CI and
  browser-gate rework onto pinned local dependencies, CDN retirement, and —
  separately and last, if ever — a production bundle step.

The shipped artifact stays buildless by default throughout; only an explicit
future ruling changes that.

## Impact

- New: `package.json`, a lockfile, and a harness directory (locations settled
  at stage-1 triage). The fast gate remains dependency-free; harness checks run
  in a separate CI job if adopted.
- Tracker: #213 is superseded (closed not-planned in favor of the stage-1
  build child); #203's ordering note is corrected by comment; #204–#212 and
  #214 are unchanged in scope.
- Production behavior: none in stage 1, by construction.
