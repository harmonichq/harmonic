import test from 'node:test';
import assert from 'node:assert/strict';

import {
  desk, emptyFrame, errorFrame, escapeText, loadingFrame, nameplate, readingHeader, shortDate, stamp,
} from './frame.js';

test('the desk pairs one stage with one reading pane, divided by the shipped hairline', () => {
  const markup = desk('<section class="pane gf-stage"></section>', '<aside class="pane gf-reading"></aside>');
  assert.match(markup, /^<div class="panes gf-desk">/);
  assert.match(markup, /gf-stage.*gf-reading/s);
});

test('both heads are focusable, because arrival lands on the heading', () => {
  // HV2-32: destination arrival focuses its pane heading unless the caller
  // supplies a precise target.
  assert.match(nameplate({ kicker: 'k', title: 'T', sub: 's' }), /<h2 class="gf-title" tabindex="-1">T<\/h2>/);
  assert.match(readingHeader('Episode Log'), /<h2 tabindex="-1">Episode Log<\/h2>/);
  // The narrow sheet's Close rides the reading head; it is hidden above 700px.
  assert.match(readingHeader('Episode Log'), /gf-sheet-close" data-action="close-sheet">Close</);
});

test('the full-width empty frame focuses its own heading and manufactures no reading pane', () => {
  // S80b: the prototype left focus on the pressed navigation button here,
  // because its empty title was a div with no tabindex. The build owes the
  // heading focus HV2-32 contracts, and this is where it is owed.
  const markup = emptyFrame('Changes', 'No change underway', 'copy', '<button>Go</button>');
  assert.match(markup, /<div class="gf-title" tabindex="-1">No change underway<\/div>/);
  assert.ok(!markup.includes('gf-reading'), 'HV2-05 keeps this state full width');
  assert.match(markup, /class="pane gf-stage gf-stage-table" aria-label="Changes"/);
});

test('the loading frame carries no count and the error frame offers its retry', () => {
  const loading = loadingFrame('Day');
  assert.match(loading, /class="gf-loading" role="status" aria-label="Loading Day"/);
  // HV2-31: count-free loading content, and no former row carried into it.
  assert.ok(!loading.includes('gf-row'), 'a loading frame carries no former row');
  assert.ok(!loading.includes('cockpit-count'), 'a loading frame states no count');
  assert.match(errorFrame('Day', 'This day'), /Evidence unavailable/);
  assert.match(errorFrame('Day', 'This day'), /data-retry>Retry</);
});

test('interpolated text is escaped, including into attributes', () => {
  assert.equal(escapeText('<b>&"x"</b>'), '&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
  assert.equal(escapeText(null), '');
});

test('dates read at midday, so no offset can bump the calendar day', () => {
  assert.equal(shortDate('2024-06-26 13:55:00'), 'Jun 26');
  assert.equal(stamp('2024-06-26 13:55:00'), 'Jun 26, 2024 · 13:55');
});
