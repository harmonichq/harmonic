// Regression coverage for #554: frontend/browser-runner.js's front door
// launches Chromium at most once per command, while still giving each
// scenario a fresh, fully isolated context (cookies, localStorage, and
// page.route handlers never leak between scenarios).
//
// Named `.browser.test.mjs`, not `.test.js` — like diagnose-workstation
// .browser.test.mjs and cockpit-shell.browser.test.mjs — so the dependency-free
// `frontend` job's bare `node --test 'frontend/**/*.test.js'` glob never
// discovers it; only the `frontend-browser` job's explicit step runs it. #672:
// fail closed. A missing prerequisite exits nonzero, never `skip` — a skipped
// run exits 0, and a green step that exercised zero browser assertions is the
// silent-skip failure mode the mock-to-app port process forbids for replay
// scripts, extended to every browser gate in this suite. Serves
// trivial inline HTML via page.route so this test needs no VENDOR_DIR.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const missing = [];
let chromium = null;
if (!process.env.PLAYWRIGHT_MODULE) {
  missing.push('PLAYWRIGHT_MODULE is unset (point it at an installed playwright module, '
    + 'e.g. PLAYWRIGHT_MODULE=$PW/node_modules/playwright)');
} else {
  try {
    chromium = require(process.env.PLAYWRIGHT_MODULE).chromium;
  } catch (e) {
    missing.push(`PLAYWRIGHT_MODULE=${process.env.PLAYWRIGHT_MODULE} could not be required (${e.message})`);
  }
}
const EXEC = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
if (chromium && !EXEC && !existsSync(chromium.executablePath())) {
  missing.push(`Chromium executable is missing (no PLAYWRIGHT_EXECUTABLE_PATH and `
    + `${chromium.executablePath()} does not exist — run playwright install chromium)`);
}
if (missing.length) {
  throw new Error(`browser-runner.browser.test.mjs cannot run — missing prerequisites:\n  - ${missing.join('\n  - ')}`);
}
const { createBrowserRunner } = require('./browser-runner.js');

const URL_UNDER_TEST = 'http://browser-runner-regression.local/';

test('the shared runner launches Chromium once and isolates scenarios from each other', async () => {
    const runner = createBrowserRunner(() => chromium.launch({ executablePath: EXEC || undefined }));

    try {
      // Scenario 1: a page that sets a cookie + localStorage value, and
      // installs its OWN route stub whose fulfilled body is scenario-1-specific.
      const browser = await runner.browser();
      const page1 = await browser.newPage();
      try {
        await page1.route('**/*', (route) => route.fulfill({
          status: 200, contentType: 'text/html', body: '<!doctype html><title>scenario-one</title>',
        }));
        await page1.goto(URL_UNDER_TEST);
        await page1.context().addCookies([
          { name: 'scenario', value: 'one', url: URL_UNDER_TEST },
        ]);
        await page1.evaluate(() => localStorage.setItem('scenario', 'one'));
        assert.equal(await page1.title(), 'scenario-one', 'precondition: scenario 1 sees its own route stub');
      } finally {
        await page1.close();
      }

      // Scenario 2: fetched through the SAME front door. Must not cause a
      // second Chromium launch, and must start from a blank slate.
      const browserAgain = await runner.browser();
      assert.equal(browserAgain, browser,
        'a second scenario reuses the same shared browser instance, not a new process');

      const page2 = await browserAgain.newPage();
      try {
        // Cookie isolation: scenario 1's cookie must not be visible here,
        // even though it was set against the identical URL.
        const cookies = await page2.context().cookies(URL_UNDER_TEST);
        assert.deepEqual(cookies, [], 'scenario 2 cannot read scenario 1\'s cookie');

        // Route isolation: scenario 2 installs its OWN distinct stub for the
        // same URL. If contexts (and their route handlers) had leaked,
        // scenario 1's still-registered handler would win and serve its body
        // instead — proving routes carried over.
        await page2.route('**/*', (route) => route.fulfill({
          status: 200, contentType: 'text/html', body: '<!doctype html><title>scenario-two</title>',
        }));
        await page2.goto(URL_UNDER_TEST);
        assert.equal(await page2.title(), 'scenario-two',
          'scenario 2 does not inherit scenario 1\'s page.route handler');

        // localStorage isolation: a fresh context is a fresh storage
        // partition, so scenario 1's write must not be visible here.
        const storedValue = await page2.evaluate(() => localStorage.getItem('scenario'));
        assert.equal(storedValue, null, 'scenario 2 cannot read scenario 1\'s localStorage state');
      } finally {
        await page2.close();
      }
    } finally {
      await runner.close();
    }

    assert.equal(runner.launches, 1, 'Chromium was launched exactly once across both scenarios');
  });
