# #433 implementation checklist

Base: origin/main a4d374a72c8048d9d93ee4925805b91cf5674835. The executor never
binds a port: the coordinator runs every browser leg, and the replay story IDs
for this ticket are S151–S153. `design.md` holds the verified facts, both
decisions, the measurement, the revise preparation and the risk contract.

## 1. Measurement, before any implementation

- [ ] 1.1 Record the coordinator's base measurement (design.md,
  "Measurement"): the numbers in design.md's "Measured facts", and the raw
  output verbatim under `docs/scope/433-basal-strip-short-window-evidence/`.
  If the output meets design.md's contingency, stop and report to the
  coordinator, and implement nothing further. The contingency is met when the
  strip clips at a true 1200×736 CSS viewport, when any canvas-pane row
  resolves larger than its declared track, or when 1200×560 or 832×560 does
  not clip on base by at least 20px.

## 2. The canvas pane scrolls on short desktop windows

- [ ] 2.1 Read UI Craft's `reference/web-implementation.md`, then implement
  surfaces **The basal lane stays reachable on short desktop windows** in
  `frontend/diagnose-workstation.css`. Give the desktop `.canvas-pane` rule a
  vertical scroll (`overflow-y: auto`) and leave its row tracks, the
  `[data-canvas-full]` rules and the ≤831px and ≤480px blocks unchanged. Add
  no `scrollbar-gutter`, which would narrow the pane at the supported sizes.
  Rewrite the #359 comment on that rule: the pane now owns a vertical scroll,
  so its width backstop computes to `hidden`, and S151 guards `scrollLeft`.
  Let `.lane-key` wrap between whole entries (`flex-wrap: wrap`, with a row
  gap no larger than the key's own line spacing). Each `#lane-key > span`
  entry stays one unbroken line. Rewrite the #413 "one line, always" comment
  there: a wrapped key takes its line from the chart inside the fixed body,
  and it wraps only when the pane is too narrow, never at 1280×720 or
  1440×900.
- [ ] 2.2 Add S151 to the desk ledger and replay. S151, S152 and S153 are each
  built the way S113 is: a `C4_STORIES` body, an
  `appOnly('HV2-17', …)` export carrying its
  `// STORY:harmonic-v2-desktop:<id>` marker, a `REGISTRY` entry, and case
  `basal-verdict-gallery` in `STORY_CASES`. For each of
  1200×736, 1200×560 and 832×560, set the size with `page.setViewportSize`
  and restore the run's size afterwards. Require all of these:
  - the document has no root scroll;
  - when `#lane-wrap` is not wholly inside `.canvas-pane`'s visible box at
    rest, the pane's computed `overflow-y` is `auto` or `scroll`;
  - a mouse wheel over the pane's header rail scrolls the pane until
    `#lane-wrap`, `#lane-key`, every `#lane-key > span` entry and every
    `#lane > .lane-cell` lie inside both the pane's visible box and the
    viewport;
  - horizontally, at rest, every `#lane-key > span` entry and every cell lies
    inside the pane's client box, whose right edge is the pane's left edge plus
    `clientLeft` plus `clientWidth`; checking only `#lane-key`'s own box is
    not enough;
  - no entry is split: each entry's height is one line, no taller than the
    lead entry's;
  - every other ancestor's `scrollTop` stays 0, and the pane's `scrollLeft`
    stays 0.

  Never set `scrollTop` or `scrollLeft`, and never reach the strip through a
  Playwright action that scrolls into view. On base, the `overflow: hidden`
  ancestors can be scrolled by script or by focus, which would fake
  reachability. Failure messages name the measured overrun in pixels, per
  axis.

  Factor the in-page geometry check into an exported helper, as S113's is.
  Give it fake-page node tests in `frontend/c4.replay.test.js`: one passing
  lane, one failing on a key entry past the pane's right edge, and one failing
  on a strip below a pane that cannot scroll.
- [ ] 2.3 Add S152: on `basal-verdict-gallery`, at each of S151's three sizes
  (1200×736, 1200×560 and 832×560), set with `page.setViewportSize` and
  restored afterwards, handle every cell the key counts as raise or lower:
  - reach it as S151 does;
  - click it with `page.mouse.click` at the centre of its visible box, never
    a locator click;
  - require its panel to show a Recommended value and the Stage change button
    (`.stagebtn`); the inspector's own scroll may bring the button into view;
  - require the picked cell to still lie inside the pane's visible box.
- [ ] 2.4 Amend S113 under the Q2 sanction (design.md, "Revise preparation"):
  at the run's own size (1280×720 or 1440×900), require all of these at rest:
  - `#lane-wrap` and every `#lane-key > span` entry lie wholly inside
    `.canvas-pane`'s visible box;
  - the key stands on one line, meaning every entry shares the lead entry's
    top;
  - the pane has no scroll range (`scrollHeight <= clientHeight + 1`).

  Update `assertBasalLaneGallery`'s fake-page node tests in
  `frontend/c4.replay.test.js` to include the pane: one passing case, and
  cases that fail when the wrap overruns the pane, when the pane scrolls, and
  when the key wraps onto a second line.

## 3. The recurring-lows key word (D6)

- [ ] 3.1 Implement surfaces **The basal lane key names a recurring-lows lower
  apart from a measured lower**:
  - In `buildSlotLane` (`frontend/diagnose-workstation-chart.js`), mark an
    asserting lower whose served `safety_status` is exactly
    `lower (recurring lows)`, and count it apart from measured lowers. Its
    verdict stays `down`, and `asserts` is unchanged.
  - `renderLaneKey` renders the entry `lower · recurring lows <count>` with
    the lower swatch.
  - `renderLane` gives such a cell the title and accessible name
    `<label> basal slot, suggests a lower because lows keep happening at this
    hour`.
  - Read no night count, floor or rate.
  - Node tests through `buildSlotLane`'s output: a recurring-lows lower with
    `estimate.n` 0; a measured lower; a `held (recurring-low gate)` slot,
    which stays hold with no reason; and a lane holding both lower kinds,
    whose two counts equal their cells. Node tests through `renderLane` for
    the cell's title and accessible name.
- [ ] 3.2 Amend S113 with a `withCase('basal-recurring-low-no-clean-median')`
  variant. On the 24 h rail:
  - the key reads `lower · recurring lows 1` and has no `lower` entry;
  - the 05:00 cell keeps the `down` paint token and glyph that its key mark
    shares, and its accessible name says recurring lows;
  - opening the cell shows the verdict `lower (recurring lows)`, a
    Recommended value and the Stage change button.

  Scope S113's per-verdict count check to verdict plus reason, so it stays
  exact on any lane. The variant keeps S113 as the one story on that case, so
  `SMOKE_STORIES` and its pinned hash do not change.

## 4. Key and panel agree

- [ ] 4.1 Add S153, implementing surfaces **Each basal key verdict agrees with
  its slot's panel**. On `basal-verdict-gallery`, at the run's size, open
  every cell once:
  - every raise and lower cell shows a Recommended value and the Stage change
    button;
  - every hold, insufficient and no-data cell's panel contains "no direction
    asserted" and no `.stagebtn`.

  It needs no application change and is expected to pass on base.

## 5. Records

- [ ] 5.1 In the desk ledger `mockups/harmonic-v2-desktop.behavior.md`, add
  one `## #433 amendment — 2026-09-23` section, following the #413 and #414
  pattern. It holds:
  - the S151–S153 entries (element, source, lock, data, evidence, status);
  - the amended S113 entry, with its dated sanction and the old-fails /
    new-passes proof;
  - its handler-inventory rows.

  Never rewrite, re-date or replace an existing `★ FROZEN` block. Leave the
  header's inventory line alone: that line, ACCEPTANCE.md's count sentence,
  `mockups/INDEX.md`'s count literal and the one release freeze block are
  coordinator-owned.
- [ ] 5.2 On this branch, move only the numeric inventory literals to
  150 / 131 / 19: `mockups/sweep/harmonic-v2-desktop/acceptance.py`
  `inventory()` and `acceptance.test.py`'s counts, so this branch's own tests
  pass. Pin S151–S153 in `frontend/c4.replay.test.js` beside S108–S117: each
  is registered once, with term `HV2-17` and case `basal-verdict-gallery`.
- [ ] 5.3 Update DESIGN.md's "Basal lane" entry with three things: the
  recurring-lows key word, the key wrapping between whole entries near the
  narrowest split, and the canvas pane's own scroll on short desktop windows.

## 6. Verification

- [ ] 6.1 Run these locally, all green; none of them binds a port:
  - `npm ci && npm run build`;
  - the fast gate `node --test 'frontend/**/*.test.js'`;
  - OpenSpec strict validation;
  - the three guards from `AGENTS.md`;
  - `acceptance.test.py`'s socket-free classes (`InventoryProofTest`,
    `ReplayPlanTest`, `SmokeSelectionTest`);
  - `acceptance.py inventory --out <scratch>`.

  The coordinator runs the rest of `acceptance.test.py`, which binds a
  socket, and the backend pytest.
- [ ] 6.2 Hand the coordinator the port-bound legs. It runs them and returns
  the logs, which go under
  `docs/scope/433-basal-strip-short-window-evidence/`:
  - fail-first on base, with this branch's replay harness and case recipes
    laid over a base worktree, `ONLY=S113,S151,S152,S153` at both sizes:
    S151 and S152 fail at the short size for the clipping reason, S113 fails
    on the recurring-lows key word, and S153 passes;
  - the same selection on the branch, all passing at both sizes;
  - the render matrix in design.md;
  - the complete desk ledger at both sizes, once, on the commit that will be
    pushed.
