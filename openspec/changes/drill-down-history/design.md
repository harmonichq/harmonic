## ADR 669 — One drill-down router per tab, and a Forward onto its entry reopens it

**Context.** ADR 594 gave the Queue's drill-downs one history entry at the
same address, marked with which drill-down it is, and reported only a Back onto
an unmarked entry. A Forward lands on a marked entry while the tab's screen
stays mounted, so nothing told the screen to open it again (#669); and the
Changes and Settings drill-downs used local state alone (#656).

**Decision.** `tab-routing.js` builds one drill-down router per tab with
drill-downs (Queue, Changes, Settings): `open` pushes the marked entry, `close`
goes Back through it, `onReturn` reports a Back or Forward onto an unmarked
entry, and `onEnter` reports the drill-down a Back or Forward onto one of that
tab's own marked entries names. Each screen opens the named drill-down on
`onEnter` as it opens one it was returned to from another tab. An entry another
tab marked is never entered by this tab's screen.

**Consequences.** The app shell holds no routing logic of its own beyond
handing each screen its router and the entry a Back landed on. A reload still
lands on the tab (ADR 594).
