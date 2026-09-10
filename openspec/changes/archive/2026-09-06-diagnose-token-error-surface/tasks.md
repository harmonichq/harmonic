# Tasks — A rejected API token reads as app copy on Diagnose (#361)

## 1. Compose the failure copy in one pure module

- [x] Add `frontend/diagnose-load-failure.js`, a vue-free module in the shape the
      other `frontend/diagnose-*.js` helpers already take (no DOM, no `vue`
      import, no `localStorage` read), exporting one function
      `diagnoseLoadFailure(cause)`.
- [x] It returns `{ icon, title, body, detail, action }` where `icon` is
      `'lock'` or `null`, `title` and `body` are always non-empty app copy,
      `detail` is a string or `null`, and `action` is `'settings'` or `'retry'`.
      Every failure names a route out, so `action` is never `null`.
- [x] A cause whose numeric `status` is `401` returns
      `icon: 'lock'`,
      `title: "Diagnose can't use this API token"`,
      `body: "This server rejected the token saved in this browser. Update it in Settings, then reload."`,
      `detail: null`, `action: 'settings'`.
      `frontend/data.js:60` already throws `ApiTransportError(res.status, …)`, and
      `ciq_autotune/api.py:431` is the only place the API refuses a token — it
      answers `401` and nothing answers `403`, so `401` is the whole mapping.
- [x] Every other cause returns `icon: null`,
      `title: "Diagnose couldn't read this server's evidence"`,
      `body: "The evidence request failed before Diagnose could read it."`,
      `action: 'retry'`, and `detail` set to the cause's own message — the string
      itself when the cause is a string, `cause.message` when it is an `Error` —
      or `null` when there is no non-empty message. A 500, a 404, an empty body, a
      malformed body and an aborted fetch all land here, and all of them offer the
      reader the same route out.
- [x] Classify on `status` only. Never match on the wording of the server's
      `detail` string, and never return a server-authored string as `title` or
      `body`.
