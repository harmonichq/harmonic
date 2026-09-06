// Measure every full-rank evidence-chart axis NAME against the chart's own box
// (#360). ECharts draws a value axis's name from `nameLocation: 'end'`, which
// seats it off the axis end; nothing in the canvas reserves room for it and the
// grid runs `containLabel: false`, so a name wider than its inset is painted
// outside the container and clipped. This driver walks the queue, opens every
// finding row, and reports each drawn name's overhang. It exits nonzero when any
// name leaves its box, so the before run fails and the after run passes.
//
// A tile that publishes modes is measured in each of them. A builder's clock
// branch sets its own axes and can carry a name its event branch never draws, so
// a capture taken only in the mode the queue opens by default grades half the
// contract. A row on which no tile publishes modes is measured once, as opened.
//
// PLAYWRIGHT_MODULE=<playwright> BASE_URL=<base> [TOKEN=qa] [VIEWPORT=1440x900] \
// node openspec/changes/360-rest-windows-axis-name-clip/evidence/axis-name-seat.mjs
import { createRequire } from 'node:module';

const need = (name) => process.env[name] || (() => { throw new Error(`${name} is required`); })();
const { chromium } = createRequire(import.meta.url)(need('PLAYWRIGHT_MODULE'));
const base = need('BASE_URL');
const token = process.env.TOKEN || 'qa';
const [width, height] = (process.env.VIEWPORT || '1440x900').split('x').map(Number);

/* Read the drawn text out of zrender rather than the option: the defect is where
   the name LANDS, and the option says only what it is called. */
const measure = (names) => {
  const echarts = window.echarts;
  const found = [];
  for (const host of document.querySelectorAll('div')) {
    const chart = echarts?.getInstanceByDom?.(host);
    if (!chart) continue;
    const option = chart.getOption();
    const declared = [];
    for (const key of ['xAxis', 'yAxis']) {
      for (const axis of option[key] || []) if (axis.name) declared.push({ key, name: axis.name });
    }
    if (!declared.length) continue;
    const box = host.getBoundingClientRect();
    for (const element of chart.getZr().storage.getDisplayList(true)) {
      const text = element.style?.text;
      const declaration = declared.find((entry) => entry.name === text);
      if (!declaration) continue;
      const rect = element.getBoundingRect().clone();
      if (element.transform) rect.applyTransform(element.transform);
      found.push({
        axis: declaration.key, name: text,
        left: +rect.x.toFixed(1), top: +rect.y.toFixed(1),
        width: +rect.width.toFixed(1), height: +rect.height.toFixed(1),
        box: { width: Math.round(box.width), height: Math.round(box.height) },
        over: {
          left: rect.x < 0 ? +(-rect.x).toFixed(1) : 0,
          right: rect.x + rect.width > box.width ? +(rect.x + rect.width - box.width).toFixed(1) : 0,
          top: rect.y < 0 ? +(-rect.y).toFixed(1) : 0,
          bottom: rect.y + rect.height > box.height ? +(rect.y + rect.height - box.height).toFixed(1) : 0,
        },
      });
    }
  }
  return found;
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height } });
await context.addInitScript((value) => localStorage.setItem('ciq_token', value), token);
const page = await context.newPage();

/* Selecting a finding replaces the queue with that finding's canvas, so there is
   no queue left to walk: each row is opened from a fresh load of the workstation. */
const openWorkstation = async () => {
  await page.goto(`${base}/diagnose`, { waitUntil: 'networkidle' });
  const tab = page.locator('button.cockpit-step[data-shell-tab="diagnose"]').first();
  await tab.waitFor({ state: 'attached', timeout: 20000 });
  if ((await tab.getAttribute('aria-current')) !== 'step') await tab.click({ force: true });
  await page.waitForTimeout(1500);
  await page.waitForLoadState('networkidle');
  // The queue shows its ranked reads and hides the watched ones behind a disclosure.
  for (const disclosure of await page.locator('.qcollapse').all()) await disclosure.click().catch(() => {});
  await page.waitForTimeout(400);
};

/* The rail renders one mode group per staged tile that publishes modes, so a
   pass sets every such tile to the same alignment and then measures the whole
   canvas. Each click repaints the rail, so the buttons are re-queried per click
   rather than held across the repaint. */
const setMode = async (mode) => {
  const selector = `.tile-mode-${mode}`;
  const count = await page.locator(selector).count();
  for (let index = 0; index < count; index += 1) {
    await page.locator(selector).nth(index).click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(900);
  return count;
};

await openWorkstation();
const rows = await page.locator('.qrow').evaluateAll((all) => all.map((row) => row.dataset.id));
if (!rows.length) throw new Error('no finding rows on the queue: the server has no findings to measure');
let clipped = 0;
let passes = 0;
for (const [index, id] of rows.entries()) {
  if (index) await openWorkstation();
  await page.locator(`.qrow[data-id="${id}"]`).first().click();
  await page.waitForTimeout(1800);
  const published = [];
  for (const mode of ['event', 'clock']) {
    if (await page.locator(`.tile-mode-${mode}`).count()) published.push(mode);
  }
  for (const mode of published.length ? published : ['as-opened']) {
    if (published.length) await setMode(mode);
    passes += 1;
    for (const seat of await page.evaluate(measure)) {
      const { left, right, top, bottom } = seat.over;
      const worst = Math.max(left, right, top, bottom);
      if (worst > 0) clipped += 1;
      console.log(`${worst > 0 ? 'CLIPPED' : 'seated '} ${id} mode=${mode} ${seat.axis} ${JSON.stringify(seat.name)} `
        + `box=${seat.box.width}x${seat.box.height} x=${seat.left} w=${seat.width} `
        + `over(l,r,t,b)=${left},${right},${top},${bottom}`);
    }
  }
}
await browser.close();
console.log(`\n${clipped} clipped axis name${clipped === 1 ? '' : 's'} across ${rows.length} finding rows `
  + `in ${passes} mode passes`);
if (clipped) process.exitCode = 1;
