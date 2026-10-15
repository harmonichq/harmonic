# One CGM reading per five-minute slot (#519)

## Why

Within some post-meal windows the Day chart's glucose line zigzagged, because
readings arrived in pairs a few seconds apart. On a local snapshot of the
operator's own store, about a quarter of a percent of CGM rows sat less than
two minutes from a neighbour, as pairs, on a handful of days. Most pairs were
the same reading recorded twice, seconds apart. Two windows held two
disagreeing series side by side for up to about three hours.

Every analyzer read both members as separate observations. The fasting
correction-factor fit took the pairs as extra steps, which moved its estimate by
a few percent. Daily time in range on the affected days moved by up to about
three percentage points, and a carb-ratio block's counted meal runs changed.

## What changes

- The one CGM reader every analyzer and chart goes through returns one reading
  per slot. Readings chained less than two minutes apart are one slot.
- A slot whose glucose values agree keeps that value. A slot holding two
  different glucose values carries no value, as a sensor HIGH or LOW reading
  already does, so no analyzer trusts either series there. A record with no
  value beside a reading is not a disagreement.
- A ranged read answers exactly as the whole read does at its edges.
- No stored row is rewritten, and the ingest key is unchanged.

No analyzer's staging predicate changes. Only its CGM input does.
