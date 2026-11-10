# Every drill-down goes through history

## Why

The Queue's drill-downs took a history entry (ADR 594), so the platform's Back
returned from them. Previous on Changes, and Tandem Source, Pump profile and
Glossary on Settings, did not: Back left the tab, or the app (#656). And after a
Back out of any drill-down, the browser's Forward did not reopen it (#669). The
lock's interaction table says the system edge-swipe goes back from a drill-down
(§1.4).

## What changes

- Changes' Previous and Settings' three drill-downs open through the same
  router entry as the Queue's. "‹ Parent" and the platform's Back agree, a Back
  from another tab onto one opens it as it was, and a reload lands on the tab.
- A Forward onto a drill-down's entry opens that drill-down again, on the
  Queue, Changes and Settings.

## Impact

- `frontend/tab-routing.js`: one drill-down router per tab.
- The Queue, Changes and Settings screens, and the app shell that hands each
  its router.
- The `surfaces` capability.
