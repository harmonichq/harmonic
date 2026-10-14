// The app's entry (#495): the library's tokens, the page ground, the API token
// handoff, and the app.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TOKEN_KEY } from '../../data.js';
import '../tokens.css';
import './app.css';
import { App } from './App';

// A server started with an API token is opened once as `/#token=<token>`: the
// token is kept where the client reads it, and the address loses it at once.
// The fragment is never sent to the server, so the token rides no request line.
const handoff = /^#token=(.+)$/.exec(window.location.hash);
if (handoff) {
  try { localStorage.setItem(TOKEN_KEY, decodeURIComponent(handoff[1])); } catch {}
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

createRoot(document.getElementById('app')!).render(<StrictMode><App /></StrictMode>);
