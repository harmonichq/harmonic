// Shared Chromium-process lifecycle for browser-test files that run many
// scenarios in one `node --test` command (#554). Playwright's `browser.
// newPage()` already opens each page in its OWN fresh BrowserContext (closing
// the page tears down that context), so cookies/localStorage/routes/viewport/
// colorScheme never leak between pages of the same browser — the only thing
// worth sharing across scenarios is the expensive part: the Chromium process
// itself. This module launches that process at most once (lazily, on first
// use) and closes it once, at the end of the command.
//
// Deliberately dependency-free (like tandemsource_map.py) and CJS so both the
// .mjs and .test.js callers can `require()` it directly. Keep the interface
// this small: `browser()` to fetch/launch the shared instance, `close()` to
// tear it down, `launches` to see how many times Chromium actually started
// (used by the regression test for issue #554).
'use strict';

function createBrowserRunner(launch) {
  let browserPromise = null;
  let launchCount = 0;

  function browser() {
    if (!browserPromise) {
      launchCount += 1;
      browserPromise = Promise.resolve().then(() => launch());
    }
    return browserPromise;
  }

  async function close() {
    if (!browserPromise) return;
    const pending = browserPromise;
    browserPromise = null;
    const instance = await pending;
    await instance.close();
  }

  return {
    browser,
    close,
    get launches() { return launchCount; },
  };
}

module.exports = { createBrowserRunner };
