# S140 queue/catalog witness disposition

Date: 2026-09-05

The coordinator grounded S140 with the real fixture opener and the same
synthetic payload used by the replay. The raw probe at
`/private/tmp/ticket-341-start/s140-dom-probe.txt` reported:

```text
before {"rowMinis":1,"renderedRowIds":["ic:720","basal:30-90","basal:330-360","finding:over_treated_low","finding:carb_undercount","finding:correction_on_iob","finding:correction_stacking"]}
after {"rowMinis":0,"catalogCharts":1}
matched identical served median points 7
comparison identical served median points 7
```

S140 was reading the queue mini only after opening **All charts**, even though
that temporary full-canvas state correctly removes the hidden queue minis. The
failure was therefore a replay lookup-order defect, not a data or product
defect.

The witness now snapshots the live queue series before opening **All charts**,
then reads the live catalog series. Its existing exact comparisons remain
unchanged for both served cohorts.

Focused safe served-app result: 1/1 stories passed —
`s140-row-before-catalog-focused.txt`.
