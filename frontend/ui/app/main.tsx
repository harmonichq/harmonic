// The app's entry (#495): the API token handoff, the library's tokens, the
// page ground, and the app.
//
// The handoff is imported first: modules run in import order, and the app's
// remembered answers are keyed by the token it finds (#522).
import './handoff.js';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { glossary } from '../__fixtures__/ui-fixtures.json';
import { AdvisoryNotice } from '../components/AdvisoryNotice/AdvisoryNotice';
import '../tokens.css';
import './app.css';
import { createAdvisory } from './advisory.js';
import { App } from './App';

/** This browser's storage, unless it refuses access (a private window, blocked site data). */
function browserStorage() {
  try { return window.localStorage; } catch { return undefined; }
}

const advisory = createAdvisory(browserStorage());
const { term, meaning } = glossary.find((entry) => entry.term === 'Advisory')!;

/** The Advisory notice until it is understood in this browser, then the app (§2.5, 2026-11-02). */
function Root() {
  const [understood, setUnderstood] = useState(advisory.understood);
  if (understood) return <App />;
  return <AdvisoryNotice term={term} meaning={meaning} onUnderstood={() => {
    advisory.understand();
    setUnderstood(true);
  }} />;
}

createRoot(document.getElementById('app')!).render(<StrictMode><Root /></StrictMode>);
