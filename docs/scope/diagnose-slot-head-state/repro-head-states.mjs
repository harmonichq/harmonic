/* Triage reproduction for harmonichq/harmonic#103.
 * Reads the basal case-file head for three slot states, via the replay's own
 * openApp (appSource: 'fixture', no server). Read-only: writes nothing. */
import { createRequire } from 'node:module';
import { openApp } from '../../../frontend/diagnose-workstation-behavior.replay.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });

// Pose a no-data slot on top of the committed payload, exactly as the engine
// would publish it (ciq_autotune/analyzers/basal.py NO_DATA branch).
const poseNoData = (analysis) => {
  const next = JSON.parse(JSON.stringify(analysis));
  const slot = next.basal[0];
  slot.safety_status = 'no data';
  slot.days = 0;
  slot.recommended = null;
  slot.asserts_move = false;
  slot.direction = null;
  slot.estimate = { value: null, lo: null, hi: null, n: 0, wide: false };
  slot.annotation = 'no nights of steady data at this time yet';
  return next;
};

async function readHead(page, wantVerdict) {
  const idx = await page.evaluate((want) => [...document.querySelectorAll('#lane button')]
    .findIndex((b) => b.dataset.verdict === want), wantVerdict);
  if (idx < 0) return { verdict: wantVerdict, found: false };
  const aria = await page.evaluate((i) => document.querySelectorAll('#lane button')[i]
    .getAttribute('aria-label'), idx);
  await page.click(`#lane button:nth-child(${idx + 1})`);
  await page.waitForTimeout(400);
  const head = await page.evaluate(() => {
    const h = document.querySelector('#level .slot-head');
    if (!h) return null;
    return {
      time: h.querySelector('.time')?.textContent.trim(),
      verdictText: h.querySelector('.verdict')?.textContent.trim(),
      support: document.querySelector('#level .slot-stats')?.textContent.replace(/\s+/g, ' ').trim(),
      say: document.querySelector('#level .slot-say')?.textContent.replace(/\s+/g, ' ').trim(),
      foot: document.querySelector('#level .foot-note')?.textContent.replace(/\s+/g, ' ').trim(),
    };
  });
  return { verdict: wantVerdict, found: true, aria, head };
}

// 1. Committed payload as-is: insufficient and hold (no change) slots.
for (const v of ['insufficient', 'hold', 'up', 'nodata']) {
  const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
  console.log('COMMITTED', JSON.stringify(await readHead(page, v)));
  await page.close();
}

// 2. Posed no-data slot.
{
  const page = await openApp(browser, { state: 'typical', appSource: 'fixture', analysisInputs: poseNoData });
  console.log('POSED', JSON.stringify(await readHead(page, 'nodata')));
  await page.close();
}

await browser.close();
