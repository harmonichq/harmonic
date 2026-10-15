## ADR 519 — One CGM reading per five-minute slot, collapsed at read time

**Context.** The Day chart drew a zigzag in some post-meal windows. On a local
snapshot of the operator's own store (counts only), 170 pairs of CGM rows sat
less than two minutes apart. No cluster was larger than two, and the pairs fell
on 8 days. They came in two shapes. In 122 pairs the glucose value was
identical, 1–5 s apart. In two windows (48 pairs) every slot held two readings
6–8 s or 25–27 s apart. Each of those series was smooth on its own, one sat
consistently on one side of the other, and neither was a lagged copy of the
other.

`cgm_readings` is keyed on the timestamp string alone. The mapper drops the
record's `seqNum`, `cgmDataType`, `interval` and event class, so nothing stored
can tell the two members apart. The pairs are not re-pull jitter. The hourly
fetch re-pulls a 120-day window, so every reading has been pulled thousands of
times. A timestamp that moved between pulls would leave near-duplicates
throughout the history, in clusters larger than two. Each pair is therefore two
distinct records in the vendor feed for one slot. Keying on `seqNum`, the fix
the event tables needed (#198), would keep both.

Every analyzer read both members as observations. With pairs collapsed, the
fasting correction-factor fit lost 31 spurious steps and its estimate moved
about 4%. Daily time in range on affected days moved by up to about 3
percentage points, and one carb-ratio block's counted meal runs changed by one.
No staging verdict flipped on that store.

**Decision.**

1. `Store.cgm_readings`, the one reader every analyzer, chart and projection
   goes through, returns one reading per slot. Readings chained less than two
   minutes apart are one slot. The feed's cadence is five minutes, and on the
   measured store nothing else fell under four minutes.
2. A record with no glucose value adds no observation. A slot whose glucose
   values agree is its first valued reading. A slot holding two different
   glucose values is its first reading with no glucose value, as a sensor HIGH
   or LOW reading already is.
   Without the dropped fields the engine cannot tell which series is right.
   Averaging would invent a reading no sensor took, and picking one would trust
   an arbitrary series. A slot with no value fails the clean-window glucose gate
   and drops out of the glycemic panel, so an ambiguous window is treated as
   missing rather than as falsely known.
3. A ranged read looks across its edges, keeps a slot by the time of the
   reading it returns, and answers exactly as the whole read does.
4. Nothing durable changes. No row is rewritten, no migration runs, and the
   ingest key stays. The collapse is reversible by reverting the reader, and it
   needs no dedupe of existing self-hosted stores.

**Consequences.** Every CGM consumer sees the corrected series at once, with no
second implementation. The table's row count (`Store.counts`) still counts
stored rows. If a future feed delivered sub-two-minute readings, this rule
would merge them; that would need the dropped fields stored and this decision
revisited. Storing `cgmDataType` and the event class would let a later change
choose between disagreeing series instead of withholding them. That is not
needed to stop the double-counting.
