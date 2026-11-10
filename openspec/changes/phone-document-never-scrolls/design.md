# Design: on a phone the document never scrolls

## ADR 682 — Under the tab bar the screen's box clips, so only a page ever scrolls

**Context.** The lock's §2.2 Scrolling and §2.3 ban 6 allow nothing to scroll
but a screen's page or a desktop pane, above a fixed tab bar. The shell meets
that by sizing one box to the viewport (`#app`, `100dvh`) with the tab bar as
its bottom; the bar is not `position: fixed`, so it stays put only while the
document never scrolls. A sheet rises from a starting position a full height
below its rest (`@starting-style`), and a translated box counts toward the
document's scrollable overflow. Before #673 that overflow existed for the
length of the rise (283 px at 390 × 844 for Log carbs) and nothing scrolled it.
#673 gave the Log carbs grams field focus as the sheet mounts; the Settings
password sheet (Tandem Source, Update) focuses its field the same way, and the
Changes End sheet its first control (#582). The browser scrolled the document
to reach the focus: measured per frame in Chromium and Firefox at 360 × 740,
390 × 844 and 412 × 915, the document scrolled by the sheet's height (Log
carbs 283, Update 262, End 189 at 390 × 844) and eased back as it rose
(bisected for Log carbs: 99c915c6 scrolls 0, f30023cb scrolls 283). On Firefox
for Android a document scroll also collapses the address bar, and the tab bar
left the screen (#682). At rest no phone screen overflows. The rail layout
does: the rail is 433 px tall whatever the screen's height and the panes
stretch to it, so on a wide screen shorter than that (a phone on its side) the
document overflows by the difference (93 px at 844 × 340, 43 at 844 × 390, 33
at 1024 × 400), and its scroll is what brings the rail's last item and a pane's
end into reach.

**Decision.** While the tab bar is drawn, the screen's box clips
(`#app:has(.ui-nav--tabbar) { overflow: clip }`), so nothing drawn in it adds
to the document's overflow, whichever component draws it. Clip, not hidden: a
clipped box is no scroll container, so no focus or `scrollIntoView` can scroll
it either. Focus still moves into a sheet as it opens (#582), and the sheet
still rises. The clip keys on the drawn tab bar rather than a width, so it
follows the layout the app chose. The rail layout is not clipped and behaves
as before: making the rail and its panes fit a short screen is a design
question left open for the operator, and clipping it would cut off what the
document's scroll reaches today. The Advisory notice draws no tab bar and is
unchanged. The checks live in the one browser smoke: at 390 × 844 it opens Log
carbs and Update and samples the document's scroll position and overflow every
frame of each rise; at 844 × 340 it brings the Queue detail's Snooze and the
rail's last item on screen. The stories render in a fixed frame on a
1600 × 1000 viewport and never load the shell's style, so precheck (f) cannot
see the document, and its rule (only a page scrolls) already covers everything
inside a screen. The End sheet needs a store with an active Trial, so it is
measured (0 scroll, 0 overflow in every frame, both engines, all three phone
sizes, `c3-trial`) rather than in the smoke.

**Consequences.** On a phone a component may draw past the screen's edge (a
rising sheet, a hit area, a shadow) without moving the tab bar; what lies past
the edge is simply not drawn, and anything that must be reachable past it has
to be inside a page. The rail layout's short-screen overflow stays as it was,
and the smoke fails if it is ever cut off. The smoke also fails if a later
change lets the document scroll during a phone sheet's rise.
