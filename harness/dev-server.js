import { readFile, realpath } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { projectFindings, projectIcHistoryEvents, windowQuery } from '../mockups/findings-projection.mirror.mjs';
import { populateFindingCasePreparation } from '../frontend/browser-fixture-population.js';

const MIME = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml',
};

const clone = (value) => structuredClone(value);
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

function send(res, status, body, contentType = 'application/json') {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.end(contentType === 'application/json' ? JSON.stringify(body) : body);
}

async function requestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function scopedPreparation(caseFiles, projection, bounds) {
  const query = windowQuery(bounds);
  const key = bounds ? `${bounds.start_min}-${bounds.end_min}` : null;
  const prepared = clone(caseFiles.scoped?.[key]?.preparation || caseFiles.preparation);
  if (bounds && !caseFiles.scoped?.[key]) {
    const identity = `${bounds.start_min.toString(16).padStart(4, '0')}${bounds.end_min.toString(16).padStart(4, '0')}`.repeat(4);
    prepared.projection_id = `fp_${identity}`;
    prepared.coordinates.window = clone(query.dict);
    prepared.findings.window = clone(query.dict);
    prepared.rendered_rows.push(...clone(caseFiles.scoped['0-360'].preparation.rendered_rows));
  }
  return populateFindingCasePreparation(prepared, projection);
}

async function forwardLive(req, res, url) {
  try {
    const headers = { ...req.headers };
    delete headers.host;
    const init = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      init.body = Buffer.concat(chunks);
    }
    const response = await fetch(`http://127.0.0.1:8765${url.pathname}${url.search}`, init);
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    send(res, 502, {
      detail: 'Live data is unavailable. Start uv run harmonic serve yourself, then retry.',
    });
  }
}

