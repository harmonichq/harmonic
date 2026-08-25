# Diagnose evidence canvas exploration

Generated, filesystem-openable exploration of the approved evidence-canvas design. `canvas.tpl.html` contains the v7 layout, styles, and renderer; `index.html` is generated and must not be hand edited.

`generate.py` reads only the committed Diagnose workstation synthetic fixture set: `payload.json` supplies the strip, basal, and I:C block metadata; `isf-rest-window-evidence.capture.json` supplies ISF scatter data; and `ic-block-evidence.capture.json` supplies I:C run scatter and traces.

Run `uv run python mockups/diagnose-evidence-canvas.exploration/generate.py` to regenerate, or add `--check` to verify drift. The operator reference mock remains local-only and is never committed.

The ISF scatter and night bars retain the capture’s x/count shape, but use fixed-seed synthetic y values for visual legibility because the committed capture is deliberately flat; they are not measurements.
