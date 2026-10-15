// The app's entry (#495): the API token handoff, the library's tokens, the
// page ground, and the app.
//
// The handoff is imported first: modules run in import order, and the app's
// remembered answers are keyed by the token it finds (#522).
import './handoff.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../tokens.css';
import './app.css';
import { App } from './App';

createRoot(document.getElementById('app')!).render(<StrictMode><App /></StrictMode>);
