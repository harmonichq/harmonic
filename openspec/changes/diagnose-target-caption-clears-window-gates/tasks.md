# Tasks — the target caption clears the drawn-window gates (#370)

- [ ] Add a failing-first regression test to
  `frontend/diagnose-workstation-chart.test.js`, through the module's public
  interface exactly as the file's existing `renderCanvas` tests do: render with a
  stub element (`{ clientWidth, setAttribute() {} }`) and a stub echarts whose
  `getInstanceByDom` returns a capturing `setOption`, then assert on the captured
  option. Drive **four** cases, not one:
  - `clientWidth: 390`, `window: [480, 960]` — the ordinary 08:00–16:00 daytime
    window at the narrowest evidence width. Gates land at 136.40 and 238.80, the
    first of them inside the caption's box, and no clear horizontal slot exists
    (see task 2).
  - `clientWidth: 400`, `window: [480, 960]` — the same window at the second
    evidence width; again a struck caption with no clear slot.
  - `clientWidth: 400`, `window: [0, 360]` — the struck side of the originally
    reported Overnight boundary, per
    `docs/scope/target-caption-overprint.spike.mjs`.
  - `clientWidth: 1010`, `window: [0, 360]` — the clear side of that boundary.

  **`clientWidth` here is the chart element's width, not the viewport's.** The
  Diagnose layout puts the chart at 390px inside a 390px viewport but at 399.6px
  inside a 768px one, so `clientWidth: 400` is the node-test stand-in for the
  768px evidence width — driving `clientWidth: 768` would render a 682px plot in
  which no gate strikes the caption at all, and would prove nothing.

  In the first three the test asserts the caption carries the **dropped**
  placement; in the fourth it asserts the caption's label object is byte-identical
  to the shipped one (`position: 'insideStartTop'`, `distance: 10`, same pad,
  colours and formatter). Locate the target-band `markArea` entry on the
  `__context` series by its `yAxis` key, never by ordinal position, and assert on
  the option the module SETS through the captured `setOption`, never through a
  `getOption()` readback — a readback reports a different shape than the setting
  call after an instance is reused. Derive the gate x's the test reasons about
  from the module's own exported `xAtMinute`, not from copied constants. Run the
  test against the unfixed module first and record that it fails for the right
  reason — the caption keeps its shipped top placement while a gate lies inside
  its box — not merely that it fails.
- [ ] Make the target-band caption **drop below the grip band** when a drawn gate
  would strike it, in `renderCanvas` (`frontend/diagnose-workstation-chart.js`),
  in the `__context` series' `markArea` target entry.

  *The predicate is unchanged and horizontal.* Compute the two drawn gate x's
  with the module's exported `xAtMinute` against the same `opts.window` /
  `opts.displayWindow` / `opts.displayOffset` the brace draws from, and the
  caption's own box from `plotBox` plus the module's existing private
  `estimateTextPx`, allowing for the label's `padding` and the grip's 4px
  half-width either side of the gate. When no gate falls inside that box the
  caption's placement is byte-identical to today's.

  *The escape is vertical, not horizontal.* A horizontal escape is not always
  available and must not be built: at `clientWidth: 390` with `window: [480, 960]`
  the plot box is `{left: 34, width: 304}` and the two gates carve it into clear
  regions of 98.4 / 94.4 / 95.2px, against a caption box of 108.8px
  (`estimateTextPx('TARGET 70–180 mg/dL', 10)` = 98.8px plus `padding: [2, 5]`).
  No region fits. At the 768px evidence width the chart is 399.6px wide, the
  gates land at 139.6 and 245.3 — the first inside the caption's padded box,
  striking its tail rather than its numerals — and the largest clear region is
  101.6px, which does not fit either. The
  occluder, by contrast, is vertically pinned at every width and every window:
  `paintBrace` sets `gripTop = Math.min(plotTop + 22, …)` with `PLOT_TOP = 20`
  and `.grip` is 22px tall, so the opaque grip band never reaches below
  chart-local **y 64**, while the target band's own floor sits near y 122 on the
  reproducing geometry.

  So when the predicate fires, place the caption so the **top of its box sits at
  or below chart-local y 64** while it remains a single line inside the target
  band, still carrying its opaque pad in the panel's ground colour, still
  anchored to the plot's left edge, and still using the same colours and
  formatter. Anchoring the caption to the band's floor rather than its ceiling
  reaches that position without reading a `clientHeight` the module has never
  read and no existing test stub supplies; if you instead compute a `distance`
  from the plot height, you must add `clientHeight` to every stub in the test
  file. Prefer the former. Follow the fit-or-move idiom the window label already
  uses in this same function; add no new exported symbol and no new module.

  The residual crosser at the dropped position is the 1px `.edge`, which is a
  hairline across the glyphs rather than a hidden digit; it is accepted and named
  in the risk contract. Do not widen the change to chase it.
- [ ] Correct the rule comment above the caption
  (`frontend/diagnose-workstation-chart.js:1026-1032`) so it names all three
  crossers and records why the pad answers only two of them: the gridlines and
  the dashed 180 rule are drawn into the canvas, the drawn-window brace is a DOM
  overlay above it, and no ECharts `z` can reach it — which is why the caption
  drops below the grip band instead. Say that the escape is vertical because the
  grip band is height-pinned while the horizontal slot can vanish. Leave the
  `markLine` numerals' knock-out pad comment as it is.
- [ ] Capture the revision evidence against the branch's declared safe start —
  the one permitted offline serve in `AGENTS.md`, copy-then-serve on the QA
  showcase, with `--no-fetch` and `--token ''` both mandatory:

  ```sh
  scratch="${TMPDIR:-/tmp}/harmonic-qa-e2e.sqlite"
  rm -f "$scratch" "$scratch-wal" "$scratch-shm" "$scratch.derived.sqlite"
  cp mockups/qa-e2e.synthetic/harmonic.sqlite "$scratch"
  uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765
  ```

  Against that server capture, at 390, 768, 900, 1100 and 1440: before/after
  crops of the caption on the Overnight preset, and before/after crops with the
  08:00–16:00 daytime window drawn — the case the node test pins, and the case a
  horizontal escape could not have satisfied. Every after-crop shows
  `TARGET 70–180 mg/dL` intact and unbroken; 1100 and 1440 on Overnight are
  additionally unchanged from before. Then run the frozen ledger's app replay
  against the same server:

  ```sh
  PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" \
    BASE_URL=http://127.0.0.1:8765 TARGET=app \
    PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json \
    node frontend/diagnose-workstation-behavior.replay.mjs
  ```

  Store the crops and the replay's output under this change's `evidence/`.

  This leg is **mandatory**, not best-effort. A sandboxed agent cannot launch
  Chromium (`AGENTS.md`, "A sandboxed agent cannot launch Chromium — escalate,
  do not diagnose"): a launch failure is escalated to the operator for an
  unsandboxed run — never recorded as a result, never reported as the leg being
  unavailable, and never chased by editing code. If the caption's y band does not
  overlap the grip band on the QA showcase — the defect needs an axis maximum low
  enough to hold the caption above y 64 — emit a named case store with
  `uv run python scripts/gen_qa_e2e_db.py --case <name> --out <scratch path>` per
  `AGENTS.md` and use that as the `cp` source, keeping `--no-fetch` and
  `--token ''`. Never commit an emitted case store.
