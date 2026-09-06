# Tasks

- [ ] Reproduce the missing restoration against the running no-fetch app on the
      generated database, recording the focused element after Escape and after
      the header Close control.
- [ ] Restore focus to the expanded chart's own Full control inside the single
      dismissal seam, after the repaint that re-creates it, so both the Escape
      key and the header Close control inherit one fix.
- [ ] Add a browser regression that fails first for the right reason and then
      proves both dismissal paths leave focus on the Full control of the chart
      that was expanded.
- [ ] Leave the behavior ledger, its replay, the entering-fullscreen focus path
      and every other Diagnose behavior unchanged.
- [ ] Run the Diagnose workstation browser suite with zero failures.
