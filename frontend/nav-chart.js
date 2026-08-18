// nav-chart.js — pure render/logic core for the Day surface NAVIGATOR (#248, ADR 0031).
// A month calendar of per-day glucose sparklines: the collapsed Sun→Sat week is ONE
// continuous shared-y trace (weekRibbonGeom); expanding drops a month grid of sparkline
// tiles (sparkGeom). Tint = glycemic severity (navSeverity — lows win the tie). Lifted from
// the LOCKED mockups (archived, #248/ADR 0031);
// the mock's synth-day seed + capture-file curve extraction are dropped — in the app the
// navigator is driven by real per-day stats + curves from GET /day-navigator (day_navigator.py).
// No Vue, no DOM — pure over its arguments (see CLAUDE.md "Frontend tests").

/* ================= severity encoding (glycemic, glyph-paired; ADR 0031) =================
   Tint by dominant problem, NOT a TIR ramp: lows win the tie (a low is the more urgent
   clinical event), then hit-target TIR reads green, then remaining below-target days with
   highs read terracotta, else neutral in-range. `day` carries the per-day {lows, highs, tir}
   the backend serves. Returns { varName, glyph, label }. On mixed days, glyph and
   label retain both excursion counts while varName keeps the low-priority tint.

   Thresholds are ADR 0031's implementation defaults: green = TIR ≥ 70% AND 0 lows;
   low-heavy = ≥1 low episode; high-heavy = highs present, 0 lows, below target. */
export function navSeverity(day) {
  const lows = day.lows || 0, highs = day.highs || 0, tir = day.tir || 0;
  if (lows >= 1) {
    const lowLabel = `${lows} low${lows === 1 ? '' : 's'}`;
    const highLabel = `${highs} high${highs === 1 ? '' : 's'}`;
    return {
      varName: '--low',
      glyph: `▽${lows}${highs ? ` △${highs}` : ''}`,
      label: highs ? `${lowLabel}, ${highLabel}` : lowLabel,
    };
  }
  if (tir >= 70) return { varName: '--on-target', glyph: '✓', label: 'on target' };
  if (highs >= 1) return { varName: '--high', glyph: `△${highs}`, label: `${highs} high${highs === 1 ? '' : 's'}` };
  return { varName: '--in-range', glyph: '·', label: 'in range' };
}

// The day's one-line summary (tile aria-label + calendar title): the severity phrase
// with TIR named exactly once. Pass the already-computed severity to avoid recomputing it.
export function navDaySummary(day, sev = navSeverity(day)) {
  const tir = day.tir || 0;
  return `${sev.label}, ${tir}% TIR`;
}

// Per-slice wash intensity: problem days GLOW, calm days barely tint (lifted from the mockup).
export function washOpacity(sev) {
  if (sev.varName === '--low') return 0.20;
  if (sev.varName === '--high') return 0.15;
  if (sev.varName === '--on-target') return 0.05;
  return 0.035;
}

/* ================= a day's sparkline curve =================
   The backend serves each day's downsampled curve as [{x, bg}] (x = fractional hour-of-day),
   the exact shape the geometry helpers below map. This guards a missing/no-data day. */
export function dayCurve(navDay) {
  return (navDay && Array.isArray(navDay.curve)) ? navDay.curve : [];
}

/* ================= sparkline geometry (pure → SVG) =================
   Map a curve to an SVG-space path + faint in-range band + out-of-range excursion dots, over a
   fixed clinical y-domain [40,300] so every tile is directly comparable. */
const Y_MIN = 40, Y_MAX = 300;

