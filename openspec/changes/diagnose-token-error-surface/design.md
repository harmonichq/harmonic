# Design — A rejected API token reads as app copy on Diagnose (#361)

## ADR 361 — A failed Diagnose load renders app copy with a route out, and the server's message is never the headline

**Ruling.** When Diagnose's initial load fails, the surface renders the app's own
copy — a heading, a sentence, and, for a rejected API token, an **Open Settings**
control — inside the surface's own padding. The server's `detail` string may
appear as a secondary detail line; it is never the heading, and it is never the
only thing on the screen. The composition is decided by one pure module and keyed
on the HTTP status, not on the wording of the message.

**Context.** `showError` set `root.textContent` to the raw message under a
`dw-error` class no stylesheet defined. A wrong token therefore blanked Diagnose
to `missing or invalid bearer token` at `x=0, y=42` with `padding: 0px` and no
control, while an *absent* token got a designed placeholder with a lock icon, two
sentences and a Settings button. Same user problem, two answers, and the worse one
fires in the case where the shell's own token banner is suppressed because
`hasToken` is true for a string the server rejects.

**Why the copy lives in a pure module rather than in `showError`.** The repository's
convention is that logic lives in vue-free `.js` modules so the fast gate can test
it with no importmap and no DOM, and only rendering stays in the component. The
mapping from a caught cause to what the reader is told is exactly that kind of
logic: it has a table of cases, it is the part a regression would silently change,
and it is the part worth pinning through a public interface. The DOM assembly that
remains in `showError` is proved separately, in the browser suite that already
drives this surface.

**Why the status, never the message text.** `frontend/data.js` already carries the
status on `ApiTransportError`, and `ciq_autotune/api.py:431` is the only place the
API refuses a token — one `401`, one `detail` string, no `403` path anywhere. A
frontend that matched on `"missing or invalid bearer token"` would be parsing
prose the server is free to reword, and would silently fall back to the generic
state the day it did. Keying on `401` also keeps this a transport decision:
Harmonic's rule is that the frontend re-derives no backend verdict, and an HTTP
status is not a verdict, a threshold, or a direction.

**Why one error surface for both cases rather than a second placeholder.** A
`!diagnoseAuthError` branch in `frontend/index.html` beside the existing
`!hasToken` placeholder would have reused the shell's markup directly, but it
would leave two error surfaces for one failure — the shell's for `401`, the
workstation's raw string for everything else — and the second would stay as bad
as it is today. Rendering both through `showError` keeps one failure surface and
fixes the whole class, at the cost of restating the placeholder's pattern in DOM
the workstation builds itself.

**Why that costs no new styling vocabulary.** `.placeholder` is defined in
`frontend/index.html`'s inline stylesheet, so a workstation that leaned on it
would render unstyled anywhere the mount is exercised without the shell — which
is exactly how the browser suite drives it. The new `.dw-error` rule lives in
`frontend/diagnose-workstation.css` beside the surface it belongs to, built from
the `--mk-*` tokens that file already maps onto the app's theme. No new colour
value, no new token, and the surface styles itself wherever it mounts.

**Why `showError` may be restyled at all.** It is not locked mock code. It carries
the `PORT DEVIATION (#654)` comment written when the port landed, for the express
reason that the mock is driven by static files and never receives an HTTP failure.
The frozen behavior ledger has no story for this state, which is why nobody ever
wrote the rule for the class.

**Why the ledger amendment issues no executable ID.** The frozen ledger's stories
are replayed against the running app with a token that server accepts; a story for
a *rejected* token would need its own server arm, and the state is already pinned
by the Diagnose browser suite, which owns the surface's HTTP-boundary behavior.
The amendment records what the surface now shows so the ledger stops being silent
about it. It amends no existing story and retires none, so it needs no operator
retirement sanction — the sanction path this ledger defines is for removing a
behavior, not for writing down a new one.

**Why the shell's token banner stays broken.** `hasToken` means "a non-empty
string is saved", and every screen reads it. Making it mean "a token this server
accepts" is a shell-wide change with its own reachability question — which screens
may probe, and when — and it would touch Day, Plan, Verify and Settings. This
change deliberately leaves it, and says so, rather than half-doing it from
Diagnose.
