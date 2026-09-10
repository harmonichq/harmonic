// Evidence recording only. It never changes a story's state or acceptance verdict.
// Captures show the endpoint AFTER a passing story, not its intermediate gestures.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export async function captureStory(page, { directory, id, target, viewport, caseName }) {
  await page.evaluate(() => document.fonts.ready);
  const facts = await page.evaluate(() => {
    const selectors = ['.cockpit-shell', '.cockpit-topbar', '.cockpit-footer', '.gf-desk',
      '.gf-stage', '.gf-read', '.gf-title', '#level', '#tile-focal', '.gf-stage-day',
      '.gf-stage-trial', '.gf-stage-focus', '.gf-trend', '.pane'];
    const elements = selectors.flatMap(selector => [...document.querySelectorAll(selector)].map(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { selector, text: element.textContent.slice(0, 160),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        scroll: { width: element.scrollWidth, height: element.scrollHeight,
          clientWidth: element.clientWidth, clientHeight: element.clientHeight },
        style: Object.fromEntries(['display', 'gridTemplateRows', 'gridTemplateColumns',
          'backgroundColor', 'color', 'borderLeftColor', 'borderLeftWidth', 'fontFamily',
          'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'fontVariantNumeric',
          'overflowX', 'overflowY'].map(key => [key, style[key]])) };
    }));
    return { url: location.href, title: document.title,
      root: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        viewportWidth: innerWidth, viewportHeight: innerHeight },
      interLoaded: [...document.fonts].some(font => font.family.includes('Inter') && font.status === 'loaded'),
      currentDestination: document.querySelector('[data-destination][aria-current="page"]')?.dataset.destination,
      stylesheets: [...document.styleSheets].map(sheet => sheet.href), elements };
  });
  if (!facts.interLoaded) throw new Error(`${id}: Inter is not loaded; a fallback-font render is not fidelity evidence`);
  await mkdir(directory, { recursive: true });
  const stem = `${target}-${id}-${viewport}`;
  const png = await page.screenshot({ fullPage: false });
  const text = `SYNTHETIC — ${target}, ${id}, ${viewport}, ${caseName}\n`
    + 'Endpoint after the story passed. Intermediate states require their own live inspection.\n\n'
    + await page.locator('body').innerText();
  await writeFile(join(directory, `${stem}.png`), png);
  await writeFile(join(directory, `${stem}.txt`), text);
  // The label sits outside the unmodified screenshot. The HTML loads actual
  // app-rendered pixels; it invents no theme or app styles of its own.
  await writeFile(join(directory, `${stem}.html`), `<!doctype html><meta charset="utf-8"><title>Synthetic ${stem}</title>`
    + `<p>SYNTHETIC — ${stem}. Story endpoint; no independent eye verdict.</p><img src="${stem}.png" alt="Synthetic ${stem}">`);
  await writeFile(join(directory, `${stem}.json`), JSON.stringify({ synthetic: true, target, id, viewport, caseName,
    checkpoint: 'after-passing-story', sha256: createHash('sha256').update(png).digest('hex'), ...facts }, null, 2) + '\n');
}
