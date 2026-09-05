import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { openApp } from '../../../../../frontend/diagnose-workstation-behavior.replay.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const baseUrl = process.env.BASE_URL;
const label = process.env.CAPTURE_LABEL;
const mode = process.env.CAPTURE_SOURCE;
const output = resolve(process.env.CAPTURE_OUTPUT);
const viewports = [[1440, 900], [2084, 742], [1024, 768], [760, 900], [390, 844]];
if (!baseUrl || !label || !['projection', 'qa-showcase'].includes(mode)) {
  throw new Error('BASE_URL, CAPTURE_LABEL, CAPTURE_OUTPUT and CAPTURE_SOURCE=projection|qa-showcase are required');
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const vendor = process.env.VENDOR_DIR;

async function openQa(viewport) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => {
    localStorage.setItem('ciq_token', 'render-evidence');
    localStorage.setItem('tab', 'diagnose');
  });
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('echarts')) return route.fulfill({ body: await readFile(join(vendor, 'echarts.min.js')), contentType: 'text/javascript' });
    if (url.includes('vue')) return route.fulfill({ body: await readFile(join(vendor, 'vue.esm-browser.js')), contentType: 'text/javascript' });
    return route.continue();
  });
  await page.goto(baseUrl);
  await page.waitForSelector('.dw');
  await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false');
  return page;
}

async function shot(page, state, size) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(output, `${label}-${mode}-${size}-${state}.png`) });
}

for (const [width, height] of viewports) {
  const size = `${width}x${height}`;
  const page = mode === 'projection'
    ? await openApp(browser, { viewport: { width, height }, appSource: 'server', history: true })
    : await openQa({ width, height });
  await shot(page, 'root', size);

  if (mode === 'projection') {
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false');
    await shot(page, 'root-full-day', size);
    await page.getByRole('button', { name: 'Overnight', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false');
  }

  const lower = page.locator('#level .qrow').nth(1);
  if (await lower.count()) {
    await lower.click();
    await shot(page, 'lower-drill', size);
    const findings = page.locator('#crumb-trail button', { hasText: 'Findings' });
    if (await findings.count()) await findings.click();
    await shot(page, 'drill-return', size);
  }

  await page.getByRole('button', { name: 'All charts', exact: true }).click();
  await page.locator('#tile-field[data-explorer]').waitFor();
  await shot(page, 'all-charts', size);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await shot(page, 'all-charts-dismissed', size);

  await page.locator('#tile-focal .tile-fullscreen').click();
  await page.locator('#tile-field[data-fullscreen-tile]').waitFor();
  await shot(page, 'selected-fullscreen', size);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await shot(page, 'fullscreen-return', size);

  const metrics = await page.evaluate(() => ({
    viewport: [document.documentElement.clientWidth, document.documentElement.clientHeight],
    documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    overviewTop: Math.round(document.querySelector('#chart')?.getBoundingClientRect().top || 0),
    spotlightBottom: Math.round(document.querySelector('#tile-focal')?.getBoundingClientRect().bottom || 0),
    overviewHeaderTop: Math.round(document.querySelector('#canvas-head')?.getBoundingClientRect().top || 0),
  }));
  console.log(JSON.stringify({ label, source: mode, size, metrics }));
  await page.close();
}

await browser.close();
