# Tasks

- [ ] Reproduce both halves against the running no-fetch app on the generated QA
      database, recording the focused element after the Full control opens
      one-chart fullscreen and after each of Escape and the header Close control.
- [ ] Land keyboard focus on the expanded chart's own container when the Full
      control opens one-chart fullscreen, in that one handler, rather than on the
      inspector the state has just marked inert.
- [ ] Restore focus to the expanded chart's own Full control inside the single
      dismissal seam, after the repaint that re-creates it, so both the Escape
      key and the header Close control inherit one fix.
- [ ] Add a browser regression that fails first for the right reason and then
      proves, from both opener contexts — the stage tile, and a cell of an open
      All charts catalog — that opening lands focus on the expanded chart's own
      container and that Escape and Close each return focus to that chart's own
      Full control.
- [ ] Leave the behavior ledger, its replay, the All charts focus behavior, and
      every other Diagnose behavior unchanged.
- [ ] Run the repository's six-command fast gate, the Diagnose workstation
      browser suite, and the Diagnose workstation behavior replay with zero
      failures.
