# Shared Harmonic mockup scaffold

The shipped app is the material authority. `_theme.css` imports `_theme-app.css`,
which `harmonic-v2.exploration/generate.py` extracts from `frontend/index.html`,
`shell.css`, and `theme.css`. Dark is the only shipped theme. Do not add palettes.

Import `_shell.js` and use `renderShell`, `renderMockBar`, `loadCapture`, and
`resolveColors`. The shell retains the shipped brand and control material;
v2's proposed destination names are an intentional navigation change. Its
utility buttons are visible context only in this first concept round; do not
present this as a complete interaction lock.

Serve the repository root. Link `./_theme.css` and Inter as the app does. Include
`<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>`.
`renderEpisodeChart` invokes the actual shipped `scnBuildEpisodeOption` with the
actual generated episode. Do not write a substitute glucose renderer or alter
clinical data. It returns `selectStep(index)` and `dispose()`.

`loadCapture('harmonic-v2')` returns generator provenance and `scenarios` from
the real producer on QA `behavioral-late-bolus`. This is THIN evidence:
`patterns` is empty, and `low_confidence[0]` identifies `late_bolus`, its actual
`hero_episode` and `occurrences`. Those IDs resolve in `scenarios.episodes`.
Never present it as a supported habit change or rank it against other concerns.
The representative episode and its source evidence may drive guided inspection.
`loadCapture('verify')` returns the existing generated Verify payload: `roster`
and `details`, each detail carrying `selected` with existing period/evidence data.
Do not claim the unrelated Trial caused the late-bolus example or join their data.

The mock bar, scenario selector, and illustrative-selection note are not app UI.
The concept controls are proposed app interactions. Required states: investigate,
active, ready, history, quiet, error; desktop and narrow widths. Use standard
HTML controls, source tokens, and concise copy. No KPI-card grid or nested cards.
Variant markup and hierarchy are yours. Common material/fetch/chart glue is not.
Refresh generated inputs with `.venv/bin/python mockups/harmonic-v2.exploration/generate.py`.
Before any generated artifact is committed, its `--check` must join CI in the same change.