- [x] Add `frontend/diagnose-load-failure.test.js` (Node's built-in runner,
      matching the sibling `.test.js` files) covering: a `401` cause returns the
      token copy and the `settings` action; a `500` cause returns the generic copy
      with the server's message as `detail` and the `retry` action; a plain string
      cause (`showError`'s two internal callers pass one) returns the generic copy
      with that string as `detail` and the `retry` action; a cause with no message
      returns `detail: null` and still returns the `retry` action; no returned
      `title` or `body` ever equals the server's message; and no case returns a
      null or absent `action`.

## 2. Render that composition inside the surface

- [x] In `frontend/diagnose-workstation.js`, `showError` (currently
      `root.className = 'dw dw-error'; root.textContent = message;`) builds its DOM
      from `diagnoseLoadFailure(cause)` instead of assigning `textContent`.
- [x] Keep `root.className = 'dw dw-error'` exactly as it is. `.ec-error.dw-error`
      in `frontend/diagnose-event-comparison.css:214` and the existing
      `.dw.dw-error` selectors in `frontend/diagnose-workstation.browser.test.mjs`
      both depend on it.
- [x] Keep the teardown that already opens `showError` — the abort, and clearing
      `teardown`, `repaint` and `leaveSurface` — unchanged and ahead of the render.
- [x] The rendered block follows the missing-token placeholder's pattern at
      `frontend/index.html:1596-1602`: an optional icon, an `<h2>` with `title`, a
      `<p>` with `body`, an optional detail line, and a primary button.
      Carry `role="alert"` on the block, not the placeholder's `role="status"`:
      this state interrupted a request the reader had already made, and the
      pre-port component's own selector was `.dw-error[role="alert"]`
      (`frontend/diagnose-workstation.browser.test.mjs:8`). The shell placeholder
      keeps its `role="status"` unchanged; the pinned `design.md` rules on why the
      two differ.
- [x] When `icon` is `'lock'`, use the lock `<svg>` markup from that placeholder
      verbatim. Invent no new icon for any other case; `icon: null` renders none.
- [x] When `action` is `'settings'` and the mount was handed a `settings`
      callback, render one primary button reading **Open Settings** that calls it.
      With no such callback the block renders without the button rather than
      throwing.
- [x] When `action` is `'retry'`, render one primary button reading **Retry**
      through the `callbacks.retry` the mount is *already* handed —
      `frontend/index.html:5414` passes `retry: loadAudit`, and
      `createDiagnoseEventComparison` forwards `callbacks` whole — so a non-`401`
      failure has a route out too. Read that callback; add no second retry
      plumbing, and do not touch the history level's own `retry` button at
      `frontend/diagnose-workstation.js:1042-1047`, whose handler is
      `refreshHistoryPair`. With no `retry` callback handed in, the block renders
      without the button rather than throwing — the same fallback as `settings`.
- [x] Add the `.dw-error` rule that has never existed, in
      `frontend/diagnose-workstation.css`, beside the other `.dw` rules. It applies
      to the mount root itself: it overrides `.dw`'s `42px minmax(0, 1fr)` template
      so the failure block is one centred area rather than a chrome row plus a
      body, and it sets a non-zero padding on that root — the `padding: 0px` the
      reproduction measures today is the flush-left symptom itself. Use the
      existing `--mk-*` / `--ck-*` tokens the file already defines (`--mk-text`,
      `--mk-muted`, `--mk-bg` and the like). Add no new colour value and no new
      token, so the surface styles itself the same way wherever it mounts.
- [x] Leave `render()`, `boot()`, the payload guard and every other `showError`
      caller's message text alone. `diagnose-workstation.js:4115` and `:4122` keep
      passing their existing `'Diagnose is unavailable.'` string.

## 3. Hand the surface the cause and the Settings route

- [x] In `frontend/index.html`, `loadAudit`'s catch passes the caught error object
      itself to `setError` at both call sites (`diagnoseView.setError(...)` and
      `diagnoseEnsureView()?.setError(...)`), instead of `e.message`. Nothing else
      in that catch moves.
- [x] In `diagnoseEnsureView`, add one `settings` callback to the callbacks object
      already carrying `stage`, `isStaged`, `day` and `retry`, calling the app's
      existing `setTab('settings')`.
- [x] Change no other screen. The shell's `!hasToken` placeholders, the topbar's
      *No API token set* banner, `frontend/verify-workstation.js`'s own
      `setError`/`showMessage`, and every non-Diagnose tab stay exactly as they
      are.
- [x] Change no API behaviour. `ciq_autotune/api.py` keeps answering `401` with
      its own `detail`; this change only decides how Diagnose reads it. Its one
      backend edit is the static asset route for the new module, admitted by
      coordinator ruling and recorded in `design.md` — the same four lines its 41
      tokenless siblings carry, which `tests/test_frontend_asset_routes.py`
      requires of every module reachable from `index.html`.

## 4. Prove the rendered state in the browser

- [x] In `frontend/diagnose-workstation.browser.test.mjs`, update the existing
      `setError` test that asserts
      `firstElementChild.textContent === 'The evidence request failed.'`: the
      className assertion (`'dw dw-error'`) still holds, and the message now
      appears as the block's detail line under app copy rather than as the whole
      textContent, with the generic block's **Retry** control present.
- [x] Keep the existing `#654` first-load-failure regression passing unchanged in
      intent: `.dw.dw-error` still appears, the surface still shows a failure
      message, and no uncaught error reaches the page.
- [x] Add one test for the reported state: a route stub answering `401` with
      `{"detail": "missing or invalid bearer token"}` renders the token heading,
      the Settings sentence, and one **Open Settings** control inside
      `.dw.dw-error`; the raw backend string is not the block's heading; and the
      block is not flush to the mount's edge (its rendered box is inset from the
      mount's left edge, which is what `x=0, padding: 0px` measured today).
- [x] Add one test for a **non-`401`** failure: a route stub answering `500`
      renders the generic heading with the server's message as the detail line,
      and exactly one control inside `.dw.dw-error` — the **Retry** button —
      proving the claim that every failed load gets the same frame, not only the
      rejected token. Drive the click through a `retry` callback the test supplies
      and assert it was called; the surface must not re-implement the reload
      itself.
- [x] Run both new tests against the tree **before** the fix and record that they
      fail for the right reason — the block's heading is the server's own string
      (`missing or invalid bearer token` for the `401` arm) and there is no control
      inside `.dw.dw-error` in either arm — not because a selector or a route stub
      is wrong. A test that goes green without ever having been red proves nothing
      here.
- [x] No test reads or asserts a token value, and no rendered path reads
      `localStorage.ciq_token`.

## 5. Record the revision on the frozen surface

- [x] Append one dated amendment section to
      `mockups/finding-evidence-routing.behavior.md`, in the shape the existing
      `## Amendment — <date>, <title> (issue #<n>)` sections take, saying what the
      Diagnose load-failure state now shows, that a rejected token routes to
      Settings, and that every other failure offers Retry. It amends no existing
      story and retires nothing, so it issues no new executable ID and needs no
      retirement sanction.
- [x] Capture paired before/after renders of the affected state — the wrong-token
      Diagnose surface at 1440×900 and 390×844 — under
      `openspec/changes/diagnose-token-error-surface/evidence/`, with a short
      `evidence/README.md` naming the server, the token used and the commands, in
      the shape `openspec/changes/diagnose-align-hidden-render/evidence/` already
      uses. Dark only: #304 retired the light theme.
- [x] Renders come from a synthetic server with a deliberately wrong token. This
      change was locked against the revise-e2e server, which no longer exists on
      this branch: `AGENTS.md`'s data boundary now permits exactly one offline
      serve, a scratch copy of `mockups/qa-e2e.synthetic/harmonic.sqlite` run with
      `--no-fetch --token ''`. That serve is what both halves use, and because its
      mandatory empty token disables `require_token` outright, the `401` is
      supplied at the transport — where the pinned browser suite supplies it. The
      `evidence/README.md` records this. No screenshot, log or fixture in this
      change comes from a real database.

## 6. Leave the rest alone

- [x] `frontend/data.js`, the findings projection, the analyzers and every safety
      predicate are untouched, and `ciq_autotune/` moves only by the admitted
      asset-route registration above. This change re-derives no backend verdict:
      it branches on an HTTP status, never on a threshold, direction or support
      floor.
- [x] The dead `.ec-error` rule in `frontend/diagnose-event-comparison.css` is not
      this change's to remove.
