# Evidence — a rejected API token reads as app copy on Diagnose

All renders use committed synthetic inputs. No personal or production health data
appears here. Dark only: #304 retired the light theme.

## Provenance

- **Server, both halves:** the repository's one permitted offline serve, from a
  scratch copy of the committed synthetic QA database — never the committed file
  itself:

  ```sh
  cp mockups/qa-e2e.synthetic/harmonic.sqlite <scratch>/qa-361.sqlite
  uv run harmonic serve --no-fetch --token '' --db <scratch>/qa-361.sqlite --port 88NN
  ```

  `before/` was served from a detached checkout of `3ebc349c` (this change's
  pinned source, before the fix) on port 8878; `after/` from this change's tree on
  port 8877. Ports 8801–8803 were never touched.

- **Token:** `ciq_token` is set to the literal string `not-the-token` in
  `localStorage` before the app loads. It is a made-up value, not a credential.

- **Why the rejection is supplied at the transport.** The permitted serve
  mandates `--token ''`, and `require_token` reads
  `if token and authorization != f"Bearer {token}"` — an empty token disables the
  check, so no `401` is reachable from that server. Every `/api/**` read is
  therefore answered `401 {"detail": "missing or invalid bearer token"}` at the
  transport, exactly where the pinned browser suite supplies it. Thirteen `/api/**`
  reads were refused in each capture. The document and every static asset came from
  the real running app.

- **Capture:** Playwright Chromium, headless, `colorScheme: 'dark'`, at 1440×900
  and 390×844, navigating to `/diagnose` and settling on `networkidle` plus 2 s.
  The measured fields below are the committed reproduction's own `page.evaluate`
  block (`docs/scope/361-wrong-token-diagnose-repro.mjs`), unmodified, so both
  halves are measured the way the reproduction measured the symptom.

## Matrix

`before/` and `after/` each contain the wrong-token Diagnose surface at
1440×900 and 390×844, dark.

## Measured, before and after

| Field | before | after |
| --- | --- | --- |
| `errorClass` | `dw dw-error` | `dw dw-error` (unchanged, as the tasks require) |
| `errorText` | `missing or invalid bearer token` | `Diagnose can't use this API token` + the Settings sentence + `Open Settings` |
| `errorPadding` | `0px` | `24px` |
| controls inside `.dw.dw-error` | `0` | `1` (**Open Settings**) |
| `role` on the rendered block | none anywhere | `role="alert"` on `.dw-failure` |
| block inset from the mount's left edge | flush (`x = 0`) | inset (`x = 538.6` at 1440×900) |

The mount root keeps `x = 0` in both halves because it spans the surface; what
moved is the block inside it, which the reproduction's flush-left symptom was
measuring through `padding: 0px`.

## Review observations

- Before, the whole workstation is replaced by one unstyled line of the server's
  own string, with no heading, no role and no way out.
- After, the same failure renders the app's own copy under a lock icon, announced
  as `role="alert"`, with one route out to Settings. The server's `detail` string
  is not the heading in either the `401` arm or the generic arm; a non-`401`
  failure keeps it as the detail line and offers **Retry** instead, which the
  browser suite covers.
- At 390×844 the block sits below the topbar rather than mid-viewport; it is
  inset, legible and complete, and the narrow framing is not otherwise changed.
