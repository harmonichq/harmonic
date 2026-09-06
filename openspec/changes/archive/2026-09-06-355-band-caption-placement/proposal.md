# Place the By-event target-band caption clear of its own boundary (#355)

## Why

On the By-event response comparison (`EVENT · RESPONSE`), the target-range
caption `target 70–180` draws at ECharts' default `markArea` label placement:
horizontally centred in the plot, vertically centred **on** the area's top edge,
with no background. The top edge is the y = 180 band boundary, so the boundary
line runs through the middle of every glyph and the centre-tick gridline crosses
it as well. The caption also lands over the data region, so on a row whose
median traces run high it sits on the traces too. Reported in #355 against the
`24 h` window on `finding:late_bolus` and `finding:over_treated_low`, on both
synthetic QA servers and on every habit row swept.

This is a regression, not a missing feature. The rewrite that moved this chart
onto served case files dropped the label block while keeping the name it
positions:

```
$ git log --oneline -S 'insideTopLeft' -- frontend/diagnose-event-comparison.js
9553bbcc Render case-file event comparisons
8abec23e Harmonic
```

`8abec23e` is the repository's first public commit, which introduced the label;
`9553bbcc` ("Render case-file event comparisons") removed it:

```
-      data: [[{ yAxis: 70, name: 'target 70–180' }, { yAxis: 180 }]],
-      label: { show: true, position: 'insideTopLeft', color: css(surface, '--mk-muted'), fontSize: 10, fontFamily: 'Inter' },
```

The defect is deterministic through this module's own public interface — the
stage option's target series carries a `name` and no `label` key at all, so
nothing in the app places the caption:

```
$ node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { eventComparisonChartOption } from './frontend/diagnose-event-comparison.js';
const caseFile = JSON.parse(readFileSync('mockups/diagnose-workstation.synthetic/finding-case-files.json', 'utf8')).cases['finding:late_bolus'].event;
for (const mini of [false, true]) console.log(mini ? 'MINI ' : 'STAGE', JSON.stringify(eventComparisonChartOption(caseFile, [60, 200], null, mini).series[0]));
"
STAGE {"type":"line","data":[],"silent":true,"name":"Target range","markArea":{"silent":true,"itemStyle":{"color":"color-mix(in srgb,  7%, transparent)"},"data":[[{"yAxis":70,"name":"target 70–180"},{"yAxis":180}]]}}
MINI  {"type":"line","data":[],"silent":true,"name":"Target range","markArea":{"silent":true,"itemStyle":{"color":"color-mix(in srgb,  7%, transparent)"},"data":[[{"yAxis":70},{"yAxis":180}]]}}
```

(The empty value inside `color-mix(in srgb,  7%, transparent)` is the repro
passing `surface = null`, so `css()` has no element to resolve `--mk-ok`
against. In the app that token resolves; the fill is not part of this defect.)

The app already solved this exact problem for the workstation's own target band
and wrote down the rule: *a label must never be struck by linework*
(`frontend/diagnose-workstation-chart.js:1024-1038`). That caption sits at the
band's start, clears the rule it labels by a set distance, and carries an opaque
pad in the panel's ground colour so gridlines and dashed edges visibly break
behind the text. The By-event chart takes the same rank rather than inventing a
second treatment.

## What changes

- The target-range `markArea` in the By-event chart option carries a placed,
  plated label again, at the values the shipped workstation caption already
  uses: `position: 'insideStartTop'` with `distance: 10`, so the text drops off
  the y = 180 boundary into the band's own clear space, ink from `--mk-muted`,
  and an opaque knock-out plate from the panel ground token `--ck-rail`.
- `--ck-rail` is settled here, not at build time. It is defined on
  `:is(.dw, .vw)` (`frontend/theme.css:291-292`), and every mount this chart is
  handed sits inside `.dw`, so it resolves on all of them.
- The plate colour is a plain resolved colour value, never a `color-mix()`
  string. zrender's colour parser silently drops `color-mix()` on this path, a
  trap already paid for and recorded at `frontend/diagnose-workstation.js:331`;
  a dropped plate reproduces the reported defect with no error anywhere.
- The mini rank stays caption-free. The label travels inside the existing
  `mini ? {} : { … }` spread, so a quad tile keeps no axis furniture at all
  (ADR 215 amendments).
- A dependency-free Node regression through `eventComparisonChartOption` pins
  the placement, the plate and the mini's silence, so the next rewrite of this
  builder cannot drop the caption's placement again while keeping its name.

## Impact

Rendered surface only, and only the By-event response comparison. No backend, no
analyzer, no staging verdict, no served payload, no fixture, no generator, and no
other screen changes. The caption copy, the band fill, the axes, the legend and
the readout are untouched. No story in the frozen behaviour ledger
(`mockups/finding-evidence-routing.behavior.md`) covers this band caption, so the
ledger and its replays are unchanged.
