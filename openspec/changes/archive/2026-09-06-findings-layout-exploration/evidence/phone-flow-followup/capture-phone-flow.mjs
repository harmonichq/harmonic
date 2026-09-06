import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  openApp, twoFamilyInputs,
} from '../../../../../frontend/diagnose-workstation-behavior.replay.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const output = resolve(process.env.CAPTURE_OUTPUT);
const variant = process.env.CAPTURE_VARIANT;
if (!output || !variant) throw new Error('CAPTURE_OUTPUT and CAPTURE_VARIANT are required');

await mkdir(output, { recursive: true });
const browser = await chromium.launch();

const shot = async (page, size, state) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${output}/${variant}-${size}-${state}.png`, fullPage: false });
};

const scrollTo = (page, selector, block = 'start') => page.locator(selector).first()
  .evaluate((node, position) => node.scrollIntoView({ block: position }), block);

for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 800 }]) {
  const size = `${viewport.width}x${viewport.height}`;
  const page = await openApp(browser, {
    state: 'typical', viewport, history: true, hasTouch: true, isMobile: true,
    appSource: 'fixture', findingsInputs: twoFamilyInputs,
  });
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(
    '#level .mini[data-preview-kind] canvas',
  ).length === 5);
  await page.evaluate(() => { document.querySelector('.main-content').scrollTop = 0; });
  await shot(page, size, 'root');

  const filter = page.locator('#filter-trigger');
  await filter.click();
  await shot(page, size, 'filter-root');
  await page.keyboard.press('Escape');
  await filter.focus({ preventScroll: true });
  await filter.evaluate((node) => {
    const main = document.querySelector('.cockpit-stage > .main-content');
    main.scrollTop += node.getBoundingClientRect().top - 150;
  });
  await page.keyboard.press('Enter');
  await shot(page, size, 'filter-scrolled');
  await page.keyboard.press('Escape');

  await scrollTo(page, '#level .qrow.priced:nth-of-type(2)', 'center');
  await shot(page, size, 'scrolled-queue');
  await page.locator('#level .qrow.priced').nth(1).click();
  await shot(page, size, 'selected-finding');
  await page.locator('#crumb-trail button').first().click();

  await page.getByRole('button', { name: 'All charts', exact: true }).click();
  await page.locator('#tile-field[data-explorer]').waitFor();
  await shot(page, size, 'all-charts');
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.locator('#tile-focal .tile-fullscreen').click();
  await page.locator('#tile-field[data-fullscreen-tile]').waitFor();
  await shot(page, size, 'selected-fullscreen');
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  const rootCrumb = page.locator('#crumb-trail button', { hasText: 'Findings' });
  if (await rootCrumb.count()) await rootCrumb.first().click();
  await page.waitForTimeout(300);

  const watching = page.locator('#level .qcollapse');
  if (await watching.count() && await watching.getAttribute('aria-expanded') !== 'true') {
    await watching.click();
  }
  await scrollTo(page, '#watch-dock', 'end');
  await shot(page, size, 'watching');
  await page.close();
}

const desktop = await openApp(browser, {
  state: 'typical', viewport: { width: 1440, height: 900 }, history: true,
  appSource: 'fixture', findingsInputs: twoFamilyInputs,
});
await desktop.getByRole('button', { name: '24 h', exact: true }).click();
await desktop.waitForFunction(() => document.querySelectorAll(
  '#level .mini[data-preview-kind] canvas',
).length === 5);
await shot(desktop, '1440x900', 'root');
await desktop.close();

await browser.close();
