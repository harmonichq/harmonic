# A rejected API token reads as app copy on Diagnose, not a bare backend string (#361)

## Why

The app already owns a designed answer to "this server will not talk to you":
`frontend/index.html:1596-1602` renders a lock icon, the heading *Diagnose needs
an API token*, the sentence *Add this server's token in Settings before reading
health evidence*, and an **Open Settings** button, under `role="status"`. It is
gated on `!hasToken`, so it fires only when `localStorage.ciq_token` is absent.

A token that is present but **wrong** is the same user problem and gets none of
it. Reproduced on the synthetic revise-e2e server
(`docs/scope/361-wrong-token-diagnose-repro.mjs`, run against
`harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`,
`localStorage.ciq_token = 'not-the-token'`): thirteen API reads answer `401`,
`loadAudit`'s catch calls `setError(e.message)`, and
`frontend/diagnose-workstation.js:4085-4092` replaces the whole surface with

```
root.className = 'dw dw-error';
root.textContent = message;
```

The measured result is a `.dw.dw-error` box at `x=0, y=42`, `padding: 0px`, with
`0` buttons or links inside it, no `role`, and one lowercase unpunctuated
sentence — `missing or invalid bearer token` — which is the API's own `detail`
string, not app copy. `dw-error` has no rule in `frontend/diagnose-workstation.css`,
`frontend/theme.css` or `frontend/shell.css`, so the class is a marker and the
message inherits the bare `.dw` grid.

Two things make it worse than an ugly message. The string never names Settings or
the token, so the only way out is for the reader to already know to open Settings
from the footer. And the shell's own *No API token set. Go to Settings…* banner is
suppressed exactly here, because `hasToken` is true for a non-empty string
whatever the server thinks of it — the one piece of guidance the app has is
withheld at the moment it is needed.

The `surfaces` specification already requires that "Initial load failure,
queue-level refresh failure, case failure after refresh, and a valid unavailable
selection remain distinct visible states". Initial load failure is visible today,
but it is the transport's state, not the app's.

`showError` is not locked mock code: it carries the `PORT DEVIATION (#654)`
comment that exists precisely because the mock, driven by static files, never
receives an HTTP failure. The frozen behavior ledger
`mockups/finding-evidence-routing.behavior.md` has no story for this surface
state, which is why it was never styled.

## What changes

- One new vue-free module composes the failure copy — heading, sentence, optional
  server detail, and whether a route to Settings applies — from the caught cause.
  It classifies on `ApiTransportError.status`, which `frontend/data.js:60` already
  carries, never on the wording of the server's `detail`.
- `showError` renders that composition inside the surface: the existing
  missing-token pattern (icon, heading, sentence, primary button), reusing
  `.dw`'s own `--mk-*` tokens, and `.dw-error` finally gets the rule that centres
  and pads it. The root keeps its `dw dw-error` class, so
  `.ec-error.dw-error` and every existing selector still match.
- A rejected token gets the Settings route the missing-token placeholder already
  gives: a primary button wired through a new `settings` callback, alongside the
  `stage`, `day` and `retry` callbacks the surface is already handed.
- Every other load failure keeps the server's message, demoted to a detail line
  under app copy, so a 500 is still diagnosable but is no longer the only thing
  on the screen.
- `frontend/index.html` passes the caught error itself to `setError` instead of
  `e.message`, at both call sites in `loadAudit`'s catch. Nothing else about the
  catch moves.
- The revision is recorded where this repo records shipped-surface revisions: an
  amendment entry on the frozen behavior ledger, plus before/after renders of the
  affected state.

## Risk contract

- **Must prevent:** the saved token value, or any part of it, reaching the
  rendered surface or a screenshot; a frontend gate re-deriving a safety verdict,
  threshold or direction (this surface reads transport status only); any change
  to what the server authorizes or to any other screen's behavior.
- **Must recover:** nothing automatically. Recovery is the reader's: open
  Settings, correct the token, reload — the same recovery the missing-token
  placeholder offers.
- **Accepted failure:** a non-401 failure still shows the server's own sentence,
  now as secondary detail. It is app copy that frames it, not app copy that
  replaces it; a server message nobody wrote for a reader stays imperfect.
- **Unsupported:** the shell's global *No API token set* banner still does not
  fire for a present-but-rejected token. Making `hasToken` mean "accepted"
  touches every screen and is deliberately not in this change.
- **Evidence owed:** the copy composition is pinned by a Node test through the
  module's public interface; the rendered state is pinned by the Diagnose browser
  suite; the shipped surface's frozen stories are re-proved by the app replay.
