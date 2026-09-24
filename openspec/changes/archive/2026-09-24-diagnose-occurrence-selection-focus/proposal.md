# In-place Occurrence selection focus (#105)

## Why

A reader who directly chooses a rendered Occurrence must remain on that row
after the case file repaints. The #101 roster work may already have delivered
that behavior, so this ticket measures it before changing product code.

## What changes

- Add S81 as a permanent app replay guard for selecting the second rendered
  Occurrence directly.
- Record the measured PATH A result: #101's existing render-path focus
  restoration already covers in-place selection.
- Make no production behavior change.
