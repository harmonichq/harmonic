# Design: the phone's Day month scrolls inside itself

## ADR 649 — The phone's Day month is the one panel that scrolls inside itself

**Context.** The Day month drops down from the header's day as its weeks, each
a DayRibbon 114 px tall (§4.2). On phone it was positioned under the header
with no height cap, so wherever the weeks outgrew the room between the header
and the tab bar — every month at 375 × 667, a six-week month at 375 × 812 and
412 × 915 — it ran over the tab bar, its last week out of reach and no scrim
left to tap (#649). The lock's §2.3 ban 6 allows nothing to scroll but a
screen's page or a desktop pane, and the story check's precheck (f) enforced
it with no exception. The operator was asked on 2026-11-10: "scroll inside it,
or shorter week rows?" He chose to scroll inside it; the week rows stay as
locked.

**Decision.** On phone the month is drawn in the room between the header and
the tab bar, capped to end at least 48 px of scrim above the tab bar (whose own
height carries the device's bottom inset, `--ui-inset-bottom` /
`--ui-device-inset-bottom`). Its name and ‹ › are fixed at its top and its weeks
scroll beneath them. Each month opens at its top, or with the selected day's
week in view, scrolled once the ribbons have measured their width. The
scrolling weeks are never a Tab stop of their own (`tabindex="-1"`), so a month
with no day to pick does not gain a stray, unnamed stop; Tab still goes round
the month's controls, focus moving to a day scrolls it into view, and Escape
closes the month and gives focus back to the header's day. Precheck (f) reads
an allowlist, `SCROLL_EXEMPT`, in the same form as the interaction prechecks'
allowlist, naming exactly this panel's weeks
(`.ui-dayscreen__month--phone > .ui-dayscreen__weeks`) with its reason; the
`NestedScroll` probe still fails any other scroller, and a second probe draws
the month's weeks beside the same weeks elsewhere, and only the stray one fails.
Desktop and tablet are unchanged: measured with a six-week month, the popover
fits at 768 × 1024, and in a shorter window it runs into its pane, which
scrolls as the page and brings the last week into view.

**Consequences.** Ban 6 has one deliberate exception, recorded in the lock's
ban, §1.4, §4.2 DayRibbon and §2.5 (2026-11-10). Any further exception is a new
operator decision and a new allowlist entry with its reason; the unit test pins
the allowlist to this one selector. The stories' stepped months now serve the
generated May navigator's days with readings in turn, so a six-week month's
last week has a day to pick.
