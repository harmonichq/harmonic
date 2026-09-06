/* What the reader is told when a Diagnose load fails, and the route out of it.
 *
 * Keyed on the transport status the caught cause carries — `frontend/data.js`
 * throws `ApiTransportError(res.status, …)` — never on the wording of the
 * server's `detail`, which is prose the server is free to reword. A rejected
 * token is the one status with its own answer: `ciq_autotune/api.py`'s
 * `require_token` is the only place the API refuses a caller, and it answers
 * 401. Everything else shares one answer, so no failure is left without a way
 * out. The server's own sentence survives as `detail` beneath app copy; it is
 * never the heading, and never the whole screen (ADR 361).
 */
const TOKEN_REJECTED = 401;

/* `showError`'s own internal callers pass a bare string; `loadAudit`'s catch
   passes the caught Error. Anything without a usable sentence carries none. */
const messageOf = (cause) => {
  const text = typeof cause === 'string' ? cause
    : (cause !== null && typeof cause === 'object' && typeof cause.message === 'string'
      ? cause.message : '');
  return text.length > 0 ? text : null;
};

export function diagnoseLoadFailure(cause) {
  if (cause !== null && typeof cause === 'object' && cause.status === TOKEN_REJECTED) {
    return {
      icon: 'lock',
      title: "Diagnose can't use this API token",
      body: 'This server rejected the token saved in this browser. Update it in Settings, then reload.',
      detail: null,
      action: 'settings',
    };
  }
  return {
    icon: null,
    title: "Diagnose couldn't read this server's evidence",
    body: 'The evidence request failed before Diagnose could read it.',
    detail: messageOf(cause),
    action: 'retry',
  };
}
