// Capture the #291 basal drill from each server's own frontend. On the base,
// selected/detail frames intentionally remain the absent-roster panel; this is
// the before evidence, not a cross-tree recreation.
//
// PLAYWRIGHT_MODULE=<playwright> VENDOR_DIR=<vendor> REVISION_ROOT=<checkout> \
// BASE_URL=<base> REVISION_URL=<revision> PAYLOAD=<payload> OUT=<directory> \
// node render-states.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const need = (name) => process.env[name] || (() => { throw new Error(`${name} is required`); })();
const root = resolve(need('REVISION_ROOT'));
const out = resolve(need('OUT'));
const replay = await import(pathToFileURL(join(root, 'frontend/diagnose-workstation-behavior.replay.mjs')).href);
const { chromium } = createRequire(import.meta.url)(need('PLAYWRIGHT_MODULE'));
const viewports = ['1440x900', '1280x800', '1024x768', '390x844'].map((value) => {
  const [width, height] = value.split('x').map(Number);
  return { width, height };
});
const sides = [['base', need('BASE_URL')], ['revision', need('REVISION_URL')]];
const states = {
  rest: async () => {},
  selected: async (page) => {
    const row = page.locator('#level .ev-row[data-occurrence-id="2026-01-02"]');
    if (await row.count()) await row.click();
  },
  detail: async (page) => {
    const row = page.locator('#level .ev-row[data-occurrence-id="2026-01-07"]');
    if (await row.count()) {
      await row.click();
      await page.locator('#level .occ-detail').scrollIntoViewIfNeeded();
    }
  },
};
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
let written = 0;
try {
  for (const [label, baseUrl] of sides) for (const viewport of viewports) for (const [state, pose] of Object.entries(states)) {
    process.env.BASE_URL = baseUrl;
    const page = await replay.openApp(browser, { state: 'typical', viewport });
    try {
      await page.locator('#lane button').first().click();
      await page.locator('#level .slot-head').waitFor();
      await page.waitForTimeout(250);
      await pose(page);
      await page.waitForTimeout(200);
      const file = join(out, `${label}-${state}-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`rendered ${file}`);
      written += 1;
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
if (written !== sides.length * viewports.length * Object.keys(states).length) throw new Error(`wrote ${written} renders`);
console.log(`render matrix: ${written} renders`);
