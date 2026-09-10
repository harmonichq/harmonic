/* Reproduction for #361 — a present-but-wrong API token on Diagnose.
 *
 * Measures the Diagnose surface under two tokens against a synthetic no-fetch
 * server, and prints what the reader is given in each case. No real database is
 * ever involved: start the repository's one permitted offline serve, declared in
 * AGENTS.md's data boundary, from a scratch copy of the committed synthetic QA
 * database — never the committed file itself:
 *
 *   cp mockups/qa-e2e.synthetic/harmonic.sqlite <scratch>/qa-361.sqlite
 *   uv run harmonic serve --no-fetch --token '' --db <scratch>/qa-361.sqlite --port 88NN
 *
 * then, with the browser-gate environment resolved
 * (`eval "$(python3 scripts/ensure_browser_gate_env.py)"`):
 *
 *   node docs/scope/361-wrong-token-diagnose-repro.mjs <port> <token>
 *
 * A token argument of `-` means no token at all, which is the designed
 * missing-token placeholder this bug's state is compared against.
 *
 * The wrong-token arm needs its `401` supplied at the transport. `--token ''` is
 * mandatory on the permitted serve, and `require_token` reads
 * `if token and authorization != f"Bearer {token}"`, so an empty token disables
 * the check and no `401` is reachable from the server itself. Setting
 * `localStorage.ciq_token` alone will not produce one: refuse every `/api/**`
 * read at the transport, as the change's evidence README records and the pinned
 * browser suite does.
 *
 * Fails closed: no Playwright, no run.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath) {
  console.error('PLAYWRIGHT_MODULE is required; run: eval "$(python3 scripts/ensure_browser_gate_env.py)"');
  process.exit(1);
}
const { chromium } = require(modulePath);

const port = process.argv[2] || '8803';
const token = process.argv[3] === '-' ? '' : (process.argv[3] || 'not-the-token');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const unauthorized = new Set();
await ctx.addInitScript((value) => {
  if (value) localStorage.setItem('ciq_token', value);
  else localStorage.removeItem('ciq_token');
}, token);
const page = await ctx.newPage();
page.on('response', (r) => { if (r.status() === 401) unauthorized.add(new URL(r.url()).pathname); });
await page.goto(`http://127.0.0.1:${port}/diagnose`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const observed = await page.evaluate(() => {
  const error = document.querySelector('.dw.dw-error');
  // The shell keeps every tab's placeholder in the document; only the visible
  // one belongs to the surface under test.
  const placeholder = [...document.querySelectorAll('.placeholder')]
    .filter((node) => node.offsetParent !== null)
    .find((node) => /Diagnose/.test(node.textContent)) ?? null;
  const box = error?.getBoundingClientRect();
  const style = error ? getComputedStyle(error) : null;
  return {
    errorClass: error?.className ?? null,
    errorText: error?.textContent ?? null,
    errorRole: error?.getAttribute('role') ?? null,
    errorPadding: style?.padding ?? null,
    errorOrigin: box ? { x: box.x, y: box.y } : null,
    controlsInsideError: error ? error.querySelectorAll('button, a').length : null,
    designedPlaceholder: placeholder ? placeholder.textContent.replace(/\s+/g, ' ').trim() : null,
    tokenBanner: [...document.querySelectorAll('.toast.warn')].some((n) => /No API token set/.test(n.textContent)),
  };
});

console.log(JSON.stringify({
  port, token: token || '(none)', ...observed, unauthorized: [...unauthorized].sort(),
}, null, 2));
await browser.close();
