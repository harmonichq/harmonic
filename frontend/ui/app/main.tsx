// The app's entry (#495): the API token handoff, the library's tokens, the
// page ground, and the app.
//
// The handoff is imported first: modules run in import order, and the app's
// remembered answers are keyed by the token it finds (#522).
import './handoff.js';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { client, currentToken } from '../../data.js';
import { landRoute } from '../../tab-routing.js';
import { glossary } from '../__fixtures__/ui-fixtures.json';
import { serve, type Answers } from '../answers';
import { AdvisoryNotice } from '../components/AdvisoryNotice/AdvisoryNotice';
import '../tokens.css';
import './app.css';
import { createAdvisory } from './advisory.js';
import { App } from './App';
import { createLive } from './live.js';
import { createMemory } from './memory.js';

/** This browser's storage, unless it refuses access (a private window, blocked site data). */
function browserStorage() {
  try { return window.localStorage; } catch { return undefined; }
}

// The built bundle's own address names the build, so a new build reads no
// answer remembered in an older one's shape.
const memory = createMemory({ storage: browserStorage(), build: import.meta.url, token: currentToken });
const live = createLive({ client, glossary, memory });
serve(live.answers as unknown as Answers);

// A reload lands on its tab, never a drill-down: the entry the browser kept is the tab's own.
landRoute();

const advisory = createAdvisory(browserStorage());
const { term, meaning } = glossary.find((entry) => entry.term === 'Advisory')!;

/** The Advisory notice until it is understood in this browser, then the app (§2.5, 2026-11-02). */
function Root() {
  const [understood, setUnderstood] = useState(advisory.understood);
  if (understood) return <App live={live} />;
  return <AdvisoryNotice term={term} meaning={meaning} onUnderstood={() => {
    advisory.understand();
    setUnderstood(true);
  }} />;
}

createRoot(document.getElementById('app')!).render(<StrictMode><Root /></StrictMode>);
