import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  openApp, twoFamilyInputs,
} from '../../../../../frontend/diagnose-workstation-behavior.replay.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const viewports = [
  ['desktop', 1440, 900],
  ['short', 2084, 742],
  ['tablet', 760, 900],
  ['narrow', 390, 844],
];
if (!process.env.PLAYWRIGHT_MODULE || !process.env.VENDOR_DIR
    || !process.env.PAYLOAD || !process.env.CAPTURE_OUTPUT) {
  throw new Error('PLAYWRIGHT_MODULE, VENDOR_DIR, PAYLOAD and CAPTURE_OUTPUT are required');
}
const output = resolve(process.env.CAPTURE_OUTPUT);
const records = [];

await mkdir(output, { recursive: true });
const browser = await chromium.launch();

async function settleQueue(page, requiredKinds) {
  try {
    await page.waitForFunction((kinds) => {
      if (document.querySelector('#level')?.dataset.loading !== 'false') return false;
      const rendered = new Set([...document.querySelectorAll('#level .mini[data-preview-kind]')]
        .map((host) => host.dataset.previewKind));
      return kinds.every((kind) => rendered.has(kind));
    }, requiredKinds, { timeout: 8000 });
  } catch (error) {
    const rows = await page.locator('#level .qrow').evaluateAll((nodes) => nodes.map((node) => ({
      id: node.dataset.id, mini: node.dataset.mini,
      kind: node.querySelector('.mini')?.dataset.previewKind || null,
      state: node.querySelector('.mini')?.textContent || null,
    })));
    throw new Error(`${error.message}; rows=${JSON.stringify(rows)}`);
  }
  await page.waitForTimeout(400);
}

async function reveal(page, selector) {
  await page.locator(selector).waitFor();
  await page.locator(selector).evaluate((node) => {
    const scroller = node.closest('#level');
    const top = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop += top - 4;
  });
  await page.waitForTimeout(150);
}

for (const [label, width, height] of viewports) {
  const mixedPage = await openApp(browser, {
    viewport: { width, height }, history: true, appSource: 'fixture',
    findingsInputs: twoFamilyInputs,
  });
  await mixedPage.getByRole('button', { name: '24 h', exact: true }).click();
  await settleQueue(mixedPage, ['carb-ratio', 'basal', 'event-comparison']);
  await mixedPage.locator('#level').evaluate((node) => { node.scrollTop = 0; });
  await mixedPage.screenshot({ path: `${output}/preview-${label}-${width}x${height}-mixed-top.png` });

  await reveal(mixedPage, '#level .qrow[data-id="finding:over_treated_low"]');
  const mixed = await mixedPage.locator('#level').evaluate((node) => {
    return { scrollTop: node.scrollTop, scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight };
  });
  await mixedPage.screenshot({ path: `${output}/preview-${label}-${width}x${height}-mixed-lower.png` });
  await reveal(mixedPage, '#level .qrow[data-id="finding:carb_undercount"] .mini');
  await mixedPage.screenshot({ path: `${output}/preview-${label}-${width}x${height}-behavior-chart.png` });
  const mixedMetrics = await mixedPage.evaluate(() => ({
    previewKinds: [...new Set([...document.querySelectorAll('#level .mini[data-preview-kind]')]
      .map((host) => host.dataset.previewKind))],
    previews: [...document.querySelectorAll('#level .mini[data-preview-kind]')].map((host) => {
      const box = host.getBoundingClientRect();
      return { kind: host.dataset.previewKind, width: Math.round(box.width),
        height: Math.round(box.height) };
    }),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  await mixedPage.close();

  const isfPage = await openApp(browser, {
    viewport: { width, height }, history: true, appSource: 'fixture',
  });
  const watching = isfPage.locator('#level .qcollapse');
  if (await watching.count() && await watching.getAttribute('aria-expanded') !== 'true') {
    await watching.click();
  }
  await settleQueue(isfPage, ['isf']);
  await reveal(isfPage, '#level .qrow[data-id="isf"]');
  await isfPage.screenshot({ path: `${output}/preview-${label}-${width}x${height}-isf.png` });
  await reveal(isfPage, '#level .qrow[data-id="isf"] .mini');
  await isfPage.screenshot({ path: `${output}/preview-${label}-${width}x${height}-isf-chart.png` });

  const isfMetrics = await isfPage.evaluate(() => ({
    previewKinds: [...new Set([...document.querySelectorAll('#level .mini[data-preview-kind]')]
      .map((host) => host.dataset.previewKind))],
    previews: [...document.querySelectorAll('#level .mini[data-preview-kind]')].map((host) => {
      const box = host.getBoundingClientRect();
      return { kind: host.dataset.previewKind, width: Math.round(box.width),
        height: Math.round(box.height) };
    }),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  const record = { label, viewport: [width, height], mixed, mixedMetrics, isfMetrics };
  records.push(record);
  console.log(JSON.stringify(record));
  await isfPage.close();
}

await browser.close();
await writeFile(`${output}/capture.txt`, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
