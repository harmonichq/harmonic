# Design — window label anchor (#366)

## ADR 366 — The reserved label band is expressed in the strip's own ruler, not a constant

**Context.** The glucose-by-time-of-day strip owns its ruler: `stripGlucoseRange`
derives the field range from the pooled envelope and the target band, floored at
60 and with a ceiling of at least 200. `renderCanvas` receives that range as an
injected field and sets it as the y axis minimum and maximum, so the plot ceiling
is exactly the range's upper bound and moves with the data.

The window label's parked placement was expressed as a glucose value —
`LABEL_Y = 296` — under a comment describing "a reserved band at the top of the
plot". A reserved band at the top of a plot cannot be a constant while the ruler
beneath it moves. 296 sits above every ceiling the producer can return on the
committed synthetic sets, so the parked label and the wrapped window's CONTINUES
marker were placed off the plot and painted nothing. Because the inside placement
is switched off in the same branch, the text was lost rather than moved, with no
console error and nothing failing.

**Decision.** The parked anchor is the resolved field range's upper bound,
`range[1]` — the value `renderCanvas` already sets as `option.yAxis[0].max`. The
reserved band is stated relative to the ruler the chart just drew, so it is
correct for every ruler the pooled data can produce rather than for one that
happens to be tall enough.

The anchor alone does not settle where the text sits. The wrapped window's
CONTINUES marker carries `position: 'insideTop', distance: 5`, which is the
inside placement's own placement statement over a `markArea` that carries no
`yAxis` bound and so spans the full axis: anchored at the ceiling, the two text
tops coincide by construction. The parked window label carries
`position: labelSide`, which centres its text vertically on the anchor, so at the
ceiling it would straddle the plot's top edge instead of sitting under it. It
therefore also takes `verticalAlign: 'top'` and `offset: [0, 5]` — the inside
placement's own distance — so the two texts land on one line.

**Consequences.** The constant is retired, and with it the class of defect where a
second, independent expression of the plot's extent drifts from the axis actually
drawn. The fit/no-fit decision, the tail-shedding priority order, the chosen side,
the wording, and the option's data ordering are unchanged; only the anchor and the
parked label's vertical seating move.

What this change does not establish is the rasterised result. `renderCanvas`
builds an ECharts option, and no leg of the fast gate renders it — the node tests
inject a fake chart object that only captures `setOption` — so the guard is an
assertion over emitted option fields. That is the assurance level this geometry
already carries: the module's own fit/no-fit decision is a per-character width
estimate taken with no measuring context. The pixel confirmation is the sweep's
browser leg, which issue 350 owns for every child.

## ADR 366 — This fix owes no behavior-ledger amendment

**Context.** The Diagnose workstation is a shipped surface under a frozen behavior
ledger, `mockups/finding-evidence-routing.behavior.md`, replayed by
`frontend/diagnose-workstation-behavior.replay.mjs`. UI Craft routes a shipped
surface to `revise`, whose contract is that ledger and replay.

**Decision.** No ledger story is added or amended by this change.

**Consequences and grounding.** Two facts settle it.

First, no issued story covers the canvas window label's placement. The ledger
states its own inventory in its header (`:14`): **164 issued executable IDs** —
S01–S144, C41–C57 and D1–D3, of which S117 alone is retired. That inventory
cannot be enumerated from this file's rows: only 76 of the 164 carry a
line-start `<id> · ` row here, and the other 88 are carried in the replay's
assertions. The driver `frontend/diagnose-workstation-behavior.replay.mjs` holds
all of them — its distinct S/C/D identifiers are exactly the header's 164, with
none on either side missing from the other — so the enumeration was run against
both files together. Collecting every line that names each of the 164 and
reading those that mention a label, caption, anchor, placement or marker returns
18 identifiers, and none asserts anything about this label. `S142` (`:3162`;
replay `:3916`) is Plan's priced-tier captions. `S01`'s only mention of "the
chart's own window label" sits inside an `AMENDED #735` comment explaining why
the inspector's meta stopped restating the window range; S01 itself asserts the
drawn chip, the pressed preset, that meta, the strip header's silence, the
pooled-days phrasing and basal paint, and nothing about the label. The other 16
use "label" in an unrelated sense — accessible names, stat labels, historical
branch labels.

`P02` is not a counter-example, because it is not a story. It is a row in
§2 · Predecessor inventory (`:296-304`), a section whose own tally reads
"**56 rows · 50 kept · 0 missed · 6 retired.**" (`:1156`); the executable
stories are the S/C/D identifiers above. P02 requires the DOM resize grips to
sit below the window label's line so they never cover its text, and its evidence
line cites replay S05, which asserts grip dragging and pointer capture and says
nothing about that line. This change preserves what P02 records rather than
disturbing it: the grips are DOM elements positioned in
`frontend/diagnose-workstation.js` and are not moved, and the label's line
returns from nowhere — it is painted off the plot today — to the line the inside
placement occupies, which is the line P02 was written against.

