# Tasks — all-day carb-ratio block span

- [ ] In `frontend/diagnose-workstation.js`, build a carb-ratio block's `span`
      with `windowSpanText`, the day-edge-aware span formatter the file already
      imports from `./diagnose-workstation-chart.js`, instead of a second copy
      that reduces the block's exclusive end minute modulo one day. Leave the
      block's `wraps` flag and its drawn `spans` untouched, and leave every other
      parameter's span alone.
- [ ] Export the carb-ratio block builder from `frontend/diagnose-workstation.js`
      alongside the panel renderers `frontend/diagnose-workstation.test.js`
      already imports, and add a node test there that builds its cells from block
      payloads rather than hand-setting a span. It fails first against the
      current `00:00–00:00` and pins: a block from minute 0 to exclusive minute
      1440 spans `00:00–24:00`; a block that runs through midnight keeps the span
      it has today; and both keep their existing `wraps` and `spans` values.
