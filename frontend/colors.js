// The palette the shipped chart builders take as a plain dict, read off the
// live document — the same getComputedStyle seam v1 uses (index.html scnColors /
// pqColors), and the one the locked desktop prototype resolved its colours through.
//
// It is read rather than declared so the material has exactly one home: change a
// token in the app's role ladder and every v2 figure follows without an edit here.
export function deskColors(root = document.documentElement) {
  const v = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  return {
    text: v('--text'), muted: v('--muted'), line: v('--line'),
    primary: v('--primary'), accent: v('--accent'), secondary: v('--secondary'),
    high: v('--high'), inRange: v('--in-range'), low: v('--low'), surface: v('--surface'),
    observed: v('--observed'), inferred: v('--inferred'), notindata: v('--notindata'),
    basal: v('--basal'),
    // warn is the Day anchor's outranked colour (day-chart.anchorStateColor)
    warn: v('--warn'), manualCarb: v('--manual-carb'), manualCarbSoft: v('--manual-carb-soft'),
  };
}
