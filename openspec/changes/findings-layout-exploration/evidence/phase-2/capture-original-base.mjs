import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const checkout = resolve(process.env.BASE_CHECKOUT);
const { openApp } = await import(pathToFileURL(join(checkout,
  'frontend/diagnose-workstation-behavior.replay.mjs')));
const baseUrl = process.env.BASE_URL;
const mode = process.env.CAPTURE_SOURCE;
const output = resolve(process.env.CAPTURE_OUTPUT);
const vendor = process.env.VENDOR_DIR;
const viewports = [[1440, 900], [2084, 742], [1024, 768], [760, 900], [390, 844]];
if (!baseUrl || !checkout || !['projection', 'qa-showcase'].includes(mode)) {
  throw new Error('BASE_URL, BASE_CHECKOUT, CAPTURE_OUTPUT and CAPTURE_SOURCE=projection|qa-showcase are required');
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch();

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
  await page.screenshot({ path: join(output, `original-base-${mode}-${size}-${state}.png`) });
}

for (const [width, height] of viewports) {
  const size = `${width}x${height}`;
  const page = mode === 'projection'
    ? await openApp(browser, { viewport: { width, height }, appSource: 'server', history: true })
    : await openQa({ width, height });
  await shot(page, 'root', size);

  const lower = page.locator('#level .qrow').nth(1);
  if (await lower.count()) {
    await lower.click();
    await shot(page, 'lower-drill', size);
    const findings = page.locator('#crumb-trail button', { hasText: 'Findings' });
    if (await findings.count()) await findings.click();
    await shot(page, 'drill-return', size);
  }

  const raise = page.getByRole('button', { name: 'Bring the charts up', exact: true });
  if (await raise.count()) {
    await raise.click();
    await page.locator('#tile-field[data-dock="docked"]').waitFor();
    await shot(page, 'charts-raised', size);
  }
  const explore = page.getByRole('button', { name: 'Show every chart', exact: true });
  if (await explore.count()) {
    await explore.click();
    await page.locator('#tile-field[data-explorer]').waitFor();
    await shot(page, 'every-chart', size);
    await page.getByRole('button', { name: 'Back to the dock', exact: true }).click();
    await shot(page, 'every-chart-return', size);
  }

  const putAway = page.getByRole('button', { name: 'Put the charts away', exact: true });
  if (await putAway.count()) {
    await putAway.click();
    await page.locator('#tile-field[data-dock="hidden"]').waitFor();
  }

  const fullscreen = page.locator('#tile-focal .tile-fullscreen');
  if (await fullscreen.count()) {
    await fullscreen.click();
    await page.locator('#tile-field[data-fullscreen-tile]').waitFor();
    await shot(page, 'selected-fullscreen', size);
    await page.getByRole('button', { name: 'Back to the dock', exact: true }).click();
    await shot(page, 'fullscreen-return', size);
  }

  console.log(JSON.stringify({ checkout, source: mode, size,
    documentOverflowX: await page.evaluate(() => document.documentElement.scrollWidth
      - document.documentElement.clientWidth) }));
  await page.close();
}

await browser.close();