Second, this change adds no interaction behavior and retires none; it restores a
paint placement the module's own contract already states. The durable guard for
a paint geometry invariant is the node assertion over the emitted option, which
holds for every ruler on every commit, and is stronger than a single-viewport
replay story.

The frozen replay itself runs at the sweep's single pull request, under issue 350,
which owns the browser gate legs for every child of the sweep.

## Reproduction

Run from the repository root against the unchanged module. Deterministic; the
envelopes are flat synthetic arrays built in the command itself.

```sh
node --input-type=module -e "
import { renderCanvas, stripGlucoseRange } from './frontend/diagnose-workstation-chart.js';
const L = Array.from({length:96},(_, i)=>\`\${String(Math.floor(i/4)).padStart(2,'0')}:\${String((i%4)*15).padStart(2,'0')}\`);
const flat = (v) => Array.from({length:96},()=>v);
const C = Object.fromEntries(['muted','warn','danger','targetFill','targetText','rail','windowFill','windowEdge','bandOuter','bandInner','median','targetEdge','onAccent','text','surface2','line','occurrence','meal','grid'].map((k)=>[k,'#888']));
for (const [name, p90, counts, clientWidth, win, label] of [
  ['narrow window, ample sample', 215, 12, 600, [0,360], 'OVERNIGHT 00:00-06:00'],
  ['thin sample, desktop width', 255, 0, 1396, [1080,1440], 'EVENING 18:00-24:00'],
  ['window wrapping midnight', 215, 12, 1396, [1320,120], '22:00-02:00'],
]) {
  const envelope = { labels: L, p10: flat(80), p25: flat(100), p50: flat(120), p75: flat(140), p90: flat(p90), counts: flat(counts), raw: flat(1), days: 12, pool: 45 };
  const range = stripGlucoseRange(envelope);
  let option = null;
  renderCanvas({ clientWidth, setAttribute(){} }, { getInstanceByDom: () => ({ setOption(o){ option = o; }, off(){}, on(){} }) },
    { envelope, markers: [], colors: C, supportFloor: 8, stats: { spread: 27 }, range, window: win, windowLabel: label });
  const ctx = option.series.find((s) => s.name === '__context');
  const inside = ctx.markArea.data.filter(([s]) => s.xAxis != null)[0][0].label;
  for (const d of (ctx.markPoint ? ctx.markPoint.data : []))
    console.log(name + ' | axisMax ' + range[1] + ' | inside.show ' + inside.show + ' | markPoint y ' + d.coord[1] + ' | onPlot ' + (d.coord[1] <= range[1]));
}
"
```

Output on the unchanged module:

```
narrow window, ample sample | axisMax 220 | inside.show false | markPoint y 296 | onPlot false
thin sample, desktop width | axisMax 260 | inside.show false | markPoint y 296 | onPlot false
window wrapping midnight | axisMax 220 | inside.show true | markPoint y 296 | onPlot false
```

The first row is the window name lost at a narrow element width; the second is the
insufficient-sample safety notice lost at an ordinary desktop width, because the
mandatory tail makes the label longer and so forces the parked path; the third is
the wrapped window's CONTINUES marker, which the ticket did not name and which
shares the same constant.

The `onPlot` column is this reproduction's defect diagnostic, not the change's
acceptance predicate. Its `<=` is satisfied by the ceiling itself, which is the
one value that seats a label on the inside placement's line; the acceptance
predicate is the equality against `option.yAxis[0].max` that `tasks.md` task 1
states.

## What the current suite proves, and why it missed this

`node --test 'frontend/**/*.test.js'` reports 589 passing tests on the unchanged
tree. Ten of the twelve `range:` injections in
`frontend/diagnose-workstation-chart.test.js` are `[40, 300]`; 300 is the only
ruler in the tree above 296, so the constant lands inside the plot in each of
them. The two that are not still pass. `:266` injects `[60, 220]` and asserts
that the CONTINUES marker is *emitted*, never that it is on the plot, so it is
green while the marker is invisible. `:325` already derives
`stripGlucoseRange(envelope)`, which resolves to `[60, 200]`, and is green
because it asserts nothing about the label at all.

That second exception is the useful one: a derived ruler is necessary and not
sufficient. Task 1 therefore requires both — the new test derives its range from
`stripGlucoseRange`, because a hand-chosen ruler is the assumption that hid the
defect, and it asserts the anchor equals the axis maximum it reads back from the
emitted option, because a derived ruler with no assertion about the label is what
`:325` already demonstrates is not enough.

## Why this change carries no spec delta

`openspec/specs/surfaces/spec.md` already requires, under "Diagnose separates
clock-window selection from basal verdict state and keeps chart evidence
legible", that the plotted glucose evidence and chart furniture remain readable
with and without an active clock window after every overlay is composited. A
window label painted off the plot violates that requirement as written; the
requirement does not need changing, the code does. The change is therefore
recorded with `skip_specs: true`, as 57 of this repository's 58 active changes
are.