export function sparkGeom(points, w, h, pad = 3) {
  const iw = w - pad * 2, ih = h - pad * 2;
  const mapX = (x) => pad + x * iw;
  const mapY = (bg) => pad + (1 - (Math.min(Y_MAX, Math.max(Y_MIN, bg)) - Y_MIN) / (Y_MAX - Y_MIN)) * ih;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${mapX(p.x).toFixed(1)} ${mapY(p.bg).toFixed(1)}`).join(' ');
  const area = points.length
    ? `${line} L${mapX(points[points.length - 1].x).toFixed(1)} ${(h - pad).toFixed(1)} L${mapX(points[0].x).toFixed(1)} ${(h - pad).toFixed(1)} Z`
    : '';

  const y70 = mapY(70), y180 = mapY(180);
  const band = { x: pad, y: y180, w: iw, h: y70 - y180 };   // in-range 70–180 rectangle

  const lowDots = points.filter((p) => p.bg < 70).map((p) => ({ cx: mapX(p.x), cy: mapY(p.bg) }));
  const highDots = points.filter((p) => p.bg > 180).map((p) => ({ cx: mapX(p.x), cy: mapY(p.bg) }));
  const thin = (arr, step) => arr.filter((_, i) => i % step === 0);

  return {
    line, area, band, y70, y180,
    lowDots: thin(lowDots, 2), highDots: thin(highDots, 2),
    hasLow: lowDots.length > 0, hasHigh: highDots.length > 0,
  };
}

/* ================= continuous week ribbon geometry (pure → SVG) =================
   Lay 7 days edge-to-edge across [0,w]. Each day owns a slice of width w/7; its curve's
   x∈[0,1] maps into that slice, and all days share the clinical y-domain [40,300] so the
   whole week is one directly-comparable trace. A no-data day breaks the trace so a gap reads
   as a gap. `days` is the 7-day slice; `curves` is a parallel array of [{x,bg}] ([] ⇒ no data). */
export function weekRibbonGeom(days, curves, w, h, pad = 6) {
  const n = days.length || 7;
  const sliceW = w / n;
  const ih = h - pad * 2;
  const mapY = (bg) => pad + (1 - (Math.min(Y_MAX, Math.max(Y_MIN, bg)) - Y_MIN) / (Y_MAX - Y_MIN)) * ih;
  const mapX = (i, x) => i * sliceW + x * sliceW;

  const segments = [];
  const marks = [];
  const dividers = [];
  const lowDots = [];
  const highDots = [];

  const subpaths = [];
  let run = null;

  for (let i = 0; i < n; i++) {
    const d = days[i];
    const pts = curves[i] || [];
    const hasData = pts.length > 0;
    segments.push({ i, iso: d.iso, dom: d.dom, dow: d.dow, x: i * sliceW, w: sliceW, hasData });
    marks.push({ i, iso: d.iso, dom: d.dom, dow: d.dow, x: i * sliceW + sliceW / 2, hasData });
    if (i > 0) dividers.push(i * sliceW);

    if (!hasData) { if (run && run.length) { subpaths.push(run.join(' ')); } run = null; continue; }
    if (!run) run = [];
    pts.forEach((p) => {
      const X = mapX(i, p.x), Y = mapY(p.bg);
      run.push(`${run.length ? 'L' : 'M'}${X.toFixed(1)} ${Y.toFixed(1)}`);
      if (p.bg < 70) lowDots.push({ cx: X, cy: Y });
      if (p.bg > 180) highDots.push({ cx: X, cy: Y });
    });
  }
  if (run && run.length) subpaths.push(run.join(' '));

  const thin = (arr, step) => arr.filter((_, i) => i % step === 0);

  return {
    sliceW, segments, marks, dividers, subpaths,
    lowDots: thin(lowDots, 2), highDots: thin(highDots, 2),
    y70: mapY(70), y180: mapY(180),
    bandY: mapY(180), bandH: mapY(70) - mapY(180),
  };
}

/* ================= calendar helpers (pure, real-date driven) ================= */
const pad2 = (n) => String(n).padStart(2, '0');
export function fmtISO(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }
export function monthOf(iso) { const [y, m] = iso.split('-').map(Number); return { y, m }; }

// The Sun→Sat week (7 ISO date strings) containing `iso`.
export function weekOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const anchor = new Date(y, m - 1, d);
  const start = new Date(anchor); start.setDate(anchor.getDate() - anchor.getDay());
  const out = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(start); day.setDate(start.getDate() + i);
    out.push(fmtISO(day.getFullYear(), day.getMonth() + 1, day.getDate()));
  }
  return out;
}

// Month-grid cell descriptors for {y, m}: leading blanks to the first weekday, then each day.
// Returns [{ blank:true } | { iso, dom, dow }] — the caller decorates with severity + geometry.
export function monthCells(y, m) {
  const lead = new Date(y, m - 1, 1).getDay();
  const nDays = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push({ blank: true });
  for (let dd = 1; dd <= nDays; dd++) {
    cells.push({ iso: fmtISO(y, m, dd), dom: dd, dow: new Date(y, m - 1, dd).getDay() });
  }
  return cells;
}
