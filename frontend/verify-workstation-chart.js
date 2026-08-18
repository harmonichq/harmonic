/* Verify workstation hero — PORTED VERBATIM from the locked mock.
 *
 * Source: the archived mock (#722), which carries contract terms 5-11.
 * Transferred byte-identical below this header. Edit only to re-sync with
 * the mock.
 *
 * The two-median ribbon: the area between the Before and Trial medians, tinted
 * by which ran higher; no quartile bands. Medians reach it through
 * verify-workstation-data.js, which maps /verify/trials' `envelopes` (clock
 * family) and `meal_arcs.bins` (meal family) onto the shape below — the same
 * numbers the mock read from its capture, now backend-supplied.
 */
/* Verify story hero — the two-median ribbon, rendered in ECharts (the app's
   shipping chart library) so the mock IS the target medium. Ribbon = the area
   between the Before and Trial medians, tinted by which ran higher; no
   quartile bands (locked 2026-08-12, hero-forms board).

   Every number here comes from the backend's per-Trial envelope/meal-arc
   data (see verify-workstation-data.js):
   medians from _envelopes[tid] (clock family) or _mealarcs[tid].bins (meal
   family) — the scoped per-period envelope backend extension. */

export function heroOption(colors, { pairs, arc, beforeLabel, trialLabel }) {
  // pairs: [{t(min), b(before med), v(trial med), d(delta)}]
  const xmin = arc ? -60 : 0;
  const xmax = arc ? 240 : 1440;
  const fmtX = v => arc
    ? (v === 0 ? 'meal' : (v > 0 ? '+' : '−') + Math.abs(v) / 60 + 'h')
    : v === 1440 ? '24:00'
    : String(Math.floor(v / 60) % 24).padStart(2, '0') + ':00';
  // fixed glucose scale, the Diagnose workstation's own axis (40–300 / 60):
  // every trial renders at the same zoom, so movement is judgeable across
  // trials and the 70–180 band is always in frame
  const lo = 40, hi = 300;

  return {
    animation: false,
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: colors.muted },
    // in-chart legend is the sole mark key (lock term 23), at the shipped
    // canvas's own position and scale: top gutter, right edge, 10px text
    legend: {
      show: true, top: 0, right: 16, itemWidth: 16, itemHeight: 8, itemGap: 16,
      selectedMode: false, silent: true,
      textStyle: { fontSize: 10, color: colors.muted },
      // swatch = the series' own line (dashed/solid inherited); the symbol dot
      // is hidden. Custom path:// icons collapse the 5.5 legend layout (all
      // items stack at 0,0), so the marks are replicated via inheritance.
      itemStyle: { opacity: 0 },
      lineStyle: { width: 'auto', type: 'inherit' },
      data: [beforeLabel, trialLabel],
    },
    grid: { left: 52, right: 16, top: 22, bottom: 30 },
    // DOCKED READOUT (app idiom): hover draws a thin crosshair and nothing
    // else — the numbers land in the pane header's live line via onHover
    tooltip: {
      trigger: 'axis', showContent: false,
      axisPointer: {
        type: 'line',
        lineStyle: { color: colors.muted, width: 1, type: 'solid', opacity: 0.85 },
        label: { show: false },
      },
    },
    // axis type is the shipped canvas's: default family (not mono), 10px
    // muted, no tick dashes
    xAxis: {
      type: 'value', min: xmin, max: xmax,
      interval: arc ? 60 : 360,
      axisLabel: { formatter: fmtX, color: colors.muted, fontSize: 10 },
      axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
    },
    yAxis: {
      type: 'value', min: lo, max: hi, interval: 60,
      // onZero would pin this axis (and its mg/dL name) to x=0 — the meal
      // moment — in the meal-anchored family; the axis lives at the plot edge
      axisLine: { show: false, onZero: false }, axisTick: { show: false },
      axisLabel: { color: colors.muted, fontSize: 10 },
      splitLine: { lineStyle: { color: colors.line } },
      name: 'mg/dL', nameTextStyle: { color: colors.muted, fontSize: 10, align: 'left' },
      nameGap: 6, nameLocation: 'end',
    },
    series: [
      // ribbon: one polygon per adjacent pair, tinted by which median is higher
      {
        type: 'custom', silent: true, z: 1,
        renderItem: (params, api) => {
          const i = params.dataIndex;
          if (i >= pairs.length - 1) return null;
          const a = pairs[i], b = pairs[i + 1];
          const up = (a.d + b.d) / 2 > 0;
          const pts = [[a.t, a.v], [b.t, b.v], [b.t, b.b], [a.t, a.b]]
            .map(p => api.coord(p));
          return { type: 'polygon', shape: { points: pts },
                   style: { fill: up ? colors.accentSoft : colors.mutedSoft } };
        },
        data: pairs.map((_, i) => i),
      },
      // target band 70–180: the Diagnose workstation's own treatment — filled
      // band with the TARGET label knocked out on the panel ground, and dashed
      // rules at 70/180 whose numerals take the same knock-out pad
      {
        type: 'line', silent: true, z: 0, data: [],
        markArea: {
          silent: true,
          data: [[
            {
              yAxis: 70, itemStyle: { color: colors.targetFill },
              label: {
                show: true, position: 'insideStartTop', distance: 10,
                color: colors.targetText, fontSize: 10, fontWeight: 600,
                formatter: 'TARGET 70–180 mg/dL',
                backgroundColor: colors.rail, padding: [2, 5], borderRadius: 2,
              },
            },
            { yAxis: 180 },
          ]],
        },
        // one markLine, two styles per datum: the 70/180 target rules, and (in
        // the meal family) the meal-moment rule
        markLine: {
          silent: true, symbol: 'none', z: 4,
          lineStyle: { color: colors.targetEdge, type: [4, 4], width: 1 },
          label: {
            show: true, position: 'start', formatter: '{c}',
            color: colors.targetText, fontSize: 10,
            backgroundColor: colors.rail, padding: [2, 4], borderRadius: 2,
          },
          data: [
            { yAxis: 70 }, { yAxis: 180 },
            ...(arc ? [{
              xAxis: 0,
              lineStyle: { color: colors.manual, width: 1.5, type: [2, 3] },
              label: { show: false },
            }] : []),
          ],
        },
      },
      {
        name: beforeLabel, type: 'line', z: 2, silent: true,
        data: pairs.map(p => [p.t, p.b]),
        showSymbol: false, itemStyle: { color: colors.muted },
        lineStyle: { color: colors.muted, width: 1.6, type: [4, 3] },
      },
      {
        name: trialLabel, type: 'line', z: 3, silent: true,
        data: pairs.map(p => [p.t, p.v]),
        showSymbol: false, itemStyle: { color: colors.accent },
        lineStyle: { color: colors.accent, width: 2.2 },
      },
    ],
  };
}
