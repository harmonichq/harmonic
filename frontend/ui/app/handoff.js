// The API token handoff (#495): a server started with an API token is opened
// once as `/#token=<token>`. The token is kept where the client reads it, and
// the address loses it at once. The fragment is never sent to the server, so the
// token rides no request line. main.tsx imports this before anything that reads
// the token (#522).
import { saveToken } from '../../data.js';

const handoff = /^#token=(.+)$/.exec(window.location.hash);
if (handoff) {
  saveToken(decodeURIComponent(handoff[1]));
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