export function harnessDataPlugin({ repositoryRoot }) {
  const frontendRoot = resolve(repositoryRoot, 'frontend');
  const fixtureRoot = resolve(repositoryRoot, 'mockups/diagnose-workstation.synthetic');
  const load = Promise.all([
    json(join(fixtureRoot, 'payload.json')),
    json(join(repositoryRoot, 'frontend/__fixtures__/findings-projection.json')),
    json(join(frontendRoot, '__fixtures__/basal-night-evidence.json')),
    json(join(fixtureRoot, 'isf-rest-window-evidence.capture.json')),
    json(join(fixtureRoot, 'ic-block-evidence.capture.json')),
    json(join(fixtureRoot, 'finding-case-files.json')),
    json(join(fixtureRoot, 'ic-history-events.capture.json')),
  ]);
  let source = 'manufactured';
  const preparedWindows = new Map();

  return {
    name: 'harmonic-harness-data',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawPath = req.url.split('?', 1)[0];
        const url = new URL(req.url, 'http://harness.local');

        if (url.pathname === '/__harness/source' && req.method === 'GET') {
          send(res, 200, { source });
          return;
        }
        if (url.pathname === '/__harness/source' && req.method === 'POST') {
          try {
            const body = await requestBody(req);
            if (!['manufactured', 'live'].includes(body.source)) {
              send(res, 400, { detail: 'source must be manufactured or live' });
              return;
            }
            source = body.source;
            send(res, 200, { source });
          } catch {
            send(res, 400, { detail: 'source body must be JSON' });
          }
          return;
        }
        if (url.pathname === '/__harness/app-index.html') {
          send(res, 200, await readFile(join(frontendRoot, 'index.html'), 'utf8'), 'text/html');
          return;
        }
        if (rawPath.startsWith('/assets/')) {
          let candidate;
          try {
            candidate = resolve(frontendRoot, decodeURIComponent(rawPath.slice('/assets/'.length)));
            const [realFrontendRoot, realCandidate] = await Promise.all([
              realpath(frontendRoot),
              realpath(candidate),
            ]);
            candidate = realCandidate;
            const inside = candidate !== realFrontendRoot
              && !relative(realFrontendRoot, candidate).startsWith(`..${sep}`)
              && relative(realFrontendRoot, candidate) !== '..';
            if (!inside) throw new Error('asset escaped frontend root');
          } catch {
            send(res, 404, { detail: 'Asset not found' });
            return;
          }
          try {
            send(res, 200, await readFile(candidate), MIME[extname(candidate)] || 'application/octet-stream');
          } catch {
            send(res, 404, { detail: 'Asset not found' });
          }
          return;
        }
        if (!url.pathname.startsWith('/api/')) {
          next();
          return;
        }
        if (source === 'live') {
          await forwardLive(req, res, url);
          return;
        }

        const [payload, findingsFixture, basal, isf, carbRatio, caseFiles, history] = await load;
        const findingsInputs = {
          analysis: payload.analyze,
          exposures: payload.exposures,
          scenarios: payload.scenarios,
          event_charts: findingsFixture.inputs.event_charts,
        };
        const bounds = url.searchParams.has('start_min') ? {
          start_min: Number(url.searchParams.get('start_min')),
          end_min: Number(url.searchParams.get('end_min')),
        } : null;

        if (url.pathname === '/api/diagnose/findings') {
          send(res, 200, projectFindings(findingsInputs, bounds, url.searchParams.get('selected_id')));
          return;
        }
        if (url.pathname === '/api/diagnose/finding-case-file-preparation') {
          const projection = projectFindings(findingsInputs, bounds, url.searchParams.get('selected_id'));
          const prepared = scopedPreparation(caseFiles, projection, bounds);
          preparedWindows.set(prepared.projection_id, clone(prepared.coordinates.window));
          send(res, 200, prepared);
          return;
        }
        if (url.pathname === '/api/diagnose/finding-case-file') {
          const finding = caseFiles.cases[url.searchParams.get('finding_id')];
          const alignment = url.searchParams.get('alignment');
          const occurrence = url.searchParams.get('occ');
          if (!finding || !['clock', 'event'].includes(alignment)) {
            send(res, 404, { detail: { code: 'finding_unavailable', message: 'Finding unavailable.' } });
            return;
          }
          const body = clone(occurrence
            ? finding[`selected_${alignment}`][occurrence] || finding[`unavailable_${alignment}`]
            : finding[alignment]);
          const preparedWindow = preparedWindows.get(url.searchParams.get('projection_id'));
          if (preparedWindow) {
            body.projection_id = url.searchParams.get('projection_id');
            body.window = clone(preparedWindow);
          }
          send(res, 200, body);
          return;
        }
        if (url.pathname === '/api/diagnose/carb-ratio-history/events') {
          send(res, 200, projectIcHistoryEvents(
            history.inputs,
            url.searchParams.get('history_id'),
            url.searchParams.get('selected_run_id'),
          ));
          return;
        }

        const evidence = {
          '/api/diagnose/basal-night-evidence': basal.expected,
          '/api/diagnose/isf-rest-window-evidence': isf.payload,
          '/api/diagnose/carb-ratio-block-evidence': carbRatio.cases.cross_midnight,
        };
        if (Object.hasOwn(evidence, url.pathname)) {
          send(res, 200, evidence[url.pathname]);
          return;
        }

        const patterns = [
          [/^\/api\/explore\/exposures/, () => payload.exposures],
          [/^\/api\/analyze/, () => payload.analyze],
          [/^\/api\/scenarios/, () => payload.scenarios],
          [/^\/api\/explore\/time/, () => payload.evidence],
          [/^\/api\/status/, () => ({ ok: true, last_fetch: payload.analyze.generated_at, counts: payload.analyze.data_quality?.counts || {} })],
          [/^\/api\/plan\/history/, () => ({ history: [] })],
          [/^\/api\/plan/, () => ({ items: [], updated_at: null })],
          [/^\/api\/verify\/trials/, () => ({ trials: [] })],
          [/^\/api\/catalog/, () => ({ articles: [] })],
          [/^\/api\/carbs/, () => ({ entries: [] })],
          [/^\/api\/prompts/, () => ({ prompts: [] })],
          [/^\/api\/credentials/, () => ({ configured: true })],
          [/^\/api\/audit\/dismissals/, () => ({ dismissed: [] })],
          [/^\/api\/outcomes/, () => ({ points: [] })],
          [/^\/api\/timeline/, () => ({ events: [] })],
          [/^\/api\/backtest/, () => ({ folds: [] })],
          [/^\/api\/model/, () => ({ entries: [] })],
          [/^\/api\/day/, () => ({ days: [] })],
          [/^\/api\/pump-settings$/, () => payload.pump_settings || { configured: false }],
          [/^\/api\/pump/, () => ({ settings: {} })],
        ];
        const match = patterns.find(([pattern]) => pattern.test(url.pathname));
        if (match) {
          send(res, 200, match[1]());
          return;
        }
        send(res, 404, { detail: `Unstubbed manufactured endpoint: ${req.method} ${url.pathname}` });
      });
    },
  };
}
