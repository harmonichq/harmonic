# Tasks — per-night glucose evidence for a basal slot

- [ ] Stamp the per-night facts in `analyze_basal` where `night_roster` is
  built: in-window mean glucose; entering and leaving glucose (nearest reading
  to each window boundary within the existing staleness cap, null when none);
  and the night's CGM trace from 60 minutes before slot start through slot end,
  as five-minute `{minute, bg}` bins with minutes relative to slot start.
- [ ] Stamp the slot's roster-level mean in-block glucose once per slot — the
  mean of the per-night means, each roster night counting once, null-mean
  nights excluded from the average.
- [ ] Copy the slot-level figure through the night-evidence projection verbatim
  (the per-night facts ride the existing roster pass-through), deriving nothing.
- [ ] Cover the new facts with analyzer-output tests built from N nights of
  synthetic events — never hand-set flags — including a night with no usable
  in-window CGM serving nulls, and a projection pass-through test.
- [ ] Regenerate the committed fixture with its generator and leave its
  `--check` drift gate green in the same change.
- [ ] Fast gate and drift checks green.
