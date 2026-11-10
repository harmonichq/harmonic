# Design: on a phone the document never scrolls

## ADR 682 — The screen's box clips, so only a page ever scrolls

**Context.** The lock's §2.2 Scrolling and §2.3 ban 6 allow nothing to scroll
but a screen's page or a desktop pane, above a fixed tab bar. The shell meets
that by sizing one box to the viewport (`#app`, `100dvh`) with the tab bar as
its bottom; the bar is not `position: fixed`, so it stays put only while the
document never scrolls. A sheet rises from a starting position a full height
below its rest (`@starting-style`), and a translated box counts toward the
document's scrollable overflow. Before #673 that overflow existed for the
length of the rise (283 px at 390 × 844) and nothing scrolled it. #673 gave the
Log carbs grams field focus as the sheet mounts, and the Settings password
sheet's field takes it the same way, so the browser scrolled the document to
reach the field: measured per frame in Chromium and Firefox at 360 × 740,
390 × 844 and 412 × 915, the document scrolled by the sheet's height and eased
back as it rose (bisected: 99c915c6 scrolls 0, f30023cb scrolls 283). On
Firefox for Android a document scroll also collapses the address bar, and the
tab bar left the screen (#682). No overflow was found at rest on any tab.

**Decision.** The screen's box clips (`overflow: clip`), so nothing drawn in it
adds to the document's overflow, whichever component draws it. Clip, not
hidden: a clipped box is no scroll container, so no focus or `scrollIntoView`
can scroll it either. Focus still moves into a sheet as it opens (#582), and
the sheet still rises. The Advisory notice is drawn in the same box before any
tab, so it becomes its own page (`[data-scroll="page"]`, its height the
viewport's) and scrolls itself on a screen too short for it. The check lives in
the one browser smoke at 390 × 844, which opens Log carbs and samples the
document's scroll position and overflow every frame of the rise: the stories
render in a fixed frame on a 1600 × 1000 viewport and never load the shell's
style, so precheck (f) cannot see the document, and its rule (only a page
scrolls) already covers everything inside a screen.

**Consequences.** A component may draw past the screen's edge (a rising sheet,
a hit area, a shadow) without moving the tab bar; what lies past the edge is
simply not drawn. Anything that must be reachable past the viewport has to be
inside a page. The smoke check fails if a later change lets the document
scroll during a sheet's rise again.
